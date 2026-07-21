-- Cost and P&L views were written when qty_pots held CASES. It now holds
-- individual pots, so both were multiplying by the pack size a second time:
-- Begonia showed $2.0M of revenue against a $2.35M whole-season actual.
--
-- Corrected to the units Caleb confirmed:
--   ppp              = plants per POT   (production + cost per item)
--   qty_pots         = individual pots
--   liner_unit_cost  = $ per plant   -> liner cost = qty_pots * ppp * liner_unit_cost
--   pot/soil/ring    = $ per pot     -> qty_pots * unit cost
--   sale_price_per_pot = $ per SELLING UNIT (verified: matches 2026 avg_price
--                        exactly — $31.27 a case of ten 4.5" Solera Red, $7.64
--                        each for an 8" Dahlia) -> revenue = (qty_pots / pack_size) * price

create or replace view v_scheduled_crops_cost as
 SELECT sc.id,
    sc.plan_id,
    sc.plant_week,
    sc.bench_id,
    sc.variety_id,
    sc.container_id,
    sc.qty_pots,
    sc.ppp,
    sc.qty_plants_ordered,
    sc.is_combo_component,
    sc.combo_parent_id,
    (
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
            WHEN (EXISTS ( SELECT 1
               FROM scheduled_crops x
              WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
            ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
        END * COALESCE(sc.liner_unit_cost, 0::numeric))::numeric(10,2) AS liner_cost,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE sc.qty_pots::numeric * COALESCE(c.cost_per_unit, 0::numeric)
        END::numeric(10,2) AS pot_cost,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE sc.qty_pots::numeric * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric)
        END::numeric(10,2) AS soil_cost,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE sc.qty_pots::numeric * COALESCE(r.cost_per_unit, 0::numeric)
        END::numeric(10,2) AS ring_cost,
    (
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
            WHEN (EXISTS ( SELECT 1
               FROM scheduled_crops x
              WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
            ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
        END * COALESCE(sc.liner_unit_cost, 0::numeric) +
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE sc.qty_pots::numeric * COALESCE(c.cost_per_unit, 0::numeric) + sc.qty_pots::numeric * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric) + sc.qty_pots::numeric * COALESCE(r.cost_per_unit, 0::numeric)
        END)::numeric(10,2) AS direct_cost_total
   FROM scheduled_crops sc
     LEFT JOIN containers c ON c.id = sc.container_id
     LEFT JOIN containers r ON r.id = c.default_ring_id
     LEFT JOIN soil_mixes s ON s.id = sc.soil_mix_id;;

create or replace view v_scheduled_crops_pl as
 SELECT sc.id,
    sc.plan_id,
    sc.plant_week,
    sc.bench_id,
    sc.variety_id,
    sc.container_id,
    sc.qty_pots,
    sc.ppp,
    sc.qty_plants_ordered,
    sc.is_combo_component,
    sc.combo_parent_id,
    vc.liner_cost,
    vc.pot_cost,
    vc.soil_cost,
    vc.ring_cost,
    vc.direct_cost_total,
    pr.price::numeric(10,2) AS sale_price_per_pot,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(sc.pack_size, 1), 1)::numeric) * COALESCE(pr.price, 0::numeric)
        END::numeric(10,2) AS revenue,
    (
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(sc.pack_size, 1), 1)::numeric) * COALESCE(pr.price, 0::numeric)
        END - vc.direct_cost_total)::numeric(10,2) AS gross_profit
   FROM scheduled_crops sc
     LEFT JOIN v_scheduled_crops_cost vc ON vc.id = sc.id
     LEFT JOIN LATERAL ( SELECT COALESCE(sc.sale_price_per_pot, ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id = sc.variety_id AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year
                  ORDER BY cp.created_at DESC
                 LIMIT 1), ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id IS NULL AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year AND sc.color IS NOT NULL AND upper(cp.crop_name) = upper(sc.color)
                  ORDER BY cp.created_at DESC
                 LIMIT 1), ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id IS NULL AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year AND (cp.crop_name = ANY (ARRAY['POINSETTIA'::text, '__BASE__'::text]))
                  ORDER BY cp.created_at DESC
                 LIMIT 1)) AS price) pr ON true;;
