#!/usr/bin/env node
/* Seed crop_recipes + crop_recipe_overrides from the agreed sources:
 *   (1) observed facts per crop × size-from-container (scheduled_crops medians/modes)
 *   (2) prop_guides.overrides (tray / rooting / pinch / treatment — wins over observed;
 *       key vocab = union of grid keys + detail-timing keys; empty today → observed-only)
 *   (3) captured container volumes (fall-program gallons; spring-plan.json volumes already
 *       reconciled into containers during the spring apply) → 3 fill-volume gaps
 * Also (on --apply): stamps scheduled_crops.recipe_id on parent rows and backfills
 * missing scheduled_crops.crop_weeks from the recipe.
 *
 * DRY RUN by default — prints every intended write. `--apply` to execute.
 * Chain semantics: ship_week = stick/arrival week; rooting_weeks = plant_week − ship_week.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require(path.join(__dirname, "..", "node_modules", "@supabase", "supabase-js"));

const APPLY = process.argv.includes("--apply");

const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach(l => {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

// ── size grain — container first (100% populated), item-name parse as fallback ──
function sizeFromName(name) {
  const s = String(name || "").trim().toUpperCase(); let m;
  if ((m = s.match(/^HB\s*(\d+(?:\.\d+)?)/))) return `${m[1]}" HB`;
  if ((m = s.match(/^POT\s*(\d+(?:\.\d+)?)/))) return `${m[1]}" Pot`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"\s*POT\b/))) return `${m[1]}" Pot`;
  if (/^1801L/.test(s)) return "1801L";
  if (/^1801S/.test(s)) return "1801S";
  if (/^1801/.test(s)) return "1801";
  if (/^MARKET/.test(s)) return "MARKET BASKET";
  if ((m = s.match(/^(\d+)\s*CELL/))) return `${m[1]} CELL`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"/))) return `${m[1]}" Pot`;
  return (s.match(/^[A-Z]+/) || ["—"])[0];
}
const formTag = c => {
  const s = `${c?.name || ""} ${c?.kind || ""} ${c?.type || ""}`.toUpperCase();
  if (/HANG|\bHB\b|BASKET/.test(s)) return "HB";
  if (/\bPAN\b/.test(s)) return "Pan";
  if (/BOWL/.test(s)) return "Bowl";
  if (/FIBER/.test(s)) return "Fiber";
  if (/TRAY|CELL|PLUG|FLAT/.test(s)) return "Tray";
  return "Pot";
};
const sizeOf = (c, itemName) => {
  if (c && c.diameter_in != null && c.diameter_in !== "") {
    const d = Math.round(+c.diameter_in * 2) / 2;   // 14.49 → 14.5
    return `${d.toString().replace(/\.0$/, "")}" ${formTag(c)}`;
  }
  return sizeFromName(itemName);
};

const mode = arr => { const c = {}; arr.filter(x => x != null && x !== "").forEach(x => c[x] = (c[x] || 0) + 1); const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? { val: e[0][0], n: e[0][1], distinct: e.length } : { val: null, n: 0, distinct: 0 }; };
const median = arr => { const a = arr.filter(x => x != null).map(Number).filter(x => !Number.isNaN(x)).sort((x, y) => x - y); if (!a.length) return null; const mid = Math.floor(a.length / 2); return a.length % 2 ? a[mid] : Math.round(((a[mid - 1] + a[mid]) / 2) * 10) / 10; };

async function pageAll(table, cols, filter) {
  const out = []; for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).order("id").range(from, from + 999); if (filter) q = filter(q);
    const { data, error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || [])); if (!data || data.length < 1000) break;
  } return out;
}
const num = x => { if (x == null || x === "") return null; const n = +x; return Number.isNaN(n) ? null : n; };

// gal → cu ft for the CLAUDE.md fall-container volumes
const GAL = 0.133681;
// container fill-volume backfills: matched by sku. spring-plan.json + fall program gallons.
const VOLUME_BACKFILL = [
  { sku: "SPP 1400", cf: +(5.33 * GAL).toFixed(3), src: "fall program 5.33 gal est" },   // 15 Patio
  { sku: "SHB1200 ATH", cf: +(2.00 * GAL).toFixed(3), src: "fall program 2.00 gal" },    // 12 Athena HB
  { sku: "SPP 1000", cf: +(1.89 * GAL).toFixed(3), src: "fall program 1.89 gal" },       // 10 Patio
];

(async () => {
  console.log(APPLY ? "APPLY MODE — writing.\n" : "DRY RUN — printing intended writes only. Use --apply to execute.\n");

  // SPRING ONLY (Caleb 2026-07-27): recipes seed from spring observations; other seasons later.
  const { data: plans } = await sb.from("production_plans").select("id,name,season");
  const springIds = (plans || []).filter(p => /spring/i.test(p.season || p.name || "")).map(p => p.id);
  if (!springIds.length) throw new Error("no spring plan found");
  console.log(`scope: spring plans only → ${(plans || []).filter(p => springIds.includes(p.id)).map(p => p.name).join(", ")}\n`);
  const sc = (await pageAll("scheduled_crops", "id,plan_id,item_name,variety_id,prop_method,prop_tray_id,prop_tray_size,container_id,broker,supplier,crop_weeks,plant_week,ship_week,ppp,plants_per_unit,is_combo_component,recipe_id"))
    .filter(r => springIds.includes(r.plan_id));
  const vars = await pageAll("variety_library", "id,crop_name,variety,variety_key");
  const vmap = Object.fromEntries(vars.map(v => [v.id, v]));
  const { data: pg, error: pge } = await sb.from("prop_guides").select("guide_key,overrides");
  if (pge) throw new Error(`prop_guides: ${pge.message}`);
  const guide = Object.fromEntries((pg || []).map(r => [r.guide_key, r.overrides || {}]));
  if (!pg || !pg.length) console.log("⚠ prop_guides is EMPTY — guide layer contributes nothing; this is an observed-data-only seed. Fill guides later and re-run, or edit recipes directly.\n");
  const { data: conts, error: ce } = await sb.from("containers").select("id,name,sku,kind,type,diameter_in,fill_volume_cu_ft,cells_per_flat");
  if (ce) throw new Error(`containers: ${ce.message}`);
  if (!conts || !conts.length) throw new Error("containers came back empty — refusing to seed with name-fallback sizes only");
  const cmap = Object.fromEntries((conts || []).map(c => [c.id, c]));
  const bySku = {}; (conts || []).forEach(c => { if (c.sku) bySku[String(c.sku).trim()] = c; });
  const trayByText = { "105": bySku["PT 105 HV"], "50": bySku["PTT 50 DV"] };   // prop-tray canon

  // group parent rows by crop × size
  const groups = {};
  for (const r of sc) {
    const v = vmap[r.variety_id]; if (!v || !v.crop_name || r.is_combo_component) continue;
    const size = sizeOf(cmap[r.container_id], r.item_name);
    const key = `${v.crop_name}||${size}`;
    (groups[key] = groups[key] || { crop: v.crop_name, size, rows: [] }).rows.push(r);
  }

  const PROPPED = m => /^(URC|CALL|SEED)/i.test(m || "");
  // series from variety names: two-word prefix shared by >=2 varieties (Main Street, Hot
  // Blooded), else one-word (Shamrock, Dynamo), else '(unassigned)' — refined later in the editor.
  function seriesFor(vnames) {
    const two = {}, one = {};
    vnames = [...new Set(vnames.filter(Boolean))];   // count unique VARIETIES, not bench rows
    vnames.forEach(n => {
      const t = String(n || "").trim().split(/\s+/);
      if (t.length > 2) two[t.slice(0, 2).join(" ")] = (two[t.slice(0, 2).join(" ")] || 0) + 1;
      if (t.length > 1) one[t[0]] = (one[t[0]] || 0) + 1;
    });
    return n => {
      const t = String(n || "").trim().split(/\s+/);
      const p2 = t.slice(0, 2).join(" ");
      // a two-word series must be a REAL sub-family: >=2 varieties AND at least half of
      // its one-word family (keeps Kong Jr / Main Street; merges Compact Hot → Compact,
      // Megawatt Pink → Megawatt — Caleb 7/28: "it's all just Compact")
      if (t.length > 2 && two[p2] >= 2 && two[p2] * 2 >= (one[t[0]] || 0)) return p2;
      if (t.length > 1 && one[t[0]] >= 2) return t[0];
      return "(unassigned)";
    };
  }
  const recipes = [], allOverrides = [], allSeries = [], warnings = [];
  for (const g of Object.values(groups)) {
    const rows = g.rows;
    if (g.size === "—" || /^[A-Z]+$/.test(g.size)) {   // degenerate grain: no container + unparseable name
      warnings.push(`${g.crop} / '${g.size}': degenerate size (no container) — SKIPPED, assign containers first (${rows.length} rows)`);
      continue;
    }
    const pm = mode(rows.map(r => r.prop_method));
    const cw = median(rows.map(r => r.crop_weeks).filter(x => x != null && x >= 1 && x <= 60));
    // rooting = plant − ship on URC/CALL rows (ship_week = stick/arrival week), but only
    // MEANINGFUL when the group itself is URC/CALL — plug/seed recipes must keep it null.
    const rootGaps = rows.filter(r => /^(URC|CALL)/i.test(r.prop_method || "") && r.plant_week != null && r.ship_week != null)
      .map(r => r.plant_week - r.ship_week).filter(x => x >= 1 && x <= 10);
    const rooting = /^(URC|CALL)/i.test(pm.val || "") && rootGaps.length ? median(rootGaps) : null;
    const cont = mode(rows.map(r => r.container_id));
    const brk = mode(rows.map(r => r.broker)), sup = mode(rows.map(r => r.supplier));
    const ppp = mode(rows.map(r => r.ppp)), ppunit = mode(rows.map(r => r.plants_per_unit));
    // tray: FK mode first; else text→canon; only for propped methods
    let trayId = null, traySrc = null;
    if (PROPPED(pm.val)) {
      const fk = mode(rows.map(r => r.prop_tray_id));
      if (fk.val) { trayId = fk.val; traySrc = "observed FK"; }
      else {
        const txt = mode(rows.map(r => (r.prop_tray_size || "").trim()));
        if (txt.val && trayByText[txt.val]) { trayId = trayByText[txt.val].id; traySrc = `text '${txt.val}' → ${trayByText[txt.val].sku}`; }
        else if (txt.val) warnings.push(`${g.crop} / ${g.size}: tray text '${txt.val}' unresolved (no canon container)`);
      }
    }
    // guide layer wins where present. Key vocabulary = union of what the Prop Guide
    // actually writes: grid → rooting_weeks/tray/pinch/prop_treatment; detail timing
    // → prop_weeks/stick_to_transplant/weeks_to_pinch. Numeric-guarded (no NaN writes).
    const ov = guide[g.crop.toLowerCase().trim()] || {};
    if (PROPPED(pm.val) && ov.tray) {
      const gt = trayByText[String(ov.tray).trim()];
      if (gt) { trayId = gt.id; traySrc = `guide '${ov.tray}'`; }
      else warnings.push(`${g.crop} / ${g.size}: guide tray '${ov.tray}' unresolved (no canon container)`);
    }
    const guideRoot = num(ov.rooting_weeks) ?? num(ov.stick_to_transplant) ?? num(ov.prop_weeks);
    const rootingFinal = /^(URC|CALL)/i.test(pm.val || "") ? (guideRoot ?? rooting) : null;
    const pv = String(ov.pinch || "").toLowerCase();
    const pinch = pv === "yes" ? true : pv === "no" ? false : null;

    if (pm.distinct > 1) warnings.push(`${g.crop} / ${g.size}: mixed prop_method (${pm.distinct} values) — using mode '${pm.val}'`);
    if (cont.distinct > 1) warnings.push(`${g.crop} / ${g.size}: mixed container (${cont.distinct}) — using mode`);

    // per-series specs within the family
    const segOf = seriesFor(rows.map(r => vmap[r.variety_id]?.variety));
    const buckets = {};
    rows.forEach(r => { const sn = segOf(vmap[r.variety_id]?.variety); (buckets[sn] = buckets[sn] || []).push(r); });
    for (const [sn, rs] of Object.entries(buckets)) {
      const spm = mode(rs.map(r => r.prop_method));
      const sGaps = rs.filter(r => /^(URC|CALL)/i.test(r.prop_method || "") && r.plant_week != null && r.ship_week != null)
        .map(r => r.plant_week - r.ship_week).filter(x => x >= 1 && x <= 10);
      let sTray = null;
      if (PROPPED(spm.val)) {
        const fk = mode(rs.map(r => r.prop_tray_id));
        if (fk.val) sTray = fk.val;
        else { const txt = mode(rs.map(r => (r.prop_tray_size || "").trim())); if (txt.val && trayByText[txt.val]) sTray = trayByText[txt.val].id; }
      }
      allSeries.push({
        _recipeKey: `${g.crop}||${g.size}`, series_name: sn,
        form: spm.val || null,
        rooting_weeks: /^(URC|CALL)/i.test(spm.val || "") && sGaps.length ? median(sGaps) : null,
        prop_tray_id: sTray,
        pinned_broker: mode(rs.map(r => r.broker)).val,
        pinned_supplier: mode(rs.map(r => r.supplier)).val,
        seeded_from: { rows: rs.length, varieties: [...new Set(rs.map(r => vmap[r.variety_id]?.variety))].length },
      });
    }
    // unit math: plants_per_unit ÷ ppp → pots_per_unit (4.5" flat-of-10 fallback)
    const puMode = mode(rows.map(r => r.plants_per_unit));
    const potsPerUnit = (puMode.val && ppp.val) ? Math.max(1, Math.round(+puMode.val / +ppp.val))
      : (g.size.indexOf('4.5"') === 0 ? 10 : 1);
    const recipe = {
      crop_name: g.crop, size_label: g.size,
      pots_per_unit: potsPerUnit,
      prop_method: pm.val, prop_tray_id: trayId,
      rooting_weeks: rootingFinal, crop_weeks: cw,
      pinch, weeks_to_pinch: num(ov.weeks_to_pinch),
      prop_treatment: ov.prop_treatment || null,
      default_container_id: cont.val,
      pinned_broker: brk.val, pinned_supplier: sup.val,
      ppp: ppp.val != null ? +ppp.val : null,
      plants_per_unit: ppunit.val != null ? +ppunit.val : null,
      seeded_from: {
        observed: { rows: rows.length, crop_weeks: cw, rooting_gap_rows: rootGaps.length, method_n: pm.n, method_distinct: pm.distinct },
        guide: Object.keys(ov).length ? ov : null,
        tray_src: traySrc,
      },
      updated_by: "seed:crop-recipes",
      _rowIds: rows.map(r => r.id),
      _rowsMissingCw: rows.filter(r => r.crop_weeks == null && cw != null).length,
    };
    recipes.push(recipe);

    // per-variety tweaks: crop_weeks deviating >2wk from the base median
    const byVar = {};
    rows.forEach(r => { if (r.crop_weeks != null && r.crop_weeks >= 1 && r.crop_weeks <= 60) (byVar[r.variety_id] = byVar[r.variety_id] || []).push(r.crop_weeks); });
    for (const [vid, list] of Object.entries(byVar)) {
      const vw = median(list);
      if (cw != null && vw != null && Math.abs(vw - cw) > 2 && vmap[vid]?.variety_key) {
        allOverrides.push({ _recipeKey: `${g.crop}||${g.size}`, variety_key: vmap[vid].variety_key, crop_weeks: vw, notes: `observed ${vw}w vs base ${cw}w`, _label: `${vmap[vid].variety}` });
      }
    }
  }
  recipes.sort((a, b) => b._rowIds.length - a._rowIds.length);

  // container volume backfills that actually apply (only where currently null)
  const volWrites = VOLUME_BACKFILL.map(v => ({ ...v, c: bySku[v.sku] })).filter(v => v.c && v.c.fill_volume_cu_ft == null);

  // ── report ──
  const totMissingCw = recipes.reduce((a, r) => a + r._rowsMissingCw, 0);
  const totRows = recipes.reduce((a, r) => a + r._rowIds.length, 0);
  console.log(`recipes to upsert          : ${recipes.length}  (crop × size)`);
  console.log(`  with crop_weeks          : ${recipes.filter(r => r.crop_weeks != null).length}`);
  console.log(`  with rooting_weeks       : ${recipes.filter(r => r.rooting_weeks != null).length}  (from plant−ship gap on URC/CALL)`);
  console.log(`  with resolved prop tray  : ${recipes.filter(r => r.prop_tray_id).length}`);
  console.log(`  with pinned broker       : ${recipes.filter(r => r.pinned_broker).length}`);
  console.log(`variety overrides to insert: ${allOverrides.length}`);
  const unas = allSeries.filter(x => x.series_name === "(unassigned)").length;
  console.log(`series specs to insert     : ${allSeries.length}  (${unas} unassigned — name them in the editor)`);
  console.log(`  with form/root/tray/broker: ${allSeries.filter(x=>x.form).length} / ${allSeries.filter(x=>x.rooting_weeks!=null).length} / ${allSeries.filter(x=>x.prop_tray_id).length} / ${allSeries.filter(x=>x.pinned_broker).length}`);
  console.log(`recipe_id stamps on rows   : ${totRows} parent scheduled_crops rows`);
  console.log(`crop_weeks backfills       : ${totMissingCw} rows (null → recipe median)`);
  console.log(`container volume backfills : ${volWrites.length}${volWrites.length ? "  → " + volWrites.map(v => `${v.sku}=${v.cf}cf (${v.src})`).join(", ") : ""}`);
  console.log(`\nwarnings (${warnings.length}):`); warnings.slice(0, 25).forEach(w => console.log(`  ⚠ ${w}`));
  console.log(`\nsample — top 10 recipes:`);
  recipes.slice(0, 10).forEach(r => console.log(`  ${r.crop_name} / ${r.size_label}: ${r.prop_method || "—"} · tray ${r.prop_tray_id ? "✓" : "—"} · root ${r.rooting_weeks ?? "—"}w · crop ${r.crop_weeks ?? "—"}w · ${r._rowIds.length} rows${r._rowsMissingCw ? ` (${r._rowsMissingCw} cw-backfill)` : ""}`));
  console.log(`\nsample — series for three families:`);
  ["Lantana||4.5\" Pot", "Geranium||11\" Fiber", "Coleus||4.5\" Pot"].forEach(k => {
    const ss = allSeries.filter(x => x._recipeKey === k);
    console.log(`  ${k.replace("||", " / ")}:`);
    ss.forEach(x => console.log(`    ${x.series_name}: ${x.form || "—"} · root ${x.rooting_weeks ?? "—"}w · tray ${x.prop_tray_id ? "✓" : "—"} · ${x.pinned_broker || "—"} · ${x.seeded_from.varieties} var`));
  });
  console.log(`sample — first 10 overrides:`);
  allOverrides.slice(0, 10).forEach(o => console.log(`  ${o._recipeKey.replace("||", " / ")} → ${o._label}: crop ${o.crop_weeks}w`));

  if (process.argv.includes("--examples")) {
    // one full example recipe per size, exactly as it would be written
    const bySize = {};
    recipes.forEach(r => { (bySize[r.size_label] = bySize[r.size_label] || []).push(r); });
    const cname = id => id && cmap[id] ? `${cmap[id].name}${cmap[id].sku ? ` [${cmap[id].sku}]` : ""}` : "—";
    console.log(`\n===== ONE EXAMPLE RECIPE PER SIZE (${Object.keys(bySize).length} sizes) =====`);
    for (const size of Object.keys(bySize).sort()) {
      const rs = bySize[size].sort((a, b) => b._rowIds.length - a._rowIds.length);
      const r = rs[0];
      const ovs = allOverrides.filter(o => o._recipeKey === `${r.crop_name}||${r.size_label}`);
      console.log(`\n■ ${size}   (${rs.length} recipes at this size: ${rs.slice(0, 6).map(x => x.crop_name).join(", ")}${rs.length > 6 ? "…" : ""})`);
      console.log(`  example: ${r.crop_name} / ${size}  — from ${r._rowIds.length} Spring 2027 rows`);
      console.log(`    prop_method   : ${r.prop_method ?? "—"}`);
      console.log(`    prop tray     : ${cname(r.prop_tray_id)}`);
      console.log(`    rooting_weeks : ${r.rooting_weeks ?? "—"}   (stick/arrival → transplant)`);
      console.log(`    crop_weeks    : ${r.crop_weeks ?? "—"}   (plant → ready)`);
      console.log(`    pinch         : ${r.pinch == null ? "—" : r.pinch}   weeks_to_pinch: ${r.weeks_to_pinch ?? "—"}`);
      console.log(`    container     : ${cname(r.default_container_id)}`);
      console.log(`    broker/supplr : ${r.pinned_broker ?? "—"} / ${r.pinned_supplier ?? "—"}`);
      console.log(`    ppp / per-unit: ${r.ppp ?? "—"} / ${r.plants_per_unit ?? "—"}`);
      if (ovs.length) console.log(`    variety tweaks: ${ovs.map(o => `${o._label} (crop ${o.crop_weeks}w)`).join("; ")}`);
    }
    console.log("");
  }

  if (!APPLY) { console.log("\nDRY RUN complete — nothing written."); return; }

  // ── apply ──
  console.log("\nWriting…");
  const FORCE = process.argv.includes("--force");
  // never clobber a recipe a human has edited (updated_by !== seed) unless --force
  const { data: existing, error: exe } = await sb.from("crop_recipes").select("id,crop_name,size_label,updated_by");
  if (exe) throw new Error(`crop_recipes read: ${exe.message}`);
  const humanEdited = new Set((existing || []).filter(r => r.updated_by && r.updated_by !== "seed:crop-recipes").map(r => `${r.crop_name}||${r.size_label}`));
  const nowIso = new Date().toISOString();
  const idByKey = {}; let skippedHuman = 0;
  for (const r of recipes) {
    const { _rowIds, _rowsMissingCw, ...rec } = r;
    const key = `${r.crop_name}||${r.size_label}`;
    if (humanEdited.has(key) && !FORCE) {
      skippedHuman++;
      const ex = (existing || []).find(x => `${x.crop_name}||${x.size_label}` === key);
      idByKey[key] = ex.id;   // still stamp rows to the existing (human) recipe
    } else {
      rec.updated_at = nowIso;
      const { data, error } = await sb.from("crop_recipes").upsert(rec, { onConflict: "crop_name,size_label" }).select("id").single();
      if (error) throw new Error(`recipe ${r.crop_name}/${r.size_label}: ${error.message}`);
      idByKey[key] = data.id;
    }
    // stamp recipe_id on the group's parent rows (batch by 200; only fill blanks unless --force)
    for (let i = 0; i < _rowIds.length; i += 200) {
      let q = sb.from("scheduled_crops").update({ recipe_id: idByKey[key] }).in("id", _rowIds.slice(i, i + 200));
      if (!FORCE) q = q.is("recipe_id", null);
      const { error: e2 } = await q;
      if (e2) throw new Error(`stamp ${r.crop_name}: ${e2.message}`);
    }
    // crop_weeks backfill where null — scheduled_crops.crop_weeks is INT (recipe keeps the decimal)
    if (r.crop_weeks != null) {
      for (let i = 0; i < _rowIds.length; i += 200) {
        const { error: e3 } = await sb.from("scheduled_crops").update({ crop_weeks: Math.round(r.crop_weeks) }).in("id", _rowIds.slice(i, i + 200)).is("crop_weeks", null);
        if (e3) throw new Error(`cw backfill ${r.crop_name}: ${e3.message}`);
      }
    }
  }
  if (skippedHuman) console.log(`  (skipped ${skippedHuman} human-edited recipes — rerun with --force to overwrite)`);
  for (const sx of allSeries) {
    const { _recipeKey, ...row } = sx;
    row.recipe_id = idByKey[_recipeKey];
    if (!row.recipe_id) continue;
    row.updated_at = nowIso;
    const { error } = await sb.from("crop_recipe_series").upsert(row, { onConflict: "recipe_id,series_name" });
    if (error) throw new Error(`series ${sx.series_name}: ${error.message}`);
  }
  // stale-series cleanup: seed-owned recipes drop series names no longer derived
  const byRecipe = {};
  allSeries.forEach(sx => { (byRecipe[sx._recipeKey] = byRecipe[sx._recipeKey] || []).push(sx.series_name); });
  for (const [key, names] of Object.entries(byRecipe)) {
    if (humanEdited.has(key) && !FORCE) continue;
    const rid = idByKey[key]; if (!rid) continue;
    const { data: existing } = await sb.from("crop_recipe_series").select("id,series_name").eq("recipe_id", rid);
    const stale = (existing || []).filter(x => !names.includes(x.series_name));
    for (const x of stale) await sb.from("crop_recipe_series").delete().eq("id", x.id);
  }
  for (const o of allOverrides) {
    const { _recipeKey, _label, ...row } = o;
    row.recipe_id = idByKey[_recipeKey];
    if (!row.recipe_id) continue;
    row.updated_at = nowIso;
    const { error } = await sb.from("crop_recipe_overrides").upsert(row, { onConflict: "recipe_id,variety_key" });
    if (error) throw new Error(`override ${_label}: ${error.message}`);
  }
  for (const v of volWrites) {
    const { error } = await sb.from("containers").update({ fill_volume_cu_ft: v.cf }).eq("id", v.c.id).is("fill_volume_cu_ft", null);
    if (error) throw new Error(`volume ${v.sku}: ${error.message}`);
  }
  console.log(`Done: ${recipes.length} recipes, ${allSeries.length} series, ${allOverrides.length} overrides, ${totRows} rows stamped, ${totMissingCw} crop_weeks backfilled, ${volWrites.length} volumes.`);
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
