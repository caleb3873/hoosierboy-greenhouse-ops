-- Email marketing P1: campaigns, recipients, contacts, outbound message log, unsubscribes.
-- STAFF-ONLY: all tables are authenticated-role RLS (floor codes are anon and must not see
-- campaigns). Server pipeline (P3) uses the service role; the public unsubscribe endpoint
-- gets anon INSERT on unsubscribes only.

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text,
  body text,                        -- rendered HTML with {merge_fields}
  template_id text,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','canceled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count int default 0,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists campaigns_due on campaigns (scheduled_at) where status = 'scheduled';

create table if not exists campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  email text not null,
  contact_name text,
  organization text,
  message_id uuid,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  created_at timestamptz default now(),
  unique (campaign_id, email)
);
create index if not exists cr_campaign_status on campaign_recipients (campaign_id, status);

create table if not exists marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  source text default 'mailchimp_import',
  tags text[] default '{}',
  unsubscribed boolean default false,
  bounced boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'outbound',
  status text not null default 'queued' check (status in ('queued','sent','delivered','bounced','failed','complained','opened')),
  from_email text,
  to_email text,
  subject text,
  body_text text,
  body_html text,
  provider_message_id text,
  opened_at timestamptz,
  clicked_at timestamptz,
  campaign_id uuid references campaigns(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists messages_provider on messages (provider_message_id);
create index if not exists messages_campaign on messages (campaign_id);

create table if not exists unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text default 'link',
  created_at timestamptz default now()
);

-- random salt for signing unsubscribe links (server reads it; never shipped to clients)
insert into b2b_settings (key, value, description)
values ('unsub_salt', md5(gen_random_uuid()::text), 'HMAC salt for unsubscribe link tokens')
on conflict (key) do nothing;

-- RLS: staff (authenticated) only; anon may only INSERT unsubscribes (public endpoint).
do $$ declare t text;
begin
  foreach t in array array['campaigns','campaign_recipients','marketing_contacts','messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_auth on %I', t, t);
    execute format('create policy %I_auth on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
alter table unsubscribes enable row level security;
drop policy if exists unsub_auth on unsubscribes;
create policy unsub_auth on unsubscribes for all to authenticated using (true) with check (true);
drop policy if exists unsub_anon_insert on unsubscribes;
create policy unsub_anon_insert on unsubscribes for insert to anon with check (true);
