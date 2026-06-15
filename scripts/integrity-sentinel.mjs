// integrity-sentinel.mjs — Data-Integrity Sentinel (READ-ONLY)
// ---------------------------------------------------------------------------
// Loop-engineering candidate "A": a deterministic checker over the production
// data. It reads the DB, runs a registry of invariant checks, and prints a
// human-readable findings report. It WRITES NOTHING to the database — its only
// side effect is a local state file (scripts/.sentinel-state.json) so it can
// tell you what's NEW vs. already-known vs. RESOLVED since the last run.
//
// Why read-only first: in loop engineering the verifier is the bottleneck. This
// is the one place the checker can be 100% trustworthy (pure arithmetic / set
// math, no LLM guessing), so it's the safe first rung. Later loops that WRITE
// can reuse these exact invariants as their pre-apply gate.
//
// Run:  node scripts/integrity-sentinel.mjs
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const STATE_PATH = new URL(".sentinel-state.json", import.meta.url);

// Supabase caps a single select at 1000 rows. Several tables exceed that
// (scheduled_crops ~1473, benches ~1436), so the Sentinel MUST page or it would
// have blind spots — an under-reporting checker is worse than none.
async function fetchAll(table, columns = "*") {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return { data: out };
}

// Known status vocabulary for fall_program_items (discovered from live data,
// not assumed). Anything outside this set is "drift" worth a look.
const KNOWN_FALL_STATUS = new Set([
  null, "GOOD VARIETY", "CANCELLED", "NEVER USED", "TOP PERFORMER - BEST SELLER",
  "TOP PERFORMER", "BEST SELLER", "UNCLAIMED", "NOT NEEDED",
]);
// Statuses that take a row OUT of active production (excluded from "should have qty" checks).
const INACTIVE_FALL = new Set(["CANCELLED", "NEVER USED", "NOT NEEDED", "UNCLAIMED"]);

const idSet = rows => new Set((rows || []).map(r => r.id));
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));

