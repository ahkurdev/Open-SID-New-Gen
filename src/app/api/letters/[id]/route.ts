import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    const { id } = await params;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "letter.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const l = await db.query(
        `SELECT l.*, t.name AS template_name, t.code AS template_code, t.approval_steps
         FROM letters l JOIN letter_templates t ON t.id = l.template_id
         WHERE l.id = $1 AND l.village_id = $2 AND l.deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (l.rowCount === 0) return { error: "Surat tidak ditemukan", status: 404 };

      const actions = await db.query(
        `SELECT action, step_label, actor_name, notes, created_at
         FROM letter_actions WHERE letter_id = $1 ORDER BY id`,
        [id]
      );
      return { letter: l.rows[0], timeline: actions.rows };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
