-- Minimums apply per FARM, not per broker/supplier — drafts split on it.
alter table purchase_orders add column if not exists farm text;
