-- 030_analytics.sql — Executive Dashboard views + Village Health Score dimensions
-- Semua view agregat per desa - TIDAK ada data pribadi

-- Penduduk: demografi
CREATE OR REPLACE VIEW analytics_population AS
  SELECT village_id,
    COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_residents,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND gender = 'L') AS male,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND gender = 'P') AS female,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND birth_date > CURRENT_DATE - INTERVAL '5 years') AS under_5,
    COUNT(*) FILTER (WHERE deleted_at IS NULL AND birth_date < CURRENT_DATE - INTERVAL '60 years') AS elderly
  FROM residents GROUP BY village_id;

-- Pelayanan surat: SLA & status
CREATE OR REPLACE VIEW analytics_letters AS
  SELECT village_id,
    COUNT(*) AS total_letters,
    COUNT(*) FILTER (WHERE status = 'issued') AS issued,
    COUNT(*) FILTER (WHERE status NOT IN ('issued','rejected')) AS in_progress,
    ROUND((AVG(EXTRACT(EPOCH FROM (issued_at - created_at)) / 86400) FILTER (WHERE issued_at IS NOT NULL))::numeric, 1) AS avg_days_to_issue
  FROM letters GROUP BY village_id;

-- Pengaduan
CREATE OR REPLACE VIEW analytics_complaints AS
  SELECT village_id,
    COUNT(*) AS total_complaints,
    COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','rejected')) AS unresolved,
    COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved,
    ROUND((AVG(reporter_rating) FILTER (WHERE reporter_rating IS NOT NULL))::numeric, 2) AS avg_rating
  FROM complaints GROUP BY village_id;

-- Ekonomi
CREATE OR REPLACE VIEW analytics_economy AS
  SELECT village_id,
    (SELECT COUNT(*)::int FROM umkm u WHERE u.village_id = r.village_id) AS umkm_count,
    (SELECT COUNT(*)::int FROM farms f WHERE f.village_id = r.village_id) AS farm_count,
    (SELECT COALESCE(SUM(revenue - expense),0) FROM bumdes_units b WHERE b.village_id = r.village_id) AS bumdes_profit
  FROM (SELECT DISTINCT village_id FROM residents) r;

-- Bantuan
CREATE OR REPLACE VIEW analytics_aid AS
  SELECT village_id,
    (SELECT COUNT(*)::int FROM aid_programs p WHERE p.village_id = r.village_id) AS program_count,
    (SELECT COUNT(*)::int FROM aid_recipients ar WHERE ar.village_id = r.village_id AND ar.status = 'distributed') AS distributed,
    (SELECT COUNT(*)::int FROM aid_recipients ar WHERE ar.village_id = r.village_id AND ar.status = 'not_claimed') AS not_claimed
  FROM (SELECT DISTINCT village_id FROM aid_programs) r;

-- Keuangan: dari budget_plans + finance_transactions
CREATE OR REPLACE VIEW analytics_finance AS
  SELECT r.village_id, r.year,
    COALESCE((SELECT SUM(planned_amount) FROM budget_plans bp
      WHERE bp.village_id = r.village_id AND bp.year = r.year), 0) AS total_planned,
    COALESCE((SELECT SUM(ft.amount) FROM finance_transactions ft
      WHERE ft.village_id = r.village_id AND EXTRACT(YEAR FROM ft.trx_date) = r.year), 0) AS total_realized
  FROM (SELECT DISTINCT village_id, year FROM budget_plans) r;

-- Aset
CREATE OR REPLACE VIEW analytics_assets AS
  SELECT village_id,
    COUNT(*) FILTER (WHERE status != 'dihapus') AS total_assets,
    COUNT(*) FILTER (WHERE condition = 'rusak_ringan') AS rusak_ringan,
    COUNT(*) FILTER (WHERE condition = 'rusak_berat') AS rusak_berat,
    COALESCE(SUM(current_value) FILTER (WHERE status != 'dihapus'), 0) AS total_value
  FROM assets GROUP BY village_id;

-- Pembangunan (proposals)
CREATE OR REPLACE VIEW analytics_projects AS
  SELECT village_id,
    COUNT(*) AS total_proposals,
    COUNT(*) FILTER (WHERE status IN ('approved','planned')) AS planned,
    COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
    COUNT(*) FILTER (WHERE status = 'done') AS completed
  FROM proposals GROUP BY village_id;

