-- Supplier/breeder ordering restrictions, uniform defaults + series→breeder map.
-- Default across the board: order in increments of 100 (10 cases of 10), minimum
-- 2000 per breeder. series_pattern (ilike, matched against the item/variety name)
-- assigns each variety to its breeder so the 2000 min pools correctly.
create table if not exists breeder_rules (
  id uuid primary key default gen_random_uuid(),
  series_pattern text not null,        -- ilike substring, e.g. 'calliope'
  breeder text not null,               -- Syngenta, Ball, …
  min_order integer not null default 2000,
  order_increment integer not null default 100,
  created_at timestamptz not null default now()
);
alter table breeder_rules enable row level security;
drop policy if exists breeder_rules_all on breeder_rules;
create policy breeder_rules_all on breeder_rules for all using (true) with check (true);

insert into breeder_rules (series_pattern, breeder) values
  ('calliope', 'Syngenta'),
  ('fantasia', 'Ball'),
  ('solera',   'Ball')
on conflict do nothing;
