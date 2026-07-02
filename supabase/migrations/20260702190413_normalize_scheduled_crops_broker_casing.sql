-- Normalize legacy broker casing on scheduled_crops so display/grouping is consistent with the
-- proper-case values apply_sourcing_to_plan.js writes ('Ball'/'EHR'/'Express'/'Lucas'). Plan data
-- only — does NOT touch the Fall Program (fall_program_items).
update scheduled_crops set broker = 'Ball'     where broker = 'BALL';
update scheduled_crops set broker = 'Eason'    where broker = 'EASON';
update scheduled_crops set broker = 'Schlegel' where broker = 'SCHLEGEL';
update scheduled_crops set broker = null       where broker = '';
