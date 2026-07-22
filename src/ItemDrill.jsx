// ItemDrill — click an item in Sales vs Plan and get the whole story:
// full sales detail, cost and margin, timing you can change, the rounds it's
// grown in, and — if it's a combo — the components, editable.
//
// Component edits ARE plan edits (they change liner orders), written to
// scheduled_crops per-parent so every bench row stays proportional. Timing and
// quantity stay DECISIONS in plan_targets, applied by production later.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import { QuotePicker } from "./ProgramBuilder";

const C = { dark: "#1e2d1a", light: "#7fb069", border: "#dfe7d8", muted: "#7a8c74",
  text: "#2f3b2a", red: "#c0392b", amber: "#c98a2e", green: "#2e7d32" };
const money = n => n == null ? "—" : (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${(+n).toFixed(2)}`);
const pct = n => n == null ? "—" : `${Math.round(n * 100)}%`;

export default function ItemDrill({ plan, row, tgt, weeks, onSaveTarget, onClose }) {
  const sb = getSupabase();
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(tgt?.note || "");
  const [addSearch, setAddSearch] = useState("");
  const [addHits, setAddHits] = useState([]);

  async function load() {
    const { data: parents } = await sb.from("scheduled_crops")
      .select("id,bench_id,container_id,item_name,variety_id,qty_pots,ppp,pack_size,plant_week,plant_year,ship_week,ship_year,ready_week,ready_year,crop_weeks,prop_method,broker,supplier,liner_unit_cost,sale_price_per_pot")
      .eq("plan_id", plan.id).eq("item_name", row.item).eq("is_combo_component", false).gt("qty_pots", 0);
    const ids = (parents || []).map(p => p.id);
    let children = [];
    if (ids.length) {
      const { data: ch } = await sb.from("scheduled_crops")
        .select("id,combo_parent_id,variety_id,qty_plants_ordered,liner_unit_cost,broker,supplier")
        .in("combo_parent_id", ids);
      children = ch || [];
    }
    const vids = [...new Set([...children.map(c => c.variety_id), ...(parents || []).map(p => p.variety_id)].filter(Boolean))];
    let vmap = {};
    if (vids.length) {
      const { data: vs } = await sb.from("variety_library").select("id,crop_name,variety,variety_key").in("id", vids);
      (vs || []).forEach(v => { vmap[v.id] = v; });
    }
    const { data: pl } = await sb.from("v_scheduled_crops_pl")
      .select("id,direct_cost_total").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const costById = Object.fromEntries((pl || []).map(r => [r.id, +r.direct_cost_total || 0]));
    setDetail({ parents: parents || [], children, vmap, costById });
  }
  useEffect(() => { load(); }, [row.item]); // eslint-disable-line

  // component add: search the variety library (components need a real variety_id)
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = addSearch.trim();
      if (q.length < 3) { setAddHits([]); return; }
      const { data } = await sb.from("variety_library").select("id,crop_name,variety")
        .or(`variety.ilike.%${q}%,crop_name.ilike.%${q}%`).limit(12);
      setAddHits(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [addSearch]); // eslint-disable-line

  const agg = useMemo(() => {
    if (!detail) return null;
    const baskets = detail.parents.reduce((a, p) => a + (+p.qty_pots || 0), 0);
    const cost = detail.parents.reduce((a, p) => a + (detail.costById[p.id] || 0), 0)
      + detail.children.reduce((a, c) => a + (+c.qty_plants_ordered || 0) * (+c.liner_unit_cost || 0), 0);
    const comps = {};
    for (const ch of detail.children) {
      const v = detail.vmap[ch.variety_id];
      const k = ch.variety_id;
      const o = comps[k] || (comps[k] = { variety_id: k, label: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?",
        plants: 0, liner: +ch.liner_unit_cost || null, broker: ch.broker, supplier: ch.supplier });
      o.plants += +ch.qty_plants_ordered || 0;
      if (o.liner == null && ch.liner_unit_cost) o.liner = +ch.liner_unit_cost;
    }
    Object.values(comps).forEach(c => { c.per = baskets ? Math.round(c.plants / baskets * 10) / 10 : 0; });
    // what was actually bought for this item — variety, form, source, cost
    const matKeys = {};
    for (const p of detail.parents) {
      const v = detail.vmap[p.variety_id];
      const k = [v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?", p.prop_method, p.broker || p.supplier, p.liner_unit_cost].join("|");
      matKeys[k] = { variety: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?", prop: p.prop_method,
        variety_id: p.variety_id, vkey: v?.variety_key || null,
        broker: p.broker, supplier: p.supplier,
        src: [p.broker, p.supplier].filter(Boolean).join(" / "), cost: +p.liner_unit_cost || null };
    }
    // per-basket cost anatomy: container+soil vs plants — so a mix change shows
    // exactly what it does to the basket's cost
    const parentLinerCost = detail.parents.reduce((t, p) => t + (+p.qty_pots || 0) * (+p.ppp || 1) * (+p.liner_unit_cost || 0), 0);
    const containerCost = detail.parents.reduce((t, p) => t + (detail.costById[p.id] || 0), 0) - parentLinerCost;
    const childLinerCost = detail.children.reduce((t, c) => t + (+c.qty_plants_ordered || 0) * (+c.liner_unit_cost || 0), 0);
    const planPrice = Math.max(0, ...detail.parents.map(p => +p.sale_price_per_pot || 0)) || null;
    const ready = detail.parents.map(p => p.ready_week).filter(x => x != null);
    return { baskets, cost, costPer: baskets ? cost / baskets : null, materials: Object.values(matKeys),
      containerPer: baskets ? containerCost / baskets : null,
      plantsPer: baskets ? (parentLinerCost + childLinerCost) / baskets : null,
      planPrice,
      comps: Object.values(comps).sort((a, b) => b.plants - a.plants),
      readyMin: ready.length ? Math.min(...ready) : null };
  }, [detail]);

  // change a component's per-basket count across every bench row, proportionally
  async function setPer(variety_id, per) {
    if (!detail || busy) return;
    setBusy(true);
    try {
      for (const p of detail.parents) {
        const want = Math.round(per * (+p.qty_pots || 0));
        const existing = detail.children.filter(c => c.combo_parent_id === p.id && c.variety_id === variety_id);
        if (existing.length) {
          // put the whole quantity on the first row, zero the rest (rare)
          await sb.from("scheduled_crops").update({ qty_plants_ordered: want }).eq("id", existing[0].id);
          for (const extra of existing.slice(1)) await sb.from("scheduled_crops").update({ qty_plants_ordered: 0 }).eq("id", extra.id);
        } else if (want > 0) {
          await sb.from("scheduled_crops").insert({
            id: crypto.randomUUID(), plan_id: plan.id, item_name: p.item_name,
            variety_id, container_id: p.container_id, qty_pots: 0, ppp: 1,
            qty_plants_ordered: want, is_combo_component: true, combo_parent_id: p.id,
            plant_week: p.plant_week, plant_year: p.plant_year,
            ship_week: p.ship_week, ship_year: p.ship_year, status: "planned",
          });
        }
      }
      await load();
    } catch (e) { window.alert("Couldn't update component: " + (e.message || e)); }
    setBusy(false);
  }

  // Re-source a plant (parent or combo component) from the quote catalog.
  // Nothing writes until the confirm — the picker is a browse, the confirm is the save.
  const [quoteFor, setQuoteFor] = useState(null);   // {kind, variety_id, label, vkey, current}
  async function applyQuote(r) {
    const t = quoteFor; if (!t || !detail) return;
    const rows = t.kind === "component"
      ? detail.children.filter(c => c.variety_id === t.variety_id)
      : detail.parents.filter(p => p.variety_id === t.variety_id);
    const FORM_MAP = { urc: "URC", callused: "CALL", plug: "PLUG", liner: "PLUG", rooted: "PLUG", bareroot: "BULB", seed: "SEED" };
    const prop = FORM_MAP[String(r.form_class || "").toLowerCase()] || null;
    if (!window.confirm(`Source ${t.label} from ${[r.broker, r.supplier].filter(Boolean).join(" / ")}\n${r.form_class}${r.form_raw ? ` (${r.form_raw})` : ""} @ $${(+r.landed).toFixed(3)}/plant\n\nApplies to ${rows.length} plan row(s) — liner cost changes immediately.`)) return;
    setBusy(true);
    try {
      for (const x of rows) {
        await sb.from("scheduled_crops").update({
          liner_unit_cost: +r.landed, broker: r.broker, supplier: r.supplier,
          ...(t.kind === "parent" && prop ? { prop_method: prop } : {}),
        }).eq("id", x.id);
      }
      await load();
    } catch (e) { window.alert("Couldn't update sourcing: " + (e.message || e)); }
    setBusy(false);
    setQuoteFor(null);
  }

  // Add a component straight from a broker quote — the quote brings the variety,
  // the form, the source AND the price in one pick. Lands at 1/basket, adjust after.
  const [addQuote, setAddQuote] = useState(false);
  async function addComponentFromQuote(r) {
    setAddQuote(false);
    if (!detail || busy) return;
    const already = agg?.comps.find(c => detail.vmap[c.variety_id]?.variety_key && detail.vmap[c.variety_id].variety_key === r.variety_key);
    if (already) { window.alert(`${already.label} is already a component — adjust its per-basket count or click its sourcing to change the quote.`); return; }
    if (!window.confirm(`Add ${r.variety} at 1 per basket?\n\nSourced ${[r.broker, r.supplier].filter(Boolean).join(" / ")} — ${r.form_class}${r.form_raw ? ` (${r.form_raw})` : ""} @ $${(+r.landed).toFixed(3)}/plant.\nAdjust the per-basket count after.`)) return;
    setBusy(true);
    try {
      let vid = null;
      const { data: hit } = await sb.from("variety_library").select("id").eq("variety_key", r.variety_key).limit(1);
      if (hit && hit[0]) vid = hit[0].id;
      if (!vid) {
        vid = crypto.randomUUID();
        const { error: ve } = await sb.from("variety_library").insert({
          id: vid, crop_name: r.crop || null, variety: r.variety, variety_key: r.variety_key,
          notes: "created from a broker quote (combo component)" });
        if (ve) throw ve;
      }
      for (const p of detail.parents) {
        const want = Math.round(+p.qty_pots || 0);
        if (!want) continue;
        const { error } = await sb.from("scheduled_crops").insert({
          id: crypto.randomUUID(), plan_id: plan.id, item_name: p.item_name,
          variety_id: vid, container_id: p.container_id, qty_pots: 0, ppp: 1,
          qty_plants_ordered: want, is_combo_component: true, combo_parent_id: p.id,
          plant_week: p.plant_week, plant_year: p.plant_year,
          ship_week: p.ship_week, ship_year: p.ship_year, status: "planned",
          liner_unit_cost: +r.landed, broker: r.broker, supplier: r.supplier,
        });
        if (error) throw error;
      }
      await load();
    } catch (e) { window.alert("Couldn't add component: " + (e.message || e)); }
    setBusy(false);
  }

  async function removeComponent(variety_id) {
    if (!detail || busy) return;
    if (!window.confirm("Remove this component from every bench row of this item?")) return;
    setBusy(true);
    try {
      const ids = detail.children.filter(c => c.variety_id === variety_id).map(c => c.id);
      for (let i = 0; i < ids.length; i += 100) {
        await sb.from("scheduled_crops").delete().in("id", ids.slice(i, i + 100));
      }
      await load();
    } catch (e) { window.alert("Couldn't remove: " + (e.message || e)); }
    setBusy(false);
  }

  // remember the basket's cost as it was when the popup opened — mix edits then
  // read side by side: "was $6.16 → now $6.98"
  const baseline = useRef(null);
  useEffect(() => { baseline.current = null; }, [row.item]);
  useEffect(() => { if (agg && agg.costPer != null && baseline.current == null) baseline.current = agg.costPer; }, [agg]);

  const shift = tgt?.ready_shift || 0;
  const baseReady = agg?.readyMin ?? row.ship;
  const effReady = baseReady != null ? baseReady + shift : null;
  const spark = a => { if (!a) return null; const m = Math.max(...a) || 1; return a; };
  const curve = spark(row.wk);
  const maxC = curve ? Math.max(...curve, 1) : 1;
  const saleIdx = curve ? curve.map((u, i) => u > 0 ? i : -1).filter(i => i >= 0) : [];
  const firstWk = saleIdx.length ? weeks[saleIdx[0]] : null;
  const lastWk = saleIdx.length ? weeks[saleIdx[saleIdx.length - 1]] : null;
  const weeksSelling = firstWk != null ? lastWk - firstWk + 1 : null;
  const pace = weeksSelling ? Math.round(row.sold / weeksSelling) : null;
  const gm = agg && row.rev ? (row.rev - agg.cost) / row.rev : null;

  const Stat = ({ l, v, sub, accent }) => (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "8px 12px", minWidth: 104 }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 800, textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent || C.dark }}>{v}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );
  const chip = { padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff",
    color: C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9200, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", width: "min(760px, 94vw)", maxHeight: "92vh", overflow: "auto", padding: 20, borderRadius: 14, boxShadow: "0 14px 48px rgba(0,0,0,.35)", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>{row.item}</div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {detail ? `${detail.parents.length} bench row${detail.parents.length !== 1 ? "s" : ""}` : "…"}
              {agg?.comps.length ? ` · combo, ${agg.comps.length} components` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, color: C.muted, cursor: "pointer" }}>×</button>
        </div>

        {/* sales story */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <Stat l="Planned" v={row.planned.toLocaleString()} />
          <Stat l="Sold 2026" v={row.sold.toLocaleString()} sub={pace ? `~${pace}/wk over ${weeksSelling} wks` : null} />
          <Stat l="Sell-through" v={pct(row.st)} accent={row.st == null ? C.muted : row.st >= 0.95 ? C.green : row.st < 0.6 ? C.red : C.dark} />
          <Stat l="Avg price" v={row.sold && row.rev ? money(row.rev / row.sold) : "—"} />
          <Stat l="2026 revenue" v={money(row.rev)} />
          <Stat l="Direct cost" v={agg ? money(agg.cost) : "…"} sub={agg?.costPer != null ? `${money(agg.costPer)} each` : null} />
          <Stat l="Direct margin" v={pct(gm)} accent={C.green} />
          <Stat l="Sold" v={firstWk ? `wk${firstWk}–${lastWk}` : "—"} sub={row.peak ? `peak wk${row.peak}` : null} />
        </div>

        {curve && curve.some(x => x > 0) && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 7 }}>Weekly sales, 2026</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 76 }}>
              {curve.map((v, i) => (
                <div key={i} title={`wk${weeks[i]}: ${v.toLocaleString()}`}
                  style={{ flex: 1, height: Math.max(2, v / maxC * 70), borderRadius: "2px 2px 0 0",
                    background: weeks[i] === row.peak ? C.dark : effReady != null && weeks[i] < effReady ? "#d9c9a3" : C.light }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
              {weeks.map(w => <div key={w} style={{ flex: 1, fontSize: 8.5, color: w === effReady ? C.dark : C.muted, fontWeight: w === effReady ? 800 : 400, textAlign: "center" }}>{w}</div>)}
            </div>
            {effReady != null && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>tan bars = demand before the wk{effReady} finish{shift ? " (after your move)" : ""}</div>}
          </div>
        )}

        {/* decisions: quantity + timing */}
        <div style={{ background: "#eef6e8", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: "11px 13px", marginTop: 12 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "#3f6d33", textTransform: "uppercase", marginBottom: 7 }}>2027 decisions</div>
          {agg && agg.materials.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.text, marginBottom: 8 }}>
              🌱 <b>Bought:</b> {agg.materials.map((m, i) => {
                const text = <>{m.variety}{m.prop ? ` — ${m.prop}` : ""}{m.cost != null ? ` @ ${money(m.cost)}/plant` : ""}{m.src ? ` (${m.src})` : ""}</>;
                // a combo's parent row isn't a plant anyone buys — its components
                // carry the sourcing, each clickable below
                return <span key={i}>{i > 0 ? " · " : ""}
                  {agg.comps.length ? <span>{text}</span>
                    : <span onClick={() => setQuoteFor({ kind: "parent", variety_id: m.variety_id, label: m.variety, vkey: m.vkey,
                          current: { variety: m.variety, broker: m.broker, supplier: m.supplier, landed: m.cost } })}
                        title="view quotes / change sourcing"
                        style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
                        {text}
                      </span>}
                </span>;
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5 }}>Target:</span>
              <input
                key={tgt?.target_units ?? "empty"}
                defaultValue={tgt?.target_units ?? ""}
                placeholder={String(row.planned)}
                inputMode="numeric"
                onBlur={e => {
                  const t = e.target.value.trim();
                  if (t === String(tgt?.target_units ?? "")) return;          // untouched
                  if (t === "") {
                    if (tgt?.target_units == null) return;                    // empty→empty no-op
                    onSaveTarget({ target_units: null, decision: null }); return;
                  }
                  const n = Math.max(0, Math.round(+t.replace(/[^0-9.]/g, "")));
                  if (!isNaN(n)) onSaveTarget({ target_units: n, decision: n === 0 ? "drop" : n > row.planned ? "grow" : n < row.planned ? "cut" : "hold" });
                }}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ width: 84, padding: "6px 8px", textAlign: "right", borderRadius: 8, fontSize: 14, fontWeight: 700,
                  fontFamily: "inherit", border: `1.5px solid ${tgt?.target_units != null ? C.light : C.border}` }} />
              {[-20, -10, 10, 20].map(pd => (
                <button key={pd} style={{ ...chip, color: pd < 0 ? C.red : C.green }}
                  title={`${pd > 0 ? "+" : ""}${pd}% of planned (${row.planned.toLocaleString()})`}
                  onClick={() => { const n = Math.max(0, Math.round(row.planned * (1 + pd / 100))); onSaveTarget({ target_units: n, decision: n > row.planned ? "grow" : n < row.planned ? "cut" : "hold" }); }}>
                  {pd > 0 ? "+" : ""}{pd}%
                </button>
              ))}
              <button style={chip} onClick={() => onSaveTarget({ target_units: row.planned, decision: "hold" })}>same</button>
              {row.sold > 0 && <button style={chip} onClick={() => onSaveTarget({ target_units: row.sold, decision: row.sold > row.planned ? "grow" : row.sold < row.planned ? "cut" : "hold" })}>=sold</button>}
              <button style={{ ...chip, color: C.red }} onClick={() => onSaveTarget({ target_units: 0, decision: "drop" })}>drop</button>
            </div>
            {baseReady != null && (
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 12.5 }}>Finish:</span>
                <button style={chip} onClick={() => onSaveTarget({ ready_shift: (shift - 1) === 0 ? null : shift - 1 })}>◀</button>
                <b style={{ fontSize: 14, color: shift < 0 ? C.green : shift > 0 ? C.amber : C.text }}>wk{effReady}{shift ? ` (${shift > 0 ? "+" : ""}${shift})` : ""}</b>
                <button style={chip} onClick={() => onSaveTarget({ ready_shift: (shift + 1) === 0 ? null : shift + 1 })}>▶</button>
                {shift !== 0 && <button style={{ ...chip, border: "none", color: C.red }} onClick={() => onSaveTarget({ ready_shift: null })}>×</button>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <input value={note} onChange={e => setNote(e.target.value)} onBlur={() => { if ((note.trim() || null) !== (tgt?.note ?? null)) onSaveTarget({ note: note.trim() || null }); }}
              placeholder="note from the room — why this decision…"
              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit" }} />
          </div>
        </div>

        {/* rounds */}
        {detail && detail.parents.length > 0 && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Rounds & benches</div>
            {detail.parents.sort((a, b) => (a.plant_week || 0) - (b.plant_week || 0)).map(p => (
              <div key={p.id} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{p.bench_id || "—"}</span>
                <span>{(+p.qty_pots).toLocaleString()} × ppp {p.ppp}</span>
                <span style={{ color: C.muted }}>plant wk{p.plant_week}/{String(p.plant_year).slice(2)} → ready wk{p.ready_week ?? "?"}</span>
                <span style={{ color: C.muted, marginLeft: "auto" }}>{[p.prop_method, p.broker || p.supplier].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        )}

        {/* combo components — editable */}
        {agg && agg.comps.length > 0 && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>
              Components {busy && <span style={{ color: C.amber }}>· saving…</span>}
            </div>
            {agg.costPer != null && (() => {
              const was = baseline.current, now = agg.costPer;
              const changed = was != null && Math.abs(now - was) > 0.005;
              const price = agg.planPrice || row.price || null;
              const gmOf = c => price ? (price - c) / price : null;
              return (
                <div style={{ background: changed ? "#fdf7ec" : "#f4f7f1", border: `1.5px solid ${changed ? C.amber : C.border}`, borderRadius: 9, padding: "9px 12px", marginBottom: 9 }}>
                  <div style={{ fontSize: 12.5, color: C.text }}>
                    💰 <b>Cost per basket:</b> container + soil {money(agg.containerPer)} · plants {money(agg.plantsPer)} ={" "}
                    {changed ? (
                      <span>
                        <span style={{ textDecoration: "line-through", color: C.muted }}>{money(was)}</span>
                        {" → "}<b style={{ color: now > was ? C.red : C.green, fontSize: 14 }}>{money(now)}</b>
                        <b style={{ color: now > was ? C.red : C.green }}> ({now > was ? "+" : "−"}{money(Math.abs(now - was))})</b>
                      </span>
                    ) : <b style={{ fontSize: 14 }}>{money(now)}</b>}
                  </div>
                  {price && (
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                      Margin @ {money(price)}:{" "}
                      {changed && <span><span style={{ textDecoration: "line-through" }}>{pct(gmOf(was))}</span>{" → "}</span>}
                      <b style={{ color: gmOf(now) != null && gmOf(now) < 0.7 ? C.red : C.green }}>{pct(gmOf(now))}</b>
                      <span> direct (no labour)</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {agg.comps.map(c => (
              <div key={c.variety_id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12.5, flexWrap: "wrap" }}>
                <b style={{ flex: 1, minWidth: 140 }}>{c.label}</b>
                <label style={{ color: C.muted, fontSize: 11.5 }}>per basket
                  <input defaultValue={c.per} inputMode="decimal" disabled={busy}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== c.per) setPer(c.variety_id, Math.max(0, v)); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ width: 52, marginLeft: 5, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit" }} />
                </label>
                <span onClick={() => setQuoteFor({ kind: "component", variety_id: c.variety_id, label: c.label,
                    vkey: detail?.vmap[c.variety_id]?.variety_key || null,
                    current: { variety: c.label, broker: c.broker, supplier: c.supplier, landed: c.liner } })}
                  title="view quotes / change sourcing"
                  style={{ color: C.muted, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
                  {c.plants.toLocaleString()} plants{c.liner != null ? ` @ ${money(c.liner)}` : ""}{(c.broker || c.supplier) ? ` (${[c.broker, c.supplier].filter(Boolean).join(" / ")})` : ""}
                </span>
                <button disabled={busy} onClick={() => removeComponent(c.variety_id)}
                  style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800, fontSize: 15 }}>×</button>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 8, paddingTop: 8 }}>
              <button disabled={busy} onClick={() => setAddQuote(true)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 6 }}>
                ＋ Add a component — search the broker catalog
              </button>
              <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="…or search the variety library (in-house / no quote needed)"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit", boxSizing: "border-box" }} />
              {addHits.length > 0 && (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 160, overflow: "auto" }}>
                  {addHits.map(h => (
                    <div key={h.id} onClick={() => { setPer(h.id, 1); setAddSearch(""); setAddHits([]); }}
                      style={{ padding: "6px 10px", fontSize: 12.5, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      <b>{h.crop_name}</b> {h.variety} <span style={{ color: C.muted, fontSize: 11 }}>— adds at 1 per basket, adjust after</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.amber, marginTop: 7 }}>
              ⚠ Component edits change the plan (liner orders) immediately — quantity/timing above stay decisions for production to apply.
            </div>
          </div>
        )}
      </div>
      {quoteFor && <QuotePicker sb={sb} varietyKey={quoteFor.vkey} initialQuery={quoteFor.label}
        current={quoteFor.current} onPick={applyQuote} onClose={() => setQuoteFor(null)} />}
      {addQuote && <QuotePicker sb={sb} varietyKey={null} initialQuery=""
        onPick={addComponentFromQuote} onClose={() => setAddQuote(false)} />}
    </div>
  );
}
