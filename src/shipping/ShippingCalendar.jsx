import { useMemo, useState, Fragment } from "react";
import { useDeliveries, useTrucks, useShippingTeams, useShippingCustomers } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";
const AMBER = "#e89a3a";
const BORDER = "#e0ead8";

const PRIORITY = {
  critical: { label: "CRITICAL", bg: "#d94f3d" },
  high:     { label: "HIGH",     bg: "#e89a3a" },
  normal:   { label: "NORMAL",   bg: "#7fb069" },
  flex:     { label: "FLEX",     bg: "#9cb894" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function weekMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function toISODate(d) { return d.toISOString().slice(0, 10); }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${(c/100).toLocaleString()}`; }

// Parse delivery_time → "AM" | "PM" | "HH:MM" | null
function parseSlot(t) {
  if (!t) return null;
  const s = String(t).trim().toUpperCase();
  if (s === "AM" || s === "PM") return s;
  // Already "HH:MM" format
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  return null;
}

// For a specific-hour slot ("HH:MM"), infer AM/PM
function hourBucket(hhmm) {
  const h = parseInt(hhmm.split(":")[0], 10);
  return h < 12 ? "AM" : "PM";
}

export default function ShippingCalendar() {
  const { rows: deliveries, update, remove } = useDeliveries();
  const { rows: trucks } = useTrucks();
  const { rows: teams }  = useShippingTeams();
  const { rows: customers } = useShippingCustomers();

  const cartEligibleIds = useMemo(() => {
    const s = new Set();
    for (const c of customers) if (c.allowCarts) s.add(c.id);
    return s;
  }, [customers]);

  const [mode, setMode] = useState("week"); // week | day
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset]   = useState(0);
  const [dragging, setDragging]     = useState(null);
  const [tapSelected, setTapSelected] = useState(null);
  const [viewing, setViewing]       = useState(null);

  const monday = useMemo(() => addDays(weekMonday(), weekOffset * 7), [weekOffset]);
  const focusDay = useMemo(() => addDays(new Date(), dayOffset), [dayOffset]);
  const focusDayISO = toISODate(focusDay);

  const weekDays = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = addDays(monday, i);
      return { date: d, iso: toISODate(d), label: d.toLocaleDateString("en-US", { weekday: "short" }), num: d.getDate() };
    });
  }, [monday]);

  const activeTrucks = trucks.filter(t => t.active !== false);
  const capacity = activeTrucks.length || 1;

  // Move a delivery to a new (date, slot) — slot is "AM" | "PM" | "HH:MM" | null
  async function moveDelivery(delivery, date, slot) {
    await update(delivery.id, {
      deliveryDate: date,
      deliveryTime: slot || null,
    });
    setDragging(null);
    setTapSelected(null);
  }

  function cellDeliveries(iso, slot) {
    return deliveries.filter(d => {
      if (d.deliveryDate !== iso) return false;
      const s = parseSlot(d.deliveryTime);
      if (slot === "AM") return s === "AM" || (s && /^\d/.test(s) && hourBucket(s) === "AM");
      if (slot === "PM") return s === "PM" || (s && /^\d/.test(s) && hourBucket(s) === "PM");
      if (slot === null) return s == null; // unscheduled
      return s === slot;
    });
  }

  // Truck conflict: two deliveries in same (date, slot) sharing a truck
  function detectConflicts(cellList) {
    const counts = new Map();
    for (const d of cellList) {
      if (!d.truckId) continue;
      counts.set(d.truckId, (counts.get(d.truckId) || 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  }

  function unscheduledForWeek() {
    const monISO = toISODate(monday);
    const satISO = toISODate(addDays(monday, 6));
    return deliveries.filter(d => {
      if (d.deliveryDate < monISO || d.deliveryDate > satISO) return false;
      return parseSlot(d.deliveryTime) == null;
    });
  }

  const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(monday, 5).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const dayLabel  = focusDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Calendar</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>
            Drag deliveries between slots • Capacity = {capacity} truck{capacity === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f2f5ef", borderRadius: 10, padding: 4 }}>
          {["week","day"].map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{
                padding: "10px 18px", borderRadius: 8, border: "none",
                background: mode === m ? DARK : "transparent",
                color: mode === m ? CREAM : "#7a8c74",
                fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                textTransform: "capitalize",
              }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Nav bar */}
      <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: 12, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        {mode === "week" ? (
          <>
            <button onClick={() => setWeekOffset(w => w - 1)} style={navBtnStyle}>← Prev week</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{weekLabel}</div>
              {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ background: "none", border: "none", color: GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>This week</button>}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)} style={navBtnStyle}>Next week →</button>
          </>
        ) : (
          <>
            <button onClick={() => setDayOffset(d => d - 1)} style={navBtnStyle}>← Prev day</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{dayLabel}</div>
              {dayOffset !== 0 && <button onClick={() => setDayOffset(0)} style={{ background: "none", border: "none", color: GREEN, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Today</button>}
            </div>
            <button onClick={() => setDayOffset(d => d + 1)} style={navBtnStyle}>Next day →</button>
          </>
        )}
      </div>

      {tapSelected && (
        <div style={{ background: "#fff8e1", border: `1.5px solid ${AMBER}`, borderRadius: 10, padding: 10, marginBottom: 10, fontSize: 13, color: DARK, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>👆 Tap a slot to move <b>{tapSelected.customerSnapshot?.company_name}</b></span>
          <button onClick={() => setTapSelected(null)} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 16, cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* Unscheduled drawer — top for day view */}
      {mode === "day" && (
        <UnscheduledDrawer
          items={unscheduledForWeek()}
          teams={teams}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onOpen={setViewing}
          compact
        />
      )}

      {mode === "week" ? (
        <WeekGrid
          weekDays={weekDays}
          deliveries={deliveries}
          cellDeliveries={cellDeliveries}
          detectConflicts={detectConflicts}
          capacity={capacity}
          teams={teams}
          cartEligibleIds={cartEligibleIds}
          dragging={dragging}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onDrop={(iso, slot, delivery) => moveDelivery(delivery, iso, slot)}
          onUnschedule={(d) => moveDelivery(d, d.deliveryDate, null)}
          onViewDetails={setViewing}
        />
      ) : (
        <DayGrid
          dateISO={focusDayISO}
          dateLabel={dayLabel}
          deliveries={deliveries}
          cellDeliveries={cellDeliveries}
          detectConflicts={detectConflicts}
          capacity={capacity}
          teams={teams}
          cartEligibleIds={cartEligibleIds}
          dragging={dragging}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onDrop={(iso, slot, delivery) => moveDelivery(delivery, iso, slot)}
          onUnschedule={(d) => moveDelivery(d, d.deliveryDate, null)}
          onViewDetails={setViewing}
        />
      )}

      {/* Unscheduled drawer — bottom for week view */}
      {mode === "week" && (
        <UnscheduledDrawer
          items={unscheduledForWeek()}
          teams={teams}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onOpen={setViewing}
        />
      )}

      {viewing && (
        <DeliveryDetailModal
          delivery={viewing}
          teams={teams}
          trucks={trucks}
          onClose={() => setViewing(null)}
          onDelete={async () => {
            if (!window.confirm(`Delete this delivery for ${viewing.customerSnapshot?.company_name || "this customer"}? This can't be undone.`)) return;
            await remove(viewing.id);
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}

const navBtnStyle = { background: "#f2f5ef", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" };

// ── Week grid ───────────────────────────────────────────────────────────────
function WeekGrid({ weekDays, cellDeliveries, detectConflicts, capacity, teams, cartEligibleIds, dragging, setDragging, tapSelected, setTapSelected, onDrop, onUnschedule }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px repeat(6, 1fr)", gap: 4 }}>
      {/* Header row */}
      <div />
      {weekDays.map(d => (
        <div key={d.iso} style={{ textAlign: "center", padding: "8px 4px", fontSize: 12, fontWeight: 800, color: DARK, background: "#fff", borderRadius: 8, border: `1.5px solid ${BORDER}` }}>
          <div style={{ color: "#7a8c74", fontSize: 10 }}>{d.label.toUpperCase()}</div>
          <div style={{ fontSize: 16 }}>{d.num}</div>
        </div>
      ))}

      {/* AM row */}
      <SlotLabel label="AM" />
      {weekDays.map(d => {
        const items = cellDeliveries(d.iso, "AM");
        return <CalendarCell key={`${d.iso}-AM`} dateISO={d.iso} slot="AM"
          items={items} capacity={capacity} conflicts={detectConflicts(items)}
          teams={teams} cartEligibleIds={cartEligibleIds} dragging={dragging} setDragging={setDragging}
          tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} onUnschedule={onUnschedule} />;
      })}

      {/* PM row */}
      <SlotLabel label="PM" />
      {weekDays.map(d => {
        const items = cellDeliveries(d.iso, "PM");
        return <CalendarCell key={`${d.iso}-PM`} dateISO={d.iso} slot="PM"
          items={items} capacity={capacity} conflicts={detectConflicts(items)}
          teams={teams} cartEligibleIds={cartEligibleIds} dragging={dragging} setDragging={setDragging}
          tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} onUnschedule={onUnschedule} />;
      })}
    </div>
  );
}

