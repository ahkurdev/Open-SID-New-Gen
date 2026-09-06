-- 014_public_website.sql — CMS publik: berita, agenda, pengumuman, galeri
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  type varchar(12) NOT NULL DEFAULT 'berita' CHECK (type IN ('berita','artikel','pengumuman','agenda')),
  title text NOT NULL,
  slug text NOT NULL,
  excerpt text,
  content text NOT NULL,
  cover_image_path text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  status varchar(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  scheduled_at timestamptz,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (village_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_posts_village_published ON posts(village_id, status, published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING gin (title gin_trgm_ops);
CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  cover_image_path text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  file_path text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts FORCE ROW LEVEL SECURITY;
CREATE POLICY posts_tenant ON posts FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE post_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY post_revisions_tenant ON post_revisions FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_albums FORCE ROW LEVEL SECURITY;
CREATE POLICY gallery_albums_tenant ON gallery_albums FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY gallery_photos_tenant ON gallery_photos FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- View publik: post published saja (untuk website tanpa login via SECURITY DEFINER fn)
CREATE OR REPLACE FUNCTION app.get_public_posts(p_village_code text, p_type text DEFAULT NULL)
RETURNS TABLE (id uuid, title text, slug text, excerpt text, content text, category text,
               published_at timestamptz, village_name text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT p.id, p.title, p.slug, p.excerpt, p.content, p.category, p.published_at, v.name
  FROM posts p JOIN villages v ON v.id = p.village_id
  WHERE v.code = p_village_code AND p.status = 'published' AND p.deleted_at IS NULL
    AND (p_type IS NULL OR p.type = p_type)
    AND (p.published_at IS NULL OR p.published_at <= now())
  ORDER BY p.published_at DESC NULLS LAST LIMIT 50
$$;
GRANT EXECUTE ON FUNCTION app.get_public_posts(text, text) TO villageos_app, PUBLIC;

-- Open data: statistik agregat aman (tanpa PII)
CREATE OR REPLACE FUNCTION app.get_public_stats(p_village_code text)
RETURNS TABLE (metric text, value text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = app, public AS $$
  SELECT * FROM (
    SELECT 'total_penduduk'::text, COUNT(*)::text FROM residents r
      JOIN villages v ON v.id = r.village_id
      WHERE v.code = p_village_code AND r.deleted_at IS NULL AND r.status NOT IN ('pindah','meninggal')
    UNION ALL
    SELECT 'total_laki_laki', COUNT(*)::text FROM residents r JOIN villages v ON v.id = r.village_id
      WHERE v.code = p_village_code AND r.deleted_at IS NULL AND r.gender = 'L' AND r.status NOT IN ('pindah','meninggal')
    UNION ALL
    SELECT 'total_perempuan', COUNT(*)::text FROM residents r JOIN villages v ON v.id = r.village_id
      WHERE v.code = p_village_code AND r.deleted_at IS NULL AND r.gender = 'P' AND r.status NOT IN ('pindah','meninggal')
    UNION ALL
    SELECT 'total_kk', COUNT(*)::text FROM families f JOIN villages v ON v.id = f.village_id
      WHERE v.code = p_village_code AND f.deleted_at IS NULL
    UNION ALL
    SELECT 'pengaduan_selesai', COUNT(*)::text FROM complaints c JOIN villages v ON v.id = c.village_id
      WHERE v.code = p_village_code AND c.deleted_at IS NULL AND c.status IN ('resolved','closed')
    UNION ALL
    SELECT 'surat_terbit', COUNT(*)::text FROM letters l JOIN villages v ON v.id = l.village_id
      WHERE v.code = p_village_code AND l.deleted_at IS NULL AND l.status = 'issued'
  ) t(metric, value)
$$;
GRANT EXECUTE ON FUNCTION app.get_public_stats(text) TO villageos_app, PUBLIC;
