-- Multi-assign as a shared pool: a task can be assigned to several people; anyone in the pool can
-- claim + do it. `assignees` is the list of names; assigned_to is kept in sync (= first) for legacy reads.
alter table manager_tasks add column if not exists assignees jsonb default '[]'::jsonb;
update manager_tasks set assignees = to_jsonb(array[assigned_to])
  where assigned_to is not null and (assignees is null or assignees = '[]'::jsonb);
