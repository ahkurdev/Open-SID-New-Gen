import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  postalCode: z.string().max(10).optional().nullable(),
  vision: z.string().max(1000).optional().nullable(),
  mission: z.string().max(2000).optional().nullable(),
  history: z.string().max(5000).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  areaKm2: z.number().min(0).max(100000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (q) => {
      const v = await q.query(
        `SELECT v.id, v.code, v.name, v.address, v.postal_code, v.phone, v.email,
                v.latitude, v.longitude, v.vision, v.mission, v.history, v.area_km2,
                r.name AS region_name
         FROM villages v LEFT JOIN regions r ON r.id = v.region_id WHERE v.id = $1`,
        [ctx.villageId]
      );
      return { village: v.rows[0] ?? null };
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
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const body = await req.json().catch(() => null);
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);

    const result = await withAuth(ctx, async (q) => {
      const allowed = await hasPermission(ctx, q, "settings.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const old = await q.query(`SELECT * FROM villages WHERE id = $1`, [ctx.villageId]);
      const d = parsed.data;
      await q.query(
        `UPDATE villages SET
           name = COALESCE($2, name), address = COALESCE($3, address),
           phone = COALESCE($4, phone), email = COALESCE($5, email),
           postal_code = COALESCE($6, postal_code), vision = COALESCE($7, vision),
           mission = COALESCE($8, mission), history = COALESCE($9, history),
           latitude = COALESCE($10, latitude), longitude = COALESCE($11, longitude),
           area_km2 = COALESCE($12, area_km2), updated_by = $13
         WHERE id = $1`,
        [ctx.villageId, d.name ?? null, d.address ?? null, d.phone ?? null,
         d.email || null, d.postalCode ?? null, d.vision ?? null, d.mission ?? null,
         d.history ?? null, d.latitude ?? null, d.longitude ?? null, d.areaKm2 ?? null, ctx.userId]
      );
      await writeAudit(ctx, req, q, {
        action: "village.update_profile",
        entityType: "village",
        entityId: ctx.villageId,
        oldValues: { name: old.rows[0]?.name, vision: old.rows[0]?.vision, mission: old.rows[0]?.mission },
        newValues: d,
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
