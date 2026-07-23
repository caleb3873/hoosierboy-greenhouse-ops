-- Reusable group-builder templates (color mix + waves), plan-independent so a
-- geranium program built this year can be replayed next year. Wave finish weeks
-- are stored as OFFSETS from the peak (Mother's Day) so they translate across
-- years where the peak ISO week shifts.
create table if not exists group_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null,   -- { items:[{item,pct}], n_waves, wave_offsets:[...] }
  created_by text,
  created_at timestamptz not null default now()
);
alter table group_templates enable row level security;
drop policy if exists group_templates_all on group_templates;
create policy group_templates_all on group_templates for all using (true) with check (true);
