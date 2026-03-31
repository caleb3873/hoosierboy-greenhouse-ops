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

-- ============================================================
-- COMBO LOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS combo_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season TEXT,
  total_qty INTEGER,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  approval_note TEXT,
  crop_run_id UUID,
  combos JSONB DEFAULT '[]',
  changelog JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE combo_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to combo_lots" ON combo_lots FOR ALL USING (true);

CREATE TRIGGER combo_lots_updated_at
  BEFORE UPDATE ON combo_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- COMBO TAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS combo_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT,
  type TEXT,
  cost_per_unit NUMERIC,
  print_spec TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE combo_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to combo_tags" ON combo_tags FOR ALL USING (true);

-- ============================================================
-- GROWER PROFILES
-- ============================================================
CREATE TABLE grower_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assistant',
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE grower_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to grower_profiles" ON grower_profiles FOR ALL USING (true);

CREATE TRIGGER grower_profiles_updated_at
  BEFORE UPDATE ON grower_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- WATERING PLANS
-- ============================================================
CREATE TABLE watering_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  plan_date DATE NOT NULL,
  created_by_id UUID REFERENCES grower_profiles(id),
  created_by_name TEXT NOT NULL,
  weather_notes TEXT,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watering_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES watering_plans(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  house_id UUID REFERENCES houses(id),
  house_name TEXT NOT NULL,
  zone_label TEXT,
  instructions TEXT NOT NULL,
  fertilizer_type TEXT DEFAULT 'none',
  fertilizer_detail TEXT,
  urgency TEXT DEFAULT 'normal',
  estimated_minutes INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES grower_profiles(id),
  completed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE watering_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE watering_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to watering_plans" ON watering_plans FOR ALL USING (true);
CREATE POLICY "Allow all access to watering_tasks" ON watering_tasks FOR ALL USING (true);

CREATE TRIGGER watering_plans_updated_at
  BEFORE UPDATE ON watering_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SPRAY RECORDS (State Chemist Compliance)
-- ============================================================
CREATE TABLE spray_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grower_id UUID REFERENCES grower_profiles(id),
  grower_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  input_id UUID,
  epa_reg_number TEXT,
  active_ingredient TEXT,
  application_method TEXT NOT NULL,
  rate TEXT,
  total_volume TEXT,
  house_id UUID REFERENCES houses(id),
  house_name TEXT NOT NULL,
  target_pest TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rei_hours INTEGER,
  rei_expires_at TIMESTAMPTZ,
  wind_speed TEXT,
  temperature TEXT,
  ppe_worn TEXT,
  applicator_license TEXT,
  product_cost NUMERIC,
  labor_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spray_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to spray_records" ON spray_records FOR ALL USING (true);

CREATE TRIGGER spray_records_updated_at
  BEFORE UPDATE ON spray_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_spray_records_applied_at ON spray_records (applied_at DESC);
CREATE INDEX idx_spray_records_grower ON spray_records (grower_id);
CREATE INDEX idx_spray_records_house ON spray_records (house_id);

-- ============================================================
-- SEASON TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS season_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  label TEXT NOT NULL,
  target_date DATE NOT NULL,
  target_pct INTEGER NOT NULL DEFAULT 80,
  metric TEXT NOT NULL DEFAULT 'ordered',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE season_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to season_targets" ON season_targets FOR ALL USING (true);

-- ============================================================
-- PLANNING EODS (Broker-driven deadlines)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_eods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  broker TEXT,
  crop TEXT,
  season TEXT,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE planning_eods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to planning_eods" ON planning_eods FOR ALL USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- HOUSEPLANT AVAILABILITY
-- ══════════════════════════════════════════════════════════════════════════════

-- Suppliers within a broker (e.g. "AgriStarts" under Express Seed)
CREATE TABLE hp_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker TEXT NOT NULL,
  name TEXT NOT NULL,
  tab_name TEXT,
  format_config JSONB DEFAULT '{}',
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (broker, name)
);

ALTER TABLE hp_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hp_suppliers" ON hp_suppliers FOR ALL USING (true);

-- Normalized availability rows (replaced on each upload)
CREATE TABLE hp_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES hp_suppliers(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  plant_name TEXT NOT NULL,
  variety TEXT,
  common_name TEXT,
  size TEXT,
  form TEXT,
  product_id TEXT,
  location TEXT,
  availability JSONB DEFAULT '{}',
  availability_text TEXT,
  comments TEXT,
  upload_batch TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hp_avail_search ON hp_availability USING gin (to_tsvector('english', plant_name || ' ' || COALESCE(variety, '') || ' ' || COALESCE(common_name, '')));
CREATE INDEX idx_hp_avail_broker ON hp_availability (broker);
CREATE INDEX idx_hp_avail_supplier ON hp_availability (supplier_id);

ALTER TABLE hp_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hp_availability" ON hp_availability FOR ALL USING (true);

-- Per-supplier plant pricing (uploaded separately)
CREATE TABLE hp_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES hp_suppliers(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  plant_name TEXT NOT NULL,
  variety TEXT,
  unit_price NUMERIC(10,4),
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_hp_pricing_lookup
  ON hp_pricing (supplier_name, plant_name, COALESCE(variety, ''));

ALTER TABLE hp_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hp_pricing" ON hp_pricing FOR ALL USING (true);

-- Shared order items (persisted so multiple users see same order)
CREATE TABLE hp_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  plant_name TEXT NOT NULL,
  variety TEXT,
  size TEXT,
  form TEXT,
  week_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC(10,4),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hp_orders_supplier ON hp_order_items (supplier_name);
CREATE INDEX idx_hp_orders_broker ON hp_order_items (broker);

ALTER TABLE hp_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to hp_order_items" ON hp_order_items FOR ALL USING (true);
