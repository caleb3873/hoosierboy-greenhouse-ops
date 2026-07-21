-- CORRECTION (Caleb): Aida Red + Moni White is a COMBO POT — one 8.5" pot gets
-- two of BOTH colors (4 liners per pot). 150 pots was right all along. The
-- original flags were modeling this combo, just wired wrong (Aida flagged as a
-- component with no parent), and yesterday's "fix" un-flagged both and doubled
-- the tasks to 300. Restore the proper combo_pot_pattern structure:
--   parent = 8.5" POT AIDA RED + MONI WHITE COMBO · 150 pots · ppp 2 (Aida liners)
--   child  = Moni White · qty_pots 0 · 300 plants · combo_parent_id → parent
-- Verified first: zero customer_order_lines on either item.

begin;

-- Moni becomes the component (300 liners riding into the parent's 150 pots)
update scheduled_crops m set
  is_combo_component = true,
  combo_parent_id = a.id,
  qty_pots = 0, ppp = 1, qty_plants_ordered = 300,
  production_item_id = a.production_item_id,
  updated_at = now()
from scheduled_crops a, production_plans p
where p.name = 'Winter 2026' and a.plan_id = p.id and m.plan_id = p.id
  and a.item_name = '8.5" POT AIDA RED' and m.item_name = '8.5" POT MONI WHITE';

-- the parent's name says what the pot actually is
update scheduled_crops a set item_name = '8.5" POT AIDA RED + MONI WHITE COMBO', updated_at = now()
from production_plans p
where p.name = 'Winter 2026' and a.plan_id = p.id and a.item_name = '8.5" POT AIDA RED';

-- B2B: one combo item, not two straights
delete from product_profiles where production_item_id in (select id from production_items where sku = 'W26-0047');
delete from production_item_groups where production_item_id in (select id from production_items where sku = 'W26-0047');
delete from production_items where sku = 'W26-0047';
update production_items set kind = 'combo' where sku = 'W26-0046';

commit;

select reconcile_production_items((select id from production_plans where name = 'Winter 2026'));

-- Friday's tasks: back to the correct 150, with the combo spelled out
update manager_tasks t set description =
'Fill pots with BM5HP Compressed (same soil as mums). NO LABELS for poinsettias.

**POT COUNTS (150 total):**
  • 150 × 8.5" Pot — AZG08501

This is the AIDA RED + MONI WHITE COMBO — 150 pots total, each pot gets 2 Aida Red + 2 Moni White (4 liners/pot).

**Soil:** ~4 bag(s). **Stage on:** ASMW16.
Liners arrive Tuesday ~noon via grower truck on 2026-07-27.

[corrected 2026-07-23: this is one 150-pot combo, not two 150-pot items]'
from production_plans p
where p.id = t.plan_id and p.name = 'Winter 2026' and t.status = 'pending'
  and t.title = 'Pot fill — Sprague Main Range (wk31)';

update manager_tasks t set description =
'Lucas Greenhouse liners arriving today via grower truck (Ellepot 26 trays). Plant all liners into target pots by end of day.

Total: 600 liners → 150 pots (COMBO: 2 Aida Red + 2 Moni White in every pot) — ASMW16, Sprague Main Range.

  • 300 × Aida Red liners
  • 300 × Moni White liners

Water-in immediately after planting.

[corrected 2026-07-23: one 150-pot combo — 4 liners per pot]'
from production_plans p
where p.id = t.plan_id and p.name = 'Winter 2026' and t.status = 'pending'
  and t.title like 'PLANT%Sprague Main Range (wk31)%';
