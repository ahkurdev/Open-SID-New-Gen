import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bookSchema = z.object({
  serviceTypeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.string().regex(/^\d{2}:\d{2}$/),
  visitorName: z.string().min(1).max(120),
});

const walkInSchema = z.object({
  serviceTypeId: z.string().uuid(),
  visitorName: z.string().min(1).max(120),
  queueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const actionSchema = z.object({
  ticketId: z.string().uuid(),
  action: z.enum(["call", "serve", "skip", "finish"]),
  counter: z.string().max(10).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "letter.process");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const queue = await db.query(
        `SELECT q.id, q.ticket_number, q.visitor_name, q.status, q.counter, q.called_at, q.served_at, q.created_at,
                s.name AS service_name, s.avg_minutes,
                EXTRACT(EPOCH FROM (COALESCE(q.served_at, now()) - q.created_at))/60 AS wait_minutes
         FROM queue_tickets q JOIN service_types s ON s.id = q.service_type_id
         WHERE q.village_id = $1 AND q.queue_date = $2
         ORDER BY q.ticket_number`,
        [ctx.villageId, date]
      );
      const services = await db.query(
        `SELECT id, name, avg_minutes FROM service_types WHERE village_id = $1 AND is_active = true ORDER BY name`,
        [ctx.villageId]
      );
      const stats = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'served')::int AS served,
                COUNT(*) FILTER (WHERE status IN ('waiting','called','serving'))::int AS active,
                COALESCE(AVG(EXTRACT(EPOCH FROM (served_at - created_at))/60) FILTER (WHERE served_at IS NOT NULL), 0)::numeric(10,1) AS avg_service_minutes
         FROM queue_tickets WHERE village_id = $1 AND queue_date = $2`,
        [ctx.villageId, date]
      );
      return { queue: queue.rows, services: services.rows, stats: stats.rows[0], date };
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
    const mode = typeof body?.mode === "string" ? body.mode : "";

    if (mode === "book") {
      const parsed = bookSchema.safeParse(body);
      if (!parsed.success) return fail("Data tidak valid", 422);
      const d = parsed.data;

      const result = await withAuth(ctx, async (db) => {
        const s = await db.query(`SELECT id FROM service_types WHERE id = $1 AND village_id = $2 AND is_active = true`, [d.serviceTypeId, ctx.villageId]);
        if (s.rowCount === 0) return { error: "Layanan tidak tersedia", status: 404 };
        const dup = await db.query(
          `SELECT 1 FROM appointments WHERE service_type_id = $1 AND appointment_date = $2 AND slot_time = $3 AND status <> 'cancelled'`,
          [d.serviceTypeId, d.date, d.slot]
        );
        if ((dup.rowCount ?? 0) > 0) return { error: "Slot sudah dipesan", status: 409 };
        const a = await db.query(
          `INSERT INTO appointments (village_id, service_type_id, user_id, resident_id, visitor_name, appointment_date, slot_time)
           VALUES ($1,$2,$3,(SELECT resident_id FROM users WHERE id = $3),$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.serviceTypeId, ctx.userId, d.visitorName, d.date, d.slot]
        );
        await writeAudit(ctx, req, db, {
          action: "appointment.book", entityType: "appointment", entityId: a.rows[0].id,
          newValues: { serviceTypeId: d.serviceTypeId, date: d.date, slot: d.slot },
        });
        return { id: a.rows[0].id };
      });
      if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
      return ok(result, { status: 201 });
    }

    if (mode === "walkin") {
      const parsed = walkInSchema.safeParse(body);
      if (!parsed.success) return fail("Data tidak valid", 422);
      const d = parsed.data;
      const queueDate = d.queueDate ?? new Date().toISOString().slice(0, 10);

      const result = await withAuth(ctx, async (db) => {
        const allowed = await hasPermission(ctx, db, "letter.process");
        if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

        const s = await db.query(`SELECT id FROM service_types WHERE id = $1 AND village_id = $2 AND is_active = true`, [d.serviceTypeId, ctx.villageId]);
        if (s.rowCount === 0) return { error: "Layanan tidak tersedia", status: 404 };

        const num = await db.query(
          `INSERT INTO queue_tickets (village_id, service_type_id, visitor_name, queue_date, ticket_number)
           VALUES ($1,$2,$3,$4, (SELECT COALESCE(MAX(ticket_number),0)+1 FROM queue_tickets WHERE village_id = $1 AND queue_date = $4))
           RETURNING id, ticket_number`,
          [ctx.villageId, d.serviceTypeId, d.visitorName, queueDate]
        );
        await writeAudit(ctx, req, db, {
          action: "queue.walkin", entityType: "queue_ticket", entityId: num.rows[0].id,
          newValues: { visitorName: d.visitorName, ticket: num.rows[0].ticket_number },
        });
        return { id: num.rows[0].id, ticketNumber: num.rows[0].ticket_number };
      });
      if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
      return ok(result, { status: 201 });
    }

    return fail("Mode tidak dikenal", 400);
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
    const { ticketId, action, counter } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "letter.process");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const t = await db.query(
        `SELECT id, status FROM queue_tickets WHERE id = $1 AND village_id = $2 FOR UPDATE`,
        [ticketId, ctx.villageId]
      );
      if (t.rowCount === 0) return { error: "Tiket tidak ditemukan", status: 404 };
      const ticket = t.rows[0];

      const transitions: Record<string, { from: string[]; set: string }> = {
        call: { from: ["waiting"], set: `status='called', called_at=now(), counter=COALESCE($3, counter)` },
        serve: { from: ["called", "waiting"], set: `status='serving', called_at=COALESCE(now(), called_at), counter=COALESCE($3, counter)` },
        skip: { from: ["called", "serving"], set: `status='skipped'` },
        finish: { from: ["serving", "called"], set: `status='served', served_at=now()` },
      };
      const tr = transitions[action];
      if (!tr.from.includes(ticket.status)) {
        return { error: `Tidak bisa ${action} dari status ${ticket.status}`, status: 409 };
      }
      await db.query(`UPDATE queue_tickets SET ${tr.set} WHERE id = $1`, [ticketId, ctx.userId, counter ?? null]);
      await writeAudit(ctx, req, db, {
        action: `queue.${action}`, entityType: "queue_ticket", entityId: ticketId,
        oldValues: { status: ticket.status }, newValues: { action, counter },
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
