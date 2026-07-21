-- The six "ambiguous" 2026 SKUs, resolved by QUANTITY CORRELATION rather than
-- name similarity. The plan was built by replaying 2026, so a genuine match
-- should carry a near-identical quantity — and each of these lands within 0–7%:
--
--   HB 10" REIGER YELLOW      598 planned vs 597 sold   (+0%)
--   HB 10" REIGER ORANGE      575 planned vs 557 sold   (+3%)
--   HB 10" REIGER PINK        456 planned vs 454 sold   (+0%)
--   HB 10" REIGER RED         381 planned vs 357 sold   (+7%)
--   HB 10" REIGER WHITE       276 planned vs 282 sold   (-2%)
--   HB 10" GERANIUM MAGENTA   325 planned vs 329 sold   (-1%)
--
-- Name similarity scored these only 0.50 because sales describes the finished
-- basket ("BEGONIA REIGER YELLOW WITH IVY") while the plan names the headline
-- crop ("HB 10\" REIGER YELLOW"). The runner-up candidate for the geranium was
-- "HB 10\" IVY GERANIUM MARCADA PURPLE PASSION" — wrong, and instructively so:
-- an *ivy geranium* is a trailing Pelargonium peltatum variety, not a geranium
-- planted with ivy. That item holds 66 pots and has no sales history at all.

update sales_sku_map m set plan_item_name = v.item, note = v.why, source = 'qty-correlation'
from (values
  ('BEGONIA REIGER YELLOW WITH IVY',  'HB 10" REIGER YELLOW',    'qty 598 vs 597 sold'),
  ('BEGONIA REIGER ORANGE WITH IVY',  'HB 10" REIGER ORANGE',    'qty 575 vs 557 sold'),
  ('BEGONIA REIGER PINK WITH IVY',    'HB 10" REIGER PINK',      'qty 456 vs 454 sold'),
  ('BEGONIA REIGER RED WITH IVY',     'HB 10" REIGER RED',       'qty 381 vs 357 sold'),
  ('BEGONIA REIGER WHITE WITH IVY',   'HB 10" REIGER WHITE',     'qty 276 vs 282 sold'),
  ('GERANIUM WITH IVY MAGENTA(violet)','HB 10" GERANIUM MAGENTA','qty 325 vs 329 sold')
) as v(desc_match, item, why)
where upper(m.sales_desc) = upper(v.desc_match);

-- Same six, inserted for any SKU that has sales but no map row yet.
insert into sales_sku_map (sku, sales_desc, sales_size, plan_item_name, source, note)
select st.sku, st.description, st.size, v.item, 'qty-correlation', v.why
from sales_totals st
join (values
  ('BEGONIA REIGER YELLOW WITH IVY',  'HB 10" REIGER YELLOW',    'qty 598 vs 597 sold'),
  ('BEGONIA REIGER ORANGE WITH IVY',  'HB 10" REIGER ORANGE',    'qty 575 vs 557 sold'),
  ('BEGONIA REIGER PINK WITH IVY',    'HB 10" REIGER PINK',      'qty 456 vs 454 sold'),
  ('BEGONIA REIGER RED WITH IVY',     'HB 10" REIGER RED',       'qty 381 vs 357 sold'),
  ('BEGONIA REIGER WHITE WITH IVY',   'HB 10" REIGER WHITE',     'qty 276 vs 282 sold'),
  ('GERANIUM WITH IVY MAGENTA(violet)','HB 10" GERANIUM MAGENTA','qty 325 vs 329 sold')
) as v(desc_match, item, why) on upper(st.description) = upper(v.desc_match)
where st.season = '2026-spring'
on conflict (sku) do update set plan_item_name = excluded.plan_item_name,
  source = excluded.source, note = excluded.note;
