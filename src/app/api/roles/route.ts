import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createRoleSchema = z.object({
  key: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/, "Gunakan huruf kecil, angka, - atau _"),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string().min(2).max(60)).max(200),
});

const updateRoleSchema = z.object({
  roleId: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string().min(2).max(60)).max(200).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const roles = await q.query(
        `SELECT id, key, name, description, is_system, permissions FROM roles
         WHERE village_id = $1 OR village_id IS NULL ORDER BY is_system DESC, name`,
        [ctx.villageId]
      );
      return { roles: roles.rows };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
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
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "role.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const dup = await q.query(
        `SELECT 1 FROM roles WHERE village_id = $1 AND key = $2`,
        [ctx.villageId, parsed.data.key]
      );
      if ((dup.rowCount ?? 0) > 0) return { error: "Key role sudah dipakai", status: 409 };

      const r = await q.query(
        `INSERT INTO roles (village_id, key, name, description, permissions, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.villageId, parsed.data.key, parsed.data.name, parsed.data.description ?? null, parsed.data.permissions, ctx.userId]
      );
      await writeAudit(ctx, req, q, {
        action: "role.create",
        entityType: "role",
        entityId: r.rows[0].id,
        newValues: parsed.data,
      });
      return { id: r.rows[0].id };
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
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const { roleId, ...fields } = parsed.data;
    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "role.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const existing = await q.query(
        `SELECT id, is_system FROM roles WHERE id = $1 AND village_id = $2`,
        [roleId, ctx.villageId]
      );
      if (existing.rowCount === 0) return { error: "Role tidak ditemukan", status: 404 };

      const sets: string[] = [];
      const values: unknown[] = [roleId, ctx.userId];
      let i = values.length;
      if (fields.name !== undefined) { values.push(fields.name); sets.push(`name = $${++i}`); }
      if (fields.description !== undefined) { values.push(fields.description); sets.push(`description = $${++i}`); }
      if (fields.permissions !== undefined) { values.push(fields.permissions); sets.push(`permissions = $${++i}`); }
      if (sets.length > 0) {
        await q.query(`UPDATE roles SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
        await writeAudit(ctx, req, q, {
          action: "role.update",
          entityType: "role",
          entityId: roleId,
          newValues: fields,
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
