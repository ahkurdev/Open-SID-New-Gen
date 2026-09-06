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
const wargaResident = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
run(`DELETE FROM aid_recipients WHERE village_id='${vid}' AND program_id IN (SELECT id FROM aid_programs WHERE village_id='${vid}' AND name LIKE '%Test Program%')`);
run(`DELETE FROM aid_programs WHERE village_id='${vid}' AND name LIKE '%Test Program%'`);
run(`UPDATE residents SET welfare_indicators = '{}'::jsonb WHERE village_id='${vid}' AND name='Budi Santoso'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("program bantuan dibuat dengan sumber dana + kuota", () => {
  const p = run(
    `INSERT INTO aid_programs (village_id, name, funding_source, period_start, quota)
     VALUES ('${vid}','Test Program Sembako 2026','kabupaten', CURRENT_DATE, 50)
     RETURNING id`
  );
  assert.equal(run(`SELECT funding_source FROM aid_programs WHERE id='${p}'`), "kabupaten");
  assert.equal(run(`SELECT quota FROM aid_programs WHERE id='${p}'`), "50");
});

test("kandidat -> verified -> accepted -> distributed", () => {
  const prog = run(`SELECT id FROM aid_programs WHERE village_id='${vid}' AND name='Test Program Sembako 2026'`);
  const r = run(
    `INSERT INTO aid_recipients (village_id, program_id, resident_id, applicant_name)
     VALUES ('${vid}','${prog}','${wargaResident}','Warga Demo Sinar Mulyo') RETURNING id`
  );
  assert.throws(() =>
    run(`INSERT INTO aid_recipients (village_id, program_id, resident_id, applicant_name) VALUES ('${vid}','${prog}','${wargaResident}','Dup')`)
  , null, "duplikat penerima ditolak UNIQUE");

  run(`UPDATE aid_recipients SET status='verified', verified_at=now() WHERE id='${r}'`);
  run(`UPDATE aid_recipients SET status='accepted' WHERE id='${r}'`);
  run(`UPDATE aid_recipients SET status='distributed', distribution_date=CURRENT_DATE WHERE id='${r}'`);
  assert.equal(run(`SELECT status FROM aid_recipients WHERE id='${r}'`), "distributed");
});

test("not_claimed: alasan tersimpan, data TIDAK dihapus", () => {
  const prog = run(`SELECT id FROM aid_programs WHERE village_id='${vid}' AND name='Test Program Sembako 2026'`);
  const r = run(
    `INSERT INTO aid_recipients (village_id, program_id, applicant_name, status)
     VALUES ('${vid}','${prog}','Warga Tidak Ambil','accepted') RETURNING id`
  );
  run(`UPDATE aid_recipients SET status='not_claimed', not_claimed_reason='pindah', not_claimed_note='Pindah ke luar desa' WHERE id='${r}'`);
  assert.equal(run(`SELECT status FROM aid_recipients WHERE id='${r}'`), "not_claimed");
  assert.equal(run(`SELECT not_claimed_reason FROM aid_recipients WHERE id='${r}'`), "pindah");
  assert.ok(run(`SELECT applicant_name FROM aid_recipients WHERE id='${r}'`), "data tetap ada");
});

test("welfare insight: skor + faktor explainable", () => {
  // warga dengan indikator yang BELUM jadi penerima program
  run(`UPDATE residents SET welfare_indicators = '{"elderly":1,"no_income":"true","single_parent":"true"}'::jsonb WHERE id=(SELECT id FROM residents WHERE village_id='${vid}' AND name='Budi Santoso')`);
  const prog = run(`SELECT id FROM aid_programs WHERE village_id='${vid}' AND name='Test Program Sembako 2026'`);
  const rows = run(`SELECT name, score, factors FROM app.welfare_insight_candidates('${vid}','${prog}', 10)`);
  assert.ok(rows.length > 0, "insight mengembalikan kandidat");
  const [name, score, factors] = rows.split("\n")[0].split("|");
  assert.ok(name.includes("Budi"), `kandidat benar: ${name}`);
  assert.equal(Number(score), 9, `skor = 1*2 + 4 + 3 = 9, dapat ${score}`);
  const f = JSON.parse(factors);
  assert.equal(f.disclaimer.includes("verifikasi"), true, "disclaimer ada di faktor");
  assert.ok(factors.includes("no_income"), "faktor transparan");
});

test("RLS: aid terisolasi per desa", () => {
  const fakeB = "00000000-0000-0000-0000-00000000000f";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM aid_programs WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 16 lulus");
