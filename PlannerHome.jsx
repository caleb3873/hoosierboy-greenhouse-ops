import { useState, useEffect } from "react";
import { computeSchedule, getCurrentWeek, getCropRunCalendarEvents, makeGCalUrl, CROP_STATUS, formatWeekDate } from "../lib/shared";

const CURRENT_WEEK = getCurrentWeek();
const CURRENT_YEAR = new Date().getFullYear();

const EVENT_COLORS = {
  seed:       { label: "Order / Propagate", color: "#8e44ad", bg: "#f5f0ff" },
  transplant: { label: "Transplant",        color: "#4a90d9", bg: "#e8f4ff" },
  moveout:    { label: "Move Outside",      color: "#c8791a", bg: "#fff4e0" },
  ready:      { label: "Ready to Ship",     color: "#2e7a2e", bg: "#e8f8e8" },
};

export default function PlannerHome({ onNavigate }) {
  const [runs, setRuns]   = useState([]);
  const [gcalRun, setGcalRun] = useState(null); // run whose events we're previewing

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("gh_crop_runs_v1") || "[]");
      setRuns(stored);
    } catch {}
  }, []);

  // Summary counts
  const byStatus = {};
  CROP_STATUS.forEach(s => { byStatus[s.id] = 0; });
  runs.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });

  // Upcoming events across all runs (next 3 weeks)
  const upcoming = runs.flatMap(r => getCropRunCalendarEvents(r))
    .filter(e => {
      const diff = (e.year - CURRENT_YEAR) * 52 + e.week - CURRENT_WEEK;
      return diff >= -1 && diff <= 3;
    })
    .sort((a, b) => {
      const da = (a.year - CURRENT_YEAR) * 52 + a.week;
      const db = (b.year - CURRENT_YEAR) * 52 + b.week;
      return da - db;
    })
    .slice(0, 12);

  const readyCount = runs.filter(r => r.status === "ready").length;
  const noSourcing = runs.filter(r => !r.materialType).length;

  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, color: "#1a2a1a", marginBottom: 6 }}>Good morning</div>
      <div style={{ fontSize: 14, color: "#7a8c74", marginBottom: 28 }}>Week {CURRENT_WEEK} &middot; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>

      {/* Alerts */}
      {readyCount > 0 && (
        <div style={{ background: "#e8f8e8", border: "1.5px solid #7fb069", borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#1e5a1e", fontWeight: 700 }}>{readyCount} crop{readyCount !== 1 ? "s" : ""} ready to ship</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View</button>
        </div>
      )}
      {noSourcing > 0 && (
        <div style={{ background: "#fff8e8", border: "1.5px solid #f0d080", borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#7a5a10", fontWeight: 700 }}>{noSourcing} run{noSourcing !== 1 ? "s" : ""} missing sourcing info</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#e0a820", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fix</button>
        </div>
      )}

      {/* Status summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 32 }}>
        {CROP_STATUS.filter(s => s.id !== "shipped").map(s => (
          <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px", cursor: "pointer" }}
            onClick={() => onNavigate("crops")}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{byStatus[s.id] || 0}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming milestones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8 }}>Upcoming Milestones</div>
        <span style={{ fontSize: 11, color: "#7a8c74" }}>Next 3 weeks</span>
      </div>

      {upcoming.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>No milestones in the next 3 weeks. Add crop runs to see them here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
          {upcoming.map(event => {
            const meta = EVENT_COLORS[event.type] || EVENT_COLORS.transplant;
            const diff = (event.year - CURRENT_YEAR) * 52 + event.week - CURRENT_WEEK;
            const timing = diff < 0 ? "Overdue" : diff === 0 ? "This week" : `In ${diff} week${diff !== 1 ? "s" : ""}`;
            const timingColor = diff < 0 ? "#c03030" : diff === 0 ? "#2e7a2e" : "#7a8c74";
            const gcalUrl = makeGCalUrl({ title: event.title, description: event.description, week: event.week, year: event.year, location: event.location });

            return (
              <div key={event.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${meta.color}30`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 4, height: 44, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#7a8c74" }}>Wk {event.week} &middot; {formatWeekDate(event.week, event.year)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: timingColor }}>{timing}</span>
                  </div>
                </div>
                <a href={gcalUrl} target="_blank" rel="noreferrer"
                  style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}40`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}>
                  + Cal
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "New Crop Run",   page: "crops",   color: "#7fb069" },
          { label: "View Orders",    page: "orders",  color: "#8e44ad" },
          { label: "Space Map",      page: "space",   color: "#4a90d9" },
          { label: "Libraries",      page: "library", color: "#c8791a" },
        ].map(a => (
          <button key={a.page} onClick={() => onNavigate(a.page)}
            style={{ padding: "16px", borderRadius: 14, border: `1.5px solid ${a.color}30`, background: "#fff", color: "#1a2a1a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: a.color, marginBottom: 8 }} />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
