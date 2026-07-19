-- B2B data core M1: the sellable-item spine.
-- production_items = one row per sellable production run (variety × container per plan; combos via parents).
-- Quantities/dates/locations are NEVER stored here — always derived from linked scheduled_crops rows.
create table if not exists production_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id),
  kind text not null default 'straight' check (kind in ('straight','combo')),
  variety_id uuid references variety_library(id),
  container_id uuid references containers(id),
  sku text unique,             -- durable key (generated S27-nnnn; adopted where sales_sku_map matches)
  legacy_sku text,             -- sales-system sku from sales_sku_map when unambiguously matched
  created_at timestamptz default now(),
  unique (plan_id, variety_id, container_id)
);

-- Groups: same item grown in rounds (today keyed by ship week). ONE sku per item; availability
-- phases in per group. Membership is derived (bench rows join by ship week); only label + the
-- floor-correctable ready week live here.
create table if not exists production_item_groups (
  id uuid primary key default gen_random_uuid(),
  production_item_id uuid not null references production_items(id) on delete cascade,
  ship_week int not null,
  ship_year int,
  label text,
  ready_week_override int,     -- "release" lever: floor-corrected ready week (a production fact)
  ready_year_override int,
  created_at timestamptz default now()
);
create unique index if not exists pig_uniq on production_item_groups (production_item_id, ship_week, coalesce(ship_year, -1));

-- Production FACTS that adjust quantity (shrink, dumps, recounts) — never "set availability to X".
create table if not exists production_item_adjustments (
  id uuid primary key default gen_random_uuid(),
  production_item_id uuid not null references production_items(id) on delete cascade,
  qty_delta int not null,
  reason text not null,
  noted_by text,
  created_at timestamptz default now()
);

alter table scheduled_crops add column if not exists production_item_id uuid references production_items(id);
create index if not exists sc_production_item on scheduled_crops (production_item_id);

alter table production_items enable row level security;
alter table production_item_groups enable row level security;
alter table production_item_adjustments enable row level security;
drop policy if exists pi_all on production_items;
create policy pi_all on production_items for all to anon, authenticated using (true) with check (true);
drop policy if exists pig_all on production_item_groups;
create policy pig_all on production_item_groups for all to anon, authenticated using (true) with check (true);
drop policy if exists pia_all on production_item_adjustments;
create policy pia_all on production_item_adjustments for all to anon, authenticated using (true) with check (true);
