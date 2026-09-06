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
run(`DELETE FROM facility_bookings WHERE village_id='${vid}' AND booked_by_name LIKE '%Test%'`);
run(`DELETE FROM facilities WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM event_registrations WHERE village_id='${vid}' AND participant_name LIKE '%Test%'`);
run(`DELETE FROM community_events WHERE village_id='${vid}' AND title LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("kegiatan komunitas + pendaftaran + relawan", () => {
  const e = run(
    `INSERT INTO community_events (village_id, title, category, start_time, needs_volunteers, volunteer_target)
     VALUES ('${vid}','Test Gotong Royong Dusun 1','gotong_royong', now() + interval '3 days', true, 20) RETURNING id`
  );
  const wargaResident = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  run(
    `INSERT INTO event_registrations (village_id, event_id, resident_id, participant_name, is_volunteer)
     VALUES ('${vid}','${e}','${wargaResident}','Warga Demo Sinar Mulyo', true)`
  );
  assert.throws(() =>
    run(`INSERT INTO event_registrations (village_id, event_id, resident_id, participant_name) VALUES ('${vid}','${e}','${wargaResident}','Dup')`)
  , null, "duplikat pendaftar ditolak");
  const vc = run(`SELECT COUNT(*) FROM event_registrations WHERE event_id='${e}' AND is_volunteer=true`);
  assert.equal(vc, "1");
});

test("fasilitas + booking: double booking DITOLAK database", () => {
  const f = run(
    `INSERT INTO facilities (village_id, name, facility_type, capacity)
     VALUES ('${vid}','Test Balai Desa','balai_desa', 100) RETURNING id`
  );
  const s = "2026-10-01 08:00+07";
  const e2 = "2026-10-01 12:00+07";
  run(
    `INSERT INTO facility_bookings (village_id, facility_id, booked_by_name, start_time, end_time, status)
     VALUES ('${vid}','${f}','Test Penyewa 1','${s}','${e2}','approved')`
  );
  // overlap ditolak constraint EXCLUDE
  assert.throws(() =>
    run(`INSERT INTO facility_bookings (village_id, facility_id, booked_by_name, start_time, end_time, status) VALUES ('${vid}','${f}','Test Penyewa 2','2026-10-01 10:00+07','2026-10-01 14:00+07','pending')`)
  , null, "double booking harus ditolak");
  // booking setelahnya OK (tidak overlap)
  run(
    `INSERT INTO facility_bookings (village_id, facility_id, booked_by_name, start_time, end_time, status)
     VALUES ('${vid}','${f}','Test Penyewa 3','2026-10-01 13:00+07','2026-10-01 15:00+07','pending')`
  );
  const count = run(`SELECT COUNT(*) FROM facility_bookings WHERE facility_id='${f}'`);
  assert.equal(count, "2");
});

test("kalender publik: hanya kegiatan mendatang & is_public", () => {
  const ev = JSON.parse(run(`SELECT app.upcoming_events_public('${vid}', 10)`));
  const found = ev.find((x) => x.title === "Test Gotong Royong Dusun 1");
  assert.ok(found, "kegiatan mendatang tampil");
  assert.ok(found.volunteerCount >= 1);
  // kegiatan lampau tidak tampil
  run(
    `INSERT INTO community_events (village_id, title, category, start_time, is_public)
     VALUES ('${vid}','Test Kegiatan Lampau','umum', now() - interval '30 days', true)`
  );
  const ev2 = JSON.parse(run(`SELECT app.upcoming_events_public('${vid}', 50)`));
  assert.ok(!ev2.find((x) => x.title === "Test Kegiatan Lampau"), "kegiatan lampau disembunyikan");
});

test("RLS: tabel komunitas terisolasi", () => {
  const fakeB = "00000000-0000-0000-0000-000000000014";
  const nE = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM community_events WHERE village_id='${vid}'`, APPURL));
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM facility_bookings WHERE village_id='${vid}'`, APPURL));
  assert.equal(nE, 0);
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 22 lulus");
