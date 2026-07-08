-- "What we did last year" treatment/PGR/fertilizer log per crop — the reference that seeds this
-- year's tasks (generic: mums first, poinsettias etc. later). One row per dated treatment.
create table if not exists treatment_records (
  id          bigint generated always as identity primary key,
  crop        text not null,           -- 'Mum'
  year        integer not null,        -- 2025
  rec_date    date,
  crop_detail text,                    -- varieties / sizes / groups
  location    text,
  application text,                    -- Piccolo, Planted, Dropped to 150ppm 17-3-17, ...
  rates       text,                    -- 2ppm, 3ppm, 16oz/100gal, ...
  notes       text,
  source      text default 'import',   -- import | logged
  created_at  timestamptz default now()
);
alter table treatment_records enable row level security;
drop policy if exists "allow all treatment_records" on treatment_records;
create policy "allow all treatment_records" on treatment_records for all to public using (true) with check (true);
create index if not exists idx_treatment_records_crop_year on treatment_records(crop, year, rec_date);
