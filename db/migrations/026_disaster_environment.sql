-- 026_disaster_environment.sql — emergency center, lingkungan, jadwal sampah
CREATE TABLE IF NOT EXISTS emergency_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  category varchar(15) NOT NULL CHECK (category IN (
    'banjir','longsor','kebakaran','gempa','pohon_tumbang','kecelakaan','lainnya'
  )),
  severity varchar(10) NOT NULL DEFAULT 'sedang' CHECK (severity IN ('rendah','sedang','tinggi','darurat')),
  status varchar(12) NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported','verified','team_assigned','evacuating','resolved','closed'
  )),
  location jsonb NOT NULL,  -- Point GeoJSON
  description text,
  reporter_name text,
  reporter_phone text,
  is_anonymous boolean NOT NULL DEFAULT false,
  reported_by uuid,
  team_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emergency_village ON emergency_reports(village_id, status);

-- Jalur evakuasi & tempat pengungsian (public safe data)
CREATE TABLE IF NOT EXISTS emergency_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  resource_type varchar(12) NOT NULL CHECK (resource_type IN ('jalur_evakuasi','pengungsian','posko','peralatan')),
  name text NOT NULL,
  description text,
  location jsonb,
  capacity integer,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Bank sampah / TPS
CREATE TABLE IF NOT EXISTS waste_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  point_type varchar(12) NOT NULL CHECK (point_type IN ('tps','bank_sampah','tpa','titik_wilayah')),
  name text NOT NULL,
  capacity_kg integer,
  location jsonb,
  last_pickup_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jadwal pengangkutan sampah
CREATE TABLE IF NOT EXISTS waste_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  waste_point_id uuid REFERENCES waste_points(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_text text NOT NULL,
  vehicle text,
  crew text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Penghijauan / sumber air / titik rawan lingkungan
CREATE TABLE IF NOT EXISTS environment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  asset_type varchar(15) NOT NULL CHECK (asset_type IN ('penghijauan','sumber_air','titik_banjir','titik_sampah_liar','kualitas_udara')),
  name text NOT NULL,
  description text,
  location jsonb,
  planted_count integer,
  last_check_date date,
  condition varchar(15) NOT NULL DEFAULT 'baik' CHECK (condition IN ('baik','perhatian','kritis')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS semua
ALTER TABLE emergency_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_reports_tenant ON emergency_reports FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE emergency_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_resources FORCE ROW LEVEL SECURITY;
CREATE POLICY emergency_resources_tenant ON emergency_resources FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE waste_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_points FORCE ROW LEVEL SECURITY;
CREATE POLICY waste_points_tenant ON waste_points FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE waste_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_schedules FORCE ROW LEVEL SECURITY;
CREATE POLICY waste_schedules_tenant ON waste_schedules FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE environment_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE environment_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY environment_assets_tenant ON environment_assets FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
