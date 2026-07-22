-- Caleb's tray rules (2026-07-22):
--   · all Reiger begonias  → 50-cell deep tray ("50s" = PTT 50 DV)
--   · all geraniums not finishing in 4.5"  → 50-cell deep tray
--   · everything else roots in 105s (the view default — prop_tray_id stays NULL)
with fifty as (select id from containers where name = '50 Sq Deep Vented Plug tray - 2 5/8 deep')
update scheduled_crops sc set prop_tray_id = (select id from fifty)
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id
  and sc.prop_method in ('URC','CALL')
  and sc.prop_tray_id is null
  and (
    (v.crop_name = 'Begonia' and v.variety ~* 'reiger')
    or (v.crop_name ~* 'geranium' and not exists (
          select 1 from containers c where c.id = sc.container_id and c.name ~* '4\.5'))
  );
