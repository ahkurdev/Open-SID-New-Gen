-- 016_musrenbang.sql — usulan partisipatif + prioritas musyawarah
CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  proposal_no text NOT NULL,
  title text NOT NULL,
  category varchar(20) NOT NULL CHECK (category IN (
    'jalan','drainase','jembatan','lampu','pendidikan','ekonomi','fasilitas_umum','kesehatan','lainnya'
  )),
  description text NOT NULL,
  location_text text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  photo_paths text[] NOT NULL DEFAULT '{}',
  estimated_cost numeric(15,2),
  estimated_beneficiaries integer,
  urgency varchar(8) NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','urgent')),
  proposed_by_resident uuid REFERENCES residents(id) ON DELETE SET NULL,
  proposer_name text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  status varchar(15) NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','verified','in_musrenbang','prioritized','approved','planned','in_progress','completed','rejected'
  )),
  vote_count integer NOT NULL DEFAULT 0,   -- input musyawarah, bukan penentu
  priority_rank integer,
  musrenbang_year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  verified_by uuid,
  approved_by uuid,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  UNIQUE (village_id, proposal_no)
);
CREATE INDEX IF NOT EXISTS idx_proposals_village ON proposals(village_id, status) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_proposals_updated BEFORE UPDATE ON proposals FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS proposal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  village_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, user_id)
);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY proposals_tenant ON proposals FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE proposal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_votes FORCE ROW LEVEL SECURITY;
CREATE POLICY proposal_votes_tenant ON proposal_votes FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Usulan publik untuk transparansi (tanpa identitas pengusul)
CREATE OR REPLACE VIEW public_proposals AS
  SELECT id, village_id, proposal_no, title, category, description, location_text,
         estimated_cost, estimated_beneficiaries, status, vote_count, priority_rank,
         musrenbang_year
  FROM proposals WHERE deleted_at IS NULL;
GRANT SELECT ON public_proposals TO villageos_app;
