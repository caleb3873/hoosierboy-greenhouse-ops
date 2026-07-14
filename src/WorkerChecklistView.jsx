import { useMemo, useState, useEffect, useRef } from "react";
import { useManagerTasks, useBrehobItems, useVacationRequests } from "./supabase";
import { useAuth } from "./Auth";
import { CompletionPromptModal, TaskViewer, TaskPhoto, uploadTaskPhoto, formatTargetDate, bucketToDate } from "./ManagerTasksView";
import { NotificationBanner } from "./PushNotifications";
import { BrehobWorkerView } from "./BrehobList";
import { VacationRequestModal, OutThisWeekBanner } from "./Vacation";
import { AnnouncementBanner, AnnouncementPopup, useAnnouncementPopup } from "./Announcements";
import InventoryView from "./InventoryView";
import ReferenceDocs from "./ReferenceDocs";
import Evaluations from "./Evaluations";

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
  const [showInventory, setShowInventory] = useState(false);
  const [showRefDocs, setShowRefDocs] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  if (showInventory) {
    return <InventoryView onBack={() => setShowInventory(false)} />;
  }
  if (showRefDocs) {
    return <ReferenceDocs onBack={() => setShowRefDocs(false)} />;
  }
  if (showEvaluation) {
    return <Evaluations selfOnly onBack={() => setShowEvaluation(false)} />;
  }
  return <WorkerChecklistViewInner
    onSwitchMode={onSwitchMode}
    onBackToApp={onBackToApp}
    onOpenTaskCreator={onOpenTaskCreator}
    onOpenInventory={() => setShowInventory(true)}
    onOpenRefDocs={() => setShowRefDocs(true)}
    onOpenEvaluation={() => setShowEvaluation(true)}
  />;
}

