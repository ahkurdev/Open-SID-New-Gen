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
run(`DELETE FROM scholarship_applications WHERE village_id='${vid}' AND applicant_name LIKE '%Test%'`);
run(`DELETE FROM scholarships WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM schools WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM health_visits WHERE village_id='${vid}' AND notes LIKE '%Test%'`);
run(`DELETE FROM health_programs WHERE village_id='${vid}' AND name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("program kesehatan + kunjungan (tanpa diagnosis)", () => {
  const p = run(
    `INSERT INTO health_programs (village_id, name, program_type, schedule_text)
     VALUES ('${vid}','Test Posyandu Melati','posyandu','Tanggal 10 bulanan') RETURNING id`
  );
  const v = run(
    `INSERT INTO health_visits (village_id, program_id, visit_date, participant_count, notes)
     VALUES ('${vid}','${p}', CURRENT_DATE, 35, 'Test kegiatan rutin berjalan lancar') RETURNING id`
  );
  assert.equal(run(`SELECT participant_count FROM health_visits WHERE id='${v}'`), "35");
  // kolom diagnosis TIDAK ADA - privacy by design
  const cols = run(`SELECT column_name FROM information_schema.columns WHERE table_name='health_visits'`);
  assert.ok(!cols.includes("diagnosis"), "tidak ada kolom diagnosis");
  assert.ok(!cols.includes("medical_record"), "tidak ada kolom rekam medis");
});

test("sekolah + beasiswa + workflow pendaftar", () => {
  const sc = run(
    `INSERT INTO schools (village_id, name, level, student_count, teacher_count)
     VALUES ('${vid}','Test SD Negeri 1','sd', 120, 8) RETURNING id`
  );
  const so = run(
    `INSERT INTO scholarships (village_id, name, provider, quota, period_year)
     VALUES ('${vid}','Test Beasiswa Prestasi','Dinas Pendidikan', 10, 2026) RETURNING id`
  );
  const wargaResident = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  const app = run(
    `INSERT INTO scholarship_applications (village_id, scholarship_id, resident_id, applicant_name, school_id)
     VALUES ('${vid}','${so}','${wargaResident}','Warga Demo Sinar Mulyo','${sc}') RETURNING id`
  );
  assert.throws(() =>
    run(`INSERT INTO scholarship_applications (village_id, scholarship_id, resident_id, applicant_name) VALUES ('${vid}','${so}','${wargaResident}','Dup')`)
  , null, "duplikat pendaftar ditolak");
  run(`UPDATE scholarship_applications SET status='verified' WHERE id='${app}'`);
  run(`UPDATE scholarship_applications SET status='accepted' WHERE id='${app}'`);
  run(`UPDATE scholarship_applications SET status='awarded', awarded_at=now() WHERE id='${app}'`);
  assert.equal(run(`SELECT status FROM scholarship_applications WHERE id='${app}'`), "awarded");
});

test("scholarship candidates: explainable + disclaimer", () => {
  run(`UPDATE residents SET welfare_indicators = '{"out_of_school_risk":"true","no_income":"true","school_age_children":2}'::jsonb WHERE village_id='${vid}' AND name='Sari Wulandari'`);
  const so = run(`SELECT id FROM scholarships WHERE village_id='${vid}' AND name='Test Beasiswa Prestasi'`);
  const rows = run(`SELECT name, score, factors FROM app.scholarship_candidates('${vid}','${so}', 15)`);
  assert.ok(rows.length > 0, "ada kandidat");
  const [name, score, factors] = rows.split("\n")[0].split("|");
  assert.ok(name.includes("Sari"), `kandidat: ${name}`);
  assert.equal(Number(score), 9, `skor 4+3+2*1=9, dapat ${score}`);
  const f = JSON.parse(factors);
  assert.ok(f.disclaimer.includes("verifikasi"), "disclaimer ada");
  run(`UPDATE residents SET welfare_indicators = '{}'::jsonb WHERE village_id='${vid}' AND name='Sari Wulandari'`);
});

test("RLS: tabel kesehatan & pendidikan terisolasi per desa", () => {
  const fakeB = "00000000-0000-0000-0000-000000000012";
  const nP = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM health_programs WHERE village_id='${vid}'`, APPURL));
  const nS = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM scholarship_applications WHERE village_id='${vid}'`, APPURL));
  assert.equal(nP, 0);
  assert.equal(nS, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 20 lulus");
