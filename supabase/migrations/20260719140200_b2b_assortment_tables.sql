-- B2B dynamic ordering M10: customer-type templates, popular-item pools, editable maps.
-- Templates are DATA (Caleb + Mario fill via worksheet), never hardcoded.
create table if not exists customer_type_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tier_posture text not null default 'mixed' check (tier_posture in ('value','mixed','premium')),
  category_mix jsonb not null default '{}',   -- {"color_annuals": 40, "perennials": 25, ...} percentages
  size_balance jsonb not null default '{}',   -- {"4.5\"": 3, "quart": 2, "gallon": 1} target ratios
  notes text,
  active boolean default true,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Curated ranked pools of proven movers, per category, refreshed seasonally (scoped by plan).
create table if not exists popular_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id),
  category text not null,
  product_profile_id uuid not null references product_profiles(id) on delete cascade,
  rank int not null,
  active boolean default true,
  curated_by text,
  created_at timestamptz default now(),
  unique (plan_id, category, product_profile_id)
);

-- Editable seeding maps (same worksheet spirit as templates): genus → category, container → size category.
create table if not exists category_map (
  crop_name text primary key,
  category text not null
);
create table if not exists size_category_map (
  container_id uuid primary key references containers(id),
  size_category text not null
);

do $$ declare t text;
begin
  foreach t in array array['customer_type_templates','popular_items','category_map','size_category_map'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
