-- Refinement: 10" HB Tradescantia (Wandering Jewel) IS direct-stick too (stuck
-- straight into the basket). I'd wrongly moved them to URC — put them back.
-- Everything else unrooted/callused roots in a prop tray (stays URC/CALL).
update scheduled_crops sc set prop_method = 'DIRECT STICK', prop_method_source = 'recorded', prop_tray_size = null
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id and p.name = 'Spring 2027'
  and v.crop_name ilike 'tradescantia' and sc.item_name ~* '\bHB\b'
  and sc.prop_method = 'URC' and sc.prop_method_source = 'corrected';
