-- Inventory lots — live physical count of pots out on the pads.
-- One row per pad-row of a variety. Independent of fall_program_items
-- (the plan) so we can cross-reference projected vs actual.

CREATE TABLE IF NOT EXISTS inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location TEXT NOT NULL,         -- e.g. "Bluff Quonset 10"
  row_id TEXT,                    -- e.g. "BQ1003" or "Row 3"
  pot_size TEXT,                  -- "9\"", "12\"", "HB", etc.
  plant_type TEXT,                -- "Mum", "Aster", "Cabbage", from variety_library.crop_name
  variety TEXT,                   -- "Paradiso White"
  quantity INTEGER DEFAULT 0,
  notes TEXT,                     -- free-text: "shrunk in heat", etc.
  counted_at TIMESTAMPTZ DEFAULT NOW(),
  counted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_lots_location_idx ON inventory_lots (location);
CREATE INDEX IF NOT EXISTS inventory_lots_variety_idx ON inventory_lots (variety);

ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_lots_all" ON inventory_lots;
CREATE POLICY "inventory_lots_all" ON inventory_lots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime so the grid stays in sync across phones
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_lots;
