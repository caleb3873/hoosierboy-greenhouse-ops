// 📦 Coverage — "do we have enough X coming in, and not too much?" as a page.
// Reads v_plan_coverage (need − supply per variety per arrival week, running
// totals so an early arrival covers a later planting) and v_po_lines_unlinked
// (order lines with no plant linked — invisible to supply until fixed). Need is
// PLACED rows only, combo parents × child ppp; supply is LIVE orders only. All
// of that is defined once, in the views — this page only displays it.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import useIsMobile from "./useIsMobile";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff", text: "#1e2d1a" };
const FONT = "'DM Sans', sans-serif";
const n = v => (v == null ? "—" : Number(v).toLocaleString("en-US"));

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

// Over = more than 10% above need AND more than 100 plants — a ~5% take buffer is expected, not a flag.
const STATES = {
  short:       { label: "Short",       color: C.red,   bg: "#fbe4e0", hint: "ordered < needed" },
  unconfirmed: { label: "Unconfirmed", color: C.amber, bg: "#fdebd3", hint: "ordered covers it, supplier hasn't confirmed enough" },
  over:        { label: "Over",        color: C.muted, bg: C.chip,    hint: "more than 10% and 100 plants above need" },
  ok:          { label: "OK",          color: C.light, bg: "#e7f3df", hint: "covered and confirmed" },
};
const stateOf = v => {
  if (v.ordered < v.need) return "short";
  if (v.confirmed < v.need) return "unconfirmed";
  if (v.ordered - v.need > Math.max(100, v.need * 0.1)) return "over";
  return "ok";
};
const wkLabel = r => (r.arrive_week == null ? "no week" : `wk${String(r.arrive_week).padStart(2, "0")}${r.arrive_year ? "/" + String(r.arrive_year).slice(2) : ""}`);

