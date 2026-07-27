-- ── Crop recipes — the propagation/production spine (crop-recipe model) ──────
-- One recipe per crop × size owns HOW we make that crop: prop method, tray (FK,
-- so it reaches the cost engine), rooting time, crop weeks, pinch, container,
-- bench rule, pinned broker. "Add a plant" reads it; you type only variety /
-- size / ready-by / qty. Per-variety tweaks live in crop_recipe_overrides.
-- Chain semantics (Caleb 2026-07-25): ship_week = stick/URC-arrival week (one
-- concept); ordering is a stamped date, not a scheduled week.

create table if not exists crop_recipes (
  id uuid primary key default gen_random_uuid(),
  crop_name text not null,             -- variety_library.crop_name
  size_label text not null,            -- derived from container: diameter + form (4.5" Pot, 10" HB, 9" Pan…)
  -- growing spec
  prop_method text,                    -- URC | CALL | PLUG | SEED | BULB | LINER | DIRECT STICK
  prop_tray_id uuid references containers(id),   -- the FK the cost engine reads (NOT the legacy text col)
  rooting_weeks numeric,               -- stick → transplant; null for plug/seed (no rooting gap here)
  crop_weeks numeric,                  -- plant → ready; drives back-scheduling from a ready date
  pinch boolean,
  weeks_to_pinch numeric,              -- after transplant; task offset
  prop_treatment text,                 -- prop_treatments.name
  default_container_id uuid references containers(id),  -- finished pot; economics read through containers
  bench_rule text,                     -- placement rule label (e.g. '4.5" main range')
  pinned_broker text,                  -- default source; variety pick resolves live price by variety_key
  pinned_supplier text,
  ppp numeric,                         -- plants per pot
  plants_per_unit numeric,             -- sellable-unit conversion (4.5" flat of 10)
  notes text,
  seeded_from jsonb,                   -- provenance {observed:…, guide:…, spring_json:…} from the seed run
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (crop_name, size_label)
);
alter table crop_recipes enable row level security;
drop policy if exists crop_recipes_all on crop_recipes;
create policy crop_recipes_all on crop_recipes for all using (true) with check (true);

-- Per-variety tweaks: only the fields that genuinely differ from the base recipe
-- (~29 of 177 groups per the seed analysis). All spec columns nullable = inherit.
create table if not exists crop_recipe_overrides (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references crop_recipes(id) on delete cascade,
  variety_key text not null,           -- the identity spine — join by key, never by name
  prop_method text,
  prop_tray_id uuid references containers(id),
  rooting_weeks numeric,
  crop_weeks numeric,
  pinch boolean,
  weeks_to_pinch numeric,
  pinned_broker text,
  pinned_supplier text,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (recipe_id, variety_key)
);
alter table crop_recipe_overrides enable row level security;
drop policy if exists crop_recipe_overrides_all on crop_recipe_overrides;
create policy crop_recipe_overrides_all on crop_recipe_overrides for all using (true) with check (true);

-- Link the plan spine to its recipe → auto-flow: edit a recipe, find every row
-- using it, recompute, flag in-flight plans for review.
alter table scheduled_crops add column if not exists recipe_id uuid references crop_recipes(id);
create index if not exists scheduled_crops_recipe_idx on scheduled_crops(recipe_id);
