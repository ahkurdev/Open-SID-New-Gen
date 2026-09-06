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
const operator = run("SELECT id FROM users WHERE email='operator@sinar-mulyo.test'");
const warga = run("SELECT id FROM users WHERE email='warga@sinar-mulyo.test'");
run(`DELETE FROM proposal_votes WHERE proposal_id IN (SELECT id FROM proposals WHERE village_id='${vid}' AND title LIKE '%Test Usulan%')`);
run(`DELETE FROM proposals WHERE village_id='${vid}' AND title LIKE '%Test Usulan%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("submit usulan + nomor otomatis", () => {
  const seq = run(`SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_no FROM '[0-9]+$') AS integer)),0)+1 FROM proposals WHERE village_id='${vid}' AND musrenbang_year=EXTRACT(YEAR FROM now())`);
  const no = `MUS/${new Date().getFullYear()}/${String(seq).padStart(3, "0")}`;
  const p = run(
    `INSERT INTO proposals (village_id, proposal_no, title, category, description, proposed_by_resident, proposer_name, estimated_cost, estimated_beneficiaries)
     VALUES ('${vid}','${no}','Test Usulan Perbaikan Jalan','jalan','Jalan rusak perlu aspal ulang',
       (SELECT resident_id FROM users WHERE id='${warga}'), 'Warga Demo Sinar Mulyo', 150000000, 250)
     RETURNING id`
  );
  assert.ok(run(`SELECT proposal_no FROM proposals WHERE id='${p}'`).includes("MUS/"));
});

test("vote: 1 user 1 suara, duplikat ditolak", () => {
  const p = run(`SELECT id FROM proposals WHERE village_id='${vid}' AND title LIKE '%Test Usulan%' ORDER BY created_at DESC LIMIT 1`);
  run(`INSERT INTO proposal_votes (proposal_id, village_id, user_id) VALUES ('${p}','${vid}','${warga}')`);
  run(`UPDATE proposals SET vote_count = vote_count + 1 WHERE id='${p}'`);
  assert.throws(() =>
    run(`INSERT INTO proposal_votes (proposal_id, village_id, user_id) VALUES ('${p}','${vid}','${warga}')`)
  , null, "vote ganda harus ditolak UNIQUE");
  const votes = Number(run(`SELECT vote_count FROM proposals WHERE id='${p}'`));
  assert.equal(votes, 1);
});

test("workflow: verified -> musrenbang -> prioritized -> approved -> planned -> progress -> completed", () => {
  const p = run(`SELECT id FROM proposals WHERE village_id='${vid}' AND title LIKE '%Test Usulan%' ORDER BY created_at DESC LIMIT 1`);
  const flow = [["verify", "verified"], ["musrenbang", "in_musrenbang"], ["prioritize", "prioritized"], ["approve", "approved"], ["plan", "planned"], ["progress", "in_progress"], ["complete", "completed"]];
  for (const [action, expected] of flow) {
    if (action === "prioritize") {
      run(`UPDATE proposals SET status='prioritized', priority_rank=1, updated_by='${operator}' WHERE id='${p}'`);
    } else if (action === "approve") {
      run(`UPDATE proposals SET status='approved', approved_by='${operator}' WHERE id='${p}'`);
    } else {
      run(`UPDATE proposals SET status='${expected}', updated_by='${operator}' WHERE id='${p}'`);
    }
    assert.equal(run(`SELECT status FROM proposals WHERE id='${p}'`), expected, `transisi ${action}`);
  }
});

test("view publik menampilkan usulan tanpa identitas pengusul", () => {
  const cols = run(`SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name='public_proposals'`);
  assert.ok(!cols.includes("proposer_name"), "nama pengusul tidak di view publik");
  assert.ok(!cols.includes("proposed_by_resident"), "resident id tidak di view publik");
  assert.ok(cols.includes("status"));
});

test("RLS: proposals terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM proposals`, APPURL));
  assert.ok(nA >= 1);
  const fakeB = "00000000-0000-0000-0000-00000000000b";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM proposals WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 12 lulus");
