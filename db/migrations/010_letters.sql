-- 010_letters.sql — Letter templates (no-code builder) + pengajuan + workflow
CREATE TABLE IF NOT EXISTS letter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  code varchar(30) NOT NULL,
  name text NOT NULL,
  description text,
  form_schema jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{key,label,type,required,options?}]
  approval_steps text[] NOT NULL DEFAULT '{operator,sekdes,kades}',
  sla_days integer NOT NULL DEFAULT 5,
  body_template text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (village_id, code)
);
CREATE TRIGGER trg_letter_templates_updated BEFORE UPDATE ON letter_templates FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES letter_templates(id) ON DELETE RESTRICT,
  resident_id uuid REFERENCES residents(id) ON DELETE SET NULL,
  applicant_name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(15) NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','in_review','approved','signed','issued','rejected','cancelled'
  )),
  current_step integer NOT NULL DEFAULT 0,
  rejection_reason text,
  letter_number text,
  verification_code varchar(12),
  signed_at timestamptz,
  issued_at timestamptz,
  sla_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_letters_village ON letters(village_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_letters_status ON letters(village_id, status);

CREATE TABLE IF NOT EXISTS letter_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  letter_id uuid NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  action varchar(20) NOT NULL CHECK (action IN ('submit','advance','reject','sign','issue','cancel')),
  step_label text,
  actor_user_id uuid,
  actor_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_letter_actions_letter ON letter_actions(letter_id);

ALTER TABLE letter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY letter_templates_tenant ON letter_templates FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE letters FORCE ROW LEVEL SECURITY;
CREATE POLICY letters_tenant ON letters FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE letter_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE letter_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY letter_actions_tenant ON letter_actions FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Nomor surat: {CODE}/{YYYY}/{SEQ} per desa per template
CREATE OR REPLACE FUNCTION app.next_letter_number(p_village_id uuid, p_code text, p_date date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_seq int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM letters l JOIN letter_templates t ON t.id = l.template_id
  WHERE l.village_id = p_village_id AND t.code = p_code
    AND l.issued_at >= make_date(EXTRACT(YEAR FROM p_date)::int, 1, 1)
    AND l.issued_at < make_date(EXTRACT(YEAR FROM p_date)::int + 1, 1, 1);
  RETURN UPPER(p_code) || '/' || EXTRACT(YEAR FROM p_date)::text || '/' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- Verifikasi surat terbit via kode (publik)
CREATE OR REPLACE FUNCTION app.verify_letter(p_code text)
RETURNS TABLE (letter_number text, template_name text, applicant_name text, village_name text, issued_at timestamptz, valid boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT l.letter_number, t.name, l.applicant_name, v.name, l.issued_at,
         (l.deleted_at IS NULL AND l.status = 'issued')
  FROM letters l JOIN letter_templates t ON t.id = l.template_id JOIN villages v ON v.id = l.village_id
  WHERE l.verification_code = p_code
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.verify_letter(text) TO villageos_app, PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_letter_number(uuid, text, date) TO villageos_app;

-- Template bawaan untuk semua desa existing
INSERT INTO letter_templates (village_id, code, name, description, form_schema, sla_days)
SELECT v.id, 'domisili', 'Surat Keterangan Domisili',
       'Surat keterangan tempat tinggal warga',
       '[{"key":"keperluan","label":"Keperluan","type":"text","required":true},
         {"key":"alamat_lengkap","label":"Alamat Lengkap","type":"textarea","required":true}]'::jsonb,
       3
FROM villages v
WHERE NOT EXISTS (SELECT 1 FROM letter_templates t WHERE t.village_id = v.id AND t.code = 'domisili');

INSERT INTO letter_templates (village_id, code, name, description, form_schema, sla_days)
SELECT v.id, 'pengantar', 'Surat Pengantar',
       'Surat pengantar umum untuk berbagai keperluan',
       '[{"key":"keperluan","label":"Keperluan","type":"text","required":true},
         {"key":"keterangan_tambahan","label":"Keterangan Tambahan","type":"textarea","required":false}]'::jsonb,
       3
FROM villages v
WHERE NOT EXISTS (SELECT 1 FROM letter_templates t WHERE t.village_id = v.id AND t.code = 'pengantar');