function WorkerChecklistViewInner({ onSwitchMode, onBackToApp, onOpenTaskCreator, onOpenInventory, onOpenRefDocs, onOpenEvaluation }) {
  const { rows: tasks, upsert, refresh } = useManagerTasks();
  const { rows: brehobItems, update: updateBrehob } = useBrehobItems();
  const { displayName, growerProfile } = useAuth();
  const today = useMemo(() => getWeekInfo(), []);
  const [showDone, setShowDone] = useState(false);
  const [completingTask, setCompletingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [releasingTask, setReleasingTask] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [showBrehob, setShowBrehob] = useState(false);
  const [showVacationForm, setShowVacationForm] = useState(false);
  const { rows: vacationReqs, upsert: upsertVacation } = useVacationRequests();
  const announcementPopup = useAnnouncementPopup();
  const [decisionsOpen, setDecisionsOpen] = useState(false);
  const decisionsCheckedRef = useRef(false);

  // Pending decision notifications: requests this user made that have been approved/declined
  // but the user hasn't seen the result yet. decisionSeen defaults to true server-side,
  // so only tasks/items that went through the approve/decline flow show up here.
  const pendingDecisions = useMemo(() => {
    const me = displayName || "";
    const taskDecisions = tasks.filter(t =>
      (t.createdBy || "") === me &&
      t.decisionSeen === false
    ).map(t => ({
      kind: "task",
      id: t.id,
      title: t.title,
      outcome: t.status === "rejected" ? "declined" : "approved",
      reason: t.declineReason,
      row: t,
    }));
    const brehobDecisions = (brehobItems || []).filter(b =>
      (b.requestedBy || "") === me &&
      b.decisionSeen === false &&
      (b.status === "declined" || b.status === "on_list")
    ).map(b => ({
      kind: "brehob",
      id: b.id,
      title: b.name || b.title || "(brehob item)",
      outcome: b.status === "declined" ? "declined" : "approved",
      reason: b.declineReason,
      row: b,
    }));
    const vacationDecisions = (vacationReqs || []).filter(v =>
      (v.requesterName || "") === me &&
      v.decisionSeen === false &&
      (v.status === "approved" || v.status === "declined")
    ).map(v => ({
      kind: "vacation",
      id: v.id,
      title: `🌴 Time off ${v.startDate}${v.endDate !== v.startDate ? ` → ${v.endDate}` : ""}`,
      outcome: v.status,
      reason: v.declineReason,
      row: v,
    }));
    return [...taskDecisions, ...brehobDecisions, ...vacationDecisions];
  }, [tasks, brehobItems, vacationReqs, displayName]);

  // Auto-open the decisions modal once per session if anything is waiting.
  useEffect(() => {
    if (decisionsCheckedRef.current) return;
    if (!tasks.length && !(brehobItems || []).length && !(vacationReqs || []).length) return;
    const sessionKey = `gh_worker_decisions_seen_${displayName || "anon"}`;
    if (sessionStorage.getItem(sessionKey)) {
      decisionsCheckedRef.current = true;
      return;
    }
    if (pendingDecisions.length > 0) {
      setDecisionsOpen(true);
      sessionStorage.setItem(sessionKey, "1");
    }
    decisionsCheckedRef.current = true;
  }, [tasks.length, brehobItems?.length, vacationReqs?.length, pendingDecisions.length, displayName]);

  async function acknowledgeDecision(d) {
    if (d.kind === "task") {
      await upsert({ ...d.row, decisionSeen: true });
    } else if (d.kind === "vacation") {
      await upsertVacation({ ...d.row, decisionSeen: true });
    } else {
      await updateBrehob(d.id, { decisionSeen: true });
    }
  }
  async function acknowledgeAll() {
    for (const d of pendingDecisions) await acknowledgeDecision(d);
  }
  // Language: starts from the floor_codes.language preference (en | es | my), can be overridden per-device.
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem("gh_worker_lang_" + (displayName || ""));
    if (saved) return saved;
    if (growerProfile?.language) return growerProfile.language;
    return (displayName || "").toLowerCase().includes("eulogio") ? "es" : "en";
  });
  useEffect(() => {
    localStorage.setItem("gh_worker_lang_" + (displayName || ""), lang);
  }, [lang, displayName]);
  const [translations, setTranslations] = useState({}); // {taskId: {title, description, notes}}
  const translationInFlight = useRef(new Set());

  // Translate any visible task that hasn't been cached yet (es or my)
  useEffect(() => {
    if (lang === "en") return;
    const needed = tasks.filter(t => (t.category || "production") === "growing" && t.status !== "requested" && !translations[lang]?.[t.id] && !translationInFlight.current.has(lang + "|" + t.id));
    if (needed.length === 0) return;
    needed.forEach(t => translationInFlight.current.add(lang + "|" + t.id));
    const batch = needed.slice(0, 15);
    const texts = [];
    const index = [];
    for (const t of batch) {
      if (t.title) { texts.push(t.title); index.push({ taskId: t.id, field: "title" }); }
      if (t.description) { texts.push(t.description); index.push({ taskId: t.id, field: "description" }); }
    }
    if (texts.length === 0) return;
    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, target: lang }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.translations) return;
        setTranslations(prev => {
          const next = { ...prev };
          if (!next[lang]) next[lang] = {};
          data.translations.forEach((tr, i) => {
            const { taskId, field } = index[i];
            if (!next[lang][taskId]) next[lang][taskId] = {};
            next[lang][taskId][field] = tr;
          });
          return next;
        });
      })
      .finally(() => {
        batch.forEach(t => translationInFlight.current.delete(lang + "|" + t.id));
      });
  }, [lang, tasks, translations]);

  function tr(task, field) {
    if (lang !== "en" && translations[lang]?.[task.id]?.[field]) return translations[lang][task.id][field];
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
      evaluation: "Self Evaluation",
    },
    es: {
      hi: "Hola", thisWeek: "Tareas de esta semana", toDo: "Por hacer", done: "Hechas",
      nothingDone: "Nada completado aún.", noGrowing: "No hay tareas asignadas.",
      claim: "Tomar tarea", markDone: "Marcar hecha", release: "Liberar", mine: "MÍA",
      suggestTask: "Sugerir tarea", signOut: "Salir",
      today: "Hoy", tomorrow: "Mañana", dayAfter: "Pasado mañana", weekly: "Esta semana",
      evaluation: "Autoevaluación",
    },
    my: {
      hi: "မင်္ဂလာပါ", thisWeek: "ဤအပတ်လုပ်ငန်းများ", toDo: "လုပ်ရန်", done: "ပြီးပြီ",
      nothingDone: "ဘာမှမပြီးသေးပါ။", noGrowing: "လုပ်ငန်းမရှိသေးပါ။",
      claim: "လုပ်ငန်းယူပါ", markDone: "ပြီးပြီဟုသတ်မှတ်ပါ", release: "ပြန်ပေးပါ", mine: "ကျွန်တော်",
      suggestTask: "လုပ်ငန်းအကြံပြုပါ", signOut: "ထွက်ပါ",
      today: "ယနေ့", tomorrow: "မနက်ဖြန်", dayAfter: "သန်ဘက်ခါ", weekly: "ဤအပတ်",
      evaluation: "ကိုယ်တိုင် အကဲဖြတ်ချက်",
    },
  }[lang] || {
    hi: "Hi", thisWeek: "This Week's Tasks", toDo: "To Do", done: "Done",
    nothingDone: "Nothing completed yet.", noGrowing: "No growing tasks assigned yet.",
    claim: "Claim Task", markDone: "Mark Done", release: "Release", mine: "MINE",
    suggestTask: "Suggest Task", signOut: "Sign out",
    today: "Today", tomorrow: "Tomorrow", dayAfter: "Day After", weekly: "This Week",
    evaluation: "Self Evaluation",
  };

  async function appendToTask({ note, photo, photos, rating }) {
    if (!viewingTask) return;
    const updated = { ...viewingTask };
    if (note) {
      const stamp = `[${displayName || "Grower"} ${new Date().toLocaleString()}]`;
      updated.notes = (updated.notes ? updated.notes + "\n" : "") + `${stamp} ${note}`;
    }
    const add = [...(photo ? [photo] : []), ...(Array.isArray(photos) ? photos : [])];
    if (add.length) {
      updated.photos = [...(updated.photos || []), ...add];
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
    return [...r].sort((a, b) =>
      (a.targetDate || "9999-12-31").localeCompare(b.targetDate || "9999-12-31") ||
      (b.priority || 0) - (a.priority || 0)
    );
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
    // Water-in triggers: completing a Plant task spawns "water-in plants";
    // completing a Fill-pots task spawns "water-in dry pots" — at the same location/week.
    const ttl = completingTask.title || "";
    const waterTitle = ttl.startsWith("🌿 Plant") ? "💧 Water-in plants"
      : ttl.startsWith("🪴 Fill pots") ? "💧 Water-in dry pots" : null;
    if (waterTitle) {
      await upsert({
        id: crypto.randomUUID(),
        title: waterTitle + (completingTask.location ? ` — ${completingTask.location}` : ""),
        weekNumber: completingTask.weekNumber,
        year: completingTask.year,
        targetDate: completingTask.targetDate,
        status: "pending",
        category: "growing",
        location: completingTask.location,
        bench_numbers: completingTask.bench_numbers,
        planId: completingTask.planId,
        createdBy: "auto (water-in)",
        notes: `Auto-created when "${ttl}" was completed.`,
      });
    }
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
            {["en","es","my"].map(l => (
              <button key={l} onClick={() => setLang(l)}
                style={{
                  padding: "5px 10px", borderRadius: 6, border: "none",
                  background: lang === l ? GREEN : "transparent",
                  color: lang === l ? GREEN_DARK : CREAM,
                  fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                }}>
                {l === "my" ? "MY" : l.toUpperCase()}
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
          <button onClick={() => setShowVacationForm(true)} style={{ background: "#c8e6b8", border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
            🌴 Vacation
          </button>
          <button onClick={onOpenEvaluation} style={{ background: "#e8c77b", border: "none", color: GREEN_DARK, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 800, ...FONT }}>
            ★ {t_ui.evaluation}
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

      <AnnouncementBanner />
      <OutThisWeekBanner />

      {/* Inventory shortcut — opens InventoryView, defaults to Locked mode so
          growers can browse / take photos / leave notes without changing counts. */}
      {onOpenInventory && (
        <div style={{ padding: "8px 12px 0" }}>
          <button onClick={onOpenInventory}
            style={{
              width: "100%", background: "#162212", color: CREAM, border: `1px solid ${GREEN}66`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer", ...FONT,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📊</span>
              <span>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Inventory</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Locked by default · photos, notes, photos</div>
              </span>
            </span>
            <span style={{ fontSize: 18 }}>→</span>
          </button>
        </div>
      )}

      {/* Culture Guides — grower PDF reference library */}
      {onOpenRefDocs && (
        <div style={{ padding: "8px 12px 0" }}>
          <button onClick={onOpenRefDocs}
            style={{
              width: "100%", background: "#162212", color: CREAM, border: `1px solid ${GREEN}66`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer", ...FONT,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>📚</span>
              <span>
                <div style={{ fontSize: 14, fontWeight: 800 }}>Culture Guides</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Tap any PDF to open · Sakata · Takii · Syngenta</div>
              </span>
            </span>
            <span style={{ fontSize: 18 }}>→</span>
          </button>
        </div>
      )}

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

        {visible.length > 0 && (() => {
          // Group by targetDate. Today + Overdue float to top (Overdue in red),
          // then one section per upcoming day of the week.
          const todayIso = new Date().toISOString().slice(0, 10);
          const sections = new Map();
          const ensure = (key, label, accent, order) => {
            if (!sections.has(key)) sections.set(key, { label, accent, order, tasks: [] });
            return sections.get(key);
          };
          visible.forEach(t => {
            const td = t.targetDate;
            if (td === todayIso) {
              ensure("today", t_ui.today, GREEN, 0).tasks.push(t);
            } else if (td && td < todayIso && t.status !== "completed") {
              ensure("overdue", "Overdue", RED, 1).tasks.push(t);
            } else if (td) {
              const d = new Date(td + "T00:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
              ensure(`date:${td}`, label, GREEN, 2 + d.getTime() / 1e10).tasks.push(t);
            } else {
              const b = t.bucket || "this_week";
              const label = b === "today" ? t_ui.today : b === "tomorrow" ? t_ui.tomorrow : b === "check_tomorrow" ? t_ui.dayAfter : t_ui.weekly;
              ensure(`bucket:${b}`, label, GREEN, 9).tasks.push(t);
            }
          });
          const ordered = [...sections.entries()].sort((a, b) => a[1].order - b[1].order);
          return ordered.map(([key, sec]) => {
            const sectionTasks = sec.tasks;
          return (
            <div key={key} style={{ marginBottom: 18 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 12, fontWeight: 800, color: key === "overdue" ? "#ffb3a8" : CREAM, textTransform: "uppercase",
                letterSpacing: 1.2, margin: "8px 4px 10px",
              }}>
                <span>{sec.label}</span>
                <div style={{ flex: 1, height: 2, background: sec.accent, borderRadius: 1 }} />
                <span style={{ background: sec.accent, color: key === "overdue" ? "#fff" : GREEN_DARK, borderRadius: 999, padding: "2px 10px", fontSize: 11 }}>{sectionTasks.length}</span>
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
                      {task.location && (
                        <div style={{ fontSize: 12, color: "#e89a3a", marginTop: 4, fontWeight: 800 }}>📍 {task.location}</div>
                      )}
                      {Array.isArray(task.benchNumbers) && task.benchNumbers.length > 0 && (
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 3 }}>
                          {task.benchNumbers.slice(0, 12).map(b => (
                            <span key={b} style={{ background: "#1e2d1a", border: "1px solid #4a6a3a", color: "#c8e6b8", fontSize: 11, fontFamily: "monospace", padding: "2px 6px", borderRadius: 4, fontWeight: 800 }}>
                              {b}
                            </span>
                          ))}
                          {task.benchNumbers.length > 12 && (
                            <span style={{ fontSize: 11, color: "#9cb894", alignSelf: "center" }}>+{task.benchNumbers.length - 12} more</span>
                          )}
                        </div>
                      )}
                      {task.description && (
                        <div style={{ fontSize: 13, color: "#9cb894", marginTop: 4 }}>{tr(task, "description")}</div>
                      )}
                      {task.diagramUrl && (
                        <a href={task.diagramUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-block", fontSize: 13, fontWeight: 700, color: "#0c1f0c", background: "#7fb069", padding: "5px 12px", borderRadius: 8, textDecoration: "none", marginTop: 6 }}>🔗 Planting diagram</a>
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
          });
        })()}
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

      {decisionsOpen && pendingDecisions.length > 0 && (
        <DecisionsModal
          decisions={pendingDecisions}
          displayName={displayName}
          onAcknowledge={acknowledgeDecision}
          onClose={async () => { await acknowledgeAll(); setDecisionsOpen(false); }}
        />
      )}
      {showVacationForm && (
        <VacationRequestModal
          onCancel={() => setShowVacationForm(false)}
          onSaved={() => setShowVacationForm(false)}
        />
      )}
      {announcementPopup.open && (
        <AnnouncementPopup unseen={announcementPopup.unseen} onClose={announcementPopup.close} />
      )}
    </div>
  );
}

// ── Decisions modal ──────────────────────────────────────────────────────────
// Shown once per session when the worker logs in with newly-approved/declined requests.
function DecisionsModal({ decisions, displayName, onAcknowledge, onClose }) {
  const [acked, setAcked] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const visible = decisions.filter(d => !acked.has(d.id));

  async function handleAck(d) {
    setBusy(d.id);
    try { await onAcknowledge(d); }
    finally { setBusy(null); }
    setAcked(prev => { const s = new Set(prev); s.add(d.id); return s; });
  }

  const approved = visible.filter(d => d.outcome === "approved");
  const declined = visible.filter(d => d.outcome === "declined");

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 540, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 0 }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "16px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>
              {displayName ? `Hi ${displayName.split(" ")[0]} — updates on your requests` : "Updates on your requests"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              {decisions.length} update{decisions.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1.5px solid rgba(200,230,184,0.5)", color: "#c8e6b8", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Got it
          </button>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a" }}>All caught up</div>
          </div>
        ) : (
          <div style={{ padding: "12px 16px 16px" }}>
            {approved.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4a7a35", textTransform: "uppercase", letterSpacing: 1, margin: "6px 4px 6px" }}>
                  ✓ Approved ({approved.length})
                </div>
                {approved.map(d => (
                  <div key={d.id} style={{ background: "#f0f8eb", border: "1.5px solid #7fb069", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{d.title}</div>
                        <div style={{ fontSize: 11, color: "#4a7a35", marginTop: 2 }}>
                          {d.kind === "brehob" ? "🛒 Added to Brehob shopping list"
                            : d.kind === "vacation" ? `🌴 Time off approved${d.row?.approver ? ` by ${d.row.approver}` : ""}`
                            : "Added to the manager's task list"}
                        </div>
                      </div>
                      <button onClick={() => handleAck(d)} disabled={busy === d.id}
                        style={{ background: "#7fb069", border: "none", color: "#1e2d1a", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {busy === d.id ? "..." : "OK"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
            {declined.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#d94f3d", textTransform: "uppercase", letterSpacing: 1, margin: "10px 4px 6px" }}>
                  ✗ Declined ({declined.length})
                </div>
                {declined.map(d => (
                  <div key={d.id} style={{ background: "#fff5f3", border: "1.5px solid #d94f3d", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{d.title}</div>
                        {d.reason && (
                          <div style={{ fontSize: 12, color: "#7a3d2f", marginTop: 4, padding: "6px 8px", background: "#fff", borderRadius: 6, fontStyle: "italic" }}>
                            "{d.reason}"
                          </div>
                        )}
                        {!d.reason && (
                          <div style={{ fontSize: 11, color: "#7a3d2f", marginTop: 2, fontStyle: "italic" }}>No reason given.</div>
                        )}
                      </div>
                      <button onClick={() => handleAck(d)} disabled={busy === d.id}
                        style={{ background: "#fff", border: "1.5px solid #d94f3d", color: "#d94f3d", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        {busy === d.id ? "..." : "OK"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
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
