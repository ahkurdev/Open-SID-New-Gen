import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CATEGORIES = ["jalan","sampah","pelayanan","bantuan","keamanan","fasilitas","lampu","banjir","administrasi","lainnya"] as const;

const createSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(5).max(150),
  description: z.string().min(10).max(3000),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  locationText: z.string().max(200).optional().nullable(),
  isAnonymous: z.boolean().optional(),
  residentId: z.string().uuid().optional().nullable(),
});

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["verify", "assign", "progress", "resolve", "close", "reject", "rate"]),
  assignedTo: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  rating: z.number().int().min(1).max(5).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const category = url.searchParams.get("category") ?? "";
    const mine = url.searchParams.get("mine") === "1";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "complaint.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["c.village_id = $1", "c.deleted_at IS NULL"];
      if (status) { params.push(status); where.push(`c.status = $${params.length}`); }
      if (category) { params.push(category); where.push(`c.category = $${params.length}`); }
      if (mine && ctx.userId) { params.push(ctx.userId); where.push(`c.assigned_to = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const rows = await db.query(
        `SELECT c.id, c.ticket_no, c.category, c.title, c.description, c.status, c.priority,
                c.reporter_name, c.is_anonymous, c.location_text, c.latitude, c.longitude,
                c.assigned_to, u.name AS assigned_name, c.sla_due_at, c.resolved_at,
                c.reporter_rating, c.created_at,
                (c.sla_due_at IS NOT NULL AND c.sla_due_at < now() AND c.status NOT IN ('resolved','closed','rejected')) AS overdue
         FROM complaints c LEFT JOIN users u ON u.id = c.assigned_to
         WHERE ${whereSql}
         ORDER BY (c.status NOT IN ('resolved','closed','rejected')) DESC,
                  (c.sla_due_at < now()) DESC NULLS LAST, c.created_at DESC
         LIMIT 100`,
        params
      );
      const stats = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','rejected'))::int AS active,
                COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
                COUNT(*) FILTER (WHERE sla_due_at < now() AND status NOT IN ('resolved','closed','rejected'))::int AS overdue
         FROM complaints WHERE village_id = $1 AND deleted_at IS NULL`,
        [ctx.villageId]
      );
      return { complaints: rows.rows, stats: stats.rows[0] };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
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
      const allowed = await hasPermission(ctx, db, "complaint.create");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const sla = await db.query(
        `SELECT days FROM complaint_sla WHERE village_id = $1 AND category = $2`,
        [ctx.villageId, d.category]
      );
      const days = sla.rows[0]?.days ?? 7;

      const seq = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_no FROM '[0-9]+$') AS integer)), 0) + 1 AS n
         FROM complaints WHERE village_id = $1`,
        [ctx.villageId]
      );
      const ticketNo = `TKT/${new Date().getFullYear()}/${String(seq.rows[0].n).padStart(4, "0")}`;

      const reporterName = d.isAnonymous ? `Warga Anonim ${randomBytes(2).toString("hex").toUpperCase()}` : (d.residentId ? (await db.query(`SELECT name FROM residents WHERE id = $1`, [d.residentId])).rows[0]?.name ?? ctx.name : ctx.name);

      const c = await db.query(
        `INSERT INTO complaints (village_id, ticket_no, resident_id, reporter_name, is_anonymous,
           category, title, description, latitude, longitude, location_text, sla_due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + make_interval(days => $12), $13)
         RETURNING id`,
        [ctx.villageId, ticketNo, d.residentId ?? null, reporterName, d.isAnonymous ?? false,
         d.category, d.title, d.description, d.latitude ?? null, d.longitude ?? null,
         d.locationText ?? null, days, ctx.userId]
      );
      const complaintId = c.rows[0].id;

      await db.query(
        `INSERT INTO complaint_actions (complaint_id, village_id, action, actor_user_id, actor_name, notes)
         VALUES ($1,$2,'submit',$3,$4,$5)`,
        [complaintId, ctx.villageId, ctx.userId, ctx.name, d.isAnonymous ? "Diajukan anonim" : null]
      );

      await db.query(
        `INSERT INTO notifications (village_id, user_id, category, title, body)
         SELECT $1, ur.user_id, 'pengaduan', 'Pengaduan baru', $2
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id, unnest(r.permissions) AS p
         WHERE ur.village_id = $1 AND p = 'complaint.read' AND ur.user_id <> $3
         GROUP BY ur.user_id`,
        [ctx.villageId, `[${ticketNo}] ${d.title}`, ctx.userId]
      );

      await writeAudit(ctx, req, db, {
        action: "complaint.submit", entityType: "complaint", entityId: complaintId,
        newValues: { ticketNo, category: d.category, anonymous: d.isAnonymous },
      });
      return { id: complaintId, ticketNo, slaDays: days };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, action, assignedTo, notes, rating } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const c = await db.query(
        `SELECT id, status, assigned_to, created_by FROM complaints WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [id, ctx.villageId]
      );
      if (c.rowCount === 0) return { error: "Pengaduan tidak ditemukan", status: 404 };
      const complaint = c.rows[0];

      const staffAllowed = await hasPermission(ctx, db, "complaint.read");

      if (action === "verify") {
        if (!staffAllowed) return { error: "Tidak memiliki izin", status: 403 };
        if (complaint.status !== "new") return { error: "Status bukan baru", status: 409 };
        await db.query(`UPDATE complaints SET status = 'verified', updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
      } else if (action === "assign") {
        const canAssign = await hasPermission(ctx, db, "complaint.assign");
        if (!canAssign) return { error: "Tidak memiliki izin assign", status: 403 };
        if (!assignedTo) return { error: "Petugas wajib dipilih", status: 422 };
        const target = await db.query(`SELECT id, name FROM users WHERE id = $1 AND village_id = $2`, [assignedTo, ctx.villageId]);
        if (target.rowCount === 0) return { error: "Petugas tidak ditemukan", status: 404 };
        await db.query(
          `UPDATE complaints SET status = 'assigned', assigned_to = $2, assigned_at = now(), updated_by = $3 WHERE id = $1`,
          [id, assignedTo, ctx.userId]
        );
        await db.query(
          `INSERT INTO notifications (village_id, user_id, category, title, body)
           VALUES ($1,$2,'pengaduan','Pengaduan ditugaskan ke Anda',$3)`,
          [ctx.villageId, assignedTo, `Anda ditugaskan menangani pengaduan.`]
        );
      } else if (action === "progress") {
        if (!staffAllowed) return { error: "Tidak memiliki izin", status: 403 };
        if (!["verified", "assigned", "in_progress"].includes(complaint.status)) return { error: "Status tidak bisa diproses", status: 409 };
        await db.query(`UPDATE complaints SET status = 'in_progress', updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
      } else if (action === "resolve") {
        if (!staffAllowed) return { error: "Tidak memiliki izin", status: 403 };
        if (!["assigned", "in_progress"].includes(complaint.status)) return { error: "Pengaduan harus ditugaskan dahulu", status: 409 };
        await db.query(
          `UPDATE complaints SET status = 'resolved', resolved_at = now(), resolution_note = $2, updated_by = $3 WHERE id = $1`,
          [id, notes ?? "Selesai ditangani", ctx.userId]
        );
      } else if (action === "close") {
        const isReporter = complaint.created_by === ctx.userId;
        if (!staffAllowed && !isReporter) return { error: "Hanya pelapor atau petugas", status: 403 };
        if (complaint.status !== "resolved") return { error: "Pengaduan harus resolved dahulu", status: 409 };
        await db.query(`UPDATE complaints SET status = 'closed', closed_at = now(), updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
      } else if (action === "reject") {
        if (!staffAllowed) return { error: "Tidak memiliki izin", status: 403 };
        if (!["new", "verified"].includes(complaint.status)) return { error: "Pengaduan sudah diproses", status: 409 };
        await db.query(`UPDATE complaints SET status = 'rejected', rejected_reason = $2, updated_by = $3 WHERE id = $1`, [id, notes ?? "Tidak valid", ctx.userId]);
      } else if (action === "rate") {
        if (complaint.created_by !== ctx.userId) return { error: "Hanya pelapor yang bisa memberi rating", status: 403 };
        if (complaint.status !== "resolved" && complaint.status !== "closed") return { error: "Rating hanya setelah selesai", status: 409 };
        if (!rating) return { error: "Rating 1-5 wajib", status: 422 };
        await db.query(`UPDATE complaints SET reporter_rating = $2, updated_by = $3 WHERE id = $1`, [id, rating, ctx.userId]);
      }

      await db.query(
        `INSERT INTO complaint_actions (complaint_id, village_id, action, actor_user_id, actor_name, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, ctx.villageId, action, ctx.userId, ctx.name, notes ?? (rating ? `Rating ${rating}/5` : null)]
      );
      await writeAudit(ctx, req, db, {
        action: `complaint.${action}`, entityType: "complaint", entityId: id,
        oldValues: { status: complaint.status }, newValues: { notes, assignedTo, rating },
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
