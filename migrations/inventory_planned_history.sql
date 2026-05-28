-- Walk-from-plan + plan/actual variance + count history on inventory_lots.
-- All additive — existing rows keep working with null/empty defaults.

ALTER TABLE inventory_lots
  ADD COLUMN IF NOT EXISTS planned_qty INTEGER,
  ADD COLUMN IF NOT EXISTS count_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_counted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS inventory_lots_last_counted_idx ON inventory_lots (last_counted_at);
