// integrity-sentinel.mjs — Data-Integrity Sentinel CLI (READ-ONLY)
// ---------------------------------------------------------------------------
// Thin wrapper around the shared verifier in api/_sentinel-core.js (so the CLI
// and the morning cron run the EXACT same checks). Reads .env.local, runs the
// checks, prints a report, and diffs against a local snapshot so it can show
// NEW vs already-known vs RESOLVED findings. Writes nothing to the database.
//
// Run:  node scripts/integrity-sentinel.mjs
//       node scripts/integrity-sentinel.mjs "Winter 2026" "Spring 2027"   (override scope)
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import core from "../api/_sentinel-core.js";
const { runSentinel, renderText, COMPLETED_PLANS_DEFAULT } = core;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const STATE_PATH = new URL(".sentinel-state.json", import.meta.url);

const scope = process.argv.slice(2).length ? process.argv.slice(2) : COMPLETED_PLANS_DEFAULT;
console.log("🛰  Data-Integrity Sentinel (read-only)\n");

const report = await runSentinel(sb, scope);
const prev = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { findings: [] };
console.log(renderText(report, prev.findings));

writeFileSync(STATE_PATH, JSON.stringify({ ranAt: new Date().toISOString(), scope, findings: report.findings }, null, 2));
console.log("\nState saved → scripts/.sentinel-state.json");