-- Village Health Score: 6 dimensi terpisah (0-100), TANPA satu angka abstrak
-- Setiap dimensi punya rumus transparan dan ditampilkan terpisah
CREATE OR REPLACE FUNCTION app.village_health_score(p_village_id uuid)
RETURNS TABLE (dimension text, score numeric, detail text)
LANGUAGE plpgsql STABLE SET search_path = app, public AS $$
DECLARE
  v_service numeric; v_economy numeric; v_social numeric;
  v_dev numeric; v_admin numeric; v_env numeric;
  v_letters RECORD; v_complaints RECORD; v_econ RECORD;
  v_aid RECORD; v_finance RECORD; v_assets RECORD; v_projects RECORD; v_pop RECORD;
BEGIN
  SELECT * INTO v_letters FROM analytics_letters WHERE village_id = p_village_id;
  SELECT * INTO v_complaints FROM analytics_complaints WHERE village_id = p_village_id;
  SELECT * INTO v_econ FROM analytics_economy WHERE village_id = p_village_id;
  SELECT * INTO v_aid FROM analytics_aid WHERE village_id = p_village_id;
  SELECT * INTO v_finance FROM analytics_finance WHERE village_id = p_village_id AND year = EXTRACT(YEAR FROM CURRENT_DATE);
  SELECT * INTO v_assets FROM analytics_assets WHERE village_id = p_village_id;
  SELECT * INTO v_projects FROM analytics_projects WHERE village_id = p_village_id;
  SELECT * INTO v_pop FROM analytics_population WHERE village_id = p_village_id;

  -- Pelayanan: rasio surat terbit + rating pengaduan
  v_service := COALESCE(
    LEAST(100, (COALESCE(v_letters.issued,0)::numeric / GREATEST(COALESCE(v_letters.total_letters,1),1) * 60)
      + (COALESCE(v_complaints.avg_rating, 0) / 5 * 40)), 0);

  -- Ekonomi: keberadaan UMKM/farm/BUMDes (indikator aktivitas)
  v_economy := LEAST(100,
    (CASE WHEN COALESCE(v_econ.umkm_count,0) > 0 THEN 40 ELSE 0 END) +
    (CASE WHEN COALESCE(v_econ.farm_count,0) > 0 THEN 30 ELSE 0 END) +
    (CASE WHEN COALESCE(v_econ.bumdes_profit,0) > 0 THEN 30 ELSE 0 END));

  -- Sosial: bantuan tersalurkan vs tidak diambil
  v_social := COALESCE(
    CASE WHEN COALESCE(v_aid.distributed,0) + COALESCE(v_aid.not_claimed,0) = 0 THEN 50
    ELSE (v_aid.distributed::numeric / (v_aid.distributed + v_aid.not_claimed) * 100) END, 50);

  -- Pembangunan: progres proposal
  v_dev := COALESCE(
    CASE WHEN COALESCE(v_projects.total_proposals,0) = 0 THEN 50
    ELSE (v_projects.completed::numeric / v_projects.total_proposals * 100) END, 50);

  -- Administrasi: kelengkapan data penduduk (punya NIK & KK)
  v_admin := COALESCE(
    (SELECT COUNT(*) FILTER (WHERE nik IS NOT NULL AND family_id IS NOT NULL)::numeric
     / GREATEST(COUNT(*) FILTER (WHERE deleted_at IS NULL), 1) * 100
     FROM residents WHERE village_id = p_village_id AND deleted_at IS NULL), 0);

  -- Lingkungan: aset rusak berat sebagai beban
  v_env := COALESCE(
    CASE WHEN COALESCE(v_assets.total_assets,0) = 0 THEN 50
    ELSE 100 - (v_assets.rusak_berat::numeric / v_assets.total_assets * 100) END, 50);

  RETURN QUERY VALUES
    ('pelayanan', ROUND(v_service, 0), 'Rasio surat terbit (60%) + rating pengaduan (40%)'),
    ('ekonomi', ROUND(v_economy, 0), 'UMKM aktif (40) + unit produksi (30) + BUMDes laba (30)'),
    ('sosial', ROUND(v_social, 0), 'Rasio bantuan tersalurkan vs tidak diambil'),
    ('pembangunan', ROUND(v_dev, 0), 'Rasio proposal musrenbang selesai'),
    ('administrasi', ROUND(v_admin, 0), 'Kelengkapan NIK & KK penduduk'),
    ('lingkungan', ROUND(v_env, 0), '100 dikurangi rasio aset rusak berat');
END;
$$;
