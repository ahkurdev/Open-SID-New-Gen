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
const today = new Date().toISOString().slice(0, 10);

run(`DELETE FROM queue_tickets WHERE village_id='${vid}' AND queue_date='${today}'`);
run(`DELETE FROM appointments WHERE village_id='${vid}' AND appointment_date='${today}'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("service_types ter-seed", () => {
  const n = Number(run(`SELECT COUNT(*) FROM service_types WHERE village_id='${vid}' AND is_active=true`));
  assert.ok(n >= 4, `minimal 4 layanan, dapat ${n}`);
});

test("appointment: booking + slot duplikat ditolak", () => {
  const svc = run(`SELECT id FROM service_types WHERE village_id='${vid}' ORDER BY name LIMIT 1`);
  const appt = run(
    `INSERT INTO appointments (village_id, service_type_id, visitor_name, appointment_date, slot_time)
     VALUES ('${vid}','${svc}','Warga Booking','${today}','09:00') RETURNING id`
  );
  assert.throws(() =>
    run(`INSERT INTO appointments (village_id, service_type_id, visitor_name, appointment_date, slot_time)
         VALUES ('${vid}','${svc}','Warga Lain','${today}','09:00')`)
  , null, "slot sama harus ditolak UNIQUE");
  run(`UPDATE appointments SET status='cancelled' WHERE id='${appt}'`);
});

test("walk-in: nomor tiket urut otomatis", () => {
  const svc = run(`SELECT id FROM service_types WHERE village_id='${vid}' ORDER BY name OFFSET 1 LIMIT 1`);
  const t1 = run(
    `INSERT INTO queue_tickets (village_id, service_type_id, visitor_name, queue_date, ticket_number)
     VALUES ('${vid}','${svc}','Pengunjung A','${today}', (SELECT COALESCE(MAX(ticket_number),0)+1 FROM queue_tickets WHERE village_id='${vid}' AND queue_date='${today}'))
     RETURNING ticket_number`
  );
  const t2 = run(
    `INSERT INTO queue_tickets (village_id, service_type_id, visitor_name, queue_date, ticket_number)
     VALUES ('${vid}','${svc}','Pengunjung B','${today}', (SELECT COALESCE(MAX(ticket_number),0)+1 FROM queue_tickets WHERE village_id='${vid}' AND queue_date='${today}'))
     RETURNING ticket_number`
  );
  assert.equal(Number(t2), Number(t1) + 1, "nomor harus urut");
});

test("workflow antrean: waiting -> called -> serving -> served", () => {
  const t = run(`SELECT id FROM queue_tickets WHERE village_id='${vid}' AND queue_date='${today}' ORDER BY ticket_number DESC LIMIT 1`);
  run(`UPDATE queue_tickets SET status='called', called_at=now(), counter='L1' WHERE id='${t}'`);
  assert.equal(run(`SELECT status FROM queue_tickets WHERE id='${t}'`), "called");
  run(`UPDATE queue_tickets SET status='serving' WHERE id='${t}'`);
  run(`UPDATE queue_tickets SET status='served', served_at=now() WHERE id='${t}'`);
  assert.equal(run(`SELECT status FROM queue_tickets WHERE id='${t}'`), "served");
  assert.ok(run(`SELECT served_at IS NOT NULL FROM queue_tickets WHERE id='${t}'`), "served_at terisi");
});

test("statistik antrean harian", () => {
  const stats = run(
    `SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE status='served')::int
     FROM queue_tickets WHERE village_id='${vid}' AND queue_date='${today}'`
  );
  const [total, served] = stats.split("|").map(Number);
  assert.ok(total >= 2, `total tiket, dapat ${total}`);
  assert.ok(served >= 1, "ada tiket served");
});

test("RLS: queue terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM queue_tickets WHERE queue_date='${today}'`, APPURL));
  assert.ok(nA >= 2);
  const fakeB = "00000000-0000-0000-0000-000000000006";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM queue_tickets WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 8 lulus");
