-- Spacing guidelines lookup: pot size × bench width → pattern + along-length pitch. Source of truth
-- growers read from, and used to prefill the bench-by-bench view. across = pots across the bench
-- width; along_in = the "every N inches" down the length (every_board = placed at each board instead).
create table if not exists spacing_guidelines (
  id         bigint generated always as identity primary key,
  pot_key    text not null,     -- '5', '6.5', '7', '8.5', '8 Bloom', '10 Bloom'
  pot_dia    numeric,           -- diameter for matching containers (null for bloom pots until confirmed)
  bench_ft   numeric not null,  -- bench WIDTH in feet (4/6/8)
  pattern    text,              -- as the crew says it, e.g. '3x3', '2x1', '4x3', '1x1'
  across     integer,           -- pots across the width
  along_in   numeric,           -- inches between rows down the length (null when every_board)
  every_board boolean default false,
  edge_measure boolean default false, -- measured from edge of pot rather than center
  note       text
);
alter table spacing_guidelines enable row level security;
drop policy if exists "allow all spacing_guidelines" on spacing_guidelines;
create policy "allow all spacing_guidelines" on spacing_guidelines for all to public using (true) with check (true);
delete from spacing_guidelines;
insert into spacing_guidelines (pot_key,pot_dia,bench_ft,pattern,across,along_in,every_board,edge_measure,note) values
 ('5',5,4,'3x3',3,null,true,false,null),
 ('6.5',6.5,4,'2x1',2,null,true,false,null),
 ('6.5',6.5,6,'3x3',3,9,false,true,'from edge of pot'),
 ('6.5',6.5,8,'4x3',4,null,true,false,null),
 ('7',7,4,'2x2',2,17,false,false,null),
 ('8.5',8.5,4,'2x2',2,26,false,false,null),
 ('8.5',8.5,6,'2x2',2,17,false,false,null),
 ('8 Bloom',null,4,'1x1',1,20,false,false,null),
 ('8 Bloom',null,6,'1x1',1,12,false,false,null),
 ('10 Bloom',null,4,'1x1',1,30,false,false,null);
