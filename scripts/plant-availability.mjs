// plant-availability.mjs — "Do we have the plants to complete the plan?" (READ-ONLY)
// ---------------------------------------------------------------------------
// For every variety in the Fall Program, compares PRODUCTION (Σ qty — what you
// intend to pot & tag) against SUPPLY (Σ ord_qty — what you'll receive). Flags
// any variety where production > supply: you'd pot/tag plants you won't have.
// Also lists recorded substitutions, and shorted/cancelled varieties + whether a
// substitute covers them. Writes nothing.
//
//   node scripts/plant-availability.mjs            (whole Fall Program)
//   node scripts/plant-availability.mjs 9429649    (one order)
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const num = v => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const nk = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // aggressive normalize (handles stray/invisible chars)
const REMOVED = new Set(["CANCELLED", "NOT NEEDED"]); // out of the plan entirely

async function fetchAll(table, columns) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...data); if (data.length < PAGE) break;
  }
  return out;
}

async function run() {
  const only = process.argv[2];
  console.log("🌱 Plant Availability — production plan vs. supply (read-only)\n");
  const rows = (await fetchAll("fall_program_items", "variety,qty,ord_qty,ppp,status,substituted_from,order_number"))
    .filter(r => r.variety && (!only || String(r.order_number) === String(only)));

  // Aggregate per variety (rows still in the plan = not cancelled/not-needed).
  const byVar = new Map();
  const subs = [];        // recorded substitutions: this variety replaces substituted_from
  const removedVars = new Map(); // cancelled/not-needed varieties (potential shorts)
  for (const r of rows) {
    if (r.substituted_from) subs.push({ variety: r.variety, replaces: r.substituted_from, qty: num(r.qty), ord: num(r.ord_qty) });
    if (REMOVED.has(r.status)) {
      const e = removedVars.get(r.variety) || { ordered: 0 }; e.ordered += num(r.ord_qty); removedVars.set(r.variety, e);
      continue;
    }
    const e = byVar.get(r.variety) || { production: 0, supply: 0 }; // qty vs ord_qty
    e.production += num(r.qty); e.supply += num(r.ord_qty); byVar.set(r.variety, e);
  }

  // Coverage: how much production does a substitute add toward the variety it replaces.
  const coverFor = new Map();
  for (const s of subs) coverFor.set(nk(s.replaces), (coverFor.get(nk(s.replaces)) || 0) + s.qty);

  const list = [...byVar.entries()].map(([variety, e]) => ({ variety, ...e, gap: e.production - e.supply })).sort((a, b) => b.gap - a.gap);
  const short = list.filter(o => o.gap > 0);

  console.log(`${list.length} varieties in the plan · ${short.length} with production > supply (potting/tagging more than you'll receive)\n`);
  if (short.length) {
    console.log("🔴 SHORT — plan to pot/tag MORE than supply will cover:");
    short.forEach(o => console.log(`   ${o.variety}: plan ${o.production} · supply ${o.supply} · short ${o.gap}${coverFor.get(nk(o.variety)) ? ` (substitute adds ${coverFor.get(nk(o.variety))})` : ""}`));
    console.log("");
  } else console.log("✅ No variety plans to pot/tag more than its supply covers.\n");

  if (subs.length) {
    console.log("🔁 RECORDED SUBSTITUTIONS (tag as the substitute, not the original):");
    subs.forEach(s => console.log(`   ${s.variety} ← replaces ${s.replaces}  (plan ${s.qty} · supply ${s.ord}${s.qty === s.ord ? " ✓ aligned" : " ⚠ qty≠ord_qty"})`));
    console.log("");
  }

  if (removedVars.size) {
    console.log("🚫 CANCELLED / NOT NEEDED (shorted — confirm a substitute covers these):");
    for (const [variety, e] of removedVars) {
      const cov = coverFor.get(nk(variety));
      console.log(`   ${variety}: was ordered ${e.ordered}${cov ? ` → covered by substitute (+${cov})` : "  ⚠ NO substitute recorded"}`);
    }
  }
}

run().catch(e => { console.error("Availability check crashed:", e); process.exit(1); });
