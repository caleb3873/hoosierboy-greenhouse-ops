-- Running log of notes per inventory lot — each entry timestamped + signed.
-- Existing single-field 'notes' column stays for backward compat.

ALTER TABLE inventory_lots
  ADD COLUMN IF NOT EXISTS note_log JSONB DEFAULT '[]'::jsonb;

-- Per-location notes (house-wide observations from growers).
-- One row per location; notes live in a JSONB log array on that row.

CREATE TABLE IF NOT EXISTS inventory_location_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location TEXT NOT NULL UNIQUE,
  note_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_location_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_location_notes_all" ON inventory_location_notes;
CREATE POLICY "inventory_location_notes_all" ON inventory_location_notes
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE inventory_location_notes;
