// Weekly inventory valuation — the bankability number, computed from the systems
// we already run (the banker's ask, 8/6/2026: track inventory weekly; value the
// material on hand at cost AND at a % of its projected revenue).
//
// GET  /api/inventory-snapshot          → compute now, return JSON (no save)
// GET  /api/inventory-snapshot?save=1   → compute + store a snapshot row
// Vercel cron (Mondays) hits ?save=1 so the history table accrues one row per week.
//
// Sections:
//  • Active production plans (Winter poinsettias, …) — v_scheduled_crops_pl view:
//    real per-row direct costs + revenue. The strongest numbers in the report.
//  • Fall Program — liner cost (tracked) + container cost (tracked) + a configurable
//    soil/inputs allowance per pot; revenue from category_pricing. Unpriced
//    categories are counted and REPORTED as a gap, never silently valued at zero.
//  • Houseplants — the latest physical count set from inventory_counts (manual).
//  • Hard goods — containers.stock_qty × cost_per_unit (the Pot Orders ledger).
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

async function pageAll(sb, table, select, mod) {
  let out = [];
  for (let off = 0; ; off += 1000) {
    let q = sb.from(table).select(select).range(off, off + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function setting(sb, key, fallback) {
  const { data } = await sb.from("cost_settings").select("value").eq("key", key).maybeSingle();
  const v = parseFloat(data?.value);
  return isNaN(v) ? fallback : v;
}

async function compute(sb) {
  const pct = await setting(sb, "inventory_valuation_pct", 66);
  const soilInputAllow = await setting(sb, "inv_soil_input_per_pot", 0.55);
  const sections = [];

  // ── active production plans (crops physically on the benches) ──
  const { data: plans } = await sb.from("production_plans").select("id,name,status").eq("status", "active");
  for (const plan of plans || []) {
    const rows = await pageAll(sb, "v_scheduled_crops_pl", "qty_pots,direct_cost_total,revenue,is_combo_component", q => q.eq("plan_id", plan.id));
    let units = 0, cost = 0, revenue = 0;
    rows.forEach(r => { if (r.is_combo_component) return; units += +r.qty_pots || 0; cost += +r.direct_cost_total || 0; revenue += +r.revenue || 0; });
    if (units > 0) sections.push({ key: `plan:${plan.id}`, label: plan.name, kind: "plan", units, cost, revenue, notes: "direct costs + sale prices from the plan's cost engine" });
  }

  // ── Fall Program ──
  const fp = await pageAll(sb, "fall_program_items", "category,qty,cost,container_cost,container_sku,status");
  const { data: pricing } = await sb.from("category_pricing").select("category,proposed_price");
  const priceMap = {};
  (pricing || []).forEach(p => { priceMap[String(p.category || "").trim().toUpperCase()] = parseFloat(p.proposed_price) || 0; });
  // authoritative per-pot container cost from the Containers catalog (fall rows'
  // container_cost column is MIXED GRAIN — some rows hold the per-pot price, some
  // the per-CASE price, which inflated containers ~$880k on first compute)
  const { data: conCat } = await sb.from("containers").select("sku,cost_per_unit");
  const conBySku = {};
  (conCat || []).forEach(c => { if (c.sku) conBySku[String(c.sku).trim().toUpperCase()] = +c.cost_per_unit || 0; });
  let fUnits = 0, fLiner = 0, fCont = 0, fRev = 0, unpricedUnits = 0;
  const unpricedCats = new Set();
  fp.forEach(r => {
    if (String(r.status || "").toUpperCase() === "CANCELLED") return;
    const q = +r.qty || 0;
    fUnits += q; fLiner += +r.cost || 0;
    const catalog = conBySku[String(r.container_sku || "").trim().toUpperCase()];
    const perPot = catalog != null && catalog > 0 ? catalog
      : (+r.container_cost > 0 && +r.container_cost <= 5 ? +r.container_cost : 0);   // sanity cap: no fall pot costs >$5
    fCont += q * perPot;
    const price = priceMap[String(r.category || "").trim().toUpperCase()];
    if (price > 0) fRev += q * price;
    else { unpricedUnits += q; unpricedCats.add(r.category || "?"); }
  });
  if (fUnits > 0) sections.push({
    key: "fall", label: "Fall Program (mums + fall crops)", kind: "fall",
    units: fUnits, cost: fLiner + fCont + fUnits * soilInputAllow, revenue: fRev,
    notes: `liner + container tracked; +$${soilInputAllow.toFixed(2)}/pot soil & inputs allowance`,
    gaps: unpricedUnits > 0 ? `${unpricedUnits.toLocaleString()} pots in ${unpricedCats.size} unpriced categories (${[...unpricedCats].join(", ")}) — revenue understated` : null,
  });

  // ── Houseplants: latest count set ──
  const counts = await pageAll(sb, "inventory_counts", "area,counted_on,units,est_value,cost_value", q => q.eq("area", "houseplants"));
  if (counts.length) {
    const latest = counts.map(c => c.counted_on).sort().pop();
    let hUnits = 0, hRev = 0, hCost = 0;
    counts.filter(c => c.counted_on === latest).forEach(c => { hUnits += +c.units || 0; hRev += +c.est_value || 0; hCost += +c.cost_value || 0; });
    sections.push({ key: "houseplants", label: `Houseplants (counted ${latest})`, kind: "count", units: hUnits, cost: hCost, revenue: hRev, notes: "physical count" });
  }

  // ── hard goods ──
  const { data: cons } = await sb.from("containers").select("stock_qty,cost_per_unit").gt("stock_qty", 0);
  let hgVal = 0, hgUnits = 0;
  (cons || []).forEach(c => { hgUnits += +c.stock_qty || 0; hgVal += (+c.stock_qty || 0) * (+c.cost_per_unit || 0); });
  if (hgVal > 0) sections.push({ key: "hardgoods", label: "Hard goods (pots & trays on hand)", kind: "hardgoods", units: hgUnits, cost: hgVal, revenue: null, notes: "at cost — not revenue-valued" });

  const totals = sections.reduce((a, s) => ({
    units: a.units + (s.kind === "hardgoods" ? 0 : (s.units || 0)),   // crop units only — empty pots aren't sellable units
    cost: a.cost + (s.cost || 0), revenue: a.revenue + (s.revenue || 0),
  }), { units: 0, cost: 0, revenue: 0 });
  totals.pct = pct;
  totals.valAtPct = Math.round(totals.revenue * pct / 100);          // % of projected revenue
  totals.costPlusPct = Math.round(totals.cost + totals.valAtPct);   // the banker's formula
  ["units", "cost", "revenue"].forEach(k => { totals[k] = Math.round(totals[k]); });
  sections.forEach(s => { ["units", "cost", "revenue"].forEach(k => { if (s[k] != null) s[k] = Math.round(s[k]); }); s.valAtPct = s.revenue != null ? Math.round(s.revenue * pct / 100) : null; });

  return { taken_at: new Date().toISOString(), totals, sections };
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Supabase env not configured" });
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  try {
    const snap = await compute(sb);
    const isCron = String(req.headers["user-agent"] || "").includes("vercel-cron") || req.headers["x-vercel-cron"];
    const wantSave = req.query?.save === "1" || isCron;
    if (wantSave) {
      const { error } = await sb.from("inventory_snapshots").insert({
        taken_at: snap.taken_at, totals: snap.totals, detail: snap.sections, source: isCron ? "cron" : "manual",
      });
      if (error) return res.status(500).json({ error: "compute ok, save failed: " + error.message, snap });
    }
    return res.status(200).json({ saved: !!wantSave, ...snap });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
};