function SlotLabel({ label }) {
  return (
    <div style={{ background: "#f2f5ef", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#7a8c74" }}>
      {label}
    </div>
  );
}

// ── Day grid — side-by-side AM / PM columns ─────────────────────────────────
const AM_HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00"];
const PM_HOURS = ["12:00","13:00","14:00","15:00","16:00","17:00","18:00"];

function DayGrid({ dateISO, cellDeliveries, detectConflicts, capacity, teams, cartEligibleIds, dragging, setDragging, tapSelected, setTapSelected, onDrop, onUnschedule }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <DayColumn title="AM" hours={AM_HOURS} dateISO={dateISO}
        cellDeliveries={cellDeliveries} detectConflicts={detectConflicts}
        capacity={capacity} teams={teams} cartEligibleIds={cartEligibleIds}
        dragging={dragging} setDragging={setDragging}
        tapSelected={tapSelected} setTapSelected={setTapSelected}
        onDrop={onDrop} onUnschedule={onUnschedule} />
      <DayColumn title="PM" hours={PM_HOURS} dateISO={dateISO}
        cellDeliveries={cellDeliveries} detectConflicts={detectConflicts}
        capacity={capacity} teams={teams} cartEligibleIds={cartEligibleIds}
        dragging={dragging} setDragging={setDragging}
        tapSelected={tapSelected} setTapSelected={setTapSelected}
        onDrop={onDrop} onUnschedule={onUnschedule} />
    </div>
  );
}

function DayColumn({ title, hours, dateISO, cellDeliveries, detectConflicts, capacity, teams, cartEligibleIds, dragging, setDragging, tapSelected, setTapSelected, onDrop, onUnschedule }) {
  const bucketItems = cellDeliveries(dateISO, title).filter(d => parseSlot(d.deliveryTime) === title);
  return (
    <div style={{ background: "#f8faf6", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: DARK, textAlign: "center", marginBottom: 8, letterSpacing: 2, fontFamily: "'DM Serif Display',Georgia,serif" }}>
        {title}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, paddingLeft: 2 }}>
          Bucket
        </div>
        <CalendarCell dateISO={dateISO} slot={title} items={bucketItems}
          capacity={capacity} conflicts={detectConflicts(bucketItems)}
          teams={teams} cartEligibleIds={cartEligibleIds} dragging={dragging} setDragging={setDragging}
          tapSelected={tapSelected} setTapSelected={setTapSelected}
          onDrop={onDrop} onUnschedule={onUnschedule} />
      </div>
      {hours.map(h => {
        const items = cellDeliveries(dateISO, h);
        const displayH = parseInt(h) % 12 || 12;
        return (
          <div key={h} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, marginBottom: 2, paddingLeft: 2 }}>
              {displayH}:00
            </div>
            <CalendarCell dateISO={dateISO} slot={h} items={items}
              capacity={capacity} conflicts={detectConflicts(items)}
              teams={teams} dragging={dragging} setDragging={setDragging}
              tapSelected={tapSelected} setTapSelected={setTapSelected}
              onDrop={onDrop} onUnschedule={onUnschedule} small />
          </div>
        );
      })}
    </div>
  );
}

