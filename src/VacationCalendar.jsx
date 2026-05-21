import React, { useState, useMemo } from "react";
import { useVacationRequests } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "16px 20px", marginBottom: 14 };

// Consistent color per requester so each person shows up the same across the month
const PALETTE = ["#7fb069", "#4a90d9", "#e89a3a", "#8e44ad", "#c8791a", "#1a8a8a", "#d94f3d", "#a85aab", "#5a9aa3", "#7a8c74"];
function colorFor(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function monthLabel(d) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }

// Build a grid of weeks for the month, including padding days for prior/next month
function monthGrid(monthFirst) {
  const first = new Date(monthFirst);
  const startOffset = (first.getDay() + 6) % 7; // Mon=0
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function overlapsRequest(req, dayIso) {
  return req.startDate <= dayIso && req.endDate >= dayIso;
}

export default function VacationCalendar() {
  const { rows } = useVacationRequests();
  const [anchor, setAnchor] = useState(() => monthStart(new Date()));
  const [selected, setSelected] = useState(null);

  const cells = useMemo(() => monthGrid(anchor), [anchor]);
  const monthFirst = anchor;
  const monthIdx = anchor.getMonth();

  // Bucket all approved requests by day for this month
  const byDay = useMemo(() => {
    const m = new Map();
    for (const c of cells) {
      const iso = ymd(c);
      const approved = (rows || []).filter(r => r.status === "approved" && overlapsRequest(r, iso));
      m.set(iso, approved);
    }
    return m;
  }, [rows, cells]);

  // Distinct people on vacation this month (for the legend)
  const peopleOff = useMemo(() => {
    const set = new Map();
    for (const cell of cells) {
      if (cell.getMonth() !== monthIdx) continue;
      const day = byDay.get(ymd(cell)) || [];
      for (const r of day) set.set(r.requesterName, true);
    }
    return [...set.keys()].sort();
  }, [cells, byDay, monthIdx]);

  const todayIso = ymd(new Date());

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 28, fontWeight: 400, color: "#1a2a1a" }}>
            🌴 Vacation Calendar
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            Approved time off across the team. Submit/approve from the floor task views.
          </div>
        </div>
      </div>

      {/* Month nav */}
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
            style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, color: "#1e2d1a", fontFamily: "inherit" }}>← Prev</button>
          <button onClick={() => setAnchor(monthStart(new Date()))}
            style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, color: "#7a8c74", fontFamily: "inherit" }}>Today</button>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
            style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700, color: "#1e2d1a", fontFamily: "inherit" }}>Next →</button>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>{monthLabel(monthFirst)}</div>
      </div>

      {/* Legend */}
      {peopleOff.length > 0 && (
        <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 4, alignSelf: "center" }}>Off this month:</span>
          {peopleOff.map(p => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f2f5ef", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: colorFor(p) }} /> {p}
            </span>
          ))}
        </div>
      )}

      {/* Calendar grid */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#f0f5ee", borderBottom: "1.5px solid #e0ead8" }}>
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", textAlign: "center" }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map((cell, idx) => {
            const iso = ymd(cell);
            const inMonth = cell.getMonth() === monthIdx;
            const isToday = iso === todayIso;
            const dayItems = byDay.get(iso) || [];
            return (
              <div key={idx} onClick={() => dayItems.length > 0 && setSelected({ iso, items: dayItems })}
                style={{
                  minHeight: 88, padding: "6px 8px",
                  borderRight: (idx % 7) !== 6 ? "1px solid #f0f5ee" : "none",
                  borderBottom: idx < 35 ? "1px solid #f0f5ee" : "none",
                  background: inMonth ? "#fff" : "#fafcf8",
                  opacity: inMonth ? 1 : 0.6,
                  cursor: dayItems.length > 0 ? "pointer" : "default",
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? "#fff" : "#1e2d1a",
                  background: isToday ? "#1e2d1a" : "transparent", borderRadius: 999,
                  display: "inline-block", padding: isToday ? "1px 8px" : 0, alignSelf: "flex-start" }}>
                  {cell.getDate()}
                </div>
                {dayItems.slice(0, 3).map(r => (
                  <div key={r.id} title={`${r.requesterName} (${r.startDate} → ${r.endDate})${r.reason ? ` — ${r.reason}` : ""}`}
                    style={{ background: colorFor(r.requesterName), color: "#fff", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.isSick ? "🤒 " : ""}{r.requesterName.split(" ")[0]}
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>+{dayItems.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail modal */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 480, width: "100%", padding: 0, maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "14px 18px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", opacity: 0.85 }}>Off this day</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{new Date(selected.iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&times;</button>
            </div>
            <div style={{ padding: 18 }}>
              {selected.items.map(r => (
                <div key={r.id} style={{ borderLeft: `4px solid ${colorFor(r.requesterName)}`, padding: "10px 14px", marginBottom: 10, background: "#f8fbf5", borderRadius: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{r.isSick ? "🤒 " : ""}{r.requesterName}</div>
                  <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{r.startDate}{r.endDate !== r.startDate ? ` → ${r.endDate}` : ""}</div>
                  {r.reason && <div style={{ fontSize: 13, color: "#1e2d1a", marginTop: 6, fontStyle: "italic" }}>"{r.reason}"</div>}
                  <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>Approved by {r.approver}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
