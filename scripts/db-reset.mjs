import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { PG, adminUrl } from "./pg-common.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, "vendor", "pgsql", "bin");

// terminate koneksi lalu drop-recreate database
const c = await import("pg").then(({ default: pg }) => {
  const client = new pg.Client({ connectionString: adminUrl("postgres") });
  return client.connect().then(() => client);
});
await c.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [PG.db]
);
await c.query(`DROP DATABASE IF EXISTS ${PG.db}`);
await c.end();

execFileSync(path.join(bin, "psql.exe"), ["-d", adminUrl("postgres"), "-c", `SELECT 1`], { stdio: "ignore" });
console.log("db-reset: database dropped");
