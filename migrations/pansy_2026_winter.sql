-- Winter Pansy 2026 — two groups, 1801 retail tray (2 plugs/cell · 36 plants/tray)
-- Group 1: plant Week 33 → ready Week 37
-- Group 2: plant Week 35 → ready Week 39
-- Broker: Ball. Plugs ordered as 288s. Bluff Quonset 07.
-- qty = cells covered (trays * 18). ord_qty = plants ordered (trays * 36).

INSERT INTO fall_program_items
  (year, category, breeder, variety, color, location, ship_week, plant_week,
   qty, ord_qty, ppp, container_id, container_sku, container_cost, broker,
   prop_method, is_combo_component, group_number, notes)
VALUES
  -- ── Group 1 — plant week 33, ready week 37 ────────────────────────────────
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR RED',             'RED',    'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 36 plants/tray · 1152 plants / 4 plug trays of 288.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR VIOLET',          'VIOLET', 'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR YELLOW',          'YELLOW', 'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO DEEP BLUE WITH BLOTCH', 'BLUE',   'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY SELECT ORANGE BLOTCH',            'ORANGE', 'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY ATLAS BLACK',                     'BLACK',  'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY MATRIX AUTUMN BLAZE',             'MIX',    'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY MATRIX SANGRIA',                  'SANGRIA','Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY TAPESTRY MIX',                    'MIX',    'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO WHITE',                 'WHITE',  'Bluff Quonset 07', 'WEEK 33', 'WEEK 33',  144,  288, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 1, 'Group 1. 8 trays · 288 plants / 1 plug tray.'),

  -- ── Group 2 — plant week 35, ready week 39 ────────────────────────────────
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR RED',             'RED',    'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR VIOLET',          'VIOLET', 'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO CLEAR YELLOW',          'YELLOW', 'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO DEEP BLUE WITH BLOTCH', 'BLUE',   'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY SELECT ORANGE BLOTCH',            'ORANGE', 'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY ATLAS BLACK',                     'BLACK',  'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays.'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY APPLE CIDER MIX',                 'MIX',    'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays. (Replaces Autumn Blaze from G1.)'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY SELECT ORANGE PURPLE WING',       'ORANGE', 'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays. (Replaces Sangria from G1.)'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY DELTA PRO YELLOW WITH BLOTCH',    'YELLOW', 'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  576, 1152, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 32 trays · 1152 plants / 4 plug trays. (Replaces Tapestry Mix from G1.)'),
  (2026, '1801 PANSY', 'BALL SEED', 'PANSY COLOSSUS ROSE MEDLEY',            'MIX',    'Bluff Quonset 07', 'WEEK 35', 'WEEK 35',  144,  288, 2, '4d97156e-d18b-4f2c-ac19-742d9148ed21', '1801-LAND', 40.3, 'Ball', 'LINER', false, 2, 'Group 2. 8 trays · 288 plants / 1 plug tray. (Replaces Delta Pro White from G1.)');
