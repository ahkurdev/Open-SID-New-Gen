import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "./env";
import { withAuth, type AuthContext } from "./db";

const secret = new TextEncoder().encode(env.authSecret);

export type SessionClaims = {
  sub: string;
  village_id: string | null;
  is_platform_admin: boolean;
  sid: string;
  email: string;
  name: string;
};

export async function signSessionToken(claims: SessionClaims) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtlDays}d`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.sid !== "string") return null;
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(env.sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.sessionTtlDays * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(env.sessionCookie, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function readTokenFromRequest(req: NextRequest): string | null {
  return req.cookies.get(env.sessionCookie)?.value ?? null;
}

export async function getAuthContext(req: NextRequest): Promise<AuthContext | null> {
  const token = readTokenFromRequest(req);
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const rows = await withAuth(null, (q) =>
    q.query(
      `SELECT s.id, u.email, u.name, u.village_id, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND u.status = 'active' AND u.deleted_at IS NULL`,
      [claims.sid]
    )
  );
  const row = rows.rows[0];
  if (!row) return null;
  if (row.village_id && claims.village_id !== row.village_id) return null;

  return {
    userId: claims.sub,
    villageId: row.village_id,
    isPlatformAdmin: claims.is_platform_admin === true,
    email: row.email,
    name: row.name,
    sessionId: claims.sid,
  };
}
