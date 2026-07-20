-- B2B M17: optional grade on order lines (sell a graded batch at its grade price).
alter table customer_order_lines add column if not exists grade text references grades(code);
