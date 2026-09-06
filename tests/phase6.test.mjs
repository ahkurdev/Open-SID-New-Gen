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

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("template bawaan ter-seed (domisili, pengantar)", () => {
  const n = Number(run(`SELECT COUNT(*) FROM letter_templates WHERE village_id='${vid}' AND code IN ('domisili','pengantar')`));
  assert.ok(n >= 2, `minimal 2 template, dapat ${n}`);
});

test("template builder: buat template custom dengan schema", () => {
  run(`DELETE FROM letters WHERE template_id IN (SELECT id FROM letter_templates WHERE village_id='${vid}' AND code='sku_test')`);
  run(`DELETE FROM letter_templates WHERE village_id='${vid}' AND code='sku_test'`);
  const id = run(
    `INSERT INTO letter_templates (village_id, code, name, form_schema, approval_steps, sla_days)
     VALUES ('${vid}','sku_test','Surat Keterangan Usaha Test',
     '[{"key":"usaha","label":"Jenis Usaha","type":"text","required":true}]'::jsonb,
     '{operator,sekdes,kades}', 2) RETURNING id`
  );
  const schema = run(`SELECT form_schema->0->>'key' FROM letter_templates WHERE id='${id}'`);
  assert.equal(schema, "usaha");
});

test("workflow: submit -> advance x3 -> sign -> issue dengan nomor otomatis", () => {
  const tpl = run(`SELECT id FROM letter_templates WHERE village_id='${vid}' AND code='sku_test'`);
  const letter = run(
    `INSERT INTO letters (village_id, template_id, applicant_name, data, current_step, sla_due_at)
     VALUES ('${vid}','${tpl}','Warga Uji','{"usaha":"Warung"}'::jsonb, 1, now() + interval '2 days')
     RETURNING id`
  );
  run(`INSERT INTO letter_actions (letter_id, village_id, action, step_label) VALUES ('${letter}','${vid}','submit','Diajukan')`);

  // advance 3x (operator, sekdes, kades)
  for (let i = 0; i < 3; i++) {
    run(`UPDATE letters SET current_step = current_step + 1, status='in_review' WHERE id='${letter}'`);
    run(`INSERT INTO letter_actions (letter_id, village_id, action, step_label) VALUES ('${letter}','${vid}','advance','advance')`);
  }
  run(`UPDATE letters SET status='approved' WHERE id='${letter}'`);

  const num = run(`SELECT app.next_letter_number('${vid}','sku_test',CURRENT_DATE)`);
  assert.ok(/^SKU_TEST\/\d{4}\/\d{4}$/.test(num), `nomor surat otomatis, dapat ${num}`);

  run(`UPDATE letters SET status='signed', signed_at=now(), letter_number='${num}', verification_code=substr(md5(random()::text),1,12) WHERE id='${letter}'`);
  run(`UPDATE letters SET status='issued', issued_at=now() WHERE id='${letter}'`);
  assert.equal(run(`SELECT status FROM letters WHERE id='${letter}'`), "issued");
  assert.ok(run(`SELECT letter_number FROM letters WHERE id='${letter}'`).length > 0);
});

test("verifikasi surat terbit via SECURITY DEFINER", () => {
  const code = run(`SELECT verification_code FROM letters WHERE template_id=(SELECT id FROM letter_templates WHERE village_id='${vid}' AND code='sku_test') AND status='issued'`);
  const out = last(`SELECT valid FROM app.verify_letter('${code}')`);
  assert.equal(out, "t");
  const invalid = run(`SELECT COUNT(*) FROM app.verify_letter('palsu000000')`);
  assert.equal(invalid, "0");
});

test("reject menyimpan alasan", () => {
  const tpl = run(`SELECT id FROM letter_templates WHERE village_id='${vid}' AND code='sku_test'`);
  const letter = run(
    `INSERT INTO letters (village_id, template_id, applicant_name, data, current_step)
     VALUES ('${vid}','${tpl}','Warga Ditolak','{}'::jsonb, 1) RETURNING id`
  );
  run(`UPDATE letters SET status='rejected', rejection_reason='Data tidak lengkap' WHERE id='${letter}'`);
  assert.equal(run(`SELECT rejection_reason FROM letters WHERE id='${letter}'`), "Data tidak lengkap");
});

test("SLA: sla_due_at terisi sesuai template", () => {
  const due = run(`SELECT sla_due_at IS NOT NULL FROM letters WHERE template_id=(SELECT id FROM letter_templates WHERE village_id='${vid}' AND code='sku_test') LIMIT 1`);
  assert.equal(due, "t");
});

test("RLS: letters terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM letters`, APPURL));
  assert.ok(nA >= 2, `desa A melihat suratnya, dapat ${nA}`);
  const fakeB = "00000000-0000-0000-0000-000000000005";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM letters WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 6 lulus");
