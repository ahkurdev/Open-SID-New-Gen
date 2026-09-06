-- 028_community_events.sql — kalender desa, kegiatan, relawan, booking fasilitas
CREATE TABLE IF NOT EXISTS community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  category varchar(20) NOT NULL DEFAULT 'umum' CHECK (category IN (
    'gotong_royong','olahraga','keagamaan','pemuda','pkk','karang_taruna','kelompok_tani','umum'
  )),
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  location_text text,
  location_gis_id uuid REFERENCES gis_objects(id) ON DELETE SET NULL,
  organizer text,
  needs_volunteers boolean NOT NULL DEFAULT false,
  volunteer_target integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,   -- tampil di kalender publik
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_village ON community_events(village_id, start_time);

CREATE TABLE IF NOT EXISTS event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE CASCADE,
  participant_name text NOT NULL,
  is_volunteer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, resident_id)
);

CREATE TABLE IF NOT EXISTS facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  facility_type varchar(15) NOT NULL DEFAULT 'lainnya' CHECK (facility_type IN (
    'balai_desa','aula','lapangan','kendaraan','alat','lainnya'
  )),
  description text,
  capacity integer,
  linked_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  is_bookable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facility_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  event_id uuid REFERENCES community_events(id) ON DELETE SET NULL,
  booked_by_name text NOT NULL,
  booked_by_phone text,
  purpose text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','done','cancelled')),
  approved_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_facility ON facility_bookings(facility_id, start_time);

-- Double booking guard: overlap check via EXCLUDE constraint (btree_gist)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE facility_bookings ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    facility_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status IN ('pending','approved'));

ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events FORCE ROW LEVEL SECURITY;
CREATE POLICY community_events_tenant ON community_events FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY event_registrations_tenant ON event_registrations FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
CREATE POLICY facilities_tenant ON facilities FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE facility_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY facility_bookings_tenant ON facility_bookings FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Kalender publik: kegiatan yang akan datang (tanpa data pribadi)
CREATE OR REPLACE FUNCTION app.upcoming_events_public(p_village_id uuid, p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = app, public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id, 'title', e.title, 'category', e.category,
    'startTime', e.start_time, 'location', e.location_text,
    'organizer', e.organizer, 'needsVolunteers', e.needs_volunteers,
    'volunteerTarget', e.volunteer_target,
    'volunteerCount', (SELECT COUNT(*)::int FROM event_registrations er WHERE er.event_id = e.id AND er.is_volunteer = true)
  ) ORDER BY e.start_time), '[]'::jsonb)
  FROM community_events e
  WHERE e.village_id = p_village_id AND e.is_public = true AND e.start_time >= now()
$$;
