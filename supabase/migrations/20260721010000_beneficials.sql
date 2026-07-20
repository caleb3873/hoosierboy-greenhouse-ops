-- Biocontrol: the beneficial-insect program runs alongside the spray program
-- (~$32.7k/yr per Reese's 2025 cost sheet) and the two interact directly — a
-- pyrethroid or abamectin spray wipes out what was released that week. Tracking
-- releases without tracking that conflict would be worse than not tracking at all.

create table if not exists beneficial_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- common name used on the order
  species text,                       -- scientific name
  targets text,                       -- what it controls
  pack_size text,                     -- '250K 5L bag'
  unit_cost numeric,                  -- $ per pack
  supplier text default 'BioBest / Brehob',
  release_notes text,                 -- how/where/when to release
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table beneficial_products enable row level security;
drop policy if exists beneficial_products_all on beneficial_products;
create policy beneficial_products_all on beneficial_products for all using (true) with check (true);

-- Release ledger — the biocontrol equivalent of spray_records
create table if not exists beneficial_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references beneficial_products(id),
  product_name text not null,
  quantity numeric,                   -- packs released
  location text,
  houses text,
  crop text,
  target_pest text,
  released_at timestamptz not null default now(),
  released_by text,
  task_id uuid,
  est_cost numeric,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists beneficial_releases_date_idx on beneficial_releases (released_at);
alter table beneficial_releases enable row level security;
drop policy if exists beneficial_releases_all on beneficial_releases;
create policy beneficial_releases_all on beneficial_releases for all using (true) with check (true);

-- Weekly beneficial plan sits in the same program table as sprays
alter table spray_program add column if not exists kind text not null default 'chemical'; -- 'chemical' | 'beneficial'

-- How each chemical treats beneficials: safe | caution | harmful
alter table chem_products add column if not exists beneficial_safety text;
alter table chem_products add column if not exists beneficial_notes text;

insert into beneficial_products (name, species, targets, pack_size, unit_cost, release_notes)
select * from (values
  ('Stratiolaelaps (Hypoaspis)','Stratiolaelaps scimitus','Fungus gnat larvae, thrips pupae in the media','250K 5L bag',157.13,'Soil-dwelling predatory mite. Broadcast on media — the backbone of the fungus gnat program. Compatible with most drenches.'),
  ('Stratiolaelaps 50K','Stratiolaelaps scimitus','Fungus gnat larvae, thrips pupae','50K 1L bottle',43.81,null),
  ('Stratiolaelaps 25K','Stratiolaelaps scimitus','Fungus gnat larvae, thrips pupae','25K 1L bottle',22.45,null),
  ('Amblyseius cucumeris','Neoseiulus cucumeris','Thrips larvae','100K 1L bottle',25.61,'Broadcast or sachets. Slow build — start before thrips are visible.'),
  ('Amblyseius cucumeris 250K','Neoseiulus cucumeris','Thrips larvae','250K 5L bag',48.49,null),
  ('Amblyseius cucumeris 50K','Neoseiulus cucumeris','Thrips larvae','50K 1L bottle',19.24,null),
  ('Amblyseius swirskii','Amblyseius swirskii','Thrips, whitefly, broad mite','125K 5L bag',163.09,'Warmer-season workhorse — needs temps above ~68F. Stronger than cucumeris on whitefly.'),
  ('Amblyseius swirskii 50K','Amblyseius swirskii','Thrips, whitefly, broad mite','50K',68.84,null),
  ('Amblyseius swirskii 25K','Amblyseius swirskii','Thrips, whitefly, broad mite','25K',40.40,null),
  ('Phytoseiulus persimilis','Phytoseiulus persimilis','Two-spotted spider mite','25K 1L',48.75,'Specialist — eats ONLY two-spotted mite, then starves. Release onto known hot spots.'),
  ('Phytoseiulus persimilis 20K','Phytoseiulus persimilis','Two-spotted spider mite','20K 500ml',89.08,null),
  ('Amblyseius californicus','Neoseiulus californicus','Spider mites (generalist)','25K with sawdust',50.96,'Survives low prey density better than persimilis — use as the maintenance mite predator.'),
  ('Chrysoperla carnea (lacewing)','Chrysoperla carnea','Aphids, soft-bodied insects','50K eggs 50ml bottle',90.74,'Egg cards or bulk eggs. Larvae are the predators — generalist aphid control.'),
  ('Cryptolaemus montrouzieri','Cryptolaemus montrouzieri','Mealybug','500 adult beetles',102.38,'Mealybug destroyer. Release directly on infested plants.'),
  ('Dalotia (Atheta) coriaria','Dalotia coriaria','Fungus gnat larvae, thrips pupae, shore fly','3000 breeding system',116.28,'Rove beetle. Breeding boxes establish a resident population — 0.5 per sq ft per Reese''s notes.'),
  ('Orius insidiosus','Orius insidiosus','Thrips (adults and larvae)','1000',76.09,'Minute pirate bug — the only predator that takes adult thrips. Needs pollen or flowers present.'),
  ('Nemasys (S. feltiae)','Steinernema feltiae','Fungus gnat larvae, thrips pupae','box',282.08,'LIVE nematodes — drench. Use fresh, remove fine screens, low pressure, never chlorinated water.')
) as v(name, species, targets, pack_size, unit_cost, release_notes)
where not exists (select 1 from beneficial_products);

-- Chemical compatibility with the biocontrol program. This drives the warning
-- the head grower sees when a spray week collides with a release week.
update chem_products c set beneficial_safety = v.s, beneficial_notes = v.n
from (values
  -- harmful: broad-spectrum, long residual, or directly toxic to predators
  ('Mavrik','harmful','Pyrethroid — toxic to ALL predatory mites and insects with long residual. Known to flare mites afterward. Do not use during an active release program.'),
  ('Pylon','harmful','Toxic to predatory mites. Leave several weeks before re-releasing.'),
  ('Conserve','harmful','Spinosad — toxic to Orius and predatory mites, especially wet. Avoid during release weeks.'),
  ('Safari 20 SG Insecticide','harmful','Systemic neonicotinoid — persists in the plant and harms predators feeding on treated tissue.'),
  ('Minx 2','harmful','Abamectin — toxic to predatory mites while wet and for some days after.'),
  ('Xxpire','harmful','Contains sulfoxaflor + spinetoram — hard on predators.'),
  ('Hachi-Hachi','harmful','Broad-spectrum — harmful to predatory mites and Orius.'),
  ('Sanmite SC','harmful','Harmful to predatory mites.'),
  ('Kontos','caution','Systemic — moderate risk to predators feeding on treated tissue.'),
  ('Sultan miticide','caution','Miticide — check timing against predatory mite releases.'),
  ('Shuttle 0','caution','Generally softer than most miticides but time it away from persimilis releases.'),
  ('Talus 70DF','caution','IGR — affects immature stages of some beneficials.'),
  ('Pedestal IGR','caution','IGR — affects immature beneficials; adults less so.'),
  ('Distance Insect Growth Regulator','caution','IGR — some effect on beneficial immatures.'),
  ('Azatin O','caution','Azadirachtin is an IGR — moderate effect on beneficial immatures. Widely used alongside biologicals but time it thoughtfully.'),
  ('Molt-X','caution','Azadirachtin — see Azatin O.'),
  ('Phyton 27','caution','Copper — harmful to entomopathogenic fungi (Beauveria/Isaria). Do not tank-mix.'),
  -- fungicides vs the fungus-based biologicals
  ('Mural','caution','Fungicide — do NOT tank-mix with Beauveria/Isaria products; separate applications by several days.'),
  ('Pageant','caution','Fungicide — do NOT tank-mix with fungal biologicals.'),
  ('Medallion WDG','caution','Fungicide — do NOT tank-mix with fungal biologicals.'),
  ('3336 F','caution','Fungicide — do NOT tank-mix with fungal biologicals.'),
  -- safe: selective chemistry, the backbone of an IPM-compatible program
  ('Endeavor','safe','Very selective — soft on predatory mites, Orius and lacewing. A cornerstone of an IPM-compatible aphid program.'),
  ('Aria','safe','Flonicamid — selective feeding blocker, soft on beneficials.'),
  ('Mainspring GNL','safe','Very soft on beneficials, especially as a drench. Foliar has more contact risk.'),
  ('Rycar','safe','Soft on predatory mites and most beneficials.'),
  ('Altus','safe','Generally soft on predatory mites; bee caution still applies.'),
  ('Pradia','safe','Reasonably soft on predators — check timing against Orius releases.'),
  ('Sarisa','safe','Selective — soft on predatory mites.'),
  ('TetraSan 5 WDG','safe','Ovicide/larvicide with good predatory-mite compatibility.'),
  ('Hexygon IQ','safe','Compatible with predatory mites — a standard IPM partner.'),
  ('Hexygon DF','safe','Compatible with predatory mites.'),
  ('Regalia','safe','Plant defense inducer — no direct effect on beneficials. Do not fog.'),
  ('Triathlon BA','safe','Biological — compatible with the release program.'),
  ('Cease','safe','Biological — compatible with the release program.'),
  ('Stargus','safe','Biological — compatible with the release program.'),
  ('Venerate XC','safe','Contact biological — compatible once dry, but avoid spraying directly on release points the same day.'),
  ('BotaniGard 22WP','caution','Beauveria infects some beneficials too — avoid direct application onto sachets or release points, and never tank-mix with fungicides.'),
  ('Botanigard ES','caution','See BotaniGard 22WP.'),
  ('Velifer','caution','Beauveria — see BotaniGard.'),
  ('NOFLY WP','caution','Isaria — avoid direct contact with release points; no fungicide tank-mix.'),
  ('Ancora','caution','Isaria — see NOFLY.'),
  ('LALGUARDM52','safe','Metarhizium targets soil stages — generally compatible with Stratiolaelaps and Dalotia.')
) as v(name, s, n)
where c.name = v.name;
