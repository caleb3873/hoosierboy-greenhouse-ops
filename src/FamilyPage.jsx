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
import { wrapWk, weeksInYear, plantOrder, FinishWkInput } from "./shared";

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
// ── color bucketing for the 🎨 mix view ──────────────────────────────────────
// Variety names carry their color; bucket them so the family reads as a palette.
// Checked in order — first match wins (phrases before single words).
const COLOR_BUCKETS = [
  // series overrides first — some lines read as a SERIES, not a color (Caleb 8/10:
  // all Brocades together, all Calderas together, ivy geraniums as their own bucket)
  [/BROCADE/, "Brocade", "#a8623c"],
  [/CALDERA/, "Caldera", "#cf5a72"],
  [/PRECISION/, "Ivy geranium", "#7a6bbf"],
  [/APPLE ?BLOSSOM|BLUSH/, "Blush", "#f3c4c9"],
  [/DARK ?RED|CHERRY|NIGHT|BURGUNDY|WINE|MERLOT/, "Dark red", "#8e1f1f"],
  [/PINK FLAME/, "Pink", "#f08cae"],
  [/FIRE|SCARLET|FLAME/, "Fire red", "#e05420"],
  [/RED ICE|RED/, "Red", "#d23b2f"],
  [/SHOCKING PINK|HOT PINK|HOT ROSE|DEEP PINK|MAGENTA|FUCHSIA/, "Hot pink", "#e0447c"],
  [/PINK|ROSE|BATIK/, "Pink", "#f08cae"],
  [/WHITE|SNOW|IVORY/, "White", "#f3f0e2"],
  [/ORANGE|TANGERINE|MANGO/, "Orange", "#f07f1d"],
  [/SALMON|CORAL|PEACH|APRICOT/, "Salmon", "#fa8b6c"],
  [/VIOLET|PURPLE|PLUM/, "Violet", "#7d4fa8"],
  [/LAVENDER|BLUE|PERIWINKLE/, "Lavender", "#9b8fd0"],
  [/YELLOW|GOLD|LEMON/, "Yellow", "#f2c437"],
  [/SIZZLE|SPLASH|EYE|VEIN|STAR|PICOTEE|MIX\b/, "Bicolor", "#c98ab4"],
];
function colorBucketOf(name) {
  const n = String(name || "").toUpperCase();
  for (const [re, label, hex] of COLOR_BUCKETS) if (re.test(n)) return { label, hex };
  return { label: "Other", hex: "#a9b3a1" };
}

