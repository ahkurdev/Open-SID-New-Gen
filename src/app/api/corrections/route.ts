import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const c = await db.query(
        `SELECT cr.id, cr.field_name, cr.current_value, cr.requested_value, cr.reason,
                cr.status, cr.created_at, r.name AS resident_name, r.nik,
                u.name AS requester_name
         FROM correction_requests cr
         JOIN residents r ON r.id = cr.resident_id
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE cr.village_id = $1
         ORDER BY (cr.status = 'pending') DESC, cr.created_at DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { corrections: c.rows };
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

    const body = await req.json().catch(() => null);
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, decision, reviewNotes } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await db.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id, unnest(r.permissions) AS p
         WHERE ur.user_id = $1 AND p = 'resident.update' LIMIT 1`,
        [ctx.userId]
      );
      if (allowed.rowCount === 0) return { error: "Tidak memiliki izin", status: 403 };

      const cr = await db.query(
        `SELECT cr.*, r.family_id FROM correction_requests cr JOIN residents r ON r.id = cr.resident_id
         WHERE cr.id = $1 AND cr.village_id = $2 AND cr.status = 'pending' FOR UPDATE OF cr`,
        [id, ctx.villageId]
      );
      if (cr.rowCount === 0) return { error: "Permohonan tidak ditemukan / sudah direview", status: 404 };
      const reqRow = cr.rows[0];

      if (decision === "approved") {
        const colMap: Record<string, string> = {
          phone: "phone", occupation: "occupation", education: "education",
          address: "address", religion: "religion", marital_status: "marital_status",
        };
        const col = colMap[reqRow.field_name];
        if (!col) return { error: "Kolom tidak dikenal", status: 422 };
        await db.query(
          `UPDATE residents SET ${col} = $2, updated_by = $3,
             status_changed_at = CASE WHEN $4 = 'marital_status' THEN now() ELSE status_changed_at END
           WHERE id = $1`,
          [reqRow.resident_id, reqRow.requested_value, ctx.userId, reqRow.field_name]
        );
        await db.query(
          `INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description, created_by)
           VALUES ($1,$2,'perubahan_data',CURRENT_DATE,$3,$4)`,
          [ctx.villageId, reqRow.resident_id, `Koreksi ${reqRow.field_name} disetujui: "${reqRow.current_value}" -> "${reqRow.requested_value}"`, ctx.userId]
        );
      }

      await db.query(
        `UPDATE correction_requests SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4 WHERE id = $1`,
        [id, decision, ctx.userId, reviewNotes ?? null]
      );

      if (reqRow.user_id) {
        await db.query(
          `INSERT INTO notifications (village_id, user_id, category, title, body)
           VALUES ($1,$2,'surat',$3,$4)`,
          [ctx.villageId, reqRow.user_id,
           decision === "approved" ? "Koreksi data disetujui" : "Koreksi data ditolak",
           decision === "approved"
             ? `Perubahan ${reqRow.field_name} telah diterapkan.`
             : `Permohonan koreksi ${reqRow.field_name} ditolak. ${reviewNotes ?? ""}`]
        );
      }

      await writeAudit(ctx, req, db, {
        action: `correction.${decision}`, entityType: "correction", entityId: id,
        oldValues: { status: "pending" }, newValues: { decision, reviewNotes },
      });
      return { reviewed: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
