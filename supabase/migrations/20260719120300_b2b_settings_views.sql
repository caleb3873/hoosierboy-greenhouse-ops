-- B2B data core M4: settings, price resolution, and the derived views
-- (v_item_availability is THE availability rule — no human ever types "available").
create table if not exists b2b_settings (
  key text primary key,
  value text not null,
  description text
);
insert into b2b_settings (key, value, description) values
  ('trend_min_customers', '4',  'Minimum distinct customers before a trend signal may surface (confidentiality floor)'),
  ('trend_window_days',   '28', 'Rolling window for trend aggregation'),
  ('low_floor_abs',       '10', 'Absolute sellable units at/below which status = low'),
  ('low_floor_pct',       '0.15','Fraction of planned qty at/below which status = low')
on conflict (key) do nothing;
alter table b2b_settings enable row level security;
drop policy if exists b2b_settings_all on b2b_settings;
create policy b2b_settings_all on b2b_settings for all to anon, authenticated using (true) with check (true);

-- Pricing resolution: most specific wins; see M2 header for the rule. Returns price + which rule fired.
create or replace function resolve_unit_price(p_customer uuid, p_profile uuid, p_qty int)
returns table (unit_price numeric, price_source text) language plpgsql stable as $$
declare v_price numeric; v_list numeric; v_pct numeric; v_level uuid; v_level_pct numeric;
begin
  select cip.unit_price into v_price from customer_item_prices cip
    where cip.customer_id = p_customer and cip.product_profile_id = p_profile;
  if found then return query select v_price, 'customer_contract'::text; return; end if;

  select c.price_level_id, pl.default_pct_off into v_level, v_level_pct
    from shipping_customers c left join price_levels pl on pl.id = c.price_level_id
    where c.id = p_customer;
  if v_level is not null then
    select lip.unit_price into v_price from level_item_prices lip
      where lip.price_level_id = v_level and lip.product_profile_id = p_profile;
    if found then return query select v_price, 'level_item'::text; return; end if;
  end if;

  select pb.unit_price into v_price from product_price_breaks pb
    where pb.product_profile_id = p_profile and pb.min_qty <= coalesce(p_qty, 1)
    order by pb.min_qty desc limit 1;
  if found then return query select v_price, 'item_break'::text; return; end if;

  select pp.price into v_list from product_profiles pp where pp.id = p_profile;
  if v_level_pct is not null then v_list := round(v_list * (1 - v_level_pct / 100.0), 2); end if;

  select gb.pct_off into v_pct from global_price_breaks gb
    where gb.min_qty <= coalesce(p_qty, 1)
    order by gb.min_qty desc limit 1;
  if found then return query select round(v_list * (1 - v_pct / 100.0), 2), 'global_break'::text; return; end if;

  return query select v_list, (case when v_level_pct is not null then 'level_default' else 'list' end)::text;
end $$;

-- THE availability derivation (documented in docs/b2b-data-core.md):
-- sellable_now = released + adjustments − committed − shipped, where released phases in per GROUP
-- as each round's ready week arrives (ship week, or the floor-corrected override).
create or replace view v_item_availability as
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
    and not sc.is_combo_component
    and sc.ship_week = g.ship_week
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
adj as (select production_item_id, sum(qty_delta)::int as adjustments from production_item_adjustments group by 1),
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
base as (
  select pi.id as production_item_id, pp.id as product_profile_id, pi.plan_id, pi.sku, pi.kind,
         pp.status as profile_status, pl.status as plan_status,
         coalesce(i.planned, 0) as planned,
         coalesce(i.released, 0) as released,
         coalesce(a.adjustments, 0) as adjustments,
         coalesce(c.committed, 0) as committed,
         coalesce(s2.shipped, 0) as shipped,
         i.next_ready_date
  from production_items pi
  join production_plans pl on pl.id = pi.plan_id
  left join product_profiles pp on pp.production_item_id = pi.id
  left join per_item i on i.production_item_id = pi.id
  left join adj a on a.production_item_id = pi.id
  left join comm c on c.production_item_id = pi.id
  left join shp s2 on s2.production_item_id = pi.id
)
select b.*, (b.released + b.adjustments - b.committed - b.shipped) as sellable_now,
  case
    when b.product_profile_id is null or b.profile_status <> 'published' then 'hidden'
    when b.plan_status = 'archived' then 'ended'
    when b.released = 0 and b.next_ready_date is not null then 'coming_soon'
    when (b.released + b.adjustments - b.committed - b.shipped) <= 0 and b.next_ready_date is not null then 'more_coming'
    when (b.released + b.adjustments - b.committed - b.shipped) <= 0 then 'sold_out'
    when (b.released + b.adjustments - b.committed - b.shipped) <= greatest(st.low_abs, st.low_pct * b.planned) then 'low'
    else 'available'
  end as availability_status
from base b cross join st;

-- Trend signal: aggregates ONLY — no customer identifier is selected into this view, and rows
-- surface only at/above the distinct-customer floor. Buyers may be competitors; treat as confidentiality.
create or replace view v_item_trends as
with cfg as (
  select
    coalesce((select value::int from b2b_settings where key='trend_min_customers'), 4)  as min_customers,
    coalesce((select value::int from b2b_settings where key='trend_window_days'), 28) as window_days
),
w as (
  select l.production_item_id,
         count(distinct o.customer_id) as distinct_customers,
         sum(l.qty)::int as total_qty
  from customer_order_lines l
  join customer_orders o on o.id = l.order_id
  cross join cfg
  where o.type = 'customer' and o.customer_id is not null
    and o.status not in ('draft','cancelled')
    and coalesce(o.placed_at, o.created_at) >= now() - (cfg.window_days || ' days')::interval
  group by 1
)
select w.production_item_id, w.distinct_customers, w.total_qty, true as trending
from w cross join cfg
where w.distinct_customers >= cfg.min_customers;

-- Pick-sheet hook: where an item physically lives (bench codes already encode walking order).
create or replace view v_item_locations as
select sc.production_item_id, b.code as bench_code, b.id as bench_id,
       sc.ship_week, sc.ship_year, sum(sc.qty_pots)::int as qty
from scheduled_crops sc
join benches b on b.id = sc.bench_id
where sc.production_item_id is not null and not sc.is_combo_component
group by sc.production_item_id, b.code, b.id, sc.ship_week, sc.ship_year;
