-- 025_health_education.sql — posyandu, program kesehatan, sekolah, beasiswa
-- PRIVACY BY DESIGN: data kesehatan individu MINIMAL; agregat untuk publik
CREATE TABLE IF NOT EXISTS health_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  program_type varchar(15) NOT NULL CHECK (program_type IN ('posyandu','imunisasi','kesehatan_ibu','kesehatan_lansia','sanitasi','lainnya')),
  description text,
  schedule_text text,           -- "Setiap tanggal 10 bulanan"
  location_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Kunjungan/kegiatan program kesehatan - TIDAK menyimpan diagnosis
CREATE TABLE IF NOT EXISTS health_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES health_programs(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  visit_date date NOT NULL,
  participant_count integer NOT NULL DEFAULT 1,
  notes text,                    -- catatan umum, BUKAN diagnosis/riwayat medis
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_visits ON health_visits(village_id, program_id, visit_date);

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  level varchar(15) NOT NULL CHECK (level IN ('paud','tk','sd','smp','sma','smk','lainnya')),
  npsn text,
  address text,
  headmaster text,
  student_count integer NOT NULL DEFAULT 0,
  teacher_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Beasiswa / program pendidikan
CREATE TABLE IF NOT EXISTS scholarships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text,
  period_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  quota integer,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scholarship_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  scholarship_id uuid NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  applicant_name text NOT NULL,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  status varchar(12) NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','verified','accepted','rejected','awarded')),
  verified_by uuid,
  awarded_by uuid,
  awarded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scholarship_id, resident_id)
);

-- Rekomendasi beasiswa explainable (bukan penetapan) - berdasar indikator
CREATE OR REPLACE FUNCTION app.scholarship_candidates(p_village_id uuid, p_scholarship_id uuid, p_limit int DEFAULT 15)
RETURNS TABLE (resident_id uuid, name text, score numeric, factors jsonb)
LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT r.id, r.name,
    (
      (CASE WHEN r.welfare_indicators->>'out_of_school_risk' = 'true' THEN 4 ELSE 0 END) +
      (CASE WHEN r.welfare_indicators->>'no_income' = 'true' THEN 3 ELSE 0 END) +
      (CASE WHEN r.welfare_indicators->>'single_parent' = 'true' THEN 2 ELSE 0 END) +
      (COALESCE((r.welfare_indicators->>'school_age_children')::int, 0) * 1)
    )::numeric AS score,
    jsonb_build_object(
      'out_of_school_risk', COALESCE(r.welfare_indicators->>'out_of_school_risk', 'false'),
      'no_income', COALESCE(r.welfare_indicators->>'no_income', 'false'),
      'single_parent', COALESCE(r.welfare_indicators->>'single_parent', 'false'),
      'school_age_children', COALESCE((r.welfare_indicators->>'school_age_children')::int, 0),
      'disclaimer', 'Rekomendasi berdasarkan indikator tercatat. Wajib verifikasi petugas. BUKAN penetapan penerima.'
    )
  FROM residents r
  WHERE r.village_id = p_village_id AND r.deleted_at IS NULL AND r.status NOT IN ('pindah','meninggal')
    AND NOT EXISTS (SELECT 1 FROM scholarship_applications sa WHERE sa.scholarship_id = p_scholarship_id AND sa.resident_id = r.id)
    AND (
      (r.welfare_indicators->>'out_of_school_risk' = 'true') OR
      (r.welfare_indicators->>'no_income' = 'true') OR
      (r.welfare_indicators->>'single_parent' = 'true') OR
      (COALESCE((r.welfare_indicators->>'school_age_children')::int, 0) > 0)
    )
  ORDER BY score DESC LIMIT p_limit
$$;

ALTER TABLE health_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_programs FORCE ROW LEVEL SECURITY;
CREATE POLICY health_programs_tenant ON health_programs FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE health_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY health_visits_tenant ON health_visits FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
CREATE POLICY schools_tenant ON schools FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships FORCE ROW LEVEL SECURITY;
CREATE POLICY scholarships_tenant ON scholarships FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE scholarship_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarship_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY scholarship_applications_tenant ON scholarship_applications FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
