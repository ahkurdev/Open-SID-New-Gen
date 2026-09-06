import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { profileUpdateSchema, passwordChangeSchema } from "@/lib/validation";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const u = await q.query(
        `SELECT u.id, u.email, u.name, u.phone, u.theme, u.village_id, v.name AS village_name
         FROM users u LEFT JOIN villages v ON v.id = u.village_id WHERE u.id = $1`,
        [ctx.userId]
      );
      const roles = await q.query(
        `SELECT r.key, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
        [ctx.userId]
      );
      return { user: u.rows[0], roles: roles.rows };
    });
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const parsed = profileUpdateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    await withAuth(ctx, async (q) => {
      await q.query(
        `UPDATE users SET name = $2, phone = $3, theme = COALESCE($4, theme), updated_by = $1 WHERE id = $1`,
        [ctx.userId, parsed.data.name, parsed.data.phone ?? null, parsed.data.theme ?? null]
      );
      await writeAudit(ctx, req, q, {
        action: "profile.update",
        entityType: "user",
        entityId: ctx.userId,
        newValues: parsed.data,
      });
    });
    return ok({ updated: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    const result = await withAuth(ctx, async (q) => {
      const u = await q.query("SELECT password_hash FROM users WHERE id = $1", [ctx.userId]);
      const match = await bcrypt.compare(parsed.data.currentPassword, u.rows[0].password_hash);
      if (!match) return { error: "Password saat ini salah" };
      await q.query("UPDATE users SET password_hash = $2, updated_by = $1 WHERE id = $1", [ctx.userId, hash]);
      await writeAudit(ctx, req, q, { action: "profile.change_password", entityType: "user", entityId: ctx.userId });
      return { changed: true };
    });
    if ("error" in result && result.error) return fail(result.error, 403);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
