-- Merge the two "Improved" variety pairs — Caleb confirmed same plant, keep one row.
--   Cabaret Yellow Improved  → Cabaret Yellow   (keeper e7018f66)
--   Compact Lilac Imp        → Compact Lilac    (keeper 59e3a25b)
-- Keepers are the rows with existing links + most references. The dupes' plan rows
-- repoint to the keeper; Compact Lilac Imp's production item (S27-0906, zero order
-- lines) folds into the keeper's S27-0904 in the same container.

-- 1. repoint plan rows
update scheduled_crops set variety_id = 'e7018f66-d804-49c8-873b-59839457ba93'
 where variety_id = 'f8e3a50b-9a37-434f-b371-b6920741e222';
update scheduled_crops set variety_id = '59e3a25b-8ff8-41bf-9ca3-1729781e6f4e'
 where variety_id = 'c732f02a-a302-475d-a221-1262b7560709';

-- 2. fold the colliding production item: repoint children to the keeper's item, then remove it
update scheduled_crops set production_item_id = 'd0d02001-2d3d-42e2-a772-610402c45830'
 where production_item_id = '184079dd-9d60-4117-9dbe-ba0572e909e9';
update customer_order_lines set production_item_id = 'd0d02001-2d3d-42e2-a772-610402c45830'
 where production_item_id = '184079dd-9d60-4117-9dbe-ba0572e909e9';
update manager_tasks set production_item_id = 'd0d02001-2d3d-42e2-a772-610402c45830'
 where production_item_id = '184079dd-9d60-4117-9dbe-ba0572e909e9';
update product_profiles set production_item_id = 'd0d02001-2d3d-42e2-a772-610402c45830'
 where production_item_id = '184079dd-9d60-4117-9dbe-ba0572e909e9'
   and not exists (select 1 from product_profiles k where k.production_item_id = 'd0d02001-2d3d-42e2-a772-610402c45830');
-- both items had identical draft profiles ("4.5\" SUNPATIENS COMPACT LILAC") — drop the dupe's
delete from product_profiles where production_item_id = '184079dd-9d60-4117-9dbe-ba0572e909e9';
delete from production_items where id = '184079dd-9d60-4117-9dbe-ba0572e909e9';
-- (inventory_events + production_item_groups cascade with the item; the keeper's own rows carry on)

-- 3. drop the duplicate variety rows; note the merge on the keepers
delete from variety_library where id in ('f8e3a50b-9a37-434f-b371-b6920741e222','c732f02a-a302-475d-a221-1262b7560709');
update variety_library set notes = trim(coalesce(notes,'') || ' | merged "Cabaret Yellow Improved" 2026-07-22 — same genetics, breeder rename')
 where id = 'e7018f66-d804-49c8-873b-59839457ba93';
update variety_library set notes = trim(coalesce(notes,'') || ' | merged "Compact Lilac Imp" 2026-07-22 — same genetics, breeder rename')
 where id = '59e3a25b-8ff8-41bf-9ca3-1729781e6f4e';
