-- Space planning: capacity = standard chart per (zone, bench type, container class)
-- + per-bench quirk overrides. "If 408 fit on one full 8' west-side bench, it
-- fits on every full 8'." Thirds run at 1/3 of the nominal bench (Caleb 8/11);
-- 4.5" tray counts on thirds were already right as listed.
alter table benches add column if not exists bench_type text;
alter table benches add column if not exists cap_overrides jsonb;

create table if not exists bench_capacity_rules (
  id uuid primary key default gen_random_uuid(),
  zone_prefix text not null,
  bench_type text not null,
  container_class text not null,
  capacity int not null,
  unique(zone_prefix, bench_type, container_class)
);
alter table bench_capacity_rules enable row level security;
drop policy if exists "bcr_all" on bench_capacity_rules;
create policy "bcr_all" on bench_capacity_rules for all to anon, authenticated using (true) with check (true);

insert into bench_capacity_rules (zone_prefix, bench_type, container_class, capacity) values
  ('BWS','full8','fiber_lg',408),('BWS','full8','fiber_sm',728),('BWS','full8','pot11',400),('BWS','full8','canyon14',200),
  ('BWS','full4','fiber_lg',204),('BWS','full4','fiber_sm',320),('BWS','full4','pot11',200),('BWS','full4','canyon14',100),
  ('BWS','full4','pot10',320),('BWS','full4','tray45',289),
  ('BWS','third8','tray45',157),('BWS','third8','fiber_lg',136),('BWS','third8','fiber_sm',243),('BWS','third8','pot11',133),('BWS','third8','canyon14',67),
  ('BWS','third4','tray45',92),('BWS','third4','fiber_lg',68),('BWS','third4','fiber_sm',107),('BWS','third4','pot11',67),('BWS','third4','canyon14',33)
on conflict (zone_prefix, bench_type, container_class) do update set capacity = excluded.capacity;

-- bench classification (from the 2027 MAPS sheet + Caleb: BWSN09-16 are thirds)
update benches set bench_type='full8' where code in ('BWSS19','BWSS18','BWSS15','BWSS14','BWSS11','BWSS10','BWSS07','BWSS06','BWSS03','BWSS02','BWSN07','BWSN06','BWSN03','BWSN02');
update benches set bench_type='full4' where code in ('BWSS20','BWSS17','BWSS16','BWSS13','BWSS12','BWSS09','BWSS08','BWSS05','BWSS04','BWSS01','BWSN08','BWSN05','BWSN04','BWSN01');
update benches set bench_type='third8' where code in ('BWSN15','BWSN14','BWSN11','BWSN10','BWSN09');
update benches set bench_type='third4' where code in ('BWSN16','BWSN13','BWSN12');
update benches set bench_type='basket_line' where code like 'BWSH%';

-- quirk overrides exactly as listed on the sheet
update benches set cap_overrides='{"fiber_lg":200}' where code in ('BWSS13','BWSS12');
update benches set cap_overrides='{"fiber_lg":400}' where code in ('BWSS11','BWSS10');
update benches set cap_overrides='{"fiber_sm":744}' where code='BWSS03';
update benches set cap_overrides='{"pot11":170}' where code='BWSS01';
