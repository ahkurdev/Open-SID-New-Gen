import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({ village: z.string().min(3).max(30) });

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ village: url.searchParams.get("village") ?? "" });
    if (!parsed.success) return fail("Parameter village wajib", 422);

    const result = await withAuth(null, async (db) => {
      const stats = await db.query("SELECT * FROM app.get_public_stats($1)", [parsed.data.village]);
      const posts = await db.query("SELECT * FROM app.get_public_posts($1)", [parsed.data.village]);
      return {
        stats: Object.fromEntries(stats.rows.map((r: { metric: string; value: string }) => [r.metric, r.value])),
        posts: posts.rows.map((p: Record<string, unknown>) => ({
          id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt,
          category: p.category, publishedAt: p.published_at,
        })),
      };
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return handleApiError(e);
  }
}
