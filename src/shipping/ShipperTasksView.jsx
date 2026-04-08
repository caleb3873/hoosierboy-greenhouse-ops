import { useMemo, useEffect, useState } from "react";
import { useDeliveries } from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";

// Shippers run Mon–Sat. Sunday is skipped.
const SHIP_DAYS = [
  { idx: 1, label: "Monday" },
  { idx: 2, label: "Tuesday" },
  { idx: 3, label: "Wednesday" },
  { idx: 4, label: "Thursday" },
  { idx: 5, label: "Friday" },
  { idx: 6, label: "Saturday" },
];

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, flex: 3 };
const PRIORITY_STYLE = {
  critical: { bg: "#d94f3d", color: "#fff", label: "CRITICAL" },
  high:     { bg: "#e89a3a", color: "#fff", label: "HIGH" },
  normal:   { bg: "#7fb069", color: "#1e2d1a", label: "NORMAL" },
  flex:     { bg: "#9cb894", color: "#1e2d1a", label: "FLEX" },
};

// Monday of the current week (used to anchor day slots)
function getWeekMondayISO(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dateForWeekday(mondayDate, weekdayIdx) {
  // weekdayIdx: 1=Mon, 2=Tue, ..., 6=Sat
  const offset = weekdayIdx - 1;
  const d = new Date(mondayDate);
  d.setDate(d.getDate() + offset);
  return d;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function formatCurrency(cents) {
  if (!cents && cents !== 0) return "";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ShipperTasksView({ onSwitchMode }) {
  const { rows: deliveries, upsert, refresh } = useDeliveries();
  const { displayName } = useAuth();

  const monday = useMemo(() => getWeekMondayISO(), []);
  const todayISO = toISODate(new Date());

  // Slot each delivery into a weekday bucket — include delivered so they can be un-checked
  const byDay = useMemo(() => {
    const buckets = Object.fromEntries(SHIP_DAYS.map(d => [d.idx, []]));
    for (const del of deliveries) {
      if (!del.deliveryDate) continue;
      const d = new Date(del.deliveryDate + "T00:00:00");
      const weekdayIdx = d.getDay();
      const thisWeek = d >= monday && d < new Date(monday.getTime() + 7 * 86400000);
      if (!thisWeek) continue;
      if (weekdayIdx === 0) continue; // skip Sundays
      if (buckets[weekdayIdx]) buckets[weekdayIdx].push(del);
    }
    // Sort: pending first (by priority → $), then delivered at the bottom
    for (const k of Object.keys(buckets)) {
      buckets[k].sort((a, b) => {
        const doneA = a.status === "delivered" ? 1 : 0;
        const doneB = b.status === "delivered" ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        const pa = PRIORITY_ORDER[a.priority || "normal"] ?? 9;
        const pb = PRIORITY_ORDER[b.priority || "normal"] ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.orderValueCents || 0) - (a.orderValueCents || 0);
      });
    }
    return buckets;
  }, [deliveries, monday]);

  // Carryover: any delivery in the past this week that isn't delivered → bump to today
  useEffect(() => {
    if (!deliveries.length) return;
    const stale = deliveries.filter(d =>
      d.status !== "delivered" &&
      d.deliveryDate &&
      d.deliveryDate < todayISO &&
      new Date(d.deliveryDate) >= monday // only carry within current week
    );
    stale.forEach(d => {
      upsert({ ...d, deliveryDate: todayISO, status: d.status === "draft" ? "scheduled" : d.status });
    });
  }, [deliveries.length]); // eslint-disable-line

  async function toggleComplete(del) {
    const done = del.status === "delivered";
    await upsert({
      ...del,
      status: done ? "scheduled" : "delivered",
      deliveredAt: done ? null : new Date().toISOString(),
      deliveredBy: done ? null : (displayName || "Shipper"),
    });
    refresh();
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: DARK, color: "#fff", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "16px 16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Hi {displayName}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif" }}>Shipping Week</div>
        </div>
        <button onClick={onSwitchMode}
          style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}>
          Sign out
        </button>
      </div>

      <div style={{ padding: "12px 12px 0" }}>
        {SHIP_DAYS.map(day => {
          const items = byDay[day.idx] || [];
          const date = dateForWeekday(monday, day.idx);
          const isToday = toISODate(date) === todayISO;
          const totalValue = items.reduce((sum, d) => sum + (d.orderValueCents || 0), 0);
          return (
            <div key={day.idx} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px 10px" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: isToday ? GREEN : CREAM, textTransform: "uppercase", letterSpacing: 1.2 }}>
                  {day.label}
                  {isToday && <span style={{ marginLeft: 8, fontSize: 10, background: GREEN, color: DARK, borderRadius: 999, padding: "2px 8px" }}>TODAY</span>}
                </div>
                <div style={{ flex: 1, height: 2, background: `${GREEN}55`, borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>
                  {items.length} {items.length === 1 ? "order" : "orders"}
                  {totalValue > 0 && ` • ${formatCurrency(totalValue)}`}
                </span>
              </div>

              {items.length === 0 ? (
                <div style={{ background: "#263821", border: `1px dashed ${GREEN}44`, borderRadius: 10, padding: 16, textAlign: "center", fontSize: 12, color: "#6a8a5a" }}>
                  No orders scheduled
                </div>
              ) : (
                items.map((del, idx) => <DeliveryCard key={del.id} delivery={del} rank={idx + 1} onToggle={() => toggleComplete(del)} />)
              )}
            </div>
          );
        })}

        {deliveries.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6a8a5a" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No deliveries scheduled this week</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Tyler and the sales team will add them here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeliveryCard({ delivery: d, rank, onToggle }) {
  const done = d.status === "delivered";
  const priorityStyle = PRIORITY_STYLE[d.priority || "normal"];
  const customer = d.customerSnapshot || {};
  const name = customer.company_name || customer.companyName || "—";
  const city = customer.city || "";
  const time = d.deliveryTime || "";

  return (
    <div onClick={onToggle}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        background: done ? "#1c2a18" : "#263821",
        border: `1px solid ${done ? GREEN : GREEN + "44"}`,
        borderRadius: 10, padding: 14, marginBottom: 10, cursor: "pointer",
        opacity: done ? 0.55 : 1,
      }}>
      <div style={{
        width: 32, height: 32, minWidth: 32, borderRadius: 8,
        border: `2px solid ${GREEN}`,
        background: done ? GREEN : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: DARK, fontSize: 18, fontWeight: 800,
      }}>
        {done ? "✓" : rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: CREAM, textDecoration: done ? "line-through" : "none" }}>
            {name}
          </div>
          {done && <span style={{ fontSize: 9, fontWeight: 800, background: "#4a7a35", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>DELIVERED</span>}
          <span style={{ fontSize: 9, fontWeight: 800, background: priorityStyle.bg, color: priorityStyle.color, borderRadius: 999, padding: "2px 8px" }}>
            {priorityStyle.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#9cb894", marginTop: 2 }}>
          {city}
          {time && <> • 🕒 {time}</>}
          {d.orderValueCents > 0 && <> • <b style={{ color: CREAM }}>{formatCurrency(d.orderValueCents)}</b></>}
        </div>
        {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && (
          <div style={{ fontSize: 11, color: "#6a8a5a", marginTop: 4 }}>
            Orders: {d.orderNumbers.join(", ")}
          </div>
        )}
        {d.notes && <div style={{ fontSize: 12, color: "#9cb894", marginTop: 4, fontStyle: "italic" }}>{d.notes}</div>}
      </div>
    </div>
  );
}
