// api/_sentinel-core.js — shared, deterministic Data-Integrity checks.
// ---------------------------------------------------------------------------
// ONE source of truth for the verifier. Both the CLI (scripts/integrity-sentinel.mjs)
// and the morning cron (api/sentinel-cron.js) import this, so they can never drift.
// No DB client and no env here — the caller passes in a Supabase client. Read-only.
// ---------------------------------------------------------------------------

// >>> THE MANUAL CONTROL <<< add a plan the day you finish entering it.
const COMPLETED_PLANS_DEFAULT = ["Winter 2026"];

// Known status vocabulary for fall_program_items (from live data, not assumed).
const KNOWN_FALL_STATUS = new Set([
  null, "GOOD VARIETY", "CANCELLED", "NEVER USED", "TOP PERFORMER - BEST SELLER",
  "TOP PERFORMER", "BEST SELLER", "UNCLAIMED", "NOT NEEDED",
]);
const INACTIVE_FALL = new Set(["CANCELLED", "NEVER USED", "NOT NEEDED", "UNCLAIMED"]);

const idSet = rows => new Set((rows || []).map(r => r.id));
const num = v => (v === null || v === undefined || v === "" ? null : Number(v));
const badWeek = w => { const n = num(w); return n === null || n < 1 || n > 53; };

const SECTIONS = [
  ["readiness", "📋 READINESS — finished items missing required info"],
  ["structural", "🧬 STRUCTURAL — data that can't exist safely"],
];

