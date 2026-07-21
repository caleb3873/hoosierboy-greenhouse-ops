-- New programs — planning what has NO history.
--
-- Caleb: "create new programs like the perennial program… a start-a-new-program
-- feature where we can start putting in new items and then add to the same
-- program." Sales vs Plan covers what was grown last year; this covers the new
-- line being invented in the same session. Items here are intentions, not plan
-- rows — production turns them into scheduled_crops when the program is real.

create table if not exists plan_programs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id) on delete cascade,
  name text not null,
  notes text,
  status text not null default 'planning',   -- planning | approved | building | dropped
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, name)
);

create table if not exists program_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references plan_programs(id) on delete cascade,
  item_name text not null,
  size text,
  target_units int,
  target_price numeric,
  ppp int not null default 1,
  material jsonb,          -- picked from the sourcing db: {variety, broker, supplier, form, landed, variety_key}
  est_unit_cost numeric,   -- landed × ppp (material) — container/soil added when it becomes plan rows
  ready_week int,
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists program_items_program_idx on program_items (program_id, sort);

alter table plan_programs enable row level security;
alter table program_items enable row level security;
drop policy if exists plan_programs_all on plan_programs;
create policy plan_programs_all on plan_programs for all using (true) with check (true);
drop policy if exists program_items_all on program_items;
create policy program_items_all on program_items for all using (true) with check (true);
