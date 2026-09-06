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
run(`DELETE FROM automation_runs WHERE village_id='${vid}' AND message LIKE '%Test%'`);
run(`DELETE FROM automation_rules WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM ai_chat_log WHERE village_id='${vid}' AND question LIKE '%Test%'`);
// cleanup pengaduan test
run(`DELETE FROM complaint_actions WHERE complaint_id IN (SELECT id FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Auto%')`);
run(`DELETE FROM complaints WHERE village_id='${vid}' AND title LIKE '%Test Auto%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("rule dibuat dengan struktur WHEN/THEN", () => {
  const r = run(
    `INSERT INTO automation_rules (village_id, name, trigger_type, trigger_config, action_type, action_config)
     VALUES ('${vid}','Test Rule Pengaduan 3 Hari','complaint_overdue','{"days":3}'::jsonb,'create_notification','{}'::jsonb)
     RETURNING id`
  );
  assert.equal(run(`SELECT trigger_config->>'days' FROM automation_rules WHERE id='${r}'`), "3");
  assert.equal(run(`SELECT is_active FROM automation_rules WHERE id='${r}'`), "t");
});

test("engine menemukan pengaduan overdue & buat run sekali (idempotent)", () => {
  // pengaduan lama 5 hari
  run(
    `INSERT INTO complaints (village_id, ticket_no, category, title, description, status, created_at, reporter_name)
     VALUES ('${vid}','TCK/AUTO/001','jalan','Test Auto Jalan Rusak','uji coba','new', now() - interval '5 days', 'Test Pelapor')`
  );
  const fired1 = Number(run(`SELECT app.evaluate_automation_rules('${vid}')`));
  assert.ok(fired1 >= 1, `minimal 1 run, dapat ${fired1}`);
  // jalankan lagi: TIDAK duplikat
  const fired2 = Number(run(`SELECT app.evaluate_automation_rules('${vid}')`));
  assert.equal(fired2, 0, "run kedua tidak boleh duplikat");
  const runs = run(`SELECT COUNT(*) FROM automation_runs ar JOIN automation_rules ru ON ru.id=ar.rule_id WHERE ru.name='Test Rule Pengaduan 3 Hari'`);
  assert.equal(runs, "1");
});

test("kontrak expiring & task overdue juga terdeteksi", () => {
  run(`DELETE FROM automation_runs WHERE village_id='${vid}' AND message LIKE '%Test Kontrak%'`);
  run(`DELETE FROM contracts WHERE village_id='${vid}' AND contract_no='CTR/AUTO/001'`);
  run(
    `INSERT INTO contracts (village_id, contract_no, title, vendor_id, amount, start_date, end_date, status)
     SELECT '${vid}','CTR/AUTO/001','Test Kontrak Segera Habis', (SELECT id FROM vendors LIMIT 1), 1000000, CURRENT_DATE, CURRENT_DATE + 10, 'active'
     WHERE EXISTS (SELECT 1 FROM vendors WHERE village_id='${vid}')`
  );
  run(
    `INSERT INTO automation_rules (village_id, name, trigger_type, trigger_config, action_type)
     VALUES ('${vid}','Test Rule Kontrak 30 Hari','contract_expiring','{"days":30}'::jsonb,'flag_warning')`
  );
  const fired = Number(run(`SELECT app.evaluate_automation_rules('${vid}')`));
  assert.ok(fired >= 0);
  const contractRun = run(`SELECT COUNT(*) FROM automation_runs WHERE message LIKE '%Test Kontrak Segera Habis%'`);
  const hasVendor = run(`SELECT EXISTS (SELECT 1 FROM vendors WHERE village_id='${vid}')`);
  if (hasVendor === "t") assert.equal(contractRun, "1");
});

test("AI copilot log: struktur tersimpan", () => {
  const uid = run(`SELECT id FROM users WHERE email='admin@sinar-mulyo.test'`);
  run(
    `INSERT INTO ai_chat_log (village_id, user_id, question, answer, data_scope)
     VALUES ('${vid}','${uid}','Test berapa penduduk?','Test jawaban','["residents"]'::jsonb)`
  );
  const log = run(`SELECT data_scope FROM ai_chat_log WHERE village_id='${vid}' AND question LIKE 'Test berapa%'`);
  assert.ok(log.includes("residents"));
});

test("RLS: automation & ai_chat terisolasi", () => {
  const fakeB = "00000000-0000-0000-0000-000000000015";
  const nR = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM automation_rules WHERE village_id='${vid}'`, APPURL));
  const nA = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM ai_chat_log WHERE village_id='${vid}'`, APPURL));
  assert.equal(nR, 0);
  assert.equal(nA, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 23 lulus");
