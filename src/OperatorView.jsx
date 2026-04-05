// Full operator view — content from operator-view.jsx
// The onSwitchMode prop is passed in from App.jsx

import { useState, useRef } from "react";
import { computeSchedule, getCurrentWeek, FLAG_TYPES, uid } from "./shared";
import { useCropRuns, useFlags, useContainers, useHouses, usePads, useMaintenanceRequests } from "./supabase";
import { OperatorReceiving } from "./Receiving";

const CURRENT_WEEK = getCurrentWeek();
const CURRENT_YEAR = new Date().getFullYear();

const STATUS_META = {
  planned:     { label: "Planned",     color: "#8a9a80", dot: "#c8d8c0" },
  propagating: { label: "Propagating", color: "#8e44ad", dot: "#c8a8e8" },
  growing:     { label: "Growing",     color: "#2e7d9e", dot: "#90c8e8" },
  outside:     { label: "Outside",     color: "#c8791a", dot: "#f0c080" },
  ready:       { label: "Ready",       color: "#2e7a2e", dot: "#7fb069" },
  shipped:     { label: "Shipped",     color: "#4a4a4a", dot: "#a0a0a0" },
};

const TASK_COLORS = {
  seed:       { bg: "#f5f0ff", border: "#c8a8e8", text: "#6a2a9e", label: "PROPAGATE" },
  transplant: { bg: "#e8f4ff", border: "#90c0e8", text: "#1e5a8e", label: "TRANSPLANT" },
  moveout:    { bg: "#fff4e0", border: "#f0c070", text: "#8e5010", label: "MOVE OUT"  },
  ready:      { bg: "#e8f8e8", border: "#90d890", text: "#1e6e1e", label: "SHIP"      },
  manual:     { bg: "#f8f8f0", border: "#c8c8a0", text: "#5a5a30", label: "TASK"      },
};

function getAutoTasks(run) {
  const sched = computeSchedule(run);
  if (!sched) return [];
  const loc = run.indoorAssignments?.[0];
  const locStr = loc ? `${loc.structureName}${loc.zoneName ? " / " + loc.zoneName : ""}${loc.itemName ? " / " + loc.itemName : ""}` : "Unassigned";
  const tasks = [];

  const check = (event, label, type) => {
    if (!event) return;
    const diff = (event.year - CURRENT_YEAR) * 52 + event.week - CURRENT_WEEK;
    if (diff >= -1 && diff <= 1) {
      tasks.push({ id: `${run.id}-${type}`, runId: run.id, cropName: run.cropName, groupNumber: run.groupNumber, type, label, week: event.week, year: event.year, diff, location: locStr, varieties: run.varieties || [], auto: true });
    }
  };

  check(sched.seed,       "Order / start propagation",      "seed");
  check(sched.transplant, "Transplant to finish containers", "transplant");
  check(sched.moveOut,    "Move outside",                   "moveout");
  check(sched.ready,      "Ready to ship",                  "ready");
  return tasks;
}

