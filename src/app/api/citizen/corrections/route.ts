import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  fieldName: z.string().min(1).max(40),
  requestedValue: z.string().min(1).max(300),
  reason: z.string().max(500).optional().nullable(),
});

const EDITABLE_FIELDS: Record<string, string> = {
  phone: "phone", occupation: "occupation", education: "education",
  address: "address", religion: "religion", marital_status: "marital_status",
};

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const c = await db.query(
        `SELECT cr.id, cr.field_name, cr.current_value, cr.requested_value, cr.reason,
                cr.status, cr.review_notes, cr.created_at, cr.reviewed_at,
                r.name AS resident_name
         FROM correction_requests cr JOIN residents r ON r.id = cr.resident_id
         WHERE cr.user_id = $1 ORDER BY cr.created_at DESC LIMIT 50`,
        [ctx.userId]
      );
      return { corrections: c.rows };
    });
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
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    if (!EDITABLE_FIELDS[d.fieldName]) return fail("Kolom tidak dapat dikoreksi", 422);

    const result = await withAuth(ctx, async (db) => {
      const u = await db.query(
        `SELECT resident_id FROM users WHERE id = $1 AND resident_id IS NOT NULL`,
        [ctx.userId]
      );
      if (u.rowCount === 0) return { error: "Akun Anda belum terhubung ke data penduduk. Hubungi operator desa.", status: 400 };
      const residentId = u.rows[0].resident_id;

      const pending = await db.query(
        `SELECT 1 FROM correction_requests WHERE resident_id = $1 AND field_name = $2 AND status = 'pending'`,
        [residentId, d.fieldName]
      );
      if ((pending.rowCount ?? 0) > 0) return { error: "Sudah ada permohonan koreksi pending untuk kolom ini", status: 409 };

      const current = await db.query(
        `SELECT COALESCE(${EDITABLE_FIELDS[d.fieldName]}::text, '') AS val FROM residents WHERE id = $1`,
        [residentId]
      );

      const cr = await db.query(
        `INSERT INTO correction_requests (village_id, resident_id, user_id, field_name, current_value, requested_value, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ctx.villageId, residentId, ctx.userId, d.fieldName, current.rows[0].val, d.requestedValue, d.reason ?? null]
      );
      await writeAudit(ctx, req, db, {
        action: "correction.request", entityType: "correction", entityId: cr.rows[0].id,
        newValues: { field: d.fieldName, requested: d.requestedValue },
      });

      await db.query(
        `INSERT INTO notifications (village_id, user_id, category, title, body)
         SELECT $1, ur.user_id, 'surat', 'Permohonan koreksi data baru', $2
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id, unnest(r.permissions) AS p
         WHERE ur.village_id = $1 AND p = 'resident.update' AND ur.user_id <> $3
         GROUP BY ur.user_id`,
        [ctx.villageId, `Koreksi ${d.fieldName} dari ${ctx.name}`, ctx.userId]
      );
      return { id: cr.rows[0].id };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
