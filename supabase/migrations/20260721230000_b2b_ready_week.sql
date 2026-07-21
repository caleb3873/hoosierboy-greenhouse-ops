-- B2B ready dates key off the plan's ready_week instead of the supplier ship week.
--
-- production_item_groups still GROUPS by ship_week — that is the right round
-- identity, since a round is a distinct delivery of material. But the date a
-- round becomes SELLABLE is its ready week, not the week the liners left the
-- vendor. Reading ship_week as a ready date is what put 224 Spring 2027 groups
-- in 2026, and what forced the manual ready_week_override on Winter 2026
-- poinsettias.
--
-- Precedence is now: ready_week_override → ready_week (from the plan) → ship_week.
-- The override still wins, so nothing already set by hand changes; the ship_week
-- fallback keeps any plan without ready weeks working exactly as before.

alter table production_item_groups add column if not exists ready_week int;
alter table production_item_groups add column if not exists ready_year int;
comment on column production_item_groups.ready_week is
  'Week this round is sellable, carried from scheduled_crops.ready_week. Overridden by ready_week_override.';

-- backfill every existing group from its plan rows
update production_item_groups g set ready_week = s.rw, ready_year = s.ry
from (
  select sc.production_item_id, sc.ship_week, sc.ship_year,
         min(sc.ready_week) as rw, min(sc.ready_year) as ry
  from scheduled_crops sc
  where not sc.is_combo_component and sc.production_item_id is not null and sc.ready_week is not null
  group by 1,2,3
) s
where s.production_item_id = g.production_item_id
  and s.ship_week = g.ship_week
  and coalesce(s.ship_year,-1) = coalesce(g.ship_year,-1);

