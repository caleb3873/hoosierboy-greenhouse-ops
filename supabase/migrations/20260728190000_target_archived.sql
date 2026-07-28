-- Retire tier for the walkthrough: items we won't repeat get archived_at set
-- (plus a drop decision). Hidden from every Sales vs Plan view except the
-- explicit 📦 Retired filter, where they can be reactivated (archived_at null).
alter table plan_targets add column if not exists archived_at timestamptz;
