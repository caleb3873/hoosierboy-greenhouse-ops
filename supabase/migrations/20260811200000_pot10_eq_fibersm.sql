-- Caleb 8/11: 10" pots cap the same as Fiber Small — mirror every fiber_sm
-- chart row into pot10 (overwrites the lone 4'-only pot10 numbers).
insert into bench_capacity_rules (zone_prefix, bench_type, container_class, capacity)
select zone_prefix, bench_type, 'pot10', capacity from bench_capacity_rules where container_class='fiber_sm'
on conflict (zone_prefix, bench_type, container_class) do update set capacity = excluded.capacity;
