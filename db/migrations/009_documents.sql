-- 009_documents.sql — Digital Document & Archive Center
CREATE TABLE IF NOT EXISTS document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, name)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  category_id uuid REFERENCES document_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  doc_number text,              -- nomor dokumen otomatis, unik per desa
  doc_type varchar(20) NOT NULL DEFAULT 'lainnya' CHECK (doc_type IN (
    'sk','perdes','perkades','surat_masuk','surat_keluar','kontrak','proposal','laporan','berita_acara','foto','tanah','aset','lainnya'
  )),
  description text,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  version integer NOT NULL DEFAULT 1,
  is_public boolean NOT NULL DEFAULT false,     -- dokumen publik utk QR verification
  verification_code varchar(12) UNIQUE,          -- kode utk QR
  tags text[] NOT NULL DEFAULT '{}',
  expires_at date,
  issued_at date,
  current_holder uuid,          -- check-out oleh siapa
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_documents_village ON documents(village_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(expires_at) WHERE expires_at IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  version integer NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  change_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS document_access_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  actor_user_id uuid,
  action varchar(20) NOT NULL CHECK (action IN ('view','download','preview','verify')),
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_access_doc ON document_access_logs(document_id, created_at DESC);

ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY doc_categories_tenant ON document_categories FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant ON documents FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY doc_versions_tenant ON document_versions FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY doc_access_read ON document_access_logs FOR SELECT
  USING (village_id = app.current_village_id() OR app.is_platform_admin());
CREATE POLICY doc_access_insert ON document_access_logs FOR INSERT
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Nomor dokumen otomatis per desa per jenis per tahun: {TYPE}/{YYYY}/{SEQ}
CREATE OR REPLACE FUNCTION app.next_doc_number(p_village_id uuid, p_type text, p_date date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_seq int;
  v_prefix text;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM documents
  WHERE village_id = p_village_id AND doc_type = p_type
    AND created_at >= make_date(EXTRACT(YEAR FROM p_date)::int, 1, 1)
    AND created_at < make_date(EXTRACT(YEAR FROM p_date)::int + 1, 1, 1);

  v_prefix := UPPER(REPLACE(p_type, '_', '-'));
  RETURN v_prefix || '/' || EXTRACT(YEAR FROM p_date)::text || '/' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- Pintu publik: verifikasi dokumen via kode QR (tanpa auth)
CREATE OR REPLACE FUNCTION app.verify_document(p_code text)
RETURNS TABLE (title text, doc_number text, doc_type text, village_name text, issued_at date, valid boolean)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT d.title, d.doc_number, d.doc_type::text, v.name, d.issued_at,
         (d.deleted_at IS NULL)
  FROM documents d JOIN villages v ON v.id = d.village_id
  WHERE d.verification_code = p_code
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION app.verify_document(text) TO villageos_app, PUBLIC;
