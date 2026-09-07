-- 032_verify_api_key_volatile.sql — fix verify_api_key jadi VOLATILE (ada UPDATE last_used_at)
CREATE OR REPLACE FUNCTION app.verify_api_key(p_key text)
RETURNS TABLE (village_id uuid, scopes text[])
LANGUAGE plpgsql VOLATILE SET search_path = app, public AS $$
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
