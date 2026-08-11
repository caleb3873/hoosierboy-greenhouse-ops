-- Space placement stamp: rows inherited from the 2026 replay keep their bench
-- as LAST-YEAR REFERENCE only; a bench counts as filled when Caleb places it
-- (placed_at set). The 4.5" geranium benches came from his 2027 sheet — real
-- placements, stamped.
alter table scheduled_crops add column if not exists placed_at timestamptz;
update scheduled_crops set placed_at = now()
where recipe_id = '14cc0daa-d3df-4459-89e9-b7a7bf8dba81'
  and plan_id = 'd2360134-0fbb-4548-af2f-5cc3ccd590c6'
  and bench_id is not null;
