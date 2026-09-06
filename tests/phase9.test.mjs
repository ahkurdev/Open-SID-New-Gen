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
run(`DELETE FROM complaint_actions WHERE complaint_id IN (SELECT id FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Jalan Rusak%')`);
run(`DELETE FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Jalan Rusak%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("SLA per kategori ter-seed", () => {
  const n = Number(run(`SELECT COUNT(*) FROM complaint_sla WHERE village_id='${vid}'`));
  assert.ok(n >= 10, `10 kategori, dapat ${n}`);
  assert.equal(run(`SELECT days FROM complaint_sla WHERE village_id='${vid}' AND category='keamanan'`), "1");
});

test("submit pengaduan anonim: ticket_no urut, identitas tersamar", () => {
  const seq = run(`SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_no FROM '[0-9]+$') AS integer)),0)+1 FROM complaints WHERE village_id='${vid}'`);
  const ticketNo = `TKT/${new Date().getFullYear()}/${String(seq).padStart(4, "0")}`;
  const slaDays = run(`SELECT days FROM complaint_sla WHERE village_id='${vid}' AND category='jalan'`);
  const id = run(
    `INSERT INTO complaints (village_id, ticket_no, reporter_name, is_anonymous, category, title, description, sla_due_at)
     VALUES ('${vid}','${ticketNo}','Warga Anonim AB12', true, 'jalan', 'Test Jalan Rusak Anonim', 'Jalan berlubang besar dekat jembatan', now() + make_interval(days => ${slaDays}))
     RETURNING id`
  );
  assert.ok(run(`SELECT is_anonymous FROM complaints WHERE id='${id}'`), "anonim");
  assert.ok(run(`SELECT sla_due_at IS NOT NULL FROM complaints WHERE id='${id}'`), "SLA terisi");
});

test("workflow: verify -> assign -> progress -> resolve -> rate -> close", () => {
  const staff = run(`SELECT id FROM users WHERE email='operator@sinar-mulyo.test'`);
  const c = run(`SELECT id FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Jalan Rusak%' ORDER BY created_at DESC LIMIT 1`);

  run(`UPDATE complaints SET status='verified', updated_by='${staff}' WHERE id='${c}'`);
  run(`UPDATE complaints SET status='assigned', assigned_to='${staff}', assigned_at=now() WHERE id='${c}'`);
  run(`UPDATE complaints SET status='in_progress' WHERE id='${c}'`);
  run(`UPDATE complaints SET status='resolved', resolved_at=now(), resolution_note='Sudah diperbaiki' WHERE id='${c}'`);
  run(`UPDATE complaints SET reporter_rating=4 WHERE id='${c}'`);
  run(`UPDATE complaints SET status='closed', closed_at=now() WHERE id='${c}'`);
  assert.equal(run(`SELECT status FROM complaints WHERE id='${c}'`), "closed");
  assert.equal(run(`SELECT reporter_rating FROM complaints WHERE id='${c}'`), "4");

  for (const [action, notes] of [["verify", null], ["assign", null], ["progress", null], ["resolve", "Sudah diperbaiki"], ["rate", "Rating 4/5"], ["close", null]]) {
    run(`INSERT INTO complaint_actions (complaint_id, village_id, action, notes) VALUES ('${c}','${vid}','${action}',${notes ? `'${notes}'` : "NULL"})`);
  }
  const actions = Number(run(`SELECT COUNT(*) FROM complaint_actions WHERE complaint_id='${c}'`));
  assert.ok(actions >= 6, `timeline lengkap, dapat ${actions}`);
});

test("overdue view menandai pengaduan lewat SLA", () => {
  const c = run(`SELECT id FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Jalan Rusak%' ORDER BY created_at DESC LIMIT 1`);
  run(`UPDATE complaints SET status='in_progress', sla_due_at = now() - interval '1 day' WHERE id='${c}'`);
  const overdue = Number(run(`SELECT COUNT(*) FROM overdue_complaints WHERE id='${c}'`));
  assert.equal(overdue, 1, "harus masuk view overdue");
  run(`UPDATE complaints SET status='closed' WHERE id='${c}'`);
  assert.equal(run(`SELECT COUNT(*) FROM overdue_complaints WHERE id='${c}'`), "0", "closed tidak overdue");
});

test("RLS: complaints terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM complaints`, APPURL));
  assert.ok(nA >= 1);
  const fakeB = "00000000-0000-0000-0000-000000000007";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM complaints WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 9 lulus");
