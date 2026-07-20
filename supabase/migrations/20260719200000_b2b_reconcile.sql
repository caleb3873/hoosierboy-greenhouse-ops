-- B2B M14: reconcile_production_items — planning and the B2B layer stay in lockstep.
-- Caleb keeps planning exactly as before; every cron tick this function absorbs plan changes:
--   new variety×container grains → new items (SKU continues the plan sequence) + draft profiles
--   new bench rows → linked · new ship weeks → new groups (Round n)
--   DRAFT profiles track the plan (name/pack/price/category/size refresh);
--   PUBLISHED profiles are frozen — merchandising owns them from then on.
-- Only plans that already have items are reconciled (opt-in via initial backfill).
create or replace function reconcile_production_items(p_plan uuid)
returns table (new_items int, linked_rows int, new_groups int, refreshed_profiles int)
language plpgsql as $$
declare
  v_prefix text; v_max int;
  v_new_items int := 0; v_linked int := 0; v_groups int := 0; v_profiles int := 0;
begin
  -- sku prefix: 'Spring 2027' → 'S27'
  select coalesce(upper(left(split_part(name, ' ', 1), 1)) || right(split_part(name, ' ', 2), 2), 'PL')
    into v_prefix from production_plans where id = p_plan;
  select coalesce(max(nullif(regexp_replace(sku, '\D', '', 'g'), '')::int), 0)
    into v_max from production_items where plan_id = p_plan;

  -- 1. new items for unseen variety×container grains
  with base as (
    select sc.*, exists (select 1 from scheduled_crops c2 where c2.combo_parent_id = sc.id) as is_parent
    from scheduled_crops sc where sc.plan_id = p_plan and not sc.is_combo_component
  ),
  grains as (
    select plan_id, variety_id, container_id, bool_or(is_parent) as any_parent
    from base group by 1, 2, 3
  ),
  missing as (
    select g.*, row_number() over (order by g.variety_id, g.container_id) as rn
    from grains g
    where not exists (select 1 from production_items pi
                      where pi.plan_id = g.plan_id and pi.variety_id = g.variety_id and pi.container_id = g.container_id)
  ),
  ins as (
    insert into production_items (plan_id, kind, variety_id, container_id, sku)
    select plan_id, case when any_parent then 'combo' else 'straight' end,
           variety_id, container_id, v_prefix || '-' || lpad((v_max + rn)::text, 4, '0')
    from missing returning 1
  )
  select count(*) into v_new_items from ins;

  -- 2. link unlinked rows (non-components by grain, components via parent)
  with l1 as (
    update scheduled_crops sc set production_item_id = pi.id
    from production_items pi
    where sc.plan_id = p_plan and not sc.is_combo_component and sc.production_item_id is null
      and pi.plan_id = sc.plan_id and pi.variety_id = sc.variety_id and pi.container_id = sc.container_id
    returning 1
  ) select count(*) into v_linked from l1;
  update scheduled_crops sc set production_item_id = p.production_item_id
  from scheduled_crops p
  where sc.plan_id = p_plan and sc.is_combo_component and sc.production_item_id is null
    and p.id = sc.combo_parent_id and p.production_item_id is not null;

  -- 3. groups for new (item, ship_week) rounds
  with g1 as (
    insert into production_item_groups (production_item_id, ship_week, ship_year, label)
    select d.production_item_id, d.ship_week, d.ship_year, 'Round ?'
    from (select distinct sc.production_item_id, sc.ship_week, sc.ship_year
          from scheduled_crops sc
          where sc.plan_id = p_plan and not sc.is_combo_component
            and sc.production_item_id is not null and sc.ship_week is not null) d
    where not exists (select 1 from production_item_groups g
                      where g.production_item_id = d.production_item_id and g.ship_week = d.ship_week
                        and coalesce(g.ship_year, -1) = coalesce(d.ship_year, -1))
    returning 1
  ) select count(*) into v_groups from g1;
  -- relabel rounds in week order per item
  update production_item_groups g set label = 'Round ' || r.rnk
  from (select id, dense_rank() over (partition by production_item_id order by ship_year nulls first, ship_week) as rnk
        from production_item_groups) r
  where r.id = g.id and g.production_item_id in (select id from production_items where plan_id = p_plan);

  -- 4. profiles: create for new items; DRAFT profiles track the plan (published are frozen)
  insert into product_profiles (production_item_id, display_name, pack_size, price)
  select sc.production_item_id,
         mode() within group (order by sc.item_name),
         mode() within group (order by sc.pack_size),
         mode() within group (order by sc.sale_price_per_pot)
  from scheduled_crops sc
  join production_items pi on pi.id = sc.production_item_id and pi.plan_id = p_plan
  where not sc.is_combo_component
    and not exists (select 1 from product_profiles pp where pp.production_item_id = sc.production_item_id)
  group by sc.production_item_id;

  with fresh as (
    select sc.production_item_id,
           mode() within group (order by sc.item_name) as dn,
           (mode() within group (order by sc.pack_size))::text as pk,
           mode() within group (order by sc.sale_price_per_pot) as pr
    from scheduled_crops sc
    join production_items pi on pi.id = sc.production_item_id and pi.plan_id = p_plan
    where not sc.is_combo_component
    group by sc.production_item_id
  ),
  upd as (
    update product_profiles pp set
      display_name = coalesce(f.dn, pp.display_name),
      pack_size = coalesce(f.pk, pp.pack_size),
      price = coalesce(f.pr, pp.price),
      price_unit = case when f.pk ~ '^[0-9]+$' and f.pk::int > 1 then 'flat of ' || f.pk else 'pot' end,
      updated_at = now()
    from fresh f
    where f.production_item_id = pp.production_item_id and pp.status = 'draft'
      and (pp.display_name is distinct from f.dn or pp.pack_size is distinct from f.pk or pp.price is distinct from f.pr)
    returning 1
  ) select count(*) into v_profiles from upd;

  -- merchandising seeds for anything still blank
  update product_profiles pp set category = 'combos'
  from production_items pi where pi.id = pp.production_item_id and pi.plan_id = p_plan
    and pi.kind = 'combo' and pp.category is null;
  update product_profiles pp set category = cm.category
  from production_items pi
  join variety_library v on v.id = pi.variety_id
  join category_map cm on cm.crop_name = v.crop_name
  where pi.id = pp.production_item_id and pi.plan_id = p_plan and pp.category is null;
  update product_profiles pp set size_category = scm.size_category
  from production_items pi
  join size_category_map scm on scm.container_id = pi.container_id
  where pi.id = pp.production_item_id and pi.plan_id = p_plan and pp.size_category is null;

  return query select v_new_items, v_linked, v_groups, v_profiles;
end $$;
