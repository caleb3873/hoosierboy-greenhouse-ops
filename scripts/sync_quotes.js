#!/usr/bin/env node
/* ONE COMMAND from "Caleb dropped a quote file" to "every surface sees it" (Caleb 7/29:
 * "upload broker quote and then everything which would need access to that needs to sync").
 *
 *   node scripts/sync_quotes.js [canary search terms...]
 *
 * Runs, in order:
 *   1. parse_broker_quotes  — scans the three Desktop quote dirs (recency rule,
 *      freight borrowing, name normalization all inside)
 *   2. load_broker_prices   — wipes + reloads the season into broker_prices
 *   3. WebTrack imports     — every file in scripts/webtrack_manifest.json
 *      (availability-grid exports the parser can't read), each with its own
 *      supplier + freight; cross-loader recency retirement included
 *   4. apply_sourcing_to_plan "spring 2027" --apply — refreshes plan-row liner
 *      costs/brokers wherever an item-name match exists
 *   5. verification         — total row count + per-manifest-file counts + a canary
 *      search for any terms passed on the CLI (e.g. `node scripts/sync_quotes.js heuchera kira`)
 *
 * Surfaces that read broker_prices live (door search, family pins, 🔁 liner-vs-URC,
 * reconcile buy list, sourcing compare) need nothing further. Plan-row snapshots are
 * covered by step 4; deep stale-cost passes stay manual (see quote_recency_rule memory).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const run = (cmd, label) => {
  console.log(`\n━━ ${label} ━━`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
};

(async () => {
  run("node scripts/parse_broker_quotes.js --json /tmp/broker_prices.json | tail -6", "1/5 parse (recency + freight + names)");
  run("node scripts/load_broker_prices.js /tmp/broker_prices.json | tail -1", "2/5 load broker_prices");

  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "webtrack_manifest.json"), "utf8"));
  for (const m of manifest.files) {
    if (!fs.existsSync(m.file)) { console.log(`\n━━ 3/5 SKIP (file gone): ${m.file}`); continue; }
    run(`node scripts/import_ball_innovaplant.js ${JSON.stringify(m.file)} --supplier ${JSON.stringify(m.supplier)}${m.freight ? ` --freight ${m.freight}` : ""} --apply | tail -3`,
      `3/5 WebTrack import — ${m.supplier}`);
  }

  run(`node scripts/apply_sourcing_to_plan.js "spring 2027" --apply | tail -2`, "4/5 cascade plan-row costs");

  console.log(`\n━━ 5/5 verify ━━`);
  const env = {};
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").forEach(l => {
    const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
  });
  const H = { apikey: env.REACT_APP_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.REACT_APP_SUPABASE_ANON_KEY}` };
  const BASE = env.REACT_APP_SUPABASE_URL;
  const count = async (qs) => {
    const r = await fetch(`${BASE}/rest/v1/broker_prices?select=id&limit=1&${qs}`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    return +(r.headers.get("content-range") || "0/0").split("/")[1];
  };
  console.log("broker_prices total:", await count(""));
  for (const m of manifest.files) {
    console.log(`  ${path.basename(m.file)}:`, await count(`source_file=eq.${encodeURIComponent(path.basename(m.file))}`));
  }
  for (const term of process.argv.slice(2)) {
    const r = await fetch(`${BASE}/rest/v1/broker_prices?select=variety,supplier,broker,landed&or=(variety.ilike.*${term}*,crop.ilike.*${term}*)&limit=1000`, { headers: H });
    const rows = await r.json();
    console.log(`  canary '${term}': ${rows.length} quote lines, suppliers: ${[...new Set(rows.map(x => x.supplier))].join(", ")}`);
  }
  console.log("\n✅ sync complete — door search / pins / liner-vs-URC / reconcile all read live.");
})().catch(e => { console.error("SYNC FAILED:", e.message); process.exit(1); });
