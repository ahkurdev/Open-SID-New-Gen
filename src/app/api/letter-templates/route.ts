import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const fieldSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(80),
  type: z.enum(["text", "textarea", "number", "date", "select"]),
  required: z.boolean().optional(),
  options: z.array(z.string().max(60)).max(20).optional(),
});

const createSchema = z.object({
  code: z.string().min(2).max(30).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  formSchema: z.array(fieldSchema).max(30),
  approvalSteps: z.array(z.enum(["operator", "sekdes", "kades"])).min(1).max(5),
  slaDays: z.number().int().min(1).max(60),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  formSchema: z.array(fieldSchema).max(30).optional(),
  approvalSteps: z.array(z.enum(["operator", "sekdes", "kades"])).min(1).max(5).optional(),
  slaDays: z.number().int().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const t = await db.query(
        `SELECT id, code, name, description, form_schema, approval_steps, sla_days, is_active
         FROM letter_templates WHERE village_id = $1 ORDER BY name`,
        [ctx.villageId]
      );
      return { templates: t.rows };
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
      const allowed = await hasPermission(ctx, db, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const dup = await db.query(`SELECT 1 FROM letter_templates WHERE village_id = $1 AND code = $2`, [ctx.villageId, d.code]);
      if ((dup.rowCount ?? 0) > 0) return { error: "Kode template sudah dipakai", status: 409 };

      const t = await db.query(
        `INSERT INTO letter_templates (village_id, code, name, description, form_schema, approval_steps, sla_days, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [ctx.villageId, d.code, d.name, d.description ?? null, JSON.stringify(d.formSchema), d.approvalSteps, d.slaDays, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "letter_template.create", entityType: "letter_template", entityId: t.rows[0].id, newValues: d,
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
      const allowed = await hasPermission(ctx, db, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const existing = await db.query(`SELECT id FROM letter_templates WHERE id = $1 AND village_id = $2`, [id, ctx.villageId]);
      if (existing.rowCount === 0) return { error: "Template tidak ditemukan", status: 404 };

      const map: Record<string, string> = {
        name: "name", description: "description", slaDays: "sla_days", isActive: "is_active",
      };
      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      for (const [k, col] of Object.entries(map)) {
        const v = fields[k as keyof typeof fields];
        if (v !== undefined) { values.push(v); sets.push(`${col} = $${++i}`); }
      }
      if (fields.formSchema !== undefined) { values.push(JSON.stringify(fields.formSchema)); sets.push(`form_schema = $${++i}`); }
      if (fields.approvalSteps !== undefined) { values.push(fields.approvalSteps); sets.push(`approval_steps = $${++i}`); }
      if (sets.length > 0) {
        await db.query(`UPDATE letter_templates SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
        await writeAudit(ctx, req, db, {
          action: "letter_template.update", entityType: "letter_template", entityId: id, newValues: fields,
        });
      }
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
