-- CORRECTION: ppp = 20 was not bad data. It meant TWO PLANTS PER POT.
--
-- In the original encoding ppp counted plants per CASE, not per pot:
--   ppp 10 / plants_per_unit 10  =  10 plants per 10-pot case  = 1 plant per pot
--   ppp 20 / plants_per_unit 10  =  20 plants per 10-pot case  = 2 plants per pot
--
-- Caleb: "some plants require two plants per 4.5\" pot." That is exactly this
-- group — Tradescantia, Ipomoea, Chenille and the Vinca/Zinnia rows, all things
-- you double up for fullness.
--
-- 20260722030000 converted the quantity correctly (cases -> pots) but then set
-- ppp = 1 across the board, which HALVED the liner requirement:
--   4.5" CHENILLE FIRETAIL    1,000 plants needed  ->  500 ordered
--   4.5" TRADESCANTIA WHITE     400 plants needed  ->  200 ordered
-- Left alone that would have under-ordered every double-planted item by half.
--
-- The correct general rule is plants_per_pot = old_ppp / plants_per_unit, which
-- happens to be 1 for the 757 rows normalized earlier (old ppp = plants_per_unit)
-- and 2 for these 36.

update scheduled_crops sc set ppp = greatest(1, b.ppp / nullif(b.plants_per_unit, 0)), updated_at = now()
from scheduled_crops_ppp20_backup_20260722 b
where b.id = sc.id
  and b.plants_per_unit > 0
  and sc.ppp = 1;   -- only the rows the previous migration flattened

-- Verify: liners required must match what the plan needed before any of this.
--   select b.item_name, b.qty_pots * b.ppp as before, sc.qty_pots * sc.ppp as after
--   from scheduled_crops_ppp20_backup_20260722 b join scheduled_crops sc on sc.id = b.id;
--   -- before and after must be equal on every row
