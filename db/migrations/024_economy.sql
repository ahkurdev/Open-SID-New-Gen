-- 024_economy.sql — UMKM, produk, BUMDes unit usaha, job & skill
CREATE TABLE IF NOT EXISTS umkm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  owner_resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  owner_name text NOT NULL,
  business_name text NOT NULL,
  category varchar(30) NOT NULL DEFAULT 'lainnya' CHECK (category IN (
    'kuliner','fashion','kerajinan','pertanian','jasa','teknologi','lainnya'
  )),
  description text,
  contact_phone text,
  address text,
  location_gis_id uuid REFERENCES gis_objects(id) ON DELETE SET NULL,
  is_featured boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,  -- tampil di website publik
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_umkm_village ON umkm(village_id, is_public);

CREATE TABLE IF NOT EXISTS umkm_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  umkm_id uuid NOT NULL REFERENCES umkm(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  unit varchar(20) NOT NULL DEFAULT 'pcs',
  stock integer NOT NULL DEFAULT 0,
  photo_path text,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_umkm_products ON umkm_products(umkm_id);

CREATE TABLE IF NOT EXISTS product_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES umkm_products(id) ON DELETE CASCADE,
  buyer_name text NOT NULL,
  buyer_phone text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  note text,
  status varchar(10) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','contacted','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bumdes_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  business_type text NOT NULL,
  description text,
  manager_name text,
  capital numeric(14,2) NOT NULL DEFAULT 0,
  revenue numeric(14,2) NOT NULL DEFAULT 0,
  expense numeric(14,2) NOT NULL DEFAULT 0,
  period_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, unit_name, period_year)
);

CREATE TABLE IF NOT EXISTS job_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  employer text NOT NULL,
  description text,
  salary_info text,
  location_text text,
  is_open boolean NOT NULL DEFAULT true,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resident_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  proficiency varchar(10) NOT NULL DEFAULT 'dasar' CHECK (proficiency IN ('dasar','menengah','mahir')),
  is_public_profile boolean NOT NULL DEFAULT false,  -- izin tampil di pencarian
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resident_id, skill_name)
);

CREATE TABLE IF NOT EXISTS trainings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  organizer text,
  start_date date,
  location_text text,
  quota integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  training_id uuid NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_id, resident_id)
);

ALTER TABLE umkm ENABLE ROW LEVEL SECURITY;
ALTER TABLE umkm FORCE ROW LEVEL SECURITY;
CREATE POLICY umkm_tenant ON umkm FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE umkm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE umkm_products FORCE ROW LEVEL SECURITY;
CREATE POLICY umkm_products_tenant ON umkm_products FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE product_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY product_orders_tenant ON product_orders FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE bumdes_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE bumdes_units FORCE ROW LEVEL SECURITY;
CREATE POLICY bumdes_units_tenant ON bumdes_units FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_listings FORCE ROW LEVEL SECURITY;
CREATE POLICY job_listings_tenant ON job_listings FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE resident_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE resident_skills FORCE ROW LEVEL SECURITY;
CREATE POLICY resident_skills_tenant ON resident_skills FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE trainings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainings FORCE ROW LEVEL SECURITY;
CREATE POLICY trainings_tenant ON trainings FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE training_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY training_registrations_tenant ON training_registrations FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Katalog publik UMKM (tanpa data pribadi owner selain nama usaha+kontak usaha)
CREATE OR REPLACE FUNCTION app.umkm_catalog_public(p_village_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id, 'businessName', u.business_name, 'category', u.category,
      'description', u.description, 'contactPhone', u.contact_phone,
      'isFeatured', u.is_featured,
      'products', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'price', p.price, 'unit', p.unit,
          'isFeatured', p.is_featured
        ) ORDER BY p.is_featured DESC, p.name), '[]'::jsonb)
        FROM umkm_products p WHERE p.umkm_id = u.id
      )
    ) ORDER BY u.is_featured DESC, u.business_name
  )
  FROM umkm u
  WHERE u.village_id = p_village_id AND u.is_public = true
$$;
