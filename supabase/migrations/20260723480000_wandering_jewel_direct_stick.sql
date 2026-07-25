-- HB 10" Wandering Jewel (Tradescantia) is direct-stuck into the basket. Restore
-- the ones I wrongly moved to URC. (4.5" tradescantia + 16" shade baskets root in
-- trays, so they correctly stay URC.)
update scheduled_crops sc set prop_method = 'DIRECT STICK', prop_method_source = 'recorded', prop_tray_size = null
from variety_library v, production_plans p
where v.id = sc.variety_id and p.id = sc.plan_id and p.name = 'Spring 2027'
  and v.crop_name ilike 'tradescantia' and sc.item_name ilike 'HB 10%'
  and sc.prop_method = 'URC' and sc.prop_method_source = 'corrected';
