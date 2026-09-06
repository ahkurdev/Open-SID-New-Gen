import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const STEP_ROLES: Record<string, string> = {
  operator: "letter.process",
  sekdes: "letter.approve",
  kades: "letter.sign",
};

const submitSchema = z.object({
  templateId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  applicantName: z.string().min(1).max(120),
  data: z.record(z.string(), z.unknown()).default({}),
});

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["advance", "reject", "sign", "issue", "cancel"]),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(50, Math.max(10, Number(url.searchParams.get("limit") ?? 20)));

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "letter.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["l.village_id = $1", "l.deleted_at IS NULL"];
      if (status) { params.push(status); where.push(`l.status = $${params.length}`); }
      const whereSql = where.join(" AND ");

      const count = await db.query(`SELECT COUNT(*)::int AS c FROM letters l WHERE ${whereSql}`, params);
      const rows = await db.query(
        `SELECT l.id, l.applicant_name, l.status, l.current_step, l.letter_number,
                l.verification_code, l.created_at, l.issued_at, l.sla_due_at,
                l.rejection_reason, t.name AS template_name, t.code AS template_code
         FROM letters l JOIN letter_templates t ON t.id = l.template_id
         WHERE ${whereSql}
         ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        params
      );
      return { letters: rows.rows, total: count.rows[0].c, page, limit };
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
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "letter.request");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const t = await db.query(
        `SELECT id, code, name, form_schema, approval_steps, sla_days FROM letter_templates
         WHERE id = $1 AND village_id = $2 AND is_active = true`,
        [d.templateId, ctx.villageId]
      );
      if (t.rowCount === 0) return { error: "Template tidak ditemukan / tidak aktif", status: 404 };
      const tpl = t.rows[0];

      // validasi data terhadap form schema
      const schema = Array.isArray(tpl.form_schema) ? tpl.form_schema : [];
      for (const f of schema) {
        if (f.required && (d.data[f.key] === undefined || d.data[f.key] === null || d.data[f.key] === "")) {
          return { error: `Kolom "${f.label}" wajib diisi`, status: 422 };
        }
      }

      if (d.residentId) {
        const r = await db.query(`SELECT 1 FROM residents WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`, [d.residentId, ctx.villageId]);
        if (r.rowCount === 0) return { error: "Penduduk tidak ditemukan", status: 422 };
      }

      const slaDays = tpl.sla_days ?? 5;
      const l = await db.query(
        `INSERT INTO letters (village_id, template_id, resident_id, applicant_name, data,
           current_step, sla_due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,1, now() + make_interval(days => $6), $7) RETURNING id`,
        [ctx.villageId, d.templateId, d.residentId ?? null, d.applicantName, JSON.stringify(d.data), slaDays, ctx.userId]
      );
      const letterId = l.rows[0].id;

      const firstStep = (tpl.approval_steps as string[])[0];
      await db.query(
        `INSERT INTO letter_actions (letter_id, village_id, action, step_label, actor_user_id, actor_name, notes)
         VALUES ($1,$2,'submit',$3,$4,$5,NULL)`,
        [letterId, ctx.villageId, `Diajukan, menunggu ${firstStep}`, ctx.userId, ctx.name]
      );

      // notifikasi untuk pemroses pertama
      await db.query(
        `INSERT INTO notifications (village_id, user_id, category, title, body, data)
         SELECT $1, ur.user_id, 'surat', 'Pengajuan surat baru',
                $2, jsonb_build_object('letter_id', $3::text)
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id, unnest(r.permissions) AS p
         WHERE ur.village_id = $1 AND p = $4 AND ur.user_id <> $5
         GROUP BY ur.user_id`,
        [ctx.villageId, `Pengajuan ${tpl.name} dari ${d.applicantName}`, letterId, STEP_ROLES[firstStep] ?? "letter.process", ctx.userId]
      );

      await writeAudit(ctx, req, db, {
        action: "letter.submit", entityType: "letter", entityId: letterId,
        newValues: { templateId: d.templateId, applicantName: d.applicantName },
      });
      return { id: letterId, status: "submitted", currentStep: firstStep };
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
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, action, notes } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const l = await db.query(
        `SELECT l.*, t.code AS tpl_code, t.approval_steps
         FROM letters l JOIN letter_templates t ON t.id = l.template_id
         WHERE l.id = $1 AND l.village_id = $2 AND l.deleted_at IS NULL FOR UPDATE`,
        [id, ctx.villageId]
      );
      if (l.rowCount === 0) return { error: "Surat tidak ditemukan", status: 404 };
      const letter = l.rows[0];
      const steps = letter.approval_steps as string[];

      if (action === "advance") {
        const stepRole = STEP_ROLES[steps[letter.current_step - 1] ?? ""] ?? "letter.process";
        const allowed = await hasPermission(ctx, db, stepRole);
        if (!allowed) return { error: "Tidak memiliki izin untuk tahap ini", status: 403 };
        if (!["submitted", "in_review"].includes(letter.status)) return { error: "Status surat tidak dapat diproses", status: 409 };

        if (letter.current_step < steps.length) {
          await db.query(`UPDATE letters SET current_step = current_step + 1, status = 'in_review', updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
          const nextStep = steps[letter.current_step];
          await db.query(
            `INSERT INTO letter_actions (letter_id, village_id, action, step_label, actor_user_id, actor_name, notes)
             VALUES ($1,$2,'advance',$3,$4,$5,$6)`,
            [id, ctx.villageId, `Disetujui ${steps[letter.current_step - 1]}, lanjut ke ${nextStep}`, ctx.userId, ctx.name, notes ?? null]
          );
        } else {
          await db.query(`UPDATE letters SET status = 'approved', updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
          await db.query(
            `INSERT INTO letter_actions (letter_id, village_id, action, step_label, actor_user_id, actor_name, notes)
             VALUES ($1,$2,'advance','Semua approval selesai, menunggu tanda tangan',$3,$4,$5)`,
            [id, ctx.villageId, ctx.userId, ctx.name, notes ?? null]
          );
        }
      } else if (action === "reject") {
        const allowed = await hasPermission(ctx, db, "letter.process");
        if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
        if (["issued", "rejected", "cancelled"].includes(letter.status)) return { error: "Surat sudah final", status: 409 };
        await db.query(`UPDATE letters SET status = 'rejected', rejection_reason = $2, updated_by = $3 WHERE id = $1`, [id, notes ?? "Ditolak", ctx.userId]);
        await db.query(
          `INSERT INTO letter_actions (letter_id, village_id, action, actor_user_id, actor_name, notes)
           VALUES ($1,$2,'reject',$3,$4,$5)`,
          [id, ctx.villageId, ctx.userId, ctx.name, notes ?? null]
        );
      } else if (action === "sign") {
        const allowed = await hasPermission(ctx, db, "letter.sign");
        if (!allowed) return { error: "Hanya Kepala Desa yang dapat menandatangani", status: 403 };
        if (letter.status !== "approved") return { error: "Surat harus approved dahulu", status: 409 };
        const letterNumber = await db.query("SELECT app.next_letter_number($1,$2,CURRENT_DATE) AS n", [ctx.villageId, letter.tpl_code]);
        await db.query(
          `UPDATE letters SET status = 'signed', signed_at = now(), letter_number = $2, verification_code = $3, updated_by = $4 WHERE id = $1`,
          [id, letterNumber.rows[0].n, randomBytes(6).toString("hex"), ctx.userId]
        );
        await db.query(
          `INSERT INTO letter_actions (letter_id, village_id, action, actor_user_id, actor_name, notes)
           VALUES ($1,$2,'sign','Ditandatangani Kepala Desa',$3,$4)`,
          [id, ctx.villageId, ctx.userId, ctx.name]
        );
      } else if (action === "issue") {
        const allowed = await hasPermission(ctx, db, "letter.sign");
        if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
        if (letter.status !== "signed") return { error: "Surat harus signed dahulu", status: 409 };
        await db.query(`UPDATE letters SET status = 'issued', issued_at = now(), updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
        await db.query(
          `INSERT INTO letter_actions (letter_id, village_id, action, actor_user_id, actor_name, notes)
           VALUES ($1,$2,'issue','Surat terbit',$3,$4)`,
          [id, ctx.villageId, ctx.userId, ctx.name]
        );
      } else if (action === "cancel") {
        const allowed = await hasPermission(ctx, db, "letter.request") || await hasPermission(ctx, db, "letter.process");
        if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
        if (["issued", "cancelled"].includes(letter.status)) return { error: "Surat sudah final", status: 409 };
        await db.query(`UPDATE letters SET status = 'cancelled', updated_by = $2 WHERE id = $1`, [id, ctx.userId]);
        await db.query(
          `INSERT INTO letter_actions (letter_id, village_id, action, actor_user_id, actor_name, notes)
           VALUES ($1,$2,'cancel',$3,$4,$5)`,
          [id, ctx.villageId, ctx.userId, ctx.name, notes ?? null]
        );
      }

      await writeAudit(ctx, req, db, {
        action: `letter.${action}`, entityType: "letter", entityId: id,
        oldValues: { status: letter.status }, newValues: { notes },
      });
      return { ok: true };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
