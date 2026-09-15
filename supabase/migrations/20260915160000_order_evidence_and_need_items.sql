-- Order EVIDENCE + item-level NEED (Caleb 9/15/2026):
-- "confirmation or order report — one or the other should confirm; if both are there
--  great, but need at least one." An order with a confirmation on file (ack_pdf_path)
-- and/or seen on a broker's own report (report_seen_at) is evidenced; neither = suspect.
-- Broker Check stamps report_seen_at when a report lists an order we already hold —
-- the only write that page makes, and it is additive.
alter table purchase_orders add column if not exists report_seen_at timestamptz;
alter table purchase_orders add column if not exists report_source  text;

-- Coverage showed "a list of plants"; the grower thinks in ITEMS on BENCHES. This is
-- v_plan_need before aggregation: one row per plan item that drives the need, so the
-- page can show "Nadine 9,053 = 2,200 on EQ1704 + 2,800 on EQ1501/02 + the yellow baskets".
create or replace view v_plan_need_items as
select s.plan_id, s.variety_id, v.crop_name, v.variety,
       coalesce(s.ship_week, p.ship_week)   as arrive_week,
       coalesce(s.ship_year, p.ship_year)   as arrive_year,
       coalesce(p.plant_week, s.plant_week) as plant_week,
       coalesce(p.item_name, s.item_name)   as item_name,
       b.code                               as bench,
       coalesce(p.qty_pots, s.qty_pots)     as pots,
       greatest(1, round(coalesce(s.ppp, 1)))::int as per_pot,
       (case when s.combo_parent_id is not null
             then coalesce(p.qty_pots, 0) * greatest(1, round(coalesce(s.ppp, 1)))
             else coalesce(s.qty_pots, 0) * greatest(1, round(coalesce(s.ppp, 1))) end)::int as plants,
       (s.combo_parent_id is not null)      as is_component,
       (upper(coalesce(s.supplier, '')) = 'SCHLEGEL') as in_house,
       s.supplier, s.prop_method
from scheduled_crops s
left join scheduled_crops p on p.id = s.combo_parent_id
left join benches b on b.id = coalesce(p.bench_id, s.bench_id)
join variety_library v on v.id = s.variety_id
where s.variety_id is not null
  and coalesce(p.placed_at, s.placed_at) is not null
  and not (s.combo_parent_id is null
           and exists (select 1 from scheduled_crops k where k.combo_parent_id = s.id));

-- Supply gains BROKERS (Ball / EHR / Express) and per-order evidence so the page can name
-- who an item is coming through and whether each order is backed by a confirmation, a
-- broker report, or both. Columns are appended at the end (create-or-replace rule).
create or replace view v_plan_supply as
select p.plan_id, l.variety_id, p.ship_year, p.ship_week,
       sum(l.qty_ordered)::int                                                   as ordered,
       sum(coalesce(l.qty_confirmed, 0))::int                                    as confirmed,
       count(*)::int                                                             as lines,
       string_agg(distinct p.order_number, ', ' order by p.order_number)         as orders,
       string_agg(distinct coalesce(p.supplier, '?'), ' / ')                     as suppliers,
       string_agg(distinct coalesce(p.broker, '?'), ' / ')                       as brokers,
       string_agg(distinct p.order_number || ':' || p.broker || ':' ||
                  case when p.ack_pdf_path is not null and p.report_seen_at is not null then 'both'
                       when p.ack_pdf_path is not null then 'conf'
                       when p.report_seen_at is not null then 'report' else 'none' end, ',')  as order_evidence
from purchase_order_lines l
join purchase_orders p on p.id = l.purchase_order_id
where l.variety_id is not null
  and coalesce(p.status, '') not in ('cancelled', 'superseded', 'draft')
group by p.plan_id, l.variety_id, p.ship_year, p.ship_week;
