// 🗺 Space — the house drawn like the house. Benches as columns left→right in
// walk order, basket lines overhead, low lines below; layers toggle on/off.
// The 2027 canvas starts BLANK — capacity only. Placing (drag or tap) stamps
// placed_at; the replay's inherited bench assignments live on the "last year"
// tab as reference and never count as fill. ✂ Trim cuts unplaced remainder.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import FamilyPage from "./FamilyPage";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff" };
const FONT = "'DM Sans', sans-serif";

const CLASSES = [
  ["tray45", '4.5" trays'], ["fiber_lg", 'Fiber LG (12")'], ["fiber_sm", 'Fiber SM / 9"'],
  ["pot11", '11"'], ["pot10", '10"'], ["canyon14", '14" canyon'], ["basket", "🧺 baskets"],
];
const QN = ["02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25"];
const HOUSES = [
  { key: "BWS", label: "West Side", benchLike: "BWS%", vertical: true, banks: [["South row", /^BWSS/, true], ["North row (09–16 ⅓)", /^BWSN/, true]], lineLike: ["BWSH%"] },
  { key: "DBM", label: "Bluff Main", benchLike: "DBM%", vertical: true, banks: [["West range", /^DBMW/, false], ["East range", /^DBME/, false]], lineLike: ["DBMH%", "DBML%"] },
  ...QN.map(n => ({ key: `Q${n}`, label: `Quonset ${n}`, benchLike: `EQ${n}%`, banks: [["Benches — walk order", new RegExp(`^EQ${n}0[1-4]$`), false]], lineLike: [`EQH${n}%`, `EQL${n}%`] })),
];

