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
  const [target, setTarget] = useState("any"); // "any" | driver name
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

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

        <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Delivery Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} min={ymd(new Date())}
          style={{ width: "100%", padding: "10px 12px", marginTop: 4, marginBottom: 12, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 8, color: "#fff", fontSize: 15, fontFamily: "inherit" }} />

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

function smsRequestBody(req) {
  // Pre-filled SMS body the manager sends to the driver
  const date = req.deliveryDate || "";
  const who = req.requestedBy || "Schlegel Greenhouse";
  const link = responseLink(req.id);
  let body = `Hi — ${who} here. Can you drive a delivery on ${date}?`;
  if (req.details) body += `\n${req.details}`;
  body += `\nTap to accept/decline: ${link}`;
  return body;
}

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
                <a href={`${smsHref(phone)}${smsHref(phone)?.includes("?") ? "&" : "?"}body=${encodeURIComponent(smsRequestBody(r))}`}
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
