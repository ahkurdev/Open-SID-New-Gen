-- 013_complaints.sql — pengaduan, aspirasi, case management
CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  ticket_no text NOT NULL,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  reporter_name text NOT NULL,          -- nama samaran utk anonim
  is_anonymous boolean NOT NULL DEFAULT false,
  category varchar(20) NOT NULL CHECK (category IN (
    'jalan','sampah','pelayanan','bantuan','keamanan','fasilitas','lampu','banjir','administrasi','lainnya'
  )),
  title text NOT NULL,
  description text NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_text text,
  photos text[] NOT NULL DEFAULT '{}',
  priority varchar(8) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status varchar(20) NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','verified','assigned','in_progress','resolved','closed','rejected'
  )),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution_note text,
  reporter_rating integer CHECK (reporter_rating BETWEEN 1 AND 5),
  sla_due_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (village_id, ticket_no)
);
CREATE INDEX IF NOT EXISTS idx_complaints_village_status ON complaints(village_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_complaints_assigned ON complaints(assigned_to) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS complaint_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  complaint_id uuid NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  action varchar(20) NOT NULL CHECK (action IN ('submit','verify','assign','progress','resolve','close','reject','rate')),
  actor_user_id uuid,
  actor_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaint_actions ON complaint_actions(complaint_id);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE ROW LEVEL SECURITY;
CREATE POLICY complaints_tenant ON complaints FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE complaint_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY complaint_actions_tenant ON complaint_actions FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- SLA default per kategori (hari): konfigurabel per desa
CREATE TABLE IF NOT EXISTS complaint_sla (
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  category varchar(20) NOT NULL,
  days integer NOT NULL DEFAULT 7,
  PRIMARY KEY (village_id, category)
);
ALTER TABLE complaint_sla ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_sla FORCE ROW LEVEL SECURITY;
CREATE POLICY complaint_sla_tenant ON complaint_sla FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

INSERT INTO complaint_sla (village_id, category, days)
SELECT v.id, x.cat, x.days
FROM villages v, (VALUES
  ('jalan',7),('sampah',3),('pelayanan',2),('bantuan',5),('keamanan',1),
  ('fasilitas',7),('lampu',5),('banjir',2),('administrasi',3),('lainnya',7)
) AS x(cat, days)
WHERE NOT EXISTS (SELECT 1 FROM complaint_sla s WHERE s.village_id = v.id AND s.category = x.cat);

-- Escalation view: pengaduan melewati SLA dan belum resolved
CREATE OR REPLACE VIEW overdue_complaints AS
  SELECT id, village_id, ticket_no, category, title, status, assigned_to, sla_due_at
  FROM complaints
  WHERE deleted_at IS NULL AND sla_due_at IS NOT NULL AND sla_due_at < now()
    AND status NOT IN ('resolved','closed','rejected');
