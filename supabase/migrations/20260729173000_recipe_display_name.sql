-- Custom family names: an owner-facing label/category not tied to crop+size
-- (e.g. "Premium Combo Program"). Null = derived "SIZE CROP" label as before.
alter table crop_recipes add column if not exists display_name text;
