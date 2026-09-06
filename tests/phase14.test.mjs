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
const year = new Date().getFullYear();
const today = new Date().toISOString().slice(0, 10);
run(`DELETE FROM invoices WHERE village_id='${vid}' AND invoice_no LIKE 'INV/${year}%'`);
run(`DELETE FROM contracts WHERE village_id='${vid}' AND contract_no LIKE 'KTR/${year}%'`);
run(`DELETE FROM purchase_orders WHERE village_id='${vid}' AND po_no LIKE 'PO/${year}%' AND title LIKE '%Test%'`);
run(`DELETE FROM vendor_quotes WHERE village_id='${vid}'`);
run(`DELETE FROM procurement_requests WHERE village_id='${vid}' AND title LIKE '%Test%'`);
run(`DELETE FROM vendors WHERE village_id='${vid}' AND name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("vendor registry + duplikat nama ditolak", () => {
  const v = run(
    `INSERT INTO vendors (village_id, name, contact_person, phone, performance_score)
     VALUES ('${vid}','Test CV Maju Jaya','Budi','081234567890', 4.5) RETURNING id`
  );
  assert.throws(() =>
    run(`INSERT INTO vendors (village_id, name) VALUES ('${vid}','Test CV Maju Jaya')`)
  , null, "nama vendor harus UNIQUE per desa");
  assert.equal(run(`SELECT performance_score FROM vendors WHERE id='${v}'`), "4.5");
});

test("PO + nomor otomatis", () => {
  const v = run(`SELECT id FROM vendors WHERE village_id='${vid}' AND name='Test CV Maju Jaya'`);
  const seq = run(`SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM '[0-9]+$') AS integer)),0)+1 FROM purchase_orders WHERE village_id='${vid}'`);
  const poNo = `PO/${year}/${String(seq).padStart(4, "0")}`;
  const po = run(
    `INSERT INTO purchase_orders (village_id, po_no, vendor_id, title, amount, order_date)
     VALUES ('${vid}','${poNo}','${v}','Test Pengadaan Laptop Kantor', 15000000, '${today}') RETURNING id`
  );
  assert.equal(run(`SELECT po_no FROM purchase_orders WHERE id='${po}'`), poNo);
  assert.equal(run(`SELECT v_name FROM (SELECT v.name AS v_name FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id WHERE po.id='${po}') x`), "Test CV Maju Jaya");
});

test("kontrak + view expiring_contracts", () => {
  const v = run(`SELECT id FROM vendors WHERE village_id='${vid}' AND name='Test CV Maju Jaya'`);
  const soon = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
  const c = run(
    `INSERT INTO contracts (village_id, contract_no, vendor_id, title, amount, start_date, end_date)
     VALUES ('${vid}','KTR/${year}/TEST01','${v}','Test Kontrak Jasa Kebersihan', 60000000, '${today}', '${soon}')
     RETURNING id`
  );
  const expiring = Number(run(`SELECT COUNT(*) FROM expiring_contracts WHERE id='${c}'`));
  assert.equal(expiring, 1, "kontrak 15 hari lagi harus masuk expiring (<= 30 hari)");
});

test("invoice + status paid + overdue flag", () => {
  const po = run(`SELECT id FROM purchase_orders WHERE village_id='${vid}' AND title='Test Pengadaan Laptop Kantor'`);
  const pastDue = new Date(Date.now() - 5 * 86400_000).toISOString().slice(0, 10);
  const inv = run(
    `INSERT INTO invoices (village_id, invoice_no, purchase_order_id, amount, due_date)
     VALUES ('${vid}','INV/${year}/TEST01','${po}', 15000000, '${pastDue}')
     RETURNING id`
  );
  const overdue = run(
    `SELECT (i.status='unpaid' AND i.due_date < CURRENT_DATE) FROM invoices i WHERE i.id='${inv}'`
  );
  assert.equal(overdue, "t", "invoice lewat jatuh tempo = overdue");
  run(`UPDATE invoices SET status='paid', paid_at=now() WHERE id='${inv}'`);
  assert.equal(run(`SELECT status FROM invoices WHERE id='${inv}'`), "paid");
});

test("RLS: procurement terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM purchase_orders`, APPURL));
  assert.ok(nA >= 1);
  const fakeB = "00000000-0000-0000-0000-00000000000d";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM purchase_orders WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 14 lulus");
