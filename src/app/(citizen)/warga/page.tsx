import { redirect } from "next/navigation";
import { getSession } from "@/lib/session-server";
import { withAuth } from "@/lib/db";
import { CitizenDashboard, type Data } from "./citizen-dashboard";

export const dynamic = "force-dynamic";

export default async function WargaPage() {
  const session = (await getSession())!;
  if (!session.villageId) redirect("/onboarding");

  const data = await withAuth(session, async (db) => {
    const me = await db.query(
      `SELECT u.resident_id, v.name AS village_name FROM users u
       LEFT JOIN villages v ON v.id = u.village_id WHERE u.id = $1`,
      [session.userId]
    );
    const row = me.rows[0];

    let resident = null;
    let family = null;
    let letters: unknown[] = [];
    let corrections: unknown[] = [];

    if (row?.resident_id) {
      const r = await db.query(
        `SELECT r.id, r.nik, r.name, r.gender, r.birth_date, r.status, r.occupation,
                r.phone, r.address, r.rt, r.rw, r.card_code, reg.name AS dusun_name
         FROM residents r LEFT JOIN regions reg ON reg.id = r.dusun_region_id
         WHERE r.id = $1 AND r.deleted_at IS NULL`,
        [row.resident_id]
      );
      resident = r.rows[0] ?? null;

      if (resident?.id) {
        const fam = await db.query(
          `SELECT f.kk_number, f.address, f.rt, f.rw, head.name AS head_name,
                  (SELECT json_agg(json_build_object('name', m.name, 'status', m.family_status) ORDER BY m.birth_date)
                     FROM residents m WHERE m.family_id = f.id AND m.deleted_at IS NULL) AS members
           FROM families f LEFT JOIN residents head ON head.id = f.head_resident_id
           WHERE f.id = (SELECT family_id FROM residents WHERE id = $1)`,
          [resident.id]
        );
        family = fam.rows[0] ?? null;

        letters = (await db.query(
          `SELECT l.id, l.status, l.letter_number, l.created_at, t.name AS template_name
           FROM letters l JOIN letter_templates t ON t.id = l.template_id
           WHERE l.resident_id = $1 AND l.deleted_at IS NULL
           ORDER BY l.created_at DESC LIMIT 20`,
          [resident.id]
        )).rows;

        corrections = (await db.query(
          `SELECT id, field_name, requested_value, status, created_at, review_notes
           FROM correction_requests WHERE resident_id = $1 ORDER BY created_at DESC LIMIT 20`,
          [resident.id]
        )).rows;
      }
    }

    const activeTemplates = (await db.query(
      `SELECT id, name, description, form_schema FROM letter_templates WHERE village_id = $1 AND is_active = true ORDER BY name`,
      [session.villageId]
    )).rows.map((t) => ({ ...t, form_schema_placeholder: t.form_schema, form_schema: undefined }));

    return { profile: row, resident, family, letters, corrections, activeTemplates };
  });

  return <CitizenDashboard session={session} data={data as unknown as Data} />;
}
