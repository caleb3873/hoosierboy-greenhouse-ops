// Special messages: targeted alerts shown on ManagerTasksView (the one mobile dashboard).
// Pops up on login for the recipient, and (via specialMessagesForTask) when they open a
// task the message affects. Recipients match by name; empty recipients = broadcast.
import { useState, useEffect, useRef } from "react";
import { useSpecialMessages, getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

function matchesUser(msg, displayName) {
  const recips = msg.recipients || [];
  if (!recips.length) return true; // broadcast
  const dn = (displayName || "").toLowerCase().trim();
  if (!dn) return false;
  return recips.some(r => { const rr = String(r).toLowerCase().trim(); return rr && (dn.includes(rr) || rr.includes(dn)); });
}
function isDismissed(msg, displayName) {
  const dn = (displayName || "").toLowerCase().trim();
  return (msg.dismissedBy || []).some(x => String(x).toLowerCase().trim() === dn);
}

// Login pop-up — shows the current user's unseen special messages when they open the app.
export function SpecialMessagePopup() {
  const { rows } = useSpecialMessages();
  const { displayName } = useAuth();
  const [unseen, setUnseen] = useState([]);
  const [open, setOpen] = useState(false);
  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current || !rows) return;
    const mine = (rows || []).filter(m => m.active !== false && matchesUser(m, displayName) && !isDismissed(m, displayName));
    if (mine.length) { setUnseen(mine); setOpen(true); }
    checkedRef.current = true;
  }, [rows, displayName]);
  async function gotIt() {
    const sb = getSupabase();
    if (sb) for (const m of unseen) {
      const d = [...(m.dismissedBy || []), displayName].filter(Boolean);
      await sb.from("special_messages").update({ dismissed_by: d }).eq("id", m.id);
    }
    setOpen(false);
  }
  if (!open || !unseen.length) return null;
  const urgent = unseen.some(m => m.urgent);
  return (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ background: urgent ? "#d94f3d" : "#1e2d1a", color: "#fff", padding: "16px 22px", borderRadius: "16px 16px 0 0" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>Special message</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{urgent ? "🚨 " : "📌 "}{unseen.length} message{unseen.length !== 1 ? "s" : ""} for you</div>
        </div>
        <div style={{ padding: "12px 22px 18px" }}>
          {unseen.map(m => (
            <div key={m.id} style={{ background: m.urgent ? "#fff5f3" : "#f8fbf5", border: `1.5px solid ${m.urgent ? "#d94f3d" : "#7fb069"}`, borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
              {m.title && <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>{m.title}</div>}
              <div style={{ fontSize: 14, color: "#1e2d1a", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{m.body}</div>
            </div>
          ))}
          <button onClick={gotIt} style={{ marginTop: 14, width: "100%", background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 10, padding: "12px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Got it</button>
        </div>
      </div>
    </div>
  );
}

// Banner shown inside a task when a special message's keywords match that task (task-selection alert).
export function TaskSpecialMessageBanner({ task }) {
  const { rows } = useSpecialMessages();
  const { displayName } = useAuth();
  const hits = specialMessagesForTask(rows, task, displayName);
  if (!hits.length) return null;
  return (
    <div style={{ marginTop: 6, ...FONT }}>
      {hits.map(m => (
        <div key={m.id} style={{ background: "#fff5f3", border: "1.5px solid #d94f3d", borderRadius: 10, padding: "8px 10px", marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#d94f3d" }}>🚨 {m.title || "Special message"}</div>
          <div style={{ fontSize: 12, color: "#1e2d1a", lineHeight: 1.45, marginTop: 2, whiteSpace: "pre-wrap" }}>{m.body}</div>
        </div>
      ))}
    </div>
  );
}

export function specialMessagesForTask(rows, task, displayName) {
  if (!rows || !task) return [];
  const hay = `${task.title || ""} ${task.description || ""} ${task.notes || ""} ${(task.benchNumbers || []).join(" ")}`.toLowerCase();
  return rows.filter(m => m.active !== false && matchesUser(m, displayName) && (m.affectedKeywords || []).some(k => k && hay.includes(String(k).toLowerCase())));
}
