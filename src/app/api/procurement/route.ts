import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const vendorSchema = z.object({
  name: z.string().min(2).max(150),
  contactPerson: z.string().max(100).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  npwp: z.string().max(30).optional().nullable(),
  bankAccount: z.string().max(50).optional().nullable(),
});

const poSchema = z.object({
  title: z.string().min(3).max(200),
  vendorId: z.string().uuid(),
  amount: z.number().positive(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  procurementRequestId: z.string().uuid().optional().nullable(),
});

const quoteSchema = z.object({
  procurementRequestId: z.string().uuid(),
  quotes: z.array(z.object({
    vendorId: z.string().uuid(),
    amount: z.number().positive(),
    notes: z.string().max(300).optional().nullable(),
  })).min(1).max(10),
});

const contractSchema = z.object({
  title: z.string().min(3).max(200),
  vendorId: z.string().uuid().optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  amount: z.number().positive().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const invoiceSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  amount: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "finance.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const vendors = await db.query(
        `SELECT id, name, contact_person, phone, performance_score, is_blacklisted FROM vendors
         WHERE village_id = $1 ORDER BY name`, [ctx.villageId]
      );
      const pos = await db.query(
        `SELECT po.id, po.po_no, po.title, po.amount, po.order_date, po.delivery_date, po.status,
                v.name AS vendor_name
         FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
         WHERE po.village_id = $1 ORDER BY po.order_date DESC LIMIT 100`, [ctx.villageId]
      );
      const contracts = await db.query(
        `SELECT c.id, c.contract_no, c.title, c.amount, c.start_date, c.end_date, c.status,
                v.name AS vendor_name,
                (c.status = 'active' AND c.end_date IS NOT NULL AND c.end_date <= CURRENT_DATE + 30) AS expiring_soon
         FROM contracts c LEFT JOIN vendors v ON v.id = c.vendor_id
         WHERE c.village_id = $1 ORDER BY c.end_date NULLS LAST LIMIT 100`, [ctx.villageId]
      );
      const invoices = await db.query(
        `SELECT i.id, i.invoice_no, i.amount, i.due_date, i.status, i.paid_at,
                v.name AS vendor_name,
                (i.status = 'unpaid' AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS overdue
         FROM invoices i LEFT JOIN vendors v ON v.id = i.vendor_id
         WHERE i.village_id = $1 ORDER BY i.created_at DESC LIMIT 100`, [ctx.villageId]
      );
      return { vendors: vendors.rows, purchaseOrders: pos.rows, contracts: contracts.rows, invoices: invoices.rows };
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
      const allowed = await hasPermission(ctx, db, "finance.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "vendor") {
        const parsed = vendorSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const v = await db.query(
          `INSERT INTO vendors (village_id, name, contact_person, phone, address, npwp, bank_account)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.villageId, d.name, d.contactPerson ?? null, d.phone ?? null, d.address ?? null, d.npwp ?? null, d.bankAccount ?? null]
        );
        await writeAudit(ctx, req, db, { action: "vendor.create", entityType: "vendor", entityId: v.rows[0].id, newValues: d });
        return { id: v.rows[0].id };
      }

      if (mode === "quote") {
        const parsed = quoteSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        for (const q of d.quotes) {
          await db.query(
            `INSERT INTO vendor_quotes (village_id, procurement_request_id, vendor_id, amount, notes)
             VALUES ($1,$2,$3,$4,$5)`,
            [ctx.villageId, d.procurementRequestId, q.vendorId, q.amount, q.notes ?? null]
          );
        }
        await db.query(`UPDATE procurement_requests SET status = 'quoted' WHERE id = $1 AND village_id = $2`, [d.procurementRequestId, ctx.villageId]);
        await writeAudit(ctx, req, db, { action: "quote.add", entityType: "procurement_request", entityId: d.procurementRequestId, newValues: { count: d.quotes.length } });
        return { added: d.quotes.length };
      }

      if (mode === "po") {
        const parsed = poSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const seq = await db.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM '[0-9]+$') AS integer)), 0) + 1 AS n FROM purchase_orders WHERE village_id = $1`,
          [ctx.villageId]
        );
        const poNo = `PO/${new Date().getFullYear()}/${String(seq.rows[0].n).padStart(4, "0")}`;
        const po = await db.query(
          `INSERT INTO purchase_orders (village_id, po_no, procurement_request_id, vendor_id, title, amount, delivery_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, poNo, d.procurementRequestId ?? null, d.vendorId, d.title, d.amount, d.deliveryDate ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "po.create", entityType: "purchase_order", entityId: po.rows[0].id, newValues: { poNo, amount: d.amount } });
        return { id: po.rows[0].id, poNo };
      }

      if (mode === "contract") {
        const parsed = contractSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const seq = await db.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(contract_no FROM '[0-9]+$') AS integer)), 0) + 1 AS n FROM contracts WHERE village_id = $1`,
          [ctx.villageId]
        );
        const contractNo = `KTR/${new Date().getFullYear()}/${String(seq.rows[0].n).padStart(4, "0")}`;
        const c = await db.query(
          `INSERT INTO contracts (village_id, contract_no, vendor_id, purchase_order_id, title, amount, start_date, end_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, contractNo, d.vendorId ?? null, d.purchaseOrderId ?? null, d.title, d.amount ?? null, d.startDate, d.endDate ?? null]
        );
        await writeAudit(ctx, req, db, { action: "contract.create", entityType: "contract", entityId: c.rows[0].id, newValues: { contractNo } });
        return { id: c.rows[0].id, contractNo };
      }

      if (mode === "invoice") {
        const parsed = invoiceSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const po = await db.query(`SELECT vendor_id FROM purchase_orders WHERE id = $1 AND village_id = $2`, [d.purchaseOrderId, ctx.villageId]);
        if (po.rowCount === 0) return { error: "PO tidak ditemukan", status: 404 };
        const seq = await db.query(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no FROM '[0-9]+$') AS integer)), 0) + 1 AS n FROM invoices WHERE village_id = $1`,
          [ctx.villageId]
        );
        const invoiceNo = `INV/${new Date().getFullYear()}/${String(seq.rows[0].n).padStart(4, "0")}`;
        const i = await db.query(
          `INSERT INTO invoices (village_id, invoice_no, purchase_order_id, vendor_id, amount, due_date)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, invoiceNo, d.purchaseOrderId, po.rows[0].vendor_id, d.amount, d.dueDate ?? null]
        );
        await writeAudit(ctx, req, db, { action: "invoice.create", entityType: "invoice", entityId: i.rows[0].id, newValues: { invoiceNo, amount: d.amount } });
        return { id: i.rows[0].id, invoiceNo };
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
    const kind = typeof body?.kind === "string" ? body.kind : "";
    const id = typeof body?.id === "string" ? body.id : null;
    const status = typeof body?.status === "string" ? body.status : null;
    if (!id || !status) return fail("id dan status wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "finance.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (kind === "invoice") {
        const extra = status === "paid" ? ", paid_at = now()" : "";
        await db.query(`UPDATE invoices SET status = $2 ${extra} WHERE id = $1 AND village_id = $3`, [id, status, ctx.villageId]);
      } else if (kind === "po") {
        await db.query(`UPDATE purchase_orders SET status = $2 WHERE id = $1 AND village_id = $3`, [id, status, ctx.villageId]);
      } else if (kind === "contract") {
        await db.query(`UPDATE contracts SET status = $2 WHERE id = $1 AND village_id = $3`, [id, status, ctx.villageId]);
      } else {
        return { error: "Kind tidak dikenal", status: 400 };
      }
      await writeAudit(ctx, req, db, { action: `${kind}.status`, entityType: kind, entityId: id, newValues: { status } });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
