-- Pre-fill chem_products.rei_hours from label reference values.
--
-- IMPORTANT: these are reference values, NOT a substitute for the label. Rows
-- marked uncertain below were ROUNDED UP (longer re-entry) where the label was
-- ambiguous — an error in that direction keeps people out too long rather than
-- letting them in too early. The head grower should confirm each against the
-- current label; every row carries a note saying so.
--
-- Until this runs, the REI push alerts and re-entry banner stay silent, because
-- rei_hours is null on every product.

update chem_products c set
  rei_hours = v.h,
  notes = replace(coalesce(c.notes, ''), 'VERIFY REI + EPA from current label', 'VERIFY EPA # from current label')
          || case when v.uncertain
               then ' · REI ' || v.h || 'h pre-filled from label reference, ROUNDED UP where the label was ambiguous — CONFIRM before relying on it'
               else ' · REI ' || v.h || 'h pre-filled from label reference — confirm against your current label' end
from (values
  -- 4 hours — biologicals, botanicals, reduced-risk chemistry
  ('Ancora', 4, false), ('Azatin O', 4, false), ('BotaniGard 22WP', 4, false),
  ('Botanigard ES', 4, false), ('Captiva', 4, true), ('Conserve', 4, false),
  ('LALGUARDM52', 4, false), ('LalStim OSMO', 4, true), ('Mainspring GNL', 4, false),
  ('Molt-X', 4, false), ('Nemasys', 4, false), ('NOFLY WP', 4, false),
  ('Obtego', 4, false), ('Regalia', 4, false), ('Stargus', 4, false),
  ('Triathlon BA', 4, false), ('Velifer', 4, true), ('Venerate XC', 4, false),
  -- 12 hours — the WPS-default majority
  ('3336 F', 12, false), ('Altus', 12, true), ('Aria', 12, false), ('Astun', 12, false),
  ('Decree', 12, false), ('Distance Insect Growth Regulator', 12, false),
  ('Endeavor', 12, false), ('Fascination', 12, true), ('Fenstop', 12, false),
  ('floxcor', 12, false), ('Forbid', 12, false), ('Hexygon DF', 12, false),
  ('Hexygon IQ', 12, false), ('Mavrik', 12, false), ('Medallion WDG', 12, false),
  ('Minx 2', 12, false), ('Mural', 12, false), ('Overture 35 WP', 12, false),
  ('Pageant', 12, false), ('Pedestal IGR', 12, false), ('Piccolo 10xc', 12, false),
  ('Pradia', 12, false), ('Pylon', 12, false), ('Rycar', 12, false),
  ('Safari 20 SG Insecticide', 12, false), ('Sanmite SC', 12, false),
  ('Sarisa', 12, true), ('Segway O', 12, false), ('Seido', 12, false),
  ('Shuttle 0', 12, false), ('Sultan miticide', 12, false), ('Talus 70DF', 12, false),
  ('Terraclor 400', 12, false), ('TetraSan 5 WDG', 12, false), ('Topflor', 12, false),
  ('Truban', 12, false), ('Xxpire', 12, false),
  -- 24 hours
  ('B9', 24, false), ('Altercel', 24, true), ('Protect DF', 24, false), ('Phyton 27', 24, true),
  -- 48 hours
  ('Florel', 48, false), ('Subdue Maxx', 48, false)
) as v(name, h, uncertain)
where c.name = v.name;
