-- Distinguish a treatment task (size-at-treatment) from its auto-scheduled response-check
-- task, so photos from a response check loop back to the Treatment Plan as kind:"response".
alter table manager_tasks add column if not exists source_kind text; -- 'treatment' | 'response'
