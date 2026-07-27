-- Fix (Caleb-approved 2026-07-27, APPLIED): "Shamrock Passionfruit" was a phantom — the
-- plant is Passionfruit, a Ball series, grown in two planting groups (rounds wk8 + wk11).
-- The bogus prefix split the variety identity (own variety_key), detaching sales history
-- from the group-1 round and producing a wrong under-planned read.
-- Chain ran deepest-child-first: the phantom had its own B2B mirror row AND product
-- profile (production_items → product_profiles), both duplicates of the real item's.

update scheduled_crops
   set variety_id = '6f83e2e6-8367-4b41-a913-cc8a44d3c273',  -- real: Passionfruit (lantana passionfruit)
       production_item_id = null
 where variety_id = 'fa21660d-5627-4771-8c5a-66550eed052e';  -- phantom: Shamrock Passionfruit
update scheduled_crops set production_item_id = null
 where production_item_id = '2616e239-116d-488f-b9ab-0e885ace5d4c';

delete from product_profiles     where production_item_id = '2616e239-116d-488f-b9ab-0e885ace5d4c';
delete from production_items     where id = '2616e239-116d-488f-b9ab-0e885ace5d4c';
delete from crop_recipe_overrides where variety_key = 'lantana passionfruit shamrock';
delete from variety_links        where variety_id = 'fa21660d-5627-4771-8c5a-66550eed052e';
delete from variety_library      where id = 'fa21660d-5627-4771-8c5a-66550eed052e';

-- re-mirror the B2B layer for Spring 2027
select reconcile_production_items('d2360134-0fbb-4548-af2f-5cc3ccd590c6');
