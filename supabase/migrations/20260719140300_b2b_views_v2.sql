-- B2B inventory M11: availability rule v2 (event ledger replaces adjustments), grade/location
-- views, count scheduling, hot-list guard, and the deterministic assortment engine.

-- ── Availability v2: sellable_now = released + Σ event deltas − committed − shipped ──
-- (drop first: replace can't reorder columns; nothing depends on it yet)
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
base as (
  select pi.id as production_item_id, pp.id as product_profile_id, pi.plan_id, pi.sku, pi.kind,
         pi.availability_floor,
         pp.status as profile_status, pl.status as plan_status,
         coalesce(i.planned, 0) as planned,
         coalesce(i.released, 0) as released,
         coalesce(e.event_delta, 0) as event_delta,
         coalesce(c.committed, 0) as committed,
         coalesce(s2.shipped, 0) as shipped,
         i.next_ready_date
  from production_items pi
  join production_plans pl on pl.id = pi.plan_id
  left join product_profiles pp on pp.production_item_id = pi.id
  left join per_item i on i.production_item_id = pi.id
  left join ev e on e.production_item_id = pi.id
  left join comm c on c.production_item_id = pi.id
  left join shp s2 on s2.production_item_id = pi.id
)
select b.*, (b.released + b.event_delta - b.committed - b.shipped) as sellable_now,
  case
    when b.product_profile_id is null or b.profile_status <> 'published' then 'hidden'
    when b.plan_status = 'archived' then 'ended'
    when b.released = 0 and b.next_ready_date is not null then 'coming_soon'
    when (b.released + b.event_delta - b.committed - b.shipped) <= 0 and b.next_ready_date is not null then 'more_coming'
    when (b.released + b.event_delta - b.committed - b.shipped) <= 0 then 'sold_out'
    when (b.released + b.event_delta - b.committed - b.shipped)
         <= greatest(coalesce(b.availability_floor, st.low_abs), st.low_pct * b.planned) then 'low'
    else 'available'
  end as availability_status
from base b cross join st;

-- Ledger replaces the adjustments table (empty; superseded — a manual adjustment is a loss/count event).
drop table if exists production_item_adjustments;

-- ── Physical stock by grade: default grade holds the baseline; grade_change moves qty between grades;
--    graded losses/counts hit their grade, ungraded ones hit the default. (No order netting — this is condition split.)
create or replace view v_item_grade_availability as
with moves as (
  select production_item_id, to_grade as grade, sum(qty)::int as q from inventory_events where kind = 'grade_change' group by 1, 2
  union all
  select production_item_id, from_grade, -sum(qty)::int from inventory_events where kind = 'grade_change' group by 1, 2
),
graded_deltas as (
  select e.production_item_id, coalesce(e.grade, pi.default_grade) as grade, sum(e.qty_delta)::int as q
  from inventory_events e join production_items pi on pi.id = e.production_item_id
  where e.kind <> 'grade_change'
  group by 1, 2
),
phys as (select production_item_id, on_hand from v_item_physical)
select pi.id as production_item_id, g.code as grade,
  (case when g.code = pi.default_grade
        then coalesce(p.on_hand, 0) - coalesce((select sum(q) from graded_deltas gd where gd.production_item_id = pi.id and gd.grade <> pi.default_grade), 0)
             - coalesce((select sum(m.q) from moves m where m.production_item_id = pi.id and m.grade <> pi.default_grade), 0)
        else coalesce((select sum(gd.q) from graded_deltas gd where gd.production_item_id = pi.id and gd.grade = g.code), 0)
             + coalesce((select sum(m.q) from moves m where m.production_item_id = pi.id and m.grade = g.code), 0)
   end)::int as on_hand
from production_items pi
cross join grades g
left join phys p on p.production_item_id = pi.id;

-- ── On-hand by location: plan rows + located events (order netting not bench-attributed in v1). ──
create or replace view v_item_location_qty as
with plan_rows as (
  select sc.production_item_id, sc.bench_id, sum(sc.qty_pots)::int as planted
  from scheduled_crops sc
  where sc.production_item_id is not null and not sc.is_combo_component and sc.bench_id is not null
  group by 1, 2
),
loc_events as (
  select production_item_id, bench_id, sum(qty_delta)::int as event_delta
  from inventory_events where bench_id is not null group by 1, 2
)
select coalesce(p.production_item_id, e.production_item_id) as production_item_id,
       coalesce(p.bench_id, e.bench_id) as bench_id,
       b.code as bench_code,
       coalesce(p.planted, 0) as planted,
       coalesce(e.event_delta, 0) as event_delta,
       coalesce(p.planted, 0) + coalesce(e.event_delta, 0) as located_qty
from plan_rows p
full outer join loc_events e on e.production_item_id = p.production_item_id and e.bench_id = p.bench_id
join benches b on b.id = coalesce(p.bench_id, e.bench_id);

-- ── Count scheduling: items overdue for a count, most overdue first. ──
create or replace view v_counts_due as
select pi.id as production_item_id, pi.sku, pp.display_name, pi.days_between_counts,
       max(e.created_at) filter (where e.kind = 'count') as last_count_at,
       (current_date - coalesce(max(e.created_at) filter (where e.kind = 'count')::date, pi.created_at::date)) as days_since_count
from production_items pi
left join product_profiles pp on pp.production_item_id = pi.id
left join inventory_events e on e.production_item_id = pi.id
where pi.days_between_counts is not null
group by pi.id, pi.sku, pp.display_name, pi.days_between_counts, pi.created_at
having (current_date - coalesce(max(e.created_at) filter (where e.kind = 'count')::date, pi.created_at::date)) >= pi.days_between_counts
order by (current_date - coalesce(max(e.created_at) filter (where e.kind = 'count')::date, pi.created_at::date)) - pi.days_between_counts desc;

-- ── Hot-list guard: never push a list whose items are about to sell out. ──
create or replace view v_hot_list_health as
select hl.id as hot_list_id, hl.title, hl.state,
       hli.product_profile_id, pp.display_name,
       a.availability_status, a.sellable_now, a.next_ready_date
from hot_lists hl
join hot_list_items hli on hli.hot_list_id = hl.id
join product_profiles pp on pp.id = hli.product_profile_id
left join v_item_availability a on a.product_profile_id = pp.id;

-- ── Assortment engine: deterministic + explainable. No AI. ──
-- Fill a dollar target from popular pools, respecting category mix (%), tier posture,
-- size balance, and LIVE availability (status 'available' only). Per-line rationale.
create or replace function build_assortment(p_template uuid, p_dollars numeric, p_mix_overrides jsonb default null)
returns table (category text, product_profile_id uuid, display_name text, size_category text,
               tier text, qty int, unit_price numeric, line_total numeric, rationale text)
language plpgsql volatile as $$
declare
  t record; cat record; cand record;
  v_mix jsonb; v_budget numeric; v_remaining numeric; v_qty int; v_line_cap numeric;
  v_size_taken jsonb; v_size_target numeric; v_size_frac numeric; v_spent numeric;
begin
  select * into t from customer_type_templates where id = p_template and active;
  if not found then raise exception 'template % not found or inactive', p_template; end if;
  v_mix := coalesce(p_mix_overrides, t.category_mix);

  for cat in select key as cat_name, value::numeric as pct from jsonb_each_text(v_mix) where value::numeric > 0
             order by value::numeric desc, key
  loop
    v_budget := round(p_dollars * cat.pct / 100.0, 2);
    v_remaining := v_budget;
    v_size_taken := '{}'::jsonb;

    for cand in
      select pp.id, pp.display_name, pp.size_category, pp.tier, pp.price, p2.rank, a.sellable_now
      from popular_items p2
      join product_profiles pp on pp.id = p2.product_profile_id
      join v_item_availability a on a.product_profile_id = pp.id
      where p2.active and p2.category = cat.cat_name
        and a.availability_status = 'available'          -- availability-aware: never low/sold-out/unready
        and pp.price is not null and pp.price > 0
        and (t.tier_posture = 'mixed' or pp.tier = t.tier_posture or pp.tier is null)
      order by p2.rank
    loop
      exit when v_remaining < cand.price;
      -- size balance: cap each size at its target share (+15% slack); cap any line at 40% of category budget
      v_size_target := coalesce((t.size_balance ->> coalesce(cand.size_category, '_')), null)::numeric;
      if v_size_target is not null then
        select coalesce(sum(value::numeric), 0) into v_spent from jsonb_each_text(t.size_balance);
        v_size_frac := case when v_spent > 0 then v_size_target / v_spent else 1 end;
        if coalesce((v_size_taken ->> coalesce(cand.size_category, '_'))::numeric, 0)
           >= v_budget * least(v_size_frac + 0.15, 1) then
          continue;  -- this size already has its share of the category budget
        end if;
      end if;
      v_line_cap := least(v_remaining, v_budget * 0.40);
      v_qty := least(floor(v_line_cap / cand.price)::int, cand.sellable_now);
      if v_qty < 1 then continue; end if;

      category := cat.cat_name; product_profile_id := cand.id; display_name := cand.display_name;
      size_category := cand.size_category; tier := cand.tier; qty := v_qty; unit_price := cand.price;
      line_total := round(v_qty * cand.price, 2);
      rationale := format('rank %s in %s pool · %s tier · $%s of $%s category budget (%s%% mix)',
                          cand.rank, cat.cat_name, coalesce(cand.tier, 'untiered'), line_total, v_budget, cat.pct);
      return next;

      v_remaining := v_remaining - line_total;
      v_size_taken := jsonb_set(v_size_taken, array[coalesce(cand.size_category, '_')],
                                to_jsonb(coalesce((v_size_taken ->> coalesce(cand.size_category, '_'))::numeric, 0) + line_total));
    end loop;
  end loop;
  return;
end $$;
