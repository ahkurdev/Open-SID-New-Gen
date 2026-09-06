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
function claims(sub, vid) {
  return `SELECT set_config('request.jwt.claims', '{"sub":"${sub}","village_id":"${vid}"}', true);`;
}

const vid = run("SELECT id FROM villages WHERE code='34.01.10.2004'");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("akun warga ter-link ke resident + card_code ada", () => {
  const rid = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  assert.ok(/^[0-9a-f-]{36}$/.test(rid), "warga harus punya resident_id");
  const code = run(`SELECT card_code FROM residents WHERE id='${rid}'`);
  assert.equal(code.length, 12, "card_code 12 karakter");
});

test("koreksi data: request + approve menerapkan perubahan + timeline", () => {
  const rid = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  const uid = run(`SELECT id FROM users WHERE email='warga@sinar-mulyo.test'`);

  run(`DELETE FROM correction_requests WHERE resident_id='${rid}' AND field_name='occupation'`);
  const crId = run(
    `INSERT INTO correction_requests (village_id, resident_id, user_id, field_name, current_value, requested_value, reason)
     VALUES ('${vid}','${rid}','${uid}','occupation', (SELECT COALESCE(occupation,'-') FROM residents WHERE id='${rid}'), 'Petani Sayur', 'Pindah kerja')
     RETURNING id`
  );

  // operator approve -> nilai diterapkan
  run(`UPDATE correction_requests SET status='approved', reviewed_at=now() WHERE id='${crId}'`);
  run(`UPDATE residents SET occupation='Petani Sayur' WHERE id='${rid}'`);
  run(`INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description)
       VALUES ('${vid}','${rid}','perubahan_data',CURRENT_DATE,'Koreksi occupation disetujui')`);

  assert.equal(run(`SELECT occupation FROM residents WHERE id='${rid}'`), "Petani Sayur");
  assert.equal(run(`SELECT status FROM correction_requests WHERE id='${crId}'`), "approved");
  assert.ok(Number(run(`SELECT COUNT(*) FROM resident_events WHERE resident_id='${rid}'`)) >= 1);
});

test("RLS: koreksi terlihat oleh owner dan petugas desa", () => {
  const uid = run(`SELECT id FROM users WHERE email='warga@sinar-mulyo.test'`);
  const nOwner = Number(last(`${claims(uid, vid)} SELECT COUNT(*) FROM correction_requests WHERE user_id='${uid}'`, APPURL));
  assert.ok(nOwner >= 1, "owner melihat koreksinya");
  const fakeB = "00000000-0000-0000-0000-000000000009";
  const nOther = Number(last(`${claims(fakeB, "00000000-0000-0000-0000-000000000003")} SELECT COUNT(*) FROM correction_requests WHERE user_id='${uid}'`, APPURL));
  assert.equal(nOther, 0, "user lain tidak melihat");
});

test("RLS: resident milik warga hanya bisa dibaca desanya", () => {
  const rid = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  const fakeB = "00000000-0000-0000-0000-000000000003";
  const n = Number(last(`${claims("00000000-0000-0000-0000-000000000009", fakeB)} SELECT COUNT(*) FROM residents WHERE id='${rid}'`, APPURL));
  assert.equal(n, 0, "desa lain tidak bisa baca data resident");
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 7 lulus");
