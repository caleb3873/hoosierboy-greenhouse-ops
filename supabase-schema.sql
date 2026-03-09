-- ═══════════════════════════════════════════════════════════════════════════
-- HOOSIER BOY GREENHOUSE OPS — SUPABASE DATABASE SCHEMA
-- Run this in: supabase.com → your project → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── HOUSES (greenhouse structures) ──────────────────────────────────────────
create table if not exists houses (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  location    text,           -- 'Bluff Road' | 'Sprague Road'
  type        text,           -- 'greenhouse' | 'hoop'
  width_ft    numeric,
  length_ft   numeric,
  zones       jsonb default '[]',   -- bench zones, stored as JSON
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── OUTDOOR PADS ─────────────────────────────────────────────────────────────
create table if not exists pads (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  location    text,
  width_ft    numeric,
  length_ft   numeric,
  sections    jsonb default '[]',
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── CONTAINERS ───────────────────────────────────────────────────────────────
create table if not exists containers (
  id               uuid primary key default uuid_generate_v4(),
  name             text not null,
  kind             text,           -- 'finished' | 'propagation'
  diameter_in      numeric,
  height_in        numeric,
  material         text,
  units_per_case   integer,
  qty_per_pallet   integer,
  cost_per_unit    numeric,
  primary_supplier text,
  sku              text,
  notes            text,
  created_at       timestamptz default now()
);

-- ── SPACING PROFILES ─────────────────────────────────────────────────────────
create table if not exists spacing_profiles (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  tag          text,           -- 'crop' | 'container' | 'general'
  crop_ref     text,
  container_ref text,
  stages       jsonb default '{}',  -- { tight: {x,y}, spaced: {x,y}, finish: {x,y} }
  notes        text,
  created_at   timestamptz default now()
);

-- ── VARIETY LIBRARY ──────────────────────────────────────────────────────────
create table if not exists variety_library (
  id                uuid primary key default uuid_generate_v4(),
  crop_name         text not null,
  variety           text,
  breeder           text,
  type              text,           -- 'annual' | 'perennial' | 'vegetable' | 'herb'
  prop_tray_size    text,
  prop_cell_count   integer,
  prop_weeks        integer,
  finish_weeks      integer,
  finish_temp_day   integer,
  finish_temp_night integer,
  light_requirement text,
  fertilizer_rate   text,
  spacing           text,
  culture_guide_url text,
  notes             text,
  created_at        timestamptz default now()
);

-- ── CROP RUNS ────────────────────────────────────────────────────────────────
create table if not exists crop_runs (
  id                  uuid primary key default uuid_generate_v4(),
  crop_name           text not null,
  group_number        integer,
  status              text default 'planned',
  container_id        uuid references containers(id),
  is_cased            boolean default true,
  pack_size           integer,
  cases               integer,
  spacing_profile_id  uuid references spacing_profiles(id),
  spacing_override    boolean default false,
  target_week         integer,
  target_year         integer,
  weeks_prop          integer,
  weeks_indoor        integer,
  weeks_outdoor       integer,
  moves_outside       boolean default false,
  sensitivity         text default 'tender',
  min_temp_override   numeric,
  -- Sourcing
  material_type       text,         -- 'urc' | 'seed' | 'liner'
  prop_tray_size      text,
  liner_size          text,
  seed_form           text,
  sourcing_broker     text,
  sourcing_supplier   text,
  unit_cost           numeric,
  buffer_pct          numeric default 10,
  -- Assignments (stored as JSON arrays for flexibility)
  indoor_assignments  jsonb default '[]',
  outside_assignments jsonb default '[]',
  -- Varieties
  varieties           jsonb default '[]',
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── FLAGS (operator problem reports) ─────────────────────────────────────────
create table if not exists flags (
  id          uuid primary key default uuid_generate_v4(),
  type        text not null,        -- 'pest' | 'disease' | 'equipment' | 'other'
  crop_run_id uuid references crop_runs(id),
  location    text,
  notes       text,
  resolved    boolean default false,
  resolved_at timestamptz,
  resolved_by text,
  created_at  timestamptz default now()
);

-- ── TASK COMPLETIONS (operator log) ──────────────────────────────────────────
create table if not exists task_completions (
  id          uuid primary key default uuid_generate_v4(),
  crop_run_id uuid references crop_runs(id),
  task_type   text not null,        -- 'seed' | 'transplant' | 'moveout' | 'ready' | 'manual'
  task_label  text,
  completed_at timestamptz default now(),
  completed_by text,
  notes       text
);

-- ── MANUAL TASKS (planner-assigned) ──────────────────────────────────────────
create table if not exists manual_tasks (
  id          uuid primary key default uuid_generate_v4(),
  crop_run_id uuid references crop_runs(id),
  label       text not null,
  due_week    integer,
  due_year    integer,
  assigned_to text,
  completed   boolean default false,
  completed_at timestamptz,
  notes       text,
  created_at  timestamptz default now()
);

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger crop_runs_updated_at before update on crop_runs
  for each row execute function update_updated_at();

create trigger houses_updated_at before update on houses
  for each row execute function update_updated_at();

-- ── ROW LEVEL SECURITY (basic — tighten after adding auth) ───────────────────
-- For now, allow all operations. Lock down per-user after Supabase Auth setup.
alter table houses           enable row level security;
alter table pads             enable row level security;
alter table containers       enable row level security;
alter table spacing_profiles enable row level security;
alter table variety_library  enable row level security;
alter table crop_runs        enable row level security;
alter table flags            enable row level security;
alter table task_completions enable row level security;
alter table manual_tasks     enable row level security;

-- Temporary open policies (replace with user-scoped policies after auth setup)
create policy "allow all" on houses           for all using (true) with check (true);
create policy "allow all" on pads             for all using (true) with check (true);
create policy "allow all" on containers       for all using (true) with check (true);
create policy "allow all" on spacing_profiles for all using (true) with check (true);
create policy "allow all" on variety_library  for all using (true) with check (true);
create policy "allow all" on crop_runs        for all using (true) with check (true);
create policy "allow all" on flags            for all using (true) with check (true);
create policy "allow all" on task_completions for all using (true) with check (true);
create policy "allow all" on manual_tasks     for all using (true) with check (true);
