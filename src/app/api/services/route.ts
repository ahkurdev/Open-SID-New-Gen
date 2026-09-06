import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const healthProgramSchema = z.object({
  name: z.string().min(2).max(150),
  programType: z.enum(["posyandu", "imunisasi", "kesehatan_ibu", "kesehatan_lansia", "sanitasi", "lainnya"]),
  description: z.string().max(500).optional().nullable(),
  scheduleText: z.string().max(150).optional().nullable(),
  locationText: z.string().max(200).optional().nullable(),
});

const healthVisitSchema = z.object({
  programId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  participantCount: z.number().int().min(1).optional(),
  notes: z.string().max(300).optional().nullable(),
});

const schoolSchema = z.object({
  name: z.string().min(2).max(150),
  level: z.enum(["paud", "tk", "sd", "smp", "sma", "smk", "lainnya"]),
  npsn: z.string().max(15).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  headmaster: z.string().max(120).optional().nullable(),
  studentCount: z.number().int().min(0).optional(),
  teacherCount: z.number().int().min(0).optional(),
});

const scholarshipSchema = z.object({
  name: z.string().min(2).max(150),
  provider: z.string().max(150).optional().nullable(),
  quota: z.number().int().min(1).optional().nullable(),
  periodYear: z.number().int().optional(),
});

const scholarshipAppSchema = z.object({
  scholarshipId: z.string().uuid(),
  residentId: z.string().uuid().optional().nullable(),
  applicantName: z.string().min(1).max(120),
  schoolId: z.string().uuid().optional().nullable(),
});

