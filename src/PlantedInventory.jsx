// 📋 PLANTED INVENTORY — Evie's post-planting physical counts (Caleb 8/26: "a real
// source of truth for fall planning and poinsettia planning… so ordering next year
// will be very easy"). Reads the planted_inventory table: one row per bench/line
// count, per season+year. Future fall/winter counts land in the same table and
// appear in the season picker automatically — nothing to rebuild next year.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#dfe7d8", chip: "#eef3e8", amber: "#e89a3a", amberBg: "#fdf3e4" };
const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const seasonLabel = s => s === "winter" ? "Winter (poinsettias)" : s === "fall" ? "Fall (mums + pads)" : s;

export default function PlantedInventory() {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);      // "fall|2026"
  const [q, setQ] = useState("");
  const [byLoc, setByLoc] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      let all = [], off = 0;
      for (;;) {   // page every fetch — the 1,000-row cap reads as "randomly missing data"
        const { data } = await sb.from("planted_inventory").select("*").order("bench_code").range(off, off + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        off += 1000;
      }
      setRows(all);
      const seas = [...new Set(all.map(r => `${r.season}|${r.year}`))].sort((a, b) => b.localeCompare(a));
      setSel(s => s || seas[0] || null);
    })();
  }, [sb]);

  const seasons = useMemo(() => rows ? [...new Set(rows.map(r => `${r.season}|${r.year}`))].sort((a, b) => {
    const [sa, ya] = a.split("|"), [sbn, yb] = b.split("|");
    return (+yb) - (+ya) || sa.localeCompare(sbn);
  }) : [], [rows]);

  const cur = useMemo(() => (rows || []).filter(r => sel && `${r.season}|${r.year}` === sel), [rows, sel]);
  const counts = useMemo(() => cur.filter(r => r.count != null &&
    (!q || `${r.crop} ${r.size_label} ${r.variety} ${r.color} ${r.location} ${r.bench_code}`.toLowerCase().includes(q.toLowerCase()))), [cur, q]);
  const capNotes = useMemo(() => cur.filter(r => r.count == null && r.note), [cur]);

  // crop+size cards → variety rows (or location rows in the by-location lens)
  const cards = useMemo(() => {
    const m = {};
    counts.forEach(r => {
      const sizeNum = +((String(r.size_label || "").match(/\d+(\.\d+)?/) || [999])[0]) || 999;
      const k = `${r.crop || "?"}|${r.size_label || "?"}`;
      const g = m[k] || (m[k] = { crop: r.crop || "?", size: r.size_label || "?", sizeNum, total: 0, lines: {}, noteRows: [] });
      const lk = byLoc ? (r.location || "?") : `${r.variety || "?"}${r.color && r.color !== r.variety ? ` · ${r.color}` : ""}`;
      const l = g.lines[lk] || (g.lines[lk] = { label: lk, pots: 0, benches: new Set() });
      l.pots += r.count; g.total += r.count;
      if (r.bench_code) l.benches.add(r.bench_code);
      if (r.note) g.noteRows.push(`${r.bench_code || r.location}: ${r.note}`);
    });
    return Object.values(m).sort((a, b) => a.crop.localeCompare(b.crop) || a.sizeNum - b.sizeNum || a.size.localeCompare(b.size));
  }, [counts, byLoc]);

  const grand = cards.reduce((t, g) => t + g.total, 0);

  return (
    <div style={{ fontFamily: FONT, color: C.dark, padding: "18px 16px", maxWidth: 760, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <h1 style={{ fontFamily: SERIF, fontSize: 26, margin: "0 0 4px" }}>📋 Planted inventory</h1>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
        physical counts taken AFTER planting — the real source of truth for next year's ordering
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <select value={sel || ""} onChange={e => setSel(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${C.light}`, fontFamily: FONT, fontSize: 14, fontWeight: 700, background: "#fff", flex: 1, minWidth: 180 }}>
          {seasons.map(s => { const [se, yr] = s.split("|"); return <option key={s} value={s}>{seasonLabel(se)} — {yr}</option>; })}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="filter (mum, 6.5, fabyuleous, SE Pad…)"
          style={{ padding: "8px 10px", borderRadius: 9, border: `1px solid ${C.border}`, fontFamily: FONT, fontSize: 13, flex: 1, minWidth: 160 }} />
        <button onClick={() => setByLoc(v => !v)}
          style={{ padding: "8px 12px", borderRadius: 9, border: `1.5px solid ${byLoc ? C.light : C.border}`, background: byLoc ? "#eef6e8" : "#fff",
            fontFamily: FONT, fontSize: 12.5, fontWeight: 800, cursor: "pointer", color: C.dark }}>
          {byLoc ? "📍 by location" : "🌱 by variety"}
        </button>
      </div>
      {!rows && <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>counting…</div>}
      {rows && cards.map(g => (
        <div key={`${g.crop}|${g.size}`} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 15px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, borderBottom: `2px solid ${C.light}`, paddingBottom: 5, marginBottom: 7 }}>
            <span style={{ fontFamily: SERIF, fontSize: 19 }}>{g.size} {g.crop}</span>
            <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 17, fontVariantNumeric: "tabular-nums" }}>{g.total.toLocaleString()}</span>
          </div>
          {Object.values(g.lines).sort((a, b) => b.pots - a.pots).map(l => (
            <div key={l.label} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13.5, borderBottom: `1px solid ${C.chip}`, alignItems: "baseline" }}>
              <span style={{ flex: 1, minWidth: 0 }}>{l.label}</span>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>
                {[...l.benches].sort().slice(0, 6).join(" ")}{l.benches.size > 6 ? ` +${l.benches.size - 6}` : ""}
              </span>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{l.pots.toLocaleString()}</b>
            </div>
          ))}
          {g.noteRows.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.amber, background: C.amberBg, borderRadius: 8, padding: "5px 9px" }}>
              {g.noteRows.map((n, i) => <div key={i}>⚠ {n}</div>)}
            </div>
          )}
        </div>
      ))}
      {rows && (
        <div style={{ background: C.dark, color: C.cream, borderRadius: 12, padding: "13px 16px", display: "flex", fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
          <span style={{ flex: 1 }}>TOTAL PLANTED</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{grand.toLocaleString()}</span>
        </div>
      )}
      {rows && capNotes.length > 0 && (
        <div style={{ background: "#fff", border: `1px dashed ${C.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 12, color: C.muted }}>
          <b style={{ color: C.dark }}>Open space noted at count time:</b>
          {capNotes.map(r => <div key={r.id} style={{ padding: "2px 0" }}>· {r.bench_code} ({r.location}) — {r.note}</div>)}
        </div>
      )}
    </div>
  );
}
