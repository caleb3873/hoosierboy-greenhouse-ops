import { useMemo, useState } from "react";
import { useDeliveryClaims, useDeliveries } from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const RED = "#d94f3d";
const BORDER = "#e0ead8";

const CLAIM_LABELS = {
  missing: "Missing Plants",
  wrong_color: "Wrong Color",
  damaged: "Damaged",
  short_count: "Short Count",
  wrong_plant: "Wrong Plant",
  other: "Other",
};

function fmtDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ShippingClaims() {
  const { rows: claims, update, refresh } = useDeliveryClaims();
  const { rows: deliveries } = useDeliveries();
  const { user } = useAuth();
  const [filter, setFilter] = useState("open");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const f = claims.filter(c => filter === "open" ? !c.resolved : filter === "resolved" ? c.resolved : true);
    return [...f].sort((a, b) => (b.reportedAt || "").localeCompare(a.reportedAt || ""));
  }, [claims, filter]);

  const openCount = claims.filter(c => !c.resolved).length;
  const resolvedCount = claims.filter(c => c.resolved).length;

  async function resolve(c, notes) {
    await update(c.id, {
      resolved: true,
      resolvedAt: new Date().toISOString(),
      resolutionNotes: notes,
      resolvedBy: user?.email || "tyler",
    });
    setSelected(null);
    refresh();
  }

  async function reopen(c) {
    await update(c.id, { resolved: false, resolvedAt: null, resolutionNotes: null, resolvedBy: null });
    setSelected(null);
    refresh();
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Claims</div>
        <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
          {openCount} open • {resolvedCount} resolved
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[{id:"open",label:"Open"},{id:"resolved",label:"Resolved"},{id:"all",label:"All"}].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10, fontSize: 13, fontWeight: 800,
              background: filter === t.id ? DARK : "#f2f5ef",
              color: filter === t.id ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${filter === t.id ? DARK : BORDER}`,
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {t.label} ({t.id === "open" ? openCount : t.id === "resolved" ? resolvedCount : claims.length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No {filter === "resolved" ? "resolved" : "open"} claims</div>
        </div>
      ) : (
        filtered.map(c => {
          const del = deliveries.find(d => d.id === c.deliveryId);
          const cust = del?.customerSnapshot || {};
          return (
            <div key={c.id} onClick={() => setSelected(c)}
              style={{
                background: "#fff", borderRadius: 12,
                border: `1.5px solid ${c.resolved ? BORDER : RED}`,
                boxShadow: c.resolved ? "none" : `0 0 0 2px ${RED}22`,
                padding: 16, marginBottom: 10, cursor: "pointer",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, background: c.resolved ? "#4a7a35" : RED, color: "#fff", borderRadius: 999, padding: "3px 10px" }}>
                      {c.resolved ? "RESOLVED" : "OPEN"}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 800, background: "#f2f5ef", color: DARK, borderRadius: 999, padding: "3px 10px" }}>
                      {CLAIM_LABELS[c.type] || c.type}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{cust.company_name || "Unknown customer"}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                    Reported by <b>{c.reportedBy || "—"}</b> • {fmtDateTime(c.reportedAt)}
                  </div>
                  {c.notes && <div style={{ fontSize: 13, color: DARK, marginTop: 6, fontStyle: "italic" }}>"{c.notes}"</div>}
                </div>
                {(c.photos || []).length > 0 && (
                  <img src={c.photos[0]} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8 }} />
                )}
              </div>
            </div>
          );
        })
      )}

      {selected && (
        <ClaimDetail
          claim={selected}
          delivery={deliveries.find(d => d.id === selected.deliveryId)}
          onClose={() => setSelected(null)}
          onResolve={resolve}
          onReopen={reopen}
        />
      )}
    </div>
  );
}

function ClaimDetail({ claim: c, delivery, onClose, onResolve, onReopen }) {
  const cust = delivery?.customerSnapshot || {};
  const [notes, setNotes] = useState(c.resolutionNotes || "");

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ background: c.resolved ? "#4a7a35" : RED, color: "#fff", padding: "18px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, opacity: 0.9 }}>{CLAIM_LABELS[c.type] || c.type}</div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{cust.company_name || "Unknown"}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 26, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          <DetailRow label="Reported by" value={`${c.reportedBy || "—"} • ${fmtDateTime(c.reportedAt)}`} />
          {delivery?.deliveryDate && <DetailRow label="Delivery date" value={delivery.deliveryDate} />}
          {c.notes && <DetailRow label="Description" value={<div style={{ whiteSpace: "pre-wrap" }}>{c.notes}</div>} />}

          {(c.photos || []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Photos</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.photos.map((p, i) => (
                  <img key={i} src={p} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: `1.5px solid ${BORDER}` }} />
                ))}
              </div>
            </div>
          )}

          {c.resolved ? (
            <>
              <div style={{ background: "#f0f8eb", border: `1.5px solid #4a7a35`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#4a7a35", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Resolution</div>
                <div style={{ fontSize: 13, color: DARK, whiteSpace: "pre-wrap" }}>{c.resolutionNotes || "— no notes —"}</div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>{c.resolvedBy} • {fmtDateTime(c.resolvedAt)}</div>
              </div>
              <button onClick={() => onReopen(c)}
                style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: "#fff", border: `1.5px solid ${BORDER}`, color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Reopen Claim
              </button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Resolution Notes</div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="How was this handled?"
                style={{ width: "100%", minHeight: 90, padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 14 }} />
              <button onClick={() => onResolve(c, notes)}
                style={{ width: "100%", padding: "14px 0", borderRadius: 10, background: "#4a7a35", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                ✓ Mark Resolved
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: DARK, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
