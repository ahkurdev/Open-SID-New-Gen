import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { mailer } from "@/lib/mail";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  roleIds: z.array(z.string().uuid()).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const inv = await q.query(
        `SELECT i.id, i.email, i.expires_at, i.accepted_at, i.revoked_at, i.created_at,
                COALESCE((SELECT json_agg(r.name) FROM roles r WHERE r.id = ANY(i.role_ids)), '[]') AS roles
         FROM invitations i WHERE i.village_id = $1
         ORDER BY i.created_at DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { invitations: inv.rows };
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
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const { email, roleIds } = parsed.data;
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const validRoles = await q.query(
        `SELECT 1 FROM roles WHERE id = ANY($1::uuid[]) AND (village_id = $2 OR village_id IS NULL)`,
        [roleIds, ctx.villageId]
      );
      if ((validRoles.rowCount ?? 0) !== roleIds.length) return { error: "Role tidak valid", status: 422 };

      const existingUser = await q.query(
        `SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]
      );
      if ((existingUser.rowCount ?? 0) > 0) return { error: "Email sudah terdaftar sebagai pengguna", status: 409 };

      const inv = await q.query(
        `INSERT INTO invitations (village_id, email, role_ids, token_hash, invited_by, expires_at)
         VALUES ($1,$2,$3,$4,$5, now() + interval '7 days')
         ON CONFLICT (village_id, email) DO UPDATE
           SET role_ids = EXCLUDED.role_ids, token_hash = EXCLUDED.token_hash,
               invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at,
               accepted_at = NULL, revoked_at = NULL, created_at = now()
         RETURNING id`,
        [ctx.villageId, email, roleIds, tokenHash, ctx.userId]
      );
      await writeAudit(ctx, req, q, {
        action: "invitation.create",
        entityType: "invitation",
        entityId: inv.rows[0].id,
        newValues: { email, roleIds },
      });
      return { id: inv.rows[0].id, token };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);

    await mailer.send(
      email,
      "Undangan Bergabung Village OS",
      `Anda diundang untuk bergabung. Buka tautan berikut (berlaku 7 hari):\nhttp://localhost:3000/accept-invite?token=${result.token}`
    );
    // ponytail: token dikembalikan di dev agar bisa dites tanpa SMTP; hapus saat prod mailer siap
    return ok({ id: result.id, inviteLink: `http://localhost:3000/accept-invite?token=${result.token}` }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) return fail("ID wajib diisi", 422);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "user.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await q.query(
        `UPDATE invitations SET revoked_at = now() WHERE id = $1 AND village_id = $2 AND accepted_at IS NULL`,
        [id, ctx.villageId]
      );
      await writeAudit(ctx, req, q, { action: "invitation.revoke", entityType: "invitation", entityId: id });
      return { revoked: (r.rowCount ?? 0) > 0 };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
