import React, { useMemo } from "react";
import { useSeasonTargets, usePlanningEods, useCropRuns } from "./supabase";

const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr + "T23:59:59") - new Date()) / 86400000);
}

function calcProgress(runs, metric) {
  if (!runs.length) return 0;
  let count = 0;
  if (metric === "created") count = runs.length;
  if (metric === "sourced") count = runs.filter(r => r.sourcingBroker || r.sourcingSupplier).length;
  if (metric === "ordered") count = runs.filter(r => ["ordered","confirmed","growing","propagating","outside","ready","shipped"].includes(r.status)).length;
  if (metric === "confirmed") count = runs.filter(r => ["confirmed","growing","propagating","outside","ready","shipped"].includes(r.status)).length;
  return Math.round((count / runs.length) * 100);
}

export default function SeasonDeadlineWidget({ onNavigate }) {
  const { rows: targets } = useSeasonTargets();
  const { rows: eods } = usePlanningEods();
  const { rows: runs } = useCropRuns();

  const activeEods = eods.filter(e => !e.completed);
  const overdueEods = activeEods.filter(e => daysUntil(e.dueDate) < 0).length;

  // Next upcoming target
  const nextTarget = useMemo(() => {
    const upcoming = targets
      .filter(t => daysUntil(t.targetDate) >= 0)
      .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
    return upcoming[0] || null;
  }, [targets]);

  const progress = nextTarget ? calcProgress(runs, nextTarget.metric) : null;
  const days = nextTarget ? daysUntil(nextTarget.targetDate) : null;
  const onTrack = progress !== null && nextTarget ? progress >= nextTarget.targetPct * 0.8 : true;

  if (!targets.length && !activeEods.length) return null;

  return (
    <div onClick={() => onNavigate("deadlines")} style={{
      background: onTrack ? "#fff" : "#fff8f0",
      border: `1.5px solid ${onTrack ? "#e0e8d8" : "#f0c080"}`,
      borderRadius: 14, padding: "16px 20px", cursor: "pointer",
      transition: "box-shadow 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Season Progress</div>
        <div style={{ display: "flex", gap: 6 }}>
          {overdueEods > 0 && (
            <span style={{ background: "#fce8e8", color: "#c03030", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {overdueEods} overdue
            </span>
          )}
          {activeEods.length > 0 && (
            <span style={{ background: "#e8f4f8", color: "#2e7d9e", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {activeEods.length} EOD{activeEods.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {nextTarget && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "#7a8c74" }}>{nextTarget.season} — {nextTarget.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: days <= 7 ? "#c03030" : days <= 30 ? "#c8791a" : "#7a8c74" }}>
              {days}d left
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, background: "#e8ede4", borderRadius: 5, height: 8, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: `${nextTarget.targetPct}%`, top: 0, bottom: 0, width: 2, background: "#1e2d1a", zIndex: 1 }} />
              <div style={{ background: onTrack ? ACCENT : "#c8791a", height: "100%", borderRadius: 5, width: `${Math.min(progress, 100)}%`, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: onTrack ? ACCENT : "#c8791a", minWidth: 40, textAlign: "right" }}>{progress}%</div>
          </div>
        </>
      )}
    </div>
  );
}
