-- Customer engagement on shared galleries: opens (view tracking) + per-item favorites.
create table if not exists gallery_visits (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  visitor text,
  name text,
  created_at timestamptz default now()
);
create index if not exists gallery_visits_gid on gallery_visits (gallery_id);

create table if not exists gallery_favorites (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null,
  item_id text not null,
  visitor text not null,
  name text,
  created_at timestamptz default now(),
  unique (gallery_id, item_id, visitor)
);
create index if not exists gallery_favorites_gid on gallery_favorites (gallery_id);

alter table gallery_visits enable row level security;
alter table gallery_favorites enable row level security;
drop policy if exists gv_all on gallery_visits;
create policy gv_all on gallery_visits for all to anon, authenticated using (true) with check (true);
drop policy if exists gf_all on gallery_favorites;
create policy gf_all on gallery_favorites for all to anon, authenticated using (true) with check (true);
