import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const verifySchema = z.object({ code: z.string().min(6).max(20) });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) return fail("Kode tidak valid", 422);

    const result = await withAuth(null, (db) =>
      db.query("SELECT * FROM app.verify_document($1)", [parsed.data.code])
    );
    const doc = result.rows[0];
    if (!doc) return fail("Dokumen tidak ditemukan", 404);

    return ok({
      title: doc.title,
      docNumber: doc.doc_number,
      docType: doc.doc_type,
      villageName: doc.village_name,
      issuedAt: doc.issued_at,
      valid: doc.valid,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
