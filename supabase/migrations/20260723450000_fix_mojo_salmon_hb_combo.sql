-- Fix "HB 10" GERANIUM MOJO SALMON": it was 5 standalone rows all mislinked to
-- Hedera Mary Beth (ivy) with no combo structure. Rebuild it identical to the
-- Dark Red / Magenta / Dark Pink geranium-w-ivy combos: 339 baskets, each with
-- 2 Mojo Salmon geranium (parent DIRECT STICK + CALL component) + 3 Mary Beth ivy.
-- variety ids: geranium 0651339e-832b-48e2-9f51-b1d78ed92cf4 · ivy be5b5492-1070-43ad-985b-1ade92a67920

-- 1) turn the 5 existing rows into the geranium PARENT (the item identity)
update scheduled_crops set
  variety_id   = '0651339e-832b-48e2-9f51-b1d78ed92cf4',
  prop_method  = 'DIRECT STICK',
  liner_unit_cost = 1.00,
  ppp = 1, ship_week = 6, ship_year = 2027, ready_week = 16, ready_year = 2027, crop_weeks = 10,
  is_combo_component = false, combo_parent_id = null,
  notes = 'rebuilt to geranium+ivy combo (was mislinked to ivy)'
where id in ('3ecf60dc-970a-475f-948c-871427d2841a','791a254c-52c8-4bca-849a-82b25919c6ff','7c6d7c8b-9852-4072-a3eb-b27b8d495f38','b07df593-0b19-4222-b6b8-506150d62f0d','fb34a67c-3bcc-48e7-83a5-a900afc899bf');

-- 2) per parent, add the geranium component (1/basket, CALL) + ivy component (3/basket, URC)
insert into scheduled_crops
  (id, plan_id, item_name, variety_id, container_id, qty_pots, ppp, qty_plants_ordered, is_combo_component, combo_parent_id, plant_week, plant_year, ship_week, ship_year, ready_week, ready_year, crop_weeks, prop_method, prop_tray_size, liner_unit_cost, pack_size, status)
select gen_random_uuid(), pr.plan_id, pr.item_name, c.variety_id, pr.container_id, 0, c.ppp, pr.qty_pots * c.per, true, pr.id,
       6, 2027, c.ship_week, c.ship_year, 16, 2027, 10, c.prop_method, c.prop_tray_size, c.liner_unit_cost, 1, 'planned'
from scheduled_crops pr
cross join (values
  ('0651339e-832b-48e2-9f51-b1d78ed92cf4'::uuid, 1, 1, 'CALL', '50', 0.462, 2, 2027),
  ('be5b5492-1070-43ad-985b-1ade92a67920'::uuid, 3, 3, 'URC', '105', 0.342, 43, 2026)
) as c(variety_id, ppp, per, prop_method, prop_tray_size, liner_unit_cost, ship_week, ship_year)
where pr.id in ('3ecf60dc-970a-475f-948c-871427d2841a','791a254c-52c8-4bca-849a-82b25919c6ff','7c6d7c8b-9852-4072-a3eb-b27b8d495f38','b07df593-0b19-4222-b6b8-506150d62f0d','fb34a67c-3bcc-48e7-83a5-a900afc899bf');
