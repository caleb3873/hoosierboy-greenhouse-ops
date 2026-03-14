import { useState, useRef, useCallback } from "react";

// ── SHARED HELPERS ─────────────────────────────────────────────────────────────
const CROP_STATUS = [
  { id: "planned",      label: "Planned",       color: "#7a8c74", bg: "#f4f6f2" },
  { id: "needs_design", label: "Needs Design",  color: "#e07b39", bg: "#fdf3ea" },
  { id: "propagating",  label: "Propagating",   color: "#8e44ad", bg: "#f5f0ff" },
  { id: "growing",      label: "Growing",       color: "#4a90d9", bg: "#e8f3fc" },
  { id: "outside",      label: "Outside",       color: "#c8791a", bg: "#fff4e8" },
  { id: "ready",        label: "Ready",         color: "#7fb069", bg: "#f0f8eb" },
  { id: "shipped",      label: "Shipped",       color: "#1e2d1a", bg: "#e8ede4" },
];
const stat = (id) => CROP_STATUS.find(s => s.id === id) || CROP_STATUS[0];

// Reuse from main file (passed as prop or duplicated)
function computeSchedule(run) {
  const { targetWeek, targetYear, movesOutside, weeksIndoor, weeksOutdoor, weeksProp } = run;
  if (!targetWeek || !targetYear) return null;
  function subtractWeeks(wk, yr, n) {
    let w = wk - n; let y = yr;
    while (w <= 0) { w += 52; y--; }
    return { week: w, year: y };
  }
  const totalFinish = (Number(weeksIndoor) || 0) + (movesOutside ? (Number(weeksOutdoor) || 0) : 0);
  const transplantWk = subtractWeeks(targetWeek, targetYear, totalFinish);
  const seedWk       = weeksProp ? subtractWeeks(transplantWk.week, transplantWk.year, Number(weeksProp)) : null;
  const moveOutWk    = movesOutside && weeksOutdoor ? subtractWeeks(targetWeek, targetYear, Number(weeksOutdoor)) : null;
  return { transplant: transplantWk, seed: seedWk, moveOut: moveOutWk, ready: { week: targetWeek, year: targetYear } };
}

function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return weekStart;
}

function formatWk(week, year, currentYear) {
  if (!week) return "—";
  return year === currentYear ? `Wk ${week}` : `Wk ${week} '${String(year).slice(2)}`;
}

