import React, { useState, useMemo } from "react";
import { useSeasonTargets, usePlanningEods, useCropRuns } from "./supabase";
import { uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

const METRICS = [
  { id: "created",   label: "Runs Created",     desc: "Crop runs entered in system" },
  { id: "sourced",   label: "Sourcing Assigned", desc: "Broker & supplier assigned" },
  { id: "ordered",   label: "Orders Placed",     desc: "POs sent to brokers" },
  { id: "confirmed", label: "Confirmed",         desc: "Broker confirmed availability" },
];

function FL({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{children}</label>;
}

function inputStyle() {
  return { width: "100%", padding: "10px 12px", border: "1.5px solid #d0d8c8", borderRadius: 10, fontFamily: FONT, fontSize: 14, boxSizing: "border-box" };
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}

function statusColor(daysLeft, pctProgress, pctTarget) {
  if (daysLeft < 0) return "#c03030"; // overdue
  const pace = pctTarget > 0 ? pctProgress / pctTarget : 1;
  if (pace >= 0.9) return "#4a7a35"; // on track
  if (pace >= 0.6) return "#c8791a"; // falling behind
  return "#c03030"; // way behind
}

function calcProgress(runs, metric) {
  if (!runs.length) return 0;
  let count = 0;
  if (metric === "created") count = runs.length;
  if (metric === "sourced") count = runs.filter(r => r.sourcingBroker || r.sourcingSupplier).length;
  if (metric === "ordered") count = runs.filter(r => ["ordered", "confirmed", "growing", "propagating", "outside", "ready", "shipped"].includes(r.status)).length;
  if (metric === "confirmed") count = runs.filter(r => ["confirmed", "growing", "propagating", "outside", "ready", "shipped"].includes(r.status)).length;
  return Math.round((count / runs.length) * 100);
}

export default function SeasonDeadlines() {
  const { rows: targets, insert: insertTarget, update: updateTarget, remove: removeTarget } = useSeasonTargets();
  const { rows: eods, insert: insertEod, update: updateEod, remove: removeEod } = usePlanningEods();
  const { rows: runs } = useCropRuns();

  const [showNewTarget, setShowNewTarget] = useState(false);
  const [showNewEod, setShowNewEod] = useState(false);
  const [targetForm, setTargetForm] = useState({ season: "", label: "", targetDate: "", targetPct: 80, metric: "ordered", notes: "" });
  const [eodForm, setEodForm] = useState({ title: "", dueDate: "", broker: "", crop: "", season: "", notes: "" });

  // Group targets by season
  const seasons = useMemo(() => {
    const map = {};
    targets.forEach(t => {
      if (!map[t.season]) map[t.season] = [];
      map[t.season].push(t);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate)));
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [targets]);

  const activeEods = useMemo(() => eods.filter(e => !e.completed).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)), [eods]);
  const completedEods = useMemo(() => eods.filter(e => e.completed).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)), [eods]);

  const saveTarget = async () => {
    if (!targetForm.season || !targetForm.label || !targetForm.targetDate) return;
    await insertTarget({ id: uid(), ...targetForm });
    setTargetForm({ season: "", label: "", targetDate: "", targetPct: 80, metric: "ordered", notes: "" });
    setShowNewTarget(false);
  };

  const saveEod = async () => {
    if (!eodForm.title || !eodForm.dueDate) return;
    await insertEod({ id: uid(), ...eodForm });
    setEodForm({ title: "", dueDate: "", broker: "", crop: "", season: "", notes: "" });
    setShowNewEod(false);
  };

  const toggleEod = async (eod) => {
    await updateEod(eod.id, { completed: !eod.completed, completedAt: eod.completed ? null : new Date().toISOString() });
  };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: 0 }}>Season Deadlines</h2>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Track ordering progress and broker EODs</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowNewTarget(true)} style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>+ Season Target</button>
          <button onClick={() => setShowNewEod(true)} style={{
            background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>+ EOD</button>
        </div>
      </div>

      {/* New Target Form */}
      {showNewTarget && (
        <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 14 }}>New Season Target</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Season</FL><input value={targetForm.season} onChange={e => setTargetForm(f => ({ ...f, season: e.target.value }))} placeholder="Spring 2027" style={inputStyle()} /></div>
            <div><FL>Milestone Label</FL><input value={targetForm.label} onChange={e => setTargetForm(f => ({ ...f, label: e.target.value }))} placeholder="80% ordered" style={inputStyle()} /></div>
            <div><FL>Target Date</FL><input type="date" value={targetForm.targetDate} onChange={e => setTargetForm(f => ({ ...f, targetDate: e.target.value }))} style={inputStyle()} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Target %</FL><input type="number" min="1" max="100" value={targetForm.targetPct} onChange={e => setTargetForm(f => ({ ...f, targetPct: parseInt(e.target.value) || 80 }))} style={inputStyle()} /></div>
            <div><FL>Metric</FL>
              <select value={targetForm.metric} onChange={e => setTargetForm(f => ({ ...f, metric: e.target.value }))} style={inputStyle()}>
                {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div><FL>Notes</FL><input value={targetForm.notes} onChange={e => setTargetForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveTarget} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Save Target</button>
            <button onClick={() => setShowNewTarget(false)} style={{ background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          </div>
        </div>
      )}

      {/* New EOD Form */}
      {showNewEod && (
        <div style={{ background: "#fff", border: "1.5px solid #b0c8e8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 14 }}>New Broker EOD</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Deadline Title</FL><input value={eodForm.title} onChange={e => setEodForm(f => ({ ...f, title: e.target.value }))} placeholder="All Ball Seed orders finalized" style={inputStyle()} /></div>
            <div><FL>Due Date</FL><input type="date" value={eodForm.dueDate} onChange={e => setEodForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle()} /></div>
            <div><FL>Broker</FL><input value={eodForm.broker} onChange={e => setEodForm(f => ({ ...f, broker: e.target.value }))} placeholder="Ball Seed" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Crop (optional)</FL><input value={eodForm.crop} onChange={e => setEodForm(f => ({ ...f, crop: e.target.value }))} placeholder="All" style={inputStyle()} /></div>
            <div><FL>Season</FL><input value={eodForm.season} onChange={e => setEodForm(f => ({ ...f, season: e.target.value }))} placeholder="Spring 2027" style={inputStyle()} /></div>
            <div><FL>Notes</FL><input value={eodForm.notes} onChange={e => setEodForm(f => ({ ...f, notes: e.target.value }))} placeholder="From broker rep" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEod} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Save EOD</button>
            <button onClick={() => setShowNewEod(false)} style={{ background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Season Targets */}
      {seasons.map(([season, tgts]) => (
        <div key={season} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 12 }}>{season}</div>
          <div style={{ display: "grid", gap: 10 }}>
            {tgts.map(t => {
              const progress = calcProgress(runs, t.metric);
              const days = daysUntil(t.targetDate);
              const color = statusColor(days, progress, t.targetPct);
              const metricLabel = METRICS.find(m => m.id === t.metric)?.label || t.metric;
              return (
                <div key={t.id} style={{ background: "#fff", border: `1.5px solid ${color}33`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "#7a8c74" }}>{metricLabel} — target {t.targetPct}% by {new Date(t.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color }}>{days > 0 ? days : 0}</div>
                      <div style={{ fontSize: 10, color: "#7a8c74" }}>{days > 0 ? "days left" : days === 0 ? "TODAY" : `${Math.abs(days)}d overdue`}</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, background: "#e8ede4", borderRadius: 6, height: 10, overflow: "hidden", position: "relative" }}>
                      {/* Target marker */}
                      <div style={{ position: "absolute", left: `${t.targetPct}%`, top: 0, bottom: 0, width: 2, background: "#1e2d1a", zIndex: 1 }} />
                      <div style={{ background: color, height: "100%", borderRadius: 6, width: `${Math.min(progress, 100)}%`, transition: "width 0.4s ease" }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color, minWidth: 45, textAlign: "right" }}>{progress}%</div>
                  </div>
                  {t.notes && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>{t.notes}</div>}
                  <button onClick={() => removeTarget(t.id)} style={{ marginTop: 6, background: "none", border: "none", color: "#c8d8c0", fontSize: 11, cursor: "pointer", fontFamily: FONT, padding: 0 }}>Remove</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {seasons.length === 0 && !showNewTarget && (
        <div style={{ textAlign: "center", padding: 40, color: "#7a8c74", background: "#fafcf8", borderRadius: 16, border: "2px dashed #c8d8c0", marginBottom: 24 }}>
          No season targets yet. Click "+ Season Target" to set your first milestone.
        </div>
      )}

      {/* EODs Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 12 }}>Broker EODs</div>

        {activeEods.length === 0 && completedEods.length === 0 && !showNewEod && (
          <div style={{ textAlign: "center", padding: 32, color: "#7a8c74", background: "#fafcf8", borderRadius: 12, border: "2px dashed #c8d8c0" }}>
            No broker EODs set. Click "+ EOD" to add a deadline.
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {activeEods.map(eod => {
            const days = daysUntil(eod.dueDate);
            const color = days < 0 ? "#c03030" : days <= 3 ? "#c8791a" : days <= 7 ? "#4a90d9" : "#7a8c74";
            return (
              <div key={eod.id} onClick={() => toggleEod(eod)} style={{
                background: "#fff", border: `1.5px solid ${color}33`, borderLeft: `4px solid ${color}`,
                borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, border: `2px solid ${color}`, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{eod.title}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {eod.broker && `${eod.broker} · `}
                    {eod.crop && `${eod.crop} · `}
                    {new Date(eod.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color }}>{days > 0 ? days : 0}</div>
                  <div style={{ fontSize: 9, color: "#7a8c74" }}>{days > 0 ? "days" : days === 0 ? "TODAY" : "OVERDUE"}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); removeEod(eod.id); }} style={{ background: "none", border: "none", color: "#c8d8c0", fontSize: 14, cursor: "pointer" }}>x</button>
              </div>
            );
          })}
        </div>

        {completedEods.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#7a8c74", marginBottom: 6 }}>Completed</div>
            {completedEods.slice(0, 5).map(eod => (
              <div key={eod.id} onClick={() => toggleEod(eod)} style={{
                background: "#fafcf8", border: "1px solid #e8e8e0", borderRadius: 8,
                padding: "8px 14px", marginBottom: 4, cursor: "pointer", opacity: 0.6,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: ACCENT, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</div>
                <div style={{ flex: 1, fontSize: 13, color: DARK, textDecoration: "line-through" }}>{eod.title}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{eod.broker}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
