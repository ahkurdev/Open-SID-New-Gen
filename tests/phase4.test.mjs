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

const vid = run("SELECT id FROM villages WHERE code='34.01.10.2004'");

// cleanup sisa run sebelumnya agar idempotent
run(`DELETE FROM resident_events WHERE resident_id IN (SELECT id FROM residents WHERE nik IN ('3401010101800001','3401019999010009'))`);
run(`UPDATE families SET head_resident_id = NULL WHERE village_id='${vid}' AND kk_number='3401012004010001'`);
run(`DELETE FROM residents WHERE nik IN ('3401010101800001','3401019999010009','3401010108050002')`);
run(`DELETE FROM families WHERE village_id='${vid}' AND kk_number='3401012004010001'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("keluarga + kepala keluarga terhubung", () => {
  const fam = run(
    `INSERT INTO families (village_id, kk_number, address, rt, rw)
     VALUES ('${vid}','3401012004010001','Jl. Melati No. 1','001','002') RETURNING id`
  );
  const head = run(
    `INSERT INTO residents (village_id, family_id, nik, name, gender, birth_date, family_status)
     VALUES ('${vid}','${fam}','3401010101800001','Budi Santoso','L','1980-01-01','kepala_keluarga') RETURNING id`
  );
  run(`UPDATE families SET head_resident_id='${head}' WHERE id='${fam}'`);
  run(`INSERT INTO residents (village_id, family_id, nik, name, gender, family_status)
       VALUES ('${vid}','${fam}','3401010108050002','Sari Wulandari','P','istri')`);

  assert.equal(run(`SELECT head_name FROM (SELECT f.id, (SELECT name FROM residents r WHERE r.id = f.head_resident_id) AS head_name FROM families f WHERE f.id='${fam}') t`), "Budi Santoso");
  assert.equal(run(`SELECT COUNT(*) FROM residents WHERE family_id='${fam}' AND deleted_at IS NULL`), "2");
});

test("NIK duplikat ditolak constraint", () => {
  assert.throws(() =>
    run(`INSERT INTO residents (village_id, nik, name, gender) VALUES ('${vid}','3401010101800001','Fake Budi','L')`)
  );
});

test("timeline event tercatat", () => {
  const r = run(`SELECT id FROM residents WHERE nik='3401010101800001'`);
  run(`INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description)
       VALUES ('${vid}','${r}','perubahan_kk','2024-05-01','Pindah RT 001 ke 003')`);
  assert.equal(run(`SELECT COUNT(*) FROM resident_events WHERE resident_id='${r}'`), "1");
});

test("status pindah/meninggal menyimpan previous_status", () => {
  const r = run(`SELECT id FROM residents WHERE nik='3401010101800001'`);
  run(`UPDATE residents SET previous_status=status, status='pindah', status_changed_at=now() WHERE id='${r}'`);
  assert.equal(last(`SELECT previous_status FROM residents WHERE id='${r}'`), "tetap");
  run(`UPDATE residents SET previous_status=null, status='tetap' WHERE id='${r}'`);
});

test("duplicate detection: view menandai NIK sama / nama serupa", () => {
  run(`INSERT INTO residents (village_id, nik, name, gender, birth_date)
       VALUES ('${vid}','3401019999010009','Budi Santoso','L','1980-01-01')`);
  const dup = Number(run(`SELECT COUNT(*) FROM potential_duplicate_residents WHERE village_id='${vid}'`));
  assert.ok(dup >= 1, `harus mendeteksi duplikat NIK sama, dapat ${dup}`);
  run(`DELETE FROM residents WHERE nik='3401019999010009'`);
});

test("RLS: residents terisolasi per desa", () => {
  const nA = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${vid}"}', true);
    SELECT COUNT(*) FROM residents WHERE deleted_at IS NULL`, APPURL));
  assert.ok(nA >= 2, `desa A minimal 2 penduduk, dapat ${nA}`);
  const fakeB = "00000000-0000-0000-0000-000000000003";
  const nB = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${fakeB}"}', true);
    SELECT COUNT(*) FROM residents WHERE village_id='${vid}' AND deleted_at IS NULL`, APPURL));
  assert.equal(nB, 0, "desa B tidak boleh melihat penduduk desa A");
});

test("trigram index aktif untuk pencarian nama", () => {
  const idx = run(`SELECT COUNT(*) FROM pg_indexes WHERE tablename='residents' AND indexdef ILIKE '%gin%trgm%'`);
  assert.ok(Number(idx) >= 1);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 4 lulus");
