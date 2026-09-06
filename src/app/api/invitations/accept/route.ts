import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { withAuth } from "@/lib/db";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const peekSchema = z.object({ token: z.string().min(10) });

const acceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(1).max(120),
  password: z.string().min(8, "Password minimal 8 karakter").max(200),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function meta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || null,
    ua: h.get("user-agent"),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "peek") {
      const parsed = peekSchema.safeParse(body);
      if (!parsed.success) return fail("Data tidak valid", 422);
      const r = await withAuth(null, (q) => q.query("SELECT * FROM app.peek_invitation($1)", [hashToken(parsed.data.token)]));
      const inv = r.rows[0];
      if (!inv) return fail("Undangan tidak valid atau kedaluwarsa", 404);
      return ok({ email: inv.email, villageName: inv.village_name, expiresAt: inv.expires_at });
    }

    if (action === "accept") {
      const parsed = acceptSchema.safeParse(body);
      if (!parsed.success) return fail("Data tidak valid", 422);
      const m = await meta();
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);

      const result = await withAuth(null, async (q) => {
        const rateOk = await q.query("SELECT app.rate_limit_hit($1,$2,$3) AS ok", [
          `invite:${m.ip ?? "unknown"}`, 10, 3600,
        ]);
        if (!rateOk.rows[0].ok) return { error: "Terlalu banyak percobaan. Coba lagi nanti.", status: 429 };

        try {
          const r = await q.query("SELECT app.accept_invitation($1,$2,$3) AS user_id", [
            hashToken(parsed.data.token), parsed.data.name, passwordHash,
          ]);
          await q.query("SELECT app.register_login_attempt($1,$2,NULL,true,'invitation_accepted',$3,$4)", [
            r.rows[0].user_id, null, m.ip, m.ua,
          ]);
          return { accepted: true };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("INVALID_TOKEN")) return { error: "Undangan tidak valid atau kedaluwarsa", status: 404 };
          if (msg.includes("EMAIL_EXISTS")) return { error: "Email sudah terdaftar", status: 409 };
          throw e;
        }
      });
      if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
      return ok(result);
    }

    return fail("Action tidak dikenal", 400);
  } catch (e) {
    return handleApiError(e);
  }
}
