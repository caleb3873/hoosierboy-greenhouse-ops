-- Tube position by pot size (inches from the edge, per 4' section). All sizes = 23" except 6.5" = 27";
-- 5.5" still unknown. An 8' bench = two 4' sections, so it gets one tube per section (2 tubes).
alter table spacing_guidelines add column if not exists tube_pos numeric;
update spacing_guidelines set tube_pos=27 where pot_key='6.5';
update spacing_guidelines set tube_pos=23 where pot_key in ('7.5','8.5','8 Bloom','10 Bloom');
-- 5.5" left null (pending)
