-- Program → plan bridge: an approved program's items become real scheduled_crops
-- rows, which the B2B reconcile then absorbs like any other plan edit.
alter table program_items add column if not exists scheduled_crop_id uuid references scheduled_crops(id);
comment on column program_items.scheduled_crop_id is
  'Set when this program item was converted into a plan row — prevents double-conversion.';
