-- 018_procurement.sql — vendor, pengadaan, PO, kontrak, invoice
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone varchar(30),
  address text,
  npwp varchar(30),
  bank_account text,
  performance_score numeric(3,1) NOT NULL DEFAULT 3.0 CHECK (performance_score BETWEEN 0 AND 5),
  is_blacklisted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, name)
);

CREATE TABLE IF NOT EXISTS procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  request_no text NOT NULL,
  title text NOT NULL,
  description text,
  estimated_amount numeric(15,2) NOT NULL,
  budget_plan_id uuid REFERENCES budget_plans(id) ON DELETE SET NULL,
  status varchar(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quoted','awarded','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, request_no)
);

CREATE TABLE IF NOT EXISTS vendor_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL,
  procurement_request_id uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  amount numeric(15,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procurement_request_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  po_no text NOT NULL,
  procurement_request_id uuid REFERENCES procurement_requests(id) ON DELETE SET NULL,
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(15,2) NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  status varchar(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open','delivered','completed','cancelled')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, po_no)
);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  contract_no text NOT NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric(15,2),
  start_date date NOT NULL,
  end_date date,
  status varchar(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expiring_soon','expired','terminated')),
  document_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, contract_no)
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  amount numeric(15,2) NOT NULL,
  due_date date,
  status varchar(12) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','overdue','void')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (village_id, invoice_no)
);

-- RLS semua tabel
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendors','procurement_requests','vendor_quotes','purchase_orders','contracts','invoices']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_tenant ON %I FOR ALL USING (village_id = app.current_village_id() OR app.is_platform_admin()) WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin())', t, t);
  END LOOP;
END $$;

-- Kontrak mendekati habis: view untuk reminder
CREATE OR REPLACE VIEW expiring_contracts AS
  SELECT id, village_id, contract_no, title, vendor_id, end_date
  FROM contracts
  WHERE status = 'active' AND end_date IS NOT NULL
    AND end_date <= CURRENT_DATE + 30;
