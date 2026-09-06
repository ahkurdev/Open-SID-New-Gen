import { cookies } from "next/headers";
import { env } from "./env";
import { verifySessionToken } from "./auth";
import { withAuth, type AuthContext } from "./db";

export async function getSession(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(env.sessionCookie)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const rows = await withAuth(null, (q) =>
    q.query(
      `SELECT u.email, u.name, u.village_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
         AND u.status = 'active' AND u.deleted_at IS NULL`,
      [claims.sid]
    )
  );
  const row = rows.rows[0];
  if (!row) return null;

  return {
    userId: claims.sub,
    villageId: row.village_id,
    isPlatformAdmin: claims.is_platform_admin === true,
    email: row.email,
    name: row.name,
    sessionId: claims.sid,
  };
}
