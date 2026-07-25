-- Propagation guide: our layer on top of the culture-guide sources. One row per
-- crop (optionally per series), holding OUR setup notes, an SOP we build over the
-- season, and timing OVERRIDES that will prefill production time + prop tasks in
-- the plan (crop_weeks, stick→transplant, mist days, weeks-to-pinch, tray, etc.).
create table if not exists prop_guides (
  id uuid primary key default gen_random_uuid(),
  guide_key text unique not null,       -- normalized crop, or crop|series
  crop text not null,
  series text,
  culture_source_id text,               -- representative culture_guides_public id
  our_notes text,
  sop jsonb,                            -- [{ step, detail }] ordered
  overrides jsonb,                      -- { prop_weeks, stick_to_transplant, mist_days, weeks_to_pinch, tray, hormone, day_temp, night_temp, soil_temp }
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table prop_guides enable row level security;
drop policy if exists prop_guides_all on prop_guides;
create policy prop_guides_all on prop_guides for all using (true) with check (true);
