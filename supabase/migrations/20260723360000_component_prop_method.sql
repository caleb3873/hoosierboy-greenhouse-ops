-- Combo component rows never carried prop_method, so basket plants were about
-- to dodge stick+tray cost. Each variety's own non-component rows say how it
-- arrives (URC/CALL/PLUG) — inherit that, marked inferred. Then Caleb's tray
-- rules apply to components too (basket geraniums are never 4.5" → 50s).
with maj as (
  select variety_id, mode() within group (order by prop_method) as m
  from scheduled_crops where prop_method is not null and variety_id is not null
  group by 1
)
update scheduled_crops sc set prop_method = maj.m, prop_method_source = 'inferred'
from maj, production_plans p
where sc.variety_id = maj.variety_id and sc.plan_id = p.id and p.name = 'Spring 2027'
  and sc.is_combo_component and sc.prop_method is null;

with fifty as (select id from containers where name = '50 Sq Deep Vented Plug tray - 2 5/8 deep')
update scheduled_crops sc set prop_tray_id = (select id from fifty)
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id and p.name = 'Spring 2027'
  and sc.prop_method in ('URC','CALL') and sc.prop_tray_id is null
  and sc.is_combo_component
  and ((v.crop_name = 'Begonia' and v.variety ~* 'reiger') or v.crop_name ~* 'geranium');
