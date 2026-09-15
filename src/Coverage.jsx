// 📦 Coverage — week by week, item by item: for every placed plan item, each component
// it needs, the pool of orders behind that component (broker, order number, whether it is
// backed by a confirmation / a broker report / both), and whether it is covered. A combo
// is Confirmed only when every component is; otherwise the rows say which are and which
// aren't. Need = placed rows only (combo pots × plants per pot); supply = live orders only;
// an early arrival counts toward later weeks. Everything is defined once, in the views —
// v_plan_need_items, v_plan_supply, v_po_lines_unlinked — this page only arranges it.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import useIsMobile from "./useIsMobile";
import { plantOrder, sizeLabelForItem } from "./shared";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff", text: "#1e2d1a" };
const FONT = "'DM Sans', sans-serif";
const n = v => (v == null ? "—" : Number(v).toLocaleString("en-US"));
const wkKey = (yr, wk) => (yr ?? 9999) * 100 + (wk ?? 99);
const wkLabel = (yr, wk) => (wk == null ? "no week" : `wk${String(wk).padStart(2, "0")}${yr ? "/" + String(yr).slice(2) : ""}`);

async function pageAll(sb, table, cols, mod) {
  let out = [], from = 0;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const STATES = {
  short:       { label: "Short",       color: C.red,   bg: "#fbe4e0", rank: 0, hint: "not enough ordered by this week" },
  unconfirmed: { label: "Unconfirmed", color: C.amber, bg: "#fdebd3", rank: 1, hint: "ordered, but the supplier hasn't confirmed enough" },
  confirmed:   { label: "Confirmed",   color: C.light, bg: "#e7f3df", rank: 2, hint: "covered and confirmed" },
  inhouse:     { label: "In-house",    color: C.muted, bg: C.chip,    rank: 3, hint: "our own cuttings — nothing to order" },
};
const EVID = { both: ["✓✓", "confirmation on file AND seen on the broker's report"], conf: ["✓", "confirmation on file"], report: ["✓", "seen on the broker's report"], none: ["⚠", "no confirmation on file and not seen on a broker report"] };

export default function Coverage({ plan }) {
  const sb = getSupabase();
  const mobile = useIsMobile();
  const [items, setItems] = useState(null);
  const [supply, setSupply] = useState([]);
  const [unlinked, setUnlinked] = useState([]);
  const [error, setError] = useState(null);
  const [state, setState] = useState("");
  const [crop, setCrop] = useState("");
  const [week, setWeek] = useState("");
  const [q, setQ] = useState("");
  const [showUnlinked, setShowUnlinked] = useState(false);
  const [sort, setSort] = useState({ col: "default", dir: 1 });

  useEffect(() => {
    if (!sb || !plan?.id) return;
    let dead = false; setItems(null); setError(null);
    (async () => {
      try {
        const [it, su, ul] = await Promise.all([
          pageAll(sb, "v_plan_need_items", "*", x => x.eq("plan_id", plan.id)),
          pageAll(sb, "v_plan_supply", "*", x => x.eq("plan_id", plan.id)),
          pageAll(sb, "v_po_lines_unlinked", "*", x => x.eq("plan_id", plan.id)),
        ]);
        if (dead) return;
        setItems(it); setSupply(su); setUnlinked(ul);
      } catch (e) { if (!dead) setError(e.message || String(e)); }
    })();
    return () => { dead = true; };
  }, [sb, plan?.id]);

  // Per variety: cumulative need / ordered / confirmed at each week key, so a component
  // at week w can be judged against everything that has arrived by then.
  const pools = useMemo(() => {
    if (!items) return {};
    const need = {}, sup = {};
    items.forEach(r => { if (r.in_house) return; const k = wkKey(r.arrive_year, r.arrive_week); (need[r.variety_id] = need[r.variety_id] || {})[k] = (need[r.variety_id][k] || 0) + (+r.plants || 0); });
    supply.forEach(s => { const k = wkKey(s.ship_year, s.ship_week); (sup[s.variety_id] = sup[s.variety_id] || {})[k] = s; });
    const out = {};
    new Set([...Object.keys(need), ...Object.keys(sup)]).forEach(v => {
      const keys = [...new Set([...Object.keys(need[v] || {}), ...Object.keys(sup[v] || {})])].map(Number).sort((a, b) => a - b);
      let cn = 0, co = 0, cc = 0; out[v] = {};
      keys.forEach(k => {
        cn += need[v]?.[k] || 0; const s = sup[v]?.[k]; co += +s?.ordered || 0; cc += +s?.confirmed || 0;
        out[v][k] = { cumNeed: cn, cumOrdered: co, cumConfirmed: cc, orders: s?.orders || "", brokers: s?.brokers || "", evidence: s?.order_evidence || "" };
      });
    });
    return out;
  }, [items, supply]);

  // Orders that cover a component at week w = every supply row for that variety at or before w.
  const ordersFor = (vid, k) => {
    const p = pools[vid] || {}; const out = [];
    Object.keys(p).map(Number).filter(x => x <= k).sort((a, b) => a - b).forEach(x => {
      const e = p[x].evidence; if (!e) return;
      e.split(",").forEach(tok => { const [no, broker, ev] = tok.split(":"); if (no) out.push({ no, broker, ev, wk: x }); });
    });
    return out;
  };
  const stateFor = (r) => {
    if (r.in_house) return "inhouse";
    const p = pools[r.variety_id]?.[wkKey(r.arrive_year, r.arrive_week)];
    if (!p) return "short";
    if (p.cumOrdered < p.cumNeed) return "short";
    if (p.cumConfirmed < p.cumNeed) return "unconfirmed";
    return "confirmed";
  };

  // One flat row per item component: the item (what's on the bench) + the plant it
  // needs + the pool of orders behind that plant by ITS week. An item's state is the worst
  // of its components across every arrival week, carried on each of its rows — so a search
  // for the item shows all its parts together and one verdict for the whole thing.
  const rows = useMemo(() => {
    if (!items) return [];
    const byItem = {};
    const out = items.map(r => {
      const wk = wkKey(r.arrive_year, r.arrive_week);
      const ik = `${r.item_name}||${r.bench || ""}`;   // an item is one thing even when its plants arrive in different weeks
      const p = pools[r.variety_id]?.[wk] || {};
      const row = { ik, wk, yr: r.arrive_year, week: r.arrive_week, size: sizeLabelForItem(r.item_name), item: r.item_name, bench: r.bench || "", pots: +r.pots || 0, plantWeek: r.plant_week,
        crop: r.crop_name, variety: r.variety, vid: r.variety_id, form: r.prop_method, supplier: r.supplier, inHouse: r.in_house, perPot: r.per_pot, plants: +r.plants || 0,
        need: p.cumNeed ?? null, ordered: p.cumOrdered ?? null, confirmed: p.cumConfirmed ?? null, state: stateFor(r), orders: ordersFor(r.variety_id, wk) };
      row.gap = row.inHouse ? 0 : Math.max(0, (row.need ?? row.plants) - (row.ordered ?? 0));
      (byItem[ik] = byItem[ik] || []).push(row);
      return row;
    });
    const rank = s => STATES[s].rank;
    Object.values(byItem).forEach(list => {
      const live = list.filter(c => !c.inHouse);
      const st = live.length ? live.reduce((a, c) => rank(c.state) < rank(a) ? c.state : a, "confirmed") : "inhouse";
      list.forEach(c => { c.itemState = st; c.comps = list.length; });
    });
    return out;
  }, [items, pools]);

  const crops = useMemo(() => [...new Set((items || []).map(r => r.crop_name).filter(Boolean))].sort(), [items]);
  const weeks = useMemo(() => { const m = {}; rows.forEach(r => { m[r.wk] = m[r.wk] || { key: r.wk, yr: r.yr, wk: r.week, n: 0 }; m[r.wk].n++; }); return Object.values(m).sort((a, b) => a.key - b.key); }, [rows]);
  const totals = useMemo(() => { const t = { items: new Set() }; rows.forEach(r => { t.items.add(r.ik); t[r.itemState] = (t[r.itemState] || 0); }); const seen = new Set(); rows.forEach(r => { if (seen.has(r.ik)) return; seen.add(r.ik); t[r.itemState] = (t[r.itemState] || 0) + 1; }); t.items = t.items.size; return t; }, [rows]);

  const COLS = [
    { id: "week", label: "Arrives", get: r => r.wk, render: r => wkLabel(r.yr, r.week) },
    { id: "size", label: "Size", get: r => r.size, cmp: (a, b) => plantOrder(a.size, b.size) },
    { id: "item", label: "Item", get: r => r.item, cmp: (a, b) => plantOrder(a.item, b.item) },
    { id: "bench", label: "Bench", get: r => r.bench },
    { id: "pots", label: "Pots", get: r => r.pots, num: true },
    { id: "plantWeek", label: "Plant wk", get: r => r.plantWeek ?? 99, render: r => r.plantWeek ? `wk${r.plantWeek}` : "—" },
    { id: "variety", label: "Plant", get: r => `${r.crop} ${r.variety}` },
    { id: "perPot", label: "Per pot", get: r => r.perPot, num: true },
    { id: "plants", label: "Plants", get: r => r.plants, num: true },
    { id: "ordered", label: "Ordered", get: r => r.ordered ?? -1, num: true },
    { id: "confirmed", label: "Confirmed", get: r => r.confirmed ?? -1, num: true },
    { id: "gap", label: "Gap", get: r => r.gap, num: true },
    { id: "orders", label: "Orders", get: r => r.orders.map(o => o.no).join(" ") },
    { id: "state", label: "Status", get: r => STATES[r.state].rank },
  ];
  const defaultCmp = (a, b) => plantOrder(a.size, b.size) || plantOrder(a.item, b.item) || a.bench.localeCompare(b.bench) || a.wk - b.wk || b.plants - a.plants;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter(r => (!state || r.itemState === state) && (!crop || r.crop === crop) && (!week || String(r.wk) === week)
      && (!s || r.item.toLowerCase().includes(s) || r.bench.toLowerCase().includes(s) || r.variety.toLowerCase().includes(s) || r.crop.toLowerCase().includes(s) || r.orders.some(o => o.no.includes(s) || o.broker.toLowerCase().includes(s))));
    const col = COLS.find(c => c.id === sort.col);
    const cmp = !col ? defaultCmp : (a, b) => {
      const d = col.cmp ? col.cmp(a, b) : (col.num ? (col.get(a) - col.get(b)) : String(col.get(a)).localeCompare(String(col.get(b)), undefined, { numeric: true }));
      return d * sort.dir || defaultCmp(a, b);
    };
    return [...list].sort(cmp);
  }, [rows, state, crop, week, q, sort]);
  const unlinkedQty = unlinked.reduce((a, l) => a + (+l.qty_ordered || 0), 0);
  const clickSort = id => setSort(s => s.col === id ? (s.dir === 1 ? { col: id, dir: -1 } : { col: "default", dir: 1 }) : { col: id, dir: 1 });

  const chip = (label, on, onClick, s) => <button key={label} onClick={onClick} style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer", border: `1.5px solid ${on ? (s ? s.color : C.dark) : C.border}`, background: on ? (s ? s.color : C.dark) : (s ? s.bg : C.card), color: on ? "#fff" : (s ? s.color : C.text) }}>{label}</button>;
  const stateChip = s => <span title={STATES[s].hint} style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: STATES[s].bg, color: STATES[s].color, whiteSpace: "nowrap" }}>{STATES[s].label}</span>;
  const evChip = ev => { const [t, hint] = EVID[ev] || EVID.none; return <span title={hint} style={{ fontSize: 10.5, fontWeight: 900, marginLeft: 3, color: ev === "none" ? C.amber : C.light }}>{t}</span>; };
  const sel = { font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card };
  const td = { padding: "5px 8px", borderTop: `1px solid ${C.border}`, verticalAlign: "top" };
  const num = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  if (error) return <div style={{ padding: 24, fontFamily: FONT, color: C.red }}>Couldn't load coverage: {error}</div>;
  if (!items) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Working out every item's components against orders…</div>;
  if (!rows.length) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Nothing to cover yet — no placed plan items with a plant linked. Place items on the Space tab first.</div>;

  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: mobile ? 10 : 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Coverage</h2>
        <span style={{ color: C.muted, fontSize: 13 }}>one row per item + plant, an item's plants kept together even when they arrive in different weeks; the "item ·" badge is the verdict for the whole item. Placed items only; live orders only; an early arrival counts toward later weeks. Ordered / Confirmed are running totals for that plant by that week. ✓✓ = confirmation on file and on the broker's report · ✓ = one of the two · ⚠ = neither. Click a column to sort.</span>
      </div>

      {unlinked.length > 0 && (
        <div style={{ margin: "8px 0 12px", padding: "10px 14px", borderRadius: 10, background: "#fdebd3", border: `1px solid ${C.amber}`, fontSize: 13.5 }}>
          <b>{unlinked.length} order line{unlinked.length === 1 ? "" : "s"} ({n(unlinkedQty)} plants) can't be counted</b> — no plant linked, so they're invisible here until fixed.{" "}
          <button onClick={() => setShowUnlinked(s => !s)} style={{ font: "inherit", fontSize: 13, fontWeight: 700, border: "none", background: "transparent", color: C.dark, textDecoration: "underline", cursor: "pointer", padding: 0 }}>{showUnlinked ? "hide" : "show them"}</button>
          {showUnlinked && <div style={{ marginTop: 8, display: "grid", gap: 3, fontSize: 12.5 }}>{unlinked.map(l => <div key={l.line_id}><span style={{ color: C.muted }}>{l.order_number} · {l.broker} · {l.supplier} · wk{l.ship_week}</span> — {l.variety_name} <b>{n(l.qty_ordered)}</b></div>)}</div>}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "10px 0 12px" }}>
        {chip(`All items ${totals.items}`, !state, () => setState(""))}
        {Object.entries(STATES).map(([k, s]) => totals[k] ? chip(`${s.label} ${totals[k]}`, state === k, () => setState(state === k ? "" : k), s) : null)}
        <select value={week} onChange={e => setWeek(e.target.value)} style={sel}>
          <option value="">All weeks</option>{weeks.map(w => <option key={w.key} value={String(w.key)}>{wkLabel(w.yr, w.wk)} · {w.n} rows</option>)}
        </select>
        <select value={crop} onChange={e => setCrop(e.target.value)} style={sel}>
          <option value="">All crops</option>{crops.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search item, bench, plant, order #, broker" style={{ font: "inherit", fontSize: 13, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, minWidth: 260 }} />
        <span style={{ color: C.muted, fontSize: 12.5 }}>{shown.length} row{shown.length === 1 ? "" : "s"}</span>
      </div>

      {!shown.length ? <div style={{ color: C.muted, padding: 16 }}>Nothing matches that filter.</div> : (
        <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.card }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.dark, color: "#fff", position: "sticky", top: 0 }}>
                {COLS.map(c => (
                  <th key={c.id} onClick={() => clickSort(c.id)} title="click to sort; click again to flip; a third click restores size → name → bench → arrival" style={{ padding: "8px 8px", textAlign: c.num ? "right" : "left", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", fontWeight: 700, fontSize: 12 }}>
                    {c.label}{sort.col === c.id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.ik + r.vid + i} style={{ background: r.state === "short" ? "#fff6f4" : r.state === "unconfirmed" ? "#fffaf2" : i % 2 ? "#fafcf8" : C.card }}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{wkLabel(r.yr, r.week)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: C.muted, fontWeight: 600 }}>{r.size}</td>
                  <td style={{ ...td, fontWeight: 700, minWidth: 220 }}>{r.item}{r.comps > 1 && <span title={`${r.comps} plants make this item (arrivals may differ) — the whole item is ${STATES[r.itemState].label}`} style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: STATES[r.itemState].bg, color: STATES[r.itemState].color }}>item · {STATES[r.itemState].label}</span>}</td>
                  <td style={{ ...td, whiteSpace: "nowrap", color: C.muted }}>{r.bench || "—"}</td>
                  <td style={num}>{n(r.pots)}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{r.plantWeek ? `wk${r.plantWeek}` : "—"}</td>
                  <td style={{ ...td, minWidth: 200 }}><span style={{ color: C.muted }}>{r.crop}</span> <b>{r.variety}</b>{r.form ? <span style={{ marginLeft: 6, fontSize: 11, color: C.muted }}>{r.form}</span> : null}</td>
                  <td style={num}>{r.perPot}</td>
                  <td style={num}>{n(r.plants)}</td>
                  {r.inHouse ? <td colSpan={4} style={{ ...td, color: C.muted }}>own cuttings ({r.supplier})</td> : (<>
                    <td style={num} title="ordered for this plant by this week (all orders), vs needed by this week"><span style={{ color: r.ordered < r.need ? C.red : C.text }}>{n(r.ordered)}</span><span style={{ color: C.muted, fontSize: 11 }}> / {n(r.need)}</span></td>
                    <td style={num} title="confirmed by this week vs needed by this week"><span style={{ color: r.confirmed < r.need ? C.amber : C.text }}>{n(r.confirmed)}</span></td>
                    <td style={{ ...num, fontWeight: 800, color: r.gap > 0 ? C.red : C.light }}>{r.gap > 0 ? `−${n(r.gap)}` : "0"}</td>
                    <td style={{ ...td, fontSize: 12.5, color: C.muted, minWidth: 160 }}>
                      {r.orders.length ? r.orders.map((o, j) => <span key={j} style={{ whiteSpace: "nowrap", marginRight: 8 }}><b style={{ color: C.text }}>{o.broker}</b> {o.no}{o.wk !== r.wk ? <span style={{ fontSize: 10.5 }}> (wk{o.wk % 100})</span> : null}{evChip(o.ev)}</span>) : <span style={{ color: C.red, fontWeight: 700 }}>no order</span>}
                    </td>
                  </>)}
                  <td style={td}>{stateChip(r.state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
