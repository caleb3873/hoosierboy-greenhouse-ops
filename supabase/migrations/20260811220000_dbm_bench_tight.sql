-- Bluff Main per-bench 4.5" tight capacities, read from the 2027 SPRING master
-- list (one group per bench; flats column summed per bench). Spacing benches
-- (W06/W07/E06/E07) and E09 keep chart numbers; DBME05 = 288 across two
-- concurrent turns. Overrides merge into existing cap_overrides.
update benches set cap_overrides = coalesce(cap_overrides,'{}')::jsonb || jsonb_build_object('tray45_tight', v.cap)
from (values
  ('DBMW01',300),('DBMW02',430),('DBMW03',440),('DBMW04',330),('DBMW05',470),
  ('DBMW08',350),('DBMW09',350),('DBMW10',480),('DBMW11',300),('DBMW12',230),
  ('DBME01',320),('DBME02',410),('DBME03',450),('DBME04',420),('DBME05',288),
  ('DBME08',450),('DBME10',380),('DBME11',350),('DBME12',240)
) v(code, cap)
where benches.code = v.code;
