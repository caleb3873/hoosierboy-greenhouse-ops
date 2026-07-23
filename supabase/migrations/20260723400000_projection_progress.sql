-- Projection-progress scorecard support.
-- The finish line = every dollar of 2026 revenue has a call, no drop unexplained,
-- nothing sold is silently missing, space 92-100% full. These columns let the
-- gap counters legitimately reach zero (you can't force a target on something you
-- have decided NOT to chase) and give the goal gauge + fill tile a home.

-- item-scoped acknowledgements: "I saw this sell-out / lost sale and made my call"
alter table plan_targets add column if not exists lost_ack boolean not null default false;
comment on column plan_targets.lost_ack is 'sold-out-early item consciously addressed (grown back or accepted) — clears the lost-sales counter';

-- sold-in-2026-but-not-in-plan items have NO plan_targets row, so their
-- dismissals live here, keyed by the gap key (mapped item name or raw sku).
create table if not exists plan_gap_decisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references production_plans(id) on delete cascade,
  gap_key text not null,
  status text not null default 'dismissed',   -- 'dismissed' (drop on purpose) | 'readd' (queued to add)
  note text,
  decided_by text,
  decided_at timestamptz not null default now(),
  unique (plan_id, gap_key)
);
alter table plan_gap_decisions enable row level security;
drop policy if exists plan_gap_decisions_all on plan_gap_decisions;
create policy plan_gap_decisions_all on plan_gap_decisions for all using (true) with check (true);

-- plan-level growth goal for the revenue-vs-goal gauge (phase 3)
alter table production_plans add column if not exists growth_goal_pct numeric;
comment on column production_plans.growth_goal_pct is 'revenue growth target vs prior year, %, for the projection gauge. NULL = no goal set.';

-- which benches are the spring footprint (phase 3, authoritative fill).
-- NULL/false today → fill computes over "occupied footprint" instead.
alter table benches add column if not exists spring_footprint boolean;
comment on column benches.spring_footprint is 'tagged as part of the spring annual footprint. When any bench is tagged, fill % uses the tagged set as denominator; else it uses benches currently holding spring crops.';
