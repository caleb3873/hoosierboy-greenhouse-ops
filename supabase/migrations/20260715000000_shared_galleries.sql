-- Shareable galleries: slideshows + hot lists behind a public link (token = row id).
create table if not exists shared_galleries (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'slideshow',   -- slideshow | hotlist | personalized
  title text, recipient text, subtitle text,
  items jsonb default '[]',                 -- [{id,url,caption,sort,week}]
  created_by text, department text, active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table shared_galleries enable row level security;
drop policy if exists sg_all on shared_galleries;
create policy sg_all on shared_galleries for all to anon, authenticated using (true) with check (true);
