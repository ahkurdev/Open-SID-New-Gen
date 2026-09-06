import pg from "pg";

export const PG = {
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT_LOCAL || 54329),
  adminUser: "postgres",
  adminPass: "villageos",
  db: "village_os",
  appUser: "villageos_app",
  appPass: process.env.PG_APP_PASSWORD || "villageos_app_dev",
};

export function adminUrl(db = "postgres") {
  return `postgresql://${PG.adminUser}:${PG.adminPass}@${PG.host}:${PG.port}/${db}`;
}
export function appUrl() {
  return `postgresql://${PG.appUser}:${PG.appPass}@${PG.host}:${PG.port}/${PG.db}`;
}

export async function withAdmin(fn, db = "postgres") {
  const c = new pg.Client({ connectionString: adminUrl(db) });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
