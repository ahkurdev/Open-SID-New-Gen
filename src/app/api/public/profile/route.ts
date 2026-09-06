import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const villageCode = url.searchParams.get("village") ?? "";
    if (!villageCode) return fail("Parameter village wajib", 422);

    const result = await withAuth(null, async (db) => {
      const v = await db.query(
        `SELECT v.name, v.address, v.latitude, v.longitude, r.name AS region_name
         FROM villages v LEFT JOIN regions r ON r.id = v.region_id WHERE v.code = $1`,
        [villageCode]
      );
      if (v.rowCount === 0) return { error: "Desa tidak ditemukan", status: 404 };

      const officials = await db.query(
        `SELECT name, type, position_title, organization FROM public_officials WHERE village_id = (SELECT id FROM villages WHERE code = $1) ORDER BY type, sort_order`,
        [villageCode]
      );
      const posts = await db.query("SELECT * FROM app.get_public_posts($1)", [villageCode]);
      const stats = await db.query("SELECT * FROM app.get_public_stats($1)", [villageCode]);

      return {
        village: v.rows[0],
        officials: officials.rows,
        posts: posts.rows.map((p: Record<string, unknown>) => ({
          id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt,
          type: p.type, category: p.category, publishedAt: p.published_at,
        })),
        stats: Object.fromEntries(stats.rows.map((r: { metric: string; value: string }) => [r.metric, r.value])),
      };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return handleApiError(e);
  }
}
