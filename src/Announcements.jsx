import React, { useState, useMemo, useEffect, useRef } from "react";
import { useAnnouncements } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

export function canPostAnnouncement(displayName) {
  const n = (displayName || "").toLowerCase();
  return n.includes("paul") || n.includes("patricia") || n.includes("garrison") || n.includes("trish")
      || n.includes("tyler") || n.includes("mario");
}

function isVisible(a) {
  if (!a.active) return false;
  if (a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
  return true;
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Persistent banner shown on every floor / admin view ─────────────────────
export function AnnouncementBanner() {
  const { rows } = useAnnouncements();
  const { displayName } = useAuth();
  const canEdit = canPostAnnouncement(displayName);
  const [collapsed, setCollapsed] = useState(true);
  const active = useMemo(() => (rows || []).filter(isVisible), [rows]);

  if (active.length === 0) return null;
  const urgent = active.some(a => a.priority === "urgent");
  const bg = urgent ? "#d94f3d" : "#1e2d1a";
  const fg = urgent ? "#fff" : "#c8e6b8";
  const accent = urgent ? "#fff" : "#7fb069";

  return (
    <div style={{ background: bg, color: fg, padding: "8px 16px", ...FONT, borderBottom: `2px solid ${accent}` }}>
      <div onClick={() => setCollapsed(!collapsed)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{urgent ? "🚨" : "📢"}</span>
          <div style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: collapsed ? "nowrap" : "normal" }}>
            {collapsed && active.length > 1 ? `${active.length} announcements` : active[0]?.message}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {active.length > 1 && <span style={{ fontSize: 10, fontWeight: 800, opacity: 0.75 }}>{collapsed ? `+${active.length - 1} more` : ""}</span>}
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{collapsed ? "▼" : "▲"}</span>
        </div>
      </div>
      {!collapsed && active.length > 1 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${accent}66` }}>
          {active.slice(1).map(a => (
            <div key={a.id} style={{ fontSize: 12, marginTop: 6 }}>
              {a.priority === "urgent" ? "🚨" : "•"} {a.message}
            </div>
          ))}
        </div>
      )}
      {!collapsed && (
        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, opacity: 0.8 }}>
          <span>Posted by {active[0]?.postedBy || "—"}{active[0]?.createdAt ? ` · ${timeAgo(active[0].createdAt)}` : ""}</span>
          {canEdit && <span style={{ fontStyle: "italic" }}>Tap 📢 in the header to manage</span>}
        </div>
      )}
    </div>
  );
}

// ── Login popup ──────────────────────────────────────────────────────────────
// Shown once per session listing announcements the user hasn't seen yet.
export function useAnnouncementPopup() {
  const { rows } = useAnnouncements();
  const { displayName } = useAuth();
  const checkedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState([]);

  useEffect(() => {
    if (checkedRef.current) return;
    if (!rows) return;
    const active = (rows || []).filter(isVisible);
    if (active.length === 0) { checkedRef.current = true; return; }
    const seenKey = `gh_anc_seen_${displayName || "anon"}`;
    let seenIds = [];
    try { seenIds = JSON.parse(sessionStorage.getItem(seenKey) || "[]"); } catch {}
    const newOnes = active.filter(a => !seenIds.includes(a.id));
    if (newOnes.length > 0) {
      setUnseen(newOnes);
      setOpen(true);
      sessionStorage.setItem(seenKey, JSON.stringify(active.map(a => a.id)));
    }
    checkedRef.current = true;
  }, [rows, displayName]);

  return { open, unseen, close: () => setOpen(false) };
}

export function AnnouncementPopup({ unseen, onClose }) {
  if (!unseen || unseen.length === 0) return null;
  const hasUrgent = unseen.some(a => a.priority === "urgent");
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ background: hasUrgent ? "#d94f3d" : "#1e2d1a", color: hasUrgent ? "#fff" : "#c8e6b8", padding: "16px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>From the office</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              {hasUrgent ? "🚨 " : "📢 "}{unseen.length} New Announcement{unseen.length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: `1.5px solid ${hasUrgent ? "rgba(255,255,255,0.5)" : "rgba(200,230,184,0.5)"}`, color: hasUrgent ? "#fff" : "#c8e6b8", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Got it
          </button>
        </div>
        <div style={{ padding: "12px 22px 22px" }}>
          {unseen.map(a => (
            <div key={a.id} style={{ background: a.priority === "urgent" ? "#fff5f3" : "#f8fbf5",
              border: `1.5px solid ${a.priority === "urgent" ? "#d94f3d" : "#7fb069"}`,
              borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
              <div style={{ fontSize: 15, color: "#1e2d1a", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{a.message}</div>
              <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 8 }}>
                — {a.postedBy || "Office"}{a.createdAt ? ` · ${timeAgo(a.createdAt)}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Compose / manage modal (Paul + Trish) ───────────────────────────────────
export function AnnouncementComposerModal({ onClose }) {
  const { rows, upsert, remove } = useAnnouncements();
  const { displayName } = useAuth();
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [expiresIn, setExpiresIn] = useState("week"); // never | day | week | month
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const expiresAtIso = useMemo(() => {
    if (expiresIn === "never") return null;
    const d = new Date();
    if (expiresIn === "day") d.setDate(d.getDate() + 1);
    else if (expiresIn === "week") d.setDate(d.getDate() + 7);
    else if (expiresIn === "month") d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }, [expiresIn]);

  const existing = useMemo(() => (rows || []).filter(a => a.active), [rows]);

  async function submit() {
    setError("");
    if (!message.trim()) { setError("Message can't be empty"); return; }
    setSaving(true);
    try {
      await upsert({
        id: crypto.randomUUID(),
        message: message.trim(),
        postedBy: displayName || "Office",
        priority,
        expiresAt: expiresAtIso,
        active: true,
      });
      setMessage("");
      setPriority("normal");
      setExpiresIn("week");
    } catch (e) {
      setError(e.message || "Couldn't post");
    }
    setSaving(false);
  }

  async function deactivate(a) {
    if (!window.confirm("Take this announcement down?")) return;
    await upsert({ ...a, active: false });
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 580, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "14px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>Office</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📢 Announcements</div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer", padding: 4 }}>&times;</button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Post a new announcement</div>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
            placeholder="Important update everyone needs to see…"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Urgency</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["normal","Normal","#7fb069"],["urgent","🚨 Urgent","#d94f3d"]].map(([id, label, color]) => (
                  <button key={id} onClick={() => setPriority(id)}
                    style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1.5px solid ${priority === id ? color : "#c8d8c0"}`,
                      background: priority === id ? color : "#fff", color: priority === id ? "#fff" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Expires</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[["day","1 day"],["week","1 week"],["month","1 month"],["never","Never"]].map(([id, label]) => (
                  <button key={id} onClick={() => setExpiresIn(id)}
                    style={{ padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1.5px solid ${expiresIn === id ? "#1e2d1a" : "#c8d8c0"}`,
                      background: expiresIn === id ? "#1e2d1a" : "#fff", color: expiresIn === id ? "#c8e6b8" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
                ))}
              </div>
            </div>
          </div>

          {error && <div style={{ background: "#fde8e8", color: "#d94f3d", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginTop: 12 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={submit} disabled={saving || !message.trim()}
              style={{ background: !message.trim() ? "#c8d8c0" : saving ? "#b0c8a0" : "#7fb069",
                border: "none", color: "#fff", padding: "10px 22px", borderRadius: 10, fontWeight: 800, fontSize: 14,
                cursor: !message.trim() || saving ? "default" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Posting…" : "📢 Post"}
            </button>
          </div>

          {existing.length > 0 && (
            <>
              <div style={{ marginTop: 22, fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Active right now ({existing.length})</div>
              <div style={{ marginTop: 8 }}>
                {existing.map(a => (
                  <div key={a.id} style={{ background: "#f8fbf5", border: "1.5px solid #e0ead8", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: "#1e2d1a", whiteSpace: "pre-wrap" }}>{a.priority === "urgent" ? "🚨 " : ""}{a.message}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>
                          {a.postedBy} · {timeAgo(a.createdAt)}
                          {a.expiresAt && ` · expires ${new Date(a.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </div>
                      </div>
                      <button onClick={() => deactivate(a)}
                        style={{ background: "#fff", border: "1.5px solid #d94f3d", color: "#d94f3d", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                        Take down
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
