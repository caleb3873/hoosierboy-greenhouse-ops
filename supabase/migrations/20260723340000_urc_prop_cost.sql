-- URC/CALL cuttings don't stick themselves. Add propagation cost to the plan's
-- cost engine: sticking labor (cost_settings.urc_stick_cost, default $0.015 —
-- ~1,200 sticks/hr at ~$18/hr loaded) + the plug tray's per-cell share
-- (row-level prop_tray_id, defaulting to the 105 HV: $0.85 / 100 cells).
-- Spring 2027 carries ~574k URC/CALL plants, so this is ~$13.6k of real cost.

create table if not exists cost_settings (
  key text primary key,
  value numeric not null,
  note text,
  updated_at timestamptz not null default now()
);
alter table cost_settings enable row level security;
drop policy if exists cost_settings_all on cost_settings;
create policy cost_settings_all on cost_settings for all using (true) with check (true);
insert into cost_settings (key, value, note) values
  ('urc_stick_cost', 0.015, 'labor to stick one URC/callused cutting — ~1,200/hr at ~$18/hr loaded')
on conflict (key) do nothing;

alter table scheduled_crops add column if not exists prop_tray_id uuid references containers(id);
comment on column scheduled_crops.prop_tray_id is
  'Plug tray this row roots in (URC/CALL only). NULL = the default 105 Hexagonal Vented tray.';

-- cost view: same plant-count logic as liner_cost; new prop_cost column APPENDED
-- (create or replace allows appending), included in direct_cost_total.
create or replace view v_scheduled_crops_cost as
 SELECT sc.id, sc.plan_id, sc.plant_week, sc.bench_id, sc.variety_id, sc.container_id,
    sc.qty_pots, sc.ppp, sc.qty_plants_ordered, sc.is_combo_component, sc.combo_parent_id,
    (CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
        WHEN (EXISTS (SELECT 1 FROM scheduled_crops x WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
        ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
     END * COALESCE(sc.liner_unit_cost, 0::numeric))::numeric(10,2) AS liner_cost,
    CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(c.cost_per_unit, 0::numeric)
    END::numeric(10,2) AS pot_cost,
    CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric)
    END::numeric(10,2) AS soil_cost,
    CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(r.cost_per_unit, 0::numeric)
    END::numeric(10,2) AS ring_cost,
    ((CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
        WHEN (EXISTS (SELECT 1 FROM scheduled_crops x WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
        ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
      END * COALESCE(sc.liner_unit_cost, 0::numeric)) +
     CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(c.cost_per_unit, 0::numeric)
           + sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(c.fill_volume_cu_ft, 0::numeric) * COALESCE(s.cost_per_bag, 0::numeric) / NULLIF(s.fluffed_volume, 0::numeric)
           + sc.qty_pots::numeric / GREATEST(COALESCE(c.cells_per_flat, 1), 1)::numeric * COALESCE(r.cost_per_unit, 0::numeric)
     END +
     (CASE
        WHEN sc.prop_method IN ('URC','CALL') THEN
          (CASE
             WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
             WHEN (EXISTS (SELECT 1 FROM scheduled_crops x WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
             ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
           END)
          * (COALESCE((SELECT cs.value FROM cost_settings cs WHERE cs.key = 'urc_stick_cost'), 0)
             + COALESCE(pt.cost_per_unit / NULLIF(pt.cells_per_flat, 0)::numeric,
                        dt.cost_per_unit / NULLIF(dt.cells_per_flat, 0)::numeric, 0::numeric))
        ELSE 0::numeric
      END))::numeric(10,2) AS direct_cost_total,
    (CASE
        WHEN sc.prop_method IN ('URC','CALL') THEN
          (CASE
             WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN COALESCE(sc.qty_plants_ordered, 0)::numeric
             WHEN (EXISTS (SELECT 1 FROM scheduled_crops x WHERE x.combo_parent_id = sc.id)) THEN 0::numeric
             ELSE (sc.qty_pots * COALESCE(sc.ppp, 1))::numeric
           END)
          * (COALESCE((SELECT cs.value FROM cost_settings cs WHERE cs.key = 'urc_stick_cost'), 0)
             + COALESCE(pt.cost_per_unit / NULLIF(pt.cells_per_flat, 0)::numeric,
                        dt.cost_per_unit / NULLIF(dt.cells_per_flat, 0)::numeric, 0::numeric))
        ELSE 0::numeric
      END)::numeric(10,2) AS prop_cost
   FROM scheduled_crops sc
     LEFT JOIN containers c ON c.id = sc.container_id
     LEFT JOIN containers r ON r.id = c.default_ring_id
     LEFT JOIN soil_mixes s ON s.id = sc.soil_mix_id
     LEFT JOIN containers pt ON pt.id = sc.prop_tray_id
     LEFT JOIN containers dt ON dt.name = '105 Hexagonal Vented plug tray';

-- pl view: pass prop_cost through (appended column)
create or replace view v_scheduled_crops_pl as
 SELECT sc.id, sc.plan_id, sc.plant_week, sc.bench_id, sc.variety_id, sc.container_id,
    sc.qty_pots, sc.ppp, sc.qty_plants_ordered, sc.is_combo_component, sc.combo_parent_id,
    vc.liner_cost, vc.pot_cost, vc.soil_cost, vc.ring_cost, vc.direct_cost_total,
    pr.price::numeric(10,2) AS sale_price_per_pot,
    (CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(sc.pack_size, 1), 1)::numeric * COALESCE(pr.price, 0::numeric)
     END)::numeric(10,2) AS revenue,
    ((CASE
        WHEN sc.is_combo_component AND sc.combo_parent_id IS NOT NULL THEN 0::numeric
        ELSE sc.qty_pots::numeric / GREATEST(COALESCE(sc.pack_size, 1), 1)::numeric * COALESCE(pr.price, 0::numeric)
      END) - vc.direct_cost_total)::numeric(10,2) AS gross_profit,
    vc.prop_cost
   FROM scheduled_crops sc
     LEFT JOIN v_scheduled_crops_cost vc ON vc.id = sc.id
     LEFT JOIN LATERAL ( SELECT COALESCE(sc.sale_price_per_pot, ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id = sc.variety_id AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year
                  ORDER BY cp.created_at DESC LIMIT 1), ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id IS NULL AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year AND sc.color IS NOT NULL AND upper(cp.crop_name) = upper(sc.color)
                  ORDER BY cp.created_at DESC LIMIT 1), ( SELECT cp.price
                   FROM crop_pricing cp
                  WHERE cp.variety_id IS NULL AND cp.container_id = sc.container_id AND cp.effective_year = sc.plant_year AND (cp.crop_name = ANY (ARRAY['POINSETTIA'::text, '__BASE__'::text]))
                  ORDER BY cp.created_at DESC LIMIT 1)) AS price) pr ON true;
