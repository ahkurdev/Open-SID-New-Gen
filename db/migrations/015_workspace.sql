-- 015_workspace.sql — task management, laporan kegiatan harian, disposisi
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status varchar(12) NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority varchar(8) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_by uuid,
  due_date date,
  completed_at timestamptz,
  recurrence varchar(12) NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tasks_village ON tasks(village_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS activity_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  activity text NOT NULL,
  location text,
  description text,
  photos text[] NOT NULL DEFAULT '{}',
  output text,
  hours numeric(4,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date, activity)
);
CREATE INDEX IF NOT EXISTS idx_activity_reports_village ON activity_reports(village_id, report_date DESC);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant ON tasks FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE activity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_reports_tenant ON activity_reports FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Agenda rapat + notulen + keputusan
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  meeting_date date NOT NULL,
  start_time time,
  location text,
  agenda text,
  minutes text,
  decisions text[] NOT NULL DEFAULT '{}',
  attendees text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings FORCE ROW LEVEL SECURITY;
CREATE POLICY meetings_tenant ON meetings FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
