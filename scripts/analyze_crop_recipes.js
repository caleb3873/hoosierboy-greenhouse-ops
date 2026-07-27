#!/usr/bin/env node
/* Read-only analysis for the crop-recipe seed (crop-recipe-model).
 * Groups scheduled_crops into crop × size recipes and reconciles the THREE
 * seed sources: (1) prop_guides.overrides, (2) observed per-group facts,
 * (3) docs/plans/spring-plan.json pot economics. WRITES NOTHING — prints a
 * dry-run report so we can finalize the crop_recipes schema before migrating.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase", "supabase-js"));

// env
const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach(l => {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

// ── size grain — mirror of src/shared.js sizeLabelForItem (keep in sync) ──
function sizeLabelForItem(name) {
  const s = String(name || "").trim().toUpperCase(); let m;
  if ((m = s.match(/^HB\s*(\d+(?:\.\d+)?)/))) return `HB ${m[1]}"`;
  if ((m = s.match(/^POT\s*(\d+(?:\.\d+)?)/))) return `POT ${m[1]}"`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"\s*POT\b/))) return `POT ${m[1]}"`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*BLOOM\b/))) return `${m[1]} BLOOM`;
  if ((m = s.match(/^BOWL\s*(\d+(?:\.\d+)?)?/)) && /^BOWL/.test(s)) return m[1] ? `BOWL ${m[1]}"` : "BOWL";
  if ((m = s.match(/^FIBER\s*(LG|LARGE|SM|SMALL|MED|MD)?/)) && /^FIBER/.test(s)) { const q = m[1] || ""; return q ? `FIBER ${q[0] === "S" ? "SM." : q[0] === "M" ? "MED." : "LG."}` : "FIBER"; }
  if (/^1801L/.test(s)) return "1801L";
  if (/^1801S/.test(s)) return "1801S";
  if (/^1801/.test(s)) return "1801";
  if (/^MARKET/.test(s)) return "MARKET BASKET";
  if ((m = s.match(/^(\d+)\s*CELL/))) return `${m[1]} CELL`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"\s*BLOOM BUDD/))) return `${m[1]}" BLOOM BUDDY`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"/))) return parseFloat(m[1]) >= 8 ? `${m[1]}" CUSTOM` : `${m[1]}"`;
  return (s.match(/^[A-Z]+/) || ["—"])[0];
}

const mode = arr => { const c = {}; arr.filter(x => x != null && x !== "").forEach(x => c[x] = (c[x] || 0) + 1); const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? { val: e[0][0], n: e[0][1], distinct: e.length } : { val: null, n: 0, distinct: 0 }; };
const median = arr => { const a = arr.filter(x => x != null).map(Number).filter(x => !Number.isNaN(x)).sort((x, y) => x - y); if (!a.length) return null; const mid = Math.floor(a.length / 2); return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2); };

async function pageAll(table, cols, filter) {
  const out = []; for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).range(from, from + 999); if (filter) q = filter(q);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  } return out;
}

(async () => {
  console.log("Loading…");
  const sc = await pageAll("scheduled_crops", "id,plan_id,item_name,variety_id,prop_method,prop_tray_id,prop_tray_size,container_id,broker,supplier,liner_unit_cost,crop_weeks,plant_week,ship_week,ppp,is_combo_component");
  const vars = await pageAll("variety_library", "id,crop_name,variety,variety_key");
  const vmap = Object.fromEntries(vars.map(v => [v.id, v]));
  const { data: pg } = await sb.from("prop_guides").select("guide_key,overrides");
  const guide = Object.fromEntries((pg || []).map(r => [r.guide_key, r.overrides || {}]));
  const { data: conts } = await sb.from("containers").select("id,name,kind,type,diameter_in,fill_volume_cu_ft,cells_per_flat,cost_per_unit,has_tray,has_wire,has_carrier");
  const cmap = Object.fromEntries((conts || []).map(c => [c.id, c]));
  const spring = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "plans", "spring-plan.json"), "utf8"));
  const potVol = spring.pot_volumes_cuft || {};

  // form tag from a container's name/kind (HB / Pot / Pan / Bowl / Fiber / Tray)
  const formTag = c => {
    const s = `${c?.name || ""} ${c?.kind || ""} ${c?.type || ""}`.toUpperCase();
    if (/HANG|\bHB\b|BASKET/.test(s)) return "HB";
    if (/\bPAN\b/.test(s)) return "Pan";
    if (/BOWL/.test(s)) return "Bowl";
    if (/FIBER/.test(s)) return "Fiber";
    if (/TRAY|CELL|PLUG|FLAT/.test(s)) return "Tray";
    return "Pot";
  };
  // recipe size — derived from the CONTAINER (100% populated), item-name parse only as fallback
  const normalizeSize = (c, itemName) => {
    if (c && c.diameter_in != null && c.diameter_in !== "") return `${(+c.diameter_in).toString().replace(/\.0$/, "")}" ${formTag(c)}`;
    const s = sizeLabelForItem(itemName); if (s && s !== "—") return s;
    return c ? (c.name || "—") : "—";
  };
  const parts = c => (c ? ((c.has_tray ? 1 : 0) + (c.has_wire ? 1 : 0) + (c.has_carrier ? 1 : 0)) : 0);

  // group by crop × size-from-container (skip pure combo-component rows — they belong to a parent item)
  const groups = {};
  for (const r of sc) {
    const v = vmap[r.variety_id]; if (!v || !v.crop_name) continue;
    if (r.is_combo_component) continue;
    const size = normalizeSize(cmap[r.container_id], r.item_name);
    const key = `${v.crop_name}||${size}`;
    (groups[key] = groups[key] || { crop: v.crop_name, size, rows: [], sample_item: r.item_name }).rows.push(r);
  }

  const recipes = [];
  for (const g of Object.values(groups)) {
    const rows = g.rows;
    const cw = median(rows.map(r => r.crop_weeks).filter(x => x != null && x >= 1 && x <= 60));
    const pm = mode(rows.map(r => r.prop_method));
    const tray = mode(rows.map(r => r.prop_tray_id));
    const trayText = mode(rows.map(r => r.prop_tray_size));
    const cont = mode(rows.map(r => r.container_id));
    const brk = mode(rows.map(r => r.broker));
    const sup = mode(rows.map(r => r.supplier));
    const gk = g.crop.toLowerCase().trim();
    const ov = guide[gk] || {};
    // per-variety tweak: varieties whose crop_weeks deviate >2 wk from group median
    const byVar = {};
    rows.forEach(r => { if (r.crop_weeks != null && r.crop_weeks >= 1 && r.crop_weeks <= 60) (byVar[r.variety_id] = byVar[r.variety_id] || []).push(r.crop_weeks); });
    const tweaks = Object.entries(byVar).map(([vid, list]) => ({ variety: vmap[vid]?.variety, vw: median(list) })).filter(t => cw != null && t.vw != null && Math.abs(t.vw - cw) > 2);
    const dc = cmap[cont.val] || null;   // dominant container of the group
    const hasVol = dc && dc.fill_volume_cu_ft != null;
    recipes.push({
      crop: g.crop, size: g.size, rows: rows.length, plans: new Set(rows.map(r => r.plan_id)).size,
      crop_weeks: cw, prop_method: pm.val, method_conflict: pm.distinct > 1,
      tray_id: tray.val, tray_text: trayText.val, tray_from_guide: ov.tray || null,
      container: dc?.name || null, container_conflict: cont.distinct > 1,
      broker: brk.val, supplier: sup.val,
      guide_rooting: ov.rooting_weeks ?? null, guide_pinch: ov.pinch ?? null, guide_treatment: ov.prop_treatment ?? null,
      econ_vol: hasVol, econ_parts: parts(dc), econ_cost: dc && dc.cost_per_unit ? true : false,
      tweaks: tweaks.length, tweak_names: tweaks.map(t => `${t.variety}(${t.vw})`).slice(0, 4),
    });
  }
  recipes.sort((a, b) => b.rows - a.rows);

  // ── report ──
  const n = recipes.length;
  const pct = k => `${Math.round(100 * recipes.filter(k).length / n)}%`;
  console.log(`\n===== CROP × SIZE RECIPE SEED — DRY RUN (no writes) =====`);
  console.log(`Recipes (crop × size, parent rows only): ${n}   from ${sc.length} scheduled_crops rows`);
  console.log(`\nField coverage across the ${n} recipes:`);
  console.log(`  crop_weeks (drives plant week) : ${pct(r => r.crop_weeks != null)}`);
  console.log(`  prop_method                    : ${pct(r => r.prop_method)}   (conflicting within group: ${recipes.filter(r => r.method_conflict).length})`);
  console.log(`  prop tray (FK id on rows)      : ${pct(r => r.tray_id)}   · tray in Guide override: ${recipes.filter(r => r.tray_from_guide).length}`);
  console.log(`  container                      : ${pct(r => r.container)}   (conflicting within group: ${recipes.filter(r => r.container_conflict).length})`);
  console.log(`  broker / supplier              : ${pct(r => r.broker)} / ${pct(r => r.supplier)}`);
  console.log(`  Guide rooting/pinch/treatment  : ${recipes.filter(r => r.guide_rooting != null).length} / ${recipes.filter(r => r.guide_pinch).length} / ${recipes.filter(r => r.guide_treatment).length}`);
  console.log(`  container economics vol/cost   : ${pct(r => r.econ_vol)} / ${pct(r => r.econ_cost)}   (multi-part assemblies: ${recipes.filter(r => r.econ_parts).length})`);
  console.log(`  need a per-variety tweak (>2wk) : ${recipes.filter(r => r.tweaks).length} recipes  (${recipes.reduce((a, r) => a + r.tweaks, 0)} variety overrides total)`);

  // spring-plan.json fill volumes that could backfill containers missing fill_volume_cu_ft
  const noVol = [...new Set(recipes.filter(r => !r.econ_vol).map(r => r.size))];
  console.log(`\nSizes whose container lacks a fill volume (${noVol.length}), candidates to backfill from spring-plan.json:`);
  console.log(`  ${noVol.slice(0, 30).join(", ")}`);
  console.log(`  spring-plan.json has ${Object.keys(potVol).filter(k => k[0] !== "_").length} pot fill volumes to reconcile in.`);

  console.log(`\n----- top 24 recipes by row count -----`);
  console.log(`crop / size`.padEnd(34) + `rows`.padStart(5) + `cw`.padStart(4) + `  method`.padEnd(9) + ` tray`.padEnd(7) + ` econ`.padEnd(6) + ` tweaks`);
  recipes.slice(0, 24).forEach(r => {
    console.log(
      `${(r.crop + " / " + r.size).slice(0, 33).padEnd(34)}` +
      `${String(r.rows).padStart(5)}` +
      `${String(r.crop_weeks ?? "—").padStart(4)}` +
      `  ${String(r.prop_method || "—").slice(0, 7).padEnd(7)}` +
      ` ${String(r.tray_from_guide || r.tray_text || (r.tray_id ? "id" : "—")).slice(0, 5).padEnd(5)}` +
      ` ${(r.econ_vol ? "v" : "-") + (r.econ_cost ? "c" : "-") + (r.econ_parts ? "+" : " ")}`.padEnd(6) +
      ` ${r.tweaks ? r.tweak_names.join(",") : ""}`
    );
  });
  console.log(`\n(dry run — nothing written)`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
