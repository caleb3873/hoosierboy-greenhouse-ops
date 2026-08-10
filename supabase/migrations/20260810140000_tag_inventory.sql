CREATE TABLE IF NOT EXISTS tag_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text UNIQUE NOT NULL,
  on_hand integer DEFAULT 0,
  notes text,
  updated_by text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE tag_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tag_inventory_all ON tag_inventory;
CREATE POLICY tag_inventory_all ON tag_inventory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
