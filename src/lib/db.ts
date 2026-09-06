import pg from "pg";
import { env } from "./env";

const globalForPg = globalThis as unknown as { pgPool?: pg.Pool };

export const pool =
  globalForPg.pgPool ??
  new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<pg.QueryResult>;
};

export type AuthContext = {
  userId: string;
  villageId: string | null;
  isPlatformAdmin: boolean;
  email: string;
  name: string;
  sessionId: string;
};

const NO_CLAIMS = JSON.stringify({});

export async function withAuth<T>(
  ctx: AuthContext | null,
  fn: (q: Queryable) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claims = ctx
      ? JSON.stringify({
          sub: ctx.userId,
          village_id: ctx.villageId,
          is_platform_admin: ctx.isPlatformAdmin,
          sid: ctx.sessionId,
        })
      : NO_CLAIMS;
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [claims]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
