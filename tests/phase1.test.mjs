import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const psql = path.join(root, "vendor", "pgsql", "bin", "psql.exe");
const ADMIN = "postgresql://postgres:villageos@127.0.0.1:54329/village_os";
const APPURL = "postgresql://villageos_app:villageos_app_dev@127.0.0.1:54329/village_os";

function run(sql, url = ADMIN) {
  const r = spawnSync(psql, ["-qAt", "-d", url, "-c", sql], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || "psql failed");
  return r.stdout.trim();
}

const vid = run("SELECT id FROM villages WHERE code='34.01.10.2004'");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("migrations applied", () => {
  assert.ok(Number(run("SELECT COUNT(*) FROM _migrations")) >= 3);
});

test("seed data ada", () => {
  assert.ok(Number(run("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL")) >= 7);
  assert.ok(Number(run("SELECT COUNT(*) FROM roles")) >= 7);
});

test("RLS: app role tanpa claims tidak bisa baca users", () => {
  assert.equal(Number(run("SELECT COUNT(*) FROM users", APPURL)), 0);
});

test("RLS: claims desa A melihat users desa A (bukan desa lain)", () => {
  const out = run(
    `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","village_id":"${vid}"}', true);
     SELECT COUNT(*) FROM users`,
    APPURL
  );
  const total = Number(run("SELECT COUNT(*) FROM users WHERE deleted_at IS NULL"));
  const inA = Number(out.trim().split("\n").pop());
  assert.ok(inA >= 7, `desa A minimal 7 users, dapat ${inA}`);
  assert.equal(inA, total, "semua user saat ini milik desa A");
});

test("RLS tenant isolation: desa B tidak melihat users desa A", () => {
  const fakeB = "00000000-0000-0000-0000-000000000001";
  const out = run(
    `SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","village_id":"${fakeB}"}', true);
     SELECT COUNT(*) FROM users WHERE village_id = '${vid}'`,
    APPURL
  );
  assert.equal(Number(out.trim().split("\n").pop()), 0);
});

test("audit_logs append-only untuk app role", () => {
  assert.throws(() =>
    run(
      `SELECT set_config('request.jwt.claims', '{"village_id":"${vid}"}', true);
       DELETE FROM audit_logs`,
      APPURL
    )
  );
});

test("login function bekerja", () => {
  const out = run("SELECT name FROM app.get_user_for_login('admin@sinar-mulyo.test')");
  assert.ok(out.includes("Admin Desa"));
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log("PASS", t.name);
  } catch (e) {
    failed++;
    console.error("FAIL", t.name, "\n ", e.message.split("\n")[0]);
  }
}
if (failed > 0) {
  console.error(`${failed} test gagal`);
  process.exit(1);
}
console.log("Semua test Phase 1 lulus");
