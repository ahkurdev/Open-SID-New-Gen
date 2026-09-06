-- 004_lockout_fix.sql — success login harus mengembalikan status locked -> active
CREATE OR REPLACE FUNCTION app.register_login_attempt(
  p_user_id uuid, p_email text, p_village_id uuid,
  p_success boolean, p_reason text, p_ip inet, p_user_agent text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  INSERT INTO login_activities (user_id, village_id, email, success, reason, ip, user_agent)
  VALUES (p_user_id, p_village_id, p_email, p_success, p_reason, p_ip, p_user_agent);

  IF p_user_id IS NULL THEN RETURN; END IF;

  IF p_success THEN
    UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(),
      status = CASE WHEN status = 'locked' THEN 'active' ELSE status END
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
