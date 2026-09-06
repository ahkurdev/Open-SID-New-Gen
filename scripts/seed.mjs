import { readdirSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { withAdmin, PG } from "./pg-common.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

await withAdmin(async (c) => {
  await c.query("BEGIN");
  try {
    await c.query(
      `INSERT INTO regions (level, code, name) VALUES
       ('provinsi', '34', 'Daerah Istimewa Yogyakarta')
       ON CONFLICT DO NOTHING`
    );
    const prov = (await c.query("SELECT id FROM regions WHERE code='34'")).rows[0].id;
    await c.query(
      `INSERT INTO regions (parent_id, level, code, name) VALUES ($1,'kabupaten','34.01','Kabupaten Sleman')
       ON CONFLICT DO NOTHING`, [prov]
    );
    const kab = (await c.query("SELECT id FROM regions WHERE code='34.01'")).rows[0].id;
    await c.query(
      `INSERT INTO regions (parent_id, level, code, name) VALUES ($1,'kecamatan','34.01.10','Cangkringan')
       ON CONFLICT DO NOTHING`, [kab]
    );
    const kec = (await c.query("SELECT id FROM regions WHERE code='34.01.10'")).rows[0].id;
    await c.query(
      `INSERT INTO regions (parent_id, level, code, name) VALUES ($1,'desa','34.01.10.2004','Sinar Mulyo')
       ON CONFLICT DO NOTHING`, [kec]
    );
    const desaRegion = (await c.query("SELECT id FROM regions WHERE code='34.01.10.2004'")).rows[0].id;
    const village = (await c.query(
      `INSERT INTO villages (region_id, code, name, address, latitude, longitude)
       VALUES ($1,'34.01.10.2004','Sinar Mulyo','Jl. Kaliurang KM 22, Cangkringan, Sleman',-7.5946,110.4381)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [desaRegion]
    )).rows[0].id;

    for (const [code, name] of [["2004.01","Dusun I"],["2004.02","Dusun II"]]) {
      await c.query(
        `INSERT INTO regions (parent_id, level, code, name) VALUES ($1,'dusun',$2,$3)
         ON CONFLICT DO NOTHING`, [desaRegion, code, name]
      );
    }

    const perms = {
      admin: ["*"],
      operator: ["resident.read","resident.create","resident.update","letter.read","letter.process","complaint.read","complaint.assign","dashboard.view"],
      sekdes: ["resident.read","letter.read","letter.approve","complaint.read","complaint.assign","finance.read","dashboard.view","report.read"],
      kades: ["resident.read","letter.read","letter.sign","finance.read","complaint.read","aid.approve","dashboard.view","report.read","public.publish"],
      bendahara: ["finance.read","finance.manage","dashboard.view"],
      warga: ["self.read","letter.request","complaint.create","event.register"],
      auditor: ["audit.read","dashboard.view","report.read"],
    };
    const roleIds = {};
    for (const [key, p] of Object.entries(perms)) {
      roleIds[key] = (await c.query(
        `INSERT INTO roles (village_id, key, name, is_system, permissions)
         VALUES ($1,$2,$3,true,$4::text[])
         ON CONFLICT (village_id, key) DO UPDATE SET name = EXCLUDED.name, permissions = EXCLUDED.permissions
         RETURNING id`, [village, key, key, p]
      )).rows[0].id;
    }

    const accounts = [
      ["admin@sinar-mulyo.test", "Admin Desa", "admin"],
      ["operator@sinar-mulyo.test", "Operator Pelayanan", "operator"],
      ["sekdes@sinar-mulyo.test", "Sekretaris Desa", "sekdes"],
      ["kades@sinar-mulyo.test", "Kepala Desa", "kades"],
      ["bendahara@sinar-mulyo.test", "Bendahara Desa", "bendahara"],
      ["auditor@sinar-mulyo.test", "Auditor", "auditor"],
      ["warga@sinar-mulyo.test", "Warga Sinar Mulyo", "warga"],
    ];
    for (const [email, name, roleKey] of accounts) {
      const hash = await bcrypt.hash("Password123!", 12);
      const u = (await c.query(
        `INSERT INTO users (village_id, email, password_hash, name)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status='active', deleted_at=NULL
         RETURNING id`, [village, email, hash, name]
      )).rows[0].id;
      await c.query(
        `INSERT INTO user_roles (user_id, role_id, village_id) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, role_id) DO NOTHING`, [u, roleIds[roleKey], village]
      );
    }

    await c.query("COMMIT");
    console.log("seed: done (desa Sinar Mulyo, 7 akun demo, password Password123!)");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
}, PG.db);
