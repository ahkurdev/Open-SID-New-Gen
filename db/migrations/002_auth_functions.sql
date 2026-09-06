-- 002_auth_functions.sql — SECURITY DEFINER functions untuk jalur login
-- (RLS memblokir app role sebelum claims ada; fungsi ini satu-satunya pintu)

CREATE OR REPLACE FUNCTION app.get_user_for_login(p_email citext)
RETURNS TABLE (
  id uuid, village_id uuid, email text, password_hash text, name text,
  status text, failed_login_attempts int, locked_until timestamptz
) LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT u.id, u.village_id, u.email::text, u.password_hash, u.name,
         u.status, u.failed_login_attempts, u.locked_until
  FROM users u
  WHERE u.email = p_email AND u.deleted_at IS NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION app.register_login_attempt(
  p_user_id uuid, p_email text, p_village_id uuid,
  p_success boolean, p_reason text, p_ip inet, p_user_agent text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  INSERT INTO login_activities (user_id, village_id, email, success, reason, ip, user_agent)
  VALUES (p_user_id, p_village_id, p_email, p_success, p_reason, p_ip, p_user_agent);

  IF p_user_id IS NULL THEN RETURN; END IF;

  IF p_success THEN
    UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
    WHERE id = p_user_id;
  ELSE
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
        status = CASE WHEN failed_login_attempts + 1 >= 5 THEN 'locked' ELSE status END
    WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION app.create_session(
  p_user_id uuid, p_village_id uuid, p_token_id text,
  p_device text, p_ip inet, p_user_agent text, p_expires_at timestamptz
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app, public AS $$
  INSERT INTO sessions (user_id, village_id, token_id, device, ip, user_agent, expires_at)
  VALUES (p_user_id, p_village_id, p_token_id, p_device, p_ip, p_user_agent, p_expires_at)
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO villageos_app;
