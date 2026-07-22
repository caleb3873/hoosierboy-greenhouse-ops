-- Item history: every sourcing/component change on a plan item, kept forever
-- and shown in the item drill's History tab. Order-confirmation imports will
-- write here too (source='order_confirmation'), keyed the same way — plan_id +
-- item_name + variety_key — so acks sync onto the same timeline.
create table if not exists item_change_log (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid,
  item_name text not null,
  variety_key text,
  change_type text not null,   -- sourcing_change | component_qty | component_added | component_removed | order_confirmation | note
  detail jsonb,                -- { before, after, rows, ... } — shape per change_type
  changed_by text,
  source text not null default 'drill',
  changed_at timestamptz not null default now()
);
create index if not exists item_change_log_item_idx on item_change_log (plan_id, item_name, changed_at desc);
alter table item_change_log enable row level security;
drop policy if exists item_change_log_all on item_change_log;
create policy item_change_log_all on item_change_log for all using (true) with check (true);
