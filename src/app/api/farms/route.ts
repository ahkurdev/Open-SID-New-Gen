import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const farmSchema = z.object({
  sector: z.enum(["pertanian", "peternakan", "perikanan"]),
  residentId: z.string().uuid().optional().nullable(),
  ownerName: z.string().min(1).max(120),
  commodityName: z.string().max(100).optional().nullable(),
  landAreaM2: z.number().min(0).optional().nullable(),
  plantingSeason: z.string().max(60).optional().nullable(),
  livestockType: z.string().max(60).optional().nullable(),
  livestockCount: z.number().int().min(0).optional().nullable(),
  pondCount: z.number().int().min(0).optional().nullable(),
  fishType: z.string().max(60).optional().nullable(),
  productionKg: z.number().min(0).optional().nullable(),
  constraintsNote: z.string().max(300).optional().nullable(),
  locationGisId: z.string().uuid().optional().nullable(),
});

const harvestSchema = z.object({
  farmId: z.string().uuid(),
  harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commodity: z.string().min(1).max(100),
  quantityKg: z.number().min(0),
  notes: z.string().max(300).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const sector = url.searchParams.get("sector");

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "economy.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const sectorFilter = sector ? "AND f.sector = $2" : "";
      const params: unknown[] = [ctx.villageId];
      if (sector) params.push(sector);
      const farms = await db.query(
        `SELECT f.id, f.sector, f.owner_name, f.resident_id, f.commodity_name, f.land_area_m2,
                f.planting_season, f.livestock_type, f.livestock_count, f.pond_count, f.fish_type,
                f.production_kg, f.constraints_note, f.last_harvest_date, f.last_harvest_kg,
                f.location_gis_id, r.nik AS owner_nik
         FROM farms f LEFT JOIN residents r ON r.id = f.resident_id
         WHERE f.village_id = $1 ${sectorFilter} ORDER BY f.sector, f.owner_name`,
        params
      );
      const summary = await db.query(
        `SELECT sector, unit_count, total_land_m2, total_livestock, total_production_kg, last_harvest_total_kg
         FROM food_security_summary WHERE village_id = $1`,
        [ctx.villageId]
      );
      return { farms: farms.rows, summary: summary.rows };
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
    const mode = typeof body?.mode === "string" ? body.mode : "farm";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "economy.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "farm") {
        const parsed = farmSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO farms (village_id, sector, resident_id, owner_name, commodity_name, land_area_m2,
             planting_season, livestock_type, livestock_count, pond_count, fish_type, production_kg,
             constraints_note, location_gis_id, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [ctx.villageId, d.sector, d.residentId ?? null, d.ownerName, d.commodityName ?? null,
           d.landAreaM2 ?? null, d.plantingSeason ?? null, d.livestockType ?? null,
           d.livestockCount ?? null, d.pondCount ?? null, d.fishType ?? null,
           d.productionKg ?? null, d.constraintsNote ?? null, d.locationGisId ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "farm.create", entityType: "farm", entityId: r.rows[0].id, newValues: { sector: d.sector, owner: d.ownerName } });
        return { id: r.rows[0].id };
      }

      if (mode === "harvest") {
        const parsed = harvestSchema.safeParse(body);
        if (!parsed.success) return { error: "Data panen tidak valid", status: 422 };
        const d = parsed.data;
        const farm = await db.query(`SELECT id, village_id FROM farms WHERE id = $1 AND village_id = $2`, [d.farmId, ctx.villageId]);
        if (farm.rowCount === 0) return { error: "Unit usaha tidak ditemukan", status: 404 };
        const r = await db.query(
          `INSERT INTO farm_harvests (village_id, farm_id, harvest_date, commodity, quantity_kg, notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.farmId, d.harvestDate, d.commodity, d.quantityKg, d.notes ?? null]
        );
        await db.query(
          `UPDATE farms SET last_harvest_date = $2, last_harvest_kg = $3, updated_at = now() WHERE id = $1`,
          [d.farmId, d.harvestDate, d.quantityKg]
        );
        await writeAudit(ctx, req, db, { action: "farm.harvest", entityType: "farm_harvest", entityId: r.rows[0].id, newValues: { commodity: d.commodity, kg: d.quantityKg } });
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
