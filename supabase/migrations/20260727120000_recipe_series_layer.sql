-- ── Recipe upgrade from the 2026-07-27 design lock (see docs/superpowers/specs) ──
-- Hierarchy: family (crop_recipes) → SERIES (this table) → variety (crop_recipe_overrides).
-- Series differ materially: Lantana Bandana/Bandito/HBR ship CALLUSED via EHR while the
-- Ball lines are URC-only — different form, rooting clock, broker pin.

create table if not exists crop_recipe_series (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references crop_recipes(id) on delete cascade,
  series_name text not null,               -- 'Shamrock', 'Bandana', '(unassigned)' fallback
  form text,                               -- URC | CALL | PLUG | SEED | BULB | LINER
  rooting_weeks numeric,                   -- series default; rows/varieties may ✎-override
  prop_tray_id uuid references containers(id),
  pinned_broker text,                      -- one material, one broker (season pins live separately)
  pinned_supplier text,
  notes text,
  seeded_from jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (recipe_id, series_name)
);
alter table crop_recipe_series enable row level security;
drop policy if exists crop_recipe_series_all on crop_recipe_series;
create policy crop_recipe_series_all on crop_recipe_series for all using (true) with check (true);

-- family-level fields the design week added:
--   pots_per_unit: unit math (4.5" flat-of-10 = 10 · fiber planter = 1) — plants/unit = pots_per_unit × ppp
--   overage_pct: order cushion, plan stays exact (order = ceil(need × (100+ov)/100))
--   hold_tolerance_wks: how long stock can sit in the tray past ideal (consolidation referee; seasonal)
alter table crop_recipes add column if not exists pots_per_unit numeric;
alter table crop_recipes add column if not exists overage_pct numeric;
alter table crop_recipes add column if not exists hold_tolerance_wks numeric;
