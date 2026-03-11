// Full operator view — content from operator-view.jsx
// The onSwitchMode prop is passed in from App.jsx

import { useState, useRef } from "react";
import { computeSchedule, getCurrentWeek, FLAG_TYPES, uid } from "./shared";
import { useCropRuns, useFlags, useContainers, useHouses, usePads } from "./supabase";
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
  const tc = TASK_COLORS[task.type] || TASK_COLORS.manual;
  const timing = task.diff === 0 ? "THIS WEEK" : task.diff < 0 ? "OVERDUE" : "NEXT WEEK";
  const timingColor = task.diff < 0 ? "#c03030" : task.diff === 0 ? "#2e7a2e" : "#8a9a80";

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
      <button onClick={() => { setDone(true); setTimeout(() => onComplete?.(task.id), 400); }} disabled={done}
        style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: done ? "#c8d8c0" : "#1a2a1a", color: done ? "#8a9a80" : "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: done ? "default" : "pointer", fontFamily: "inherit" }}>
        {done ? "Done" : "Mark Complete"}
      </button>
    </div>
  );
}

function FlagForm({ runs, onSubmit, onCancel }) {
  const [type, setType]    = useState("pest");
  const [runId, setRunId]  = useState("");
  const [location, setLoc] = useState("");
  const [notes, setNotes]  = useState("");
  const ft = FLAG_TYPES.find(f => f.id === type);

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
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e4eed8", background: "#fafcf8", fontSize: 14, color: "#1a2a1a", marginBottom: 20, fontFamily: "inherit", minHeight: 80, resize: "vertical", boxSizing: "border-box" }} />
      <button onClick={() => onSubmit({ id: uid(), type, runId, location, notes, ts: new Date().toISOString(), resolved: false })}
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
  const { rows: containers, upsert: upsertContainer } = useContainers();
  const { rows: houses,     upsert: upsertHouse }     = useHouses();
  const { rows: pads,       upsert: upsertPad }       = usePads();

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
    { id: "containers", label: "Containers", count: 0 },
    { id: "facilities", label: "Facilities", count: 0 },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ background: "#1a2a1a", padding: "16px 20px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: "#6a8a5a", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Hoosier Boy</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#e8f4d8", fontFamily: "'DM Serif Display',Georgia,serif" }}>Floor View</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#6a8a5a" }}>Week {CURRENT_WEEK}</div>
              <div style={{ fontSize: 12, color: "#c8e6b8", fontWeight: 700 }}>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
            </div>
            <button onClick={onSwitchMode} style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, padding: "5px 10px", color: "#6a8a5a", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Switch</button>
          </div>
        </div>
        <div style={{ display: "flex", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flexShrink: 0, padding: "9px 12px", background: "none", border: "none", borderBottom: `3px solid ${tab === t.id ? "#7fb069" : "transparent"}`, color: tab === t.id ? "#c8e6b8" : "#6a8a5a", fontWeight: tab === t.id ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {t.label}{t.count > 0 && <span style={{ marginLeft: 4, background: tab === t.id ? "#7fb069" : "#3a4a3a", color: tab === t.id ? "#1a2a1a" : "#6a8a5a", borderRadius: 20, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{t.count}</span>}
            </button>
          ))}
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
      <button onClick={() => f.name.trim() && onSave({ ...f, id: uid() })} disabled={!f.name.trim()}
        style={{ width: "100%", padding: "14px", borderRadius: 10, border: "none", background: "#c8791a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", opacity: f.name.trim() ? 1 : 0.5 }}>
        Save Pad
      </button>
    </div>
  );
}
