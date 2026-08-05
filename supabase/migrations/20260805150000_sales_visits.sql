CREATE TABLE IF NOT EXISTS sales_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  customer text,
  html text NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE sales_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_visits_all ON sales_visits;
CREATE POLICY sales_visits_all ON sales_visits
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
