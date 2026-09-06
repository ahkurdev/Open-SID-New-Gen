-- 019_assets.sql — aset, QR tag, lokasi, maintenance, mutasi
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  asset_code text NOT NULL,               -- unik per desa, dipakai di QR tag
  name text NOT NULL,
  category varchar(20) NOT NULL CHECK (category IN (
    'tanah','bangunan','kendaraan','peralatan','mesin','jalan','jembatan','drainase','lampu','fasilitas_umum','lainnya'
  )),
  acquisition_date date,
  acquisition_value numeric(15,2),
  current_value numeric(15,2),
  condition varchar(10) NOT NULL DEFAULT 'baik' CHECK (condition IN ('baik','rusak_ringan','rusak_berat')),
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit varchar(15) NOT NULL DEFAULT 'unit',
  location_text text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  custodian_user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- penanggung jawab
  photo_paths text[] NOT NULL DEFAULT '{}',
  notes text,
  status varchar(12) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','dipinjam','perbaikan','dihapus')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (village_id, asset_code)
);
CREATE INDEX IF NOT EXISTS idx_assets_village ON assets(village_id, category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_code ON assets(asset_code);
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS asset_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  maintenance_type varchar(12) NOT NULL CHECK (maintenance_type IN ('rutin','perbaikan','penggantian')),
  scheduled_date date,
  performed_date date,
  description text NOT NULL,
  cost numeric(15,2),
  performed_by text,
  status varchar(10) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','done','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset ON asset_maintenance(asset_id, scheduled_date);

CREATE TABLE IF NOT EXISTS asset_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  transfer_type varchar(10) NOT NULL CHECK (transfer_type IN ('mutasi','peminjaman','penghapusan')),
  from_holder text,
  to_holder text,
  transfer_date date NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asset_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_maintenance_tenant ON asset_maintenance FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE asset_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_transfers FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_transfers_tenant ON asset_transfers FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
CREATE POLICY assets_tenant ON assets FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Nomor aset otomatis: AST/{CAT}/{SEQ} per desa
CREATE OR REPLACE FUNCTION app.next_asset_code(p_village_id uuid, p_category text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE v_seq int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq FROM assets
  WHERE village_id = p_village_id AND category = p_category;
  RETURN 'AST/' || UPPER(LEFT(p_category, 3)) || '/' || LPAD(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION app.next_asset_code(uuid, text) TO villageos_app;

-- Scan QR publik: cari aset via kode (tanpa auth, data minimal)
CREATE OR REPLACE FUNCTION app.lookup_asset_public(p_code text)
RETURNS TABLE (asset_code text, name text, category text, condition text, village_name text, status text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT a.asset_code, a.name, a.category::text, a.condition::text, v.name, a.status::text
  FROM assets a JOIN villages v ON v.id = a.village_id
  WHERE a.asset_code = p_code AND a.deleted_at IS NULL
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.lookup_asset_public(text) TO villageos_app, PUBLIC;
