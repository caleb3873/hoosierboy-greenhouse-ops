-- Keep the P&L/revenue view in lock-step with the Pricing tool's price model so revenue
-- on the Dashboard/By-Variety/By-Week tabs always reflects exactly what's set in Pricing.
-- Price resolution (first match wins), identical to PricingTab:
--   1. scheduled_crops.sale_price_per_pot   (manual per-row override)
--   2. per-variety override   (crop_pricing.variety_id = sc.variety_id)
--   3. color override         (variety_id null, crop_name = sc.color e.g. RED/WHITE/…)  ← NEW
--   4. size base              (variety_id null, crop_name in POINSETTIA | __BASE__)      ← generalized
-- all scoped to the same container + effective_year = sc.plant_year.
create or replace view v_scheduled_crops_pl as
select sc.id, sc.plan_id, sc.plant_week, sc.bench_id, sc.variety_id, sc.container_id,
       sc.qty_pots, sc.ppp, sc.qty_plants_ordered, sc.is_combo_component, sc.combo_parent_id,
       vc.liner_cost, vc.pot_cost, vc.soil_cost, vc.ring_cost, vc.direct_cost_total,
       pr.price::numeric(10,2) as sale_price_per_pot,
       (case when sc.is_combo_component and sc.combo_parent_id is not null then 0::numeric
             else sc.qty_pots::numeric * coalesce(pr.price, 0::numeric) end)::numeric(10,2) as revenue,
       ((case when sc.is_combo_component and sc.combo_parent_id is not null then 0::numeric
              else sc.qty_pots::numeric * coalesce(pr.price, 0::numeric) end) - vc.direct_cost_total)::numeric(10,2) as gross_profit
from scheduled_crops sc
left join v_scheduled_crops_cost vc on vc.id = sc.id
left join lateral (
  select coalesce(
    sc.sale_price_per_pot,
    (select cp.price from crop_pricing cp
       where cp.variety_id = sc.variety_id and cp.container_id = sc.container_id and cp.effective_year = sc.plant_year
       order by cp.created_at desc limit 1),
    (select cp.price from crop_pricing cp
       where cp.variety_id is null and cp.container_id = sc.container_id and cp.effective_year = sc.plant_year
         and sc.color is not null and upper(cp.crop_name) = upper(sc.color)
       order by cp.created_at desc limit 1),
    (select cp.price from crop_pricing cp
       where cp.variety_id is null and cp.container_id = sc.container_id and cp.effective_year = sc.plant_year
         and cp.crop_name in ('POINSETTIA', '__BASE__')
       order by cp.created_at desc limit 1)
  ) as price
) pr on true;
