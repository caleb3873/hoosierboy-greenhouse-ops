-- Access Control (task category toggles) runs in the floor-code app as the anon role, but floor_codes
-- only allowed writes by authenticated → toggles silently saved 0 rows. Let anon update ONLY the
-- task_categories column (login codes / roles stay protected: anon keeps table-wide UPDATE revoked,
-- gets a column grant + a row policy).
revoke update on floor_codes from anon;
grant update (task_categories) on floor_codes to anon;
drop policy if exists "anon set task_categories" on floor_codes;
create policy "anon set task_categories" on floor_codes for update to anon using (true) with check (true);
