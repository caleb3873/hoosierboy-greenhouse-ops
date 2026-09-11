-- Season "picks" page (Caleb 9/11/2026 evening): one link per reviewer per season. Deciders (Mario, Caleb,
-- Paul) set pot counts in 100-pot steps; voters (Tyler, Trish, Alex, Evie) only say like / dislike.
-- Existing review_sheets become the crops of a season; review_responses get a reviewer column.
create table if not exists pick_seasons (
  id uuid primary key default gen_random_uuid(),
  title text not null,                 -- "Spring 2027 picks"
  season text,                         -- "Spring 2027"
  step int not null default 100,       -- pots per tap (ten 4.5" flats)
  story text,
  status text not null default 'open' check (status in ('open','closed')),
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists pick_reviewers (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references pick_seasons(id) on delete cascade,
  name text not null,
  role text not null check (role in ('decider','voter')),
  token uuid not null unique default gen_random_uuid(),   -- the public link: /?picks=<token>
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count int default 0,
  submitted_at timestamptz,
  note text,
  created_at timestamptz default now()
);
alter table review_sheets add column if not exists season_id uuid references pick_seasons(id) on delete set null;
alter table review_sheets add column if not exists crop text;
alter table review_sheets add column if not exists sort int default 0;
alter table review_responses add column if not exists reviewer text not null default '';
alter table review_responses add column if not exists reaction text check (reaction in ('like','dislike'));
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='review_responses'::regclass and contype='u' loop
    execute 'alter table review_responses drop constraint '||quote_ident(c.conname);
  end loop;
end $$;
alter table review_responses add constraint review_responses_sheet_item_reviewer_key unique (sheet_id, item_id, reviewer);
create index if not exists review_sheets_season_idx on review_sheets(season_id, sort);
alter table pick_seasons enable row level security;
alter table pick_reviewers enable row level security;
do $$ begin
  create policy "pick_seasons_all"   on pick_seasons   for all using (true) with check (true);
  create policy "pick_reviewers_all" on pick_reviewers for all using (true) with check (true);
exception when duplicate_object then null; end $$;
