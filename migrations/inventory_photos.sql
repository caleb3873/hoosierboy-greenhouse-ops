-- Photos for inventory lots. Each photo is { path, takenAt, takenBy }.
-- Stored as a JSONB array on the lot itself so re-counts on the same
-- pad-row build up a season-long photo timeline.

ALTER TABLE inventory_lots
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- Dedicated storage bucket. Private — accessed via signed URLs.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('inventory-photos', 'inventory-photos', false)
  ON CONFLICT (id) DO NOTHING;

-- Allow anon + authenticated read / write on this bucket
DROP POLICY IF EXISTS "inventory_photos_select" ON storage.objects;
CREATE POLICY "inventory_photos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_insert" ON storage.objects;
CREATE POLICY "inventory_photos_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_update" ON storage.objects;
CREATE POLICY "inventory_photos_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'inventory-photos');

DROP POLICY IF EXISTS "inventory_photos_delete" ON storage.objects;
CREATE POLICY "inventory_photos_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'inventory-photos');
