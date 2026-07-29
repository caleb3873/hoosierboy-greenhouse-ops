// FamilyPage — the crop-family item page (Phase 2 slice 1 of the 2026-07-27 spec).
// One page for a whole crop × size family (e.g. 4.5" Lantana): planting groups,
// variety roster with sold-vs-planned, and the RECIPE editor (lock/save) writing the
// live spine (crop_recipes + crop_recipe_series). The page is a VIEW over the spine —
// recipe + plan rows + sales — never a second place to enter a fact.
import { useState, useEffect, useMemo, useRef } from "react";
import { getSupabase, getCultureClient } from "./supabase";
import { useAuth } from "./Auth";
import { rippleTasks, isoWeekOf } from "./ripple";
import AddPlantDoor from "./AddPlantDoor";
import { QuotePicker } from "./ProgramBuilder";
import { wrapWk, weeksInYear } from "./shared";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df", red: "#c0492b",
  redBg: "#fae9e5", border: "#e4ecdd", chip: "#eaf2e0", green: "#2e7d32" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const wkFmt = (yr, wk) => (yr == null || wk == null) ? "—" : `${String(yr).slice(2)}${String(wk).padStart(2, "0")}`;

// ONE DISPLAY UNIT (Caleb 7/29): the family page speaks POTS — always, never cases,
// even though 4.5" sells in cases. Rows arrive in two native encodings (pot-entered:
// qty_pots = pots · flat-entered: qty_pots = cases/flats) — normalize on read,
// denormalize on write. Plants stay qty_pots × row.ppp under BOTH encodings.
const potFactor = r => {
  const ppp = Math.max(1, +r.ppp || 1);
  const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1);
  return ppp >= ppu && ppu > 1 ? ppu : 1;   // flat-entered → each stored unit is ppu pots
};
const potsOf = r => (+r.qty_pots || 0) * potFactor(r);

