import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const lookupSchema = z.object({ code: z.string().min(3).max(40) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) return fail("Kode tidak valid", 422);

    const result = await withAuth(null, (db) => db.query("SELECT * FROM app.lookup_asset_public($1)", [parsed.data.code]));
    const asset = result.rows[0];
    if (!asset) return fail("Aset tidak ditemukan", 404);
    return ok({
      assetCode: asset.asset_code, name: asset.name, category: asset.category,
      condition: asset.condition, villageName: asset.village_name, status: asset.status,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
