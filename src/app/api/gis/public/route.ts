import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GeoJSON publik untuk peta desa (tanpa data pribadi) - dipakai juga oleh
// halaman publik tanpa login
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const villageId = url.searchParams.get("villageId");
    if (!villageId) return fail("villageId wajib", 422);

    const result = await withAuth(null, async (db) => {
      const r = await db.query(`SELECT app.gis_features_public($1::uuid) AS fc`, [villageId]);
      return r.rows[0]?.fc ?? { type: "FeatureCollection", features: [] };
    });
    if ("error" in result && result.error) return fail(String(result.error), 400);
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return handleApiError(e);
  }
}
