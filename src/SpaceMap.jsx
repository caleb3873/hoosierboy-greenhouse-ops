// 🗺 Space — capacity-first placement across every house. "Space is our most
// valuable asset." Capacity = bench_capacity_rules chart (zone × bench type ×
// container class) + per-bench quirk overrides. Quonsets resolve odd/even/H22;
// Bluff Main plants 4.5s tight then spaces them out (two tray modes). Place by
// picking or DRAGGING an unplaced plan item onto a bench/line; if space runs
// out you can trim the plan to fit. Combo parents move whole-row only.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff" };
const FONT = "'DM Sans', sans-serif";

const CLASSES = [
  ["tray45", '4.5" trays'], ["fiber_lg", 'Fiber LG (12")'], ["fiber_sm", 'Fiber SM / 9"'],
  ["pot11", '11"'], ["pot10", '10"'], ["canyon14", '14" canyon'], ["basket", "🧺 lines"],
];
const QN = ["02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25"];
const HOUSES = [
  { key: "BWS", label: "West Side", benchLike: "BWS%", rows: [["South", /^BWSS/], ["North (09–16 ⅓)", /^BWSN/]], lineLike: ["BWSH%"] },
  { key: "DBM", label: "Bluff Main", benchLike: "DBM%", rows: [["West", /^DBMW/], ["East", /^DBME/]], lineLike: ["DBMH%", "DBML%"] },
  // positions 01-04 only — EQ__05+ records are TURNED-SPACE duplicates, not benches
  ...QN.map(n => ({ key: `Q${n}`, label: `Quonset ${n}`, benchLike: `EQ${n}%`, rows: [["Benches (walk order)", new RegExp(`^EQ${n}0[1-4]$`)]], lineLike: [`EQH${n}%`, `EQL${n}%`] })),
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
  const [spacing, setSpacing] = useState("tight");   // tray mode where the zone distinguishes
  const [benches, setBenches] = useState([]);
  const [rules, setRules] = useState({});
  const [rows, setRows] = useState([]);
  const [pool, setPool] = useState([]);
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
        const { data } = await sb.from("scheduled_crops").select("id,item_name,qty_pots,plant_week,bench_id")
          .eq("plan_id", planId).in("bench_id", ids.slice(i, i + 80)).not("is_combo_component", "is", true).limit(2000);
        sc = sc.concat(data || []);
      }
      setRows(sc);
    })();
  }, [sb, planId, houseKey, tick]); // eslint-disable-line

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
      const o = m[r.item_name] || (m[r.item_name] = { qty: 0, rows: [], cls: classOfItem(r.item_name), wks: new Set() });
      o.qty += +r.qty_pots || 0; o.rows.push(r); if (r.plant_week) o.wks.add(r.plant_week);
    });
    return m;
  }, [pool]);

  // capacity resolution: override → zone rule; tray items try the spacing-specific
  // class first (quonsets/BM), then plain tray45 (west side)
  function capOf(b, k) {
    const z = zoneOf(b.code);
    const zone = rules[z] || {};
    const rule = zone[b.bench_type] || {};
    const ov = b.cap_overrides || {};
    if (k === "tray45") {
      const sk = `tray45_${spacing}`;
      return ov[sk] ?? ov.tray45 ?? rule[sk] ?? rule.tray45 ?? null;
    }
    return ov[k] ?? rule[k] ?? null;
  }
  const inUnits = (q, k) => k === "tray45" ? Math.ceil(q / 10) : q;

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

  async function allocate(itemName, bench) {
    const it = unplaced[itemName];
    if (!it) return;
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
    try {
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
            window.alert(`${itemName} is a combo — rows move whole. Placed what fit; ${want} still unplaced.`);
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

  // ✂ trim the plan to the space — remove the still-unplaced remainder of an item
  async function trimToFit(itemName) {
    const it = unplaced[itemName];
    if (!it || !it.qty) return;
    if (!window.confirm(`✂ Trim the plan? This CUTS ${it.qty.toLocaleString()} unplaced pots of\n${itemName}\nso the plan matches the space. Placed quantities stay.`)) return;
    setBusy(true);
    try {
      for (const r of it.rows) {
        const { data: kids } = await sb.from("scheduled_crops").select("id").eq("combo_parent_id", r.id).limit(1);
        if (kids?.length) { window.alert(`${itemName} is a combo — trim it from its family page instead.`); break; }
        const { error } = await sb.from("scheduled_crops").delete().eq("id", r.id);
        if (error) throw new Error(error.message);
      }
      setTick(t => t + 1); setPlaceItem("");
    } catch (e) { window.alert("Trim failed: " + e.message); }
    setBusy(false);
  }

  async function unplace(row) {
    if (!window.confirm(`Pull ${row.item_name} (${(+row.qty_pots).toLocaleString()}) off this spot?`)) return;
    setBusy(true);
    await sb.from("scheduled_crops").update({ bench_id: null }).eq("id", row.id);
    setBusy(false); setTick(t => t + 1);
  }

  const benchRows = (house?.rows || []).map(([label, re]) => [label,
    benches.filter(b => re.test(b.code) && !["basket_line", "low_line"].includes(b.bench_type) && (b.bench_type || b.cap_overrides))
      .sort((a, b) => a.code.localeCompare(b.code))]);
  const lineBenches = benches.filter(b => ["basket_line", "low_line"].includes(b.bench_type)).sort((a, b) => a.code.localeCompare(b.code));

  const dragProps = b => ({
    onDragOver: e => { if (placeItemRef.current) e.preventDefault(); },
    onDrop: e => { e.preventDefault(); const n = e.dataTransfer.getData("text/plain"); if (n && !busy) allocate(n, b); },
  });
  const placeItemRef = { current: placeItem };

  const BenchCard = ({ b }) => {
    const isLine = ["basket_line", "low_line"].includes(b.bench_type);
    const k = isLine ? "basket" : cls;
    const cap = isLine ? (b.cap_overrides?.basket ?? null) : capOf(b, k);
    const info = byBench[b.id];
    const used = info?.byClass[k] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([x]) => x !== k).reduce((s, [, v]) => s + v, 0) : 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const bg = cap == null ? "#f6f6f4" : used === 0 && !usedOther ? "#f2f8ee" : pct >= 1 ? "#fbe3e0" : "#fdf6e3";
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dragProps(b)}
        title={placeItem ? `place ${placeItem} here` : undefined}
        style={{ background: bg, border: `1.5px solid ${pct >= 1 ? C.red : C.border}`, borderRadius: 10, padding: "7px 10px", cursor: placeItem ? "copy" : "default" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12 }}>{b.code}</b>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 5, padding: "0 5px" }}>{TYPE_LABEL[b.bench_type] || "?"}{isLine && b.cap_overrides?.hb_size ? ` ${b.cap_overrides.hb_size}"` : ""}</span>
          <span style={{ flex: 1 }} />
          {cap != null
            ? <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: pct >= 1 ? C.red : used ? C.amber : "#2e7d32" }}>{used}/{cap}</span>
            : <span style={{ fontSize: 9.5, color: C.muted }}>no cap</span>}
        </div>
        {cap != null && (
          <div style={{ height: 5, background: "#e8ede3", borderRadius: 3, margin: "4px 0 3px", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
          </div>
        )}
        {(info?.items || []).map(r => (
          <div key={r.id} onClick={e => { e.stopPropagation(); unplace(r); }} title="click to pull off"
            style={{ fontSize: 10.5, cursor: "pointer", lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{(+r.qty_pots).toLocaleString()}</b> {r.item_name} <span style={{ color: C.muted }}>wk{r.plant_week}</span>
          </div>
        ))}
        {usedOther > 0 && <div style={{ fontSize: 9, color: C.amber, fontWeight: 700 }}>+{usedOther} other-container units here</div>}
      </div>
    );
  };

  const poolList = Object.entries(unplaced)
    .filter(([n]) => !poolQ || n.toLowerCase().includes(poolQ.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: C.dark, margin: 0 }}>🗺 Space</h2>
        <select value={houseKey} onChange={e => setHouseKey(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.light}`, fontFamily: FONT, fontSize: 13, fontWeight: 800 }}>
          {HOUSES.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
        </select>
        {fixedPlan
          ? <b style={{ fontSize: 13, color: C.muted }}>{fixedPlan.name}</b>
          : <select value={planId || ""} onChange={e => setPlanId(e.target.value)}
              style={{ padding: "5px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}{p.status === "draft" ? " (draft)" : ""}</option>)}
            </select>}
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
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 14, alignItems: "start" }}>
        {/* 📥 unplaced tray — drag onto a bench, or select + click */}
        <div style={{ background: C.card, border: `1.5px solid ${placeItem ? C.light : C.border}`, borderRadius: 12, padding: "10px 12px", position: "sticky", top: 8, maxHeight: "82vh", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted, marginBottom: 6 }}>📥 To place — drag onto the map</div>
          <input value={poolQ} onChange={e => setPoolQ(e.target.value)} placeholder="search unplaced…"
            style={{ width: "100%", boxSizing: "border-box", padding: "6px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12, marginBottom: 8 }} />
          {placeItem && (
            <div style={{ background: "#eef6e8", border: `1px solid ${C.light}`, borderRadius: 8, padding: "6px 9px", marginBottom: 8, fontSize: 11.5 }}>
              placing: <b>{placeItem}</b>
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
          {poolList.slice(0, 120).map(([n, o]) => (
            <div key={n} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", n); setPlaceItem(n); }}
              onClick={() => setPlaceItem(placeItem === n ? "" : n)}
              style={{ padding: "5px 8px", borderRadius: 8, marginBottom: 3, cursor: "grab", fontSize: 11.5, lineHeight: 1.35,
                border: `1.5px solid ${placeItem === n ? C.light : C.border}`, background: placeItem === n ? "#eef6e8" : "#fbfdf8" }}>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{o.qty.toLocaleString()}</b> {n}
              <div style={{ fontSize: 9.5, color: C.muted }}>{o.cls || "no class"} · wk {[...o.wks].sort((a, b) => a - b).join(", ") || "?"}</div>
            </div>
          ))}
          {poolList.length > 120 && <div style={{ fontSize: 10.5, color: C.muted }}>…{poolList.length - 120} more — search to narrow</div>}
        </div>

        {/* the house */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: benchRows.length > 1 ? "1fr 1fr" : "1fr", gap: 12 }}>
            {benchRows.map(([label, bs]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted, margin: "2px 0 6px" }}>{label}</div>
                <div style={{ display: "grid", gap: 6 }}>{bs.map(b => <BenchCard key={b.id} b={b} />)}</div>
              </div>
            ))}
          </div>
          {lineBenches.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted, margin: "2px 0 6px" }}>
                Hanging & low lines ({lineBenches.length})
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
                {lineBenches.map(b => <BenchCard key={b.id} b={b} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
