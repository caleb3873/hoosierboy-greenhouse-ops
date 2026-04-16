import { useMemo, useState, useEffect, useRef } from "react";
import { useManagerTasks } from "./supabase";
import { useAuth } from "./Auth";
import { CompletionPromptModal, TaskViewer, TaskPhoto, uploadTaskPhoto, formatTargetDate, bucketToDate } from "./ManagerTasksView";
import { NotificationBanner } from "./PushNotifications";
import { BrehobWorkerView } from "./BrehobList";

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
  const { displayName } = useAuth();
  const today = useMemo(() => getWeekInfo(), []);
  const [showDone, setShowDone] = useState(false);
  const [completingTask, setCompletingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [releasingTask, setReleasingTask] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [showBrehob, setShowBrehob] = useState(false);
  // Language: Eulogio defaults to Spanish, everyone else English. Stored per-device.
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("gh_worker_lang_" + (displayName || ""));
    if (saved) return saved;
    return (displayName || "").toLowerCase().includes("eulogio") ? "es" : "en";
  });
  useEffect(() => {
    localStorage.setItem("gh_worker_lang_" + (displayName || ""), lang);
  }, [lang, displayName]);
  const [translations, setTranslations] = useState({}); // {taskId: {title, description, notes}}
  const translationInFlight = useRef(new Set());

  // Translate any visible task that hasn't been cached yet
  useEffect(() => {
    if (lang !== "es") return;
    const needed = tasks.filter(t => (t.category || "production") === "growing" && t.status !== "requested" && !translations[t.id] && !translationInFlight.current.has(t.id));
    if (needed.length === 0) return;
    needed.forEach(t => translationInFlight.current.add(t.id));
    const batch = needed.slice(0, 15); // cap per request
    const texts = [];
    const index = []; // {taskId, field}
    for (const t of batch) {
      if (t.title) { texts.push(t.title); index.push({ taskId: t.id, field: "title" }); }
      if (t.description) { texts.push(t.description); index.push({ taskId: t.id, field: "description" }); }
    }
    if (texts.length === 0) return;
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, target: "es" }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.translations) return;
        setTranslations(prev => {
          const next = { ...prev };
          data.translations.forEach((tr, i) => {
            const { taskId, field } = index[i];
            if (!next[taskId]) next[taskId] = {};
            next[taskId][field] = tr;
          });
          return next;
        });
      })
      .finally(() => {
        batch.forEach(t => translationInFlight.current.delete(t.id));
      });
  }, [lang, tasks, translations]);

  function tr(task, field) {
    if (lang === "es" && translations[task.id]?.[field]) return translations[task.id][field];
    return task[field];
  }

  // i18n strings
  const t_ui = {
    en: {
      hi: "Hi", thisWeek: "This Week's Tasks", toDo: "To Do", done: "Done",
      nothingDone: "Nothing completed yet.", noGrowing: "No growing tasks assigned yet.",
      claim: "Claim Task", markDone: "Mark Done", release: "Release", mine: "MINE",
      suggestTask: "Suggest Task", signOut: "Sign out",
      today: "Today", tomorrow: "Tomorrow", dayAfter: "Day After", weekly: "This Week",
    },
    es: {
      hi: "Hola", thisWeek: "Tareas de esta semana", toDo: "Por hacer", done: "Hechas",
      nothingDone: "Nada completado aún.", noGrowing: "No hay tareas asignadas.",
      claim: "Tomar tarea", markDone: "Marcar hecha", release: "Liberar", mine: "MÍA",
      suggestTask: "Sugerir tarea", signOut: "Salir",
      today: "Hoy", tomorrow: "Mañana", dayAfter: "Pasado mañana", weekly: "Esta semana",
    },
  }[lang];

  async function appendToTask({ note, photo, rating }) {
    if (!viewingTask) return;
    const updated = { ...viewingTask };
    if (note) {
      const stamp = `[${displayName || "Grower"} ${new Date().toLocaleString()}]`;
      updated.notes = (updated.notes ? updated.notes + "\n" : "") + `${stamp} ${note}`;
    }
    if (photo) {
      updated.photos = [...(updated.photos || []), photo];
    }
    if (rating !== undefined) {
      updated.rating = rating;
    }
    await upsert(updated);
    setViewingTask(updated);
    refresh();
  }

  const weekTasks = useMemo(() => {
    const r = tasks.filter(t => t.status !== "requested" && t.year === today.year && t.weekNumber === today.week && (t.category || "production") === "growing");
    return [...r].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, today]);

  const pending = weekTasks.filter(t => t.status !== "completed");
  const done = weekTasks.filter(t => t.status === "completed");
  const visible = showDone ? done : pending;

  // Carryover + target_date refresh for growing tasks
  useEffect(() => {
    if (!tasks.length) return;
    const todayISO = new Date().toISOString().slice(0, 10);
    tasks.forEach(t => {
      if ((t.category || "production") !== "growing") return;
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

  const myName = displayName || "Grower";

  async function claimTask(task) {
    await upsert({
      ...task,
      status: "claimed",
      claimedBy: myName,
      claimedAt: new Date().toISOString(),
    });
    refresh();
  }

  async function handleCheck(task) {
    if (task.status === "completed") {
      await upsert({ ...task, status: "pending", completedBy: null, completedAt: null, claimedBy: null, claimedAt: null });
      refresh();
      return;
    }
    // Only the claimer can check off
    if (task.claimedBy && task.claimedBy !== myName) return;
    setCompletingTask(task);
  }

  async function releaseTask(task, unfinishedNotes) {
    const stamp = `[${myName} — released ${new Date().toLocaleString()}]`;
    const appendedNotes = unfinishedNotes
      ? ((task.notes ? task.notes + "\n" : "") + `${stamp} ${unfinishedNotes}`)
      : task.notes;
    await upsert({
      ...task,
      status: "pending",
      claimedBy: null,
      claimedAt: null,
      notes: appendedNotes,
    });
    setReleasingTask(null);
    refresh();
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
      claimedBy: null,
      claimedAt: null,
      notes: combinedNotes,
      photos,
    });
    setCompletingTask(null);
    refresh();
  }

  const SECTIONS = [
    { id: "today",          label: t_ui.today },
    { id: "tomorrow",       label: t_ui.tomorrow },
    { id: "check_tomorrow", label: t_ui.dayAfter },
    { id: "this_week",      label: t_ui.weekly },
  ];

  if (viewingTask) {
    return <TaskViewer task={viewingTask} onBack={() => setViewingTask(null)} onAppend={appendToTask} />;
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: GREEN_DARK, color: "#fff", paddingBottom: 100 }}>
      <div style={{ padding: "10px 14px 0" }}><NotificationBanner /></div>
      <div style={{ padding: "14px 14px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>{t_ui.hi} {displayName}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: CREAM }}>{t_ui.thisWeek}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {/* Language toggle */}
          <div style={{ display: "flex", background: "#2a3a24", borderRadius: 8, padding: 3 }}>
            {["en","es"].map(l => (
              <button key={l} onClick={() => setLang(l)}
                style={{
                  padding: "5px 10px", borderRadius: 6, border: "none",
                  background: lang === l ? GREEN : "transparent",
                  color: lang === l ? GREEN_DARK : CREAM,
                  fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          {onOpenTaskCreator && (
            <button onClick={onOpenTaskCreator} style={{ background: GREEN, border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
              + Tasks
            </button>
          )}
          <button onClick={() => setShowBrehob(true)} style={{ background: "#c8e6b8", border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
            🛒 Brehob
          </button>
          {onBackToApp && (
            <button onClick={onBackToApp} style={{ background: GREEN, border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
              App →
            </button>
          )}
          <button onClick={onSwitchMode} style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "6px 12px", borderRadius: 6, cursor: "pointer", ...FONT }}>
            {t_ui.signOut}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        {[
          { k: false, label: `${t_ui.toDo} (${pending.length})` },
          { k: true, label: `${t_ui.done} (${done.length})` },
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
            {showDone ? t_ui.nothingDone : t_ui.noGrowing}
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
                const claimedBy = task.claimedBy;
                const claimedByMe = claimedBy === myName;
                const claimedBySomeoneElse = claimedBy && !claimedByMe;
                return (
                  <div key={task.id}
                    style={{
                      background: completed ? "#2a3a24" : overdue ? "#3a1e18" : claimedBySomeoneElse ? "#223018" : "#263821",
                      border: `1px solid ${overdue ? RED : claimedByMe ? "#e89a3a" : GREEN + "44"}`,
                      boxShadow: overdue ? `0 0 0 2px ${RED}33` : claimedByMe ? "0 0 0 2px #e89a3a44" : "none",
                      borderRadius: 10, padding: 16, marginBottom: 10,
                    }}>
                    <div style={{ cursor: "pointer" }} onClick={() => setViewingTask(task)}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ fontSize: 17, fontWeight: 600, color: overdue ? "#ffb3a8" : CREAM, textDecoration: completed ? "line-through" : "none", opacity: completed ? 0.7 : 1 }}>
                          {tr(task, "title")}
                        </div>
                        {overdue && <span style={{ background: RED, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>OVERDUE</span>}
                        {claimedByMe && <span style={{ background: "#e89a3a", color: "#1e2d1a", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🙋 {t_ui.mine}</span>}
                        {claimedBySomeoneElse && <span style={{ background: "#7a8c74", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>🔒 {claimedBy}</span>}
                      </div>
                      {task.targetDate && (
                        <div style={{ fontSize: 11, color: "#9cb894", marginTop: 4, fontWeight: 700 }}>📅 {formatTargetDate(task.targetDate)}</div>
                      )}
                      {task.description && (
                        <div style={{ fontSize: 13, color: "#9cb894", marginTop: 4 }}>{tr(task, "description")}</div>
                      )}
                      {task.notes && (
                        <div style={{ fontSize: 12, color: "#9cb894", marginTop: 4, fontStyle: "italic", whiteSpace: "pre-wrap" }}>📝 {task.notes}</div>
                      )}
                      {completed && (
                        <div style={{ fontSize: 12, color: GREEN, marginTop: 6 }}>
                          ✓ {task.completedBy} — {formatTime(task.completedAt)}
                        </div>
                      )}
                      {Array.isArray(task.photos) && task.photos.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {task.photos.map((p, i) => (
                            <TaskPhoto key={i} src={p} size={60} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!completed && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        {!claimedBy && (
                          <button onClick={() => claimTask(task)}
                            style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "none", background: GREEN, color: GREEN_DARK, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                            🙋 {t_ui.claim}
                          </button>
                        )}
                        {claimedByMe && (
                          <>
                            <button onClick={() => handleCheck(task)}
                              style={{ flex: 2, padding: "12px 16px", borderRadius: 10, border: "none", background: GREEN, color: GREEN_DARK, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                              ✓ {t_ui.markDone}
                            </button>
                            <button onClick={() => setReleasingTask(task)}
                              style={{ flex: 1, padding: "12px 12px", borderRadius: 10, border: `1.5px solid ${GREEN}66`, background: "transparent", color: CREAM, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
                              ↩ {t_ui.release}
                            </button>
                          </>
                        )}
                        {claimedBySomeoneElse && (
                          <div style={{ flex: 1, padding: "12px 16px", borderRadius: 10, background: "transparent", border: `1.5px dashed #7a8c74`, color: "#9cb894", fontSize: 12, fontWeight: 700, textAlign: "center" }}>
                            🔒 Claimed by {claimedBy}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Floating "suggest task" button */}
      <button onClick={() => setSuggesting(true)}
        title="Suggest a task for the manager to approve"
        style={{
          position: "fixed", bottom: 24, right: 20, padding: "14px 20px", borderRadius: 999,
          background: GREEN, border: "3px solid #fff", color: GREEN_DARK, fontSize: 14, fontWeight: 800,
          cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,.3)", zIndex: 200, fontFamily: "'DM Sans',sans-serif",
          display: "flex", alignItems: "center", gap: 8,
        }}>
        ➕ {t_ui.suggestTask}
      </button>

      {completingTask && (
        <CompletionPromptModal
          task={completingTask}
          onCancel={() => setCompletingTask(null)}
          onSave={finishCompletion}
        />
      )}

      {releasingTask && (
        <ReleaseModal
          task={releasingTask}
          onCancel={() => setReleasingTask(null)}
          onRelease={(notes) => releaseTask(releasingTask, notes)}
        />
      )}

      {suggesting && (
        <SuggestTaskModal
          requestedBy={displayName || "Grower"}
          onCancel={() => setSuggesting(false)}
          onSubmit={async (row) => {
            await upsert({
              id: crypto.randomUUID(),
              title: row.title,
              description: row.description || null,
              photos: row.photos || [],
              priority: 0,
              weekNumber: today.week,
              year: today.year,
              status: "requested",
              category: "growing",
              createdBy: displayName || "Grower",
              notes: null,
            });
            setSuggesting(false);
            refresh();
          }}
        />
      )}

      {/* Brehob modal */}
      {showBrehob && (
        <div onClick={() => setShowBrehob(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "flex-end", ...FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#f2f5ef", borderRadius: "20px 20px 0 0", padding: "16px 14px 24px", width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button onClick={() => setShowBrehob(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#7a8c74" }}>✕</button>
            </div>
            <BrehobWorkerView />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Release modal ─────────────────────────────────────────────────────────────
function ReleaseModal({ task, onCancel, onRelease }) {
  const [notes, setNotes] = useState("");
  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 500, color: "#1e2d1a",
      }}>
        <div style={{ fontSize: 11, color: "#e89a3a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Releasing</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 14 }}>{task.title}</div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74" }}>
          What's left for the next person?
        </label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. got through house 3, still need houses 4 and 5; watering done but need to check pest"
          style={{
            width: "100%", minHeight: 90, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0",
            fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
            marginTop: 6, marginBottom: 14,
          }} />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "13px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onRelease(notes.trim())}
            style={{ flex: 2, padding: "13px 0", borderRadius: 10, border: "none", background: "#e89a3a", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ↩ Release as Incomplete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Suggest task modal ───────────────────────────────────────────────────────
function SuggestTaskModal({ requestedBy, onCancel, onSubmit }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadTaskPhoto(file);
      setPhotos(p => [...p, path]);
    } catch (err) {
      alert("Upload failed: " + err.message);
    }
    setUploading(false);
    e.target.value = "";
  }

  function submit() {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), description: description.trim(), photos });
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 500,
        maxHeight: "90vh", overflowY: "auto", color: "#1e2d1a",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Suggest a Task</div>
          <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 26, color: "#7a8c74", cursor: "pointer" }}>&times;</button>
        </div>
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14 }}>
          The manager will review and decide whether to schedule it.
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to happen?"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, outline: "none" }} />

        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Why does this need to be done? Any detail helpful to the manager"
          style={{ width: "100%", minHeight: 90, padding: 12, borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 12, outline: "none" }} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {photos.map((p, i) => (
            <TaskPhoto key={i} src={p} size={80} onRemove={() => setPhotos(ps => ps.filter((_, j) => j !== i))} />
          ))}
          <label style={{ width: 80, height: 80, borderRadius: 8, border: "2px dashed #c8d8c0", background: uploading ? "#f0f5ee" : "#fafcf8", display: "flex", alignItems: "center", justifyContent: "center", color: "#7a8c74", fontSize: 22, cursor: uploading ? "default" : "pointer" }}>
            {uploading ? "..." : "+"}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} disabled={uploading} />
          </label>
        </div>

        <button onClick={submit} disabled={!title.trim()}
          style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: title.trim() ? "#1e2d1a" : "#c8d8c0", color: "#c8e6b8", fontSize: 15, fontWeight: 800, cursor: title.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
          Submit Suggestion
        </button>
      </div>
    </div>
  );
}
