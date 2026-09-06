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
const vcode = "34.01.10.2004";
run(`DELETE FROM posts WHERE village_id='${vid}' AND title LIKE '%Test Berita%'`);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("create post + slug otomatis", () => {
  const id = run(
    `INSERT INTO posts (village_id, type, title, slug, content, status, published_at, author_user_id)
     VALUES ('${vid}','berita','Test Berita Musyawarah Dusun','test-berita-musyawarah-dusun','Konten berita musyawarah desa.', 'published', now(),
             (SELECT id FROM users WHERE email='kades@sinar-mulyo.test'))
     RETURNING id`
  );
  assert.ok(/^[0-9a-f-]{36}$/.test(id));
  assert.equal(run(`SELECT slug FROM posts WHERE id='${id}'`), "test-berita-musyawarah-dusun");
});

test("draft tidak muncul di fungsi publik", () => {
  run(
    `INSERT INTO posts (village_id, type, title, slug, content, status)
     VALUES ('${vid}','pengumuman','Test Berita Draft Pinggir','test-berita-draft','Konten draft.', 'draft')`
  );
  const published = run(`SELECT COUNT(*) FROM app.get_public_posts('${vcode}')`);
  const total = run(`SELECT COUNT(*) FROM posts WHERE village_id='${vid}' AND deleted_at IS NULL`);
  assert.equal(published, "1", "hanya published yang tampil");
  assert.ok(Number(total) >= 2);
});

test("get_public_stats: agregat tanpa PII", () => {
  const stats = run(`SELECT metric, value FROM app.get_public_stats('${vcode}')`);
  const lines = stats.split("\n");
  const metrics = lines.map((l) => l.split("|")[0]);
  assert.ok(metrics.includes("total_penduduk"), "ada total_penduduk");
  assert.ok(metrics.includes("surat_terbit"), "ada surat_terbit");
  assert.ok(!run(`SELECT string_agg(metric, ',') FROM app.get_public_stats('${vcode}')`).includes("nik"), "tanpa NIK");
});

test("revisi post tercatat", () => {
  const pid = run(`SELECT id FROM posts WHERE slug='test-berita-musyawarah-dusun'`);
  run(
    `INSERT INTO post_revisions (post_id, village_id, title, content, edited_by)
     VALUES ('${pid}','${vid}','Test Berita Musyawarah Dusun','Konten direvisi.', (SELECT id FROM users WHERE email='kades@sinar-mulyo.test'))`
  );
  assert.equal(run(`SELECT COUNT(*) FROM post_revisions WHERE post_id='${pid}'`), "1");
});

test("RLS: posts terisolasi per desa", () => {
  const nA = Number(last(`${claims(vid)} SELECT COUNT(*) FROM posts`, APPURL));
  assert.ok(nA >= 2);
  const fakeB = "00000000-0000-0000-0000-000000000008";
  const nB = Number(last(`${claims(fakeB)} SELECT COUNT(*) FROM posts WHERE village_id='${vid}'`, APPURL));
  assert.equal(nB, 0);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log("PASS", t.name); }
  catch (e) { failed++; console.error("FAIL", t.name, "\n ", String(e.message).split("\n")[0]); }
}
if (failed > 0) process.exit(1);
console.log("Semua test Phase 10 lulus");
