#!/usr/bin/env node
/* Import Ball's InnovaPlant (Kientzler production farm) availability+price export into
 * broker_prices. Ball truncates names ("Jamesbrit", "Calib", "SupCal") — we expand crops
 * and known words BEFORE keying so keys line up with the Express/EHR imports.
 * Price is per 100 EA → landed = (price + royalty)/100. Freight not included (flagged,
 * same convention as the earlier Ball geraniums import). Idempotent by source_file.
 * Usage: node scripts/import_ball_innovaplant.js <file.xlsx> [--apply]
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase", "supabase-js"));
const { makeKey } = require(path.join(__dirname, "..", "src", "brokerKey.js"));

const args = process.argv.slice(2);
const FILE = args.find(a => !a.startsWith("--") && /\.xls[xb]?$/i.test(a)) || "/Users/caleb/Desktop/PRODUCT_SEARCH_RESULTS_20260728074957.xlsx";
const APPLY = args.includes("--apply");
// Generalized 7/29: any Ball WebTrack "Download" export imports through here.
//   --supplier "Danziger"   (default Innovaplant/Kientzler)
//   --freight 0.04          per-plant freight to fold into landed (borrowed rate)
const SUPPLIER = args.includes("--supplier") ? args[args.indexOf("--supplier") + 1] : "Innovaplant/Kientzler";
const FREIGHT = args.includes("--freight") ? (+args[args.indexOf("--freight") + 1] || 0) : 0;
const IS_KZ = /kientzler/i.test(SUPPLIER);
const SOURCE = path.basename(FILE);

const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach(l => {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

// Ball's crop-token abbreviations → our canonical crop word (first token of the name)
const CROP = {
  ImpaNG: "New Guinea Impatiens", ImpaEX: "Impatiens", PetVEG: "Petunia", Calib: "Calibrachoa",
  Beg: "Begonia", Bract: "Bracteantha", VerbeVEG: "Verbena", Peric: "Pericallis",
  Delosp: "Delosperma", Argyr: "Argyranthemum", Osteosp: "Osteospermum", Dahl: "Dahlia",
  Jamesbrit: "Jamesbrittenia", HE: "Herb", Helio: "Heliotrope", Chrysoc: "Chrysocephalum",
  Strept: "Streptocarpus", Portul: "Portulaca", Scaev: "Scaevola", Sanvit: "Sanvitalia",
  Osteo: "Osteospermum", NGI: "New Guinea Impatiens", BegVEG: "Begonia", ImpaDB: "Impatiens",
};
// word-level truncations — shared dictionary (scripts/ball_words.js)
const { expandWord } = require(path.join(__dirname, "ball_words"));

function canonical(desc) {
  let toks = String(desc).replace(/#/g, "").trim().split(/\s+/);
  if (!toks.length) return null;
  const t0 = toks[0];
  if (t0 === "FO") { toks = toks.slice(1); }           // foliage division prefix — real crop follows
  else if (CROP[t0]) { toks = [CROP[t0], ...toks.slice(1)]; }
  // SunPatiens ride under ImpaEX with their own marker
  if (/^Impatiens$/i.test(toks[0]) && /^Sunpatns$/i.test(toks[1] || "")) toks = ["Sunpatiens", ...toks.slice(2)];
  const out = toks
    .map(w => /^(.{4,})ipd$/i.test(w) ? w.replace(/ipd$/i, "") : w)   // glued "Tangerineipd"
    .map(w => /^(.{3,})2per$/i.test(w) ? w.replace(/2per$/i, "") : w)
    .map(expandWord).join(" ");
  return out;
}

(async () => {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(FILE).Sheets["Download"], { defval: "" });
  const num = s => +String(s).replace(/[^0-9.]/g, "") || 0;
  const out = [], unmapped = {};
  const seen = new Set();
  for (const r of rows) {
    const price = num(r.Price);
    if (!price) continue;
    const name = canonical(r.Description);
    if (!name) continue;
    const t0 = String(r.Description).trim().split(/\s+/)[0];
    if (!CROP[t0] && t0 !== "FO" && /[A-Z]{2}/.test(t0.slice(1)) && t0.length <= 6) unmapped[t0] = (unmapped[t0] || 0) + 1;
    const royalty = num(r.Royalty);
    const origin = IS_KZ ? (/Guatemala/i.test(r["Supplier Name"]) ? "GT" : "CR") : null;
    const fc = /callus/i.test(r.Size || "") ? "callused" : /liner|strip|cell/i.test(r.Size || "") ? "liner" : "urc";
    const key = makeKey("", "", name);
    const seenKey = key + "|" + fc;
    if (seen.has(seenKey)) {
      if (IS_KZ) {   // CR + GT farms quote the same price — one line, both origins noted
        const prev = out.find(o => o.variety_key === key && o.form_class === fc);
        if (prev && prev.origin && !prev.origin.includes(origin)) { prev.origin = "CR/GT"; prev.form_raw = prev.form_raw.replace(/InnovaPlant \w+/, "InnovaPlant CR/GT"); }
      }
      continue;
    }
    seen.add(seenKey);
    out.push({
      broker: "Ball", supplier: SUPPLIER, origin,
      crop: name.split(" ")[0], variety: name, variety_key: key, match_key: key,
      form_class: fc, form_raw: `${r.Size} (Ball WebTrack${origin ? ` ${origin}` : ""}${FREIGHT ? "" : "; freight n/i"})`,
      list_price: +(price / 100).toFixed(4), royalty: +(royalty / 100).toFixed(4),
      freight: FREIGHT || null,
      landed: +((price + royalty) / 100 + FREIGHT).toFixed(4),
      season: "2026-2027", source_file: SOURCE, item_min: 100,
    });
  }
  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${SOURCE}`);
  console.log(`parsed ${out.length} quote lines (from ${rows.length} rows; CR+GT deduped per variety)`);
  const un = Object.entries(unmapped).sort((a, b) => b[1] - a[1]);
  if (un.length) console.log(`possibly-unmapped crop tokens (imported as-is): ${un.slice(0, 10).map(([t, n]) => `${t}(${n})`).join(" ")}`);

  // cross-broker comparison on shared Kientzler genetics
  const keys = [...new Set(out.map(o => o.variety_key))];
  const existing = [];
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await sb.from("broker_prices").select("variety_key,broker,landed").in("variety_key", keys.slice(i, i + 100)).neq("broker", "Ball");
    existing.push(...(data || []));
  }
  const bestElse = {};
  existing.forEach(e => { if (bestElse[e.variety_key] == null || +e.landed < bestElse[e.variety_key]) bestElse[e.variety_key] = +e.landed; });
  let cheaper = 0, pricier = 0, only = 0;
  out.forEach(o => {
    if (bestElse[o.variety_key] == null) { only++; return; }
    if (o.landed < bestElse[o.variety_key]) cheaper++; else pricier++;
  });
  console.log(`cross-broker: ${cheaper} cheaper via Ball · ${pricier} pricier · ${only} Ball-only (no other quote)`);
  const jb = out.filter(o => /jamesbrittenia/i.test(o.variety));
  jb.slice(0, 4).forEach(o => console.log(`  ${o.variety}: Ball $${o.landed}${bestElse[o.variety_key] != null ? ` vs best-other $${bestElse[o.variety_key]}` : " (Ball only)"}`));

  if (!APPLY) { console.log("\n(dry run — pass --apply to write)"); return; }
  await sb.from("broker_prices").delete().eq("source_file", SOURCE);
  for (let i = 0; i < out.length; i += 400) {
    const { error } = await sb.from("broker_prices").insert(out.slice(i, i + 400));
    if (error) throw new Error(error.message);
  }
  // Recency law across loaders (Caleb 7/29): this export supersedes ANY older file's
  // rows for the same broker+supplier+form+variety, whichever pipeline loaded them.
  let retired = 0;
  for (const fc of [...new Set(out.map(o => o.form_class))]) {
    const impKeys = out.filter(o => o.form_class === fc).map(o => o.variety_key);
    for (let i = 0; i < impKeys.length; i += 100) {
      const { data: gone } = await sb.from("broker_prices").delete()
        .eq("broker", "Ball").eq("supplier", SUPPLIER).neq("source_file", SOURCE)
        .eq("form_class", fc).in("variety_key", impKeys.slice(i, i + 100)).select("id");
      retired += (gone || []).length;
    }
  }
  if (retired) console.log(`recency: retired ${retired} older rows superseded by this export`);
  console.log(`\nAPPLIED: ${out.length} rows inserted (idempotent by source_file).`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
