// FamilyPage — the crop-family item page (Phase 2 slice 1 of the 2026-07-27 spec).
// One page for a whole crop × size family (e.g. 4.5" Lantana): planting groups,
// variety roster with sold-vs-planned, and the RECIPE editor (lock/save) writing the
// live spine (crop_recipes + crop_recipe_series). The page is a VIEW over the spine —
// recipe + plan rows + sales — never a second place to enter a fact.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { rippleTasks } from "./ripple";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df", red: "#c0492b",
  redBg: "#fae9e5", border: "#e4ecdd", chip: "#eaf2e0", green: "#2e7d32" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const wkFmt = (yr, wk) => (yr == null || wk == null) ? "—" : `${String(yr).slice(2)}${String(wk).padStart(2, "0")}`;

export default function FamilyPage({ plan, recipeId, onClose }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [series, setSeries] = useState([]);
  const [rows, setRows] = useState(null);
  const [vmap, setVmap] = useState({});
  const [trays, setTrays] = useState({});      // container id -> {name, cells_per_flat}
  const [bmap, setBmap] = useState({});        // bench id -> code
  const [brokerStats, setBrokerStats] = useState({});   // series_name -> [{broker, supplier, min, cov, tot}]
  const [soldByItem, setSoldByItem] = useState({});   // plan item_name -> '26 units (via sku map)
  const [tmap, setTmap] = useState({});               // plan item_name -> plan_targets row (walkthrough decisions)
  const [trayOpts, setTrayOpts] = useState([]);       // plug-tray containers (105/72/50/38…) for the recipe's Tray select
  const [locked, setLocked] = useState(true);
  const [snap, setSnap] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: rec } = await sb.from("crop_recipes").select("*").eq("id", recipeId).single();
      setRecipe(rec || null);
      if (!rec) { setRows([]); return; }
      const { data: ser } = await sb.from("crop_recipe_series").select("*").eq("recipe_id", recipeId).order("series_name");
      setSeries(ser || []);
      const { data: sc } = await sb.from("scheduled_crops")
        .select("id,item_name,variety_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,ship_week,ship_year,ready_week,ready_year,broker,supplier,liner_unit_cost,prop_method,bench_id,is_combo_component")
        .eq("plan_id", plan.id).eq("recipe_id", recipeId).not("is_combo_component", "is", true).limit(2000);
      setRows(sc || []);
      const vids = [...new Set((sc || []).map(r => r.variety_id).filter(Boolean))];
      if (vids.length) {
        const { data: vs } = await sb.from("variety_library").select("id,variety,variety_key").in("id", vids);
        setVmap(Object.fromEntries((vs || []).map(v => [v.id, v])));
      }
      const trayIds = [...new Set((ser || []).map(s => s.prop_tray_id).filter(Boolean))];
      if (trayIds.length) {
        const { data: ts } = await sb.from("containers").select("id,name,cells_per_flat").in("id", trayIds);
        setTrays(Object.fromEntries((ts || []).map(t => [t.id, t])));
      }
      const bids = [...new Set((sc || []).map(r => r.bench_id).filter(Boolean))];
      if (bids.length) {
        const { data: bs } = await sb.from("benches").select("id,code").in("id", bids);
        setBmap(Object.fromEntries((bs || []).map(b => [b.id, b.code])));
      }
      // '26 sales via the CANONICAL join: item_name → sales_sku_map → sku → sales_totals
      // (SKU is the durable match key — combo-modeled lines like "GERANIUM COMBO RED" attach correctly)
      const itemNames = [...new Set((sc || []).map(r => r.item_name))];
      let soldMap = {};
      if (itemNames.length) {
        // walkthrough decisions (Sales vs Plan 2027 targets) — the dig-in surface must greet you with them
        const { data: tgs } = await sb.from("plan_targets").select("item_name,target_units,decision,decided_by").eq("plan_id", plan.id).in("item_name", itemNames);
        setTmap(Object.fromEntries((tgs || []).map(t => [t.item_name, t])));
        const { data: maps } = await sb.from("sales_sku_map").select("sku,plan_item_name").in("plan_item_name", itemNames);
        const skuToItem = Object.fromEntries((maps || []).map(m => [m.sku, m.plan_item_name]));
        const skus = Object.keys(skuToItem);
        if (skus.length) {
          const { data: st } = await sb.from("sales_totals").select("sku,units").in("sku", skus);
          (st || []).forEach(s => { const it = skuToItem[s.sku]; soldMap[it] = (soldMap[it] || 0) + (+s.units || 0); });
        }
      }
      setSoldByItem(soldMap);
    })();
  }, [sb, plan.id, recipeId, tick]); // eslint-disable-line

  // broker coverage per series: who quotes this series' colors, at what floor price
  useEffect(() => {
    if (!series.length || !rows?.length || !Object.keys(vmap).length) return;
    (async () => {
      const named = series.map(s => s.series_name).filter(n => n !== "(unassigned)").sort((a, b) => b.length - a.length);
      const keyToSeries = {};
      Object.values(vmap).forEach(v => {
        const hit = named.find(n => v.variety.toLowerCase().startsWith(n.toLowerCase())) || "(unassigned)";
        keyToSeries[v.variety_key] = hit;
      });
      const keys = Object.keys(keyToSeries);
      if (!keys.length) return;
      const quotes = [];
      for (let i = 0; i < keys.length; i += 100) {
        const { data } = await sb.from("broker_prices").select("variety_key,broker,supplier,form_class,landed").in("variety_key", keys.slice(i, i + 100));
        quotes.push(...(data || []));
      }
      const FORM_TO_CLASS = f => /^URC/i.test(f || "") ? "urc" : /^(CALL|DIRECT)/i.test(f || "") ? "callused" : /^PLUG/i.test(f || "") ? "plug" : /^SEED/i.test(f || "") ? "seed" : null;
      const stats = {};
      series.forEach(s => {
        const fc = FORM_TO_CLASS(s.form);
        const sKeys = keys.filter(k => keyToSeries[k] === s.series_name);
        const byBroker = {};
        quotes.filter(q => sKeys.includes(q.variety_key) && (!fc || q.form_class === fc)).forEach(q => {
          const b = byBroker[q.broker] || (byBroker[q.broker] = { broker: q.broker, supplier: q.supplier, min: +q.landed, covered: new Set() });
          b.min = Math.min(b.min, +q.landed);
          b.covered.add(q.variety_key);
          if (!b.supplier && q.supplier) b.supplier = q.supplier;
        });
        stats[s.series_name] = Object.values(byBroker)
          .map(b => ({ broker: b.broker, supplier: b.supplier, min: b.min, cov: b.covered.size, tot: sKeys.length }))
          .sort((a, b) => b.cov - a.cov || a.min - b.min);
      });
      setBrokerStats(stats);
    })();
  }, [series, vmap, rows, sb]); // eslint-disable-line

  // series lookup for a variety (same name-prefix derivation the seed used, vs stored series names)
  const seriesOf = useMemo(() => {
    const names = series.map(s => s.series_name).filter(n => n !== "(unassigned)")
      .sort((a, b) => b.length - a.length);
    return (varietyName) => {
      const vn = String(varietyName || "");
      const hit = names.find(n => vn.toLowerCase().startsWith(n.toLowerCase()));
      return series.find(s => s.series_name === hit) || series.find(s => s.series_name === "(unassigned)") || null;
    };
  }, [series]);

  // planting groups: cluster parent rows by (plant_week | ship_week), finish order
  const groups = useMemo(() => {
    if (!rows) return [];
    const m = {};
    rows.forEach(r => {
      // a group's identity = when it PLANTS and FINISHES; arrival varies by series
      // physiology (per-vr rooting) and displays as a range — it must not split groups
      const k = `${r.plant_week ?? "?"}|${r.ready_week ?? r.ship_week ?? "?"}`;
      const g = (m[k] = m[k] || { key: k, plant: r.plant_week, plantYear: r.plant_year,
        ready: r.ready_week, shipMin: null, shipMax: null, rows: [] });
      g.rows.push(r);
      if (r.ready_week != null) g.ready = Math.min(g.ready ?? 99, r.ready_week);
      if (r.ship_week != null) {
        g.shipMin = g.shipMin == null ? r.ship_week : Math.min(g.shipMin, r.ship_week);
        g.shipMax = g.shipMax == null ? r.ship_week : Math.max(g.shipMax, r.ship_week);
      }
    });
    const gs = Object.values(m).sort((a, b) => (a.ready ?? 99) - (b.ready ?? 99) || (a.plant ?? 99) - (b.plant ?? 99));
    gs.forEach((g, i) => {
      g.n = i + 1;
      // variety aggregation within the group (a variety may span items — mono + combo lines)
      const byVar = {};
      g.rows.forEach(r => {
        const v = vmap[r.variety_id];
        const key = v?.variety || r.item_name;
        const o = byVar[key] || (byVar[key] = { variety: key, vkey: v?.variety_key, rows: [], pots: 0,
          liner: null, broker: null, items: new Set(), benches: new Set() });
        o.rows.push(r);
        o.pots += +r.qty_pots || 0;
        o.items.add(r.item_name);
        if (r.bench_id && bmap[r.bench_id]) o.benches.add(bmap[r.bench_id]);
        if (r.liner_unit_cost != null && r.liner_unit_cost !== 1) o.liner = +r.liner_unit_cost;
        if (r.broker) o.broker = r.broker;
      });
      g.vars = Object.values(byVar).sort((a, b) => {
        const sa = seriesOf(a.variety)?.series_name || "~", sbn = seriesOf(b.variety)?.series_name || "~";
        return sa.localeCompare(sbn) || a.variety.localeCompare(b.variety);
      });
    });
    // '26 sold: allocate each ITEM's sales FIFO across the groups that grew it (sku-map join),
    // then spread within a group across that item's varieties by pot share.
    const remaining = { ...soldByItem };
    gs.forEach(g => {
      const itemPots = {};
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + (+r.qty_pots || 0); });
      g.itemSold = {};
      Object.entries(itemPots).forEach(([it, pots]) => {
        const take = Math.min(remaining[it] || 0, pots > 0 ? pots : (remaining[it] || 0));
        g.itemSold[it] = take; remaining[it] = (remaining[it] || 0) - take;
      });
    });
    gs.slice().reverse().forEach(g => {   // oversell lands on the last round that grew the item
      Object.keys(g.itemSold || {}).forEach(it => {
        if ((remaining[it] || 0) > 0) { g.itemSold[it] += remaining[it]; remaining[it] = 0; }
      });
    });
    gs.forEach(g => {
      const itemPots = {};
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + (+r.qty_pots || 0); });
      g.vars.forEach(vr => {
        vr.sold = 0;
        const mine = {};
        vr.rows.forEach(r => { mine[r.item_name] = (mine[r.item_name] || 0) + (+r.qty_pots || 0); });
        Object.entries(mine).forEach(([it, p]) => {
          const tot = itemPots[it] || 1;
          vr.sold += Math.round((g.itemSold[it] || 0) * (tot > 0 ? p / tot : 1));
        });
      });
    });
    return gs;
  }, [rows, vmap, soldByItem, seriesOf, bmap]);

  const [openG, setOpenG] = useState({});
  const [ctx, setCtx] = useState(null);   // {x, y, vr, gKey, newWk} — right-click action menu
  const [flashKey, setFlashKey] = useState(null);   // follow the group you just edited across a re-sort
  const [dupG, setDupG] = useState(null);           // {key, wk} — inline "⧉ New round" week input per group
  const [ripple, setRipple] = useState(null);       // {moved, flags[]} — last ripple result banner

  useEffect(() => {   // plug-tray options for the recipe's Tray select (105 / 72 / 50 / 38 Spikes…)
    (async () => {
      const { data } = await sb.from("containers").select("id,name,cells_per_flat").ilike("name", "%plug tray%").order("name");
      setTrayOpts(data || []);
    })();
  }, [sb]);

  useEffect(() => {   // Escape closes; dismissal is handled by the backdrop layer, not window listeners
    const esc = e => { if (e.key === "Escape") setCtx(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // ripple slice 2 — the group READY knob: set a new finish week and every row in the
  // group re-derives its chain from the recipe (plant = ready − crop · ship = plant − its
  // series' rooting), year-wrapped. Audit-logged per item. Floor tasks still don't move.
  async function applyGroupReady(g, raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits || recipe?.crop_weeks == null) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (g.plantYear ?? plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 52) return;
    const wrap = (wk, yr) => wk <= 0 ? { wk: wk + 52, yr: yr - 1 } : { wk, yr };
    const acc = { moved: 0, flags: [] };
    setBusy(true);
    for (const vr of g.vars) {
      const sSpec = seriesOf(vr.variety) || {};
      const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
      const p = wrap(ready - Math.round(+recipe.crop_weeks), readyYear);
      const sh = rooted ? wrap(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
      for (const r of vr.rows) {
        await sb.from("scheduled_crops").update({
          ready_week: ready, ready_year: readyYear,
          plant_week: p.wk, plant_year: p.yr, ship_week: sh.wk, ship_year: sh.yr,
        }).eq("id", r.id);
      }
      const its = [...new Set(vr.rows.map(r => r.item_name))];
      const old = vr.rows[0];
      const res = await rippleTasks(sb, plan.id, its,
        { ship: sh.wk, shipYear: sh.yr, plant: p.wk, plantYear: p.yr },
        { wk: old?.ship_week, yr: old?.ship_year ?? old?.plant_year }, displayName);
      acc.moved += res.moved; acc.flags.push(...res.flags);
    }
    try {
      const items = [...new Set(g.rows.map(r => r.item_name))];
      for (const it of items) {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: it,
          change_type: "group_ready_change",
          detail: { group: g.n, ready: `${readyYear}w${ready}`, note: "chain re-derived from recipe (family page group knob)" },
          changed_by: displayName || null, source: "family-page" });
      }
    } catch { /* audit must not block */ }
    const pNew = wrap(ready - Math.round(+recipe.crop_weeks), readyYear);
    setFlashKey(`${pNew.wk}|${ready}`);
    setRipple(acc.moved || acc.flags.length ? acc : null);
    setBusy(false); setTick(t => t + 1);
  }

  useEffect(() => {   // after a re-sort, bring the edited group back under the cursor and glow it
    if (!flashKey) return;
    const el = document.getElementById(`fam-grp-${flashKey}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlashKey(null), 2200);
    return () => clearTimeout(t);
  }, [flashKey, groups]); // eslint-disable-line

  // move a variety's rows in one group onto another group's week chain (or a new one)
  async function moveToGroup(vr, target) {
    setBusy(true);
    const wrapW = (wk, yr) => wk <= 0 ? { wk: wk + 52, yr: yr - 1 } : { wk, yr };
    const sSpec = seriesOf(vr.variety) || {};
    const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
    const pYr = target.plantYear ?? plan.year ?? 2027;
    const sh = rooted && target.plant != null
      ? wrapW(target.plant - Math.round(+(sSpec.rooting_weeks ?? 0)), pYr)
      : { wk: target.plant, yr: pYr };
    const patch = { plant_week: target.plant, plant_year: pYr,
      ship_week: sh.wk, ship_year: sh.yr,
      ready_week: target.ready ?? null, ready_year: target.readyYear ?? pYr };
    for (const r of vr.rows) await sb.from("scheduled_crops").update(patch).eq("id", r.id);
    const mvRes = await rippleTasks(sb, plan.id, [...new Set(vr.rows.map(r => r.item_name))],
      { ship: sh.wk, shipYear: sh.yr, plant: target.plant, plantYear: pYr },
      { wk: vr.rows[0]?.ship_week, yr: vr.rows[0]?.ship_year ?? vr.rows[0]?.plant_year }, displayName);
    setRipple(mvRes.moved || mvRes.flags.length ? mvRes : null);
    setFlashKey(`${target.plant}|${target.ready ?? "?"}`);
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
        variety_key: vr.vkey || null, change_type: "group_move",
        detail: { variety: vr.variety, rows: vr.rows.length, to: { plant: target.plant, ship: target.ship, ready: target.ready } },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    setBusy(false); setCtx(null); setTick(t => t + 1);
  }

  function moveToNewGroup(vr, raw) {   // inline input, no browser dialogs (they can wedge the page)
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 52 || recipe?.crop_weeks == null) return;
    const wrap = (wk, yr) => wk <= 0 ? { wk: wk + 52, yr: yr - 1 } : { wk, yr };
    const sSpec = seriesOf(vr.variety) || {};
    const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
    const p = wrap(ready - Math.round(+recipe.crop_weeks), readyYear);
    const sh = rooted ? wrap(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
    moveToGroup(vr, { plant: p.wk, plantYear: p.yr, ready, readyYear });
  }

  // ⧉ New round: clone every color of a group into a NEW planting group at a chosen
  // finish week — the family page's way to ADD groups (the right-click menu only MOVES).
  // Quantities copy as-is (adjust after — the 🎯 target banner will show any overage);
  // benches unassigned, supply unordered: a new round is a new decision downstream.
  async function duplicateGroup(g, raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits || recipe?.crop_weeks == null) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (g.plantYear ?? plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 52) return;
    const wrap = (wk, yr) => wk <= 0 ? { wk: wk + 52, yr: yr - 1 } : { wk, yr };
    setBusy(true);
    const { data: full } = await sb.from("scheduled_crops").select("*").in("id", g.rows.map(r => r.id));
    const p = wrap(ready - Math.round(+recipe.crop_weeks), readyYear);
    let made = 0;
    for (const src of full || []) {
      const v = vmap[src.variety_id];
      const sSpec = seriesOf(v?.variety || "") || {};
      const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
      const sh = rooted ? wrap(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
      const row = { ...src, id: crypto.randomUUID(),
        ready_week: ready, ready_year: readyYear,
        plant_week: p.wk, plant_year: p.yr, ship_week: sh.wk, ship_year: sh.yr,
        bench_id: null, qty_plants_ordered: null,
        notes: `round added on the family page (from Group ${g.n})` };
      delete row.created_at; delete row.updated_at;
      const { error } = await sb.from("scheduled_crops").insert(row);
      if (!error) made++;
    }
    try {
      for (const it of [...new Set(g.rows.map(r => r.item_name))]) {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: it, change_type: "group_duplicated",
          detail: { from_group: g.n, ready_week: ready, rows_cloned: made },
          changed_by: displayName || null, source: "family-page" });
      }
    } catch { /* audit must not block */ }
    setFlashKey(`${p.wk}|${ready}`);   // follow the new round after the re-sort
    setBusy(false); setDupG(null); setTick(t => t + 1);
  }
  const totals = useMemo(() => {
    let pots = 0, plants = 0, liner = 0, traysN = 0;
    const ov = +(recipe?.overage_pct || 0), ppp = +(recipe?.ppp || 1);
    groups.forEach(g => g.vars.forEach(vr => {
      pots += vr.pots;
      const s = seriesOf(vr.variety);
      const need = Math.ceil(vr.pots * ppp * (100 + ov) / 100);
      plants += need;
      liner += need * (vr.liner ?? 0);
      const cells = s?.prop_tray_id ? (+trays[s.prop_tray_id]?.cells_per_flat || 105) : 105;
      if (/^(URC|CALL|SEED)/i.test(s?.form || "")) traysN += need / cells;
    }));
    return { pots, plants, liner, traysN };
  }, [groups, recipe, seriesOf, trays]);

  // ── recipe lock/save ──
  function unlock() { setSnap(JSON.stringify({ r: recipe, s: series })); setLocked(false); setSavedMsg(""); }
  function cancel() {
    const a = JSON.parse(snap); setRecipe(a.r); setSeries(a.s); setLocked(true); setSavedMsg("reverted — nothing changed");
  }
  async function save() {
    const a = JSON.parse(snap); const ch = [];
    ["crop_weeks", "ppp", "pots_per_unit", "overage_pct", "hold_tolerance_wks"].forEach(k => {
      if (String(a.r[k] ?? "") !== String(recipe[k] ?? "")) ch.push(`${k.replace(/_/g, " ")} ${a.r[k] ?? "—"} → ${recipe[k] ?? "—"}`);
    });
    series.forEach(s => {
      const o = a.s.find(x => x.id === s.id) || {};
      if ((o.series_name || "") !== s.series_name && s.series_name.trim()) ch.push(`series renamed "${o.series_name || "—"}" → "${s.series_name.trim()}"`);
      if (o.form !== s.form) ch.push(`${s.series_name} form ${o.form || "—"} → ${s.form}`);
      if (String(o.rooting_weeks ?? "") !== String(s.rooting_weeks ?? "")) ch.push(`${s.series_name} root ${o.rooting_weeks ?? "—"} → ${s.rooting_weeks ?? "—"}w`);
      if ((o.pinned_broker || null) !== (s.pinned_broker || null)) ch.push(`${s.series_name} broker 📌 ${o.pinned_broker || "—"} → ${s.pinned_broker || "—"} (one material, one broker; existing row costs unchanged — re-quote applies them)`);
      if ((o.prop_tray_id || null) !== (s.prop_tray_id || null)) ch.push(`${s.series_name} tray → ${trayOpts.find(t => t.id === s.prop_tray_id)?.name || "—"}`);
    });
    if (!ch.length) { setLocked(true); setSavedMsg("no changes"); return; }
    if (!window.confirm(`Save the ${recipe.crop_name} ${recipe.size_label} recipe?\n\n• ${ch.join("\n• ")}\n\nCascades to every color, group and task using this recipe.`)) return;
    setBusy(true);
    const { id, created_at, ...rec } = recipe;
    await sb.from("crop_recipes").update({ ...rec, updated_by: displayName || "planner", updated_at: new Date().toISOString() }).eq("id", recipeId);
    for (const s of series) {
      const o = a.s.find(x => x.id === s.id) || {};
      if (o.form !== s.form || String(o.rooting_weeks ?? "") !== String(s.rooting_weeks ?? "")
        || (o.pinned_broker || null) !== (s.pinned_broker || null)
        || (o.series_name || "") !== s.series_name
        || (o.prop_tray_id || null) !== (s.prop_tray_id || null)) {
        await sb.from("crop_recipe_series").update({ form: s.form, rooting_weeks: s.rooting_weeks,
          series_name: s.series_name.trim() || o.series_name,   // blank rename falls back to the old name
          prop_tray_id: s.prop_tray_id || null,
          pinned_broker: s.pinned_broker || null, pinned_supplier: s.pinned_supplier || null,
          updated_at: new Date().toISOString() }).eq("id", s.id);
      }
    }
    setBusy(false); setLocked(true); setSavedMsg(`✅ saved — ${ch.length} change${ch.length > 1 ? "s" : ""} (crop_recipes)`);

    // ── the ripple, first slice: recipe saved → offer to re-derive the plan's chain.
    // Ready stays the anchor (it's the sales commitment); plant = ready − crop weeks;
    // ship = plant − series rooting (URC/CALL) else plant. Year-wrapped.
    const wrap = (wk, yr) => wk <= 0 ? { wk: wk + 52, yr: (yr ?? plan.year ?? 2027) - 1 } : { wk, yr: yr ?? plan.year ?? 2027 };
    const cw = Math.round(+recipe.crop_weeks || 0);
    const patches = [];
    (rows || []).forEach(r => {
      if (r.ready_week == null || !cw) return;
      const v = vmap[r.variety_id];
      const sSpec = seriesOf(v?.variety) || {};
      const rooted = /^(URC|CALL)/i.test(sSpec.form || r.prop_method || "");
      const root = rooted ? Math.round(+(sSpec.rooting_weeks ?? 0)) : 0;
      const ry = r.ready_year ?? r.plant_year ?? plan.year ?? 2027;
      const p = wrap(r.ready_week - cw, ry);
      const sh = wrap(p.wk - root, p.yr);
      if (p.wk !== r.plant_week || sh.wk !== r.ship_week || cw !== r.crop_weeks) {
        patches.push({ id: r.id, item: r.item_name, plant_week: p.wk, plant_year: p.yr, ship_week: sh.wk, ship_year: sh.yr, crop_weeks: cw,
          was: `plant ${r.plant_week ?? "—"}/ship ${r.ship_week ?? "—"}`, now: `plant ${p.wk}/ship ${sh.wk}` });
      }
    });
    if (!patches.length) return;
    const sample = [...new Set(patches.map(x => `${x.was} → ${x.now}`))].slice(0, 4).join("\n• ");
    if (!window.confirm(`Cascade the recipe to the plan?\n\n${patches.length} row${patches.length > 1 ? "s" : ""} re-derive from their READY week (the anchor):\n• ${sample}${patches.length > 4 ? "\n• …" : ""}\n\nFloor tasks don't move yet (ripple engine phase) — skip if this plan is already in motion.`)) {
      setSavedMsg(`✅ recipe saved — plan NOT cascaded (drift badges will show the gap)`); return;
    }
    setBusy(true);
    for (const x of patches) {
      await sb.from("scheduled_crops").update({ plant_week: x.plant_week, plant_year: x.plant_year, ship_week: x.ship_week, ship_year: x.ship_year, crop_weeks: x.crop_weeks }).eq("id", x.id);
    }
    try {
      const items = [...new Set(patches.map(x => x.item))];
      for (const it of items) {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: it, change_type: "recipe_cascade",
          detail: { rows: patches.filter(x => x.item === it).length, crop_weeks: cw, note: "chain re-derived from ready after recipe save" },
          changed_by: displayName || null, source: "family-page" });
      }
    } catch { /* audit must not block */ }
    const casAcc = { moved: 0, flags: [] };
    const byItem = {};
    patches.forEach(x => { byItem[x.item] = x; });
    for (const [it, x] of Object.entries(byItem)) {
      const oldRow = (rows || []).find(r => r.item_name === it);
      const res = await rippleTasks(sb, plan.id, [it],
        { ship: x.ship_week, shipYear: x.ship_year, plant: x.plant_week, plantYear: x.plant_year },
        { wk: oldRow?.ship_week, yr: oldRow?.ship_year ?? oldRow?.plant_year }, displayName);
      casAcc.moved += res.moved; casAcc.flags.push(...res.flags);
    }
    setRipple(casAcc.moved || casAcc.flags.length ? casAcc : null);
    setBusy(false); setSavedMsg(`✅ recipe saved + cascaded to ${patches.length} rows`); setTick(t => t + 1);
  }

  // walkthrough targets vs plan rows: target_units are SELLABLE UNITS (SvP grain);
  // rows are POTS — convert via the recipe's pots_per_unit. Combos excluded (their
  // targets live on their own item pages).
  const targetGaps = useMemo(() => {
    if (!rows || !recipe) return [];
    const ppu = Math.max(1, Math.round(+recipe.pots_per_unit || 1));
    const potsByItem = {};
    rows.forEach(r => { if (!r.is_combo_component) potsByItem[r.item_name] = (potsByItem[r.item_name] || 0) + (+r.qty_pots || 0); });
    const out = [];
    Object.entries(potsByItem).forEach(([it, pots]) => {
      const t = tmap[it];
      if (!t || (t.target_units == null && t.decision !== "drop")) return;
      const wantU = t.target_units == null ? 0 : Math.max(0, Math.round(+t.target_units));
      const wantPots = wantU * ppu;
      out.push({ item: it, wantU, wantPots, pots, delta: wantPots - pots, by: t.decided_by,
        drop: t.decision === "drop" || wantU === 0, ppu });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [rows, tmap, recipe]);
  const pendingGaps = targetGaps.filter(g => g.delta !== 0);

  // apply ONE item's walkthrough target to its rows (largest remainder), audit-logged.
  // Explicit by design: the target is the decision record, rows are production — the
  // bridge is a button, never magic.
  async function applyTarget(g) {
    const its = (rows || []).filter(r => r.item_name === g.item && !r.is_combo_component);
    if (!its.length) return;
    const cur = its.reduce((a, r) => a + (+r.qty_pots || 0), 0);
    const exact = its.map(r => cur > 0 ? g.wantPots * (+r.qty_pots || 0) / cur : g.wantPots / its.length);
    const flo = exact.map(Math.floor);
    const rem = g.wantPots - flo.reduce((a, b) => a + b, 0);
    exact.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr).slice(0, Math.max(0, rem)).forEach(x => flo[x.i]++);
    setBusy(true);
    for (let i = 0; i < its.length; i++) {
      if (flo[i] !== +its[i].qty_pots) await sb.from("scheduled_crops").update({ qty_pots: flo[i] }).eq("id", its[i].id);
    }
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: g.item,
        change_type: "target_applied", detail: { target_units: g.wantU, pots_from: cur, pots_to: g.wantPots },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    setBusy(false); setTick(t => t + 1);
  }

  // plan-qty edit: distribute a variety's new total across its bench rows (largest remainder)
  async function setVarQty(vr, newTotal) {
    const tot = Math.max(0, Math.round(newTotal));
    const cur = vr.pots || 0;
    if (tot === cur) return;
    const exact = vr.rows.map(r => cur > 0 ? tot * (+r.qty_pots || 0) / cur : tot / vr.rows.length);
    const flo = exact.map(Math.floor);
    let rem = tot - flo.reduce((a, b) => a + b, 0);
    exact.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr).slice(0, Math.max(0, rem)).forEach(x => flo[x.i]++);
    setBusy(true);
    for (let i = 0; i < vr.rows.length; i++) {
      if (flo[i] !== +vr.rows[i].qty_pots) await sb.from("scheduled_crops").update({ qty_pots: flo[i] }).eq("id", vr.rows[i].id);
    }
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
        variety_key: vr.vkey || null, change_type: "family_qty", detail: { variety: vr.variety, from: cur, to: tot },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    setBusy(false); setTick(t => t + 1);
  }

  const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12 };
  const th = { textAlign: "left", padding: "6px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "7px 9px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  const wkStyle = { fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 };

  if (!recipe && rows !== null) return (
    <Overlay onClose={onClose}><div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>No recipe found for this item — run the recipe seed, or this item's rows aren't linked yet.</div></Overlay>
  );
  if (!rows) return <Overlay onClose={onClose}><div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>Loading the family…</div></Overlay>;

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontFamily: FONT }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {recipe.size_label} {recipe.crop_name} — the whole family
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>{groups.length} planting group{groups.length === 1 ? "" : "s"} · {Object.keys(vmap).length} varieties · {plan.name}</div>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.muted }}>✕</button>
        </div>

        {/* hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, margin: "10px 0 12px" }}>
          {[[totals.pots.toLocaleString(), "planned (pots/flats)"],
            [totals.plants.toLocaleString(), `plants to order${recipe.overage_pct ? ` (+${recipe.overage_pct}% ov)` : ""}`],
            [totals.traysN.toFixed(1), "prop trays to stick"],
            [`$${Math.round(totals.liner).toLocaleString()}`, "liner spend (priced rows)"]]
            .map(([v, k], i) => (
              <div key={i} style={{ background: C.cream, border: `1px solid ${C.creamBr}`, borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ ...wkStyle, fontSize: 17, color: C.dark }}>{v}</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>{k}</div>
              </div>
            ))}
        </div>

        {ripple && (
          <div style={{ background: ripple.flags.length ? C.amberBg : C.chip, border: `1.5px solid ${ripple.flags.length ? "#ecd9b8" : C.border}`,
            borderRadius: 10, padding: "9px 13px", marginBottom: 12, fontSize: 12, color: C.text }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <b>{ripple.flags.length ? "⚠ Ripple" : "✓ Ripple"}</b>
              <span>{ripple.moved} floor task{ripple.moved === 1 ? "" : "s"} moved with the chain{ripple.flags.length ? ` · ${ripple.flags.length} need${ripple.flags.length === 1 ? "s" : ""} your eyes:` : "."}</span>
              <button onClick={() => setRipple(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
            </div>
            {ripple.flags.map((f, i) => <div key={i} style={{ marginTop: 4, fontSize: 11.5, color: C.amber }}>• {f}</div>)}
          </div>
        )}

        {/* recipe card — lock/save */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap",
            background: locked ? C.chip : C.amberBg, borderBottom: `1px solid ${C.border}`, borderRadius: "12px 12px 0 0" }}>
            <b style={{ fontSize: 12.5, color: locked ? C.text : C.amber }}>
              {locked ? "🔒 Family recipe — source of truth; edits cascade everywhere" : "✏️ EDITING THE RECIPE — nothing commits until you save"}
            </b>
            {savedMsg && <span style={{ fontSize: 11.5, color: C.green }}>{savedMsg}</span>}
            {recipe && (
              <button onClick={async () => {
                  const next = recipe.plant_class === "perennial" ? null : "perennial";
                  setRecipe({ ...recipe, plant_class: next });
                  await sb.from("crop_recipes").update({ plant_class: next }).eq("id", recipe.id);
                }}
                title="Tag the whole family — 🌲 perennial families get their own filter in Sales vs Plan (works even while locked; it's a tag, not a chain parameter)"
                style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                  border: `1.5px solid ${recipe.plant_class === "perennial" ? "#2e7d32" : C.border}`,
                  background: recipe.plant_class === "perennial" ? "#eaf5e9" : "#fff",
                  color: recipe.plant_class === "perennial" ? "#2e7d32" : C.muted }}>
                {recipe.plant_class === "perennial" ? "🌲 Perennial" : "tag 🌲 perennial"}
              </button>
            )}
            <span style={{ flex: 1 }} />
            {locked
              ? <button onClick={unlock} style={{ background: C.dark, color: C.cream, border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Unlock to edit</button>
              : <>
                <button disabled={busy} onClick={save} style={{ background: C.light, color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>💾 Save recipe</button>
                <button onClick={cancel} style={{ background: "none", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              </>}
          </div>
          <div style={{ padding: "10px 14px", opacity: locked ? .65 : 1, pointerEvents: locked ? "none" : "auto" }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 8 }}>
              {[["crop_weeks", "crop wks"], ["ppp", "ppp"], ["pots_per_unit", "pots/unit"], ["overage_pct", "overage %"], ["hold_tolerance_wks", "hold tol. wks"]].map(([k, l]) => (
                <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>
                  {l}<input type="number" value={recipe[k] ?? ""} onChange={e => setRecipe({ ...recipe, [k]: e.target.value === "" ? null : +e.target.value })}
                    style={{ width: 52, padding: "4px 6px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700 }} />
                </label>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["Series", "Broker 📌", "Form", "Root (wks)", "Tray"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {series.map(s => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        <input value={s.series_name}
                          onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, series_name: e.target.value } : x))}
                          title={`rename the series — "(unassigned)" just means the seed couldn't derive it from the variety names`}
                          style={{ width: 130, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 12, fontWeight: 700, fontFamily: FONT }} />
                      </td>
                      <td style={td}>
                        {(() => {
                          if (locked) return <>{s.pinned_broker || "—"}{s.pinned_supplier ? ` · ${s.pinned_supplier}` : ""}</>;
                          const opts = brokerStats[s.series_name] || [];
                          // pinning is ALWAYS allowed — quote coverage annotates, it doesn't gate
                          const known = [...new Set([...opts.map(o => o.broker),
                            ...(s.pinned_broker ? [s.pinned_broker] : []),
                            "Ball", "EHR", "Express", "Foremost"])];
                          return (
                            <select value={s.pinned_broker || ""}
                              onChange={e => {
                                const pick = opts.find(o => o.broker === e.target.value);
                                setSeries(series.map(x => x.id === s.id ? { ...x, pinned_broker: e.target.value || null, pinned_supplier: pick?.supplier ?? x.pinned_supplier } : x));
                              }}
                              style={{ padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, maxWidth: 230, cursor: "pointer" }}>
                              <option value="">— no pin —</option>
                              {known.map(b => {
                                const o = opts.find(x => x.broker === b);
                                return <option key={b} value={b}>{o
                                  ? `${b}${o.supplier ? ` · ${o.supplier}` : ""} — from $${o.min.toFixed(3)} · ${o.cov}/${o.tot} colors`
                                  : `${b} — no ${s.form || ""} quotes on file`}</option>;
                              })}
                            </select>
                          );
                        })()}
                      </td>
                      <td style={td}>
                        <select value={s.form || ""} onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, form: e.target.value || null } : x))}
                          style={{ padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: "ui-monospace,Menlo,monospace" }}>
                          {["", "URC", "CALL", "PLUG", "SEED", "BULB", "LINER", "DIRECT STICK"].map(f => <option key={f} value={f}>{f || "—"}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input type="number" value={s.rooting_weeks ?? ""} onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, rooting_weeks: e.target.value === "" ? null : +e.target.value } : x))}
                          style={{ width: 48, padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700 }} />
                      </td>
                      <td style={td}>
                        <select value={s.prop_tray_id || ""}
                          onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, prop_tray_id: e.target.value || null } : x))}
                          style={{ padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, maxWidth: 170 }}>
                          <option value="">—</option>
                          {trayOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {!series.length && <tr><td style={td} colSpan={5}>No series yet — the seed derives them from variety names; add via re-seed or SQL.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* walkthrough targets not yet reflected in the rows — the SvP → dig-in bridge */}
        {pendingGaps.length > 0 && (
          <div style={{ ...card, border: `1.5px solid ${C.amber}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: C.amberBg,
              borderBottom: `1px solid ${C.border}`, borderRadius: "12px 12px 0 0", flexWrap: "wrap" }}>
              <b style={{ fontSize: 12.5, color: C.amber }}>🎯 Walkthrough targets — set in Sales vs Plan, not yet in these rows</b>
              <span style={{ flex: 1 }} />
              {pendingGaps.length > 1 && (
                <button disabled={busy} onClick={async () => { for (const g of pendingGaps) await applyTarget(g); }}
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.amber, color: "#fff", fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                  Apply all ({pendingGaps.length})
                </button>
              )}
            </div>
            {pendingGaps.map(g => (
              <div key={g.item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", borderBottom: `1px solid ${C.border}`, fontSize: 12.5, flexWrap: "wrap" }}>
                <b style={{ minWidth: 180 }}>{g.item}</b>
                {g.drop
                  ? <span style={{ color: "#c0492b", fontWeight: 700 }}>✕ dropped in the walkthrough → rows go to 0 ({g.pots.toLocaleString()} pots today)</span>
                  : <span>
                      🎯 <b>{g.wantU.toLocaleString()}</b> units{g.ppu > 1 ? ` (= ${g.wantPots.toLocaleString()} pots)` : ""} · rows today <b>{g.pots.toLocaleString()}</b> pots ·{" "}
                      <b style={{ color: g.delta > 0 ? "#2e7d32" : "#c0492b" }}>{g.delta > 0 ? "+" : ""}{g.delta.toLocaleString()}</b>
                    </span>}
                {g.by && <span style={{ fontSize: 10.5, color: C.muted }}>by {g.by}</span>}
                <button disabled={busy} onClick={() => applyTarget(g)}
                  style={{ marginLeft: "auto", padding: "4px 11px", borderRadius: 8, border: `1.5px solid ${C.amber}`, background: "#fff", color: C.amber, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                  Apply → rows
                </button>
              </div>
            ))}
            <div style={{ padding: "6px 14px 9px", fontSize: 10.5, color: C.muted }}>
              Applying redistributes that item's bench rows (largest remainder) and logs to its history. The target stays the decision record — rows are production.
            </div>
          </div>
        )}

        {/* planting groups */}
        {groups.map(g => {
          const open = openG[g.key] ?? true;
          const gPots = g.vars.reduce((a, v) => a + v.pots, 0);
          return (
            <div key={g.key} id={`fam-grp-${g.key}`} style={{ ...card,
              boxShadow: flashKey === g.key ? "0 0 0 3px #e8b53a66" : "none", transition: "box-shadow 1.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer",
                background: flashKey === g.key ? "#fdf3dc" : C.cream, transition: "background 1.2s",
                borderBottom: open ? `1px solid ${C.border}` : "none", borderRadius: open ? "12px 12px 0 0" : 12 }}
                onClick={() => setOpenG({ ...openG, [g.key]: !open })}>
                <span style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
                <b style={{ fontSize: 12 }}>Group {g.n}</b>
                {flashKey === g.key && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "2px 7px" }}>you just edited this — groups number by finish order</span>}
                <span style={{ fontSize: 11, color: C.muted }} onClick={e => e.stopPropagation()}>
                  ship <b style={wkStyle}>{g.shipMin == null ? "—" : g.shipMin === g.shipMax ? wkFmt(g.plantYear, g.shipMin) : `${wkFmt(g.plantYear, g.shipMin)}–${wkFmt(g.plantYear, g.shipMax)}`}</b> → plant <b style={wkStyle}>{wkFmt(g.plantYear, g.plant)}</b> → ready{" "}
                  <GroupWkInput key={`${g.key}|${g.ready}`} value={g.ready != null ? wkFmt(g.plantYear, g.ready) : ""} disabled={busy}
                    onCommit={raw => applyGroupReady(g, raw)} />
                  <span title="edit the finish week — the whole group's chain re-derives from the recipe" style={{ marginLeft: 3, fontSize: 9, color: C.muted }}>✎</span>
                </span>
                <span style={{ flex: 1 }} />
                {(() => {   // drift referee: does the actual plant week agree with ready − recipe crop weeks?
                  const exp = g.ready != null && recipe?.crop_weeks != null ? g.ready - recipe.crop_weeks : null;
                  return exp != null && g.plant != null && exp !== g.plant
                    ? <span title={`recipe says plant = ready − ${recipe.crop_weeks} crop wks = wk${exp}; plan says wk${g.plant}`}
                        style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "2px 7px" }}>
                        ⚠ recipe drift {g.plant > exp ? "+" : ""}{g.plant - exp}wk</span>
                    : null;
                })()}
                <span style={{ fontSize: 11, color: C.muted }}>{g.vars.length} varieties · {gPots.toLocaleString()} pots</span>
                <span onClick={e => e.stopPropagation()} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  {dupG?.key === g.key ? (
                    <>
                      <input autoFocus value={dupG.wk} onChange={e => setDupG({ key: g.key, wk: e.target.value })}
                        onKeyDown={e => { if (e.key === "Enter" && dupG.wk.trim()) duplicateGroup(g, dupG.wk); if (e.key === "Escape") setDupG(null); }}
                        placeholder="ready wk (18 or 2718)" inputMode="numeric"
                        style={{ width: 118, padding: "4px 7px", borderRadius: 7, border: `1.5px solid ${C.light}`, fontSize: 11.5, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 }} />
                      <button disabled={busy || !dupG.wk.trim()} onClick={() => duplicateGroup(g, dupG.wk)}
                        style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>Go</button>
                      <button onClick={() => setDupG(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                    </>
                  ) : (
                    <button disabled={busy} onClick={() => setDupG({ key: g.key, wk: "" })}
                      title="ADD a planting group: clone this group's colors into a NEW round at a different finish week — quantities copy as-is, benches unassigned, supply unordered"
                      style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                      ⧉ New round
                    </button>
                  )}
                </span>
              </div>
              {open && (
                <div style={{ padding: "4px 10px 10px", overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr>{["Variety", "Series", "Form", "'26 sold", "Sell-thru", "Planned (pots)", "$/liner", "Broker"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {g.vars.map(vr => {
                        const s = seriesOf(vr.variety);
                        const pct = vr.pots > 0 && vr.sold != null ? Math.round(vr.sold * 100 / vr.pots) : null;
                        return (
                          <tr key={vr.variety} onContextMenu={e => { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY, vr, gKey: g.key }); }}
                            title="right-click for actions">
                            <td style={{ ...td, fontWeight: 700 }}>{vr.variety}
                              {vr.items.size > 1 && <span title={[...vr.items].join(" · ")} style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "1px 5px" }}>{vr.items.size} lines</span>}
                              {!!vr.benches.size && <div style={{ fontSize: 9.5, fontWeight: 500, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>{[...vr.benches].sort().join(" ")}</div>}
                            </td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{s?.series_name || "—"}</td>
                            <td style={td}><span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: /CALL/.test(s?.form || "") ? C.amberBg : C.chip, color: /CALL/.test(s?.form || "") ? C.amber : C.green }}>{s?.form || "—"}</span></td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{vr.sold ? vr.sold.toLocaleString() : "—"}</td>
                            <td style={{ ...td, minWidth: 90 }}>
                              {pct == null ? <span style={{ color: C.muted, fontSize: 10 }}>—</span> : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ width: 52, height: 8, background: C.chip, borderRadius: 4, overflow: "hidden", display: "inline-block" }}>
                                    <span style={{ display: "block", height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 95 ? C.light : pct >= 60 ? "#a8c95d" : C.amber }} />
                                  </span>
                                  <b style={{ fontSize: 11, color: pct < 60 ? C.amber : C.dark, fontVariantNumeric: "tabular-nums" }}>{pct}%</b>
                                </span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              <QtyInput value={vr.pots} disabled={busy} onCommit={v => setVarQty(vr, v)} />
                            </td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{vr.liner != null ? `$${vr.liner.toFixed(3)}` : <span style={{ color: C.amber, fontSize: 10 }}>no quote</span>}</td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{vr.broker || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!groups.length && <div style={{ ...card, padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No plan rows linked to this recipe in {plan.name}.</div>}

        {ctx && (
          <>
            {/* backdrop owns dismissal — any click OR right-click outside closes, nothing global */}
            <div onClick={() => setCtx(null)} onContextMenu={e => { e.preventDefault(); setCtx(null); }}
              style={{ position: "fixed", inset: 0, zIndex: 9490, background: "transparent" }} />
            <div style={{ position: "fixed", left: Math.min(ctx.x, window.innerWidth - 250), top: Math.min(ctx.y, window.innerHeight - 220),
              zIndex: 9500, background: "#fff", border: `1px solid ${C.creamBr}`, borderRadius: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,.3)", minWidth: 230, overflow: "hidden", fontFamily: FONT }}>
              <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                letterSpacing: ".5px", color: C.muted, background: C.cream, borderBottom: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1 }}>{ctx.vr.variety} · {ctx.vr.pots.toLocaleString()} pots</span>
                <button onClick={() => setCtx(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
              </div>
              {groups.filter(g => g.key !== ctx.gKey).map(g => (
                <button key={g.key} disabled={busy}
                  onClick={() => moveToGroup(ctx.vr, { plant: g.plant, plantYear: g.plantYear, ready: g.ready, readyYear: g.plantYear })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff",
                    border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>
                  → Move to <b>Group {g.n}</b> <span style={{ color: C.muted, fontSize: 11 }}>plant {wkFmt(g.plantYear, g.plant)} · ready {wkFmt(g.plantYear, g.ready)}</span>
                </button>
              ))}
              {ctx.newWk == null ? (
                <button disabled={busy} onClick={() => setCtx({ ...ctx, newWk: "" })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff",
                    border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: C.green, fontWeight: 700 }}>
                  ＋ New group — pick a ready week…
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 12px" }}>
                  <input autoFocus value={ctx.newWk} onChange={e => setCtx({ ...ctx, newWk: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter" && ctx.newWk.trim()) { const vr = ctx.vr, wk = ctx.newWk; setCtx(null); moveToNewGroup(vr, wk); } }}
                    placeholder="ready wk (18 or 2718)" inputMode="numeric"
                    style={{ flex: 1, padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 12, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 }} />
                  <button disabled={busy || !ctx.newWk.trim()} onClick={() => { const vr = ctx.vr, wk = ctx.newWk; setCtx(null); moveToNewGroup(vr, wk); }}
                    style={{ padding: "6px 11px", borderRadius: 7, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>Go</button>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ fontSize: 10.5, color: C.muted, textAlign: "center", marginTop: 4 }}>
          Sold figures come from the canonical SKU map (item → sku → sales), allocated FIFO across the groups that grew each item — combo-modeled lines included. Qty edits redistribute across bench rows (largest remainder) and log to the item history. ⚠ drift badges = plan weeks disagree with the recipe's chain.
        </div>
      </div>
    </Overlay>
  );
}

// group ready-week input: shorthand ok ("18" or "2718"), commits on blur/Enter
function GroupWkInput({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(String(value)); }, [value, focus]);
  return (
    <input value={draft} disabled={disabled} inputMode="numeric"
      onClick={e => e.stopPropagation()}
      onFocus={() => setFocus(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocus(false); if (draft.trim() && draft !== String(value)) onCommit(draft); else setDraft(String(value)); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: 52, padding: "2px 5px", textAlign: "center", borderRadius: 6, border: "1.5px solid #cfe3bd",
        fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5, fontWeight: 700, color: "#2e7d32", background: "#fff" }} />
  );
}

// commit-on-blur qty input (never resets mid-typing)
function QtyInput({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(String(value)); }, [value, focus]);
  return (
    <input value={draft} disabled={disabled} inputMode="numeric"
      onFocus={() => setFocus(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocus(false); const v = parseInt(draft, 10); if (!Number.isNaN(v) && v !== value) onCommit(v); else setDraft(String(value)); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: 68, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: "1.5px solid #cfe3bd",
        fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, fontWeight: 700 }} />
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9300,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 1040, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", maxHeight: "92vh", overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}
