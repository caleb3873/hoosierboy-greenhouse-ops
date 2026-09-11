-- Plan review sheets (Caleb 9/11/2026): the propose → feedback → decide loop with sales.
-- Caleb proposes a program (items with photos + proposed quantities), Mario opens a public
-- link (/?rv=<sheet id>, no login), marks each item More / Right / Less / Don't (or "Add"
-- for items not yet in the plan), leaves a note, gives an overall read, and submits. Caleb
-- reads the responses and pulls the trigger. Same shape as the pre-order sheets.
create table if not exists review_sheets (
  id uuid primary key default gen_random_uuid(),   -- the share token in the public link
  title text not null,
  subtitle text,
  story text,                      -- what is being proposed and why, in Caleb's words
  hero_url text,
  reviewer_name text,              -- who the sheet is for (Mario)
  from_name text,                  -- who is proposing (Caleb)
  plan_id uuid,                    -- optional: production plan this belongs to
  context jsonb default '{}'::jsonb,   -- totals shown on the page: {pots, trays, cost, weeks}
  status text not null default 'open' check (status in ('draft','open','closed')),
  sent_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count int default 0,
  submitted_at timestamptz,
  submitted_name text,
  overall_verdict text,            -- too_many | about_right | room_for_more
  overall_note text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references review_sheets(id) on delete cascade,
  sort int default 0,
  section text default 'proposed',     -- proposed | available (not in the plan yet)
  name text not null,
  description text,
  image_url text,
  swatch text,                         -- fallback colour when there is no photo
  proposed_qty int default 0,          -- pots proposed (0 = not in the plan)
  unit text default 'pots',
  unit_cost numeric(10,4),
  size_label text,
  meta jsonb default '{}'::jsonb,      -- supplier, tray, week, sales history …
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists review_responses (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references review_sheets(id) on delete cascade,
  item_id uuid not null references review_items(id) on delete cascade,
  verdict text check (verdict in ('more','right','less','drop','add','skip')),
  suggested_qty int,
  comment text,
  updated_at timestamptz default now(),
  unique (sheet_id, item_id)
);
create index if not exists review_items_sheet_idx on review_items(sheet_id, sort);
create index if not exists review_responses_sheet_idx on review_responses(sheet_id);

alter table review_sheets    enable row level security;
alter table review_items     enable row level security;
alter table review_responses enable row level security;
-- Public links: the sheet id is the token. Anyone with it can read and answer, like pre-orders.
do $$ begin
  create policy "review_sheets_all"    on review_sheets    for all using (true) with check (true);
  create policy "review_items_all"     on review_items     for all using (true) with check (true);
  create policy "review_responses_all" on review_responses for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- 9/11 later: quantity mode — the reviewer types their own pot count per item instead of More/Less.
alter table review_sheets add column if not exists mode text not null default 'verdict' check (mode in ('verdict','quantity'));
