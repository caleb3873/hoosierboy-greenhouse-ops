// Σ PLAN TOTALS — self-serve size × color production totals for ANY plan (Caleb 8/19:
// "email mario the totals… i want to be able to query this in all the plans").
// Public route ?totals=1 so Mario can look it up on his phone without planner access;
// also mounted in the planner nav. Read-only. Numbers come straight from scheduled_crops,
// so it always matches the plans — no more copy/paste emails.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#dfe7d8", chip: "#eef3e8" };
const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";

export default function PlanTotals({ embedded }) {
  const sb = getSupabase();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.from("production_plans").select("id,name,status").neq("status", "archived").order("created_at", { ascending: false });
      setPlans(data || []);
      if (data?.length) setPlanId(data[0].id);
    })();
  }, [sb]);

  useEffect(() => {
    if (!sb || !planId) return;
    setRows(null);
    (async () => {
      let all = [], off = 0;
      for (;;) {
        const { data } = await sb.from("scheduled_crops")
          .select("item_name,qty_pots,color,container_id,variety_id")
          .eq("plan_id", planId).not("is_combo_component", "is", true).gt("qty_pots", 0)
          .range(off, off + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        off += 1000;
      }
      const cids = [...new Set(all.map(r => r.container_id).filter(Boolean))];
      const cons = {};
      for (let i = 0; i < cids.length; i += 100) {
        const { data } = await sb.from("containers").select("id,diameter_in,size_label,name").in("id", cids.slice(i, i + 100));
        (data || []).forEach(c => { cons[c.id] = c; });
      }
      const vids = [...new Set(all.map(r => r.variety_id).filter(Boolean))];
      const vmap = {};
      for (let i = 0; i < vids.length; i += 100) {
        const { data } = await sb.from("variety_library").select("id,variety").in("id", vids.slice(i, i + 100));
        (data || []).forEach(v => { vmap[v.id] = v.variety; });
      }
      setRows(all.map(r => {
        const c = cons[r.container_id] || {};
        const size = c.size_label || (c.diameter_in ? `${c.diameter_in}"` : null) || (r.item_name.match(/^([^ ]+(?:")?)/) || [])[1] || "?";
        const col = (r.color || "").toUpperCase();
        const label = col && col !== "NOVELTY" ? col : (vmap[r.variety_id] || r.item_name);
        return { size, sizeNum: +String(c.diameter_in ?? (String(size).match(/\d+(\.\d+)?/) || [999])[0]) || 999, label, qty: r.qty_pots };
      }));
    })();
  }, [sb, planId]);

  const groups = useMemo(() => {
    if (!rows) return [];
    const bySize = {};
    rows.forEach(r => {
      if (q && !(`${r.size} ${r.label}`.toLowerCase().includes(q.toLowerCase()))) return;
      const g = bySize[r.size] || (bySize[r.size] = { size: r.size, sizeNum: r.sizeNum, colors: {}, total: 0 });
      g.colors[r.label] = (g.colors[r.label] || 0) + r.qty;
      g.total += r.qty;
    });
    return Object.values(bySize).sort((a, b) => a.sizeNum - b.sizeNum || a.size.localeCompare(b.size));
  }, [rows, q]);

  const grand = groups.reduce((t, g) => t + g.total, 0);

  return (
    <div style={{ fontFamily: FONT, color: C.dark, background: embedded ? "transparent" : "#f2f5ef", minHeight: embedded ? "auto" : "100vh", padding: "18px 16px", maxWidth: 720, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: "0 0 4px" }}>Σ Plan totals</h1>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>live production totals by size and color — sleeves, pot covers, tags order straight off this</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select value={planId || ""} onChange={e => setPlanId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${C.light}`, fontFamily: FONT, fontSize: 14, fontWeight: 700, background: "#fff", flex: 1, minWidth: 180 }}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter (red, 6.5, marble…)"
          style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13, flex: 1, minWidth: 150 }} />
      </div>
      {!rows && <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>counting…</div>}
      {rows && groups.map(g => (
        <div key={g.size} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 15px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderBottom: `2px solid ${C.light}`, paddingBottom: 5, marginBottom: 7 }}>
            <span style={{ fontFamily: SERIF, fontSize: 20 }}>{g.size}</span>
            <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{g.total.toLocaleString()}</span>
          </div>
          {Object.entries(g.colors).sort((a, b) => b[1] - a[1]).map(([label, n]) => (
            <div key={label} style={{ display: "flex", padding: "3px 0", fontSize: 13.5, borderBottom: `1px solid ${C.chip}` }}>
              <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{n.toLocaleString()}</b>
            </div>
          ))}
        </div>
      ))}
      {rows && (
        <div style={{ background: C.dark, color: C.cream, borderRadius: 12, padding: "13px 16px", display: "flex", fontSize: 16, fontWeight: 800 }}>
          <span style={{ flex: 1 }}>GRAND TOTAL</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{grand.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
