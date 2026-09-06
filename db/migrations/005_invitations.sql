-- 005_invitations.sql — undangan user, verifikasi email, multi-village readiness
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  email citext NOT NULL,
  role_ids uuid[] NOT NULL DEFAULT '{}',
  token_hash text NOT NULL,
  invited_by uuid,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, email)
);
CREATE INDEX IF NOT EXISTS idx_invitations_hash ON invitations(token_hash);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant ON invitations FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Pintu publik: consume token undangan, buat user verified + assign role
CREATE OR REPLACE FUNCTION app.accept_invitation(
  p_token_hash text, p_name text, p_password_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_inv RECORD;
  v_user uuid;
BEGIN
  SELECT * INTO v_inv FROM invitations
  WHERE token_hash = p_token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE email = v_inv.email AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'EMAIL_EXISTS';
  END IF;

  INSERT INTO users (village_id, email, password_hash, name, email_verified_at, status)
  VALUES (v_inv.village_id, v_inv.email, p_password_hash, p_name, now(), 'active')
  RETURNING id INTO v_user;

  UPDATE invitations SET accepted_at = now() WHERE id = v_inv.id;

  INSERT INTO user_roles (user_id, role_id, village_id)
  SELECT v_user, r, v_inv.village_id FROM unnest(v_inv.role_ids) AS r;

  RETURN v_user;
END;
$$;

-- Pintu publik: baca info undangan (email + nama desa) untuk halaman accept
CREATE OR REPLACE FUNCTION app.peek_invitation(p_token_hash text)
RETURNS TABLE (email text, village_name text, expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT i.email::text, v.name, i.expires_at
  FROM invitations i JOIN villages v ON v.id = i.village_id
  WHERE i.token_hash = p_token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION app.accept_invitation(text, text, text) TO villageos_app;
GRANT EXECUTE ON FUNCTION app.peek_invitation(text) TO villageos_app;

UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;
