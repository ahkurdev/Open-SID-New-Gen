import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  parentTaskId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const status = url.searchParams.get("status") ?? "";

    const result = await withAuth(ctx, async (db) => {
      const params: unknown[] = [ctx.villageId];
      const where = ["t.village_id = $1", "t.deleted_at IS NULL"];
      if (mine) { params.push(ctx.userId); where.push(`t.assigned_to = $${params.length}`); }
      if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const rows = await db.query(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
                t.completed_at, t.recurrence, t.parent_task_id,
                u.name AS assignee_name,
                (t.due_date < CURRENT_DATE AND t.status NOT IN ('done','cancelled')) AS overdue
         FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
         WHERE ${whereSql}
         ORDER BY (t.status NOT IN ('done','cancelled')) DESC,
                  CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                  t.due_date NULLS LAST
         LIMIT 200`,
        params
      );
      const stats = await db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'todo')::int AS todo,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'done')::int AS done,
                COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('done','cancelled'))::int AS overdue
         FROM tasks WHERE village_id = $1 AND deleted_at IS NULL`,
        [ctx.villageId]
      );
      return { tasks: rows.rows, stats: stats.rows[0] };
    });
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      if (d.assignedTo) {
        const u = await db.query(`SELECT 1 FROM users WHERE id = $1 AND village_id = $2`, [d.assignedTo, ctx.villageId]);
        if (u.rowCount === 0) return { error: "Petugas tidak ditemukan", status: 422 };
      }
      const t = await db.query(
        `INSERT INTO tasks (village_id, title, description, priority, assigned_to, assigned_by, due_date, recurrence, parent_task_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [ctx.villageId, d.title, d.description ?? null, d.priority ?? "normal",
         d.assignedTo ?? null, ctx.userId, d.dueDate ?? null, d.recurrence ?? "none",
         d.parentTaskId ?? null, ctx.userId]
      );
      if (d.assignedTo && d.assignedTo !== ctx.userId) {
        await db.query(
          `INSERT INTO notifications (village_id, user_id, category, title, body)
           VALUES ($1,$2,'tugas','Tugas baru ditugaskan ke Anda',$3)`,
          [ctx.villageId, d.assignedTo, d.title]
        );
      }
      await writeAudit(ctx, req, db, {
        action: "task.create", entityType: "task", entityId: t.rows[0].id, newValues: d,
      });
      return { id: t.rows[0].id };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
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
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, ...fields } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const existing = await db.query(
        `SELECT id, status, title, recurrence, due_date FROM tasks WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (existing.rowCount === 0) return { error: "Tugas tidak ditemukan", status: 404 };
      const old = existing.rows[0];

      const map: Record<string, string> = {
        status: "status", priority: "priority", assignedTo: "assigned_to", dueDate: "due_date",
      };
      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      for (const [k, col] of Object.entries(map)) {
        const v = fields[k as keyof typeof fields];
        if (v !== undefined) { values.push(v); sets.push(`${col} = $${++i}`); }
      }
      if (fields.status === "done") {
        sets.push(`completed_at = now()`);
      }
      if (sets.length > 0) {
        await db.query(`UPDATE tasks SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
      }

      // recurring task: selesai -> buat instance berikutnya
      if (fields.status === "done" && old.recurrence !== "none") {
        const interval = old.recurrence === "daily" ? "1 day" : old.recurrence === "weekly" ? "1 week" : "1 month";
        await db.query(
          `INSERT INTO tasks (village_id, title, description, priority, assigned_to, assigned_by, due_date, recurrence, parent_task_id, created_by)
           SELECT village_id, title, description, priority, assigned_to, assigned_by, due_date + $2::interval, recurrence, NULL, $3
           FROM tasks WHERE id = $1`,
          [id, interval, ctx.userId]
        );
      }

      await writeAudit(ctx, req, db, {
        action: "task.update", entityType: "task", entityId: id,
        oldValues: { status: old.status }, newValues: fields,
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
