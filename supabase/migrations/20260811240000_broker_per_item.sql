-- One broker per item (Caleb): any row missing sourcing inherits it from a
-- sibling row of the same item (locked sourcing preferred). New rounds can
-- never drift to a different supplier again.
update scheduled_crops r set
  broker = s.broker,
  supplier = coalesce(r.supplier, s.supplier),
  liner_unit_cost = coalesce(r.liner_unit_cost, s.liner_unit_cost)
from (
  select distinct on (plan_id, item_name) plan_id, item_name, broker, supplier, liner_unit_cost
  from scheduled_crops
  where broker is not null
  order by plan_id, item_name, sourcing_locked desc nulls last, updated_at desc
) s
where r.plan_id = s.plan_id and r.item_name = s.item_name and r.broker is null;
