-- Merge duplicate variety_library rows — same plant, different spellings.
-- Keeper = most plan rows, then proper casing, then has culture data.
-- 'Improved' variants are NOT merged (a different genetic selection):
--   Cabaret Yellow  |  Cabaret Yellow Improved
--   Compact Lilac  |  Compact Lilac Imp
--
-- production_items has a unique (plan_id, variety_id, container_id), so a merge
-- can collide there. Colliding loser items are folded into the keeper's item —
-- scheduled_crops repointed, then profile + groups + item removed — before the
-- remaining items simply change variety_id.

begin;

create temp table vmerge(keep uuid, lose uuid, label text) on commit drop;
insert into vmerge values
  ('024a80dc-9a3c-4a0a-b2fa-376195bbdf59'::uuid, '3be07e20-0552-465d-aeae-2c0659b03902'::uuid, 'Pansy: PANSY DELTA PRO CLEAR RED <- Delta Pro Red Clear'),
  ('94c109b8-3431-45f1-b9dc-1d9e2ed219c1'::uuid, 'd4fc0ef0-2b5a-47fc-b868-412a45d1d277'::uuid, 'Verbena: Blues Purple Eye <- Blues Purple+Eye'),
  ('c14f3b63-0893-4f8a-8df7-2c6d4f43f3e6'::uuid, '014b7ca2-8227-437b-b3e0-8852a9a0a529'::uuid, 'Ageratum: Monarch Magic <- AGERATUM MONARCH MAGIC'),
  ('032b3cff-7346-41e5-89b7-43d0cfe7f383'::uuid, '686578c5-8afa-47ab-86d7-5f6cab4dd4e8'::uuid, 'Bracteantha: BRACTEANTHA SUNBRERO YELLOW <- Sunbrero Yellow'),
  ('c8334b5a-0217-49f3-8a7a-c3901ba28770'::uuid, 'c5f20db4-1ec3-4080-8a8e-75234d8cdfd6'::uuid, 'Bracteantha: BRACTEANTHA SUNBRERO ORANGE <- Sunbrero Orange'),
  ('f7525fff-29bd-42c2-bf02-ac242b0b0b62'::uuid, '4619f44f-0bb3-4ced-b15e-ba6e052b731b'::uuid, 'Pennisetum: PURPLE FOUNTAIN GRASS <- Purple Fountain Grass'),
  ('09ce20a5-29ee-421f-b64a-ea53708d66c9'::uuid, '9c300fac-23d7-40f2-a4a2-9aec56cadb30'::uuid, 'Pansy: PANSY DELTA PRO CLEAR VIOLET <- Delta Pro Violet Clear'),
  ('efc7e072-8f3b-4de5-9314-f8d2f2941739'::uuid, '4ac7ed7e-d051-4a56-aec6-f561b95027a1'::uuid, 'Pansy: PANSY DELTA PRO YELLOW WITH BLOTCH <- Delta Pro Yellow Blotch'),
  ('7b3af83d-e828-4322-a61c-e54e7cb5b4bd'::uuid, '2b028f6f-e041-41a5-996e-5b6904968acf'::uuid, 'Verbena: Blues Magenta Eye <- Blues Magenta+eye'),
  ('b183217c-ddef-4763-96d6-75641d273c26'::uuid, '27dde365-048e-40fa-932f-58f05018c866'::uuid, 'Sunpatiens: Compact Pink Blush <- Compact Blush Pink'),
  ('757a93f8-147e-4bbc-a9ea-a4a4dec36cd7'::uuid, '810cbed1-3361-4084-82a2-80d4e0b3696f'::uuid, 'Dahlia: Dalaya Yellow+Red Eye <- Dalaya Red+Yellow Eye');

create table if not exists variety_library_merge_backup_20260722 as select * from variety_library where false;
insert into variety_library_merge_backup_20260722
  select v.* from variety_library v join vmerge m on m.lose = v.id;

-- 1. fold colliding production_items into the keeper's equivalent
update scheduled_crops sc set production_item_id = keeper.id
from production_items loser join vmerge m on m.lose = loser.variety_id
join production_items keeper on keeper.plan_id = loser.plan_id
  and keeper.container_id is not distinct from loser.container_id
  and keeper.variety_id = m.keep
where sc.production_item_id = loser.id;

delete from product_profiles pp using production_items loser, vmerge m, production_items keeper
where pp.production_item_id = loser.id and m.lose = loser.variety_id
  and keeper.plan_id = loser.plan_id and keeper.container_id is not distinct from loser.container_id
  and keeper.variety_id = m.keep;

delete from production_item_groups g using production_items loser, vmerge m, production_items keeper
where g.production_item_id = loser.id and m.lose = loser.variety_id
  and keeper.plan_id = loser.plan_id and keeper.container_id is not distinct from loser.container_id
  and keeper.variety_id = m.keep;

delete from production_items loser using vmerge m, production_items keeper
where m.lose = loser.variety_id
  and keeper.plan_id = loser.plan_id and keeper.container_id is not distinct from loser.container_id
  and keeper.variety_id = m.keep;

-- 2. anything left just changes variety
update production_items pi set variety_id = m.keep from vmerge m where pi.variety_id = m.lose;
update scheduled_crops sc set variety_id = m.keep from vmerge m where sc.variety_id = m.lose;
update variety_observations o set variety_id = m.keep from vmerge m where o.variety_id = m.lose;
update crop_pricing c set variety_id = m.keep from vmerge m where c.variety_id = m.lose;
update purchase_order_lines l set variety_id = m.keep from vmerge m where l.variety_id = m.lose;

delete from variety_library v using vmerge m where v.id = m.lose;

commit;

-- Rollback: re-insert from variety_library_merge_backup_20260722 (references stay
-- pointed at the keeper — a merge is not automatically reversible).
