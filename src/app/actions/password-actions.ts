"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { withAuth } from "@/lib/db";
import { mailer } from "@/lib/mail";
import { forgotPasswordSchema } from "@/lib/validation";
import type { ActionState } from "./auth-actions";
const DEV_APP_URL = "http://localhost:3000";

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || null;
  const ua = h.get("user-agent");

  try {
    await withAuth(null, async (q) => {
      const rateOk = await q.query("SELECT app.rate_limit_hit($1,$2,$3) AS ok", [
        `forgot:${ip ?? "unknown"}`, 5, 3600,
      ]);
      if (!rateOk.rows[0].ok) return;

      const u = await q.query("SELECT * FROM app.get_user_for_login($1)", [parsed.data.email]);
      if (!u.rows[0]) return;
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await q.query("SELECT app.create_password_reset($1,$2,$3,$4,$5)", [
        u.rows[0].id, tokenHash, new Date(Date.now() + 3600_000).toISOString(), ip, ua,
      ]);
      await mailer.send(u.rows[0].email, "Reset Password Village OS",
        `Buka tautan berikut untuk mereset password (berlaku 1 jam):\n${DEV_APP_URL}/reset-password?token=${token}`);
    });
  } catch (e) {
    console.error("[forgot-password]", e);
  }
  return { success: "Jika email terdaftar, tautan reset telah dikirim (dev: lihat vendor/logs/mail-outbox.log)." };
}
