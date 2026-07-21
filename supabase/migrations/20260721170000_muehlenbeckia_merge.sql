-- Muehlenbeckia: one item, entered twice under two spellings — confirmed by Caleb.
--
--   4.5" MUHLENBECKIA WIRE VINE 'COINS'          92 pots   ship wk45
--   4.5" MUEHLENBECKIA WIRE VINE (SOUTH SHELF)  290 pots   ship wk45
--
-- Same size, same ship week, neither flagged as a combo component. The second
-- carries a bench location in the product name, which is why it read as separate.
-- Canonical name uses the botanically correct spelling (Muehlenbeckia complexa)
-- plus the cultivar; the bench note moves to the notes column where it belongs.
--
-- Combined: 382 pots planned against 160 units sold retail in 2026 — the balance
-- goes into combos, which is the dual-use question flagged separately.

update scheduled_crops sc set
  item_name = '4.5" MUEHLENBECKIA WIRE VINE ''COINS''',
  notes = case
    when sc.item_name like '%SOUTH SHELF%'
      then trim(both ' · ' from coalesce(sc.notes, '') || ' · south shelf')
    else sc.notes end
from production_plans p
where p.id = sc.plan_id and p.name = 'Spring 2027'
  and (sc.item_name ilike '%MUHLENBECKIA%' or sc.item_name ilike '%MUEHLENBECKIA%');

-- Point the 2026 sales SKU at the canonical name.
update sales_sku_map m
set plan_item_name = '4.5" MUEHLENBECKIA WIRE VINE ''COINS''',
    source = 'caleb-confirmed', note = 'two plan spellings merged 2026-07-21'
where upper(m.sales_desc) like '%MUHLENBECKIA%' or upper(m.sales_desc) like '%MUEHLENBECKIA%';

insert into sales_sku_map (sku, sales_desc, sales_size, plan_item_name, source, note)
select st.sku, st.description, st.size, '4.5" MUEHLENBECKIA WIRE VINE ''COINS''',
       'caleb-confirmed', 'two plan spellings merged 2026-07-21'
from sales_totals st
where st.season = '2026-spring'
  and (upper(st.description) like '%MUHLENBECKIA%' or upper(st.description) like '%MUEHLENBECKIA%')
on conflict (sku) do update set plan_item_name = excluded.plan_item_name,
  source = excluded.source, note = excluded.note;
