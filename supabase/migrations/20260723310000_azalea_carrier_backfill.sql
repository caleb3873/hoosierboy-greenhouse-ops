-- The plain 4.5 Azalea Pot ships in the same 10-pack carry tray as the New Logo
-- print — carrier fields were only filled on the newer row. Backfill so case
-- costing works for either 4.5" pot.
update containers set
  has_carrier = true,
  carrier_name = '10 Pack Off-set Vented flat filler tray',
  carrier_cost = 0.85,
  pots_per_carrier = 10
where name = '4.5 Azalea Pot' and (has_carrier is distinct from true);
