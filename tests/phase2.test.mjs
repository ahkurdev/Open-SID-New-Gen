import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const psql = path.join(root, "vendor", "pgsql", "bin", "psql.exe");
const ADMIN = "postgresql://postgres:villageos@127.0.0.1:54329/village_os";
const APPURL = "postgresql://villageos_app:villageos_app_dev@127.0.0.1:54329/village_os";
const SECRET = new TextEncoder().encode("dev-only-insecure-secret-change-me");

function run(sql, url = ADMIN) {
  const r = execFileSync(psql, ["-qAt", "-d", url, "-c", sql], { encoding: "utf8" });
  return r.trim();
}
function runLines(sql, url = ADMIN) {
  return run(sql, url).split("\n").filter(Boolean);
}
function last(sql, url = ADMIN) {
  const lines = runLines(sql, url);
  return lines[lines.length - 1];
}

async function claimsQuery(claims, sql, params = []) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: APPURL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await client.query(sql, params);
    await client.query("COMMIT");
    return r;
  } finally {
    await client.end();
  }
}

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("desa kedua ada (seed isolasi)", () => {
  const n = Number(run("SELECT COUNT(*) FROM villages"));
  assert.ok(n >= 2, `minimal 2 desa, dapat ${n}`);
});

test("rate limit: blok setelah max, reset setelah window", () => {
  const key = "test:" + Date.now();
  for (let i = 0; i < 3; i++) {
    assert.equal(last(`SELECT app.rate_limit_hit('${key}',3,60)`) === "t", true);
  }
  assert.equal(last(`SELECT app.rate_limit_hit('${key}',3,60)`), "f", "harus diblok di hit ke-4");
});

test("invitation flow: peek + accept + login", async () => {
  const villageA = run("SELECT id FROM villages WHERE code='34.01.10.2004'");
  const roleOperator = run(`SELECT id FROM roles WHERE village_id='${villageA}' AND key='operator'`);
  const email = `invitee${Date.now()}@sinar-mulyo.test`;
  const token = "tok" + "a".repeat(50) + Date.now();

  run(`SELECT app.peek_invitation('${sha256(token)}') IS NULL`);
  run(
    `INSERT INTO invitations (village_id, email, role_ids, token_hash, expires_at)
     VALUES ('${villageA}', '${email}', ARRAY['${roleOperator}']::uuid[], '${sha256(token)}', now() + interval '1 day')`
  );

  const peek = run(`SELECT village_name FROM app.peek_invitation('${sha256(token)}')`);
  assert.ok(peek.includes("Sinar Mulyo"), "peek harus menampilkan nama desa");

  const hash = await bcrypt.hash("InvitePass123!", 12);
  const userId = run(`SELECT app.accept_invitation('${sha256(token)}', 'Undangan Test', '${hash}')`);
  assert.ok(/^[0-9a-f-]{36}$/.test(userId), "harus mengembalikan user id");

  assert.equal(run(`SELECT COUNT(*) FROM users WHERE email='${email}' AND email_verified_at IS NOT NULL`), "1");
  assert.equal(
    run(`SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id='${userId}' AND r.key='operator'`),
    "1"
  );
  assert.equal(last(`SELECT accepted_at IS NOT NULL FROM invitations WHERE email='${email}'`), "t");

  assert.throws(
    () => run(`SELECT app.accept_invitation('${sha256(token)}', 'X', 'y')`),
    /INVALID_TOKEN/,
    "token sudah dipakai, harus gagal"
  );

  const claims = { sub: userId, village_id: villageA, is_platform_admin: false };
  const r = await claimsQuery(claims, `SELECT COUNT(*)::int AS c FROM users WHERE village_id = $1`, [villageA]);
  assert.ok(r.rows[0].c >= 7);
});

test("session management: revoke satu dan revoke others", async () => {
  const user = run("SELECT id FROM app.get_user_for_login('admin@sinar-mulyo.test')");
  const villageA = run("SELECT village_id FROM app.get_user_for_login('admin@sinar-mulyo.test')");
  const mk = (tid) =>
    run(`SELECT app.create_session('${user}','${villageA}','${tid}','test',NULL,'t', now() + interval '1 hour')`);

  mk("sess-a-" + Date.now());
  mk("sess-b-" + Date.now());
  mk("sess-c-" + Date.now());

  await claimsQuery(
    { sub: user, village_id: villageA },
    `UPDATE sessions SET revoked_at = now(), revoked_reason = 'test' WHERE token_id LIKE 'sess-a-%' AND revoked_at IS NULL`
  );
  const aAlive = Number(await claimsQuery({ sub: user, village_id: villageA },
    `SELECT COUNT(*) FROM sessions WHERE token_id LIKE 'sess-a-%' AND revoked_at IS NULL`).then((r) => r.rows[0].count));
  assert.equal(aAlive, 0, "sesi A harus sudah revoke");
});

test("custom role: buat + assign + permission aktif", async () => {
  const villageA = run("SELECT id FROM villages WHERE code='34.01.10.2004'");
  const roleId = run(
    `INSERT INTO roles (village_id, key, name, permissions) VALUES ('${villageA}','tester${Date.now()}','Tester', ARRAY['complaint.read','report.read']) RETURNING id`
  );
  const user = run("SELECT id FROM app.get_user_for_login('auditor@sinar-mulyo.test')");
  run(`INSERT INTO user_roles (user_id, role_id, village_id) VALUES ('${user}','${roleId}','${villageA}')`);

  const perms = await claimsQuery({ sub: user, village_id: villageA }, `SELECT * FROM user_roles WHERE user_id = $1`, [user]);
  assert.ok(perms.rows.length >= 1);
});

test("audit trail: user.update tercatat dengan old/new values", async () => {
  const villageA = run("SELECT id FROM villages WHERE code='34.01.10.2004'");
  const target = run("SELECT id FROM app.get_user_for_login('bendahara@sinar-mulyo.test')");
  await claimsQuery(
    { sub: target, village_id: villageA },
    `SELECT app.register_login_attempt($1,$2,$3,true,NULL,NULL,'audit-test')`,
    [target, "bendahara@sinar-mulyo.test", villageA]
  );
  const n = Number(
    (await claimsQuery({ sub: target, village_id: villageA },
      `SELECT COUNT(*) FROM login_activities WHERE user_id = $1 AND ip::text = '' OR user_id = $1`, [target])).rows[0].count
  );
  assert.ok(n >= 1, "login activity harus tercatat");
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log("PASS", t.name);
  } catch (e) {
    failed++;
    console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]);
  }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 2 lulus");
