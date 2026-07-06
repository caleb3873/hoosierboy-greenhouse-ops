-- Bench-prep spacing + tube profiles per plan (season). A profile = crop type + pot size, with a
-- bench size, how many irrigation tubes run per bench (crews double/triple up rather than pull tubes),
-- an input mode (centers | count | density), and staged spacing (start tight, space out later) in
-- the stages jsonb: [{label, w_in, l_in, staggered, count, density, week, note}].
alter table spacing_profiles add column if not exists plan_id        uuid;
alter table spacing_profiles add column if not exists input_mode     text default 'centers'; -- centers | count | density
alter table spacing_profiles add column if not exists tubes_per_bench int default 1;
alter table spacing_profiles add column if not exists bench_w_in     numeric;
alter table spacing_profiles add column if not exists bench_l_in     numeric;
alter table spacing_profiles add column if not exists updated_at     timestamptz default now();
alter table spacing_profiles enable row level security;
drop policy if exists "allow all spacing_profiles" on spacing_profiles;
create policy "allow all spacing_profiles" on spacing_profiles for all to public using (true) with check (true);
create index if not exists idx_spacing_profiles_plan on spacing_profiles(plan_id);
