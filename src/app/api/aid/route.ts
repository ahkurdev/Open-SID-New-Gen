import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const programSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().max(1000).optional().nullable(),
  fundingSource: z.enum(["desa", "provinsi", "kabupaten", "pusat", "donatur"]).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  quota: z.number().int().min(1).optional().nullable(),
});

const recipientSchema = z.object({
  programId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  applicantName: z.string().min(1).max(120),
});

const reviewSchema = z.object({
  recipientId: z.string().uuid(),
  action: z.enum(["verify", "accept", "reject", "distribute", "mark_not_claimed"]),
  rejectionReason: z.string().max(300).optional().nullable(),
  notClaimedReason: z.enum(["pindah", "meninggal", "menolak", "tidak_ditemukan", "tidak_memenuhi_syarat", "lainnya"]).optional().nullable(),
  notClaimedNote: z.string().max(300).optional().nullable(),
  distributionNote: z.string().max(300).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const programId = url.searchParams.get("programId");

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "aid.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const programs = await db.query(
        `SELECT p.id, p.name, p.description, p.funding_source, p.period_start, p.period_end,
                p.quota, p.status,
                (SELECT COUNT(*)::int FROM aid_recipients ar WHERE ar.program_id = p.id AND ar.status IN ('accepted','distributed')) AS accepted_count,
                (SELECT COUNT(*)::int FROM aid_recipients ar WHERE ar.program_id = p.id AND ar.status = 'distributed') AS distributed_count
         FROM aid_programs p WHERE p.village_id = $1 ORDER BY p.created_at DESC`,
        [ctx.villageId]
      );

      let recipients: unknown[] = [];
      if (programId) {
        const r = await db.query(
          `SELECT ar.id, ar.applicant_name, ar.status, ar.not_claimed_reason, ar.rejection_reason,
                  ar.distribution_date, ar.distribution_note, ar.created_at, r.nik, r.name AS resident_real_name
           FROM aid_recipients ar LEFT JOIN residents r ON r.id = ar.resident_id
           WHERE ar.program_id = $1 AND ar.village_id = $2
           ORDER BY ar.created_at DESC`,
          [programId, ctx.villageId]
        );
        recipients = r.rows;
      }
      return { programs: programs.rows, recipients };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
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
    const mode = typeof body?.mode === "string" ? body.mode : "program";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "aid.approve");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "program") {
        const parsed = programSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const p = await db.query(
          `INSERT INTO aid_programs (village_id, name, description, funding_source, period_start, period_end, quota, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.name, d.description ?? null, d.fundingSource ?? "desa",
           d.periodStart, d.periodEnd ?? null, d.quota ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, { action: "aid_program.create", entityType: "aid_program", entityId: p.rows[0].id, newValues: d });
        return { id: p.rows[0].id };
      }

      if (mode === "recipient") {
        const parsed = recipientSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const prog = await db.query(`SELECT id, quota FROM aid_programs WHERE id = $1 AND village_id = $2 AND status = 'active'`, [d.programId, ctx.villageId]);
        if (prog.rowCount === 0) return { error: "Program tidak ditemukan / sudah ditutup", status: 404 };
        if (d.residentId) {
          const dup = await db.query(`SELECT 1 FROM aid_recipients WHERE program_id = $1 AND resident_id = $2`, [d.programId, d.residentId]);
          if ((dup.rowCount ?? 0) > 0) return { error: "Warga sudah terdaftar di program ini", status: 409 };
        }
        const name = d.residentId
          ? (await db.query(`SELECT name FROM residents WHERE id = $1`, [d.residentId])).rows[0]?.name ?? d.applicantName
          : d.applicantName;
        const r = await db.query(
          `INSERT INTO aid_recipients (village_id, program_id, resident_id, applicant_name)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [ctx.villageId, d.programId, d.residentId ?? null, name]
        );
        await writeAudit(ctx, req, db, { action: "aid_recipient.add", entityType: "aid_recipient", entityId: r.rows[0].id, newValues: { programId: d.programId } });
        return { id: r.rows[0].id };
      }

      return { error: "Mode tidak dikenal", status: 400 };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
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
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { recipientId, action, rejectionReason, notClaimedReason, notClaimedNote, distributionNote } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "aid.approve");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const r = await db.query(
        `SELECT id, status FROM aid_recipients WHERE id = $1 AND village_id = $2 FOR UPDATE`,
        [recipientId, ctx.villageId]
      );
      if (r.rowCount === 0) return { error: "Penerima tidak ditemukan", status: 404 };
      const current = r.rows[0].status;

      const transitions: Record<string, { from: string[]; to: string }> = {
        verify: { from: ["candidate"], to: "verified" },
        accept: { from: ["verified"], to: "accepted" },
        reject: { from: ["candidate", "verified"], to: "rejected" },
        distribute: { from: ["accepted"], to: "distributed" },
        mark_not_claimed: { from: ["accepted"], to: "not_claimed" },
      };
      const tr = transitions[action];
      if (!tr) return { error: "Aksi tidak dikenal", status: 400 };
      if (!tr.from.includes(current)) {
        return { error: `Tidak bisa ${action} dari status ${current}`, status: 409 };
      }

      if (action === "verify") {
        await db.query(`UPDATE aid_recipients SET status='verified', verified_by=$2, verified_at=now() WHERE id=$1`, [recipientId, ctx.userId]);
      } else if (action === "accept") {
        await db.query(`UPDATE aid_recipients SET status='accepted', approved_by=$2 WHERE id=$1`, [recipientId, ctx.userId]);
      } else if (action === "reject") {
        await db.query(`UPDATE aid_recipients SET status='rejected', rejection_reason=$2 WHERE id=$1`, [recipientId, rejectionReason ?? "Tidak memenuhi kriteria", ctx.userId]);
      } else if (action === "distribute") {
        await db.query(`UPDATE aid_recipients SET status='distributed', distribution_date=CURRENT_DATE, distribution_note=$2 WHERE id=$1`, [recipientId, distributionNote ?? null]);
      } else if (action === "mark_not_claimed") {
        if (!notClaimedReason) return { error: "Alasan tidak diambil wajib diisi", status: 422 };
        await db.query(
          `UPDATE aid_recipients SET status='not_claimed', not_claimed_reason=$2, not_claimed_note=$3 WHERE id=$1`,
          [recipientId, notClaimedReason, notClaimedNote ?? null]
        );
      }

      await writeAudit(ctx, req, db, {
        action: `aid.${action}`, entityType: "aid_recipient", entityId: recipientId,
        oldValues: { status: current }, newValues: { action, notClaimedReason },
      });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
