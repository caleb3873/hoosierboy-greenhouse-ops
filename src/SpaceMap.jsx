// 🗺 Space — capacity-first bench map. "Space is our most valuable asset."
// Capacity = bench_capacity_rules chart (zone × bench type × container class)
// with per-bench quirk overrides (benches.cap_overrides). Place mode: pick a
// plan item, click benches to allocate its unplaced quantity; whole plan rows
// move when possible, simple rows split. Combo parents move whole-row only
// (their component children reference the parent row).
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./shared";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff" };
const FONT = "'DM Sans', sans-serif";

const CLASSES = [
  ["fiber_lg", 'Fiber LG (12")'], ["fiber_sm", 'Fiber SM / 9"'], ["pot11", '11" pots'],
  ["pot10", '10" pots'], ["canyon14", '14" canyon'], ["tray45", '4.5" trays'], ["basket", "HB lines"],
];
const HOUSES = [{ prefix: "BWS", label: "West Side (Bluff)" }];

// container class from the plan item's name — fiber language matches the plan
export function classOfItem(name) {
  const n = String(name || "").toUpperCase();
  if (/^HB /.test(n)) return "basket";
  if (/FIBER LG/.test(n)) return "fiber_lg";
  if (/FIBER SM|9" FIBER|FIBER 9/.test(n)) return "fiber_sm";
  if (/CANYON/.test(n)) return "canyon14";
  if (/^POT 11|11" /.test(n)) return "pot11";
  if (/^POT 10|^10"/.test(n)) return "pot10";
  if (/^4\.5"/.test(n)) return "tray45";
  return null;
}
const TYPE_LABEL = { full8: "8'", full4: "4'", third8: "⅓·8'", third4: "⅓·4'", basket_line: "line" };

export default function SpaceMap() {
  const sb = getSupabase();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [house] = useState(HOUSES[0]);
  const [cls, setCls] = useState("fiber_lg");
  const [benches, setBenches] = useState([]);
  const [rules, setRules] = useState({});
  const [rows, setRows] = useState([]);
  const [placeItem, setPlaceItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [showBaskets, setShowBaskets] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: pl } = await sb.from("production_plans").select("id,name,status").in("status", ["active", "planning"]).order("created_at", { ascending: false });
      setPlans(pl || []);
      if (!planId && pl?.length) setPlanId((pl.find(p => /spring.*2027/i.test(p.name)) || pl[0]).id);
    })();
  }, [sb]); // eslint-disable-line

  useEffect(() => {
    if (!sb || !planId) return;
    (async () => {
      const { data: b } = await sb.from("benches").select("id,code,bench_type,cap_overrides").like("code", `${house.prefix}%`).order("code");
      setBenches(b || []);
      const { data: r } = await sb.from("bench_capacity_rules").select("*").eq("zone_prefix", house.prefix);
      const rm = {};
      (r || []).forEach(x => { (rm[x.bench_type] = rm[x.bench_type] || {})[x.container_class] = x.capacity; });
      setRules(rm);
      const ids = (b || []).map(x => x.id);
      let sc = [];
      for (let i = 0; i < ids.length; i += 80) {
        const { data } = await sb.from("scheduled_crops")
          .select("id,item_name,qty_pots,plant_week,bench_id")
          .eq("plan_id", planId).in("bench_id", ids.slice(i, i + 80)).not("is_combo_component", "is", true).limit(2000);
        sc = sc.concat(data || []);
      }
      setRows(sc);
    })();
  }, [sb, planId, house.prefix, tick]);

  // all plan items with unplaced quantity (for the place-mode picker)
  const [pool, setPool] = useState([]);
  useEffect(() => {
    if (!sb || !planId) return;
    (async () => {
      let all = [], off = 0;
      for (;;) {
        const { data } = await sb.from("scheduled_crops").select("id,item_name,qty_pots,plant_week,bench_id")
          .eq("plan_id", planId).is("bench_id", null).not("is_combo_component", "is", true).gt("qty_pots", 0)
          .range(off, off + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        off += 1000;
      }
      setPool(all);
    })();
  }, [sb, planId, tick]);

  const unplaced = useMemo(() => {
    const m = {};
    pool.forEach(r => {
      const o = m[r.item_name] || (m[r.item_name] = { qty: 0, rows: [], cls: classOfItem(r.item_name) });
      o.qty += +r.qty_pots || 0; o.rows.push(r);
    });
    return m;
  }, [pool]);

  const capOf = (b, k) => b.cap_overrides?.[k] ?? rules[b.bench_type]?.[k] ?? null;
  const inUnits = (q, k) => k === "tray45" ? Math.ceil(q / 10) : q;   // 4.5" = flats of 10 on the bench

  const byBench = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const o = m[r.bench_id] || (m[r.bench_id] = { items: [], byClass: {} });
      o.items.push(r);
      const k = classOfItem(r.item_name) || "other";
      o.byClass[k] = (o.byClass[k] || 0) + inUnits(+r.qty_pots || 0, k);
    });
    return m;
  }, [rows]);

  async function place(bench) {
    const it = unplaced[placeItem];
    if (!it) return;
    const k = it.cls || cls;
    const cap = capOf(bench, k);
    if (cap == null) { window.alert(`No ${k} capacity number for ${bench.code} (${bench.bench_type || "unclassified"}) — set it in the chart first.`); return; }
    const used = byBench[bench.id]?.byClass[k] || 0;
    const free = cap - used;
    if (free <= 0) { window.alert(`${bench.code} is full for this container (${used}/${cap}).`); return; }
    const freePots = k === "tray45" ? free * 10 : free;
    const suggested = Math.min(freePots, it.qty);
    const raw = window.prompt(`Place how many of\n${placeItem}\non ${bench.code}? (${free} ${k === "tray45" ? "tray" : "pot"} spots free, ${it.qty.toLocaleString()} unplaced)`, String(suggested));
    if (raw == null) return;
    let want = Math.max(0, Math.round(+raw || 0));
    if (!want) return;
    setBusy(true);
    try {
      // whole rows first (largest that fit), split one simple row for the remainder
      const rowsLeft = it.rows.slice().sort((a, b) => b.qty_pots - a.qty_pots);
      for (const r of rowsLeft) {
        if (want <= 0) break;
        if (+r.qty_pots <= want) {
          const { error } = await sb.from("scheduled_crops").update({ bench_id: bench.id }).eq("id", r.id);
          if (error) throw new Error(error.message);
          want -= +r.qty_pots;
        }
      }
      if (want > 0) {
        const r = it.rows.filter(x => +x.qty_pots > want).sort((a, b) => a.qty_pots - b.qty_pots)[0];
        if (r) {
          const { data: kids } = await sb.from("scheduled_crops").select("id").eq("combo_parent_id", r.id).limit(1);
          if (kids?.length) {
            window.alert(`${placeItem} is a combo — its rows move whole. Placed what fit as whole rows; ${want} left unplaced (pick another bench or move a whole row).`);
          } else {
            const { data: full, error: fe } = await sb.from("scheduled_crops").select("*").eq("id", r.id).single();
            if (fe) throw new Error(fe.message);
            const frac = want / +full.qty_pots;
            const clone = { ...full };
            delete clone.id; delete clone.created_at; delete clone.updated_at;
            clone.qty_pots = want;
            if (full.qty_plants_ordered != null) clone.qty_plants_ordered = Math.round(full.qty_plants_ordered * frac);
            clone.bench_id = bench.id;
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

  async function unplace(row) {
    if (!window.confirm(`Pull ${row.item_name} (${(+row.qty_pots).toLocaleString()}) off this bench?`)) return;
    setBusy(true);
    await sb.from("scheduled_crops").update({ bench_id: null }).eq("id", row.id);
    setBusy(false); setTick(t => t + 1);
  }

  const south = benches.filter(b => b.code.startsWith("BWSS")).sort((a, b) => b.code.localeCompare(a.code));
  const north = benches.filter(b => b.code.startsWith("BWSN")).sort((a, b) => b.code.localeCompare(a.code));
  const lines = benches.filter(b => b.code.startsWith("BWSH")).sort((a, b) => a.code.localeCompare(b.code));

  const BenchCard = ({ b }) => {
    const cap = capOf(b, cls);
    const info = byBench[b.id];
    const used = info?.byClass[cls] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([k]) => k !== cls).reduce((s, [, v]) => s + v, 0) : 0;
    const free = cap != null ? cap - used : null;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const bg = cap == null ? "#f6f6f4" : used === 0 && !usedOther ? "#f2f8ee" : pct >= 1 ? "#fbe3e0" : "#fdf6e3";
    return (
      <div onClick={() => placeItem && !busy && place(b)}
        title={placeItem ? `place ${placeItem} here` : undefined}
        style={{ background: bg, border: `1.5px solid ${pct >= 1 ? C.red : C.border}`, borderRadius: 10, padding: "8px 10px", cursor: placeItem ? "copy" : "default" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5 }}>{b.code}</b>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: C.muted, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 5px" }}>{TYPE_LABEL[b.bench_type] || "?"}</span>
          <span style={{ flex: 1 }} />
          {cap != null
            ? <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: free === 0 ? C.red : free < cap ? C.amber : "#2e7d32" }}>{used}/{cap}</span>
            : <span style={{ fontSize: 10, color: C.muted }}>no {cls} cap</span>}
        </div>
        {cap != null && (
          <div style={{ height: 6, background: "#e8ede3", borderRadius: 3, margin: "5px 0 4px", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
          </div>
        )}
        {(info?.items || []).map(r => (
          <div key={r.id} onClick={e => { e.stopPropagation(); unplace(r); }} title="click to pull off this bench"
            style={{ fontSize: 10.5, color: C.dark, cursor: "pointer", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{(+r.qty_pots).toLocaleString()}</b> {r.item_name} <span style={{ color: C.muted }}>wk{r.plant_week}</span>
          </div>
        ))}
        {usedOther > 0 && <div style={{ fontSize: 9.5, color: C.amber, fontWeight: 700 }}>+{usedOther} other-container units on this bench</div>}
      </div>
    );
  };

  const totals = useMemo(() => {
    let cap = 0, used = 0;
    [...south, ...north].forEach(b => { const c = capOf(b, cls); if (c != null) { cap += c; used += byBench[b.id]?.byClass[cls] || 0; } });
    return { cap, used };
  }, [south, north, cls, byBench, rules]); // eslint-disable-line

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1080 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: C.dark, margin: 0 }}>🗺 Space — {house.label}</h2>
        <select value={planId || ""} onChange={e => setPlanId(e.target.value)}
          style={{ padding: "5px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: C.muted }}>capacity chart + quirk overrides · hard count after production updates the numbers</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        {CLASSES.map(([k, label]) => (
          <button key={k} onClick={() => { setCls(k); if (k === "basket") setShowBaskets(true); }}
            style={{ padding: "5px 12px", borderRadius: 8, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT,
              border: `1.5px solid ${cls === k ? C.light : C.border}`, background: cls === k ? "#eef6e8" : "#fff", color: cls === k ? C.dark : C.muted }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.dark, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
          {totals.used.toLocaleString()} / {totals.cap.toLocaleString()} {cls === "tray45" ? "trays" : "pots"} placed · {(totals.cap - totals.used).toLocaleString()} open
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 12px", background: placeItem ? "#eef6e8" : "#fff", border: `1.5px solid ${placeItem ? C.light : C.border}`, borderRadius: 10, padding: "8px 12px" }}>
        <b style={{ fontSize: 12.5 }}>📍 Place:</b>
        <select value={placeItem} onChange={e => setPlaceItem(e.target.value)}
          style={{ padding: "6px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, maxWidth: 460 }}>
          <option value="">— pick material with unplaced quantity —</option>
          {Object.entries(unplaced).sort(([a], [b]) => a.localeCompare(b)).map(([n, o]) => (
            <option key={n} value={n}>{n} — {o.qty.toLocaleString()} unplaced{o.cls ? "" : " (no container class)"}</option>
          ))}
        </select>
        {placeItem && <span style={{ fontSize: 11.5, color: C.dark, fontWeight: 700 }}>now click a bench → it asks how many</span>}
        {placeItem && <button onClick={() => setPlaceItem("")} style={{ background: "none", border: "none", color: C.muted, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>done ✕</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 6 }}>South row (BWSS20 → 01)</div>
          <div style={{ display: "grid", gap: 7 }}>{south.map(b => <BenchCard key={b.id} b={b} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 6 }}>North row (BWSN16 → 01) — 09–16 are ⅓ benches</div>
          <div style={{ display: "grid", gap: 7 }}>{north.map(b => <BenchCard key={b.id} b={b} />)}</div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowBaskets(s => !s)} style={{ background: "none", border: "none", fontFamily: FONT, fontWeight: 800, fontSize: 12.5, color: C.dark, cursor: "pointer", padding: 0 }}>
          {showBaskets ? "▾" : "▸"} Overhead basket lines (BWSH01–80)
        </button>
        {showBaskets && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 6, marginTop: 8 }}>
            {lines.map(b => {
              const cap = b.cap_overrides?.basket;
              const used = byBench[b.id]?.byClass.basket || 0;
              const full = cap && used >= cap;
              return (
                <div key={b.id} onClick={() => placeItem && !busy && place(b)}
                  style={{ border: `1.5px solid ${full ? C.red : C.border}`, background: used ? "#fdf6e3" : "#f2f8ee", borderRadius: 8, padding: "6px 8px", cursor: placeItem ? "copy" : "default" }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "baseline" }}>
                    <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11 }}>{b.code}</b>
                    <span style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>{b.cap_overrides?.hb_size || "10"}"</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: full ? C.red : C.dark }}>{used}/{cap ?? "?"}</span>
                  </div>
                  {(byBench[b.id]?.items || []).map(r => (
                    <div key={r.id} onClick={e => { e.stopPropagation(); unplace(r); }}
                      style={{ fontSize: 9.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{(+r.qty_pots)} {r.item_name.replace(/^HB \d+" /, "")}</div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
