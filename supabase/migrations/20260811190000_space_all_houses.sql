-- Space, all houses (Caleb 8/11): WS container rules apply to quonsets +
-- Bluff Main; BM 4.5 model = plant tight (423/8') then space out (315/8', 160/4');
-- basket + low lines seeded from the 2027 SPRING master list (Q05 halved — turned).

insert into bench_capacity_rules (zone_prefix, bench_type, container_class, capacity) values
  ('EQODD','mid8','fiber_lg',408),
  ('EQODD','mid8','fiber_sm',728),
  ('EQODD','mid8','pot11',400),
  ('EQODD','mid8','canyon14',200),
  ('EQODD','wall4','fiber_lg',204),
  ('EQODD','wall4','fiber_sm',320),
  ('EQODD','wall4','pot11',200),
  ('EQODD','wall4','pot10',320),
  ('EQODD','wall4','canyon14',100),
  ('EQEVEN','mid8','fiber_lg',408),
  ('EQEVEN','mid8','fiber_sm',728),
  ('EQEVEN','mid8','pot11',400),
  ('EQEVEN','mid8','canyon14',200),
  ('EQEVEN','wall4','fiber_lg',204),
  ('EQEVEN','wall4','fiber_sm',320),
  ('EQEVEN','wall4','pot11',200),
  ('EQEVEN','wall4','pot10',320),
  ('EQEVEN','wall4','canyon14',100),
  ('EQ22','mid8','fiber_lg',408),
  ('EQ22','mid8','fiber_sm',728),
  ('EQ22','mid8','pot11',400),
  ('EQ22','mid8','canyon14',200),
  ('EQ22','wall4','fiber_lg',204),
  ('EQ22','wall4','fiber_sm',320),
  ('EQ22','wall4','pot11',200),
  ('EQ22','wall4','pot10',320),
  ('EQ22','wall4','canyon14',100),
  ('DBM','full8','tray45_tight',423),
  ('DBM','full8','tray45_spaced',315),
  ('DBM','full8','fiber_lg',408),
  ('DBM','full8','fiber_sm',728),
  ('DBM','full8','pot11',400),
  ('DBM','full8','canyon14',200),
  ('DBM','full6','tray45_tight',315),
  ('DBM','full6','tray45_spaced',236),
  ('DBM','full4','tray45_tight',200),
  ('DBM','full4','tray45_spaced',160),
  ('DBM','full4','fiber_lg',204),
  ('DBM','full4','fiber_sm',320),
  ('DBM','full4','pot11',200),
  ('DBM','full4','pot10',320),
  ('DBM','full4','canyon14',100)
on conflict (zone_prefix, bench_type, container_class) do update set capacity = excluded.capacity;

update benches set bench_type='full8' where code in ('DBMW03','DBMW04','DBMW08','DBMW09','DBMW10','DBME03','DBME04','DBME08','DBME09','DBME10');

update benches set bench_type='full6' where code in ('DBMW05','DBMW11','DBME05','DBME11');

update benches set bench_type='full4' where code in ('DBMW06','DBMW07','DBMW12','DBME06','DBME07','DBME12');

update benches set cap_overrides='{"tray45_tight":264}' where code='DBMW01';

update benches set cap_overrides='{"tray45_tight":300}' where code='DBME01';

update benches set cap_overrides='{"tray45_tight":384}' where code='DBMW02';

update benches set cap_overrides='{"pot65":2200}' where code='DBME02';

insert into benches (code, bench_type, zone_label, zone_type)
select v.c, v.t, v.z, v.zt from (values
  ('ASMH00','basket_line','SM House','basket_line'),
  ('ASMH100','basket_line','SM House','basket_line'),
  ('ASMH33','basket_line','SM House','basket_line'),
  ('ASMH34','basket_line','SM House','basket_line'),
  ('ASMH35','basket_line','SM House','basket_line'),
  ('ASMH36','basket_line','SM House','basket_line'),
  ('ASMH37','basket_line','SM House','basket_line'),
  ('ASMH38','basket_line','SM House','basket_line'),
  ('ASMH39','basket_line','SM House','basket_line'),
  ('ASMH40','basket_line','SM House','basket_line'),
  ('ASMH41','basket_line','SM House','basket_line'),
  ('ASMH42','basket_line','SM House','basket_line'),
  ('ASMH43','basket_line','SM House','basket_line'),
  ('ASMH44','basket_line','SM House','basket_line'),
  ('ASMH45','basket_line','SM House','basket_line'),
  ('ASMH46','basket_line','SM House','basket_line'),
  ('ASMH47','basket_line','SM House','basket_line'),
  ('ASMH48','basket_line','SM House','basket_line'),
  ('ASMH49','basket_line','SM House','basket_line'),
  ('ASMH50','basket_line','SM House','basket_line'),
  ('ASMH51','basket_line','SM House','basket_line'),
  ('ASMH52','basket_line','SM House','basket_line'),
  ('ASMH53','basket_line','SM House','basket_line'),
  ('ASMH54','basket_line','SM House','basket_line'),
  ('ASMH55','basket_line','SM House','basket_line'),
  ('ASMH56','basket_line','SM House','basket_line'),
  ('ASMH57','basket_line','SM House','basket_line'),
  ('ASMH58','basket_line','SM House','basket_line'),
  ('ASMH59','basket_line','SM House','basket_line'),
  ('ASMH60','basket_line','SM House','basket_line'),
  ('ASMH61','basket_line','SM House','basket_line'),
  ('ASMH62','basket_line','SM House','basket_line'),
  ('ASMH63','basket_line','SM House','basket_line'),
  ('ASMH64','basket_line','SM House','basket_line'),
  ('ASMH65','basket_line','SM House','basket_line'),
  ('ASMH66','basket_line','SM House','basket_line'),
  ('ASMH67','basket_line','SM House','basket_line'),
  ('ASMH68','basket_line','SM House','basket_line'),
  ('ASMH69','basket_line','SM House','basket_line'),
  ('ASMH70','basket_line','SM House','basket_line'),
  ('ASMH71','basket_line','SM House','basket_line'),
  ('ASMH72','basket_line','SM House','basket_line'),
  ('ASMH73','basket_line','SM House','basket_line'),
  ('ASMH74','basket_line','SM House','basket_line'),
  ('ASMH75','basket_line','SM House','basket_line'),
  ('ASMH76','basket_line','SM House','basket_line'),
  ('ASMH77','basket_line','SM House','basket_line'),
  ('ASMH78','basket_line','SM House','basket_line'),
  ('ASMH79','basket_line','SM House','basket_line'),
  ('ASMH80','basket_line','SM House','basket_line'),
  ('ASMH81','basket_line','SM House','basket_line'),
  ('ASMH82','basket_line','SM House','basket_line'),
  ('ASMH83','basket_line','SM House','basket_line'),
  ('ASMH84','basket_line','SM House','basket_line'),
  ('ASMH85','basket_line','SM House','basket_line'),
  ('ASMH86','basket_line','SM House','basket_line'),
  ('ASMH87','basket_line','SM House','basket_line'),
  ('ASMH88','basket_line','SM House','basket_line'),
  ('ASMH89','basket_line','SM House','basket_line'),
  ('ASMH90','basket_line','SM House','basket_line'),
  ('ASMH91','basket_line','SM House','basket_line'),
  ('ASMH92','basket_line','SM House','basket_line'),
  ('ASMH93','basket_line','SM House','basket_line'),
  ('ASMH94','basket_line','SM House','basket_line'),
  ('ASMH95','basket_line','SM House','basket_line'),
  ('ASMH96','basket_line','SM House','basket_line'),
  ('ASMH97','basket_line','SM House','basket_line'),
  ('ASMH98','basket_line','SM House','basket_line'),
  ('ASMH99','basket_line','SM House','basket_line'),
  ('BWSH01','basket_line','Bluff West Side','basket_line'),
  ('BWSH02','basket_line','Bluff West Side','basket_line'),
  ('BWSH03','basket_line','Bluff West Side','basket_line'),
  ('BWSH04','basket_line','Bluff West Side','basket_line'),
  ('BWSH05','basket_line','Bluff West Side','basket_line'),
  ('BWSH06','basket_line','Bluff West Side','basket_line'),
  ('BWSH07','basket_line','Bluff West Side','basket_line'),
  ('BWSH08','basket_line','Bluff West Side','basket_line'),
  ('BWSH09','basket_line','Bluff West Side','basket_line'),
  ('BWSH10','basket_line','Bluff West Side','basket_line'),
  ('BWSH11','basket_line','Bluff West Side','basket_line'),
  ('BWSH12','basket_line','Bluff West Side','basket_line'),
  ('BWSH13','basket_line','Bluff West Side','basket_line'),
  ('BWSH14','basket_line','Bluff West Side','basket_line'),
  ('BWSH15','basket_line','Bluff West Side','basket_line'),
  ('BWSH16','basket_line','Bluff West Side','basket_line'),
  ('BWSH17','basket_line','Bluff West Side','basket_line'),
  ('BWSH18','basket_line','Bluff West Side','basket_line'),
  ('BWSH19','basket_line','Bluff West Side','basket_line'),
  ('BWSH20','basket_line','Bluff West Side','basket_line'),
  ('BWSH21','basket_line','Bluff West Side','basket_line'),
  ('BWSH22','basket_line','Bluff West Side','basket_line'),
  ('BWSH23','basket_line','Bluff West Side','basket_line'),
  ('BWSH24','basket_line','Bluff West Side','basket_line'),
  ('BWSH25','basket_line','Bluff West Side','basket_line'),
  ('BWSH26','basket_line','Bluff West Side','basket_line'),
  ('BWSH27','basket_line','Bluff West Side','basket_line'),
  ('BWSH28','basket_line','Bluff West Side','basket_line'),
  ('BWSH29','basket_line','Bluff West Side','basket_line'),
  ('BWSH30','basket_line','Bluff West Side','basket_line'),
  ('BWSH31','basket_line','Bluff West Side','basket_line'),
  ('BWSH32','basket_line','Bluff West Side','basket_line'),
  ('BWSH33','basket_line','Bluff West Side','basket_line'),
  ('BWSH34','basket_line','Bluff West Side','basket_line'),
  ('BWSH35','basket_line','Bluff West Side','basket_line'),
  ('BWSH36','basket_line','Bluff West Side','basket_line'),
  ('BWSH37','basket_line','Bluff West Side','basket_line'),
  ('BWSH38','basket_line','Bluff West Side','basket_line'),
  ('BWSH39','basket_line','Bluff West Side','basket_line'),
  ('BWSH40','basket_line','Bluff West Side','basket_line'),
  ('BWSH41','basket_line','Bluff West Side','basket_line'),
  ('BWSH42','basket_line','Bluff West Side','basket_line'),
  ('BWSH43','basket_line','Bluff West Side','basket_line'),
  ('BWSH44','basket_line','Bluff West Side','basket_line'),
  ('BWSH45','basket_line','Bluff West Side','basket_line'),
  ('BWSH46','basket_line','Bluff West Side','basket_line'),
  ('BWSH47','basket_line','Bluff West Side','basket_line'),
  ('BWSH48','basket_line','Bluff West Side','basket_line'),
  ('BWSH49','basket_line','Bluff West Side','basket_line'),
  ('BWSH50','basket_line','Bluff West Side','basket_line'),
  ('BWSH51','basket_line','Bluff West Side','basket_line'),
  ('BWSH52','basket_line','Bluff West Side','basket_line'),
  ('BWSH53','basket_line','Bluff West Side','basket_line'),
  ('BWSH54','basket_line','Bluff West Side','basket_line'),
  ('BWSH55','basket_line','Bluff West Side','basket_line'),
  ('BWSH56','basket_line','Bluff West Side','basket_line'),
  ('BWSH57','basket_line','Bluff West Side','basket_line'),
  ('BWSH58','basket_line','Bluff West Side','basket_line'),
  ('BWSH59','basket_line','Bluff West Side','basket_line'),
  ('BWSH60','basket_line','Bluff West Side','basket_line'),
  ('BWSH61','basket_line','Bluff West Side','basket_line'),
  ('BWSH62','basket_line','Bluff West Side','basket_line'),
  ('BWSH63','basket_line','Bluff West Side','basket_line'),
  ('BWSH64','basket_line','Bluff West Side','basket_line'),
  ('BWSH65','basket_line','Bluff West Side','basket_line'),
  ('BWSH66','basket_line','Bluff West Side','basket_line'),
  ('BWSH67','basket_line','Bluff West Side','basket_line'),
  ('BWSH68','basket_line','Bluff West Side','basket_line'),
  ('BWSH69','basket_line','Bluff West Side','basket_line'),
  ('BWSH70','basket_line','Bluff West Side','basket_line'),
  ('BWSH71','basket_line','Bluff West Side','basket_line'),
  ('BWSH72','basket_line','Bluff West Side','basket_line'),
  ('BWSH73','basket_line','Bluff West Side','basket_line'),
  ('BWSH74','basket_line','Bluff West Side','basket_line'),
  ('BWSH75','basket_line','Bluff West Side','basket_line'),
  ('BWSH76','basket_line','Bluff West Side','basket_line'),
  ('BWSH77','basket_line','Bluff West Side','basket_line'),
  ('BWSH78','basket_line','Bluff West Side','basket_line'),
  ('BWSH79','basket_line','Bluff West Side','basket_line'),
  ('BWSH80','basket_line','Bluff West Side','basket_line'),
  ('DBMH01','basket_line','Bluff Main','basket_line'),
  ('DBMH02','basket_line','Bluff Main','basket_line'),
  ('DBMH03','basket_line','Bluff Main','basket_line'),
  ('DBMH04','basket_line','Bluff Main','basket_line'),
  ('DBMH05','basket_line','Bluff Main','basket_line'),
  ('DBMH06','basket_line','Bluff Main','basket_line'),
  ('DBMH07','basket_line','Bluff Main','basket_line'),
  ('DBMH08','basket_line','Bluff Main','basket_line'),
  ('DBMH09','basket_line','Bluff Main','basket_line'),
  ('DBMH10','basket_line','Bluff Main','basket_line'),
  ('DBMH11','basket_line','Bluff Main','basket_line'),
  ('DBMH12','basket_line','Bluff Main','basket_line'),
  ('DBMH13','basket_line','Bluff Main','basket_line'),
  ('DBMH14','basket_line','Bluff Main','basket_line'),
  ('DBMH15','basket_line','Bluff Main','basket_line'),
  ('DBMH16','basket_line','Bluff Main','basket_line'),
  ('DBMH17','basket_line','Bluff Main','basket_line'),
  ('DBMH18','basket_line','Bluff Main','basket_line'),
  ('DBMH19','basket_line','Bluff Main','basket_line'),
  ('DBMH20','basket_line','Bluff Main','basket_line'),
  ('DBMH21','basket_line','Bluff Main','basket_line'),
  ('DBMH22','basket_line','Bluff Main','basket_line'),
  ('DBMH23','basket_line','Bluff Main','basket_line'),
  ('DBMH24','basket_line','Bluff Main','basket_line'),
  ('DBMH25','basket_line','Bluff Main','basket_line'),
  ('DBMH26','basket_line','Bluff Main','basket_line'),
  ('DBMH27','basket_line','Bluff Main','basket_line'),
  ('DBMH28','basket_line','Bluff Main','basket_line'),
  ('DBMH29','basket_line','Bluff Main','basket_line'),
  ('DBMH30','basket_line','Bluff Main','basket_line'),
  ('DBMH31','basket_line','Bluff Main','basket_line'),
  ('DBMH32','basket_line','Bluff Main','basket_line'),
  ('DBMH33','basket_line','Bluff Main','basket_line'),
  ('DBMH34','basket_line','Bluff Main','basket_line'),
  ('DBMH35','basket_line','Bluff Main','basket_line'),
  ('DBMH36','basket_line','Bluff Main','basket_line'),
  ('DBML01','low_line','Bluff Main','low_line'),
  ('DBML03','low_line','Bluff Main','low_line'),
  ('DBML04','low_line','Bluff Main','low_line'),
  ('DBML06','low_line','Bluff Main','low_line'),
  ('DBML09','low_line','Bluff Main','low_line'),
  ('DBML10','low_line','Bluff Main','low_line'),
  ('DBML11','low_line','Bluff Main','low_line'),
  ('DBML13','low_line','Bluff Main','low_line'),
  ('DBML14','low_line','Bluff Main','low_line'),
  ('DBML16','low_line','Bluff Main','low_line'),
  ('DBML17','low_line','Bluff Main','low_line'),
  ('DBML18','low_line','Bluff Main','low_line'),
  ('EQH0201','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0202','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0203','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0204','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0205','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0206','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0207','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0208','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0209','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0210','basket_line','Bluff Quonset 02','basket_line'),
  ('EQH0301','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0302','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0303','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0304','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0305','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0306','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0307','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0308','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0309','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0310','basket_line','Bluff Quonset 03','basket_line'),
  ('EQH0401','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0402','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0403','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0404','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0405','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0406','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0407','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0408','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0409','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0410','basket_line','Bluff Quonset 04','basket_line'),
  ('EQH0501','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0502','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0503','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0504','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0505','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0506','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0507','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0508','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0509','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0510','basket_line','Bluff Quonset 05','basket_line'),
  ('EQH0601','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0602','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0603','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0604','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0605','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0606','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0607','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0608','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0609','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0610','basket_line','Bluff Quonset 06','basket_line'),
  ('EQH0701','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0702','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0703','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0704','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0705','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0706','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0707','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0708','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0709','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0710','basket_line','Bluff Quonset 07','basket_line'),
  ('EQH0801','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0802','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0803','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0804','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0805','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0806','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0807','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0808','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0809','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0810','basket_line','Bluff Quonset 08','basket_line'),
  ('EQH0901','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0902','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0903','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0904','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0905','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0906','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0907','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0908','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0909','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH0910','basket_line','Bluff Quonset 09','basket_line'),
  ('EQH1001','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1002','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1003','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1004','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1005','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1006','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1007','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1008','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1009','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1010','basket_line','Bluff Quonset 10','basket_line'),
  ('EQH1101','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1102','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1103','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1104','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1105','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1106','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1107','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1108','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1109','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1110','basket_line','Bluff Quonset 11','basket_line'),
  ('EQH1201','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1202','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1203','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1204','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1205','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1206','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1207','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1208','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1209','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1210','basket_line','Bluff Quonset 12','basket_line'),
  ('EQH1301','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1302','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1303','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1304','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1305','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1306','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1307','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1308','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1309','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1310','basket_line','Bluff Quonset 13','basket_line'),
  ('EQH1401','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1402','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1403','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1404','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1405','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1406','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1407','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1408','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1409','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1410','basket_line','Bluff Quonset 14','basket_line'),
  ('EQH1501','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1502','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1503','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1504','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1505','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1506','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1507','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1508','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1509','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1510','basket_line','Bluff Quonset 15','basket_line'),
  ('EQH1601','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1602','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1603','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1604','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1605','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1606','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1607','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1608','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1609','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1610','basket_line','Bluff Quonset 16','basket_line'),
  ('EQH1701','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1702','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1703','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1704','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1705','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1706','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1707','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1708','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1709','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1710','basket_line','Bluff Quonset 17','basket_line'),
  ('EQH1801','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1802','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1803','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1804','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1805','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1806','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1807','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1808','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1809','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1810','basket_line','Bluff Quonset 18','basket_line'),
  ('EQH1901','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1902','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1903','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1904','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1905','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1906','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1907','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1908','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH1909','basket_line','Bluff Quonset 19','basket_line'),
  ('EQH2001','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2002','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2003','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2004','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2005','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2006','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2007','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2008','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2009','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2010','basket_line','Bluff Quonset 20','basket_line'),
  ('EQH2101','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2102','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2103','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2104','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2105','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2106','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2107','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2108','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2109','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2110','basket_line','Bluff Quonset 21','basket_line'),
  ('EQH2201','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2202','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2203','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2204','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2205','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2206','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2207','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2208','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2209','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2210','basket_line','Bluff Quonset 22','basket_line'),
  ('EQH2301','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2302','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2303','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2304','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2305','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2306','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2307','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2308','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2309','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2310','basket_line','Bluff Quonset 23','basket_line'),
  ('EQH2501','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2502','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2503','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2504','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2505','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2506','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2507','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2508','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2509','basket_line','Bluff Quonset 25','basket_line'),
  ('EQH2510','basket_line','Bluff Quonset 25','basket_line'),
  ('EQL0201','low_line','Bluff Quonset 02','low_line'),
  ('EQL0202','low_line','Bluff Quonset 02','low_line'),
  ('EQL0203','low_line','Bluff Quonset 02','low_line'),
  ('EQL0204','low_line','Bluff Quonset 02','low_line'),
  ('EQL0301','low_line','Bluff Quonset 03','low_line'),
  ('EQL0302','low_line','Bluff Quonset 03','low_line'),
  ('EQL0303','low_line','Bluff Quonset 03','low_line'),
  ('EQL0304','low_line','Bluff Quonset 03','low_line'),
  ('EQL0401','low_line','Bluff Quonset 04','low_line'),
  ('EQL0402','low_line','Bluff Quonset 04','low_line'),
  ('EQL0403','low_line','Bluff Quonset 04','low_line'),
  ('EQL0404','low_line','Bluff Quonset 04','low_line'),
  ('EQL0501','low_line','Bluff Quonset 05','low_line'),
  ('EQL0502','low_line','Bluff Quonset 05','low_line'),
  ('EQL0503','low_line','Bluff Quonset 05','low_line'),
  ('EQL0504','low_line','Bluff Quonset 05','low_line'),
  ('EQL0801','low_line','Bluff Quonset 08','low_line'),
  ('EQL0802','low_line','Bluff Quonset 08','low_line'),
  ('EQL0803','low_line','Bluff Quonset 08','low_line'),
  ('EQL0804','low_line','Bluff Quonset 08','low_line'),
  ('EQL0901','low_line','Bluff Quonset 09','low_line'),
  ('EQL0902','low_line','Bluff Quonset 09','low_line'),
  ('EQL0903','low_line','Bluff Quonset 09','low_line'),
  ('EQL0904','low_line','Bluff Quonset 09','low_line'),
  ('EQL1001','low_line','Bluff Quonset 10','low_line'),
  ('EQL1002','low_line','Bluff Quonset 10','low_line'),
  ('EQL1003','low_line','Bluff Quonset 10','low_line'),
  ('EQL1004','low_line','Bluff Quonset 10','low_line'),
  ('EQL1101','low_line','Bluff Quonset 11','low_line'),
  ('EQL1102','low_line','Bluff Quonset 11','low_line'),
  ('EQL1103','low_line','Bluff Quonset 11','low_line'),
  ('EQL1104','low_line','Bluff Quonset 11','low_line'),
  ('EQL1201','low_line','Bluff Quonset 12','low_line'),
  ('EQL1202','low_line','Bluff Quonset 12','low_line'),
  ('EQL1203','low_line','Bluff Quonset 12','low_line'),
  ('EQL1204','low_line','Bluff Quonset 12','low_line'),
  ('EQL1301','low_line','Bluff Quonset 13','low_line'),
  ('EQL1302','low_line','Bluff Quonset 13','low_line'),
  ('EQL1303','low_line','Bluff Quonset 13','low_line'),
  ('EQL1304','low_line','Bluff Quonset 13','low_line'),
  ('EQL1401','low_line','Bluff Quonset 14','low_line'),
  ('EQL1402','low_line','Bluff Quonset 14','low_line'),
  ('EQL1403','low_line','Bluff Quonset 14','low_line'),
  ('EQL1404','low_line','Bluff Quonset 14','low_line'),
  ('EQL1501','low_line','Bluff Quonset 15','low_line'),
  ('EQL1502','low_line','Bluff Quonset 15','low_line'),
  ('EQL1503','low_line','Bluff Quonset 15','low_line'),
  ('EQL1504','low_line','Bluff Quonset 15','low_line'),
  ('EQL1601','low_line','Bluff Quonset 16','low_line'),
  ('EQL1602','low_line','Bluff Quonset 16','low_line'),
  ('EQL1603','low_line','Bluff Quonset 16','low_line'),
  ('EQL1604','low_line','Bluff Quonset 16','low_line'),
  ('EQL1701','low_line','Bluff Quonset 17','low_line'),
  ('EQL1702','low_line','Bluff Quonset 17','low_line'),
  ('EQL1703','low_line','Bluff Quonset 17','low_line'),
  ('EQL1704','low_line','Bluff Quonset 17','low_line'),
  ('EQL1801','low_line','Bluff Quonset 18','low_line'),
  ('EQL1802','low_line','Bluff Quonset 18','low_line'),
  ('EQL1803','low_line','Bluff Quonset 18','low_line'),
  ('EQL1804','low_line','Bluff Quonset 18','low_line'),
  ('EQL1901','low_line','Bluff Quonset 19','low_line'),
  ('EQL1902','low_line','Bluff Quonset 19','low_line'),
  ('EQL1903','low_line','Bluff Quonset 19','low_line'),
  ('EQL1904','low_line','Bluff Quonset 19','low_line'),
  ('EQL2001','low_line','Bluff Quonset 20','low_line'),
  ('EQL2002','low_line','Bluff Quonset 20','low_line'),
  ('EQL2003','low_line','Bluff Quonset 20','low_line'),
  ('EQL2004','low_line','Bluff Quonset 20','low_line'),
  ('EQL2101','low_line','Bluff Quonset 21','low_line'),
  ('EQL2102','low_line','Bluff Quonset 21','low_line'),
  ('EQL2103','low_line','Bluff Quonset 21','low_line'),
  ('EQL2104','low_line','Bluff Quonset 21','low_line'),
  ('EQL2201','low_line','Bluff Quonset 22','low_line'),
  ('EQL2202','low_line','Bluff Quonset 22','low_line'),
  ('EQL2203','low_line','Bluff Quonset 22','low_line'),
  ('EQL2204','low_line','Bluff Quonset 22','low_line'),
  ('EQL2301','low_line','Bluff Quonset 23','low_line'),
  ('EQL2302','low_line','Bluff Quonset 23','low_line'),
  ('EQL2303','low_line','Bluff Quonset 23','low_line'),
  ('EQL2304','low_line','Bluff Quonset 23','low_line'),
  ('EQL2501','low_line','Bluff Quonset 25','low_line'),
  ('EQL2502','low_line','Bluff Quonset 25','low_line'),
  ('EQL2503','low_line','Bluff Quonset 25','low_line'),
  ('EQL2504','low_line','Bluff Quonset 25','low_line')
) v(c,t,z,zt)
where not exists (select 1 from benches b where b.code = v.c);

update benches set cap_overrides='{"basket":108,"hb_size":"10"}', bench_type='basket_line' where code='ASMH00';
update benches set cap_overrides='{"basket":58,"hb_size":"10"}', bench_type='basket_line' where code='ASMH100';
update benches set cap_overrides='{"basket":69,"hb_size":"10"}', bench_type='basket_line' where code='ASMH33';
update benches set cap_overrides='{"basket":68,"hb_size":"10"}', bench_type='basket_line' where code='ASMH34';
update benches set cap_overrides='{"basket":68,"hb_size":"10"}', bench_type='basket_line' where code='ASMH35';
update benches set cap_overrides='{"basket":70,"hb_size":"10"}', bench_type='basket_line' where code='ASMH36';
update benches set cap_overrides='{"basket":58,"hb_size":"10"}', bench_type='basket_line' where code='ASMH37';
update benches set cap_overrides='{"basket":61,"hb_size":"10"}', bench_type='basket_line' where code='ASMH38';
update benches set cap_overrides='{"basket":35,"hb_size":"10"}', bench_type='basket_line' where code='ASMH39';
update benches set cap_overrides='{"basket":30,"hb_size":"10"}', bench_type='basket_line' where code='ASMH40';
update benches set cap_overrides='{"basket":64,"hb_size":"10"}', bench_type='basket_line' where code='ASMH41';
update benches set cap_overrides='{"basket":63,"hb_size":"10"}', bench_type='basket_line' where code='ASMH42';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH43';
update benches set cap_overrides='{"basket":29,"hb_size":"8"}', bench_type='basket_line' where code='ASMH44';
update benches set cap_overrides='{"basket":30,"hb_size":"8"}', bench_type='basket_line' where code='ASMH45';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH46';
update benches set cap_overrides='{"basket":22,"hb_size":"8"}', bench_type='basket_line' where code='ASMH47';
update benches set cap_overrides='{"basket":26,"hb_size":"8"}', bench_type='basket_line' where code='ASMH48';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH49';
update benches set cap_overrides='{"basket":26,"hb_size":"8"}', bench_type='basket_line' where code='ASMH50';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH51';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH52';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH53';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH54';
update benches set cap_overrides='{"basket":29,"hb_size":"8"}', bench_type='basket_line' where code='ASMH55';
update benches set cap_overrides='{"basket":28,"hb_size":"8"}', bench_type='basket_line' where code='ASMH56';
update benches set cap_overrides='{"basket":88,"hb_size":"8"}', bench_type='basket_line' where code='ASMH57';
update benches set cap_overrides='{"basket":88,"hb_size":"8"}', bench_type='basket_line' where code='ASMH58';
update benches set cap_overrides='{"basket":96,"hb_size":"8"}', bench_type='basket_line' where code='ASMH59';
update benches set cap_overrides='{"basket":104,"hb_size":"8"}', bench_type='basket_line' where code='ASMH60';
update benches set cap_overrides='{"basket":90,"hb_size":"8"}', bench_type='basket_line' where code='ASMH61';
update benches set cap_overrides='{"basket":108,"hb_size":"8"}', bench_type='basket_line' where code='ASMH62';
update benches set cap_overrides='{"basket":98,"hb_size":"8"}', bench_type='basket_line' where code='ASMH63';
update benches set cap_overrides='{"basket":90,"hb_size":"8"}', bench_type='basket_line' where code='ASMH64';
update benches set cap_overrides='{"basket":84,"hb_size":"8"}', bench_type='basket_line' where code='ASMH65';
update benches set cap_overrides='{"basket":98,"hb_size":"8"}', bench_type='basket_line' where code='ASMH66';
update benches set cap_overrides='{"basket":88,"hb_size":"8"}', bench_type='basket_line' where code='ASMH67';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH68';
update benches set cap_overrides='{"basket":51,"hb_size":"10"}', bench_type='basket_line' where code='ASMH69';
update benches set cap_overrides='{"basket":49,"hb_size":"10"}', bench_type='basket_line' where code='ASMH70';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='ASMH71';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='ASMH72';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='ASMH73';
update benches set cap_overrides='{"basket":51,"hb_size":"10"}', bench_type='basket_line' where code='ASMH74';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH75';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='ASMH76';
update benches set cap_overrides='{"basket":57,"hb_size":"10"}', bench_type='basket_line' where code='ASMH77';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH78';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='ASMH79';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='ASMH80';
update benches set cap_overrides='{"basket":53,"hb_size":"10"}', bench_type='basket_line' where code='ASMH81';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH82';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH83';
update benches set cap_overrides='{"basket":53,"hb_size":"10"}', bench_type='basket_line' where code='ASMH84';
update benches set cap_overrides='{"basket":51,"hb_size":"10"}', bench_type='basket_line' where code='ASMH85';
update benches set cap_overrides='{"basket":52,"hb_size":"10"}', bench_type='basket_line' where code='ASMH86';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='ASMH87';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='ASMH88';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='ASMH89';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='ASMH90';
update benches set cap_overrides='{"basket":55,"hb_size":"10"}', bench_type='basket_line' where code='ASMH91';
update benches set cap_overrides='{"basket":55,"hb_size":"10"}', bench_type='basket_line' where code='ASMH92';
update benches set cap_overrides='{"basket":56,"hb_size":"10"}', bench_type='basket_line' where code='ASMH93';
update benches set cap_overrides='{"basket":53,"hb_size":"10"}', bench_type='basket_line' where code='ASMH94';
update benches set cap_overrides='{"basket":49,"hb_size":"10"}', bench_type='basket_line' where code='ASMH95';
update benches set cap_overrides='{"basket":51,"hb_size":"10"}', bench_type='basket_line' where code='ASMH96';
update benches set cap_overrides='{"basket":51,"hb_size":"10"}', bench_type='basket_line' where code='ASMH97';
update benches set cap_overrides='{"basket":59,"hb_size":"10"}', bench_type='basket_line' where code='ASMH98';
update benches set cap_overrides='{"basket":57,"hb_size":"10"}', bench_type='basket_line' where code='ASMH99';
update benches set cap_overrides='{"basket":129,"hb_size":"10"}', bench_type='basket_line' where code='DBMH01';
update benches set cap_overrides='{"basket":128,"hb_size":"10"}', bench_type='basket_line' where code='DBMH02';
update benches set cap_overrides='{"basket":120,"hb_size":"10"}', bench_type='basket_line' where code='DBMH03';
update benches set cap_overrides='{"basket":127,"hb_size":"10"}', bench_type='basket_line' where code='DBMH04';
update benches set cap_overrides='{"basket":112,"hb_size":"10"}', bench_type='basket_line' where code='DBMH05';
update benches set cap_overrides='{"basket":131,"hb_size":"10"}', bench_type='basket_line' where code='DBMH06';
update benches set cap_overrides='{"basket":118,"hb_size":"10"}', bench_type='basket_line' where code='DBMH07';
update benches set cap_overrides='{"basket":234,"hb_size":"10"}', bench_type='basket_line' where code='DBMH08';
update benches set cap_overrides='{"basket":114,"hb_size":"10"}', bench_type='basket_line' where code='DBMH09';
update benches set cap_overrides='{"basket":131,"hb_size":"10"}', bench_type='basket_line' where code='DBMH10';
update benches set cap_overrides='{"basket":119,"hb_size":"10"}', bench_type='basket_line' where code='DBMH11';
update benches set cap_overrides='{"basket":112,"hb_size":"10"}', bench_type='basket_line' where code='DBMH12';
update benches set cap_overrides='{"basket":130,"hb_size":"10"}', bench_type='basket_line' where code='DBMH13';
update benches set cap_overrides='{"basket":134,"hb_size":"10"}', bench_type='basket_line' where code='DBMH14';
update benches set cap_overrides='{"basket":131,"hb_size":"10"}', bench_type='basket_line' where code='DBMH15';
update benches set cap_overrides='{"basket":113,"hb_size":"10"}', bench_type='basket_line' where code='DBMH16';
update benches set cap_overrides='{"basket":116,"hb_size":"10"}', bench_type='basket_line' where code='DBMH17';
update benches set cap_overrides='{"basket":116,"hb_size":"10"}', bench_type='basket_line' where code='DBMH18';
update benches set cap_overrides='{"basket":250,"hb_size":"10"}', bench_type='basket_line' where code='DBMH19';
update benches set cap_overrides='{"basket":351,"hb_size":"10"}', bench_type='basket_line' where code='DBMH20';
update benches set cap_overrides='{"basket":247,"hb_size":"10"}', bench_type='basket_line' where code='DBMH21';
update benches set cap_overrides='{"basket":131,"hb_size":"10"}', bench_type='basket_line' where code='DBMH22';
update benches set cap_overrides='{"basket":137,"hb_size":"10"}', bench_type='basket_line' where code='DBMH23';
update benches set cap_overrides='{"basket":131,"hb_size":"10"}', bench_type='basket_line' where code='DBMH24';
update benches set cap_overrides='{"basket":110,"hb_size":"10"}', bench_type='basket_line' where code='DBMH25';
update benches set cap_overrides='{"basket":111,"hb_size":"10"}', bench_type='basket_line' where code='DBMH26';
update benches set cap_overrides='{"basket":111,"hb_size":"10"}', bench_type='basket_line' where code='DBMH27';
update benches set cap_overrides='{"basket":124,"hb_size":"10"}', bench_type='basket_line' where code='DBMH28';
update benches set cap_overrides='{"basket":114,"hb_size":"10"}', bench_type='basket_line' where code='DBMH29';
update benches set cap_overrides='{"basket":114,"hb_size":"10"}', bench_type='basket_line' where code='DBMH30';
update benches set cap_overrides='{"basket":133,"hb_size":"10"}', bench_type='basket_line' where code='DBMH31';
update benches set cap_overrides='{"basket":128,"hb_size":"10"}', bench_type='basket_line' where code='DBMH32';
update benches set cap_overrides='{"basket":128,"hb_size":"10"}', bench_type='basket_line' where code='DBMH33';
update benches set cap_overrides='{"basket":115,"hb_size":"10"}', bench_type='basket_line' where code='DBMH34';
update benches set cap_overrides='{"basket":113,"hb_size":"10"}', bench_type='basket_line' where code='DBMH35';
update benches set cap_overrides='{"basket":130,"hb_size":"10"}', bench_type='basket_line' where code='DBMH36';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML01';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML03';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML04';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML06';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML09';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML10';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML11';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML13';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML14';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML16';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML17';
update benches set cap_overrides='{"basket":66,"hb_size":"14"}', bench_type='low_line' where code='DBML18';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH0201';
update benches set cap_overrides='{"basket":21,"hb_size":"16"}', bench_type='basket_line' where code='EQH0202';
update benches set cap_overrides='{"basket":18,"hb_size":"16"}', bench_type='basket_line' where code='EQH0203';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH0204';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH0205';
update benches set cap_overrides='{"basket":21,"hb_size":"16"}', bench_type='basket_line' where code='EQH0206';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH0207';
update benches set cap_overrides='{"basket":18,"hb_size":"16"}', bench_type='basket_line' where code='EQH0208';
update benches set cap_overrides='{"basket":20,"hb_size":"16"}', bench_type='basket_line' where code='EQH0209';
update benches set cap_overrides='{"basket":21,"hb_size":"16"}', bench_type='basket_line' where code='EQH0210';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0301';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH0302';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH0303';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='EQH0304';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='EQH0305';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='EQH0306';
update benches set cap_overrides='{"basket":50,"hb_size":"10"}', bench_type='basket_line' where code='EQH0307';
update benches set cap_overrides='{"basket":43,"hb_size":"10"}', bench_type='basket_line' where code='EQH0308';
update benches set cap_overrides='{"basket":39,"hb_size":"10"}', bench_type='basket_line' where code='EQH0309';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0310';
update benches set cap_overrides='{"basket":20,"hb_size":"16"}', bench_type='basket_line' where code='EQH0401';
update benches set cap_overrides='{"basket":19,"hb_size":"16"}', bench_type='basket_line' where code='EQH0402';
update benches set cap_overrides='{"basket":20,"hb_size":"16"}', bench_type='basket_line' where code='EQH0403';
update benches set cap_overrides='{"basket":25,"hb_size":"16"}', bench_type='basket_line' where code='EQH0404';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH0405';
update benches set cap_overrides='{"basket":25,"hb_size":"16"}', bench_type='basket_line' where code='EQH0406';
update benches set cap_overrides='{"basket":27,"hb_size":"16"}', bench_type='basket_line' where code='EQH0407';
update benches set cap_overrides='{"basket":20,"hb_size":"16"}', bench_type='basket_line' where code='EQH0408';
update benches set cap_overrides='{"basket":20,"hb_size":"16"}', bench_type='basket_line' where code='EQH0409';
update benches set cap_overrides='{"basket":24,"hb_size":"16"}', bench_type='basket_line' where code='EQH0410';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0501';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH0502';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH0503';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH0504';
update benches set cap_overrides='{"basket":43,"hb_size":"10"}', bench_type='basket_line' where code='EQH0505';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH0506';
update benches set cap_overrides='{"basket":41,"hb_size":"10"}', bench_type='basket_line' where code='EQH0507';
update benches set cap_overrides='{"basket":41,"hb_size":"10"}', bench_type='basket_line' where code='EQH0508';
update benches set cap_overrides='{"basket":41,"hb_size":"10"}', bench_type='basket_line' where code='EQH0509';
update benches set cap_overrides='{"basket":41,"hb_size":"10"}', bench_type='basket_line' where code='EQH0510';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH0601';
update benches set cap_overrides='{"basket":25,"hb_size":"14"}', bench_type='basket_line' where code='EQH0602';
update benches set cap_overrides='{"basket":24,"hb_size":"14"}', bench_type='basket_line' where code='EQH0603';
update benches set cap_overrides='{"basket":25,"hb_size":"14"}', bench_type='basket_line' where code='EQH0604';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0605';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0606';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0607';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0608';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0609';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH0610';
update benches set cap_overrides='{"basket":35,"hb_size":"14"}', bench_type='basket_line' where code='EQH0701';
update benches set cap_overrides='{"basket":35,"hb_size":"14"}', bench_type='basket_line' where code='EQH0702';
update benches set cap_overrides='{"basket":35,"hb_size":"14"}', bench_type='basket_line' where code='EQH0703';
update benches set cap_overrides='{"basket":35,"hb_size":"14"}', bench_type='basket_line' where code='EQH0704';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH0705';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH0706';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH0707';
update benches set cap_overrides='{"basket":26,"hb_size":"14"}', bench_type='basket_line' where code='EQH0708';
update benches set cap_overrides='{"basket":29,"hb_size":"14"}', bench_type='basket_line' where code='EQH0709';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH0710';
update benches set cap_overrides='{"basket":27,"hb_size":"16"}', bench_type='basket_line' where code='EQH0801';
update benches set cap_overrides='{"basket":25,"hb_size":"16"}', bench_type='basket_line' where code='EQH0802';
update benches set cap_overrides='{"basket":21,"hb_size":"16"}', bench_type='basket_line' where code='EQH0803';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH0804';
update benches set cap_overrides='{"basket":27,"hb_size":"16"}', bench_type='basket_line' where code='EQH0805';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH0806';
update benches set cap_overrides='{"basket":27,"hb_size":"16"}', bench_type='basket_line' where code='EQH0807';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH0808';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH0809';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH0810';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH0901';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH0902';
update benches set cap_overrides='{"basket":36,"hb_size":"10"}', bench_type='basket_line' where code='EQH0903';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH0904';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0905';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0906';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH0907';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH0908';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH0909';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH0910';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH1001';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH1002';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1003';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH1004';
update benches set cap_overrides='{"basket":25,"hb_size":"16"}', bench_type='basket_line' where code='EQH1005';
update benches set cap_overrides='{"basket":25,"hb_size":"16"}', bench_type='basket_line' where code='EQH1006';
update benches set cap_overrides='{"basket":28,"hb_size":"16"}', bench_type='basket_line' where code='EQH1007';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1008';
update benches set cap_overrides='{"basket":24,"hb_size":"16"}', bench_type='basket_line' where code='EQH1009';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH1010';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1101';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1102';
update benches set cap_overrides='{"basket":39,"hb_size":"10"}', bench_type='basket_line' where code='EQH1103';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1104';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1105';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1106';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1107';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH1108';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1109';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1110';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1201';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1202';
update benches set cap_overrides='{"basket":19,"hb_size":"16"}', bench_type='basket_line' where code='EQH1203';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH1204';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1205';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1206';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH1207';
update benches set cap_overrides='{"basket":18,"hb_size":"16"}', bench_type='basket_line' where code='EQH1208';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH1209';
update benches set cap_overrides='{"basket":24,"hb_size":"16"}', bench_type='basket_line' where code='EQH1210';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1301';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1302';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH1303';
update benches set cap_overrides='{"basket":42,"hb_size":"10"}', bench_type='basket_line' where code='EQH1304';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1305';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1306';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1307';
update benches set cap_overrides='{"basket":40,"hb_size":"10"}', bench_type='basket_line' where code='EQH1308';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1309';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1310';
update benches set cap_overrides='{"basket":47,"hb_size":"14"}', bench_type='basket_line' where code='EQH1401';
update benches set cap_overrides='{"basket":40,"hb_size":"14"}', bench_type='basket_line' where code='EQH1402';
update benches set cap_overrides='{"basket":40,"hb_size":"14"}', bench_type='basket_line' where code='EQH1403';
update benches set cap_overrides='{"basket":44,"hb_size":"14"}', bench_type='basket_line' where code='EQH1404';
update benches set cap_overrides='{"basket":42,"hb_size":"14"}', bench_type='basket_line' where code='EQH1405';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH1406';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH1407';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH1408';
update benches set cap_overrides='{"basket":60,"hb_size":"14"}', bench_type='basket_line' where code='EQH1409';
update benches set cap_overrides='{"basket":72,"hb_size":"14"}', bench_type='basket_line' where code='EQH1410';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1501';
update benches set cap_overrides='{"basket":43,"hb_size":"10"}', bench_type='basket_line' where code='EQH1502';
update benches set cap_overrides='{"basket":40,"hb_size":"10"}', bench_type='basket_line' where code='EQH1503';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1504';
update benches set cap_overrides='{"basket":49,"hb_size":"10"}', bench_type='basket_line' where code='EQH1505';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1506';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1507';
update benches set cap_overrides='{"basket":39,"hb_size":"10"}', bench_type='basket_line' where code='EQH1508';
update benches set cap_overrides='{"basket":40,"hb_size":"10"}', bench_type='basket_line' where code='EQH1509';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1510';
update benches set cap_overrides='{"basket":31,"hb_size":"16"}', bench_type='basket_line' where code='EQH1601';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH1602';
update benches set cap_overrides='{"basket":23,"hb_size":"16"}', bench_type='basket_line' where code='EQH1603';
update benches set cap_overrides='{"basket":26,"hb_size":"16"}', bench_type='basket_line' where code='EQH1604';
update benches set cap_overrides='{"basket":21,"hb_size":"16"}', bench_type='basket_line' where code='EQH1605';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1606';
update benches set cap_overrides='{"basket":22,"hb_size":"16"}', bench_type='basket_line' where code='EQH1607';
update benches set cap_overrides='{"basket":18,"hb_size":"16"}', bench_type='basket_line' where code='EQH1608';
update benches set cap_overrides='{"basket":17,"hb_size":"16"}', bench_type='basket_line' where code='EQH1609';
update benches set cap_overrides='{"basket":24,"hb_size":"16"}', bench_type='basket_line' where code='EQH1610';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1701';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1702';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1703';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1704';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1705';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1706';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1707';
update benches set cap_overrides='{"basket":39,"hb_size":"10"}', bench_type='basket_line' where code='EQH1708';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1709';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1710';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH1801';
update benches set cap_overrides='{"basket":27,"hb_size":"14"}', bench_type='basket_line' where code='EQH1802';
update benches set cap_overrides='{"basket":25,"hb_size":"14"}', bench_type='basket_line' where code='EQH1803';
update benches set cap_overrides='{"basket":26,"hb_size":"14"}', bench_type='basket_line' where code='EQH1804';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH1805';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH1806';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH1807';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH1808';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH1809';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH1810';
update benches set cap_overrides='{"basket":48,"hb_size":"10"}', bench_type='basket_line' where code='EQH1901';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH1902';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1903';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1904';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1905';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH1906';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH1907';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH1908';
update benches set cap_overrides='{"basket":47,"hb_size":"10"}', bench_type='basket_line' where code='EQH1909';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH2001';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2002';
update benches set cap_overrides='{"basket":27,"hb_size":"14"}', bench_type='basket_line' where code='EQH2003';
update benches set cap_overrides='{"basket":28,"hb_size":"14"}', bench_type='basket_line' where code='EQH2004';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH2005';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2006';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH2007';
update benches set cap_overrides='{"basket":22,"hb_size":"14"}', bench_type='basket_line' where code='EQH2008';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2009';
update benches set cap_overrides='{"basket":31,"hb_size":"14"}', bench_type='basket_line' where code='EQH2010';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2101';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH2102';
update benches set cap_overrides='{"basket":34,"hb_size":"10"}', bench_type='basket_line' where code='EQH2103';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2104';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2105';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2106';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2107';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH2108';
update benches set cap_overrides='{"basket":43,"hb_size":"10"}', bench_type='basket_line' where code='EQH2109';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH2110';
update benches set cap_overrides='{"basket":35,"hb_size":"14"}', bench_type='basket_line' where code='EQH2201';
update benches set cap_overrides='{"basket":29,"hb_size":"14"}', bench_type='basket_line' where code='EQH2202';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2203';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2204';
update benches set cap_overrides='{"basket":32,"hb_size":"14"}', bench_type='basket_line' where code='EQH2205';
update benches set cap_overrides='{"basket":33,"hb_size":"14"}', bench_type='basket_line' where code='EQH2206';
update benches set cap_overrides='{"basket":34,"hb_size":"14"}', bench_type='basket_line' where code='EQH2207';
update benches set cap_overrides='{"basket":30,"hb_size":"14"}', bench_type='basket_line' where code='EQH2208';
update benches set cap_overrides='{"basket":28,"hb_size":"14"}', bench_type='basket_line' where code='EQH2209';
update benches set cap_overrides='{"basket":36,"hb_size":"14"}', bench_type='basket_line' where code='EQH2210';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2301';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2302';
update benches set cap_overrides='{"basket":36,"hb_size":"10"}', bench_type='basket_line' where code='EQH2303';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2304';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2305';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2306';
update benches set cap_overrides='{"basket":43,"hb_size":"10"}', bench_type='basket_line' where code='EQH2307';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH2308';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2309';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2310';
update benches set cap_overrides='{"basket":40,"hb_size":"10"}', bench_type='basket_line' where code='EQH2501';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH2502';
update benches set cap_overrides='{"basket":35,"hb_size":"10"}', bench_type='basket_line' where code='EQH2503';
update benches set cap_overrides='{"basket":45,"hb_size":"10"}', bench_type='basket_line' where code='EQH2504';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2505';
update benches set cap_overrides='{"basket":46,"hb_size":"10"}', bench_type='basket_line' where code='EQH2506';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2507';
update benches set cap_overrides='{"basket":38,"hb_size":"10"}', bench_type='basket_line' where code='EQH2508';
update benches set cap_overrides='{"basket":42,"hb_size":"10"}', bench_type='basket_line' where code='EQH2509';
update benches set cap_overrides='{"basket":44,"hb_size":"10"}', bench_type='basket_line' where code='EQH2510';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0201';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0202';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0203';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0204';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0301';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0302';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0303';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0304';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0401';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0402';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0403';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0404';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0501';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0502';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0503';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL0504';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0801';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0802';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0803';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL0804';
update benches set cap_overrides='{"basket":29,"hb_size":"11"}', bench_type='low_line' where code='EQL0901';
update benches set cap_overrides='{"basket":31,"hb_size":"11"}', bench_type='low_line' where code='EQL0902';
update benches set cap_overrides='{"basket":29,"hb_size":"11"}', bench_type='low_line' where code='EQL0903';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL0904';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1001';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1002';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1003';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1004';
update benches set cap_overrides='{"basket":29,"hb_size":"11"}', bench_type='low_line' where code='EQL1101';
update benches set cap_overrides='{"basket":29,"hb_size":"11"}', bench_type='low_line' where code='EQL1102';
update benches set cap_overrides='{"basket":29,"hb_size":"11"}', bench_type='low_line' where code='EQL1103';
update benches set cap_overrides='{"basket":28,"hb_size":"11"}', bench_type='low_line' where code='EQL1104';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1201';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1202';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1203';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1204';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1301';
update benches set cap_overrides='{"basket":31,"hb_size":"11"}', bench_type='low_line' where code='EQL1302';
update benches set cap_overrides='{"basket":31,"hb_size":"11"}', bench_type='low_line' where code='EQL1303';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1304';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1401';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1402';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1403';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1404';
update benches set cap_overrides='{"basket":31,"hb_size":"11"}', bench_type='low_line' where code='EQL1501';
update benches set cap_overrides='{"basket":31,"hb_size":"11"}', bench_type='low_line' where code='EQL1502';
update benches set cap_overrides='{"basket":33,"hb_size":"11"}', bench_type='low_line' where code='EQL1503';
update benches set cap_overrides='{"basket":33,"hb_size":"11"}', bench_type='low_line' where code='EQL1504';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1601';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1602';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1603';
update benches set cap_overrides='{"basket":27,"hb_size":"11"}', bench_type='low_line' where code='EQL1604';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1701';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1702';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1703';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1704';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL1801';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL1802';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL1803';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL1804';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1901';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1902';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1903';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL1904';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL2001';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL2002';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL2003';
update benches set cap_overrides='{"basket":26,"hb_size":"11"}', bench_type='low_line' where code='EQL2004';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2101';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2102';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2103';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2104';
update benches set cap_overrides='{"basket":22,"hb_size":"11"}', bench_type='low_line' where code='EQL2201';
update benches set cap_overrides='{"basket":22,"hb_size":"11"}', bench_type='low_line' where code='EQL2202';
update benches set cap_overrides='{"basket":22,"hb_size":"11"}', bench_type='low_line' where code='EQL2203';
update benches set cap_overrides='{"basket":22,"hb_size":"11"}', bench_type='low_line' where code='EQL2204';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2301';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2302';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2303';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2304';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2501';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2502';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2503';
update benches set cap_overrides='{"basket":30,"hb_size":"11"}', bench_type='low_line' where code='EQL2504';
