-- Grower Program: product knowledge (what it treats + how to apply), costing,
-- and application equipment for accurate dosing.

-- 1. Product knowledge + cost
alter table chem_products add column if not exists targets text;            -- pests/diseases it controls (searchable)
alter table chem_products add column if not exists application_notes text;  -- best practices / cautions
alter table chem_products add column if not exists cost_per_unit numeric;   -- $ per cost_unit
alter table chem_products add column if not exists cost_unit text;          -- 'oz' | 'gal' | 'lb' | 'g' | 'ml'
alter table chem_products add column if not exists package_size text;       -- e.g. "1 gal jug", "5 lb bag"
alter table chem_products add column if not exists restricted_use boolean not null default false;

-- 2. Application equipment — drives dose math (tank volume / injector ratio)
create table if not exists application_equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'sprayer',   -- sprayer | fogger | injector | drench | spreader
  capacity_gal numeric,                   -- tank size for sprayers
  injector_ratio numeric,                 -- e.g. 100 for 1:100
  location text,                          -- bluff | sprague | null (both)
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table application_equipment enable row level security;
drop policy if exists application_equipment_all on application_equipment;
create policy application_equipment_all on application_equipment for all using (true) with check (true);

insert into application_equipment (name, kind, capacity_gal, injector_ratio, notes)
select * from (values
  ('100 gal boom sprayer', 'sprayer', 100, null, 'House spray rig'),
  ('25 gal spray cart',    'sprayer', 25,  null, null),
  ('4 gal backpack',       'sprayer', 4,   null, 'Spot treatments'),
  ('2 gal hand pump',      'sprayer', 2,   null, 'Small / trial areas'),
  ('Cold fogger',          'fogger',  null, null, 'Whole-house fog — close up, post REI signs'),
  ('Dosatron 1:100',       'injector', null, 100, 'Fertigation / drench injection'),
  ('Dosatron 1:50',        'injector', null, 50,  null),
  ('Hose-end drench',      'drench',  null, null, 'Measure per-pot volume')
) as v(name, kind, capacity_gal, injector_ratio, notes)
where not exists (select 1 from application_equipment);

-- 3. Equipment + cost captured on the compliance record
alter table spray_records add column if not exists equipment_name text;
alter table spray_records add column if not exists tank_volume_gal numeric;

