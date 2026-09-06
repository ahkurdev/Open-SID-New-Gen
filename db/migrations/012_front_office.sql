-- 012_front_office.sql — layanan front office, appointment, antrean
CREATE TABLE IF NOT EXISTS service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  avg_minutes integer NOT NULL DEFAULT 15,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, name)
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  visitor_name text NOT NULL,
  appointment_date date NOT NULL,
  slot_time time NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','checked_in','served','no_show','cancelled')),
  checked_in_at timestamptz,
  served_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, appointment_date, slot_time)
);
CREATE INDEX IF NOT EXISTS idx_appointments_village_date ON appointments(village_id, appointment_date);

CREATE TABLE IF NOT EXISTS queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  service_type_id uuid NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  ticket_number integer NOT NULL,
  queue_date date NOT NULL DEFAULT CURRENT_DATE,
  visitor_name text NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','serving','served','skipped')),
  counter varchar(10),
  called_at timestamptz,
  served_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, queue_date, ticket_number)
);
CREATE INDEX IF NOT EXISTS idx_queue_village_date ON queue_tickets(village_id, queue_date, status);

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_types FORCE ROW LEVEL SECURITY;
CREATE POLICY service_types_tenant ON service_types FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_tenant ON appointments FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE queue_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY queue_tickets_tenant ON queue_tickets FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Seed layanan default
INSERT INTO service_types (village_id, name, description, avg_minutes)
SELECT v.id, x.name, x.descr, x.mins
FROM villages v, (VALUES
  ('Surat-menyurat', 'Pengurusan surat keterangan/pengantar', 20),
  ('Kependudukan', 'Koreksi & informasi data penduduk', 15),
  ('Konsultasi Umum', 'Konsultasi dengan perangkat desa', 15),
  ('Lainnya', 'Layanan lain', 10)
) AS x(name, descr, mins)
WHERE NOT EXISTS (SELECT 1 FROM service_types s WHERE s.village_id = v.id AND s.name = x.name);
