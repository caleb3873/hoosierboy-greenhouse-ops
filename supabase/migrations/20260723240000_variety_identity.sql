-- THE IDENTITY SPINE — fix name-matching once and for all.
--
-- Everything in this system joins plants by fuzzy names at query time: plan
-- rows to broker quotes, varieties to culture guides, sales to items. Every
-- bug this week traced back to that. From here: ONE canonical key (makeKey in
-- src/brokerKey.js), STORED on every row, with an explicit crosswalk humans
-- can correct — and a cron pass that keeps it from rotting.

alter table variety_library add column if not exists variety_key text;
create index if not exists variety_library_key_idx on variety_library (variety_key);
comment on column variety_library.variety_key is
  'Canonical identity key (src/brokerKey.js makeKey). Joins to broker_prices.variety_key and variety_links. Maintained by the cron — do not hand-edit.';

create table if not exists variety_links (
  variety_key text primary key,
  variety_id uuid references variety_library(id) on delete set null,
  culture_id text,                       -- culture_guides_public.id (cross-project)
  culture_label text,                    -- breeder · crop · series, for humans
  status text not null default 'auto',   -- auto | confirmed | rejected
  confidence numeric,
  evidence text,
  updated_at timestamptz not null default now()
);
alter table variety_links enable row level security;
drop policy if exists variety_links_all on variety_links;
create policy variety_links_all on variety_links for all using (true) with check (true);
comment on table variety_links is
  'Crosswalk: canonical key -> our variety + its culture guide. Broker quotes join by key directly. status=confirmed rows are human-blessed and never overwritten by the cron.';
