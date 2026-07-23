-- Geranium combo sales were crosswalked to the DYNAMO MONO items, so the
-- FIBER LG. combos showed zero sales and the monos double-counted (~$90k).
-- Plus three neighbors wired to the wrong item. Sales-side descriptions are
-- unambiguous ("GERANIUM COMBO RED" vs "GERANIUM MONO DYNAMO RED").
update sales_sku_map set plan_item_name = 'FIBER LG. GERANIUM COMBO PINK'   where sku = 'AN11FCOM010';
update sales_sku_map set plan_item_name = 'FIBER LG. GERANIUM COMBO RED'    where sku = 'AN11FCOM011';
update sales_sku_map set plan_item_name = 'FIBER LG. GERANIUM COMBO SALMON' where sku = 'AN11FCOM012';
update sales_sku_map set plan_item_name = 'FIBER LG. GERANIUM COMBO VIOLET' where sku = 'AN11FCOM013';
update sales_sku_map set plan_item_name = 'FIBER LG. GERANIUM COMBO WHITE'  where sku = 'AN11FCOM014';
-- sold in 2026 but NOT planned for 2027 — unmap so they surface as honest gaps
update sales_sku_map set plan_item_name = null where sku = 'AN11FCOM039';  -- combo orange
update sales_sku_map set plan_item_name = null where sku = 'AN13DCOM060';  -- mojo combo salmon
-- wrong-neighbor fixes
update sales_sku_map set plan_item_name = 'HB 10" IVY GERANIUM MARCADA PURPLE PASSION' where sku = 'AN10HBGER008';
update sales_sku_map set plan_item_name = 'HB 16" GERANIUM CALLIOPE MEDIUM MIX (WSDR)' where sku = 'AN16HBCOM006';
