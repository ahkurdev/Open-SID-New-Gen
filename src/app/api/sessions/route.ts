import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const s = await q.query(
        `SELECT id, token_id, device, ip::text AS ip, user_agent, created_at, last_seen_at, expires_at,
                (token_id = $2) AS is_current
         FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY last_seen_at DESC`,
        [ctx.userId, ctx.sessionId]
      );
      return { sessions: s.rows };
    });
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => ({}));
    const tokenId = typeof body?.tokenId === "string" ? body.tokenId : null;

    const result = await withAuth(ctx, async (q) => {
      if (tokenId) {
        if (tokenId === ctx.sessionId) return { error: "Gunakan logout untuk sesi saat ini", status: 400 };
        const r = await q.query(
          `UPDATE sessions SET revoked_at = now(), revoked_reason = 'user_revoke'
           WHERE user_id = $1 AND token_id = $2 AND revoked_at IS NULL`,
          [ctx.userId, tokenId]
        );
        return { revoked: (r.rowCount ?? 0) > 0 };
      }
      const r = await q.query(
        `UPDATE sessions SET revoked_at = now(), revoked_reason = 'revoke_all_others'
         WHERE user_id = $1 AND token_id <> $2 AND revoked_at IS NULL`,
        [ctx.userId, ctx.sessionId]
      );
      return { revoked: (r.rowCount ?? 0) > 0 };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
