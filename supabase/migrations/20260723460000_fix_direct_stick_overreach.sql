-- DIRECT STICK was over-inferred onto non-4.5" geraniums (HB combos, fiber/pot) and
-- Tradescantia by the timing-based prop inference. Per Caleb: direct-stick only
-- applies to the 4.5" callused geraniums (Solera/Fantasia stuck straight into the
-- final pot). Everything else is a normal cutting — geraniums are callused, the
-- Wandering-Jewel tradescantias are URC. The 4.5" recorded rows are left as-is.
update scheduled_crops sc set prop_method = 'CALL', prop_method_source = 'corrected'
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id and p.name = 'Spring 2027'
  and sc.prop_method = 'DIRECT STICK' and sc.item_name !~* '^4\.5'
  and v.crop_name ilike 'geranium';

update scheduled_crops sc set prop_method = 'URC', prop_method_source = 'corrected'
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id and p.name = 'Spring 2027'
  and sc.prop_method = 'DIRECT STICK' and sc.item_name !~* '^4\.5'
  and v.crop_name ilike 'tradescantia';
