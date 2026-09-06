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

    const url = new URL(req.url);
    const scholarshipId = url.searchParams.get("scholarshipId") ?? "";
    if (!scholarshipId) return fail("scholarshipId wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "services.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const insight = await db.query(
        `SELECT * FROM app.scholarship_candidates($1, $2, 15)`,
        [ctx.villageId, scholarshipId]
      );
      return {
        candidates: insight.rows,
        disclaimer:
          "Rekomendasi otomatis berdasarkan indikator tercatat (risiko putus sekolah, tanpa penghasilan, single parent, jumlah anak usia sekolah). " +
          "Wajib verifikasi petugas. BUKAN penetapan penerima beasiswa.",
      };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
