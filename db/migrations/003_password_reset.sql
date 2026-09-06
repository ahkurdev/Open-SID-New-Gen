-- 003_password_reset.sql
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip inet,
  user_agent text
);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_hash ON password_reset_tokens(token_hash);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;
-- token hash bukan data yang dibaca UI; hanya fungsi SECURITY DEFINER yang menyentuh
CREATE POLICY prt_none ON password_reset_tokens FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION app.create_password_reset(p_user_id uuid, p_token_hash text, p_expires timestamptz, p_ip inet, p_ua text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app, public AS $$
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip, user_agent)
  VALUES (p_user_id, p_token_hash, p_expires, p_ip, p_ua)
$$;

CREATE OR REPLACE FUNCTION app.consume_password_reset(p_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM password_reset_tokens
  WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;
  IF v_user IS NULL THEN RETURN NULL; END IF;
  UPDATE password_reset_tokens SET used_at = now()
  WHERE token_hash = p_token_hash AND used_at IS NULL;
  RETURN v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION app.create_password_reset(uuid, text, timestamptz, inet, text) TO villageos_app;
GRANT EXECUTE ON FUNCTION app.consume_password_reset(text) TO villageos_app;
