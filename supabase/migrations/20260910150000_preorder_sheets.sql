-- Customer pre-order sheets (Caleb 9/10/2026): a per-customer public page for one product
-- program (first: Antoinette pansies) where the customer enters quantities before we commit
-- the crop; the sender sees opens + quantities on the mobile side. Generic: any program.
create table if not exists preorder_programs (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  subtitle text,
  story text,                      -- customer-facing copy (Hoosier Boy voice)
  hero_url text,
  deadline date,                   -- pre-orders close
  availability text,               -- "Ready late February 2027"
  terms text,                      -- short footer terms
  status text not null default 'draft' check (status in ('draft','open','closed')),
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists preorder_program_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references preorder_programs(id) on delete cascade,
  sort int default 0,
  name text not null,
  description text,
  size_label text,                 -- 6" pot · 1 plant
  pack text,                       -- sells by / case config
  wholesale_price numeric(10,2),
  retail_price numeric(10,2),
  image_url text,
  min_qty int default 0,
  qty_step int default 1,
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists preorder_sheets (
  id uuid primary key default gen_random_uuid(),   -- the share token used in the public link
  program_id uuid not null references preorder_programs(id) on delete cascade,
  customer_id uuid references shipping_customers(id) on delete set null,
  customer_name text not null,     -- snapshot: what the page greets
  contact_name text,
  contact_email text,
  contact_phone text,
  rep_name text,                   -- who sent it (Mario)
  message text,                    -- personal note on the page
  sent_at timestamptz,
  sent_via text,                   -- copy | share | email | text
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count int default 0,
  submitted_at timestamptz,        -- last "send my pre-order"
  submitted_name text,
  submitted_note text,
  active boolean default true,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists preorder_entries (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references preorder_sheets(id) on delete cascade,
  item_id uuid not null references preorder_program_items(id) on delete cascade,
  qty int not null default 0,
  updated_at timestamptz default now(),
  unique (sheet_id, item_id)
);
create table if not exists preorder_visits (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references preorder_sheets(id) on delete cascade,
  visitor text,
  user_agent text,
  created_at timestamptz default now()
);
create index if not exists preorder_sheets_program_idx on preorder_sheets(program_id);
create index if not exists preorder_entries_sheet_idx on preorder_entries(sheet_id);
create index if not exists preorder_visits_sheet_idx on preorder_visits(sheet_id);
-- Public pages read/write these with the anon key (same model as shared_galleries).
alter table preorder_programs enable row level security;
alter table preorder_program_items enable row level security;
alter table preorder_sheets enable row level security;
alter table preorder_entries enable row level security;
alter table preorder_visits enable row level security;
drop policy if exists preorder_programs_all on preorder_programs;
create policy preorder_programs_all on preorder_programs for all to anon, authenticated using (true) with check (true);
drop policy if exists preorder_program_items_all on preorder_program_items;
create policy preorder_program_items_all on preorder_program_items for all to anon, authenticated using (true) with check (true);
drop policy if exists preorder_sheets_all on preorder_sheets;
create policy preorder_sheets_all on preorder_sheets for all to anon, authenticated using (true) with check (true);
drop policy if exists preorder_entries_all on preorder_entries;
create policy preorder_entries_all on preorder_entries for all to anon, authenticated using (true) with check (true);
drop policy if exists preorder_visits_all on preorder_visits;
create policy preorder_visits_all on preorder_visits for all to anon, authenticated using (true) with check (true);
-- Photo storage for program/item images (public read, like tradeshow-photos)
insert into storage.buckets (id, name, public) values ('preorder-photos','preorder-photos', true) on conflict (id) do nothing;
drop policy if exists "preorder photos public read" on storage.objects;
create policy "preorder photos public read" on storage.objects for select using (bucket_id = 'preorder-photos');
drop policy if exists "preorder photos insert" on storage.objects;
create policy "preorder photos insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'preorder-photos');
drop policy if exists "preorder photos delete" on storage.objects;
create policy "preorder photos delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'preorder-photos');
