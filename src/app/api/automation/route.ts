import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ruleSchema = z.object({
  name: z.string().min(2).max(150),
  triggerType: z.enum(["complaint_overdue", "letter_submitted", "letter_approved", "contract_expiring", "stock_low", "aid_pending", "booking_requested", "task_overdue", "sensor_warning", "device_offline"]),
  triggerConfig: z.record(z.unknown()).optional(),
  actionType: z.enum(["create_notification", "create_task", "flag_warning", "generate_log"]),
  actionConfig: z.record(z.unknown()).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "automation.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const rules = await db.query(
        `SELECT id, name, trigger_type, trigger_config, action_type, action_config, is_active, last_run_at, run_count
         FROM automation_rules WHERE village_id = $1 ORDER BY created_at DESC`,
        [ctx.villageId]
      );
      const runs = await db.query(
        `SELECT r.id, r.target_type, r.message, r.created_at, ru.name AS rule_name
         FROM automation_runs r JOIN automation_rules ru ON ru.id = r.rule_id
         WHERE r.village_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
        [ctx.villageId]
      );
      return { rules: rules.rows, runs: runs.rows };
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
      const allowed = await hasPermission(ctx, db, "automation.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "rule") {
        const parsed = ruleSchema.safeParse(body);
        if (!parsed.success) return { error: "Data rule tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO automation_rules (village_id, name, trigger_type, trigger_config, action_type, action_config, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.villageId, d.name, d.triggerType, JSON.stringify(d.triggerConfig ?? {}), d.actionType, JSON.stringify(d.actionConfig ?? {}), ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "automation_rule.create", entityType: "automation_rule", entityId: r.rows[0].id, newValues: { name: d.name, trigger: d.triggerType } });
        return { id: r.rows[0].id };
      }
      if (mode === "evaluate") {
        // jalankan engine: cari pelanggaran rule & catat run
        const r = await db.query(`SELECT app.evaluate_automation_rules($1) AS fired`, [ctx.villageId]);
        return { fired: r.rows[0]?.fired ?? 0 };
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
    const ruleId = typeof body?.ruleId === "string" ? body.ruleId : "";
    if (!ruleId) return fail("ruleId wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "automation.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(`UPDATE automation_rules SET is_active = NOT is_active WHERE id = $1 AND village_id = $2 RETURNING is_active`, [ruleId, ctx.villageId]);
      if (r.rowCount === 0) return { error: "Rule tidak ditemukan", status: 404 };
      await writeAudit(ctx, req, db, { action: "automation_rule.toggle", entityType: "automation_rule", entityId: ruleId, newValues: { isActive: r.rows[0].is_active } });
      return { isActive: r.rows[0].is_active };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
