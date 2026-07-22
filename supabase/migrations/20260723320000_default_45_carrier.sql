-- Caleb: ALL 4.5" pots ship in the same 10-pack carry tray. Any 4.5" finished
-- pot added to the library later inherits it automatically — unless the row
-- arrives with its own carrier info, which always wins.
create or replace function default_45_carrier() returns trigger
language plpgsql as $$
begin
  if new.diameter_in between 4.4 and 4.6
     and coalesce(new.kind, 'finished') = 'finished'
     and coalesce(new.has_carrier, false) is false
     and new.carrier_cost is null then
    new.has_carrier := true;
    new.carrier_name := '10 Pack Off-set Vented flat filler tray';
    new.carrier_cost := 0.85;
    new.pots_per_carrier := 10;
    new.case_size := coalesce(new.case_size, 10);
  end if;
  return new;
end $$;

drop trigger if exists trg_default_45_carrier on containers;
create trigger trg_default_45_carrier
  before insert on containers
  for each row execute function default_45_carrier();
