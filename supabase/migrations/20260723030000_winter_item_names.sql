-- Winter 2026 rows had item_name = NULL on all 96 rows — the bench view fell
-- back to bare variety names ("Aida Red") with no size, and the B2B profile
-- display names (which refresh from mode(item_name)) were null too.
--
-- Names follow the plan convention (size prefix + UPPER variety) using the
-- locked pot -> selling-size map from the poinsettia program:
--   10 Injection = 8" BLOOM · 13 Patio = 10" BLOOM (premium, no ring)
--   5.5 / 6.5 / 7.5 / 8.5 pots sell as their size (pinched + ring program).

update scheduled_crops sc set item_name =
  case c.name
    when '10 Injection Poinsettia'        then '8" BLOOM '
    when '13 Patio Pot'                   then '10" BLOOM '
    when '5.5 Round Poinsettia'           then '5.5" '
    when '6.5 Azalea Pot - NEW Schlegel'  then '6.5" '
    when '7.50 Az Elite'                  then '7.5" '
    when '8.50 Az Elite'                  then '8.5" '
    else coalesce(c.name, '') || ' '
  end || upper(v.variety),
  updated_at = now()
from production_plans p, containers c, variety_library v
where p.id = sc.plan_id and p.name = 'Winter 2026'
  and c.id = sc.container_id and v.id = sc.variety_id
  and sc.item_name is null;

-- let the reconcile push the new names into the W26 draft catalog profiles now
-- rather than waiting for the next cron tick
select reconcile_production_items((select id from production_plans where name = 'Winter 2026'));
