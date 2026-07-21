-- plan_targets — where the sales-projection session records its decisions.
--
-- Deliberately SEPARATE from scheduled_crops: the sales session decides WHAT to
-- grow (units, per finished item), the production session decides HOW (how the
-- units split across benches, rounds and ship weeks). Writing straight into
-- scheduled_crops would force the sales conversation to answer bench questions
-- it has no business answering, and would silently reshuffle a plan that is
-- already 100% bench-assigned.
--
-- The production manager later applies a target, which is when scheduled_crops
-- (and through the B2B reconcile cron, production_items) actually move.

create table if not exists plan_targets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id) on delete cascade,
  item_name text not null,
  target_units numeric,                -- agreed 2027 sellable units
  prior_units numeric,                 -- what it sold last season, snapshotted at decision time
  current_units numeric,               -- what the plan held when the decision was made
  decision text,                       -- grow | hold | cut | drop | new
  note text,
  decided_by text,
  decided_at timestamptz default now(),
  applied_at timestamptz,              -- set when production distributes it into scheduled_crops
  applied_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, item_name)
);
create index if not exists plan_targets_plan_idx on plan_targets (plan_id);
alter table plan_targets enable row level security;
drop policy if exists plan_targets_all on plan_targets;
create policy plan_targets_all on plan_targets for all using (true) with check (true);
