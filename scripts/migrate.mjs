import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { withAdmin, PG } from "./pg-common.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(root, "db", "migrations");

const exists = await withAdmin(async (c) => {
  const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [PG.db]);
  return r.rowCount > 0;
});
if (!exists) await withAdmin((c) => c.query(`CREATE DATABASE ${PG.db}`));

await withAdmin(async (c) => {
  await c.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name text PRIMARY KEY,
    hash text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
}, PG.db);

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  const sql = readFileSync(path.join(migrationsDir, f), "utf8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex").slice(0, 16);
  const applied = await withAdmin(async (c) => {
    const r = await c.query("SELECT hash FROM _migrations WHERE name = $1", [f]);
    return r.rows[0];
  }, PG.db);
  if (applied) {
    if (applied.hash !== hash) { console.error(`MIGRATION HASH MISMATCH: ${f} sudah diaplikasikan dengan isi berbeda. Buat migration baru.`); process.exit(1); }
    continue;
  }
  await withAdmin(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(sql);
      await c.query("INSERT INTO _migrations (name, hash) VALUES ($1, $2)", [f, hash]);
      await c.query("COMMIT");
      console.log("applied:", f);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }, PG.db);
}
console.log("migrate: done");
