// Public accept/decline page reached via SMS link. No login — the request UUID
// in the URL is the auth. Driver picks Accept or Decline, optionally adds a
// comment ("can't be there past 3"). Saves back to driver_requests so the
// manager sees it the next time they open their app.
import React, { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { formatTiming } from "./DriverRequest";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

export default function DriverResponseView({ requestId, onDone }) {
  const sb = getSupabase();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [driverName, setDriverName] = useState("");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // "accepted" | "declined"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await sb.from("driver_requests").select("*").eq("id", requestId).single();
        if (cancelled) return;
        if (error || !data) { setError("This request link is invalid or has expired."); setLoading(false); return; }
        setReq(data);
        // Preserve any prior decision so the page shows the right state on refresh
        if (data.status === "accepted" || data.status === "declined") {
          setSubmitted(data.status);
          setDriverName(data.accepted_by || data.acceptedBy || "");
          setComment(data.driver_comment || data.driverComment || "");
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError("Unable to load request."); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [requestId, sb]);

  async function submit(decision) {
    if (!driverName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await sb.from("driver_requests").update({
        status: decision,
        accepted_by: driverName.trim(),
        accepted_at: new Date().toISOString(),
        driver_comment: comment.trim() || null,
        decision_seen: false,
      }).eq("id", requestId);
      if (error) throw error;
      setSubmitted(decision);
    } catch (e) {
      alert("Sorry, that didn't go through. Please try again or text the manager directly.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Screen><div style={{ color: "#7a9a6a", textAlign: "center", padding: 40 }}>Loading…</div></Screen>;
  }
  if (error) {
    return <Screen><div style={{ color: "#d94f3d", textAlign: "center", padding: 40, fontSize: 16 }}>{error}</div></Screen>;
  }

  // Format the delivery date for human display
  const deliveryDate = req?.delivery_date || req?.deliveryDate;
  const dateLabel = (() => {
    if (!deliveryDate) return "";
    const d = new Date(deliveryDate + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  })();
  const requestedBy = req?.requested_by || req?.requestedBy;
  const details = req?.details;
  const requestedDriver = req?.requested_driver || req?.requestedDriver;
  const timingLabel = formatTiming(req?.time_window || req?.timeWindow, req?.start_time || req?.startTime);

  if (submitted) {
    return (
      <Screen>
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>{submitted === "accepted" ? "✅" : "🙅"}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {submitted === "accepted" ? "Thanks — got it!" : "Got it, marked as declined."}
          </div>
          <div style={{ fontSize: 14, color: "#c8e6b8", marginBottom: 4 }}>{dateLabel}</div>
          <div style={{ fontSize: 13, color: "#7a9a6a", marginBottom: 20 }}>{requestedBy} will see this in their app.</div>
          {comment && (
            <div style={{ background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 10, padding: "10px 14px", textAlign: "left", marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", textTransform: "uppercase", letterSpacing: 1 }}>Your note</div>
              <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap", marginTop: 4 }}>{comment}</div>
            </div>
          )}
          <button onClick={() => { setSubmitted(null); }}
            style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Change my answer
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Delivery Request</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: "'DM Serif Display',Georgia,serif", marginTop: 4 }}>{dateLabel}</div>
        {timingLabel && (
          <div style={{ fontSize: 16, color: "#7fb069", fontWeight: 800, marginTop: 6 }}>🕐 {timingLabel}</div>
        )}
        <div style={{ fontSize: 13, color: "#c8e6b8", marginTop: 6 }}>
          From <b>{requestedBy}</b>
          {requestedDriver && <> · 🎯 specifically for you</>}
          {!requestedDriver && <> · open to any driver</>}
        </div>
        {details && (
          <div style={{ background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 10, padding: "10px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", textTransform: "uppercase", letterSpacing: 1 }}>Details</div>
            <div style={{ fontSize: 14, color: "#fff", whiteSpace: "pre-wrap", marginTop: 4 }}>{details}</div>
          </div>
        )}
      </div>

      <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, display: "block" }}>Your name</label>
      <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Type your name"
        style={{ width: "100%", padding: "12px 14px", marginTop: 6, marginBottom: 14, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 10, color: "#fff", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" }} />

      <label style={{ fontSize: 11, color: "#7a9a6a", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, display: "block" }}>Comment <span style={{ color: "#4a6a3a", fontWeight: 600 }}>(optional)</span></label>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
        placeholder='e.g. "Can do it but need to be done by 3pm"'
        style={{ width: "100%", padding: "12px 14px", marginTop: 6, marginBottom: 18, background: "#1e2d1a", border: "1px solid #4a6a3a", borderRadius: 10, color: "#fff", fontSize: 15, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => submit("declined")} disabled={submitting}
          style={{ flex: 1, background: "transparent", border: "2px solid #d94f3d", color: "#d94f3d", borderRadius: 12, padding: "18px", fontSize: 16, fontWeight: 800, cursor: submitting ? "default" : "pointer", fontFamily: "inherit" }}>
          ✗ Decline
        </button>
        <button onClick={() => submit("accepted")} disabled={submitting}
          style={{ flex: 2, background: "#7fb069", border: "none", color: "#1e2d1a", borderRadius: 12, padding: "18px", fontSize: 16, fontWeight: 800, cursor: submitting ? "default" : "pointer", fontFamily: "inherit" }}>
          ✓ Accept
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#4a6a3a", textAlign: "center", marginTop: 18 }}>
        Hoosier Boy Greenhouse Ops
      </div>
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#0f1a0c", color: "#c8e6b8", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 480, margin: "0 auto" }}>{children}</div>
    </div>
  );
}
