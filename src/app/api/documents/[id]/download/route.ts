import { statSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { fail, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    const { id } = await params;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "document.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const d = await db.query(
        `SELECT id, file_path, file_name, mime_type, village_id FROM documents
         WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (d.rowCount === 0) return { error: "Dokumen tidak ditemukan", status: 404 };
      return { row: d.rows[0] };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);

    const { row } = result as { row: { file_path: string; file_name: string; mime_type: string } };
    const abs = path.join(process.cwd(), row.file_path);
    try {
      statSync(abs);
    } catch {
      return fail("File tidak ditemukan di storage", 404);
    }

    await withAuth(ctx, (db) =>
      db.query(
        `INSERT INTO document_access_logs (document_id, village_id, actor_user_id, action)
         VALUES ($1,$2,$3,'download')`,
        [id, ctx.villageId, ctx.userId]
      )
    );

    const buffer = readFileSync(abs);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Disposition": `attachment; filename="${row.file_name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
