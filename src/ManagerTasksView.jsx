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

// ══════════════════════════════════════════════════════════════════════════════
// ── MANAGER VIEW ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function ManagerTasksView({ onSwitchMode }) {
  const { rows: tasks, upsert, remove, refresh } = useManagerTasks();
  const { displayName } = useAuth();

  const today = useMemo(() => getWeekInfo(), []);
  const [selectedWeek, setSelectedWeek] = useState(today);
  const [statusFilter, setStatusFilter] = useState("pending"); // all | pending | completed
  const [selectedTask, setSelectedTask] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);

  // Filter + sort by priority (higher = more important = on top)
  const visibleTasks = useMemo(() => {
    let r = tasks.filter(t => t.year === selectedWeek.year && t.weekNumber === selectedWeek.week);
    if (statusFilter === "pending") r = r.filter(t => t.status !== "completed");
    else if (statusFilter === "completed") r = r.filter(t => t.status === "completed");
    return [...r].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, selectedWeek, statusFilter]);

  async function createTask(title) {
    if (!title.trim()) return;
    const maxPriority = Math.max(0, ...tasks.filter(t => t.year === today.year && t.weekNumber === today.week).map(t => t.priority || 0));
    await upsert({
      id: crypto.randomUUID(),
      title: title.trim(),
      priority: maxPriority + 10,
      weekNumber: today.week,
      year: today.year,
      status: "pending",
      createdBy: displayName || "Manager",
      photos: [],
    });
    setShowRecorder(false);
    refresh();
  }

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
          <button onClick={onSwitchMode}
            style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Log out
          </button>
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
            {f.label} ({tasks.filter(t => t.year === selectedWeek.year && t.weekNumber === selectedWeek.week && (f.id === "all" || (f.id === "pending" ? t.status !== "completed" : t.status === "completed"))).length})
          </button>
        ))}
      </div>

      {/* Task list */}
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
        ) : visibleTasks.map((t, idx) => {
          const isDone = t.status === "completed";
          return (
            <div key={t.id} style={{
              background: "#fff", borderRadius: 14, border: `1.5px solid ${isDone ? "#c8d8c0" : "#e0ead8"}`,
              padding: "14px 16px", marginBottom: 10, opacity: isDone ? 0.65 : 1,
            }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => moveTask(t, "up")} disabled={idx === 0 || isDone}
                    style={{ background: "none", border: "none", color: idx === 0 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === 0 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9650;</button>
                  <button onClick={() => moveTask(t, "down")} disabled={idx === visibleTasks.length - 1 || isDone}
                    style={{ background: "none", border: "none", color: idx === visibleTasks.length - 1 || isDone ? "#d0d8cc" : "#7a8c74", fontSize: 16, cursor: idx === visibleTasks.length - 1 || isDone ? "default" : "pointer", padding: "2px 6px" }}>&#9660;</button>
                </div>
                <div style={{ flex: 1 }} onClick={() => setSelectedTask(t)}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ background: idx < 3 && !isDone ? "#1e2d1a" : "#7a8c74", color: "#fff", borderRadius: 20, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{idx + 1}</span>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a", textDecoration: isDone ? "line-through" : "none" }}>{t.title}</div>
                  </div>
                  {t.description && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4, marginLeft: 32 }}>{t.description}</div>}
                  {(t.photos || []).length > 0 && <div style={{ fontSize: 11, color: "#4a90d9", marginTop: 4, marginLeft: 32 }}>📷 {t.photos.length} photo{t.photos.length !== 1 ? "s" : ""}</div>}
                  {isDone && (
                    <div style={{ fontSize: 11, color: "#4a7a35", marginTop: 4, marginLeft: 32 }}>
                      ✓ {t.completedBy} — {formatTime(t.completedAt)}
                    </div>
                  )}
                </div>
                <button onClick={() => deleteTask(t)}
                  style={{ background: "none", border: "none", color: "#d0c8c8", fontSize: 18, cursor: "pointer", padding: 4 }}>&times;</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mic button - only on current week */}
      {isCurrentWeek && (
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── VOICE RECORDER MODAL ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function VoiceRecorderModal({ onSave, onCancel }) {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input not supported on this browser. Type your task below.");
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
    onSave(transcript);
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

        <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
          placeholder={isListening ? "Listening... speak now" : "Tap mic to dictate or type here"}
          style={{
            width: "100%", minHeight: 120, padding: "14px", borderRadius: 12,
            border: `2px solid ${isListening ? "#7fb069" : "#c8d8c0"}`, fontSize: 15,
            fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none",
          }} />

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={toggleListening}
            style={{
              padding: "14px 18px", borderRadius: 12, border: "none",
              background: isListening ? "#d94f3d" : "#7fb069", color: "#fff",
              fontSize: 20, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}>
            {isListening ? "⏸" : "🎤"}
          </button>
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
function TaskDetail({ task, onBack, onSave }) {
  const [t, setT] = useState({ ...task });
  const upd = (k, v) => setT(p => ({ ...p, [k]: v }));

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
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Edit Task</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 14, padding: 18, border: "1.5px solid #e0ead8" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Title</div>
          <input value={t.title || ""} onChange={e => upd("title", e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 14 }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Details</div>
          <textarea value={t.description || ""} onChange={e => upd("description", e.target.value)}
            placeholder="Add more details..."
            style={{ width: "100%", minHeight: 100, padding: "12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 14 }} />

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
