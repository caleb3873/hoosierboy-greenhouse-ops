-- Perennial tagging lives at the family-recipe grain: every color and group of a
-- family inherits its class, so one tag covers the whole crop×size. NULL = annual
-- (the default world); 'perennial' lights up the 🌲 filter in Sales vs Plan.
alter table crop_recipes add column if not exists plant_class text
  check (plant_class is null or plant_class in ('annual', 'perennial'));
