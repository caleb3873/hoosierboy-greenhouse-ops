create table if not exists fundraiser_sales (
  id uuid primary key default gen_random_uuid(),
  year int not null default 2026,
  category text not null,
  description text not null,
  units int,
  unique (year, category, description)
);
alter table fundraiser_sales enable row level security;
drop policy if exists fundraiser_sales_read on fundraiser_sales;
create policy fundraiser_sales_read on fundraiser_sales for select using (true);
drop policy if exists fundraiser_sales_write on fundraiser_sales;
create policy fundraiser_sales_write on fundraiser_sales for insert with check (true);
notify pgrst, 'reload schema';
drop policy if exists fundraiser_sales_update on fundraiser_sales;
create policy fundraiser_sales_update on fundraiser_sales for update using (true);
