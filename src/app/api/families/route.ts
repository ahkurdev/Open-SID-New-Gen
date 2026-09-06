import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { familySchema, familyUpdateSchema } from "@/lib/population-validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 25)));

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["f.village_id = $1", "f.deleted_at IS NULL"];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(f.kk_number ILIKE $${params.length} OR f.address ILIKE $${params.length}
          OR EXISTS (SELECT 1 FROM residents r WHERE r.family_id = f.id AND r.name ILIKE $${params.length}))`);
      }
      const whereSql = where.join(" AND ");

      const count = await db.query(`SELECT COUNT(*)::int AS c FROM families f WHERE ${whereSql}`, params);
      const rows = await db.query(
        `SELECT f.id, f.kk_number, f.address, f.rt, f.rw, reg.name AS dusun_name,
                head.name AS head_name,
                (SELECT COUNT(*)::int FROM residents r WHERE r.family_id = f.id AND r.deleted_at IS NULL) AS member_count
         FROM families f
         LEFT JOIN residents head ON head.id = f.head_resident_id
         LEFT JOIN regions reg ON reg.id = f.dusun_region_id
         WHERE ${whereSql}
         ORDER BY f.kk_number LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        params
      );
      return { families: rows.rows, total: count.rows[0].c, page, limit };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
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
    const parsed = familySchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.create");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (d.kkNumber) {
        const dup = await db.query(`SELECT 1 FROM families WHERE kk_number = $1 AND deleted_at IS NULL`, [d.kkNumber]);
        if ((dup.rowCount ?? 0) > 0) return { error: "Nomor KK sudah terdaftar", status: 409 };
      }
      const f = await db.query(
        `INSERT INTO families (village_id, kk_number, address, rt, rw, dusun_region_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.villageId, d.kkNumber || null, d.address ?? null, d.rt ?? null, d.rw ?? null, d.dusunRegionId ?? null, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "family.create", entityType: "family", entityId: f.rows[0].id, newValues: d,
      });
      return { id: f.rows[0].id };
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
    const parsed = familyUpdateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, ...fields } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.update");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const map: Record<string, string> = {
        kkNumber: "kk_number", address: "address", rt: "rt", rw: "rw", dusunRegionId: "dusun_region_id",
      };
      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      for (const [k, col] of Object.entries(map)) {
        const v = fields[k as keyof typeof fields];
        if (v !== undefined) { values.push(k === "kkNumber" ? (v || null) : v); sets.push(`${col} = $${++i}`); }
      }
      if (sets.length > 0) {
        await db.query(`UPDATE families SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1 AND village_id = $3`, [...values, ctx.villageId]);
        await writeAudit(ctx, req, db, { action: "family.update", entityType: "family", entityId: id, newValues: fields });
      }
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
