-- 022_gis.sql — objek geospasial desa (digital twin entities)
CREATE TABLE IF NOT EXISTS gis_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  object_type varchar(20) NOT NULL CHECK (object_type IN (
    'jalan','fasilitas','rumah','lahan','air','batas','titik_rawan','lainnya'
  )),
  name text NOT NULL,
  description text,
  -- GeoJSON geometry: Point [lng,lat], LineString, atau Polygon
  geometry jsonb NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,  -- kondisi, panjang, foto, dll
  linked_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  linked_proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX IF NOT EXISTS idx_gis_objects_village ON gis_objects(village_id, object_type);

-- Incident/emergency points terpisah untuk workflow penanganan
CREATE TABLE IF NOT EXISTS gis_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  gis_object_id uuid REFERENCES gis_objects(id) ON DELETE SET NULL,
  incident_type varchar(20) NOT NULL CHECK (incident_type IN (
    'banjir','longsor','kebakaran','pohon_tumbang','jalan_rusak','lainnya'
  )),
  severity varchar(10) NOT NULL DEFAULT 'sedang' CHECK (severity IN ('rendah','sedang','tinggi','darurat')),
  status varchar(12) NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported','verified','assigned','responding','resolved','post_report'
  )),
  location jsonb NOT NULL,  -- Point GeoJSON
  description text,
  reported_by uuid,
  assigned_to uuid,
  resolved_at timestamptz,
  post_incident_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gis_incidents_village ON gis_incidents(village_id, status);

ALTER TABLE gis_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE gis_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY gis_objects_tenant ON gis_objects FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE gis_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gis_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY gis_incidents_tenant ON gis_incidents FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- GeoJSON FeatureCollection per desa (untuk peta) - SECURITY DEFINER karena
-- dipakai halaman publik peta (data agregat, tanpa data pribadi)
CREATE OR REPLACE FUNCTION app.gis_features_public(p_village_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'id', g.id,
        'geometry', g.geometry,
        'properties', jsonb_build_object(
          'name', g.name, 'type', g.object_type, 'description', g.description,
          'props', g.properties
        )
      ) ORDER BY g.object_type, g.name
    ), '[]'::jsonb)
  )
  FROM gis_objects g
  WHERE g.village_id = p_village_id
$$;
GRANT EXECUTE ON FUNCTION app.gis_features_public(uuid) TO villageos_app, PUBLIC;
