import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { ok, fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "analytics.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const vid = ctx.villageId as string;

      const [pop, letters, complaints, economy, aid, finance, assets, projects, score] = await Promise.all([
        db.query(`SELECT * FROM analytics_population WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_letters WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_complaints WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_economy WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_aid WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_finance WHERE village_id = $1 ORDER BY year DESC`, [vid]),
        db.query(`SELECT * FROM analytics_assets WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM analytics_projects WHERE village_id = $1`, [vid]),
        db.query(`SELECT * FROM app.village_health_score($1)`, [vid]),
      ]);

      return {
        population: pop.rows[0] ?? null,
        letters: letters.rows[0] ?? null,
        complaints: complaints.rows[0] ?? null,
        economy: economy.rows[0] ?? null,
        aid: aid.rows[0] ?? null,
        finance: finance.rows,
        assets: assets.rows[0] ?? null,
        projects: projects.rows[0] ?? null,
        healthScore: {
          dimensions: score.rows,
          disclaimer:
            "Village Health Score ditampilkan sebagai 6 dimensi TERPISAH dengan rumus transparan. " +
            "Bukan satu angka abstrak. Skor menggambarkan kelengkapan data & aktivitas, bukan penilaian resmi kinerja pemerintahan.",
        },
      };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
