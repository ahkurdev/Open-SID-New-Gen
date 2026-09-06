import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  type: z.enum(["berita", "artikel", "pengumuman", "agenda"]),
  title: z.string().min(3).max(200),
  excerpt: z.string().max(300).optional().nullable(),
  content: z.string().min(10).max(50000),
  category: z.string().max(40).optional().nullable(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  status: z.enum(["draft", "published"]).optional(),
  scheduledAt: z.string().optional().nullable(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(200).optional(),
  excerpt: z.string().max(300).optional().nullable(),
  content: z.string().min(10).max(50000).optional(),
  category: z.string().max(40).optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  scheduledAt: z.string().optional().nullable(),
});

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "post";
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "";
    const status = url.searchParams.get("status") ?? "";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "public.publish");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["p.village_id = $1", "p.deleted_at IS NULL"];
      if (type) { params.push(type); where.push(`p.type = $${params.length}`); }
      if (status) { params.push(status); where.push(`p.status = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const rows = await db.query(
        `SELECT p.id, p.type, p.title, p.slug, p.excerpt, p.category, p.tags, p.status,
                p.published_at, p.scheduled_at, p.created_at, u.name AS author_name
         FROM posts p LEFT JOIN users u ON u.id = p.author_user_id
         WHERE ${whereSql} ORDER BY p.created_at DESC LIMIT 100`,
        params
      );
      return { posts: rows.rows };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
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

    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "public.publish");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      let slug = slugify(d.title);
      const dup = await db.query(`SELECT 1 FROM posts WHERE village_id = $1 AND slug = $2`, [ctx.villageId, slug]);
      if ((dup.rowCount ?? 0) > 0) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const publishedAt = d.status === "published" ? new Date().toISOString() : null;
      const p = await db.query(
        `INSERT INTO posts (village_id, type, title, slug, excerpt, content, category, tags, status, published_at, scheduled_at, author_user_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [ctx.villageId, d.type, d.title, slug, d.excerpt ?? null, d.content, d.category ?? null,
         d.tags ?? [], d.status ?? "draft", publishedAt, d.scheduledAt ?? null, ctx.userId, ctx.userId]
      );
      await writeAudit(ctx, req, db, {
        action: "post.create", entityType: "post", entityId: p.rows[0].id,
        newValues: { title: d.title, type: d.type, status: d.status ?? "draft" },
      });
      return { id: p.rows[0].id, slug };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, ...fields } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "public.publish");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const existing = await db.query(
        `SELECT id, title, content FROM posts WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
        [id, ctx.villageId]
      );
      if (existing.rowCount === 0) return { error: "Post tidak ditemukan", status: 404 };

      if (fields.content !== undefined || fields.title !== undefined) {
        await db.query(
          `INSERT INTO post_revisions (post_id, village_id, title, content, edited_by)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, ctx.villageId, fields.title ?? existing.rows[0].title, fields.content ?? existing.rows[0].content, ctx.userId]
        );
      }

      const map: Record<string, string> = {
        title: "title", excerpt: "excerpt", content: "content",
        category: "category", status: "status", scheduledAt: "scheduled_at",
      };
      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      for (const [k, col] of Object.entries(map)) {
        const v = fields[k as keyof typeof fields];
        if (v !== undefined) { values.push(v); sets.push(`${col} = $${++i}`); }
      }
      if (fields.status === "published") {
        values.push(new Date().toISOString());
        sets.push(`published_at = COALESCE(published_at, $${++i})`);
      }
      if (sets.length > 0) {
        await db.query(`UPDATE posts SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
        await writeAudit(ctx, req, db, {
          action: "post.update", entityType: "post", entityId: id, newValues: fields,
        });
      }
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
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
      const allowed = await hasPermission(ctx, db, "public.publish");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(
        `UPDATE posts SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND village_id = $3`,
        [id, ctx.userId, ctx.villageId]
      );
      await writeAudit(ctx, req, db, { action: "post.delete", entityType: "post", entityId: id });
      return { deleted: (r.rowCount ?? 0) > 0 };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
