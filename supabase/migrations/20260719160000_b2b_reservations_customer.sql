-- B2B M13: reservation (blanket) orders with AUTO-LAPSE + customer-profile support tables.
-- The old reservation system failed because releasing reserved stock was a manual decision
-- under season time pressure. Here release is DERIVED: untaken qty past its take-by date
-- simply stops subtracting from availability. Humans only override (release early / extend).

-- 1. Order type: reservation (blanket order; lines may target coming_soon items — that's the point)
alter table customer_orders drop constraint if exists customer_orders_type_check;
alter table customer_orders add constraint customer_orders_type_check
  check (type in ('customer','speculation','reservation'));

-- 2. Reservation-line mechanics
alter table customer_order_lines add column if not exists take_by_date date;          -- null = derived: item ready + grace
alter table customer_order_lines add column if not exists released_at timestamptz;    -- early release (manual override, logged)
alter table customer_order_lines add column if not exists released_by text;
alter table customer_order_lines add column if not exists notified_at timestamptz;    -- take-it-or-lose-it reminder sent
alter table customer_order_lines add column if not exists reservation_line_id uuid references customer_order_lines(id); -- drawdown link
create index if not exists col_reservation on customer_order_lines (reservation_line_id);

insert into b2b_settings (key, value, description) values
  ('reservation_grace_days', '14', 'Days after an item''s ready date before untaken reserved qty lapses to open availability'),
  ('reservation_at_risk_days', '7', 'Days before take-by at which a reservation line counts as at-risk (notify window)')
on conflict (key) do nothing;

-- 3. Per-line reservation state — THE hub + customer-visibility feed.
--    taken = drawdown lines referencing this line (any non-cancelled order)
--    take_by = explicit date, else item first-ready + grace
--    state: fulfilled | released | lapsed | at_risk | active | pending (item not ready yet)
create or replace view v_customer_reservations as
with cfg as (
  select coalesce((select value::int from b2b_settings where key='reservation_grace_days'), 14) as grace,
         coalesce((select value::int from b2b_settings where key='reservation_at_risk_days'), 7) as risk
),
ready as (
  select g.production_item_id,
         min(to_date(coalesce(g.ready_year_override, g.ship_year)::text || lpad(coalesce(g.ready_week_override, g.ship_week)::text, 2, '0'), 'IYYYIW')) as first_ready
  from production_item_groups g group by 1
),
taken as (
  select d.reservation_line_id, sum(d.qty)::int as taken_qty
  from customer_order_lines d join customer_orders o2 on o2.id = d.order_id
  where d.reservation_line_id is not null and o2.status <> 'cancelled'
  group by 1
)
select o.id as order_id, o.customer_id, c.company_name,
       l.id as line_id, l.production_item_id, pi.sku, pp.display_name,
       l.qty as reserved_qty,
       coalesce(t.taken_qty, 0) as taken_qty,
       greatest(l.qty - coalesce(t.taken_qty, 0), 0) as remaining_qty,
       r.first_ready as ready_date,
       coalesce(l.take_by_date, r.first_ready + cfg.grace) as take_by,
       l.released_at, l.notified_at,
       case
         when coalesce(t.taken_qty, 0) >= l.qty then 'fulfilled'
         when l.released_at is not null then 'released'
         when coalesce(l.take_by_date, r.first_ready + cfg.grace) < current_date then 'lapsed'
         when r.first_ready is null or r.first_ready > current_date then 'pending'
         when coalesce(l.take_by_date, r.first_ready + cfg.grace) <= current_date + cfg.risk then 'at_risk'
         else 'active'
       end as state
from customer_order_lines l
join customer_orders o on o.id = l.order_id and o.type = 'reservation' and o.status in ('placed','confirmed')
left join shipping_customers c on c.id = o.customer_id
join production_items pi on pi.id = l.production_item_id
left join product_profiles pp on pp.production_item_id = pi.id
left join ready r on r.production_item_id = l.production_item_id
left join taken t on t.reservation_line_id = l.id
cross join cfg;

-- 4. Availability v3: reserved term. Active (unlapsed, unreleased, unfulfilled) reserved
--    remainders subtract from open sellable; past take-by they simply stop subtracting.
drop view if exists v_hot_list_health;
drop view if exists v_item_availability;
create view v_item_availability as
with st as (
  select
    coalesce((select value::numeric from b2b_settings where key='low_floor_abs'), 10)  as low_abs,
    coalesce((select value::numeric from b2b_settings where key='low_floor_pct'), .15) as low_pct
),
grp as (
  select g.production_item_id,
         to_date(coalesce(g.ready_year_override, g.ship_year)::text || lpad(coalesce(g.ready_week_override, g.ship_week)::text, 2, '0'), 'IYYYIW') as ready_date,
         sum(sc.qty_pots)::int as qty
  from production_item_groups g
  join scheduled_crops sc on sc.production_item_id = g.production_item_id
    and not sc.is_combo_component and sc.ship_week = g.ship_week
    and coalesce(sc.ship_year, -1) = coalesce(g.ship_year, -1)
  group by g.production_item_id, 2
),
per_item as (
  select production_item_id,
         sum(qty) as planned,
         coalesce(sum(qty) filter (where ready_date <= current_date), 0) as released,
         min(ready_date) filter (where ready_date > current_date) as next_ready_date
  from grp group by 1
),
ev as (select production_item_id, sum(qty_delta)::int as event_delta from inventory_events group by 1),
comm as (
  select l.production_item_id, sum(l.qty)::int as committed
  from customer_order_lines l join customer_orders o on o.id = l.order_id
  where o.type = 'customer' and o.status in ('placed','confirmed','picking')
  group by 1
),
shp as (
  select l.production_item_id, sum(coalesce(l.qty_pulled, l.qty))::int as shipped
  from customer_order_lines l join customer_orders o on o.id = l.order_id
  where o.status in ('shipped','invoiced','closed')
  group by 1
),
rsv as (
  select production_item_id, sum(remaining_qty)::int as reserved
  from v_customer_reservations
  where state in ('active','at_risk','pending')
  group by 1
),
base as (
  select pi.id as production_item_id, pp.id as product_profile_id, pi.plan_id, pi.sku, pi.kind,
         pi.availability_floor,
         pp.status as profile_status, pl.status as plan_status,
         coalesce(i.planned, 0) as planned,
         coalesce(i.released, 0) as released,
         coalesce(e.event_delta, 0) as event_delta,
         coalesce(c.committed, 0) as committed,
         coalesce(s2.shipped, 0) as shipped,
         coalesce(rv.reserved, 0) as reserved,
         i.next_ready_date
  from production_items pi
  join production_plans pl on pl.id = pi.plan_id
  left join product_profiles pp on pp.production_item_id = pi.id
  left join per_item i on i.production_item_id = pi.id
  left join ev e on e.production_item_id = pi.id
  left join comm c on c.production_item_id = pi.id
  left join shp s2 on s2.production_item_id = pi.id
  left join rsv rv on rv.production_item_id = pi.id
)
select b.*, (b.released + b.event_delta - b.committed - b.shipped - b.reserved) as sellable_now,
  case
    when b.product_profile_id is null or b.profile_status <> 'published' then 'hidden'
    when b.plan_status = 'archived' then 'ended'
    when b.released = 0 and b.next_ready_date is not null then 'coming_soon'
    when (b.released + b.event_delta - b.committed - b.shipped - b.reserved) <= 0 and b.next_ready_date is not null then 'more_coming'
    when (b.released + b.event_delta - b.committed - b.shipped - b.reserved) <= 0 then 'sold_out'
    when (b.released + b.event_delta - b.committed - b.shipped - b.reserved)
         <= greatest(coalesce(b.availability_floor, st.low_abs), st.low_pct * b.planned) then 'low'
    else 'available'
  end as availability_status
from base b cross join st;

create view v_hot_list_health as
select hl.id as hot_list_id, hl.title, hl.state,
       hli.product_profile_id, pp.display_name,
       a.availability_status, a.sellable_now, a.next_ready_date
from hot_lists hl
join hot_list_items hli on hli.hot_list_id = hl.id
join product_profiles pp on pp.id = hli.product_profile_id
left join v_item_availability a on a.product_profile_id = pp.id;

-- 5. Customer-profile support
create table if not exists customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references shipping_customers(id) on delete cascade,
  note text not null,
  author text,
  created_at timestamptz default now()
);
create index if not exists cn_customer on customer_notes (customer_id, created_at desc);

create table if not exists customer_recommendations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references shipping_customers(id) on delete cascade,
  product_profile_id uuid references product_profiles(id) on delete set null,
  title text,
  note text,
  author text,
  active boolean default true,
  created_at timestamptz default now()
);
create index if not exists cr_customer on customer_recommendations (customer_id, created_at desc);

alter table shipping_customers add column if not exists hotlist_opt_out boolean default false;

-- Season summary per customer × plan (fills as B2B orders flow; historical delivery-based summary later)
create or replace view v_customer_season_summary as
select o.customer_id, pi.plan_id, pl.name as season,
       count(distinct o.id) as orders,
       sum(l.qty)::int as units,
       round(sum(l.qty * coalesce(l.unit_price, 0))::numeric, 2) as dollars
from customer_orders o
join customer_order_lines l on l.order_id = o.id
join production_items pi on pi.id = l.production_item_id
join production_plans pl on pl.id = pi.plan_id
where o.type = 'customer' and o.status not in ('draft','cancelled')
group by o.customer_id, pi.plan_id, pl.name;

do $$ declare t text;
begin
  foreach t in array array['customer_notes','customer_recommendations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
