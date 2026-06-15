// integrity-sentinel.mjs — Data-Integrity Sentinel (READ-ONLY)
// ---------------------------------------------------------------------------
// A deterministic checker over the production plans. It reads the DB, runs a
// registry of checks, and prints a human-readable findings report. It WRITES
// NOTHING to the database — its only side effect is a local state file
// (scripts/.sentinel-state.json) so it can tell you what's NEW vs. already-known
// vs. RESOLVED since the last run.
//
// Two kinds of checks:
//   • READINESS  — for plans you've finished entering: is each item actually
//     ready to grow & sell? (has a supplier order, sale price, container, weeks)
//   • STRUCTURAL — can this data even exist safely? (orphan refs, bad combos,
//     negative qtys, status drift) — a quiet safety net.
//
// SCOPE: readiness/structural plan checks only run on plans YOU mark as "done
// being planned" — see COMPLETED_PLANS below. (fall_program_items is always
// checked as a background safety net, but stays silent unless something breaks.)
//
// Run:  node scripts/integrity-sentinel.mjs
//       node scripts/integrity-sentinel.mjs "Winter 2026" "Spring 2027"   (override scope)
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// >>> THE MANUAL CONTROL <<<
// Add a plan here the day you finish entering it. Only plans in this list get
// held to the full readiness checklist. Override per-run by passing plan names
// as command-line arguments.
const COMPLETED_PLANS = ["Winter 2026"];

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
const badWeek = w => { const n = num(w); return n === null || n < 1 || n > 53; };

