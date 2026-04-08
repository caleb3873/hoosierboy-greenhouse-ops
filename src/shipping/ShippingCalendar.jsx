import { useMemo, useState, Fragment } from "react";
import { useDeliveries, useTrucks, useShippingTeams } from "../supabase";

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
  const { rows: deliveries, update } = useDeliveries();
  const { rows: trucks } = useTrucks();
  const { rows: teams }  = useShippingTeams();

  const [mode, setMode] = useState("week"); // week | day
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset]   = useState(0);
  const [dragging, setDragging]     = useState(null);
  const [tapSelected, setTapSelected] = useState(null);

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

      {mode === "week" ? (
        <WeekGrid
          weekDays={weekDays}
          deliveries={deliveries}
          cellDeliveries={cellDeliveries}
          detectConflicts={detectConflicts}
          capacity={capacity}
          teams={teams}
          dragging={dragging}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onDrop={(iso, slot, delivery) => moveDelivery(delivery, iso, slot)}
          onDrillDown={() => { setMode("day"); }}
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
          dragging={dragging}
          setDragging={setDragging}
          tapSelected={tapSelected}
          setTapSelected={setTapSelected}
          onDrop={(iso, slot, delivery) => moveDelivery(delivery, iso, slot)}
        />
      )}

      {/* Unscheduled drawer */}
      <UnscheduledDrawer
        items={unscheduledForWeek()}
        teams={teams}
        setDragging={setDragging}
        tapSelected={tapSelected}
        setTapSelected={setTapSelected}
        onDrop={(delivery) => moveDelivery(delivery, delivery.deliveryDate, null)}
      />
    </div>
  );
}

const navBtnStyle = { background: "#f2f5ef", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" };

// ── Week grid ───────────────────────────────────────────────────────────────
function WeekGrid({ weekDays, cellDeliveries, detectConflicts, capacity, teams, dragging, setDragging, tapSelected, setTapSelected, onDrop }) {
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
          teams={teams} dragging={dragging} setDragging={setDragging}
          tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} />;
      })}

      {/* PM row */}
      <SlotLabel label="PM" />
      {weekDays.map(d => {
        const items = cellDeliveries(d.iso, "PM");
        return <CalendarCell key={`${d.iso}-PM`} dateISO={d.iso} slot="PM"
          items={items} capacity={capacity} conflicts={detectConflicts(items)}
          teams={teams} dragging={dragging} setDragging={setDragging}
          tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} />;
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

// ── Day grid (hours) ────────────────────────────────────────────────────────
const DAY_HOURS = ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"];

function DayGrid({ dateISO, dateLabel, cellDeliveries, detectConflicts, capacity, teams, dragging, setDragging, tapSelected, setTapSelected, onDrop }) {
  // AM/PM bucket items shown above, then hour rows
  const amItems = cellDeliveries(dateISO, "AM");
  const pmItems = cellDeliveries(dateISO, "PM");
  return (
    <div>
      {/* Quick AM/PM buckets at top */}
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 4, marginBottom: 8 }}>
        <div />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textAlign: "center", padding: 4 }}>AM BUCKET</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textAlign: "center", padding: 4 }}>PM BUCKET</div>
        <SlotLabel label="bucket" />
        <CalendarCell dateISO={dateISO} slot="AM" items={amItems.filter(d => parseSlot(d.deliveryTime) === "AM")} capacity={capacity} conflicts={detectConflicts(amItems)} teams={teams} dragging={dragging} setDragging={setDragging} tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} tall />
        <CalendarCell dateISO={dateISO} slot="PM" items={pmItems.filter(d => parseSlot(d.deliveryTime) === "PM")} capacity={capacity} conflicts={detectConflicts(pmItems)} teams={teams} dragging={dragging} setDragging={setDragging} tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} tall />
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, margin: "14px 4px 6px" }}>Specific hours</div>
      <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 4 }}>
        {DAY_HOURS.map(h => {
          const items = cellDeliveries(dateISO, h);
          const displayH = parseInt(h) % 12 || 12;
          const ampm = parseInt(h) < 12 ? "AM" : "PM";
          return (
            <Fragment key={h}>
              <div style={{ background: "#f2f5ef", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#7a8c74", minHeight: 58 }}>
                {displayH}{ampm.toLowerCase()}
              </div>
              <CalendarCell dateISO={dateISO} slot={h} items={items} capacity={capacity} conflicts={detectConflicts(items)} teams={teams} dragging={dragging} setDragging={setDragging} tapSelected={tapSelected} setTapSelected={setTapSelected} onDrop={onDrop} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar cell (drop target) ─────────────────────────────────────────────
function CalendarCell({ dateISO, slot, items, capacity, conflicts, teams, dragging, setDragging, tapSelected, setTapSelected, onDrop, tall }) {
  const [hover, setHover] = useState(false);
  const overCap = items.length > capacity;
  const hasConflict = conflicts.length > 0;
  const total = items.reduce((s, d) => s + (d.orderValueCents || 0), 0);

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
        <span>{total > 0 ? fmtMoney(total) : ""}</span>
      </div>
      {items.map(d => (
        <DeliveryChip key={d.id} delivery={d} team={teams.find(t => t.id === d.teamId)} conflict={conflicts.includes(d.truckId)} setDragging={setDragging} tapSelected={tapSelected} setTapSelected={setTapSelected} />
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
function DeliveryChip({ delivery: d, team, conflict, setDragging, tapSelected, setTapSelected }) {
  const pr = PRIORITY[d.priority || "normal"];
  const cust = d.customerSnapshot || {};
  const isSelected = tapSelected?.id === d.id;
  const name = cust.company_name || "—";

  return (
    <div
      draggable
      onDragStart={() => setDragging(d)}
      onDragEnd={() => setDragging(null)}
      onClick={(e) => { e.stopPropagation(); setTapSelected(isSelected ? null : d); }}
      style={{
        background: isSelected ? DARK : "#fff",
        color: isSelected ? CREAM : DARK,
        border: `1.5px solid ${conflict ? AMBER : (team?.color || pr.bg)}`,
        borderLeft: `4px solid ${team?.color || pr.bg}`,
        borderRadius: 6, padding: "4px 6px",
        fontSize: 10, fontWeight: 700, cursor: "grab",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
      title={`${name} • ${fmtMoney(d.orderValueCents)}${d.truckId ? ' • has truck' : ''}`}>
      {name}
      {d.orderValueCents > 0 && <span style={{ marginLeft: 4, opacity: 0.7, fontWeight: 500 }}>{fmtMoney(d.orderValueCents)}</span>}
    </div>
  );
}

// ── Unscheduled drawer ──────────────────────────────────────────────────────
function UnscheduledDrawer({ items, teams, setDragging, tapSelected, setTapSelected, onDrop }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 20, background: "#fff", borderRadius: 12, border: `1.5px dashed ${BORDER}`, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        Unscheduled this week ({items.length})
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {items.map(d => (
          <div key={d.id}
            draggable
            onDragStart={() => setDragging(d)}
            onDragEnd={() => setDragging(null)}
            onClick={() => setTapSelected(tapSelected?.id === d.id ? null : d)}
            style={{
              background: tapSelected?.id === d.id ? DARK : "#f2f5ef",
              color: tapSelected?.id === d.id ? CREAM : DARK,
              border: `1.5px solid ${BORDER}`,
              borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700,
              cursor: "grab",
            }}>
            {d.customerSnapshot?.company_name || "—"}
            {d.orderValueCents > 0 && <span style={{ marginLeft: 6, opacity: 0.7 }}>{fmtMoney(d.orderValueCents)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
