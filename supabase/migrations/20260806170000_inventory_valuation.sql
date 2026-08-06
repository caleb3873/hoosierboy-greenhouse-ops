CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_at timestamptz DEFAULT now(),
  totals jsonb,
  detail jsonb,
  source text DEFAULT 'manual'
);
CREATE TABLE IF NOT EXISTS inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text DEFAULT 'houseplants',
  counted_on date NOT NULL,
  label text,
  units integer,
  est_value numeric,
  cost_value numeric,
  notes text,
  created_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_snapshots_all ON inventory_snapshots;
CREATE POLICY inventory_snapshots_all ON inventory_snapshots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS inventory_counts_all ON inventory_counts;
CREATE POLICY inventory_counts_all ON inventory_counts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
