-- Planted inventory — Evie's post-planting physical counts, the REAL source of truth
-- for what actually went on benches each season (Caleb 8/26: "so ordering next year
-- will be very easy"). One row per bench/line count; empty-bench capacity notes keep
-- their row with count null. Seasons follow the sale-season model: fall | winter.
create table if not exists planted_inventory (
  id uuid primary key default gen_random_uuid(),
  season text not null,               -- 'fall' | 'winter'
  year int not null,
  crop text,                          -- Mum, Poinsettia, Kale, Aster, Cabbage, ...
  size_label text,                    -- 9" Pot, 6.5" Pot, 8 Bloom, HB 10", ...
  variety text,
  color text,
  count int,                          -- null on empty-bench note rows
  location text,                      -- SE Pad, Sprague Main, House 9, ...
  bench_code text,                    -- SE0101, ASME12, EQ0903, ...
  on_sbi boolean,                     -- 'Updated on SBI' flag from the count sheets
  note text,                          -- retag notes, planting group (G1/G2), capacity notes
  source text,                        -- Drive file the count came from
  counted_at date,
  created_at timestamptz default now()
);
create index if not exists planted_inventory_season_idx on planted_inventory (season, year);
alter table planted_inventory enable row level security;
drop policy if exists planted_inventory_read on planted_inventory;
create policy planted_inventory_read on planted_inventory for select using (true);
drop policy if exists planted_inventory_write on planted_inventory;
create policy planted_inventory_write on planted_inventory for insert with check (true);
drop policy if exists planted_inventory_update on planted_inventory;
create policy planted_inventory_update on planted_inventory for update using (true);
notify pgrst, 'reload schema';
