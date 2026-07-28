-- Walkthrough → production acknowledgment: applied_at stamps when a target was
-- last pushed into the plan rows. The family-page banner shows a target only when
-- it's NEWER than its last apply — deliberate production drift (space calls) stays
-- quiet, and target-vs-actual remains readable at season end.
alter table plan_targets add column if not exists applied_at timestamptz;
-- applied_units snapshots the VALUE that was applied — acknowledgment is value-based
-- (banner returns only when the target number itself changes), so timestamp bumps from
-- notes/timing-arrows/rounds never re-arm an already-acknowledged line.
alter table plan_targets add column if not exists applied_units integer;
