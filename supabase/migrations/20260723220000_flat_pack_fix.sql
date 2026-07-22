-- Quonset 03/05 revenue was 18x reality (Caleb caught it: "the revenue numbers
-- seem super high... something is priced wrong").
--
-- The 1801 pansy flats came through unit normalization with qty in PLANTS but
-- pack_size still 1, so revenue read every plant as an $11.66 flat sale —
-- $406,695 showing where the truth is ~$22,600. Container costs had the twin
-- bug: one 18-cell tray was being charged per PLANT.
--
-- 1) pack_size = plants_per_unit for the converted flat rows (the sellable unit
--    is the flat of 18; price matches the 2026 avg to the cent).
update scheduled_crops sc set pack_size = sc.plants_per_unit, updated_at = now()
from production_plans p
where p.id = sc.plan_id and p.name = 'Spring 2027'
  and sc.plants_per_unit > 1 and sc.ppp = 1
  and sc.pack_size is distinct from sc.plants_per_unit
  and coalesce(sc.is_combo_component, false) = false;

-- 2) container/soil/ring costs divide by containers.cells_per_flat (1801s = 18;
--    every other container in the plan is 1, so nothing else moves).
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
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(c.cost_per_unit, 0::numeric)
        END::numeric(10,2) AS pot_cost,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric)
        END::numeric(10,2) AS soil_cost,
        CASE
            WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(r.cost_per_unit, 0::numeric)
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
            ELSE (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(c.cost_per_unit, 0::numeric) + (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric) + (sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric) * COALESCE(r.cost_per_unit, 0::numeric)
        END)::numeric(10,2) AS direct_cost_total
   FROM scheduled_crops sc
     LEFT JOIN containers c ON c.id = sc.container_id
     LEFT JOIN containers r ON r.id = c.default_ring_id
     LEFT JOIN soil_mixes s ON s.id = sc.soil_mix_id;;
