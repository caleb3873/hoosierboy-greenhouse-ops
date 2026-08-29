-- Fantasy draft board (Caleb 8/29: live board link for the whole league + two
-- private custom-rankings links). Public route ?draft=<board>, realtime picks.
create table if not exists draft_players (
  id uuid primary key default gen_random_uuid(),
  list_name text not null,          -- 'master' | personal lists (tokened)
  rk int not null,
  tier int,
  player text not null,
  team text,
  pos text,
  pos_rank text,
  bye int
);
create index if not exists draft_players_list_idx on draft_players (list_name, rk);
create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  round int not null,
  slot int not null,
  player text not null,
  team text,
  pos text,
  created_at timestamptz default now(),
  unique (board, round, slot)
);
create table if not exists draft_slots (
  id uuid primary key default gen_random_uuid(),
  board text not null,
  slot int not null,
  member text not null,
  unique (board, slot)
);
alter table draft_players enable row level security;
alter table draft_picks enable row level security;
alter table draft_slots enable row level security;
drop policy if exists draft_players_all on draft_players;
create policy draft_players_all on draft_players for all using (true) with check (true);
drop policy if exists draft_picks_all on draft_picks;
create policy draft_picks_all on draft_picks for all using (true) with check (true);
drop policy if exists draft_slots_all on draft_slots;
create policy draft_slots_all on draft_slots for all using (true) with check (true);
alter publication supabase_realtime add table draft_picks;
notify pgrst, 'reload schema';
