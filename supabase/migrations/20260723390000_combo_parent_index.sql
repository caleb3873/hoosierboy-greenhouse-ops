-- The cost views probe EXISTS(combo_parent_id = sc.id) up to 4x per row, and
-- there was no index on combo_parent_id — every probe was a sequential scan.
create index if not exists idx_scheduled_crops_combo_parent on scheduled_crops (combo_parent_id) where combo_parent_id is not null;
