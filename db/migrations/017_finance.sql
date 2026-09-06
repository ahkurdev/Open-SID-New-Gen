-- 017_finance.sql — anggaran, realisasi, transaksi, anomaly flag
CREATE TABLE IF NOT EXISTS budget_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  year integer NOT NULL,
  category varchar(20) NOT NULL CHECK (category IN ('pendapatan','belanja','pembiayaan')),
  code text,
  name text NOT NULL,
  planned_amount numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (village_id, year, category, name)
);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  village_id uuid NOT NULL REFERENCES villages(id) ON DELETE CASCADE,
  budget_plan_id uuid REFERENCES budget_plans(id) ON DELETE SET NULL,
  trx_type varchar(12) NOT NULL CHECK (trx_type IN ('pemasukan','pengeluaran')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  trx_date date NOT NULL,
  description text NOT NULL,
  reference_no text,
  source varchar(15) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','sistem')),
  document_path text,
  anomaly_flag varchar(20),
  anomaly_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_finance_village_date ON finance_transactions(village_id, trx_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_budget ON finance_transactions(budget_plan_id);
CREATE TRIGGER trg_finance_updated BEFORE UPDATE ON finance_transactions FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY budget_plans_tenant ON budget_plans FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY finance_transactions_tenant ON finance_transactions FOR ALL
  USING (village_id = app.current_village_id() OR app.is_platform_admin())
  WITH CHECK (village_id = app.current_village_id() OR app.is_platform_admin());

-- Anomaly detector: flag transaksi duplikat & lonjakan (warning saja, keputusan manusia)
CREATE OR REPLACE FUNCTION app.detect_finance_anomaly(
  p_village_id uuid, p_amount numeric, p_trx_date date, p_description text
) RETURNS text LANGUAGE plpgsql STABLE SET search_path = app, public AS $$
DECLARE
  v_dup int;
  v_avg_month numeric;
  v_count_month int;
BEGIN
  -- duplikat: amount sama + deskripsi mirip dalam 30 hari
  SELECT COUNT(*) INTO v_dup FROM finance_transactions
  WHERE village_id = p_village_id AND deleted_at IS NULL AND amount = p_amount
    AND description = p_description AND trx_date BETWEEN p_trx_date - 30 AND p_trx_date + 30;
  IF v_dup > 0 THEN RETURN 'duplikat'; END IF;

  -- lonjakan: amount > 5x rata-rata transaksi 90 hari terakhir (min 5 transaksi)
  SELECT COALESCE(AVG(amount), 0), COUNT(*) INTO v_avg_month, v_count_month
  FROM finance_transactions
  WHERE village_id = p_village_id AND deleted_at IS NULL AND trx_date >= p_trx_date - 90;
  IF v_count_month >= 5 AND v_avg_month > 0 AND p_amount > v_avg_month * 5 THEN
    RETURN 'lonjakan';
  END IF;
  RETURN NULL;
END;
$$;
