-- Fundraiser 2027 catalog planner (Caleb 8/19): new slash-sheet program mapped
-- against 2026 spring sales so production quantities land right. One row per
-- 2027 catalog item; `replaces` holds the attached last-year sales_totals rows
-- (description/size/units/avg_price snapshots) so the page can show old vs new.
create table if not exists fundraiser_items (
  id uuid primary key default gen_random_uuid(),
  year int not null default 2027,
  name text not null,
  category text,
  sun text,
  photo_url text,
  qty int,
  price numeric,
  replaces jsonb not null default '[]'::jsonb,
  notes text,
  sort int,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (year, name)
);
alter table fundraiser_items enable row level security;
drop policy if exists fundraiser_items_read on fundraiser_items;
create policy fundraiser_items_read on fundraiser_items for select using (true);
drop policy if exists fundraiser_items_insert on fundraiser_items;
create policy fundraiser_items_insert on fundraiser_items for insert with check (true);
drop policy if exists fundraiser_items_update on fundraiser_items;
create policy fundraiser_items_update on fundraiser_items for update using (true);
drop policy if exists fundraiser_items_delete on fundraiser_items;
create policy fundraiser_items_delete on fundraiser_items for delete using (true);
notify pgrst, 'reload schema';
