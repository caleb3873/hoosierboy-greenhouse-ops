-- Second wave of dupes exposed by key regeneration: doubled-name data entry
-- ("Bluerific BLUERIFIC" = "Bluerific"). Fold into the clean-name keepers.
-- Keepers have no production_items, so the dupes' items repoint without collisions.

update scheduled_crops set variety_id = 'ff418df4-c8ce-4ce3-a1db-3edf6553e052'
 where variety_id = '13cd5ad4-5ba0-4a77-b64d-5b99b45d74c2';
update production_items set variety_id = 'ff418df4-c8ce-4ce3-a1db-3edf6553e052'
 where variety_id = '13cd5ad4-5ba0-4a77-b64d-5b99b45d74c2';

update scheduled_crops set variety_id = 'c35876a6-8813-4b1c-aedc-b426fdf87d43'
 where variety_id = 'ae409fd0-42ec-4bd5-a917-57e964a937c9';
update production_items set variety_id = 'c35876a6-8813-4b1c-aedc-b426fdf87d43'
 where variety_id = 'ae409fd0-42ec-4bd5-a917-57e964a937c9';

delete from variety_library where id in ('13cd5ad4-5ba0-4a77-b64d-5b99b45d74c2','ae409fd0-42ec-4bd5-a917-57e964a937c9');
update variety_library set notes = trim(coalesce(notes,'') || ' | merged doubled-name dupe "Bluerific BLUERIFIC" 2026-07-22')
 where id = 'ff418df4-c8ce-4ce3-a1db-3edf6553e052';
update variety_library set notes = trim(coalesce(notes,'') || ' | merged doubled-name dupe "Pinkceptional PINKCEPTIONAL" 2026-07-22')
 where id = 'c35876a6-8813-4b1c-aedc-b426fdf87d43';
