-- B2B M15: task-flow hooks.
-- Count tasks: manager_tasks rows link to their production item (blind counts — the task
-- NEVER carries the expected qty; completion notes carry the counted number, harvested by
-- the cron into a blind count event).
alter table manager_tasks add column if not exists production_item_id uuid references production_items(id);
-- Order → shipping bridge: a confirmed B2B order becomes a proposed delivery in Shipping
-- Command (their normal approval inbox); link prevents double-creation.
alter table customer_orders add column if not exists requested_date date;
alter table customer_orders add column if not exists delivery_id uuid references deliveries(id);
