-- Recipes should be deletable without orphan errors: scheduled_crops.recipe_id is a
-- soft reference (repo convention = on delete set null, like variety_identity links).
alter table scheduled_crops drop constraint if exists scheduled_crops_recipe_id_fkey;
alter table scheduled_crops
  add constraint scheduled_crops_recipe_id_fkey
  foreign key (recipe_id) references crop_recipes(id) on delete set null;
