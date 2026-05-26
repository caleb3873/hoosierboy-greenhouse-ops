// Push phones.json into floor_codes.phone using the anon key. We use the same
// table the app uses, doing an UPDATE per row keyed by worker_name. Reports any
// names that didn't match a floor_codes row.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const phones = JSON.parse(readFileSync(new URL("./phones.json", import.meta.url), "utf8"));

// Load all floor_codes once so we know what names exist
const { data: existing, error: readErr } = await sb.from("floor_codes")
  .select("id, worker_name, code, phone, active");
if (readErr) { console.error("Failed to read floor_codes:", readErr); process.exit(1); }
console.log(`Loaded ${existing.length} floor_codes rows.\n`);

const byName = new Map(existing.map(r => [(r.worker_name || "").toLowerCase().trim(), r]));

let updated = 0, alreadyHad = 0, notFound = [];
for (const { name, phone } of phones) {
  const match = byName.get(name.toLowerCase().trim());
  if (!match) { notFound.push(name); continue; }
  if (match.phone === phone) { alreadyHad++; continue; }
  const { error } = await sb.from("floor_codes").update({ phone }).eq("id", match.id);
  if (error) { console.error(`  ✗ ${name}:`, error.message); continue; }
  updated++;
  console.log(`  ✓ ${name} → ${phone} (was ${match.phone || "null"})`);
}

console.log(`\nSummary: ${updated} updated · ${alreadyHad} already correct · ${notFound.length} not found in floor_codes`);
if (notFound.length) {
  console.log("\nNot found:");
  notFound.forEach(n => console.log(`  - ${n}`));
}
