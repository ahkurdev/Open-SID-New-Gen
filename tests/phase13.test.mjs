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
const year = new Date().getFullYear();
run(`DELETE FROM finance_transactions WHERE village_id='${vid}' AND description LIKE '%Test%'`);
run(`DELETE FROM budget_plans WHERE village_id='${vid}' AND name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("budget plan: upsert pos anggaran", () => {
  const p = run(
    `INSERT INTO budget_plans (village_id, year, category, name, planned_amount)
     VALUES ('${vid}',${year},'belanja','Test Belanja ATK', 5000000)
     ON CONFLICT (village_id, year, category, name) DO UPDATE SET planned_amount = EXCLUDED.planned_amount
     RETURNING id`
  );
  assert.equal(run(`SELECT planned_amount FROM budget_plans WHERE id='${p}'`), "5000000.00");
});

test("transaksi + anomaly duplikat terdeteksi", () => {
  const p = run(`SELECT id FROM budget_plans WHERE village_id='${vid}' AND name='Test Belanja ATK'`);
  run(
    `INSERT INTO finance_transactions (village_id, budget_plan_id, trx_type, amount, trx_date, description, created_by)
     VALUES ('${vid}','${p}','pengeluaran', 150000, '${today}', 'Test Pembelian kertas', NULL)`
  );
  const flag = run(`SELECT app.detect_finance_anomaly('${vid}', 150000, '${today}', 'Test Pembelian kertas')`);
  assert.equal(flag, "duplikat", "transaksi sama dalam 30 hari harus ter-flag");
  run(
    `INSERT INTO finance_transactions (village_id, budget_plan_id, trx_type, amount, trx_date, description, anomaly_flag, created_by)
     VALUES ('${vid}','${p}','pengeluaran', 150000, '${today}', 'Test Pembelian kertas', 'duplikat', NULL)`
  );
  assert.equal(run(`SELECT COUNT(*) FROM finance_transactions WHERE village_id='${vid}' AND anomaly_flag='duplikat'`), "1");
});

test("anomaly lonjakan: amount > 5x rata-rata", () => {
  // isi 5 transaksi normal
  const svc = run(`SELECT id FROM budget_plans WHERE village_id='${vid}' AND name='Test Belanja ATK'`);
  for (let i = 0; i < 5; i++) {
    run(
      `INSERT INTO finance_transactions (village_id, budget_plan_id, trx_type, amount, trx_date, description, created_by)
       VALUES ('${vid}','${svc}','pengeluaran', 100000 + ${i}, '${today}', 'Test Normal trx ${i}', NULL)`
    );
  }
  const flag = run(`SELECT app.detect_finance_anomaly('${vid}', 5000000, '${today}', 'Test Pembelian besar')`);
  assert.equal(flag, "lonjakan", "harus ter-flag lonjakan");
});

test("realisasi per pos anggaran terhitung", () => {
  const realized = run(
    `SELECT COALESCE((SELECT SUM(CASE WHEN t.trx_type='pengeluaran' THEN -t.amount ELSE t.amount END)
       FROM finance_transactions t WHERE t.budget_plan_id = bp.id AND t.deleted_at IS NULL), 0)
     FROM budget_plans bp WHERE bp.village_id='${vid}' AND name='Test Belanja ATK'`
  );
  assert.ok(Number(realized) < 0, "pengeluaran mengurangi realisasi");
});

test("RLS: finance terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM finance_transactions`, APPURL));
  assert.ok(nA >= 6);
  const fakeB = "00000000-0000-0000-0000-00000000000c";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM finance_transactions WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 13 lulus");
