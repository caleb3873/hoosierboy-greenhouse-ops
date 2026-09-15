-- v_plan_need v2: flag LONG-LEAD components, never override their week.
-- A combo child's own ship week is authoritative even when it is far ahead of the
-- parent's plant week — ivy and spikes arrive ONCE in autumn, are propagated and held
-- in plugs, and are drawn down all season (Caleb 9/15). This view only marks children
-- whose arrival is more than 16 weeks before the parent plants, so the Coverage page
-- can show "long lead" and a reader can confirm it is intentional held stock.
-- v_plan_coverage depends on v_plan_need; Postgres cannot insert a view column mid-list, so recreate both.
drop view if exists v_plan_coverage;
drop view if exists v_plan_need;
create or replace view v_plan_need as
with rows_ as (
  select s.plan_id, s.variety_id,
         coalesce(s.ship_week, p.ship_week)  as arrive_week,
         coalesce(s.ship_year, p.ship_year)  as arrive_year,
         coalesce(p.plant_week, s.plant_week) as plant_week,
         s.prop_method, s.supplier,
         (upper(coalesce(s.supplier, '')) = 'SCHLEGEL') as in_house,
         (s.combo_parent_id is not null) as is_component,
         case when s.combo_parent_id is not null and s.ship_week is not null and p.plant_week is not null
              then ((coalesce(p.plant_year, 2027) * 52 + p.plant_week)
                    - (coalesce(s.ship_year, coalesce(p.plant_year, 2027)) * 52 + s.ship_week)) > 16
              else false end as long_lead,
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
       sum(case when r.long_lead then r.plants else 0 end)::int        as long_lead_plants,
       count(*)::int                                                   as source_rows,
       min(r.plant_week) as first_plant_week, max(r.plant_week) as last_plant_week,
       string_agg(distinct coalesce(r.supplier, '?'), ' / ')           as suppliers,
       string_agg(distinct coalesce(r.prop_method, '?'), ' / ')        as forms
from rows_ r
join variety_library v on v.id = r.variety_id
group by r.plan_id, r.variety_id, v.crop_name, v.variety, r.arrive_year, r.arrive_week, r.in_house;

create or replace view v_plan_coverage as
with n as (
  select plan_id, variety_id, arrive_year as yr, arrive_week as wk,
         sum(plants)::int as need, sum(combo_plants)::int as combo_need,
         sum(long_lead_plants)::int as long_lead_need
  from v_plan_need where not in_house
  group by plan_id, variety_id, arrive_year, arrive_week
),
ih as (
  select plan_id, variety_id, sum(plants)::int as in_house_plants
  from v_plan_need where in_house group by plan_id, variety_id
),
s as (
  select plan_id, variety_id, ship_year as yr, ship_week as wk, ordered, confirmed, orders, suppliers
  from v_plan_supply
),
j as (
  select coalesce(n.plan_id, s.plan_id) as plan_id, coalesce(n.variety_id, s.variety_id) as variety_id,
         coalesce(n.yr, s.yr) as yr, coalesce(n.wk, s.wk) as wk,
         coalesce(n.need, 0) as need, coalesce(n.combo_need, 0) as combo_need,
         coalesce(n.long_lead_need, 0) as long_lead_need,
         coalesce(s.ordered, 0) as ordered, coalesce(s.confirmed, 0) as confirmed,
         s.orders, s.suppliers
  from n
  full outer join s on s.plan_id = n.plan_id and s.variety_id = n.variety_id and s.yr = n.yr and s.wk = n.wk
)
select j.plan_id, j.variety_id, v.crop_name, v.variety,
       j.yr as arrive_year, j.wk as arrive_week,
       j.need, j.combo_need, j.long_lead_need, j.ordered, j.confirmed, j.orders, j.suppliers,
       (j.ordered - j.need) as gap_ordered, (j.confirmed - j.need) as gap_confirmed,
       sum(j.need) over w as cum_need, sum(j.ordered) over w as cum_ordered, sum(j.confirmed) over w as cum_confirmed,
       (sum(j.ordered) over w - sum(j.need) over w)   as cum_gap_ordered,
       (sum(j.confirmed) over w - sum(j.need) over w) as cum_gap_confirmed,
       coalesce(ih.in_house_plants, 0) as in_house_plants
from j
join variety_library v on v.id = j.variety_id
left join ih on ih.plan_id = j.plan_id and ih.variety_id = j.variety_id
window w as (partition by j.plan_id, j.variety_id order by j.yr nulls last, j.wk nulls last
             rows between unbounded preceding and current row);
