import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().nullable(),
  password: z.string().min(8).max(200),
  roleIds: z.array(z.string().uuid()).min(1),
});

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "disabled"]).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
  resetPassword: z.string().min(8).max(200).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const allowed = await withAuth(ctx, (q) => hasPermission(ctx, q, "user.manage"));
    if (!allowed) return fail("Tidak memiliki izin", 403);

    const result = await withAuth(ctx, async (q) => {
      const users = await q.query(
        `SELECT u.id, u.email, u.name, u.phone, u.status, u.last_login_at, u.created_at,
                COALESCE(json_agg(r.name) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE u.village_id = $1 AND u.deleted_at IS NULL
         GROUP BY u.id ORDER BY u.created_at DESC`,
        [ctx.villageId]
      );
      const roles = await q.query(
        `SELECT id, key, name, is_system, permissions FROM roles
         WHERE village_id = $1 OR village_id IS NULL ORDER BY name`,
        [ctx.villageId]
      );
      return { users: users.rows, roles: roles.rows };
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
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const { email, name, phone, password, roleIds } = parsed.data;
    const hash = await bcrypt.hash(password, 12);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const validRoles = await q.query(
        `SELECT id FROM roles WHERE id = ANY($1::uuid[]) AND (village_id = $2 OR village_id IS NULL)`,
        [roleIds, ctx.villageId]
      );
      if (validRoles.rowCount !== roleIds.length) return { error: "Role tidak valid", status: 422 };

      const dup = await q.query("SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL", [email]);
      if ((dup.rowCount ?? 0) > 0) return { error: "Email sudah terdaftar", status: 409 };

      const u = await q.query(
        `INSERT INTO users (village_id, email, password_hash, name, phone, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.villageId, email, hash, name, phone ?? null, ctx.userId]
      );
      await q.query(
        `INSERT INTO user_roles (user_id, role_id, village_id, assigned_by)
         SELECT $1, x, $2, $3 FROM unnest($4::uuid[]) AS x`,
        [u.rows[0].id, ctx.villageId, ctx.userId, roleIds]
      );
      await writeAudit(ctx, req, q, {
        action: "user.create",
        entityType: "user",
        entityId: u.rows[0].id,
        newValues: { email, name, roleIds },
      });
      return { id: u.rows[0].id };
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
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const { userId, status, roleIds, resetPassword } = parsed.data;
    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const target = await q.query(
        `SELECT id FROM users WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [userId, ctx.villageId]
      );
      if (target.rowCount === 0) return { error: "Pengguna tidak ditemukan", status: 404 };

      if (status) {
        await q.query(`UPDATE users SET status = $2, updated_by = $3 WHERE id = $1`, [userId, status, ctx.userId]);
      }
      if (resetPassword) {
        const bcrypt = await import("bcryptjs");
        const hash = await bcrypt.hash(resetPassword, 12);
        await q.query(`UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL, updated_by = $3 WHERE id = $1`, [userId, hash, ctx.userId]);
        await q.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'admin_reset' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      }
      if (roleIds) {
        await q.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        await q.query(
          `INSERT INTO user_roles (user_id, role_id, village_id, assigned_by)
           SELECT $1, x, $2, $3 FROM unnest($4::uuid[]) AS x`,
          [userId, ctx.villageId, ctx.userId, roleIds]
        );
      }
      await writeAudit(ctx, req, q, {
        action: "user.update",
        entityType: "user",
        entityId: userId,
        newValues: { status, roleIds, passwordReset: Boolean(resetPassword) },
      });
      return { updated: true };
    });

    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