// ── Calendar cell (drop target) ─────────────────────────────────────────────
function CalendarCell({ dateISO, slot, items, capacity, conflicts, teams, cartEligibleIds, dragging, setDragging, tapSelected, setTapSelected, onDrop, onUnschedule, tall, small }) {
  const [hover, setHover] = useState(false);
  const overCap = items.length > capacity;
  const hasConflict = conflicts.length > 0;
  const total = items.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const totalCarts = items.reduce((s, d) => s + (d.cartCount || 0), 0);

  const handleDrop = (e) => {
    e.preventDefault();
    setHover(false);
    if (dragging) onDrop(dateISO, slot, dragging);
  };

  const handleTap = () => {
    if (tapSelected) onDrop(dateISO, slot, tapSelected);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      onClick={handleTap}
      style={{
        minHeight: tall ? 140 : 80,
        background: hover ? "#e6f2d8" : overCap ? "#fde8e8" : hasConflict ? "#fff4e1" : "#fff",
        border: `1.5px ${hasConflict || overCap ? "solid" : "solid"} ${overCap ? RED : hasConflict ? AMBER : BORDER}`,
        borderRadius: 8, padding: 6,
        cursor: tapSelected ? "copy" : "default",
        display: "flex", flexDirection: "column", gap: 4,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, fontWeight: 800, color: overCap ? RED : hasConflict ? AMBER : "#7a8c74", letterSpacing: 0.5 }}>
        <span>{items.length}/{capacity}</span>
        <span style={{ display: "flex", gap: 4 }}>
          {totalCarts > 0 && <span>🛒{totalCarts}</span>}
          {total > 0 && <span>{fmtMoney(total)}</span>}
        </span>
      </div>
      {items.map(d => (
        <DeliveryChip key={d.id} delivery={d} team={teams.find(t => t.id === d.teamId)} conflict={conflicts.includes(d.truckId)} cartEligibleIds={cartEligibleIds} setDragging={setDragging} tapSelected={tapSelected} setTapSelected={setTapSelected} onUnschedule={onUnschedule} />
      ))}
      {hasConflict && (
        <div style={{ fontSize: 9, color: AMBER, fontWeight: 700, textAlign: "center", padding: "2px 0" }}>⚠ Truck conflict</div>
      )}
      {overCap && (
        <div style={{ fontSize: 9, color: RED, fontWeight: 700, textAlign: "center", padding: "2px 0" }}>⚠ Over capacity</div>
      )}
    </div>
  );
}

