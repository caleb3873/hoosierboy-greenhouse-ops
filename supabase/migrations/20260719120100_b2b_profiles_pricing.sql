-- B2B data core M2: customer-facing product profiles (1:1 with production_items) + the pricing stack.
create table if not exists product_profiles (
  id uuid primary key default gen_random_uuid(),
  production_item_id uuid not null unique references production_items(id) on delete restrict,
  display_name text,
  description text,            -- buyer-voice copy; culture stays in variety_library (override below)
  image_url text,
  images jsonb default '[]',
  culture_override jsonb,      -- customer-facing tone overrides only; variety_library is the culture source
  pack_size text,
  case_config text,
  price numeric,               -- LIST price (source of truth for customer-facing price)
  price_unit text default 'pot',
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
-- NOTE deliberately absent: any availability column. Availability is derived (v_item_availability).

-- Pricing stack — resolution order (most specific wins), resolved at order time and SNAPSHOTTED
-- onto the order line (unit_price + price_source):
--   1. customer_item_prices  (contract price, net — primary vehicle for high-volume customers,
--      seedable from last season's actual prices)
--   2. level_item_prices     (per-level per-item, net)
--   3. product_price_breaks  (per-item qty breaks, absolute $)
--   4. global_price_breaks   (catalog-wide qty breaks, % off level-adjusted list)
--   base = product_profiles.price, optionally minus price_levels.default_pct_off
create table if not exists price_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_pct_off numeric,     -- e.g. 6 = 6% off list for this level (nullable = no blanket discount)
  sort int default 0,
  created_at timestamptz default now()
);
alter table shipping_customers add column if not exists price_level_id uuid references price_levels(id);

create table if not exists product_price_breaks (
  id uuid primary key default gen_random_uuid(),
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  min_qty int not null,
  unit_price numeric not null,
  unique (product_profile_id, min_qty)
);
create table if not exists global_price_breaks (
  id uuid primary key default gen_random_uuid(),
  min_qty int not null unique,
  pct_off numeric not null
);
create table if not exists customer_item_prices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references shipping_customers(id) on delete cascade,
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  unit_price numeric not null,
  source_season text,          -- provenance, e.g. 'Spring 2026 actual'
  note text,
  created_at timestamptz default now(),
  unique (customer_id, product_profile_id)
);
create table if not exists level_item_prices (
  id uuid primary key default gen_random_uuid(),
  price_level_id uuid not null references price_levels(id) on delete cascade,
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  unit_price numeric not null,
  unique (price_level_id, product_profile_id)
);

alter table product_profiles enable row level security;
alter table price_levels enable row level security;
alter table product_price_breaks enable row level security;
alter table global_price_breaks enable row level security;
alter table customer_item_prices enable row level security;
alter table level_item_prices enable row level security;
do $$ declare t text;
begin
  foreach t in array array['product_profiles','price_levels','product_price_breaks','global_price_breaks','customer_item_prices','level_item_prices'] loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
