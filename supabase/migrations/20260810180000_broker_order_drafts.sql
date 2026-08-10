-- Broker order drafts — "lock in the order" from the family page writes draft
-- purchase_orders; lines gain the broker material # and the form (URC/CALL drive
-- the 100-per-color rounding rule).
alter table purchase_order_lines add column if not exists material text;
alter table purchase_order_lines add column if not exists form text;
