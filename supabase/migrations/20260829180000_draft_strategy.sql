-- Custom draft strategy layer (Caleb 8/29): metrics per player + configurable
-- scoring weights. The engine (scripts/draft_score.js) blends metrics into a
-- 0-100 custom score and REWRITES a personal list's order — the UI never
-- changes, the link's rankings just become the strategy. Refresh path: update
-- draft_metrics columns (ADP, usage, injuries) and re-run the engine.
create table if not exists draft_metrics (
  id uuid primary key default gen_random_uuid(),
  player text not null unique,      -- joins draft_players.player by exact name
  usage_score int,                  -- 0-100: targets/game, share, routes, touches, snap %
  env_score int,                    -- 0-100: team scoring, QB, OL, scheme, red-zone trips
  hvt_score int,                    -- 0-100: red-zone/end-zone/goal-line, RB receiving
  talent_score int,                 -- 0-100: YPRR, YAC, MTF, efficiency
  adp numeric,                      -- market cost (national); refreshable
  label text,                       -- CORE | VALUE | FLIP | LOTTERY | FADE
  colts boolean default false,      -- 🏠 likely Indianapolis reach — flag, never boost
  early_sched text,                 -- A-F weeks 1-5 grade
  note text                         -- the "why" line shown on the personal link
);
create table if not exists draft_config (
  id text primary key,
  weights jsonb not null            -- {"usage":0.4,"env":0.3,"hvt":0.2,"talent":0.1}
);
insert into draft_config (id, weights) values ('caleb-4qx', '{"usage":0.4,"env":0.3,"hvt":0.2,"talent":0.1}')
  on conflict (id) do nothing;
alter table draft_metrics enable row level security;
alter table draft_config enable row level security;
drop policy if exists draft_metrics_all on draft_metrics;
create policy draft_metrics_all on draft_metrics for all using (true) with check (true);
drop policy if exists draft_config_all on draft_config;
create policy draft_config_all on draft_config for all using (true) with check (true);
notify pgrst, 'reload schema';
