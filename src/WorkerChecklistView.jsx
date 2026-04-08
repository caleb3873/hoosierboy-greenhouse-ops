import { useMemo, useState, useEffect } from "react";
import { useManagerTasks, useFlags, useCropRuns } from "./supabase";
import { useAuth } from "./Auth";
import { CompletionPromptModal } from "./ManagerTasksView";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const GREEN_DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";

function getWeekInfo(date = new Date()) {
  const year = date.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.ceil((date - s) / (7 * 86400000));
  return { week, year };
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function WorkerChecklistView({ onSwitchMode, onBackToApp, onOpenTaskCreator }) {
  const { rows: tasks, upsert, refresh } = useManagerTasks();
  const { rows: runs } = useCropRuns();
  const { upsert: upsertFlag } = useFlags();
  const { displayName } = useAuth();
  const today = useMemo(() => getWeekInfo(), []);
  const [showDone, setShowDone] = useState(false);
  const [completingTask, setCompletingTask] = useState(null);
  const [flagging, setFlagging] = useState(false);

  const weekTasks = useMemo(() => {
    const r = tasks.filter(t => t.year === today.year && t.weekNumber === today.week && (t.category || "production") === "growing");
    return [...r].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, today]);

  const pending = weekTasks.filter(t => t.status !== "completed");
  const done = weekTasks.filter(t => t.status === "completed");
  const visible = showDone ? done : pending;

  // Carryover stale growing tasks
  useEffect(() => {
    if (!tasks.length) return;
    const stale = tasks.filter(t =>
      (t.category || "production") === "growing" &&
      t.status !== "completed" &&
      (t.year < today.year || (t.year === today.year && t.weekNumber < today.week))
    );
    stale.forEach(t => {
      upsert({ ...t, year: today.year, weekNumber: today.week, carriedOver: true });
    });
  }, [tasks.length]); // eslint-disable-line

  async function handleCheck(task) {
    if (task.status === "completed") {
      await upsert({ ...task, status: "pending", completedBy: null, completedAt: null });
      refresh();
      return;
    }
    setCompletingTask(task);
  }

  async function finishCompletion(notes, photo) {
    if (!completingTask) return;
    const photos = photo ? [...(completingTask.photos || []), photo] : (completingTask.photos || []);
    const combinedNotes = notes ? ((completingTask.notes ? completingTask.notes + "\n" : "") + notes) : completingTask.notes;
    await upsert({
      ...completingTask,
      status: "completed",
      completedBy: displayName || "Worker",
      completedAt: new Date().toISOString(),
      notes: combinedNotes,
      photos,
    });
    setCompletingTask(null);
    refresh();
  }

  const SECTIONS = [
    { id: "today",          label: "Today" },
    { id: "tomorrow",       label: "Tomorrow" },
    { id: "check_tomorrow", label: "Day After" },
    { id: "this_week",      label: "This Week" },
  ];

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: GREEN_DARK, color: "#fff", paddingBottom: 100 }}>
      <div style={{ padding: "14px 14px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>Hi {displayName}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: CREAM }}>This Week's Tasks</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {onOpenTaskCreator && (
            <button onClick={onOpenTaskCreator} style={{ background: GREEN, border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
              + Tasks
            </button>
          )}
          {onBackToApp && (
            <button onClick={onBackToApp} style={{ background: GREEN, border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
              App →
            </button>
          )}
          <button onClick={onSwitchMode} style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "6px 12px", borderRadius: 6, cursor: "pointer", ...FONT }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        {[
          { k: false, label: `To Do (${pending.length})` },
          { k: true, label: `Done (${done.length})` },
        ].map(t => (
          <button key={String(t.k)} onClick={() => setShowDone(t.k)}
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${GREEN}66`,
              background: showDone === t.k ? GREEN : "transparent",
              color: showDone === t.k ? GREEN_DARK : CREAM,
              fontWeight: 600, ...FONT,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "0 12px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#6a8a5a" }}>
            {showDone ? "Nothing completed yet." : "No growing tasks assigned yet."}
          </div>
        )}

        {visible.length > 0 && SECTIONS.map(section => {
          const sectionTasks = visible.filter(t => (t.bucket || "today") === section.id);
          if (sectionTasks.length === 0) return null;
          return (
            <div key={section.id} style={{ marginBottom: 18 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, fontWeight: 800, color: CREAM, textTransform: "uppercase",
                letterSpacing: 1.2, margin: "8px 4px 10px",
              }}>
                <span>{section.label}</span>
                <div style={{ flex: 1, height: 2, background: GREEN, borderRadius: 1 }} />
                <span style={{ background: GREEN, color: GREEN_DARK, borderRadius: 999, padding: "2px 10px", fontSize: 11 }}>{sectionTasks.length}</span>
              </div>
              {sectionTasks.map(task => {
                const completed = task.status === "completed";
                const overdue = !!task.carriedOver && !completed;
                return (
                  <div key={task.id} onClick={() => handleCheck(task)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 14,
                      background: completed ? "#2a3a24" : overdue ? "#3a1e18" : "#263821",
                      border: `1px solid ${overdue ? RED : GREEN + "44"}`,
                      boxShadow: overdue ? `0 0 0 2px ${RED}33` : "none",
                      borderRadius: 10, padding: 16, marginBottom: 10, cursor: "pointer",
                    }}>
                    <div style={{
                      width: 32, height: 32, minWidth: 32, borderRadius: 8,
                      border: `2px solid ${GREEN}`,
                      background: completed ? GREEN : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: GREEN_DARK, fontSize: 20, fontWeight: 700,
                    }}>
                      {completed ? "✓" : ""}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: overdue ? "#ffb3a8" : CREAM, textDecoration: completed ? "line-through" : "none", opacity: completed ? 0.7 : 1 }}>
                          {task.title}
                        </div>
                        {overdue && <span style={{ background: RED, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>OVERDUE</span>}
                      </div>
                      {task.description && (
                        <div style={{ fontSize: 13, color: "#9cb894", marginTop: 4 }}>{task.description}</div>
                      )}
                      {task.notes && (
                        <div style={{ fontSize: 12, color: "#9cb894", marginTop: 4, fontStyle: "italic" }}>📝 {task.notes}</div>
                      )}
                      {completed && (
                        <div style={{ fontSize: 12, color: GREEN, marginTop: 6 }}>
                          ✓ {task.completedBy} — {formatTime(task.completedAt)}
                        </div>
                      )}
                      {Array.isArray(task.photos) && task.photos.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {task.photos.map((p, i) => (
                            <img key={i} src={p} alt="" style={{ width: 60, height: 60, borderRadius: 6, objectFit: "cover" }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Floating flag button */}
      <button onClick={() => setFlagging(true)}
        style={{
          position: "fixed", bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28,
          background: "#c03030", border: "3px solid #fff", color: "#fff", fontSize: 22,
          cursor: "pointer", boxShadow: "0 4px 20px rgba(192,48,48,.4)", zIndex: 200,
        }}>
        ⚑
      </button>

      {completingTask && (
        <CompletionPromptModal
          task={completingTask}
          onCancel={() => setCompletingTask(null)}
          onSave={finishCompletion}
        />
      )}

      {flagging && (
        <WorkerFlagModal
          runs={runs}
          reportedBy={displayName || "Worker"}
          onCancel={() => setFlagging(false)}
          onSubmit={async f => { await upsertFlag({ ...f, id: crypto.randomUUID(), createdAt: new Date().toISOString(), resolved: false, reportedBy: displayName || "Worker" }); setFlagging(false); }}
        />
      )}
    </div>
  );
}

// ── Flag modal ────────────────────────────────────────────────────────────────
function WorkerFlagModal({ runs, onCancel, onSubmit }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [runId, setRunId] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [photo, setPhoto] = useState(null);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), details, runId: runId || null, severity, photo });
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 500,
        maxHeight: "90vh", overflowY: "auto", color: "#1e2d1a",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Flag a Problem</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 26, color: "#7a8c74", cursor: "pointer" }}>&times;</button>
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What's the issue?"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, outline: "none" }} />

        <textarea value={details} onChange={e => setDetails(e.target.value)} placeholder="More detail (optional)"
          style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 10, outline: "none" }} />

        <select value={runId} onChange={e => setRunId(e.target.value)}
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", marginBottom: 10, background: "#fff" }}>
          <option value="">— Related crop run (optional) —</option>
          {runs?.map(r => <option key={r.id} value={r.id}>{r.cropName} {r.code ? `(${r.code})` : ""}</option>)}
        </select>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["low","medium","high"].map(s => (
            <button key={s} onClick={() => setSeverity(s)}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 8, border: `1.5px solid ${severity === s ? "#1e2d1a" : "#c8d8c0"}`,
                background: severity === s ? "#1e2d1a" : "#f2f5ef", color: severity === s ? "#c8e6b8" : "#7a8c74",
                fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "capitalize", fontFamily: "inherit",
              }}>{s}</button>
          ))}
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
          {photo ? (
            <img src={photo} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10 }} />
          ) : (
            <div style={{ padding: 14, borderRadius: 10, border: "1.5px dashed #c8d8c0", textAlign: "center", color: "#7a8c74", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              📷 Take Photo (optional)
            </div>
          )}
        </label>

        <button onClick={submit} disabled={!title.trim()}
          style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: title.trim() ? "#c03030" : "#c8d8c0", color: "#fff", fontSize: 15, fontWeight: 800, cursor: title.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
          Submit Flag
        </button>
      </div>
    </div>
  );
}
