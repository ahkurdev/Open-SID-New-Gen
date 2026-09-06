import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const objectSchema = z.object({
  objectType: z.enum(["jalan", "fasilitas", "rumah", "lahan", "air", "batas", "titik_rawan", "lainnya"]),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  geometry: z.object({ type: z.enum(["Point", "LineString", "Polygon"]), coordinates: z.unknown() }).passthrough(),
  properties: z.record(z.unknown()).optional().nullable(),
  linkedAssetId: z.string().uuid().optional().nullable(),
  linkedProposalId: z.string().uuid().optional().nullable(),
});

const incidentSchema = z.object({
  gisObjectId: z.string().uuid().optional().nullable(),
  incidentType: z.enum(["banjir", "longsor", "kebakaran", "pohon_tumbang", "jalan_rusak", "lainnya"]),
  severity: z.enum(["rendah", "sedang", "tinggi", "darurat"]).optional(),
  location: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }).passthrough(),
  description: z.string().max(500).optional().nullable(),
});

const incidentActionSchema = z.object({
  incidentId: z.string().uuid(),
  action: z.enum(["verify", "assign", "respond", "resolve", "post_report"]),
  assignedTo: z.string().uuid().optional().nullable(),
  postIncidentNote: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const type = url.searchParams.get("type");

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "gis.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const typeFilter = type ? "AND g.object_type = $2" : "";
      const params: unknown[] = [ctx.villageId];
      if (type) params.push(type);
      const objects = await db.query(
        `SELECT g.id, g.object_type, g.name, g.description, g.geometry, g.properties,
                g.linked_asset_id, g.linked_proposal_id, g.created_at
         FROM gis_objects g WHERE g.village_id = $1 ${typeFilter}
         ORDER BY g.object_type, g.name`,
        params
      );
      const incidents = await db.query(
        `SELECT i.id, i.incident_type, i.severity, i.status, i.location, i.description,
                i.assigned_to, i.created_at, i.resolved_at, g.name AS object_name
         FROM gis_incidents i LEFT JOIN gis_objects g ON g.id = i.gis_object_id
         WHERE i.village_id = $1 ORDER BY i.created_at DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { objects: objects.rows, incidents: incidents.rows };
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
    const mode = typeof body?.mode === "string" ? body.mode : "object";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "gis.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "object") {
        const parsed = objectSchema.safeParse(body);
        if (!parsed.success) return { error: "Data geometry tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO gis_objects (village_id, object_type, name, description, geometry, properties, linked_asset_id, linked_proposal_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [ctx.villageId, d.objectType, d.name, d.description ?? null, JSON.stringify(d.geometry),
           JSON.stringify(d.properties ?? {}), d.linkedAssetId ?? null, d.linkedProposalId ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "gis_object.create", entityType: "gis_object", entityId: r.rows[0].id, newValues: { name: d.name, type: d.objectType } });
        return { id: r.rows[0].id };
      }

      if (mode === "incident") {
        const parsed = incidentSchema.safeParse(body);
        if (!parsed.success) return { error: "Lokasi insiden tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO gis_incidents (village_id, gis_object_id, incident_type, severity, location, description, reported_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.villageId, d.gisObjectId ?? null, d.incidentType, d.severity ?? "sedang", JSON.stringify(d.location), d.description ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "gis_incident.report", entityType: "gis_incident", entityId: r.rows[0].id, newValues: { type: d.incidentType, severity: d.severity } });
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
    const parsed = incidentActionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { incidentId, action, assignedTo, postIncidentNote } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "gis.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const cur = await db.query(`SELECT status FROM gis_incidents WHERE id = $1 AND village_id = $2 FOR UPDATE`, [incidentId, ctx.villageId]);
      if (cur.rowCount === 0) return { error: "Insiden tidak ditemukan", status: 404 };
      const current = cur.rows[0].status;

      const transitions: Record<string, { from: string[]; to: string }> = {
        verify: { from: ["reported"], to: "verified" },
        assign: { from: ["reported", "verified"], to: "assigned" },
        respond: { from: ["assigned"], to: "responding" },
        resolve: { from: ["assigned", "responding"], to: "resolved" },
        post_report: { from: ["resolved"], to: "post_report" },
      };
      const tr = transitions[action];
      if (!tr.from.includes(current)) return { error: `Tidak bisa ${action} dari status ${current}`, status: 409 };

      if (action === "assign") {
        if (!assignedTo) return { error: "Petugas wajib ditentukan", status: 422 };
        await db.query(`UPDATE gis_incidents SET status='assigned', assigned_to=$2 WHERE id=$1`, [incidentId, assignedTo]);
      } else if (action === "resolve") {
        await db.query(`UPDATE gis_incidents SET status='resolved', resolved_at=now() WHERE id=$1`, [incidentId]);
      } else if (action === "post_report") {
        await db.query(`UPDATE gis_incidents SET status='post_report', post_incident_note=$2 WHERE id=$1`, [incidentId, postIncidentNote ?? null]);
      } else {
        await db.query(`UPDATE gis_incidents SET status=$2 WHERE id=$1`, [incidentId, tr.to]);
      }

      await writeAudit(ctx, req, db, { action: `gis_incident.${action}`, entityType: "gis_incident", entityId: incidentId, oldValues: { status: current } });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
