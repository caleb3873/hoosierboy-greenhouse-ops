-- Item photo gallery (2026-07-27 spec §9): camera-first shots attached to an ITEM,
-- auto-stamped date·time·who. Own bucket — the marketing photo library deliberately
-- excludes operational imagery; only photos tagged b2b=true flow to the sales catalog.
create table if not exists item_photos (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references production_plans(id) on delete cascade,
  item_name text not null,
  storage_path text not null,
  url text not null,
  taken_by text,
  b2b boolean not null default false,        -- tagged → eligible for B2B catalog/hot lists
  note text,
  taken_at timestamptz not null default now()
);
create index if not exists item_photos_item_idx on item_photos(plan_id, item_name);
alter table item_photos enable row level security;
drop policy if exists item_photos_all on item_photos;
create policy item_photos_all on item_photos for all using (true) with check (true);

insert into storage.buckets (id, name, public) values ('item-photos','item-photos',true)
  on conflict (id) do nothing;
drop policy if exists "ip_obj_read" on storage.objects;
drop policy if exists "ip_obj_ins" on storage.objects;
drop policy if exists "ip_obj_del" on storage.objects;
create policy "ip_obj_read" on storage.objects for select to public using (bucket_id='item-photos');
create policy "ip_obj_ins"  on storage.objects for insert to public with check (bucket_id='item-photos');
create policy "ip_obj_del"  on storage.objects for delete to public using (bucket_id='item-photos');
