-- historical sellable-unit pack per sku (Caleb 8/18): items converted to new pack
-- sizes (1 QT cases of 8) must read their '26 sell-through in the ORIGINAL pack
alter table sales_sku_map add column if not exists hist_pack numeric;
update sales_sku_map set hist_pack = (regexp_match(sales_size, '(\d+)\s*PACK'))[1]::numeric
  where hist_pack is null and sales_size ~ '\d+\s*PACK';
update sales_sku_map set hist_pack = 1
  where hist_pack is null and sales_size ~* '(POT|BASKET|PLANTER|BOWL|GAL)';
notify pgrst, 'reload schema';
