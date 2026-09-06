import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  code: z.string().min(3).max(30),
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.isPlatformAdmin) return fail("Hanya admin platform", 403);

    const result = await withAuth(ctx, async (q) => {
      const v = await q.query(
        `SELECT id, code, name, address, status, created_at FROM villages ORDER BY created_at DESC`
      );
      return { villages: v.rows };
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
    if (!ctx.isPlatformAdmin) return fail("Hanya admin platform yang dapat mendaftarkan desa", 403);

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const result = await withAuth(ctx, async (q) => {
      const dup = await q.query("SELECT 1 FROM villages WHERE code = $1", [parsed.data.code]);
      if ((dup.rowCount ?? 0) > 0) return { error: "Kode desa sudah terdaftar", status: 409 };

      const v = await q.query(
        `INSERT INTO villages (code, name, address, latitude, longitude, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, code, name`,
        [parsed.data.code, parsed.data.name, parsed.data.address ?? null,
         parsed.data.latitude ?? null, parsed.data.longitude ?? null, ctx.userId]
      );
      await writeAudit(ctx, req, q, {
        action: "village.create", entityType: "village", entityId: v.rows[0].id, newValues: parsed.data,
      });
      return { village: v.rows[0] };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
