CREATE TABLE evaluation_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_year INTEGER NOT NULL,
  employee_name TEXT NOT NULL,
  employee_role TEXT,
  employee_department TEXT,
  employee_language TEXT NOT NULL DEFAULT 'en'
    CHECK (employee_language IN ('en', 'es', 'my')),
  manager_name TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (review_year, employee_name)
);

ALTER TABLE evaluation_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to evaluation_assignments"
  ON evaluation_assignments
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_assignments TO anon, authenticated;

CREATE TRIGGER evaluation_assignments_updated_at
  BEFORE UPDATE ON evaluation_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_evaluation_assignments_manager
  ON evaluation_assignments (review_year DESC, manager_name);

ALTER TABLE employee_evaluations
  ADD COLUMN assigned_manager_name TEXT,
  ADD COLUMN response_language TEXT NOT NULL DEFAULT 'en'
    CHECK (response_language IN ('en', 'es', 'my')),
  ADD COLUMN employer_responses_en JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN manager_responses_translated JSONB NOT NULL DEFAULT '{}'::jsonb;
