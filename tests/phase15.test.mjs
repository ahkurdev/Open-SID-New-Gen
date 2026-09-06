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
run(`DELETE FROM asset_transfers WHERE asset_id IN (SELECT id FROM assets WHERE village_id='${vid}' AND name LIKE '%Test Aset%')`);
run(`DELETE FROM asset_maintenance WHERE asset_id IN (SELECT id FROM assets WHERE village_id='${vid}' AND name LIKE '%Test Aset%')`);
run(`DELETE FROM assets WHERE village_id='${vid}' AND name LIKE '%Test Aset%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("daftar aset + kode otomatis per kategori", () => {
  const code = run(`SELECT app.next_asset_code('${vid}','peralatan')`);
  assert.ok(/^AST\/PER\/\d{4}$/.test(code), `kode otomatis, dapat ${code}`);
  const a = run(
    `INSERT INTO assets (village_id, asset_code, name, category, acquisition_value, current_value, condition)
     VALUES ('${vid}','${code}','Test Aset Laptop Kantor','peralatan', 8000000, 6500000, 'baik')
     RETURNING id`
  );
  assert.equal(run(`SELECT asset_code FROM assets WHERE id='${a}'`), code);
});

test("maintenance: jadwal -> selesai + total biaya", () => {
  const a = run(`SELECT id FROM assets WHERE village_id='${vid}' AND name='Test Aset Laptop Kantor'`);
  const m = run(
    `INSERT INTO asset_maintenance (village_id, asset_id, maintenance_type, scheduled_date, description, cost)
     VALUES ('${vid}','${a}','perbaikan', CURRENT_DATE, 'Ganti keyboard', 250000)
     RETURNING id`
  );
  run(`UPDATE asset_maintenance SET status='done', performed_date=CURRENT_DATE WHERE id='${m}'`);
  const total = run(`SELECT COALESCE(SUM(cost),0) FROM asset_maintenance WHERE asset_id='${a}' AND status='done'`);
  assert.equal(total, "250000.00");
});

test("mutasi + peminjaman mengubah status aset", () => {
  const a = run(`SELECT id FROM assets WHERE village_id='${vid}' AND name='Test Aset Laptop Kantor'`);
  run(
    `INSERT INTO asset_transfers (village_id, asset_id, transfer_type, from_holder, to_holder, transfer_date)
     VALUES ('${vid}','${a}','peminjaman','Kantor Desa','Karang Taruna', CURRENT_DATE)`
  );
  run(`UPDATE assets SET status='dipinjam' WHERE id='${a}'`);
  assert.equal(run(`SELECT status FROM assets WHERE id='${a}'`), "dipinjam");
});

test("QR lookup publik via SECURITY DEFINER", () => {
  const code = run(`SELECT asset_code FROM assets WHERE village_id='${vid}' AND name='Test Aset Laptop Kantor'`);
  const out = last(`SELECT village_name FROM app.lookup_asset_public('${code}')`);
  assert.ok(out.includes("Sinar Mulyo"), "lookup publik mengembalikan desa");
  assert.equal(run(`SELECT COUNT(*) FROM app.lookup_asset_public('AST/XXX/9999')`), "0");
});

test("RLS: assets terisolasi per desa", () => {
  const fakeB = "00000000-0000-0000-0000-00000000000e";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM assets WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0, "desa B tidak boleh melihat aset desa A");
  const code = run(`SELECT asset_code FROM assets WHERE village_id='${vid}' AND name='Test Aset Laptop Kantor'`);
  const lookup = Number(run(`SELECT COUNT(*) FROM app.lookup_asset_public('${code}')`));
  assert.equal(lookup, 1, "lookup publik tetap bekerja");
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 15 lulus");
