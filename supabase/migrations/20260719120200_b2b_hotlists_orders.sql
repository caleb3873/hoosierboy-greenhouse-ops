-- B2B data core M3: orderable hot lists + customer orders (state machine + pick hooks).
-- Distinct from the photo-based shared_galleries hot list (marketing media); these reference
-- orderable product profiles. Broadcast v1; `audience` keeps personalization possible later.
create table if not exists hot_lists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  list_date date,
  state text not null default 'draft' check (state in ('draft','pushed')),
  pushed_at timestamptz,
  audience jsonb,              -- null = broadcast (v1); future personalization hook
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists hot_list_items (
  id uuid primary key default gen_random_uuid(),
  hot_list_id uuid not null references hot_lists(id) on delete cascade,
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  sort int default 0,
  blurb text,
  created_at timestamptz default now(),
  unique (hot_list_id, product_profile_id)
);

-- Orders. type='speculation' = order-shaped record with no customer yet (grow-ahead pipeline);
-- it does NOT reserve availability until converted to a customer order and placed.
-- State machine: draft → placed → confirmed → picking → shipped → invoiced → closed
--                (cancelled allowed from any pre-shipped state). Transitions append to events.
create table if not exists customer_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references shipping_customers(id),
  type text not null default 'customer' check (type in ('customer','speculation')),
  status text not null default 'draft' check (status in ('draft','placed','confirmed','picking','shipped','invoiced','closed','cancelled')),
  hot_list_id uuid references hot_lists(id),   -- provenance: ordered from this list (feeds trends + conversion)
  notes text,
  placed_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists co_customer on customer_orders (customer_id);
create index if not exists co_status on customer_orders (status);

create table if not exists customer_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  production_item_id uuid not null references production_items(id),
  qty int not null,
  unit_price numeric,          -- snapshot at placement (resolve_unit_price result)
  price_source text,           -- which pricing rule fired: customer_contract|level_item|item_break|global_break|level_default|list
  picked_state text not null default 'pending' check (picked_state in ('pending','picked','short')),
  qty_pulled int,              -- ACTUAL pulled — feeds back into derived availability
  picked_at timestamptz,
  picked_by text,
  note text,
  created_at timestamptz default now()
);
create index if not exists col_order on customer_order_lines (order_id);
create index if not exists col_item on customer_order_lines (production_item_id);

create table if not exists customer_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text,
  note text,
  created_at timestamptz default now()
);
create index if not exists coe_order on customer_order_events (order_id);

do $$ declare t text;
begin
  foreach t in array array['hot_lists','hot_list_items','customer_orders','customer_order_lines','customer_order_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
