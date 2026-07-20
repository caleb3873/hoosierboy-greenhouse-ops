-- Grower Work Hub: product library, structured task payloads,
-- spray_records absorption (task-linked compliance ledger), Purdue sample submissions.

-- 1. Chemical / fertilizer product library (pick-list so growers never hand-type EPA numbers)
create table if not exists chem_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type text not null default 'spray', -- 'spray' | 'drench' | 'fertigation'
  epa_reg_number text,
  active_ingredient text,
  default_rate text,
  rei_hours numeric,
  signal_word text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table chem_products enable row level security;
drop policy if exists chem_products_all on chem_products;
create policy chem_products_all on chem_products for all using (true) with check (true);

-- 2. Structured payload for grower-initiated work tasks
--    source_kind gains: 'application' | 'fertigation' | 'handwork'
alter table manager_tasks add column if not exists work_payload jsonb;

-- 3. spray_records becomes the unified compliance ledger, auto-filled on task completion
alter table spray_records add column if not exists category text not null default 'application'; -- 'application' | 'fertigation'
alter table spray_records add column if not exists task_id uuid;
alter table spray_records add column if not exists crop text;
alter table spray_records add column if not exists houses text;
alter table spray_records add column if not exists product_id uuid references chem_products(id);
create index if not exists spray_records_task_idx on spray_records (task_id);
create index if not exists spray_records_rei_idx on spray_records (rei_expires_at);

-- 4. Purdue PPDL sample submission history
create table if not exists sample_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by text,
  plant_host text,
  cultivar_variety text,
  field_id text,
  date_planted text,
  plant_age text,
  pct_affected text,
  date_noticed text,
  distribution text, -- 'Scattered' | 'General' | free text
  chemicals_applied text,
  problem_description text,
  tentative_diagnosis text,
  advanced_testing boolean not null default false,
  status text not null default 'draft', -- 'draft' | 'printed' | 'sent' | 'results'
  results_notes text,
  form_data jsonb
);
alter table sample_submissions enable row level security;
drop policy if exists sample_submissions_all on sample_submissions;
create policy sample_submissions_all on sample_submissions for all using (true) with check (true);
