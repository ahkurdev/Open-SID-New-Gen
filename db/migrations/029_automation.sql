-- 029_automation.sql — automation rules (WHEN/IF/THEN), AI chat log, event bus
CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- struktur: WHEN (trigger) IF (condition) THEN (action)
  trigger_type varchar(25) NOT NULL CHECK (trigger_type IN (
    'complaint_overdue','letter_submitted','letter_approved','contract_expiring',
    'stock_low','aid_pending','booking_requested','task_overdue','sensor_warning','device_offline'
  )),
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {days:3} / {days:30} / {threshold:10} dll
  condition_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- filter tambahan
  action_type varchar(25) NOT NULL CHECK (action_type IN (
    'create_notification','create_task','flag_warning','generate_log'
  )),
  action_config jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {message:"...", assign_role:"..."}
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  run_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  target_type varchar(30) NOT NULL,
  target_id uuid,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automation_runs ON automation_runs(village_id, rule_id, created_at);

-- AI Copilot chat log (audit percakapan, permission-scoped)
CREATE TABLE IF NOT EXISTS ai_chat_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  data_scope jsonb NOT NULL DEFAULT '[]'::jsonb,  -- query apa yang dijalankan (transparansi)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_rules_tenant ON automation_rules FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_runs_tenant ON automation_runs FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());
ALTER TABLE ai_chat_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_log FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_chat_log_tenant ON ai_chat_log FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Engine evaluasi rule: dipanggil API /api/automation/evaluate (cron/manual)
-- Mengembalikan jumlah run yang dibuat. Setiap run tercatat di automation_runs.
CREATE OR REPLACE FUNCTION app.evaluate_automation_rules(p_village_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = app, public AS $$
DECLARE
  v_rule RECORD;
  v_run_count integer := 0;
  v_target RECORD;
  v_should_fire boolean;
BEGIN
  FOR v_rule IN
    SELECT * FROM automation_rules
    WHERE village_id = p_village_id AND is_active = true
  LOOP
    CASE v_rule.trigger_type
      WHEN 'complaint_overdue' THEN
        FOR v_target IN
          SELECT id, ticket_no, title FROM complaints
          WHERE village_id = p_village_id
            AND status NOT IN ('resolved','closed','rejected')
            AND created_at < now() - make_interval(days => COALESCE((v_rule.trigger_config->>'days')::int, 3))
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs ar
              WHERE ar.rule_id = v_rule.id AND ar.target_id = complaints.id
            )
        LOOP
          INSERT INTO automation_runs (village_id, rule_id, target_type, target_id, message)
          VALUES (p_village_id, v_rule.id, 'complaint', v_target.id,
            format('Pengaduan %s ("%s") melebihi %s hari belum selesai', v_target.ticket_no, v_target.title, COALESCE((v_rule.trigger_config->>'days')::int, 3)));
          v_run_count := v_run_count + 1;
        END LOOP;

      WHEN 'contract_expiring' THEN
        FOR v_target IN
          SELECT id, contract_no, title FROM contracts
          WHERE village_id = p_village_id AND status = 'active'
            AND end_date IS NOT NULL
            AND end_date <= CURRENT_DATE + make_interval(days => COALESCE((v_rule.trigger_config->>'days')::int, 30))
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs ar
              WHERE ar.rule_id = v_rule.id AND ar.target_id = contracts.id
            )
        LOOP
          INSERT INTO automation_runs (village_id, rule_id, target_type, target_id, message)
          VALUES (p_village_id, v_rule.id, 'contract', v_target.id,
            format('Kontrak %s ("%s") akan berakhir', v_target.contract_no, v_target.title));
          v_run_count := v_run_count + 1;
        END LOOP;

      WHEN 'aid_pending' THEN
        FOR v_target IN
          SELECT id, applicant_name FROM aid_recipients
          WHERE village_id = p_village_id AND status = 'accepted'
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs ar
              WHERE ar.rule_id = v_rule.id AND ar.target_id = aid_recipients.id
            )
        LOOP
          INSERT INTO automation_runs (village_id, rule_id, target_type, target_id, message)
          VALUES (p_village_id, v_rule.id, 'aid_recipient', v_target.id,
            format('Bantuan untuk %s sudah disetujui tapi belum disalurkan', v_target.applicant_name));
          v_run_count := v_run_count + 1;
        END LOOP;

      WHEN 'task_overdue' THEN
        FOR v_target IN
          SELECT id, title FROM tasks
          WHERE village_id = p_village_id AND status NOT IN ('done','cancelled')
            AND due_date IS NOT NULL AND due_date < CURRENT_DATE
            AND NOT EXISTS (
              SELECT 1 FROM automation_runs ar
              WHERE ar.rule_id = v_rule.id AND ar.target_id = tasks.id
            )
        LOOP
          INSERT INTO automation_runs (village_id, rule_id, target_type, target_id, message)
          VALUES (p_village_id, v_rule.id, 'task', v_target.id,
            format('Tugas "%s" melewati tenggat', v_target.title));
          v_run_count := v_run_count + 1;
        END LOOP;

      ELSE
        -- trigger lain (letter, sensor, device) menyusul di fase Smart Village/IoT
        NULL;
    END CASE;

    UPDATE automation_rules SET last_run_at = now(), run_count = run_count + 1 WHERE id = v_rule.id;
  END LOOP;
  RETURN v_run_count;
END;
$$;
GRANT EXECUTE ON FUNCTION app.evaluate_automation_rules(uuid) TO villageos_app;
