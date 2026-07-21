-- Combo proposals — capture a basket idea while you're looking at the numbers.
--
-- Caleb: "every year this is where a lot of the work is, the combos… we can have
-- it go to that location to change the basket, or just propose a new basket idea
-- that we can run with later."
--
-- So this is deliberately NOT a second combo builder. The existing designer stays
-- the place you actually lay a basket out. This table only holds the idea — what
-- to change or add, with the material already costed from the sourcing database —
-- so the thought doesn't evaporate between the planning session and the build.
--
-- A proposal is often VAGUE when it's made. Caleb: "say we are getting rid of a
-- combo and we want to replace it with something else… new combo lets use
-- different colors, or new combo lets try with a different series." That is a
-- direction, not a recipe. So `direction` captures the intent in one click and
-- `replaces_recipe` snapshots what the basket contains TODAY, so whoever builds
-- it later starts from the thing being replaced instead of a blank page.
--
-- components jsonb: [{
--   crop, variety, ppp, broker, supplier, form, landed, item_min, variety_id, note
-- }]  — landed/item_min come straight from broker_prices so a proposal carries a
-- real cost, not a guess.

create table if not exists combo_proposals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references production_plans(id) on delete cascade,
  kind text not null default 'new',        -- new | change | replace | drop
  direction text,                          -- different_colors | different_series | different_crop |
                                           -- cheaper | premium | keep_recipe | free_text
  name text not null,
  size text,                               -- HB 10" / FIBER LG. / POT 8" …
  based_on_item text,                      -- existing basket this rethinks, if any
  target_baskets int,
  components jsonb not null default '[]',   -- the proposed material (may be empty while still an idea)
  replaces_recipe jsonb,                    -- snapshot of what it replaces, so nobody starts blank
  est_cost_per_basket numeric,
  target_price numeric,
  notes text,
  status text not null default 'idea',     -- idea | approved | rejected | built
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists combo_proposals_plan_idx on combo_proposals (plan_id, status);
alter table combo_proposals enable row level security;
drop policy if exists combo_proposals_all on combo_proposals;
create policy combo_proposals_all on combo_proposals for all using (true) with check (true);

-- Searching 39,308 broker_prices rows by crop/variety needs to be instant.
create index if not exists broker_prices_crop_idx on broker_prices (lower(crop));
create index if not exists broker_prices_variety_idx on broker_prices (lower(variety));
