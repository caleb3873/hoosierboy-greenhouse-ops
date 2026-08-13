-- The two hot paths that were seq-scanning:
-- 1. variety_key is THE quote lookup (family pages, add door, lock-in engine)
create index if not exists idx_broker_prices_vkey on broker_prices (variety_key);
-- 2. the Space to-place pool: plan rows not yet placed
create index if not exists idx_sc_unplaced on scheduled_crops (plan_id) where placed_at is null;
