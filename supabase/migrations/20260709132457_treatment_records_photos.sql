-- Photos on treatment records — e.g. how big the plants were at Piccolo time (size-triggered), so it's
-- a year-over-year reference. Stored in treatment-photos bucket; photos jsonb = [{url,capturedAt,comment}].
alter table treatment_records add column if not exists photos jsonb default '[]'::jsonb;
insert into storage.buckets (id, name, public) values ('treatment-photos','treatment-photos',true)
  on conflict (id) do nothing;
drop policy if exists "tp_obj_read" on storage.objects;
drop policy if exists "tp_obj_ins" on storage.objects;
drop policy if exists "tp_obj_del" on storage.objects;
create policy "tp_obj_read" on storage.objects for select to public using (bucket_id='treatment-photos');
create policy "tp_obj_ins"  on storage.objects for insert to public with check (bucket_id='treatment-photos');
create policy "tp_obj_del"  on storage.objects for delete to public using (bucket_id='treatment-photos');
