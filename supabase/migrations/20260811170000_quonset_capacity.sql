-- Quonset capacities (Caleb 8/11) — units are 4.5" TRAYS (flats of 10; verified
-- against 2026 per-bench medians). Walls = positions 01/04 (4' + shelf ABOVE —
-- shelf capacity rides with the bench, kept for fast-drying plants). Middles =
-- 02/03 (8', no shelf). Odd vs even houses deviate; house 22 is short. Tight =
-- trays touching; spaced = gaps. HARD RULE until exact counts.
insert into bench_capacity_rules (zone_prefix, bench_type, container_class, capacity) values
  ('EQODD','mid8','tray45_tight',460),('EQODD','mid8','tray45_spaced',410),
  ('EQODD','wall4','tray45_tight',356),('EQODD','wall4','tray45_spaced',310),('EQODD','wall4','shelf45',95),
  ('EQEVEN','mid8','tray45_tight',420),('EQEVEN','mid8','tray45_spaced',380),
  ('EQEVEN','wall4','tray45_tight',340),('EQEVEN','wall4','tray45_spaced',282),('EQEVEN','wall4','shelf45',90),
  ('EQ22','mid8','tray45_tight',334),('EQ22','mid8','tray45_spaced',330),
  ('EQ22','wall4','tray45_tight',267),('EQ22','wall4','tray45_spaced',190),('EQ22','wall4','shelf45',64)
on conflict (zone_prefix, bench_type, container_class) do update set capacity = excluded.capacity;

-- classify standard quonset benches: 01/04 walls, 02/03 middles
update benches set bench_type='wall4' where code ~ '^EQ\d\d(01|04)$';
update benches set bench_type='mid8'  where code ~ '^EQ\d\d(02|03)$';

-- houses 06/07 have no physical benches but are planned as if they do —
-- create the missing standard positions
insert into benches (code, bench_type, zone_type, zone_label, notes)
select c, case when c ~ '(01|04)$' then 'wall4' else 'mid8' end, 'quonset',
  'Bluff Quonset ' || substring(c from 3 for 2),
  'virtual — house has no physical benches, planned per standard quonset rules'
from (values ('EQ0603'),('EQ0604'),('EQ0704')) v(c)
where not exists (select 1 from benches b where b.code = v.c);