-- 4. Seed what each product treats + how to use it (label reference — confirm
--    against the current label; this drives the "what treats thrips?" search)
update chem_products c set targets = v.t, application_notes = v.n
from (values
('3336 F','Root & stem rots, Botrytis, powdery mildew, Rhizoctonia, Fusarium, Thielaviopsis','Drench for root disease, spray for foliar. Resistance-prone (FRAC 1) — rotate groups.'),
('Altercel','Height control (PGR)','Chlormequat. Can yellow foliage at high rates or in cool/cloudy weather — trial on a small block first.'),
('Altus','Aphids, whitefly, mealybug, scale, thrips (suppression)','Systemic — spray or drench. Bee caution; do not apply to blooming plants going outdoors.'),
('Ancora','Thrips, whitefly, aphids, mealybug','Live fungus (Isaria). Needs high humidity — apply late day. Do NOT tank-mix with fungicides.'),
('Aria','Aphids, whitefly, mealybug','Feeding cessation — insects stop feeding immediately but die over days. Do not judge by knockdown.'),
('Astun','Botrytis','Protectant — apply before disease pressure builds. Good rotation partner for Decree.'),
('Azatin O','Thrips, whitefly, fungus gnat larvae, aphids, caterpillars','IGR/antifeedant — no adult knockdown. Repeat every 5–7 days to break the cycle.'),
('B9','Height control (PGR)','Spray to glisten, do not run off. Keep foliage dry 12–24h after — no overhead irrigation.'),
('BotaniGard 22WP','Whitefly, thrips, aphids, mealybug','Live Beauveria. Needs humidity + good coverage. Do NOT tank-mix with fungicides. Store cool.'),
('Botanigard ES','Whitefly, thrips, aphids, mealybug','Live Beauveria. Oil-based — watch phytotoxicity on soft new growth and open blooms.'),
('Captiva','Mites, thrips, whitefly','Contact/repellent botanical — often used as a mix partner. Thorough coverage required.'),
('Conserve','Thrips, caterpillars, leafminer','Resistance risk is HIGH — no more than 2 consecutive applications, then rotate groups.'),
('Decree','Botrytis','Botrytis specialist. Rotate with Astun/Pageant to protect it.'),
('Distance Insect Growth Regulator','Whitefly, fungus gnat, scale, mealybug','IGR — sterilizes/blocks development, no adult kill. Pair with an adulticide for active outbreaks.'),
('Endeavor','Aphids, whitefly','Feeding cessation — aphids stop feeding fast, die over several days. Very selective, soft on beneficials.'),
('Fascination','Prevents leaf yellowing, promotes stretch/branching (PGR)','Extremely low rates — measure carefully. Common on lilies and to reverse over-regulation.'),
('Fenstop','Pythium, Phytophthora, downy mildew','Drench for root pathogens, spray for downy. Water in lightly after drench.'),
('Florel','Branching / flower abortion (PGR)','Acidify spray water to pH 4–5 or it degrades in the tank. Never near shipping — it aborts flowers.'),
('floxcor','Broad-spectrum foliar fungicide','Strobilurin (FRAC 11) — rotate with a different group to avoid resistance.'),
('Forbid','Mites (all stages), whitefly','Long residual. Label limits applications per crop — check before the second pass.'),
('Hexygon DF','Mite eggs and immatures','Does NOT kill adult mites. Pair with an adulticide, or use early before adults build.'),
('Hexygon IQ','Mite eggs and immatures','Same as Hexygon DF. Can be used as a dip on incoming cuttings.'),
('LALGUARDM52','Thrips pupae, fungus gnat larvae, root weevil','Live Metarhizium — drench for soil-stage control. Keep media moist after application.'),
('LalStim OSMO','Stress / transplant recovery (biostimulant)','Not a pesticide — supports plants through heat and transplant stress.'),
('Mainspring GNL','Thrips, whitefly, caterpillars, leafminer','Drench gives long systemic control — the highest-value use. Very soft on beneficials.'),
('Mavrik','Mites, whitefly, aphids, thrips','Pyrethroid — hard on beneficials. Watch for mite flaring after use.'),
('Medallion WDG','Botrytis, Rhizoctonia, Fusarium, Cylindrocladium','Excellent Rhizoctonia material. Drench or spray depending on target.'),
('Minx 2','Mites, thrips, leafminer','Same as Avid (abamectin). Add a spreader. NOTE: watch geranium flowers — see label.'),
('Molt-X','Thrips, mealybug, root mealybug, fungus gnats','Azadirachtin IGR — repeat every 5–7 days. No adult knockdown.'),
('Mural','Rhizoctonia, Fusarium, rusts, leaf spots, Pythium suppression','Broad-spectrum, two modes of action. Strong preventative on the bench.'),
('Nemasys','Fungus gnat larvae, thrips pupae','LIVE nematodes — use fresh, keep cool, remove fine screens, low pressure, never chlorinated water.'),
('NOFLY WP','Whitefly, thrips, aphids, mealybug','Live Isaria — needs humidity. Do NOT tank-mix with fungicides.'),
('Obtego','Root rot prevention (Pythium, Rhizoctonia, Fusarium)','Live Trichoderma — preventative colonizer, drench early. Not a curative.'),
('Overture 35 WP','Thrips (larvae), caterpillars','Strongest on thrips larvae — time it to the larval stage, not adults.'),
('Pageant','Botrytis, powdery mildew, leaf spots, Rhizoctonia','Workhorse broad-spectrum. Rotate to protect the FRAC 11 component.'),
('Pedestal IGR','Whitefly, thrips, caterpillars','IGR — blocks molting. Slow, preventative; not a rescue treatment.'),
('Phyton 27','Bacterial leaf spots/blights, downy mildew, some fungal','Systemic copper. Phytotoxicity risk — trial a small block first, avoid heat of day.'),
('Piccolo 10xc','Height control (PGR)','Paclobutrazol. Drench is strong and persistent — dose by substrate volume, err LOW; you cannot undo it.'),
('Pradia','Thrips, aphids, whitefly, mealybug','Two modes in one — good rescue material. Rotate away after to preserve both groups.'),
('Protect DF','Leaf spots, rusts, Botrytis, downy mildew','Protectant only — must be on before infection. Leaves visible residue; avoid on finished plants.'),
('Pylon','Mites, thrips, caterpillars','Do NOT apply to open blooms — phytotoxicity. Excellent mite + thrips material.'),
('Regalia','Powdery mildew, Botrytis, bacterial diseases','Induces the plant''s own resistance — preventative, needs lead time. DO NOT FOG — it burns.'),
('Rycar','Whitefly, aphids, mealybug, thrips','Feeding cessation. Good rotation partner with Endeavor (same group — do not follow one with the other).'),
('Safari 20 SG Insecticide','Whitefly, aphids, scale, mealybug, thrips','Systemic drench for long control. Neonicotinoid — bee caution, never on plants going to pollinator sales.'),
('Sanmite SC','Mites, whitefly, thrips','Contact miticide — coverage is everything, get leaf undersides.'),
('Sarisa','Thrips, whitefly, aphids, caterpillars','Same group as Mainspring/Pradia component — count them together when rotating.'),
('Segway O','Pythium, Phytophthora','Root-pathogen specialist. Drench and water in lightly.'),
('Seido','Powdery mildew','Powdery mildew specialist — preventative to early curative.'),
('Shuttle 0','Mites (all stages)','Contact — thorough coverage of leaf undersides is essential. Long residual.'),
('Stargus','Botrytis, downy and powdery mildew, root rots','Biological (Bacillus) — preventative. Safe close to shipping, no residue.'),
('Subdue Maxx','Pythium, Phytophthora, downy mildew','⚠ RESISTANCE: flagged in your log as "do not use for a few years" — confirm before scheduling.'),
('Sultan miticide','Mites','Miticide-only. Rotate with Shuttle/Sanmite to spread selection pressure.'),
('Talus 70DF','Whitefly, scale, mealybug','IGR — targets immatures. Slow but excellent on whitefly nymphs.'),
('Terraclor 400','Rhizoctonia, Sclerotinia, southern blight','Soil-directed. Not for foliar disease.'),
('TetraSan 5 WDG','Mite eggs and immatures','Ovicide/larvicide — no adult kill. Use early, before adults are visible.'),
('Topflor','Height control (PGR)','Flurprimidol — very active, low rates. Spray or drench; err LOW on first use.'),
('Triathlon BA','Powdery mildew, Botrytis, leaf spots, root rots','Biological (Bacillus) — 30x concentrated vs Cease per your notes. Preventative, safe near ship.'),
('Truban','Pythium, Phytophthora','Drench for root rots. NOTE: check box W-55 for important info (per your log).'),
('Velifer','Whitefly, thrips, aphids, mites','Live Beauveria — needs humidity, can be used as a cutting dip. No fungicide tank-mix.'),
('Venerate XC','Thrips, mites, soft-bodied insects','Biological, contact — thorough coverage. Safe close to shipping.'),
('Xxpire','Thrips, aphids, whitefly, mealybug, mites (suppression)','Two modes. Broad rescue material — rotate away after to protect both groups.')
) as v(name, t, n)
where c.name = v.name;
