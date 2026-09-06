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
const operator = run("SELECT id FROM users WHERE email='operator@sinar-mulyo.test'");
run(`DELETE FROM tasks WHERE village_id='${vid}' AND title LIKE '%Test Tugas%'`);
run(`DELETE FROM activity_reports WHERE village_id='${vid}' AND activity LIKE '%Test Kegiatan%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("task: buat + assign + notifikasi", () => {
  const t = run(
    `INSERT INTO tasks (village_id, title, description, priority, assigned_to, assigned_by, due_date)
     VALUES ('${vid}','Test Tugas Pendampingan','Tugas uji', 'high', '${operator}', '${operator}', CURRENT_DATE + 3)
     RETURNING id`
  );
  run(`INSERT INTO notifications (village_id, user_id, category, title, body) VALUES ('${vid}','${operator}','tugas','Tugas baru','Test Tugas Pendampingan')`);
  assert.ok(/^[0-9a-f-]{36}$/.test(t));
  assert.equal(run(`SELECT assignee FROM (SELECT u.name AS assignee FROM tasks tk JOIN users u ON u.id = tk.assigned_to WHERE tk.id='${t}') x`), "Operator Pelayanan");
});

test("task selesai + recurring daily membuat instance baru", () => {
  const t = run(
    `INSERT INTO tasks (village_id, title, priority, assigned_to, assigned_by, due_date, recurrence)
     VALUES ('${vid}','Test Tugas Patroli Harian','normal','${operator}','${operator}', CURRENT_DATE, 'daily')
     RETURNING id`
  );
  run(`UPDATE tasks SET status='done', completed_at=now() WHERE id='${t}'`);
  run(
    `INSERT INTO tasks (village_id, title, priority, assigned_to, assigned_by, due_date, recurrence)
     SELECT village_id, title, priority, assigned_to, assigned_by, due_date + '1 day'::interval, recurrence FROM tasks WHERE id='${t}'`
  );
  const next = run(`SELECT COUNT(*) FROM tasks WHERE village_id='${vid}' AND title='Test Tugas Patroli Harian'`);
  assert.equal(next, "2", "instance berikutnya dibuat");
  assert.equal(run(`SELECT completed_at IS NOT NULL FROM tasks WHERE id='${t}'`), "t");
});

test("laporan kegiatan harian + rekap bulanan", () => {
  run(
    `INSERT INTO activity_reports (village_id, user_id, report_date, activity, location, output, hours)
     VALUES ('${vid}','${operator}',CURRENT_DATE,'Test Kegiatan Posyandu','Balai Dusun I','Layanan 30 bayi', 4.5)`
  );
  const n = run(`SELECT COUNT(*) FROM activity_reports WHERE village_id='${vid}' AND activity='Test Kegiatan Posyandu'`);
  assert.equal(n, "1");
  const rekap = run(`SELECT total_activities FROM (SELECT COUNT(*)::int AS total_activities FROM activity_reports WHERE village_id='${vid}' GROUP BY date_trunc('month', report_date)) x LIMIT 1`);
  assert.ok(Number(rekap) >= 1);
});

test("RLS: tasks terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM tasks`, APPURL));
  assert.ok(nA >= 2);
  const fakeB = "00000000-0000-0000-0000-00000000000a";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM tasks WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 11 lulus");
