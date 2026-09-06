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
      const allowed = await hasPermission(ctx, db, "resident.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const r = await db.query(
        `SELECT r.*, f.kk_number, f.address AS family_address, reg.name AS dusun_name
         FROM residents r
         LEFT JOIN families f ON f.id = r.family_id
         LEFT JOIN regions reg ON reg.id = r.dusun_region_id
         WHERE r.id = $1 AND r.village_id = $2 AND r.deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (r.rowCount === 0) return { error: "Penduduk tidak ditemukan", status: 404 };

      const events = await db.query(
        `SELECT id, event_type, event_date, description, created_at
         FROM resident_events WHERE resident_id = $1 ORDER BY event_date DESC, id DESC`,
        [id]
      );
      const duplicates = await db.query(
        `SELECT id_a, id_b, name_a, name_b, nik_a, nik_b, name_sim
         FROM potential_duplicate_residents
         WHERE village_id = $1 AND (id_a = $2 OR id_b = $2)`,
        [ctx.villageId, id]
      );
      return { resident: r.rows[0], timeline: events.rows, duplicates: duplicates.rows };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
