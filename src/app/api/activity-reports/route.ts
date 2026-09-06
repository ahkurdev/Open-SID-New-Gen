import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  activity: z.string().min(3).max(200),
  location: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  output: z.string().max(500).optional().nullable(),
  hours: z.number().min(0).max(24).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const month = url.searchParams.get("month"); // YYYY-MM

    const result = await withAuth(ctx, async (db) => {
      const params: unknown[] = [ctx.villageId];
      let whereSql = "ar.village_id = $1";
      if (month && /^\d{4}-\d{2}$/.test(month)) {
        params.push(`${month}-01`);
        whereSql += ` AND ar.report_date >= $${params.length}::date AND ar.report_date < ($${params.length}::date + interval '1 month')`;
      }

      const rows = await db.query(
        `SELECT ar.id, ar.report_date, ar.activity, ar.location, ar.description,
                ar.output, ar.hours, u.name AS user_name
         FROM activity_reports ar JOIN users u ON u.id = ar.user_id
         WHERE ${whereSql}
         ORDER BY ar.report_date DESC, ar.created_at DESC LIMIT 200`,
        params
      );
      const monthly = await db.query(
        `SELECT to_char(date_trunc('month', ar.report_date), 'YYYY-MM') AS month,
                COUNT(*)::int AS total_activities,
                COALESCE(SUM(ar.hours), 0)::numeric(8,1) AS total_hours,
                COUNT(DISTINCT ar.user_id)::int AS staff_active
         FROM activity_reports ar
         WHERE ar.village_id = $1
         GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        [ctx.villageId]
      );
      return { reports: rows.rows, monthly: monthly.rows };
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const dup = await db.query(
        `SELECT 1 FROM activity_reports WHERE user_id = $1 AND report_date = $2 AND activity = $3`,
        [ctx.userId, d.reportDate ?? new Date().toISOString().slice(0, 10), d.activity]
      );
      if ((dup.rowCount ?? 0) > 0) return { error: "Kegiatan yang sama sudah dicatat hari itu", status: 409 };

      const r = await db.query(
        `INSERT INTO activity_reports (village_id, user_id, report_date, activity, location, description, output, hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.villageId, ctx.userId, d.reportDate ?? new Date().toISOString().slice(0, 10),
         d.activity, d.location ?? null, d.description ?? null, d.output ?? null, d.hours ?? null]
      );
      await writeAudit(ctx, req, db, {
        action: "activity_report.create", entityType: "activity_report", entityId: r.rows[0].id,
        newValues: { activity: d.activity },
      });
      return { id: r.rows[0].id };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
