import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  title: z.string().min(2).max(150),
  category: z.enum(["gotong_royong", "olahraga", "keagamaan", "pemuda", "pkk", "karang_taruna", "kelompok_tani", "umum"]).optional(),
  description: z.string().max(500).optional().nullable(),
  startTime: z.string().min(10),
  endTime: z.string().min(10).optional().nullable(),
  locationText: z.string().max(200).optional().nullable(),
  organizer: z.string().max(120).optional().nullable(),
  needsVolunteers: z.boolean().optional(),
  volunteerTarget: z.number().int().min(0).optional(),
  isPublic: z.boolean().optional(),
});

const registerSchema = z.object({
  eventId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  participantName: z.string().min(1).max(120),
  isVolunteer: z.boolean().optional(),
});

const facilitySchema = z.object({
  name: z.string().min(1).max(150),
  facilityType: z.enum(["balai_desa", "aula", "lapangan", "kendaraan", "alat", "lainnya"]).optional(),
  description: z.string().max(300).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
});

const bookingSchema = z.object({
  facilityId: z.string().uuid(),
  eventId: z.string().uuid().optional().nullable(),
  bookedByName: z.string().min(1).max(120),
  bookedByPhone: z.string().max(25).optional().nullable(),
  purpose: z.string().max(300).optional().nullable(),
  startTime: z.string().min(10),
  endTime: z.string().min(10),
});

const bookingActionSchema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum(["approve", "reject", "done", "cancel"]),
  rejectionReason: z.string().max(300).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "events";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "community.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (view === "facilities") {
        const facilities = await db.query(
          `SELECT f.id, f.name, f.facility_type, f.description, f.capacity, f.is_bookable, a.asset_code
           FROM facilities f LEFT JOIN assets a ON a.id = f.linked_asset_id
           WHERE f.village_id = $1 ORDER BY f.name`,
          [ctx.villageId]
        );
        const bookings = await db.query(
          `SELECT b.id, b.booked_by_name, b.booked_by_phone, b.purpose, b.start_time, b.end_time, b.status, b.rejection_reason,
                  f.name AS facility_name
           FROM facility_bookings b JOIN facilities f ON f.id = b.facility_id
           WHERE b.village_id = $1 ORDER BY b.start_time DESC LIMIT 100`,
          [ctx.villageId]
        );
        return { facilities: facilities.rows, bookings: bookings.rows };
      }

      // events
      const events = await db.query(
        `SELECT e.id, e.title, e.category, e.description, e.start_time, e.end_time, e.location_text, e.organizer,
                e.needs_volunteers, e.volunteer_target, e.is_public,
                (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id) AS registered_count,
                (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id AND er.is_volunteer = true) AS volunteer_count
         FROM community_events e WHERE e.village_id = $1 ORDER BY e.start_time DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { events: events.rows };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
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

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "community.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "event") {
        const parsed = eventSchema.safeParse(body);
        if (!parsed.success) return { error: "Data kegiatan tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO community_events (village_id, title, category, description, start_time, end_time, location_text, organizer, needs_volunteers, volunteer_target, is_public, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [ctx.villageId, d.title, d.category ?? "umum", d.description ?? null, d.startTime, d.endTime ?? null,
           d.locationText ?? null, d.organizer ?? null, d.needsVolunteers ?? false, d.volunteerTarget ?? 0,
           d.isPublic ?? true, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "event.create", entityType: "community_event", entityId: r.rows[0].id, newValues: { title: d.title } });
        return { id: r.rows[0].id };
      }
      if (mode === "register") {
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) return { error: "Data pendaftaran tidak valid", status: 422 };
        const d = parsed.data;
        const ev = await db.query(`SELECT id, village_id, needs_volunteers FROM community_events WHERE id = $1 AND village_id = $2`, [d.eventId, ctx.villageId]);
        if (ev.rowCount === 0) return { error: "Kegiatan tidak ditemukan", status: 404 };
        if (d.residentId) {
          const dup = await db.query(`SELECT 1 FROM event_registrations WHERE event_id = $1 AND resident_id = $2`, [d.eventId, d.residentId]);
          if ((dup.rowCount ?? 0) > 0) return { error: "Sudah terdaftar di kegiatan ini", status: 409 };
        }
        const r = await db.query(
          `INSERT INTO event_registrations (village_id, event_id, resident_id, participant_name, is_volunteer)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.villageId, d.eventId, d.residentId ?? null, d.participantName, d.isVolunteer ?? false]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "facility") {
        const parsed = facilitySchema.safeParse(body);
        if (!parsed.success) return { error: "Data fasilitas tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO facilities (village_id, name, facility_type, description, capacity)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.villageId, d.name, d.facilityType ?? "lainnya", d.description ?? null, d.capacity ?? null]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "booking") {
        const parsed = bookingSchema.safeParse(body);
        if (!parsed.success) return { error: "Data booking tidak valid", status: 422 };
        const d = parsed.data;
        if (new Date(d.endTime) <= new Date(d.startTime)) return { error: "Waktu selesai harus setelah mulai", status: 422 };
        const r = await db.query(
          `INSERT INTO facility_bookings (village_id, facility_id, event_id, booked_by_name, booked_by_phone, purpose, start_time, end_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.facilityId, d.eventId ?? null, d.bookedByName, d.bookedByPhone ?? null, d.purpose ?? null, d.startTime, d.endTime]
        ).catch((e: { code?: string }) => {
          if (e.code === "23P01") return { error: "Fasilitas sudah dibooking pada waktu tersebut", status: 409 } as { error: string; status: number };
          throw e;
        });
        if ("error" in r) return r;
        return { id: r.rows[0].id };
      }
      return { error: "Mode tidak dikenal", status: 400 };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
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
    const parsed = bookingActionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { bookingId, action, rejectionReason } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "community.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const cur = await db.query(`SELECT status FROM facility_bookings WHERE id = $1 AND village_id = $2 FOR UPDATE`, [bookingId, ctx.villageId]);
      if (cur.rowCount === 0) return { error: "Booking tidak ditemukan", status: 404 };
      const current = cur.rows[0].status;

      const transitions: Record<string, { from: string[]; to: string }> = {
        approve: { from: ["pending"], to: "approved" },
        reject: { from: ["pending"], to: "rejected" },
        done: { from: ["approved"], to: "done" },
        cancel: { from: ["pending", "approved"], to: "cancelled" },
      };
      const tr = transitions[action];
      if (!tr.from.includes(current)) return { error: `Tidak bisa ${action} dari status ${current}`, status: 409 };

      if (action === "approve") {
        await db.query(`UPDATE facility_bookings SET status='approved', approved_by=$2 WHERE id=$1`, [bookingId, ctx.userId]);
      } else if (action === "reject") {
        await db.query(`UPDATE facility_bookings SET status='rejected', rejection_reason=$2 WHERE id=$1`, [bookingId, rejectionReason ?? "Tidak tersedia"]);
      } else {
        await db.query(`UPDATE facility_bookings SET status=$2 WHERE id=$1`, [bookingId, tr.to]);
      }
      await writeAudit(ctx, req, db, { action: `facility_booking.${action}`, entityType: "facility_booking", entityId: bookingId, oldValues: { status: current } });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
