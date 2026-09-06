-- 008_population.sql — registry penduduk, keluarga, timeline
CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  kk_number varchar(20),
  address text,
  rt varchar(5),
  rw varchar(5),
  dusun_region_id uuid REFERENCES regions(id),
  head_resident_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (village_id, kk_number)
);
CREATE INDEX IF NOT EXISTS idx_families_village ON families(village_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON families FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  family_id uuid REFERENCES families(id) ON DELETE SET NULL,
  nik varchar(16) UNIQUE,
  kk_number varchar(20),
  name text NOT NULL,
  gender char(1) NOT NULL CHECK (gender IN ('L','P')),
  birth_place text,
  birth_date date,
  family_status varchar(20), -- kepala_keluarga, istri, anak, fam_lain
  marital_status varchar(15) CHECK (marital_status IN ('belum_kawin','kawin','cerai_hidup','cerai_mati') OR marital_status IS NULL),
  education varchar(30),
  occupation varchar(60),
  religion varchar(20),
  citizenship varchar(3) NOT NULL DEFAULT 'WNI',
  address text,
  rt varchar(5),
  rw varchar(5),
  dusun_region_id uuid REFERENCES regions(id),
  status varchar(15) NOT NULL DEFAULT 'tetap' CHECK (status IN ('tetap','tidak_tetap','pendatang','pindah','meninggal')),
  previous_status varchar(15),
  status_changed_at timestamptz,
  death_date date,
  phone varchar(20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_residents_village ON residents(village_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_residents_nik ON residents(nik);
CREATE INDEX IF NOT EXISTS idx_residents_family ON residents(family_id);
CREATE INDEX IF NOT EXISTS idx_residents_name_trgm ON residents USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_residents_updated BEFORE UPDATE ON residents FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE families ADD CONSTRAINT fk_families_head
  FOREIGN KEY (head_resident_id) REFERENCES residents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS resident_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  event_type varchar(20) NOT NULL CHECK (event_type IN (
    'terdaftar','lahir','datang','pindah','meninggal','perubahan_kk','pecah_kk','gabung_kk','perubahan_data'
  )),
  event_date date NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resident_events_resident ON resident_events(resident_id, event_date);

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE families FORCE ROW LEVEL SECURITY;
CREATE POLICY families_tenant ON families FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents FORCE ROW LEVEL SECURITY;
CREATE POLICY residents_tenant ON residents FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE resident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_events FORCE ROW LEVEL SECURITY;
CREATE POLICY resident_events_tenant ON resident_events FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Deteksi duplikat NIK/nama serupa (pakai trigram)
CREATE OR REPLACE VIEW potential_duplicate_residents AS
  SELECT a.id AS id_a, b.id AS id_b, a.village_id, a.name AS name_a, b.name AS name_b,
         a.nik AS nik_a, b.nik AS nik_b, a.birth_date AS birth_a, b.birth_date AS birth_b,
         similarity(a.name, b.name) AS name_sim
  FROM residents a JOIN residents b
    ON a.id < b.id AND a.village_id = b.village_id
   AND a.deleted_at IS NULL AND b.deleted_at IS NULL
  WHERE (a.nik IS NOT NULL AND a.nik = b.nik)
     OR (similarity(a.name, b.name) > 0.75
         AND a.birth_date IS NOT DISTINCT FROM b.birth_date
         AND a.birth_date IS NOT NULL);
