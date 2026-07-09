-- Link a Growing task back to its treatment record + variety, so per-variety task photos loop back
-- to the exact variety on the Treatment Plan. Only set on tasks created from a treatment.
alter table manager_tasks add column if not exists source_record_id bigint;
alter table manager_tasks add column if not exists source_variety text;
create index if not exists idx_manager_tasks_source_record on manager_tasks(source_record_id);
