-- Reusable propagation-treatment templates (mist regime, hormone, heat, etc.) that
-- the prop-guide grid picks from per crop. Seeded with common ones; add your own.
create table if not exists prop_treatments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table prop_treatments enable row level security;
drop policy if exists prop_treatments_all on prop_treatments;
create policy prop_treatments_all on prop_treatments for all using (true) with check (true);
insert into prop_treatments (name, detail) values
  ('Standard mist', 'Mist to rehydrate; taper off after day 2-3'),
  ('Mist + rooting hormone', 'Dip/spray hormone, standard mist'),
  ('Dry callus', 'Callused cuttings — minimal mist, keep on dry side'),
  ('Bottom heat', 'Bottom heat to soil temp target; mist as needed'),
  ('Fog / high humidity', 'Fog house, low mist volume'),
  ('Direct stick', 'Straight into final pot, no prop tray')
on conflict (name) do nothing;
