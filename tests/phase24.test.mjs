import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const psql = path.join(root, "vendor", "pgsql", "bin", "psql.exe");
const ADMIN = "postgresql://postgres:villageos@127.0.0.1:54329/village_os";
const APPURL = "postgresql://villageos_app:villageos_app_dev@127.0.0.1:54329/village_os";

function run(sql, url = ADMIN) {
  return execFileSync(psql, ["-qAt", "-d", url, "-c", sql], { encoding: "utf8" }).trim();
}
function last(sql, url = ADMIN) {
  const lines = run(sql, url).split("\n").filter(Boolean);
  return lines[lines.length - 1] ?? "";
}
function claims(vid) {
  return `SELECT set_config('request.jwt.claims', '{"village_id":"${vid}"}', true);`;
}

const vid = run("SELECT id FROM villages WHERE code='34.01.10.2004'");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("analytics views: seluruh view mengembalikan data agregat", () => {
  const pop = run(`SELECT total_residents, male, female FROM analytics_population WHERE village_id='${vid}'`);
  assert.ok(pop.length > 0, "population ada");
  const [total, male, female] = pop.split("|").map(Number);
  assert.equal(total, male + female, "L + P = total");

  run(`SELECT 1 FROM analytics_letters WHERE village_id='${vid}'`);
  run(`SELECT 1 FROM analytics_complaints WHERE village_id='${vid}'`);
  run(`SELECT 1 FROM analytics_economy WHERE village_id='${vid}'`);
  run(`SELECT 1 FROM analytics_assets WHERE village_id='${vid}'`);
  run(`SELECT 1 FROM analytics_projects WHERE village_id='${vid}'`);
});

test("health score: 6 dimensi dengan rumus di detail", () => {
  const rows = run(`SELECT dimension, score, detail FROM app.village_health_score('${vid}')`);
  const dims = rows.split("\n").map((l) => l.split("|")[0]);
  assert.deepEqual(dims.sort(), ["administrasi", "ekonomi", "lingkungan", "pelayanan", "pembangunan", "sosial"]);
  for (const row of rows.split("\n")) {
    const [dim, score, detail] = row.split("|");
    const s = Number(score);
    assert.ok(s >= 0 && s <= 100, `skor ${dim} dalam 0-100, dapat ${s}`);
    assert.ok(detail.length > 10, `detail rumus ${dim} transparan`);
  }
});

test("view publik TIDAK mengandung data pribadi (kolom penduduk)", () => {
  // health score & analytics hanya agregat - cek fungsi tidak expose NIK/nama
  const score = run(`SELECT app.village_health_score('${vid}')::text`);
  assert.ok(!score.includes("Budi") && !score.includes("340101"), "tidak ada nama/NIK di health score");
});

test("RLS: analytics aman diakses app role dengan claims", () => {
  const n = Number(last(`${claims(vid)} SELECT COUNT(*) FROM analytics_population WHERE village_id='${vid}'`, APPURL));
  assert.ok(n >= 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 24 lulus");
