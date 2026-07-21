-- Timing joins quantity as a projection decision.
--
-- Caleb: "have the ability to increase or decrease or maybe bring in earlier or
-- later so we can change the finish dates or the ship dates." The timing data
-- (first-sale vs finish week) now exists, and the only honest response to
-- "peaked wk15, finishes wk19" is moving the date, not the quantity.
--
-- ready_shift is in WEEKS, negative = earlier. It is a decision, not a plan
-- edit: production applies it later by moving plant_week — ready_week follows
-- automatically via crop_weeks, so the shift never goes stale.

alter table plan_targets add column if not exists ready_shift int;
comment on column plan_targets.ready_shift is
  'Agreed finish-date move in weeks (negative = earlier). Applied by production as a plant_week shift; ready_week follows via crop_weeks.';
