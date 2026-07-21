-- Saved category definitions — the groupings Caleb actually thinks in.
--
-- crop_name in variety_library covers the obvious level (Bacopa, Sunpatiens,
-- Begonia) and is 100% populated. What it can't express is series: variety_library
-- HAS a series column but it is empty across the plan, so "Reiger Begonias" and
-- "Calliope Geraniums" only exist inside item names. Rather than backfill series
-- for 970 varieties, a category is a small saved rule:
--
--   name          "Calliope Geraniums"
--   crop_name     Geranium          (optional)
--   name_match    calliope          (optional, matched against item_name)
--   size_match    4.5"              (optional; null = across all sizes)
--
-- Leaving size_match null is the point of the Calliope example — see every size
-- side by side and find which one actually earns.

create table if not exists item_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  crop_name text,
  name_match text,
  size_match text,
  notes text,
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);
alter table item_categories enable row level security;
drop policy if exists item_categories_all on item_categories;
create policy item_categories_all on item_categories for all using (true) with check (true);

-- Seed the ones Caleb named, plus a few obvious series that carry real volume.
insert into item_categories (name, crop_name, name_match, size_match, sort_order, created_by)
select * from (values
  ('Calliope Geraniums (all sizes)', 'Geranium',   'calliope',  null,   10, 'seed'),
  ('Reiger Begonias 4.5"',           'Begonia',    'reiger',    '4.5"', 20, 'seed'),
  ('Reiger Begonias (all sizes)',    'Begonia',    'reiger',    null,   21, 'seed'),
  ('Sunpatiens 4.5"',                'Sunpatiens', null,        '4.5"', 30, 'seed'),
  ('Sunpatiens (all sizes)',         'Sunpatiens', null,        null,   31, 'seed'),
  ('Bacopa (all sizes)',             'Bacopa',     null,        null,   40, 'seed'),
  ('Vinca Titan',                    'Vinca',      'titan',     null,   50, 'seed'),
  ('Zinnia Profusion',               'Zinnia',     'profusion', null,   60, 'seed'),
  ('Wandering Jew / Tradescantia',   'Tradescantia', null,      null,   70, 'seed')
) as v(name, crop_name, name_match, size_match, sort_order, created_by)
where not exists (select 1 from item_categories);
