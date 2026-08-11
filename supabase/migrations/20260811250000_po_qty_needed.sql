-- Internal "needed" quantity per order line: the plan's raw plant requirement
-- before minimum/100s rounding — shows extras at a glance; never on the XLSX.
alter table purchase_order_lines add column if not exists qty_needed int;
