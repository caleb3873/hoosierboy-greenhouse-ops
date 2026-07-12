-- Native trade-show capture in THIS app's DB (gganxbvtbqheyxvedjko).
-- Logged-in floor-code / admin users create shows + add booth photos with vendor /
-- variety / interest / notes. No PIN, no cross-project sharing — self-contained.
-- Photos live in the existing public `tradeshow-photos` storage bucket.
create table if not exists trade_show_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date,
  ends_on date,
  is_active boolean default true,
  created_by text,
  created_at timestamptz default now()
);
create table if not exists trade_show_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references trade_show_events(id) on delete cascade,
  uploader_name text,
  vendor_name text,
  variety_name text,
  notes text,
  interest_level text,       -- must_have | interested | maybe | pass
  storage_path text,
  image_url text,
  created_at timestamptz default now()
);
alter table trade_show_events enable row level security;
alter table trade_show_photos enable row level security;
drop policy if exists tse_all on trade_show_events;
drop policy if exists tsp_all on trade_show_photos;
create policy tse_all on trade_show_events for all to anon, authenticated using (true) with check (true);
create policy tsp_all on trade_show_photos for all to anon, authenticated using (true) with check (true);
create index if not exists idx_tsp_event on trade_show_photos(event_id);
