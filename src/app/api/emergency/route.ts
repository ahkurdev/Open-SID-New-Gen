import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const emergencySchema = z.object({
  category: z.enum(["banjir", "longsor", "kebakaran", "gempa", "pohon_tumbang", "kecelakaan", "lainnya"]),
  severity: z.enum(["rendah", "sedang", "tinggi", "darurat"]).optional(),
  location: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }).passthrough(),
  description: z.string().max(500).optional().nullable(),
  reporterName: z.string().max(120).optional().nullable(),
  reporterPhone: z.string().max(25).optional().nullable(),
  isAnonymous: z.boolean().optional(),
});

const emergencyActionSchema = z.object({
  reportId: z.string().uuid(),
  action: z.enum(["verify", "assign_team", "evacuate", "resolve", "close"]),
  teamNote: z.string().max(300).optional().nullable(),
});

const resourceSchema = z.object({
  resourceType: z.enum(["jalur_evakuasi", "pengungsian", "posko", "peralatan"]),
  name: z.string().min(1).max(150),
  description: z.string().max(300).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  contactPhone: z.string().max(25).optional().nullable(),
});

const wastePointSchema = z.object({
  pointType: z.enum(["tps", "bank_sampah", "tpa", "titik_wilayah"]),
  name: z.string().min(1).max(150),
  capacityKg: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(300).optional().nullable(),
});

const wasteScheduleSchema = z.object({
  wastePointId: z.string().uuid().optional().nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  timeText: z.string().min(1).max(60),
  vehicle: z.string().max(80).optional().nullable(),
  crew: z.string().max(120).optional().nullable(),
});

const envAssetSchema = z.object({
  assetType: z.enum(["penghijauan", "sumber_air", "titik_banjir", "titik_sampah_liar", "kualitas_udara"]),
  name: z.string().min(1).max(150),
  description: z.string().max(300).optional().nullable(),
  plantedCount: z.number().int().min(0).optional().nullable(),
  condition: z.enum(["baik", "perhatian", "kritis"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "emergency";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "safety.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (view === "environment") {
        const points = await db.query(
          `SELECT id, point_type, name, capacity_kg, last_pickup_date, notes FROM waste_points WHERE village_id = $1 ORDER BY name`,
          [ctx.villageId]
        );
        const schedules = await db.query(
          `SELECT s.id, s.day_of_week, s.time_text, s.vehicle, s.crew, s.is_active, w.name AS point_name
           FROM waste_schedules s LEFT JOIN waste_points w ON w.id = s.waste_point_id
           WHERE s.village_id = $1 ORDER BY s.day_of_week, s.time_text`,
          [ctx.villageId]
        );
        const envAssets = await db.query(
          `SELECT id, asset_type, name, description, planted_count, last_check_date, condition FROM environment_assets WHERE village_id = $1 ORDER BY asset_type, name`,
          [ctx.villageId]
        );
        return { wastePoints: points.rows, schedules: schedules.rows, envAssets: envAssets.rows };
      }

      // emergency
      const reports = await db.query(
        `SELECT id, category, severity, status, location, description, reporter_name, reporter_phone, is_anonymous, team_note, created_at, resolved_at
         FROM emergency_reports WHERE village_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [ctx.villageId]
      );
      const resources = await db.query(
        `SELECT id, resource_type, name, description, capacity, contact_phone FROM emergency_resources WHERE village_id = $1 ORDER BY resource_type, name`,
        [ctx.villageId]
      );
      return { reports: reports.rows, resources: resources.rows };
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
      if (mode === "emergency_report") {
        // laporan darurat: semua pengguna backoffice bisa melaporkan (tanpa permission khusus)
        const parsed = emergencySchema.safeParse(body);
        if (!parsed.success) return { error: "Data laporan tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO emergency_reports (village_id, category, severity, location, description, reporter_name, reporter_phone, is_anonymous, reported_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [ctx.villageId, d.category, d.severity ?? "sedang", JSON.stringify(d.location), d.description ?? null,
           d.isAnonymous ? null : d.reporterName ?? null, d.isAnonymous ? null : d.reporterPhone ?? null,
           d.isAnonymous ?? false, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "emergency.report", entityType: "emergency_report", entityId: r.rows[0].id, newValues: { category: d.category, severity: d.severity } });
        return { id: r.rows[0].id };
      }

      const allowed = await hasPermission(ctx, db, "safety.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "resource") {
        const parsed = resourceSchema.safeParse(body);
        if (!parsed.success) return { error: "Data sumber daya tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO emergency_resources (village_id, resource_type, name, description, capacity, contact_phone)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.resourceType, d.name, d.description ?? null, d.capacity ?? null, d.contactPhone ?? null]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "waste_point") {
        const parsed = wastePointSchema.safeParse(body);
        if (!parsed.success) return { error: "Data titik sampah tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO waste_points (village_id, point_type, name, capacity_kg, notes)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.villageId, d.pointType, d.name, d.capacityKg ?? null, d.notes ?? null]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "waste_schedule") {
        const parsed = wasteScheduleSchema.safeParse(body);
        if (!parsed.success) return { error: "Data jadwal tidak valid", status: 422 };
        const d = parsed.data;
        if (d.wastePointId) {
          const own = await db.query(`SELECT id FROM waste_points WHERE id = $1 AND village_id = $2`, [d.wastePointId, ctx.villageId]);
          if (own.rowCount === 0) return { error: "Titik sampah tidak ditemukan", status: 404 };
        }
        const r = await db.query(
          `INSERT INTO waste_schedules (village_id, waste_point_id, day_of_week, time_text, vehicle, crew)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.wastePointId ?? null, d.dayOfWeek, d.timeText, d.vehicle ?? null, d.crew ?? null]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "env_asset") {
        const parsed = envAssetSchema.safeParse(body);
        if (!parsed.success) return { error: "Data lingkungan tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO environment_assets (village_id, asset_type, name, description, planted_count, condition)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.assetType, d.name, d.description ?? null, d.plantedCount ?? null, d.condition ?? "baik"]
        );
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
    const parsed = emergencyActionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { reportId, action, teamNote } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "safety.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const cur = await db.query(`SELECT status FROM emergency_reports WHERE id = $1 AND village_id = $2 FOR UPDATE`, [reportId, ctx.villageId]);
      if (cur.rowCount === 0) return { error: "Laporan tidak ditemukan", status: 404 };
      const current = cur.rows[0].status;

      const transitions: Record<string, { from: string[]; to: string }> = {
        verify: { from: ["reported"], to: "verified" },
        assign_team: { from: ["reported", "verified"], to: "team_assigned" },
        evacuate: { from: ["team_assigned"], to: "evacuating" },
        resolve: { from: ["team_assigned", "evacuating"], to: "resolved" },
        close: { from: ["resolved"], to: "closed" },
      };
      const tr = transitions[action];
      if (!tr.from.includes(current)) return { error: `Tidak bisa ${action} dari status ${current}`, status: 409 };

      if (action === "resolve") {
        await db.query(`UPDATE emergency_reports SET status='resolved', resolved_at=now(), team_note=$2 WHERE id=$1`, [reportId, teamNote ?? null]);
      } else {
        await db.query(`UPDATE emergency_reports SET status=$2, team_note=$3 WHERE id=$1`, [reportId, tr.to, teamNote ?? null]);
      }
      await writeAudit(ctx, req, db, { action: `emergency.${action}`, entityType: "emergency_report", entityId: reportId, oldValues: { status: current } });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
