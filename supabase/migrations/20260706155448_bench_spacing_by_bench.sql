-- Per-bench spacing + tube setup captured on the bench-by-bench walk. One row per (plan, bench):
-- how the pots sit (pattern like "2x1", pots across the width, center-to-center inches or touching)
-- and where/how many irrigation tubes run. Growers read this to move tubes + fill at the right spacing.
create table if not exists bench_spacing (
  id          bigint generated always as identity primary key,
  plan_id     uuid not null,
  bench_id    uuid not null,
  pattern     text,               -- how the crew says it, e.g. "2x1"
  across      integer,            -- pots across the bench width
  spacing_in  numeric,            -- center-to-center inches (ignored if touching)
  touching    boolean default false,
  tubes       integer default 1,  -- how many tubes run on this bench
  tube_pos_in numeric,            -- inches from the left edge to the (first) tube; null = evenly spaced
  note        text,
  updated_at  timestamptz default now(),
  unique (plan_id, bench_id)
);
alter table bench_spacing enable row level security;
drop policy if exists "allow all bench_spacing" on bench_spacing;
create policy "allow all bench_spacing" on bench_spacing for all to public using (true) with check (true);
create index if not exists idx_bench_spacing_plan on bench_spacing(plan_id);
