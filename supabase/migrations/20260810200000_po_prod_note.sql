-- Internal production note on order lines (broker-facing `notes` stays clean;
-- prod_note is ours — bulk-set from the Orders tab item view).
alter table purchase_order_lines add column if not exists prod_note text;
