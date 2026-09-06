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
const vidB = run("SELECT id FROM villages WHERE code='34.01.10.2005'");
run(`DELETE FROM product_orders WHERE village_id='${vid}' AND buyer_name LIKE '%Test%'`);
run(`DELETE FROM umkm_products WHERE village_id='${vid}' AND name LIKE '%Test%'`);
run(`DELETE FROM umkm WHERE village_id='${vid}' AND business_name LIKE '%Test%'`);
run(`DELETE FROM bumdes_units WHERE village_id='${vid}' AND unit_name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("UMKM + produk + katalog publik", () => {
  const u = run(
    `INSERT INTO umkm (village_id, owner_name, business_name, category, contact_phone, is_public, is_featured)
     VALUES ('${vid}','Test Bu Sari','Test Warung Sari','kuliner','0812345678', true, true) RETURNING id`
  );
  const p = run(
    `INSERT INTO umkm_products (village_id, umkm_id, name, price, unit, stock, is_featured)
     VALUES ('${vid}','${u}','Test Keripik Singkong', 15000, 'bungkus', 100, true) RETURNING id`
  );
  const catalog = run(`SELECT app.umkm_catalog_public('${vid}')`);
  const parsed = JSON.parse(catalog);
  const found = parsed.find((x) => x.businessName === "Test Warung Sari");
  assert.ok(found, "UMKM tampil di katalog publik");
  assert.equal(found.products[0].name, "Test Keripik Singkong");
  assert.ok(!("ownerName" in found), "data pribadi owner tidak diekspos");
  // UMKM non-publik tidak tampil
  run(`UPDATE umkm SET is_public = false WHERE id='${u}'`);
  const catalog2raw = run(`SELECT COALESCE(app.umkm_catalog_public('${vid}')::text, '[]')`);
  const catalog2 = JSON.parse(catalog2raw);
  assert.ok(!catalog2.find((x) => x.businessName === "Test Warung Sari"), "non-publik tersembunyi");
  run(`UPDATE umkm SET is_public = true WHERE id='${u}'`);
  void p;
});

test("order request: dari katalog publik tanpa auth economy", () => {
  const p = run(`SELECT id FROM umkm_products WHERE name='Test Keripik Singkong'`);
  const o = run(
    `INSERT INTO product_orders (village_id, product_id, buyer_name, buyer_phone, quantity)
     VALUES ('${vid}','${p}','Test Pembeli Waarga','081298765432', 3) RETURNING id`
  );
  assert.equal(run(`SELECT status FROM product_orders WHERE id='${o}'`), "requested");
  run(`UPDATE product_orders SET status='contacted' WHERE id='${o}'`);
  run(`UPDATE product_orders SET status='completed' WHERE id='${o}'`);
  assert.equal(run(`SELECT status FROM product_orders WHERE id='${o}'`), "completed");
});

test("BUMDes unit: profit dihitung, UNIQUE per unit+tahun", () => {
  run(
    `INSERT INTO bumdes_units (village_id, unit_name, business_type, capital, revenue, expense, period_year)
     VALUES ('${vid}','Test Unit Air Minum','AMDK', 50000000, 20000000, 8000000, 2026)`
  );
  const profit = run(`SELECT (revenue - expense) FROM bumdes_units WHERE village_id='${vid}' AND unit_name='Test Unit Air Minum' AND period_year=2026`);
  assert.equal(profit, "12000000.00");
  assert.throws(() =>
    run(`INSERT INTO bumdes_units (village_id, unit_name, business_type, period_year) VALUES ('${vid}','Test Unit Air Minum','dup',2026)`)
  , null, "duplikat unit+tahun ditolak");
});

test("job + skill publik + training", () => {
  const wargaResident = run(`SELECT resident_id FROM users WHERE email='warga@sinar-mulyo.test'`);
  run(
    `INSERT INTO job_listings (village_id, title, employer, salary_info, is_open)
     VALUES ('${vid}','Test Kasir Warung','Test Warung Sari','UMR desa', true)`
  );
  run(
    `INSERT INTO resident_skills (village_id, resident_id, skill_name, proficiency, is_public_profile)
     VALUES ('${vid}','${wargaResident}','Menjahit','mahir', true)
     ON CONFLICT (resident_id, skill_name) DO UPDATE SET is_public_profile = true`
  );
  run(
    `INSERT INTO trainings (village_id, title, organizer, quota)
     VALUES ('${vid}','Test Pelatihan Menjahit','Dinas Koperasi', 20)`
  );
  const skillCount = run(`SELECT COUNT(*) FROM resident_skills WHERE village_id='${vid}' AND is_public_profile = true`);
  assert.ok(Number(skillCount) >= 1);
});

test("RLS: seluruh tabel ekonomi terisolasi per desa", () => {
  const fakeB = vidB;
  const nUmkm = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM umkm WHERE village_id='${vid}'`, APPURL));
  const nBumdes = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM bumdes_units WHERE village_id='${vid}'`, APPURL));
  const nJobs = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM job_listings WHERE village_id='${vid}'`, APPURL));
  assert.equal(nUmkm, 0);
  assert.equal(nBumdes, 0);
  assert.equal(nJobs, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 19 lulus");
