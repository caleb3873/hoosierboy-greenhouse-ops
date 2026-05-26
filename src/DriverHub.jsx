// Simplified landing for Seasonal Drivers. Two priorities:
//   1. See incoming delivery requests from managers
//   2. Mark which days they're available (default = none)
import React, { useState, useMemo } from "react";
import { useAuth } from "./Auth";
import { useDriverAvailability, useDriverRequests, useAnnouncements, useFloorCodes2 } from "./supabase";
import { VacationRequestModal } from "./Vacation";
import { HrComposeModal } from "./HrMessages";
import { AnnouncementBanner, AnnouncementPopup, useAnnouncementPopup } from "./Announcements";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function weekdayShort(d) { return d.toLocaleDateString("en-US", { weekday: "short" }); }
function monthDay(d) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function formatPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}
function telHref(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `tel:+1${d.slice(-10)}` : null; }
function smsHref(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `sms:+1${d.slice(-10)}` : null; }

export default function DriverHub({ onSwitchMode }) {
  const { displayName } = useAuth();
  const { rows: availability, upsert: upsertAvail, remove: removeAvail } = useDriverAvailability();
  const { rows: requests, upsert: upsertReq } = useDriverRequests();
  const { rows: floorCodes } = useFloorCodes2();
  const announcementPopup = useAnnouncementPopup();

  // Lookup map: managerName → phone (for Call/Text on incoming requests)
  const managerPhones = useMemo(() => {
    const m = new Map();
    for (const fc of (floorCodes || [])) {
      if (fc.phone && fc.workerName) m.set(fc.workerName, fc.phone);
    }
    return m;
  }, [floorCodes]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showVacation, setShowVacation] = useState(false);
  const [showHrCompose, setShowHrCompose] = useState(false);

  // 14 days starting from today + weekOffset weeks
  const days = useMemo(() => {
    const start = addDays(new Date(), weekOffset * 7);
    return Array.from({ length: 14 }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  // Map iso → my own availability row
  const myAvail = useMemo(() => {
    const m = new Map();
    for (const a of (availability || [])) {
      if (a.driverName === displayName) m.set(a.availableDate, a);
    }
    return m;
  }, [availability, displayName]);

  // Requests targeted at me OR any-driver, future or current
  const myRequests = useMemo(() => {
    const todayIso = ymd(new Date());
    return (requests || []).filter(r =>
      r.deliveryDate >= todayIso &&
      (r.requestedDriver === displayName || r.requestedDriver == null || r.requestedDriver === "")
    ).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  }, [requests, displayName]);

  async function toggleAvailability(iso) {
    const existing = myAvail.get(iso);
    if (existing) {
      await removeAvail(existing.id);
    } else {
      await upsertAvail({
        id: crypto.randomUUID(),
        driverName: displayName || "Unknown",
        availableDate: iso,
      });
    }
  }

  async function acceptRequest(req) {
    await upsertReq({ ...req, status: "accepted", acceptedBy: displayName || "Driver", acceptedAt: new Date().toISOString(), decisionSeen: false });
  }
  async function declineRequest(req) {
    if (!window.confirm("Decline this delivery request?")) return;
    await upsertReq({ ...req, status: "declined", acceptedBy: displayName || "Driver", acceptedAt: new Date().toISOString(), decisionSeen: false });
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#1e2d1a", color: "#c8e6b8", paddingBottom: 50 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(127, 176, 105, 0.3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 700, letterSpacing: 1 }}>DRIVER</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif" }}>{(displayName || "").split(" ")[0]}</div>
        </div>
        <button onClick={onSwitchMode}
          style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↩ Sign out
        </button>
      </div>

      <AnnouncementBanner />

      <div style={{ padding: 14 }}>
        {/* Delivery requests */}
        <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif" }}>
              📦 Delivery Requests
            </div>
            <div style={{ fontSize: 11, color: "#7a9a6a" }}>{myRequests.length} open</div>
          </div>
          {myRequests.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7a9a6a", padding: "8px 0" }}>Nothing waiting for you right now.</div>
          ) : (
            myRequests.map(r => {
              const isMine = r.acceptedBy === displayName && r.status === "accepted";
              const someoneElseAccepted = r.status === "accepted" && r.acceptedBy !== displayName;
              const mgrPhone = managerPhones.get(r.requestedBy);
              return (
                <div key={r.id} style={{ background: "#1e2d1a", border: `1.5px solid ${isMine ? "#7fb069" : someoneElseAccepted ? "#4a6a3a" : "#3a5a30"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, opacity: someoneElseAccepted ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{r.deliveryDate}</div>
                      <div style={{ fontSize: 11, color: "#7a9a6a", marginTop: 2 }}>
                        Requested by {r.requestedBy}
                        {!r.requestedDriver && " · open to any driver"}
                        {r.requestedDriver === displayName && " · 🎯 you"}
                      </div>
                      {r.details && <div style={{ fontSize: 12, color: "#c8e6b8", marginTop: 6, whiteSpace: "pre-wrap" }}>{r.details}</div>}
                    </div>
                    {r.status === "pending" && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => declineRequest(r)}
                          style={{ background: "transparent", border: "1px solid #d94f3d", borderRadius: 8, color: "#d94f3d", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                          Decline
                        </button>
                        <button onClick={() => acceptRequest(r)}
                          style={{ background: "#7fb069", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                          ✓ Accept
                        </button>
                      </div>
                    )}
                    {isMine && <span style={{ fontSize: 11, fontWeight: 800, background: "#7fb069", color: "#1e2d1a", padding: "4px 10px", borderRadius: 999 }}>You took this</span>}
                    {someoneElseAccepted && <span style={{ fontSize: 11, color: "#7a9a6a" }}>Taken by {r.acceptedBy}</span>}
                  </div>
                  {mgrPhone && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 8, borderTop: "1px dashed rgba(127, 176, 105, 0.2)" }}>
                      <a href={telHref(mgrPhone)}
                        style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e4d2b", border: "1px solid #7fb069", color: "#7fb069", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                        📞 Call {formatPhone(mgrPhone)}
                      </a>
                      <a href={smsHref(mgrPhone)}
                        style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e2d4d", border: "1px solid #6a8fd9", color: "#6a8fd9", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                        💬 Text {r.requestedBy.split(" ")[0]}
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Availability picker */}
        <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif" }}>
              🗓 My Available Days
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} disabled={weekOffset === 0}
                style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 6, color: weekOffset === 0 ? "#4a6a3a" : "#c8e6b8", padding: "4px 10px", fontSize: 12, cursor: weekOffset === 0 ? "default" : "pointer", fontFamily: "inherit" }}>←</button>
              <button onClick={() => setWeekOffset(o => o + 1)}
                style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 6, color: "#c8e6b8", padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>→</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#7a9a6a", marginBottom: 10 }}>
            You're <b>not available by default</b>. Tap a day to mark yourself available. Managers can only request you on days you've marked.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map(d => {
              const iso = ymd(d);
              const isAvail = myAvail.has(iso);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <button key={iso} onClick={() => toggleAvailability(iso)}
                  style={{
                    padding: "10px 4px", borderRadius: 10,
                    background: isAvail ? "#7fb069" : "#1e2d1a",
                    border: `1.5px solid ${isAvail ? "#7fb069" : isWeekend ? "#3a4a30" : "#4a6a3a"}`,
                    color: isAvail ? "#1e2d1a" : "#c8e6b8",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center",
                  }}>
                  <div style={{ fontSize: 9, opacity: 0.75 }}>{weekdayShort(d)}</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{monthDay(d)}</div>
                  {isAvail && <div style={{ fontSize: 9, marginTop: 2, fontWeight: 800 }}>✓ AVAIL</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={() => setShowVacation(true)}
            style={{ background: "#162212", border: "1.5px solid #7fb069", borderRadius: 12, padding: "14px 12px", color: "#c8e6b8", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            🌴 Time Off
          </button>
          <button onClick={() => setShowHrCompose(true)}
            style={{ background: "#162212", border: "1.5px solid #8e44ad", borderRadius: 12, padding: "14px 12px", color: "#c8e6b8", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✉ Message Trish
          </button>
        </div>
      </div>

      {showVacation && <VacationRequestModal onCancel={() => setShowVacation(false)} onSaved={() => setShowVacation(false)} />}
      {showHrCompose && <HrComposeModal onClose={() => setShowHrCompose(false)} onSent={() => setShowHrCompose(false)} />}
      {announcementPopup.open && <AnnouncementPopup unseen={announcementPopup.unseen} onClose={announcementPopup.close} />}
    </div>
  );
}
