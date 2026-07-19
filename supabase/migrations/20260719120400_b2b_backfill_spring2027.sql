-- B2B data core M5: Spring 2027 backfill — items, groups, profile skeletons, row linkage.
-- Idempotent-ish: guarded by "not exists" on production_items for the plan.
do $$
declare v_plan uuid := 'd2360134-0fbb-4548-af2f-5cc3ccd590c6'; -- Spring 2027
begin
  if exists (select 1 from production_items where plan_id = v_plan) then
    raise notice 'Spring 2027 already backfilled — skipping';
    return;
  end if;

  -- 1. Items: one per variety × container over non-component rows; combo if any row parents components.
  with base as (
    select sc.*, exists (select 1 from scheduled_crops c2 where c2.combo_parent_id = sc.id) as is_parent
    from scheduled_crops sc
    where sc.plan_id = v_plan and not sc.is_combo_component
  ),
  grouped as (
    select plan_id, variety_id, container_id, bool_or(is_parent) as any_parent
    from base group by 1, 2, 3
  ),
  numbered as (
    select g.*, row_number() over (order by coalesce(v.crop_name,''), coalesce(v.variety,''), coalesce(c.name,'')) as rn
    from grouped g
    left join variety_library v on v.id = g.variety_id
    left join containers c on c.id = g.container_id
  )
  insert into production_items (plan_id, kind, variety_id, container_id, sku)
  select plan_id, case when any_parent then 'combo' else 'straight' end,
         variety_id, container_id, 'S27-' || lpad(rn::text, 4, '0')
  from numbered;

  -- 2. Link bench rows: non-components by grain; components via their parent's item.
  update scheduled_crops sc set production_item_id = pi.id
  from production_items pi
  where sc.plan_id = v_plan and not sc.is_combo_component
    and pi.plan_id = sc.plan_id and pi.variety_id = sc.variety_id and pi.container_id = sc.container_id;

  update scheduled_crops sc set production_item_id = p.production_item_id
  from scheduled_crops p
  where sc.plan_id = v_plan and sc.is_combo_component and p.id = sc.combo_parent_id;

  -- 3. Groups: one per (item, ship week); labelled Round 1..n by ascending week.
  insert into production_item_groups (production_item_id, ship_week, ship_year, label)
  select production_item_id, ship_week, ship_year,
         'Round ' || dense_rank() over (partition by production_item_id order by ship_year nulls first, ship_week)
  from (
    select distinct sc.production_item_id, sc.ship_week, sc.ship_year
    from scheduled_crops sc
    where sc.plan_id = v_plan and not sc.is_combo_component
      and sc.production_item_id is not null and sc.ship_week is not null
  ) d;

  -- 4. Profile skeletons (draft): display/pack/price seeded from the plan's dominant values.
  insert into product_profiles (production_item_id, display_name, pack_size, price)
  select sc.production_item_id,
         mode() within group (order by sc.item_name),
         mode() within group (order by sc.pack_size),
         mode() within group (order by sc.sale_price_per_pot)
  from scheduled_crops sc
  where sc.plan_id = v_plan and not sc.is_combo_component and sc.production_item_id is not null
  group by sc.production_item_id;

  -- 5. Adopt sales-system SKUs where the mapping is unambiguous.
  update production_items pi set legacy_sku = m.sku
  from product_profiles pp, sales_sku_map m
  where pp.production_item_id = pi.id and pi.plan_id = v_plan
    and m.plan_item_name = pp.display_name
    and (select count(*) from sales_sku_map m2 where m2.plan_item_name = m.plan_item_name) = 1;
end $$;
