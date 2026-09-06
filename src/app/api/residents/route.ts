import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { withAuth } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, handleApiError } from "@/lib/api";
import { residentSchema, residentUpdateSchema, statusChangeSchema } from "@/lib/population-validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx) return fail("Tidak terautentikasi", 401);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = url.searchParams.get("status") ?? "";
    const dusun = url.searchParams.get("dusun") ?? "";
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") ?? 25)));
    const offset = (page - 1) * limit;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.read");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const params: unknown[] = [ctx.villageId];
      const where = ["r.village_id = $1", "r.deleted_at IS NULL"];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(r.name ILIKE $${params.length} OR r.nik ILIKE $${params.length})`);
      }
      if (status) { params.push(status); where.push(`r.status = $${params.length}`); }
      if (dusun) { params.push(dusun); where.push(`r.dusun_region_id = $${params.length}`); }

      const whereSql = where.join(" AND ");
      const count = await db.query(`SELECT COUNT(*)::int AS c FROM residents r WHERE ${whereSql}`, params);
      const rows = await db.query(
        `SELECT r.id, r.nik, r.name, r.gender, r.birth_place, r.birth_date, r.family_status,
                r.marital_status, r.education, r.occupation, r.status, r.rt, r.rw,
                r.phone, r.family_id, f.kk_number, reg.name AS dusun_name
         FROM residents r
         LEFT JOIN families f ON f.id = r.family_id
         LEFT JOIN regions reg ON reg.id = r.dusun_region_id
         WHERE ${whereSql}
         ORDER BY r.name LIMIT ${limit} OFFSET ${offset}`,
        params
      );
      return {
        residents: rows.rows,
        total: count.rows[0].c,
        page,
        limit,
      };
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
    const parsed = residentSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const d = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.create");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      if (d.nik) {
        const dup = await db.query(
          `SELECT id, name FROM residents WHERE nik = $1 AND deleted_at IS NULL`, [d.nik]
        );
        if ((dup.rowCount ?? 0) > 0) {
          return { error: `NIK sudah terdaftar atas nama ${dup.rows[0].name}`, status: 409 };
        }
      }
      if (d.familyId) {
        const fam = await db.query(`SELECT 1 FROM families WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`, [d.familyId, ctx.villageId]);
        if (fam.rowCount === 0) return { error: "Keluarga tidak ditemukan", status: 422 };
      }

      const r = await db.query(
        `INSERT INTO residents (village_id, family_id, nik, name, gender, birth_place, birth_date,
           family_status, marital_status, education, occupation, religion, address, rt, rw,
           dusun_region_id, phone, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [ctx.villageId, d.familyId ?? null, d.nik || null, d.name, d.gender,
         d.birthPlace ?? null, d.birthDate || null, d.familyStatus ?? null,
         d.maritalStatus ?? null, d.education ?? null, d.occupation ?? null,
         d.religion ?? null, d.address ?? null, d.rt ?? null, d.rw ?? null,
         d.dusunRegionId ?? null, d.phone ?? null, d.status, ctx.userId]
      );
      const residentId = r.rows[0].id;

      await db.query(
        `INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description, created_by)
         VALUES ($1,$2,'terdaftar', CURRENT_DATE, $3, $4)`,
        [ctx.villageId, residentId, `Penduduk terdaftar: ${d.name}`, ctx.userId]
      );

      if (d.familyId && d.familyStatus === "kepala_keluarga") {
        await db.query(`UPDATE families SET head_resident_id = $2, updated_by = $3 WHERE id = $1`, [d.familyId, residentId, ctx.userId]);
      }

      await writeAudit(ctx, req, db, {
        action: "resident.create", entityType: "resident", entityId: residentId, newValues: d,
      });
      return { id: residentId };
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

    if (body?.eventType) {
      const parsed = statusChangeSchema.safeParse(body);
      if (!parsed.success) return fail("Data tidak valid", 422);
      const d = parsed.data;

      const result = await withAuth(ctx, async (db) => {
        const allowed = await hasPermission(ctx, db, "resident.update");
        if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

        const target = await db.query(
          `SELECT id, status FROM residents WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`,
          [d.id, ctx.villageId]
        );
        if (target.rowCount === 0) return { error: "Penduduk tidak ditemukan", status: 404 };

        await db.query(
          `UPDATE residents SET previous_status = status, status = $2, status_changed_at = now(),
             death_date = COALESCE($3, death_date), updated_by = $4 WHERE id = $1`,
          [d.id, d.newStatus, d.deathDate ?? null, ctx.userId]
        );
        await db.query(
          `INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [ctx.villageId, d.id, d.eventType, d.eventDate, d.description ?? null, ctx.userId]
        );
        await writeAudit(ctx, req, db, {
          action: `resident.${d.eventType}`, entityType: "resident", entityId: d.id,
          oldValues: { status: target.rows[0].status }, newValues: { status: d.newStatus, description: d.description },
        });
        return { updated: true };
      });
      if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
      return ok(result);
    }

    const parsed = residentUpdateSchema.safeParse(body);
    if (!parsed.success) return fail("Data tidak valid", 422);
    const { id, ...fields } = parsed.data;

    const result = await withAuth(ctx, async (db) => {
      const allowed = await hasPermission(ctx, db, "resident.update");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };

      const existing = await db.query(
        `SELECT * FROM residents WHERE id = $1 AND village_id = $2 AND deleted_at IS NULL`, [id, ctx.villageId]
      );
      if (existing.rowCount === 0) return { error: "Penduduk tidak ditemukan", status: 404 };
      const old = existing.rows[0];

      if (fields.nik && fields.nik !== old.nik) {
        const dup = await db.query(`SELECT 1 FROM residents WHERE nik = $1 AND id <> $2 AND deleted_at IS NULL`, [fields.nik, id]);
        if ((dup.rowCount ?? 0) > 0) return { error: "NIK sudah dipakai penduduk lain", status: 409 };
      }

      const map: Record<string, string> = {
        nik: "nik", name: "name", gender: "gender", birthPlace: "birth_place",
        birthDate: "birth_date", familyId: "family_id", familyStatus: "family_status",
        maritalStatus: "marital_status", education: "education", occupation: "occupation",
        religion: "religion", address: "address", rt: "rt", rw: "rw",
        dusunRegionId: "dusun_region_id", phone: "phone",
      };
      const sets: string[] = [];
      const values: unknown[] = [id, ctx.userId];
      let i = values.length;
      for (const [k, col] of Object.entries(map)) {
        const v = fields[k as keyof typeof fields];
        if (v !== undefined) {
          values.push(k === "nik" || k === "birthDate" ? (v || null) : v);
          sets.push(`${col} = $${++i}`);
        }
      }
      if (sets.length > 0) {
        await db.query(`UPDATE residents SET ${sets.join(", ")}, updated_by = $2 WHERE id = $1`, values);
        await db.query(
          `INSERT INTO resident_events (village_id, resident_id, event_type, event_date, description, metadata, created_by)
           VALUES ($1,$2,'perubahan_data', CURRENT_DATE, 'Perubahan data penduduk', $3, $4)`,
          [ctx.villageId, id, JSON.stringify(fields), ctx.userId]
        );
        await writeAudit(ctx, req, db, {
          action: "resident.update", entityType: "resident", entityId: id,
          oldValues: { name: old.name, nik: old.nik }, newValues: fields,
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
      const allowed = await hasPermission(ctx, db, "resident.delete");
      if (!allowed) return { error: "Tidak memiliki izin", status: 403 };
      const r = await db.query(
        `UPDATE residents SET deleted_at = now(), updated_by = $2 WHERE id = $1 AND village_id = $3`,
        [id, ctx.userId, ctx.villageId]
      );
      await writeAudit(ctx, req, db, { action: "resident.delete", entityType: "resident", entityId: id });
      return { deleted: (r.rowCount ?? 0) > 0 };
    });
    if ("error" in result && result.error) return fail(result.error, result.status ?? 400);
    return ok(result);
  } catch (e) {
    return handleApiError(e);
  }
}
