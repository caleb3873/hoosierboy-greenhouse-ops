-- Supabase security advisory 2026-07-26 (rls_disabled_in_public): the only public
-- tables without RLS were the four data-surgery backup snapshots from 7/21-7/22.
-- The app never reads them; RLS with no policies locks anon/authenticated out
-- entirely while keeping them reachable from the SQL editor/CLI for restores.
alter table scheduled_crops_ppp20_backup_20260722 enable row level security;
alter table scheduled_crops_readyweek_backup_20260721 enable row level security;
alter table scheduled_crops_unit_backup_20260721 enable row level security;
alter table variety_library_merge_backup_20260722 enable row level security;
