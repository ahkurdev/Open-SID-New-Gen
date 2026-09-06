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
run(`DELETE FROM gis_incidents WHERE village_id='${vid}' AND description LIKE '%Test%'`);
run(`DELETE FROM gis_objects WHERE village_id='${vid}' AND name LIKE '%Test%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("objek GIS: titik, garis, poligon tersimpan sebagai GeoJSON", () => {
  const jalan = run(
    `INSERT INTO gis_objects (village_id, object_type, name, geometry, properties)
     VALUES ('${vid}','jalan','Test Jalan Mawar','{"type":"LineString","coordinates":[[110.328,-7.895],[110.329,-7.896]]}'::jsonb, '{"kondisi":"rusak","panjang_m":250}'::jsonb)
     RETURNING id`
  );
  const tps = run(
    `INSERT INTO gis_objects (village_id, object_type, name, geometry)
     VALUES ('${vid}','fasilitas','Test TPS Dusun 1','{"type":"Point","coordinates":[110.327,-7.894]}'::jsonb)
     RETURNING id`
  );
  assert.equal(run(`SELECT geometry->>'type' FROM gis_objects WHERE id='${jalan}'`), "LineString");
  assert.equal(run(`SELECT properties->>'panjang_m' FROM gis_objects WHERE id='${jalan}'`), "250");
  assert.equal(run(`SELECT geometry->>'type' FROM gis_objects WHERE id='${tps}'`), "Point");
});

test("insiden: workflow reported -> verify -> assign -> resolve -> post_report", () => {
  const i = run(
    `INSERT INTO gis_incidents (village_id, incident_type, severity, location, description, reported_by)
     VALUES ('${vid}','banjir','tinggi','{"type":"Point","coordinates":[110.328,-7.895]}'::jsonb,'Test banjir ringan Dusun 1', NULL)
     RETURNING id`
  );
  run(`UPDATE gis_incidents SET status='verified' WHERE id='${i}'`);
  run(`UPDATE gis_incidents SET status='assigned', assigned_to=(SELECT id FROM users WHERE email='operator@sinar-mulyo.test') WHERE id='${i}'`);
  run(`UPDATE gis_incidents SET status='responding' WHERE id='${i}'`);
  run(`UPDATE gis_incidents SET status='resolved', resolved_at=now() WHERE id='${i}'`);
  run(`UPDATE gis_incidents SET status='post_report', post_incident_note='Evaluasi: perlu drainase' WHERE id='${i}'`);
  assert.equal(run(`SELECT status FROM gis_incidents WHERE id='${i}'`), "post_report");
  assert.equal(run(`SELECT post_incident_note FROM gis_incidents WHERE id='${i}'`), "Evaluasi: perlu drainase");
});

test("GeoJSON FeatureCollection publik: features lengkap tanpa data pribadi", () => {
  const fc = run(`SELECT app.gis_features_public('${vid}')`);
  const parsed = JSON.parse(fc);
  assert.equal(parsed.type, "FeatureCollection");
  assert.ok(parsed.features.length >= 2);
  const jalan = parsed.features.find((f) => f.properties.name === "Test Jalan Mawar");
  assert.ok(jalan, "jalan ada di collection");
  assert.equal(jalan.geometry.type, "LineString");
  assert.equal(jalan.properties.props.kondisi, "rusak");
  // tidak ada kolom data pribadi di payload publik
  assert.ok(!("resident" in jalan.properties));
});

test("RLS: gis_objects dan gis_incidents terisolasi per desa", () => {
  const fakeB = "00000000-0000-0000-0000-000000000010";
  const nObj = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM gis_objects WHERE village_id='${vid}'`, APPURL));
  const nInc = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM gis_incidents WHERE village_id='${vid}'`, APPURL));
  assert.equal(nObj, 0);
  assert.equal(nInc, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 17 lulus");
