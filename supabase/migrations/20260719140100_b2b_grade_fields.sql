-- B2B inventory M9: grade/count/floor fields + grade pricing + merchandising fields.
-- GRADE = stock condition (inventory dimension, moves via events).
-- TIER  = merchandising position on the profile ($5.99/6.99/7.99 — what tier posture filters on).
alter table production_items add column if not exists days_between_counts int;      -- null = not on count program
alter table production_items add column if not exists availability_floor int;       -- per-item low-floor override
alter table production_items add column if not exists default_grade text references grades(code) default 'standard';

alter table product_profiles add column if not exists category text;                -- from category_map (editable)
alter table product_profiles add column if not exists size_category text;           -- from size_category_map (editable)
alter table product_profiles add column if not exists tier text check (tier in ('value','standard','premium'));

-- A graded batch can sell at a grade price without touching the profile's list price.
create table if not exists product_grade_prices (
  id uuid primary key default gen_random_uuid(),
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  grade text not null references grades(code),
  unit_price numeric not null,
  unique (product_profile_id, grade)
);
alter table product_grade_prices enable row level security;
drop policy if exists product_grade_prices_all on product_grade_prices;
create policy product_grade_prices_all on product_grade_prices for all to anon, authenticated using (true) with check (true);
