import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import pg from "pg";

const APPURL = "postgresql://villageos_app:villageos_app_dev@127.0.0.1:54329/village_os";
const SECRET = new TextEncoder().encode("dev-only-insecure-secret-change-me");

async function claimsQuery(claims, sql, params = []) {
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

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("password seed cocok dengan bcrypt", async () => {
  const c = new pg.Client({ connectionString: "postgresql://postgres:villageos@127.0.0.1:54329/village_os" });
  await c.connect();
  const r = await c.query("SELECT password_hash FROM app.get_user_for_login('admin@sinar-mulyo.test')");
  await c.end();
  assert.equal(await bcrypt.compare("Password123!", r.rows[0].password_hash), true);
});

test("login flow: buat session + JWT, verifikasi, revoke", async () => {
  const admin = new pg.Client({ connectionString: "postgresql://postgres:villageos@127.0.0.1:54329/village_os" });
  await admin.connect();
  const u = await admin.query("SELECT id, village_id, email, name FROM app.get_user_for_login('admin@sinar-mulyo.test')");
  const user = u.rows[0];

  const tokenId = "test-" + Date.now();
  await admin.query("SELECT app.create_session($1,$2,$3,$4,$5,$6,$7)", [
    user.id, user.village_id, tokenId, "test", null, "node-test",
    new Date(Date.now() + 3600_000).toISOString(),
  ]);
  await admin.end();

  const token = await new SignJWT({
    sub: user.id, village_id: user.village_id, is_platform_admin: false,
    sid: tokenId, email: user.email, name: user.name,
  }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(SECRET);

  const payload = await jwtVerify(token, SECRET);
  assert.equal(payload.payload.sid, tokenId);

  const sess = await claimsQuery(
    { sub: user.id, village_id: user.village_id },
    `SELECT s.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [tokenId]
  );
  assert.equal(sess.rows.length, 1);
  assert.equal(sess.rows[0].email, "admin@sinar-mulyo.test");

  const admin2 = new pg.Client({ connectionString: "postgresql://postgres:villageos@127.0.0.1:54329/village_os" });
  await admin2.connect();
  await admin2.query("UPDATE sessions SET revoked_at = now(), revoked_reason = 'test' WHERE token_id = $1", [tokenId]);
  await admin2.end();

  const revoked = await claimsQuery(
    { sub: user.id, village_id: user.village_id },
    `SELECT 1 FROM sessions WHERE token_id = $1 AND revoked_at IS NULL`,
    [tokenId]
  );
  assert.equal(revoked.rows.length, 0);
});

test("lockout: 5x gagal login mengunci akun lalu reset", async () => {
  const c = new pg.Client({ connectionString: "postgresql://postgres:villageos@127.0.0.1:54329/village_os" });
  await c.connect();
  const u = await c.query("SELECT id, village_id, email FROM app.get_user_for_login('operator@sinar-mulyo.test')");
  const user = u.rows[0];
  for (let i = 0; i < 5; i++) {
    await c.query("SELECT app.register_login_attempt($1,$2,$3,false,'bad_password',NULL,'test')", [user.id, user.email, user.village_id]);
  }
  const locked = await c.query("SELECT status, locked_until FROM users WHERE id = $1", [user.id]);
  assert.equal(locked.rows[0].status, "locked");
  assert.ok(locked.rows[0].locked_until, "locked_until harus terisi");

  await c.query("SELECT app.register_login_attempt($1,$2,$3,true,NULL,NULL,'test')", [user.id, user.email, user.village_id]);
  const unlocked = await c.query("SELECT status, failed_login_attempts FROM users WHERE id = $1", [user.id]);
  assert.equal(unlocked.rows[0].status, "active");
  assert.equal(unlocked.rows[0].failed_login_attempts, 0);
  await c.end();
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
console.log("Semua test auth lulus");
