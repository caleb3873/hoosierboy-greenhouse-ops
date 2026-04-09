import { useState, useMemo, useEffect, useRef } from "react";
import { useManagerTasks } from "./supabase";
import { useAuth } from "./Auth";
import { getCurrentWeek } from "./shared";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function toISODate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Compute a target date from a bucket name based on today
export function bucketToDate(bucket, from = new Date()) {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  if (bucket === "today")          return toISODate(today);
  if (bucket === "tomorrow")       return toISODate(addDays(today, 1));
  if (bucket === "check_tomorrow") return toISODate(addDays(today, 2));
  if (bucket === "this_week") {
    // End of current week (Saturday)
    const day = today.getDay();
    const offset = day === 0 ? 6 : 6 - day;
    return toISODate(addDays(today, offset));
  }
  return toISODate(today);
}

export function formatTargetDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  const short = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (diff === 0) return `Today • ${short}`;
  if (diff === 1) return `Tomorrow • ${short}`;
  if (diff === -1) return `Yesterday • ${short}`;
  return short;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MANAGER VIEW ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function ManagerTasksView({ onSwitchMode, onBackToApp, canCreateGrowing = true }) {
  const { rows: tasks, upsert, remove, refresh } = useManagerTasks();
  const { displayName } = useAuth();

  const today = useMemo(() => getWeekInfo(), []);
  const [selectedWeek, setSelectedWeek] = useState(today);
  const [category, setCategory] = useState(canCreateGrowing ? "growing" : "production"); // production | growing
  const [statusFilter, setStatusFilter] = useState("pending"); // all | pending | completed
  const [selectedTask, setSelectedTask] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(null);
  const autoOpenedRef = useRef(false);

  const pendingRequests = useMemo(() => tasks.filter(t => t.status === "requested"), [tasks]);

  // Auto-open requests modal on first load if there are any
  useEffect(() => {
    if (!autoOpenedRef.current && pendingRequests.length > 0) {
      autoOpenedRef.current = true;
      setShowRequests(true);
    }
  }, [pendingRequests.length]);

  // Filter + sort by priority (higher = more important = on top)
  const visibleTasks = useMemo(() => {
    let r = tasks.filter(t => t.status !== "requested" && t.year === selectedWeek.year && t.weekNumber === selectedWeek.week && (t.category || "production") === category);
    if (statusFilter === "pending") r = r.filter(t => t.status !== "completed");
    else if (statusFilter === "completed") r = r.filter(t => t.status === "completed");
    return [...r].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, selectedWeek, statusFilter, category]);

  const canCreateInCurrentCategory = category === "production" || canCreateGrowing;

  async function createTask(title, bucket = "today") {
    if (!title.trim()) return;
    const maxPriority = Math.max(0, ...tasks.filter(t => t.year === today.year && t.weekNumber === today.week && (t.category || "production") === category).map(t => t.priority || 0));
    await upsert({
      id: crypto.randomUUID(),
      title: title.trim(),
      priority: maxPriority + 10,
      weekNumber: today.week,
      year: today.year,
      status: "pending",
      category,
      bucket,
      targetDate: bucketToDate(bucket),
      carriedOver: false,
      createdBy: displayName || "Manager",
      photos: [],
    });
    setShowRecorder(false);
    refresh();
  }

  const [completingTask, setCompletingTask] = useState(null);

  async function toggleComplete(task) {
    const completed = task.status === "completed";
    if (!completed) {
      // Prompt for notes/photo
      setCompletingTask(task);
      return;
    }
    await upsert({
      ...task,
      status: "pending",
      completedBy: null,
      completedAt: null,
    });
    refresh();
  }

  async function approveRequest(request, { bucket, targetDate }) {
    const jan4 = new Date(new Date(targetDate + "T00:00:00").getFullYear(), 0, 4);
    const s = new Date(jan4);
    s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const dt = new Date(targetDate + "T00:00:00");
    const week = Math.ceil((dt - s) / (7 * 86400000));
    const year = dt.getFullYear();
    const maxPriority = Math.max(0, ...tasks.filter(t => t.year === year && t.weekNumber === week && (t.category || "production") === (request.category || "growing")).map(t => t.priority || 0));
    await upsert({
      ...request,
      status: "pending",
      bucket,
      targetDate,
      weekNumber: week,
      year,
      priority: maxPriority + 10,
    });
    setApprovingRequest(null);
    refresh();
  }

  async function rejectRequest(request) {
    if (!window.confirm(`Reject "${request.title}"? It will be deleted.`)) return;
    await remove(request.id);
    refresh();
  }

  async function finishCompletion(notes, photo) {
    if (!completingTask) return;
    const photos = photo ? [...(completingTask.photos || []), photo] : (completingTask.photos || []);
    const combinedNotes = notes ? ((completingTask.notes ? completingTask.notes + "\n" : "") + notes) : completingTask.notes;
    await upsert({
      ...completingTask,
      status: "completed",
      completedBy: displayName || "Manager",
      completedAt: new Date().toISOString(),
      notes: combinedNotes,
      photos,
    });
    setCompletingTask(null);
    refresh();
  }

  // ── CARRYOVER: move pending tasks from prior weeks into current week, refresh target_date ──
  useEffect(() => {
    if (!tasks.length) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    tasks.forEach(t => {
      if (t.status === "completed" || t.status === "requested") return;
      const stale = t.year < today.year || (t.year === today.year && t.weekNumber < today.week);
      const needsTargetDate = !t.targetDate;
      const staleDate = t.targetDate && t.targetDate < todayISO && (t.bucket === "today" || t.bucket === "tomorrow" || t.bucket === "check_tomorrow");
      if (stale || needsTargetDate || staleDate) {
        const patch = { ...t };
        if (stale) { patch.year = today.year; patch.weekNumber = today.week; patch.carriedOver = true; }
        if (needsTargetDate || staleDate) patch.targetDate = bucketToDate(t.bucket || "today");
        upsert(patch);
      }
    });
  }, [tasks.length]); // eslint-disable-line

  async function moveTask(task, direction) {
    const sameWeek = visibleTasks;
    const idx = sameWeek.findIndex(t => t.id === task.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameWeek.length) return;
    const other = sameWeek[swapIdx];
    await upsert({ ...task, priority: other.priority });
    await upsert({ ...other, priority: task.priority });
    refresh();
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    await remove(task.id);
    if (selectedTask?.id === task.id) setSelectedTask(null);
  }

  function changeWeek(delta) {
    let w = selectedWeek.week + delta;
    let y = selectedWeek.year;
    if (w < 1) { w = 52; y--; }
    if (w > 52) { w = 1; y++; }
    setSelectedWeek({ week: w, year: y });
  }

  const isCurrentWeek = selectedWeek.week === today.week && selectedWeek.year === today.year;

  if (selectedTask) {
    return <TaskDetail task={selectedTask} onBack={() => setSelectedTask(null)} onSave={async t => { await upsert(t); refresh(); setSelectedTask(null); }} />;
  }

  function renderTaskCard(t, idx) {
    const isDone = t.status === "completed";
    const isOverdue = !!t.carriedOver && !isDone;
    return (
      <div key={t.id} style={{
        background: "#fff", borderRadius: 14,
        border: `1.5px solid ${isOverdue ? "#d94f3d" : isDone ? "#c8d8c0" : "#e0ead8"}`,
        boxShadow: isOverdue ? "0 0 0 2px rgba(217,79,61,0.15)" : "none",
        padding: "14px 16px", marginBottom: 10, opacity: isDone ? 0.65 : 1,
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button onClick={() => moveTask(t, "up")} disabled={idx === 0 || isDone}
              style={{ background: "none", border: "none", color: idx === 0 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === 0 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9650;</button>
            <button onClick={() => moveTask(t, "down")} disabled={idx === visibleTasks.length - 1 || isDone}
              style={{ background: "none", border: "none", color: idx === visibleTasks.length - 1 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === visibleTasks.length - 1 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9660;</button>
          </div>
          <button onClick={() => toggleComplete(t)}
            style={{
              width: 28, height: 28, minWidth: 28, borderRadius: 8,
              border: `2px solid #7fb069`, background: isDone ? "#7fb069" : "#fff",
              color: "#1e2d1a", fontSize: 16, fontWeight: 800, cursor: "pointer", padding: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{isDone ? "✓" : ""}</button>
          <div style={{ flex: 1 }} onClick={() => setSelectedTask(t)}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: isOverdue ? "#d94f3d" : "#1e2d1a", textDecoration: isDone ? "line-through" : "none" }}>{t.title}</div>
              {isOverdue && <span style={{ background: "#d94f3d", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>OVERDUE</span>}
              {t.claimedBy && !isDone && (
                <span style={{ background: "#e89a3a", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🔒 {t.claimedBy}</span>
              )}
            </div>
            {t.targetDate && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2, fontWeight: 600 }}>📅 {formatTargetDate(t.targetDate)}</div>}
            {t.description && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>{t.description}</div>}
            {(t.photos || []).length > 0 && <div style={{ fontSize: 11, color: "#4a90d9", marginTop: 4 }}>📷 {t.photos.length} photo{t.photos.length !== 1 ? "s" : ""}</div>}
            {t.notes && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, fontStyle: "italic" }}>📝 {t.notes}</div>}
            {isDone && (
              <div style={{ fontSize: 11, color: "#4a7a35", marginTop: 4 }}>
                ✓ {t.completedBy} — {formatTime(t.completedAt)}
              </div>
            )}
          </div>
          <button onClick={() => deleteTask(t)}
            style={{ background: "none", border: "none", color: "#8a9a80", fontSize: 18, cursor: "pointer", padding: 4 }} title="Delete task">🗑</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#1e2d1a", padding: "16px 20px", color: "#c8e6b8" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Floor View</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Manager Tasks</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {onBackToApp && (
              <button onClick={onBackToApp}
                style={{ background: "#7fb069", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                App →
              </button>
            )}
            <button onClick={() => setShowRequests(true)}
              style={{ background: pendingRequests.length > 0 ? "#e89a3a" : "#c8e6b8", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              📥 Requests{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}
            </button>
            <button onClick={() => setShowCodes(true)}
              style={{ background: "#c8e6b8", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Codes
            </button>
            <button onClick={onSwitchMode}
              style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* Week selector */}
      <div style={{ background: "#162212", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #3a5a35" }}>
        <button onClick={() => changeWeek(-1)} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 18, cursor: "pointer", padding: 6 }}>&larr;</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#c8e6b8" }}>Week {selectedWeek.week}, {selectedWeek.year}</div>
          {!isCurrentWeek && <div style={{ fontSize: 10, color: "#7a9a6a" }}>Historical</div>}
          {isCurrentWeek && <div style={{ fontSize: 10, color: "#7fb069" }}>Current week</div>}
        </div>
        <button onClick={() => changeWeek(1)} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 18, cursor: "pointer", padding: 6 }}>&rarr;</button>
      </div>

      {/* Category tabs */}
      <div style={{ padding: "12px 20px 0", background: "#fff", display: "flex", gap: 8 }}>
        {[{id:"production",label:"Production"},{id:"growing",label:"Growing"}].map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            style={{
              flex: 1, padding: "12px 0", borderRadius: "12px 12px 0 0", fontSize: 13, fontWeight: 800,
              background: category === c.id ? "#7fb069" : "#f2f5ef",
              color: category === c.id ? "#1e2d1a" : "#7a8c74",
              border: "1.5px solid #c8d8c0", borderBottom: category === c.id ? "1.5px solid #7fb069" : "1.5px solid #c8d8c0",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", gap: 8 }}>
        {[{id:"pending",label:"To Do"},{id:"completed",label:"Done"},{id:"all",label:"All"}].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: statusFilter === f.id ? "#1e2d1a" : "#f2f5ef",
              color: statusFilter === f.id ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${statusFilter === f.id ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {f.label} ({tasks.filter(t => t.year === selectedWeek.year && t.weekNumber === selectedWeek.week && (t.category || "production") === category && (f.id === "all" || (f.id === "pending" ? t.status !== "completed" : t.status === "completed"))).length})
          </button>
        ))}
      </div>

      {/* Task list grouped by bucket */}
      <div style={{ padding: 16 }}>
        {visibleTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#7a8c74" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {statusFilter === "completed" ? "No completed tasks" : "No tasks this week"}
            </div>
            {isCurrentWeek && statusFilter !== "completed" && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#aabba0" }}>Tap the mic button below to add one</div>
            )}
          </div>
        ) : (
          [
            { id: "today",          label: "Today" },
            { id: "tomorrow",       label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week",      label: "This Week" },
          ].map(section => {
            const sectionTasks = visibleTasks.filter(t => (t.bucket || "today") === section.id);
            if (sectionTasks.length === 0) return null;
            return (
              <div key={section.id} style={{ marginBottom: 18 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  fontSize: 12, fontWeight: 800, color: "#1e2d1a", textTransform: "uppercase",
                  letterSpacing: 1.2, margin: "6px 4px 10px",
                }}>
                  <span>{section.label}</span>
                  <div style={{ flex: 1, height: 2, background: "#7fb069", borderRadius: 1 }} />
                  <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 10px", fontSize: 11 }}>{sectionTasks.length}</span>
                </div>
                {sectionTasks.map((t, sIdx) => {
                  const idx = visibleTasks.indexOf(t);
                  return renderTaskCard(t, idx);
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Mic button - only on current week + only if allowed in this category */}
      {isCurrentWeek && canCreateInCurrentCategory && (
        <button onClick={() => setShowRecorder(true)}
          style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            width: 70, height: 70, borderRadius: "50%", background: "#7fb069",
            border: "4px solid #fff", color: "#fff", fontSize: 28, cursor: "pointer",
            boxShadow: "0 4px 20px rgba(26, 42, 26, 0.3)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          🎤
        </button>
      )}

      {showRecorder && <VoiceRecorderModal onSave={createTask} onCancel={() => setShowRecorder(false)} />}
      {showCodes && <CodesModal onClose={() => setShowCodes(false)} />}
      {showRequests && (
        <RequestsModal
          requests={pendingRequests}
          onClose={() => setShowRequests(false)}
          onApprove={(r) => { setShowRequests(false); setApprovingRequest(r); }}
          onReject={rejectRequest}
        />
      )}
      {approvingRequest && (
        <ApprovalModal
          request={approvingRequest}
          onCancel={() => setApprovingRequest(null)}
          onApprove={(opts) => approveRequest(approvingRequest, opts)}
        />
      )}
      {completingTask && (
        <CompletionPromptModal
          task={completingTask}
          onCancel={() => setCompletingTask(null)}
          onSave={finishCompletion}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CODES MODAL ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const FLOOR_CODE_LIST = [
  { name: "Floor Manager",    code: "9999999", role: "Manager" },
  { name: "Michael Papineau", code: "1111111", role: "Grower" },
  { name: "Zack Stenz",       code: "2222222", role: "Grower" },
  { name: "Colin O'Dell",     code: "3333333", role: "Grower" },
  { name: "Reese Morris",     code: "4444444", role: "Grower + Tasks" },
  { name: "Eulogio Martinez", code: "6666666", role: "Grower" },
  { name: "Amanda Kirsop",    code: "8888888", role: "Grower" },
  { name: "Kurt Schlegel",    code: "1111222", role: "Grower" },
];

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPLETION PROMPT MODAL ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function CompletionPromptModal({ task, onCancel, onSave }) {
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef(null);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 500,
      }}>
        <div style={{ fontSize: 11, color: "#7fb069", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Completing</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 14 }}>{task.title}</div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74" }}>Any notes? (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. looked healthy, watered well"
          style={{
            width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0",
            fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
            marginTop: 6, marginBottom: 12,
          }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74" }}>Take a photo? (optional)</label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
        {photo ? (
          <div style={{ position: "relative", marginTop: 6 }}>
            <img src={photo} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10 }} />
            <button onClick={() => setPhoto(null)}
              style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            style={{
              width: "100%", padding: "14px", borderRadius: 10, border: "1.5px dashed #c8d8c0",
              background: "#fafcf8", color: "#7a8c74", fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", marginTop: 6,
            }}>
            📷 Take Photo
          </button>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(notes.trim() || null, photo)}
            style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Mark Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task requests inbox ─────────────────────────────────────────────────────
function RequestsModal({ requests, onClose, onApprove, onReject }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "18px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#e89a3a", textTransform: "uppercase", letterSpacing: 1 }}>Pending Suggestions</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Grower Task Requests</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 26, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 22 }}>
          {requests.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#7a8c74" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>No pending requests</div>
            </div>
          ) : (
            requests.map(r => (
              <div key={r.id} style={{ background: "#fafcf8", borderRadius: 12, border: "1.5px solid #e0ead8", borderLeft: "4px solid #e89a3a", padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>
                  Suggested by <b style={{ color: "#1e2d1a" }}>{r.createdBy || "—"}</b>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginTop: 4 }}>{r.title}</div>
                {r.description && <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 6, whiteSpace: "pre-wrap" }}>{r.description}</div>}
                {Array.isArray(r.photos) && r.photos.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {r.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8 }} />)}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={() => onApprove(r)}
                    style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "#4a7a35", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    ✓ Approve & Schedule
                  </button>
                  <button onClick={() => onReject(r)}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalModal({ request, onCancel, onApprove }) {
  const [bucket, setBucket] = useState("today");
  const [customDate, setCustomDate] = useState(bucketToDate("today"));
  const [useCustom, setUseCustom] = useState(false);

  const finalDate = useCustom ? customDate : bucketToDate(bucket);

  function submit() {
    onApprove({ bucket: useCustom ? "this_week" : bucket, targetDate: finalDate });
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, padding: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", letterSpacing: 1 }}>Approving</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#1e2d1a", marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>{request.title}</div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>When</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {[
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week", label: "This Week" },
          ].map(b => {
            const active = !useCustom && bucket === b.id;
            return (
              <button key={b.id} onClick={() => { setUseCustom(false); setBucket(b.id); }}
                style={{
                  flex: "1 1 45%", padding: "12px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                  background: active ? "#1e2d1a" : "#f2f5ef",
                  color: active ? "#c8e6b8" : "#7a8c74",
                  border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                {b.label}
              </button>
            );
          })}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Or specific date</div>
        <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setUseCustom(true); }}
          style={{
            width: "100%", padding: 12, borderRadius: 10,
            border: `1.5px solid ${useCustom ? "#1e2d1a" : "#c8d8c0"}`,
            fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 6,
          }} />
        <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 16 }}>
          Will appear on: <b style={{ color: "#1e2d1a" }}>{formatTargetDate(finalDate)}</b>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={submit}
            style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#4a7a35", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Schedule Task
          </button>
        </div>
      </div>
    </div>
  );
}

function CodesModal({ onClose }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>Employee Codes</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 26, cursor: "pointer" }}>&times;</button>
        </div>
        {FLOOR_CODE_LIST.map(c => (
          <div key={c.code} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#f2f5ef", borderRadius: 10, padding: "12px 14px", marginBottom: 8,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "#7a8c74" }}>{c.role}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#1e2d1a", fontFamily: "monospace", letterSpacing: 2 }}>{c.code}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VOICE RECORDER MODAL ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function VoiceRecorderModal({ onSave, onCancel }) {
  const [transcript, setTranscript] = useState("");
  const [bucket, setBucket] = useState("today");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // iOS Safari / PWA: fall back to the system keyboard dictation mic
      setError("Tap the 🎤 on your keyboard to dictate, or type your task below.");
      setTimeout(() => textareaRef.current?.focus(), 150);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text;
        else interim += text;
      }
      if (finalText) setTranscript(prev => (prev + " " + finalText).trim());
    };

    recognition.onerror = (e) => {
      setError("Voice error: " + e.error);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    // Auto-start
    try {
      recognition.start();
      setIsListening(true);
    } catch {}

    return () => {
      try { recognition.stop(); } catch {}
    };
  }, []);

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {}
    }
  }

  function save() {
    if (!transcript.trim()) return;
    try { recognitionRef.current?.stop(); } catch {}
    onSave(transcript, bucket);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 500,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>New Task</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 24, cursor: "pointer" }}>&times;</button>
        </div>

        {error && <div style={{ background: "#fde8e8", color: "#d94f3d", padding: "10px 12px", borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <textarea ref={textareaRef} value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder={isListening ? "Listening... speak now" : "Tap mic to dictate or type here"}
          style={{
            width: "100%", minHeight: 120, padding: "14px", borderRadius: 12,
            border: `2px solid ${isListening ? "#7fb069" : "#c8d8c0"}`, fontSize: 15,
            fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
          }} />

        {/* Bucket selection */}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {[
            { id: "today", label: "Today" },
            { id: "tomorrow", label: "Tomorrow" },
            { id: "check_tomorrow", label: "Day After" },
            { id: "this_week", label: "This Week" },
          ].map(b => (
            <button key={b.id} onClick={() => setBucket(b.id)}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                background: bucket === b.id ? "#1e2d1a" : "#f2f5ef",
                color: bucket === b.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${bucket === b.id ? "#1e2d1a" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {b.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {recognitionRef.current && (
            <button onClick={toggleListening}
              style={{
                padding: "14px 18px", borderRadius: 12, border: "none",
                background: isListening ? "#d94f3d" : "#7fb069", color: "#fff",
                fontSize: 20, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>
              {isListening ? "⏸" : "🎤"}
            </button>
          )}
          <button onClick={save} disabled={!transcript.trim()}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
              background: transcript.trim() ? "#1e2d1a" : "#c8d8c0", color: "#fff",
              fontSize: 15, fontWeight: 800, cursor: transcript.trim() ? "pointer" : "default", fontFamily: "inherit",
            }}>
            Save Task
          </button>
        </div>
        {isListening && <div style={{ textAlign: "center", fontSize: 11, color: "#7fb069", marginTop: 10, fontWeight: 700 }}>● LISTENING</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TASK DETAIL ─────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export function RatingPicker({ value, onChange }) {
  const OPTIONS = [
    { id: "sad",     emoji: "😞", label: "Bad" },
    { id: "neutral", emoji: "😐", label: "OK" },
    { id: "happy",   emoji: "😊", label: "Good" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      {OPTIONS.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(active ? null : o.id)}
            style={{
              flex: 1, padding: "12px 6px", borderRadius: 12,
              border: `2px solid ${active ? "#7fb069" : "#c8d8c0"}`,
              background: active ? "#f0f8eb" : "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            <div style={{ fontSize: 28, lineHeight: 1 }}>{o.emoji}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#1e2d1a" : "#7a8c74", marginTop: 4 }}>{o.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function BenchNumbersEditor({ value, onChange }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setInput("");
  };
  const remove = (b) => onChange(value.filter(x => x !== b));
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {value.map(b => (
          <span key={b} style={{
            background: "#1e2d1a", color: "#c8e6b8", borderRadius: 999, padding: "6px 12px",
            fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            {b}
            <button onClick={() => remove(b)} style={{ background: "none", border: "none", color: "#c8e6b8", cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add bench #"
          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
        <button onClick={add}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Add
        </button>
      </div>
    </div>
  );
}

export function TaskViewer({ task, onBack, onAppend, readOnly = true }) {
  const [note, setNote] = useState("");
  const fileRef = useRef(null);
  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onAppend({ photo: ev.target.result });
    reader.readAsDataURL(file);
  }
  function saveNote() {
    if (!note.trim()) return;
    onAppend({ note: note.trim() });
    setNote("");
  }
  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 20px", color: "#c8e6b8", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Task Details</div>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Title</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 8 }}>{task.title}</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14 }}>
            Assigned by <span style={{ fontWeight: 700, color: "#1e2d1a" }}>{task.createdBy || "Manager"}</span>
          </div>
          {task.description && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Details</div>
            <div style={{ fontSize: 14, color: "#1e2d1a", marginBottom: 12, whiteSpace: "pre-wrap" }}>{task.description}</div>
          </>}
          {task.houseId && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>House</div>
            <div style={{ fontSize: 14, color: "#1e2d1a", marginBottom: 12 }}>{task.houseId}</div>
          </>}
          {(task.benchNumbers || []).length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Benches</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {task.benchNumbers.map(b => (
                <span key={b} style={{ background: "#1e2d1a", color: "#c8e6b8", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>{b}</span>
              ))}
            </div>
          </>}
          {task.rating && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Rating</div>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{task.rating === "happy" ? "😊" : task.rating === "neutral" ? "😐" : "😞"}</div>
          </>}
          {task.notes && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "#1e2d1a", marginBottom: 12, whiteSpace: "pre-wrap", background: "#f2f5ef", padding: 10, borderRadius: 8 }}>{task.notes}</div>
          </>}
          {(task.photos || []).length > 0 && <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Photos</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {task.photos.map((p, i) => (
                <img key={i} src={p} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e0ead8" }} />
              ))}
            </div>
          </>}
        </div>

        {/* Append-only controls for growers */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", marginBottom: 8 }}>How did it go?</div>
          <RatingPicker value={task.rating || null} onChange={r => onAppend({ rating: r })} />
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", marginBottom: 8 }}>Add your update</div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note…"
            style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveNote} disabled={!note.trim()}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: note.trim() ? "#1e2d1a" : "#c8d8c0", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: note.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Save Note
            </button>
            <button onClick={() => fileRef.current?.click()}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fafcf8", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              📷 Add Photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
          </div>
        </div>

        <button onClick={onBack}
          style={{ width: "100%", marginTop: 16, padding: "16px 0", borderRadius: 12, border: "none", background: "#7fb069", color: "#1e2d1a", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ✓ Done
        </button>
      </div>
    </div>
  );
}

function TaskDetail({ task, onBack, onSave }) {
  const [t, setT] = useState({ ...task });
  const [dirty, setDirty] = useState(false);
  const upd = (k, v) => { setT(p => ({ ...p, [k]: v })); setDirty(true); };

  const handleBack = () => {
    if (dirty) { onSave(t); return; }
    onBack();
  };

  // Warn on browser close/refresh with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (dirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const photos = [...(t.photos || []), ev.target.result];
      upd("photos", photos);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto(idx) {
    const photos = (t.photos || []).filter((_, i) => i !== idx);
    upd("photos", photos);
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 20px", color: "#c8e6b8", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={handleBack} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Edit Task{dirty ? " •" : ""}</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Assigned by</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a", marginBottom: 14 }}>{t.createdBy || "Manager"}</div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Title</div>
          <input value={t.title || ""} onChange={e => upd("title", e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Details</div>
          <textarea value={t.description || ""} onChange={e => upd("description", e.target.value)}
            placeholder="Add more details..."
            style={{ width: "100%", minHeight: 100, padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />

          {t.rating && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Grower Rating</div>
              <div style={{ fontSize: 36, marginBottom: 14 }}>
                {t.rating === "happy" ? "😊" : t.rating === "neutral" ? "😐" : "😞"}
              </div>
            </>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>House ID <span style={{ color: "#aabba0", fontWeight: 400 }}>(optional)</span></div>
          <input value={t.houseId || ""} onChange={e => upd("houseId", e.target.value)}
            placeholder="e.g. H-12"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Bench Numbers <span style={{ color: "#aabba0", fontWeight: 400 }}>(optional)</span></div>
          <BenchNumbersEditor value={t.benchNumbers || []} onChange={v => upd("benchNumbers", v)} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>When</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { id: "today",          label: "Today" },
              { id: "tomorrow",       label: "Tomorrow" },
              { id: "check_tomorrow", label: "Day After" },
              { id: "this_week",      label: "This Week" },
            ].map(b => {
              const active = (t.bucket || "today") === b.id;
              return (
                <button key={b.id} onClick={() => { upd("bucket", b.id); upd("targetDate", bucketToDate(b.id)); }}
                  style={{
                    flex: "1 1 45%", padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                    background: active ? "#1e2d1a" : "#f2f5ef",
                    color: active ? "#c8e6b8" : "#7a8c74",
                    border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {b.label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Photos</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {(t.photos || []).map((p, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={p} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, border: "1.5px solid #e0ead8" }} />
                <button onClick={() => removePhoto(i)}
                  style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>&times;</button>
              </div>
            ))}
            <label style={{ width: 90, height: 90, borderRadius: 10, border: "2px dashed #c8d8c0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 24, color: "#7a8c74", background: "#fafcf8" }}>
              +
              <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        <button onClick={() => onSave(t)}
          style={{ width: "100%", marginTop: 16, padding: "16px 0", borderRadius: 12, border: "none", background: "#1e2d1a", color: "#c8e6b8", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Save Changes
        </button>
      </div>
    </div>
  );
}
