-- 023_agriculture.sql — pertanian, peternakan, perikanan, food security
CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  sector varchar(12) NOT NULL CHECK (sector IN ('pertanian','peternakan','perikanan')),
  -- pemilik/pengelola
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  -- pertanian
  commodity_name text,             -- padi, jagung, cabai, ...
  land_area_m2 numeric(12,2),      -- luas lahan (pertanian)
  planting_season text,            -- musim tanam (MH 2026/1)
  -- peternakan
  livestock_type text,             -- sapi, kambing, ayam, ...
  livestock_count integer,
  -- perikanan
  pond_count integer,              -- jumlah kolam
  fish_type text,
  production_kg numeric(12,2),
  -- umum
  location_gis_id uuid REFERENCES gis_objects(id) ON DELETE SET NULL,
  constraints_note text,           -- kendala
  last_harvest_date date,
  last_harvest_kg numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_farms_village ON farms(village_id, sector);

-- Riwayat produksi (panen)
CREATE TABLE IF NOT EXISTS farm_harvests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  harvest_date date NOT NULL,
  commodity text NOT NULL,
  quantity_kg numeric(12,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_farm_harvests_farm ON farm_harvests(farm_id, harvest_date);

-- Food security indicators (view agregat)
CREATE OR REPLACE VIEW food_security_summary AS
  SELECT village_id,
    sector,
    COUNT(*) AS unit_count,
    COALESCE(SUM(land_area_m2), 0) AS total_land_m2,
    COALESCE(SUM(livestock_count), 0) AS total_livestock,
    COALESCE(SUM(production_kg), 0) AS total_production_kg,
    COALESCE(SUM(last_harvest_kg), 0) AS last_harvest_total_kg
  FROM farms GROUP BY village_id, sector;

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE farms FORCE ROW LEVEL SECURITY;
CREATE POLICY farms_tenant ON farms FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE farm_harvests ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_harvests FORCE ROW LEVEL SECURITY;
CREATE POLICY farm_harvests_tenant ON farm_harvests FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
