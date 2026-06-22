-- Broker price comparison + sourcing decisions
create table if not exists broker_prices (
  id uuid primary key default gen_random_uuid(),
  broker text not null,
  supplier text not null,
  form_class text,
  form_raw text,
  crop text,
  variety text,
  variety_key text,
  match_key text,            -- supplier|form_class|variety_key
  list_price numeric,
  landed numeric,
  royalty numeric,
  freight numeric,
  exclusivity text,
  season text default '2026-2027',
  source_file text,
  created_at timestamptz default now()
);
create index if not exists idx_broker_prices_supplier on broker_prices(supplier);
create index if not exists idx_broker_prices_match on broker_prices(match_key);
create index if not exists idx_broker_prices_broker on broker_prices(broker);
alter table broker_prices enable row level security;
drop policy if exists "allow all broker_prices" on broker_prices;
create policy "allow all broker_prices" on broker_prices for all to public using (true) with check (true);

create table if not exists sourcing_selections (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  form_class text,                       -- null = applies to all forms for the supplier
  selected_broker text,
  notes text,
  decided_by text,
  season text default '2026-2027',
  updated_at timestamptz default now(),
  unique (supplier, form_class, season)
);
alter table sourcing_selections enable row level security;
drop policy if exists "allow all sourcing_selections" on sourcing_selections;
create policy "allow all sourcing_selections" on sourcing_selections for all to public using (true) with check (true);
