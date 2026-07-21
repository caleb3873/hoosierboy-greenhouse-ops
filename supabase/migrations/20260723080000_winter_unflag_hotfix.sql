-- The wk31 pot shortfall, root-caused and fixed.
--
-- Two Winter rows — 8.5" POT AIDA RED and 8.5" POT MONI WHITE, 150 pots each,
-- wk31, bench ASMW16 — were wrongly flagged is_combo_component. The one-off task
-- generation excluded flagged rows: the wk31 Sprague Main pot-fill said 150 pots
-- where the truth is 300, with fill day Friday 2026-07-24.
--
-- Also surfaced: reconcile_production_items' SKU suffix logic strips ALL
-- non-digits, so 'W26-0001' reads as 260001 and new-item SKUs collide. The two
-- items are therefore created explicitly here (W26-0046/0047); the reconcile
-- then has nothing missing to insert. (Suffix fix tracked separately.)

begin;

update scheduled_crops sc set is_combo_component = false, combo_parent_id = null, updated_at = now()
from production_plans p
where p.id = sc.plan_id and p.name = 'Winter 2026'
  and sc.is_combo_component and sc.qty_pots > 0;

insert into production_items (plan_id, kind, variety_id, container_id, sku)
select sc.plan_id, 'straight', sc.variety_id, sc.container_id,
       'W26-' || lpad((45 + row_number() over (order by sc.item_name))::text, 4, '0')
from scheduled_crops sc
join production_plans p on p.id = sc.plan_id
where p.name = 'Winter 2026' and sc.item_name in ('8.5" POT AIDA RED', '8.5" POT MONI WHITE')
  and not exists (select 1 from production_items pi
                  where pi.plan_id = sc.plan_id and pi.variety_id = sc.variety_id
                    and pi.container_id = sc.container_id);

commit;

select reconcile_production_items((select id from production_plans where name = 'Winter 2026'));

update manager_tasks t set description =
'Fill pots with BM5HP Compressed (same soil as mums). NO LABELS for poinsettias.

**POT COUNTS (300 total):**
  • 300 × AZG08501 (8.50 Az Elite)

**Soil:** ~8 bag(s) BM5HP Compressed (fluffed to 8 cu ft each).

**Stage on benches:** ASMW16

Liners arrive Tuesday ~noon via grower truck on 2026-07-27.
Filling Friday gives ~3 days for soil to settle without drying out — don''t fill more than a week ahead.

[corrected 2026-07-23: was 150 — two real items were mis-flagged as combo components]'
from production_plans p
where p.id = t.plan_id and p.name = 'Winter 2026' and t.status = 'pending'
  and t.title = 'Pot fill — Sprague Main Range (wk31)';

update manager_tasks t set description =
  replace(t.description, '600 liners → 150 pots', '600 liners → 300 pots (150 Aida Red + 150 Moni White)')
from production_plans p
where p.id = t.plan_id and p.name = 'Winter 2026' and t.status = 'pending'
  and t.title like 'PLANT%Sprague Main Range (wk31)%';
