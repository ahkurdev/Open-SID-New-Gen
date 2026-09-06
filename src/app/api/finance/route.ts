import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const planSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  category: z.enum(["pendapatan", "belanja", "pembiayaan"]),
  name: z.string().min(2).max(150),
  plannedAmount: z.number().min(0),
  code: z.string().max(20).optional().nullable(),
});

const trxSchema = z.object({
  trxType: z.enum(["pemasukan", "pengeluaran"]),
  amount: z.number().positive(),
  trxDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(3).max(300),
  budgetPlanId: z.string().uuid().optional().nullable(),
  referenceNo: z.string().max(50).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "finance.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const plans = await db.query(
        `SELECT bp.id, bp.category, bp.name, bp.code, bp.planned_amount,
                COALESCE((SELECT SUM(CASE WHEN t.trx_type = 'pengeluaran' THEN -t.amount ELSE t.amount END)
                   FROM finance_transactions t WHERE t.budget_plan_id = bp.id AND t.deleted_at IS NULL), 0) AS realized_amount
         FROM budget_plans bp WHERE bp.village_id = $1 AND bp.year = $2
         ORDER BY bp.category, bp.name`,
        [ctx.villageId, year]
      );
      const summary = await db.query(
        `SELECT
           COALESCE(SUM(amount) FILTER (WHERE trx_type = 'pemasukan'), 0)::numeric AS total_pemasukan,
           COALESCE(SUM(amount) FILTER (WHERE trx_type = 'pengeluaran'), 0)::numeric AS total_pengeluaran,
           COUNT(*)::int AS total_transaksi,
           COUNT(*) FILTER (WHERE anomaly_flag IS NOT NULL)::int AS anomalies
         FROM finance_transactions
         WHERE village_id = $1 AND deleted_at IS NULL AND EXTRACT(YEAR FROM trx_date) = $2`,
        [ctx.villageId, year]
      );
      const monthly = await db.query(
        `SELECT to_char(date_trunc('month', trx_date), 'YYYY-MM') AS month,
                COALESCE(SUM(amount) FILTER (WHERE trx_type = 'pemasukan'), 0)::numeric AS pemasukan,
                COALESCE(SUM(amount) FILTER (WHERE trx_type = 'pengeluaran'), 0)::numeric AS pengeluaran
         FROM finance_transactions
         WHERE village_id = $1 AND deleted_at IS NULL AND EXTRACT(YEAR FROM trx_date) = $2
         GROUP BY 1 ORDER BY 1`,
        [ctx.villageId, year]
      );
      const anomalies = await db.query(
        `SELECT id, trx_date, amount, description, anomaly_flag, anomaly_note, created_at
         FROM finance_transactions WHERE village_id = $1 AND deleted_at IS NULL AND anomaly_flag IS NOT NULL
         ORDER BY trx_date DESC LIMIT 50`,
        [ctx.villageId]
      );
      return {
        year,
        plans: plans.rows,
        summary: summary.rows[0],
        monthly: monthly.rows,
        anomalies: anomalies.rows,
      };
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
    const mode = typeof body?.mode === "string" ? body.mode : "transaction";

    const result = await withAuth(ctx, async (db) => {
      if (mode === "plan") {
        const parsed = planSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const p = await db.query(
          `INSERT INTO budget_plans (village_id, year, category, name, planned_amount, code, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (village_id, year, category, name) DO UPDATE SET planned_amount = EXCLUDED.planned_amount
           RETURNING id`,
          [ctx.villageId, d.year, d.category, d.name, d.plannedAmount, d.code ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, {
          action: "budget_plan.upsert", entityType: "budget_plan", entityId: p.rows[0].id, newValues: d,
        });
        return { id: p.rows[0].id };
      }

      const parsed = trxSchema.safeParse(body);
      if (!parsed.success) return { error: "Data tidak valid", status: 422 };
      const d = parsed.data;

      const canManage = await hasPermission(ctx, db, "finance.manage");
      if (!canManage) return { error: "Tidak memiliki izin", status: 403 };

      const anomaly = await db.query(
        "SELECT app.detect_finance_anomaly($1,$2,$3,$4) AS flag",
        [ctx.villageId, d.amount, d.trxDate, d.description]
      );
      const flag = anomaly.rows[0].flag;

      if (d.budgetPlanId) {
        const bp = await db.query(`SELECT 1 FROM budget_plans WHERE id = $1 AND village_id = $2`, [d.budgetPlanId, ctx.villageId]);
        if (bp.rowCount === 0) return { error: "Pos anggaran tidak ditemukan", status: 422 };
      }

      const t = await db.query(
        `INSERT INTO finance_transactions (village_id, budget_plan_id, trx_type, amount, trx_date, description, reference_no, anomaly_flag, anomaly_note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [ctx.villageId, d.budgetPlanId ?? null, d.trxType, d.amount, d.trxDate, d.description,
         d.referenceNo ?? null, flag, flag ? "Terdeteksi otomatis, mohon verifikasi manual" : null, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "finance.transaction.create", entityType: "finance_transaction", entityId: t.rows[0].id,
        newValues: { trxType: d.trxType, amount: d.amount, anomaly: flag },
      });
      return { id: t.rows[0].id, anomalyFlag: flag };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
