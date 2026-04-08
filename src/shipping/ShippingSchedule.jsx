import { useMemo, useState } from "react";
import { useDeliveries, useShippingCustomers, useDrivers, useShippingTeams, useTrucks } from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const BORDER = "#e0ead8";

const PRIORITIES = [
  { id: "critical", label: "Critical", bg: "#d94f3d", color: "#fff" },
  { id: "high",     label: "High",     bg: "#e89a3a", color: "#fff" },
  { id: "normal",   label: "Normal",   bg: "#7fb069", color: "#1e2d1a" },
  { id: "flex",     label: "Flex",     bg: "#9cb894", color: "#1e2d1a" },
];

function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function todayISO() { return toISODate(new Date()); }
function weekMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0,0,0,0);
  return dt;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function formatCurrency(cents) {
  if (!cents && cents !== 0) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ShippingSchedule() {
  const { rows: deliveries, insert, update, remove } = useDeliveries();
  const { rows: customers } = useShippingCustomers();
  const { rows: drivers } = useDrivers();
  const { rows: teams }   = useShippingTeams();
  const { rows: trucks }  = useTrucks();
  const { user } = useAuth();
  const createdBy = user?.email || "sales";

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = useMemo(() => addDays(weekMonday(), weekOffset * 7), [weekOffset]);
  const sunday = useMemo(() => addDays(monday, 7), [monday]);
  const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(monday, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const weekDeliveries = useMemo(() => {
    return deliveries
      .filter(d => d.deliveryDate && d.deliveryDate >= toISODate(monday) && d.deliveryDate < toISODate(sunday))
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "") || (a.createdAt || "").localeCompare(b.createdAt || ""));
  }, [deliveries, monday, sunday]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const d of weekDeliveries) {
      if (!m.has(d.deliveryDate)) m.set(d.deliveryDate, []);
      m.get(d.deliveryDate).push(d);
    }
    return m;
  }, [weekDeliveries]);

  async function saveDelivery(form) {
    const row = {
      customerId: form.customer?.id || null,
      customerSnapshot: form.customer ? {
        company_name: form.customer.companyName,
        address1: form.customer.address1,
        city: form.customer.city,
        state: form.customer.state,
        zip: form.customer.zip,
        phone: form.customer.phone,
        email: form.customer.email,
        terms: form.customer.terms,
        customer_type: form.customer.customerType,
        allow_carts: !!form.customer.allowCarts,
      } : null,
      deliveryDate: form.deliveryDate,
      deliveryTime: form.deliveryTime || null,
      priority: form.priority,
      orderNumbers: form.orderNumbers,
      orderValueCents: Math.round((parseFloat(form.orderValue) || 0) * 100),
      cartCount: parseInt(form.cartCount, 10) || 0,
      notes: form.notes || null,
      status: "scheduled",
      createdBy,
    };
    let saved;
    if (form.id) {
      await update(form.id, row);
      saved = { id: form.id, ...row };
    } else {
      saved = await insert(row);
    }
    // Fire-and-forget distance computation
    computeDistance(saved).catch(() => {});
    setShowForm(false);
    setEditing(null);
  }

  async function computeDistance(delivery) {
    if (!delivery?.id) return;
    const c = delivery.customerSnapshot || {};
    const destination = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
    if (!destination) return;
    try {
      const resp = await fetch("/api/shipping-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      if (!resp.ok) return;
      const { miles, minutes } = await resp.json();
      await update(delivery.id, { miles, driveMinutes: minutes });
    } catch {}
  }

  async function del(id) {
    if (!window.confirm("Delete this delivery?")) return;
    await remove(id);
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Schedule</div>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: DARK, color: CREAM, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + New Delivery
        </button>
      </div>

      {/* Week selector */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 14, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: "#f2f5ef", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>← Prev</button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{weekLabel}</div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
            {weekDeliveries.length} deliveries • {formatCurrency(weekDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0))}
            {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ marginLeft: 8, background: "none", border: "none", color: GREEN, fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>This week</button>}
          </div>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: "#f2f5ef", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Next →</button>
      </div>

      {/* Deliveries grouped by day */}
      {weekDeliveries.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No deliveries scheduled this week</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Tap <b>+ New Delivery</b> to add one.</div>
        </div>
      ) : (
        [...byDate.entries()].map(([date, items]) => {
          const d = new Date(date + "T00:00:00");
          const isToday = date === todayISO();
          const dayName = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
          const dayTotal = items.reduce((s, x) => s + (x.orderValueCents || 0), 0);
          return (
            <div key={date} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 4px 8px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? GREEN : DARK, textTransform: "uppercase", letterSpacing: 1 }}>
                  {dayName}
                  {isToday && <span style={{ marginLeft: 8, fontSize: 10, background: GREEN, color: DARK, borderRadius: 999, padding: "2px 8px" }}>TODAY</span>}
                </div>
                <div style={{ flex: 1, height: 2, background: BORDER, borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>
                  {items.length} • {formatCurrency(dayTotal)}
                </span>
              </div>
              {items.map(d => (
                <DeliveryRow key={d.id} delivery={d} drivers={drivers} teams={teams} trucks={trucks}
                  onEdit={() => { setEditing(d); setShowForm(true); }}
                  onDelete={() => del(d.id)}
                />
              ))}
            </div>
          );
        })
      )}

      {showForm && (
        <DeliveryForm
          delivery={editing}
          customers={customers}
          onSave={saveDelivery}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function DeliveryRow({ delivery: d, drivers, teams, trucks, onEdit, onDelete }) {
  const pr = PRIORITIES.find(p => p.id === d.priority) || PRIORITIES[2];
  const cust = d.customerSnapshot || {};
  const driver = drivers.find(dr => dr.id === d.driverId);
  const team = teams?.find(t => t.id === d.teamId);
  const truck = trucks?.find(t => t.id === d.truckId);
  const isDelivered = d.status === "delivered";

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`,
      padding: 14, marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-start",
      opacity: isDelivered ? 0.6 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{cust.company_name || "—"}</div>
          <span style={{ fontSize: 9, fontWeight: 800, background: pr.bg, color: pr.color, borderRadius: 999, padding: "2px 8px" }}>{pr.label.toUpperCase()}</span>
          {d.cartCount > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#4a7a35" }}>🛒 {d.cartCount}</span>}
          {isDelivered && <span style={{ fontSize: 9, fontWeight: 800, background: "#4a7a35", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>DELIVERED</span>}
          {d.deliveryTime && <span style={{ fontSize: 11, color: "#7a8c74" }}>🕒 {d.deliveryTime}</span>}
        </div>
        <div style={{ fontSize: 12, color: "#7a8c74" }}>
          {cust.city}{cust.state ? `, ${cust.state}` : ""} • <b style={{ color: DARK }}>{formatCurrency(d.orderValueCents)}</b>
          {d.miles != null && <> • {d.miles} mi / {d.driveMinutes || "?"} min</>}
          {driver && <> • 🚚 <b style={{ color: DARK }}>{driver.name}</b></>}
          {team && <> • 👥 <b style={{ color: team.color || DARK }}>{team.name}</b></>}
          {truck && <> • 🚛 <b style={{ color: DARK }}>{truck.name}</b></>}
        </div>
        {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && (
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Orders: {d.orderNumbers.join(", ")}</div>
        )}
        {d.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4, fontStyle: "italic" }}>{d.notes}</div>}
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button onClick={onEdit} style={{ background: "none", border: `1px solid ${BORDER}`, color: "#7a8c74", padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#c0c0c0", fontSize: 18, cursor: "pointer", padding: 4 }}>🗑</button>
      </div>
    </div>
  );
}

// ── Delivery form ────────────────────────────────────────────────────────────
function DeliveryForm({ delivery, customers, onSave, onCancel }) {
  const init = delivery ? {
    id: delivery.id,
    customer: customers.find(c => c.id === delivery.customerId) || (delivery.customerSnapshot ? { companyName: delivery.customerSnapshot.company_name, city: delivery.customerSnapshot.city } : null),
    deliveryDate: delivery.deliveryDate || todayISO(),
    deliveryTime: delivery.deliveryTime || "",
    priority: delivery.priority || "normal",
    orderNumbers: delivery.orderNumbers || [],
    orderValue: delivery.orderValueCents ? (delivery.orderValueCents / 100).toString() : "",
    cartCount: delivery.cartCount ? String(delivery.cartCount) : "",
    notes: delivery.notes || "",
  } : {
    customer: null,
    deliveryDate: todayISO(),
    deliveryTime: "",
    priority: "normal",
    orderNumbers: [],
    orderValue: "",
    cartCount: "",
    notes: "",
  };

  const [form, setForm] = useState(init);
  const [custSearch, setCustSearch] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const custResults = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return [];
    return customers.filter(c =>
      (c.companyName || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.careOf || "").toLowerCase().includes(q)
    ).slice(0, 8);
  }, [custSearch, customers]);

  const addOrder = () => {
    const v = orderInput.trim();
    if (!v) return;
    if (!form.orderNumbers.includes(v)) upd("orderNumbers", [...form.orderNumbers, v]);
    setOrderInput("");
  };
  const removeOrder = (n) => upd("orderNumbers", form.orderNumbers.filter(x => x !== n));

  const canSave = !!form.customer && !!form.deliveryDate;

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
        maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ background: DARK, color: CREAM, padding: "16px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {delivery ? "Edit Delivery" : "New Delivery"}
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: CREAM, fontSize: 26, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          {/* Customer picker */}
          <Label>Customer</Label>
          {form.customer ? (
            <div style={{ background: "#f0f8eb", border: `1.5px solid ${GREEN}`, borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>{form.customer.companyName}</div>
                <div style={{ fontSize: 12, color: "#7a8c74" }}>
                  {[form.customer.address1, form.customer.city, form.customer.state, form.customer.zip].filter(Boolean).join(", ")}
                </div>
                {form.customer.terms && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Terms: {form.customer.terms}</div>}
              </div>
              <button onClick={() => upd("customer", null)} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <input value={custSearch} onChange={e => setCustSearch(e.target.value)}
                placeholder="Search customers…"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
              {custResults.length > 0 && (
                <div style={{ marginTop: 6, border: `1.5px solid ${BORDER}`, borderRadius: 10, maxHeight: 220, overflowY: "auto" }}>
                  {custResults.map(c => (
                    <div key={c.id} onClick={() => { upd("customer", c); setCustSearch(""); }}
                      style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{c.companyName}</div>
                      <div style={{ fontSize: 11, color: "#7a8c74" }}>{[c.city, c.state].filter(Boolean).join(", ")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Date + time */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Label>Delivery Date</Label>
              <input type="date" value={form.deliveryDate} onChange={e => upd("deliveryDate", e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Time (optional)</Label>
              <input type="time" value={form.deliveryTime} onChange={e => upd("deliveryTime", e.target.value)}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>

          {/* Priority */}
          <Label style={{ marginTop: 14 }}>Priority</Label>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {PRIORITIES.map(p => {
              const active = form.priority === p.id;
              return (
                <button key={p.id} onClick={() => upd("priority", p.id)}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                    background: active ? p.bg : "#f2f5ef",
                    color: active ? p.color : "#7a8c74",
                    border: `1.5px solid ${active ? p.bg : BORDER}`,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Order numbers */}
          <Label>Order Numbers</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {form.orderNumbers.map(n => (
              <span key={n} style={{ background: DARK, color: CREAM, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {n}
                <button onClick={() => removeOrder(n)} style={{ background: "none", border: "none", color: CREAM, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <input value={orderInput} onChange={e => setOrderInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOrder(); } }}
              placeholder="SBI order #"
              style={{ flex: 1, padding: 10, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            <button onClick={addOrder}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: GREEN, color: DARK, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Add
            </button>
          </div>

          {/* Order value + carts */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 2 }}>
              <Label>Order Total Value ($)</Label>
              <input type="number" value={form.orderValue} onChange={e => upd("orderValue", e.target.value)}
                placeholder="0"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 14 }} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Carts {form.customer?.allowCarts ? "🛒" : ""}</Label>
              <input type="number" value={form.cartCount} onChange={e => upd("cartCount", e.target.value)}
                placeholder="0"
                disabled={form.customer && !form.customer.allowCarts}
                title={form.customer && !form.customer.allowCarts ? "This customer isn't cart-eligible" : "Number of carts to drop"}
                style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${form.customer?.allowCarts ? GREEN : BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 14, background: form.customer && !form.customer.allowCarts ? "#f5f5f5" : "#fff" }} />
            </div>
          </div>

          {/* Notes */}
          <Label>Notes</Label>
          <textarea value={form.notes} onChange={e => upd("notes", e.target.value)}
            placeholder="Special instructions, quirks, loading notes…"
            style={{ width: "100%", minHeight: 80, padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none" }} />

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={() => onSave(form)} disabled={!canSave}
              style={{ flex: 2, padding: "14px 0", borderRadius: 10, border: "none", background: canSave ? DARK : "#c8d8c0", color: CREAM, fontSize: 14, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
              {delivery ? "Save Changes" : "Schedule Delivery"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children, style }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, ...(style || {}) }}>{children}</div>;
}
