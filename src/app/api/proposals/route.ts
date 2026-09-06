import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CATEGORIES = ["jalan","drainase","jembatan","lampu","pendidikan","ekonomi","fasilitas_umum","kesehatan","lainnya"] as const;

const createSchema = z.object({
  title: z.string().min(5).max(200),
  category: z.enum(CATEGORIES),
  description: z.string().min(10).max(3000),
  locationText: z.string().max(200).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  estimatedCost: z.number().min(0).optional().nullable(),
  estimatedBeneficiaries: z.number().int().min(0).optional().nullable(),
  urgency: z.enum(["low", "normal", "high", "urgent"]).optional(),
  isAnonymous: z.boolean().optional(),
});

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["verify", "musrenbang", "prioritize", "approve", "plan", "progress", "complete", "reject"]),
  priorityRank: z.number().int().min(1).max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const year = url.searchParams.get("year") ?? "";

    const result = await withAuth(ctx, async (db) => {
      const params: unknown[] = [ctx.villageId];
      const where = ["p.village_id = $1", "p.deleted_at IS NULL"];
      if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
      if (year && /^\d{4}$/.test(year)) { params.push(year); where.push(`p.musrenbang_year = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const rows = await db.query(
        `SELECT p.id, p.proposal_no, p.title, p.category, p.description, p.location_text,
                p.estimated_cost, p.estimated_beneficiaries, p.urgency, p.status,
                p.vote_count, p.priority_rank, p.musrenbang_year, p.proposer_name,
                p.is_anonymous, p.rejected_reason, p.created_at
         FROM proposals p WHERE ${whereSql}
         ORDER BY p.priority_rank NULLS LAST, p.vote_count DESC, p.created_at DESC LIMIT 100`,
        params
      );
      return { proposals: rows.rows };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

async function withAuthQuery(ctx: unknown, params: unknown[], whereSql: string) {
  return { rows: [] as unknown[] };
}
void withAuthQuery;

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const seq = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_no FROM '[0-9]+$') AS integer)), 0) + 1 AS n
         FROM proposals WHERE village_id = $1 AND musrenbang_year = EXTRACT(YEAR FROM now())`,
        [ctx.villageId]
      );
      const proposalNo = `MUS/${new Date().getFullYear()}/${String(seq.rows[0].n).padStart(3, "0")}`;
      const proposerName = d.isAnonymous ? `Warga Anonim` : ctx.name;

      const p = await db.query(
        `INSERT INTO proposals (village_id, proposal_no, title, category, description, location_text,
           latitude, longitude, estimated_cost, estimated_beneficiaries, urgency,
           proposed_by_resident, proposer_name, is_anonymous, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           (SELECT resident_id FROM users WHERE id = $12), $13, $14, $12)
         RETURNING id`,
        [ctx.villageId, proposalNo, d.title, d.category, d.description, d.locationText ?? null,
         d.latitude ?? null, d.longitude ?? null, d.estimatedCost ?? null,
         d.estimatedBeneficiaries ?? null, d.urgency ?? "normal", ctx.userId, proposerName, d.isAnonymous ?? false]
      );
      await writeAudit(ctx, req, db, {
        action: "proposal.submit", entityType: "proposal", entityId: p.rows[0].id,
        newValues: { proposalNo, category: d.category },
      });
      return { id: p.rows[0].id, proposalNo };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
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
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, action, priorityRank, notes } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "project.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const p = await db.query(
        `SELECT id, status FROM proposals WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, ctx.villageId]
      );
      if (p.rowCount === 0) return { error: "Usulan tidak ditemukan", status: 404 };

      const flow: Record<string, string> = {
        verify: "verified", musrenbang: "in_musrenbang", prioritize: "prioritized",
        approve: "approved", plan: "planned", progress: "in_progress", complete: "completed",
      };

      if (action === "reject") {
        await db.query(`UPDATE proposals SET status = 'rejected', rejected_reason = $2, updated_by = $3 WHERE id = $1`, [id, notes ?? "Tidak layak", ctx.userId]);
      } else if (action === "prioritize") {
        if (!priorityRank) return { error: "Peringkat prioritas wajib", status: 422 };
        await db.query(`UPDATE proposals SET status = 'prioritized', priority_rank = $2, updated_by = $3 WHERE id = $1`, [id, priorityRank, ctx.userId]);
      } else {
        const nextStatus = flow[action];
        if (!nextStatus) return { error: "Aksi tidak dikenal", status: 400 };
        if (action === "approve") {
          await db.query(`UPDATE proposals SET status = 'approved', approved_by = $2, updated_by = $3 WHERE id = $1`, [id, ctx.userId, ctx.userId]);
        } else {
          await db.query(`UPDATE proposals SET status = $2, updated_by = $3 WHERE id = $1`, [id, nextStatus, ctx.userId]);
        }
      }

      await writeAudit(ctx, req, db, {
        action: `proposal.${action}`, entityType: "proposal", entityId: id,
        newValues: { priorityRank, notes },
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
