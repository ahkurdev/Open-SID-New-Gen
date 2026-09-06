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
      const n = await q.query(
        `SELECT id, category, title, body, data, read_at, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [ctx.userId]
      );
      const unread = await q.query(
        `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
        [ctx.userId]
      );
      return { notifications: n.rows, unread: unread.rows[0].c };
    });
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : null;

    await withAuth(ctx, (q) =>
      ids
        ? q.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[])`, [ctx.userId, ids])
        : q.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [ctx.userId])
    );
    return ok({ read: true });
  } catch (e) {
    return handleApiError(e);
  }
}
