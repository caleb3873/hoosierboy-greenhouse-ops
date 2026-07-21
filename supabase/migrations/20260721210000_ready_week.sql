-- Give the plan a real "ready to sell" date.
--
-- WHAT THE INVESTIGATION FOUND
-- `ship_week` was being read as "when the finished product ships to a customer".
-- It isn't, and it never was: across 1,647 sellable Spring 2027 rows, ZERO have
-- a ship week after their plant week — 837 are the same week and 810 are before
-- it (Ivy Hedera Mary Beth "ships" wk43/2026 but is planted wk1/2027).
--
-- `ship_week` is the SUPPLIER's ship week — when liners, cuttings or plugs leave
-- the vendor. That is the correct and consistent meaning, inherited from the
-- master-list import, and it is genuinely useful for sourcing. The real problem
-- is that the plan has never carried a customer-ready date at all, so anything
-- needing one (the B2B catalog, demand-timing analysis) silently reused
-- ship_week and landed months early. 224 B2B item groups currently carry 2026
-- ready dates for a spring crop — harmless only because nothing is published.
--
-- HOW READY WEEK IS DERIVED
-- From the crop's own history: for every item matched to 2026 sales, the first
-- week it actually sold minus its plant week gives the true finish time. Median
-- by container size, from 922 matched items:
--   4.5" 7 · 6.5" 7 · FIBER 9 · HB 10 · POT 10 · 8" 10 · 1801S/L 10 · MARKET 11 · BOWL 11
-- Items with their own 2026 sales use their OWN observed finish time; the rest
-- fall back to the size median. Anything unmatched by size gets 9 weeks.
--
-- Caleb confirmed: ready date coincides with first sale date. So for any item
-- with 2026 sales, ready_week reproduces its observed first-sale week exactly.
-- crop_weeks is stored alongside so the ready date FOLLOWS if a plant week is
-- moved during the production session, rather than going stale.
--
-- ready_source records which path each row took, so nobody has to wonder later.

begin;

create table if not exists scheduled_crops_readyweek_backup_20260721 as
select id, plan_id, item_name, ship_week, ship_year, plant_week, plant_year
from scheduled_crops sc
where exists (select 1 from production_plans p where p.id = sc.plan_id and p.name = 'Spring 2027');

alter table scheduled_crops add column if not exists ready_week int;
alter table scheduled_crops add column if not exists ready_year int;
alter table scheduled_crops add column if not exists ready_source text;  -- observed | size_median | default
alter table scheduled_crops add column if not exists crop_weeks int;     -- plant -> ready, observed from 2026

comment on column scheduled_crops.ship_week is
  'SUPPLIER ship week — when liners/cuttings/plugs leave the vendor. NOT when the finished product is ready; use ready_week for that.';
comment on column scheduled_crops.ready_week is
  'Week the finished product is ready to sell — coincides with first sale week. plant_week + crop_weeks.';
comment on column scheduled_crops.crop_weeks is
  'Observed weeks from planting to first sale. Move plant_week and recompute ready_week from this.';

with fs as (   -- what each item's real finish time was in 2026
  select m.plan_item_name as item, min(w.wk) as first_wk
  from sales_weekly w join sales_sku_map m on m.sku = w.sku
  where w.units::numeric > 0 group by 1
), obs as (
  select sc.item_name,
         min(fs.first_wk - case when sc.plant_year = 2026 then sc.plant_week - 52 else sc.plant_week end) as crop_weeks
  from scheduled_crops sc
  join production_plans p on p.id = sc.plan_id
  join fs on fs.item = sc.item_name
  where p.name = 'Spring 2027' and coalesce(sc.is_combo_component, false) = false
  group by 1
), sizemed as (
  values ('4.5"',7), ('6.5"',7), ('FIBER',9), ('HB',10), ('POT',10), ('8"',10),
         ('1801S',10), ('1801L',10), ('MARKET',11), ('BOWL',11)
)
update scheduled_crops sc set
  ready_week = (((sc.plant_week + w.crop) - 1) % 52) + 1,
  ready_year = sc.plant_year + ((sc.plant_week + w.crop - 1) / 52),
  ready_source = w.src,
  crop_weeks = w.crop
from production_plans p,
     lateral (
       select
         coalesce(
           (select greatest(o.crop_weeks, 1) from obs o where o.item_name = sc.item_name),
           (select m.column2 from sizemed m where m.column1 = split_part(sc.item_name, ' ', 1)),
           9
         ) as crop,
         case
           when exists (select 1 from obs o where o.item_name = sc.item_name) then 'observed'
           when exists (select 1 from sizemed m where m.column1 = split_part(sc.item_name, ' ', 1)) then 'size_median'
           else 'default'
         end as src
     ) w
where p.id = sc.plan_id and p.name = 'Spring 2027'
  and sc.plant_week is not null and sc.plant_year is not null;

commit;

-- Sanity check after running:
--   select ready_source, count(*), min(ready_week), max(ready_week)
--   from scheduled_crops sc join production_plans p on p.id=sc.plan_id
--   where p.name='Spring 2027' group by 1;
--
-- FOLLOW-UP (not done here): the B2B reconcile builds production_item_groups
-- from ship_week. Once ready_week is trusted it should key off ready_week
-- instead, which also retires the manual ready_week_override used for
-- Winter 2026 poinsettias.
--
-- Rollback: alter table scheduled_crops drop column ready_week, drop column
-- ready_year, drop column ready_source;
