-- Sullivan mum-fest truck builder (Caleb 8/13): each store manager gets a public
-- link to build their own trucks — delivery order + color mix per truck.
-- Truck = 896 9" mums; partial trucks carry their own capacity (Cicero 104, Penn 416).
create table if not exists mum_trucks (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  seq int not null,
  capacity int not null,
  colors jsonb not null default '{}'::jsonb,
  note text,
  submitted_by text,
  locked boolean default false,
  updated_at timestamptz default now(),
  unique (store, seq)
);
alter table mum_trucks enable row level security;
drop policy if exists mum_trucks_read on mum_trucks;
create policy mum_trucks_read on mum_trucks for select using (true);
drop policy if exists mum_trucks_insert on mum_trucks;
create policy mum_trucks_insert on mum_trucks for insert with check (true);
drop policy if exists mum_trucks_update on mum_trucks;
create policy mum_trucks_update on mum_trucks for update using (true);
notify pgrst, 'reload schema';
