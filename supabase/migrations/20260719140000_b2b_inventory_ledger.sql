-- B2B inventory M8: the inventory event ledger.
-- Every quantity change is an event at a physical location with actor + timestamp.
-- Nothing is a silent desk edit. One ledger, four kinds; per-kind analysis via views.

create table if not exists grades (
  code text primary key,
  label text not null,
  sort int default 0,
  is_default boolean default false
);
insert into grades (code, label, sort, is_default) values
  ('value',    'Value',    1, false),
  ('standard', 'Standard', 2, true),
  ('premium',  'Premium',  3, false)
on conflict (code) do nothing;

create table if not exists loss_reasons (
  code text primary key,
  label text not null,
  sort int default 0,
  active boolean default true
);
insert into loss_reasons (code, label, sort) values
  ('death','Death',1),('disease','Disease',2),('damage','Damage',3),
  ('cull','Cull / quality',4),('shrink','Unexplained shrink',5),('other','Other',9)
on conflict (code) do nothing;

create table if not exists inventory_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('receiving','count','loss','grade_change')),
  production_item_id uuid not null references production_items(id) on delete cascade,
  bench_id uuid references benches(id),          -- WHERE (one crop lives on many benches; nullable v1)
  grade text references grades(code),            -- which grade a loss/count applies to (null = item default)
  from_grade text references grades(code),
  to_grade text references grades(code),
  -- count
  counted_qty int,
  count_mode text check (count_mode in ('blind','technical')),
  expected_qty int,                              -- blind: computed server-side at insert, never client-supplied
  variance int,
  -- loss
  qty int,
  reason_code text references loss_reasons(code),
  -- receiving
  ordered_qty int,
  received_qty int,
  initial_survival numeric,                      -- 0..1
  receiving_line_id uuid references receiving_lines(id),
  -- effect on derived availability, computed by trigger:
  --   loss: −qty · count: variance · grade_change: 0 · receiving: round(received×survival) − ordered
  qty_delta int not null default 0,
  actor text,
  note text,
  created_at timestamptz default now(),
  check (kind <> 'loss' or (qty is not null and qty > 0 and reason_code is not null)),
  check (kind <> 'grade_change' or (qty is not null and qty > 0 and from_grade is not null and to_grade is not null)),
  check (kind <> 'count' or (counted_qty is not null and count_mode is not null)),
  check (kind <> 'receiving' or received_qty is not null)
);
create index if not exists ie_item on inventory_events (production_item_id, created_at);
create index if not exists ie_kind on inventory_events (kind);

-- Physical on-hand (no order netting other than physically-gone stock): what a counter should find.
-- released plan qty + all event deltas − pulled-in-picking − shipped actuals.
create or replace view v_item_physical as
with grp as (
  select g.production_item_id,
         to_date(coalesce(g.ready_year_override, g.ship_year)::text || lpad(coalesce(g.ready_week_override, g.ship_week)::text, 2, '0'), 'IYYYIW') as ready_date,
         sum(sc.qty_pots)::int as qty
  from production_item_groups g
  join scheduled_crops sc on sc.production_item_id = g.production_item_id
    and not sc.is_combo_component and sc.ship_week = g.ship_week
    and coalesce(sc.ship_year, -1) = coalesce(g.ship_year, -1)
  group by g.production_item_id, 2
),
rel as (select production_item_id, coalesce(sum(qty) filter (where ready_date <= current_date), 0) as released from grp group by 1),
ev  as (select production_item_id, sum(qty_delta)::int as event_delta from inventory_events group by 1),
gone as (
  select l.production_item_id,
         sum(case when o.status = 'picking' then coalesce(l.qty_pulled, 0)
                  when o.status in ('shipped','invoiced','closed') then coalesce(l.qty_pulled, l.qty)
                  else 0 end)::int as physically_gone
  from customer_order_lines l join customer_orders o on o.id = l.order_id
  group by 1
)
select pi.id as production_item_id,
       coalesce(r.released, 0) + coalesce(e.event_delta, 0) - coalesce(g2.physically_gone, 0) as on_hand
from production_items pi
left join rel r on r.production_item_id = pi.id
left join ev e on e.production_item_id = pi.id
left join gone g2 on g2.production_item_id = pi.id;

-- Trigger: compute qty_delta (and, for blind counts, the expected qty the counter never saw).
create or replace function inventory_events_before_insert() returns trigger language plpgsql as $$
begin
  if new.kind = 'loss' then
    new.qty_delta := -new.qty;
  elsif new.kind = 'grade_change' then
    new.qty_delta := 0;
  elsif new.kind = 'receiving' then
    new.qty_delta := round(new.received_qty * coalesce(new.initial_survival, 1))::int - coalesce(new.ordered_qty, new.received_qty);
  elsif new.kind = 'count' then
    if new.expected_qty is null then
      select on_hand into new.expected_qty from v_item_physical where production_item_id = new.production_item_id;
      new.expected_qty := coalesce(new.expected_qty, 0);
    end if;
    new.variance := new.counted_qty - new.expected_qty;
    new.qty_delta := new.variance;
  end if;
  return new;
end $$;
drop trigger if exists trg_inventory_events_delta on inventory_events;
create trigger trg_inventory_events_delta before insert on inventory_events
  for each row execute function inventory_events_before_insert();

do $$ declare t text;
begin
  foreach t in array array['grades','loss_reasons','inventory_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format('create policy %I_all on %I for all to anon, authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
