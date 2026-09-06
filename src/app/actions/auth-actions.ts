"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { withAuth } from "@/lib/db";
import { signSessionToken, setSessionCookie, clearSessionCookie, verifySessionToken } from "@/lib/auth";
import { env } from "@/lib/env";
import { loginSchema, resetPasswordSchema } from "@/lib/validation";

async function reqMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0].trim() || null,
    ua: h.get("user-agent"),
  };
}

export type ActionState = { error?: string; success?: string };

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const { email, password } = parsed.data;
  const meta = await reqMeta();

  let outcome: { error: string } | { token: string; villageId: string | null };
  try {
    outcome = await withAuth(null, async (q) => {
      const allowed = await q.query("SELECT app.rate_limit_hit($1,$2,$3) AS ok", [
        `login:${email.toLowerCase()}:${meta.ip ?? "unknown"}`, 10, 300,
      ]);
      if (!allowed.rows[0].ok) return { error: "Terlalu banyak percobaan login. Tunggu 5 menit." };

      const u = await q.query("SELECT * FROM app.get_user_for_login($1)", [email]);
      const user = u.rows[0];
      const genericError = "Email atau password salah";

      if (!user) {
        await q.query("SELECT app.register_login_attempt(NULL,$1,NULL,false,'user_not_found',$2,$3)", [email, meta.ip, meta.ua]);
        return { error: genericError };
      }
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        await q.query("SELECT app.register_login_attempt($1,$2,$3,false,'locked',$4,$5)", [user.id, user.email, user.village_id, meta.ip, meta.ua]);
        return { error: "Akun terkunci sementara. Coba lagi dalam beberapa menit." };
      }
      if (user.status !== "active") {
        await q.query("SELECT app.register_login_attempt($1,$2,$3,false,'inactive',$4,$5)", [user.id, user.email, user.village_id, meta.ip, meta.ua]);
        return { error: "Akun tidak aktif. Hubungi admin desa." };
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        await q.query("SELECT app.register_login_attempt($1,$2,$3,false,'bad_password',$4,$5)", [user.id, user.email, user.village_id, meta.ip, meta.ua]);
        return { error: genericError };
      }

      const tokenId = randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + env.sessionTtlDays * 86400_000);
      const token = await signSessionToken({
        sub: user.id, village_id: user.village_id, is_platform_admin: false,
        sid: tokenId, email: user.email, name: user.name,
      });
      await q.query("SELECT app.create_session($1,$2,$3,$4,$5,$6,$7)",
        [user.id, user.village_id, tokenId, "web", meta.ip, meta.ua, expiresAt.toISOString()]);

      // deteksi login mencurigakan: IP berbeda dari 5 login sukses terakhir
      const recent = await q.query(
        `SELECT ip::text AS ip FROM login_activities
         WHERE user_id = $1 AND success = true AND ip IS NOT NULL
         ORDER BY created_at DESC LIMIT 5`,
        [user.id]
      );
      const knownIps = new Set(recent.rows.map((r: { ip: string | null }) => r.ip));
      const isNewIp = meta.ip != null && !knownIps.has(meta.ip) && knownIps.size > 0;

      await q.query("SELECT app.register_login_attempt($1,$2,$3,true,NULL,$4,$5)", [user.id, user.email, user.village_id, meta.ip, meta.ua]);

      if (isNewIp) {
        await q.query(
          `INSERT INTO notifications (user_id, village_id, category, title, body)
           VALUES ($1,$2,'keamanan',$3,$4)`,
          [user.id, user.village_id, "Login dari perangkat baru",
           `Login berhasil dari IP ${meta.ip}. Jika bukan Anda, segera ganti password.`]
        );
      }
      return { token, villageId: user.village_id as string | null };
    });
  } catch (e) {
    console.error("[login]", e);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }

  if ("error" in outcome) return { error: outcome.error };
  await setSessionCookie(outcome.token);
  redirect(outcome.villageId ? "/admin" : "/onboarding");
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(env.sessionCookie)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) {
      await withAuth(null, (q) =>
        q.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'logout' WHERE token_id = $1`, [claims.sid])
      ).catch(() => {});
    }
  }
  await clearSessionCookie();
  redirect("/login");
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const hash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const result = await withAuth(null, async (q) => {
      const r = await q.query("SELECT app.consume_password_reset($1) AS user_id", [tokenHash]);
      const userId = r.rows[0]?.user_id;
      if (!userId) return { error: "Token tidak valid atau kedaluwarsa." };
      await q.query(
        `UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL, status = 'active' WHERE id = $1`,
        [userId, hash]
      );
      await q.query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_reset' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      return {};
    });
    if ("error" in result && result.error) return { error: result.error };
    return { success: "Password berhasil diubah. Silakan login." };
  } catch (e) {
    console.error("[reset-password]", e);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}
