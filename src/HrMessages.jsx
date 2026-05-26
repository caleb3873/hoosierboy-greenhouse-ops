import React, { useState, useMemo } from "react";
import { useHrMessages } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

export function isHrInboxOwner(displayName) {
  const n = (displayName || "").toLowerCase();
  return n.includes("trish") || n.includes("patricia") || n.includes("garrison");
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Send a message to Trish (and email to Trish / Tyler / Mario via Resend).
export function HrComposeModal({ onClose, onSent }) {
  const { upsert } = useHrMessages();
  const { displayName, role } = useAuth();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!message.trim()) { setError("Add a message first"); return; }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      await upsert({
        id,
        fromName: displayName || "Anonymous",
        fromRole: role || null,
        message: message.trim(),
        sentAt: new Date().toISOString(),
        readAt: null,
        archived: false,
        emailSentAt: null,
      });
      // Fire the email asynchronously — the row is already saved either way.
      fetch("/api/hr-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, fromName: displayName || "Anonymous", message: message.trim() }),
      }).catch(() => {});
      onSent?.();
    } catch (e) {
      setError(e.message || "Couldn't send");
    }
    setSaving(false);
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 500, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ background: "#8e44ad", color: "#fff", padding: "14px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", opacity: 0.85, letterSpacing: 1.2 }}>HR</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>✉ Message Trish</div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: 4 }}>&times;</button>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 10 }}>
            Goes to Trish in the app and emails Trish, Tyler, and Mario at the office. Keep it short — she'll follow up.
          </div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
            placeholder="What's going on?"
            style={{ width: "100%", padding: "12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
          {error && <div style={{ background: "#fde8e8", color: "#d94f3d", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button onClick={onClose} disabled={saving}
              style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={saving || !message.trim()}
              style={{ background: !message.trim() ? "#c8d8c0" : saving ? "#a880b3" : "#8e44ad", border: "none", color: "#fff", padding: "10px 22px", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: !message.trim() || saving ? "default" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Sending…" : "✉ Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Trish's inbox — read + archive.
export function HrInbox({ onBack }) {
  const { rows, upsert } = useHrMessages();
  const { displayName } = useAuth();
  const [showArchived, setShowArchived] = useState(false);

  const inbox = useMemo(() => (rows || [])
    .filter(m => showArchived ? m.archived : !m.archived)
    .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || "")),
    [rows, showArchived]
  );
  const unreadCount = (rows || []).filter(m => !m.archived && !m.readAt).length;

  async function markRead(m) {
    if (m.readAt) return;
    await upsert({ ...m, readAt: new Date().toISOString(), readBy: displayName || "Trish" });
  }
  async function archive(m) {
    await upsert({ ...m, archived: true, readAt: m.readAt || new Date().toISOString(), readBy: m.readBy || displayName || "Trish" });
  }
  async function unarchive(m) {
    await upsert({ ...m, archived: false });
  }

  return (
    <div style={{ ...FONT, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button onClick={onBack}
          style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: "#1e2d1a", cursor: "pointer", fontFamily: "inherit" }}>
          ← Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>
          ✉ HR Inbox{unreadCount > 0 ? ` (${unreadCount})` : ""}
        </div>
        <button onClick={() => setShowArchived(!showArchived)}
          style={{ background: showArchived ? "#8e44ad" : "#fff", color: showArchived ? "#fff" : "#7a8c74", border: "1.5px solid #8e44ad", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          {showArchived ? "Inbox" : "Archived"}
        </button>
      </div>

      {inbox.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: 40, textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a" }}>
            {showArchived ? "No archived messages" : "Nothing in your inbox"}
          </div>
        </div>
      ) : (
        inbox.map(m => (
          <div key={m.id} onClick={() => markRead(m)}
            style={{ background: m.readAt ? "#fff" : "#f8f0fa", borderRadius: 14, border: `1.5px solid ${m.readAt ? "#e0ead8" : "#d0b8df"}`, padding: "14px 16px", marginBottom: 10, cursor: m.readAt ? "default" : "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{m.fromName}</span>
                {!m.readAt && <span style={{ background: "#8e44ad", color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>NEW</span>}
                <span style={{ fontSize: 11, color: "#7a8c74" }}>· {timeAgo(m.sentAt)}</span>
              </div>
              {!m.archived ? (
                <button onClick={(e) => { e.stopPropagation(); archive(m); }}
                  style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Archive
                </button>
              ) : (
                <button onClick={(e) => { e.stopPropagation(); unarchive(m); }}
                  style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Restore
                </button>
              )}
            </div>
            <div style={{ fontSize: 14, color: "#1e2d1a", marginTop: 8, whiteSpace: "pre-wrap" }}>{m.message}</div>
            {m.emailSentAt && (
              <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 6 }}>✉ Email also sent to trish@, tyler@, mario@</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