// --- The check registry. Each check is independent, deterministic, and returns
// --- an array of findings. Severity: error (likely corruption) | warn
// --- (suspicious, look) | info (notable, not wrong). Keep checks HIGH-confidence
// --- — a noisy checker gets muted, which kills the loop.
const CHECKS = [
  // ---- scheduled_crops (the production plan) ----
  {
    id: "combo-orphan", table: "scheduled_crops", severity: "error",
    desc: "Combo child points at a parent row that doesn't exist",
    run: ({ sc, scIds }) => sc.filter(r => r.combo_parent_id && !scIds.has(r.combo_parent_id))
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.color || r.id}" → missing parent ${r.combo_parent_id}` })),
  },
  {
    id: "combo-cross-plan", table: "scheduled_crops", severity: "error",
    desc: "Combo child and its parent are in different plans",
    run: ({ sc, scById }) => sc.filter(r => r.combo_parent_id && scById.get(r.combo_parent_id) && scById.get(r.combo_parent_id).plan_id !== r.plan_id)
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" plan ${r.plan_id} ≠ parent plan ${scById.get(r.combo_parent_id).plan_id}` })),
  },
  {
    id: "combo-flag-mismatch", table: "scheduled_crops", severity: "warn",
    desc: "Has combo_parent_id but is_combo_component is not true (or vice-versa)",
    run: ({ sc }) => sc.filter(r => !!r.combo_parent_id !== !!r.is_combo_component)
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" parent=${!!r.combo_parent_id} flag=${!!r.is_combo_component}` })),
  },
  {
    id: "sc-orphan-variety", table: "scheduled_crops", severity: "error",
    desc: "variety_id doesn't resolve to a variety_library row",
    run: ({ sc, varIds }) => varIds && sc.filter(r => r.variety_id && !varIds.has(r.variety_id))
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" → missing variety ${r.variety_id}` })),
  },
  {
    id: "sc-orphan-bench", table: "scheduled_crops", severity: "error",
    desc: "bench_id doesn't resolve to a benches row",
    run: ({ sc, benchIds }) => benchIds && sc.filter(r => r.bench_id && !benchIds.has(r.bench_id))
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" → missing bench ${r.bench_id}` })),
  },
  {
    id: "sc-orphan-container", table: "scheduled_crops", severity: "error",
    desc: "container_id doesn't resolve to a containers row",
    run: ({ sc, contIds }) => contIds && sc.filter(r => r.container_id && !contIds.has(r.container_id))
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" → missing container ${r.container_id}` })),
  },
  {
    id: "sc-bad-week", table: "scheduled_crops", severity: "warn",
    desc: "plant_week or ship_week missing or out of 1–53 range",
    run: ({ sc }) => sc.filter(r => { const p = num(r.plant_week), s = num(r.ship_week); return (p === null || p < 1 || p > 53) || (s === null || s < 1 || s > 53); })
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" plant_wk=${r.plant_week} ship_wk=${r.ship_week}` })),
  },
  {
    id: "sc-bad-qty", table: "scheduled_crops", severity: "error",
    desc: "Standalone/parent row has qty_pots ≤ 0 or ppp ≤ 0 (combo components excluded — their pots live on the parent)",
    // Combo components legitimately carry qty_pots=0; the pot count is on the parent. Only flag rows that should own a count.
    run: ({ sc }) => sc.filter(r => !r.combo_parent_id && !r.is_combo_component && ((num(r.qty_pots) !== null && num(r.qty_pots) <= 0) || (num(r.ppp) !== null && num(r.ppp) <= 0)))
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.color || r.id}" pots=${r.qty_pots} ppp=${r.ppp}` })),
  },
  {
    id: "sc-shortage", table: "scheduled_crops", severity: "warn",
    desc: "Ordered plants > 0 but confirmed = 0 (supplier shortage — won't be plantable)",
    run: ({ sc }) => sc.filter(r => num(r.qty_plants_ordered) > 0 && num(r.qty_plants_confirmed) === 0)
      .map(r => ({ key: r.id, detail: `"${r.item_name || r.id}" ordered ${r.qty_plants_ordered}, confirmed 0` })),
  },

  // ---- fall_program_items (supplier orders + bench plan) ----
  {
    id: "fp-orphan-container", table: "fall_program_items", severity: "error",
    desc: "container_id doesn't resolve to a containers row",
    run: ({ fp, contIds }) => contIds && fp.filter(r => r.container_id && !contIds.has(r.container_id))
      .map(r => ({ key: r.id, detail: `"${r.variety || r.id}" (ord ${r.order_number}) → missing container ${r.container_id}` })),
  },
  {
    id: "fp-neg-qty", table: "fall_program_items", severity: "error",
    desc: "Negative qty / ord_qty / extras, or ppp ≤ 0",
    run: ({ fp }) => fp.filter(r => num(r.qty) < 0 || num(r.ord_qty) < 0 || num(r.extras) < 0 || (num(r.ppp) !== null && num(r.ppp) <= 0))
      .map(r => ({ key: r.id, detail: `"${r.variety || r.id}" qty=${r.qty} ord=${r.ord_qty} extras=${r.extras} ppp=${r.ppp}` })),
  },
  {
    id: "fp-active-no-variety", table: "fall_program_items", severity: "warn",
    desc: "Active row (not cancelled/unused) has no variety name",
    run: ({ fp }) => fp.filter(r => !INACTIVE_FALL.has(r.status) && !(r.variety || "").trim())
      .map(r => ({ key: r.id, detail: `row ${r.id} (ord ${r.order_number}, status ${r.status || "—"})` })),
  },
  {
    id: "fp-active-no-qty", table: "fall_program_items", severity: "warn",
    desc: "Active row on an order has neither qty nor ord_qty (nothing to plant or order)",
    run: ({ fp }) => fp.filter(r => !INACTIVE_FALL.has(r.status) && r.order_number && num(r.qty) === null && num(r.ord_qty) === null)
      .map(r => ({ key: r.id, detail: `"${r.variety || r.id}" (ord ${r.order_number})` })),
  },
  {
    id: "fp-unknown-status", table: "fall_program_items", severity: "warn",
    desc: "Status value outside the known vocabulary (data drift)",
    run: ({ fp }) => fp.filter(r => !KNOWN_FALL_STATUS.has(r.status))
      .map(r => ({ key: r.id, detail: `"${r.variety || r.id}" status="${r.status}"` })),
  },
];

