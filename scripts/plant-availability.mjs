// plant-availability.mjs — "Do we have the plants to complete the plan?" (READ-ONLY)
// Thin wrapper over the shared logic in api/_sentinel-core.js (so the CLI and the
// morning email never drift). Per variety: production (Σqty — what you pot & tag)
// vs supply (Σord_qty — what you'll receive); flags production > supply; lists
// shorted/cancelled varieties + whether a substitute covers them. Writes nothing.
//   node scripts/plant-availability.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import core from "../api/_sentinel-core.js";
const { runPlantAvailability, renderAvailabilityText } = core;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

console.log("🌱 Plant Availability — production plan vs. supply (read-only)\n");
console.log(renderAvailabilityText(await runPlantAvailability(sb)));
console.log("\n🔴 short = planning to pot/tag more than supply covers · (sub +N) = a recorded substitute helps");
