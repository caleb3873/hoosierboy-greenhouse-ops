// Manager-side: request a driver for a delivery day. Shows all SEASONAL DRIVER
// staff with their phone numbers and a Call / Text shortcut. Lets the manager
// either pick a specific driver, or post the request to "any driver".
import React, { useState, useMemo, useEffect } from "react";
import { useAuth } from "./Auth";
import { useFloorCodes2, useDriverAvailability, useDriverRequests } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

function formatPhone(p) {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return p;
}
function telHref(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `tel:+1${d.slice(-10)}` : null; }
function smsHref(p) { const d = String(p || "").replace(/\D/g, ""); return d ? `sms:+1${d.slice(-10)}` : null; }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export function DriverRequestModal({ onClose, onSubmitted, prefillDate }) {
  const { displayName } = useAuth();
  const { rows: floorCodes } = useFloorCodes2();
  const { rows: availability } = useDriverAvailability();
  const { upsert: upsertReq } = useDriverRequests();
  const [date, setDate] = useState(prefillDate || ymd(new Date()));
  const [timeWindow, setTimeWindow] = useState("am"); // "am" | "pm" | "all_day"
  const [startTime, setStartTime] = useState("07:00");
  const [target, setTarget] = useState("any"); // "any" | driver name
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const dateChips = useMemo(() => quickPickDays(14), []);

  const drivers = useMemo(() =>
    (floorCodes || [])
      .filter(fc => fc.active && (fc.title || "").toUpperCase() === "SEASONAL DRIVER")
      .sort((a, b) => (a.workerName || "").localeCompare(b.workerName || "")),
    [floorCodes]
  );

  // Map driverName → Set of available iso dates
  const availByDriver = useMemo(() => {
    const m = new Map();
    for (const a of (availability || [])) {
      if (!m.has(a.driverName)) m.set(a.driverName, new Set());
      m.get(a.driverName).add(a.availableDate);
    }
    return m;
  }, [availability]);

  async function submit() {
    if (!date) return;
    setSaving(true);
    try {
      await upsertReq({
        id: crypto.randomUUID(),
        deliveryDate: date,
        timeWindow,
        startTime,
        requestedBy: displayName || "Manager",
        requestedDriver: target === "any" ? null : target,
        details: details.trim() || null,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      onSubmitted?.();
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 0, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#162212", borderRadius: "20px 20px 0 0", padding: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", color: "#c8e6b8", borderTop: "3px solid #7fb069" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif" }}>Request a Driver</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#c8e6b8", fontSize: 22, cursor: "pointer", padding: "0 6px" }}>✕</button>
        </div>

        {/* Delivery date — quick chips (next 2 weeks) + native picker fallback */}
        <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Delivery Date</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 6, marginBottom: 6 }}>
          {dateChips.slice(0, 7).map(c => (
            <button key={c.iso} onClick={() => setDate(c.iso)}
              style={{
                padding: "8px 2px", borderRadius: 8,
                background: date === c.iso ? "#7fb069" : "#1e2d1a",
                border: `1.5px solid ${date === c.iso ? "#7fb069" : c.isWeekend ? "#3a4a30" : "#4a6a3a"}`,
                color: date === c.iso ? "#1e2d1a" : "#c8e6b8",
                fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", lineHeight: 1.15,
              }}>
              <div style={{ fontSize: 9, opacity: 0.8 }}>{c.label}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{c.dayNum}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {dateChips.slice(7, 14).map(c => (
            <button key={c.iso} onClick={() => setDate(c.iso)}
              style={{
                padding: "8px 2px", borderRadius: 8,
                background: date === c.iso ? "#7fb069" : "#1e2d1a",
                border: `1.5px solid ${date === c.iso ? "#7fb069" : c.isWeekend ? "#3a4a30" : "#4a6a3a"}`,
                color: date === c.iso ? "#1e2d1a" : "#c8e6b8",
                fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", lineHeight: 1.15,
              }}>
              <div style={{ fontSize: 9, opacity: 0.8 }}>{c.label}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>{c.dayNum}</div>
            </button>
          ))}
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={ymd(new Date())}
          style={{ width: "100%", padding: "10px 12px", marginBottom: 14, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 8, color: "#fff", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />

        {/* Time window — AM / PM / All Day */}
        <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Time Window</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6, marginBottom: 14 }}>
          {[
            { value: "am", label: "AM", sub: "Before noon" },
            { value: "pm", label: "PM", sub: "Afternoon" },
            { value: "all_day", label: "All Day", sub: "Flexible" },
          ].map(opt => {
            const selected = timeWindow === opt.value;
            return (
              <button key={opt.value} onClick={() => {
                setTimeWindow(opt.value);
                // Auto-jump start time into a reasonable spot for the window
                if (opt.value === "pm" && Number(startTime.split(":")[0]) < 12) setStartTime("12:00");
                if (opt.value === "am" && Number(startTime.split(":")[0]) >= 12) setStartTime("07:00");
                if (opt.value === "all_day") setStartTime("06:00");
              }}
                style={{
                  padding: "14px 4px", borderRadius: 10,
                  background: selected ? "#7fb069" : "#1e2d1a",
                  border: `2px solid ${selected ? "#7fb069" : "#4a6a3a"}`,
                  color: selected ? "#1e2d1a" : "#c8e6b8",
                  fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.2,
                }}>
                <div>{opt.label}</div>
                <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.8, marginTop: 2 }}>{opt.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Start time — native select on mobile pops a wheel picker, easy thumb scroll */}
        <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Start Time <span style={{ color: "#4a6a3a", fontWeight: 600 }}>(6:00 AM earliest)</span></label>
        <select value={startTime} onChange={e => setStartTime(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", marginTop: 6, marginBottom: 16, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 8, color: "#fff", fontSize: 17, fontFamily: "inherit", boxSizing: "border-box", appearance: "none", WebkitAppearance: "none" }}>
          {START_TIME_OPTIONS
            .filter(o => {
              const h = Number(o.value.split(":")[0]);
              if (timeWindow === "am") return h < 12;
              if (timeWindow === "pm") return h >= 12;
              return true; // all_day: full range
            })
            .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Who?</div>

        {/* Any driver option */}
        <div onClick={() => setTarget("any")}
          style={{ background: target === "any" ? "#1e2d1a" : "transparent", border: `2px solid ${target === "any" ? "#7fb069" : "#3a5a30"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Any available driver</div>
            <div style={{ fontSize: 11, color: "#7a9a6a", marginTop: 2 }}>First driver to accept gets it</div>
          </div>
          {target === "any" && <span style={{ color: "#7fb069", fontSize: 20 }}>✓</span>}
        </div>

        {/* Specific drivers */}
        {drivers.map(d => {
          const name = d.workerName;
          const isSelected = target === name;
          const isAvailThatDay = availByDriver.get(name)?.has(date);
          const phone = d.phone;
          return (
            <div key={d.id || name}
              style={{ background: isSelected ? "#1e2d1a" : "transparent", border: `2px solid ${isSelected ? "#7fb069" : "#3a5a30"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
              <div onClick={() => setTarget(name)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: phone ? 8 : 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{name}</div>
                  <div style={{ fontSize: 11, marginTop: 2, color: isAvailThatDay ? "#7fb069" : "#d94f3d", fontWeight: 700 }}>
                    {isAvailThatDay ? "✓ Available that day" : "Not marked available — they may still accept"}
                  </div>
                </div>
                {isSelected && <span style={{ color: "#7fb069", fontSize: 20, marginLeft: 8 }}>✓</span>}
              </div>
              {phone && (
                <div style={{ display: "flex", gap: 6, paddingTop: 8, borderTop: "1px dashed rgba(127, 176, 105, 0.2)" }}>
                  <a href={telHref(phone)} onClick={e => e.stopPropagation()}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e4d2b", border: "1px solid #7fb069", color: "#7fb069", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                    📞 Call {formatPhone(phone)}
                  </a>
                  <a href={smsHref(phone)} onClick={e => e.stopPropagation()}
                    style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e2d4d", border: "1px solid #6a8fd9", color: "#6a8fd9", padding: "8px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>
                    💬 Text
                  </a>
                </div>
              )}
            </div>
          );
        })}

        <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginTop: 10, display: "block" }}>Details (optional)</label>
        <textarea value={details} onChange={e => setDetails(e.target.value)} rows={3} placeholder="Pickup time, stops, special notes…"
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 12, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 8, color: "#fff", fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: "transparent", border: "1px solid #4a6a3a", borderRadius: 10, padding: "12px", color: "#c8e6b8", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !date}
            style={{ flex: 2, background: saving ? "#4a6a3a" : "#7fb069", border: "none", borderRadius: 10, padding: "12px", color: "#1e2d1a", fontSize: 14, fontWeight: 800, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Sending…" : `Send request${target === "any" ? "" : ` to ${target.split(" ")[0]}`}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function responseLink(reqId) {
  // Deeplink the driver opens after tapping the SMS. Bypasses auth on AppInner.
  const origin = typeof window !== "undefined" ? window.location.origin : "https://ops.hoosierboy.com";
  return `${origin}/?driverResponse=${reqId}`;
}

function smsRequestBody(req, driverName) {
  // Pre-filled SMS body the manager sends to the driver. Manager taps Text →
  // their Messages app opens with this body + driver's number ready to send.
  const firstName = (driverName || "").trim().split(/\s+/)[0] || "there";
  const dateLabel = req.deliveryDate
    ? new Date(req.deliveryDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "";
  const link = responseLink(req.id);
  const timing = formatTiming(req.timeWindow || req.time_window, req.startTime || req.start_time);
  const when = timing ? `${dateLabel} (${timing})` : dateLabel;
  let body = `Hey ${firstName}, are you available to drive ${when}? Please click this link and approve or decline:\n${link}`;
  if (req.details) body += `\n\nDetails: ${req.details}`;
  return body;
}

// Human-readable timing chip — "AM, starts 7:00 AM" / "All day, starts 6:00 AM" / "PM"
export function formatTiming(window, startTime) {
  if (!window) return "";
  const windowLabel = window === "all_day" ? "All day" : window.toUpperCase();
  const t = formatTime12(startTime);
  if (!t) return windowLabel;
  return `${windowLabel}, starts ${t}`;
}
function formatTime12(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${period}`;
}

// Quick-pick date chips (today, tomorrow, +2…+6) for thumb-tap-fast date entry
function quickPickDays(count = 7) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = d.getDate();
    out.push({ iso, label, dayNum, isWeekend: d.getDay() === 0 || d.getDay() === 6 });
  }
  return out;
}

// Start-time options — 6:00 AM through 5:30 PM in 30-min steps. Earliest 6:00 AM per ops.
const START_TIME_OPTIONS = (() => {
  const out = [];
  for (let h = 6; h < 18; h++) {
    for (const m of [0, 30]) {
      const hhmm = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      out.push({ value: hhmm, label: formatTime12(hhmm) });
    }
  }
  return out;
})();

// Manager inbox: shows status of requests this manager submitted with Call/Text-with-link buttons
export function DriverRequestStatusList({ scope = "mine" }) {
  const { displayName } = useAuth();
  const { rows: requests } = useDriverRequests();
  const { rows: floorCodes } = useFloorCodes2();
  const todayIso = ymd(new Date());

  const driverPhones = useMemo(() => {
    const m = new Map();
    for (const fc of (floorCodes || [])) {
      if (fc.workerName && fc.phone) m.set(fc.workerName, fc.phone);
    }
    return m;
  }, [floorCodes]);

  const list = useMemo(() => {
    return (requests || [])
      .filter(r => r.deliveryDate >= todayIso)
      .filter(r => scope === "all" || r.requestedBy === displayName)
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  }, [requests, displayName, scope, todayIso]);

  if (list.length === 0) return null;
  return (
    <div style={{ background: "#162212", border: "1px solid rgba(127, 176, 105, 0.3)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a9a6a", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Driver Requests</div>
      {list.map(r => {
        const phone = r.requestedDriver ? driverPhones.get(r.requestedDriver) : null;
        const isPending = r.status === "pending";
        return (
          <div key={r.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(127, 176, 105, 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontSize: 13, alignItems: "center" }}>
              <span><b>{r.deliveryDate}</b> — {r.requestedDriver || "Any driver"}</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                background: r.status === "accepted" ? "#7fb069" : r.status === "declined" ? "#d94f3d" : "#e89a3a",
                color: r.status === "accepted" ? "#1e2d1a" : "#fff" }}>
                {r.status === "accepted" ? `✓ ${r.acceptedBy}` : r.status === "declined" ? `✗ ${r.acceptedBy}` : "Pending"}
              </span>
            </div>
            {(r.timeWindow || r.startTime) && (
              <div style={{ fontSize: 11, color: "#c8e6b8", marginTop: 3, fontWeight: 700 }}>
                🕐 {formatTiming(r.timeWindow, r.startTime)}
              </div>
            )}
            {r.details && <div style={{ fontSize: 11, color: "#7a9a6a", marginTop: 3 }}>{r.details}</div>}
            {r.driverComment && (
              <div style={{ fontSize: 12, color: "#c8e6b8", marginTop: 6, padding: "6px 10px", background: "rgba(127, 176, 105, 0.08)", borderLeft: "3px solid #7fb069", borderRadius: 4, whiteSpace: "pre-wrap" }}>
                💬 {r.driverComment}
              </div>
            )}
            {phone && isPending && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <a href={telHref(phone)}
                  style={{ flex: 1, textAlign: "center", textDecoration: "none", background: "#1e4d2b", border: "1px solid #7fb069", color: "#7fb069", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                  📞 Call {r.requestedDriver?.split(" ")[0]}
                </a>
                <a href={`${smsHref(phone)}${smsHref(phone)?.includes("?") ? "&" : "?"}body=${encodeURIComponent(smsRequestBody(r, r.requestedDriver))}`}
                  style={{ flex: 2, textAlign: "center", textDecoration: "none", background: "#1e2d4d", border: "1px solid #6a8fd9", color: "#6a8fd9", padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800 }}>
                  💬 Text with Accept/Decline link
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Pops up on the manager's next app-open whenever drivers responded to their
// requests. Marks decision_seen=true once dismissed so it doesn't pop again.
export function useDriverResponsePopup() {
  const { displayName } = useAuth();
  const { rows: requests, upsert } = useDriverRequests();
  const [dismissed, setDismissed] = useState(false);

  const unseen = useMemo(() => {
    return (requests || []).filter(r =>
      r.requestedBy === displayName &&
      (r.status === "accepted" || r.status === "declined") &&
      r.decisionSeen === false
    );
  }, [requests, displayName]);

  const dismiss = async () => {
    setDismissed(true);
    // Fire-and-forget; ignore failures so the popup doesn't get stuck
    await Promise.all(unseen.map(r => upsert({ ...r, decisionSeen: true }).catch(() => {})));
  };

  return { open: !dismissed && unseen.length > 0, unseen, dismiss };
}

export function DriverResponsePopup({ unseen, onClose }) {
  if (!unseen?.length) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Driver response{unseen.length > 1 ? "s" : ""}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif", marginTop: 4, marginBottom: 14 }}>
          {unseen.length === 1 ? `${unseen[0].acceptedBy} replied` : `${unseen.length} drivers replied`}
        </div>
        {unseen.map(r => {
          const accepted = r.status === "accepted";
          const d = r.deliveryDate ? new Date(r.deliveryDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }) : "";
          return (
            <div key={r.id} style={{ border: `2px solid ${accepted ? "#7fb069" : "#d94f3d"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, background: accepted ? "#f8fbf5" : "#fff5f3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{r.acceptedBy}</div>
                <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                  background: accepted ? "#7fb069" : "#d94f3d", color: "#fff" }}>
                  {accepted ? "✓ ACCEPTED" : "✗ DECLINED"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>{d}</div>
              {(r.timeWindow || r.startTime) && (
                <div style={{ fontSize: 12, color: "#1e2d1a", marginTop: 3, fontWeight: 700 }}>
                  🕐 {formatTiming(r.timeWindow, r.startTime)}
                </div>
              )}
              {r.driverComment && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "#fff", border: "1px solid #e0ead8", borderRadius: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1 }}>Note from driver</div>
                  <div style={{ fontSize: 13, color: "#1e2d1a", marginTop: 3, whiteSpace: "pre-wrap" }}>{r.driverComment}</div>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={onClose}
          style={{ width: "100%", marginTop: 8, padding: "14px", background: "#1e2d1a", border: "none", borderRadius: 10, color: "#c8e6b8", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Got it
        </button>
      </div>
    </div>
  );
}
