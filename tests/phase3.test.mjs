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

const vid = run("SELECT id FROM villages WHERE code='34.01.10.2004'");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("profil desa: kolom vision/mission/history dapat diupdate", () => {
  run(`UPDATE villages SET vision='Desa maju dan sejahtera', mission='Pelayanan prima', area_km2=412.5 WHERE id='${vid}'`);
  assert.ok(run(`SELECT vision FROM villages WHERE id='${vid}'`).includes("maju"));
  assert.equal(run(`SELECT area_km2 FROM villages WHERE id='${vid}'`), "412.50");
});

test("officials: tambah perangkat + sejarah jabatan tercatat", () => {
  const kades = run(
    `INSERT INTO officials (village_id, name, type, position_title)
     VALUES ('${vid}','Budi Santoso','perangkat','Kepala Desa') RETURNING id`
  );
  run(`INSERT INTO official_terms (official_id, village_id, position_title, term_start, term_end)
       VALUES ('${kades}','${vid}','Kepala Desa','2016-01-01','2022-06-30')`);
  run(`INSERT INTO official_terms (official_id, village_id, position_title, term_start)
       VALUES ('${kades}','${vid}','Kepala Desa','2023-01-01')`);
  run(`INSERT INTO officials (village_id, name, type, position_title) VALUES ('${vid}','Siti Aminah','perangkat','Kaur Keuangan')`);

  const terms = Number(run(`SELECT COUNT(*) FROM official_terms WHERE official_id='${kades}'`));
  assert.equal(terms, 2, "sejarah jabatan harus 2 periode");

  const activeCount = Number(run(`SELECT COUNT(*) FROM officials WHERE village_id='${vid}' AND is_active=true`));
  assert.ok(activeCount >= 2);
});

test("RLS: officials terisolasi per desa", () => {
  const n = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${vid}"}', true);
    SELECT COUNT(*) FROM officials`, APPURL));
  assert.ok(n >= 2, `desa A melihat own officials, dapat ${n}`);

  const fakeB = "00000000-0000-0000-0000-000000000002";
  const nB = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${fakeB}"}', true);
    SELECT COUNT(*) FROM officials WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0, "desa B tidak boleh melihat officials desa A");
});

test("view public_officials menyembunyikan nip/phone", () => {
  const cols = run(`SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='public_officials'`);
  assert.ok(!cols.includes("nip"), "nip tidak boleh ada di view publik");
  assert.ok(!cols.includes("phone"), "phone tidak boleh ada di view publik");
  assert.ok(cols.includes("position_title"));
});

test("org chart data: hierarchy query", () => {
  const head = run(`SELECT COUNT(*) FROM officials WHERE village_id='${vid}' AND position_title ILIKE '%kepala desa%' AND is_active=true`);
  assert.ok(Number(head) >= 1, "harus ada kepala desa aktif");
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 3 lulus");
