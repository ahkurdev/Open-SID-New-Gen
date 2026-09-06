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
    const programId = url.searchParams.get("programId") ?? "";
    if (!programId) return fail("programId wajib", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "aid.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const insight = await db.query(
        `SELECT * FROM app.welfare_insight_candidates($1, $2, 20)`,
        [ctx.villageId, programId]
      );
      return {
        candidates: insight.rows,
        disclaimer:
          "Rekomendasi otomatis berdasarkan indikator kesejahteraan yang tercatat. " +
          "Skor dan faktor ditampilkan transparan. BUKAN penetapan penerima resmi - " +
          "petugas wajib memverifikasi dan keputusan akhir tetap di musyawarah/apparatur desa.",
      };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
