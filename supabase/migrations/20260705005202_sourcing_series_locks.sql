-- Locked series/variety per crop so genetics don't drift season to season. A lock names a genus and
-- either a SERIES (e.g. Bidens → "Blazing") or a specific VARIETY we've committed to (regardless of
-- the breeder's recommendation), plus the supplier we buy it through (broker inherited from
-- sourcing_selections). Multiple locks per genus are allowed (e.g. two series for one crop).
create table if not exists sourcing_series_locks (
  id         bigint generated always as identity primary key,
  season     text not null,
  genus      text not null,           -- lowercase match-key genus (bidens, petunia, ...)
  series     text,                    -- locked series name (nullable if locking a specific variety)
  variety    text,                    -- locked specific variety (nullable if locking a series)
  supplier   text,                    -- supplier we standardize on for this crop
  grown_before boolean default false, -- we've run this before (track record, not just breeder rec)
  note       text,
  created_at timestamptz default now()
);
alter table sourcing_series_locks enable row level security;
drop policy if exists "allow all sourcing_series_locks" on sourcing_series_locks;
create policy "allow all sourcing_series_locks" on sourcing_series_locks for all to public using (true) with check (true);
create index if not exists idx_ssl_genus on sourcing_series_locks(season, genus);
