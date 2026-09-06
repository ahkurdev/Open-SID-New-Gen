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
      const allowed = await hasPermission(ctx, db, "complaint.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const c = await db.query(
        `SELECT c.*, u.name AS assigned_name, r.name AS resident_real_name
         FROM complaints c
         LEFT JOIN users u ON u.id = c.assigned_to
         LEFT JOIN residents r ON r.id = c.resident_id
         WHERE c.id = $1 AND c.village_id = $2 AND c.deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (c.rowCount === 0) return { error: "Pengaduan tidak ditemukan", status: 404 };

      const actions = await db.query(
        `SELECT action, actor_name, notes, created_at FROM complaint_actions
         WHERE complaint_id = $1 ORDER BY id`,
        [id]
      );
      const staff = await db.query(
        `SELECT DISTINCT u.id, u.name FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles ro ON ro.id = ur.role_id, unnest(ro.permissions) AS p
         WHERE u.village_id = $1 AND u.status = 'active' AND p = 'complaint.read'`,
        [ctx.villageId]
      );
      return { complaint: c.rows[0], timeline: actions.rows, staff: staff.rows };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