function TaskCard({ task, onComplete }) {
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState(null); // null | "complete" | "handoff"
  const [photo, setPhoto] = useState(null);
  const [handoffNotes, setHandoffNotes] = useState("");
  const tc = TASK_COLORS[task.type] || TASK_COLORS.manual;
  const timing = task.diff === 0 ? "THIS WEEK" : task.diff < 0 ? "OVERDUE" : "NEXT WEEK";
  const timingColor = task.diff < 0 ? "#c03030" : task.diff === 0 ? "#2e7a2e" : "#8a9a80";

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  function submitComplete() {
    setDone(true);
    setTimeout(() => onComplete?.(task.id, { status: "complete", photo, ts: new Date().toISOString() }), 400);
  }

  function submitHandoff() {
    setDone(true);
    setTimeout(() => onComplete?.(task.id, { status: "handoff", photo, handoffNotes, ts: new Date().toISOString() }), 400);
  }

  return (
    <div style={{ background: done ? "#f0f5ee" : tc.bg, border: `1.5px solid ${done ? "#c8d8c0" : tc.border}`, borderRadius: 16, padding: "16px 18px", opacity: done ? .5 : 1, transition: "all .3s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ background: tc.text + "18", color: tc.text, border: `1px solid ${tc.text}30`, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>{tc.label}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: timingColor, letterSpacing: .8 }}>{timing}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", marginBottom: 4, fontFamily: "'DM Serif Display',Georgia,serif" }}>
        {task.cropName}
        {task.groupNumber && <span style={{ fontSize: 12, fontWeight: 600, color: "#8a9a80", marginLeft: 8 }}>Grp {task.groupNumber}</span>}
      </div>
      <div style={{ fontSize: 14, color: tc.text, fontWeight: 600, marginBottom: 10 }}>{task.label}</div>
      {task.location && task.location !== "Unassigned" && (
        <div style={{ fontSize: 12, color: "#6a7a60", background: "#fff", borderRadius: 8, padding: "6px 10px", marginBottom: 12, border: "1px solid #e0ead8" }}>{task.location}</div>
      )}
      {task.varieties?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {task.varieties.map(v => (
            <span key={v.id} style={{ background: "#fff", border: "1px solid #e0ead8", borderRadius: 20, padding: "2px 10px", fontSize: 11, color: "#4a5a40" }}>{v.name || v.cultivar}</span>
          ))}
        </div>
      )}

      {/* Handoff notes from previous shift */}
      {task.handoffNotes && (
        <div style={{ background: "#fff4e8", border: "1px solid #e8d0a0", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 }}>Handoff Note</div>
          <div style={{ fontSize: 13, color: "#6a4a20" }}>{task.handoffNotes}</div>
          {task.handoffPhoto && <img src={task.handoffPhoto} alt="Handoff" style={{ width: "100%", borderRadius: 8, marginTop: 8, maxHeight: 150, objectFit: "cover" }} />}
        </div>
      )}

      {!mode && !done && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("complete")}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#1a2a1a", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Complete
          </button>
          <button onClick={() => setMode("handoff")}
            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8791a", background: "#fff4e8", color: "#c8791a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Hand Off
          </button>
        </div>
      )}

      {mode === "complete" && !done && (
        <div>
          <div style={{ marginBottom: 10 }}>
            {photo ? (
              <div style={{ position: "relative" }}>
                <img src={photo} alt="Done" style={{ width: "100%", borderRadius: 10, maxHeight: 160, objectFit: "cover" }} />
                <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 26, height: 26, cursor: "pointer", fontSize: 13 }}>&times;</button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, border: "1.5px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#7a8c74" }}>
                Photo of completed work
                <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
              </label>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitComplete} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#2e7a2e", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Submit Complete
            </button>
            <button onClick={() => { setMode(null); setPhoto(null); }} style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {mode === "handoff" && !done && (
        <div>
          <textarea value={handoffNotes} onChange={e => setHandoffNotes(e.target.value)}
            placeholder="Where did you leave off? What does the next person need to know?"
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #e8d0a0", background: "#fffcf6", fontSize: 14, fontFamily: "inherit", minHeight: 70, resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
          <div style={{ marginBottom: 10 }}>
            {photo ? (
              <div style={{ position: "relative" }}>
                <img src={photo} alt="Progress" style={{ width: "100%", borderRadius: 10, maxHeight: 160, objectFit: "cover" }} />
                <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 26, height: 26, cursor: "pointer", fontSize: 13 }}>&times;</button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, border: "1.5px dashed #e8d0a0", background: "#fffcf6", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#c8791a" }}>
                Photo of current progress
                <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
              </label>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submitHandoff} disabled={!handoffNotes.trim()}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: handoffNotes.trim() ? "#c8791a" : "#e0d0c0", color: "#fff", fontSize: 14, fontWeight: 800, cursor: handoffNotes.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Submit Handoff
            </button>
            <button onClick={() => { setMode(null); setPhoto(null); setHandoffNotes(""); }} style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {done && <div style={{ textAlign: "center", padding: "12px 0", fontSize: 14, fontWeight: 800, color: "#8a9a80" }}>{mode === "handoff" ? "Handed off" : "Done"}</div>}
    </div>
  );
}