// Past-week guard (Caleb 7/29: typed 2615 for 2715) — an item cannot finish in the past.
// Returns true (and explains) when the ready week already went by.
function readyInPast(yr, wk) {
  const n = new Date();
  const ds = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  const cw = isoWeekOf(ds), cy = n.getFullYear();
  if (yr < cy || (yr === cy && wk < cw)) {
    window.alert(`⚠ ${String(yr).slice(2)}${String(wk).padStart(2, "0")} is in the PAST — we're in wk${cw} of ${cy}. If you meant next year, type ${String(yr + 1).slice(2)}${String(wk).padStart(2, "0")}.`);
    return true;
  }
  return false;
}
// absolute week number (53-week-year aware) so gaps across the year wrap compute right
function absWkNum(yr, wk) {
  let n = +wk || 0;
  for (let y = 2024; y < (+yr || 2024); y++) n += weeksInYear(y);
  return n;
}
// finish weeks for chain re-derivation: the locked recipe when it has them, otherwise
// the gap the rows already carry (plant→ready). The week knobs must NOT dead-end on an
// unlocked recipe — Caleb 7/29: Dianthus ready 2715→2712 "kept snapping back" because
// crop_weeks was null and the handler bailed silently.
function finishWksOr(recipe, plantYr, plantWk, readyYr, readyWk) {
  if (recipe?.crop_weeks != null) return Math.round(+recipe.crop_weeks);
  if (plantWk != null && readyWk != null) {
    const d = absWkNum(readyYr ?? plantYr, readyWk) - absWkNum(plantYr, plantWk);
    if (d >= 0 && d < 80) return d;
  }
  window.alert("⚠ This recipe has no finish weeks yet, so the chain can't be re-derived. Unlock the recipe and set finish wks (plant→ready) — or use a group that already has both plant and ready weeks.");
  return null;
}
// size label → item-name prefix, same convention the Add-a-plant door writes with
function famSizePrefix(sizeLabel) {
  let m;
  if ((m = String(sizeLabel || "").match(/^([\d.]+)" HB$/))) return `HB ${m[1]}"`;
  if ((m = String(sizeLabel || "").match(/^([\d.]+)" Fiber$/))) return +m[1] >= 10 ? "FIBER LG." : "FIBER SM.";
  if ((m = String(sizeLabel || "").match(/^([\d.]+)" (Pot|Pan|Bowl)$/))) return +m[1] <= 6.5 ? `${m[1]}"` : `POT ${m[1]}"`;
  return String(sizeLabel || "").toUpperCase();
}

export default function FamilyPage({ plan, recipeId, onClose, onOpenItem }) {
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
  const [famSold, setFamSold] = useState(null);       // whole-family 2026 sales incl. removed varieties (name-matched)
  const [confirmRm, setConfirmRm] = useState(null);   // variety pending delete in the "not returning" strip
  const addedSeries = useRef([]);                     // placeholder series rows created this edit session — Cancel takes them back
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
        .select("id,item_name,variety_id,qty_pots,ppp,pack_size,plants_per_unit,qty_plants_ordered,plant_week,plant_year,ship_week,ship_year,ready_week,ready_year,broker,supplier,liner_unit_cost,prop_method,bench_id,is_combo_component")
        .eq("plan_id", plan.id).eq("recipe_id", recipeId).not("is_combo_component", "is", true).limit(2000);
      setRows(sc || []);
      const vids = [...new Set((sc || []).map(r => r.variety_id).filter(Boolean))];
      if (vids.length) {
        const { data: vs } = await sb.from("variety_library").select("id,variety,variety_key,match_aliases").in("id", vids);
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
        const { data: tgs } = await sb.from("plan_targets").select("item_name,target_units,decision,decided_by,applied_at,applied_units").eq("plan_id", plan.id).in("item_name", itemNames);
        setTmap(Object.fromEntries((tgs || []).map(t => [t.item_name, t])));
        const { data: maps } = await sb.from("sales_sku_map").select("sku,plan_item_name").in("plan_item_name", itemNames);
        const skuToItem = Object.fromEntries((maps || []).map(m => [m.sku, m.plan_item_name]));
        const skus = Object.keys(skuToItem);
        if (skus.length) {
          const { data: st } = await sb.from("sales_totals").select("sku,units").in("sku", skus);
          (st || []).forEach(s => { const it = skuToItem[s.sku]; soldMap[it] = (soldMap[it] || 0) + (+s.units || 0); });
        }
      }
      // sales arrive in SELLABLE UNITS (cases for 4.5") — convert to POTS here, once,
      // so every sold figure and sell-through on this page is pots vs pots
      const packByItem = {};
      (sc || []).forEach(r => {
        const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1);
        packByItem[r.item_name] = Math.max(packByItem[r.item_name] || 1, ppu);
      });
      Object.keys(soldMap).forEach(it => { soldMap[it] = soldMap[it] * (packByItem[it] || 1); });
      setSoldByItem(soldMap);
    })();
  }, [sb, plan.id, recipeId, tick]); // eslint-disable-line

  // broker coverage per series: who quotes this series' colors, at what floor price
  useEffect(() => {
    if (!series.length || !rows?.length || !Object.keys(vmap).length) return;
    (async () => {
      const named = series.map(s => s.series_name).filter(n => n !== "(unassigned)").sort((a, b) => b.length - a.length);
      // variety-centric: each variety carries its canonical key PLUS any manually-locked
      // aliases (match_aliases) — so a hand-matched quote counts as coverage and survives
      // the next quote re-upload (the alias lives on OUR variety, not the parsed quote).
      const vinfo = Object.values(vmap).map(v => ({
        series: named.find(n => v.variety.toLowerCase().startsWith(n.toLowerCase())) || "(unassigned)",
        key0: v.variety_key,
        keys: [v.variety_key, ...(v.match_aliases || [])].filter(Boolean),
      }));
      const allKeys = [...new Set(vinfo.flatMap(v => v.keys))];
      if (!allKeys.length) return;
      const quotes = [];
      for (let i = 0; i < allKeys.length; i += 100) {
        const { data } = await sb.from("broker_prices").select("variety_key,broker,supplier,form_class,landed").in("variety_key", allKeys.slice(i, i + 100));
        quotes.push(...(data || []));
      }
      const FORM_TO_CLASS = f => /^URC/i.test(f || "") ? "urc" : /^(CALL|DIRECT)/i.test(f || "") ? "callused" : /^PLUG/i.test(f || "") ? "plug" : /^SEED/i.test(f || "") ? "seed" : null;
      const byKey = {};
      quotes.forEach(q => (byKey[q.variety_key] = byKey[q.variety_key] || []).push(q));
      const stats = {};
      series.forEach(s => {
        const fc = FORM_TO_CLASS(s.form);
        const vs = vinfo.filter(v => v.series === s.series_name);
        const byBroker = {};
        vs.forEach(v => {
          const vq = v.keys.flatMap(k => byKey[k] || []).filter(q => !fc || q.form_class === fc);
          vq.forEach(q => {
            const b = byBroker[q.broker] || (byBroker[q.broker] = { broker: q.broker, supplier: q.supplier, min: +q.landed, covered: new Set() });
            b.min = Math.min(b.min, +q.landed);
            b.covered.add(v.key0);   // count the VARIETY, not the key, so aliases don't double it
            if (!b.supplier && q.supplier) b.supplier = q.supplier;
          });
        });
        stats[s.series_name] = Object.values(byBroker)
          .map(b => ({ broker: b.broker, supplier: b.supplier, min: b.min, cov: b.covered.size, tot: vs.length }))
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
        ready: r.ready_week, readyYear: r.ready_year, shipMin: null, shipMax: null, rows: [] });
      g.rows.push(r);
      if (r.ready_week != null) g.ready = Math.min(g.ready ?? 99, r.ready_week);
      if (r.ready_year != null && g.readyYear == null) g.readyYear = r.ready_year;
      if (r.ship_week != null) {
        // compare as absolute (year, week) — a wk-50 arrival that wrapped into the PRIOR
        // year must not read as later than a wk-3 arrival ("2703–2750" bug, Caleb 7/29)
        const shipYr = r.ship_year ?? r.plant_year ?? g.plantYear;
        const abs = shipYr * 100 + r.ship_week;
        if (g.shipMinAbs == null || abs < g.shipMinAbs) { g.shipMinAbs = abs; g.shipMin = r.ship_week; g.shipMinYr = shipYr; }
        if (g.shipMaxAbs == null || abs > g.shipMaxAbs) { g.shipMaxAbs = abs; g.shipMax = r.ship_week; g.shipMaxYr = shipYr; }
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
        o.pots += potsOf(r);
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
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + potsOf(r); });
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
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + potsOf(r); });
      g.vars.forEach(vr => {
        vr.sold = 0;
        const mine = {};
        vr.rows.forEach(r => { mine[r.item_name] = (mine[r.item_name] || 0) + potsOf(r); });
        Object.entries(mine).forEach(([it, p]) => {
          const tot = itemPots[it] || 1;
          vr.sold += Math.round((g.itemSold[it] || 0) * (tot > 0 ? p / tot : 1));
        });
      });
    });
    return gs;
  }, [rows, vmap, soldByItem, seriesOf, bmap]);

  // "not returning" tuck: a variety with ZERO pots family-wide and no grow intent
  // (no positive target, no grow decision) leaves the roster — the 2027 view shows
  // only what you're doing. History stays in the hero + past seasons.
  const growIntent = vr => [...vr.items].some(it => { const t = tmap[it]; return t && (t.decision === "grow" || (+t.target_units || 0) > 0); });
  const tucked = useMemo(() => {
    const by = {};
    groups.forEach(g => g.vars.forEach(vr => {
      const o = by[vr.variety] || (by[vr.variety] = { variety: vr.variety, vkey: vr.vkey, rows: [], pots: 0, sold: 0, items: new Set() });
      o.rows.push(...vr.rows); o.pots += vr.pots; o.sold += vr.sold || 0; vr.items.forEach(i => o.items.add(i));
    }));
    return Object.values(by).filter(v => v.pots === 0 && !growIntent(v)).sort((a, b) => b.sold - a.sold);
  }, [groups, tmap]); // eslint-disable-line
  const tuckedNames = useMemo(() => new Set(tucked.map(t => t.variety)), [tucked]);

  // groups number by what's VISIBLE — a round left holding only not-returning
  // varieties is hidden, and numbering must not skip over its husk (Caleb 7/29:
  // moved the last live variety out of Group 1, the survivor still said "Group 2")
  const displayGroups = useMemo(() => {
    const vis = groups.filter(g => g.vars.some(vr => !tuckedNames.has(vr.variety)));
    vis.forEach((g, i) => { g.n = i + 1; });
    return vis;
  }, [groups, tuckedNames]);

  // ── manual quote search + lock (Caleb 7/29) ───────────────────────────────
  // "Don't see the variety quoted from your broker but know it's there? Search
  // and match it yourself so it's permanently attached for future ordering."
  const [potOpts, setPotOpts] = useState([]);   // finished containers for the pot picker (match a family to a pot)
  const [cropSeriesSug, setCropSeriesSug] = useState([]);   // series names derived from ALL broker quotes for this crop
  const [quoteFor, setQuoteFor] = useState(null);   // {v} direct-to-variety, or {} free search
  const [pendingQuote, setPendingQuote] = useState(null);   // a picked quote awaiting "attach to which color?"
  // every plannable color in this family (variety_id → its plan rows), for the attach chooser
  const attachVars = useMemo(() => {
    const by = {};
    (rows || []).filter(r => !r.is_combo_component).forEach(r => {
      const v = vmap[r.variety_id];
      const key = r.variety_id || r.item_name;
      const o = by[key] || (by[key] = { variety_id: r.variety_id, variety: v?.variety || r.item_name, vkey: v?.variety_key, rows: [] });
      o.rows.push(r);
    });
    return Object.values(by).sort((a, b) => String(a.variety).localeCompare(String(b.variety)));
  }, [rows, vmap]);
  // finished-pot options for the header pot picker — match the family to the pot it ships in
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("containers").select("id,name,sku,cost_per_unit,diameter_in").eq("kind", "finished").order("diameter_in");
      setPotOpts(data || []);
    })();
  }, [sb]);
  async function setFamilyPot(containerId) {
    setRecipe(r => ({ ...r, default_container_id: containerId || null }));
    await sb.from("crop_recipes").update({ default_container_id: containerId || null }).eq("id", recipeId);
    try {
      const c = potOpts.find(x => x.id === containerId);
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `(family) ${recipe?.size_label} ${recipe?.crop_name}`,
        change_type: "pot_matched", detail: { container: c?.name || null, sku: c?.sku || null }, changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
  }

  // series dropdown suggestions come FROM THE QUOTES (Caleb 7/29: on Cuphea it only
  // showed Enchantia — the family's own — but Ball/Express carry FloriGlory, Sweet Talk,
  // Cubano, Vermillionaire…). Derive series from every broker quote's ORIGINAL name for
  // this crop (the key is word-sorted and useless for this; the display name isn't).
  useEffect(() => {
    const crop = recipe?.crop_name;
    if (!crop) { setCropSeriesSug([]); return; }
    (async () => {
      const { data } = await sb.from("broker_prices").select("variety").ilike("crop", `%${crop}%`).limit(2000);
      const genus = String(crop).toLowerCase().split(/\s+/)[0];
      // species/junk tokens that sit between genus and the real series in broker names
      const SKIP = /^(hyss|hys|hyb|hybrid|interspecific|hybrida|ignea|llavea|cyanea|hyssopifolia|x|sp|spp)\.?$/i;
      const clean = n => String(n || "").replace(/[™®'"‘’]/g, " ").replace(/\b(improved|imp|ppaf|pp\d+)\b/ig, " ").replace(/\b(19|20)\d\d\b/g, " ").replace(/\s+/g, " ").trim();
      const one = {}, two = {}, singles = new Set();
      (data || []).forEach(raw => {
        let t = clean(raw).split(" ").filter(Boolean);
        while (t.length && (t[0].toLowerCase() === genus || SKIP.test(t[0]))) t.shift();
        if (!t.length) return;
        if (t.length === 1) singles.add(t[0]);       // single-word series: Firecracker, Vermillionaire
        one[t[0]] = (one[t[0]] || 0) + 1;
        if (t.length >= 2) two[`${t[0]} ${t[1]}`] = (two[`${t[0]} ${t[1]}`] || 0) + 1;
      });
      const sug = new Set();
      Object.entries(two).forEach(([k, c]) => { if (c >= 2) sug.add(k); });   // recurring 2-word series (Sweet Talk)
      Object.entries(one).forEach(([k, c]) => {                                // recurring 1-word series (FloriGlory)
        if (c >= 2 && ![...sug].some(s => s.toLowerCase().startsWith(k.toLowerCase() + " "))) sug.add(k);
      });
      singles.forEach(s => sug.add(s));
      const title = s => s.split(" ").map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
      setCropSeriesSug([...sug].map(title).sort((a, b) => a.localeCompare(b)));
    })();
  }, [sb, recipe?.crop_name]);

  // lock a broker quote onto a color: stamp its cost/source on the plan rows AND
  // remember the matched key on the variety so it keeps matching after re-uploads.
  async function lockQuote(v, r) {
    if (!v || !r) return;
    const vid = v.variety_id || v.rows?.map(x => x.variety_id).find(Boolean);
    const targetRows = v.rows && v.rows.length ? v.rows : (rows || []).filter(x => x.variety_id === vid && !x.is_combo_component);
    if (!targetRows.length) { window.alert("No plan rows for this color to attach a quote to."); return; }
    if (!window.confirm(`Lock ${v.variety} to this quote?\n\n${r.variety} — ${[r.broker, r.supplier].filter(Boolean).join(" / ")} · ${r.form_class}${r.form_raw ? ` (${r.form_raw})` : ""} @ $${(+r.landed).toFixed(3)}/plant\n\nSets the cost on ${targetRows.length} row(s) and remembers this match for every future quote upload.`)) return;
    setBusy(true);
    try {
      for (const x of targetRows) {
        // sourcing_locked = the reprice engine refreshes this only from THIS broker/supplier,
        // never re-points it by name-match (the lock is permanent for future ordering)
        await sb.from("scheduled_crops").update({ liner_unit_cost: +r.landed, broker: r.broker, supplier: r.supplier, sourcing_locked: true }).eq("id", x.id);
      }
      if (vid && r.variety_key) {
        const { data: vrow } = await sb.from("variety_library").select("variety_key,match_aliases").eq("id", vid).single();
        const cur = vrow?.match_aliases || [];
        if (r.variety_key !== vrow?.variety_key && !cur.includes(r.variety_key)) {
          await sb.from("variety_library").update({ match_aliases: [...cur, r.variety_key] }).eq("id", vid);
        }
      }
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: targetRows[0]?.item_name || v.variety,
          variety_key: r.variety_key || null, change_type: "quote_locked",
          detail: { variety: v.variety, broker: r.broker, supplier: r.supplier, landed: +r.landed, matched_key: r.variety_key },
          changed_by: displayName || null, source: "family-page" });
      } catch { /* audit must not block */ }
    } catch (e) { window.alert("Couldn't lock the quote: " + (e.message || e)); }
    setBusy(false); setQuoteFor(null); setPendingQuote(null); setTick(t => t + 1);
  }

  const [openG, setOpenG] = useState({});
  const [ctx, setCtx] = useState(null);   // {x, y, vr, gKey, newWk} — right-click action menu
  const [flashKey, setFlashKey] = useState(null);   // follow the group you just edited across a re-sort
  const [dupG, setDupG] = useState(null);           // {key, wk} — inline "⧉ New round" week input per group
  const [addDoor, setAddDoor] = useState(null);     // {readyWk} — ＋ Add a color opens THE door, group week prefilled
  const [ripple, setRipple] = useState(null);       // {moved, flags[]} — last ripple result banner

  // whole-family 2026 sales by NAME match (size prefix + crop), independent of the
  // plan's current rows — so deleting a variety never erases the family's history.
  useEffect(() => {
    if (!recipe) return;
    (async () => {
      const crop = String(recipe.crop_name || "").toUpperCase();
      const pref = famSizePrefix(recipe.size_label).toUpperCase();
      const { data: maps } = await sb.from("sales_sku_map").select("sku,plan_item_name").ilike("plan_item_name", `%${crop}%`);
      const mine = (maps || []).filter(m => String(m.plan_item_name || "").toUpperCase().startsWith(pref));
      const skuToItem = Object.fromEntries(mine.map(m => [m.sku, m.plan_item_name]));
      const skus = Object.keys(skuToItem);
      let units = 0, rev = 0; const items = new Set();
      for (let i = 0; i < skus.length; i += 200) {
        const { data: st } = await sb.from("sales_totals").select("sku,units,revenue").in("sku", skus.slice(i, i + 200));
        (st || []).forEach(s => { units += +s.units || 0; rev += +s.revenue || 0; items.add(skuToItem[s.sku]); });
      }
      setFamSold({ units, rev, items: items.size });
    })();
  }, [recipe, sb]); // eslint-disable-line

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
    if (!digits) return;
    const finWks = finishWksOr(recipe, g.plantYear, g.plant, g.readyYear, g.ready);
    if (finWks == null) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (g.readyYear ?? plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 53) return;
    if (readyInPast(readyYear, ready)) return;
    const wrap = wrapWk;
    const acc = { moved: 0, flags: [] };
    setBusy(true);
    for (const vr of g.vars) {
      const sSpec = seriesOf(vr.variety) || {};
      const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
      const p = wrap(ready - finWks, readyYear);
      const sh = rooted ? wrap(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
      for (const r of vr.rows) {
        const { error } = await sb.from("scheduled_crops").update({
          ready_week: ready, ready_year: readyYear,
          plant_week: p.wk, plant_year: p.yr, ship_week: sh.wk, ship_year: sh.yr,
        }).eq("id", r.id);
        if (error) { window.alert(`⚠ Week change did NOT save (${error.message}) — the group is unchanged in the database.`); setBusy(false); return; }
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
    const pNew = wrap(ready - finWks, readyYear);
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
    const wrapW = wrapWk;
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
    const r0 = vr.rows[0] || {};
    const finWks = finishWksOr(recipe, r0.plant_year, r0.plant_week, r0.ready_year, r0.ready_week);
    if (finWks == null) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 53) return;
    if (readyInPast(readyYear, ready)) return;
    const wrap = wrapWk;
    const sSpec = seriesOf(vr.variety) || {};
    const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
    const p = wrap(ready - finWks, readyYear);
    const sh = rooted ? wrap(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
    moveToGroup(vr, { plant: p.wk, plantYear: p.yr, ready, readyYear });
  }

  // ⧉ New round: clone every color of a group into a NEW planting group at a chosen
  // finish week — the family page's way to ADD groups (the right-click menu only MOVES).
  // Quantities copy as-is (adjust after — the 🎯 target banner will show any overage);
  // benches unassigned, supply unordered: a new round is a new decision downstream.
  async function duplicateGroup(g, raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return;
    const finWks = finishWksOr(recipe, g.plantYear, g.plant, g.readyYear, g.ready);
    if (finWks == null) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (g.readyYear ?? plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 53) return;
    if (readyInPast(readyYear, ready)) return;
    const wrap = wrapWk;
    setBusy(true);
    const { data: full } = await sb.from("scheduled_crops").select("*").in("id", g.rows.map(r => r.id));
    const p = wrap(ready - finWks, readyYear);
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
  // ✕ Discontinue: remove a color from THIS plan — history lives in past seasons
  // (season lens, same as combos). Bookkeeping so it leaves quietly: drop decision
  // recorded (walkthrough shows ✕, not a mystery), its 2026 sales pre-dismissed from
  // the sold-not-in-plan gap list, pending auto floor tasks cleaned (completed stay).
  async function removeVariety(vr) {
    setBusy(true);
    const del = vr.rows.filter(r => !r.is_combo_component);
    const comboKept = vr.rows.length - del.length;
    const delIds = del.map(r => r.id);
    const idSet = new Set(delIds);
    const items = [...new Set(del.map(r => r.item_name))];
    // combo children of removed parents go first (FK order, same as the drill's delete)
    for (let i = 0; i < delIds.length; i += 100) await sb.from("scheduled_crops").delete().in("combo_parent_id", delIds.slice(i, i + 100));
    for (const it of items) {
      const remains = (rows || []).some(r => r.item_name === it && !idSet.has(r.id) && !r.is_combo_component);
      if (!remains) {
        await sb.from("plan_targets").upsert({
          plan_id: plan.id, item_name: it, target_units: 0, decision: "drop",
          note: "discontinued on the family page", decided_by: displayName || null,
          decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "plan_id,item_name" });
        try {
          await sb.from("plan_gap_decisions").upsert({
            plan_id: plan.id, gap_key: it, status: "dismissed",
            note: `${it} — discontinued on the family page`, decided_by: displayName || "planner",
          }, { onConflict: "plan_id,gap_key" });
        } catch { /* gap table may not know this item — fine */ }
        try {
          const { data: ts } = await sb.from("manager_tasks").select("id").eq("plan_id", plan.id)
            .ilike("created_by", "auto:%").ilike("title", `%${it}%`).neq("status", "completed");
          for (const t of ts || []) await sb.from("manager_tasks").delete().eq("id", t.id);
        } catch { /* task cleanup must not block */ }
      }
      try {
        await sb.from("item_change_log").insert({
          plan_id: plan.id, item_name: it, variety_key: vr.vkey || null, change_type: "removed_from_plan",
          detail: { variety: vr.variety, rows: del.filter(r => r.item_name === it).length,
            pots: del.filter(r => r.item_name === it).reduce((a, r) => a + (+r.qty_pots || 0), 0),
            ...(comboKept ? { combo_rows_kept: comboKept } : {}) },
          changed_by: displayName || null, source: "family-page",
        });
      } catch { /* audit must not block */ }
    }
    for (let i = 0; i < delIds.length; i += 100) await sb.from("scheduled_crops").delete().in("id", delIds.slice(i, i + 100));
    setBusy(false); setTick(t => t + 1);
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
  async function cancel() {
    // Add-series writes its placeholder row instantly (it needs an id to edit against) —
    // Cancel must take those back or "reverted — nothing changed" is a lie (review finding).
    for (const id of addedSeries.current) {
      await sb.from("crop_recipe_series").delete().eq("id", id).eq("series_name", "New series");
    }
    addedSeries.current = [];
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
    addedSeries.current = [];   // saved rows are legit now — Cancel must not touch them later
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
    rows.forEach(r => { if (!r.is_combo_component) potsByItem[r.item_name] = (potsByItem[r.item_name] || 0) + potsOf(r); });
    const out = [];
    Object.entries(potsByItem).forEach(([it, pots]) => {
      const t = tmap[it];
      if (!t || (t.target_units == null && t.decision !== "drop")) return;
      const wantU = t.target_units == null ? 0 : Math.max(0, Math.round(+t.target_units));
      const wantPots = wantU * ppu;
      // acknowledgment gate is VALUE-based: the line shows only when the walkthrough
      // NUMBER differs from the last number applied. Timestamps deliberately ignored —
      // notes, timing arrows and rounds edits bump updated_at and must not re-nag
      // (review finding), and deliberate production drift stays quiet.
      const stale = t.applied_at == null || (t.applied_units ?? null) !== wantU;
      out.push({ item: it, wantU, wantPots, pots, delta: wantPots - pots, by: t.decided_by,
        drop: t.decision === "drop" || wantU === 0, ppu, stale });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [rows, tmap, recipe]);
  const pendingGaps = targetGaps.filter(g => g.delta !== 0 && g.stale);

  // apply ONE item's walkthrough target to its rows (largest remainder), audit-logged.
  // Explicit by design: the target is the decision record, rows are production — the
  // bridge is a button, never magic.
  async function applyTarget(g) {
    const its = (rows || []).filter(r => r.item_name === g.item && !r.is_combo_component);
    if (!its.length) return;
    // wantPots is POTS; rows write back in their native unit (pots or whole flats)
    const factors = its.map(potFactor);
    const cur = its.reduce((a, r, i) => a + (+r.qty_pots || 0) * factors[i], 0);
    const exactNative = its.map((r, i) =>
      cur > 0 ? (g.wantPots * ((+r.qty_pots || 0) * factors[i]) / cur) / factors[i] : (g.wantPots / its.length) / factors[i]);
    const flo = exactNative.map(Math.floor);
    let remPots = g.wantPots - flo.reduce((a, n, i) => a + n * factors[i], 0);
    for (const o of exactNative.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr)) {
      if (remPots >= factors[o.i]) { flo[o.i]++; remPots -= factors[o.i]; }
    }
    setBusy(true);
    let failed = 0;
    for (let i = 0; i < its.length; i++) {
      if (flo[i] === +its[i].qty_pots) continue;
      // .select() so a 0-row match (deleted/RLS) counts as a failure, not silent success
      const { data: ok, error } = await sb.from("scheduled_crops").update({ qty_pots: flo[i] }).eq("id", its[i].id).select("id");
      if (error || !ok?.length) failed++;
    }
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: g.item,
        change_type: "target_applied", detail: { target_units: g.wantU, pots_from: cur, pots_to: g.wantPots, ...(failed ? { rows_failed: failed } : {}) },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    if (!failed) {
      // acknowledge ONLY a clean apply: value snapshot + stamp. A partial apply leaves
      // the line in the banner so it self-heals (review finding).
      await sb.from("plan_targets").update({ applied_at: new Date().toISOString(), applied_units: g.wantU }).eq("plan_id", plan.id).eq("item_name", g.item);
    } else {
      window.alert(`${g.item}: ${failed} row update${failed > 1 ? "s" : ""} didn't stick — the target stays in the banner. Try Apply again.`);
    }
    setBusy(false); setTick(t => t + 1);
  }

  // plan-qty edit: the input speaks POTS; rows store their native unit (pots OR flats) —
  // distribute by pot share, write back native, keep whole flats whole (largest remainder
  // measured in pots, granted one native unit at a time)
  async function setVarQty(vr, newTotal) {
    const tot = Math.max(0, Math.round(newTotal));   // POTS
    const factors = vr.rows.map(potFactor);
    const curPots = vr.rows.reduce((a, r, i) => a + (+r.qty_pots || 0) * factors[i], 0);
    if (tot === curPots) return;
    const cur = curPots;
    const exactNative = vr.rows.map((r, i) =>
      cur > 0 ? (tot * ((+r.qty_pots || 0) * factors[i]) / cur) / factors[i] : (tot / vr.rows.length) / factors[i]);
    const flo = exactNative.map(Math.floor);
    let remPots = tot - flo.reduce((a, n, i) => a + n * factors[i], 0);
    for (const o of exactNative.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr)) {
      if (remPots >= factors[o.i]) { flo[o.i]++; remPots -= factors[o.i]; }
    }
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
          <div title={recipe.display_name ? `custom name for ${recipe.size_label} ${recipe.crop_name} — rename in ⚙ Manage families` : undefined}
            style={{ fontSize: 21, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {recipe.display_name || `${recipe.size_label} ${recipe.crop_name}`} — the whole family
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>{groups.length} planting group{groups.length === 1 ? "" : "s"} · {Object.keys(vmap).length} varieties · {plan.name}</div>
          <span style={{ flex: 1 }} />
          {/* match this family to the pot it ships in — feeds the 🪴 Pot Orders ledger live */}
          <span title="the physical pot this family ships in — drives the pot-order worksheet"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: C.muted, fontWeight: 700 }}>
            🪴
            <select value={recipe.default_container_id || ""} onChange={e => setFamilyPot(e.target.value)}
              style={{ padding: "4px 6px", borderRadius: 7, border: `1.5px solid ${recipe.default_container_id ? C.light : C.amber}`, fontSize: 11.5, fontFamily: FONT, fontWeight: 700, maxWidth: 210, cursor: "pointer", background: recipe.default_container_id ? "#fff" : C.amberBg }}>
              <option value="">— match a pot —</option>
              {potOpts.map(c => <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ""}</option>)}
            </select>
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.muted }}>✕</button>
        </div>

        {/* hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, margin: "10px 0 12px" }}>
          {[[totals.pots.toLocaleString(), "planned (pots/flats)"],
            [totals.plants.toLocaleString(), `plants to order${recipe.overage_pct ? ` (+${recipe.overage_pct}% ov)` : ""}`],
            [totals.traysN.toFixed(1), "prop trays to stick"],
            [`$${Math.round(totals.liner).toLocaleString()}`, "liner spend (priced rows)"],
            ...(famSold && famSold.units > 0
              ? [[famSold.units.toLocaleString(), `2026 family sold · $${Math.round(famSold.rev).toLocaleString()} — all ${famSold.items} item${famSold.items === 1 ? "" : "s"}, incl. removed`]]
              : [])]
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
            {savedMsg && <span style={{ fontSize: 11.5, color: /^(⚠|couldn't)/i.test(savedMsg) ? C.red : C.green }}>{savedMsg}</span>}
            {recipe && (
              <button onClick={async () => {
                  const next = recipe.plant_class === "perennial" ? null : "perennial";
                  setRecipe({ ...recipe, plant_class: next });
                  await sb.from("crop_recipes").update({ plant_class: next }).eq("id", recipe.id);
                }}
                title={recipe.plant_class === "perennial"
                  ? "This family IS tagged perennial — click to remove the tag"
                  : "Not tagged — click to mark this family perennial (filters in Sales vs Plan)"}
                style={{ padding: "4px 10px", borderRadius: 14, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                  border: `1.5px solid ${recipe.plant_class === "perennial" ? "#2e7d32" : C.border}`,
                  background: recipe.plant_class === "perennial" ? "#2e7d32" : "#fff",
                  color: recipe.plant_class === "perennial" ? "#fff" : C.muted }}>
                {recipe.plant_class === "perennial" ? "🌲 Perennial ✓" : "🌲 Mark as perennial"}
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
              {[["crop_weeks", "finish wks (plant→ready)"], ["ppp", "ppp"], ["pots_per_unit", "pots/unit"], ["overage_pct", "overage %"], ["hold_tolerance_wks", "hold tol. wks"]].map(([k, l]) => (
                <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>
                  {l}<input type="number" value={recipe[k] ?? ""} onChange={e => setRecipe({ ...recipe, [k]: e.target.value === "" ? null : +e.target.value })}
                    style={{ width: 52, padding: "4px 6px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700 }} />
                </label>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["Series", "Broker 📌", "Form", "Prop (wks)", "Tray", "Total wks"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {series.filter(s => s.series_name !== "(unassigned)").map(s => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        <input value={s.series_name} list="fp-series-suggest"
                          onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, series_name: e.target.value } : x))}
                          title={`pick from the family's own series (derived from its variety names) or type — "(unassigned)" just means nothing derived it yet`}
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
                      <td style={{ ...td, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 800, color: C.dark }}
                        title="the static total — prop weeks (arrive→transplant) + finish weeks (transplant→ready). Edit the parts; this adds itself up.">
                        {recipe?.crop_weeks != null
                          ? `${Math.round(+recipe.crop_weeks) + (/^(URC|CALL)/i.test(s.form || "") && s.rooting_weeks != null ? Math.round(+s.rooting_weeks) : 0)}w`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {!series.filter(s => s.series_name !== "(unassigned)").length && <tr><td style={{ ...td, color: C.muted }} colSpan={6}>No series yet — ＋ Add series, or add colors from the catalog and they'll group by name.</td></tr>}
                </tbody>
              </table>
              {/* series suggestions = every series the BROKERS quote for this crop (Caleb 7/29:
                  Cuphea should show FloriGlory, Sweet Talk, Cubano… not just our Enchantia),
                  unioned with the family's own variety-name prefixes so nothing's lost */}
              <datalist id="fp-series-suggest">
                {(() => {
                  const names = Object.values(vmap).map(v => String(v.variety || "").replace(/[™®]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
                  const two = {};
                  names.forEach(n => { const t = n.split(" "); if (t.length >= 3) two[`${t[0]} ${t[1]}`] = (two[`${t[0]} ${t[1]}`] || 0) + 1; });
                  const sug = new Set(cropSeriesSug);
                  names.forEach(n => {
                    const t = n.split(" ");
                    const p2 = t.length >= 3 ? `${t[0]} ${t[1]}` : null;
                    if (p2 && two[p2] >= 2) sug.add(p2);
                    else if (t.length >= 2) sug.add(t[0]);
                  });
                  return [...sug].sort((a, b) => a.localeCompare(b)).map(nm => <option key={nm} value={nm} />);
                })()}
              </datalist>
              <button disabled={busy} onClick={async () => {
                  // one placeholder at a time — a second upsert would land on the SAME
                  // (recipe_id,'New series') row and clobber unsaved local edits
                  if (series.some(x => x.series_name.trim().toLowerCase() === "new series")) {
                    setSavedMsg("⚠ rename the 'New series' row first (then 💾 Save) before adding another"); return;
                  }
                  const { data: ins, error } = await sb.from("crop_recipe_series")
                    .upsert({ recipe_id: recipeId, series_name: "New series", form: "URC" }, { onConflict: "recipe_id,series_name" })
                    .select("*").single();
                  if (error) { setSavedMsg("⚠ couldn't add: " + error.message); return; }
                  addedSeries.current.push(ins.id);   // Cancel deletes untouched placeholders
                  setSeries(s => s.some(x => x.id === ins.id) ? s : [...s, ins]);   // never clobber local edits
                }}
                title="new varieties added from the catalog don't create their series row — add it here, rename it, set form/root/tray, save"
                style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: `1.5px dashed ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                ＋ Add series
              </button>
              <button disabled={busy} onClick={() => setQuoteFor({})}
                title="Don't see a variety quoted from your broker but know it's there? Search the catalog yourself and match it to a color — the match is remembered for every future order."
                style={{ marginTop: 8, marginLeft: 8, padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#eef6e8", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                🔗 Find &amp; match a quote
              </button>
            </div>
          </div>
        </div>

        <CultureCard recipe={recipe} series={series} locked={locked} setRecipe={setRecipe} setSeries={setSeries} />

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
                  : <span title={g.ppu > 1 ? `the walkthrough number was ${g.wantU.toLocaleString()} cases of ${g.ppu} — this page speaks pots only` : undefined}>
                      🎯 target <b>{g.wantPots.toLocaleString()} pots</b> · rows today <b>{g.pots.toLocaleString()} pots</b> ·{" "}
                      <b style={{ color: g.delta > 0 ? "#2e7d32" : "#c0492b" }}>{g.delta > 0 ? "+" : ""}{g.delta.toLocaleString()} pots</b>
                    </span>}
                {g.by && <span style={{ fontSize: 10.5, color: C.muted }}>by {g.by}</span>}
                <button disabled={busy} onClick={() => applyTarget(g)}
                  style={{ marginLeft: "auto", padding: "4px 11px", borderRadius: 8, border: `1.5px solid ${C.amber}`, background: "#fff", color: C.amber, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                  Apply → rows
                </button>
              </div>
            ))}
            <div style={{ padding: "6px 14px 9px", fontSize: 10.5, color: C.muted }}>
              Applying redistributes that item's bench rows (largest remainder), logs to its history, and clears the line — it returns only if the walkthrough number changes again. Production drifting on purpose afterwards (space calls) stays quiet; target vs actual reads back in Sales vs Plan and the item drill.
            </div>
          </div>
        )}

        {/* planting groups */}
        {displayGroups.map(g => {
          const open = openG[g.key] ?? true;
          const liveVars = g.vars.filter(vr => !tuckedNames.has(vr.variety));
          if (!liveVars.length) return null;   // a round of only not-returning varieties has nothing to say
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
                  ship <b style={wkStyle}>{g.shipMin == null ? "—" : g.shipMinAbs === g.shipMaxAbs ? wkFmt(g.shipMinYr, g.shipMin) : `${wkFmt(g.shipMinYr, g.shipMin)}–${wkFmt(g.shipMaxYr, g.shipMax)}`}</b> → plant <b style={wkStyle}>{wkFmt(g.plantYear, g.plant)}</b> → ready{" "}
                  <GroupWkInput key={`${g.key}|${g.ready}`} value={g.ready != null ? wkFmt(g.readyYear ?? g.plantYear, g.ready) : ""} disabled={busy}
                    onCommit={raw => applyGroupReady(g, raw)} />
                  <span title="edit the finish week — the whole group's chain re-derives from the recipe" style={{ marginLeft: 3, fontSize: 9, color: C.muted }}>✎</span>
                </span>
                <span style={{ flex: 1 }} />
                {(() => {   // drift referee: does the actual plant week agree with ready − recipe crop weeks? (year-wrap aware)
                  const expRaw = g.ready != null && recipe?.crop_weeks != null ? g.ready - Math.round(+recipe.crop_weeks) : null;
                  const exp = expRaw == null ? null : (expRaw <= 0 ? expRaw + 52 : expRaw);
                  return exp != null && g.plant != null && exp !== g.plant
                    ? <span title={`recipe says plant = ready − ${recipe.crop_weeks} crop wks = wk${exp}; plan says wk${g.plant}`}
                        style={{ fontSize: 9.5, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "2px 7px" }}>
                        ⚠ recipe drift {g.plant > exp ? "+" : ""}{g.plant - exp}wk</span>
                    : null;
                })()}
                <span style={{ fontSize: 11, color: C.muted }}>{liveVars.length} varieties · {gPots.toLocaleString()} pots</span>
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
                    <>
                      <button disabled={busy} onClick={() => setAddDoor({ readyWk: g.ready })}
                        title="add a color to this family through THE door — broker catalogs only, this group's finish week prefilled"
                        style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                        ＋ Add a color
                      </button>
                      <button disabled={busy} onClick={() => setDupG({ key: g.key, wk: "" })}
                        title="ADD a planting group: clone this group's colors into a NEW round at a different finish week — quantities copy as-is, benches unassigned, supply unordered"
                        style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                        ⧉ New round
                      </button>
                    </>
                  )}
                </span>
              </div>
              {open && (
                <div style={{ padding: "4px 10px 10px", overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr>{["Variety", "Series", "Form", "'26 sold", "Sell-thru", "Planned (pots)", "$/liner", "Broker"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {liveVars.map(vr => {
                        const s = seriesOf(vr.variety);
                        const pct = vr.pots > 0 && vr.sold != null ? Math.round(vr.sold * 100 / vr.pots) : null;
                        return (
                          <tr key={vr.variety} onContextMenu={e => { e.preventDefault(); setCtx({ x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY, vr, gKey: g.key }); }}
                            title="right-click for actions">
                            <td style={{ ...td, fontWeight: 700 }}>
                              {/* the name IS the door to the item page — variety edits live there, not here */}
                              <span onClick={onOpenItem ? (e => { e.stopPropagation(); onOpenItem([...vr.items][0]); }) : undefined}
                                title={onOpenItem ? "open the item page" : undefined}
                                style={onOpenItem ? { cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 } : undefined}>{vr.variety}</span>
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
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                              {vr.liner != null ? `$${vr.liner.toFixed(3)}`
                                : <button onClick={() => setQuoteFor({ v: { variety_id: vr.rows.map(r => r.variety_id).find(Boolean), variety: vr.variety, vkey: vr.vkey, rows: vr.rows } })}
                                    title="search the broker catalog and lock a quote to this color"
                                    style={{ border: `1px solid ${C.amber}`, background: C.amberBg, color: C.amber, borderRadius: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", cursor: "pointer", fontFamily: FONT }}>🔗 find quote</button>}
                            </td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                {vr.broker || "—"}
                                <button onClick={() => setQuoteFor({ v: { variety_id: vr.rows.map(r => r.variety_id).find(Boolean), variety: vr.variety, vkey: vr.vkey, rows: vr.rows } })}
                                  title="search the broker catalog and lock a quote to this color (remembered for future orders)"
                                  style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.6 }}>🔗</button>
                              </span>
                            </td>
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

        {/* the not-returning shelf: zero-quantity varieties with no grow intent live here,
            out of the roster — their sold history still counts in the hero above */}
        {tucked.length > 0 && (
          <div style={{ ...card, background: "#fafbf7" }}>
            <div style={{ padding: "8px 14px", fontSize: 11, color: C.muted, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <b style={{ color: C.text, fontSize: 11.5 }}>Not returning for {plan.name}</b>
              <span>— zero quantity, kept out of the roster:</span>
              {tucked.map(t => (
                <span key={t.variety} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>
                  {t.variety}
                  {t.sold > 0 && <span style={{ color: C.muted, fontWeight: 500 }}>'26 sold {t.sold.toLocaleString()}</span>}
                  {confirmRm === t.variety ? (
                    <>
                      <button disabled={busy} onClick={() => { setConfirmRm(null); removeVariety(t); }}
                        style={{ background: C.red, border: "none", color: "#fff", borderRadius: 8, padding: "1px 8px", cursor: "pointer", fontWeight: 800, fontSize: 10.5, fontFamily: FONT }}>✓ delete</button>
                      <button onClick={() => setConfirmRm(null)}
                        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontWeight: 700, fontSize: 10.5, padding: 0, fontFamily: FONT }}>keep</button>
                    </>
                  ) : (
                    <>
                      <button disabled={busy} onClick={async () => {
                          setBusy(true);
                          for (const it of [...t.items]) {
                            await sb.from("plan_targets").upsert({ plan_id: plan.id, item_name: it, decision: "grow",
                              note: "restored on the family page", decided_by: displayName || null,
                              decided_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "plan_id,item_name" });
                          }
                          setBusy(false); setTick(x => x + 1);
                        }}
                        title="bring it back into the roster (grow intent, quantity 0 — set the number there)"
                        style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontWeight: 800, fontSize: 11.5, padding: 0 }}>↩</button>
                      <button onClick={() => setConfirmRm(t.variety)}
                        title="delete its rows from this plan — past seasons keep the history, the hero total still counts it"
                        style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800, fontSize: 11.5, padding: 0 }}>✕</button>
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

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
              {onOpenItem && (
                <button disabled={busy} onClick={() => { const it = [...ctx.vr.items][0]; setCtx(null); onOpenItem(it); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff",
                    border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 700 }}>
                  🔍 Open the item page
                </button>
              )}
              {displayGroups.filter(g => g.key !== ctx.gKey).map(g => (
                <button key={g.key} disabled={busy}
                  onClick={() => moveToGroup(ctx.vr, { plant: g.plant, plantYear: g.plantYear, ready: g.ready, readyYear: g.readyYear ?? g.plantYear })}
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
              {!ctx.confirmRemove ? (
                <button disabled={busy} onClick={() => setCtx({ ...ctx, confirmRemove: true })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff",
                    border: "none", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, color: "#c0492b", fontWeight: 700 }}>
                  ✕ Discontinue — remove from {plan.name}…
                </button>
              ) : (
                <div style={{ padding: "9px 12px", background: "#fdf2f0", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11.5, color: "#c0492b", fontWeight: 700, marginBottom: 7, lineHeight: 1.4 }}>
                    Remove {ctx.vr.variety} from {plan.name}?<br />
                    <span style={{ fontWeight: 500 }}>{ctx.vr.rows.filter(r => !r.is_combo_component).length} row{ctx.vr.rows.filter(r => !r.is_combo_component).length === 1 ? "" : "s"} · {ctx.vr.pots.toLocaleString()} pots go away. Past seasons keep the history; the drop is recorded so it won't nag as a gap.
                    {ctx.vr.rows.some(r => r.is_combo_component) ? " Its combo appearances stay — edit those on the combo's page." : ""}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button disabled={busy} onClick={() => { const vr = ctx.vr; setCtx(null); removeVariety(vr); }}
                      style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: "#c0492b", color: "#fff", fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>✓ Remove</button>
                    <button onClick={() => setCtx({ ...ctx, confirmRemove: false })}
                      style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>keep</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ fontSize: 10.5, color: C.muted, textAlign: "center", marginTop: 4 }}>
          Sold figures come from the canonical SKU map (item → sku → sales), allocated FIFO across the groups that grew each item — combo-modeled lines included. Qty edits redistribute across bench rows (largest remainder) and log to the item history. ⚠ drift badges = plan weeks disagree with the recipe's chain.
        </div>

        {addDoor && (
          <AddPlantDoor plan={plan} initialReadyWk={addDoor.readyWk ?? undefined}
            onClose={() => setAddDoor(null)}
            onCreated={() => setTick(t => t + 1)}
            onOpenFamily={() => { /* already here — the reload shows the new color */ }} />
        )}

        {/* search the broker catalog and lock a quote to a color. From a color's 🔗 it
            attaches straight to that variety; from the toolbar it asks which color after. */}
        {quoteFor && (
          <QuotePicker sb={sb}
            varietyKey={quoteFor.v?.vkey || null}
            initialQuery={quoteFor.v?.variety || recipe?.crop_name || ""}
            onPick={r => { if (quoteFor.v) lockQuote(quoteFor.v, r); else setPendingQuote(r); }}
            onClose={() => setQuoteFor(null)} />
        )}
        {pendingQuote && (
          <div onClick={() => setPendingQuote(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "min(460px,94vw)", maxHeight: "80vh", overflow: "auto", padding: 18, fontFamily: FONT }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 4 }}>Attach this quote to which color?</div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                <b style={{ color: C.text }}>{pendingQuote.variety}</b> · {[pendingQuote.broker, pendingQuote.supplier].filter(Boolean).join(" / ")} · {pendingQuote.form_class} @ ${(+pendingQuote.landed).toFixed(3)}/plant
              </div>
              {attachVars.map(v => (
                <button key={v.variety_id || v.variety} disabled={busy} onClick={() => lockQuote(v, pendingQuote)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 5, borderRadius: 9, cursor: "pointer",
                    border: `1.5px solid ${C.border}`, background: "#fff", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.dark }}>
                  {v.variety}
                </button>
              ))}
              {!attachVars.length && <div style={{ fontSize: 12, color: C.muted }}>No colors in this family yet — add one first.</div>}
              <button onClick={() => setPendingQuote(null)} style={{ marginTop: 4, background: "none", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>cancel</button>
            </div>
          </div>
        )}

        {/* closure button — everything already saved live; humans still deserve a "done".
            EXCEPT an unlocked recipe: those drafts only commit on 💾 Save, so don't lie. */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, margin: "10px 0 4px" }}>
          <span style={{ fontSize: 11, color: C.muted }}>
            {locked ? "every change on this page saves the moment you make it — this just closes it out"
              : "the recipe is unlocked — 💾 Save or Cancel it up top before closing out"}
          </span>
          <button onClick={onClose} disabled={!locked}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: locked ? C.green : "#9fb096",
              color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: locked ? "pointer" : "default", fontFamily: FONT,
              boxShadow: locked ? "0 3px 10px rgba(46,125,50,.3)" : "none" }}>
            {locked ? "✓ Done — everything's saved" : "recipe edits pending…"}
          </button>
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

// ── 📖 Culture card — Caleb 7/29: "I thought finish and propagation weeks would
// autopopulate from the culture guides… this is the moment we actually use it."
// Reads culture_guides_public (cross-project, read-only) for this crop: breeder's
// propagation weeks + the finish-time matrix at this recipe's pot size, one line per
// series, with APPLY buttons that fill the recipe DRAFT (unlock → apply → save —
// the recipe stays the committed truth; culture is the informed suggestion).
function CultureCard({ recipe, series, locked, setRecipe, setSeries }) {
  const cc = getCultureClient();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);   // guide id whose prose is expanded

  useEffect(() => {
    if (!open || !cc || !recipe || rows) return;
    (async () => {
      const { data } = await cc.from("culture_guides_public")
        .select("id,breeder_name,series_name,series_variety,propagation_weeks,finish_time_matrix,propagation_details,culture_details,requires_heat")
        .ilike("crop_name", recipe.crop_name).limit(60);
      setRows(data || []);
    })();
  }, [open, cc, recipe, rows]);

  if (!cc || !recipe) return null;
  const sizeWant = parseFloat(recipe.size_label) || 4.5;
  // propagation_weeks is TEXT ("4-5"); the details + finish matrix are JSONB — real
  // objects off the wire, which is why the regex version showed an empty "full guide"
  const propOf = g => {
    const m = String(g.propagation_weeks || "").match(/(\d+)(?:\s*-\s*(\d+))?/);
    return m ? { lo: +m[1], hi: +(m[2] || m[1]) } : null;
  };
  const finishOf = g => {
    const m = g.finish_time_matrix;
    let out = [];
    if (m && typeof m === "object") {
      out = Object.entries(m).map(([k, v]) => ({
        size: parseFloat(String(k).replace(/^size_/, "").replace(/_inch$/, "").replace(/_/g, ".")),
        lo: +((v || {}).lower), hi: +((v || {}).upper),
      })).filter(e => e.size && e.lo);
    }
    if (!out.length) return null;
    out.sort((a, b) => Math.abs(a.size - sizeWant) - Math.abs(b.size - sizeWant));
    return out[0];
  };

  // one line per series (dedupe guides by series_name)
  const bySeries = {};
  (rows || []).forEach(g => {
    const k = String(g.series_name || g.series_variety || "?").replace(/[™®]/g, "").trim();
    if (!bySeries[k] || (finishOf(g) && !finishOf(bySeries[k]))) bySeries[k] = g;
  });

  const btn = (label, onClick, title) => (
    <button disabled={locked} onClick={onClick} title={locked ? "Unlock the recipe to apply" : title}
      style={{ padding: "2px 8px", borderRadius: 7, border: `1px solid ${locked ? C.border : C.light}`, background: "#fff",
        color: locked ? C.muted : C.dark, fontSize: 10.5, fontWeight: 800, cursor: locked ? "default" : "pointer", fontFamily: FONT }}>{label}</button>
  );

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", fontFamily: FONT, textAlign: "left" }}>
        <b style={{ fontSize: 12.5, color: C.text }}>📖 Culture — breeder guidance for {recipe.crop_name}</b>
        <span style={{ fontSize: 10.5, color: C.muted }}>prop + finish from the culture library; apply into the recipe</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 14px 12px" }}>
          {rows == null && <div style={{ fontSize: 12, color: C.muted }}>reading the culture library…</div>}
          {rows != null && !Object.keys(bySeries).length && <div style={{ fontSize: 12, color: C.muted }}>no culture guides on file for {recipe.crop_name} — set the recipe from experience, or add the guide to the culture library.</div>}
          {Object.entries(bySeries).sort().map(([name, g]) => {
            const p = propOf(g), f = finishOf(g);
            const mid = f ? Math.round((f.lo + f.hi) / 2) : null;
            return (
              <div key={g.id} style={{ padding: "6px 0", borderBottom: `1px solid #f0f4ec` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  <b>{name}</b>
                  <span style={{ fontSize: 10.5, color: C.muted }}>{g.breeder_name}</span>
                  {p != null && <span>prop <b>{p.lo === p.hi ? p.lo : `${p.lo}–${p.hi}`} wk</b> {btn(`→ prop ${p.hi}`, () => setSeries(series.map(x =>
                    (x.series_name !== "(unassigned)" && name.toLowerCase().startsWith(x.series_name.toLowerCase())) || /^(URC|CALL)/i.test(x.form || "")
                      ? { ...x, rooting_weeks: p.hi } : x)), `set ${p.hi} prop weeks (range upper) on this family's rooted series`)}</span>}
                  {f && <span>finish <b>{f.lo}–{f.hi} wk</b> <span style={{ color: C.muted, fontSize: 10.5 }}>@{f.size}"</span>{" "}
                    {btn(`→ finish ${mid}`, () => setRecipe({ ...recipe, crop_weeks: mid }), `set finish weeks to the midpoint (${mid})`)}</span>}
                  {String(g.requires_heat) === "True" && <span style={{ fontSize: 10, color: C.amber, fontWeight: 800 }}>🔥 bottom heat</span>}
                  <button onClick={() => setDetail(d => d === g.id ? null : g.id)}
                    style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, fontSize: 10.5, cursor: "pointer", fontWeight: 700, fontFamily: FONT }}>
                    {detail === g.id ? "hide details" : "full guide ▸"}
                  </button>
                </div>
                {detail === g.id && (() => {
                  // planning trio only (Caleb 7/29): prop time · finish times by size · temps
                  const fm = g.finish_time_matrix && typeof g.finish_time_matrix === "object"
                    ? Object.entries(g.finish_time_matrix).map(([k, v]) => ({
                        label: String(k).replace(/^size_/, "").replace(/_inch$/, "").replace(/_/g, ".") + '"',
                        lo: +((v || {}).lower), hi: +((v || {}).upper),
                      })).filter(e => e.lo).sort((a, b) => parseFloat(a.label) - parseFloat(b.label))
                    : [];
                  const temps = [];
                  for (const src of [g.propagation_details, g.culture_details]) {
                    if (src && typeof src === "object") {
                      for (const [k, v] of Object.entries(src)) {
                        if (/temp/i.test(k) && typeof v !== "object") temps.push([k, String(v)]);
                      }
                    }
                  }
                  const cropTime = g.culture_details && typeof g.culture_details === "object" ? g.culture_details["Crop Time"] : null;
                  return (
                    <div style={{ marginTop: 6, background: "#fbfdf8", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px", fontSize: 11.5, lineHeight: 1.6 }}>
                      {p != null && <div>🌱 <b style={{ color: C.dark }}>Prop:</b> {p.lo === p.hi ? p.lo : `${p.lo}–${p.hi}`} weeks</div>}
                      {fm.length > 0 && <div>⏱ <b style={{ color: C.dark }}>Finish:</b> {fm.map(e => `${e.label} ${e.lo}–${e.hi}wk`).join(" · ")}</div>}
                      {temps.map(([k, v]) => <div key={k}>🌡 <b style={{ color: C.dark }}>{k}:</b> {v}</div>)}
                      {cropTime && <div>📋 <b style={{ color: C.dark }}>Crop time:</b> {String(cropTime)}</div>}
                      {!fm.length && !temps.length && !cropTime && <div style={{ color: C.muted }}>this guide carries prop time only</div>}
                    </div>
                  );
                })()}
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            Apply fills the recipe DRAFT — unlock, apply, then 💾 Save. Your committed recipe stays the one truth; culture is the breeder's suggestion, and nothing you've set gets overwritten without you.
          </div>
        </div>
      )}
    </div>
  );
}
