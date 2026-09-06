-- 011_citizen_portal.sql — portal warga: link user-resident, koreksi data, kartu digital
ALTER TABLE users ADD COLUMN IF NOT EXISTS resident_id uuid REFERENCES residents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  field_name text NOT NULL,
  current_value text,
  requested_value text NOT NULL,
  reason text,
  status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_corrections_village ON correction_requests(village_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_resident ON correction_requests(resident_id);

ALTER TABLE correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_requests FORCE ROW LEVEL SECURITY;
-- warga hanya melihat koreksinya sendiri; petugas desa melihat semua di desanya
CREATE POLICY corrections_tenant ON correction_requests FOR ALL
  USING (
    village_id = app.current_village_id()
    OR user_id = app.current_user_id()
    OR app.is_platform_admin()
  )
  WITH CHECK (village_id = app.current_village_id() OR user_id = app.current_user_id() OR app.is_platform_admin());

-- Kode verifikasi kartu digital warga
ALTER TABLE residents ADD COLUMN IF NOT EXISTS card_code varchar(12);
UPDATE residents SET card_code = substr(md5(random()::text), 1, 12) WHERE card_code IS NULL;

-- Link akun warga demo ke penduduk
DO $$
DECLARE
  v_village uuid;
  v_resident uuid;
  v_user uuid;
BEGIN
  SELECT id INTO v_village FROM villages WHERE code = '34.01.10.2004';
  IF v_village IS NULL THEN RETURN; END IF;

  SELECT id INTO v_resident FROM residents
  WHERE village_id = v_village AND name = 'Warga Demo Sinar Mulyo' AND deleted_at IS NULL LIMIT 1;
  IF v_resident IS NULL THEN
    INSERT INTO residents (village_id, nik, name, gender, birth_date, status, family_status, card_code)
    VALUES (v_village, '3401011205900007', 'Warga Demo Sinar Mulyo', 'L', '1990-05-12', 'tetap', 'kepala_keluarga', substr(md5(random()::text), 1, 12))
    RETURNING id INTO v_resident;
  END IF;

  SELECT id INTO v_user FROM users WHERE email = 'warga@sinar-mulyo.test';
  IF v_user IS NOT NULL THEN
    UPDATE users SET resident_id = v_resident WHERE id = v_user;
  END IF;
END $$;
