import { useState, useMemo, useEffect, useRef } from "react";
import { useDeliveries, useShippingCustomers, useShippingRoutes, useDrivers } from "../supabase";
import { useAuth } from "../Auth";
import { customerConfirmationValid } from "./ShippingCommand";
import DeliveryImporter from "./DeliveryImporter";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function todayISO() { return toISODate(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${Math.round(c / 100).toLocaleString()}`; }

function dateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function weekMonday(d = new Date()) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function weekLabel(monday) {
  const sat = addDays(monday, 5);
  return `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sat.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function ShippingManagerMobile({ onSwitchMode }) {
  const { rows: deliveries, update, insert, remove, refresh } = useDeliveries();
  const { rows: customers } = useShippingCustomers();
  const { rows: routes } = useShippingRoutes();
  const { rows: drivers } = useDrivers();
  const { displayName, signOut } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(null); // null = show all week, 0-5 = Mon-Sat
  const [showApprovals, setShowApprovals] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const autoOpenedRef = useRef(false);

  // Quick add form state
  const [qaSearch, setQaSearch] = useState("");
  const [qaCustomer, setQaCustomer] = useState(null);
  const [qaAmount, setQaAmount] = useState("");
  const [qaTime, setQaTime] = useState("");
  const [qaNotes, setQaNotes] = useState("");
  const [qaBluff, setQaBluff] = useState(true);
  const [qaSprague, setQaSprague] = useState(false);
  const [qaHouseplants, setQaHouseplants] = useState(false);
  const [qaSaving, setQaSaving] = useState(false);

  const monday = useMemo(() => addDays(weekMonday(), weekOffset * 7), [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(monday, i)), [monday]);
  const weekStart = toISODate(monday);
  const weekEnd = toISODate(addDays(monday, 6));
  const selectedDate = selectedDayIdx !== null ? toISODate(weekDays[selectedDayIdx]) : null;
  const todayStr = todayISO();

  // Auto-select today's day if it's in the current week
  useEffect(() => {
    if (weekOffset === 0 && selectedDayIdx === null) {
      const todayDow = new Date().getDay();
      const idx = todayDow === 0 ? 6 : todayDow - 1; // Mon=0, Sat=5, Sun=6
      if (idx <= 5) setSelectedDayIdx(idx);
    }
  }, [weekOffset]); // eslint-disable-line

  // Deliveries for selected day or full week
  const dayDeliveries = useMemo(() => {
    let filtered;
    if (selectedDate) {
      filtered = deliveries.filter(d => d.deliveryDate === selectedDate && d.lifecycle !== "cancelled");
    } else {
      filtered = deliveries.filter(d => d.deliveryDate >= weekStart && d.deliveryDate <= weekEnd && d.lifecycle !== "cancelled");
    }
    return filtered
      .filter(d => d.lifecycle === "confirmed")
      .sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999) || (a.deliveryTime || "").localeCompare(b.deliveryTime || ""));
  }, [deliveries, selectedDate, weekStart, weekEnd]);

  // Pending approvals — scoped to the viewed week
  const pendingApprovals = useMemo(() => {
    return deliveries.filter(d => d.lifecycle === "proposed" && d.deliveryDate >= weekStart && d.deliveryDate <= weekEnd);
  }, [deliveries, weekStart, weekEnd]);

  // Auto-open approvals on first load if any exist
  useEffect(() => {
    if (!autoOpenedRef.current && pendingApprovals.length > 0) {
      autoOpenedRef.current = true;
      setShowApprovals(true);
    }
  }, [pendingApprovals.length]);

  // Summary stats
  const totalValue = dayDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const activeRoutes = useMemo(() => {
    const routeIds = new Set(dayDeliveries.filter(d => d.routeId).map(d => d.routeId));
    return routes.filter(r => routeIds.has(r.id) && r.departedAt && !r.completedAt).length;
  }, [dayDeliveries, routes]);

  // Move delivery to a different date
  async function moveDeliveryToDate(delivery, newDate) {
    if (!newDate || newDate === delivery.deliveryDate) return;
    const alertEntry = {
      text: `Moved from ${dateLabel(delivery.deliveryDate)} to ${dateLabel(newDate)} by ${displayName}`,
      author: displayName,
      created_at: new Date().toISOString(),
      severity: "info",
    };
    const alerts = [...(Array.isArray(delivery.alerts) ? delivery.alerts : []), alertEntry];
    await update(delivery.id, {
      originalDate: delivery.originalDate || delivery.deliveryDate,
      deliveryDate: newDate,
      dateChangedAt: new Date().toISOString(),
      dateChangedBy: displayName,
      alerts,
    });
  }

  // Priority reorder
  async function moveDelivery(delivery, direction) {
    const idx = dayDeliveries.findIndex(d => d.id === delivery.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= dayDeliveries.length) return;
    const other = dayDeliveries[swapIdx];
    const myOrder = delivery.priorityOrder ?? (idx * 10);
    const otherOrder = other.priorityOrder ?? (swapIdx * 10);
    await update(delivery.id, { priorityOrder: otherOrder });
    await update(other.id, { priorityOrder: myOrder });
  }

  // Approve / decline
  async function approveDelivery(d) {
    await update(d.id, {
      lifecycle: "confirmed",
      shippingConfirmedAt: new Date().toISOString(),
      shippingConfirmedBy: displayName,
    });
  }
  async function declineDelivery(d) {
    await update(d.id, { lifecycle: "cancelled" });
  }

  // Quick add — save
  async function saveQuickAdd() {
    if (!qaCustomer) return;
    setQaSaving(true);
    try {
      const cust = qaCustomer;
      const snapshot = {
        company_name: cust.companyName,
        address1: cust.address1 || "",
        city: cust.city || "",
        state: cust.state || "",
        zip: cust.zip || "",
        phone: cust.phone || "",
        email: cust.email || "",
        terms: cust.terms || "",
      };
      const now = new Date().toISOString();
      const newDelivery = {
        id: crypto.randomUUID(),
        customerId: cust.id,
        customerSnapshot: snapshot,
        deliveryDate: selectedDate || toISODate(weekDays[0]),
        deliveryTime: qaTime || null,
        orderValueCents: Math.round((parseFloat(qaAmount) || 0) * 100),
        notes: qaNotes || null,
        needsBluff1: qaBluff,
        needsSprague: qaSprague,
        needsHouseplants: qaHouseplants,
        lifecycle: "confirmed",
        salesConfirmedAt: now,
        salesConfirmedBy: displayName,
        shippingConfirmedAt: now,
        shippingConfirmedBy: displayName,
      };
      await insert(newDelivery);
      // Reset form
      setQaSearch("");
      setQaCustomer(null);
      setQaAmount("");
      setQaTime("");
      setQaNotes("");
      setQaBluff(true);
      setQaSprague(false);
      setQaHouseplants(false);
      setShowQuickAdd(false);
    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      setQaSaving(false);
    }
  }

  // Customer search for quick-add
  const customerMatches = useMemo(() => {
    if (!qaSearch || qaSearch.length < 2) return [];
    const q = qaSearch.toLowerCase();
    return customers.filter(c => (c.companyName || "").toLowerCase().includes(q)).slice(0, 8);
  }, [qaSearch, customers]);

  // Delivery card renderer
  function renderCard(d, idx) {
    const cust = d.customerSnapshot || {};
    const fullCust = customers.find(c => c.id === d.customerId) || {};
    const isCOD = ((fullCust.terms || cust.terms || "").toUpperCase().includes("COD")) || ((fullCust.terms || "").toUpperCase().includes("C.O.D"));
    const isExpanded = expandedId === d.id;

    const b1Done = !d.needsBluff1 || d.bluff1PulledAt;
    const b2Done = !d.needsBluff2 || d.bluff2PulledAt;
    const bluffDone = b1Done && b2Done;
    const spragueDone = !d.needsSprague || d.spraguePulledAt;
    const hpDone = !d.needsHouseplants || d.houseplantsPulledAt;
    const allPulled = bluffDone && spragueDone && hpDone;
    const isShipped = !!d.shippedAt;

    const wasRescheduled = !!d.dateChangedAt;

    return (
      <div key={d.id} style={{
        background: isShipped ? "#f0f9ec" : "#fff", borderRadius: 14,
        border: isShipped ? `1.5px solid ${GREEN}` : wasRescheduled ? `1.5px solid ${AMBER}` : `1.5px solid ${BORDER}`,
        borderLeft: isShipped ? `4px solid ${GREEN}` : wasRescheduled ? `4px solid ${AMBER}` : undefined,
        opacity: isShipped ? 0.7 : 1,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        padding: "14px 16px", marginBottom: 10,
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {/* Move buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
            <button onClick={() => moveDelivery(d, "up")} disabled={idx === 0}
              style={{ background: "none", border: "none", color: idx === 0 ? "#d0d8cc" : MUTED, fontSize: 18, cursor: idx === 0 ? "default" : "pointer", padding: "4px 8px", minHeight: 36, minWidth: 36 }}>&#9650;</button>
            <button onClick={() => moveDelivery(d, "down")} disabled={idx === dayDeliveries.length - 1}
              style={{ background: "none", border: "none", color: idx === dayDeliveries.length - 1 ? "#d0d8cc" : MUTED, fontSize: 18, cursor: idx === dayDeliveries.length - 1 ? "default" : "pointer", padding: "4px 8px", minHeight: 36, minWidth: 36 }}>&#9660;</button>
          </div>

          {/* Priority number */}
          <div style={{
            width: 28, height: 28, minWidth: 28, borderRadius: "50%",
            background: DARK, color: CREAM, fontSize: 13, fontWeight: 900,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2,
          }}>{idx + 1}</div>

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }} onClick={() => setExpandedId(isExpanded ? null : d.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {cust.company_name || "—"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: GREEN, flexShrink: 0 }}>
                {fmtMoney(d.orderValueCents)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {d.deliveryTime && <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{d.deliveryTime}</span>}
              {d.notes && <span style={{ fontSize: 12 }}>📝</span>}
              {isCOD && <span style={{ background: RED, color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 800 }}>COD</span>}
              {wasRescheduled && <span style={{ background: AMBER, color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 800 }}>MOVED</span>}
              {isShipped && <span style={{ background: GREEN, color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 10, fontWeight: 800 }}>SHIPPED {new Date(d.shippedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
              {selectedDayIdx === null && <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{dateLabel(d.deliveryDate)}</span>}
            </div>
            {/* Team pull status */}
            <div style={{ marginTop: 4, fontSize: 13 }}>
              {(d.needsBluff1 || d.needsBluff2) && <span title="Bluff" style={{ fontWeight: 800 }}>B{bluffDone ? "✓" : "○"} </span>}
              {d.needsSprague && <span title="Sprague" style={{ fontWeight: 800 }}>S{d.spraguePulledAt ? "✓" : "○"} </span>}
              {d.needsHouseplants && <span title="Houseplants" style={{ fontWeight: 800 }}>H{d.houseplantsPulledAt ? "✓" : "○"} </span>}
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
            {(cust.address1 || cust.city) && (
              <div style={{ fontSize: 13, color: DARK, marginBottom: 6 }}>
                📍 {[cust.address1, cust.city, cust.state, cust.zip].filter(Boolean).join(", ")}
              </div>
            )}
            {d.notes && (
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 6, fontStyle: "italic" }}>
                📝 {d.notes}
              </div>
            )}
            {d.driverId && (() => {
              const driver = (routes.find(r => r.id === d.routeId) || {});
              return driver.driverName ? (
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>🚛 Driver: {driver.driverName}</div>
              ) : null;
            })()}
            {d.miles && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>📏 {d.miles} mi{d.driveMinutes ? ` · ${d.driveMinutes} min` : ""}</div>
            )}
            {d.cartCount && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>🛒 {d.cartCount} cart{d.cartCount !== 1 ? "s" : ""}</div>
            )}
            {(d.orderNumbers || []).length > 0 && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Orders: {d.orderNumbers.join(", ")}</div>
            )}
            {wasRescheduled && d.originalDate && (
              <div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginBottom: 4 }}>
                📅 Originally: {dateLabel(d.originalDate)} → moved by {d.dateChangedBy}
              </div>
            )}

            {/* Timing data */}
            {(d.bluffClaimedAt || d.bluff1PulledAt || d.spraguePulledAt || d.houseplantsPulledAt || d.shippedAt) && (
              <div style={{ marginTop: 8, fontSize: 11, color: MUTED, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {d.bluffClaimedAt && <span>Claimed: {new Date(d.bluffClaimedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                {d.bluff1PulledAt && <span>B pulled: {new Date(d.bluff1PulledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                {d.spraguePulledAt && <span>S pulled: {new Date(d.spraguePulledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                {d.houseplantsPulledAt && <span>H pulled: {new Date(d.houseplantsPulledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                {d.shippedAt && <span style={{ color: GREEN, fontWeight: 700 }}>Shipped: {new Date(d.shippedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
              </div>
            )}

            {/* Shipped checkbox — only when all teams are done */}
            {allPulled && (
              <div style={{ marginTop: 10, padding: 12, background: isShipped ? "#e8f5e0" : "#f7faf4", borderRadius: 10, border: `1.5px solid ${isShipped ? GREEN : BORDER}` }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 800, fontSize: 14, color: DARK }}>
                  <input type="checkbox" checked={isShipped}
                    onChange={async () => {
                      if (isShipped) {
                        await update(d.id, { shippedAt: null, shippedBy: null });
                      } else {
                        await update(d.id, { shippedAt: new Date().toISOString(), shippedBy: displayName });
                      }
                    }}
                    style={{ width: 22, height: 22 }} />
                  {isShipped
                    ? `Shipped at ${new Date(d.shippedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                    : "Mark as shipped"}
                </label>
              </div>
            )}
            {!allPulled && (
              <div style={{ marginTop: 10, fontSize: 11, color: MUTED, fontStyle: "italic" }}>
                Waiting on {!bluffDone ? "B " : ""}{!spragueDone ? "S " : ""}{!hpDone ? "H " : ""}to finish pulling before shipping
              </div>
            )}

            {/* Driver assignment */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Driver</div>
              <select
                value={d.driverId || ""}
                onChange={e => update(d.id, { driverId: e.target.value || null })}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", background: "#fff" }}>
                <option value="">— No driver assigned —</option>
                {drivers.map(dr => <option key={dr.id} value={dr.id}>{dr.name}{dr.phone ? ` (${dr.phone})` : ""}</option>)}
              </select>
              {d.driverId && (() => {
                const dr = drivers.find(x => x.id === d.driverId);
                return dr?.phone ? (
                  <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                    <a href={`tel:${dr.phone}`} style={{ padding: "8px 14px", background: GREEN, color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 800, fontSize: 12 }}>📞 Call</a>
                    <a href={`sms:${dr.phone}`} style={{ padding: "8px 14px", background: DARK, color: CREAM, borderRadius: 8, textDecoration: "none", fontWeight: 800, fontSize: 12 }}>💬 Text</a>
                  </div>
                ) : null;
              })()}
            </div>

            {/* Move to date + AM/PM */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Move to date</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="date" defaultValue={d.deliveryDate}
                  onChange={e => { if (e.target.value) moveDeliveryToDate(d, e.target.value); }}
                  style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit", flex: 1 }} />
                <button onClick={() => update(d.id, { deliveryTime: "08:00" })}
                  style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${d.deliveryTime && parseInt(d.deliveryTime) < 12 ? DARK : BORDER}`, background: d.deliveryTime && parseInt(d.deliveryTime) < 12 ? DARK : "#fff", color: d.deliveryTime && parseInt(d.deliveryTime) < 12 ? CREAM : MUTED, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  AM
                </button>
                <button onClick={() => update(d.id, { deliveryTime: "13:00" })}
                  style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${d.deliveryTime && parseInt(d.deliveryTime) >= 12 ? DARK : BORDER}`, background: d.deliveryTime && parseInt(d.deliveryTime) >= 12 ? DARK : "#fff", color: d.deliveryTime && parseInt(d.deliveryTime) >= 12 ? CREAM : MUTED, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  PM
                </button>
              </div>
            </div>
            <button onClick={async () => {
                if (!window.confirm(`Delete delivery for ${cust.company_name || "this customer"}?`)) return;
                await remove(d.id);
              }}
              style={{ marginTop: 10, width: "100%", padding: "10px 0", background: "#fff", color: RED, border: `1.5px solid ${RED}`, borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              🗑 Delete delivery
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 120 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: DARK, padding: "16px 20px", color: CREAM }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>Deliveries</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setShowImporter(true)}
              style={{ background: CREAM, border: "none", borderRadius: 8, color: DARK, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              📁 Import
            </button>
            <button onClick={onSwitchMode || signOut}
              style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, color: CREAM, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Sign out
            </button>
          </div>
        </div>

        {/* Week navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
          <button onClick={() => { setWeekOffset(w => w - 1); setSelectedDayIdx(0); }}
            style={{ background: "none", border: "none", color: CREAM, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>‹</button>
          <button onClick={() => { setWeekOffset(0); setSelectedDayIdx(null); }}
            style={{ background: weekOffset === 0 ? GREEN : "transparent", border: weekOffset === 0 ? "none" : "1px solid #4a6a3a", color: weekOffset === 0 ? "#fff" : CREAM, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            This Week
          </button>
          <div style={{ fontSize: 14, fontWeight: 700, color: CREAM, minWidth: 140, textAlign: "center" }}>
            {weekLabel(monday)}
          </div>
          <button onClick={() => { setWeekOffset(w => w + 1); setSelectedDayIdx(0); }}
            style={{ background: "none", border: "none", color: CREAM, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>›</button>
        </div>
      </div>

      {/* Day pills (Mon–Sat) + All Week */}
      <div style={{ padding: "10px 12px", background: "#fff", borderBottom: `1.5px solid ${BORDER}`, display: "flex", gap: 4, overflowX: "auto" }}>
        <button onClick={() => setSelectedDayIdx(null)}
          style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
            background: selectedDayIdx === null ? DARK : "#f2f5ef",
            color: selectedDayIdx === null ? CREAM : MUTED,
            border: `1.5px solid ${selectedDayIdx === null ? DARK : "#c8d8c0"}`,
            cursor: "pointer", fontFamily: "inherit", minHeight: 40,
          }}>
          All
        </button>
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const isToday = iso === todayStr;
          const dayCount = deliveries.filter(dd => dd.deliveryDate === iso && dd.lifecycle !== "cancelled").length;
          return (
            <button key={i} onClick={() => setSelectedDayIdx(i)}
              style={{
                padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                background: selectedDayIdx === i ? DARK : isToday ? "#e8f5e0" : "#f2f5ef",
                color: selectedDayIdx === i ? CREAM : isToday ? DARK : MUTED,
                border: `1.5px solid ${selectedDayIdx === i ? DARK : isToday ? GREEN : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit", minHeight: 40, textAlign: "center", minWidth: 48,
              }}>
              <div>{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>{d.getDate()}</div>
              {dayCount > 0 && <div style={{ fontSize: 9, color: selectedDayIdx === i ? GREEN : MUTED }}>{dayCount}</div>}
            </button>
          );
        })}
      </div>

      {/* Week/day subtitle */}
      <div style={{ padding: "8px 16px 0", fontSize: 12, color: MUTED, fontWeight: 600 }}>
        {selectedDate ? dateLabel(selectedDate) : weekLabel(monday)}
      </div>

      {/* Approval inbox strip */}
      {pendingApprovals.length > 0 && (
        <div style={{ padding: "0 16px", marginTop: 10 }}>
          <button onClick={() => setShowApprovals(!showApprovals)}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${AMBER}`,
              background: "#fff7ec", color: DARK, fontWeight: 800, fontSize: 14,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
            📥 {pendingApprovals.length} pending approval{pendingApprovals.length !== 1 ? "s" : ""}
          </button>
          {showApprovals && (
            <div style={{ marginTop: 8, borderRadius: 12, border: `1.5px solid ${BORDER}`, background: "#fff", overflow: "hidden" }}>
              {pendingApprovals.map(d => {
                const cust = d.customerSnapshot || {};
                return (
                  <div key={d.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cust.company_name || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: MUTED }}>
                        {dateLabel(d.deliveryDate)} · {fmtMoney(d.orderValueCents)}
                        {d.salesConfirmedBy && ` · by ${d.salesConfirmedBy}`}
                      </div>
                    </div>
                    <button onClick={() => approveDelivery(d)}
                      style={{ width: 44, height: 44, borderRadius: 10, border: `2px solid ${GREEN}`, background: "#e8f5e0", color: GREEN, fontSize: 20, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ✓
                    </button>
                    <button onClick={() => declineDelivery(d)}
                      style={{ width: 44, height: 44, borderRadius: 10, border: `2px solid ${RED}`, background: "#fff3f1", color: RED, fontSize: 20, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      ✗
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Progress summary */}
      <div style={{ padding: "12px 16px", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>
          {dayDeliveries.length} deliver{dayDeliveries.length !== 1 ? "ies" : "y"} · {fmtMoney(totalValue)} total
        </div>
        {activeRoutes > 0 && (
          <span style={{ background: GREEN, color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>
            {activeRoutes} active route{activeRoutes !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Delivery list */}
      <div style={{ padding: "0 16px" }}>
        {dayDeliveries.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 14 }}>
            No confirmed deliveries for {selectedDate ? dateLabel(selectedDate) : "this week"}.
          </div>
        )}
        {dayDeliveries.map((d, idx) => renderCard(d, idx))}
      </div>

      {/* Quick Add bottom sheet */}
      {showQuickAdd && (
        <div onClick={() => setShowQuickAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxHeight: "85vh", background: "#fff", borderRadius: "20px 20px 0 0",
            padding: "20px 20px 32px", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Add Delivery</div>
              <button onClick={() => setShowQuickAdd(false)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED, padding: 4 }}>✕</button>
            </div>

            {/* Customer search */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Customer</div>
              {qaCustomer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#e8f5e0", borderRadius: 10, border: `1.5px solid ${GREEN}` }}>
                  <span style={{ flex: 1, fontWeight: 800, color: DARK }}>{qaCustomer.companyName}</span>
                  <button onClick={() => { setQaCustomer(null); setQaSearch(""); }}
                    style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: MUTED }}>✕</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input type="text" value={qaSearch} onChange={e => setQaSearch(e.target.value)}
                    placeholder="Search customers..."
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
                  {customerMatches.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
                      {customerMatches.map(c => (
                        <button key={c.id} onClick={() => { setQaCustomer(c); setQaSearch(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", color: DARK }}>
                          {c.companyName}
                          {c.city && <span style={{ color: MUTED, fontWeight: 400 }}> — {c.city}, {c.state}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Amount + time */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Dollar Amount</div>
                <input type="number" value={qaAmount} onChange={e => setQaAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Time (optional)</div>
                <input type="time" value={qaTime} onChange={e => setQaTime(e.target.value)}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Date */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Delivery Date</div>
              <div style={{ padding: "10px 14px", background: "#f2f5ef", borderRadius: 10, fontSize: 14, fontWeight: 600, color: DARK }}>
                {dateLabel(selectedDate)}
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Notes (optional)</div>
              <textarea value={qaNotes} onChange={e => setQaNotes(e.target.value)}
                placeholder="Delivery notes..."
                rows={3}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
            </div>

            {/* Teams */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Teams needed</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { key: "bluff", label: "B — Bluff", val: qaBluff, set: setQaBluff },
                  { key: "sprague", label: "S — Sprague", val: qaSprague, set: setQaSprague },
                  { key: "houseplants", label: "H — Houseplants", val: qaHouseplants, set: setQaHouseplants },
                ].map(t => (
                  <button key={t.key} onClick={() => t.set(!t.val)}
                    style={{
                      flex: 1, padding: "12px 8px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                      background: t.val ? "#e8f5e0" : "#f2f5ef",
                      color: t.val ? DARK : MUTED,
                      border: `1.5px solid ${t.val ? GREEN : "#c8d8c0"}`,
                      cursor: "pointer", fontFamily: "inherit", minHeight: 48,
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <button onClick={saveQuickAdd} disabled={!qaCustomer || qaSaving}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
                background: qaCustomer ? GREEN : "#c8d8c0",
                color: qaCustomer ? "#fff" : MUTED,
                fontSize: 16, fontWeight: 800, cursor: qaCustomer ? "pointer" : "default",
                fontFamily: "inherit", minHeight: 52,
              }}>
              {qaSaving ? "Saving..." : "Save Delivery"}
            </button>
          </div>
        </div>
      )}

      {/* Import bottom sheet */}
      {showImporter && (
        <div onClick={() => setShowImporter(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxHeight: "90vh", background: "#fff", borderRadius: "20px 20px 0 0",
            padding: "20px 20px 32px", overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Import Schedule</div>
              <button onClick={() => setShowImporter(false)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED, padding: 4 }}>✕</button>
            </div>
            <DeliveryImporter onDone={() => setShowImporter(false)} />
          </div>
        </div>
      )}

      {/* FAB — Quick Add */}
      {!showQuickAdd && !showImporter && (
        <button onClick={() => setShowQuickAdd(true)}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 900,
            width: 60, height: 60, borderRadius: "50%",
            background: GREEN, color: "#fff", border: "3px solid #fff",
            fontSize: 28, fontWeight: 900, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
      )}
    </div>
  );
}
