-- 006_rate_limit.sql — rate limiting login per email+IP (in-memory DB table)
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_count int;
  v_start timestamptz;
BEGIN
  SELECT count, window_start INTO v_count, v_start FROM rate_limits WHERE key = p_key;
  IF v_start IS NULL OR v_start < now() - make_interval(secs => p_window_seconds) THEN
    INSERT INTO rate_limits (key, count, window_start) VALUES (p_key, 1, now())
    ON CONFLICT (key) DO UPDATE SET count = 1, window_start = now();
    RETURN true;
  END IF;
  IF v_count >= p_max THEN
    RETURN false;
  END IF;
  UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION app.rate_limit_hit(text, int, int) TO villageos_app;

-- Cleanup job dipanggil dari app (opsional): hapus window kadaluarsa
CREATE OR REPLACE FUNCTION app.rate_limit_cleanup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = app, public AS $$
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
$$;
GRANT EXECUTE ON FUNCTION app.rate_limit_cleanup() TO villageos_app;
