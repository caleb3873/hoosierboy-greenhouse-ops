// 🗺 Space — the house drawn like the house. Benches as columns left→right in
// walk order, basket lines overhead, low lines below; layers toggle on/off.
// The 2027 canvas starts BLANK — capacity only. Placing (drag or tap) stamps
// placed_at; the replay's inherited bench assignments live on the "last year"
// tab as reference and never count as fill. ✂ Trim cuts unplaced remainder.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { amendOrdersForTrim } from "./shared";
import FamilyPage from "./FamilyPage";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff" };
const FONT = "'DM Sans', sans-serif";

const CLASSES = [
  ["tray45", '4.5" tight'], ["tray45sp", '4.5" spaced'], ["qt", "1 QT (8s)"], ["fiber_lg", 'Fiber LG (12")'], ["fiber_sm", 'Fiber SM / 9"'],
  ["pot11", '11"'], ["pot10", '10"'], ["canyon14", '14" canyon'], ["basket", "🧺 baskets"],
];
// "qt" is a FILTER lens, not a capacity class: quarts share tray45 slots (8-packs in
// the same footprint as 10-pack staggers), so all capacity math stays tray45
const capClassOf = k => (k === "qt" ? "tray45" : k);
const QN = ["02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","25"];
const HOUSES = [
  // Sprague Main walks from the high numbers down — ASMW25/ASME25 head the ranges (Caleb 9/1)
  { key: "ASM", label: "Sprague Main", benchLike: "ASM%", vertical: true, banks: [["West range", /^ASMW/, true], ["East range", /^ASME/, true]], lineLike: ["ASMH%"] },
  { key: "BWS", label: "West Side", benchLike: "BWS%", vertical: true, banks: [["South row", /^BWSS/, true], ["North row (09–16 ⅓)", /^BWSN/, true]], lineLike: ["BWSH%"] },
  { key: "DBM", label: "Bluff Main", benchLike: "DBM%", vertical: true, banks: [["West range", /^DBMW/, false], ["East range", /^DBME/, false]], lineLike: ["DBMH%", "DBML%"] },
  ...QN.map(n => ({ key: `Q${n}`, label: `Quonset ${n}`, benchLike: `EQ${n}%`, banks: [["Benches — walk order", new RegExp(`^EQ${n}(SH)?0[1-4]$`), false]], lineLike: [`EQH${n}%`, `EQL${n}%`] })),
];

// 4.5" crops that ALWAYS get space (Caleb 8/20 — he may add more): they carry their
// own class and place against the SPACED tray numbers; everything else 4.5" is tight.
// The old house-wide tight/spaced toggle is gone — spacing is a property of the CROP.
export const SPACED_45 = /SUNPATIENS|NEW GUINEA|\bN\/?G\b|I'?CONIA|RIEGER|REIGER|GERANIUM/i;