const scholarshipReviewSchema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(["verify", "accept", "reject", "award"]),
  rejectionReason: z.string().max(300).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "health";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "services.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (view === "education") {
        const schools = await db.query(
          `SELECT id, name, level, npsn, address, headmaster, student_count, teacher_count
           FROM schools WHERE village_id = $1 ORDER BY level, name`,
          [ctx.villageId]
        );
        const scholarships = await db.query(
          `SELECT s.id, s.name, s.provider, s.period_year, s.quota, s.status,
                  (SELECT COUNT(*)::int FROM scholarship_applications sa WHERE sa.scholarship_id = s.id AND sa.status IN ('accepted','awarded')) AS awarded_count
           FROM scholarships s WHERE s.village_id = $1 ORDER BY s.created_at DESC`,
          [ctx.villageId]
        );
        const applications = await db.query(
          `SELECT sa.id, sa.applicant_name, sa.status, sa.rejection_reason, sa.created_at,
                  s.name AS scholarship_name, sc.name AS school_name, r.nik
           FROM scholarship_applications sa
           JOIN scholarships s ON s.id = sa.scholarship_id
           LEFT JOIN schools sc ON sc.id = sa.school_id
           LEFT JOIN residents r ON r.id = sa.resident_id
           WHERE sa.village_id = $1 ORDER BY sa.created_at DESC LIMIT 100`,
          [ctx.villageId]
        );
        return { schools: schools.rows, scholarships: scholarships.rows, applications: applications.rows };
      }

      // default health
      const programs = await db.query(
        `SELECT p.id, p.name, p.program_type, p.description, p.schedule_text, p.location_text, p.is_active,
                (SELECT COUNT(*)::int FROM health_visits v WHERE v.program_id = p.id) AS visit_count,
                (SELECT COALESCE(SUM(participant_count),0)::int FROM health_visits v WHERE v.program_id = p.id) AS total_participants
         FROM health_programs p WHERE p.village_id = $1 ORDER BY p.is_active DESC, p.name`,
        [ctx.villageId]
      );
      const visits = await db.query(
        `SELECT v.id, v.visit_date, v.participant_count, v.notes, p.name AS program_name, r.name AS resident_name
         FROM health_visits v JOIN health_programs p ON p.id = v.program_id
         LEFT JOIN residents r ON r.id = v.resident_id
         WHERE v.village_id = $1 ORDER BY v.visit_date DESC LIMIT 100`,
        [ctx.villageId]
      );
      return { programs: programs.rows, visits: visits.rows };
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
    const mode = typeof body?.mode === "string" ? body.mode : "";

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "services.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (mode === "health_program") {
        const parsed = healthProgramSchema.safeParse(body);
        if (!parsed.success) return { error: "Data tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO health_programs (village_id, name, program_type, description, schedule_text, location_text)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [ctx.villageId, d.name, d.programType, d.description ?? null, d.scheduleText ?? null, d.locationText ?? null]
        );
        await writeAudit(ctx, req, db, { action: "health_program.create", entityType: "health_program", entityId: r.rows[0].id, newValues: { name: d.name } });
        return { id: r.rows[0].id };
      }
      if (mode === "health_visit") {
        const parsed = healthVisitSchema.safeParse(body);
        if (!parsed.success) return { error: "Data kunjungan tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO health_visits (village_id, program_id, resident_id, visit_date, participant_count, notes, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [ctx.villageId, d.programId, d.residentId ?? null, d.visitDate, d.participantCount ?? 1, d.notes ?? null, ctx.userId]
        );
        return { id: r.rows[0].id };
      }
      if (mode === "school") {
        const parsed = schoolSchema.safeParse(body);
        if (!parsed.success) return { error: "Data sekolah tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO schools (village_id, name, level, npsn, address, headmaster, student_count, teacher_count)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [ctx.villageId, d.name, d.level, d.npsn ?? null, d.address ?? null, d.headmaster ?? null, d.studentCount ?? 0, d.teacherCount ?? 0]
        );
        await writeAudit(ctx, req, db, { action: "school.create", entityType: "school", entityId: r.rows[0].id, newValues: { name: d.name } });
        return { id: r.rows[0].id };
      }
      if (mode === "scholarship") {
        const parsed = scholarshipSchema.safeParse(body);
        if (!parsed.success) return { error: "Data beasiswa tidak valid", status: 422 };
        const d = parsed.data;
        const r = await db.query(
          `INSERT INTO scholarships (village_id, name, provider, quota, period_year)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.villageId, d.name, d.provider ?? null, d.quota ?? null, d.periodYear ?? new Date().getFullYear()]
        );
        await writeAudit(ctx, req, db, { action: "scholarship.create", entityType: "scholarship", entityId: r.rows[0].id, newValues: { name: d.name } });
        return { id: r.rows[0].id };
      }
      if (mode === "scholarship_application") {
        const parsed = scholarshipAppSchema.safeParse(body);
        if (!parsed.success) return { error: "Data pendaftar tidak valid", status: 422 };
        const d = parsed.data;
        if (d.residentId) {
          const dup = await db.query(`SELECT 1 FROM scholarship_applications WHERE scholarship_id = $1 AND resident_id = $2`, [d.scholarshipId, d.residentId]);
          if ((dup.rowCount ?? 0) > 0) return { error: "Warga sudah mendaftar beasiswa ini", status: 409 };
        }
        const r = await db.query(
          `INSERT INTO scholarship_applications (village_id, scholarship_id, resident_id, applicant_name, school_id)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [ctx.villageId, d.scholarshipId, d.residentId ?? null, d.applicantName, d.schoolId ?? null]
        );
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
    const parsed = scholarshipReviewSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { applicationId, action, rejectionReason } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "services.manage");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const cur = await db.query(`SELECT status FROM scholarship_applications WHERE id = $1 AND village_id = $2 FOR UPDATE`, [applicationId, ctx.villageId]);
      if (cur.rowCount === 0) return { error: "Pendaftaran tidak ditemukan", status: 404 };
      const current = cur.rows[0].status;

      const transitions: Record<string, { from: string[]; to: string }> = {
        verify: { from: ["candidate"], to: "verified" },
        accept: { from: ["verified"], to: "accepted" },
        reject: { from: ["candidate", "verified"], to: "rejected" },
        award: { from: ["accepted"], to: "awarded" },
      };
      const tr = transitions[action];
      if (!tr.from.includes(current)) return { error: `Tidak bisa ${action} dari status ${current}`, status: 409 };

      if (action === "verify") {
        await db.query(`UPDATE scholarship_applications SET status='verified', verified_by=$2 WHERE id=$1`, [applicationId, ctx.userId]);
      } else if (action === "accept") {
        await db.query(`UPDATE scholarship_applications SET status='accepted' WHERE id=$1`, [applicationId]);
      } else if (action === "reject") {
        await db.query(`UPDATE scholarship_applications SET status='rejected', rejection_reason=$2 WHERE id=$1`, [applicationId, rejectionReason ?? "Tidak memenuhi kriteria"]);
      } else if (action === "award") {
        await db.query(`UPDATE scholarship_applications SET status='awarded', awarded_by=$2, awarded_at=now() WHERE id=$1`, [applicationId, ctx.userId]);
      }
      await writeAudit(ctx, req, db, { action: `scholarship.${action}`, entityType: "scholarship_application", entityId: applicationId, oldValues: { status: current } });
      return { updated: true };
    });
    if ("error" in result && result.error) return fail(String(result.error), ("status" in result ? (result as { status?: number }).status : undefined) ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