// --- The check registry. Each check is independent and deterministic. Severity:
// --- error (must fix) | warn (look) | info. category: readiness | structural.
// --- Keep checks HIGH-confidence — a noisy checker gets muted, which kills it.
const CHECKS = [
  // ===== READINESS — "is this finished item actually ready to grow & sell?" =====
  // (runs only on COMPLETED_PLANS rows)
  {
    id: "need-order", category: "readiness", table: "scheduled_crops", severity: "error",
    desc: "No supplier order — nothing ordered to grow this item",
    run: ({ sc }) => sc.filter(r => !(num(r.qty_plants_ordered) > 0))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })),
  },
  {
    id: "need-price", category: "readiness", table: "scheduled_crops", severity: "warn",
    desc: "No sale price set",
    run: ({ sc }) => sc.filter(r => !(num(r.sale_price_per_pot) > 0))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })),
  },
  {
    id: "need-container", category: "readiness", table: "scheduled_crops", severity: "error",
    desc: "No container/pot assigned",
    run: ({ sc }) => sc.filter(r => !r.container_id)
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })),
  },
  {
    id: "need-weeks", category: "readiness", table: "scheduled_crops", severity: "error",
    desc: "Plant week or ship week not scheduled (must be 1–53)",
    run: ({ sc }) => sc.filter(r => badWeek(r.plant_week) || badWeek(r.ship_week))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — plant_wk=${r.plant_week} ship_wk=${r.ship_week}` })),
  },
  {
    id: "shortage", category: "readiness", table: "scheduled_crops", severity: "warn",
    desc: "Ordered > 0 but supplier confirmed 0 (won't be plantable)",
    run: ({ sc }) => sc.filter(r => num(r.qty_plants_ordered) > 0 && num(r.qty_plants_confirmed) === 0)
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — ordered ${r.qty_plants_ordered}, confirmed 0` })),
  },

  // ===== STRUCTURAL — "can this data exist safely?" (runs on COMPLETED_PLANS rows) =====
  {
    id: "sc-bad-qty", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "Standalone/parent item has qty_pots ≤ 0 or ppp ≤ 0 (combo components excluded)",
    run: ({ sc }) => sc.filter(r => !r.combo_parent_id && !r.is_combo_component && ((num(r.qty_pots) !== null && num(r.qty_pots) <= 0) || (num(r.ppp) !== null && num(r.ppp) <= 0)))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — pots=${r.qty_pots} ppp=${r.ppp}` })),
  },
  {
    id: "combo-orphan", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "Combo component points at a parent that doesn't exist",
    run: ({ sc, scIds }) => sc.filter(r => r.combo_parent_id && !scIds.has(r.combo_parent_id))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing parent ${r.combo_parent_id}` })),
  },
  {
    id: "combo-cross-plan", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "Combo component and its parent are in different plans",
    run: ({ sc, scById }) => sc.filter(r => r.combo_parent_id && scById.get(r.combo_parent_id) && scById.get(r.combo_parent_id).plan_id !== r.plan_id)
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — parent in a different plan` })),
  },
  {
    id: "combo-flag-mismatch", category: "structural", table: "scheduled_crops", severity: "warn",
    desc: "combo_parent_id and is_combo_component disagree",
    run: ({ sc }) => sc.filter(r => !!r.combo_parent_id !== !!r.is_combo_component)
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — parent=${!!r.combo_parent_id} flag=${!!r.is_combo_component}` })),
  },
  {
    id: "sc-orphan-variety", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "variety_id doesn't resolve to a variety_library row",
    run: ({ sc, varIds }) => varIds && sc.filter(r => r.variety_id && !varIds.has(r.variety_id))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing variety ${r.variety_id}` })),
  },
  {
    id: "sc-orphan-bench", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "bench_id doesn't resolve to a benches row",
    run: ({ sc, benchIds }) => benchIds && sc.filter(r => r.bench_id && !benchIds.has(r.bench_id))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing bench ${r.bench_id}` })),
  },
  {
    id: "sc-orphan-container", category: "structural", table: "scheduled_crops", severity: "error",
    desc: "container_id doesn't resolve to a containers row",
    run: ({ sc, contIds }) => contIds && sc.filter(r => r.container_id && !contIds.has(r.container_id))
      .map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing container ${r.container_id}` })),
  },

  // ===== STRUCTURAL — fall_program_items (always checked, background safety net) =====
  {
    id: "fp-orphan-container", category: "structural", table: "fall_program_items", severity: "error",
    desc: "Fall Program: container_id doesn't resolve to a containers row",
    run: ({ fp, contIds }) => contIds && fp.filter(r => r.container_id && !contIds.has(r.container_id))
      .map(r => ({ key: r.id, detail: `"${r._label}" (ord ${r.order_number}) → missing container ${r.container_id}` })),
  },
  {
    id: "fp-neg-qty", category: "structural", table: "fall_program_items", severity: "error",
    desc: "Fall Program: negative qty / ord_qty / extras, or ppp ≤ 0",
    run: ({ fp }) => fp.filter(r => num(r.qty) < 0 || num(r.ord_qty) < 0 || num(r.extras) < 0 || (num(r.ppp) !== null && num(r.ppp) <= 0))
      .map(r => ({ key: r.id, detail: `"${r._label}" qty=${r.qty} ord=${r.ord_qty} extras=${r.extras} ppp=${r.ppp}` })),
  },
  {
    id: "fp-active-no-qty", category: "structural", table: "fall_program_items", severity: "warn",
    desc: "Fall Program: active row on an order has neither qty nor ord_qty",
    run: ({ fp }) => fp.filter(r => !INACTIVE_FALL.has(r.status) && r.order_number && num(r.qty) === null && num(r.ord_qty) === null)
      .map(r => ({ key: r.id, detail: `"${r._label}" (ord ${r.order_number})` })),
  },
  {
    id: "fp-unknown-status", category: "structural", table: "fall_program_items", severity: "warn",
    desc: "Fall Program: status value outside the known vocabulary (data drift)",
    run: ({ fp }) => fp.filter(r => !KNOWN_FALL_STATUS.has(r.status))
      .map(r => ({ key: r.id, detail: `"${r._label}" status="${r.status}"` })),
  },
];

async function main() {
  const scope = process.argv.slice(2).length ? process.argv.slice(2) : COMPLETED_PLANS;
  console.log("🛰  Data-Integrity Sentinel (read-only)\n");

  const [scR, fpR, contR, varR, benchR, planR] = await Promise.all([
    fetchAll("scheduled_crops", "id,plan_id,variety_id,container_id,bench_id,combo_parent_id,is_combo_component,qty_pots,ppp,qty_plants_ordered,qty_plants_confirmed,sale_price_per_pot,plant_week,ship_week,status,item_name,color"),
    fetchAll("fall_program_items", "id,order_number,variety,status,qty,ord_qty,ppp,extras,container_id,year"),
    fetchAll("containers", "id"),
    fetchAll("variety_library", "id,crop_name,variety"),
    fetchAll("benches", "id"),
    fetchAll("production_plans", "id,name"),
  ]);

  const skipped = [];
  const allSc = scR.data || []; const fp = fpR.data || [];
  if (scR.error) { console.error("✖ could not read scheduled_crops:", scR.error); process.exit(1); }
  if (fpR.error) { console.error("✖ could not read fall_program_items:", fpR.error); process.exit(1); }
  if (contR.error) skipped.push("containers"); if (varR.error) skipped.push("variety_library"); if (benchR.error) skipped.push("benches");

  // Human-readable labels — UUIDs are useless to a grower.
  const varName = new Map((varR.data || []).map(v => [v.id, [v.crop_name, v.variety].filter(Boolean).join(" ").trim()]));
  const planName = new Map((planR.data || []).map(p => [p.id, p.name]));
  for (const r of allSc) {
    r.item_name = r.item_name || varName.get(r.variety_id) || r.color || `row ${r.id.slice(0, 8)}`;
    r._plan = planName.get(r.plan_id) || "—";
  }
  for (const r of fp) r._label = (r.variety || "").trim() || `row ${r.id.slice(0, 8)}`;

  // SCOPE: plan checks see only rows in the completed-plan list. Reference maps
  // (scIds/scById) stay global so combo-parent lookups still resolve.
  const sc = allSc.filter(r => scope.includes(r._plan));
  const ctx = {
    sc, fp,
    scIds: idSet(allSc), scById: new Map(allSc.map(r => [r.id, r])),
    contIds: contR.error ? null : idSet(contR.data),
    varIds: varR.error ? null : idSet(varR.data),
    benchIds: benchR.error ? null : idSet(benchR.data),
  };

  const allPlanNames = [...new Set(allSc.map(r => r._plan))];
  const missingScope = scope.filter(p => !allPlanNames.includes(p));
  console.log(`In scope: ${scope.join(", ")}  →  ${sc.length} item(s)   (edit COMPLETED_PLANS or pass plan names as args)`);
  if (missingScope.length) console.log(`⚠ no rows found for: ${missingScope.join(", ")}  (known plans: ${allPlanNames.join(", ")})`);
  console.log(`Fall Program safety net: ${fp.length} rows checked\n`);
  if (skipped.length) console.log(`⚠ skipped checks (couldn't read): ${skipped.join(", ")}\n`);

  const findings = [];
  for (const c of CHECKS) {
    for (const h of (c.run(ctx) || [])) findings.push({ check: c.id, category: c.category, severity: c.severity, desc: c.desc, ...h });
  }

  // Diff against last run → NEW / RESOLVED.
  const fid = f => `${f.check}::${f.key}`;
  const prev = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { findings: [] };
  const prevIds = new Set(prev.findings.map(fid));
  const isNew = f => !prevIds.has(fid(f));
  const nowIds = new Set(findings.map(fid));
  const resolved = prev.findings.filter(f => !nowIds.has(fid(f)));

  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => counts[f.severity]++);
  const newCount = findings.filter(isNew).length;

  if (!findings.length) {
    console.log("✅ Everything in scope is complete and structurally sound.\n");
  } else {
    console.log(`Found ${findings.length}: ${counts.error} 🔴 must-fix · ${counts.warn} 🟡 look · ${counts.info} 🔵 info   (${newCount} new since last run)\n`);
    const order = { error: 0, warn: 1, info: 2 };
    const sections = [["readiness", "📋 READINESS — finished items missing required info"], ["structural", "🧬 STRUCTURAL — data that can't exist safely"]];
    for (const [cat, heading] of sections) {
      const byCheck = {};
      for (const f of findings.filter(f => f.category === cat)) (byCheck[f.check] ||= []).push(f);
      const ids = Object.keys(byCheck).sort((a, b) => order[byCheck[a][0].severity] - order[byCheck[b][0].severity]);
      if (!ids.length) continue;
      console.log(`──── ${heading} ────`);
      for (const id of ids) {
        const g = byCheck[id];
        const icon = g[0].severity === "error" ? "🔴" : g[0].severity === "warn" ? "🟡" : "🔵";
        console.log(`${icon} ${g[0].desc} — ${g.length} item(s)`);
        g.slice(0, 12).forEach(f => console.log(`     ${isNew(f) ? "🆕 " : "   "}${f.detail}`));
        if (g.length > 12) console.log(`     …and ${g.length - 12} more`);
        console.log("");
      }
    }
  }
  if (resolved.length) console.log(`✔ ${resolved.length} finding(s) RESOLVED since last run.\n`);

  writeFileSync(STATE_PATH, JSON.stringify({ ranAt: new Date().toISOString(), scope, findings }, null, 2));
  console.log("State saved → scripts/.sentinel-state.json");
}

main().catch(e => { console.error("Sentinel crashed:", e); process.exit(1); });