// ── Delivery chip (draggable) ───────────────────────────────────────────────
function DeliveryChip({ delivery: d, team, conflict, cartEligibleIds, setDragging, tapSelected, setTapSelected, onUnschedule }) {
  const [expanded, setExpanded] = useState(false);
  const pr = PRIORITY[d.priority || "normal"];
  const cust = d.customerSnapshot || {};
  const isSelected = tapSelected?.id === d.id;
  const name = cust.company_name || cust.companyName || "—";
  const carts = d.cartCount || 0;
  const cartEligible = (cartEligibleIds && cartEligibleIds.has(d.customerId)) || cust.allow_carts || cust.allowCarts;
  const addr = [cust.address1, cust.city, cust.state, cust.zip].filter(Boolean).join(", ");
  const phone = cust.phone;
  const isCOD = (cust.terms || "").toUpperCase().includes("C.O.D");

  return (
    <div
      draggable
      onDragStart={() => setDragging(d)}
      onDragEnd={() => setDragging(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (tapSelected) setTapSelected(isSelected ? null : d);
        else setExpanded(v => !v);
      }}
      style={{
        background: isSelected ? DARK : "#fff",
        color: isSelected ? CREAM : DARK,
        border: `1.5px solid ${conflict ? AMBER : (team?.color || pr.bg)}`,
        borderLeft: `4px solid ${team?.color || pr.bg}`,
        borderRadius: 6, padding: "5px 7px",
        cursor: "grab",
        overflow: "hidden",
      }}
      title={`${name} • ${fmtMoney(d.orderValueCents)}${carts ? ` • ${carts} carts` : ''}${cartEligible ? ' • cart-eligible' : ''}`}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 4 }}>
            {cartEligible && (
              <span title="Carts allowed" style={{
                background: "#4a7a35", color: "#fff", borderRadius: 4,
                padding: "1px 4px", fontSize: 9, fontWeight: 800, flexShrink: 0,
              }}>🛒</span>
            )}
            {isCOD && (
              <span style={{ background: "#c03030", color: "#fff", borderRadius: 4, padding: "1px 4px", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>COD</span>
            )}
            <span style={{ overflow: "hidden", textOverflow: expanded ? "clip" : "ellipsis", whiteSpace: expanded ? "normal" : "nowrap", wordBreak: expanded ? "break-word" : "normal" }}>{name}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, display: "flex", gap: 6, flexWrap: "wrap", marginTop: 1 }}>
            {d.orderValueCents > 0 && <span>{fmtMoney(d.orderValueCents)}</span>}
            {carts > 0 && <span style={{ color: isSelected ? GREEN : "#4a7a35", fontWeight: 800 }}>🛒 {carts}</span>}
            {d.deliveryTime && !/^(AM|PM)$/.test(d.deliveryTime) && <span>🕒 {d.deliveryTime}</span>}
          </div>
        </div>
        {onUnschedule && (
          <button
            onClick={(e) => { e.stopPropagation(); onUnschedule(d); }}
            title="Move back to unscheduled"
            style={{ background: "none", border: "none", color: isSelected ? CREAM : "#7a8c74", fontSize: 12, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}>
            ↩
          </button>
        )}
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${isSelected ? GREEN + "66" : "#e0ead8"}`, fontSize: 10, lineHeight: 1.5 }}
          onClick={e => e.stopPropagation()}>
          {addr && <div><b>📍</b> {addr}</div>}
          {phone && <div><b>📞</b> <a href={`tel:${phone}`} style={{ color: "inherit", textDecoration: "underline" }}>{phone}</a></div>}
          {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && <div><b>#</b> {d.orderNumbers.join(", ")}</div>}
          {d.miles != null && <div><b>🧭</b> {d.miles} mi / {d.driveMinutes || "?"} min</div>}
          {d.notes && <div style={{ fontStyle: "italic", marginTop: 3 }}>📝 {d.notes}</div>}
          {d.status === "delivered" && d.deliveredAt && (
            <div style={{ color: "#4a7a35", fontWeight: 800, marginTop: 3 }}>✓ Delivered</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Unscheduled drawer ──────────────────────────────────────────────────────
function UnscheduledDrawer({ items, teams, setDragging, tapSelected, setTapSelected, onOpen, compact }) {
  if (items.length === 0) return null;
  // Sort by delivery_date ascending
  const sorted = [...items].sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  const total = sorted.reduce((s, d) => s + (d.orderValueCents || 0), 0);

  return (
    <div style={{ marginTop: compact ? 0 : 20, marginBottom: compact ? 14 : 0, background: "#fff", borderRadius: 12, border: `1.5px dashed ${BORDER}`, padding: compact ? 10 : 14, maxHeight: compact ? 220 : undefined, overflowY: compact ? "auto" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1 }}>
          Unscheduled this week ({items.length})
        </div>
        {total > 0 && <div style={{ fontSize: 12, color: "#7a8c74", fontWeight: 700 }}>{fmtMoney(total)} total</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map(d => {
          const team = teams.find(t => t.id === d.teamId);
          const pr = PRIORITY[d.priority || "normal"];
          const dateLabel = d.deliveryDate
            ? new Date(d.deliveryDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            : "— no date —";
          const isSelected = tapSelected?.id === d.id;
          return (
            <div key={d.id}
              draggable
              onDragStart={() => setDragging(d)}
              onDragEnd={() => setDragging(null)}
              style={{
                background: isSelected ? DARK : "#fafcf8",
                color: isSelected ? CREAM : DARK,
                border: `1.5px solid ${BORDER}`,
                borderLeft: `4px solid ${team?.color || pr.bg}`,
                borderRadius: 10, padding: "10px 12px",
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                cursor: "grab",
              }}>
              <div style={{ flex: "0 0 auto", background: isSelected ? "#2a3a2a" : "#f2f5ef", color: isSelected ? CREAM : DARK, borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 800, minWidth: 86, textAlign: "center" }}>
                {dateLabel}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {d.customerSnapshot?.company_name || "—"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75 }}>
                  {[d.customerSnapshot?.city, d.customerSnapshot?.state].filter(Boolean).join(", ")}
                  {d.orderValueCents > 0 && <> • {fmtMoney(d.orderValueCents)}</>}
                </div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, background: pr.bg, color: "#fff", borderRadius: 999, padding: "3px 8px" }}>{pr.label}</span>
              <button onClick={(e) => { e.stopPropagation(); setTapSelected(isSelected ? null : d); }}
                style={{ background: isSelected ? GREEN : "#fff", color: DARK, border: `1.5px solid ${GREEN}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {isSelected ? "Cancel" : "Move"}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onOpen(d); }}
                style={{ background: "#fff", color: "#7a8c74", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Details
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Delivery detail modal ───────────────────────────────────────────────────
function DeliveryDetailModal({ delivery: d, teams, trucks, onClose, onDelete }) {
  const c = d.customerSnapshot || {};
  const team = teams.find(t => t.id === d.teamId);
  const truck = trucks.find(t => t.id === d.truckId);
  const pr = PRIORITY[d.priority || "normal"];
  const addr = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
  const dateLabel = d.deliveryDate
    ? new Date(d.deliveryDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
    : "— no date —";

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ background: DARK, color: CREAM, padding: "18px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>{dateLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", marginTop: 2 }}>{c.company_name || "—"}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, fontWeight: 800, background: pr.bg, color: "#fff", borderRadius: 999, padding: "3px 10px" }}>{pr.label}</span>
              {team && <span style={{ fontSize: 10, fontWeight: 800, background: team.color || GREEN, color: "#fff", borderRadius: 999, padding: "3px 10px" }}>{team.name}</span>}
              {(c.terms || "").toUpperCase().includes("C.O.D") && <span style={{ fontSize: 10, fontWeight: 800, background: "#c03030", color: "#fff", borderRadius: 999, padding: "3px 10px" }}>COD</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: CREAM, fontSize: 26, cursor: "pointer", padding: 0 }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          {c.care_of && <DetailRow label="Contact" value={c.care_of} />}
          {addr && (
            <DetailRow label="Address" value={
              <div>
                <div>{c.address1}</div>
                <div>{[c.city, c.state, c.zip].filter(Boolean).join(", ")}</div>
              </div>
            } />
          )}
          {c.phone && <DetailRow label="Phone" value={<a href={`tel:${c.phone}`} style={{ color: DARK, fontWeight: 700, textDecoration: "none" }}>{c.phone}</a>} />}
          {c.email && <DetailRow label="Email" value={c.email} />}
          {c.terms && <DetailRow label="Terms" value={c.terms} />}
          <DetailRow label="Order value" value={<b>{fmtMoney(d.orderValueCents)}</b>} />
          {d.deliveryTime && <DetailRow label="Time slot" value={d.deliveryTime} />}
          {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && <DetailRow label="Order numbers" value={d.orderNumbers.join(", ")} />}
          {truck && <DetailRow label="Truck" value={truck.name} />}
          {d.miles != null && <DetailRow label="Distance" value={`${d.miles} mi • ~${d.driveMinutes || "?"} min`} />}
          {d.notes && <DetailRow label="Notes" value={<div style={{ whiteSpace: "pre-wrap", fontStyle: "italic" }}>{d.notes}</div>} />}
          {d.createdBy && <DetailRow label="Created by" value={d.createdBy} />}

          {onDelete && (
            <button onClick={onDelete}
              style={{ width: "100%", marginTop: 10, padding: "14px 0", borderRadius: 10, border: `1.5px solid #d94f3d`, background: "#fff", color: "#d94f3d", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              🗑 Delete Delivery
            </button>
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
