import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    const { id } = await params;

    const result = await withAuth(ctx, async (q) => {
      const target = await q.query(
        `SELECT id, email, name FROM users WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (target.rowCount === 0) return { error: "Pengguna tidak ditemukan", status: 404 };

      const logins = await q.query(
        `SELECT success, reason, ip::text AS ip, user_agent, created_at
         FROM login_activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [id]
      );
      const audits = await q.query(
        `SELECT action, entity_type, entity_id, created_at
         FROM audit_logs WHERE actor_user_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [id]
      );
      return { logins: logins.rows, audits: audits.rows, user: target.rows[0] };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
