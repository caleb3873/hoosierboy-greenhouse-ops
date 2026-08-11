-- Reese's flow (sv answers 8/10): per-variety ✓ done / rate / note live ON the
-- record (no task pipeline needed for self-service logging); logged_by for the
-- weekly recap.
alter table treatment_records add column if not exists variety_done jsonb default '{}'::jsonb;
alter table treatment_records add column if not exists variety_rates jsonb default '{}'::jsonb;
alter table treatment_records add column if not exists variety_notes jsonb default '{}'::jsonb;
alter table treatment_records add column if not exists logged_by text;