export function classOfItem(name) {
  const n = String(name || "").toUpperCase();
  if (/^HB /.test(n)) return "basket";
  // 13" Fancy Boy (13X10.5 Baby Bell planter) spaces exactly like an 11"/12" fiber -
  // same footprint, so it shares the fiber_lg number instead of earning its own class
  // (Caleb 9/1). "POT 13\" GERANIUM" is the same 13" footprint and rides along.
  if (/FIBER LG|^POT 13|^13"/.test(n)) return "fiber_lg";
  if (/FIBER SM|9" FIBER|FIBER 9|^POT 8|^8"/.test(n)) return "fiber_sm";
  if (/CANYON/.test(n)) return "canyon14";
  if (/^POT 11|^11"/.test(n)) return "pot11";
  if (/^POT 10|^10"/.test(n)) return "pot10";
  // 6.5" azaleas sit in the SP 650 heavy-duty 6-pack flat filler, which takes the same
  // bench room as a 4.5" flat — same tight/spaced numbers, just 6 pots to the slot (Caleb 9/1)
  if (/^4\.5"|^6\.5"|^1801|^FLAT/.test(n)) return SPACED_45.test(n) ? "tray45sp" : "tray45";
  // perennial quarts (SP470DTS deep, 8-pack carriers) bench like 4.5 trays for now —
  // give them their own chart class if the carrier density proves different
  if (/^1 QT/.test(n)) return "tray45";
  return null;
}
// tray45 capacity counts TRAY SLOTS. A flat slot holds ten 4.5" pots, eight of the
// 1 QT 8-pack carriers (Caleb 8/18), or six 6.5" azaleas in the SP 650 heavy-duty
// flat filler (Caleb 9/1). One definition — it used to be copied into two scopes.
export const potsPerSlot = name => {
  const n = String(name || "").toUpperCase();
  return /^1 QT/.test(n) ? 8 : /^6\.5"/.test(n) ? 6 : 10;
};
const TYPE_LABEL = { full8: "8'", full6: "6'", full4: "4'", third8: "⅓·8'", third4: "⅓·4'", wall4: "4' wall", mid8: "8' mid", basket_line: "line", low_line: "low", shelf: "shelf·tight" };

function zoneOf(code) {
  if (code.startsWith("BWS")) return "BWS";
  if (code.startsWith("DBM")) return "DBM";
  const m = code.match(/^EQ[HL]?(\d\d)/);
  if (m) return m[1] === "22" ? "EQ22" : (+m[1] % 2 ? "EQODD" : "EQEVEN");
  return null;
}

// what's ON this spot — contents, combo components, timing, sourcing; unplace is
// just one button here instead of the only thing a click can do (Caleb 8/19)
function DrillCard({ sb, d, mode, onClose, onFamily, onUnplace }) {
  const [det, setDet] = useState(null);
  useEffect(() => {
    (async () => {
      const ids = d.items.flatMap(a => a.ids);
      const { data: rs } = await sb.from("scheduled_crops")
        .select("id,item_name,qty_pots,plant_week,plant_year,ship_week,ship_year,supplier,broker,prop_method,prop_tray_size,liner_unit_cost,notes,recipe_id")
        .in("id", ids);
      const { data: kids } = await sb.from("scheduled_crops")
        .select("combo_parent_id,ppp,variety_id,supplier,broker,prop_method,liner_unit_cost,ship_week,notes")
        .in("combo_parent_id", ids);
      const vids = [...new Set((kids || []).map(k => k.variety_id).filter(Boolean))];
      const vmap = {};
      for (let i = 0; i < vids.length; i += 100) {
        const { data: vs } = await sb.from("variety_library").select("id,crop_name,variety").in("id", vids.slice(i, i + 100));
        (vs || []).forEach(v => { vmap[v.id] = v; });
      }
      setDet({ rows: rs || [], kids: kids || [], vmap });
    })();
  }, [sb, d]);
  const wk = (w, y) => (w ? `wk ${w}${y ? "/" + String(y).slice(-2) : ""}` : "—");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: "16px 18px", width: 480, maxWidth: "94vw", maxHeight: "84vh", overflowY: "auto", fontFamily: FONT, color: C.dark, boxShadow: "0 18px 50px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 15 }}>{d.bench.code}</b>
          <span style={{ fontSize: 11.5, color: C.muted }}>{d.items.length} item{d.items.length !== 1 ? "s" : ""} on this spot</span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 15, color: C.muted }}>✕</button>
        </div>
        {!det && <div style={{ padding: 18, color: C.muted, fontSize: 12.5 }}>looking inside…</div>}
        {det && d.items.map(a => {
          const rows = det.rows.filter(r => a.ids.includes(r.id));
          const r0 = rows[0] || {};
          const kidsHere = det.kids.filter(k => a.ids.includes(k.combo_parent_id));
          const comps = {};
          kidsHere.forEach(k => {
            const v = det.vmap[k.variety_id];
            const nm = v ? `${v.crop_name} ${v.variety}` : "?";
            if (!comps[nm]) comps[nm] = { ...k, nm };
          });
          return (
            <div key={a.name} style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 13.5 }}>{a.name}</b>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800, color: C.light, fontSize: 13.5 }}>{a.qty.toLocaleString()}</span>
                <span style={{ fontSize: 10.5, color: C.muted }}>{Object.keys(comps).length ? "combo" : ""}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                ship {wk(r0.ship_week, r0.ship_year)} · plant {wk(r0.plant_week, r0.plant_year)}
                {r0.supplier ? <> · {r0.supplier}{r0.broker && r0.broker !== r0.supplier ? ` via ${r0.broker}` : ""}</> : null}
                {r0.prop_method ? <> · {r0.prop_method}{r0.prop_tray_size ? `/${r0.prop_tray_size}` : ""}</> : null}
                {r0.liner_unit_cost ? <> · ${(+r0.liner_unit_cost).toFixed(3)}</> : null}
              </div>
              {Object.keys(comps).length > 0 && (
                <div style={{ marginTop: 8, borderTop: `1px dashed ${C.border}`, paddingTop: 7 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: .4, marginBottom: 3 }}>IN EACH ONE</div>
                  {Object.values(comps).map(k => (
                    <div key={k.nm} style={{ fontSize: 12, lineHeight: 1.7 }}>
                      <b>{k.ppp || 1}×</b> {k.nm}
                      <span style={{ color: C.muted, fontSize: 10.5 }}> — {k.supplier || "?"}{k.prop_method ? ` ${k.prop_method}` : ""}{k.liner_unit_cost ? ` $${(+k.liner_unit_cost).toFixed(3)}` : ""}{k.ship_week ? ` · arrives wk ${k.ship_week}` : ""}{k.notes && /outside/i.test(k.notes) ? " · outside edge" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {rows.length > 1 && <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>{rows.length} rows on this spot ({rows.map(r => r.qty_pots).join(" + ")})</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                {a.rid && <button onClick={() => onFamily(a.rid)} style={{ border: `1px solid ${C.border}`, background: C.chip, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontFamily: FONT, fontSize: 11.5 }}>🌿 family page</button>}
                {mode === "plan" && <button onClick={() => onUnplace(a)} style={{ marginLeft: "auto", border: `1px solid ${C.red}`, background: "#fff", color: C.red, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontFamily: FONT, fontSize: 11.5 }}>🗑 pull off this spot</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 🗺 ALL HOUSES — the whole property through the selected container lens: fill, OPEN
// slots, and the PLANT WEEKS already working in each house, so week-11 spare space can
// take another week-11 annual without opening quonsets one by one (Caleb 8/20).
function AllHousesOverview({ sb, planId, rules, cls, onPick, tick }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!sb || !planId) return;
    (async () => {
      let benches = [], off = 0;
      for (;;) {
        const { data: bp } = await sb.from("benches").select("id,code,bench_type,cap_overrides").range(off, off + 999);
        benches = benches.concat(bp || []);
        if (!bp || bp.length < 1000) break;
        off += 1000;
      }
      let rows = []; off = 0;
      for (;;) {
        const { data: rp } = await sb.from("scheduled_crops").select("bench_id,item_name,qty_pots,plant_week")
          .eq("plan_id", planId).not("placed_at", "is", null).not("is_combo_component", "is", true).gt("qty_pots", 0)
          .range(off, off + 999);
        rows = rows.concat(rp || []);
        if (!rp || rp.length < 1000) break;
        off += 1000;
      }
      setData({ benches, rows });
    })();
  }, [sb, planId, tick]);
  if (!data) return <div style={{ padding: 30, color: C.muted }}>surveying the property…</div>;

  const k = capClassOf(cls);
  const capOf = b => {
    const zone = rules[zoneOf(b.code)] || {};
    const rule = zone[b.bench_type] || {};
    const ov = b.cap_overrides || {};
    if (k === "tray45" || k === "tray45sp") {
      const sk = k === "tray45sp" ? "tray45_spaced" : "tray45_tight";
      return ov[sk] ?? ov.tray45 ?? rule[sk] ?? rule.tray45 ?? null;
    }
    if (k === "basket") return ov.basket ?? null;
    return ov[k] ?? rule[k] ?? null;
  };
  const cards = HOUSES.map(h => {
    const pats = [h.benchLike.replace("%", ""), ...(h.lineLike || []).map(x => x.replace("%", ""))];
    const hb = data.benches.filter(b => pats.some(p => b.code.startsWith(p)));
    const isLine = b => ["basket_line", "low_line"].includes(b.bench_type);
    const domain = hb.filter(b => (k === "basket" ? isLine(b) : !isLine(b)) && (b.bench_type || b.cap_overrides));
    const ids = new Set(domain.map(b => b.id));
    let cap = 0, capBenches = 0;
    domain.forEach(b => { const c = capOf(b); if (c != null) { cap += c; capBenches++; } });
    let used = 0; const weeks = {};
    data.rows.forEach(r => {
      if (!ids.has(r.bench_id)) return;
      const rc = classOfItem(r.item_name);
      if ((k === "tray45" || k === "tray45sp") ? (rc !== "tray45" && rc !== "tray45sp") : k === "basket" ? rc !== "basket" : rc !== k) return;
      used += k === "basket" ? r.qty_pots : (k === "tray45" || k === "tray45sp") ? Math.ceil(r.qty_pots / potsPerSlot(r.item_name)) : r.qty_pots;
      if (r.plant_week != null) weeks[r.plant_week] = (weeks[r.plant_week] || 0) + r.qty_pots;
    });
    return { key: h.key, label: h.label, cap, used, open: Math.max(0, cap - used), capBenches, weeks };
  }).filter(c => c.capBenches > 0);
  // property walk order (HOUSES definition order) — most-open sorting scrambled the map (Caleb 8/31)
  const totOpen = cards.reduce((t, c) => t + c.open, 0);
  const unit = k === "basket" ? "baskets" : (k === "tray45" || k === "tray45sp") ? "trays" : "pots";
  return (
    <div>
      <div style={{ fontSize: 12.5, color: C.muted, margin: "2px 0 10px" }}>
        <b style={{ color: C.dark }}>{totOpen.toLocaleString()} {unit} open</b> across the property in this lens — property walk order · click a house to work it · week chips = what already PLANTS there (match a week to co-plant efficiently)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
        {cards.map(c => {
          const pct = c.cap ? Math.min(1, c.used / c.cap) : 0;
          const wks = Object.entries(c.weeks).sort((a, b) => +a[0] - +b[0]);
          return (
            <div key={c.key} onClick={() => onPick(c.key)}
              style={{ background: C.card, border: `1.5px solid ${c.open > 0 ? C.light : C.border}`, borderRadius: 12, padding: "11px 13px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <b style={{ fontSize: 13.5 }}>{c.label}</b>
                <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 16, fontVariantNumeric: "tabular-nums", color: c.open > 0 ? C.light : C.muted }}>{c.open.toLocaleString()}</span>
                <span style={{ fontSize: 10, color: C.muted }}>open</span>
              </div>
              <div style={{ height: 5, background: "#e8ede3", borderRadius: 3, margin: "6px 0", overflow: "hidden" }}>
                <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>{c.used.toLocaleString()} / {c.cap.toLocaleString()} {unit}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {wks.length ? wks.map(([w, n]) => (
                  <span key={w} title={`${n.toLocaleString()} pots plant wk ${w}`}
                    style={{ fontSize: 10, fontWeight: 800, background: "#eef6e8", border: `1px solid ${C.light}`, color: C.dark, borderRadius: 8, padding: "1px 7px" }}>wk {w}</span>
                )) : <span style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>nothing planted in this lens yet</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SpaceMap({ plan: fixedPlan }) {
  const sb = getSupabase();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(fixedPlan?.id || null);
  const [houseKey, setHouseKey] = useState("BWS");
  const [cls, setCls] = useState("tray45");
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
  const [drill, setDrill] = useState(null);           // { bench, items:[agg] } — click-to-inspect a placed spot
  const [placeItem, setPlaceItem] = useState("");
  const [poolQ, setPoolQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const house = HOUSES.find(h => h.key === houseKey);

  // family edits happen in other tabs/overlays — refetch whenever we come back
  useEffect(() => {
    const wake = () => { if (!document.hidden) setTick(t => t + 1); };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); };
  }, []);

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
        const { data } = await sb.from("scheduled_crops").select("id,item_name,qty_pots,plant_week,bench_id,placed_at,recipe_id")
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
    if (k === "tray45" || k === "tray45sp") {
      const sk = k === "tray45sp" ? "tray45_spaced" : "tray45_tight";
      return ov[sk] ?? ov.tray45 ?? rule[sk] ?? rule.tray45 ?? null;
    }
    return ov[k] ?? rule[k] ?? null;
  }
  const isTray = k => k === "tray45" || k === "tray45sp";
  const inUnits = (q, k, name) => isTray(k) ? Math.ceil(q / potsPerSlot(name)) : q;

  const placedRows = useMemo(() => rows.filter(r => r.placed_at), [rows]);
  const lastYearRows = useMemo(() => rows.filter(r => !r.placed_at), [rows]);
  const byBench = useMemo(() => {
    const src = mode === "lastyear" ? lastYearRows : placedRows;
    const m = {};
    src.forEach(r => {
      const o = m[r.bench_id] || (m[r.bench_id] = { agg: {}, byClass: {} });
      const a = o.agg[r.item_name] || (o.agg[r.item_name] = { name: r.item_name, qty: 0, ids: [], firstId: r.id, wk: r.plant_week, rid: r.recipe_id || null });
      a.qty += +r.qty_pots || 0; a.ids.push(r.id);
      if (r.recipe_id && !a.rid) a.rid = r.recipe_id;
      const k = classOfItem(r.item_name) || "other";
      o.byClass[k] = (o.byClass[k] || 0) + inUnits(+r.qty_pots || 0, k, r.item_name);
    });
    Object.values(m).forEach(o => { o.items = Object.values(o.agg).sort((a, b) => a.name.localeCompare(b.name)); });
    return m;
  }, [placedRows, lastYearRows, mode]); // eslint-disable-line

  async function allocate(itemKey, bench) {
    if (mode === "lastyear") return;
    const it = unplaced[itemKey];
    if (!it) return;
    const itemName = `${it.item} (wk ${it.wk ?? "?"})`;
    const k = it.cls || capClassOf(cls);
    const cap = capOf(bench, k);
    if (cap == null) { window.alert(`No ${k} capacity number for ${bench.code} — add it to the chart first.`); return; }
    // basket lines are FIXED spacing (Caleb 8/13): a 10" line is always a 10" line —
    // the basket's size must match the line's size, no exceptions
    if (k === "basket" && ["basket_line", "low_line"].includes(bench.bench_type)) {
      const lineSize = String(bench.cap_overrides?.hb_size || "10");
      const itemSize = (String(it.item).toUpperCase().match(/^HB (\d+)/) || [])[1] || "10";
      if (lineSize !== itemSize) {
        window.alert(`${bench.code} is a fixed ${lineSize}" line — ${it.item} is a ${itemSize}" basket. Lines don't change spacing; pick a ${itemSize}" line.`);
        return;
      }
    }
    const used = byBench[bench.id]?.byClass[k] || 0;
    const otherUnits = Object.entries(byBench[bench.id]?.byClass || {}).filter(([x]) => x !== k).reduce((sm, [, v]) => sm + v, 0);
    if (otherUnits > 0) { window.alert(`${bench.code} is already holding a different container — one container per bench. Clear it (🧹) or pick another bench.`); return; }
    const free = cap - used;
    if (free <= 0) { window.alert(`${bench.code} is full for this container (${used}/${cap}).`); return; }
    const freePots = isTray(k) ? free * potsPerSlot(it.item) : free;
    const suggested = Math.min(freePots, it.qty);
    const raw = window.prompt(`Place how many of\n${itemName}\non ${bench.code}?\n(${free} ${isTray(k) ? "tray" : "pot"} spots free · ${it.qty.toLocaleString()} unplaced)`, String(suggested));
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
      // combos move whole rows only (children reference the parent row)
      const { data: anyKids } = await sb.from("scheduled_crops").select("id").in("combo_parent_id", it.rows.map(r => r.id)).limit(1);
      const isCombo = !!anyKids?.length;
      // colors go down TOGETHER: finish one color before starting the next; a color
      // only splits at the bench boundary. Same color merges into one row per bench.
      const byColor = {};
      it.rows.forEach(r => (byColor[r.item_name] = byColor[r.item_name] || []).push(r));
      const placedHere = byBench[bench.id]?.agg || {};
      const mergeTargets = {};   // item_name -> placed row id on this bench
      Object.values(placedHere).forEach(a => { mergeTargets[a.name] = a.firstId; });
      const moveWhole = async (r) => {
        const tgt = !isCombo && mergeTargets[r.item_name];
        if (tgt) {
          const { data: pair, error: pe } = await sb.from("scheduled_crops").select("id,qty_pots,qty_plants_ordered").in("id", [tgt, r.id]);
          if (pe) throw new Error(pe.message);
          const t = pair.find(x => x.id === tgt), src = pair.find(x => x.id === r.id);
          const { error: ue } = await sb.from("scheduled_crops").update({
            qty_pots: (+t.qty_pots || 0) + (+src.qty_pots || 0),
            qty_plants_ordered: t.qty_plants_ordered != null || src.qty_plants_ordered != null
              ? (+t.qty_plants_ordered || 0) + (+src.qty_plants_ordered || 0) : null,
          }).eq("id", tgt);
          if (ue) throw new Error(ue.message);
          const { error: de } = await sb.from("scheduled_crops").delete().eq("id", r.id);
          if (de) throw new Error(de.message);
        } else {
          const { error } = await sb.from("scheduled_crops").update({ bench_id: bench.id, placed_at: stamp }).eq("id", r.id);
          if (error) throw new Error(error.message);
          mergeTargets[r.item_name] = r.id;
        }
      };
      const splitTake = async (r, take) => {
        const { data: full, error: fe } = await sb.from("scheduled_crops").select("*").eq("id", r.id).single();
        if (fe) throw new Error(fe.message);
        const plantsTaken = full.qty_plants_ordered != null ? Math.round(full.qty_plants_ordered * take / +full.qty_pots) : null;
        const tgt = mergeTargets[r.item_name];
        if (tgt) {
          const { data: t, error: te } = await sb.from("scheduled_crops").select("id,qty_pots,qty_plants_ordered").eq("id", tgt).single();
          if (te) throw new Error(te.message);
          const { error: ue } = await sb.from("scheduled_crops").update({
            qty_pots: (+t.qty_pots || 0) + take,
            qty_plants_ordered: t.qty_plants_ordered != null || plantsTaken != null ? (+t.qty_plants_ordered || 0) + (plantsTaken || 0) : null,
          }).eq("id", tgt);
          if (ue) throw new Error(ue.message);
        } else {
          const clone = { ...full };
          delete clone.id; delete clone.created_at; delete clone.updated_at;
          clone.qty_pots = take;
          if (plantsTaken != null) clone.qty_plants_ordered = plantsTaken;
          clone.bench_id = bench.id; clone.placed_at = stamp;
          const { error: ie } = await sb.from("scheduled_crops").insert(clone);
          if (ie) throw new Error(ie.message);
        }
        const { error: se } = await sb.from("scheduled_crops").update({
          qty_pots: +full.qty_pots - take,
          qty_plants_ordered: full.qty_plants_ordered != null ? full.qty_plants_ordered - (plantsTaken || 0) : null,
        }).eq("id", r.id);
        if (se) throw new Error(se.message);
      };
      let comboLeftover = false;
      outer:
      for (const cn of Object.keys(byColor).sort()) {
        for (const r of byColor[cn].sort((a, b) => b.qty_pots - a.qty_pots)) {
          if (want <= 0) break outer;
          if (+r.qty_pots <= want) { await moveWhole(r); want -= +r.qty_pots; }
          else if (isCombo) { comboLeftover = true; }
          else { await splitTake(r, want); want = 0; break outer; }
        }
      }
      if (comboLeftover && want > 0) window.alert(`${it.item} is a combo — rows move whole. Placed what fit; ${want.toLocaleString()} still unplaced.`);
      setTick(t => t + 1);
    } catch (e) { window.alert("Placement failed: " + e.message); }
    setBusy(false);
  }

  async function trimToFit(itemKey) {
    const it = unplaced[itemKey];
    if (!it || !it.qty) return;
    // show WHAT remains before anything is cut, and make the cut ripple: the trimmed
    // number restamps the projection so family + walkthrough follow (Caleb 8/13 —
    // "it gets trimmed and it doesn't change anything")
    const brk = it.rows.map(r => `  ${(+r.qty_pots).toLocaleString()} — ${r.item_name} (wk ${r.plant_week ?? "?"})`).join("\n");
    if (!window.confirm(`✂ Still unplaced on ${it.item}:\n${brk}\n\nOK = DELETE these ${it.qty.toLocaleString()} pots and update the projection to the trimmed number (family page + walkthrough follow).\n\nWant to rework the quantities instead? Cancel here and use the 🌿 family button — trimming there repopulates everything the same way.`)) return;
    setBusy(true);
    const stamp = new Date().toISOString();
    try {
      const names = [...new Set(it.rows.map(r => r.item_name))];
      for (const r of it.rows) {
        const { data: kids } = await sb.from("scheduled_crops").select("id").eq("combo_parent_id", r.id).limit(1);
        if (kids?.length) { window.alert(`${it.item} is a combo — trim it from its family page instead.`); break; }
        const { error } = await sb.from("scheduled_crops").delete().eq("id", r.id);
        if (error) throw new Error(error.message);
      }
      // restamp the decision layer to the surviving totals — trim = a real plan change
      for (const name of names) {
        const { data: rest } = await sb.from("scheduled_crops").select("qty_pots,ppp,plants_per_unit,pack_size")
          .eq("plan_id", planId).eq("item_name", name).not("is_combo_component", "is", true);
        const pots = (rest || []).reduce((a, r) => {
          const ppp = Math.max(1, +r.ppp || 1); const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1);
          return a + (+r.qty_pots || 0) * (ppp >= ppu && ppu > 1 ? ppu : 1);
        }, 0);
        await sb.from("plan_targets").upsert({
          plan_id: planId, item_name: name, target_units: pots, decision: pots === 0 ? "drop" : "cut",
          applied_at: stamp, applied_by: "space-trim", applied_units: pots,
          decided_at: stamp, decided_by: "space-trim", updated_at: stamp,
        }, { onConflict: "plan_id,item_name" });
        try {
          await sb.from("item_change_log").insert({ plan_id: planId, item_name: name, change_type: "space_trim",
            detail: { trimmed: it.qty, remaining_pots: pots, note: "unplaced remainder cut on the Space map; projection restamped" },
            changed_by: "space-trim", source: "space-map" });
        } catch { /* audit must not block */ }
      }
      // ordered already? offer an amended order so the broker cuts the extras (8/20)
      try {
        const msgs = await amendOrdersForTrim(sb, planId, names);
        if (msgs.length) window.alert(msgs.join("\n"));
      } catch (e) { window.alert("Order-amendment check failed (the trim itself saved): " + e.message); }
      setTick(t => t + 1); setPlaceItem("");
    } catch (e) { window.alert("Trim failed: " + e.message); }
    setBusy(false);
  }

  async function clearBench(bench) {
    const info = byBench[bench.id];
    if (!info?.items?.length) return;
    const ids = info.items.flatMap(a => a.ids);
    const tot = info.items.reduce((a, x) => a + x.qty, 0);
    if (!window.confirm(`Clear ${bench.code}? All ${info.items.length} color${info.items.length !== 1 ? "s" : ""} (${tot.toLocaleString()} pots) go back to the to-place tray.`)) return;
    setBusy(true);
    const { error } = await sb.from("scheduled_crops").update({ placed_at: null }).in("id", ids);
    if (error) window.alert("Clear failed: " + error.message);
    setBusy(false); setTick(t => t + 1);
  }

  async function unplace(agg) {
    if (mode === "lastyear") return;
    if (!window.confirm(`Pull ${agg.name} (${agg.qty.toLocaleString()}) off this spot?`)) return;
    setBusy(true);
    await sb.from("scheduled_crops").update({ placed_at: null }).in("id", agg.ids);
    setBusy(false); setTick(t => t + 1);
  }

  const shelfSort = c => c.replace(/SH01$/, "00").replace(/SH02$/, "05");   // shelves flank the walls in walk order
  const benchOf = re => benches.filter(b => re.test(b.code) && !["basket_line", "low_line"].includes(b.bench_type) && (b.bench_type || b.cap_overrides)).sort((a, b) => shelfSort(a.code).localeCompare(shelfSort(b.code)));
  const basketLines = benches.filter(b => b.bench_type === "basket_line").sort((a, b) => a.code.localeCompare(b.code));
  const lowLines = benches.filter(b => b.bench_type === "low_line").sort((a, b) => a.code.localeCompare(b.code));

  const dropProps = b => ({
    onDragOver: e => e.preventDefault(),
    onDrop: e => { e.preventDefault(); const n = e.dataTransfer.getData("text/plain"); if (n && !busy) allocate(n, b); },
  });

  // ── a bench drawn as a bench: vertical column, capacity front and center ──
  const BenchCol = ({ b }) => {
    const k = capClassOf(cls);
    const cap = capOf(b, k);
    const info = byBench[b.id];
    const used = info?.byClass[k] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([x]) => x !== k).reduce((s, [, v]) => s + v, 0) : 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const blank = !info;
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dropProps(b)}
        style={{ flex: b.bench_type === "shelf" ? "0 1 88px" : "1 1 120px", minWidth: b.bench_type === "shelf" ? 76 : 110, maxWidth: b.bench_type === "shelf" ? 110 : 200, minHeight: 126, display: "flex", flexDirection: "column",
          background: blank ? "#fbfdf8" : (pct >= 1 || (usedOther > 0 && used === 0)) ? "#fbe3e0" : "#fdf6e3", border: `1.5px solid ${(pct >= 1 || (usedOther > 0 && used === 0)) ? C.red : C.border}`,
          borderRadius: 10, padding: "8px 9px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5 }}>{b.code}</b>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>{TYPE_LABEL[b.bench_type] || ""}</span>
          <span style={{ flex: 1 }} />
          {mode === "plan" && !!info?.items?.length && (
            <button onClick={e => { e.stopPropagation(); clearBench(b); }} title="clear the bench — everything goes back to the to-place tray"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 0 }}>🧹</button>
          )}
        </div>
        <div style={{ textAlign: "center", margin: "8px 0 2px" }}>
          {usedOther > 0 && used === 0 ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.red }}>IN USE</div>
              <div style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>other container</div>
            </>
          ) : cap != null ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>
                {blank ? cap.toLocaleString() : `${used}/${cap}`}
              </div>
              <div style={{ fontSize: 8.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>
                {blank ? (k === "tray45" ? "tight trays" : k === "tray45sp" ? "spaced trays" : CLASSES.find(([x]) => x === k)?.[1]) : `${cap - used} open`}
              </div>
              {usedOther > 0 && <div style={{ fontSize: 8.5, fontWeight: 800, color: C.amber }}>⚠ mixed containers</div>}
            </>
          ) : <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>no {CLASSES.find(([x]) => x === k)?.[1]} cap</div>}
        </div>
        {cap != null && !blank && (
          <div style={{ height: 5, background: "#e8ede3", borderRadius: 3, margin: "3px 0", overflow: "hidden" }}>
            <div style={{ width: `${pct * 100}%`, height: "100%", background: pct >= 1 ? C.red : pct > 0.7 ? C.amber : C.light }} />
          </div>
        )}
        <div style={{ flex: 1 }} />
        {(info?.items || []).map(a => (
          <div key={a.name} onClick={e => { e.stopPropagation(); setDrill({ bench: b, items: [a] }); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (a.rid) setFamOpen(a.rid); }}
            title="click: what's in this spot · right-click: open the family"
            style={{ fontSize: 9.5, cursor: mode === "plan" ? "pointer" : "default", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: mode === "lastyear" ? C.muted : C.dark }}>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{a.qty.toLocaleString()}</b> {a.name}
          </div>
        ))}
      </div>
    );
  };

  // ── wide bench card for the big houses (stacked vertically, walk down) ──
  const BenchWide = ({ b }) => {
    const k = capClassOf(cls);
    const cap = capOf(b, k);
    const info = byBench[b.id];
    const used = info?.byClass[k] || 0;
    const usedOther = info ? Object.entries(info.byClass).filter(([x]) => x !== k).reduce((s, [, v]) => s + v, 0) : 0;
    const pct = cap ? Math.min(1, used / cap) : 0;
    const blank = !info;
    return (
      <div onClick={() => placeItem && !busy && allocate(placeItem, b)} {...dropProps(b)}
        style={{ display: "flex", alignItems: "center", gap: 10, background: blank ? "#fbfdf8" : (pct >= 1 || (usedOther > 0 && used === 0)) ? "#fbe3e0" : "#fdf6e3",
          border: `1.5px solid ${(pct >= 1 || (usedOther > 0 && used === 0)) ? C.red : C.border}`, borderRadius: 9, padding: "7px 10px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ width: 74 }}>
          <b style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5 }}>{b.code}</b>
          <div style={{ fontSize: 9, fontWeight: 800, color: C.muted }}>
            {TYPE_LABEL[b.bench_type] || ""}
            {mode === "plan" && !!info?.items?.length && (
              <button onClick={e => { e.stopPropagation(); clearBench(b); }} title="clear the bench — everything back to the tray"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10.5, padding: 0, marginLeft: 4 }}>🧹</button>
            )}
          </div>
        </div>
        <div style={{ width: 92, textAlign: "right" }}>
          {usedOther > 0 && used === 0 ? (
            <>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.red }}>IN USE</span>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>other container</div>
            </>
          ) : cap != null ? (
            <>
              <span style={{ fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>
                {blank ? cap.toLocaleString() : `${used}/${cap}`}
              </span>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>
                {blank ? (k === "tray45" ? "tight" : k === "tray45sp" ? "spaced" : "cap") : `${cap - used} open`}{usedOther > 0 ? " · ⚠ mixed" : ""}
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
          {(info?.items || []).map(a => (
            <div key={a.name} onClick={e => { e.stopPropagation(); setDrill({ bench: b, items: [a] }); }}
              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (a.rid) setFamOpen(a.rid); }}
              title="click: what's in this spot · right-click: open the family"
              style={{ fontSize: 10, cursor: mode === "plan" ? "pointer" : "default", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: mode === "lastyear" ? C.muted : C.dark }}>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{a.qty.toLocaleString()}</b> {a.name}
            </div>
          ))}
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
      <div onClick={() => { if (placeItem && !busy) allocate(placeItem, b); else if (info?.items?.length) setDrill({ bench: b, items: info.items }); }} {...dropProps(b)}
        title={`${b.code} · ${used}/${cap ?? "?"}${info ? " — " + info.items.map(a => `${a.qty} ${a.name}`).join(", ") : " — empty"}${info ? " · click for details" : ""}`}
        style={{ width: 46, flex: "0 0 46px", textAlign: "center", background: blank ? "#fbfdf8" : pct >= 1 ? "#fbe3e0" : "#fdf6e3",
          border: `1.5px solid ${pct >= 1 ? C.red : C.border}`, borderRadius: 7, padding: "5px 2px", cursor: placeItem && mode === "plan" ? "copy" : "default" }}>
        <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 9, color: C.muted }}>
          {short}
          {mode === "plan" && !!info?.items?.length && (
            <span onClick={e => { e.stopPropagation(); clearBench(b); }} title="clear this line" style={{ cursor: "pointer", marginLeft: 3 }}>🧹</span>
          )}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: blank ? C.dark : pct >= 1 ? C.red : C.amber }}>{blank ? (cap ?? "?") : used}</div>
        {!blank && cap != null && <div style={{ fontSize: 8, color: C.muted }}>/{cap}</div>}
        {/* fixed line spacing — always shown; only same-size baskets land here */}
        <div style={{ fontSize: 8, fontWeight: 800, color: (b.cap_overrides?.hb_size || "10") === "10" ? C.muted : C.amber }}>{b.cap_overrides?.hb_size || "10"}"</div>
      </div>
    );
  };

  const poolList = Object.entries(unplaced)
    .filter(([, o]) => (cls === "qt"
      ? /^1 QT/.test(String(o.item).toUpperCase())
      : cls === "tray45" ? o.cls === "tray45" && !/^1 QT/.test(String(o.item).toUpperCase()) : o.cls === cls)
      && (!poolQ || o.item.toLowerCase().includes(poolQ.toLowerCase())))
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
          <option value="ALL">🗺 All houses — open space</option>
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
        <span style={{ display: "inline-flex", gap: 10, marginLeft: 4 }}>
          <Toggle k="baskets" label="🧺 baskets" /><Toggle k="benches" label="benches" /><Toggle k="lows" label="low lines" />
        </span>
        <button onClick={() => setTick(t => t + 1)} disabled={busy} title="refresh from the plan — picks up family-page edits"
          style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", fontWeight: 800, fontSize: 11.5, color: C.muted, cursor: "pointer", fontFamily: FONT }}>↻</button>
      </div>

      {houseKey === "ALL" ? (
        <AllHousesOverview sb={sb} planId={planId} rules={rules} cls={cls} onPick={k => setHouseKey(k)} tick={tick} />
      ) : (
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
                      title="shows the unplaced remainder first, then cuts it AND restamps the projection (family + walkthrough follow)"
                      style={{ padding: "3px 9px", borderRadius: 7, border: `1px solid ${C.red}`, background: "#fff", color: C.red, fontWeight: 800, fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>✂ Trim extra</button>
                  )}
                  {unplaced[placeItem]?.rid && (
                    <button disabled={busy} onClick={() => setFamOpen(unplaced[placeItem].rid)}
                      title="rework the quantities on the family page instead — trims there repopulate targets, orders and this tray"
                      style={{ padding: "3px 9px", borderRadius: 7, border: `1px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 10.5, cursor: "pointer", fontFamily: FONT }}>🌿 in family</button>
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
          {layers.benches && (house?.key === "BWS" ? (() => {
            // West Side as physically built: SN16–09 across from SS20–13, then the unmarked
            // pad (grow space, no bench code) across from SS12–09, so SN08–01 line up with SS08–01.
            const lbl = { fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 4 };
            const south = benchOf(/^BWSS/).slice().reverse();
            const north = benchOf(/^BWSN/).slice().reverse();
            const hi = north.filter(b => +b.code.slice(4) >= 9);
            const lo = north.filter(b => +b.code.slice(4) < 9);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px", marginBottom: 12 }}>
                <div style={{ ...lbl, gridColumn: 1, gridRow: 1 }}>South row — walk ↓</div>
                <div style={{ ...lbl, gridColumn: 2, gridRow: 1 }}>North row (09–16 ⅓) — walk ↓</div>
                {south.map((b, i) => <div key={b.id} style={{ gridColumn: 1, gridRow: i + 2 }}><BenchWide b={b} /></div>)}
                {hi.map((b, i) => <div key={b.id} style={{ gridColumn: 2, gridRow: i + 2 }}><BenchWide b={b} /></div>)}
                <div style={{ gridColumn: 2, gridRow: `${hi.length + 2} / span 4`, border: `1.5px dashed ${C.border}`, borderRadius: 9,
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 10.5, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: ".5px", background: "#fbfdf8" }}>
                  pad — unmarked grow space
                </div>
                {lo.map((b, i) => <div key={b.id} style={{ gridColumn: 2, gridRow: hi.length + 6 + i }}><BenchWide b={b} /></div>)}
              </div>
            );
          })() : house?.vertical ? (
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
      )}
      {drill && <DrillCard sb={sb} d={drill} mode={mode} onClose={() => setDrill(null)}
        onFamily={rid => { setDrill(null); setFamOpen(rid); }}
        onUnplace={async agg => { await unplace(agg); setDrill(null); }} />}
      {famOpen && (
        <FamilyPage plan={fixedPlan || plans.find(p => p.id === planId) || { id: planId }} recipeId={famOpen}
          onClose={() => { setFamOpen(null); setTick(t => t + 1); }} />
      )}
    </div>
  );
}
