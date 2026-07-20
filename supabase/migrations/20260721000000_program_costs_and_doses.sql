-- Real costs and dosing, imported from Reese's Google Sheets:
--   "2025 pesticide cost breakdown"  → cost per oz (most recent pricing)
--   "2024 pesticide cost breakdown"  → container size + cost per container, Brehob stocking
--   "Drench schedule"                → per-pot-size doses + injector ratios
--   "Fertilizer recipies" (Doc)      → tank recipes per injector/house

alter table chem_products add column if not exists container_size_oz numeric;
alter table chem_products add column if not exists container_cost numeric;
alter table chem_products add column if not exists supplier_stocks text; -- Brehob availability

-- products used in the program that weren't in the library yet
insert into chem_products (name, product_type, active_ingredient, moa, rei_hours, targets, application_notes, notes, active)
select * from (values
  ('Kontos','drench','SPIROTETRAMAT','IRAC 23',24,'Aphids, whitefly, mealybug, scale, thrips, root mealybug','Two-way systemic (moves up AND down) — the reason it is the go-to drench for root mealybug. Drench rates are per pot size, see drench_doses.','Imported from the drench schedule — verify EPA # and REI from the label',true),
  ('Citation','spray','CYROMAZINE','IRAC 17',12,'Leafminer, fungus gnat, shore fly','IGR. Primarily leafminer material.','Imported from the 2024 cost sheet — verify EPA #, REI and rates from the label',true),
  ('Grotto','spray','Caprylic/capric acid','Botanical',4,'Algae, moss, general sanitation','Contact herbicide/algaecide — non-selective, keep off crop foliage.','Imported from the 2024 cost sheet — verify from the label',true),
  ('Hachi-Hachi','spray','TOLFENPYRAD','IRAC 21A',12,'Thrips, whitefly, mites, aphids','Broad-spectrum. Watch phytotoxicity on open blooms.','Imported from the 2024 cost sheet — verify EPA #, REI and rates from the label',true),
  ('LalStop K61','drench','Streptomyces griseoviridis K61','Biological (Streptomyces)',4,'Root and stem rots (Fusarium, Pythium, Rhizoctonia)','Preventative biological drench — the drench counterpart to LalStop G46.','Imported from the program sheets — verify from the label',true)
) as v(name, product_type, active_ingredient, moa, rei_hours, targets, application_notes, notes, active)
where not exists (select 1 from chem_products c where lower(c.name) = lower(v.name));

-- cost per oz (2025 sheet) + container economics (2024 sheet)
update chem_products c set
  cost_per_unit = v.per_oz, cost_unit = 'oz',
  container_size_oz = v.size_oz, container_cost = v.cont_cost,
  supplier_stocks = coalesce(v.stocks, c.supplier_stocks)
from (values
  ('3336 F',1.13,320,350.34,'Stocks'),
  ('Altercel',1.19,128,152.07,null),
  ('Altus',6.80,64,419.70,'Stocks'),
  ('Aria',36.00,5.64,198.22,'Stocks'),
  ('Astun',7.00,null,null,null),
  ('Azatin O',9.10,16,274.76,'Stocks'),
  ('BotaniGard 22WP',5.00,16,76.68,'Discontinued — use BotaniGard ES'),
  ('Botanigard ES',2.75,null,null,'can get it in'),
  ('BotryStop',1.83,192,350.41,null),
  ('Cease',0.62,320,197.53,null),
  ('Citation',24.17,16,386.78,null),
  ('Conserve',5.40,32,166.81,null),
  ('Decree',8.23,40,329.16,null),
  ('Distance Insect Growth Regulator',9.30,32,289.62,'Stocks'),
  ('Endeavor',12.70,16,187.77,'Stocks'),
  ('Fenstop',11.01,32,352.19,'Stocks'),
  ('Forbid',40.50,8,324.02,null),
  ('Grotto',0.97,128,123.63,null),
  ('Hachi-Hachi',3.72,64,238.00,null),
  ('Hexygon IQ',6.30,32,238.37,'Stocks'),
  ('Kontos',26.22,8.45,221.60,null),
  ('LALGUARDM52',5.10,34,173.33,'can stock, 2 year'),
  ('LalStop G46',12.10,32,387.20,null),
  ('LalStop K61',10.75,32,344.00,null),
  ('Mainspring GNL',18.60,128,2332.00,'Stocks'),
  ('Medallion WDG',22.50,8,176.00,null),
  ('Minx 2',2.10,32,66.20,'Stocks'),
  ('Molt-X',6.00,null,null,null),
  ('Mural',14.00,16,220.50,'Stocks'),
  ('NOFLY WP',4.50,32,143.52,'checking'),
  ('Overture 35 WP',8.60,16,131.30,'Stocks'),
  ('Pageant',6.71,16,107.35,null),
  ('Pedestal IGR',13.00,32,394.12,'Stocks'),
  ('Phyton 27',2.40,128,280.76,'Stocks'),
  ('Piccolo 10xc',9.83,32,314.50,'Stocks'),
  ('Pradia',9.40,32,285.80,'Stocks'),
  ('Protect DF',0.50,96,45.96,'Stocks'),
  ('Pylon',27.40,32,731.50,'Stocks'),
  ('Regalia',0.85,320,243.75,'2 year, stocks'),
  ('Rycar',24.25,8,190.35,'Stocks'),
  ('Safari 20 SG Insecticide',8.28,48,397.20,'Stocks'),
  ('Sanmite SC',15.30,32,473.81,'Stocks'),
  ('Sarisa',4.20,64,257.90,'Stocks'),
  ('Segway O',13.14,64,841.05,null),
  ('Seido',16.75,null,null,null),
  ('Shuttle 0',10.20,16,214.59,'Stocks'),
  ('Stargus',0.55,null,null,null),
  ('Sultan miticide',11.60,16,160.93,'Stocks'),
  ('Tetracurb',1.20,null,null,null),
  ('TetraSan 5 WDG',8.00,16,125.90,'Stocks'),
  ('Topflor',4.44,68,302.00,'Stocks'),
  ('Triathlon BA',0.90,128,111.46,'Stocks'),
  ('Truban',3.43,32,109.77,null),
  ('Velifer',5.06,32,161.84,'can get in'),
  ('Venerate XC',1.00,320,284.38,'stock, checking'),
  ('Xxpire',21.25,16,329.20,'Stocks')
) as v(name, per_oz, size_oz, cont_cost, stocks)
where c.name = v.name;

