-- Name style per Caleb: no inch mark before BLOOM, and pinched sizes say POT.
--   8" BLOOM FREEDOM RED  ->  8 BLOOM FREEDOM RED
--   6.5" PRESTIGIOUS RED  ->  6.5" POT PRESTIGIOUS RED

update scheduled_crops sc set item_name =
  regexp_replace(
    regexp_replace(sc.item_name, '^(\d+(?:\.\d+)?)" BLOOM ', '\1 BLOOM '),
    '^(\d+(?:\.\d+)?)" (?!POT|BLOOM)', '\1" POT '),
  updated_at = now()
from production_plans p
where p.id = sc.plan_id and p.name = 'Winter 2026' and sc.item_name is not null;

select reconcile_production_items((select id from production_plans where name = 'Winter 2026'));
