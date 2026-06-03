const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const URL = env.match(/REACT_APP_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/REACT_APP_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const s = createClient(URL, KEY);

const CONTAINER_ID = "4d97156e-d18b-4f2c-ac19-742d9148ed21"; // 1801-LAND
const CONTAINER_SKU = "1801-LAND";
const CONTAINER_COST = 40.3;
const LOCATION = "Bluff Quonset 07";

function row({ variety, color, trays, shipWeek, plantWeek, group }) {
  const cells = trays * 18;
  const plants = trays * 36;
  return {
    year: 2026,
    category: "1801 PANSY",
    breeder: "BALL SEED",
    variety,
    color: color || null,
    location: LOCATION,
    ship_week: `WEEK ${shipWeek}`,
    plant_week: `WEEK ${plantWeek}`,
    qty: cells,
    ord_qty: plants,
    ppp: 2,
    cost: null,
    container_id: CONTAINER_ID,
    container_sku: CONTAINER_SKU,
    container_cost: CONTAINER_COST,
    broker: "Ball",
    prop_method: "LINER",
    is_combo_component: false,
    group_number: group,
    notes: `Group ${group}. ${trays} 1801 retail trays. 2 plugs/cell · 18 cells/tray = 36 plants/tray. Plug source: 288-tray. ${plants} plants / ${Math.ceil(plants/288)} plug tray${Math.ceil(plants/288) === 1 ? "" : "s"}. Plant Week ${plantWeek} → finish Week ${plantWeek + 4}.`,
  };
}

const GROUP_1 = [
  row({ variety: "PANSY DELTA PRO CLEAR RED",            color: "RED",    trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY DELTA PRO CLEAR VIOLET",         color: "VIOLET", trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY DELTA PRO CLEAR YELLOW",         color: "YELLOW", trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY DELTA PRO DEEP BLUE WITH BLOTCH",color: "BLUE",   trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY SELECT ORANGE BLOTCH",           color: "ORANGE", trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY ATLAS BLACK",                    color: "BLACK",  trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY MATRIX AUTUMN BLAZE",            color: "MIX",    trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY MATRIX SANGRIA",                 color: "SANGRIA",trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY TAPESTRY MIX",                   color: "MIX",    trays: 32, shipWeek: 33, plantWeek: 33, group: 1 }),
  row({ variety: "PANSY DELTA PRO WHITE",                color: "WHITE",  trays: 8,  shipWeek: 33, plantWeek: 33, group: 1 }),
];

const GROUP_2 = [
  row({ variety: "PANSY DELTA PRO CLEAR RED",             color: "RED",    trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY DELTA PRO CLEAR VIOLET",          color: "VIOLET", trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY DELTA PRO CLEAR YELLOW",          color: "YELLOW", trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY DELTA PRO DEEP BLUE WITH BLOTCH", color: "BLUE",   trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY SELECT ORANGE BLOTCH",            color: "ORANGE", trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY ATLAS BLACK",                     color: "BLACK",  trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY APPLE CIDER MIX",                 color: "MIX",    trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY SELECT ORANGE PURPLE WING",       color: "ORANGE", trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY DELTA PRO YELLOW WITH BLOTCH",    color: "YELLOW", trays: 32, shipWeek: 35, plantWeek: 35, group: 2 }),
  row({ variety: "PANSY COLOSSUS ROSE MEDLEY",            color: "MIX",    trays: 8,  shipWeek: 35, plantWeek: 35, group: 2 }),
];

(async () => {
  const all = [...GROUP_1, ...GROUP_2];
  console.log(`Inserting ${all.length} fall_program_items rows (10 G1 + 10 G2)...`);
  const { data, error } = await s.from("fall_program_items").insert(all).select("id,variety,plant_week,group_number,ord_qty");
  if (error) { console.error("FAIL:", error.message); process.exit(1); }
  data.forEach(d => console.log(`  ✓ ${d.plant_week} · G${d.group_number} · ${d.ord_qty} plants · ${d.variety}`));
  console.log("Done.");
})();
