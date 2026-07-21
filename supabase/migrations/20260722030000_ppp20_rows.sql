-- The last 36 rows with an inconsistent unit basis.
--
-- These carried ppp = 20 against plants_per_unit = 10, so the earlier
-- normalization (which required ppp = plants_per_unit) deliberately skipped
-- them rather than multiply a number it could not interpret.
--
-- Tested the same way as the rest — against what they actually sold in 2026:
--
--   item                              qty   sold   as cases   as pots/10
--   VINCA TITAN POLKA DOT              90    101       112%        1122%
--   VINCA TITAN ICY PINK               90     95       106%        1056%
--   VINCA TITAN LAVENDER BLUE HALO     89     90       101%        1011%
--   VINCA TITAN-IUM REALLY RED         43     43       100%        1000%
--   TRADESCANTIA WHITE                 20     20       100%        1000%
--   ZINNIA PROFUSION YELLOW            60     48        80%         800%
--
-- "As cases" lands at 45–122% across all 26 that have sales history, clustering
-- around 90–110%. "As pots" gives 267–3800%. So these rows are entered in CASES
-- exactly like the other 757, and ppp = 20 is simply wrong — a 4.5" pot holds
-- one plant. Same treatment: quantity to plants, ppp to 1.
--
-- Two genuine outliers that are NOT unit problems, for the projection session:
--   IPOMOEA SWEET GEORGIA GREEN SPLASH  30 planned vs 114 sold  (380% — short)
--   IPOMOEA SWEET GEORGIA BRONZE        30 planned vs   8 sold  ( 27% — over)
-- Same crop, same planned quantity, opposite outcomes.

begin;

create table if not exists scheduled_crops_ppp20_backup_20260722 as
select id, plan_id, item_name, qty_pots, ppp, plants_per_unit
from scheduled_crops sc
where exists (select 1 from production_plans p where p.id = sc.plan_id and p.name = 'Spring 2027')
  and sc.ppp = 20;

update scheduled_crops sc set
  qty_pots = sc.qty_pots * sc.plants_per_unit,
  ppp = 1,
  updated_at = now()
from production_plans p
where p.id = sc.plan_id
  and p.name = 'Spring 2027'
  and sc.ppp = 20
  and sc.plants_per_unit > 1
  and coalesce(sc.qty_pots, 0) > 0;

commit;

-- After this, every 4.5" row in the plan holds individual plants with ppp = 1,
-- and nothing in Spring 2027 still mixes bases:
--   select count(*) from scheduled_crops sc join production_plans p on p.id=sc.plan_id
--   where p.name='Spring 2027' and sc.plants_per_unit > 1 and sc.ppp >= sc.plants_per_unit;
--   -- expect 0
--
-- Rollback:
--   update scheduled_crops sc set qty_pots = b.qty_pots, ppp = b.ppp
--   from scheduled_crops_ppp20_backup_20260722 b where b.id = sc.id;
