-- Young-plant order multiple: liners sell in tray increments (144s, 288s…) —
-- projections round UP so plants ordered always land on a sellable multiple.
alter table crop_recipe_series add column if not exists order_multiple int;
