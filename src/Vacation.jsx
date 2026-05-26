import React, { useState, useMemo, useEffect } from "react";
import { useVacationRequests } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

export function isVacationApprover(displayName) {
  const n = (displayName || "").toLowerCase();
  // Paul (admin), Trish (HR), Tyler (operations manager), Mario (annuals manager)
  return n.includes("paul") || n.includes("patricia") || n.includes("garrison") || n.includes("trish")
      || n.includes("tyler") || n.includes("mario");
}

function fmtRange(start, end) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  const sameDay = start === end;
  const monthShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (sameDay) return monthShort(s);
  if (sameMonth) return `${monthShort(s)}–${e.getDate()}`;
  return `${monthShort(s)} – ${monthShort(e)}`;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }

// Monday & Sunday of the ISO week containing the given date
function weekBounds(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // 0=Mon
  const mon = new Date(d); mon.setDate(d.getDate() - day); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { mon, sun, monIso: mon.toISOString().slice(0,10), sunIso: sun.toISOString().slice(0,10) };
}

// Does a request overlap a date window [winStartIso, winEndIso]?
function overlapsWindow(req, winStartIso, winEndIso) {
  return req.startDate <= winEndIso && req.endDate >= winStartIso;
}

// ── Submit modal ─────────────────────────────────────────────────────────────
export function VacationRequestModal({ onCancel, onSaved }) {
  const { rows, upsert } = useVacationRequests();
  const { displayName, role } = useAuth();
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [isSick, setIsSick] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Show who else is approved off during the picked dates
  const overlapping = useMemo(() => {
    if (!start || !end || start > end) return [];
    return (rows || []).filter(r => r.status === "approved" && overlapsWindow(r, start, end) && r.requesterName !== displayName);
  }, [rows, start, end, displayName]);

  async function submit() {
    setError("");
    if (!start || !end) { setError("Pick both dates"); return; }
    if (start > end) { setError("End date must be on or after start"); return; }
    setSaving(true);
    try {
      await upsert({
        id: crypto.randomUUID(),
        requesterName: displayName || "Unknown",
        requesterRole: role || null,
        startDate: start,
        endDate: end,
        reason: reason.trim() || null,
        isSick,
        status: isSick ? "approved" : "pending",
        approver: isSick ? "Auto (sick)" : null,
        approvedAt: isSick ? new Date().toISOString() : null,
        decisionSeen: true,
        declineReason: null,
      });
      // Notify Paul on new pending requests
      if (!isSick) {
        fetch("/api/notify-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "vacation_requested",
            title: `${displayName || "Someone"} — ${fmtRange(start, end)}`,
            requester: displayName || "Unknown",
            category: "growing",
            bucket: "today",
          }),
        }).catch(() => {});
      }
      onSaved?.();
    } catch (e) {
      setError(e.message || "Couldn't submit");
    }
    setSaving(false);
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ background: "#7fb069", color: "#fff", padding: "14px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.9 }}>Time off</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>🌴 Vacation Request</div>
          </div>
          <button onClick={onCancel}
            style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: 4 }}>&times;</button>
        </div>

        <div style={{ padding: 20 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Requester</label>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a", marginBottom: 16 }}>{displayName || "—"}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Start date</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>End date</label>
              <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={isSick} onChange={e => setIsSick(e.target.checked)} />
              <span style={{ fontSize: 14, color: "#1e2d1a", fontWeight: 700 }}>🤒 Sick leave</span>
              <span style={{ fontSize: 12, color: "#7a8c74" }}>(auto-approved — Paul still sees it)</span>
            </label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4 }}>Reason {!isSick && <span style={{ color: "#9aaa90", fontWeight: 400 }}>(optional)</span>}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder={isSick ? "Optional — any details" : "e.g. wedding, family trip, doctor appointment"}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
          </div>

          {/* Overlap sidebar */}
          {overlapping.length > 0 && (
            <div style={{ background: "#fff4e8", border: "1.5px solid #e8c890", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a5a00", textTransform: "uppercase", marginBottom: 6 }}>
                ⚠ Already off during these dates
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {overlapping.map(r => (
                  <span key={r.id} style={{ fontSize: 12, color: "#7a5a00" }}>
                    <b>{r.requesterName}</b> ({fmtRange(r.startDate, r.endDate)}){r.isSick ? " 🤒" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "#fde8e8", color: "#d94f3d", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onCancel} disabled={saving}
              style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              style={{ background: saving ? "#b0c8a0" : "#7fb069", border: "none", color: "#fff", padding: "10px 22px", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : isSick ? "✓ Submit (auto-approved)" : "Submit request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── This-week banner ─────────────────────────────────────────────────────────
// Shown above the task list. Click expands into a full list of who's out + dates.
export function OutThisWeekBanner({ anchorDate }) {
  const { rows } = useVacationRequests();
  const [expanded, setExpanded] = useState(false);
  const { mon, sun, monIso, sunIso } = useMemo(() => weekBounds(anchorDate || new Date()), [anchorDate]);

  const outThisWeek = useMemo(() => (rows || [])
    .filter(r => r.status === "approved" && overlapsWindow(r, monIso, sunIso))
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "") || (a.requesterName || "").localeCompare(b.requesterName || "")),
    [rows, monIso, sunIso]
  );

  if (outThisWeek.length === 0) return null;

  return (
    <div style={{ background: "#fff8eb", borderBottom: "1.5px solid #e8c890", padding: "10px 20px", ...FONT }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "#7a5a00", flex: 1 }}>
          <span style={{ fontWeight: 800, marginRight: 8 }}>🌴 Out this week</span>
          <span>{outThisWeek.map(r => `${r.requesterName.split(" ")[0]} (${fmtRange(r.startDate, r.endDate)}${r.isSick ? " 🤒" : ""})`).join(" · ")}</span>
        </div>
        <div style={{ fontSize: 11, color: "#7a5a00", fontWeight: 700 }}>{expanded ? "▲" : "▼"}</div>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e8c890" }}>
          {outThisWeek.map(r => (
            <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", fontSize: 13 }}>
              <span style={{ fontWeight: 800, color: "#1e2d1a", minWidth: 140 }}>{r.requesterName}{r.isSick ? " 🤒" : ""}</span>
              <span style={{ color: "#7a5a00", minWidth: 110 }}>{fmtRange(r.startDate, r.endDate)}</span>
              {r.reason && <span style={{ color: "#7a8c74", fontStyle: "italic" }}>{r.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Paul's pending-requests inbox ────────────────────────────────────────────
export function VacationRequestsInboxModal({ onClose, onChange }) {
  const { rows, upsert, refresh } = useVacationRequests();
  const { displayName } = useAuth();
  const [decliningId, setDecliningId] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(null);

  const pending = useMemo(() => (rows || [])
    .filter(r => r.status === "pending")
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")),
    [rows]
  );

  // For each pending request, find anyone else off during the same window.
  // Includes approved AND other pending requests (so the manager sees the
  // full picture before clicking Approve). Excludes the request itself.
  function overlapsFor(req) {
    return (rows || []).filter(r =>
      r.id !== req.id &&
      (r.status === "approved" || r.status === "pending") &&
      r.requesterName !== req.requesterName &&
      overlapsWindow(r, req.startDate, req.endDate)
    ).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  }

  async function approve(req) {
    setBusy(req.id);
    try {
      await upsert({
        ...req,
        status: "approved",
        approver: displayName || "Manager",
        approvedAt: new Date().toISOString(),
        decisionSeen: false,
      });
      onChange?.();
      refresh();
    } finally { setBusy(null); }
  }

  async function decline(req) {
    if (!declineReason.trim()) { alert("Add a brief reason before declining"); return; }
    setBusy(req.id);
    try {
      await upsert({
        ...req,
        status: "declined",
        approver: displayName || "Manager",
        approvedAt: new Date().toISOString(),
        declineReason: declineReason.trim(),
        decisionSeen: false,
      });
      setDecliningId(null);
      setDeclineReason("");
      onChange?.();
      refresh();
    } finally { setBusy(null); }
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 600, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "14px 20px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.85 }}>Inbox</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>🌴 {pending.length} Vacation Request{pending.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1.5px solid rgba(200,230,184,0.5)", color: "#c8e6b8", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Close
          </button>
        </div>

        {pending.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a" }}>No pending requests</div>
          </div>
        ) : (
          <div style={{ padding: "12px 16px 16px" }}>
            {pending.map(req => (
              <div key={req.id} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{req.requesterName}</span>
                      <span style={{ background: "#e8f0e3", color: "#4a7a35", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{fmtRange(req.startDate, req.endDate)}</span>
                    </div>
                    {req.reason && <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 6, fontStyle: "italic" }}>"{req.reason}"</div>}
                  </div>
                </div>

                {/* Conflict panel — informational. Shows anyone else off during
                    the same window so the approver can spot collisions before
                    deciding. Approve button stays enabled. */}
                {(() => {
                  const overlaps = overlapsFor(req);
                  if (overlaps.length === 0) return null;
                  return (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#fff8ea", border: "1px solid #e89a3a", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#a86a10", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                        ⚠ {overlaps.length} other{overlaps.length !== 1 ? "s" : ""} off this same window
                      </div>
                      {overlaps.map(o => (
                        <div key={o.id} style={{ fontSize: 12, color: "#1e2d1a", padding: "3px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span><b>{o.requesterName}</b> · {fmtRange(o.startDate, o.endDate)}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                            background: o.status === "approved" ? "#7fb069" : "#e89a3a",
                            color: "#fff" }}>
                            {o.status === "approved" ? "APPROVED" : "PENDING"}
                          </span>
                        </div>
                      ))}
                      <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 6, fontStyle: "italic" }}>
                        This is just a heads-up — you can still approve.
                      </div>
                    </div>
                  );
                })()}
                {decliningId === req.id ? (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1.5px dashed #e0ead8" }}>
                    <input value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Why are you declining? (required)"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => { setDecliningId(null); setDeclineReason(""); }}
                        style={{ background: "#fff", border: "1.5px solid #c8d8c0", color: "#7a8c74", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={() => decline(req)} disabled={busy === req.id || !declineReason.trim()}
                        style={{ background: declineReason.trim() ? "#d94f3d" : "#e8c0bb", border: "none", color: "#fff", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: declineReason.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                        {busy === req.id ? "Saving…" : "Decline"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                    <button onClick={() => { setDecliningId(req.id); setDeclineReason(""); }} disabled={busy === req.id}
                      style={{ background: "#fff", border: "1.5px solid #d94f3d", color: "#d94f3d", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      ✗ Decline
                    </button>
                    <button onClick={() => approve(req)} disabled={busy === req.id}
                      style={{ background: busy === req.id ? "#b0c8a0" : "#7fb069", border: "none", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      {busy === req.id ? "Saving…" : "✓ Approve"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
