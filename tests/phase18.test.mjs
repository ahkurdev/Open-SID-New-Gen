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
run(`DELETE FROM farm_harvests WHERE village_id='${vid}' AND farm_id IN (SELECT id FROM farms WHERE village_id='${vid}' AND owner_name LIKE '%Test%')`);
run(`DELETE FROM farms WHERE village_id='${vid}' AND owner_name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("unit usaha 3 sektor dengan field sesuai sektor", () => {
  const sawah = run(
    `INSERT INTO farms (village_id, sector, owner_name, commodity_name, land_area_m2, planting_season)
     VALUES ('${vid}','pertanian','Test Pak Slamet','Padi', 2500, 'MH 2026/1') RETURNING id`
  );
  const kandang = run(
    `INSERT INTO farms (village_id, sector, owner_name, livestock_type, livestock_count)
     VALUES ('${vid}','peternakan','Test Pak Budi','Sapi', 12) RETURNING id`
  );
  const kolam = run(
    `INSERT INTO farms (village_id, sector, owner_name, fish_type, pond_count, production_kg)
     VALUES ('${vid}','perikanan','Test Pak Joko','Nila', 5, 320) RETURNING id`
  );
  assert.equal(run(`SELECT commodity_name FROM farms WHERE id='${sawah}'`), "Padi");
  assert.equal(run(`SELECT livestock_count FROM farms WHERE id='${kandang}'`), "12");
  assert.equal(run(`SELECT pond_count FROM farms WHERE id='${kolam}'`), "5");
});

test("catat panen: riwayat + update last_harvest di farm", () => {
  const farm = run(`SELECT id FROM farms WHERE village_id='${vid}' AND owner_name='Test Pak Slamet'`);
  run(
    `INSERT INTO farm_harvests (village_id, farm_id, harvest_date, commodity, quantity_kg)
     VALUES ('${vid}','${farm}', CURRENT_DATE, 'Padi', 1500)`
  );
  run(
    `UPDATE farms SET last_harvest_date = CURRENT_DATE, last_harvest_kg = 1500 WHERE id='${farm}'`
  );
  assert.equal(run(`SELECT last_harvest_kg FROM farms WHERE id='${farm}'`), "1500.00");
  assert.equal(run(`SELECT COUNT(*) FROM farm_harvests WHERE farm_id='${farm}'`), "1");
  // panen kedua
  run(
    `INSERT INTO farm_harvests (village_id, farm_id, harvest_date, commodity, quantity_kg)
     VALUES ('${vid}','${farm}', CURRENT_DATE, 'Padi', 1800)`
  );
  run(`UPDATE farms SET last_harvest_kg = 1800 WHERE id='${farm}'`);
  assert.equal(run(`SELECT COUNT(*) FROM farm_harvests WHERE farm_id='${farm}'`), "2");
  assert.equal(run(`SELECT last_harvest_kg FROM farms WHERE id='${farm}'`), "1800.00");
});

test("food security summary: agregat per sektor", () => {
  const rows = run(`SELECT sector, unit_count, total_livestock FROM food_security_summary WHERE village_id='${vid}'`);
  const map = Object.fromEntries(rows.split("\n").map((l) => l.split("|")));
  assert.ok(Number(map["pertanian"]) >= 1);
  assert.ok(Number(map["peternakan"]) >= 1);
  assert.ok(Number(map["perikanan"]) >= 1);
});

test("RLS: farms dan farm_harvests terisolasi per desa", () => {
  const fakeB = "00000000-0000-0000-0000-000000000011";
  const nF = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM farms WHERE village_id='${vid}'`, APPURL));
  const nH = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM farm_harvests WHERE village_id='${vid}'`, APPURL));
  assert.equal(nF, 0);
  assert.equal(nH, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 18 lulus");
