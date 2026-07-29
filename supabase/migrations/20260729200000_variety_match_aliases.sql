-- Manual quote matching: when a broker names a variety differently than we do and
-- the normalized variety_key doesn't collapse them (e.g. Ball "veronica blue dkipd
-- moody" vs our "veronica blue dark moody" for Moody Blues Dark Blue), a planner can
-- search the catalog and lock the right quote. The matched key is remembered HERE on
-- our variety — not on the parsed quote — so it survives every future quote re-upload.
alter table variety_library add column if not exists match_aliases text[] default '{}';
