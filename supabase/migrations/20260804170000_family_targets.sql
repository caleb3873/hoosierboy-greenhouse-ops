-- Family-level projection: THE number agreed at the family grain ("how many lantana?").
-- Static reference — allocating colors inside the family never moves it. Replaces the old
-- saveFamilyTarget fan-out (which split the typed number into per-item plan_targets and
-- kept no family record, so the projection drifted with every item edit).
CREATE TABLE IF NOT EXISTS family_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES crop_recipes(id) ON DELETE CASCADE,
  planned_pots integer,                -- POTS (pots-everywhere rule)
  note text,
  decided_by text,
  decided_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (plan_id, recipe_id)
);

ALTER TABLE family_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS family_targets_all ON family_targets;
CREATE POLICY family_targets_all ON family_targets
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
