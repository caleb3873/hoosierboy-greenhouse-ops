-- B2B M12: seed the editable merchandising maps + apply to Spring 2027 profiles.
-- Maps are DATA — Caleb/Mario correct them; unmapped items land on the gap punch list.

-- Genus → category (the obvious bulk; strays stay unmapped for the worksheet pass)
insert into category_map (crop_name, category) values
  ('Petunia','color_annuals'),('Calibrachoa','color_annuals'),('Begonia','color_annuals'),
  ('Coleus','color_annuals'),('Geranium','color_annuals'),('Pansy','color_annuals'),
  ('Verbena','color_annuals'),('Dahlia','color_annuals'),('New Guinea Impatiens','color_annuals'),
  ('Impatiens','color_annuals'),('Marigold','color_annuals'),('Zinnia','color_annuals'),
  ('Vinca','color_annuals'),('Salvia','color_annuals'),('Snapdragon','color_annuals'),
  ('Alyssum','color_annuals'),('Lobelia','color_annuals'),('Bacopa','color_annuals'),
  ('Petchoa','color_annuals'),('Lantana','color_annuals'),('Portulaca','color_annuals'),
  ('Bidens','color_annuals'),('Angelonia','color_annuals'),('Celosia','color_annuals'),
  ('Dianthus','color_annuals'),('Gazania','color_annuals'),('Nemesia','color_annuals'),
  ('Osteospermum','color_annuals'),('Scaevola','color_annuals'),('Torenia','color_annuals'),
  ('Fuchsia','color_annuals'),('Ipomoea','color_annuals'),('Dracaena','color_annuals'),
  ('Dusty Miller','color_annuals'),('Petunia Vegetative','color_annuals'),
  ('Hosta','perennials'),('Heuchera','perennials'),('Echinacea','perennials'),
  ('Rudbeckia','perennials'),('Lavender','perennials'),('Coreopsis','perennials'),
  ('Sedum','perennials'),('Phlox','perennials'),('Astilbe','perennials'),
  ('Daylily','perennials'),('Hemerocallis','perennials'),('Ornamental Grass','perennials'),
  ('Fern','perennials'),('Hibiscus','perennials'),('Clematis','perennials'),
  ('Tomato','veggies_herbs'),('Pepper','veggies_herbs'),('Herb','veggies_herbs'),
  ('Basil','veggies_herbs'),('Vegetable','veggies_herbs'),
  ('Mum','specialty'),('Poinsettia','specialty'),('Cabbage','specialty'),('Kale','specialty')
on conflict (crop_name) do nothing;

-- Container → size category (heuristic on name; correctable)
insert into size_category_map (container_id, size_category)
select id,
  case
    when name ~* 'hanging|athena|\bhb\b' then 'hb'
    when name ~* 'flat|tray|pack' then 'flat'
    when name ~* 'quart' then 'quart'
    when name ~* 'gallon' then 'gallon'
    when name ~* 'patio|bowl|planter|dish' then 'planter'
    when name ~* '^4\.5|^4\.33' then '4.5"'
    when name ~* '^5\.5|^5 ' then '5"'
    when name ~* '^6\.5|^6 |^6\.0' then '6.5"'
    when name ~* '^7\.5|^7 ' then '7.5"'
    when name ~* '^8\.5|^8 |^8\.0' then '8.5"'
    when name ~* '^10' then '10"'
    when name ~* '^12' then '12"'
    when name ~* '^13' then '13"'
    else null
  end
from containers
where case
    when name ~* 'hanging|athena|\bhb\b' then 'hb'
    when name ~* 'flat|tray|pack' then 'flat'
    when name ~* 'quart' then 'quart'
    when name ~* 'gallon' then 'gallon'
    when name ~* 'patio|bowl|planter|dish' then 'planter'
    when name ~* '^4\.5|^4\.33' then '4.5"'
    when name ~* '^5\.5|^5 ' then '5"'
    when name ~* '^6\.5|^6 |^6\.0' then '6.5"'
    when name ~* '^7\.5|^7 ' then '7.5"'
    when name ~* '^8\.5|^8 |^8\.0' then '8.5"'
    when name ~* '^10' then '10"'
    when name ~* '^12' then '12"'
    when name ~* '^13' then '13"'
    else null end is not null
on conflict (container_id) do nothing;

-- Apply to profiles: combos are their own merch category; straights map by genus.
update product_profiles pp set category = 'combos'
from production_items pi
where pi.id = pp.production_item_id and pi.kind = 'combo' and pp.category is null;

update product_profiles pp set category = cm.category
from production_items pi
join variety_library v on v.id = pi.variety_id
join category_map cm on cm.crop_name = v.crop_name
where pi.id = pp.production_item_id and pp.category is null;

update product_profiles pp set size_category = scm.size_category
from production_items pi
join size_category_map scm on scm.container_id = pi.container_id
where pi.id = pp.production_item_id and pp.size_category is null;
