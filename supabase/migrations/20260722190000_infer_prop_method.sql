-- Fill the 489 blank prop_methods as SUGGESTIONS, never disguised as fact.
--
-- The ship/plant relationship is a reliable marker for whether something needs
-- propagation space, and it agrees with the recorded prop_method almost perfectly:
--
--   DIRECT STICK  63 straight to pot /   0 propagated
--   PLUG         350 straight to pot /  12 propagated
--   BULB          20 straight to pot /   0 propagated
--   URC            7 straight to pot / 574 propagated
--   CALL           0 straight to pot / 104 propagated
--   (blank)      391 straight to pot /  98 propagated
--
-- Caleb confirmed the mechanism: Solera and Fantasia are DIRECT STICK — the
-- cutting goes straight into the final 4.5" pot, no prop tray, ship week = plant
-- week, 4–6 week crop.
--
-- So each blank row is already sorted into one of two buckets by its own dates.
-- Within a bucket we take the majority prop_method used by that same CROP, and
-- fall back to the bucket's overall majority (PLUG straight to pot, URC
-- propagated). prop_method_source records that it was inferred so nobody mistakes
-- a suggestion for a record.

alter table scheduled_crops add column if not exists prop_method_source text;
comment on column scheduled_crops.prop_method_source is
  'recorded = entered by a human; inferred = derived from ship/plant timing + crop majority. Treat inferred as a suggestion.';

update scheduled_crops set prop_method_source = 'recorded'
where prop_method is not null and prop_method_source is null;

with straight as (   -- ship week = plant week → no propagation stage
  select sc.id, v.crop_name,
         (sc.ship_year * 52 + sc.ship_week) = (sc.plant_year * 52 + sc.plant_week) as no_prop
  from scheduled_crops sc
  join production_plans p on p.id = sc.plan_id
  left join variety_library v on v.id = sc.variety_id
  where p.name = 'Spring 2027' and sc.prop_method is null
    and sc.ship_week is not null and sc.plant_week is not null
), crop_majority as (   -- what this crop usually is, per bucket
  select v.crop_name,
         (sc.ship_year * 52 + sc.ship_week) = (sc.plant_year * 52 + sc.plant_week) as no_prop,
         mode() within group (order by sc.prop_method) as usual
  from scheduled_crops sc
  join production_plans p on p.id = sc.plan_id
  join variety_library v on v.id = sc.variety_id
  where p.name = 'Spring 2027' and sc.prop_method is not null
    and sc.ship_week is not null and sc.plant_week is not null
  group by 1, 2
)
update scheduled_crops sc set
  prop_method = coalesce(cm.usual, case when s.no_prop then 'PLUG' else 'URC' end),
  prop_method_source = 'inferred'
from straight s
left join crop_majority cm on cm.crop_name = s.crop_name and cm.no_prop = s.no_prop
where sc.id = s.id;

-- Contradictions worth a human eye — recorded method disagrees with its own dates:
--   select item_name, prop_method, ship_week, plant_week, plant_year
--   from scheduled_crops sc join production_plans p on p.id = sc.plan_id
--   where p.name = 'Spring 2027' and prop_method_source = 'recorded'
--     and ((prop_method in ('URC','CALL') and (ship_year*52+ship_week) = (plant_year*52+plant_week))
--       or (prop_method in ('PLUG','DIRECT STICK','BULB') and (ship_year*52+ship_week) < (plant_year*52+plant_week)));
