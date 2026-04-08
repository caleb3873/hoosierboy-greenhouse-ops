import { useState, useMemo } from "react";
import { useDrivers, useDeliveries } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const BORDER = "#e0ead8";

export default function ShippingDrivers() {
  const { rows: drivers, insert, update, remove, loading } = useDrivers();
  const { rows: deliveries } = useDeliveries();
  const [editing, setEditing] = useState(null); // row or "new"
  const [dayOffset, setDayOffset] = useState(0);

  async function save(row) {
    if (row.id) {
      const { id, ...changes } = row;
      await update(id, changes);
    } else {
      await insert(row);
    }
    setEditing(null);
  }

  async function del(id) {
    if (!window.confirm("Delete this driver?")) return;
    await remove(id);
  }

  const active   = drivers.filter(d => d.active);
  const inactive = drivers.filter(d => !d.active);

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Drivers</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
            {loading ? "Loading…" : `${active.length} active • ${inactive.length} inactive`}
          </div>
        </div>
        <button onClick={() => setEditing({ name: "", phone: "", license: "", notes: "", active: true })}
          style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: DARK, color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Driver
        </button>
      </div>

      {drivers.length === 0 && !loading && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚚</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No drivers added yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Tap <b>+ Add Driver</b> to get started.</div>
        </div>
      )}

      {active.length > 0 && <SectionLabel>Active</SectionLabel>}
      {active.map(d => <DriverRow key={d.id} driver={d} onEdit={() => setEditing(d)} onDelete={() => del(d.id)} />)}

      {inactive.length > 0 && <SectionLabel>Inactive</SectionLabel>}
      {inactive.map(d => <DriverRow key={d.id} driver={d} onEdit={() => setEditing(d)} onDelete={() => del(d.id)} />)}

      <DriverSchedule drivers={active} deliveries={deliveries} dayOffset={dayOffset} setDayOffset={setDayOffset} />

      {editing && <DriverForm driver={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

// ── Driver schedule ──────────────────────────────────────────────────────────
function DriverSchedule({ drivers, deliveries, dayOffset, setDayOffset }) {
  const activeDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);
  const iso = activeDate.toISOString().slice(0, 10);
  const label = activeDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const byDriver = useMemo(() => {
    const m = new Map();
    for (const d of deliveries) {
      if (d.deliveryDate !== iso || !d.driverId) continue;
      if (!m.has(d.driverId)) m.set(d.driverId, []);
      m.get(d.driverId).push(d);
    }
    for (const arr of m.values()) arr.sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
    return m;
  }, [deliveries, iso]);

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          Driver Schedule
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setDayOffset(o => o - 1)} style={navBtnStyle}>←</button>
          <div style={{ fontSize: 13, fontWeight: 700, color: DARK, minWidth: 160, textAlign: "center" }}>
            {label}
            {dayOffset !== 0 && <button onClick={() => setDayOffset(0)} style={{ display: "block", background: "none", border: "none", color: GREEN, fontSize: 10, fontWeight: 700, cursor: "pointer", padding: 0, margin: "2px auto 0" }}>Today</button>}
          </div>
          <button onClick={() => setDayOffset(o => o + 1)} style={navBtnStyle}>→</button>
        </div>
      </div>

      {drivers.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: "30px 20px", textAlign: "center", color: "#7a8c74", fontSize: 13 }}>
          Add drivers above to see their schedule.
        </div>
      ) : drivers.map(d => {
        const stops = byDriver.get(d.id) || [];
        const total = stops.reduce((s, x) => s + (x.orderValueCents || 0), 0);
        const delivered = stops.filter(s => s.status === "delivered").length;
        const weekdayId = ["sun","mon","tue","wed","thu","fri","sat"][activeDate.getDay()];
        const availToday = (d.availableDays || []).includes(weekdayId);
        const hasSchedule = (d.availableDays || []).length > 0;
        return (
          <div key={d.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${hasSchedule && !availToday ? "#d94f3d" : BORDER}`, padding: 14, marginBottom: 10, opacity: hasSchedule && !availToday ? 0.75 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: DARK }}>🚚 {d.name}</div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                  {stops.length === 0 ? "No stops scheduled" : `${stops.length} stop${stops.length !== 1 ? "s" : ""} • $${(total/100).toLocaleString()} • ${delivered}/${stops.length} delivered`}
                </div>
              </div>
              {d.phone && (
                <a href={`tel:${d.phone}`}
                  style={{ background: "#f0f8eb", color: DARK, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  📞 {d.phone}
                </a>
              )}
            </div>
            {/* Weekly availability strip */}
            <div style={{ display: "flex", gap: 4, marginBottom: stops.length > 0 ? 10 : 0, flexWrap: "wrap" }}>
              {!hasSchedule ? (
                <div style={{ fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>No weekly schedule set — edit driver to add availability</div>
              ) : (
                [
                  { id: "mon", label: "Mon" },
                  { id: "tue", label: "Tue" },
                  { id: "wed", label: "Wed" },
                  { id: "thu", label: "Thu" },
                  { id: "fri", label: "Fri" },
                  { id: "sat", label: "Sat" },
                ].map(day => {
                  const on = (d.availableDays || []).includes(day.id);
                  const isCurrentDay = day.id === weekdayId;
                  return (
                    <span key={day.id} style={{
                      fontSize: 10, fontWeight: 800,
                      background: on ? (isCurrentDay ? "#4a7a35" : "#f0f8eb") : "#f5f5f5",
                      color: on ? (isCurrentDay ? "#fff" : DARK) : "#a0a0a0",
                      border: `1px solid ${on ? GREEN : "#d0d0d0"}`,
                      borderRadius: 6, padding: "3px 8px",
                      textDecoration: on ? "none" : "line-through",
                    }}>
                      {day.label}
                    </span>
                  );
                })
              )}
              {hasSchedule && !availToday && (
                <span style={{ fontSize: 10, fontWeight: 800, background: "#d94f3d", color: "#fff", borderRadius: 6, padding: "3px 8px" }}>⚠ Not scheduled today</span>
              )}
            </div>
            {stops.length > 0 && (
              <div>
                {stops.map((s, i) => {
                  const c = s.customerSnapshot || {};
                  const done = s.status === "delivered";
                  return (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: i === 0 ? `1px solid ${BORDER}` : "none", borderBottom: `1px solid ${BORDER}`, opacity: done ? 0.6 : 1 }}>
                      <div style={{ background: done ? GREEN : DARK, color: done ? DARK : "#c8e6b8", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                        {done ? "✓" : (s.stopOrder || i + 1)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: DARK, textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.company_name || "—"}
                        </div>
                        <div style={{ fontSize: 10, color: "#7a8c74" }}>
                          {[c.city, c.state].filter(Boolean).join(", ")}
                          {s.deliveryTime && <> • {s.deliveryTime}</>}
                          {s.orderValueCents > 0 && <> • ${(s.orderValueCents/100).toLocaleString()}</>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const navBtnStyle = { background: "#f2f5ef", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" };

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, margin: "18px 4px 8px" }}>
      {children}
    </div>
  );
}

function DriverRow({ driver: d, onEdit, onDelete }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, opacity: d.active ? 1 : 0.55 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{d.name}</div>
        {d.license && <div style={{ fontSize: 12, color: "#7a8c74" }}>CDL: {d.license}</div>}
        {d.notes && <div style={{ fontSize: 12, color: "#7a8c74", fontStyle: "italic", marginTop: 2 }}>{d.notes}</div>}
      </div>
      {d.phone && (
        <a href={`tel:${d.phone}`}
          style={{ background: "#f0f8eb", color: DARK, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          📞 {d.phone}
        </a>
      )}
      <button onClick={onEdit} style={{ background: "none", border: `1px solid ${BORDER}`, color: "#7a8c74", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        Edit
      </button>
      <button onClick={onDelete} style={{ background: "none", border: "none", color: "#c0c0c0", fontSize: 20, cursor: "pointer", padding: 4 }}>🗑</button>
    </div>
  );
}

const WEEK_DAYS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
];

function DriverForm({ driver, onSave, onCancel }) {
  const [d, setD] = useState({ ...driver, availableDays: driver.availableDays || [] });
  const upd = (k, v) => setD(p => ({ ...p, [k]: v }));
  const toggleDay = (id) => {
    const cur = d.availableDays || [];
    upd("availableDays", cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  };

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          {driver.id ? "Edit Driver" : "New Driver"}
        </div>
        <Field label="Name" value={d.name || ""} onChange={v => upd("name", v)} />
        <Field label="Phone" value={d.phone || ""} onChange={v => upd("phone", v)} placeholder="317-555-1234" />
        <Field label="Login Code" value={d.loginCode || ""} onChange={v => upd("loginCode", v)} placeholder="7-digit code for driver app" />
        <Field label="CDL / License" value={d.license || ""} onChange={v => upd("license", v)} />
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Available Days</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WEEK_DAYS.map(day => {
              const on = (d.availableDays || []).includes(day.id);
              return (
                <button key={day.id} type="button" onClick={() => toggleDay(day.id)}
                  style={{
                    flex: 1, padding: "10px 4px", borderRadius: 8,
                    background: on ? GREEN : "#f2f5ef",
                    color: on ? DARK : "#7a8c74",
                    border: `1.5px solid ${on ? GREEN : BORDER}`,
                    fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Notes" value={d.notes || ""} onChange={v => upd("notes", v)} multiline />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: DARK, fontWeight: 700 }}>
          <input type="checkbox" checked={d.active !== false} onChange={e => upd("active", e.target.checked)} />
          Active
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(d)} disabled={!d.name?.trim()}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: d.name?.trim() ? DARK : "#c8d8c0", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: d.name?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, placeholder }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <Tag value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`,
          fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
          minHeight: multiline ? 70 : undefined, resize: multiline ? "vertical" : undefined,
        }} />
    </div>
  );
}
