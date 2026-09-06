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
run(`DELETE FROM emergency_reports WHERE village_id='${vid}' AND (description LIKE '%Test%' OR reporter_name LIKE '%Test%')`);
run(`DELETE FROM emergency_resources WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM waste_schedules WHERE village_id='${vid}' AND crew LIKE '%Test%'`);
run(`DELETE FROM waste_points WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM environment_assets WHERE village_id='${vid}' AND name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("laporan darurat: anonim menyembunyikan pelapor", () => {
  const r1 = run(
    `INSERT INTO emergency_reports (village_id, category, severity, location, description, reporter_name, is_anonymous)
     VALUES ('${vid}','banjir','tinggi','{"type":"Point","coordinates":[110.328,-7.895]}'::jsonb,'Test banjir Dusun 1','Test Pak Budi', false) RETURNING id`
  );
  const r2 = run(
    `INSERT INTO emergency_reports (village_id, category, severity, location, description, is_anonymous)
     VALUES ('${vid}','kebakaran','darurat','{"type":"Point","coordinates":[110.329,-7.896]}'::jsonb,'Test kebakaran lahan', true) RETURNING id`
  );
  assert.equal(run(`SELECT reporter_name FROM emergency_reports WHERE id='${r1}'`), "Test Pak Budi");
  assert.equal(run(`SELECT reporter_name FROM emergency_reports WHERE id='${r2}'`), "");
  assert.equal(run(`SELECT is_anonymous FROM emergency_reports WHERE id='${r2}'`), "t");
});

test("workflow darurat: reported -> verify -> team -> evacuate -> resolve -> close", () => {
  const r = run(
    `INSERT INTO emergency_reports (village_id, category, severity, location, description)
     VALUES ('${vid}','longsor','tinggi','{"type":"Point","coordinates":[110.33,-7.9]}'::jsonb,'Test longsor titik') RETURNING id`
  );
  run(`UPDATE emergency_reports SET status='verified' WHERE id='${r}'`);
  run(`UPDATE emergency_reports SET status='team_assigned', team_note='Tim linmas siap' WHERE id='${r}'`);
  run(`UPDATE emergency_reports SET status='evacuating' WHERE id='${r}'`);
  run(`UPDATE emergency_reports SET status='resolved', resolved_at=now() WHERE id='${r}'`);
  run(`UPDATE emergency_reports SET status='closed' WHERE id='${r}'`);
  assert.equal(run(`SELECT status FROM emergency_reports WHERE id='${r}'`), "closed");
});

test("sumber daya darurat + titik sampah + jadwal", () => {
  run(
    `INSERT INTO emergency_resources (village_id, resource_type, name, capacity)
     VALUES ('${vid}','pengungsian','Test Balai Dusun 1', 150)`
  );
  const w = run(
    `INSERT INTO waste_points (village_id, point_type, name, capacity_kg)
     VALUES ('${vid}','tps','Test TPS Pasar', 500) RETURNING id`
  );
  run(
    `INSERT INTO waste_schedules (village_id, waste_point_id, day_of_week, time_text, crew)
     VALUES ('${vid}','${w}', 1, '07:00', 'Test Petugas Sampah')`
  );
  const schedCount = run(`SELECT COUNT(*) FROM waste_schedules WHERE waste_point_id='${w}'`);
  assert.equal(schedCount, "1");
});

test("aset lingkungan dengan kondisi", () => {
  run(
    `INSERT INTO environment_assets (village_id, asset_type, name, planted_count, condition)
     VALUES ('${vid}','penghijauan','Test Bantunan Jalan Mawar', 45, 'baik')`
  );
  const cond = run(`SELECT condition FROM environment_assets WHERE village_id='${vid}' AND name='Test Bantunan Jalan Mawar'`);
  assert.equal(cond, "baik");
});

test("RLS: tabel darurat & lingkungan terisolasi", () => {
  const fakeB = "00000000-0000-0000-0000-000000000013";
  const nR = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM emergency_reports WHERE village_id='${vid}'`, APPURL));
  const nW = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM waste_points WHERE village_id='${vid}'`, APPURL));
  const nE = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM environment_assets WHERE village_id='${vid}'`, APPURL));
  assert.equal(nR, 0);
  assert.equal(nW, 0);
  assert.equal(nE, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 21 lulus");
