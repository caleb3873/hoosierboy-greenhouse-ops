-- Program item builder: species → variety → finished size → name + SKU + cost.
-- Crops dropdown needs a small distinct list, not 39k rows client-side.
create or replace view v_sourcing_crops as
select initcap(lower(crop)) as crop, count(distinct variety_key) as varieties, min(landed) as cheapest
from v_sourcing_prices
where crop is not null and crop <> ''
group by 1;

alter table program_items add column if not exists sku text;
alter table program_items add column if not exists container_id uuid references containers(id);
alter table program_items add column if not exists cost_parts jsonb;  -- {liner, container, soil}
