import { useMemo, useState } from "react";
import { useManagerTasks } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const GREEN_DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";

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

  const weekTasks = useMemo(() => {
    // Workers only see growing tasks
    const r = tasks.filter(t => t.year === today.year && t.weekNumber === today.week && (t.category || "production") === "growing");
    return [...r].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [tasks, today]);

  const pending = weekTasks.filter(t => t.status !== "completed");
  const done = weekTasks.filter(t => t.status === "completed");
  const visible = showDone ? done : pending;

  async function toggleDone(task) {
    const completed = task.status === "completed";
    await upsert({
      ...task,
      status: completed ? "pending" : "completed",
      completedBy: completed ? null : (displayName || "Worker"),
      completedAt: completed ? null : new Date().toISOString(),
    });
    refresh();
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: GREEN_DARK, color: "#fff", paddingBottom: 80 }}>
      <div style={{ padding: "18px 16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>Hi {displayName}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: CREAM }}>This Week's Tasks</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
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
            {showDone ? "Nothing completed yet." : "No tasks — all caught up! 🎉"}
          </div>
        )}
        {visible.map(task => {
          const completed = task.status === "completed";
          return (
            <div key={task.id} onClick={() => toggleDone(task)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 14,
                background: completed ? "#2a3a24" : "#263821",
                border: `1px solid ${GREEN}44`,
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
                <div style={{ fontSize: 17, fontWeight: 600, color: CREAM, textDecoration: completed ? "line-through" : "none", opacity: completed ? 0.7 : 1 }}>
                  {task.title}
                </div>
                {task.description && (
                  <div style={{ fontSize: 13, color: "#9cb894", marginTop: 4 }}>{task.description}</div>
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
    </div>
  );
}
