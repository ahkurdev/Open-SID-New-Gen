-- 021_social_aid.sql — program bantuan, penerima, distribusi, welfare insight
CREATE TABLE IF NOT EXISTS aid_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  funding_source varchar(15) NOT NULL DEFAULT 'desa' CHECK (funding_source IN ('desa','provinsi','kabupaten','pusat','donatur')),
  period_start date NOT NULL,
  period_end date,
  quota integer,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{field,operator,value,label}]
  status varchar(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (village_id, name)
);

CREATE TABLE IF NOT EXISTS aid_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES aid_programs(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  applicant_name text NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate','verified','accepted','rejected','distributed','not_claimed'
  )),
  not_claimed_reason varchar(20) CHECK (not_claimed_reason IN (
    'pindah','meninggal','menolak','tidak_ditemukan','tidak_memenuhi_syarat','lainnya'
  )),
  not_claimed_note text,
  verified_by uuid,
  verified_at timestamptz,
  approved_by uuid,
  rejection_reason text,
  distribution_date date,
  distribution_note text,
  distribution_photo_paths text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, resident_id)
);
CREATE INDEX IF NOT EXISTS idx_aid_recipients_program ON aid_recipients(program_id, status);
CREATE INDEX IF NOT EXISTS idx_aid_recipients_resident ON aid_recipients(resident_id);

-- Data warga untuk welfare insight (agregat indikator per penduduk)
ALTER TABLE residents ADD COLUMN IF NOT EXISTS welfare_indicators jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN residents.welfare_indicators IS 'Indikator non-kesehatan: disable_count, elderly, single_parent, dkv_status dll. Diisi manual/pendataan. TIDAK termasuk diagnosis medis.';

ALTER TABLE aid_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aid_programs FORCE ROW LEVEL SECURITY;
CREATE POLICY aid_programs_tenant ON aid_programs FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE aid_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE aid_recipients FORCE ROW LEVEL SECURITY;
CREATE POLICY aid_recipients_tenant ON aid_recipients FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Welfare insight: rekomendasi kandidat berdasar indikator + explainability
-- HANYA rekomendasi, bukan penetapan; petugas wajib verifikasi
CREATE OR REPLACE FUNCTION app.welfare_insight_candidates(p_village_id uuid, p_program_id uuid, p_limit int DEFAULT 20)
RETURNS TABLE (
  resident_id uuid, name text, dusun_name text,
  score numeric, factors jsonb
) LANGUAGE sql STABLE SET search_path = app, public AS $$
  WITH program AS (
    SELECT id, name FROM aid_programs WHERE id = p_program_id AND village_id = p_village_id
  ),
  candidates AS (
    SELECT r.id, r.name, reg.name AS dusun_name, r.welfare_indicators AS wi,
      -- skor transparan: setiap faktor punya bobot tetap & terlihat
      (
        (COALESCE((r.welfare_indicators->>'elderly')::int, 0) * 2) +
        (COALESCE((r.welfare_indicators->>'disable_count')::int, 0) * 3) +
        (CASE WHEN r.welfare_indicators->>'single_parent' = 'true' THEN 3 ELSE 0 END) +
        (CASE WHEN r.welfare_indicators->>'no_income' = 'true' THEN 4 ELSE 0 END) +
        (CASE WHEN r.welfare_indicators->>'children_under_5' = 'true' THEN 1 ELSE 0 END)
      )::numeric AS score
    FROM residents r
    LEFT JOIN regions reg ON reg.id = r.dusun_region_id
    WHERE r.village_id = p_village_id AND r.deleted_at IS NULL
      AND r.status NOT IN ('pindah','meninggal')
      AND NOT EXISTS (
        SELECT 1 FROM aid_recipients ar
        WHERE ar.program_id = p_program_id AND ar.resident_id = r.id
      )
  )
  SELECT c.id, c.name, c.dusun_name, c.score,
    jsonb_build_object(
      'elderly', COALESCE((c.wi->>'elderly')::int, 0),
      'disable_count', COALESCE((c.wi->>'disable_count')::int, 0),
      'single_parent', COALESCE(c.wi->>'single_parent', 'false'),
      'no_income', COALESCE(c.wi->>'no_income', 'false'),
      'children_under_5', COALESCE(c.wi->>'children_under_5', 'false'),
      'disclaimer', 'Rekomendasi otomatis berdasarkan indikator terdaftar. Wajib diverifikasi petugas sebelum diputuskan.'
    )
  FROM candidates c WHERE c.score > 0
  ORDER BY c.score DESC LIMIT p_limit
$$;