export function classOfItem(name) {
  const n = String(name || "").toUpperCase();
  if (/^HB /.test(n)) return "basket";
  if (/FIBER LG/.test(n)) return "fiber_lg";
  if (/FIBER SM|9" FIBER|FIBER 9/.test(n)) return "fiber_sm";
  if (/CANYON/.test(n)) return "canyon14";
  if (/^POT 11|^11"/.test(n)) return "pot11";
  if (/^POT 10|^10"/.test(n)) return "pot10";
  if (/^4\.5"|^1801|^FLAT/.test(n)) return "tray45";
  return null;
}
const TYPE_LABEL = { full8: "8'", full6: "6'", full4: "4'", third8: "⅓·8'", third4: "⅓·4'", wall4: "4' wall", mid8: "8' mid", basket_line: "line", low_line: "low" };

function zoneOf(code) {
  if (code.startsWith("BWS")) return "BWS";
  if (code.startsWith("DBM")) return "DBM";
  const m = code.match(/^EQ[HL]?(\d\d)/);
  if (m) return m[1] === "22" ? "EQ22" : (+m[1] % 2 ? "EQODD" : "EQEVEN");
  return null;
}

export default function SpaceMap({ plan: fixedPlan }) {
  const sb = getSupabase();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(fixedPlan?.id || null);
  const [houseKey, setHouseKey] = useState("BWS");
  const [cls, setCls] = useState("tray45");
  const [spacing, setSpacing] = useState("tight");
  const [mode, setMode] = useState("plan");          // plan (blank, place) | lastyear (reference)
  const [layers, setLayers] = useState({ benches: true, baskets: true, lows: true });
  const [benches, setBenches] = useState([]);
  const [rules, setRules] = useState({});
  const [rows, setRows] = useState([]);
  const [pool, setPool] = useState([]);
  const [decided, setDecided] = useState(null);
  const [grouping, setGrouping] = useState("round");   // round (family × week) | item (color × week)
  const [recipeNames, setRecipeNames] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [famOpen, setFamOpen] = useState(null);
  const [placeItem, setPlaceItem] = useState("");
  const [poolQ, setPoolQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const house = HOUSES.find(h => h.key === houseKey);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      if (!fixedPlan) {
        const { data: pl } = await sb.from("production_plans").select("id,name,status").neq("status", "archived").order("created_at", { ascending: false });
        setPlans(pl || []);
        if (!planId && pl?.length) setPlanId((pl.find(p => /spring.*2027/i.test(p.name)) || pl[0]).id);
      }
      const { data: r } = await sb.from("bench_capacity_rules").select("*");
      const rm = {};
      (r || []).forEach(x => { ((rm[x.zone_prefix] = rm[x.zone_prefix] || {})[x.bench_type] = rm[x.zone_prefix][x.bench_type] || {})[x.container_class] = x.capacity; });
      setRules(rm);
    })();
  }, [sb]); // eslint-disable-line

  useEffect(() => {
    if (!sb || !planId || !house) return;
    (async () => {
      let all = [];
      for (const pat of [house.benchLike, ...house.lineLike]) {
        const { data } = await sb.from("benches").select("id,code,bench_type,cap_overrides").like("code", pat).limit(1000);
        all = all.concat(data || []);
      }
      const seen = new Set(); const b = all.filter(x => !seen.has(x.id) && seen.add(x.id));
      setBenches(b);
      const ids = b.map(x => x.id);
      let sc = [];
      for (let i = 0; i < ids.length; i += 80) {
        const { data } = await sb.from("scheduled_crops").select("id,item_name,qty_pots,plant_week,bench_id,placed_at")
          .eq("plan_id", planId).in("bench_id", ids.slice(i, i + 80)).not("is_combo_component", "is", true).gt("qty_pots", 0).limit(2000);
        sc = sc.concat(data || []);
      }
      setRows(sc);
    })();
  }, [sb, planId, houseKey, tick]); // eslint-disable-line

  useEffect(() => {
    if (!sb || !planId) return;
    (async () => {
      // unplaced = no placed_at stamp — an inherited bench code doesn't count as placed
      let all = [], off = 0;
      for (;;) {
        const { data } = await sb.from("scheduled_crops").select("id,item_name,qty_pots,plant_week,plant_year,ready_week,bench_id,recipe_id")
          .eq("plan_id", planId).is("placed_at", null).not("is_combo_component", "is", true).gt("qty_pots", 0)
          .range(off, off + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        off += 1000;
      }
      setPool(all);
      const rids = [...new Set(all.map(r => r.recipe_id).filter(Boolean))];
      const rn = {};
      for (let i = 0; i < rids.length; i += 150) {
        const { data } = await sb.from("crop_recipes").select("id,crop_name,size_label,display_name").in("id", rids.slice(i, i + 150));
        (data || []).forEach(x => { rn[x.id] = x.display_name || `${x.size_label || ""} ${x.crop_name || ""}`.trim(); });
      }
      setRecipeNames(rn);
      let dec = [], doff = 0;
      for (;;) {
        const { data } = await sb.from("plan_targets").select("item_name")
          .eq("plan_id", planId).not("applied_at", "is", null).range(doff, doff + 999);
        dec = dec.concat(data || []);
        if (!data || data.length < 1000) break;
        doff += 1000;
      }
      setDecided(new Set(dec.map(d => d.item_name)));
    })();
  }, [sb, planId, tick]);

  // the plant date decides what goes down together. Two grains:
  //   round = whole FAMILY at one plant week (all colors placed as a unit)
  //   item  = one color at one plant week
  const unplaced = useMemo(() => {
    const m = {};
    pool.forEach(r => {
      if (!showAll && decided && !decided.has(r.item_name)) return;
      const wkKey = `${r.plant_year ?? ""}w${r.plant_week ?? "?"}r${r.ready_week ?? "?"}`;   // plant + finish = the group
      const byRound = grouping === "round" && r.recipe_id;
      const key = byRound ? `R${r.recipe_id}||${wkKey}` : `${r.item_name}||${wkKey}`;
      const label = byRound ? (recipeNames[r.recipe_id] || r.item_name) : r.item_name;
      const o = m[key] || (m[key] = { item: label, wk: r.plant_week, yr: r.plant_year, rdy: r.ready_week, qty: 0, rows: [], cls: classOfItem(r.item_name), rid: r.recipe_id || null, names: new Set() });
      o.qty += +r.qty_pots || 0; o.rows.push(r); o.names.add(r.item_name);
      if (r.recipe_id && !o.rid) o.rid = r.recipe_id;
    });
    return m;
  }, [pool, decided, showAll, grouping, recipeNames]);
  const hiddenCount = useMemo(() => {
    if (showAll || !decided) return 0;
    return new Set(pool.filter(r => !decided.has(r.item_name)).map(r => r.item_name)).size;
  }, [pool, decided, showAll]);

  function capOf(b, k) {
    const zone = rules[zoneOf(b.code)] || {};
    const rule = zone[b.bench_type] || {};
    const ov = b.cap_overrides || {};
    if (k === "tray45") {
      const sk = `tray45_${spacing}`;
      return ov[sk] ?? ov.tray45 ?? rule[sk] ?? rule.tray45 ?? null;
    }
    return ov[k] ?? rule[k] ?? null;
  }
  const inUnits = (q, k) => k === "tray45" ? Math.ceil(q / 10) : q;

  const placedRows = useMemo(() => rows.filter(r => r.placed_at), [rows]);
  const lastYearRows = useMemo(() => rows.filter(r => !r.placed_at), [rows]);
  const byBench = useMemo(() => {
    const src = mode === "lastyear" ? lastYearRows : placedRows;
    const m = {};
    src.forEach(r => {
      const o = m[r.bench_id] || (m[r.bench_id] = { items: [], byClass: {} });
      o.items.push(r);
      const k = classOfItem(r.item_name) || "other";
      o.byClass[k] = (o.byClass[k] || 0) + inUnits(+r.qty_pots || 0, k);
    });
    return m;
  }, [placedRows, lastYearRows, mode]); // eslint-disable-line

  async function allocate(itemKey, bench) {
    if (mode === "lastyear") return;
    const it = unplaced[itemKey];
    if (!it) return;
    const itemName = `${it.item} (wk ${it.wk ?? "?"})`;
    const k = it.cls || cls;
    const cap = capOf(bench, k);
    if (cap == null) { window.alert(`No ${k} capacity number for ${bench.code} — add it to the chart first.`); return; }
    const used = byBench[bench.id]?.byClass[k] || 0;
    const free = cap - used;
    if (free <= 0) { window.alert(`${bench.code} is full for this container (${used}/${cap}).`); return; }
    const freePots = k === "tray45" ? free * 10 : free;
    const suggested = Math.min(freePots, it.qty);
    const raw = window.prompt(`Place how many of\n${itemName}\non ${bench.code}?\n(${free} ${k === "tray45" ? "tray" : "pot"} spots free · ${it.qty.toLocaleString()} unplaced)`, String(suggested));
    if (raw == null) return;
    let want = Math.max(0, Math.round(+raw || 0));
    if (!want) return;
    const over = want - freePots;
    if (over > 0) {
      if (!window.confirm(`Only ${freePots.toLocaleString()} fit on ${bench.code}. Place ${freePots.toLocaleString()} and leave ${over.toLocaleString()} unplaced?`)) return;
      want = freePots;
    }
    setBusy(true);
    const stamp = new Date().toISOString();
    try {
      const rowsLeft = it.rows.slice().sort((a, b) => b.qty_pots - a.qty_pots);
      for (const r of rowsLeft) {
        if (want <= 0) break;
        if (+r.qty_pots <= want) {
          const { error } = await sb.from("scheduled_crops").update({ bench_id: bench.id, placed_at: stamp }).eq("id", r.id);
          if (error) throw new Error(error.message);
          want -= +r.qty_pots;
        }
      }
      if (want > 0) {
        const r = it.rows.filter(x => +x.qty_pots > want).sort((a, b) => a.qty_pots - b.qty_pots)[0];
        if (r) {
          const { data: kids } = await sb.from("scheduled_crops").select("id").eq("combo_parent_id", r.id).limit(1);
          if (kids?.length) {
            window.alert(`${it.item} is a combo — rows move whole. Placed what fit; ${want} still unplaced.`);
          } else {
            const { data: full, error: fe } = await sb.from("scheduled_crops").select("*").eq("id", r.id).single();
            if (fe) throw new Error(fe.message);
            const frac = want / +full.qty_pots;
            const clone = { ...full };
            delete clone.id; delete clone.created_at; delete clone.updated_at;
            clone.qty_pots = want;
            if (full.qty_plants_ordered != null) clone.qty_plants_ordered = Math.round(full.qty_plants_ordered * frac);
            clone.bench_id = bench.id; clone.placed_at = stamp;
            const { error: ie } = await sb.from("scheduled_crops").insert(clone);
            if (ie) throw new Error(ie.message);
            const { error: ue } = await sb.from("scheduled_crops").update({
              qty_pots: +full.qty_pots - want,
              qty_plants_ordered: full.qty_plants_ordered != null ? full.qty_plants_ordered - clone.qty_plants_ordered : null,
            }).eq("id", r.id);
            if (ue) throw new Error(ue.message);
          }
        }
      }
      setTick(t => t + 1);
    } catch (e) { window.alert("Placement failed: " + e.message); }
    setBusy(false);
  }

  async function trimToFit(itemKey) {
    const it = unplaced[itemKey];
    if (!it || !it.qty) return;
    if (!window.confirm(`✂ Trim the plan? This CUTS ${it.qty.toLocaleString()} unplaced pots of\n${it.item} (wk ${it.wk ?? "?"})\nso the plan matches the space. Placed quantities stay.`)) return;
    setBusy(true);
    try {
      for (const r of it.rows) {
        const { data: kids } = await sb.from("scheduled_crops").select("id").eq("combo_parent_id", r.id).limit(1);
        if (kids?.length) { window.alert(`${it.item} is a combo — trim it from its family page instead.`); break; }
        const { error } = await sb.from("scheduled_crops").delete().eq("id", r.id);
        if (error) throw new Error(error.message);
      }
      setTick(t => t + 1); setPlaceItem("");
    } catch (e) { window.alert("Trim failed: " + e.message); }
    setBusy(false);
  }

  async function unplace(row) {
    if (mode === "lastyear") return;
    if (!window.confirm(`Pull ${row.item_name} (${(+row.qty_pots).toLocaleString()}) off this spot?`)) return;
    setBusy(true);
    await sb.from("scheduled_crops").update({ placed_at: null }).eq("id", row.id);
    setBusy(false); setTick(t => t + 1);
  }

  const benchOf = re => benches.filter(b => re.test(b.code) && !["basket_line", "low_line"].includes(b.bench_type) && (b.bench_type || b.cap_overrides)).sort((a, b) => a.code.localeCompare(b.code));
  const basketLines = benches.filter(b => b.bench_type === "basket_line").sort((a, b) => a.code.localeCompare(b.code));
  const lowLines = benches.filter(b => b.bench_type === "low_line").sort((a, b) => a.code.localeCompare(b.code));

  const dropProps = b => ({
    onDragOver: e => e.preventDefault(),
    onDrop: e => { e.preventDefault(); const n = e.dataTransfer.getData("text/plain"); if (n && !busy) allocate(n, b); },
  });

  // ── a bench drawn as a bench: vertical column, capacity front and center ──
  const BenchCol = ({ b }) => {
    const k = cls;
    const cap = capOf(b, k);
    const info = byBench[b.id];
    const used = info?.byClass[k] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([x]) => x !== k).reduce((s, [, v]) => s + v, 0) : 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const blank = !info;
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dropProps(b)}
        style={{ flex: "1 1 120px", minWidth: 110, maxWidth: 200, minHeight: 126, display: "flex", flexDirection: "column",
          background: blank ? "#fbfdf8" : pct >= 1 ? "#fbe3e0" : "#fdf6e3", border: `1.5px solid ${pct >= 1 ? C.red : C.border}`,
          borderRadius: 10, padding: "8px 9px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5 }}>{b.code}</b>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>{TYPE_LABEL[b.bench_type] || ""}</span>
        </div>
        <div style={{ textAlign: "center", margin: "8px 0 2px" }}>
          {cap != null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>
                {blank ? cap.toLocaleString() : `${used}/${cap}`}
              </div>
              <div style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>
                {blank ? (k === "tray45" ? `${spacing} trays` : CLASSES.find(([x]) => x === k)?.[1]) : `${cap - used} open`}
              </div>
            </>
          ) : <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>no {CLASSES.find(([x]) => x === k)?.[1]} cap</div>}
        </div>
        {cap != null && !blank && (
          <div style={{ height: 5, background: "#e8ede3", borderRadius: 3, margin: "3px 0", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {(info?.items || []).map(r => (
          <div key={r.id} onClick={e => { e.stopPropagation(); unplace(r); }} title={mode === "plan" ? "click to pull off" : undefined}
            style={{ fontSize: 9.5, cursor: mode === "plan" ? "pointer" : "default", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: mode === "lastyear" ? C.muted : C.dark }}>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{(+r.qty_pots).toLocaleString()}</b> {r.item_name}
          </div>
        ))}
        {usedOther > 0 && <div style={{ fontSize: 8.5, color: C.amber, fontWeight: 700 }}>+{usedOther} other-container</div>}
      </div>
    );
  };

  // ── wide bench card for the big houses (stacked vertically, walk down) ──
  const BenchWide = ({ b }) => {
    const k = cls;
    const cap = capOf(b, k);
    const info = byBench[b.id];
    const used = info?.byClass[k] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([x]) => x !== k).reduce((s, [, v]) => s + v, 0) : 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const blank = !info;
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dropProps(b)}
        style={{ display: "flex", alignItems: "center", gap: 10, background: blank ? "#fbfdf8" : pct >= 1 ? "#fbe3e0" : "#fdf6e3",
          border: `1.5px solid ${pct >= 1 ? C.red : C.border}`, borderRadius: 9, padding: "7px 10px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ width: 74 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5 }}>{b.code}</b>
          <div style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>{TYPE_LABEL[b.bench_type] || ""}</div>
        </div>
        <div style={{ width: 92, textAlign: "right" }}>
          {cap != null ? (
            <>
              <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>
                {blank ? cap.toLocaleString() : `${used}/${cap}`}
              </span>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>
                {blank ? (k === "tray45" ? `${spacing}` : "cap") : `${cap - used} open`}
              </div>
            </>
          ) : <span style={{ fontSize: 9.5, color: C.muted }}>no cap</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {cap != null && !blank && (
            <div style={{ height: 5, background: "#e8ede3", borderRadius: 3, marginBottom: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
            </div>
          )}
          {(info?.items || []).map(r => (
            <div key={r.id} onClick={e => { e.stopPropagation(); unplace(r); }} title={mode === "plan" ? "click to pull off" : undefined}
              style={{ fontSize: 10, cursor: mode === "plan" ? "pointer" : "default", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: mode === "lastyear" ? C.muted : C.dark }}>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{(+r.qty_pots).toLocaleString()}</b> {r.item_name}
            </div>
          ))}
          {usedOther > 0 && <div style={{ fontSize: 8.5, color: C.amber, fontWeight: 700 }}>+{usedOther} other-container</div>}
        </div>
      </div>
    );
  };

  // ── a line drawn as a line: narrow strip, hover for detail ──
  const LineStrip = ({ b }) => {
    const cap = b.cap_overrides?.basket ?? null;
    const info = byBench[b.id];
    const used = info?.byClass.basket || 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const blank = !info;
    const short = b.code.replace(/^(EQH|EQL)\d\d/, "").replace(/^(BWSH|DBMH|DBML|ASMH)/, "");
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dropProps(b)}
        title={`${b.code} · ${used}/${cap ?? "?"}${info ? " — " + info.items.map(r => `${r.qty_pots} ${r.item_name}`).join(", ") : ""}`}
        style={{ width: 46, flex: "0 0 46px", textAlign: "center", background: blank ? "#fbfdf8" : pct >= 1 ? "#fbe3e0" : "#fdf6e3",
          border: `1.5px solid ${pct >= 1 ? C.red : C.border}`, borderRadius: 7, padding: "5px 2px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, color: C.muted }}>{short}</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>{blank ? (cap ?? "?") : used}</div>
        {!blank && cap != null && <div style={{ fontSize: 8, color: C.muted }}>/{cap}</div>}
        {b.cap_overrides?.hb_size && b.cap_overrides.hb_size !== "10" && <div style={{ fontSize: 8, fontWeight: 800, color: C.amber }}>{b.cap_overrides.hb_size}"</div>}
      </div>
    );
  };

  const poolList = Object.entries(unplaced)
    .filter(([, o]) => o.cls === cls && (!poolQ || o.item.toLowerCase().includes(poolQ.toLowerCase())))
    .sort(([, a], [, b]) => a.item.localeCompare(b.item) || (a.wk || 0) - (b.wk || 0));

  const Toggle = ({ k, label }) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: layers[k] ? C.dark : C.muted, cursor: "pointer" }}>
      <input type="checkbox" checked={layers[k]} onChange={e => setLayers(l => ({ ...l, [k]: e.target.checked }))} style={{ accentColor: "#7fb069" }} />{label}
    </label>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: C.dark, margin: 0 }}>🗺 Space</h2>
        <select value={houseKey} onChange={e => setHouseKey(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.light}`, fontFamily: FONT, fontSize: 13, fontWeight: 800 }}>
          {HOUSES.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
        </select>
        {!fixedPlan && (
          <select value={planId || ""} onChange={e => setPlanId(e.target.value)}
            style={{ padding: "5px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.status === "draft" ? " (draft)" : ""}</option>)}
          </select>
        )}
        <span style={{ display: "inline-flex", gap: 4 }}>
          {[["plan", "2027 — place"], ["lastyear", "📜 last year"]].map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: "5px 12px", borderRadius: 8, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${mode === m ? C.dark : C.border}`, background: mode === m ? C.dark : "#fff", color: mode === m ? C.cream : C.muted }}>{label}</button>
          ))}
        </span>
        <span style={{ display: "inline-flex", gap: 4 }}>
          {CLASSES.map(([k, label]) => (
            <button key={k} onClick={() => setCls(k)}
              style={{ padding: "4px 10px", borderRadius: 8, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${cls === k ? C.light : C.border}`, background: cls === k ? "#eef6e8" : "#fff", color: cls === k ? C.dark : C.muted }}>{label}</button>
          ))}
        </span>
        {cls === "tray45" && houseKey !== "BWS" && (
          <span style={{ display: "inline-flex", gap: 4 }}>
            {["tight", "spaced"].map(m => (
              <button key={m} onClick={() => setSpacing(m)}
                style={{ padding: "4px 10px", borderRadius: 8, fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: FONT,
                  border: `1.5px solid ${spacing === m ? C.amber : C.border}`, background: spacing === m ? "#fdf3e0" : "#fff", color: spacing === m ? C.dark : C.muted }}>{m}</button>
            ))}
          </span>
        )}
        <span style={{ display: "inline-flex", gap: 10, marginLeft: 4 }}>
          <Toggle k="baskets" label="🧺 baskets" /><Toggle k="benches" label="benches" /><Toggle k="lows" label="low lines" />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mode === "plan" ? "280px 1fr" : "1fr", gap: 14, alignItems: "start" }}>
        {mode === "plan" && (
          <div style={{ background: C.card, border: `1.5px solid ${placeItem ? C.light : C.border}`, borderRadius: 12, padding: "10px 12px", position: "sticky", top: 8, maxHeight: "82vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>📥 To place</span>
              <span style={{ flex: 1 }} />
              {[["round", "by round"], ["item", "by color"]].map(([g, label]) => (
                <button key={g} onClick={() => { setGrouping(g); setPlaceItem(""); }}
                  style={{ padding: "2px 8px", borderRadius: 7, fontWeight: 800, fontSize: 10, cursor: "pointer", fontFamily: FONT,
                    border: `1.5px solid ${grouping === g ? C.light : C.border}`, background: grouping === g ? "#eef6e8" : "#fff", color: grouping === g ? C.dark : C.muted }}>{label}</button>
              ))}
            </div>
            <input value={poolQ} onChange={e => setPoolQ(e.target.value)} placeholder="search unplaced…"
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, marginBottom: 8 }} />
            {placeItem && unplaced[placeItem] && (
              <div style={{ background: "#eef6e8", border: `1px solid ${C.light}`, borderRadius: 8, padding: "6px 9px", marginBottom: 8, fontSize: 11.5 }}>
                placing: <b>{unplaced[placeItem].item}</b> <span style={{ color: C.amber, fontWeight: 800 }}>wk {unplaced[placeItem].wk ?? "?"}</span>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {unplaced[placeItem]?.qty > 0 && (
                    <button disabled={busy} onClick={() => trimToFit(placeItem)}
                      title="cut the still-unplaced remainder so the plan matches the space"
                      style={{ padding: "3px 9px", borderRadius: 7, border: `1px solid ${C.red}`, background: "#fff", color: C.red, fontWeight: 800, fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>✂ Trim to fit</button>
                  )}
                  <button onClick={() => setPlaceItem("")} style={{ background: "none", border: "none", color: C.muted, fontWeight: 700, fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>done ✕</button>
                </div>
              </div>
            )}
            {poolList.slice(0, 120).map(([key, o]) => (
              <div key={key} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", key); setPlaceItem(key); }}
                onClick={() => setPlaceItem(placeItem === key ? "" : key)}
                title="drag onto the house, or tap then tap benches"
                style={{ padding: "5px 8px", borderRadius: 8, marginBottom: 3, cursor: "grab", fontSize: 11.5, lineHeight: 1.35, position: "relative",
                  border: `1.5px solid ${placeItem === key ? C.light : C.border}`, background: placeItem === key ? "#eef6e8" : "#fbfdf8" }}>
                <div style={{ paddingRight: 34 }}><b style={{ fontVariantNumeric: "tabular-nums" }}>{o.qty.toLocaleString()}</b> {o.item}</div>
                <div style={{ marginTop: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: C.amber, borderRadius: 5, padding: "0 6px" }}>WK {o.wk ?? "?"}</span>
                  {o.rdy != null && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, marginLeft: 4 }}>fin {o.rdy}</span>}
                  {grouping === "round" && <span style={{ fontSize: 9.5, color: C.muted, marginLeft: 5 }}>{o.names.size} color{o.names.size !== 1 ? "s" : ""}</span>}
                </div>
                {o.rid && (
                  <button onClick={e => { e.stopPropagation(); setFamOpen(o.rid); }} title="open the family page"
                    style={{ position: "absolute", right: 4, top: 4, padding: "1px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 9.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>⤴ fam</button>
                )}
              </div>
            ))}
            {poolList.length > 120 && <div style={{ fontSize: 10.5, color: C.muted }}>…{poolList.length - 120} more — search to narrow</div>}
            {hiddenCount > 0 && !showAll && (
              <button onClick={() => setShowAll(true)}
                style={{ background: "none", border: "none", color: C.muted, fontSize: 10.5, cursor: "pointer", fontFamily: FONT, padding: "4px 0", textAlign: "left" }}>
                + {hiddenCount} untouched item{hiddenCount !== 1 ? "s" : ""} hidden (no projection) — show anyway</button>
            )}
            {showAll && (
              <button onClick={() => setShowAll(false)} style={{ background: "none", border: "none", color: C.amber, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT, padding: "4px 0", textAlign: "left" }}>
                showing untouched too — hide again</button>
            )}
          </div>
        )}

        {/* ── the house, drawn like the house ── */}
        <div style={{ background: mode === "lastyear" ? "#f4f2ec" : "#f2f6ee", border: `2px solid ${C.border}`, borderRadius: 14, padding: "14px 16px" }}>
          {mode === "lastyear" && (
            <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
              📜 LAST YEAR — what was in {house?.label}; reference only, flip to "2027 — place" to fill
            </div>
          )}
          {layers.baskets && basketLines.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 4 }}>🧺 basket lines overhead — left → right</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{basketLines.map(b => <LineStrip key={b.id} b={b} />)}</div>
            </div>
          )}
          {layers.benches && (house?.vertical ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${house.banks.length}, 1fr)`, gap: 12, marginBottom: 12 }}>
              {house.banks.map(([label, re, rev]) => {
                let bs = benchOf(re);
                if (rev) bs = bs.slice().reverse();
                return (
                  <div key={label}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 4 }}>{label} — walk ↓</div>
                    <div style={{ display: "grid", gap: 5 }}>{bs.map(b => <BenchWide key={b.id} b={b} />)}</div>
                  </div>
                );
              })}
            </div>
          ) : (house?.banks || []).map(([label, re, rev]) => {
            let bs = benchOf(re);
            if (rev) bs = bs.slice().reverse();
            return bs.length > 0 && (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 4 }}>{label} — left → right</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 3 }}>{bs.map(b => <BenchCol key={b.id} b={b} />)}</div>
              </div>
            );
          }))}
          {layers.lows && lowLines.length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 4 }}>low lines — left → right</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{lowLines.map(b => <LineStrip key={b.id} b={b} />)}</div>
            </div>
          )}
        </div>
      </div>
      {famOpen && (
        <FamilyPage plan={fixedPlan || plans.find(p => p.id === planId) || { id: planId }} recipeId={famOpen}
          onClose={() => { setFamOpen(null); setTick(t => t + 1); }} />
      )}
    </div>
  );
}
