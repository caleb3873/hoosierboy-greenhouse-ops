// SoilWorksheet — 🌱 Soil plan tab (Caleb 8/18): the projection priced in dirt.
// Reads the plan's pots × each container's dry-fill (containers.fill_volume_cu_ft),
// adds the prop-tray load (URC/CALL → 105s/50s; 4.5" geraniums DIRECT STICK = none),
// applies a waste %, nets off what's on hand, and prices the remainder in the Soil
// library's own economics (soil_mixes: bale size, fluff, $/bag, pallet, truck).
// Bought BY THE TRUCK — freight is flat, so the truck is the ordering unit.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f2f7ec", border: "#e0e8d6",
  muted: "#7a8c74", text: "#2f3b2a", red: "#c0392b", amber: "#c9812a", amberBg: "#fbf1df",
  green: "#2e7d32", card: "#ffffff", chip: "#eaf2e0" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const num = n => (n == null || isNaN(n)) ? "—" : Math.round(n).toLocaleString();
const money = n => n == null ? "—" : `$${(+n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const potFactor = r => { const ppp = Math.max(1, +r.ppp || 1); const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1); return ppp >= ppu && ppu > 1 ? ppu : 1; };

export default function SoilWorksheet({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [cons, setCons] = useState({});
  const [recDef, setRecDef] = useState({});
  const [mixes, setMixes] = useState([]);
  const [mixId, setMixId] = useState(() => { try { return localStorage.getItem("hb_soil_mix") || ""; } catch { return ""; } });
  const [waste, setWaste] = useState(() => { try { return +localStorage.getItem("hb_soil_waste") || 15; } catch { return 15; } });
  const [onHand, setOnHand] = useState(() => { try { return +localStorage.getItem(`hb_soil_onhand_${plan.id}`) || 0; } catch { return 0; } });

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const page = async (tbl, sel, filt) => { let out = [], f = 0; for (;;) { let q = sb.from(tbl).select(sel).range(f, f + 999); if (filt) q = filt(q); const { data } = await q; out = out.concat(data || []); if (!data || data.length < 1000) break; f += 1000; } return out; };
      const [sc, cn, rc, mx] = await Promise.all([
        page("scheduled_crops", "id,item_name,qty_pots,ppp,plants_per_unit,pack_size,prop_method,container_id,recipe_id,is_combo_component,combo_parent_id", q => q.eq("plan_id", plan.id)),
        sb.from("containers").select("id,name,fill_volume_cu_ft,cells_per_flat"),
        sb.from("crop_recipes").select("id,default_container_id"),
        sb.from("soil_mixes").select("*").order("name"),
      ]);
      setRows(sc);
      setCons(Object.fromEntries((cn.data || []).map(c => [c.id, c])));
      setRecDef(Object.fromEntries((rc.data || []).map(r => [r.id, r.default_container_id])));
      setMixes(mx.data || []);
    })();
  }, [sb, plan.id]);

  const mix = mixes.find(m => m.id === mixId) || mixes.find(m => +m.fluffed_volume > 0) || mixes[0] || null;
  useEffect(() => { if (mix && mix.id !== mixId) setMixId(mix.id); }, [mix, mixId]); // eslint-disable-line

  const calc = useMemo(() => {
    if (!rows) return null;
    const parentById = Object.fromEntries(rows.filter(r => !r.is_combo_component).map(r => [r.id, r]));
    const byCon = {}; const missing = {};
    let tray105Plants = 0, tray50Plants = 0, directStick = 0;
    rows.forEach(r => {
      if (!r.is_combo_component) {
        const pots = (+r.qty_pots || 0) * potFactor(r);
        const cid = r.container_id || recDef[r.recipe_id];
        const con = cid ? cons[cid] : null;
        if (con && con.fill_volume_cu_ft != null) {
          // multi-cell flats (1801s etc.): rows count PLANTS but the fill is PER FLAT —
          // divide by cells_per_flat or the soil total runs 18× hot (Caleb caught it 8/18)
          const cells = +con.cells_per_flat > 1 ? +con.cells_per_flat : 1;
          const o = byCon[con.id] || (byCon[con.id] = { name: con.name + (cells > 1 ? ` (${cells}-cell flats)` : ""), fill: +con.fill_volume_cu_ft, pots: 0 });
          o.pots += pots / cells;
        } else if (pots > 0) {
          const key = con ? con.name : "no container assigned";
          missing[key] = (missing[key] || 0) + pots;
        }
      }
      // prop-tray load: every URC/CALL plant sticks somewhere — except 4.5" geraniums,
      // which stick straight into their pot (DIRECT STICK carries no tray soil)
      const pm = String(r.prop_method || "").toUpperCase();
      if (!/^(URC|CALL)/.test(pm)) return;
      // plants = qty_pots × ppp in BOTH row encodings (flat-native: flats × plants-per-flat;
      // pot-native: pots × plants-per-pot) — same convention the order engine uses
      const plants = r.is_combo_component
        ? ((+parentById[r.combo_parent_id]?.qty_pots || 0) * Math.max(1, Math.round(+r.ppp || 1)))
        : (+r.qty_pots || 0) * Math.max(1, Math.round(+r.ppp || 1));
      const isGer = /GERANIUM/i.test(r.item_name || "");
      if (isGer && /^4\.5"/.test(r.item_name || "")) { directStick += plants; return; }
      if (isGer) tray50Plants += plants; else tray105Plants += plants;
    });
    const potList = Object.values(byCon).sort((a, b) => b.pots * b.fill - a.pots * a.fill);
    const potCf = potList.reduce((a, o) => a + o.pots * o.fill, 0);
    // tray fills live on the tray containers; fall back to the Berger-derived numbers
    const trayFill = name => { const t = Object.values(cons).find(c => new RegExp(name, "i").test(c.name || "")); return t?.fill_volume_cu_ft != null ? +t.fill_volume_cu_ft : null; };
    const f105 = trayFill("^105 ") ?? 0.0854, f50 = trayFill("^50 Sq Deep") ?? 0.1086;
    const t105 = Math.ceil(tray105Plants / 100), t50 = Math.ceil(tray50Plants / 50);
    const trayCf = t105 * f105 + t50 * f50;
    return { potList, potCf, missing, t105, t50, f105, f50, trayCf, tray105Plants, tray50Plants, directStick };
  }, [rows, cons, recDef]);

  if (!calc || !mixes.length) return <div style={{ fontFamily: FONT, color: C.muted, padding: 30 }}>Loading the plan + the Soil library…</div>;

  const fluff = +mix?.fluffed_volume > 0 ? +mix.fluffed_volume : (+mix?.bag_size || 0);
  const bagsPerPallet = +mix?.bags_per_pallet || 30;
  const palletsPerTruck = 22;   // house standard — freight is flat by the truck
  const cfPerTruck = +mix?.cf_per_truck > 0 ? +mix.cf_per_truck : bagsPerPallet * palletsPerTruck * fluff;
  const costPerTruck = +mix?.cost_per_truck > 0 ? +mix.cost_per_truck : bagsPerPallet * palletsPerTruck * (+mix?.cost_per_bag || 0);
  const bare = calc.potCf + calc.trayCf;
  const withWaste = bare * (1 + Math.max(0, waste) / 100);
  const onHandCf = onHand * fluff;
  const needCf = Math.max(0, withWaste - onHandCf);
  const bags = fluff > 0 ? Math.ceil(needCf / fluff) : 0;
  const trucks = cfPerTruck > 0 ? needCf / cfPerTruck : 0;
  const trucksOrder = Math.ceil(trucks - 0.05);   // don't round a 8.02 up to 9 over a rounding hair
  const cost = trucksOrder * costPerTruck;

  const th = { textAlign: "left", padding: "6px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "5px 9px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, color: C.text };
  const stat = (label, val, sub, color) => (
    <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 120 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color || C.dark, fontVariantNumeric: "tabular-nums" }}>{val}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: C.dark, margin: 0 }}>🌱 Soil</h2>
        <select value={mix?.id || ""} onChange={e => { setMixId(e.target.value); try { localStorage.setItem("hb_soil_mix", e.target.value); } catch {} }}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.light}`, fontFamily: FONT, fontSize: 12.5, fontWeight: 700, maxWidth: 320 }}>
          {mixes.map(m => <option key={m.id} value={m.id}>{m.name}{+m.fluffed_volume > 0 ? "" : " (no fluff volume set)"}</option>)}
        </select>
        {mix && <span style={{ fontSize: 11.5, color: C.muted }}>
          {mix.bag_size} cf bale → {fluff} cf fluffed · ${(+mix.cost_per_bag || 0).toFixed(2)}/bag · {bagsPerPallet}/pallet · truck = {palletsPerTruck} pallets = {num(cfPerTruck)} cf = {money(costPerTruck)}
        </span>}
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 11, fontWeight: 800, color: C.muted }}>WASTE %
          <input type="number" value={waste} onChange={e => { const v = Math.max(0, +e.target.value || 0); setWaste(v); try { localStorage.setItem("hb_soil_waste", String(v)); } catch {} }}
            style={{ width: 52, marginLeft: 6, padding: "5px 7px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: FONT, textAlign: "right" }} />
        </label>
        <label style={{ fontSize: 11, fontWeight: 800, color: C.muted }} title="bags currently in the barn earmarked for this plan">ON HAND (bags)
          <input type="number" value={onHand} onChange={e => { const v = Math.max(0, +e.target.value || 0); setOnHand(v); try { localStorage.setItem(`hb_soil_onhand_${plan.id}`, String(v)); } catch {} }}
            style={{ width: 68, marginLeft: 6, padding: "5px 7px", borderRadius: 7, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: FONT, textAlign: "right" }} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {stat("Bare need", `${num(bare)} cf`, `pots ${num(calc.potCf)} + trays ${num(calc.trayCf)}`)}
        {stat(`+ ${waste}% waste`, `${num(withWaste)} cf`)}
        {stat("On hand", `−${num(onHandCf)} cf`, `${num(onHand)} bags`)}
        {stat("To order", `${num(needCf)} cf`, `${num(bags)} bags · ${num(bags / bagsPerPallet)} pallets`)}
        {stat("Trucks", trucks.toFixed(1), `order ${trucksOrder}`, C.green)}
        {stat("Cost", money(cost), `${trucksOrder} × ${money(costPerTruck)}`, C.green)}
      </div>

      {Object.keys(calc.missing).length > 0 && (
        <div style={{ background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12 }}>
          ⚠ <b>not counted</b> (no fill volume): {Object.entries(calc.missing).map(([k, v]) => `${k} — ${num(v)} pots`).join(" · ")}
          <span style={{ color: C.muted }}> — set fill volumes on those containers and this page picks them up</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14, alignItems: "start" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", maxHeight: "60vh" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Pot", "Units", "Fill (cf)", "Total cf", "Bags"].map(h => <th key={h} style={{ ...th, textAlign: h === "Pot" ? "left" : "right" }}>{h}</th>)}</tr></thead>
            <tbody>
              {calc.potList.map(o => (
                <tr key={o.name}>
                  <td style={td}>{o.name}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(o.pots)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{o.fill}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{num(o.pots * o.fill)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{fluff > 0 ? num(o.pots * o.fill / fluff) : "—"}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 800 }}>Finished pots</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{num(calc.potList.reduce((a, o) => a + o.pots, 0))}</td>
                <td style={td} />
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{num(calc.potCf)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{fluff > 0 ? num(calc.potCf / fluff) : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 6 }}>Prop trays (stick soil)</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>105s — {num(calc.tray105Plants)} plants</span><b>{num(calc.t105)} trays · {num(calc.t105 * calc.f105)} cf</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>50-deep — {num(calc.tray50Plants)} geranium</span><b>{num(calc.t50)} trays · {num(calc.t50 * calc.f50)} cf</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: C.muted }}><span>Direct-stick 4.5" geraniums</span><span>{num(calc.directStick)} plants · no tray</span></div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>Tray soil</span><span>{num(calc.trayCf)} cf</span>
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
            Live off the projection — quantities move, this page follows. Fill volumes come from the container library (Berger-calculator numbers on the trays + SP470); waste % and on-hand are yours to set and stick per plan. Trucks round up only past a 5% hair.
          </div>
        </div>
      </div>
    </div>
  );
}
