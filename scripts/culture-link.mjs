// culture-link.mjs — Culture-Guide Linker (READ-ONLY proposer)
// ---------------------------------------------------------------------------
// Loop "C". For every variety_library row with no culture_source_id, it proposes
// the matching culture_guides_public row (cross-project DB) using deterministic
// name matching, and grades each proposal HIGH / MEDIUM / AMBIGUOUS / NONE.
//
// It WRITES NOTHING. It prints a report and saves the proposals to
// scripts/culture-link-proposals.json so you (or a future promoted version) can
// review and apply them. The "verifier" here = the confidence rule: a proposal
// is only HIGH when the genus matches AND the variety/color tokens line up.
//
// Run:  node scripts/culture-link.mjs
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const main = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const culture = createClient(env.REACT_APP_SUPABASE_CULTURE_URL, env.REACT_APP_SUPABASE_CULTURE_ANON_KEY);
const OUT = new URL("culture-link-proposals.json", import.meta.url);

async function fetchAll(client, table, columns, filter) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

// Normalize a name for comparison: uppercase, drop ™/®, drop the word SERIES,
// strip punctuation, collapse whitespace.
const norm = s => (s || "").toUpperCase().replace(/[™®]/g, "").replace(/\bSERIES\b/g, " ")
  .replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const toks = s => norm(s).split(" ").filter(w => w.length > 2);
const overlap = (need, hayTokens) => { const h = new Set(hayTokens); const got = need.filter(t => h.has(t)); return need.length ? got.length / need.length : 0; };

function classify(v, candidates) {
  const vTokens = toks([v.series, v.variety].filter(Boolean).join(" "));
  let best = null;
  for (const c of candidates) {
    const seriesT = toks(c.series_name), varT = toks(c.series_variety);
    const exact = norm([c.series_name, c.series_variety].join(" ")) === norm([v.series, v.variety].filter(Boolean).join(" "));
    const varScore = overlap(varT, vTokens);     // do the color/variety words line up?
    const seriesScore = overlap(seriesT, vTokens); // does the SERIES name appear? (the real discriminator)
    // A candidate is only viable if the series name actually shows up — a color-only
    // overlap across different series (Sunbrero→Mohave) is a FALSE match.
    const viable = exact || seriesScore > 0;
    const score = exact ? 2 : seriesScore * 0.6 + varScore * 0.4;
    if (viable && (!best || score > best.score)) best = { c, score, exact, varScore, seriesScore };
  }
  if (!best) return { tier: "NONE", best: null };
  let tier;
  // HIGH demands the series matches AND every color/variety token lines up — shared
  // series words alone (Neo Double…) must not carry a match across different colors.
  if (best.exact || (best.seriesScore >= 0.5 && best.varScore >= 1)) tier = "HIGH";
  else if (best.seriesScore >= 0.5 && best.varScore >= 0.5) tier = "MEDIUM";
  else tier = "NONE"; // series or color didn't line up → not a confident match
  return { tier, best };
}

async function run() {
  console.log("🔗 Culture-Guide Linker (read-only)\n");
  const unlinked = await fetchAll(main, "variety_library", "id,crop_name,series,variety,breeder", q => q.is("culture_source_id", null));
  const guides = await fetchAll(culture, "culture_guides_public", "id,crop_name,series_name,series_variety,breeder_name");
  console.log(`${unlinked.length} unlinked varieties · ${guides.length} culture guides\n`);

  // Index guides by normalized genus (crop_name) for fast candidate lookup.
  const byCrop = new Map();
  for (const g of guides) { const k = norm(g.crop_name); if (!byCrop.has(k)) byCrop.set(k, []); byCrop.get(k).push(g); }

  const tiers = { HIGH: [], MEDIUM: [], NONE: [] };
  for (const v of unlinked) {
    const candidates = byCrop.get(norm(v.crop_name)) || [];
    const { tier, best } = candidates.length ? classify(v, candidates) : { tier: "NONE", best: null };
    tiers[tier].push({
      variety_id: v.id, label: `${v.crop_name} ${v.variety}`,
      match: best ? `${best.c.crop_name} ${best.c.series_name || ""} ${best.c.series_variety || ""}`.replace(/\s+/g, " ").trim() : null,
      culture_id: best ? best.c.id : null, score: best ? Number(best.score.toFixed(2)) : 0,
    });
  }

  const show = (tier, icon, note) => {
    const list = tiers[tier]; if (!list.length) return;
    console.log(`${icon} ${tier} — ${list.length}${note ? ` (${note})` : ""}`);
    list.slice(0, 25).forEach(p => console.log(`     ${p.label}${p.match ? `  →  ${p.match}` : ""}`));
    if (list.length > 25) console.log(`     …and ${list.length - 25} more`);
    console.log("");
  };
  show("HIGH", "🟢", "series + every color token align — likely right, still confirm before applying");
  show("MEDIUM", "🟡", "series matches, color only partial — review");
  show("NONE", "⚪", "no confident match — genus missing OR series names differ between catalogs");

  writeFileSync(OUT, JSON.stringify(tiers, null, 2));
  console.log(`Proposals saved → scripts/culture-link-proposals.json  (review before any apply)`);
}

run().catch(e => { console.error("Linker crashed:", e); process.exit(1); });
