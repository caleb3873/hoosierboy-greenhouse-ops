-- Projection = the map (Caleb 9/1/2026). plan_targets is rewritten from PLACED
-- scheduled_crops rows (placed_at set). The original walkthrough projection is kept
-- twice: full copy in plan_targets_projection_backup_20260901, and per item in
-- plan_targets.projection_units / projection_decision.
create table if not exists plan_targets_projection_backup_20260901 as
  select * from plan_targets where plan_id = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6';

alter table plan_targets add column if not exists projection_units numeric;
alter table plan_targets add column if not exists projection_decision text;

-- 1. remember the original projection on every row (only once)
update plan_targets set projection_units = target_units, projection_decision = decision
 where plan_id = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6' and projection_units is null and projection_decision is null;

-- 2. placed pots per item (combo parents only; pot-factor aware like pushTargetToRows)
with placed as (
  select sc.item_name,
         sum(sc.qty_pots * case when coalesce(sc.ppp,1) >= coalesce(sc.plants_per_unit, sc.pack_size, 1)
                                 and coalesce(sc.plants_per_unit, sc.pack_size, 1) > 1
                                then coalesce(sc.plants_per_unit, sc.pack_size, 1) else 1 end)::int pots,
         min(sc.placed_at) first_placed, max(sc.placed_at) last_placed
    from scheduled_crops sc
   where sc.plan_id = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6'
     and sc.placed_at is not null
     and coalesce(sc.is_combo_component,false) = false
     and not exists (  -- phantom sibling: item has true combo parents and this row isn't one
           select 1 from scheduled_crops p
            where p.plan_id = sc.plan_id and p.item_name = sc.item_name and p.id <> sc.id
              and exists (select 1 from scheduled_crops k where k.combo_parent_id = p.id)
              and not exists (select 1 from scheduled_crops k where k.combo_parent_id = sc.id))
   group by sc.item_name)
insert into plan_targets (plan_id, item_name, target_units, current_units, decision, decided_by, decided_at,
                          applied_at, applied_by, applied_units, note, updated_at)
select 'd2360134-0fbb-4548-af2f-5cc3ccd590c6', p.item_name, p.pots, null, 'grow', 'map', p.first_placed,
       p.last_placed, 'map', p.pots, 'from map 9/1/2026', now()
  from placed p
on conflict (plan_id, item_name) do update set
  target_units  = excluded.target_units,
  decision      = case when plan_targets.current_units is null then 'grow'
                       when excluded.target_units > plan_targets.current_units then 'grow'
                       when excluded.target_units < plan_targets.current_units then 'cut' else 'hold' end,
  decided_by    = 'map', decided_at = excluded.decided_at,
  applied_at    = excluded.applied_at, applied_by = 'map', applied_units = excluded.applied_units,
  rounds        = null,
  note          = case when plan_targets.note is null or plan_targets.note = '' then 'from map 9/1/2026'
                       else plan_targets.note || ' | from map 9/1/2026' end,
  updated_at    = now();

-- 3. everything not placed is undecided again (projection kept in projection_units)
update plan_targets t
   set target_units = null, decision = null, decided_by = null, decided_at = null,
       applied_at = null, applied_by = null, applied_units = null, rounds = null, updated_at = now()
 where t.plan_id = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6'
   and not exists (select 1 from scheduled_crops sc where sc.plan_id = t.plan_id and sc.item_name = t.item_name
                     and sc.placed_at is not null and coalesce(sc.is_combo_component,false) = false);