function FlagForm({ runs, onSubmit, onCancel }) {
  const [type, setType]    = useState("pest");
  const [runId, setRunId]  = useState("");
  const [location, setLoc] = useState("");
  const [notes, setNotes]  = useState("");
  const [photo, setPhoto]  = useState(null);
  const ft = FLAG_TYPES.find(f => f.id === type);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", marginBottom: 4, fontFamily: "'DM Serif Display',Georgia,serif" }}>Flag a Problem</div>
      <div style={{ fontSize: 13, color: "#8a9a80", marginBottom: 20 }}>This will be logged and visible to the planner.</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#8a9a80", textTransform: "uppercase", letterSpacing: .8, marginBottom: 8 }}>Problem Type</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
        {FLAG_TYPES.map(f => (
          <button key={f.id} onClick={() => setType(f.id)}
            style={{ padding: "12px 10px", borderRadius: 12, border: `2px solid ${type === f.id ? f.color : "#e4eed8"}`, background: type === f.id ? f.color + "12" : "#fafcf8", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: type === f.id ? f.color : "#6a7a60" }}>{f.label}</div>
          </button>
        ))}
      </div>
      <select value={runId} onChange={e => setRunId(e.target.value)} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e4eed8", background: "#fafcf8", fontSize: 14, color: "#1a2a1a", marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }}>
        <option value="">Crop (optional)</option>
        {runs.map(r => <option key={r.id} value={r.id}>{r.cropName}{r.groupNumber ? ` Grp ${r.groupNumber}` : ""}</option>)}
      </select>
      <input value={location} onChange={e => setLoc(e.target.value)} placeholder="Location (e.g. House 1, Bench A)"
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e4eed8", background: "#fafcf8", fontSize: 14, color: "#1a2a1a", marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe what you're seeing..."
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e4eed8", background: "#fafcf8", fontSize: 14, color: "#1a2a1a", marginBottom: 12, fontFamily: "inherit", minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
      {/* Photo capture */}
      <div style={{ marginBottom: 20 }}>
        {photo ? (
          <div style={{ position: "relative" }}>
            <img src={photo} alt="Flag" style={{ width: "100%", borderRadius: 12, maxHeight: 200, objectFit: "cover" }} />
            <button onClick={() => setPhoto(null)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>&times;</button>
          </div>
        ) : (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 12, border: "1.5px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "#7a8c74" }}>
            Take Photo
            <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
          </label>
        )}
      </div>
      <button onClick={() => onSubmit({ id: uid(), type, runId, location, notes, photo, ts: new Date().toISOString(), resolved: false })}
        style={{ width: "100%", padding: "15px 0", borderRadius: 12, border: "none", background: ft?.color || "#1a2a1a", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
        Submit Flag
      </button>
      <button onClick={onCancel} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1.5px solid #e4eed8", background: "none", color: "#8a9a80", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
    </div>
  );
}

const LOGO_WHITE = "https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png";

export default function OperatorView({ onSwitchMode }) {
  const { rows: runs }                                            = useCropRuns();
  const { rows: flags, upsert: upsertFlag, remove: removeFlag }  = useFlags();
  const [completedIds, setDone] = useState(new Set());
  const [tab, setTab]           = useState("tasks");
  const [flagging, setFlagging] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { rows: containers, upsert: upsertContainer } = useContainers();
  const { rows: houses,     upsert: upsertHouse }     = useHouses();
  const { rows: pads,       upsert: upsertPad }       = usePads();
  const { rows: maintenanceRequests, upsert: upsertMaintenance } = useMaintenanceRequests();

  const autoTasks = runs.flatMap(r => getAutoTasks(r)).filter(t => !completedIds.has(t.id));
  autoTasks.sort((a, b) => (a.diff ?? 99) - (b.diff ?? 99));

  const readyRuns  = runs.filter(r => r.status === "ready");
  const activeRuns = runs.filter(r => !["planned", "shipped"].includes(r.status));

  const TABS = [
    { id: "tasks",      label: "Tasks",      count: autoTasks.length },
    { id: "receiving",  label: "Receiving",  count: 0 },
    { id: "ready",      label: "Ready",      count: readyRuns.length },
    { id: "crops",      label: "Crops",      count: activeRuns.length },
    { id: "flags",      label: "Flags",      count: flags.filter(f => !f.resolved).length },
    { id: "containers",  label: "Containers",  count: 0 },
    { id: "facilities",  label: "Facilities",  count: 0 },
    { id: "maintenance", label: "🔧 Repairs",  count: maintenanceRequests.filter(r => r.status === "open" || r.status === "in_progress").length },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* ── SLIDE-OUT DRAWER BACKDROP ── */}
      {drawerOpen && (
        <div onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />
      )}

      {/* ── SLIDE-OUT DRAWER ── */}
      <div style={{ position: "fixed", top: 0, left: drawerOpen ? 0 : "-280px", width: 260, bottom: 0, background: "#1a2a1a", zIndex: 300, transition: "left .25s ease", display: "flex", flexDirection: "column", boxShadow: drawerOpen ? "4px 0 20px rgba(0,0,0,0.4)" : "none" }}>
        {/* Drawer header */}
        <div style={{ padding: "20px 20px 14px", borderBottom: "1px solid #2a3a2a" }}>
          <div style={{ fontSize: 10, color: "#6a8a5a", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>Hoosier Boy</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#e8f4d8", fontFamily: "'DM Serif Display',Georgia,serif" }}>Floor View</div>
          <div style={{ fontSize: 11, color: "#6a8a5a", marginTop: 4 }}>Week {CURRENT_WEEK} · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
        {/* Nav items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 0" }}>
          {TABS.map(t => {
            const isActive = tab === t.id;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setDrawerOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", background: isActive ? "#2e4a22" : "none", border: "none", borderLeft: `3px solid ${isActive ? "#7fb069" : "transparent"}`, color: isActive ? "#c8e6b8" : "#8a9a80", fontWeight: isActive ? 800 : 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .15s" }}>
                <span>{t.label}</span>
                {t.count > 0 && (
                  <span style={{ background: isActive ? "#7fb069" : "#3a4a3a", color: isActive ? "#1a2a1a" : "#8a9a80", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Drawer footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid #2a3a2a" }}>
          <button onClick={onSwitchMode} style={{ width: "100%", background: "#2a3a2a", border: "1px solid #3a4a3a", borderRadius: 8, padding: "10px 0", color: "#8a9a80", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ← Switch to Planner
          </button>
        </div>
      </div>

      {/* ── STICKY TOP BAR ── */}
      <div style={{ background: "#1a2a1a", padding: "12px 16px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Hamburger */}
          <button onClick={() => setDrawerOpen(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 24, height: 3, background: "#c8e6b8", borderRadius: 2, transition: "all .2s",
                transform: drawerOpen ? (i===0?"rotate(45deg) translate(5px,5px)":i===2?"rotate(-45deg) translate(5px,-5px)":"scaleX(0)") : "none",
                opacity: drawerOpen && i===1 ? 0 : 1 }} />
            ))}
          </button>
          {/* Current section label */}
          <div>
            <div style={{ fontSize: 11, color: "#6a8a5a", fontWeight: 700, letterSpacing: .8, textTransform: "uppercase" }}>Floor View</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f4d8", lineHeight: 1.2 }}>
              {TABS.find(t => t.id === tab)?.label || ""}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#6a8a5a" }}>Wk {CURRENT_WEEK}</div>
          <div style={{ fontSize: 12, color: "#c8e6b8", fontWeight: 700 }}>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 100px" }}>
        {tab === "tasks" && (
          autoTasks.length === 0
            ? <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 48, marginBottom: 12 }}>✓</div><div style={{ fontSize: 18, fontWeight: 800, color: "#2e5a2e" }}>All caught up</div></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {autoTasks.map(t => <TaskCard key={t.id} task={t} onComplete={id => setDone(prev => new Set([...prev, id]))} />)}
              </div>
        )}

        {tab === "receiving" && <OperatorReceiving />}

        {tab === "ready" && (
          readyRuns.length === 0
            ? <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 14, color: "#8a9a80" }}>Nothing ready yet.</div></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {readyRuns.map(run => {
                  const units = (+run.cases||0) * (+run.packSize||10);
                  const loc   = run.indoorAssignments?.[0];
                  return (
                    <div key={run.id} style={{ background: "#fff", borderRadius: 16, border: "2px solid #90d890", padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>{run.cropName}</div>
                        <span style={{ background: "#e8f8e8", color: "#1e6e1e", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 800, border: "1px solid #90d890" }}>READY</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        {[{v: units.toLocaleString(), l:"Units"},{v: run.cases, l:"Cases"}].map(s => (
                          <div key={s.l} style={{ background: "#f4faf4", borderRadius: 10, padding: "10px", textAlign: "center" }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>{s.v}</div>
                            <div style={{ fontSize: 10, color: "#8a9a80", textTransform: "uppercase" }}>{s.l}</div>
                          </div>
                        ))}
                      </div>
                      {loc && <div style={{ fontSize: 12, color: "#6a7a60", background: "#f4faf4", borderRadius: 8, padding: "7px 10px" }}>{loc.structureName}{loc.itemName ? " / " + loc.itemName : ""}</div>}
                    </div>
                  );
                })}
              </div>
        )}

        {tab === "crops" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeRuns.map(run => {
              const sm   = STATUS_META[run.status] || STATUS_META.planned;
              const loc  = run.indoorAssignments?.[0];
              const sched = computeSchedule(run);
              const wtr  = sched ? (sched.ready.year - CURRENT_YEAR) * 52 + sched.ready.week - CURRENT_WEEK : null;
              return (
                <div key={run.id} style={{ background: "#fff", border: "1.5px solid #e4eed8", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: sm.dot, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>{run.cropName}</div>
                      {loc && <div style={{ fontSize: 11, color: "#8a9a80" }}>{loc.structureName}{loc.itemName ? " / " + loc.itemName : ""}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: sm.color, background: sm.color + "15", borderRadius: 20, padding: "2px 10px" }}>{sm.label}</div>
                      {wtr != null && <div style={{ fontSize: 11, color: wtr <= 0 ? "#2e7a2e" : "#8a9a80", marginTop: 4 }}>{wtr <= 0 ? "Ready now" : `${wtr}wk to ready`}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "flags" && (<>
          {flagging
            ? <FlagForm runs={runs} onSubmit={async f => { await upsertFlag(f); setFlagging(false); }} onCancel={() => setFlagging(false)} />
            : <>
                <button onClick={() => setFlagging(true)} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "2px dashed #c8d8c0", background: "#fafcf8", color: "#6a7a60", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
                  + Flag a Problem
                </button>
                {flags.map(f => {
                  const ft  = FLAG_TYPES.find(x => x.id === f.type);
                  const run = runs.find(r => r.id === f.runId);
                  return (
                    <div key={f.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${ft?.color + "40" || "#e4eed8"}`, padding: "12px 16px", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: ft?.color }}>{ft?.label}</span>
                        {run && <span style={{ fontSize: 12, color: "#8a9a80" }}>— {run.cropName}</span>}
                      </div>
                      {f.location && <div style={{ fontSize: 12, color: "#6a7a60" }}>{f.location}</div>}
                      {f.notes    && <div style={{ fontSize: 13, color: "#4a5a40", marginTop: 4 }}>{f.notes}</div>}
                    </div>
                  );
                })}
              </>
          }
        </>)}

        {tab === "containers" && <OperatorContainers containers={containers} onUpdate={upsertContainer} />}
        {tab === "maintenance" && <OperatorMaintenance requests={maintenanceRequests} onSave={upsertMaintenance} />}
        {tab === "facilities" && <OperatorFacilities houses={houses} pads={pads} onSaveHouse={upsertHouse} onSavePad={upsertPad} />}
      </div>

      {tab !== "flags" && !flagging && (
        <button onClick={() => { setTab("flags"); setFlagging(true); }}
          style={{ position: "fixed", bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, background: "#c03030", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", boxShadow: "0 4px 20px rgba(192,48,48,.4)", zIndex: 200 }}>
          ⚑
        </button>
      )}
    </div>
  );
}

// ── OPERATOR CONTAINERS ───────────────────────────────────────────────────────
function OperatorContainers({ containers, onUpdate }) {
  const [selected, setSelected] = useState(null);
  const [countVal, setCountVal] = useState("");
  const [location, setLocation] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const fileRef                 = useRef(null);
  const [search,   setSearch]   = useState("");

  const filtered = containers.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await onUpdate({ ...selected, photo: ev.target.result });
      setSelected(c => ({ ...c, photo: ev.target.result }));
    };
    reader.readAsDataURL(file);
  }

  async function saveCount() {
    if (!selected || !countVal) return;
    setSaving(true);
    const entry = {
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      count: Number(countVal),
      location: location || "Unspecified",
    };
    const history = [...(selected.inventoryHistory || []), entry];
    await onUpdate({ ...selected, stockQty: countVal, stockLocation: location, inventoryHistory: history });
    setSelected(c => ({ ...c, stockQty: countVal, stockLocation: location, inventoryHistory: history }));
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setCountVal(""); setLocation("");
  }

  if (selected) return (
    <div>
      <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#6a8a5a", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, padding: 0 }}>← Back</button>

      {/* Photo */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e4eed8", padding: "18px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Photo</div>
        {selected.photo
          ? <div style={{ position: "relative" }}>
              <img src={selected.photo} alt={selected.name} style={{ width: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />
              <button onClick={() => fileRef.current.click()} style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.6)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📷 Replace</button>
            </div>
          : <button onClick={() => fileRef.current.click()}
              style={{ width: "100%", padding: "32px 0", borderRadius: 10, border: "2px dashed #c8d8c0", background: "#f8fbf6", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: 13, color: "#7a8c74", fontWeight: 700 }}>Tap to add photo</div>
            </button>
        }
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
      </div>

      {/* Details */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e4eed8", padding: "18px", marginBottom: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a", marginBottom: 4 }}>{selected.name}</div>
        <div style={{ fontSize: 12, color: "#8a9a80" }}>{selected.supplier || selected.vendor || "No supplier"}{selected.sku ? ` · ${selected.sku}` : ""}</div>
        {selected.stockQty && (
          <div style={{ marginTop: 10, background: "#f2f5ef", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#4a5a40" }}>
            Last count: <strong>{selected.stockQty}</strong>{selected.stockLocation ? ` at ${selected.stockLocation}` : ""}
          </div>
        )}
      </div>

      {/* Count entry */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e4eed8", padding: "18px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Log Inventory Count</div>
        <input type="number" value={countVal} onChange={e => setCountVal(e.target.value)}
          placeholder="Quantity on hand" inputMode="numeric"
          style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 }} />
        <input value={location} onChange={e => setLocation(e.target.value)}
          placeholder="Location (e.g. Warehouse shelf 3)"
          style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }} />
        <button onClick={saveCount} disabled={!countVal || saving}
          style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: saved ? "#2e7d32" : "#7fb069", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Count"}
        </button>
      </div>

      {/* History */}
      {(selected.inventoryHistory || []).length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e4eed8", padding: "18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Count History</div>
          {[...(selected.inventoryHistory || [])].reverse().map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < selected.inventoryHistory.length - 1 ? "1px solid #f0f4ee" : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a1a" }}>{h.count} units</div>
              <div style={{ fontSize: 12, color: "#8a9a80", textAlign: "right" }}>
                <div>{h.location}</div>
                <div>{h.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search containers..."
        style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: "48px 0", color: "#8a9a80", fontSize: 13 }}>No containers found.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(c => (
              <button key={c.id} onClick={() => setSelected(c)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 12, border: "1.5px solid #e4eed8", padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {c.photo
                  ? <img src={c.photo} alt={c.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: 8, background: "#f2f5ef", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🪴</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#8a9a80" }}>{c.supplier || c.vendor || "No supplier"}{c.stockQty ? ` · ${c.stockQty} in stock` : ""}</div>
                </div>
                <div style={{ fontSize: 18, color: "#c8d8c0" }}>›</div>
              </button>
            ))}
          </div>
      }
    </div>
  );
}

// ── OPERATOR FACILITIES ───────────────────────────────────────────────────────
function OperatorFacilities({ houses, pads, onSaveHouse, onSavePad }) {
  const [section, setSection] = useState("houses"); // houses | pads
  const [view,    setView]    = useState("list");    // list | add

  const uid = () => crypto.randomUUID();

  async function saveHouse(h) { await onSaveHouse({ ...h, id: h.id || uid() }); setView("list"); }
  async function savePad(p)   { await onSavePad({   ...p, id: p.id || uid() }); setView("list"); }

  if (view === "list") return (
    <div>
      {/* Section toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["houses","🏠 Houses"],["pads","☀️ Outdoor Pads"]].map(([id, lbl]) => (
          <button key={id} onClick={() => setSection(id)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${section === id ? "#7fb069" : "#c8d8c0"}`, background: section === id ? "#7fb069" : "#fff", color: section === id ? "#fff" : "#4a5a40", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {lbl}
          </button>
        ))}
      </div>

      <button onClick={() => setView("add")}
        style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
        + Add {section === "houses" ? "House" : "Outdoor Pad"}
      </button>

      {section === "houses" && (
        houses.length === 0
          ? <div style={{ textAlign: "center", padding: "40px 0", color: "#8a9a80", fontSize: 13 }}>No houses yet.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {houses.map(h => (
                <div key={h.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e4eed8", padding: "14px 16px" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a1a" }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: "#8a9a80", marginTop: 2 }}>{h.location || "No location"} · {h.indoor ? "Indoor" : "Outdoor"} · {h.active !== false ? "Active" : "Inactive"}</div>
                  {h.notes && <div style={{ fontSize: 12, color: "#6a7a60", marginTop: 6 }}>{h.notes}</div>}
                </div>
              ))}
            </div>
      )}

      {section === "pads" && (
        pads.length === 0
          ? <div style={{ textAlign: "center", padding: "40px 0", color: "#8a9a80", fontSize: 13 }}>No outdoor pads yet.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pads.map(p => (
                <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e4eed8", padding: "14px 16px" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a2a1a" }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#8a9a80", marginTop: 2 }}>
                    {p.location || "No location"}{p.lengthFt && p.widthFt ? ` · ${(Number(p.lengthFt)*Number(p.widthFt)).toLocaleString()} sq ft` : ""}
                  </div>
                  {p.notes && <div style={{ fontSize: 12, color: "#6a7a60", marginTop: 6 }}>{p.notes}</div>}
                </div>
              ))}
            </div>
      )}
    </div>
  );

  // Add view — simple mobile-friendly forms
  if (view === "add" && section === "houses") return (
    <div>
      <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#6a8a5a", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, padding: 0 }}>← Back</button>
      <SimpleHouseForm onSave={saveHouse} onCancel={() => setView("list")} />
    </div>
  );

  if (view === "add" && section === "pads") return (
    <div>
      <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#6a8a5a", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, padding: 0 }}>← Back</button>
      <SimplePadForm onSave={savePad} onCancel={() => setView("list")} />
    </div>
  );
}

// Simple mobile house form (captures essentials, planner can add zones/details later)
function SimpleHouseForm({ onSave, onCancel }) {
  const uid = () => crypto.randomUUID();
  const LOCATIONS = ["Bluff Road", "Sprague Road", "Other"];
  const [f, setF] = useState({ name: "", location: "", indoor: true, heated: false, active: true, lighting: "", notes: "", zones: [], details: {} });
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  const IS = { width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 };
  const Tog = ({ val, onChange, on, off }) => (
    <button onClick={() => onChange(!val)} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${val ? "#7fb069" : "#c8d8c0"}`, background: val ? "#f2f8ee" : "#fff", color: val ? "#4a7a30" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
      {val ? on : off}
    </button>
  );
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 16 }}>New House</div>
      <input value={f.name} onChange={e => upd("name", e.target.value)} placeholder="House name *" style={IS} />
      <select value={f.location} onChange={e => upd("location", e.target.value)} style={IS}>
        <option value="">Location</option>
        {LOCATIONS.map(l => <option key={l}>{l}</option>)}
      </select>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Tog val={f.indoor}  onChange={v => upd("indoor", v)}  on="🏠 Indoor"   off="🌤 Outdoor" />
        <Tog val={f.heated}  onChange={v => upd("heated", v)}  on="🔥 Heated"   off="❄️ Unheated" />
        <Tog val={f.active}  onChange={v => upd("active", v)}  on="✓ Active"    off="○ Inactive" />
      </div>
      <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} placeholder="Notes (optional)" rows={3}
        style={{ ...IS, resize: "vertical" }} />
      {/* Photo */}
      <div style={{ marginBottom: 12 }}>
        {f.photo ? (
          <div style={{ position: "relative" }}>
            <img src={f.photo} alt="House" style={{ width: "100%", borderRadius: 10, maxHeight: 180, objectFit: "cover" }} />
            <button onClick={() => upd("photo", null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 26, height: 26, cursor: "pointer", fontSize: 13 }}>&times;</button>
          </div>
        ) : (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, border: "1.5px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#7a8c74" }}>
            Take Photo
            <input type="file" accept="image/*" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = ev => upd("photo", ev.target.result); r.readAsDataURL(file); }} style={{ display: "none" }} />
          </label>
        )}
      </div>
      <button onClick={() => f.name.trim() && onSave({ ...f, id: uid() })} disabled={!f.name.trim()}
        style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: f.name.trim() ? 1 : 0.5 }}>
        Save House
      </button>
    </div>
  );
}

function SimplePadForm({ onSave, onCancel }) {
  const uid = () => crypto.randomUUID();
  const LOCATIONS = ["Bluff Road", "Sprague Road", "Other"];
  const SURFACES = ["Gravel", "Crushed limestone", "Concrete", "Asphalt", "Bare ground", "Weed fabric over gravel", "Other"];
  const [f, setF] = useState({ name: "", location: "", lengthFt: "", widthFt: "", surfaceMaterial: "", notes: "", active: true, bays: [] });
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  const sqFt = f.lengthFt && f.widthFt ? Number(f.lengthFt) * Number(f.widthFt) : 0;
  const IS = { width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10 };
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 16 }}>New Outdoor Pad</div>
      <input value={f.name} onChange={e => upd("name", e.target.value)} placeholder="Pad name *" style={IS} />
      <select value={f.location} onChange={e => upd("location", e.target.value)} style={IS}>
        <option value="">Location</option>
        {LOCATIONS.map(l => <option key={l}>{l}</option>)}
      </select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 0 }}>
        <input type="number" value={f.widthFt} onChange={e => upd("widthFt", e.target.value)} placeholder="Width (ft)" inputMode="decimal" style={IS} />
        <input type="number" value={f.lengthFt} onChange={e => upd("lengthFt", e.target.value)} placeholder="Length (ft)" inputMode="decimal" style={IS} />
      </div>
      {sqFt > 0 && <div style={{ background: "#fef0d8", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#8a4a10", fontWeight: 700, marginBottom: 10 }}>✓ {sqFt.toLocaleString()} sq ft</div>}
      <select value={f.surfaceMaterial} onChange={e => upd("surfaceMaterial", e.target.value)} style={IS}>
        <option value="">Surface material</option>
        {SURFACES.map(s => <option key={s}>{s}</option>)}
      </select>
      <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} placeholder="Notes (optional)" rows={3}
        style={{ ...IS, resize: "vertical" }} />
      {/* Photo */}
      <div style={{ marginBottom: 12 }}>
        {f.photo ? (
          <div style={{ position: "relative" }}>
            <img src={f.photo} alt="Pad" style={{ width: "100%", borderRadius: 10, maxHeight: 180, objectFit: "cover" }} />
            <button onClick={() => upd("photo", null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 26, height: 26, cursor: "pointer", fontSize: 13 }}>&times;</button>
          </div>
        ) : (
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, border: "1.5px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#7a8c74" }}>
            Take Photo
            <input type="file" accept="image/*" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = ev => upd("photo", ev.target.result); r.readAsDataURL(file); }} style={{ display: "none" }} />
          </label>
        )}
      </div>
      <button onClick={() => f.name.trim() && onSave({ ...f, id: uid() })} disabled={!f.name.trim()}
        style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#c8791a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: f.name.trim() ? 1 : 0.5 }}>
        Save Pad
      </button>
    </div>
  );
}

// ── OPERATOR MAINTENANCE ──────────────────────────────────────────────────────
const PRIORITY_META = {
  normal:   { label: "Normal",   color: "#7a8c74", bg: "#f4f6f2" },
  urgent:   { label: "Urgent",   color: "#c8791a", bg: "#fff4e8" },
  critical: { label: "Critical", color: "#c03030", bg: "#fff0f0" },
};

const CATEGORY_OPTIONS = [
  "Heating / HVAC", "Irrigation / Watering", "Electrical", "Structure / Roof",
  "Equipment", "Pest / Disease", "Plumbing", "Door / Gate", "Vehicle", "Other",
];

function getUrgencyColor(request) {
  if (request.status === "resolved") return "#7a8c74";
  const hoursOpen = (Date.now() - new Date(request.submittedAt || request.createdAt).getTime()) / 36e5;
  if (request.priority === "critical" || hoursOpen > 72) return "#c03030";
  if (request.priority === "urgent"   || hoursOpen > 24) return "#c8791a";
  return "#7a8c74";
}

function getUrgencyBg(request) {
  const c = getUrgencyColor(request);
  if (c === "#c03030") return "#fff5f5";
  if (c === "#c8791a") return "#fff8f0";
  return "#fff";
}

function getAgeLabel(request) {
  const ms = Date.now() - new Date(request.submittedAt || request.createdAt).getTime();
  const hrs  = Math.floor(ms / 36e5);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d open`;
  if (hrs > 0)  return `${hrs}h open`;
  return "Just submitted";
}

function OperatorMaintenance({ requests, onSave }) {
  const [view,      setView    ] = useState("list"); // list | new | detail
  const [selected,  setSelected] = useState(null);
  const [filter,    setFilter  ] = useState("open"); // open | resolved | all
  const fileRef = useRef(null);

  // New request form state
  const [form, setForm] = useState({ title: "", category: "", location: "", description: "", priority: "normal", photo: null, submittedBy: "" });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved ] = useState(false);

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = requests.filter(r => {
    if (filter === "open")     return r.status === "open" || r.status === "in_progress";
    if (filter === "resolved") return r.status === "resolved";
    return true;
  }).sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt));

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => upd("photo", ev.target.result);
    reader.readAsDataURL(file);
  }

  async function submitRequest() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({
      id: crypto.randomUUID(),
      title:       form.title.trim(),
      category:    form.category,
      location:    form.location.trim(),
      description: form.description.trim(),
      priority:    form.priority,
      photo:       form.photo,
      submittedBy: form.submittedBy.trim(),
      status:      "open",
      submittedAt: new Date().toISOString(),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => { setSaved(false); setView("list"); setForm({ title: "", category: "", location: "", description: "", priority: "normal", photo: null, submittedBy: "" }); }, 1200);
  }

  async function updateStatus(request, status) {
    await onSave({ ...request, status, resolvedAt: status === "resolved" ? new Date().toISOString() : null });
    if (selected?.id === request.id) setSelected({ ...request, status });
  }

  // ── Detail view ──
  if (view === "detail" && selected) {
    const req     = requests.find(r => r.id === selected.id) || selected;
    const urgColor = getUrgencyColor(req);
    const age      = getAgeLabel(req);
    return (
      <div>
        <button onClick={() => { setView("list"); setSelected(null); }}
          style={{ background: "none", border: "none", color: "#6a8a5a", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, padding: 0 }}>← Back</button>

        {/* Photo */}
        {req.photo && (
          <img src={req.photo} alt="Maintenance issue"
            style={{ width: "100%", borderRadius: 12, maxHeight: 240, objectFit: "cover", marginBottom: 14, border: "1.5px solid #e0ead8" }} />
        )}

        {/* Header card */}
        <div style={{ background: getUrgencyBg(req), borderRadius: 14, border: `2px solid ${urgColor}40`, padding: "16px 18px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif", flex: 1 }}>{req.title}</div>
            <span style={{ background: urgColor + "20", color: urgColor, border: `1px solid ${urgColor}40`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
              {req.status === "resolved" ? "✓ Resolved" : age}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {req.category && <span style={{ fontSize: 11, background: "#f0f5ee", color: "#4a5a40", padding: "2px 8px", borderRadius: 6 }}>{req.category}</span>}
            {req.location && <span style={{ fontSize: 11, background: "#f0f5ee", color: "#4a5a40", padding: "2px 8px", borderRadius: 6 }}>📍 {req.location}</span>}
            <span style={{ fontSize: 11, background: PRIORITY_META[req.priority]?.bg || "#f4f6f2", color: PRIORITY_META[req.priority]?.color || "#7a8c74", padding: "2px 8px", borderRadius: 6 }}>
              {PRIORITY_META[req.priority]?.label || "Normal"}
            </span>
          </div>
          {req.submittedBy && <div style={{ fontSize: 11, color: "#8a9a80", marginTop: 8 }}>Submitted by {req.submittedBy}</div>}
        </div>

        {/* Description */}
        {req.description && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 14, color: "#1a2a1a", lineHeight: 1.6 }}>{req.description}</div>
          </div>
        )}

        {/* Status actions */}
        {req.status !== "resolved" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {req.status === "open" && (
              <button onClick={() => updateStatus(req, "in_progress")}
                style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#4a90d9", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                🔧 Mark In Progress
              </button>
            )}
            <button onClick={() => updateStatus(req, "resolved")}
              style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✓ Mark Resolved
            </button>
          </div>
        )}
        {req.status === "resolved" && req.resolvedAt && (
          <div style={{ background: "#f0f8eb", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#2e5c1e", textAlign: "center" }}>
            ✓ Resolved {new Date(req.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    );
  }

  // ── New request form ──
  if (view === "new") {
    const IS = { width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, outline: "none" };
    return (
      <div>
        <button onClick={() => setView("list")}
          style={{ background: "none", border: "none", color: "#6a8a5a", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, padding: 0 }}>← Back</button>

        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a", marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>Report a Repair</div>

          {/* Photo first — most natural on mobile */}
          <div style={{ marginBottom: 12 }}>
            {form.photo ? (
              <div style={{ position: "relative", marginBottom: 10 }}>
                <img src={form.photo} alt="Issue" style={{ width: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />
                <button onClick={() => fileRef.current.click()}
                  style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,.6)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  📷 Retake
                </button>
                <button onClick={() => upd("photo", null)}
                  style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.5)", border: "none", borderRadius: 20, width: 26, height: 26, color: "#fff", fontSize: 14, cursor: "pointer" }}>×</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current.click()}
                style={{ width: "100%", padding: "24px 0", borderRadius: 10, border: "2px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>📷</div>
                <div style={{ fontSize: 13, color: "#7a8c74", fontWeight: 700 }}>Add photo of issue</div>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
          </div>

          <input value={form.title} onChange={e => upd("title", e.target.value)}
            placeholder="What needs fixing? *" style={IS} />

          <select value={form.category} onChange={e => upd("category", e.target.value)} style={IS}>
            <option value="">Category</option>
            {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
          </select>

          <input value={form.location} onChange={e => upd("location", e.target.value)}
            placeholder="Location (e.g. House 3, Bench B)" style={IS} />

          <textarea value={form.description} onChange={e => upd("description", e.target.value)}
            placeholder="Describe the issue..." rows={3}
            style={{ ...IS, resize: "vertical" }} />

          {/* Priority */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6a8a5a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>Priority</div>
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(PRIORITY_META).map(([id, meta]) => (
                <button key={id} onClick={() => upd("priority", id)}
                  style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `2px solid ${form.priority === id ? meta.color : "#e0ead8"}`, background: form.priority === id ? meta.bg : "#fff", color: form.priority === id ? meta.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <input value={form.submittedBy} onChange={e => upd("submittedBy", e.target.value)}
            placeholder="Your name (optional)" style={IS} />

          <button onClick={submitRequest} disabled={!form.title.trim() || saving}
            style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: saved ? "#2e7d32" : form.title.trim() ? "#1a2a1a" : "#c8d8c0", color: "#fff", fontWeight: 800, fontSize: 15, cursor: form.title.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            {saved ? "✓ Submitted!" : saving ? "Submitting..." : "Submit Repair Request"}
          </button>
        </div>
      </div>
    );
  }

  // ── List view ──
  const openCount = requests.filter(r => r.status === "open" || r.status === "in_progress").length;

  return (
    <div>
      <button onClick={() => setView("new")}
        style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#c03030", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
        🔧 Report a Repair
      </button>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["open","Open"], ["resolved","Resolved"], ["all","All"]].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${filter === id ? "#1a2a1a" : "#c8d8c0"}`, background: filter === id ? "#1a2a1a" : "#fff", color: filter === id ? "#c8e6b8" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {label}{id === "open" && openCount > 0 ? ` (${openCount})` : ""}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#8a9a80" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔧</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {filter === "open" ? "No open repairs" : filter === "resolved" ? "No resolved repairs" : "No requests yet"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(req => {
            const urgColor = getUrgencyColor(req);
            const age      = getAgeLabel(req);
            return (
              <div key={req.id}
                onClick={() => { setSelected(req); setView("detail"); }}
                style={{ background: getUrgencyBg(req), borderRadius: 12, border: `2px solid ${urgColor}40`, padding: "14px 16px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}>
                {req.photo && (
                  <img src={req.photo} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                )}
                {!req.photo && (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: urgColor + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🔧</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a", lineHeight: 1.3 }}>{req.title}</div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: urgColor, background: urgColor + "15", padding: "2px 7px", borderRadius: 8, flexShrink: 0, border: `1px solid ${urgColor}30` }}>
                      {req.status === "resolved" ? "✓" : age}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {req.category && <span style={{ fontSize: 10, color: "#7a8c74" }}>{req.category}</span>}
                    {req.location && <span style={{ fontSize: 10, color: "#7a8c74" }}>· 📍 {req.location}</span>}
                    {req.status === "in_progress" && <span style={{ fontSize: 10, color: "#4a90d9", fontWeight: 700 }}>· In Progress</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
