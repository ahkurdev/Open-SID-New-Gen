import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, unlinkSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const psql = path.join(root, "vendor", "pgsql", "bin", "psql.exe");
const dump = path.join(root, "vendor", "pgsql", "bin", "pg_dump.exe");
const ADMIN = "postgresql://postgres:villageos@127.0.0.1:54329/village_os";

function run(sql, url = ADMIN) {
  return execFileSync(psql, ["-qAt", "-d", url, "-c", sql], { encoding: "utf8" }).trim();
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("backup pg_dump berhasil dibuat & terisi", () => {
  mkdirSync(path.join(root, "backups"), { recursive: true });
  const out = path.join(root, "backups", "test_phase25.dump");
  execFileSync(dump, ["-Fc", "-d", ADMIN, "-f", out], { encoding: "utf8" });
  const stat = statSync(out);
  assert.ok(stat.size > 10000, `dump size ${stat.size} > 10KB`);
  unlinkSync(out);
});

test("api key: hash-only storage + verify function", () => {
  const raw = "vos_test1234567890abcdef";
  const hash = run(`SELECT encode(sha256('${raw}'::bytea),'hex')`);
  run(`DELETE FROM api_keys WHERE name LIKE '%Test Key%'`);
  run(
    `INSERT INTO api_keys (village_id, name, key_hash, prefix, scopes)
     VALUES ((SELECT id FROM villages WHERE code='34.01.10.2004'),'Test Key Analytics','${hash}','vos_test123','{read}')`
  );
  const v = run(`SELECT COUNT(*) FROM app.verify_api_key('${raw}')`);
  assert.equal(v, "1");
  const v2 = run(`SELECT COUNT(*) FROM app.verify_api_key('vos_wrongkey')`);
  assert.equal(v2, "0");
  const stored = run(`SELECT key_hash FROM api_keys WHERE name='Test Key Analytics'`);
  assert.ok(!stored.includes(raw), "raw key tidak disimpan");
  run(`DELETE FROM api_keys WHERE name='Test Key Analytics'`);
});

test("open data v2: hanya dataset aman di whitelist", () => {
  const allowed = ["profile", "population", "letters", "complaints", "economy", "events"];
  const route = readFileSync(path.join(root, "src", "app", "api", "open-data", "v2", "route.ts"), "utf8");
  for (const d of allowed) assert.ok(route.includes(`"${d}"`), `dataset ${d} di whitelist`);
  assert.ok(!route.includes('"residents"'), "residents (individu) tidak di open data");
  assert.ok(!route.includes('"aid_recipients"'), "aid_recipients tidak di open data");
});

test("manifest PWA valid", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "public", "manifest.json"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length > 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 25 lulus");
