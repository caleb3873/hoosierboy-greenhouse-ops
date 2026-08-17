-- a group can be pinned apart by NAME even when its dates match another group
-- (Caleb 8/17: "make the material going in house 23 its own group") — the family
-- page folds the tag into the group key; null = group purely by dates as before
alter table scheduled_crops add column if not exists group_tag text;
notify pgrst, 'reload schema';
