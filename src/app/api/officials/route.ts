import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["perangkat", "bpd", "lembaga", "wilayah"]),
  positionTitle: z.string().min(1).max(120),
  organization: z.string().max(120).optional().nullable(),
  regionId: z.string().uuid().optional().nullable(),
  nip: z.string().max(30).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  termStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  termEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  positionTitle: z.string().min(1).max(120).optional(),
  organization: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  nip: z.string().max(30).optional().nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  newTerm: z.object({
    positionTitle: z.string().min(1).max(120),
    termStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    termEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const officials = await q.query(
        `SELECT o.*, r.name AS region_name,
                COALESCE((SELECT json_agg(json_build_object('positionTitle', t.position_title, 'termStart', t.term_start, 'termEnd', t.term_end, 'notes', t.notes) ORDER BY t.term_start DESC)
                          FROM official_terms t WHERE t.official_id = o.id), '[]') AS terms
         FROM officials o LEFT JOIN regions r ON r.id = o.region_id
         WHERE o.village_id = $1
         ORDER BY o.type, o.sort_order, o.name`,
        [ctx.villageId]
      );
      const regions = await q.query(
        `SELECT id, level, code, name FROM regions
         WHERE id IN (SELECT region_id FROM regions WHERE parent_id = (SELECT region_id FROM villages WHERE id = $1))
            OR parent_id = (SELECT region_id FROM villages WHERE id = $1)`,
        [ctx.villageId]
      );
      return { officials: officials.rows, regions: regions.rows };
    });
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const d = parsed.data;
    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (d.userId) {
        const u = await q.query(`SELECT 1 FROM users WHERE id = $1 AND village_id = $2`, [d.userId, ctx.villageId]);
        if (u.rowCount === 0) return { error: "User tidak ditemukan di desa ini", status: 422 };
      }

      const o = await q.query(
        `INSERT INTO officials (village_id, user_id, name, type, position_title, organization, region_id, nip, phone, sort_order, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [ctx.villageId, d.userId ?? null, d.name, d.type, d.positionTitle, d.organization ?? null,
         d.regionId ?? null, d.nip ?? null, d.phone ?? null, d.sortOrder ?? 0, ctx.userId]
      );
      await q.query(
        `INSERT INTO official_terms (official_id, village_id, position_title, term_start, term_end, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [o.rows[0].id, ctx.villageId, d.positionTitle, d.termStart, d.termEnd ?? null, ctx.userId]
      );
      await writeAudit(ctx, req, q, {
        action: "official.create", entityType: "official", entityId: o.rows[0].id, newValues: d,
      });
      return { id: o.rows[0].id };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const { id, newTerm, ...fields } = parsed.data;
    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const existing = await q.query(`SELECT id, position_title FROM officials WHERE id = $1 AND village_id = $2`, [id, ctx.villageId]);
      if (existing.rowCount === 0) return { error: "Pejabat tidak ditemukan", status: 404 };

      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      const map: Record<string, string> = {
        name: "name", positionTitle: "position_title", organization: "organization",
        phone: "phone", nip: "nip", sortOrder: "sort_order", isActive: "is_active",
      };
      for (const [k, col] of Object.entries(map)) {
        if (fields[k as keyof typeof fields] !== undefined) {
          values.push(fields[k as keyof typeof fields]);
          sets.push(`${col} = $${++i}`);
        }
      }
      if (sets.length > 0) {
        await q.query(`UPDATE officials SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
      }

      if (newTerm) {
        await q.query(
          `UPDATE official_terms SET term_end = CURRENT_DATE - 1
           WHERE official_id = $1 AND term_end IS NULL`,
          [id]
        );
        await q.query(
          `INSERT INTO official_terms (official_id, village_id, position_title, term_start, term_end, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, ctx.villageId, newTerm.positionTitle, newTerm.termStart, newTerm.termEnd ?? null, ctx.userId]
        );
        await q.query(`UPDATE officials SET position_title = $2, updated_by = $3 WHERE id = $1`, [id, newTerm.positionTitle, ctx.userId]);
      }

      await writeAudit(ctx, req, q, {
        action: newTerm ? "official.new_term" : "official.update",
        entityType: "official", entityId: id, newValues: { ...fields, newTerm },
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
