-- Plan coverage: one canonical definition of NEED, one of SUPPLY, and the join.
-- Built 9/15/2026 after a day of ad-hoc need queries got the Reiger book wrong twice
-- (parents counted as cuttings, then stale acks counted as live). Every question of
-- the form "do we have enough X coming in" reads these views; nothing re-derives.

-- ── NEED ───────────────────────────────────────────────────────────────────────
-- Plants that must ARRIVE, per variety per arrival week. Rules baked in:
--  * placed rows only — a combo child counts through its PARENT's placed_at
--  * combo children carry qty 0 BY DESIGN: need = parent pots × child ppp
--  * a combo PARENT's own variety_id is a label, not demand — excluded
--  * supplier SCHLEGEL = our own cuttings → in_house=true (still shown, not "to order")
create or replace view v_plan_need as
with rows_ as (
  select s.plan_id, s.variety_id,
         coalesce(s.ship_week, p.ship_week)  as arrive_week,
         coalesce(s.ship_year, p.ship_year)  as arrive_year,
         coalesce(p.plant_week, s.plant_week) as plant_week,
         s.prop_method, s.supplier,
         (upper(coalesce(s.supplier, '')) = 'SCHLEGEL') as in_house,
         (s.combo_parent_id is not null) as is_component,
         case when s.combo_parent_id is not null
              then coalesce(p.qty_pots, 0) * greatest(1, round(coalesce(s.ppp, 1)))
              else coalesce(s.qty_pots, 0) * greatest(1, round(coalesce(s.ppp, 1))) end as plants
  from scheduled_crops s
  left join scheduled_crops p on p.id = s.combo_parent_id
  where s.variety_id is not null
    and coalesce(p.placed_at, s.placed_at) is not null
    and not (s.combo_parent_id is null
             and exists (select 1 from scheduled_crops k where k.combo_parent_id = s.id))
)
select r.plan_id, r.variety_id, v.crop_name, v.variety,
       r.arrive_year, r.arrive_week, r.in_house,
       sum(r.plants)::int                                              as plants,
       sum(case when r.is_component then r.plants else 0 end)::int     as combo_plants,
       count(*)::int                                                   as source_rows,
       min(r.plant_week)                                               as first_plant_week,
       max(r.plant_week)                                               as last_plant_week,
       string_agg(distinct coalesce(r.supplier, '?'), ' / ')           as suppliers,
       string_agg(distinct coalesce(r.prop_method, '?'), ' / ')        as forms
from rows_ r
join variety_library v on v.id = r.variety_id
group by r.plan_id, r.variety_id, v.crop_name, v.variety, r.arrive_year, r.arrive_week, r.in_house;

-- ── SUPPLY ─────────────────────────────────────────────────────────────────────
-- What is on order, per variety per ship week, LIVE orders only. A line with no
-- variety_id is invisible here on purpose — see v_po_lines_unlinked, which the
-- Coverage page surfaces as a warning so the gap gets fixed at the source.
create or replace view v_plan_supply as
select p.plan_id, l.variety_id, p.ship_year, p.ship_week,
       sum(l.qty_ordered)::int                                                   as ordered,
       sum(coalesce(l.qty_confirmed, 0))::int                                    as confirmed,
       count(*)::int                                                             as lines,
       string_agg(distinct p.order_number, ', ' order by p.order_number)         as orders,
       string_agg(distinct coalesce(p.supplier, '?'), ' / ')                     as suppliers
from purchase_order_lines l
join purchase_orders p on p.id = l.purchase_order_id
where l.variety_id is not null
  and coalesce(p.status, '') not in ('cancelled', 'superseded', 'draft')
group by p.plan_id, l.variety_id, p.ship_year, p.ship_week;

create or replace view v_po_lines_unlinked as
select p.plan_id, p.order_number, p.broker, p.supplier, p.status, p.ship_year, p.ship_week,
       l.id as line_id, l.line_no, l.variety_name, l.qty_ordered
from purchase_order_lines l
join purchase_orders p on p.id = l.purchase_order_id
where l.variety_id is null
  and coalesce(p.status, '') not in ('cancelled', 'superseded', 'draft');

-- ── COVERAGE ───────────────────────────────────────────────────────────────────
-- need − supply per variety per week, plus running totals in week order so an
-- early arrival is allowed to cover a later planting. Bought-in need only; the
-- in-house share rides along as a separate column.
create or replace view v_plan_coverage as
with n as (
  select plan_id, variety_id, arrive_year as yr, arrive_week as wk,
         sum(plants)::int as need, sum(combo_plants)::int as combo_need
  from v_plan_need where not in_house
  group by plan_id, variety_id, arrive_year, arrive_week
),
ih as (
  select plan_id, variety_id, sum(plants)::int as in_house_plants
  from v_plan_need where in_house
  group by plan_id, variety_id
),
s as (
  select plan_id, variety_id, ship_year as yr, ship_week as wk, ordered, confirmed, orders, suppliers
  from v_plan_supply
),
j as (
  select coalesce(n.plan_id, s.plan_id)       as plan_id,
         coalesce(n.variety_id, s.variety_id) as variety_id,
         coalesce(n.yr, s.yr)                 as yr,
         coalesce(n.wk, s.wk)                 as wk,
         coalesce(n.need, 0)                  as need,
         coalesce(n.combo_need, 0)            as combo_need,
         coalesce(s.ordered, 0)               as ordered,
         coalesce(s.confirmed, 0)             as confirmed,
         s.orders, s.suppliers
  from n
  full outer join s on s.plan_id = n.plan_id and s.variety_id = n.variety_id
                   and s.yr = n.yr and s.wk = n.wk
)
select j.plan_id, j.variety_id, v.crop_name, v.variety,
       j.yr as arrive_year, j.wk as arrive_week,
       j.need, j.combo_need, j.ordered, j.confirmed, j.orders, j.suppliers,
       (j.ordered   - j.need) as gap_ordered,
       (j.confirmed - j.need) as gap_confirmed,
       sum(j.need)      over w as cum_need,
       sum(j.ordered)   over w as cum_ordered,
       sum(j.confirmed) over w as cum_confirmed,
       (sum(j.ordered)   over w - sum(j.need) over w) as cum_gap_ordered,
       (sum(j.confirmed) over w - sum(j.need) over w) as cum_gap_confirmed,
       coalesce(ih.in_house_plants, 0) as in_house_plants
from j
join variety_library v on v.id = j.variety_id
left join ih on ih.plan_id = j.plan_id and ih.variety_id = j.variety_id
window w as (partition by j.plan_id, j.variety_id
             order by j.yr nulls last, j.wk nulls last
             rows between unbounded preceding and current row);