// ── 🎨 interactive color-mix explorer (pop-out) ──────────────────────────────
// Filter by color bucket, series, or search; bars and the per-variety table
// recompute over the filtered set so "how much of X" is always answerable.
function ColorMixModal({ seasonVars, seriesOf, famLabel, onClose }) {
  const [buckets, setBuckets] = useState(() => new Set());   // empty = all
  const [seriesSel, setSeriesSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const C2 = { dark: "#1e2d1a", light: "#7fb069", muted: "#7a8c74", border: "#dfe7d8", chip: "#eef3e8", amber: "#e89a3a" };
  const all = seasonVars.map(vr => ({ ...vr, bucket: colorBucketOf(vr.variety), seriesName: seriesOf(vr.variety)?.series_name || "—" }));
  const allSeries = [...new Set(all.map(v => v.seriesName))].sort();
  const qq = q.trim().toLowerCase();
  const rows = all.filter(v =>
    (!buckets.size || buckets.has(v.bucket.label)) &&
    (!seriesSel.size || seriesSel.has(v.seriesName)) &&
    (!qq || v.variety.toLowerCase().includes(qq)));
  const totP = rows.reduce((a, v) => a + v.pots, 0) || 1;
  const totS = rows.reduce((a, v) => a + (v.sold || 0), 0) || 1;
  const famP = all.reduce((a, v) => a + v.pots, 0) || 1;
  const bAgg = {};
  rows.forEach(v => { const o = bAgg[v.bucket.label] || (bAgg[v.bucket.label] = { ...v.bucket, pots: 0, sold: 0, n: 0 }); o.pots += v.pots; o.sold += v.sold || 0; o.n++; });
  const bList = Object.values(bAgg).sort((a, b) => b.pots - a.pots);
  const toggle = (set, setter, key) => setter(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const Bar = ({ field, tot }) => (
    <div style={{ display: "flex", height: 30, borderRadius: 8, overflow: "hidden", border: `1px solid ${C2.border}` }}>
      {bList.filter(b => b[field] > 0).map(b => (
        <div key={b.label} onClick={() => toggle(buckets, setBuckets, b.label)}
          title={`${b.label}: ${Math.round(b[field]).toLocaleString()} (${Math.round(b[field] * 100 / tot)}%) — click to isolate`}
          style={{ width: `${b[field] * 100 / tot}%`, background: b.hex, minWidth: 3, cursor: "pointer", borderRight: "1px solid rgba(0,0,0,.08)" }} />
      ))}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,28,16,.55)", zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 880, width: "100%", padding: "18px 20px 20px", fontFamily: "'DM Sans', sans-serif", boxShadow: "0 18px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <b style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 19, color: C2.dark }}>🎨 Color mix — {famLabel}</b>
          <span style={{ fontSize: 12, color: C2.muted }}>{rows.length} of {all.length} varieties · {Math.round(totP).toLocaleString()} pots shown ({Math.round(totP * 100 / famP)}% of family)</span>
          <span style={{ flex: 1 }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="search variety…"
            style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C2.border}`, fontFamily: "'DM Sans',sans-serif", fontSize: 12.5 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C2.muted }}>✕</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "10px 0 4px" }}>
          {bList.map(b => (
            <button key={b.label} onClick={() => toggle(buckets, setBuckets, b.label)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                border: `1.5px solid ${buckets.has(b.label) ? C2.dark : C2.border}`, background: buckets.has(b.label) ? C2.chip : "#fff", color: C2.dark }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.hex, border: "1px solid rgba(0,0,0,.15)" }} />{b.label}
            </button>
          ))}
          <span style={{ width: 10 }} />
          {allSeries.map(sn => (
            <button key={sn} onClick={() => toggle(seriesSel, setSeriesSel, sn)}
              style={{ padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
                border: `1.5px solid ${seriesSel.has(sn) ? C2.light : C2.border}`, background: seriesSel.has(sn) ? "#eef6e8" : "#fff", color: seriesSel.has(sn) ? "#2e7d32" : C2.muted }}>
              {sn}
            </button>
          ))}
          {(buckets.size > 0 || seriesSel.size > 0 || q) && (
            <button onClick={() => { setBuckets(new Set()); setSeriesSel(new Set()); setQ(""); }}
              style={{ padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 800, border: "none", background: "none", color: "#c0392b", cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>clear ✕</button>
          )}
        </div>
        <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C2.muted, margin: "8px 0 3px" }}>Planned 2027 · {Math.round(totP).toLocaleString()} pots</div>
        <Bar field="pots" tot={totP} />
        <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C2.muted, margin: "8px 0 3px" }}>Sold 2026 · {Math.round(totS).toLocaleString()} pots</div>
        <Bar field="sold" tot={totS} />
        <div style={{ overflowX: "auto", marginTop: 12, maxHeight: "46vh", overflowY: "auto", border: `1px solid ${C2.border}`, borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <thead><tr>{["Variety", "Series", "Color", "'27 planned", "% shown", "'26 sold", "Δ share"].map((h, i) => (
              <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "7px 10px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C2.muted, borderBottom: `2px solid ${C2.border}`, position: "sticky", top: 0, background: "#fff", whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {rows.slice().sort((a, b) => b.pots - a.pots).map(v => {
                const pp = v.pots * 100 / totP, sp = (v.sold || 0) * 100 / totS, d = pp - sp;
                return (
                  <tr key={v.variety}>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, fontWeight: 600 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: v.bucket.hex, border: "1px solid rgba(0,0,0,.15)", marginRight: 7 }} />{v.variety}
                    </td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, color: C2.muted, fontSize: 11.5 }}>{v.seriesName}</td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, color: C2.muted, fontSize: 11.5 }}>{v.bucket.label}</td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{v.pots.toLocaleString()}</td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, textAlign: "right", minWidth: 110 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 60, height: 7, background: "#eef3e8", borderRadius: 4, overflow: "hidden", display: "inline-block" }}>
                          <span style={{ display: "block", height: "100%", width: `${Math.min(100, pp)}%`, background: v.bucket.hex }} />
                        </span>
                        <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{pp >= 1 ? Math.round(pp) + "%" : "<1%"}</span>
                      </span>
                    </td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C2.muted }}>{v.sold ? Math.round(v.sold).toLocaleString() : "—"}</td>
                    <td style={{ padding: "6px 10px", borderBottom: `1px solid ${C2.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: Math.abs(d) < 1 || !v.sold ? C2.muted : d > 0 ? C2.amber : "#2e7d32" }}>
                      {!v.sold ? "new" : Math.abs(d) < 1 ? "·" : (d > 0 ? "▲+" : "▼−") + Math.round(Math.abs(d))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: C2.muted, marginTop: 8 }}>Click bar segments or chips to filter · Δ share = planned% − sold% within what's shown · ▲ heavier than it sold, ▼ lighter</div>
      </div>
    </div>
  );
}

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
  const lockedRef = useRef(true);                       // mirrors `locked` for the loader — reloads must not clobber in-flight recipe edits
  const [soldByItem, setSoldByItem] = useState({});   // plan item_name -> '26 units (via sku map)
  const [tmap, setTmap] = useState({});               // plan item_name -> plan_targets row (walkthrough decisions)
  const [ref26ByItem, setRef26ByItem] = useState({}); // plan item_name -> FROZEN '26 planned pots (reference, never edited)
  const [famSold, setFamSold] = useState(null);       // whole-family 2026 sales incl. removed varieties (name-matched)
  const [confirmRm, setConfirmRm] = useState(null);   // variety pending delete in the "not returning" strip
  const addedSeries = useRef([]);                     // placeholder series rows created this edit session — Cancel takes them back
  const [trayOpts, setTrayOpts] = useState([]);       // plug-tray containers (105/72/50/38…) for the recipe's Tray select
  const [locked, setLocked] = useState(true);
  const [snap, setSnap] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [famTgt, setFamTgt] = useState(null);          // family_targets row — the STATIC family projection
  const [viewMode, setViewMode] = useState("colors");  // "colors" = one row per color, season totals (default) · "rounds" = the planting-group cards
  const [selVars, setSelVars] = useState(() => new Set());  // season-view checkboxes for bulk broker/supplier
  const [bulkBroker, setBulkBroker] = useState("");    // bulk-assign picks
  const [quotesByKey, setQuotesByKey] = useState({});  // variety_key -> broker_prices rows (raw, for bulk pricing)
  const [divideFor, setDivideFor] = useState(null);    // {variety, n, gap} — inline divide-into-rounds UI
  const [recipeOpen, setRecipeOpen] = useState(false); // recipe card collapsed by default — planning first, spec on demand
  const [mixOpen, setMixOpen] = useState(false);       // 🎨 color-mix pop-out explorer

  lockedRef.current = locked;
  useEffect(() => {
    (async () => {
      const { data: rec } = await sb.from("crop_recipes").select("*").eq("id", recipeId).single();
      // While the recipe card is UNLOCKED (mid-edit), a reload (quote lock, qty edit —
      // anything that bumps tick) must NOT replace recipe/series state: that's what
      // reverted a typed series rename back to its DB value. Rows/prices still refresh.
      if (lockedRef.current) setRecipe(rec || null);
      else if (!rec) return;
      if (!rec) { setRows([]); return; }
      const { data: ser } = await sb.from("crop_recipe_series").select("*").eq("recipe_id", recipeId).order("series_name");
      if (lockedRef.current) setSeries(ser || []);
      const { data: ftRow } = await sb.from("family_targets").select("*").eq("plan_id", plan.id).eq("recipe_id", recipeId).maybeSingle();
      setFamTgt(ftRow || null);
      const { data: sc } = await sb.from("scheduled_crops")
        .select("id,item_name,variety_id,qty_pots,ppp,pack_size,plants_per_unit,qty_plants_ordered,plant_week,plant_year,ship_week,ship_year,ready_week,ready_year,broker,supplier,liner_unit_cost,prop_method,bench_id,is_combo_component,notes")
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
      let soldMap = {}, tgs = [];
      if (itemNames.length) {
        // walkthrough decisions (Sales vs Plan 2027 targets) — the dig-in surface must greet you with them.
        // current_units = the plan quantity captured when the decision was made = the frozen '26 baseline.
        ({ data: tgs } = await sb.from("plan_targets").select("item_name,target_units,current_units,decision,decided_by,applied_at,applied_units").eq("plan_id", plan.id).in("item_name", itemNames));
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
      // Frozen "Planned '26" reference — what each item was planned for going into the projection.
      // Source: plan_targets.current_units, now pinned to POTS (grain migration 8/4 converted the
      // flats-era captures). Anything the walkthrough never touched falls back to its current
      // planned pots (pot-factor aware — flat-native rows carry factor ppu). READ-ONLY: it never
      // moves as the 2027 plan is edited, so it stays a fixed point of comparison next to '26 sold.
      const potsByItem = {};
      (sc || []).forEach(r => { potsByItem[r.item_name] = (potsByItem[r.item_name] || 0) + (+r.qty_pots || 0) * potFactor(r); });
      const tByItem = Object.fromEntries((tgs || []).map(t => [t.item_name, t]));
      const refMap = {};
      itemNames.forEach(it => {
        const t = tByItem[it];
        refMap[it] = (t && t.current_units != null) ? Math.round(+t.current_units) : (potsByItem[it] || 0);
      });
      setRef26ByItem(refMap);
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
        const { data } = await sb.from("broker_prices").select("variety_key,broker,supplier,form_class,form_raw,landed").in("variety_key", allKeys.slice(i, i + 100));
        quotes.push(...(data || []));
      }
      // raw quotes by key — the season view's bulk broker assign + tray auto-fill read
      // these. (The old per-series broker-pin stats are gone: broker/supplier now live
      // ONLY on the color rows — one source of truth, set by bulk assign or 🔗 lock.)
      const byKey = {};
      quotes.forEach(q => (byKey[q.variety_key] = byKey[q.variety_key] || []).push(q));
      setQuotesByKey(byKey);
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
      // ONE ROUND = ONE WEEK OF PLANTING (Caleb 8/10): everything planting in the
      // same week is the SAME group, whatever its variety or finish week. Finish
      // shows as a range when series diverge — it must never split a planting week.
      const k = `${r.plant_year ?? "?"}|${r.plant_week ?? "?"}`;
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
          liner: null, broker: null, items: new Set(), benches: new Set(), suggested: false });
        o.rows.push(r);
        o.pots += potsOf(r);
        if (/varietal suggestion/i.test(r.notes || "")) o.suggested = true;
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
    // Planned '26 reference — allocate each item's frozen baseline the same FIFO-across-rounds,
    // pot-share-within-round way as '26 sold, so the two line up round-for-round.
    const remRef = { ...ref26ByItem };
    gs.forEach(g => {
      const itemPots = {};
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + potsOf(r); });
      g.itemRef = {};
      Object.entries(itemPots).forEach(([it, pots]) => {
        const take = Math.min(remRef[it] || 0, pots > 0 ? pots : (remRef[it] || 0));
        g.itemRef[it] = take; remRef[it] = (remRef[it] || 0) - take;
      });
    });
    gs.slice().reverse().forEach(g => {
      Object.keys(g.itemRef || {}).forEach(it => {
        if ((remRef[it] || 0) > 0) { g.itemRef[it] += remRef[it]; remRef[it] = 0; }
      });
    });
    gs.forEach(g => {
      const itemPots = {};
      g.rows.forEach(r => { itemPots[r.item_name] = (itemPots[r.item_name] || 0) + potsOf(r); });
      g.vars.forEach(vr => {
        vr.ref26 = 0;
        const mine = {};
        vr.rows.forEach(r => { mine[r.item_name] = (mine[r.item_name] || 0) + potsOf(r); });
        Object.entries(mine).forEach(([it, p]) => {
          const tot = itemPots[it] || 1;
          vr.ref26 += Math.round((g.itemRef[it] || 0) * (tot > 0 ? p / tot : 1));
        });
      });
    });
    return gs;
  }, [rows, vmap, soldByItem, ref26ByItem, seriesOf, bmap]);

  // "not returning" tuck: a variety with ZERO pots family-wide and no grow intent
  // (no positive target, no grow decision) leaves the roster — the 2027 view shows
  // only what you're doing. History stays in the hero + past seasons.
  const growIntent = vr => [...vr.items].some(it => { const t = tmap[it]; return t && (t.decision === "grow" || (+t.target_units || 0) > 0); });
  const tucked = useMemo(() => {
    const by = {};
    groups.forEach(g => g.vars.forEach(vr => {
      const o = by[vr.variety] || (by[vr.variety] = { variety: vr.variety, vkey: vr.vkey, rows: [], pots: 0, sold: 0, ref26: 0, items: new Set(), suggested: false });
      o.rows.push(...vr.rows); o.pots += vr.pots; o.sold += vr.sold || 0; o.ref26 += vr.ref26 || 0; vr.items.forEach(i => o.items.add(i));
      if (vr.suggested) o.suggested = true;
    }));
    // suggestions (added at 0 on purpose) stay in the roster as candidates — never tucked
    return Object.values(by).filter(v => v.pots === 0 && !growIntent(v) && !v.suggested).sort((a, b) => b.sold - a.sold);
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

  // SEASON VIEW (Caleb 8/4: "total up the amounts of each variety … whole season for a
  // specific color"): one aggregate per color across every planting group. The rounds
  // are carried along as chips — the season total is the number you plan with, and
  // "Divide" splits it back across rounds only when you choose to.
  const seasonVars = useMemo(() => {
    const by = {};
    displayGroups.forEach(g => g.vars.forEach(vr => {
      if (tuckedNames.has(vr.variety)) return;
      const o = by[vr.variety] || (by[vr.variety] = { variety: vr.variety, vkey: vr.vkey, rows: [], pots: 0, sold: 0, ref26: 0,
        liner: null, broker: null, items: new Set(), benches: new Set(), suggested: false, rounds: [] });
      o.rows.push(...vr.rows);
      o.pots += vr.pots; o.sold += vr.sold; o.ref26 += vr.ref26;
      if (vr.liner != null) o.liner = vr.liner;
      if (vr.broker) o.broker = vr.broker;
      vr.items.forEach(i => o.items.add(i));
      vr.benches.forEach(b => o.benches.add(b));
      o.suggested = o.suggested || vr.suggested;
      o.rounds.push({ n: g.n, key: g.key, ready: g.ready, readyYear: g.readyYear, pots: vr.pots });
    }));
    return Object.values(by).sort((a, b) => {
      const sa = seriesOf(a.variety)?.series_name || "~", sbn = seriesOf(b.variety)?.series_name || "~";
      return sa.localeCompare(sbn) || a.variety.localeCompare(b.variety);
    });
  }, [displayGroups, tuckedNames, seriesOf]);
  const famLabel = recipe ? (recipe.display_name || `${recipe.size_label} ${recipe.crop_name}`) : "";
  const [cropSeriesSug, setCropSeriesSug] = useState([]);   // series names derived from ALL broker quotes for this crop
  // series-name choices = every series the BROKERS quote for this crop, unioned with
  // this family's own variety-name prefixes — one list feeds the series-name select
  // AND the "colors without a series" quick-add chips
  const seriesNameSug = useMemo(() => {
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
    return [...sug].sort((a, b) => a.localeCompare(b));
  }, [vmap, cropSeriesSug]);
  // colors no series row claims (seriesOf falls through) → offer one-click creation,
  // named by the best matching suggestion. Series EMERGE from the colors — the table
  // shouldn't need free-typing for a series the plan already implies.
  const missingSeries = useMemo(() => {
    const have = new Set(series.map(s => s.series_name.toLowerCase()).filter(n => n !== "(unassigned)"));
    const by = {};
    seasonVars.forEach(v => {
      if (seriesOf(v.variety)?.series_name && seriesOf(v.variety)?.series_name !== "(unassigned)") return;
      const vn = String(v.variety).replace(/[™®]/g, " ").replace(/\s+/g, " ").trim();
      const hit = seriesNameSug.filter(n => vn.toLowerCase().startsWith(n.toLowerCase())).sort((a, b) => b.length - a.length)[0]
        || vn.split(" ")[0];
      if (!hit || have.has(hit.toLowerCase())) return;
      (by[hit] = by[hit] || []).push(v.variety);
    });
    return Object.entries(by).map(([name, vars]) => ({ name, n: vars.length })).sort((a, b) => b.n - a.n);
  }, [seasonVars, series, seriesOf, seriesNameSug]);

  // ── manual quote search + lock (Caleb 7/29) ───────────────────────────────
  // "Don't see the variety quoted from your broker but know it's there? Search
  // and match it yourself so it's permanently attached for future ordering."
  const [potOpts, setPotOpts] = useState([]);   // finished containers for the pot picker (match a family to a pot)
  const [allFams, setAllFams] = useState([]);   // every family — target list for "move to another family"
  const [resize, setResize] = useState(null);   // {size, pot, price} — transfer the whole family to a new size
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
  // pot options for the header picker — match the family to the pot it ships in. Include
  // trays/prop (a crop can finish in a 1801 landscape tray), and ALWAYS include the family's
  // currently-assigned pot even if it's some other kind, so the dropdown never shows blank
  // when a pot IS set (Caleb 7/30: "the dropdown must always match the pot we determined").
  useEffect(() => {
    (async () => {
      const sel = "id,name,sku,cost_per_unit,diameter_in,kind";
      const { data } = await sb.from("containers").select(sel).in("kind", ["finished", "tray", "propagation", "ring", "other"]).order("diameter_in");
      let opts = data || [];
      const cur = recipe?.default_container_id;
      if (cur && !opts.some(c => c.id === cur)) {
        const { data: c } = await sb.from("containers").select(sel).eq("id", cur).maybeSingle();
        if (c) opts = [...opts, c];
      }
      setPotOpts(opts);
    })();
  }, [sb, recipe?.default_container_id]);
  // every family, for the "move a variety to another family" picker
  useEffect(() => {
    (async () => {
      const { data } = await sb.from("crop_recipes").select("id,crop_name,size_label,display_name,default_container_id");
      setAllFams((data || []).map(r => ({ ...r, label: r.display_name || `${r.size_label} ${r.crop_name}` })).sort((a, b) => plantOrder(a.label, b.label)));
    })();
  }, [sb]);
  // reassign a variety's rows to a DIFFERENT family — takes its recipe + pot with it, so it
  // stops showing in the old family (Caleb 7/30). Combo appearances stay put.
  async function moveVarietyToFamily(vr, target) {
    if (!target || target.id === recipeId) return;
    setBusy(true);
    try {
      const ids = vr.rows.filter(r => !r.is_combo_component).map(r => r.id);
      for (const id of ids) {
        await sb.from("scheduled_crops").update({ recipe_id: target.id, container_id: target.default_container_id || null }).eq("id", id);
      }
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
        variety_key: vr.vkey || null, change_type: "family_move",
        detail: { variety: vr.variety, to: target.label, rows: ids.length }, changed_by: displayName || null, source: "family-page" });
    } catch (e) { window.alert("Move stopped: " + (e.message || e)); }
    setBusy(false); setCtx(null); setTick(t => t + 1);
  }

  // TRANSFER the whole family to a new size (Caleb 7/30: "the mix is nice but too big for its
  // basket — move it to the 12" Athena"). Renames every item's size prefix, moves them to the
  // new-size family (resolve or create), swaps the pot, optionally sets a new price — cascades
  // through scheduled_crops, targets, the sku map, history and the B2B catalog + pot ordering.
  const resizePreview = useMemo(() => {
    if (!resize?.size?.trim() || !recipe) return [];
    const newPrefix = famSizePrefix(resize.size.trim());
    const oldPrefix = famSizePrefix(recipe.size_label);
    const items = [...new Set((rows || []).map(r => r.item_name))];
    return items.map(it => ({ from: it, to: it.startsWith(oldPrefix) ? newPrefix + it.slice(oldPrefix.length) : `${newPrefix} ${it}` }));
  }, [resize?.size, rows, recipe]); // eslint-disable-line
  async function doResize() {
    const targetSize = String(resize?.size || "").trim();
    if (!targetSize || busy) return;
    if (!window.confirm(`Transfer all ${resizePreview.length} item${resizePreview.length !== 1 ? "s" : ""} from ${recipe.size_label} to ${targetSize}?\n\nItems are renamed, moved to the ${targetSize} family, and re-potted${resize.price ? `, priced at $${resize.price}` : ""}. This cascades through the plan and pot ordering.`)) return;
    setBusy(true);
    try {
      const crop = recipe.crop_name;
      let target = allFams.find(f => f.size_label === targetSize && String(f.crop_name || "").toLowerCase() === String(crop || "").toLowerCase());
      if (!target) {
        const { data: ins, error } = await sb.from("crop_recipes").upsert({
          crop_name: crop, size_label: targetSize, pots_per_unit: recipe.pots_per_unit || 1, ppp: recipe.ppp || 1,
          crop_weeks: recipe.crop_weeks ?? null, default_container_id: resize.pot || null, plant_class: recipe.plant_class || null,
          updated_by: displayName || "planner", seeded_from: { source: "resize", from: `${recipe.size_label} ${crop}` },
        }, { onConflict: "crop_name,size_label" }).select("*").single();
        if (error) throw error;
        target = ins;
        await sb.from("crop_recipe_series").upsert({ recipe_id: ins.id, series_name: "(unassigned)" }, { onConflict: "recipe_id,series_name" });
      } else if (resize.pot && resize.pot !== target.default_container_id) {
        await sb.from("crop_recipes").update({ default_container_id: resize.pot }).eq("id", target.id);
      }
      const container = resize.pot || target.default_container_id || null;
      const price = resize.price !== "" && resize.price != null ? +String(resize.price).replace(/[^0-9.]/g, "") : null;
      for (const { from, to } of resizePreview) {
        const patch = { item_name: to, recipe_id: target.id, container_id: container };
        if (price != null) patch.sale_price_per_pot = price;
        await sb.from("scheduled_crops").update(patch).eq("plan_id", plan.id).eq("item_name", from);
        if (to !== from) {
          await sb.from("plan_targets").update({ item_name: to }).eq("plan_id", plan.id).eq("item_name", from);
          await sb.from("sales_sku_map").update({ plan_item_name: to }).eq("plan_item_name", from);
          await sb.from("item_change_log").update({ item_name: to }).eq("plan_id", plan.id).eq("item_name", from);
        }
        try {
          await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: to, change_type: "resized",
            detail: { from, from_size: recipe.size_label, to_size: targetSize, container, price }, changed_by: displayName || null, source: "family-page" });
        } catch { /* audit must not block */ }
      }
      try { await sb.rpc("reconcile_production_items", { p_plan: plan.id }); } catch { /* cron catches it */ }
      setResize(null); setBusy(false);
      onClose && onClose();   // the old family is now empty — close; the new-size family holds everything
    } catch (e) { window.alert("Transfer stopped: " + (e.message || e)); setBusy(false); }
  }

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
  // ONE source of truth: the quote you pick on a COLOR feeds the series spec upward.
  // Fill the series' form (from the quote's form class) and prop tray (from a cell
  // count in the quote text, e.g. "Plug 144") — NULL fields only, never overwrite.
  async function fillSeriesFromQuote(varietyName, q) {
    const s0 = seriesOf(varietyName);
    if (!s0 || !s0.id || s0.series_name === "(unassigned)") return;
    // re-read the row fresh: in a bulk loop, two colors of one series would otherwise
    // both see the render-time nulls and the second would overwrite the first's fill
    const { data: s } = await sb.from("crop_recipe_series").select("id,form,prop_tray_id").eq("id", s0.id).maybeSingle();
    if (!s) return;
    const upd = {};
    const FORM_FROM_CLASS = { urc: "URC", callused: "CALL", plug: "PLUG", liner: "LINER", seed: "SEED", bareroot: "BULB" };
    if (!s.form && FORM_FROM_CLASS[q.form_class]) upd.form = FORM_FROM_CLASS[q.form_class];
    if (!s.prop_tray_id) {
      // quote text carries the cell count ("Plug 144", "Lin 72", "50 Cell Tray") — match a
      // tray we actually stock, by cells OR by the digits in its NAME (the "105" tray
      // holds 100 cells, so name digits are the vocabulary brokers actually use)
      const m = String(q.form_raw || "").match(/(\d{2,4})/);
      if (m) {
        const n = +m[1];
        const tray = trayOpts.find(t => +t.cells_per_flat === n)
          || trayOpts.find(t => new RegExp(`(^|\\D)${n}(\\D|$)`).test(String(t.name || "")));
        if (tray) upd.prop_tray_id = tray.id;
      }
    }
    if (!Object.keys(upd).length) return;
    await sb.from("crop_recipe_series").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", s.id);
    setSeries(sr => sr.map(x => x.id === s.id ? { ...x, ...upd } : x));
  }

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
      await fillSeriesFromQuote(v.variety, r);   // series form/tray follow the picked quote (null fields only)
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
    setFlashKey(`${pNew.yr}|${pNew.wk}`);
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
    setFlashKey(`${target.plantYear ?? vr.rows[0]?.plant_year ?? "?"}|${target.plant}`);
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
  // FAMILY-level finish week (Caleb 8/5: "a ready date on a family should go to all
  // the individual items"): one week for EVERY color and round in the family — the
  // plant/ship chain re-derives per series. Per-item tweaks: the item page (real
  // finish editor there) or right-click → New group for one color.
  async function setFamilyReady(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return;
    const ready = digits.length <= 2 ? +digits : +digits.slice(2);
    const readyYear = digits.length <= 2 ? (plan.year ?? 2027) : 2000 + +digits.slice(0, 2);
    if (!ready || ready > 53) { window.alert("Week must be 1–53 (or YYWW like 2712)."); return; }
    if (readyInPast(readyYear, ready)) return;   // it alerts with the fix-it hint itself
    const acc = { moved: 0, flags: [] };
    let touched = 0;
    setBusy(true);
    for (const g of displayGroups) {
      const finWks = finishWksOr(recipe, g.plantYear, g.plant, g.readyYear, g.ready);
      if (finWks == null) continue;   // a weeks-unknown stub group keeps its dates
      for (const vr of g.vars) {
        const sSpec = seriesOf(vr.variety) || {};
        const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
        const p = wrapWk(ready - finWks, readyYear);
        const sh = rooted ? wrapWk(p.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), p.yr) : p;
        for (const r of vr.rows) {
          const { error } = await sb.from("scheduled_crops").update({
            ready_week: ready, ready_year: readyYear,
            plant_week: p.wk, plant_year: p.yr, ship_week: sh.wk, ship_year: sh.yr,
          }).eq("id", r.id);
          if (error) { window.alert(`⚠ Week change stopped partway (${error.message}).`); setBusy(false); setTick(t => t + 1); return; }
        }
        const res = await rippleTasks(sb, plan.id, [...new Set(vr.rows.map(r => r.item_name))],
          { ship: sh.wk, shipYear: sh.yr, plant: p.wk, plantYear: p.yr },
          { wk: vr.rows[0]?.ship_week, yr: vr.rows[0]?.ship_year ?? vr.rows[0]?.plant_year }, displayName);
        acc.moved += res.moved; acc.flags.push(...res.flags);
        touched += vr.rows.length;
      }
    }
    if (touched) try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `family: ${famLabel}`,
        change_type: "group_ready_change", detail: { ready: `${readyYear}w${ready}`, rows: touched, note: "family-wide finish week — every color and round" },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    setRipple(acc.moved || acc.flags.length ? acc : null);
    setBusy(false); setTick(t => t + 1);
  }

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
    setFlashKey(`${p.yr}|${p.wk}`);   // follow the new round after the re-sort
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
          applied_at: new Date().toISOString(), applied_by: displayName || null, applied_units: 0,   // rows are gone — the decision IS reality
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
      // A prop tray is only ordered when a series actually has one assigned. Callused
      // cuttings stuck straight into the finished pot (direct stick — no prop_tray_id)
      // never consume a tray, whatever their form.
      if (s?.prop_tray_id && /^(URC|CALL|SEED)/i.test(s?.form || "")) {
        const cells = +trays[s.prop_tray_id]?.cells_per_flat || 105;
        traysN += need / cells;
      }
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
    const potsByItem = {};
    rows.forEach(r => { if (!r.is_combo_component) potsByItem[r.item_name] = (potsByItem[r.item_name] || 0) + potsOf(r); });
    const out = [];
    Object.entries(potsByItem).forEach(([it, pots]) => {
      const t = tmap[it];
      if (!t || (t.target_units == null && t.decision !== "drop")) return;
      // target_units is POTS now (Caleb 7/29 — one unit, pots)
      const wantU = t.target_units == null ? 0 : Math.max(0, Math.round(+t.target_units));
      const wantPots = wantU;
      // acknowledgment gate is VALUE-based: the line shows only when the walkthrough
      // NUMBER differs from the last number applied. Timestamps deliberately ignored —
      // notes, timing arrows and rounds edits bump updated_at and must not re-nag
      // (review finding), and deliberate production drift stays quiet.
      const stale = t.applied_at == null || (t.applied_units ?? null) !== wantU;
      out.push({ item: it, wantU, wantPots, pots, delta: wantPots - pots, by: t.decided_by,
        drop: t.decision === "drop" || wantU === 0, ppu: 1, stale });
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
    setBusy(true);
    try {
      // same engine as every other write path: multi-pass native distribution + combo-kid
      // scaling, and the stamp records what actually LANDED (native units can't always
      // hold the exact request), so the banner clears only when rows truly match.
      const res = await distributePotsCore(its, g.wantPots);
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: g.item,
          change_type: "target_applied", detail: { target_units: g.wantU, pots_from: res.from, pots_to: res.achieved },
          changed_by: displayName || null, source: "family-page" });
      } catch { /* audit must not block */ }
      await sb.from("plan_targets").update({ applied_at: new Date().toISOString(), applied_units: res.achieved, target_units: res.achieved })
        .eq("plan_id", plan.id).eq("item_name", g.item);
    } catch (e) {
      window.alert(`${g.item}: the apply didn't stick (${e.message || e}) — the target stays in the banner. Try again.`);
    }
    setBusy(false); setTick(t => t + 1);
  }

  // plan-qty edit: the input speaks POTS; rows store their native unit (pots OR flats) —
  // distribute by pot share, write back native, keep whole flats whole (largest remainder
  // measured in pots, granted one native unit at a time)
  // core distribution: spread POTS across a set of rows proportionally (multi-pass
  // largest remainder in each row's native encoding, so mixed pot/flat rows land as
  // close to the request as native units allow). Scales combo kids' plants by the
  // same factor — a basket edit here must move its components exactly like the
  // walkthrough path does. No busy/tick — callers batch it.
  async function distributePotsCore(rowsArr, tot) {
    const factors = rowsArr.map(potFactor);
    const curPots = rowsArr.reduce((a, r, i) => a + (+r.qty_pots || 0) * factors[i], 0);
    if (tot === curPots) return { from: curPots, achieved: tot };
    const exactNative = rowsArr.map((r, i) =>
      curPots > 0 ? (tot * ((+r.qty_pots || 0) * factors[i]) / curPots) / factors[i] : (tot / rowsArr.length) / factors[i]);
    const flo = exactNative.map(Math.floor);
    let remPots = tot - flo.reduce((a, n, i) => a + n * factors[i], 0);
    const order = exactNative.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr);
    let granted = true;
    while (remPots > 0 && granted) {
      granted = false;
      for (const o of order) { if (remPots >= factors[o.i]) { flo[o.i]++; remPots -= factors[o.i]; granted = true; } }
    }
    for (let i = 0; i < rowsArr.length; i++) {
      if (flo[i] !== +rowsArr[i].qty_pots) {
        const { error } = await sb.from("scheduled_crops").update({ qty_pots: flo[i] }).eq("id", rowsArr[i].id);
        if (error) throw new Error(error.message);
        rowsArr[i].qty_pots = flo[i];
      }
    }
    const achieved = tot - remPots;
    const factor = curPots > 0 ? achieved / curPots : 0;
    const { data: kids } = await sb.from("scheduled_crops").select("id,qty_plants_ordered").in("combo_parent_id", rowsArr.map(r => r.id));
    for (const k of (kids || [])) {
      if (k.qty_plants_ordered != null) await sb.from("scheduled_crops").update({ qty_plants_ordered: Math.round((+k.qty_plants_ordered || 0) * factor) }).eq("id", k.id);
    }
    return { from: curPots, achieved };
  }

  // ONE NUMBER: after rows change, the walkthrough decision record follows suit —
  // target = planned, stamped applied, decision classified against the frozen '26
  // baseline. Keeps the scorecard/YoY honest without a second number to maintain.
  async function stampItems(itemNames) {
    const stamp = new Date().toISOString();
    for (const it of [...new Set(itemNames)].filter(Boolean)) {
      const { data: cur } = await sb.from("scheduled_crops").select("qty_pots,ppp,pack_size,plants_per_unit")
        .eq("plan_id", plan.id).eq("item_name", it).not("is_combo_component", "is", true);
      const pots = (cur || []).reduce((a, r) => a + (+r.qty_pots || 0) * potFactor(r), 0);
      const frozen = tmap[it]?.current_units;
      const base = frozen ?? ref26ByItem[it] ?? pots;
      const rec = { plan_id: plan.id, item_name: it, target_units: pots,
        decision: pots === 0 ? "drop" : pots > base ? "grow" : pots < base ? "cut" : "hold",
        applied_at: stamp, applied_by: displayName || "planner", applied_units: pots,
        decided_by: displayName || "planner", decided_at: stamp, updated_at: stamp };
      if (frozen == null) rec.current_units = ref26ByItem[it] ?? pots;
      await sb.from("plan_targets").upsert(rec, { onConflict: "plan_id,item_name" });
    }
  }

  async function setVarQty(vr, newTotal) {
    const tot = Math.max(0, Math.round(newTotal));   // POTS
    const curPots = vr.rows.reduce((a, r) => a + (+r.qty_pots || 0) * potFactor(r), 0);
    if (tot === curPots) return;
    setBusy(true);
    try {
      const res = await distributePotsCore(vr.rows, tot);
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
          variety_key: vr.vkey || null, change_type: "family_qty", detail: { variety: vr.variety, from: curPots, to: res.achieved },
          changed_by: displayName || null, source: "family-page" });
      } catch { /* audit must not block */ }
      await stampItems([...vr.items]);
    } catch (e) { window.alert("Quantity didn't fully save: " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1);
  }

  // per-group bench cap (last season's bench load) — the +/- scoreboard on each
  // group header. Stored in family_targets.group_caps keyed by the group key
  // ("year|plantWeek"), so it travels with the family and survives regrouping.
  async function saveGroupCap(g, raw) {
    const s0 = String(raw ?? "").trim();
    const n = s0 === "" ? null : Math.max(0, Math.round(+s0.replace(/[^0-9.]/g, "")));
    if (s0 !== "" && (!n && n !== 0)) return;
    const caps = { ...((famTgt && famTgt.group_caps) || {}) };
    if (n == null) delete caps[g.key]; else caps[g.key] = n;
    const { error } = await sb.from("family_targets").upsert(
      { plan_id: plan.id, recipe_id: recipeId, group_caps: caps, updated_at: new Date().toISOString() },
      { onConflict: "plan_id,recipe_id" });
    if (error) { window.alert("Cap didn't save: " + error.message); return; }
    setFamTgt(f => ({ ...(f || { plan_id: plan.id, recipe_id: recipeId }), group_caps: caps }));
  }

  // the STATIC family projection — the number agreed at the family grain
  async function saveFamProjection(raw) {
    const total = Math.max(0, Math.round(+String(raw).replace(/[^0-9.]/g, "")));
    if (isNaN(total)) return;
    const stamp = new Date().toISOString();
    const rec = { plan_id: plan.id, recipe_id: recipeId, planned_pots: total,
      decided_by: displayName || "planner", decided_at: stamp, updated_at: stamp };
    const { error } = await sb.from("family_targets").upsert(rec, { onConflict: "plan_id,recipe_id" });
    if (error) { window.alert("Projection didn't save: " + error.message); return; }
    setFamTgt(f => ({ ...(f || {}), ...rec }));
  }

  // allocate the family projection across colors — evenly, or by 2026 sales share.
  // Suggestions at 0 stay at 0 (they're references, not plan).
  async function disperse(mode) {
    const total = Math.max(0, Math.round(+famTgt?.planned_pots || 0));
    const live = seasonVars.filter(v => !(v.suggested && v.pots === 0));
    if (!live.length || !famTgt) return;
    const weights = live.map(v => mode === "sold" ? v.sold : 1);
    const W = weights.reduce((a, b) => a + b, 0);
    const exact = live.map((v, i) => W > 0 ? total * weights[i] / W : total / live.length);
    const units = exact.map(Math.floor);
    let rem = total - units.reduce((a, b) => a + b, 0);
    exact.map((e, i) => ({ i, fr: e - units[i] })).sort((a, b) => b.fr - a.fr).forEach(o => { if (rem > 0) { units[o.i]++; rem--; } });
    if (!window.confirm(`Disperse ${total.toLocaleString()} pots across ${live.length} colors ${mode === "sold" ? "by 2026 sales share" : "evenly"}?\n\nThis overwrites each color's season quantity — fine-tune any of them afterwards. The family projection itself stays put.`)) return;
    setBusy(true);
    try {
      const touched = new Set();
      for (let i = 0; i < live.length; i++) {
        await distributePotsCore(live[i].rows, units[i]);
        live[i].items.forEach(it => touched.add(it));
      }
      await stampItems([...touched]);
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `family: ${famLabel}`,
          change_type: "family_dispersed", detail: { total, mode, colors: live.length },
          changed_by: displayName || null, source: "family-page" });
      } catch { /* audit must not block */ }
    } catch (e) { window.alert("Disperse stopped partway (colors already written stay written): " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1);
  }

  // ⑃ Divide a color's season total into rounds AT THE WEEKS YOU NAME (Caleb 8/5:
  // "i want this group to finish week 18 and this group to finish week 19").
  // Existing rounds are reused earliest-first and RETIMED onto the requested weeks
  // (chain re-derived per series); missing rounds are cloned; rounds beyond the list
  // go to zero. Quantities split equally across the rounds.
  async function divideColor(vr, wksList) {
    const wks = (wksList || []).filter(w => w && +w.wk >= 1 && +w.wk <= 53)
      .map(w => ({ wk: +w.wk, yr: +w.yr || (plan.year ?? 2027) }))
      .sort((a, b) => (a.yr * 100 + a.wk) - (b.yr * 100 + b.wk));
    const n = wks.length;
    const tot = vr.pots;
    if (!n || !vr.rows.length) return;
    for (const w of wks) if (readyInPast(w.yr, w.wk)) return;   // it alerts with the fix-it hint
    setBusy(true);
    try {
      // bucket the color's rows into its existing rounds (same key the group view uses)
      const keyOf = r => `${r.plant_year ?? "?"}|${r.plant_week ?? "?"}`;   // one plant week = one round
      const byKey = {};
      vr.rows.forEach(r => { (byKey[keyOf(r)] = byKey[keyOf(r)] || []).push(r); });
      const ordered = vr.rounds.slice().sort((a, b) => ((a.readyYear ?? 0) * 100 + (a.ready ?? 0)) - ((b.readyYear ?? 0) * 100 + (b.ready ?? 0)))
        .map(rd => ({ ...rd, rows: byKey[rd.key] || [] })).filter(rd => rd.rows.length);
      const sSpec = seriesOf(vr.variety) || {};
      const rooted = /^(URC|CALL)/i.test(sSpec.form || "");
      const f0 = ordered[0];
      const finWks = finishWksOr(recipe, f0?.rows[0]?.plant_week != null ? (f0.rows[0].plant_year ?? null) : null,
        f0?.rows[0]?.plant_week ?? null, f0?.readyYear ?? null, f0?.ready ?? null);
      if (finWks == null) { setBusy(false); return; }   // finishWksOr alerts with what to set
      const chainFor = w => {
        const pl = wrapWk(w.wk - finWks, w.yr);
        const sh = rooted ? wrapWk(pl.wk - Math.round(+(sSpec.rooting_weeks ?? 0)), pl.yr) : pl;
        return { pl, sh };
      };
      const sets = [];
      // reuse existing rounds, RETIMED onto the requested weeks
      for (let k = 0; k < Math.min(n, ordered.length); k++) {
        const w = wks[k], { pl, sh } = chainFor(w);
        for (const r of ordered[k].rows) {
          const { error } = await sb.from("scheduled_crops").update({
            ready_week: w.wk, ready_year: w.yr, plant_week: pl.wk, plant_year: pl.yr, ship_week: sh.wk, ship_year: sh.yr,
          }).eq("id", r.id);
          if (error) throw new Error(error.message);
        }
        sets.push(ordered[k].rows);
      }
      // mint the missing rounds from the color's first row
      if (sets.length < n) {
        const { data: full } = await sb.from("scheduled_crops").select("*").eq("id", vr.rows[0].id).maybeSingle();
        if (!full) throw new Error("the color's source row vanished — reload and try again");
        for (let k = sets.length; k < n; k++) {
          const w = wks[k], { pl, sh } = chainFor(w);
          const row = { ...full, id: crypto.randomUUID(), qty_pots: 0,
            ready_week: w.wk, ready_year: w.yr, plant_week: pl.wk, plant_year: pl.yr,
            ship_week: sh.wk, ship_year: sh.yr, bench_id: null, qty_plants_ordered: null,
            notes: `round ${k + 1} — divided on the family page` };
          delete row.created_at; delete row.updated_at;
          const { error } = await sb.from("scheduled_crops").insert(row);
          if (error) throw new Error(error.message);
          sets.push([row]);
        }
      }
      // equal split of the season total across the rounds (largest remainder)
      const per = sets.map(() => Math.floor(tot / n));
      for (let i = 0; i < tot - per.reduce((a, b) => a + b, 0); i++) per[i % n]++;
      for (let i = 0; i < sets.length; i++) await distributePotsCore(sets[i], per[i]);
      for (const rd of ordered.slice(n)) await distributePotsCore(rd.rows, 0);   // rounds beyond the list empty out
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
          variety_key: vr.vkey || null, change_type: "divided_rounds",
          detail: { variety: vr.variety, total: tot, rounds: n, weeks: wks.map(w => `${w.yr}w${w.wk}`) },
          changed_by: displayName || null, source: "family-page" });
      } catch { /* audit must not block */ }
      await stampItems([...vr.items]);
    } catch (e) { window.alert("Divide stopped partway: " + (e.message || e)); }
    setBusy(false); setDivideFor(null); setTick(t => t + 1);
  }

  // bulk broker/supplier: price every selected color from ONE broker's best quote
  async function applyBulkBroker() {
    const sel = seasonVars.filter(v => selVars.has(v.variety));
    if (!sel.length || !bulkBroker) return;
    const FORM_TO_CLASS = f => /^URC/i.test(f || "") ? "urc" : /^(CALL|DIRECT)/i.test(f || "") ? "callused" : /^PLUG/i.test(f || "") ? "plug" : /^SEED/i.test(f || "") ? "seed" : null;
    if (!window.confirm(`Price ${sel.length} color${sel.length !== 1 ? "s" : ""} from ${bulkBroker}?\n\nEach color gets the broker, supplier and $/liner of its cheapest matching ${bulkBroker} quote (and locks to it for repricing). Colors with no matching quote are left unchanged.`)) return;
    setBusy(true);
    const misses = []; let hits = 0;
    for (const v of sel) {
      const vRec = Object.values(vmap).find(x => x.variety === v.variety);
      const keys = [...new Set([vRec?.variety_key, v.vkey, ...(vRec?.match_aliases || [])].filter(Boolean))];
      const fc = FORM_TO_CLASS(seriesOf(v.variety)?.form);
      const qs = keys.flatMap(k => quotesByKey[k] || []).filter(q => q.broker === bulkBroker && (!fc || q.form_class === fc));
      if (!qs.length) { misses.push(v.variety); continue; }
      const best = qs.reduce((a, b) => +b.landed < +a.landed ? b : a);
      await sb.from("scheduled_crops").update({ broker: best.broker, supplier: best.supplier, liner_unit_cost: +best.landed, sourcing_locked: true })
        .in("id", v.rows.map(r => r.id));
      await fillSeriesFromQuote(v.variety, best);   // series form/tray follow the quote (null fields only)
      hits++;
    }
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `family: ${famLabel}`,
        change_type: "bulk_broker", detail: { broker: bulkBroker, colors: hits, missed: misses.length },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    // misses STAY SELECTED so the find-&-match pass is right there — the 🔗 on each
    // row searches the raw quote text and locks a match permanently (match_aliases),
    // so the next bulk assign (and every future upload) hits automatically.
    setBusy(false); setSelVars(new Set(misses)); setTick(t => t + 1);
    window.alert(`${hits} color${hits !== 1 ? "s" : ""} priced from ${bulkBroker}.${misses.length ? `\n\n${misses.length} with no matching ${bulkBroker} quote (kept selected):\n• ${misses.join("\n• ")}\n\nIf the broker HAS these but under a different name, use the 🔗 button on each row to search & match once — it's remembered for every future upload. If the quote file isn't loaded yet, no match can exist.` : ""}`);
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
          {famTgt?.note && (
            <span title="family note — right-click the family in the By-family list to edit"
              style={{ fontSize: 11.5, color: C.text, background: C.amberBg, border: `1px solid #ecd9b8`, borderRadius: 8, padding: "2px 9px", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              📝 {famTgt.note}
            </span>
          )}
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
          <button onClick={() => setResize({ size: "", pot: "", price: "" })}
            title="move this whole family to a different size — renames items, re-pots, re-prices, cascades everywhere"
            style={{ padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${C.creamBr}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>⇧ Transfer to a new size</button>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.muted }}>✕</button>
        </div>

        {/* hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, margin: "10px 0 12px" }}>
          {/* the STATIC family projection — the number agreed at the family grain.
              Editing colors below never moves it; the delta chip shows what's left to allocate. */}
          <div style={{ background: famTgt ? "#eef6e8" : C.cream, border: `1.5px solid ${famTgt ? C.light : C.creamBr}`, borderRadius: 10, padding: "9px 12px" }}
            title="the family projection (pots) — a fixed reference; disperse or type per color below without moving it">
            <input key={famTgt?.planned_pots ?? "none"} defaultValue={famTgt?.planned_pots ?? ""} placeholder="—" inputMode="numeric"
              onBlur={e => { const s = e.target.value.trim(); if (s === "" || +s.replace(/[^0-9.]/g, "") === +famTgt?.planned_pots) return; saveFamProjection(s); }}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{ ...wkStyle, fontSize: 17, color: C.dark, width: "100%", border: "none", background: "transparent", padding: 0, outline: "none" }} />
            <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>
              family projection{famTgt && totals.pots !== +famTgt.planned_pots
                ? <span style={{ color: C.amber }}> · {totals.pots > +famTgt.planned_pots ? `${(totals.pots - famTgt.planned_pots).toLocaleString()} over` : `${(famTgt.planned_pots - totals.pots).toLocaleString()} to allocate`}</span>
                : famTgt ? <span style={{ color: "#2e7d32" }}> · ✓ allocated</span> : null}
            </div>
          </div>
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
          <div onClick={() => setRecipeOpen(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap", cursor: "pointer",
            background: locked ? C.chip : C.amberBg, borderBottom: (recipeOpen || !locked) ? `1px solid ${C.border}` : "none", borderRadius: (recipeOpen || !locked) ? "12px 12px 0 0" : 12 }}>
            <span style={{ color: C.muted, fontSize: 11, transform: (recipeOpen || !locked) ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
            <b style={{ fontSize: 12.5, color: locked ? C.text : C.amber }}>
              {locked ? "🔒 Family recipe — source of truth; edits cascade everywhere" : "✏️ EDITING THE RECIPE — nothing commits until you save"}
            </b>
            {locked && !recipeOpen && recipe && (
              <span style={{ fontSize: 11, color: C.muted }}>
                {recipe.crop_weeks != null ? `${Math.round(+recipe.crop_weeks)} finish wks` : "finish wks —"} · {series.filter(x => x.series_name !== "(unassigned)").length} series
              </span>
            )}
            {savedMsg && <span style={{ fontSize: 11.5, color: /^(⚠|couldn't)/i.test(savedMsg) ? C.red : C.green }}>{savedMsg}</span>}
            {recipe && (
              <button onClick={async (e) => {
                  e.stopPropagation();
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
              ? <button onClick={(e) => { e.stopPropagation(); setRecipeOpen(true); unlock(); }} style={{ background: C.dark, color: C.cream, border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Unlock to edit</button>
              : <>
                <button disabled={busy} onClick={(e) => { e.stopPropagation(); save(); }} style={{ background: C.light, color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>💾 Save recipe</button>
                <button onClick={(e) => { e.stopPropagation(); cancel(); }} style={{ background: "none", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              </>}
          </div>
          {(recipeOpen || !locked) && (
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
                <thead><tr>{["Series", "Form", "Prop (wks)", "Tray", "Total wks", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {series.filter(s => s.series_name !== "(unassigned)").map(s => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {/* pick from the broker catalog's series for this crop + this family's own
                            prefixes — the current name always stays selectable; ✎ for a one-off */}
                        <select value={s.series_name}
                          onChange={e => {
                            let nm = e.target.value;
                            if (nm === "✎custom") {
                              const typed = window.prompt("Series name:", s.series_name);
                              if (!typed || !typed.trim()) return;
                              nm = typed.trim();
                            }
                            // one row per series name — a duplicate would bounce off the DB's
                            // unique constraint at Save time and silently not stick
                            if (series.some(x => x.id !== s.id && x.series_name.trim().toLowerCase() === nm.toLowerCase())) {
                              window.alert(`"${nm}" is already a series in this family.`); return;
                            }
                            setSeries(series.map(x => x.id === s.id ? { ...x, series_name: nm } : x));
                          }}
                          style={{ width: 150, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                          {[...new Set([s.series_name, ...seriesNameSug])].map(nm => <option key={nm} value={nm}>{nm}</option>)}
                          <option value="✎custom">✎ custom…</option>
                        </select>
                      </td>
                      <td style={td}>
                        <select value={s.form || ""} onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, form: e.target.value || null } : x))}
                          style={{ padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: "ui-monospace,Menlo,monospace" }}>
                          {["", "URC", "CALL", "PLUG", "SEED", "BULB", "LINER"].map(f => <option key={f} value={f}>{f || "—"}</option>)}
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
                          <option value="">— direct stick (no tray)</option>
                          {trayOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td style={{ ...td, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 800, color: C.dark }}
                        title="the static total — prop weeks (arrive→transplant) + finish weeks (transplant→ready). Edit the parts; this adds itself up.">
                        {recipe?.crop_weeks != null
                          ? `${Math.round(+recipe.crop_weeks) + (/^(URC|CALL)/i.test(s.form || "") && s.rooting_weeks != null ? Math.round(+s.rooting_weeks) : 0)}w`
                          : "—"}
                      </td>
                      <td style={td}>
                        <button disabled={busy} title="delete this series row — its colors fall back to (unassigned); the colors themselves are untouched"
                          onClick={async () => {
                            if (!window.confirm(`Delete the series "${s.series_name}"?\n\nIts colors stay in the plan — they just lose the series spec until another row claims them.`)) return;
                            await sb.from("crop_recipe_series").delete().eq("id", s.id);
                            setSeries(sr => sr.filter(x => x.id !== s.id));
                          }}
                          style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, fontWeight: 800, padding: "0 4px" }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {!series.filter(s => s.series_name !== "(unassigned)").length && <tr><td style={{ ...td, color: C.muted }} colSpan={6}>No series yet — add colors below and use the "colors without a series" chips, or ＋ Add series.</td></tr>}
                </tbody>
              </table>
              {/* series EMERGE from the colors: any color no row claims gets a one-click chip */}
              {missingSeries.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "7px 2px 2px", fontSize: 11.5 }}>
                  <span style={{ color: C.muted, fontWeight: 700 }}>Colors without a series:</span>
                  {missingSeries.map(m => (
                    <button key={m.name} disabled={busy}
                      title={`create the "${m.name}" series row — ${m.n} color${m.n !== 1 ? "s" : ""} will group under it; set its form/tray after (or lock a quote and they auto-fill)`}
                      onClick={async () => {
                        const { data: ins, error } = await sb.from("crop_recipe_series")
                          .upsert({ recipe_id: recipeId, series_name: m.name }, { onConflict: "recipe_id,series_name" }).select().single();
                        if (error) { window.alert("Couldn't create the series: " + error.message); return; }
                        setSeries(sr => sr.some(x => x.id === ins.id) ? sr : [...sr, ins]);
                      }}
                      style={{ padding: "3px 10px", borderRadius: 14, border: `1.5px solid ${C.amber}`, background: C.amberBg, color: C.amber, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                      ＋ {m.name} <span style={{ fontWeight: 500 }}>·{m.n}</span>
                    </button>
                  ))}
                </div>
              )}
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
          )}
        </div>

        {mixOpen && <ColorMixModal seasonVars={seasonVars} seriesOf={seriesOf} famLabel={famLabel} onClose={() => setMixOpen(false)} />}
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

        {/* view toggle: colors (season totals — the planning surface) vs rounds (the timing surface) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 10px", flexWrap: "wrap" }}>
          {[["colors", "🎨 By color — season totals"], ["rounds", "📅 By round"]].map(([m, label]) => (
            <button key={m} onClick={() => setViewMode(m)}
              style={{ padding: "6px 13px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${viewMode === m ? C.light : C.border}`,
                background: viewMode === m ? "#eef6e8" : "#fff", color: viewMode === m ? C.dark : C.muted }}>
              {label}
            </button>
          ))}
          {seasonVars.length > 0 && (
            <button onClick={() => setMixOpen(true)} title="interactive color-mix explorer — filter by color, series, or variety"
              style={{ padding: "6px 13px", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted }}>
              🎨 Color mix ⤢
            </button>
          )}
          {/* family finish week — cascades to EVERY color and round; per-item changes
              live on the item page, per-color via right-click → New group */}
          {(() => {
            const wks = [...new Set(displayGroups.filter(g => g.ready != null).map(g => `${g.readyYear ?? plan.year ?? 2027}|${g.ready}`))];
            const one = wks.length === 1 ? wks[0].split("|") : null;
            return (
              <span title="finish DATE for the WHOLE family — type a week (18 or 2718) or 📅 pick a calendar date; sets every color and round, the plant/ship chain re-derives per series. Change one item on its item page, one color via right-click → New group, or per-group in the By-round view."
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: C.muted, marginLeft: 4 }}>
                🗓 Finish
                <FinishWkInput wk={one ? +one[1] : null} yr={one ? +one[0] : (plan.year ?? 2027)} disabled={busy}
                  amber={wks.length > 1} placeholder={wks.length > 1 ? `${wks.length} wks` : "YYWW"}
                  onCommit={(w, y) => setFamilyReady(`${String(y % 100).padStart(2, "0")}${String(w).padStart(2, "0")}`)} />
              </span>
            );
          })()}
          {famTgt && totals.pots !== +famTgt.planned_pots && (
            <>
              <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 6 }}>disperse the projection:</span>
              <button disabled={busy} onClick={() => disperse("sold")}
                title="allocate the family projection across colors weighted by 2026 sales"
                style={{ padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>⇢ by '26 sales</button>
              <button disabled={busy} onClick={() => disperse("even")}
                title="allocate the family projection evenly across colors"
                style={{ padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>⇢ evenly</button>
            </>
          )}
          <span style={{ flex: 1 }} />
          {viewMode === "colors" && (
            <button disabled={busy} onClick={() => setAddDoor({ readyWk: displayGroups[0]?.ready })}
              style={{ padding: "5px 11px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
              ＋ Add a color
            </button>
          )}
        </div>

        {/* SEASON VIEW — one row per color, whole-season totals. This is the planning
            surface: type the number, divide into rounds when you want them, bulk-price. */}
        {viewMode === "colors" && (
          <div style={card}>
            {selVars.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#eef6e8", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                <b style={{ fontSize: 12 }}>{selVars.size} color{selVars.size !== 1 ? "s" : ""} selected</b>
                <select value={bulkBroker} onChange={e => setBulkBroker(e.target.value)}
                  style={{ padding: "5px 8px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: FONT, fontWeight: 700 }}>
                  <option value="">— broker —</option>
                  {[...new Set(Object.values(quotesByKey).flat().map(q => q.broker).filter(Boolean))].sort().map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <button disabled={busy || !bulkBroker} onClick={applyBulkBroker}
                  title="assign this broker + its best matching quote's supplier and $/liner to every selected color"
                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: C.dark, color: "#c8e6b8", fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                  Assign broker & price
                </button>
                <button onClick={() => setSelVars(new Set())} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>clear</button>
              </div>
            )}
            <div style={{ padding: "4px 10px 10px", overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...th, width: 26 }}>
                    <input type="checkbox" checked={seasonVars.length > 0 && seasonVars.every(v => selVars.has(v.variety))}
                      onChange={e => setSelVars(e.target.checked ? new Set(seasonVars.map(v => v.variety)) : new Set())} />
                  </th>
                  {["Variety", "Series", "Form", "Planned '26", "'26 sold", "vs '26 sold", "'27 Planned (pots)", "Rounds", "$/liner", "Broker"].map(h => <th key={h} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {seasonVars.map(vr => {
                    const s = seriesOf(vr.variety);
                    const soldShort = vr.ref26 > 0 && vr.sold != null && vr.sold < vr.ref26;   // didn't sell what we planned in '26
                    const delta = vr.sold > 0 && vr.pots > 0 ? Math.round((vr.pots - vr.sold) * 100 / vr.sold) : null;  // '27 plan vs '26 actual demand
                    const dividing = divideFor?.variety === vr.variety;
                    return (
                      <tr key={vr.variety}>
                        <td style={td}>
                          <input type="checkbox" checked={selVars.has(vr.variety)}
                            onChange={e => setSelVars(sv => { const n = new Set(sv); if (e.target.checked) n.add(vr.variety); else n.delete(vr.variety); return n; })} />
                        </td>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <span onClick={onOpenItem ? (e => { e.stopPropagation(); onOpenItem([...vr.items][0]); }) : undefined}
                            title={onOpenItem ? "open the item page" : undefined}
                            style={onOpenItem ? { cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 } : undefined}>{vr.variety}</span>
                          {vr.suggested && vr.pots === 0 && <span title="added as a suggestion — not in the plan number" style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "1px 6px" }}>💡 suggestion</span>}
                          {!!vr.benches.size && <div style={{ fontSize: 9.5, fontWeight: 500, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>{[...vr.benches].sort().join(" ")}</div>}
                        </td>
                        <td style={{ ...td, color: C.muted, fontSize: 11 }}>{s?.series_name || "—"}</td>
                        <td style={td}><span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: /CALL/.test(s?.form || "") ? C.amberBg : C.chip, color: /CALL/.test(s?.form || "") ? C.amber : C.green }}>{s?.form || "—"}</span></td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }} title="what this color was planned for in 2026 — frozen reference">{vr.ref26 ? vr.ref26.toLocaleString() : "—"}</td>
                        <td title={soldShort ? `sold ${(vr.ref26 - vr.sold).toLocaleString()} short of the '26 plan` : undefined}
                          style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: soldShort ? "#d94f3d" : undefined, fontWeight: soldShort ? 800 : undefined }}>{vr.sold ? vr.sold.toLocaleString() : "—"}</td>
                        <td style={{ ...td, textAlign: "right", minWidth: 64 }}
                          title="how far the '27 planned number sits from what actually sold in '26">
                          {delta == null ? <span style={{ color: C.muted, fontSize: 10 }}>—</span> : (
                            <b style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: delta > 10 ? C.amber : delta < 0 ? "#2e7d32" : C.muted }}>
                              {delta > 0 ? `+${delta}%` : `${delta}%`}
                            </b>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: "right" }} title="the whole-season total for this color — distributes across its rounds proportionally">
                          <QtyInput value={vr.pots} disabled={busy} onCommit={v => setVarQty(vr, v)} />
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {vr.rounds.filter(r => r.pots > 0).map(r => (
                            <span key={r.key} title={`Group ${r.n}`} style={{ display: "inline-block", marginRight: 4, fontSize: 10, fontWeight: 700, fontFamily: "ui-monospace,Menlo,monospace", background: C.chip, borderRadius: 5, padding: "1.5px 6px", color: C.text }}>
                              {r.ready != null ? `${String((r.readyYear ?? 0) % 100).padStart(2, "0")}${String(r.ready).padStart(2, "0")}` : "?"}·{r.pots.toLocaleString()}
                            </span>
                          ))}
                          {dividing ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                              {/* one finish per round — "this group wk 18, this group wk 19"; type a week or 📅 pick a date */}
                              <input type="number" min="1" max="8" value={divideFor.wks.length}
                                onChange={e => {
                                  const want = Math.max(1, Math.min(8, Math.round(+e.target.value || 1)));
                                  setDivideFor(d => {
                                    let wksL = d.wks.slice(0, want);
                                    while (wksL.length < want) {
                                      const last = wksL[wksL.length - 1];
                                      const nx = wrapWk((last?.wk ?? 14) + 2, last?.yr ?? (plan.year ?? 2027));
                                      wksL = [...wksL, { wk: nx.wk, yr: nx.yr }];
                                    }
                                    return { ...d, wks: wksL };
                                  });
                                }}
                                title="how many rounds" style={{ width: 34, padding: "2px 4px", borderRadius: 5, border: `1.5px solid ${C.light}`, fontSize: 11, fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 }} />
                              <span style={{ fontSize: 10, color: C.muted }}>rounds finishing</span>
                              {divideFor.wks.map((w, i) => (
                                <FinishWkInput key={i} wk={w.wk} yr={w.yr} width={46} showDate={false} disabled={busy}
                                  title={`round ${i + 1} finish — week or 📅 date`}
                                  onCommit={(nw, ny) => setDivideFor(d => ({ ...d, wks: d.wks.map((x, j) => j === i ? { wk: nw, yr: ny } : x) }))} />
                              ))}
                              <button disabled={busy} onClick={() => divideColor(vr, divideFor.wks)}
                                style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: C.dark, color: "#c8e6b8", fontWeight: 800, fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>Go</button>
                              <button onClick={() => setDivideFor(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>✕</button>
                            </span>
                          ) : (
                            <button disabled={busy || vr.pots === 0} onClick={() => {
                                const have = vr.rounds.filter(r => r.pots > 0 && r.ready != null)
                                  .sort((a, b) => ((a.readyYear ?? 0) * 100 + a.ready) - ((b.readyYear ?? 0) * 100 + b.ready))
                                  .map(r => ({ wk: r.ready, yr: r.readyYear ?? (plan.year ?? 2027) }));
                                let wksL = have.length ? have
                                  : (vr.rows[0]?.ready_week != null ? [{ wk: vr.rows[0].ready_week, yr: vr.rows[0].ready_year ?? (plan.year ?? 2027) }] : [{ wk: 14, yr: plan.year ?? 2027 }]);
                                while (wksL.length < 2) {
                                  const last = wksL[wksL.length - 1];
                                  const nx = wrapWk(last.wk + 2, last.yr);
                                  wksL = [...wksL, { wk: nx.wk, yr: nx.yr }];
                                }
                                setDivideFor({ variety: vr.variety, wks: wksL });
                              }}
                              title="split this color's season total into rounds at the finish weeks/dates you name — existing rounds are reused and retimed, new ones cloned"
                              style={{ padding: "2px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 800, fontSize: 10.5, cursor: vr.pots === 0 ? "default" : "pointer", fontFamily: FONT }}>⑃ Divide</button>
                          )}
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
                              title="search the broker catalog and lock a quote to this color"
                              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, padding: 0, opacity: 0.6 }}>🔗</button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!seasonVars.length && <tr><td style={{ ...td, color: C.muted }} colSpan={11}>No colors in this family yet — ＋ Add a color.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* planting groups */}
        {viewMode === "rounds" && displayGroups.map(g => {
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
                  <FinishWkInput key={`${g.key}|${g.ready}`} wk={g.ready} yr={g.readyYear ?? g.plantYear} disabled={busy}
                    title="this group's finish — type a week or 📅 pick a date; the whole group's chain re-derives from the recipe"
                    onCommit={(w, y) => applyGroupReady(g, `${String(y % 100).padStart(2, "0")}${String(w).padStart(2, "0")}`)} />
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
                {(() => {
                  // bench-cap scoreboard: live +/- vs last season's bench load; updates
                  // with every quantity commit. Click the cap to set/change/clear it.
                  const cap = famTgt?.group_caps?.[g.key];
                  const editCap = e => {
                    e.stopPropagation();
                    const v = window.prompt(`Bench cap for this group (wk ${g.plant})${cap != null ? ` — blank to clear` : ""}:`, cap ?? "");
                    if (v !== null) saveGroupCap(g, v);
                  };
                  if (cap == null) return (
                    <button className="no-print" onClick={editCap} title="set this group's bench cap (last season's bench load) to get a live over/under readout"
                      style={{ background: "none", border: `1px dashed ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 9.5, fontWeight: 700, padding: "1px 7px", cursor: "pointer", fontFamily: FONT }}>＋ cap</button>
                  );
                  const d = gPots - cap;
                  return (
                    <span onClick={editCap} title="vs last season's bench cap — click to change"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 10.5, fontWeight: 800,
                        background: d > 0 ? "#fbe9e5" : d < 0 ? "#eef6e8" : C.chip, border: `1.5px solid ${d > 0 ? "#e5b0a5" : d < 0 ? C.light : C.border}`,
                        borderRadius: 8, padding: "2px 9px", color: d > 0 ? "#c0392b" : d < 0 ? "#2e7d32" : C.muted, fontVariantNumeric: "tabular-nums" }}>
                      cap {cap.toLocaleString()}
                      <b>{d > 0 ? `+${d.toLocaleString()} OVER` : d < 0 ? `${d.toLocaleString()} open` : "✓ at cap"}</b>
                    </span>
                  );
                })()}
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
                    <thead><tr>{["Variety", "Series", "Form", "Planned '26", "'26 sold", "Sell-thru", "Planned (pots)", "$/liner", "Broker"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
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
                              {vr.suggested && vr.pots === 0 && <span title="added as a suggestion — not in the plan number. Give it pots (and trim the one it replaces) to bring it in." style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "1px 6px" }}>💡 suggestion</span>}
                              {vr.items.size > 1 && <span title={[...vr.items].join(" · ")} style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: C.amber, background: C.amberBg, borderRadius: 5, padding: "1px 5px" }}>{vr.items.size} lines</span>}
                              {!!vr.benches.size && <div style={{ fontSize: 9.5, fontWeight: 500, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>{[...vr.benches].sort().join(" ")}</div>}
                            </td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{s?.series_name || "—"}</td>
                            <td style={td}><span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: /CALL/.test(s?.form || "") ? C.amberBg : C.chip, color: /CALL/.test(s?.form || "") ? C.amber : C.green }}>{s?.form || "—"}</span></td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }} title="what this color was planned for in 2026 — a frozen reference; it does NOT change as you edit or apply the 2027 plan">{vr.ref26 ? vr.ref26.toLocaleString() : "—"}</td>
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
                  {t.ref26 > 0 && <span style={{ color: C.muted, fontWeight: 500 }} title="what it was planned for in 2026 — reference for sizing a similar replacement color">'26 planned {t.ref26.toLocaleString()}</span>}
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
                              applied_at: new Date().toISOString(), applied_by: displayName || null, applied_units: 0,   // rows sit at 0 until a quantity is typed
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
              {/* move this variety to a DIFFERENT family (takes its recipe + pot) */}
              {ctx.moveFam == null ? (
                <button disabled={busy} onClick={() => setCtx({ ...ctx, moveFam: "" })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "#fff",
                    border: "none", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.dark }}>
                  🔀 Move to another family…
                </button>
              ) : (
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${C.border}` }}>
                  <input autoFocus value={ctx.moveFam} onChange={e => setCtx({ ...ctx, moveFam: e.target.value })}
                    placeholder="search families…" style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 12, fontFamily: FONT, marginBottom: 5 }} />
                  <div style={{ maxHeight: 200, overflow: "auto" }}>
                    {allFams.filter(f => f.id !== recipeId && (!ctx.moveFam.trim() || f.label.toLowerCase().includes(ctx.moveFam.trim().toLowerCase()))).slice(0, 40).map(f => (
                      <button key={f.id} disabled={busy} onClick={() => moveVarietyToFamily(ctx.vr, f)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", background: "#fff", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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

        {/* ⇧ Transfer to a new size — preview + new price, cascades everywhere */}
        {resize && (
          <div onClick={() => !busy && setResize(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9400, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 14px", overflow: "auto" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 14, width: "min(620px,96vw)", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.4)", fontFamily: FONT }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>⇧ Transfer to a new size</div>
                <span style={{ fontSize: 12, color: C.muted }}>from {recipe.size_label} {recipe.crop_name}</span>
                <button onClick={() => !busy && setResize(null)} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>New size</label>
                  <input list="fp-resize-sizes" value={resize.size} onChange={e => setResize(r => ({ ...r, size: e.target.value }))} autoFocus placeholder={`e.g. 12" HB`}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.light}`, fontSize: 13, fontFamily: FONT, marginTop: 3 }} />
                  <datalist id="fp-resize-sizes">{[...new Set(allFams.map(f => f.size_label))].sort().map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div style={{ minWidth: 180 }}>
                  <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Pot for the new size</label>
                  <select value={resize.pot} onChange={e => setResize(r => ({ ...r, pot: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${C.creamBr}`, fontSize: 12, fontFamily: FONT, marginTop: 3, cursor: "pointer" }}>
                    <option value="">— use the size's pot —</option>
                    {potOpts.map(c => <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ""}</option>)}
                  </select>
                </div>
                <div style={{ width: 110 }}>
                  <label style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>New price</label>
                  <input value={resize.price} onChange={e => setResize(r => ({ ...r, price: e.target.value }))} placeholder="optional" inputMode="decimal"
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.creamBr}`, fontSize: 13, fontFamily: FONT, marginTop: 3 }} />
                </div>
              </div>
              {resizePreview.length > 0 && resize.size.trim() && (
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 280, overflow: "auto" }}>
                  <div style={{ padding: "7px 11px", fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>
                    {resizePreview.length} item{resizePreview.length !== 1 ? "s" : ""} will become
                  </div>
                  {resizePreview.map(p => (
                    <div key={p.from} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 11px", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: C.muted, textDecoration: "line-through", flex: 1 }}>{p.from}</span>
                      <span style={{ color: C.muted }}>→</span>
                      <span style={{ fontWeight: 700, color: C.dark, flex: 1 }}>{p.to}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
                <span style={{ fontSize: 10.5, color: C.muted, flex: 1 }}>Moves items to the new-size family, re-pots them{resize.price ? `, prices at $${resize.price}` : ""}, and cascades into the plan, orders and pot buying.</span>
                <button onClick={() => setResize(null)} style={{ padding: "9px 15px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: "#fff", color: C.text, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
                <button disabled={busy || !resize.size.trim()} onClick={doResize}
                  style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: resize.size.trim() ? C.light : "#c9d4c2", color: "#fff", fontWeight: 800, fontSize: 13, cursor: resize.size.trim() ? "pointer" : "default", fontFamily: FONT }}>{busy ? "Transferring…" : "Transfer"}</button>
              </div>
            </div>
          </div>
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
  const [q, setQ] = useState("");               // corpus search — any crop/series/variety
  const [sq, setSq] = useState("");             // debounced
  const [searchRows, setSearchRows] = useState(null);

  useEffect(() => {
    // SUBSTRING crop match, not exact: the corpus names annuals "Geranium (Annual)" —
    // an exact "Geranium" match found only the Darwin Perennials cranesbill guide.
    if (!open || !cc || !recipe || rows) return;
    (async () => {
      const { data } = await cc.from("culture_guides_public")
        .select("id,breeder_name,crop_name,category,series_name,series_variety,propagation_weeks,finish_time_matrix,propagation_details,culture_details,requires_heat")
        .ilike("crop_name", `%${recipe.crop_name}%`).limit(200);
      setRows(data || []);
    })();
  }, [open, cc, recipe, rows]);

  useEffect(() => { const t = setTimeout(() => setSq(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    // free search over the WHOLE culture library — for when the crop-name net misses
    if (!cc || sq.length < 2) { setSearchRows(null); return; }
    let dead = false;
    (async () => {
      const { data } = await cc.from("culture_guides_public")
        .select("id,breeder_name,crop_name,category,series_name,series_variety,propagation_weeks,finish_time_matrix,propagation_details,culture_details,requires_heat")
        .or(`crop_name.ilike.%${sq}%,series_name.ilike.%${sq}%,series_variety.ilike.%${sq}%`).limit(80);
      if (!dead) setSearchRows(data || []);
    })();
    return () => { dead = true; };
  }, [cc, sq]);

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

  // rank: this family's series first, then guides in the same category as those
  // matches (an annual house's geranium page shouldn't lead with a perennial), then
  // the rest. One line per crop+series (dedupe, prefer the guide with a finish matrix).
  const famSeries = (series || []).map(x => String(x.series_name || "").toLowerCase()).filter(n => n && n !== "(unassigned)");
  const seriesKeyOf = g => String(g.series_name || g.series_variety || "?").replace(/[™®]/g, "").trim();
  const famMatch = g => { const sn = seriesKeyOf(g).toLowerCase(); return famSeries.some(f => sn.startsWith(f) || f.startsWith(sn)); };
  const pool = sq.length >= 2 ? (searchRows || []) : (rows || []);
  const matchedCats = new Set(pool.filter(famMatch).map(g => String(g.category || "").toLowerCase()).filter(Boolean));
  const rankOf = g => famMatch(g) ? 0 : (matchedCats.size && matchedCats.has(String(g.category || "").toLowerCase()) ? 1 : 2);
  const bySeries = {};
  pool.forEach(g => {
    const k = `${String(g.crop_name || "").trim()}|${seriesKeyOf(g)}`;
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 8px" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={`search the whole culture library… (showing ${recipe.crop_name})`}
              style={{ flex: 1, maxWidth: 380, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12 }} />
            {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>clear ✕</button>}
          </div>
          {(sq.length >= 2 ? searchRows == null : rows == null) && <div style={{ fontSize: 12, color: C.muted }}>reading the culture library…</div>}
          {(sq.length >= 2 ? searchRows != null : rows != null) && !Object.keys(bySeries).length &&
            <div style={{ fontSize: 12, color: C.muted }}>{sq.length >= 2 ? `nothing in the culture library matches "${sq}"` : `no culture guides on file for ${recipe.crop_name} — search above, set the recipe from experience, or add the guide to the culture library.`}</div>}
          {Object.entries(bySeries).sort(([ka, a], [kb, b]) => rankOf(a) - rankOf(b) || ka.localeCompare(kb)).map(([key, g]) => {
            const name = seriesKeyOf(g);
            const p = propOf(g), f = finishOf(g);
            const mid = f ? Math.round((f.lo + f.hi) / 2) : null;
            return (
              <div key={g.id} style={{ padding: "6px 0", borderBottom: `1px solid #f0f4ec` }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                  <b>{name}</b>
                  <span style={{ fontSize: 10.5, color: C.muted }}>{g.breeder_name}{g.crop_name && g.crop_name.toLowerCase() !== recipe.crop_name.toLowerCase() ? ` · ${g.crop_name}` : ""}</span>
                  {g.category && <span style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", padding: "1px 6px", borderRadius: 5,
                    background: /perennial/i.test(g.category) ? C.amberBg : C.chip, color: /perennial/i.test(g.category) ? C.amber : C.green }}>{g.category}</span>}
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
