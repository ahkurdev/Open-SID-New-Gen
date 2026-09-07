import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.enum(["read", "write"])).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(
        `SELECT id, name, prefix, scopes, is_active, last_used_at, created_at
         FROM api_keys WHERE village_id = $1 ORDER BY created_at DESC`,
        [ctx.villageId]
      );
      return { keys: r.rows };
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      // key hanya ditampilkan SEKALI saat dibuat - server simpan hash saja
      const rawKey = `vos_${randomBytes(24).toString("hex")}`;
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const prefix = rawKey.slice(0, 12);
      const r = await db.query(
        `INSERT INTO api_keys (village_id, name, key_hash, prefix, scopes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [ctx.villageId, parsed.data.name, keyHash, prefix, parsed.data.scopes, ctx.userId]
      );
      await writeAudit(ctx, req, db, { action: "api_key.create", entityType: "api_key", entityId: r.rows[0].id, newValues: { name: parsed.data.name, prefix } });
      return { id: r.rows[0].id, key: rawKey, warning: "Simpan key ini sekarang. Key tidak akan ditampilkan lagi." };
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
    const keyId = typeof body?.keyId === "string" ? body.keyId : "";
    if (!keyId) return fail("keyId wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(`UPDATE api_keys SET is_active = NOT is_active WHERE id = $1 AND village_id = $2 RETURNING is_active`, [keyId, ctx.villageId]);
      if (r.rowCount === 0) return { error: "API key tidak ditemukan", status: 404 };
      await writeAudit(ctx, req, db, { action: "api_key.toggle", entityType: "api_key", entityId: keyId, newValues: { isActive: r.rows[0].is_active } });
      return { isActive: r.rows[0].is_active };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
