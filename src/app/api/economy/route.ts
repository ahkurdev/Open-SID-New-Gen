import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const umkmSchema = z.object({
  ownerResidentId: z.string().uuid().optional().nullable(),
  ownerName: z.string().min(1).max(120),
  businessName: z.string().min(1).max(150),
  category: z.enum(["kuliner", "fashion", "kerajinan", "pertanian", "jasa", "teknologi", "lainnya"]).optional(),
  description: z.string().max(500).optional().nullable(),
  contactPhone: z.string().max(25).optional().nullable(),
  isPublic: z.boolean().optional(),
});

const productSchema = z.object({
  umkmId: z.string().uuid(),
  name: z.string().min(1).max(150),
  price: z.number().min(0),
  unit: z.string().max(20).optional(),
  stock: z.number().int().min(0).optional(),
  description: z.string().max(300).optional().nullable(),
  isFeatured: z.boolean().optional(),
});

const orderSchema = z.object({
  productId: z.string().uuid(),
  buyerName: z.string().min(1).max(120),
  buyerPhone: z.string().min(5).max(25),
  quantity: z.number().int().min(1),
  note: z.string().max(300).optional().nullable(),
});

const bumdesSchema = z.object({
  unitName: z.string().min(1).max(150),
  businessType: z.string().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  managerName: z.string().max(120).optional().nullable(),
  capital: z.number().min(0).optional(),
  revenue: z.number().min(0).optional(),
  expense: z.number().min(0).optional(),
  periodYear: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "umkm";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "economy.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (view === "bumdes") {
        const units = await db.query(
          `SELECT id, unit_name, business_type, description, manager_name, capital, revenue, expense, period_year,
                  (revenue - expense) AS profit
           FROM bumdes_units WHERE village_id = $1 ORDER BY period_year DESC, unit_name`,
          [ctx.villageId]
        );
        const totals = await db.query(
          `SELECT COALESCE(SUM(revenue),0) AS revenue, COALESCE(SUM(expense),0) AS expense,
                  COALESCE(SUM(revenue - expense),0) AS profit, COUNT(*) AS unit_count
           FROM bumdes_units WHERE village_id = $1`,
          [ctx.villageId]
        );
        return { units: units.rows, totals: totals.rows[0] };
      }

      if (view === "jobs") {
        const jobs = await db.query(
          `SELECT id, title, employer, description, salary_info, location_text, is_open, created_at
           FROM job_listings WHERE village_id = $1 ORDER BY is_open DESC, created_at DESC`,
          [ctx.villageId]
        );
        const skills = await db.query(
          `SELECT s.id, s.skill_name, s.proficiency, r.name AS resident_name
           FROM resident_skills s JOIN residents r ON r.id = s.resident_id
           WHERE s.village_id = $1 AND s.is_public_profile = true
           ORDER BY s.skill_name`,
          [ctx.villageId]
        );
        const trainings = await db.query(
          `SELECT t.id, t.title, t.description, t.organizer, t.start_date, t.location_text, t.quota,
                  (SELECT COUNT(*)::int FROM training_registrations tr WHERE tr.training_id = t.id) AS registered
           FROM trainings t WHERE t.village_id = $1 ORDER BY t.start_date DESC NULLS LAST`,
          [ctx.villageId]
        );
        return { jobs: jobs.rows, skills: skills.rows, trainings: trainings.rows };
      }

      // default: umkm + products + orders
      const list = await db.query(
        `SELECT u.id, u.owner_name, u.business_name, u.category, u.description, u.contact_phone,
                u.is_featured, u.is_public,
                (SELECT COUNT(*)::int FROM umkm_products p WHERE p.umkm_id = u.id) AS product_count
         FROM umkm u WHERE u.village_id = $1 ORDER BY u.is_featured DESC, u.business_name`,
        [ctx.villageId]
      );
      const products = await db.query(
        `SELECT p.id, p.umkm_id, p.name, p.description, p.price, p.unit, p.stock, p.is_featured,
                u.business_name FROM umkm_products p JOIN umkm u ON u.id = p.umkm_id
         WHERE p.village_id = $1 ORDER BY p.is_featured DESC, p.name`,
        [ctx.villageId]
      );
      const orders = await db.query(
        `SELECT o.id, o.buyer_name, o.buyer_phone, o.quantity, o.note, o.status, o.created_at,
                p.name AS product_name, u.business_name
         FROM product_orders o JOIN umkm_products p ON p.id = o.product_id JOIN umkm u ON u.id = p.umkm_id
         WHERE o.village_id = $1 ORDER BY o.created_at DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { umkm: list.rows, products: products.rows, orders: orders.rows };
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
      const allowed = await hasPermission(ctx, db, "economy.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "umkm") {
        const parsed = umkmSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO umkm (village_id, owner_resident_id, owner_name, business_name, category, description, contact_phone, is_public)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.ownerResidentId ?? null, d.ownerName, d.businessName, d.category ?? "lainnya",
           d.description ?? null, d.contactPhone ?? null, d.isPublic ?? true]
        );
        await writeAudit(ctx, req, db, { action: "umkm.create", entityType: "umkm", entityId: r.rows[0].id, newValues: { name: d.businessName } });
        return { id: r.rows[0].id };
      }
      if (mode === "product") {
        const parsed = productSchema.safeParse(body);
        if (!parsed.success) return { error: "Data produk tidak valid", status: 422 };
        const d = parsed.data;
        const own = await db.query(`SELECT id FROM umkm WHERE id = $1 AND village_id = $2`, [d.umkmId, ctx.villageId]);
        if (own.rowCount === 0) return { error: "UMKM tidak ditemukan", status: 404 };
        const r = await db.query(
          `INSERT INTO umkm_products (village_id, umkm_id, name, description, price, unit, stock, is_featured)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.umkmId, d.name, d.description ?? null, d.price, d.unit ?? "pcs", d.stock ?? 0, d.isFeatured ?? false]
        );
        await writeAudit(ctx, req, db, { action: "umkm_product.create", entityType: "umkm_product", entityId: r.rows[0].id, newValues: { name: d.name } });
        return { id: r.rows[0].id };
      }
      if (mode === "order") {
        // order request dari publik/katalog - tidak butuh permission economy.manage
        const parsed = orderSchema.safeParse(body);
        if (!parsed.success) return { error: "Data pesanan tidak valid", status: 422 };
        const d = parsed.data;
        const prod = await db.query(
          `SELECT p.id, u.village_id FROM umkm_products p JOIN umkm u ON u.id = p.umkm_id
           WHERE p.id = $1 AND u.is_public = true`,
          [d.productId]
        );
        if (prod.rowCount === 0) return { error: "Produk tidak ditemukan", status: 404 };
        const vid = prod.rows[0].village_id;
        const r = await db.query(
          `INSERT INTO product_orders (village_id, product_id, buyer_name, buyer_phone, quantity, note)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [vid, d.productId, d.buyerName, d.buyerPhone, d.quantity, d.note ?? null]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "bumdes") {
        const parsed = bumdesSchema.safeParse(body);
        if (!parsed.success) return { error: "Data unit BUMDes tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO bumdes_units (village_id, unit_name, business_type, description, manager_name, capital, revenue, expense, period_year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [ctx.villageId, d.unitName, d.businessType, d.description ?? null, d.managerName ?? null,
           d.capital ?? 0, d.revenue ?? 0, d.expense ?? 0, d.periodYear ?? new Date().getFullYear()]
        );
        await writeAudit(ctx, req, db, { action: "bumdes_unit.create", entityType: "bumdes_unit", entityId: r.rows[0].id, newValues: { name: d.unitName } });
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
    const action = typeof body?.action === "string" ? body.action : "";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "economy.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (action === "order_status") {
        const orderId = String(body?.orderId ?? "");
        const status = String(body?.status ?? "");
        if (!["requested", "contacted", "completed", "cancelled"].includes(status)) {
          return { error: "Status tidak valid", status: 422 };
        }
        const r = await db.query(`UPDATE product_orders SET status = $3 WHERE id = $1 AND village_id = $2 RETURNING id`, [orderId, ctx.villageId, status]);
        if (r.rowCount === 0) return { error: "Pesanan tidak ditemukan", status: 404 };
        await writeAudit(ctx, req, db, { action: "umkm_order.status", entityType: "product_order", entityId: orderId, newValues: { status } });
        return { updated: true };
      }
      if (action === "toggle_featured") {
        const umkmId = String(body?.umkmId ?? "");
        const r = await db.query(`UPDATE umkm SET is_featured = NOT is_featured WHERE id = $1 AND village_id = $2 RETURNING is_featured`, [umkmId, ctx.villageId]);
        if (r.rowCount === 0) return { error: "UMKM tidak ditemukan", status: 404 };
        return { isFeatured: r.rows[0].is_featured };
      }
      return { error: "Aksi tidak dikenal", status: 400 };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
