import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const STORAGE_ROOT = path.join(process.cwd(), "vendor", "storage", "documents");

const ALLOWED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const DOC_TYPES = ["sk","perdes","perkades","surat_masuk","surat_keluar","kontrak","proposal","laporan","berita_acara","foto","tanah","aset","lainnya"] as const;

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  docType: z.enum(DOC_TYPES),
  description: z.string().max(2000).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  isPublic: z.boolean().optional(),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const type = url.searchParams.get("type") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") ?? 20)));

    const result = await withAuth(ctx, async (db) => {
      const params: unknown[] = [ctx.villageId];
      const where = ["d.village_id = $1", "d.deleted_at IS NULL"];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(d.title ILIKE $${params.length} OR d.doc_number ILIKE $${params.length} OR d.description ILIKE $${params.length})`);
      }
      if (type) { params.push(type); where.push(`d.doc_type = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const count = await db.query(`SELECT COUNT(*)::int AS c FROM documents d WHERE ${whereSql}`, params);
      const rows = await db.query(
        `SELECT d.id, d.title, d.doc_number, d.doc_type, d.description, d.file_name, d.file_size,
                d.mime_type, d.version, d.is_public, d.verification_code, d.tags, d.issued_at,
                d.expires_at, d.created_at, c.name AS category_name,
                (d.expires_at IS NOT NULL AND d.expires_at < CURRENT_DATE + 30) AS expiring_soon
         FROM documents d LEFT JOIN document_categories c ON c.id = d.category_id
         WHERE ${whereSql}
         ORDER BY d.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        params
      );
      const cats = await db.query(
        `SELECT id, name FROM document_categories WHERE village_id = $1 ORDER BY name`,
        [ctx.villageId]
      );
      return { documents: rows.rows, categories: cats.rows, total: count.rows[0].c, page, limit };
    });
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);
    if (!ctx.villageId) return fail("Tidak terhubung ke desa", 400);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("File wajib diunggah", 422);
    if (file.size > MAX_FILE_SIZE) return fail("Ukuran file maksimal 20MB", 422);
    if (!ALLOWED_MIME.has(file.type)) return fail(`Tipe file tidak diizinkan: ${file.type}`, 422);

    const metaRaw = form.get("meta");
    const parsed = uploadSchema.safeParse(JSON.parse(String(metaRaw ?? "{}")));
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "document.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const docDate = d.issuedAt ? new Date(d.issuedAt) : new Date();
      const num = await db.query("SELECT app.next_doc_number($1,$2,$3) AS n", [ctx.villageId, d.docType, docDate.toISOString().slice(0, 10)]);
      const docNumber = num.rows[0].n;
      const verificationCode = randomBytes(6).toString("hex");

      const doc = await db.query(
        `INSERT INTO documents (village_id, category_id, title, doc_number, doc_type, description,
           file_path, file_name, file_size, mime_type, is_public, verification_code, tags,
           issued_at, expires_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [ctx.villageId, d.categoryId ?? null, d.title, docNumber, d.docType, d.description ?? null,
         safeFileName(file.name), file.size, file.type, d.isPublic ?? false, verificationCode,
         d.tags ?? [], d.issuedAt ?? null, d.expiresAt ?? null, ctx.userId]
      );
      const docId = String(doc.rows[0].id);

      const dir = path.join(STORAGE_ROOT, String(ctx.villageId), docId);
      mkdirSync(dir, { recursive: true });
      const storedName = `v1_${safeFileName(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(path.join(dir, storedName), buffer);

      const filePath = path.relative(process.cwd(), path.join(dir, storedName));
      await db.query(`UPDATE documents SET file_path = $2 WHERE id = $1`, [docId, filePath]);
      await db.query(
        `INSERT INTO document_versions (document_id, village_id, version, file_path, file_name, file_size, mime_type, change_note, created_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,'Versi awal',$7)`,
        [docId, ctx.villageId, filePath, safeFileName(file.name), file.size, file.type, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "document.upload", entityType: "document", entityId: docId,
        newValues: { title: d.title, docNumber, docType: d.docType },
      });
      return { id: docId, docNumber, verificationCode };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id : null;
    if (!id) return fail("ID wajib diisi", 422);

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "document.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(
        `UPDATE documents SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND village_id = $3`,
        [id, ctx.userId, ctx.villageId]
      );
      await writeAudit(ctx, req, db, { action: "document.delete", entityType: "document", entityId: id });
      return { deleted: (r.rowCount ?? 0) > 0 };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
