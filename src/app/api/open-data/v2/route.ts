import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/db";
import { fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Rate limiting sederhana in-memory per IP (ponytail: single-instance saja;
// ganti Redis/DB-backed saat multi-instance deployment)
const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQ = 30;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_REQ) return false;
  b.count += 1;
  return true;
}

const querySchema = z.object({
  dataset: z.enum(["profile", "population", "letters", "complaints", "economy", "events"]),
  format: z.enum(["json", "csv"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(ip)) {
      return NextResponse.json({ ok: false, error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
    }

    const url = new URL(req.url);
    const villageId = url.searchParams.get("villageId");
    if (!villageId) return fail("villageId wajib", 422);
    const parsed = querySchema.safeParse({ dataset: url.searchParams.get("dataset") ?? "profile", format: url.searchParams.get("format") ?? "json" });
    if (!parsed.success) return fail("dataset tidak valid", 422);
    const { dataset, format } = parsed.data;

    const result = await withAuth(null, async (db) => {
      let rows: Record<string, unknown>[] = [];
      if (dataset === "profile") {
        rows = (await db.query(
          `SELECT name, code, address, vision, mission FROM villages WHERE id = $1::uuid AND deleted_at IS NULL`,
          [villageId]
        )).rows;
      } else if (dataset === "population") {
        rows = (await db.query(`SELECT * FROM analytics_population WHERE village_id = $1::uuid`, [villageId])).rows;
      } else if (dataset === "letters") {
        rows = (await db.query(`SELECT total_letters, issued, in_progress, avg_days_to_issue FROM analytics_letters WHERE village_id = $1::uuid`, [villageId])).rows;
      } else if (dataset === "complaints") {
        rows = (await db.query(`SELECT total_complaints, unresolved, resolved, avg_rating FROM analytics_complaints WHERE village_id = $1::uuid`, [villageId])).rows;
      } else if (dataset === "economy") {
        rows = (await db.query(`SELECT umkm_count, farm_count, bumdes_profit FROM analytics_economy WHERE village_id = $1::uuid`, [villageId])).rows;
      } else if (dataset === "events") {
        rows = (await db.query(`SELECT COALESCE(app.upcoming_events_public($1::uuid, 10), '[]'::jsonb) AS events`, [villageId])).rows;
      }
      return rows;
    });
    if ("error" in result && result.error) return fail(String(result.error), 400);

    if (format === "csv") {
      const rows = result as Record<string, unknown>[];
      if (rows.length === 0) return new NextResponse("no data\n", { status: 200 });
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="open-data-${dataset}.csv"` },
      });
    }

    return NextResponse.json({ ok: true, data: result, license: "CC-BY-4.0", note: "Data agregat publik desa. Tanpa data pribadi warga." });
  } catch (e) {
    return handleApiError(e);
  }
}
