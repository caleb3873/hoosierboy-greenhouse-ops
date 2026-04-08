import { useMemo, useState } from "react";
import { useDeliveries, useDeliveryClaims } from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";

const GREENHOUSE = "4425 Bluff Road, Indianapolis, IN 46151";

const PRIORITY = {
  critical: { label: "CRITICAL", bg: "#d94f3d", color: "#fff", rank: 0 },
  high:     { label: "HIGH",     bg: "#e89a3a", color: "#fff", rank: 1 },
  normal:   { label: "NORMAL",   bg: "#7fb069", color: "#1e2d1a", rank: 2 },
  flex:     { label: "FLEX",     bg: "#9cb894", color: "#1e2d1a", rank: 3 },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtMoney(c) { if (!c) return "—"; return `$${(c/100).toLocaleString()}`; }
function fmtTime(iso) { if (!iso) return ""; return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }

function mapsUrl(addr) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(GREENHOUSE)}&destination=${encodeURIComponent(addr)}&travelmode=driving`;
}

export default function DriverView({ onSwitchMode }) {
  const { rows: deliveries, update: updateDelivery, refresh } = useDeliveries();
  const { insert: insertClaim } = useDeliveryClaims();
  const { growerProfile, displayName } = useAuth();
  const driverId = growerProfile?.id;

  const [selected, setSelected] = useState(null);
  const [claimingFor, setClaimingFor] = useState(null);

  const todayStops = useMemo(() => {
    const iso = todayISO();
    return deliveries
      .filter(d => d.driverId === driverId && d.deliveryDate === iso)
      .sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
  }, [deliveries, driverId]);

  if (selected) {
    return (
      <StopDetail
        delivery={selected}
        totalStops={todayStops.length}
        onBack={() => setSelected(null)}
        onUpdate={async patch => { await updateDelivery(selected.id, patch); refresh(); setSelected(s => s ? { ...s, ...patch } : s); }}
        onClaim={() => setClaimingFor(selected)}
      />
    );
  }

  if (claimingFor) {
    return (
      <ClaimForm
        delivery={claimingFor}
        reportedBy={displayName || "Driver"}
        onCancel={() => setClaimingFor(null)}
        onSubmit={async data => {
          await insertClaim({ ...data, deliveryId: claimingFor.id, reportedBy: displayName || "Driver" });
          setClaimingFor(null);
        }}
      />
    );
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: DARK, color: "#fff", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ padding: "16px 16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Hi {displayName}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {todayStops.length} {todayStops.length === 1 ? "stop" : "stops"} today
          </div>
        </div>
        <button onClick={onSwitchMode}
          style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>
          Sign out
        </button>
      </div>

      <div style={{ padding: 12 }}>
        {todayStops.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6a8a5a" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🚚</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No stops assigned for today</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Tyler will assign them as the day kicks off.</div>
          </div>
        ) : (
          todayStops.map((d, idx) => <StopCard key={d.id} delivery={d} rank={idx + 1} onClick={() => setSelected(d)} />)
        )}
      </div>
    </div>
  );
}

function StopCard({ delivery: d, rank, onClick }) {
  const pr = PRIORITY[d.priority || "normal"];
  const c = d.customerSnapshot || {};
  const isDone = d.status === "delivered";
  const isInTransit = !!d.leftAt && !isDone;
  return (
    <div onClick={onClick}
      style={{
        background: isDone ? "#2a3a24" : isInTransit ? "#2e4a2a" : "#263821",
        border: `1px solid ${GREEN}55`,
        borderLeft: `4px solid ${pr.bg}`,
        borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer",
        display: "flex", gap: 12, alignItems: "flex-start",
        opacity: isDone ? 0.65 : 1,
      }}>
      <div style={{ background: DARK, color: CREAM, borderRadius: 999, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
        {isDone ? "✓" : rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: CREAM }}>{c.company_name || "—"}</div>
          <span style={{ fontSize: 9, fontWeight: 800, background: pr.bg, color: pr.color, borderRadius: 999, padding: "2px 8px" }}>{pr.label}</span>
          {(c.terms || "").toUpperCase().includes("C.O.D") && <span style={{ fontSize: 9, fontWeight: 800, background: RED, color: "#fff", borderRadius: 999, padding: "2px 8px" }}>COD CHECK</span>}
          {isInTransit && <span style={{ fontSize: 9, fontWeight: 800, background: "#e89a3a", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>IN TRANSIT</span>}
        </div>
        <div style={{ fontSize: 12, color: "#9cb894" }}>
          {c.city}{c.state ? `, ${c.state}` : ""}
          {d.miles != null && <> • {d.miles} mi</>}
          {d.deliveryTime && <> • 🕒 {d.deliveryTime}</>}
        </div>
        {d.orderValueCents > 0 && (
          <div style={{ fontSize: 12, color: CREAM, fontWeight: 700, marginTop: 2 }}>{fmtMoney(d.orderValueCents)}</div>
        )}
      </div>
    </div>
  );
}

function StopDetail({ delivery: d, totalStops, onBack, onUpdate, onClaim }) {
  const c = d.customerSnapshot || {};
  const addr = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const pr = PRIORITY[d.priority || "normal"];
  const isCOD = (c.terms || "").toUpperCase().includes("C.O.D");
  const [emailing, setEmailing] = useState(false);

  async function leave() {
    await onUpdate({ status: "in_transit", leftAt: new Date().toISOString() });
    // Fire departure email
    if (c.email) {
      setEmailing(true);
      try {
        await fetch("/api/shipping-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: c.email,
            customerName: c.company_name,
            stopNumber: d.stopOrder,
            totalStops,
            etaMinutes: d.driveMinutes || null,
          }),
        });
        await onUpdate({ emailSentAt: new Date().toISOString() });
      } catch {}
      setEmailing(false);
    }
  }

  async function arrive() {
    await onUpdate({ arrivedAt: new Date().toISOString() });
  }

  async function deliver() {
    await onUpdate({
      status: "delivered",
      deliveredAt: new Date().toISOString(),
    });
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: DARK, color: "#fff", paddingBottom: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ background: "#162212", padding: "14px 16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: CREAM, fontSize: 22, cursor: "pointer" }}>←</button>
        <div style={{ fontSize: 11, color: GREEN, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Stop {d.stopOrder || "?"} of {totalStops}</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif" }}>{c.company_name}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, background: pr.bg, color: pr.color, borderRadius: 999, padding: "3px 10px" }}>{pr.label}</span>
          {isCOD && <span style={{ fontSize: 10, fontWeight: 800, background: RED, color: "#fff", borderRadius: 999, padding: "3px 10px" }}>COD — GET CHECK</span>}
        </div>

        {/* Address card */}
        <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Address</div>
          <div style={{ fontSize: 15, color: CREAM, lineHeight: 1.5 }}>
            {c.address1}<br />
            {[c.city, c.state, c.zip].filter(Boolean).join(", ")}
          </div>
          {addr && (
            <a href={mapsUrl(addr)} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 10, background: GREEN, color: DARK, padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              🧭 Open in Google Maps
            </a>
          )}
        </div>

        {/* Contact */}
        <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Contact</div>
          {c.phone && (
            <a href={`tel:${c.phone}`} style={{ display: "inline-block", background: GREEN, color: DARK, padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontSize: 13, fontWeight: 800, marginRight: 8, marginBottom: 6 }}>
              📞 {c.phone}
            </a>
          )}
          {c.email && <div style={{ fontSize: 12, color: "#9cb894", marginTop: 6 }}>{c.email}</div>}
        </div>

        {/* Order */}
        {(d.orderValueCents > 0 || (d.orderNumbers || []).length > 0 || d.notes) && (
          <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Order</div>
            {d.orderValueCents > 0 && <div style={{ fontSize: 20, fontWeight: 800, color: CREAM, marginBottom: 4 }}>{fmtMoney(d.orderValueCents)}</div>}
            {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && (
              <div style={{ fontSize: 12, color: "#9cb894", marginBottom: 6 }}>Orders: {d.orderNumbers.join(", ")}</div>
            )}
            {d.notes && <div style={{ fontSize: 13, color: CREAM, marginTop: 4, whiteSpace: "pre-wrap" }}>{d.notes}</div>}
          </div>
        )}

        {/* Timeline */}
        <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Progress</div>
          <TimelineStep label="Left greenhouse" ts={d.leftAt} />
          <TimelineStep label="Arrived" ts={d.arrivedAt} />
          <TimelineStep label="Delivered" ts={d.deliveredAt} last />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!d.leftAt && (
            <BigButton label={emailing ? "Sending email…" : "🚛 Leave Greenhouse"} onClick={leave} disabled={emailing} />
          )}
          {d.leftAt && !d.arrivedAt && (
            <BigButton label="📍 Arrive at Customer" onClick={arrive} />
          )}
          {d.arrivedAt && !d.deliveredAt && (
            <BigButton label="✓ Mark Delivered" onClick={deliver} color="#4a7a35" />
          )}
          {d.deliveredAt && (
            <div style={{ background: "#4a7a35", color: "#fff", padding: 16, borderRadius: 10, textAlign: "center", fontSize: 15, fontWeight: 800 }}>
              ✓ Delivered at {fmtTime(d.deliveredAt)}
            </div>
          )}
          <button onClick={onClaim}
            style={{ background: "transparent", border: `1.5px solid ${RED}`, color: "#ffb3a8", padding: 14, borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 4 }}>
            ⚑ Report a Claim
          </button>
        </div>
      </div>
    </div>
  );
}

function TimelineStep({ label, ts, last }) {
  const done = !!ts;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: last ? 0 : 10 }}>
      <div style={{
        width: 20, height: 20, borderRadius: "50%",
        border: `2px solid ${done ? GREEN : "#4a6a3a"}`,
        background: done ? GREEN : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: DARK, fontSize: 12, fontWeight: 800,
      }}>{done ? "✓" : ""}</div>
      <div style={{ fontSize: 13, color: done ? CREAM : "#7a8c74", fontWeight: done ? 700 : 500 }}>
        {label} {ts && <span style={{ color: "#9cb894", fontWeight: 400 }}>— {fmtTime(ts)}</span>}
      </div>
    </div>
  );
}

function BigButton({ label, onClick, disabled, color }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: disabled ? "#4a6a3a" : (color || GREEN), color: DARK,
        border: "none", padding: "18px 0", borderRadius: 12, fontSize: 16, fontWeight: 800,
        cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
      }}>
      {label}
    </button>
  );
}

// ── Claim form ───────────────────────────────────────────────────────────────
const CLAIM_TYPES = [
  { id: "missing",      label: "Missing Plants" },
  { id: "wrong_color",  label: "Wrong Color" },
  { id: "damaged",      label: "Damaged" },
  { id: "short_count",  label: "Short Count" },
  { id: "wrong_plant",  label: "Wrong Plant" },
  { id: "other",        label: "Other" },
];

function ClaimForm({ delivery, onCancel, onSubmit }) {
  const [type, setType] = useState("damaged");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhotos(p => [...p, ev.target.result]);
    reader.readAsDataURL(file);
  }

  const canSave = type && (notes.trim() || photos.length > 0);

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: DARK, color: "#fff", paddingBottom: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ background: "#162212", padding: "14px 16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: CREAM, fontSize: 22, cursor: "pointer" }}>×</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: CREAM }}>Report a Claim</div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 12, color: "#9cb894", marginBottom: 14 }}>
          For <b style={{ color: CREAM }}>{delivery.customerSnapshot?.company_name}</b>
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Type</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {CLAIM_TYPES.map(t => (
            <button key={t.id} onClick={() => setType(t.id)}
              style={{
                padding: 14, borderRadius: 10,
                background: type === t.id ? GREEN : "#263821",
                color: type === t.id ? DARK : CREAM,
                border: `1.5px solid ${type === t.id ? GREEN : "#4a6a3a"}`,
                fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Notes</div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Describe what's wrong…"
          style={{ width: "100%", minHeight: 100, padding: 14, borderRadius: 10, border: `1.5px solid #4a6a3a`, background: "#263821", color: CREAM, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 14 }} />

        <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Photos</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={p} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10 }} />
              <button onClick={() => setPhotos(ps => ps.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.7)", color: "#fff", border: "none", cursor: "pointer" }}>×</button>
            </div>
          ))}
          <label style={{ width: 90, height: 90, borderRadius: 10, border: `2px dashed #4a6a3a`, background: "#263821", display: "flex", alignItems: "center", justifyContent: "center", color: CREAM, fontSize: 26, cursor: "pointer" }}>
            +
            <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "transparent", border: `1.5px solid #4a6a3a`, color: CREAM, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSubmit({ type, notes: notes.trim(), photos })} disabled={!canSave}
            style={{ flex: 2, padding: "14px 0", borderRadius: 10, background: canSave ? RED : "#4a6a3a", color: "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
            Submit Claim
          </button>
        </div>
      </div>
    </div>
  );
}
