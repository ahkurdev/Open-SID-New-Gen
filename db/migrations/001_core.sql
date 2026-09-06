-- 001_core.sql — extensions, helper, tabel inti, RLS dasar
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.jwt_claims() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.jwt_claims() ->> 'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_village_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.jwt_claims() ->> 'village_id', '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((app.jwt_claims() ->> 'is_platform_admin')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION app.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES regions(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('provinsi','kabupaten','kecamatan','desa','dusun','rw','rt')),
  code text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_regions_parent ON regions(parent_id);
CREATE INDEX idx_regions_level ON regions(level);
CREATE UNIQUE INDEX idx_regions_code ON regions(code) WHERE code IS NOT NULL;
CREATE TRIGGER trg_regions_updated BEFORE UPDATE ON regions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE villages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid REFERENCES regions(id),
  code text UNIQUE,
  name text NOT NULL,
  address text,
  postal_code text,
  phone text,
  email text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  logo_path text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE TRIGGER trg_villages_updated BEFORE UPDATE ON villages FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid REFERENCES villages(id) ON DELETE CASCADE,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text,
  avatar_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','locked')),
  failed_login_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
CREATE INDEX idx_users_village ON users(village_id) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid REFERENCES villages(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (village_id, key)
);
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  village_id uuid,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  village_id uuid,
  token_id text NOT NULL UNIQUE,
  device text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE login_activities (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid,
  village_id uuid,
  email text,
  success boolean NOT NULL,
  reason text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_activities_user ON login_activities(user_id, created_at DESC);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  village_id uuid,
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_village_time ON audit_logs(village_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- App role: non-superuser, tanpa BYPASSRLS
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'villageos_app') THEN
    CREATE ROLE villageos_app LOGIN PASSWORD 'villageos_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public, app TO villageos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO villageos_app;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO villageos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO villageos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO villageos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO villageos_app;

-- RLS
ALTER TABLE villages ENABLE ROW LEVEL SECURITY;
ALTER TABLE villages FORCE ROW LEVEL SECURITY;
CREATE POLICY villages_tenant ON villages FOR ALL
  USING (id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant ON users FOR ALL
  USING (id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant ON roles FOR ALL
  USING (village_id = app.current_village_id() OR village_id IS NULL OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY user_roles_tenant ON user_roles FOR ALL
  USING (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_owner ON sessions FOR ALL
  USING (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE login_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY login_activities_read ON login_activities FOR SELECT
  USING (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin());
CREATE POLICY login_activities_insert ON login_activities FOR INSERT
  WITH CHECK (true);

-- audit_logs: append-only untuk app role
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_read ON audit_logs FOR SELECT
  USING (village_id = app.current_village_id() OR app.is_platform_admin());
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
REVOKE UPDATE, DELETE ON audit_logs FROM villageos_app;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_owner ON notifications FOR ALL
  USING (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (user_id = app.current_user_id() OR village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions FORCE ROW LEVEL SECURITY;
CREATE POLICY regions_read ON regions FOR SELECT USING (true);
CREATE POLICY regions_write ON regions FOR ALL
  USING (app.is_platform_admin())
  WITH CHECK (app.is_platform_admin());
