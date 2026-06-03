const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const URL = env.match(/REACT_APP_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/REACT_APP_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const s = createClient(URL, KEY);
(async () => {
  const { data } = await s.from("fall_program_items").select("location,row_id").not("row_id", "is", null);
  // Group rows by location
  const byLoc = new Map();
  data.forEach(r => {
    if (!byLoc.has(r.location)) byLoc.set(r.location, new Set());
    byLoc.get(r.location).add(r.row_id);
  });
  const sample = [...byLoc.entries()].slice(0, 6);
  sample.forEach(([loc, rows]) => {
    console.log(`${loc}: ${[...rows].sort().slice(0, 8).join(", ")}${rows.size > 8 ? ` (+${rows.size - 8})` : ""}`);
  });
  // Distinct crop_name from variety_library
  const { data: vars } = await s.from("variety_library").select("crop_name,name").limit(2000);
  const cropNames = [...new Set(vars.map(v => v.crop_name).filter(Boolean))].sort();
  console.log("\nDistinct variety_library.crop_name:", cropNames);
  console.log("\nTotal varieties:", vars.length);
})();
