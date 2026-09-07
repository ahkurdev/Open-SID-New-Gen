-- 031_production.sql — API keys untuk integrasi eksternal
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,          -- sha256 dari key asli (key asli TIDAK disimpan)
  prefix text NOT NULL,                    -- 8 char pertama untuk identifikasi
  scopes text[] NOT NULL DEFAULT '{read}',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY api_keys_tenant ON api_keys FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Fungsi verifikasi API key (dipakai API publik terbatas)
CREATE OR REPLACE FUNCTION app.verify_api_key(p_key text)
RETURNS TABLE (village_id uuid, scopes text[])
LANGUAGE plpgsql STABLE SET search_path = app, public AS $$
DECLARE
  v_hash text := encode(sha256(p_key::bytea), 'hex');
  v_key RECORD;
BEGIN
  SELECT ak.village_id, ak.scopes INTO v_key
  FROM api_keys ak WHERE ak.key_hash = v_hash AND ak.is_active = true;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE api_keys SET last_used_at = now() WHERE key_hash = v_hash;
  RETURN QUERY SELECT v_key.village_id, v_key.scopes;
END;
$$;
