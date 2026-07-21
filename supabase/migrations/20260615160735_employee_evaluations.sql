CREATE TABLE employee_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  employee_name TEXT NOT NULL,
  employee_role TEXT,
  department TEXT,
  evaluator_name TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  manager_ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  strengths TEXT,
  improvement_areas TEXT,
  goals TEXT,
  manager_support TEXT,
  attendance_notes TEXT,
  employer_ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  employee_likes TEXT,
  employee_concerns TEXT,
  management_feedback TEXT,
  requested_changes TEXT,
  employee_goals TEXT,
  follow_up_date DATE,
  follow_up_notes TEXT,
  manager_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  employee_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  manager_acknowledged_at TIMESTAMPTZ,
  employee_acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_name, review_year)
);

ALTER TABLE employee_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to employee_evaluations"
  ON employee_evaluations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_evaluations TO anon, authenticated;

CREATE TRIGGER employee_evaluations_updated_at
  BEFORE UPDATE ON employee_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_employee_evaluations_year
  ON employee_evaluations (review_year DESC, employee_name);
