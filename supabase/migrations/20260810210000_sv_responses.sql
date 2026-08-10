-- Answers for interactive sales-visit questionnaire pages (?sv= links).
-- One row per slug; answers jsonb keyed by question id: {q1:{choice:"A",notes:"…"}}
create table if not exists sv_responses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  answers jsonb default '{}'::jsonb,
  answered_by text,
  updated_at timestamptz default now()
);
alter table sv_responses enable row level security;
drop policy if exists "sv_responses_all" on sv_responses;
create policy "sv_responses_all" on sv_responses for all to anon, authenticated using (true) with check (true);