-- Per-pot-size drench doses + injector ratios (from the drench schedule sheet).
-- This is what makes a drench task dose itself instead of relying on memory.
create table if not exists drench_doses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references chem_products(id),
  product_name text not null,
  pot_size text not null,          -- '8"', '10"', '12"', '16"'
  dose_per_pot text not null,      -- e.g. '22 oz'
  injector_ratio numeric,          -- 100 = 1:100
  notes text,
  created_at timestamptz not null default now()
);
alter table drench_doses enable row level security;
drop policy if exists drench_doses_all on drench_doses;
create policy drench_doses_all on drench_doses for all using (true) with check (true);

insert into drench_doses (product_name, pot_size, dose_per_pot, injector_ratio, notes)
select * from (values
  ('Kontos','8"','17 oz',100,null),
  ('Kontos','10"','22 oz',100,null),
  ('Kontos','12"','26 oz',100,null),
  ('Kontos','16"','36 oz',100,null),
  ('Kontos','6"','12.8 oz',100,'Bluff Main — Colocasia'),
  ('Mainspring GNL','8"','6 oz',100,null),
  ('Mainspring GNL','10"','15–20 oz',100,null),
  ('Mainspring GNL','12"','20 oz',50,null),
  ('Mainspring GNL','16"','25 oz',50,null),
  ('Pradia','10"','15–20 oz',100,'Same rates as Mainspring'),
  ('Pradia','12"','20 oz',100,'Same rates as Mainspring'),
  ('Pradia','16"','25 oz',100,'Same rates as Mainspring')
) as v(product_name, pot_size, dose_per_pot, injector_ratio, notes)
where not exists (select 1 from drench_doses);

update drench_doses d set product_id = c.id
from chem_products c where lower(c.name) = lower(d.product_name) and d.product_id is null;

-- Fertigation tank recipes (from the "Fertilizer recipies" Doc)
create table if not exists fertigation_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  tank_gal numeric,
  injector_setting text,
  recipe text not null,
  season text,
  target_ec numeric,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table fertigation_recipes enable row level security;
drop policy if exists fertigation_recipes_all on fertigation_recipes;
create policy fertigation_recipes_all on fertigation_recipes for all using (true) with check (true);

insert into fertigation_recipes (name, location, tank_gal, injector_setting, recipe, season, target_ec, notes)
select * from (values
  ('Prop Feed — Main Range','main',null,'0.5','20-3-19 at 50 ppm · 25 lb feed in tank · 1 of each Ag Nutrition bottle including L-40 · 4 cups Fol','December–April',1.4,'EC 1.4'),
  ('Summer Feed — Main Range','main',null,'1','24-8-16 at 50 ppm (7 lb) · 1 bottle of each Ag Nutrition except L-40 · 4 cups Fol','May–November',null,null),
  ('Prop Feed — West Side (front left)','west',50,null,'20-3-19 — only 4 bags, more will not mix in the water',null,null,'50 gal tank'),
  ('Ag Feed — West Side (back right)','west',50,'10','1 bottle of each Ag Nutrition except L-40 · Kxcel 4 cups all winter · Win 4 cups from April 1',null,null,'Injector at 10. Recipe can be doubled with the injector cut to 5.'),
  ('House Plant Feed — West Side (back left)','west',50,null,'House plant feed',null,null,null),
  ('Poinsettia Feed — West Side (front right)','west',50,null,'6 bags 17-3-17 · 6 scoops molybdenum',null,null,'Changes with crop'),
  ('Geranium Feed — West Side (front right)','west',50,null,'13-2-13 — 6 bags · no acid',null,null,'Changes with crop'),
  ('Bluff Main — side tank','bluff',40,'1:200','2 bags 13-2-13 at 100 ppm',null,null,'Acid rate in tank later'),
  ('Winter Feed','main',null,null,'1 bag 17-3-17 at 50 ppm · 1 bottle of each Ag Nutrition except L-40 · 4 cups Fol','Until spring',null,null)
) as v(name, location, tank_gal, injector_setting, recipe, season, target_ec, notes)
where not exists (select 1 from fertigation_recipes);
