-- 007_government_structure.sql — profil desa, perangkat, sejarah jabatan, wilayah
ALTER TABLE villages
  ADD COLUMN IF NOT EXISTS vision text,
  ADD COLUMN IF NOT EXISTS mission text,
  ADD COLUMN IF NOT EXISTS history text,
  ADD COLUMN IF NOT EXISTS area_km2 numeric(10,2),
  ADD COLUMN IF NOT EXISTS office_photo_path text;

CREATE TABLE IF NOT EXISTS officials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('perangkat','bpd','lembaga','wilayah')),
  position_title text NOT NULL,
  organization text,
  region_id uuid REFERENCES regions(id) ON DELETE SET NULL,
  nip varchar(30),
  phone varchar(30),
  photo_path text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS idx_officials_village ON officials(village_id) WHERE is_active = true;
CREATE TRIGGER trg_officials_updated BEFORE UPDATE ON officials FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS official_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  official_id uuid NOT NULL REFERENCES officials(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  position_title text NOT NULL,
  term_start date NOT NULL,
  term_end date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_official_terms_official ON official_terms(official_id, term_start DESC);

ALTER TABLE officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE officials FORCE ROW LEVEL SECURITY;
CREATE POLICY officials_tenant ON officials FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE official_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY official_terms_tenant ON official_terms FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- View publik: struktur aktif (tanpa data pribadi) untuk website
CREATE OR REPLACE VIEW public_officials AS
  SELECT o.id, o.village_id, o.name, o.type, o.position_title, o.organization,
         o.region_id, o.sort_order
  FROM officials o WHERE o.is_active = true;
GRANT SELECT ON public_officials TO villageos_app;
