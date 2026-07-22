-- Planting rounds as a PROJECTION decision. Bidens plant once; 365 Reigers
-- plant in waves with different finish dates. The projection keeps one total,
-- and plan_targets.rounds records how it divides:
--   [{ "units": 120, "ready_week": 14 }, { "units": 245, "ready_week": 17 }]
-- Auto-split is weighted by 2026 weekly sales; every number stays editable.
-- Production applies rounds to benches later — same contract as target_units.
alter table plan_targets add column if not exists rounds jsonb;
comment on column plan_targets.rounds is
  'Planting-round split of target_units: [{units, ready_week}]. Decision only — scheduled_crops rows are restructured by production, not by this.';
