import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
const STORAGE = path.join(root, "vendor", "storage", "documents", vid, "test-doc-1");

run(`DELETE FROM documents WHERE village_id='${vid}' AND title='SK Test Acara'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("upload dokumen + nomor otomatis + file tersimpan", () => {
  mkdirSync(STORAGE, { recursive: true });
  const filePath = path.join(STORAGE, "v1_sk-test.pdf");
  writeFileSync(filePath, "%PDF-1.4 test content");

  const docNumber = run(`SELECT app.next_doc_number('${vid}','sk',CURRENT_DATE)`);
  assert.ok(/^SK\/\d{4}\/\d{4}$/.test(docNumber), `nomor otomatis, dapat ${docNumber}`);
  const docId = run(
    `INSERT INTO documents (village_id, title, doc_type, doc_number, file_path, file_name, file_size, mime_type, verification_code, issued_at)
     VALUES ('${vid}','SK Test Acara','sk','${docNumber}','vendor/storage/documents/${vid}/test-doc-1/v1_sk-test.pdf',
             'sk-test.pdf', 26, 'application/pdf', substr(md5(random()::text),1,12), CURRENT_DATE)
     RETURNING id`
  );
  assert.equal(run(`SELECT doc_number FROM documents WHERE id='${docId}'`), docNumber);
});

test("verifikasi QR via SECURITY DEFINER (tanpa claims)", () => {
  const code = run(`SELECT verification_code FROM documents WHERE village_id='${vid}' AND title='SK Test Acara'`);
  const out = last(`SELECT village_name FROM app.verify_document('${code}')`);
  assert.ok(out.includes("Sinar Mulyo"), "verifikasi mengembalikan nama desa");
  const invalid = run(`SELECT COUNT(*) FROM app.verify_document('kode-palsu-000')`);
  assert.equal(invalid, "0");
});

test("versi dokumen: v1 + v2 tercatat di document_versions", () => {
  const docId = run(`SELECT id FROM documents WHERE village_id='${vid}' AND title='SK Test Acara'`);
  run(`DELETE FROM document_versions WHERE document_id='${docId}' AND version >= 2`);
  const v2path = path.join(STORAGE, "v2_sk-test.pdf");
  writeFileSync(v2path, "%PDF-1.4 revised content");
  run(`INSERT INTO document_versions (document_id, village_id, version, file_path, file_name, file_size, mime_type, change_note)
       VALUES ('${docId}','${vid}',2,'vendor/storage/documents/${vid}/test-doc-1/v2_sk-test.pdf','sk-test.pdf',27,'application/pdf','Revisi isi')`);
  run(`UPDATE documents SET version=2 WHERE id='${docId}'`);
  assert.equal(run(`SELECT COUNT(*) FROM document_versions WHERE document_id='${docId}' AND version = 2`), "1");
  assert.equal(run(`SELECT change_note FROM document_versions WHERE document_id='${docId}' AND version = 2`), "Revisi isi");
});

test("dokumen kedaluwarsa terval index", () => {
  const docId = run(`SELECT id FROM documents WHERE village_id='${vid}' AND title='SK Test Acara'`);
  run(`UPDATE documents SET expires_at = CURRENT_DATE + 20 WHERE id='${docId}'`);
  const expiring = run(`SELECT COUNT(*) FROM documents WHERE village_id='${vid}' AND expires_at < CURRENT_DATE + 30 AND deleted_at IS NULL`);
  assert.ok(Number(expiring) >= 1, "dokumen mendekati kedaluwarsa terdeteksi");
});

test("RLS: documents terisolasi per desa", () => {
  const nA = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${vid}"}', true);
    SELECT COUNT(*) FROM documents WHERE deleted_at IS NULL`, APPURL));
  assert.ok(nA >= 1, `desa A melihat dokumennya, dapat ${nA}`);
  const fakeB = "00000000-0000-0000-0000-000000000004";
  const nB = Number(last(`SELECT set_config('request.jwt.claims', '{"village_id":"${fakeB}"}', true);
    SELECT COUNT(*) FROM documents WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0, "desa B tidak boleh melihat dokumen desa A");
});

test("soft delete: dokumen hilang dari daftar, verifikasi valid=false", () => {
  const docId = run(`SELECT id FROM documents WHERE village_id='${vid}' AND title='SK Test Acara'`);
  const code = run(`SELECT verification_code FROM documents WHERE id='${docId}'`);
  run(`UPDATE documents SET deleted_at=now() WHERE id='${docId}'`);
  assert.equal(run(`SELECT COUNT(*) FROM documents WHERE id='${docId}' AND deleted_at IS NULL`), "0");
  assert.equal(last(`SELECT valid FROM app.verify_document('${code}')`), "f");
  run(`UPDATE documents SET deleted_at=NULL WHERE id='${docId}'`);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 5 lulus");
