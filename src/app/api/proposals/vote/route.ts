import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const body = await req.json().catch(() => null);
    const proposalId = typeof body?.proposalId === "string" ? body.proposalId : null;
    if (!proposalId) return fail("proposalId wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const p = await db.query(
        `SELECT id, status FROM proposals WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [proposalId, ctx.villageId]
      );
      if (p.rowCount === 0) return { error: "Usulan tidak ditemukan", status: 404 };

      // voting hanya input musyawarah: 1 user 1 vote per usulan
      const v = await db.query(
        `INSERT INTO proposal_votes (proposal_id, village_id, user_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (proposal_id, user_id) DO NOTHING
         RETURNING id`,
        [proposalId, ctx.villageId, ctx.userId]
      );
      if (v.rowCount === 0) return { error: "Anda sudah memberi suara untuk usulan ini", status: 409 };

      await db.query(
        `UPDATE proposals SET vote_count = vote_count + 1, updated_by = $2 WHERE id = $1`,
        [proposalId, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "proposal.vote", entityType: "proposal", entityId: proposalId,
      });
      const updated = await db.query(`SELECT vote_count FROM proposals WHERE id = $1`, [proposalId]);
      return { voteCount: updated.rows[0].vote_count };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
