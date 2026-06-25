-- Carry the sourced supplier + farm origin onto plan rows (written by apply_sourcing_to_plan.js)
-- so the origin map + order-minimum rollups can query the plan directly.
alter table scheduled_crops add column if not exists supplier text;
alter table scheduled_crops add column if not exists origin text;
