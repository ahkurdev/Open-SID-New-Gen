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

    const result = await withAuth(null, (db) => db.query("SELECT * FROM app.verify_letter($1)", [parsed.data.code]));
    const letter = result.rows[0];
    if (!letter) return fail("Surat tidak ditemukan", 404);
    return ok({
      letterNumber: letter.letter_number,
      templateName: letter.template_name,
      applicantName: letter.applicant_name,
      villageName: letter.village_name,
      issuedAt: letter.issued_at,
      valid: letter.valid,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
