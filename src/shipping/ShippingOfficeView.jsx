import { useState, useMemo } from "react";
import { useDeliveries, useShippingCustomers } from "../supabase";
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
function fmtMoney(c) { if (!c && c !== 0) return "\u2014"; return `$${Math.round(c / 100).toLocaleString()}`; }
function fmtDate(iso) {
  if (!iso) return "\u2014";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ShippingOfficeView() {
  const { rows: deliveries, insert, update } = useDeliveries();
  const { rows: customers } = useShippingCustomers();
  const { displayName } = useAuth();

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showReconfirm, setShowReconfirm] = useState(false);
  const [tab, setTab] = useState("day"); // 'day' | 'reconfirm' | 'import'

  // Day deliveries
  const dayDeliveries = useMemo(() => {
    return deliveries
      .filter(d => d.deliveryDate === selectedDate && d.lifecycle !== "cancelled")
      .sort((a, b) =>
        (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999) ||
        (a.deliveryTime || "").localeCompare(b.deliveryTime || "") ||
        (a.createdAt || "").localeCompare(b.createdAt || "")
      );
  }, [deliveries, selectedDate]);

  // Reconfirmation queue
  const needReconfirm = useMemo(() => {
    const today = todayISO();
    return deliveries.filter(d =>
      d.lifecycle === "confirmed" && d.deliveryDate >= today && !customerConfirmationValid(d)
    );
  }, [deliveries]);

  // Day stats
  const dayTotal = dayDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const confirmedCount = dayDeliveries.filter(d => d.lifecycle === "confirmed").length;
  const proposedCount = dayDeliveries.filter(d => d.lifecycle === "proposed").length;

  function prevDay() {
    setSelectedDate(toISODate(addDays(selectedDate, -1)));
  }
  function nextDay() {
    setSelectedDate(toISODate(addDays(selectedDate, 1)));
  }

  return (
    <div style={{ ...FONT, maxWidth: 600, margin: "0 auto", padding: "0 12px 100px" }}>
      {/* Date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0 12px" }}>
        <button onClick={prevDay} style={navBtn}>&lsaquo;</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>
            {fmtDate(selectedDate)}
          </div>
          <div style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>
            {dayDeliveries.length} deliveries &middot; {fmtMoney(dayTotal)}
            {proposedCount > 0 && <span style={{ color: AMBER }}> &middot; {proposedCount} pending</span>}
          </div>
        </div>
        <button onClick={nextDay} style={navBtn}>&rsaquo;</button>
      </div>

      {/* Quick jump */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none" }}>
        <button onClick={() => setSelectedDate(todayISO())}
          style={{ ...pillBtn, background: selectedDate === todayISO() ? GREEN : "#fff", color: selectedDate === todayISO() ? "#fff" : DARK }}>
          Today
        </button>
        {[1, 2, 3, 4, 5].map(i => {
          const d = toISODate(addDays(new Date(), i));
          const label = new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
          return (
            <button key={d} onClick={() => setSelectedDate(d)}
              style={{ ...pillBtn, background: selectedDate === d ? GREEN : "#fff", color: selectedDate === d ? "#fff" : DARK }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Action buttons row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowReconfirm(true)}
          style={{
            flex: 1, padding: "10px 8px", borderRadius: 10,
            border: `1.5px solid ${needReconfirm.length ? AMBER : BORDER}`,
            background: needReconfirm.length ? "#fff7ec" : "#fff",
            color: needReconfirm.length ? AMBER : MUTED,
            fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
          {needReconfirm.length} need reconfirm
        </button>
        <button onClick={() => setShowImporter(true)}
          style={{
            flex: 1, padding: "10px 8px", borderRadius: 10,
            border: `1.5px solid ${GREEN}`, background: "#f0f9ec",
            color: DARK, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
          Import XLS
        </button>
      </div>

      {/* Delivery list */}
      {dayDeliveries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: MUTED }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>&#128230;</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>No deliveries for this day</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tap + to add one</div>
        </div>
      ) : (
        dayDeliveries.map(d => {
          const cust = d.customerSnapshot || {};
          const isProposed = d.lifecycle === "proposed";
          const isConfirmed = d.lifecycle === "confirmed";
          const salesOk = !!d.salesConfirmedAt;
          const custOk = customerConfirmationValid(d);
          const shipOk = !!d.shippingConfirmedAt;
          return (
            <div key={d.id} style={{
              background: "#fff",
              border: isProposed ? `2px dashed ${AMBER}` : `1.5px solid ${BORDER}`,
              borderRadius: 12, padding: "14px 16px", marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>
                    {cust.company_name || "\u2014"}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                    {d.deliveryTime || "No time"} &middot; {fmtMoney(d.orderValueCents)}
                    {d.cartCount ? ` \u00b7 ${d.cartCount} carts` : ""}
                  </div>
                </div>
                <div style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                  background: isProposed ? "#fff7ec" : isConfirmed ? "#e8f5e0" : "#f0f0f0",
                  color: isProposed ? AMBER : isConfirmed ? GREEN : MUTED,
                  border: `1px solid ${isProposed ? AMBER : isConfirmed ? GREEN : BORDER}`,
                }}>
                  {isProposed ? "Pending" : isConfirmed ? "Confirmed" : d.lifecycle || "Draft"}
                </div>
              </div>

              {/* Status dots */}
              <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 11, color: MUTED }}>
                <span>{salesOk ? "\ud83d\udfe2" : "\ud83d\udfe1"} Sales</span>
                <span>{custOk ? "\ud83d\udfe2" : "\ud83d\udfe1"} Customer</span>
                <span>{shipOk ? "\ud83d\udfe2" : "\ud83d\udfe1"} Tyler</span>
              </div>

              {/* Team pull status */}
              <div style={{ marginTop: 6, display: "flex", gap: 8, fontSize: 11 }}>
                {d.needsBluff1 && <span style={{ color: d.bluff1PulledAt ? GREEN : MUTED }}>Bluff1 {d.bluff1PulledAt ? "\u2705" : "\u2b1c"}</span>}
                {d.needsBluff2 && <span style={{ color: d.bluff2PulledAt ? GREEN : MUTED }}>Bluff2 {d.bluff2PulledAt ? "\u2705" : "\u2b1c"}</span>}
                {d.needsSprague && <span style={{ color: d.spraguePulledAt ? GREEN : MUTED }}>Sprague {d.spraguePulledAt ? "\u2705" : "\u2b1c"}</span>}
                {d.needsHouseplants && <span style={{ color: d.houseplantsPulledAt ? GREEN : MUTED }}>HP {d.houseplantsPulledAt ? "\u2705" : "\u2b1c"}</span>}
              </div>

              {d.notes && (
                <div style={{ marginTop: 8, padding: "8px 10px", background: "#f2f5ef", borderRadius: 8, fontSize: 12, color: DARK }}>
                  {d.notes}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* FAB */}
      <button onClick={() => setShowAddForm(true)}
        style={{
          position: "fixed", bottom: 24, right: 24, width: 60, height: 60,
          borderRadius: "50%", background: GREEN, color: "#fff",
          border: "none", fontSize: 28, fontWeight: 900, cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)", zIndex: 500,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        +
      </button>

      {/* Add delivery form */}
      {showAddForm && (
        <AddDeliveryForm
          customers={customers}
          displayName={displayName}
          defaultDate={selectedDate}
          onSave={async (data) => {
            await insert(data);
            setShowAddForm(false);
          }}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Import modal */}
      {showImporter && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,45,26,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowImporter(false)}>
          <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: DARK }}>Import Delivery Schedule</div>
              <button onClick={() => setShowImporter(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>&#10005;</button>
            </div>
            <DeliveryImporter onDone={() => setShowImporter(false)} />
          </div>
        </div>
      )}

      {/* Reconfirmation queue */}
      {showReconfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,45,26,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowReconfirm(false)}>
          <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 600, maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: DARK }}>Reconfirmation Queue</div>
              <button onClick={() => setShowReconfirm(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>&#10005;</button>
            </div>
            {needReconfirm.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: MUTED }}>All caught up</div>
            ) : (
              needReconfirm.map(d => {
                const cust = d.customerSnapshot || {};
                return (
                  <div key={d.id} style={{ padding: 12, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: DARK }}>{cust.company_name || "\u2014"}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{fmtDate(d.deliveryDate)} &middot; {fmtMoney(d.orderValueCents)}</div>
                    </div>
                    <button onClick={async () => {
                      await update(d.id, { customerConfirmedAt: new Date().toISOString(), customerConfirmedBy: displayName });
                    }}
                      style={{ padding: "10px 16px", background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", minHeight: 48 }}>
                      Reconfirmed
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn = {
  background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 10,
  width: 44, height: 44, fontSize: 20, fontWeight: 800, cursor: "pointer",
  color: DARK, display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "inherit",
};

const pillBtn = {
  padding: "8px 14px", borderRadius: 999, border: `1px solid ${BORDER}`,
  fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  whiteSpace: "nowrap",
};

// ── Add Delivery Form ─────────────────────────────────────────────────────
function AddDeliveryForm({ customers, displayName, defaultDate, onSave, onClose }) {
  const [custSearch, setCustSearch] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [custName, setCustName] = useState("");
  const [date, setDate] = useState(defaultDate || todayISO());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [needsBluff, setNeedsBluff] = useState(true);
  const [needsSprague, setNeedsSprague] = useState(false);
  const [needsHouseplants, setNeedsHouseplants] = useState(false);
  const [valueDollars, setValueDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const matches = useMemo(() => {
    if (!custSearch || custSearch.length < 2) return [];
    const q = custSearch.toUpperCase();
    return customers
      .filter(c => (c.companyName || "").toUpperCase().includes(q))
      .slice(0, 10);
  }, [custSearch, customers]);

  function selectCustomer(c) {
    setCustomerId(c.id);
    setCustName(c.companyName || "");
    setCustSearch(c.companyName || "");
  }

  async function handleSave() {
    if (!customerId || !date) return;
    setSaving(true);
    try {
      const cust = customers.find(c => c.id === customerId);
      const snapshot = cust ? {
        company_name: cust.companyName,
        address1: cust.address1,
        city: cust.city,
        state: cust.state,
        zip: cust.zip,
        terms: cust.terms,
        shipping_notes: cust.shippingNotes,
      } : { company_name: custName };

      await onSave({
        customerId,
        customerSnapshot: snapshot,
        deliveryDate: date,
        deliveryTime: time || null,
        notes: notes || null,
        needsBluff1: needsBluff,
        needsBluff2: needsBluff,
        needsSprague: needsSprague,
        needsHouseplants: needsHouseplants,
        orderValueCents: valueDollars ? Math.round(parseFloat(valueDollars) * 100) : null,
        lifecycle: "proposed",
        salesConfirmedAt: new Date().toISOString(),
        salesConfirmedBy: displayName,
      });
      setShowConfirm(true);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (showConfirm) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(30,45,26,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 32, textAlign: "center", maxWidth: 360, width: "100%" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#9989;</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 8, fontFamily: "'DM Serif Display',Georgia,serif" }}>Submitted</div>
          <div style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>Delivery submitted for Tyler's approval.</div>
          <button onClick={onClose}
            style={{ padding: "14px 32px", background: GREEN, color: "#fff", border: "none", borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(30,45,26,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>Add Delivery</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>&#10005;</button>
        </div>

        {/* Customer */}
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={labelStyle}>Customer</div>
          <input type="text" value={custSearch} onChange={e => { setCustSearch(e.target.value); setCustomerId(null); }}
            placeholder="Search customers..."
            style={inputStyle} />
          {matches.length > 0 && !customerId && (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, maxHeight: 160, overflowY: "auto", marginTop: 4, background: "#fff" }}>
              {matches.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)}
                  style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, fontWeight: 600, borderBottom: `1px solid ${BORDER}` }}>
                  {c.companyName}
                  {c.city && <span style={{ color: MUTED, fontSize: 12, marginLeft: 8 }}>{c.city}, {c.state}</span>}
                </div>
              ))}
            </div>
          )}
          {customerId && (
            <div style={{ marginTop: 4, padding: "6px 10px", background: "#e8f5e0", borderRadius: 6, fontSize: 13, fontWeight: 700, color: GREEN }}>
              {custName}
            </div>
          )}
        </label>

        {/* Date + Time */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <label style={{ flex: 1 }}>
            <div style={labelStyle}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ flex: 1 }}>
            <div style={labelStyle}>Time</div>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
          </label>
        </div>

        {/* Value */}
        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={labelStyle}>Estimated Value ($)</div>
          <input type="number" value={valueDollars} onChange={e => setValueDollars(e.target.value)}
            placeholder="0.00" style={inputStyle} />
        </label>

        {/* Teams */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Which teams pull?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {[
              { key: "bluff", label: "Bluff", value: needsBluff, set: setNeedsBluff },
              { key: "sprague", label: "Sprague", value: needsSprague, set: setNeedsSprague },
              { key: "hp", label: "Houseplants", value: needsHouseplants, set: setNeedsHouseplants },
            ].map(t => (
              <button key={t.key} onClick={() => t.set(!t.value)}
                style={{
                  padding: "10px 18px", borderRadius: 10, fontWeight: 800, fontSize: 13,
                  cursor: "pointer", fontFamily: "inherit", minHeight: 48,
                  background: t.value ? GREEN : "#fff",
                  color: t.value ? "#fff" : DARK,
                  border: `1.5px solid ${t.value ? GREEN : BORDER}`,
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <label style={{ display: "block", marginBottom: 20 }}>
          <div style={labelStyle}>Notes</div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Special instructions, order numbers..."
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
        </label>

        {/* Submit */}
        <button onClick={handleSave} disabled={!customerId || !date || saving}
          style={{
            width: "100%", padding: "16px 0", borderRadius: 12,
            background: !customerId || !date || saving ? MUTED : GREEN,
            color: "#fff", border: "none", fontWeight: 800, fontSize: 16,
            cursor: !customerId || !date ? "default" : "pointer",
            fontFamily: "inherit", minHeight: 52,
          }}>
          {saving ? "Submitting..." : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit",
  color: DARK, boxSizing: "border-box", outline: "none",
};