async function main() {
  console.log("🛰  Data-Integrity Sentinel (read-only)\n");

  // Prefetch every dataset once; checks operate on these in memory.
  const [scR, fpR, contR, varR, benchR] = await Promise.all([
    fetchAll("scheduled_crops", "id,plan_id,variety_id,container_id,bench_id,combo_parent_id,is_combo_component,qty_pots,ppp,qty_plants_ordered,qty_plants_confirmed,plant_week,ship_week,status,item_name,color"),
    fetchAll("fall_program_items", "id,order_number,variety,status,qty,ord_qty,ppp,extras,container_id,soil_mix_id,year,ship_week"),
    fetchAll("containers", "id"),
    fetchAll("variety_library", "id"),
    fetchAll("benches", "id"),
  ]);

  // Defensive: if a reference table can't be read (RLS/missing), skip the checks
  // that need it rather than crash or false-flag. Degrade gracefully.
  const skipped = [];
  const sc = scR.data || []; const fp = fpR.data || [];
  if (scR.error) { console.error("✖ could not read scheduled_crops:", scR.error); process.exit(1); }
  if (fpR.error) { console.error("✖ could not read fall_program_items:", fpR.error); process.exit(1); }
  if (contR.error) skipped.push("containers (orphan-container checks)");
  if (varR.error) skipped.push("variety_library (orphan-variety check)");
  if (benchR.error) skipped.push("benches (orphan-bench check)");

  const ctx = {
    sc, fp,
    scIds: idSet(sc), scById: new Map(sc.map(r => [r.id, r])),
    contIds: contR.error ? null : idSet(contR.data),
    varIds: varR.error ? null : idSet(varR.data),
    benchIds: benchR.error ? null : idSet(benchR.data),
  };
  console.log(`Scanned ${sc.length} scheduled_crops rows · ${fp.length} fall_program_items rows`);
  if (skipped.length) console.log(`⚠ skipped checks (couldn't read): ${skipped.join(", ")}`);
  console.log("");

  // Run every check; tag each finding with its check id + severity.
  const findings = [];
  for (const c of CHECKS) {
    const hits = (c.run(ctx) || []);
    for (const h of hits) findings.push({ check: c.id, table: c.table, severity: c.severity, desc: c.desc, ...h });
  }

  // Diff against last run's snapshot → NEW / persisting / RESOLVED.
  const fid = f => `${f.check}::${f.key}`;
  const prev = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { findings: [] };
  const prevIds = new Set(prev.findings.map(fid));
  const nowIds = new Set(findings.map(fid));
  const isNew = f => !prevIds.has(fid(f));
  const resolved = prev.findings.filter(f => !nowIds.has(fid(f)));

  // Report — newest/worst first; group by check.
  const order = { error: 0, warn: 1, info: 2 };
  const byCheck = {};
  for (const f of findings) (byCheck[f.check] ||= []).push(f);
  const checkIds = Object.keys(byCheck).sort((a, b) => order[byCheck[a][0].severity] - order[byCheck[b][0].severity]);

  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => counts[f.severity]++);
  const newCount = findings.filter(isNew).length;

  if (!findings.length) {
    console.log("✅ No invariant violations found. Plan data is clean.");
  } else {
    console.log(`Found ${findings.length} finding(s): ${counts.error} error · ${counts.warn} warn · ${counts.info} info  (${newCount} new since last run)\n`);
    for (const id of checkIds) {
      const group = byCheck[id];
      const icon = group[0].severity === "error" ? "🔴" : group[0].severity === "warn" ? "🟡" : "🔵";
      console.log(`${icon} [${id}] ${group[0].desc} — ${group.length} row(s)`);
      group.slice(0, 12).forEach(f => console.log(`     ${isNew(f) ? "🆕 " : "   "}${f.detail}`));
      if (group.length > 12) console.log(`     …and ${group.length - 12} more`);
      console.log("");
    }
  }
  if (resolved.length) console.log(`✔ ${resolved.length} finding(s) RESOLVED since last run.\n`);

  // Persist snapshot (the loop's memory). NOT committed to git — it's per-run state.
  writeFileSync(STATE_PATH, JSON.stringify({ ranAt: new Date().toISOString(), findings }, null, 2));
  console.log("State saved → scripts/.sentinel-state.json");
}

main().catch(e => { console.error("Sentinel crashed:", e); process.exit(1); });
