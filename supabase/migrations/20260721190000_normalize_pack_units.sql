-- Normalize the plan to ONE unit: individual plants.
--
-- Today qty_pots means two different things depending on the row, with `ppp`
-- acting as an undocumented flag:
--   ppp >= plants_per_unit  →  qty_pots is a count of CASES   (797 rows)
--   ppp <  plants_per_unit  →  qty_pots is a count of PLANTS  (850 rows)
--
-- Both decode correctly in the Sales vs Plan tab, so sell-through has been
-- right. Everything else that simply SUMS qty_pots has been adding cases to
-- plants: the plan's headline "121,270" is really 531,099 individual plants.
--
-- Caleb's rule: a case of 10 is ten plants, not one item. So the plan stores
-- PLANTS; the case is a selling pack, derived at display time from pack_size.
--
-- After this runs: qty_pots is always individual plants, ppp is always the true
-- plants-per-pot (1 for a 4.5"), pack_size/plants_per_unit stays the selling
-- pack. Order quantities are unchanged: previously qty_pots × ppp (997 × 10),
-- now qty_pots × ppp (9,970 × 1) — the same 9,970 liners.
--
-- NOT converted: 36 rows with ppp = 20 against plants_per_unit = 10. That pair
-- is internally inconsistent and needs a human look — they are listed at the
-- bottom rather than silently multiplied.

begin;

-- snapshot so this is reversible
create table if not exists scheduled_crops_unit_backup_20260721 as
select id, plan_id, item_name, qty_pots, ppp, plants_per_unit, pack_size
from scheduled_crops sc
where exists (select 1 from production_plans p where p.id = sc.plan_id and p.name = 'Spring 2027');

update scheduled_crops sc set
  qty_pots = sc.qty_pots * sc.plants_per_unit,
  ppp = 1,
  updated_at = now()
from production_plans p
where p.id = sc.plan_id
  and p.name = 'Spring 2027'
  and sc.plants_per_unit > 1
  and sc.ppp = sc.plants_per_unit          -- the clean case-entered rows only
  and coalesce(sc.qty_pots, 0) > 0;

commit;

-- Rows left alone for review: ppp does not equal plants_per_unit but still
-- exceeds it, so which basis they use cannot be inferred safely.
--   select item_name, qty_pots, ppp, plants_per_unit
--   from scheduled_crops sc join production_plans p on p.id = sc.plan_id
--   where p.name = 'Spring 2027' and sc.plants_per_unit > 1 and sc.ppp > sc.plants_per_unit;
--
-- To roll back:
--   update scheduled_crops sc set qty_pots = b.qty_pots, ppp = b.ppp
--   from scheduled_crops_unit_backup_20260721 b where b.id = sc.id;
