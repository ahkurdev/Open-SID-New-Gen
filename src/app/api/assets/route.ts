import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CATEGORIES = ["tanah","bangunan","kendaraan","peralatan","mesin","jalan","jembatan","drainase","lampu","fasilitas_umum","lainnya"] as const;

const createSchema = z.object({
  name: z.string().min(2).max(150),
  category: z.enum(CATEGORIES),
  acquisitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  acquisitionValue: z.number().min(0).optional().nullable(),
  condition: z.enum(["baik", "rusak_ringan", "rusak_berat"]).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().max(15).optional(),
  locationText: z.string().max(200).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  custodianUserId: z.string().uuid().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

const maintenanceSchema = z.object({
  assetId: z.string().uuid(),
  maintenanceType: z.enum(["rutin", "perbaikan", "penggantian"]),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  description: z.string().min(3).max(500),
  cost: z.number().min(0).optional().nullable(),
});

const transferSchema = z.object({
  assetId: z.string().uuid(),
  transferType: z.enum(["mutasi", "peminjaman", "penghapusan"]),
  fromHolder: z.string().max(100).optional().nullable(),
  toHolder: z.string().max(100).optional().nullable(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional().nullable(),
  newStatus: z.enum(["aktif", "dipinjam", "perbaikan", "dihapus"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "";
    const condition = url.searchParams.get("condition") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "asset.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["a.village_id = $1", "a.deleted_at IS NULL"];
      if (category) { params.push(category); where.push(`a.category = $${params.length}`); }
      if (condition) { params.push(condition); where.push(`a.condition = $${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(a.name ILIKE $${params.length} OR a.asset_code ILIKE $${params.length})`); }
      const whereSql = where.join(" AND ");

      const rows = await db.query(
        `SELECT a.id, a.asset_code, a.name, a.category, a.condition, a.quantity, a.unit,
                a.acquisition_value, a.current_value, a.acquisition_date, a.location_text,
                a.status, u.name AS custodian_name,
                COALESCE((SELECT SUM(cost) FROM asset_maintenance m WHERE m.asset_id = a.id AND m.status = 'done'), 0) AS total_maintenance_cost,
                (SELECT MAX(COALESCE(performed_date, scheduled_date)) FROM asset_maintenance m WHERE m.asset_id = a.id AND m.status = 'done') AS last_maintenance
         FROM assets a LEFT JOIN users u ON u.id = a.custodian_user_id
         WHERE ${whereSql}
         ORDER BY a.category, a.name LIMIT 200`,
        params
      );
      const stats = await db.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE condition = 'rusak_ringan')::int AS rusak_ringan,
                COUNT(*) FILTER (WHERE condition = 'rusak_berat')::int AS rusak_berat,
                COALESCE(SUM(current_value), 0)::numeric AS total_value
         FROM assets WHERE village_id = $1 AND deleted_at IS NULL`,
        [ctx.villageId]
      );
      return { assets: rows.rows, stats: stats.rows[0] };
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
    const mode = typeof body?.mode === "string" ? body.mode : "asset";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "asset.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "asset") {
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const code = await db.query("SELECT app.next_asset_code($1,$2) AS c", [ctx.villageId, d.category]);
        const a = await db.query(
          `INSERT INTO assets (village_id, asset_code, name, category, acquisition_date, acquisition_value,
             current_value, condition, quantity, unit, location_text, latitude, longitude, custodian_user_id, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [ctx.villageId, code.rows[0].c, d.name, d.category, d.acquisitionDate ?? null,
           d.acquisitionValue ?? null, d.acquisitionValue ?? null, d.condition ?? "baik",
           d.quantity ?? 1, d.unit ?? "unit", d.locationText ?? null, d.latitude ?? null,
           d.longitude ?? null, d.custodianUserId ?? null, d.notes ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, {
          action: "asset.create", entityType: "asset", entityId: a.rows[0].id,
          newValues: { code: code.rows[0].c, name: d.name },
        });
        return { id: a.rows[0].id, assetCode: code.rows[0].c };
      }

      if (mode === "maintenance") {
        const parsed = maintenanceSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const a = await db.query(`SELECT id FROM assets WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`, [d.assetId, ctx.villageId]);
        if (a.rowCount === 0) return { error: "Aset tidak ditemukan", status: 404 };
        const m = await db.query(
          `INSERT INTO asset_maintenance (village_id, asset_id, maintenance_type, scheduled_date, description, cost)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.assetId, d.maintenanceType, d.scheduledDate ?? null, d.description, d.cost ?? null]
        );
        await writeAudit(ctx, req, db, { action: "asset.maintenance_schedule", entityType: "asset", entityId: d.assetId, newValues: d });
        return { id: m.rows[0].id };
      }

      if (mode === "transfer") {
        const parsed = transferSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const a = await db.query(`SELECT id FROM assets WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`, [d.assetId, ctx.villageId]);
        if (a.rowCount === 0) return { error: "Aset tidak ditemukan", status: 404 };
        const t = await db.query(
          `INSERT INTO asset_transfers (village_id, asset_id, transfer_type, from_holder, to_holder, transfer_date, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.assetId, d.transferType, d.fromHolder ?? null, d.toHolder ?? null, d.transferDate, d.notes ?? null, ctx.userId]
        );
        if (d.newStatus) {
          await db.query(`UPDATE assets SET status = $2, updated_by = $3 WHERE id = $1`, [d.assetId, d.newStatus, ctx.userId]);
        }
        await writeAudit(ctx, req, db, { action: `asset.${d.transferType}`, entityType: "asset", entityId: d.assetId, newValues: d });
        return { id: t.rows[0].id };
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
    const maintenanceId = typeof body?.maintenanceId === "string" ? body.maintenanceId : null;
    const condition = typeof body?.condition === "string" ? body.condition : null;
    const assetId = typeof body?.assetId === "string" ? body.assetId : null;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "asset.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (maintenanceId) {
        await db.query(
          `UPDATE asset_maintenance SET status = 'done', performed_date = CURRENT_DATE WHERE id = $1 AND village_id = $2 AND status = 'scheduled'`,
          [maintenanceId, ctx.villageId]
        );
        await writeAudit(ctx, req, db, { action: "asset.maintenance_done", entityType: "asset_maintenance", entityId: maintenanceId });
        return { updated: true };
      }
      if (assetId && condition) {
        await db.query(
          `UPDATE assets SET condition = $2, updated_by = $3 WHERE id = $1 AND village_id = $4`,
          [assetId, condition, ctx.userId, ctx.villageId]
        );
        await writeAudit(ctx, req, db, { action: "asset.condition_update", entityType: "asset", entityId: assetId, newValues: { condition } });
        return { updated: true };
      }
      return { error: "Parameter tidak lengkap", status: 422 };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