// ── VIEW TOOLBAR ──────────────────────────────────────────────────────────────
export function ViewToolbar({ tabView, setTabView, statusFilter, setStatusFilter, yearFilter, setYearFilter, years, searchQuery, setSearchQuery, brokerFilter, setBrokerFilter, brokers }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 180px", minWidth: 140 }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#aabba0" }}>🔍</span>
        <input
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search crops..."
          style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 34, border: "1.5px solid #c8d8c0", borderRadius: 20, fontSize: 12, fontFamily: "inherit", background: "#fff", boxSizing: "border-box", outline: "none" }}
        />
      </div>

      {/* Year */}
      <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
        style={{ height: 34, background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 20, padding: "0 14px", fontSize: 12, fontWeight: 600, color: "#1e2d1a", fontFamily: "inherit", cursor: "pointer" }}>
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Status pills */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[["all","All"], ...CROP_STATUS.map(s => [s.id, s.label])].map(([id, label]) => (
          <button key={id} onClick={() => setStatusFilter(id)}
            style={{ height: 34, background: statusFilter === id ? "#1e2d1a" : "#fff", color: statusFilter === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${statusFilter === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "0 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Broker filter */}
      {brokers.length > 1 && (
        <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}
          style={{ height: 34, background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 20, padding: "0 14px", fontSize: 12, fontWeight: 600, color: "#1e2d1a", fontFamily: "inherit", cursor: "pointer" }}>
          <option value="">All Brokers</option>
          {brokers.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", gap: 3, marginLeft: "auto", background: "#f0f5ee", borderRadius: 10, padding: 3 }}>
        {[
          ["list",   "☰",  "List"],
          ["gantt",  "📊", "Timeline"],
          ["board",  "⬜", "Board"],
          ["labor",  "🕐", "Labor"],
          ["calendar","📅","Calendar"],
        ].map(([id, icon, label]) => (
          <button key={id} onClick={() => setTabView(id)}
            title={label}
            style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "none", background: tabView === id ? "#fff" : "transparent", color: tabView === id ? "#1e2d1a" : "#7a8c74", fontWeight: tabView === id ? 800 : 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit", boxShadow: tabView === id ? "0 1px 4px rgba(0,0,0,0.1)" : "none", transition: "all .15s", whiteSpace: "nowrap" }}>
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── GANTT / TIMELINE VIEW ─────────────────────────────────────────────────────
export function GanttView({ runs, currentYear, onEdit }) {
  const [hovered, setHovered] = useState(null);
  const nowWeek = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  })();

  // Determine visible week range
  const weeks = runs.reduce((acc, r) => {
    const s = computeSchedule(r);
    if (!s) return acc;
    if (s.seed?.year === currentYear)      acc.push(s.seed.week);
    if (s.transplant?.year === currentYear) acc.push(s.transplant.week);
    if (s.ready?.year === currentYear)     acc.push(s.ready.week);
    return acc;
  }, [nowWeek]);
  const minWk = Math.max(1,  Math.min(...weeks) - 1);
  const maxWk = Math.min(52, Math.max(...weeks) + 1);
  const totalWks = maxWk - minWk + 1;

  function pct(week) { return ((week - minWk) / totalWks) * 100; }

  const PHASE_COLORS = {
    prop:   { fill: "#e8d8f8", stroke: "#8e44ad" },
    indoor: { fill: "#dceefb", stroke: "#4a90d9" },
    outside:{ fill: "#fde8c8", stroke: "#c8791a" },
  };

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      {/* Week header */}
      <div style={{ position: "relative", height: 28, borderBottom: "1.5px solid #e0ead8", background: "#f8faf6" }}>
        <div style={{ position: "absolute", left: 200, right: 0, top: 0, bottom: 0 }}>
          {Array.from({ length: totalWks }, (_, i) => i + minWk).map(w => (
            <div key={w} style={{ position: "absolute", left: `${pct(w)}%`, top: 0, bottom: 0, width: 1, background: w === nowWeek ? "#7fb069" : "#f0f0ec" }} />
          ))}
          {Array.from({ length: totalWks }, (_, i) => i + minWk).filter(w => w % 2 === 0).map(w => (
            <div key={w} style={{ position: "absolute", left: `${pct(w)}%`, top: "50%", transform: "translate(-50%,-50%)", fontSize: 9, fontWeight: 700, color: w === nowWeek ? "#7fb069" : "#aabba0" }}>
              {w}
            </div>
          ))}
          {/* Now marker label */}
          {nowWeek >= minWk && nowWeek <= maxWk && (
            <div style={{ position: "absolute", left: `${pct(nowWeek)}%`, top: 2, transform: "translateX(-50%)", fontSize: 8, fontWeight: 900, color: "#7fb069", background: "#f0f8eb", padding: "1px 4px", borderRadius: 4 }}>NOW</div>
          )}
        </div>
        <div style={{ position: "absolute", left: 0, width: 200, display: "flex", alignItems: "center", paddingLeft: 16, fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Crop Run</div>
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {runs.map((run, idx) => {
          const s = computeSchedule(run);
          const st = stat(run.status);
          if (!s) return (
            <div key={run.id} style={{ display: "flex", height: 44, alignItems: "center", borderBottom: "1px solid #f5f7f3", background: idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
              <div style={{ width: 200, flexShrink: 0, paddingLeft: 16, fontSize: 12, fontWeight: 700, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => onEdit(run)}>{run.cropName}</div>
              <div style={{ flex: 1, paddingLeft: 8, fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>No schedule set</div>
            </div>
          );

          // Build phase bars
          const phases = [];

          // Prop phase
          if (s.seed && s.transplant && s.seed.year === currentYear && s.transplant.year === currentYear) {
            phases.push({ key: "prop", start: s.seed.week, end: s.transplant.week, label: "🌱 Prop", ...PHASE_COLORS.prop });
          }

          // Indoor phase
          const indoorEnd = s.moveOut || s.ready;
          if (s.transplant && indoorEnd && s.transplant.year === currentYear) {
            const end = indoorEnd.year === currentYear ? indoorEnd.week : maxWk;
            phases.push({ key: "indoor", start: s.transplant.week, end, label: "🏠 Indoor", ...PHASE_COLORS.indoor });
          }

          // Outside phase
          if (s.moveOut && s.ready && s.moveOut.year === currentYear) {
            const end = s.ready.year === currentYear ? s.ready.week : maxWk;
            phases.push({ key: "outside", start: s.moveOut.week, end, label: "🌤 Outside", ...PHASE_COLORS.outside });
          }

          const isHovered = hovered === run.id;

          return (
            <div key={run.id}
              onMouseEnter={() => setHovered(run.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ display: "flex", height: 44, alignItems: "center", borderBottom: "1px solid #f5f7f3", background: isHovered ? "#f8faf6" : idx % 2 === 0 ? "#fff" : "#fafcf8", transition: "background .1s" }}>
              {/* Label */}
              <div style={{ width: 200, flexShrink: 0, paddingLeft: 16, paddingRight: 8, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => onEdit(run)}>{run.cropName}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, background: st.bg, color: st.color, padding: "1px 5px", borderRadius: 4 }}>{st.label}</span>
                  {run.cases && <span style={{ fontSize: 9, color: "#aabba0" }}>{run.cases} cs</span>}
                </div>
              </div>

              {/* Bar track */}
              <div style={{ flex: 1, position: "relative", height: "100%" }}>
                {/* Grid lines */}
                {Array.from({ length: totalWks }, (_, i) => i + minWk).map(w => (
                  <div key={w} style={{ position: "absolute", left: `${pct(w)}%`, top: 0, bottom: 0, width: 1, background: w === nowWeek ? "#c8e6b840" : "#f5f5f0" }} />
                ))}
                {/* Phase bars */}
                {phases.map(ph => {
                  const l = Math.max(0, pct(ph.start));
                  const r = Math.min(100, pct(ph.end));
                  if (r <= l) return null;
                  return (
                    <div key={ph.key} title={`${ph.label}: Wk ${ph.start} → Wk ${ph.end}`}
                      style={{ position: "absolute", left: `${l}%`, width: `${r - l}%`, top: "20%", height: "60%", background: ph.fill, border: `1.5px solid ${ph.stroke}`, borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 4, overflow: "hidden" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: ph.stroke, whiteSpace: "nowrap" }}>{ph.label}</span>
                    </div>
                  );
                })}
                {/* Ready marker */}
                {s.ready?.year === currentYear && s.ready.week >= minWk && s.ready.week <= maxWk && (
                  <div title={`Ready: Wk ${s.ready.week}`}
                    style={{ position: "absolute", left: `${pct(s.ready.week)}%`, top: "15%", height: "70%", width: 3, background: "#7fb069", borderRadius: 2, transform: "translateX(-50%)" }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderTop: "1.5px solid #e0ead8", background: "#f8faf6", flexWrap: "wrap" }}>
        {[
          { color: "#8e44ad", fill: "#e8d8f8", label: "🌱 Propagation" },
          { color: "#4a90d9", fill: "#dceefb", label: "🏠 Indoor" },
          { color: "#c8791a", fill: "#fde8c8", label: "🌤 Outside" },
          { color: "#7fb069", fill: "#7fb069", label: "✅ Ready" },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7a8c74" }}>
            <div style={{ width: 14, height: 10, background: l.fill, border: `1.5px solid ${l.color}`, borderRadius: 3 }} />
            {l.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 10, color: "#aabba0" }}>Click crop name to edit</div>
      </div>
    </div>
  );
}

// ── BOARD VIEW (Kanban drag-and-drop) ─────────────────────────────────────────
export function BoardView({ runs, onEdit, onStatusChange }) {
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver]  = useState(null);

  function handleDragStart(run) { setDragging(run); }
  function handleDragEnd()      { setDragging(null); setDragOver(null); }
  function handleDrop(statusId) {
    if (dragging && dragging.status !== statusId) {
      onStatusChange(dragging.id, statusId);
    }
    setDragging(null);
    setDragOver(null);
  }

  return (
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ display: "flex", gap: 10, minWidth: CROP_STATUS.length * 200 + "px", alignItems: "flex-start" }}>
        {CROP_STATUS.map(col => {
          const colRuns = runs.filter(r => r.status === col.id);
          const isOver  = dragOver === col.id;
          return (
            <div key={col.id}
              onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => handleDrop(col.id)}
              style={{ flex: "0 0 220px", background: isOver ? col.bg : "#f4f6f2", borderRadius: 12, border: `2px solid ${isOver ? col.color : "#e0ead8"}`, minHeight: 200, transition: "border-color .15s, background .15s" }}>
              {/* Column header */}
              <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e0ead8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: col.color }}>{col.label}</div>
                <div style={{ background: col.color + "20", color: col.color, fontWeight: 800, fontSize: 11, padding: "2px 8px", borderRadius: 10 }}>{colRuns.length}</div>
              </div>

              {/* Cards */}
              <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: 7 }}>
                {colRuns.map(run => {
                  const s = computeSchedule(run);
                  const isDragging = dragging?.id === run.id;
                  return (
                    <div key={run.id}
                      draggable
                      onDragStart={() => handleDragStart(run)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onEdit(run)}
                      style={{ background: isDragging ? "#f0f8eb" : "#fff", borderRadius: 10, border: `1.5px solid ${isDragging ? "#7fb069" : "#e0ead8"}`, padding: "10px 12px", cursor: "grab", opacity: isDragging ? 0.5 : 1, boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.12)" : "none", transition: "all .15s", userSelect: "none" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", marginBottom: 5, lineHeight: 1.3 }}>{run.cropName}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {run.cases && <span style={{ fontSize: 10, background: "#f0f5ee", color: "#7a8c74", padding: "1px 6px", borderRadius: 4 }}>{run.cases} cs</span>}
                        {s?.ready && <span style={{ fontSize: 10, background: "#f0f8eb", color: "#2e5c1e", padding: "1px 6px", borderRadius: 4 }}>Wk {s.ready.week}</span>}
                        {run.movesOutside && <span style={{ fontSize: 10, background: "#fff4e8", color: "#c8791a", padding: "1px 6px", borderRadius: 4 }}>🌤</span>}
                      </div>
                      {s?.transplant && (
                        <div style={{ fontSize: 10, color: "#aabba0", marginTop: 5 }}>
                          Transplant Wk {s.transplant.week}
                        </div>
                      )}
                    </div>
                  );
                })}
                {colRuns.length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "#c8d8c0", fontStyle: "italic" }}>
                    {isOver ? "Drop here" : "No runs"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "#aabba0", marginTop: 10, textAlign: "center" }}>Drag cards between columns to update status · Click to edit</div>
    </div>
  );
}

// ── LABOR VIEW ────────────────────────────────────────────────────────────────
const LABOR_TASKS = [
  { id: "seeding",     label: "Seeding / Sticking",  icon: "🌱", color: "#8e44ad" },
  { id: "transplant",  label: "Transplanting",        icon: "🪴", color: "#4a90d9" },
  { id: "spacing",     label: "Spacing",              icon: "📐", color: "#c8791a" },
  { id: "fertilizing", label: "Fertilizing",          icon: "💊", color: "#7a9a4a" },
  { id: "moving",      label: "Moving Outside",       icon: "🌤", color: "#e07b39" },
  { id: "shipping",    label: "Shipping Prep",        icon: "📦", color: "#1e2d1a" },
];

export function LaborView({ runs, currentYear, onSaveLaborHours }) {
  const [editing, setEditing] = useState(null); // { runId, taskId }
  const [localHours, setLocalHours] = useState({});

  // Build a schedule-keyed labor map: week → [{ run, task, hours }]
  const weekMap = {};
  runs.forEach(run => {
    const s = computeSchedule(run);
    const labor = run.laborHours || {};

    const taskWeeks = {
      seeding:     s?.seed?.year === currentYear      ? s.seed.week      : null,
      transplant:  s?.transplant?.year === currentYear ? s.transplant.week : null,
      spacing:     s?.transplant?.year === currentYear ? s.transplant.week + 1 : null,
      fertilizing: s?.transplant?.year === currentYear ? s.transplant.week + 2 : null,
      moving:      s?.moveOut?.year === currentYear   ? s.moveOut.week   : null,
      shipping:    s?.ready?.year === currentYear     ? s.ready.week - 1 : null,
    };

    LABOR_TASKS.forEach(task => {
      const wk = taskWeeks[task.id];
      if (!wk || wk < 1 || wk > 52) return;
      if (!weekMap[wk]) weekMap[wk] = [];
      weekMap[wk].push({ run, task, hours: Number(labor[task.id] || 0) });
    });
  });

  const sortedWeeks = Object.keys(weekMap).map(Number).sort((a, b) => a - b);
  const nowWeek = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  })();

  function getKey(runId, taskId) { return `${runId}__${taskId}`; }
  function startEdit(runId, taskId, currentHrs) {
    const key = getKey(runId, taskId);
    setLocalHours(h => ({ ...h, [key]: currentHrs || "" }));
    setEditing({ runId, taskId });
  }
  function commitEdit(run, taskId) {
    const key = getKey(run.id, taskId);
    const hrs = Number(localHours[key]) || 0;
    const updated = { ...run, laborHours: { ...(run.laborHours || {}), [taskId]: hrs } };
    onSaveLaborHours(updated);
    setEditing(null);
  }

  // Total hours by week for the bar chart
  const maxHrs = Math.max(...sortedWeeks.map(w => weekMap[w].reduce((s, e) => s + e.hours, 0)), 1);

  return (
    <div>
      {/* Instructions */}
      <div style={{ background: "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "#2e5c1e" }}>
        <strong>Labor Planning</strong> — estimated hours are auto-placed in the week each task is scheduled. Click any hours cell to update. Hours are saved per crop run.
      </div>

      {sortedWeeks.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#aabba0", fontSize: 13 }}>
          No scheduled crop runs with target weeks set. Add target weeks to see labor projections.
        </div>
      )}

      {sortedWeeks.map(wk => {
        const entries = weekMap[wk];
        const totalHrs = entries.reduce((s, e) => s + e.hours, 0);
        const isNow = wk === nowWeek;
        return (
          <div key={wk} style={{ marginBottom: 16, borderRadius: 12, border: `1.5px solid ${isNow ? "#7fb069" : "#e0ead8"}`, background: "#fff", overflow: "hidden" }}>
            {/* Week header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: isNow ? "#f0f8eb" : "#f8faf6", borderBottom: "1px solid #e8ede4" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: isNow ? "#2e5c1e" : "#1e2d1a" }}>
                Week {wk}
                {isNow && <span style={{ fontSize: 10, background: "#7fb069", color: "#fff", padding: "1px 6px", borderRadius: 4, marginLeft: 8 }}>NOW</span>}
              </div>
              {/* Mini bar */}
              <div style={{ flex: 1, height: 8, background: "#e8ede4", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (totalHrs / maxHrs) * 100)}%`, background: isNow ? "#7fb069" : "#4a90d9", borderRadius: 4, transition: "width .3s" }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74", minWidth: 80, textAlign: "right" }}>
                {totalHrs > 0 ? `${totalHrs} hrs projected` : "No hours set"}
              </div>
            </div>

            {/* Task rows */}
            <div style={{ padding: "8px 0" }}>
              {entries.map((entry, i) => {
                const key = getKey(entry.run.id, entry.task.id);
                const isEditingThis = editing?.runId === entry.run.id && editing?.taskId === entry.task.id;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px 90px", alignItems: "center", gap: 12, padding: "7px 16px", borderBottom: i < entries.length - 1 ? "1px solid #f5f7f3" : "none" }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{entry.run.cropName}</span>
                      {entry.run.cases && <span style={{ fontSize: 11, color: "#aabba0", marginLeft: 8 }}>{entry.run.cases} cases</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{entry.task.icon}</span>
                      <span style={{ fontSize: 11, color: entry.task.color, fontWeight: 700 }}>{entry.task.label}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isEditingThis ? (
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <input type="number" autoFocus
                            value={localHours[key] ?? ""}
                            onChange={e => setLocalHours(h => ({ ...h, [key]: e.target.value }))}
                            onBlur={() => commitEdit(entry.run, entry.task.id)}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(entry.run, entry.task.id); if (e.key === "Escape") setEditing(null); }}
                            style={{ width: 56, padding: "3px 6px", border: "1.5px solid #4a90d9", borderRadius: 6, fontSize: 12, textAlign: "right", fontFamily: "inherit" }}
                          />
                          <span style={{ fontSize: 11, color: "#7a8c74", alignSelf: "center" }}>hrs</span>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(entry.run.id, entry.task.id, entry.hours)}
                          style={{ background: entry.hours > 0 ? "#f0f8eb" : "#f8faf6", border: `1px solid ${entry.hours > 0 ? "#c8e0b8" : "#e0ead8"}`, borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: entry.hours > 0 ? 700 : 400, color: entry.hours > 0 ? "#2e5c1e" : "#aabba0", cursor: "pointer", fontFamily: "inherit" }}>
                          {entry.hours > 0 ? `${entry.hours} hrs` : "+ add"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Weekly totals summary */}
      {sortedWeeks.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "16px 20px", marginTop: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1e2d1a", marginBottom: 12 }}>Total Labor by Week</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sortedWeeks.map(wk => {
              const hrs = weekMap[wk].reduce((s, e) => s + e.hours, 0);
              const isNow = wk === nowWeek;
              return (
                <div key={wk} style={{ textAlign: "center", minWidth: 52 }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: isNow ? "#7fb069" : "#aabba0", marginBottom: 3 }}>Wk {wk}</div>
                  <div style={{ height: 48, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ width: 32, background: hrs > 0 ? (isNow ? "#7fb069" : "#4a90d9") : "#f0f5ee", borderRadius: "4px 4px 0 0", height: `${Math.max(4, (hrs / maxHrs) * 44)}px`, transition: "height .3s" }} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: hrs > 0 ? "#1e2d1a" : "#e0ead8", marginTop: 3 }}>{hrs > 0 ? hrs : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ENHANCED CALENDAR VIEW ────────────────────────────────────────────────────
export function CalendarView({ runs, currentYear }) {
  const [expandedWeek, setExpandedWeek] = useState(null);
  const nowWeek = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  })();

  const EVENT_TYPES = {
    seed:      { label: "Seed/Stick",  icon: "🌱", color: "#8e44ad" },
    transplant:{ label: "Transplant",  icon: "🪴", color: "#4a90d9" },
    moveout:   { label: "Move Out",    icon: "🌤", color: "#c8791a" },
    ready:     { label: "Ready",       icon: "✅", color: "#7fb069" },
  };

  function eventsForWeek(week) {
    const events = [];
    runs.forEach(run => {
      const s = computeSchedule(run);
      if (!s) return;
      if (s.seed?.week === week && s.seed?.year === currentYear)           events.push({ type: "seed",      run });
      if (s.transplant?.week === week && s.transplant?.year === currentYear) events.push({ type: "transplant", run });
      if (s.moveOut?.week === week && s.moveOut?.year === currentYear)     events.push({ type: "moveout",   run });
      if (s.ready?.week === week && s.ready?.year === currentYear)         events.push({ type: "ready",     run });
    });
    return events;
  }

  // Group weeks into months (approximate)
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function weekToMonth(week) {
    return Math.floor((week - 1) / 4.33);
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        {/* Month labels */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 2, padding: "8px 8px 0", minWidth: 780, background: "#f8faf6" }}>
          {MONTH_NAMES.map((m, i) => (
            <div key={m} style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, textAlign: "center", gridColumn: `${Math.ceil(i * 52/12 / 4) + 1}` }}>{m}</div>
          ))}
        </div>

        {/* Week grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 3, padding: "4px 8px 8px", minWidth: 780 }}>
          {Array.from({ length: 52 }, (_, i) => i + 1).map(week => {
            const events = eventsForWeek(week);
            const isNow = week === nowWeek;
            const isExpanded = expandedWeek === week;
            return (
              <div key={week}
                onClick={() => setExpandedWeek(isExpanded ? null : week)}
                style={{ background: isNow ? "#f0f8eb" : events.length > 0 ? "#fafcf8" : "#fff", borderRadius: 7, border: `1.5px solid ${isNow ? "#7fb069" : events.length > 0 ? "#c8d8c0" : "#e8ede4"}`, padding: "6px 5px", minHeight: 64, cursor: events.length > 0 ? "pointer" : "default", transition: "all .15s", position: "relative" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: isNow ? "#2e5c1e" : "#aabba0", marginBottom: 4, textAlign: "center" }}>
                  {week}
                  {isNow && <div style={{ fontSize: 8, color: "#7fb069" }}>NOW</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {events.slice(0, 3).map((ev, i) => {
                    const et = EVENT_TYPES[ev.type];
                    return (
                      <div key={i} style={{ background: et.color + "15", border: `1px solid ${et.color}30`, borderRadius: 3, padding: "1px 3px", fontSize: 8, fontWeight: 700, color: et.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {et.icon} {ev.run.cropName}
                      </div>
                    );
                  })}
                  {events.length > 3 && <div style={{ fontSize: 8, color: "#aabba0", textAlign: "center" }}>+{events.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded week detail */}
      {expandedWeek && (() => {
        const events = eventsForWeek(expandedWeek);
        return (
          <div style={{ borderTop: "1.5px solid #e0ead8", padding: "16px 20px", background: "#fafcf8" }}>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 12 }}>
              Week {expandedWeek} — {events.length} event{events.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {events.map((ev, i) => {
                const et = EVENT_TYPES[ev.type];
                const s = computeSchedule(ev.run);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fff", borderRadius: 8, border: `1.5px solid ${et.color}30` }}>
                    <span style={{ fontSize: 18 }}>{et.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{ev.run.cropName}</div>
                      <div style={{ fontSize: 11, color: "#7a8c74" }}>
                        {et.label}
                        {ev.run.cases && ` · ${ev.run.cases} cases`}
                        {s?.ready && ` · Ready Wk ${s.ready.week}`}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, background: et.color + "20", color: et.color, padding: "2px 8px", borderRadius: 6 }}>{et.label}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setExpandedWeek(null)} style={{ marginTop: 10, background: "none", border: "none", fontSize: 12, color: "#aabba0", cursor: "pointer", fontFamily: "inherit" }}>× Close</button>
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, padding: "10px 16px", borderTop: "1.5px solid #e0ead8", background: "#f8faf6", flexWrap: "wrap" }}>
        {Object.entries(EVENT_TYPES).map(([type, et]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7a8c74" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: et.color + "20", border: `1.5px solid ${et.color}` }} />
            {et.icon} {et.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 10, color: "#aabba0" }}>Click any week to expand details</div>
      </div>
    </div>
  );
}
