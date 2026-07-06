-- Reference existing program containers (no invented sizes): "5"/"7" are the .5" pots; blooms map to
-- the poinsettia pots that exist (8 Bloom = 10", 10 Bloom = 13" Patio). All spacing is edge-to-edge.
update spacing_guidelines set pot_dia=5.5, pot_key='5.5' where pot_key='5';
update spacing_guidelines set pot_dia=7.5, pot_key='7.5' where pot_key='7';
update spacing_guidelines set pot_dia=10 where pot_key='8 Bloom';
update spacing_guidelines set pot_dia=13 where pot_key='10 Bloom';
update spacing_guidelines set edge_measure=true where along_in is not null;
