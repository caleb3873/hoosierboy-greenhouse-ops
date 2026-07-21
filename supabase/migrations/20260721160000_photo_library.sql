-- photo_library — one row per photo across the MARKETING sources, so every
-- picture the company takes stays findable and reusable.
--
-- Deliberately excludes operational and compliance imagery: pick sheets, signed
-- customer invoices, receiving claims, inventory counts, hiring resumes and task
-- photos. Those are records, not marketing assets, and several sit in private
-- buckets that shouldn't be browsable by anyone building a slideshow.
--
-- This is an INDEX, not storage — the files stay where they are. Rows are
-- upserted by /api/photo-index on (source, external_id), so re-syncing is safe.

create table if not exists photo_library (
  id uuid primary key default gen_random_uuid(),
  source text not null,              -- tradeshow | tradeshow_session | gallery | treatment | combo
  external_id text not null,         -- id within that source (dedup key)
  source_id text,                    -- parent record: event / session / gallery / treatment id
  source_label text,                 -- human folder name: event name, gallery title, variety…
  url text not null,                 -- full public URL (all marketing buckets are public)
  thumb_url text,
  bucket text,
  storage_path text,
  caption text,
  variety text,
  vendor text,
  tags text[] default '{}',
  taken_at timestamptz,
  uploaded_by text,
  hidden boolean not null default false,   -- hide from the library without touching the source
  favorite boolean not null default false,
  indexed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists photo_library_source_idx on photo_library (source, taken_at desc);
create index if not exists photo_library_taken_idx on photo_library (taken_at desc);
create index if not exists photo_library_variety_idx on photo_library (lower(variety));
alter table photo_library enable row level security;
drop policy if exists photo_library_all on photo_library;
create policy photo_library_all on photo_library for all using (true) with check (true);

comment on table photo_library is
  'Index of marketing photos across trade show, hot lists/galleries, treatment records and the combo library. Operational imagery (pick sheets, signed invoices, receiving, inventory, resumes, task photos) is intentionally not indexed.';
