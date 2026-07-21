ALTER TABLE employee_evaluations
  ADD COLUMN manager_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (manager_status IN ('pending', 'draft', 'completed')),
  ADD COLUMN employee_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (employee_status IN ('pending', 'completed')),
  ADD COLUMN manager_completed_at TIMESTAMPTZ,
  ADD COLUMN employee_submitted_at TIMESTAMPTZ;

UPDATE employee_evaluations
SET manager_status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'draft' END,
    manager_completed_at = completed_at;
