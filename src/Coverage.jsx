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

  // week → item → components
  const weeks = useMemo(() => {
    if (!items) return [];
    const byWeek = {};
    items.forEach(r => {
      const wk = wkKey(r.arrive_year, r.arrive_week);
      const w = byWeek[wk] || (byWeek[wk] = { key: wk, yr: r.arrive_year, wk: r.arrive_week, items: {} });
      const ik = `${r.item_name}||${r.bench || ""}`;
      const it = w.items[ik] || (w.items[ik] = { key: ik, name: r.item_name, bench: r.bench, crop: r.crop_name, pots: +r.pots || 0, plantWeek: r.plant_week, comps: [] });
      const p = pools[r.variety_id]?.[wk] || {};
      it.comps.push({ variety: r.variety, crop: r.crop_name, vid: r.variety_id, plants: +r.plants || 0, perPot: r.per_pot, inHouse: r.in_house, supplier: r.supplier, form: r.prop_method, state: stateFor(r), pool: p, orders: ordersFor(r.variety_id, wk) });
    });
    const rank = s => STATES[s].rank;
    return Object.values(byWeek).sort((a, b) => a.key - b.key).map(w => {
      const its = Object.values(w.items).map(it => {
        const live = it.comps.filter(c => !c.inHouse);
        it.state = live.length ? live.reduce((a, c) => rank(c.state) < rank(a) ? c.state : a, "confirmed") : "inhouse";
        it.brokers = [...new Set(it.comps.flatMap(c => c.orders.map(o => o.broker)).filter(Boolean))];
        it.comps.sort((a, b) => rank(a.state) - rank(b.state) || b.plants - a.plants);
        return it;
      }).sort((a, b) => rank(a.state) - rank(b.state) || String(a.bench || "").localeCompare(String(b.bench || "")) || a.name.localeCompare(b.name));
      const counts = its.reduce((a, it) => { a[it.state] = (a[it.state] || 0) + 1; return a; }, {});
      return { ...w, items: its, counts };
    });
  }, [items, pools]);

  const crops = useMemo(() => [...new Set((items || []).map(r => r.crop_name).filter(Boolean))].sort(), [items]);
  const totals = useMemo(() => weeks.reduce((a, w) => { Object.entries(w.counts).forEach(([k, v]) => { a[k] = (a[k] || 0) + v; }); a.items += w.items.length; return a; }, { items: 0 }), [weeks]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return weeks.filter(w => !week || String(w.key) === week).map(w => ({ ...w, items: w.items.filter(it => (!state || it.state === state) && (!crop || it.crop === crop || it.comps.some(c => c.crop === crop)) && (!s || it.name.toLowerCase().includes(s) || String(it.bench || "").toLowerCase().includes(s) || it.comps.some(c => c.variety.toLowerCase().includes(s)))) })).filter(w => w.items.length);
  }, [weeks, state, crop, week, q]);
  const unlinkedQty = unlinked.reduce((a, l) => a + (+l.qty_ordered || 0), 0);

  const chip = (label, on, onClick, s) => <button key={label} onClick={onClick} style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "5px 11px", borderRadius: 999, cursor: "pointer", border: `1.5px solid ${on ? (s ? s.color : C.dark) : C.border}`, background: on ? (s ? s.color : C.dark) : (s ? s.bg : C.card), color: on ? "#fff" : (s ? s.color : C.text) }}>{label}</button>;
  const stateChip = s => <span title={STATES[s].hint} style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: STATES[s].bg, color: STATES[s].color, whiteSpace: "nowrap" }}>{STATES[s].label}</span>;
  const evChip = ev => { const [t, hint] = EVID[ev] || EVID.none; return <span title={hint} style={{ fontSize: 10.5, fontWeight: 900, marginLeft: 3, color: ev === "none" ? C.amber : C.light }}>{t}</span>; };

  if (error) return <div style={{ padding: 24, fontFamily: FONT, color: C.red }}>Couldn't load coverage: {error}</div>;
  if (!items) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Working out every item's components against orders…</div>;
  if (!weeks.length) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Nothing to cover yet — no placed plan items with a plant linked. Place items on the Space tab first.</div>;

  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: mobile ? 10 : 16, maxWidth: 1280 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Coverage</h2>
        <span style={{ color: C.muted, fontSize: 13 }}>week by week, item by item. Placed items only; live orders only; an early arrival counts toward later weeks. ✓✓ = confirmation on file and on the broker's report · ✓ = one of the two · ⚠ = neither.</span>
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
        <select value={week} onChange={e => setWeek(e.target.value)} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card }}>
          <option value="">All weeks</option>{weeks.map(w => <option key={w.key} value={String(w.key)}>{wkLabel(w.yr, w.wk)} · {w.items.length} items</option>)}
        </select>
        <select value={crop} onChange={e => setCrop(e.target.value)} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card }}>
          <option value="">All crops</option>{crops.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="find an item, bench, or plant" style={{ font: "inherit", fontSize: 13, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, minWidth: 200 }} />
      </div>

      {!shown.length ? <div style={{ color: C.muted, padding: 16 }}>Nothing matches that filter.</div> : shown.map(w => (
        <div key={w.key} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, padding: "8px 12px", borderRadius: 10, background: C.dark, color: "#fff" }}>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18 }}>Arrives {wkLabel(w.yr, w.wk)}</span>
            <span style={{ fontSize: 12.5, opacity: .85 }}>{w.items.length} item{w.items.length === 1 ? "" : "s"}{w.counts.short ? ` · ${w.counts.short} short` : ""}{w.counts.unconfirmed ? ` · ${w.counts.unconfirmed} unconfirmed` : ""}{w.counts.confirmed ? ` · ${w.counts.confirmed} confirmed` : ""}{w.counts.inhouse ? ` · ${w.counts.inhouse} in-house` : ""}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
              <tbody>
                {w.items.map(it => [
                  <tr key={it.key} style={{ borderTop: `2px solid ${C.border}`, background: C.chip }}>
                    <td colSpan={7} style={{ padding: "7px 8px" }}>
                      <span style={{ fontWeight: 800 }}>{it.name}</span>
                      {it.bench && <span style={{ marginLeft: 8, color: C.muted, fontWeight: 600 }}>{it.bench}</span>}
                      <span style={{ marginLeft: 8, color: C.muted }}>{n(it.pots)} pots{it.plantWeek ? ` · plant wk${it.plantWeek}` : ""}</span>
                      {it.brokers.length > 1 && <span title="components come through more than one broker" style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: C.card, color: C.dark, border: `1px solid ${C.border}` }}>{it.brokers.join(" + ")}</span>}
                      <span style={{ marginLeft: 10 }}>{stateChip(it.state)}</span>
                    </td>
                  </tr>,
                  ...it.comps.map((c, i) => (
                    <tr key={it.key + i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "5px 8px 5px 22px", whiteSpace: "nowrap" }}><span style={{ color: C.muted }}>{c.crop}</span> <b>{c.variety}</b>{c.form ? <span style={{ marginLeft: 6, fontSize: 11, color: C.muted }}>{c.form}</span> : null}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{n(c.plants)}{c.perPot > 1 ? <span style={{ color: C.muted, fontSize: 11 }}> (×{c.perPot})</span> : null}</td>
                      {c.inHouse ? (
                        <td colSpan={4} style={{ padding: "5px 8px", color: C.muted }}>own cuttings ({c.supplier})</td>
                      ) : (<>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} title="ordered by this week, all orders for this plant, vs needed by this week"><span style={{ color: c.pool.cumOrdered < c.pool.cumNeed ? C.red : C.text }}>{n(c.pool.cumOrdered)}</span><span style={{ color: C.muted }}> / {n(c.pool.cumNeed)} ordered</span></td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }} title="confirmed by this week vs needed by this week"><span style={{ color: c.pool.cumConfirmed < c.pool.cumNeed ? C.amber : C.text }}>{n(c.pool.cumConfirmed)}</span><span style={{ color: C.muted }}> confirmed</span></td>
                        <td style={{ padding: "5px 8px", fontSize: 12.5, color: C.muted }}>
                          {c.orders.length ? c.orders.map((o, j) => <span key={j} style={{ whiteSpace: "nowrap", marginRight: 8 }}><b style={{ color: C.text }}>{o.broker}</b> {o.no}{o.wk !== wkKey(w.yr, w.wk) ? <span style={{ fontSize: 10.5 }}> (wk{o.wk % 100})</span> : null}{evChip(o.ev)}</span>) : <span style={{ color: C.red, fontWeight: 700 }}>no order</span>}
                        </td>
                        <td style={{ padding: "5px 8px" }}>{stateChip(c.state)}</td>
                      </>)}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
