// culture-link.mjs — Culture-Guide Linker CLI
// Thin wrapper over the shared matching logic in api/_sentinel-core.js.
//   node scripts/culture-link.mjs            (read-only — proposes only)
//   node scripts/culture-link.mjs --apply    (writes culture_source_id for HIGH matches)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import core from "../api/_sentinel-core.js";
const { runCultureLink, renderCultureText } = core;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const main = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const culture = createClient(env.REACT_APP_SUPABASE_CULTURE_URL, env.REACT_APP_SUPABASE_CULTURE_ANON_KEY);
const OUT = new URL("culture-link-proposals.json", import.meta.url);

console.log("🔗 Culture-Guide Linker\n");
const link = await runCultureLink(main, culture);
console.log(renderCultureText(link));
writeFileSync(OUT, JSON.stringify(link.tiers, null, 2));
console.log(`Proposals saved → scripts/culture-link-proposals.json  (review before any apply)`);

if (!process.argv.includes("--apply")) {
  if (link.tiers.HIGH.length) console.log(`\n💡 Re-run with --apply to write culture_source_id for the ${link.tiers.HIGH.length} HIGH match(es).`);
} else {
  // WRITE (apply-with-gate): HIGH only, only where culture_source_id is still null, then verify.
  console.log(`\n✍️  --apply: linking ${link.tiers.HIGH.length} HIGH match(es)…`);
  let done = 0, failed = 0;
  for (const p of link.tiers.HIGH) {
    const { error } = await main.from("variety_library")
      .update({ culture_source_id: p.culture_id }).eq("id", p.variety_id).is("culture_source_id", null);
    if (error) { failed++; console.log(`   ✖ ${p.label}: ${error.message}`); }
    else { done++; console.log(`   ✓ ${p.label}  →  ${p.match}`); }
  }
  const ids = link.tiers.HIGH.map(p => p.variety_id);
  const { data: check } = await main.from("variety_library").select("id,culture_source_id").in("id", ids);
  const linked = (check || []).filter(r => r.culture_source_id).length;
  console.log(`\nWrote ${done}, failed ${failed}.  ✅ Verify: ${linked}/${ids.length} HIGH varieties now linked.`);
}