// --- Check registry. Each is independent + deterministic. Keep HIGH-confidence. ---
const CHECKS = [
  // ===== READINESS (runs only on COMPLETED_PLANS rows) =====
  { id: "need-order", category: "readiness", severity: "error", desc: "No supplier order — nothing ordered to grow this item",
    run: ({ sc }) => sc.filter(r => !(num(r.qty_plants_ordered) > 0)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })) },
  { id: "need-price", category: "readiness", severity: "warn", desc: "No sale price set",
    run: ({ sc }) => sc.filter(r => !(num(r.sale_price_per_pot) > 0)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })) },
  { id: "need-container", category: "readiness", severity: "error", desc: "No container/pot assigned",
    run: ({ sc }) => sc.filter(r => !r.container_id).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}]` })) },
  { id: "need-weeks", category: "readiness", severity: "error", desc: "Plant week or ship week not scheduled (must be 1–53)",
    run: ({ sc }) => sc.filter(r => badWeek(r.plant_week) || badWeek(r.ship_week)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — plant_wk=${r.plant_week} ship_wk=${r.ship_week}` })) },
  { id: "shortage", category: "readiness", severity: "warn", desc: "Ordered > 0 but supplier confirmed 0 (won't be plantable)",
    run: ({ sc }) => sc.filter(r => num(r.qty_plants_ordered) > 0 && num(r.qty_plants_confirmed) === 0).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — ordered ${r.qty_plants_ordered}, confirmed 0` })) },

  // ===== STRUCTURAL — scheduled_crops (runs on COMPLETED_PLANS rows) =====
  { id: "sc-bad-qty", category: "structural", severity: "error", desc: "Standalone/parent item has qty_pots ≤ 0 or ppp ≤ 0 (combo components excluded)",
    run: ({ sc }) => sc.filter(r => !r.combo_parent_id && !r.is_combo_component && ((num(r.qty_pots) !== null && num(r.qty_pots) <= 0) || (num(r.ppp) !== null && num(r.ppp) <= 0))).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — pots=${r.qty_pots} ppp=${r.ppp}` })) },
  { id: "combo-orphan", category: "structural", severity: "error", desc: "Combo component points at a parent that doesn't exist",
    run: ({ sc, scIds }) => sc.filter(r => r.combo_parent_id && !scIds.has(r.combo_parent_id)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing parent ${r.combo_parent_id}` })) },
  { id: "combo-cross-plan", category: "structural", severity: "error", desc: "Combo component and its parent are in different plans",
    run: ({ sc, scById }) => sc.filter(r => r.combo_parent_id && scById.get(r.combo_parent_id) && scById.get(r.combo_parent_id).plan_id !== r.plan_id).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — parent in a different plan` })) },
  { id: "combo-flag-mismatch", category: "structural", severity: "warn", desc: "combo_parent_id and is_combo_component disagree",
    run: ({ sc }) => sc.filter(r => !!r.combo_parent_id !== !!r.is_combo_component).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] — parent=${!!r.combo_parent_id} flag=${!!r.is_combo_component}` })) },
  { id: "sc-orphan-variety", category: "structural", severity: "error", desc: "variety_id doesn't resolve to a variety_library row",
    run: ({ sc, varIds }) => varIds && sc.filter(r => r.variety_id && !varIds.has(r.variety_id)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing variety ${r.variety_id}` })) },
  { id: "sc-orphan-bench", category: "structural", severity: "error", desc: "bench_id doesn't resolve to a benches row",
    run: ({ sc, benchIds }) => benchIds && sc.filter(r => r.bench_id && !benchIds.has(r.bench_id)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing bench ${r.bench_id}` })) },
  { id: "sc-orphan-container", category: "structural", severity: "error", desc: "container_id doesn't resolve to a containers row",
    run: ({ sc, contIds }) => contIds && sc.filter(r => r.container_id && !contIds.has(r.container_id)).map(r => ({ key: r.id, detail: `${r.item_name} [${r._plan}] → missing container ${r.container_id}` })) },

  // ===== STRUCTURAL — fall_program_items (always checked, background safety net) =====
  { id: "fp-orphan-container", category: "structural", severity: "error", desc: "Fall Program: container_id doesn't resolve to a containers row",
    run: ({ fp, contIds }) => contIds && fp.filter(r => r.container_id && !contIds.has(r.container_id)).map(r => ({ key: r.id, detail: `"${r._label}" (ord ${r.order_number}) → missing container ${r.container_id}` })) },
  { id: "fp-neg-qty", category: "structural", severity: "error", desc: "Fall Program: negative qty / ord_qty / extras, or ppp ≤ 0",
    run: ({ fp }) => fp.filter(r => num(r.qty) < 0 || num(r.ord_qty) < 0 || num(r.extras) < 0 || (num(r.ppp) !== null && num(r.ppp) <= 0)).map(r => ({ key: r.id, detail: `"${r._label}" qty=${r.qty} ord=${r.ord_qty} extras=${r.extras} ppp=${r.ppp}` })) },
  { id: "fp-active-no-qty", category: "structural", severity: "warn", desc: "Fall Program: active row on an order has neither qty nor ord_qty",
    run: ({ fp }) => fp.filter(r => !INACTIVE_FALL.has(r.status) && r.order_number && num(r.qty) === null && num(r.ord_qty) === null).map(r => ({ key: r.id, detail: `"${r._label}" (ord ${r.order_number})` })) },
  { id: "fp-unknown-status", category: "structural", severity: "warn", desc: "Fall Program: status value outside the known vocabulary (data drift)",
    run: ({ fp }) => fp.filter(r => !KNOWN_FALL_STATUS.has(r.status)).map(r => ({ key: r.id, detail: `"${r._label}" status="${r.status}"` })) },
];

// Supabase caps a select at 1000 rows — page or the checker has blind spots.
async function fetchAll(sb, table, columns, filter) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) return { error: error.message };
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return { data: out };
}
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Run every check against a Supabase client; returns a structured report. Read-only.
async function runSentinel(sb, scope = COMPLETED_PLANS_DEFAULT) {
  const [scR, fpR, contR, varR, benchR, planR] = await Promise.all([
    fetchAll(sb, "scheduled_crops", "id,plan_id,variety_id,container_id,bench_id,combo_parent_id,is_combo_component,qty_pots,ppp,qty_plants_ordered,qty_plants_confirmed,sale_price_per_pot,plant_week,ship_week,status,item_name,color"),
    fetchAll(sb, "fall_program_items", "id,order_number,variety,status,qty,ord_qty,ppp,extras,container_id,year"),
    fetchAll(sb, "containers", "id"),
    fetchAll(sb, "variety_library", "id,crop_name,variety"),
    fetchAll(sb, "benches", "id"),
    fetchAll(sb, "production_plans", "id,name"),
  ]);
  if (scR.error) throw new Error("read scheduled_crops: " + scR.error);
  if (fpR.error) throw new Error("read fall_program_items: " + fpR.error);

  const skipped = [];
  if (contR.error) skipped.push("containers"); if (varR.error) skipped.push("variety_library"); if (benchR.error) skipped.push("benches");

  const allSc = scR.data || []; const fp = fpR.data || [];
  const varName = new Map((varR.data || []).map(v => [v.id, [v.crop_name, v.variety].filter(Boolean).join(" ").trim()]));
  const planName = new Map((planR.data || []).map(p => [p.id, p.name]));
  for (const r of allSc) {
    r.item_name = r.item_name || varName.get(r.variety_id) || r.color || `row ${r.id.slice(0, 8)}`;
    r._plan = planName.get(r.plan_id) || "—";
  }
  for (const r of fp) r._label = (r.variety || "").trim() || `row ${r.id.slice(0, 8)}`;

  const sc = allSc.filter(r => scope.includes(r._plan)); // plan checks see only completed plans
  const ctx = {
    sc, fp,
    scIds: idSet(allSc), scById: new Map(allSc.map(r => [r.id, r])),
    contIds: contR.error ? null : idSet(contR.data),
    varIds: varR.error ? null : idSet(varR.data),
    benchIds: benchR.error ? null : idSet(benchR.data),
  };

  const findings = [];
  for (const c of CHECKS) for (const h of (c.run(ctx) || [])) findings.push({ check: c.id, category: c.category, severity: c.severity, desc: c.desc, ...h });

  const knownPlans = [...new Set(allSc.map(r => r._plan))];
  return {
    scope, knownPlans, missingScope: scope.filter(p => !knownPlans.includes(p)),
    inScopeCount: sc.length, fpCount: fp.length, skipped, findings,
  };
}

// Collapse identical detail lines within a check (e.g. 7 bench rows of one variety → ×7).
function collapse(items) {
  const m = new Map();
  for (const f of items) {
    const e = m.get(f.detail) || { detail: f.detail, count: 0, keys: [] };
    e.count++; e.keys.push(f.key); m.set(f.detail, e);
  }
  return [...m.values()];
}
const groupByCheck = fs => { const o = {}; for (const f of fs) (o[f.check] ||= []).push(f); return o; };
const sevOrder = { error: 0, warn: 1, info: 2 };
const icon = s => (s === "error" ? "🔴" : s === "warn" ? "🟡" : "🔵");

// Plain-text render for the CLI (with new/resolved markers from a prior snapshot).
function renderText(report, prevFindings = [], cap = 50) {
  const fid = f => `${f.check}::${f.key}`;
  const prevIds = new Set(prevFindings.map(fid));
  const nowIds = new Set(report.findings.map(fid));
  const resolved = prevFindings.filter(f => !nowIds.has(fid(f)));
  const L = [];
  L.push(`In scope: ${report.scope.join(", ")}  →  ${report.inScopeCount} item(s)   (edit COMPLETED_PLANS or pass plan names as args)`);
  if (report.missingScope.length) L.push(`⚠ no rows found for: ${report.missingScope.join(", ")}  (known plans: ${report.knownPlans.join(", ")})`);
  L.push(`Fall Program safety net: ${report.fpCount} rows checked`);
  if (report.skipped.length) L.push(`⚠ skipped checks (couldn't read): ${report.skipped.join(", ")}`);
  L.push("");
  if (!report.findings.length) { L.push("✅ Everything in scope is complete and structurally sound."); }
  else {
    const counts = { error: 0, warn: 0, info: 0 }; report.findings.forEach(f => counts[f.severity]++);
    const newCount = report.findings.filter(f => !prevIds.has(fid(f))).length;
    L.push(`Found ${report.findings.length}: ${counts.error} 🔴 must-fix · ${counts.warn} 🟡 look · ${counts.info} 🔵 info   (${newCount} new since last run)`); L.push("");
    for (const [cat, heading] of SECTIONS) {
      const byCheck = groupByCheck(report.findings.filter(f => f.category === cat));
      const ids = Object.keys(byCheck).sort((a, b) => sevOrder[byCheck[a][0].severity] - sevOrder[byCheck[b][0].severity]);
      if (!ids.length) continue;
      L.push(`──── ${heading} ────`);
      for (const id of ids) {
        const g = byCheck[id]; const rows = collapse(g);
        L.push(`${icon(g[0].severity)} ${g[0].desc} — ${g.length} item(s)`);
        rows.slice(0, cap).forEach(c => {
          const isNew = c.keys.some(k => !prevIds.has(`${id}::${k}`));
          L.push(`     ${isNew ? "🆕 " : "   "}${c.detail}${c.count > 1 ? `  ×${c.count}` : ""}`);
        });
        if (rows.length > cap) L.push(`     …and ${rows.length - cap} more`);
        L.push("");
      }
    }
  }
  if (resolved.length) L.push(`✔ ${resolved.length} finding(s) RESOLVED since last run.`);
  return L.join("\n");
}

// HTML render for the morning email (collapsed per variety, no new/resolved — stateless).
function renderHtml(report) {
  const counts = { error: 0, warn: 0, info: 0 }; report.findings.forEach(f => counts[f.severity]++);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const chip = (n, c, lbl) => `<span style="display:inline-block;background:${c};color:#fff;border-radius:12px;padding:2px 10px;font-size:13px;font-weight:700;margin-right:6px;">${n} ${lbl}</span>`;
  let body = "";
  if (!report.findings.length) {
    body = `<p style="font-size:16px;color:#1e2d1a;">✅ Everything in scope is complete and structurally sound.</p>`;
  } else {
    for (const [cat, heading] of SECTIONS) {
      const byCheck = groupByCheck(report.findings.filter(f => f.category === cat));
      const ids = Object.keys(byCheck).sort((a, b) => sevOrder[byCheck[a][0].severity] - sevOrder[byCheck[b][0].severity]);
      if (!ids.length) continue;
      body += `<h3 style="color:#1e2d1a;border-bottom:2px solid #7fb069;padding-bottom:4px;margin:20px 0 10px;">${esc(heading)}</h3>`;
      for (const id of ids) {
        const g = byCheck[id]; const rows = collapse(g);
        const dot = g[0].severity === "error" ? "🔴" : "🟡";
        body += `<div style="margin:0 0 12px;"><div style="font-weight:700;color:#1e2d1a;">${dot} ${esc(g[0].desc)} — ${g.length}</div><ul style="margin:4px 0 0;padding-left:22px;color:#3a4a34;font-size:14px;">`;
        rows.slice(0, 50).forEach(c => { body += `<li>${esc(c.detail)}${c.count > 1 ? ` <b>×${c.count}</b>` : ""}</li>`; });
        if (rows.length > 50) body += `<li>…and ${rows.length - 50} more</li>`;
        body += `</ul></div>`;
      }
    }
  }
  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#f2f5ef;">
    <div style="background:#1e2d1a;color:#c8e6b8;padding:18px 22px;border-radius:10px 10px 0 0;">
      <div style="font-size:13px;letter-spacing:1px;color:#7fb069;text-transform:uppercase;font-weight:700;">Schlegel Greenhouse · Plan Sentinel</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">🛰 Daily plan check</div>
    </div>
    <div style="background:#fff;padding:22px;border-radius:0 0 10px 10px;font-size:15px;color:#1e2d1a;line-height:1.55;">
      <p style="margin:0 0 6px;color:#7a8c74;font-size:13px;">In scope: <b>${esc(report.scope.join(", "))}</b> (${report.inScopeCount} items) · Fall Program safety net: ${report.fpCount} rows</p>
      <p style="margin:0 0 14px;">${chip(counts.error, "#d94f3d", "must-fix")}${chip(counts.warn, "#e89a3a", "look")}</p>
      ${body}
      <p style="margin-top:22px;color:#7a8c74;font-size:12px;">Read-only check. To change which plans are watched, edit <code>COMPLETED_PLANS_DEFAULT</code> in api/_sentinel-core.js.</p>
    </div>
  </div>`;
}

// =====================================================================================
// LOOP B — Supplier order reconciliation (read-only): per order_number, ordered vs confirmed.
// =====================================================================================
async function runOrderRecon(sb) {
  const r = await fetchAll(sb, "fall_program_items", "order_number,variety,status,qty,ord_qty,ppp,extras");
  if (r.error) throw new Error("read fall_program_items: " + r.error);
  const orders = new Map();
  for (const row of r.data.filter(x => x.order_number)) {
    const o = orders.get(row.order_number) || { ordered: 0, confirmed: 0, extras: 0, lines: 0, cancelled: 0, shortages: new Map() };
    o.lines++;
    if (INACTIVE_FALL.has(row.status)) { if (row.status === "CANCELLED") o.cancelled++; orders.set(row.order_number, o); continue; }
    const ordered = num(row.ord_qty) || 0;
    const confirmed = (num(row.qty) || 0) * (num(row.ppp) || 1);
    o.ordered += ordered; o.confirmed += confirmed; o.extras += num(row.extras) || 0;
    if (ordered > 0 && confirmed < ordered) { // collapse bench rows per variety
      const e = o.shortages.get(row.variety) || { ordered: 0, confirmed: 0 };
      e.ordered += ordered; e.confirmed += confirmed; o.shortages.set(row.variety, e);
    }
    orders.set(row.order_number, o);
  }
  const list = [...orders.entries()].map(([order, o]) => ({
    order, ordered: o.ordered, confirmed: o.confirmed, extras: o.extras, lines: o.lines, cancelled: o.cancelled,
    delta: o.ordered - o.confirmed,
    shortages: [...o.shortages.entries()].map(([variety, s]) => ({ variety, ...s, short: s.ordered - s.confirmed })).sort((a, b) => b.short - a.short),
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { orders: list, mismatched: list.filter(o => o.delta !== 0).length };
}

function renderReconText(recon) {
  const L = [`${recon.orders.length} order(s) · ${recon.mismatched} with an ordered≠confirmed gap`, ""];
  for (const o of recon.orders) {
    const flag = o.delta > 0 ? "🔴 SHORT" : o.delta < 0 ? "🟡 OVER" : "✅";
    L.push(`${flag}  Order ${o.order}  —  ordered ${o.ordered} · confirmed ${o.confirmed}${o.delta ? ` · delta ${o.delta > 0 ? "+" : ""}${o.delta}` : ""}${o.cancelled ? ` · ${o.cancelled} cancelled` : ""}${o.extras ? ` · ${o.extras} extras` : ""}  (${o.lines} lines)`);
    o.shortages.slice(0, 8).forEach(s => L.push(`        ↳ ${s.variety}: ordered ${s.ordered}, confirmed ${s.confirmed} (short ${s.short})`));
    if (o.shortages.length > 8) L.push(`        ↳ …and ${o.shortages.length - 8} more short varieties`);
  }
  return L.join("\n");
}

// =====================================================================================
// LOOP C — Culture-guide link matching (deterministic genus + series + color).
// =====================================================================================
const cNorm = s => (s || "").toUpperCase().replace(/[™®]/g, "").replace(/\bSERIES\b/g, " ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const cToks = s => cNorm(s).split(" ").filter(w => w.length > 2);
const cOverlap = (need, hay) => { const h = new Set(hay); const got = need.filter(t => h.has(t)); return need.length ? got.length / need.length : 0; };

function classifyLink(v, candidates) {
  const vTokens = cToks([v.series, v.variety].filter(Boolean).join(" "));
  let best = null;
  for (const c of candidates) {
    const seriesT = cToks(c.series_name), varT = cToks(c.series_variety);
    const exact = cNorm([c.series_name, c.series_variety].join(" ")) === cNorm([v.series, v.variety].filter(Boolean).join(" "));
    const varScore = cOverlap(varT, vTokens), seriesScore = cOverlap(seriesT, vTokens);
    const viable = exact || seriesScore > 0; // series must appear — color-only overlap is a false match
    const score = exact ? 2 : seriesScore * 0.6 + varScore * 0.4;
    if (viable && (!best || score > best.score)) best = { c, score, exact, varScore, seriesScore };
  }
  if (!best) return { tier: "NONE", best: null };
  let tier;
  if (best.exact || (best.seriesScore >= 0.5 && best.varScore >= 1)) tier = "HIGH";
  else if (best.seriesScore >= 0.5 && best.varScore >= 0.5) tier = "MEDIUM";
  else tier = "NONE";
  return { tier, best };
}

async function runCultureLink(mainSb, cultureSb) {
  const u = await fetchAll(mainSb, "variety_library", "id,crop_name,series,variety,breeder", q => q.is("culture_source_id", null));
  if (u.error) throw new Error("read variety_library: " + u.error);
  const g = await fetchAll(cultureSb, "culture_guides_public", "id,crop_name,series_name,series_variety,breeder_name");
  if (g.error) throw new Error("read culture_guides_public: " + g.error);
  const byCrop = new Map();
  for (const guide of g.data) { const k = cNorm(guide.crop_name); if (!byCrop.has(k)) byCrop.set(k, []); byCrop.get(k).push(guide); }
  const tiers = { HIGH: [], MEDIUM: [], NONE: [] };
  for (const v of u.data) {
    const candidates = byCrop.get(cNorm(v.crop_name)) || [];
    const { tier, best } = candidates.length ? classifyLink(v, candidates) : { tier: "NONE", best: null };
    tiers[tier].push({
      variety_id: v.id, label: `${v.crop_name} ${v.variety}`,
      match: best ? `${best.c.crop_name} ${best.c.series_name || ""} ${best.c.series_variety || ""}`.replace(/\s+/g, " ").trim() : null,
      culture_id: best ? best.c.id : null,
    });
  }
  return { tiers, unlinked: u.data.length, guides: g.data.length };
}

function renderCultureText(link) {
  const L = [`${link.unlinked} unlinked varieties · ${link.guides} culture guides`, ""];
  const show = (tier, icon, note) => {
    const list = link.tiers[tier]; if (!list.length) return;
    L.push(`${icon} ${tier} — ${list.length} (${note})`);
    list.slice(0, 25).forEach(p => L.push(`     ${p.label}${p.match ? `  →  ${p.match}` : ""}`));
    if (list.length > 25) L.push(`     …and ${list.length - 25} more`);
    L.push("");
  };
  show("HIGH", "🟢", "series + every color token align — confirm, then --apply");
  show("MEDIUM", "🟡", "series matches, color partial — review");
  show("NONE", "⚪", "no confident match — genus missing OR series names differ");
  return L.join("\n");
}

// =====================================================================================
// Combined morning email — Plan readiness (A) + Order reconciliation (B) + Culture links (C).
// recon/link may be null (failed or skipped) → that section shows a note instead.
// =====================================================================================
function sectionWrap(title, inner) {
  return `<h3 style="color:#1e2d1a;border-bottom:2px solid #7fb069;padding-bottom:4px;margin:24px 0 10px;">${esc(title)}</h3>${inner}`;
}
function sentinelBody(report) {
  if (!report.findings.length) return `<p style="color:#1e2d1a;">✅ Everything in scope is complete and structurally sound.</p>`;
  let b = `<p style="margin:0 0 10px;color:#7a8c74;font-size:13px;">Scope: <b>${esc(report.scope.join(", "))}</b> (${report.inScopeCount} items)</p>`;
  for (const [cat, heading] of SECTIONS) {
    const byCheck = groupByCheck(report.findings.filter(f => f.category === cat));
    const ids = Object.keys(byCheck).sort((a, b) => sevOrder[byCheck[a][0].severity] - sevOrder[byCheck[b][0].severity]);
    if (!ids.length) continue;
    b += `<div style="font-weight:700;color:#3a4a34;margin:8px 0 4px;">${esc(heading)}</div>`;
    for (const id of ids) {
      const g = byCheck[id], rows = collapse(g), dot = g[0].severity === "error" ? "🔴" : "🟡";
      b += `<div style="margin:0 0 8px;"><div style="color:#1e2d1a;">${dot} ${esc(g[0].desc)} — ${g.length}</div><ul style="margin:2px 0 0;padding-left:22px;color:#3a4a34;font-size:14px;">`;
      rows.slice(0, 40).forEach(c => { b += `<li>${esc(c.detail)}${c.count > 1 ? ` <b>×${c.count}</b>` : ""}</li>`; });
      if (rows.length > 40) b += `<li>…and ${rows.length - 40} more</li>`;
      b += `</ul></div>`;
    }
  }
  return b;
}
function reconBody(recon) {
  if (!recon) return `<p style="color:#7a8c74;">(couldn't run — see logs)</p>`;
  if (!recon.mismatched) return `<p style="color:#1e2d1a;">✅ All ${recon.orders.length} orders reconcile (ordered = confirmed).</p>`;
  let b = `<p style="margin:0 0 6px;color:#1e2d1a;">${recon.mismatched} of ${recon.orders.length} orders have an ordered≠confirmed gap:</p><ul style="margin:0;padding-left:22px;color:#3a4a34;font-size:14px;">`;
  recon.orders.filter(o => o.delta !== 0).slice(0, 20).forEach(o => {
    const dot = o.delta > 0 ? "🔴" : "🟡";
    b += `<li>${dot} <b>Order ${esc(o.order)}</b> — ordered ${o.ordered}, confirmed ${o.confirmed} (${o.delta > 0 ? "short " + o.delta : "over " + (-o.delta)})${o.shortages.length ? `; top short: ${esc(o.shortages[0].variety)} −${o.shortages[0].short}` : ""}</li>`;
  });
  b += `</ul>`;
  return b;
}
function cultureBody(link) {
  if (!link) return `<p style="color:#7a8c74;">(skipped — culture DB credentials not configured)</p>`;
  const h = link.tiers.HIGH, m = link.tiers.MEDIUM;
  let b = `<p style="margin:0 0 6px;color:#1e2d1a;"><b>${h.length}</b> confident (HIGH) · ${m.length} to review (MEDIUM) · ${link.tiers.NONE.length} no match, of ${link.unlinked} unlinked.</p>`;
  if (h.length) {
    b += `<div style="color:#3a4a34;font-size:14px;">Confident links (run <code>node scripts/culture-link.mjs --apply</code> to write):<ul style="margin:2px 0 0;padding-left:22px;">`;
    h.slice(0, 25).forEach(p => { b += `<li>${esc(p.label)} → ${esc(p.match)}</li>`; });
    b += `</ul></div>`;
  }
  return b;
}
function proposalsBody(proposals) {
  if (!proposals || !proposals.length) return null; // section omitted entirely when nothing to approve
  let b = `<p style="margin:0 0 8px;color:#1e2d1a;"><b>${proposals.length}</b> new acknowledgement PDF(s) ready to apply — review &amp; approve:</p>`;
  for (const p of proposals) {
    const c = (p.risk && p.risk.counts) || {};
    const flags = ((p.risk && p.risk.flags) || []).map(f => `<div style="color:#d94f3d;font-size:13px;">⚠ ${esc(f)}</div>`).join("");
    b += `<div style="border:1px solid #e0e8d8;border-radius:8px;padding:10px 12px;margin:0 0 10px;">
      <div style="font-weight:700;">Order ${esc(p.orderNumber)} <span style="color:#7a8c74;font-weight:400;font-size:13px;">${esc(p.storagePath)}</span></div>
      <div style="font-size:13px;color:#3a4a34;">${c.updated || 0} updated · ${c.cancelled || 0} cancelled · ${c.inserted || 0} new</div>${flags}
      <a href="${esc(p.approveUrl)}" style="display:inline-block;margin-top:8px;background:#1e2d1a;color:#c8e6b8;text-decoration:none;padding:8px 16px;border-radius:6px;font-weight:700;font-size:14px;">Review &amp; approve →</a>
    </div>`;
  }
  return b;
}
function renderEmailHtml({ sentinel, recon, link, proposals }) {
  const counts = { error: 0, warn: 0 }; sentinel.findings.forEach(f => { if (counts[f.severity] != null) counts[f.severity]++; });
  const chip = (n, c, lbl) => `<span style="display:inline-block;background:${c};color:#fff;border-radius:12px;padding:2px 10px;font-size:13px;font-weight:700;margin-right:6px;">${n} ${lbl}</span>`;
  const pBody = proposalsBody(proposals);
  return `
  <div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;padding:24px;background:#f2f5ef;">
    <div style="background:#1e2d1a;color:#c8e6b8;padding:18px 22px;border-radius:10px 10px 0 0;">
      <div style="font-size:13px;letter-spacing:1px;color:#7fb069;text-transform:uppercase;font-weight:700;">Schlegel Greenhouse · Ops Sentinel</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">🛰 Daily ops check</div>
    </div>
    <div style="background:#fff;padding:22px;border-radius:0 0 10px 10px;font-size:15px;color:#1e2d1a;line-height:1.55;">
      <p style="margin:0 0 14px;">${chip(counts.error, "#d94f3d", "plan must-fix")}${chip(counts.warn, "#e89a3a", "plan look")}${chip(recon ? recon.mismatched : "—", "#7a8c74", "order gaps")}${pBody ? chip(proposals.length, "#5a7d3a", "to approve") : ""}${chip(link ? link.tiers.HIGH.length : "—", "#7fb069", "links ready")}</p>
      ${pBody ? sectionWrap("📥 Supplier acknowledgements to approve (B)", pBody) : ""}
      ${sectionWrap("📋 Plan readiness (A)", sentinelBody(sentinel))}
      ${sectionWrap("📦 Order reconciliation (B)", reconBody(recon))}
      ${sectionWrap("🔗 Culture-guide links (C)", cultureBody(link))}
      <p style="margin-top:22px;color:#7a8c74;font-size:12px;">Read-only report except approvals you click. Watched plans: edit <code>COMPLETED_PLANS_DEFAULT</code> in api/_sentinel-core.js.</p>
    </div>
  </div>`;
}

module.exports = {
  CHECKS, COMPLETED_PLANS_DEFAULT, collapse,
  runSentinel, renderText, renderHtml,
  runOrderRecon, renderReconText,
  runCultureLink, classifyLink, renderCultureText,
  renderEmailHtml,
};