export default function Coverage({ plan }) {
  const sb = getSupabase();
  const mobile = useIsMobile();
  const [rows, setRows] = useState(null);
  const [unlinked, setUnlinked] = useState([]);
  const [error, setError] = useState(null);
  const [crop, setCrop] = useState("");
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [showUnlinked, setShowUnlinked] = useState(false);

  useEffect(() => {
    if (!sb || !plan?.id) return;
    let dead = false;
    setRows(null); setError(null);
    (async () => {
      try {
        const [cov, ul] = await Promise.all([
          pageAll(sb, "v_plan_coverage", "*", x => x.eq("plan_id", plan.id)),
          pageAll(sb, "v_po_lines_unlinked", "*", x => x.eq("plan_id", plan.id)),
        ]);
        if (dead) return;
        setRows(cov); setUnlinked(ul);
      } catch (e) { if (!dead) setError(e.message || String(e)); }
    })();
    return () => { dead = true; };
  }, [sb, plan?.id]);

  // One entry per variety: totals plus its weeks in arrival order.
  const varieties = useMemo(() => {
    if (!rows) return [];
    const by = {};
    rows.forEach(r => {
      const v = by[r.variety_id] || (by[r.variety_id] = { id: r.variety_id, crop: r.crop_name || "—", name: r.variety, need: 0, ordered: 0, confirmed: 0, inHouse: +r.in_house_plants || 0, longLead: 0, weeks: [], late: false });
      v.need += +r.need || 0; v.ordered += +r.ordered || 0; v.confirmed += +r.confirmed || 0; v.longLead += +r.long_lead_need || 0;
      v.weeks.push(r);
      if (+r.cum_gap_ordered < 0 && +r.need > 0) v.late = true;
    });
    const out = Object.values(by);
    out.forEach(v => { v.weeks.sort((a, b) => (a.arrive_year ?? 9999) - (b.arrive_year ?? 9999) || (a.arrive_week ?? 99) - (b.arrive_week ?? 99)); v.state = stateOf(v); });
    // Worst first: short, then unconfirmed, then over, then ok; biggest gap first within a band.
    const rank = { short: 0, unconfirmed: 1, over: 2, ok: 3 };
    out.sort((a, b) => rank[a.state] - rank[b.state] || Math.abs(b.ordered - b.need) - Math.abs(a.ordered - a.need) || a.crop.localeCompare(b.crop) || a.name.localeCompare(b.name));
    return out;
  }, [rows]);

  const crops = useMemo(() => [...new Set(varieties.map(v => v.crop))].sort(), [varieties]);
  const counts = useMemo(() => varieties.reduce((a, v) => { a[v.state] = (a[v.state] || 0) + 1; return a; }, {}), [varieties]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return varieties.filter(v => (!crop || v.crop === crop) && (!state || v.state === state) && (!s || v.name.toLowerCase().includes(s) || v.crop.toLowerCase().includes(s)));
  }, [varieties, crop, state, q]);
  const totals = useMemo(() => shown.reduce((a, v) => { a.need += v.need; a.ordered += v.ordered; a.confirmed += v.confirmed; return a; }, { need: 0, ordered: 0, confirmed: 0 }), [shown]);
  const unlinkedQty = unlinked.reduce((a, l) => a + (+l.qty_ordered || 0), 0);

  const chip = (k, on, onClick, extra) => (
    <button key={k} onClick={onClick} style={{ font: "inherit", fontSize: 12.5, fontWeight: 700, padding: "5px 11px", borderRadius: 999, border: `1.5px solid ${on ? C.dark : C.border}`, background: on ? C.dark : C.card, color: on ? "#fff" : C.text, cursor: "pointer", ...extra }}>{k}</button>
  );
  const gapCell = (g, bold) => <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: g < 0 ? C.red : C.muted, fontWeight: bold ? 800 : 600 }}>{g > 0 ? "+" : ""}{n(g)}</td>;

  if (error) return <div style={{ padding: 24, fontFamily: FONT, color: C.red }}>Couldn't load coverage: {error}</div>;
  if (!rows) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Working out need against orders…</div>;
  if (!varieties.length) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Nothing to cover yet — no placed plan rows with a plant linked, and no live orders. Place items on the Space tab first.</div>;

  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: mobile ? 10 : 16, maxWidth: 1240 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Coverage</h2>
        <span style={{ color: C.muted, fontSize: 13 }}>need is placed rows only (combos × plants per pot); supply is live orders only. Early arrivals count toward later weeks.</span>
      </div>

      {unlinked.length > 0 && (
        <div style={{ margin: "8px 0 12px", padding: "10px 14px", borderRadius: 10, background: "#fdebd3", border: `1px solid ${C.amber}`, fontSize: 13.5 }}>
          <b>{unlinked.length} order line{unlinked.length === 1 ? "" : "s"} ({n(unlinkedQty)} plants) can't be counted</b> — no plant is linked, so they're invisible to supply until fixed.{" "}
          <button onClick={() => setShowUnlinked(s => !s)} style={{ font: "inherit", fontSize: 13, fontWeight: 700, border: "none", background: "transparent", color: C.dark, textDecoration: "underline", cursor: "pointer", padding: 0 }}>{showUnlinked ? "hide" : "show them"}</button>
          {showUnlinked && (
            <div style={{ marginTop: 8, display: "grid", gap: 3, fontSize: 12.5 }}>
              {unlinked.map(l => <div key={l.line_id}><span style={{ color: C.muted }}>{l.order_number} · {l.supplier} · wk{l.ship_week}</span> — {l.variety_name} <b>{n(l.qty_ordered)}</b></div>)}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "10px 0 14px" }}>
        {chip(`All ${varieties.length}`, !state, () => setState(""))}
        {Object.entries(STATES).map(([k, s]) => counts[k] ? chip(`${s.label} ${counts[k]}`, state === k, () => setState(state === k ? "" : k), { borderColor: state === k ? s.color : C.border, background: state === k ? s.color : s.bg, color: state === k ? "#fff" : s.color }) : null)}
        <select value={crop} onChange={e => setCrop(e.target.value)} style={{ font: "inherit", fontSize: 13, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card }}>
          <option value="">All crops</option>{crops.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="find a variety" style={{ font: "inherit", fontSize: 13, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, minWidth: 180 }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "10px 14px", borderRadius: 10, background: C.chip, marginBottom: 12, fontSize: 13.5 }}>
        <span><b>{shown.length}</b> varieties</span>
        <span>need <b>{n(totals.need)}</b></span>
        <span>ordered <b>{n(totals.ordered)}</b></span>
        <span>confirmed <b>{n(totals.confirmed)}</b></span>
        <span style={{ color: totals.ordered - totals.need < 0 ? C.red : C.muted }}>vs ordered <b>{totals.ordered - totals.need > 0 ? "+" : ""}{n(totals.ordered - totals.need)}</b></span>
        <span style={{ color: totals.confirmed - totals.need < 0 ? C.red : C.muted }}>vs confirmed <b>{totals.confirmed - totals.need > 0 ? "+" : ""}{n(totals.confirmed - totals.need)}</b></span>
      </div>

      {!shown.length ? <div style={{ color: C.muted, padding: 16 }}>Nothing matches that filter.</div> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em" }}>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Crop</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Variety</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Need</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Ordered</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Confirmed</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>vs ordered</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>vs confirmed</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>State</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(v => {
                const s = STATES[v.state]; const isOpen = !!open[v.id];
                return [
                  <tr key={v.id} onClick={() => setOpen(o => ({ ...o, [v.id]: !o[v.id] }))} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer", background: isOpen ? C.chip : "transparent" }}>
                    <td style={{ padding: "7px 8px", color: C.muted, whiteSpace: "nowrap" }}>{v.crop}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 700 }}>{v.name}{v.inHouse > 0 && <span title="own cuttings — not in the bought-in need" style={{ marginLeft: 6, fontSize: 11, color: C.muted, fontWeight: 600 }}>+{n(v.inHouse)} in-house</span>}{v.longLead > 0 && <span title="arrives more than 16 weeks before it is planted — held stock (ivy, spikes) propagated and drawn down all season" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: C.chip, color: C.muted }}>HELD STOCK</span>}{v.late && v.state !== "short" && <span title="a week's cumulative arrivals fall short before later orders catch up" style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, padding: "1px 6px", borderRadius: 8, background: "#fdebd3", color: C.amber }}>LATE WEEK</span>}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(v.need)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(v.ordered)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n(v.confirmed)}</td>
                    {gapCell(v.ordered - v.need, true)}
                    {gapCell(v.confirmed - v.need, true)}
                    <td style={{ padding: "7px 8px" }}><span title={s.hint} style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: s.bg, color: s.color }}>{s.label}</span></td>
                  </tr>,
                  isOpen && (
                    <tr key={v.id + "-wk"}>
                      <td colSpan={8} style={{ padding: "4px 8px 12px 28px", background: C.chip }}>
                        <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}>
                          <thead><tr style={{ color: C.muted }}><th style={{ textAlign: "left", padding: "3px 10px 3px 0" }}>Arrives</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Need</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Ordered</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Confirmed</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Running vs ordered</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Running vs confirmed</th><th style={{ textAlign: "left", padding: "3px 10px" }}>Orders</th></tr></thead>
                          <tbody>{v.weeks.map((w, i) => (
                            <tr key={i}>
                              <td style={{ padding: "3px 10px 3px 0", fontWeight: 700, whiteSpace: "nowrap" }}>{wkLabel(w)}</td>
                              <td style={{ textAlign: "right", padding: "3px 10px" }}>{n(w.need)}</td>
                              <td style={{ textAlign: "right", padding: "3px 10px" }}>{n(w.ordered)}</td>
                              <td style={{ textAlign: "right", padding: "3px 10px" }}>{n(w.confirmed)}</td>
                              {gapCell(+w.cum_gap_ordered)}
                              {gapCell(+w.cum_gap_confirmed)}
                              <td style={{ padding: "3px 10px", color: C.muted, whiteSpace: "nowrap" }}>{w.orders || "—"}{w.suppliers ? ` · ${w.suppliers}` : ""}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