-- availability view: prefer ready_week over ship_week
create or replace view v_item_availability as
 WITH st AS (
         SELECT COALESCE(( SELECT b2b_settings.value::numeric AS value
                   FROM b2b_settings
                  WHERE b2b_settings.key = 'low_floor_abs'::text), 10::numeric) AS low_abs,
            COALESCE(( SELECT b2b_settings.value::numeric AS value
                   FROM b2b_settings
                  WHERE b2b_settings.key = 'low_floor_pct'::text), 0.15) AS low_pct
        ), grp AS (
         SELECT g.production_item_id,
            to_date(COALESCE(g.ready_year_override, g.ready_year, g.ship_year)::text || lpad(COALESCE(g.ready_week_override, g.ready_week, g.ship_week)::text, 2, '0'::text), 'IYYYIW'::text) AS ready_date,
            sum(sc.qty_pots)::integer AS qty
           FROM production_item_groups g
             JOIN scheduled_crops sc ON sc.production_item_id = g.production_item_id AND NOT sc.is_combo_component AND sc.ship_week = g.ship_week AND COALESCE(sc.ship_year, '-1'::integer) = COALESCE(g.ship_year, '-1'::integer)
          GROUP BY g.production_item_id, (to_date(COALESCE(g.ready_year_override, g.ready_year, g.ship_year)::text || lpad(COALESCE(g.ready_week_override, g.ready_week, g.ship_week)::text, 2, '0'::text), 'IYYYIW'::text))
        ), per_item AS (
         SELECT grp.production_item_id,
            sum(grp.qty) AS planned,
            COALESCE(sum(grp.qty) FILTER (WHERE grp.ready_date <= CURRENT_DATE), 0::bigint) AS released,
            min(grp.ready_date) FILTER (WHERE grp.ready_date > CURRENT_DATE) AS next_ready_date
           FROM grp
          GROUP BY grp.production_item_id
        ), ev AS (
         SELECT inventory_events.production_item_id,
            sum(inventory_events.qty_delta)::integer AS event_delta
           FROM inventory_events
          GROUP BY inventory_events.production_item_id
        ), comm AS (
         SELECT l.production_item_id,
            sum(l.qty)::integer AS committed
           FROM customer_order_lines l
             JOIN customer_orders o ON o.id = l.order_id
          WHERE o.type = 'customer'::text AND (o.status = ANY (ARRAY['placed'::text, 'confirmed'::text, 'picking'::text]))
          GROUP BY l.production_item_id
        ), shp AS (
         SELECT l.production_item_id,
            sum(COALESCE(l.qty_pulled, l.qty))::integer AS shipped
           FROM customer_order_lines l
             JOIN customer_orders o ON o.id = l.order_id
          WHERE o.status = ANY (ARRAY['shipped'::text, 'invoiced'::text, 'closed'::text])
          GROUP BY l.production_item_id
        ), rsv AS (
         SELECT v_customer_reservations.production_item_id,
            sum(v_customer_reservations.remaining_qty)::integer AS reserved
           FROM v_customer_reservations
          WHERE v_customer_reservations.state = ANY (ARRAY['active'::text, 'at_risk'::text, 'pending'::text])
          GROUP BY v_customer_reservations.production_item_id
        ), base AS (
         SELECT pi.id AS production_item_id,
            pp.id AS product_profile_id,
            pi.plan_id,
            pi.sku,
            pi.kind,
            pi.availability_floor,
            pp.status AS profile_status,
            pl.status AS plan_status,
            COALESCE(i.planned, 0::bigint) AS planned,
            COALESCE(i.released, 0::bigint) AS released,
            COALESCE(e.event_delta, 0) AS event_delta,
            COALESCE(c.committed, 0) AS committed,
            COALESCE(s2.shipped, 0) AS shipped,
            COALESCE(rv.reserved, 0) AS reserved,
            i.next_ready_date
           FROM production_items pi
             JOIN production_plans pl ON pl.id = pi.plan_id
             LEFT JOIN product_profiles pp ON pp.production_item_id = pi.id
             LEFT JOIN per_item i ON i.production_item_id = pi.id
             LEFT JOIN ev e ON e.production_item_id = pi.id
             LEFT JOIN comm c ON c.production_item_id = pi.id
             LEFT JOIN shp s2 ON s2.production_item_id = pi.id
             LEFT JOIN rsv rv ON rv.production_item_id = pi.id
        )
 SELECT b.production_item_id,
    b.product_profile_id,
    b.plan_id,
    b.sku,
    b.kind,
    b.availability_floor,
    b.profile_status,
    b.plan_status,
    b.planned,
    b.released,
    b.event_delta,
    b.committed,
    b.shipped,
    b.reserved,
    b.next_ready_date,
    b.released + b.event_delta - b.committed - b.shipped - b.reserved AS sellable_now,
        CASE
            WHEN b.product_profile_id IS NULL OR b.profile_status <> 'published'::text THEN 'hidden'::text
            WHEN b.plan_status = 'archived'::text THEN 'ended'::text
            WHEN b.released = 0 AND b.next_ready_date IS NOT NULL THEN 'coming_soon'::text
            WHEN (b.released + b.event_delta - b.committed - b.shipped - b.reserved) <= 0 AND b.next_ready_date IS NOT NULL THEN 'more_coming'::text
            WHEN (b.released + b.event_delta - b.committed - b.shipped - b.reserved) <= 0 THEN 'sold_out'::text
            WHEN (b.released + b.event_delta - b.committed - b.shipped - b.reserved)::numeric <= GREATEST(COALESCE(b.availability_floor::numeric, st.low_abs), st.low_pct * b.planned::numeric) THEN 'low'::text
            ELSE 'available'::text
        END AS availability_status
   FROM base b
     CROSS JOIN st;;

-- Keep it fresh: the reconcile cron refreshes ready weeks on every tick, so a
-- plant-week change in the production session flows through to the catalog
-- within 15 minutes like every other plan edit.
create or replace function refresh_group_ready_weeks(p_plan uuid)
returns int language plpgsql as $$
declare v_n int;
begin
  with upd as (
    update production_item_groups g set ready_week = s.rw, ready_year = s.ry
    from (
      select sc.production_item_id, sc.ship_week, sc.ship_year,
             min(sc.ready_week) as rw, min(sc.ready_year) as ry
      from scheduled_crops sc
      where sc.plan_id = p_plan and not sc.is_combo_component
        and sc.production_item_id is not null and sc.ready_week is not null
      group by 1,2,3
    ) s
    where s.production_item_id = g.production_item_id
      and s.ship_week = g.ship_week
      and coalesce(s.ship_year,-1) = coalesce(g.ship_year,-1)
      and (g.ready_week is distinct from s.rw or g.ready_year is distinct from s.ry)
    returning 1
  ) select count(*) into v_n from upd;
  return v_n;
end $$;
