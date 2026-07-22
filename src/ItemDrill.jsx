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
import { BasketDesigner } from "./ProductionPlans";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", border: "#dfe7d8", muted: "#7a8c74",
  text: "#2f3b2a", red: "#c0392b", amber: "#c98a2e", green: "#2e7d32" };
const money = n => n == null ? "—" : (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${(+n).toFixed(2)}`);
const pct = n => n == null ? "—" : `${Math.round(n * 100)}%`;
const FORM_MAP = { urc: "URC", callused: "CALL", plug: "PLUG", liner: "PLUG", rooted: "PLUG", bareroot: "BULB", seed: "SEED" };

export default function ItemDrill({ plan, row, tgt, weeks, onSaveTarget, onClose }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(tgt?.note || "");
  const [addSearch, setAddSearch] = useState("");
  const [addHits, setAddHits] = useState([]);
  const [view, setView] = useState("detail");   // detail | history
  const [history, setHistory] = useState(null);

  // every change is a record — the History tab and the order-confirmation sync both read this
  async function logChange(change_type, detail_obj, variety_key = null) {
    try {
      await sb.from("item_change_log").insert({
        plan_id: plan.id, item_name: row.item, variety_key,
        change_type, detail: detail_obj, changed_by: displayName || null, source: "drill",
      });
    } catch { /* history must never block the edit itself */ }
  }
  useEffect(() => {
    if (view !== "history") return;
    (async () => {
      const { data } = await sb.from("item_change_log").select("*")
        .eq("plan_id", plan.id).eq("item_name", row.item)
        .order("changed_at", { ascending: false }).limit(200);
      setHistory(data || []);
    })();
  }, [view, row.item]); // eslint-disable-line

  async function load() {
    const { data: parents } = await sb.from("scheduled_crops")
      .select("id,bench_id,container_id,item_name,variety_id,qty_pots,ppp,pack_size,plant_week,plant_year,ship_week,ship_year,ready_week,ready_year,crop_weeks,prop_method,prop_tray_id,broker,supplier,liner_unit_cost,sale_price_per_pot,planting_layout")
      .eq("plan_id", plan.id).eq("item_name", row.item).eq("is_combo_component", false).gt("qty_pots", 0);
    const ids = (parents || []).map(p => p.id);
    let children = [];
    if (ids.length) {
      const { data: ch } = await sb.from("scheduled_crops")
        .select("id,combo_parent_id,variety_id,qty_plants_ordered,liner_unit_cost,broker,supplier,prop_method,prop_tray_id")
        .in("combo_parent_id", ids);
      children = ch || [];
    }
    // prop cost inputs: plug trays + the sticking rate
    const [trayRes, csRes] = await Promise.all([
      sb.from("containers").select("id,name,cost_per_unit,cells_per_flat").not("cells_per_flat", "is", null).ilike("name", "%plug%"),
      sb.from("cost_settings").select("value").eq("key", "urc_stick_cost"),
    ]);
    const trays = (trayRes.data || []).filter(t => +t.cost_per_unit > 0);
    const defaultTray = trays.find(t => /105/.test(t.name)) || null;
    const stick = +(csRes.data?.[0]?.value) || 0;
    const vids = [...new Set([...children.map(c => c.variety_id), ...(parents || []).map(p => p.variety_id)].filter(Boolean))];
    let vmap = {};
    if (vids.length) {
      const { data: vs } = await sb.from("variety_library").select("id,crop_name,variety,variety_key").in("id", vids);
      (vs || []).forEach(v => { vmap[v.id] = v; });
    }
    const { data: pl } = await sb.from("v_scheduled_crops_pl")
      .select("id,direct_cost_total").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const costById = Object.fromEntries((pl || []).map(r => [r.id, +r.direct_cost_total || 0]));
    // bench ids → human labels (zone + bench code), not raw uuids
    const bids = [...new Set((parents || []).map(p => p.bench_id).filter(Boolean))];
    let bmap = {};
    if (bids.length) {
      const { data: bs } = await sb.from("benches").select("id,code,zone_label,position").in("id", bids);
      (bs || []).forEach(b => { bmap[b.id] = b; });
    }
    setDetail({ parents: parents || [], children, vmap, costById, bmap, trays, defaultTray, stick });
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
    // per-plant prop add-on for a cutting: sticking labor + its tray's per-cell share
    const propOf = ch => {
      if (!["URC", "CALL"].includes(ch.prop_method)) return 0;
      const tray = detail.trays?.find(t => t.id === ch.prop_tray_id) || detail.defaultTray;
      return (detail.stick || 0) + (tray ? +tray.cost_per_unit / (+tray.cells_per_flat || 1) : 0);
    };
    const cost = detail.parents.reduce((a, p) => a + (detail.costById[p.id] || 0), 0)
      + detail.children.reduce((a, c) => a + (+c.qty_plants_ordered || 0) * ((+c.liner_unit_cost || 0) + propOf(c)), 0);
    const comps = {};
    for (const ch of detail.children) {
      const v = detail.vmap[ch.variety_id];
      const k = ch.variety_id;
      const o = comps[k] || (comps[k] = { variety_id: k, label: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?",
        plants: 0, liner: +ch.liner_unit_cost || null, broker: ch.broker, supplier: ch.supplier,
        prop_method: ch.prop_method, prop_tray_id: ch.prop_tray_id, propPer: propOf(ch) });
      o.plants += +ch.qty_plants_ordered || 0;
      if (o.liner == null && ch.liner_unit_cost) o.liner = +ch.liner_unit_cost;
    }
    Object.values(comps).forEach(c => { c.per = baskets ? Math.round(c.plants / baskets * 10) / 10 : 0; });
    // what was actually bought for this item — variety, form, source, cost
    const matKeys = {};
    for (const p of detail.parents) {
      const v = detail.vmap[p.variety_id];
      const k = [v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?", p.prop_method, p.broker || p.supplier, p.liner_unit_cost].join("|");
      const e = matKeys[k] || (matKeys[k] = { variety: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : "?", prop: p.prop_method,
        variety_id: p.variety_id, vkey: v?.variety_key || null,
        broker: p.broker, supplier: p.supplier, plants: 0,
        prop_method: p.prop_method, prop_tray_id: p.prop_tray_id, propPer: propOf(p),
        src: [p.broker, p.supplier].filter(Boolean).join(" / "), cost: +p.liner_unit_cost || null });
      e.plants += (+p.qty_pots || 0) * (+p.ppp || 1);
    }
    // per-basket cost anatomy: container+soil vs plants — so a mix change shows
    // exactly what it does to the basket's cost
    const parentLinerCost = detail.parents.reduce((t, p) => t + (+p.qty_pots || 0) * (+p.ppp || 1) * (+p.liner_unit_cost || 0), 0);
    const containerCost = detail.parents.reduce((t, p) => t + (detail.costById[p.id] || 0), 0) - parentLinerCost;
    const childLinerCost = detail.children.reduce((t, c) => t + (+c.qty_plants_ordered || 0) * ((+c.liner_unit_cost || 0) + propOf(c)), 0);
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
      const v = detail.vmap[variety_id];
      await logChange("component_qty", {
        plant: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : variety_id,
        per_basket: per,
      }, v?.variety_key || null);
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
    const prop = FORM_MAP[String(r.form_class || "").toLowerCase()] || null;
    if (!window.confirm(`Source ${t.label} from ${[r.broker, r.supplier].filter(Boolean).join(" / ")}\n${r.form_class}${r.form_raw ? ` (${r.form_raw})` : ""} @ $${(+r.landed).toFixed(3)}/plant\n\nApplies to ${rows.length} plan row(s) — liner cost changes immediately.`)) return;
    setBusy(true);
    try {
      for (const x of rows) {
        await sb.from("scheduled_crops").update({
          liner_unit_cost: +r.landed, broker: r.broker, supplier: r.supplier,
          ...(prop ? { prop_method: prop, prop_method_source: "recorded" } : {}),
        }).eq("id", x.id);
      }
      const w0 = rows[0] || {};
      await logChange("sourcing_change", {
        plant: t.label, kind: t.kind, rows: rows.length,
        before: { broker: w0.broker, supplier: w0.supplier, landed: +w0.liner_unit_cost || null },
        after: { broker: r.broker, supplier: r.supplier, landed: +r.landed, form: r.form_class, form_raw: r.form_raw },
      }, r.variety_key);
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
          prop_method: FORM_MAP[String(r.form_class || "").toLowerCase()] || null,
        });
        if (error) throw error;
      }
      await logChange("component_added", {
        plant: r.variety, per_basket: 1,
        sourcing: { broker: r.broker, supplier: r.supplier, form: r.form_class, form_raw: r.form_raw, landed: +r.landed },
      }, r.variety_key);
      await load();
    } catch (e) { window.alert("Couldn't add component: " + (e.message || e)); }
    setBusy(false);
  }

  // Arrange the basket right here — same drag-to-place designer as the combo
  // gallery, saved to every bench row of the item.
  const [arranging, setArranging] = useState(false);
  async function saveLayout(l) {
    try {
      const { data } = await sb.from("scheduled_crops").update({ planting_layout: l })
        .eq("item_name", row.item).eq("plan_id", plan.id).eq("is_combo_component", false).select("id");
      await logChange("layout_arranged", { plants: (l.plants || []).length ? l.plants : undefined, dots: (l.dots || []).length, rows: data?.length || 0 });
      setArranging(false);
      await load();
    } catch (e) { window.alert("Couldn't save layout: " + (e.message || e)); }
  }

  // Milestone: this item is DECIDED for the season. One log line that says so,
  // with the recipe (combo) or the planting spec (monoculture) snapshotted.
  async function setForSeason() {
    if (!agg) return;
    const isCombo = agg.comps.length > 0;
    const recipe = isCombo
      ? agg.comps.map(c => ({ plant: c.label, per_basket: c.per, landed: c.liner, broker: c.broker, supplier: c.supplier }))
      : agg.materials.map(m => ({ plant: m.variety, per_basket: Math.max(...detail.parents.map(p => +p.ppp || 1)), landed: m.cost, broker: m.broker, supplier: m.supplier }));
    if (!window.confirm(`Set this ${isCombo ? "combo" : "item"} for ${plan.name}?\n\n${recipe.map(r => `${r.per_basket}× ${r.plant}`).join("\n")}\n\nLogs it as decided — anything edited after this stays visible in history.`)) return;
    await logChange("combo_set", { season: plan.name, kind: isCombo ? "combo" : "item", recipe, cost_per_basket: agg.costPer != null ? +agg.costPer.toFixed(2) : null });
    if (view === "history") setView("detail"); setView("history");
  }

  // Plants per pot on a monoculture item — a plan edit exactly like a combo's
  // per-basket count: liner orders change immediately, and it's logged.
  async function setPpp(n) {
    if (!detail || busy || !(n > 0)) return;
    setBusy(true);
    try {
      for (const p of detail.parents) {
        if (+p.ppp !== n) await sb.from("scheduled_crops").update({ ppp: n }).eq("id", p.id);
      }
      const m = agg?.materials[0];
      await logChange("ppp_change", { plant: m?.variety || row.item, ppp: n }, m?.vkey || null);
      await load();
    } catch (e) { window.alert("Couldn't change plants/pot: " + (e.message || e)); }
    setBusy(false);
  }

  // Which tray a cutting roots in — 105s by default, 50s for the heavy stuff.
  async function setTray(variety_id, tray_id, kind = "component") {
    if (!detail || busy) return;
    setBusy(true);
    try {
      const ids = (kind === "parent" ? detail.parents : detail.children)
        .filter(c => c.variety_id === variety_id).map(c => c.id);
      for (let i = 0; i < ids.length; i += 100) {
        await sb.from("scheduled_crops").update({ prop_tray_id: tray_id || null }).in("id", ids.slice(i, i + 100));
      }
      const v = detail.vmap[variety_id];
      const tray = detail.trays.find(t => t.id === tray_id);
      await logChange("prop_tray", {
        plant: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : variety_id,
        tray: tray ? tray.name : "105 (default)",
      }, v?.variety_key || null);
      await load();
    } catch (e) { window.alert("Couldn't change tray: " + (e.message || e)); }
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
      const v = detail.vmap[variety_id];
      await logChange("component_removed", {
        plant: v ? `${v.crop_name || ""} ${v.variety || ""}`.trim() : variety_id, rows: ids.length,
      }, v?.variety_key || null);
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

  // Divide the projection total into k planting rounds, each covering an equal
  // slice of the 2026 sales volume — the round's finish week is where its slice
  // of demand started. No sales history → even split, two weeks apart.
  function salesSplit(k) {
    const total = tgt?.target_units ?? row.planned;
    const wk = row.wk || [], salesTot = wk.reduce((a, b) => a + b, 0);
    if (!salesTot || !weeks?.length) {
      const per = Math.floor(total / k);
      return Array.from({ length: k }, (_, i) => ({
        units: i === k - 1 ? total - per * (k - 1) : per,
        ready_week: (baseReady ?? weeks?.[0] ?? 14) + i * 2,
      }));
    }
    const out = []; let seg = 0, segStart = 0, used = 0;
    for (let i = 0; i < wk.length; i++) {
      seg += wk[i];
      if (out.length < k - 1 && seg >= salesTot / k && i < wk.length - 1) {
        const u = Math.round(total * seg / salesTot);
        out.push({ units: u, ready_week: weeks[segStart] });
        used += u; segStart = i + 1; seg = 0;
      }
    }
    out.push({ units: total - used, ready_week: weeks[segStart] });
    return out;
  }
  function saveRounds(rounds) {
    onSaveTarget({ rounds });
    logChange("rounds_set", rounds?.length
      ? { rounds: rounds.map(r => ({ units: r.units, ready_week: r.ready_week })) }
      : { rounds: null, note: "back to one batch" });
  }
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
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[["detail", "Details"], ["history", "🕘 History"]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)}
                style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  border: `1.5px solid ${view === k ? C.light : C.border}`, background: view === k ? C.light : "#fff", color: view === k ? "#fff" : C.muted }}>{l}</button>
            ))}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 26, color: C.muted, cursor: "pointer" }}>×</button>
          </div>
        </div>

        {view === "history" && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>Change history</div>
            {history === null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>
            : !history.length ? <div style={{ color: C.muted, fontSize: 13 }}>No recorded changes yet — edits from here on land in this log, and order confirmations will file here when they're imported.</div>
            : history.map(h => {
                const d = h.detail || {};
                const when = new Date(h.changed_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                const line =
                  h.change_type === "sourcing_change" ? `${d.plant}: ${[d.before?.broker, d.before?.supplier].filter(Boolean).join("/") || "?"} @ ${d.before?.landed != null ? money(+d.before.landed) : "?"} → ${[d.after?.broker, d.after?.supplier].filter(Boolean).join("/")} ${d.after?.form || ""}${d.after?.form_raw ? ` (${d.after.form_raw})` : ""} @ ${money(+d.after?.landed)}`
                  : h.change_type === "component_qty" ? `${d.plant} set to ${d.per_basket}/basket`
                  : h.change_type === "component_added" ? `added ${d.plant} at ${d.per_basket}/basket — ${[d.sourcing?.broker, d.sourcing?.supplier].filter(Boolean).join("/")} @ ${money(+d.sourcing?.landed)}`
                  : h.change_type === "component_removed" ? `removed ${d.plant}`
                  : h.change_type === "prop_tray" ? `${d.plant} now sticks in ${d.tray}`
                  : h.change_type === "ppp_change" ? `${d.plant} set to ${d.ppp} plants/pot`
                  : h.change_type === "rounds_set" ? (d.rounds ? `split into ${d.rounds.length} rounds — ${d.rounds.map(r => `${(+r.units).toLocaleString()} @ wk${r.ready_week}`).join(", ")}` : "rounds removed — back to one batch")
                  : h.change_type === "combo_set" ? `✓ ${d.kind === "item" ? "item" : "combo"} SET for ${d.season} — ${(d.recipe || []).map(r => `${r.per_basket}× ${r.plant}`).join(", ")}${d.cost_per_basket != null ? ` (${money(d.cost_per_basket)}/unit)` : ""}`
                  : h.change_type === "layout_arranged" ? `planting layout arranged (${d.dots || "?"} plants placed${d.rows ? `, ${d.rows} bench rows` : ""})`
                  : h.change_type === "order_confirmation" ? `order confirmation: ${d.summary || JSON.stringify(d)}`
                  : JSON.stringify(d);
                return (
                  <div key={h.id} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.muted, minWidth: 108, whiteSpace: "nowrap" }}>{when}</span>
                    <span style={{ flex: 1 }}>{line}</span>
                    <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{[h.changed_by, h.source !== "drill" ? h.source : null].filter(Boolean).join(" · ")}</span>
                  </div>
                );
              })}
          </div>
        )}

        {view !== "history" && <>
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#3f6d33", textTransform: "uppercase" }}>2027 decisions</span>
            {agg && (agg.comps.length > 0 || detail?.parents.some(p => +p.ppp > 1)) && (
              <button onClick={() => setArranging(true)} title="drag-to-place planting layout"
                style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                ✏️ Arrange{detail?.parents.some(p => p.planting_layout) ? "" : " (no layout yet)"}
              </button>
            )}
            {agg && (
              <button onClick={setForSeason} style={{ marginLeft: agg.comps.length > 0 || detail?.parents.some(p => +p.ppp > 1) ? 0 : "auto", padding: "5px 12px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                ✓ Set for {plan.name}
              </button>
            )}
          </div>
          {agg && agg.materials.length > 0 && (
            <div style={{ fontSize: 12.5, color: C.text, marginBottom: 8 }}>
              🌱 <b>Item:</b> {agg.materials.map(m => m.variety).join(" · ")}
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

          {/* planting rounds — one total in the projection, split into waves with their
              own finish dates. Auto-split follows the 2026 weekly sales curve. */}
          <div style={{ marginTop: 9 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5 }}>Rounds:</span>
              {!(tgt?.rounds?.length) ? <>
                <span style={{ fontSize: 11.5, color: C.muted }}>plants as one batch</span>
                <button style={chip} onClick={() => saveRounds(salesSplit(2))}>＋ split into rounds</button>
              </> : <>
                <button style={chip} title="re-divide the current number of rounds by the 2026 weekly sales curve"
                  onClick={() => saveRounds(salesSplit(tgt.rounds.length))}>↻ re-split by sales</button>
                <button style={chip} onClick={() => saveRounds([...tgt.rounds, { units: 0, ready_week: (tgt.rounds[tgt.rounds.length - 1]?.ready_week ?? effReady ?? 14) + 2 }])}>＋ add round</button>
                <button style={{ ...chip, border: "none", color: C.red }} onClick={() => saveRounds(null)}>× back to one batch</button>
                {(() => {
                  const sum = tgt.rounds.reduce((a, r) => a + (+r.units || 0), 0);
                  const total = tgt?.target_units ?? row.planned;
                  return sum !== total
                    ? <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 700 }}>rounds total {sum.toLocaleString()} ≠ {total.toLocaleString()} target (Δ{(sum - total).toLocaleString()})</span>
                    : <span style={{ fontSize: 11.5, color: C.green, fontWeight: 700 }}>✓ matches target</span>;
                })()}
              </>}
            </div>
            {(tgt?.rounds || []).map((r, i) => {
              const next = tgt.rounds[i + 1];
              const sold = (row.wk || []).reduce((s, u, j) => s + (weeks[j] >= r.ready_week && (next == null || weeks[j] < next.ready_week) ? u : 0), 0);
              const patch = (p) => saveRounds(tgt.rounds.map((x, j) => j === i ? { ...x, ...p } : x));
              return (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "center", padding: "3px 0 0 14px", fontSize: 12.5, flexWrap: "wrap" }}>
                  <span style={{ color: C.muted, fontWeight: 800, fontSize: 11 }}>R{i + 1}</span>
                  <input defaultValue={r.units} key={`u${i}-${r.units}`} inputMode="numeric"
                    onBlur={e => { const v = parseInt(e.target.value.replace(/\D/g, "")); if (!isNaN(v) && v !== r.units) patch({ units: v }); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ width: 62, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit" }} />
                  <span style={{ fontSize: 11.5, color: C.muted }}>finish</span>
                  <button style={chip} onClick={() => patch({ ready_week: r.ready_week - 1 })}>◀</button>
                  <b>wk{r.ready_week}</b>
                  <button style={chip} onClick={() => patch({ ready_week: r.ready_week + 1 })}>▶</button>
                  <span style={{ fontSize: 11, color: C.muted }} title="what 2026 actually sold in this round's window">
                    2026 sold {sold.toLocaleString()} in wk{r.ready_week}{next ? `–${next.ready_week - 1}` : "+"}
                  </span>
                  {tgt.rounds.length > 1 && <button onClick={() => saveRounds(tgt.rounds.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800 }}>×</button>}
                </div>
              );
            })}
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
            {detail.parents.sort((a, b) => (a.plant_week || 0) - (b.plant_week || 0)).map(p => {
              const b = detail.bmap?.[p.bench_id];
              return (
              <div key={p.id} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }} title={p.bench_id || ""}>
                  {b ? <>{b.zone_label} · <span style={{ fontFamily: "monospace" }}>{b.code}</span>{b.position != null ? <span style={{ color: C.muted, fontWeight: 400 }}> (row {b.position})</span> : null}</>
                     : p.bench_id ? "unassigned bench" : "no bench yet"}
                </span>
                <span>{(+p.qty_pots).toLocaleString()} × ppp {p.ppp}</span>
                <span style={{ color: C.muted }}>plant wk{p.plant_week}/{String(p.plant_year).slice(2)} → ready wk{p.ready_week ?? "?"}</span>
                <span style={{ color: C.muted, marginLeft: "auto" }}>{[p.prop_method, p.broker || p.supplier].filter(Boolean).join(" · ")}</span>
              </div>
            ); })}
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
                    💰 <b>Cost per basket:</b> container + soil {money(agg.containerPer)} · plants incl. stick+tray {money(agg.plantsPer)} ={" "}
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
                <b onClick={() => setQuoteFor({ kind: "component", variety_id: c.variety_id, label: c.label,
                    vkey: detail?.vmap[c.variety_id]?.variety_key || null,
                    current: { variety: c.label, broker: c.broker, supplier: c.supplier, landed: c.liner } })}
                  title="view quotes / change sourcing"
                  style={{ flex: 1, minWidth: 140, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>{c.label}</b>
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
                  {c.plants.toLocaleString()} plants{c.liner != null && (c.broker || c.supplier) ? ` @ ${money(c.liner)} (${[c.broker, c.supplier].filter(Boolean).join(" / ")})` : c.liner == null && !(c.broker || c.supplier) ? " — no cost on file, click to source" : (c.broker || c.supplier) ? ` (${[c.broker, c.supplier].filter(Boolean).join(" / ")})` : " — unsourced cost, click to verify"}
                </span>
                {["URC", "CALL"].includes(c.prop_method) && detail?.trays?.length > 0 && (
                  <label title={`stick + tray ≈ ${money(c.propPer)}/plant, in the basket cost`} style={{ fontSize: 11, color: C.muted }}>
                    tray
                    <select disabled={busy} value={c.prop_tray_id || ""} onChange={e => setTray(c.variety_id, e.target.value || null)}
                      style={{ marginLeft: 4, padding: "3px 5px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                      <option value="">105 (default)</option>
                      {detail.trays.filter(t => !/105/.test(t.name)).map(t => (
                        <option key={t.id} value={t.id}>{(t.name.match(/^\d+/) || [t.name])[0]}{/deep/i.test(t.name) ? " deep" : ""} — {t.cells_per_flat} cell</option>
                      ))}
                    </select>
                  </label>
                )}
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

        {/* non-combo: the plant itself, same workflows as a component — just no adding */}
        {agg && agg.comps.length === 0 && agg.materials.length > 0 && (
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginTop: 12 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 6 }}>
              Plant {busy && <span style={{ color: C.amber }}>· saving…</span>}
            </div>
            {agg.materials.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12.5, flexWrap: "wrap" }}>
                <b onClick={() => setQuoteFor({ kind: "parent", variety_id: m.variety_id, label: m.variety, vkey: m.vkey,
                    current: { variety: m.variety, broker: m.broker, supplier: m.supplier, landed: m.cost } })}
                  title="view quotes / change sourcing"
                  style={{ flex: 1, minWidth: 140, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>{m.variety}</b>
                <label style={{ color: C.muted, fontSize: 11.5 }}>per pot
                  <input defaultValue={Math.max(...detail.parents.map(p => +p.ppp || 1))} inputMode="numeric" disabled={busy}
                    onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0 && v !== Math.max(...detail.parents.map(p => +p.ppp || 1))) setPpp(v); }}
                    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ width: 52, marginLeft: 5, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit" }} />
                </label>
                <span onClick={() => setQuoteFor({ kind: "parent", variety_id: m.variety_id, label: m.variety, vkey: m.vkey,
                    current: { variety: m.variety, broker: m.broker, supplier: m.supplier, landed: m.cost } })}
                  title="view quotes / change sourcing"
                  style={{ color: C.muted, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}>
                  {m.plants.toLocaleString()} plants{m.cost != null && m.src ? ` @ ${money(m.cost)} (${m.src})` : m.cost == null && !m.src ? " — no cost on file, click to source" : m.src ? ` (${m.src})` : " — unsourced cost, click to verify"}
                </span>
                {["URC", "CALL"].includes(m.prop_method) && detail?.trays?.length > 0 && (
                  <label title={`stick + tray ≈ ${money(m.propPer)}/plant, in the item cost`} style={{ fontSize: 11, color: C.muted }}>
                    tray
                    <select disabled={busy} value={m.prop_tray_id || ""} onChange={e => setTray(m.variety_id, e.target.value || null, "parent")}
                      style={{ marginLeft: 4, padding: "3px 5px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                      <option value="">105 (default)</option>
                      {detail.trays.filter(t => !/105/.test(t.name)).map(t => (
                        <option key={t.id} value={t.id}>{(t.name.match(/^\d+/) || [t.name])[0]}{/deep/i.test(t.name) ? " deep" : ""} — {t.cells_per_flat} cell</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ))}
            <div style={{ fontSize: 11, color: C.amber, marginTop: 7 }}>
              ⚠ Sourcing / plants-per-pot edits change the plan (liner orders) immediately — quantity/timing above stay decisions for production to apply.
            </div>
          </div>
        )}
        </>}
      </div>
      {quoteFor && <QuotePicker sb={sb} varietyKey={quoteFor.vkey} initialQuery={quoteFor.label}
        current={quoteFor.current} onPick={applyQuote} onClose={() => setQuoteFor(null)} />}
      {addQuote && <QuotePicker sb={sb} varietyKey={null} initialQuery=""
        onPick={addComponentFromQuote} onClose={() => setAddQuote(false)} />}
      {arranging && agg && (() => {
        const isCombo = agg.comps.length > 0;
        const names = isCombo ? agg.comps.map(c => c.label)
          : [agg.materials[0]?.variety || row.item];
        const maxPpp = Math.max(...(detail?.parents.map(p => +p.ppp || 1) || [1]));
        const saved = detail?.parents.find(p => p.planting_layout)?.planting_layout;
        // monoculture default: the item's ppp as an evenly spaced ring of the one variety
        const seed = saved || (isCombo ? { plants: names } : { plants: names, edge: { plant: 0, count: maxPpp } });
        return <BasketDesigner layout={seed} plantNames={names}
          onSave={saveLayout} onClose={() => setArranging(false)} />;
      })()}
    </div>
  );
}
