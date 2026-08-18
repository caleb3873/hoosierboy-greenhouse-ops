-- THE CONTAINER IS THE SOURCE OF TRUTH FOR SIZE (Caleb 8/18): each container carries
-- its canonical size label + the item-name prefix. Picking a size picks the pot;
-- the item name derives; recipes inherit — three facts collapse into one.
alter table containers add column if not exists size_label text;
alter table containers add column if not exists name_prefix text;
notify pgrst, 'reload schema';
