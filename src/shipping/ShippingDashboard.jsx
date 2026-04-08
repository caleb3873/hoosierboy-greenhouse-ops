import { useMemo, useState } from "react";
import {
  useDeliveries,
  useDrivers,
  useTrucks,
  useDriverAttendance,
  useDeliveryClaims,
  useFuelFills,
  useShippingTeams,
  useEmployeeAttendance,
} from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const BORDER = "#e0ead8";

const AMBER_BADGE = "#e89a3a";

const PRIORITY = {
  critical: { label: "CRITICAL", bg: "#d94f3d", color: "#fff", rank: 0 },
  high:     { label: "HIGH",     bg: "#e89a3a", color: "#fff", rank: 1 },
  normal:   { label: "NORMAL",   bg: "#7fb069", color: "#1e2d1a", rank: 2 },
  flex:     { label: "FLEX",     bg: "#9cb894", color: "#1e2d1a", rank: 3 },
};

function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function formatCurrency(cents) {
  if (!cents && cents !== 0) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ShippingDashboard() {
  const { rows: deliveries, update: updateDelivery, upsert: upsertDelivery, refresh: refreshDeliveries } = useDeliveries();
  const { rows: drivers } = useDrivers();
  const { rows: trucks } = useTrucks();
  const { rows: teams }  = useShippingTeams();
  const { rows: employeeAttendance, upsert: upsertEmpAttendance } = useEmployeeAttendance();
  const { rows: attendance, upsert: upsertAttendance } = useDriverAttendance();
  const { rows: claims } = useDeliveryClaims();
  const { rows: fuelFills, insert: insertFuel } = useFuelFills();
  const { user } = useAuth();

  const [dateOffset, setDateOffset] = useState(0);
  const [showFuel, setShowFuel] = useState(false);

  const activeDate = useMemo(() => addDays(new Date(), dateOffset), [dateOffset]);
  const activeDateISO = toISODate(activeDate);
  const activeDateLabel = activeDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const isToday = dateOffset === 0;

  // Drivers present today (default all active drivers present; toggle off to mark absent)
  const presentMap = useMemo(() => {
    const m = new Map();
    for (const a of attendance) {
      if (a.attendanceDate === activeDateISO) m.set(a.driverId, a.present);
    }
    return m;
  }, [attendance, activeDateISO]);

  const activeDrivers = drivers.filter(d => d.active);
  const weekdayId = ["sun","mon","tue","wed","thu","fri","sat"][activeDate.getDay()];

  // Default present = listed on weekly availability (or no availability set = always available)
  // Manual attendance toggle overrides (Tyler can force-present an emergency driver or mark someone absent)
  function effectivePresent(driver) {
    const override = presentMap.get(driver.id);
    if (override === true) return true;
    if (override === false) return false;
    if (!driver.availableDays || driver.availableDays.length === 0) return true;
    return driver.availableDays.includes(weekdayId);
  }

  const presentDrivers = activeDrivers.filter(effectivePresent);

  const dayDeliveries = useMemo(() => {
    return deliveries
      .filter(d => d.deliveryDate === activeDateISO)
      .sort((a, b) => {
        const stopA = a.stopOrder ?? 999;
        const stopB = b.stopOrder ?? 999;
        if (stopA !== stopB) return stopA - stopB;
        const pa = PRIORITY[a.priority || "normal"]?.rank ?? 9;
        const pb = PRIORITY[b.priority || "normal"]?.rank ?? 9;
        if (pa !== pb) return pa - pb;
        return (b.orderValueCents || 0) - (a.orderValueCents || 0);
      });
  }, [deliveries, activeDateISO]);

  const unassigned = dayDeliveries.filter(d => !d.driverId);
  const byDriver = useMemo(() => {
    const m = new Map();
    for (const d of dayDeliveries) {
      if (!d.driverId) continue;
      if (!m.has(d.driverId)) m.set(d.driverId, []);
      m.get(d.driverId).push(d);
    }
    return m;
  }, [dayDeliveries]);

  const totalValue = dayDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const deliveredCount = dayDeliveries.filter(d => d.status === "delivered").length;
  const openClaims = claims.filter(c => !c.resolved);

  // Extra context: overdue, upcoming this week, next week preview
  const overdue = useMemo(() => {
    return deliveries
      .filter(d => d.deliveryDate && d.deliveryDate < activeDateISO && d.status !== "delivered")
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  }, [deliveries, activeDateISO]);

  const upcomingDays = useMemo(() => {
    const horizon = toISODate(addDays(new Date(activeDateISO + "T00:00:00"), 14));
    return deliveries
      .filter(d => d.deliveryDate > activeDateISO && d.deliveryDate < horizon && d.status !== "delivered")
      .sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || ""));
  }, [deliveries, activeDateISO]);

  async function assignDriver(delivery, driverId) {
    const lane = dayDeliveries.filter(d => d.driverId === driverId);
    const nextStopOrder = lane.length ? Math.max(...lane.map(l => l.stopOrder || 0)) + 1 : 1;
    await updateDelivery(delivery.id, {
      driverId,
      stopOrder: driverId ? nextStopOrder : 0,
      assignedBy: user?.email || "tyler",
    });
  }

  async function assignTeam(delivery, teamId) {
    await updateDelivery(delivery.id, { teamId, assignedBy: user?.email || "tyler" });
  }

  async function assignTruck(delivery, truckId) {
    await updateDelivery(delivery.id, { truckId, assignedBy: user?.email || "tyler" });
  }

  async function moveToDate(delivery, date) {
    await updateDelivery(delivery.id, { deliveryDate: date });
  }

  async function moveStop(delivery, dir) {
    const lane = byDriver.get(delivery.driverId) || [];
    const idx = lane.findIndex(d => d.id === delivery.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= lane.length) return;
    const other = lane[swapIdx];
    await updateDelivery(delivery.id, { stopOrder: other.stopOrder });
    await updateDelivery(other.id, { stopOrder: delivery.stopOrder });
  }

  // Employee attendance (for team roster)
  const empPresentMap = useMemo(() => {
    const m = new Map();
    for (const a of employeeAttendance) {
      if (a.attendanceDate === activeDateISO) m.set(a.employeeName, a.present);
    }
    return m;
  }, [employeeAttendance, activeDateISO]);

  async function toggleEmpAttendance(name) {
    const existing = employeeAttendance.find(a => a.employeeName === name && a.attendanceDate === activeDateISO);
    const currentlyPresent = existing ? existing.present : true;
    await upsertEmpAttendance({
      id: existing?.id || crypto.randomUUID(),
      employeeName: name,
      attendanceDate: activeDateISO,
      present: !currentlyPresent,
    });
  }

  async function toggleAttendance(driver) {
    const existing = attendance.find(a => a.driverId === driver.id && a.attendanceDate === activeDateISO);
    const currentlyPresent = existing ? existing.present : true;
    await upsertAttendance({
      id: existing?.id || crypto.randomUUID(),
      driverId: driver.id,
      attendanceDate: activeDateISO,
      present: !currentlyPresent,
    });
  }

  async function computeRoutes() {
    const missing = deliveries.filter(d => d.deliveryDate === activeDateISO && d.miles == null && d.customerSnapshot);
    for (const del of missing) {
      const c = del.customerSnapshot || {};
      const destination = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
      if (!destination) continue;
      try {
        const r = await fetch("/api/shipping-distance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination }) });
        if (!r.ok) continue;
        const { miles, minutes } = await r.json();
        await updateDelivery(del.id, { miles, driveMinutes: minutes });
      } catch {}
    }
    refreshDeliveries();
  }

  async function saveFuelFill(form) {
    await insertFuel({
      fillDate: form.date,
      gallons: parseFloat(form.gallons) || 0,
      totalCostCents: Math.round((parseFloat(form.cost) || 0) * 100),
      supplier: form.supplier || "Browns Oil Service",
      truckId: form.truckId || null,
      enteredBy: user?.email || "tyler",
      notes: form.notes || null,
    });
    setShowFuel(false);
  }

  const costPerMile = useMemo(() => {
    if (!fuelFills.length) return null;
    const totalCost = fuelFills.reduce((s, f) => s + (f.totalCostCents || 0), 0);
    const totalGal  = fuelFills.reduce((s, f) => s + (Number(f.gallons) || 0), 0);
    if (!totalGal) return null;
    const cpg = totalCost / totalGal; // cents per gallon
    const fleetMpg = trucks.filter(t => t.active).reduce((s, t) => s + (Number(t.mpg) || 8), 0) / Math.max(1, trucks.filter(t => t.active).length);
    if (!fleetMpg) return null;
    return cpg / fleetMpg; // cents per mile
  }, [fuelFills, trucks]);

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>
            Dashboard
          </div>
          <div style={{ fontSize: 14, color: "#7a8c74" }}>Tyler's control center</div>
        </div>
      </div>

      {/* Date selector */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => setDateOffset(o => o - 1)} style={{ background: "#f2f5ef", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>← Prev day</button>
        <div style={{ textAlign: "center", flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: isToday ? GREEN : DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {activeDateLabel}
            {isToday && <span style={{ marginLeft: 10, fontSize: 10, background: GREEN, color: DARK, borderRadius: 999, padding: "3px 10px", fontFamily: "'DM Sans',sans-serif" }}>TODAY</span>}
          </div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>
            {dayDeliveries.length} {dayDeliveries.length === 1 ? "delivery" : "deliveries"} • {formatCurrency(totalValue)} • {deliveredCount}/{dayDeliveries.length} delivered
            {!isToday && <button onClick={() => setDateOffset(0)} style={{ marginLeft: 8, background: "none", border: "none", color: GREEN, fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Today</button>}
          </div>
        </div>
        <button onClick={() => setDateOffset(o => o + 1)} style={{ background: "#f2f5ef", border: "none", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>Next day →</button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        <StatCard label="Total value" value={formatCurrency(totalValue)} />
        <StatCard label="Unassigned" value={unassigned.length} highlight={unassigned.length > 0 ? "#d94f3d" : null} />
        <StatCard label="Open claims" value={openClaims.length} highlight={openClaims.length > 0 ? "#d94f3d" : null} />
        <StatCard label="Cost per mile" value={costPerMile ? formatCurrency(costPerMile) : "—"} />
      </div>

      {/* Driver attendance strip */}
      <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1 }}>Drivers today</div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>{presentDrivers.length} / {activeDrivers.length} present</div>
        </div>
        {activeDrivers.length === 0 ? (
          <div style={{ fontSize: 13, color: "#7a8c74", padding: "8px 0" }}>
            No drivers yet — add them in the <b>Drivers</b> tab.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activeDrivers.map(d => {
              const present = effectivePresent(d);
              const hasSchedule = d.availableDays && d.availableDays.length > 0;
              const scheduledToday = hasSchedule && d.availableDays.includes(weekdayId);
              const override = presentMap.get(d.id);
              const isOverride = override !== undefined;
              return (
                <div key={d.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: present ? "#f0f8eb" : "#f5f5f5",
                  border: `1.5px solid ${present ? GREEN : "#c8c8c8"}`,
                  borderRadius: 999, padding: "6px 12px 6px 10px",
                  opacity: present ? 1 : 0.5,
                }}
                title={isOverride ? "Manual override" : hasSchedule ? (scheduledToday ? "Scheduled for today" : "Not on weekly schedule") : "No weekly schedule"}>
                  <button onClick={() => toggleAttendance(d)}
                    style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", padding: 0 }}
                    title={present ? "Mark absent" : "Mark present (emergency)"}>
                    {present ? "✓" : "○"}
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: DARK, textDecoration: present ? "none" : "line-through" }}>{d.name}</span>
                  {!scheduledToday && !isOverride && hasSchedule && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74" }}>off</span>
                  )}
                  {isOverride && override === true && !scheduledToday && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: AMBER_BADGE, color: "#fff", borderRadius: 999, padding: "1px 6px" }}>EMERGENCY</span>
                  )}
                  {d.phone && (
                    <a href={`tel:${d.phone}`} title={`Call ${d.phone}`}
                      style={{ background: GREEN, color: DARK, borderRadius: "50%", width: 26, height: 26, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, textDecoration: "none" }}>
                      📞
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team roster */}
      {teams.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
            Team Roster
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {teams.filter(t => t.active !== false).map(team => {
              const teamDeliveries = dayDeliveries.filter(d => d.teamId === team.id);
              const teamValue = teamDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0);
              const delivered = teamDeliveries.filter(d => d.status === "delivered").length;
              const present = (team.members || []).filter(m => empPresentMap.get(m.name) !== false).length;
              const total = (team.members || []).length;
              return (
                <div key={team.id} style={{ background: "#fafcf8", borderRadius: 10, border: `1.5px solid ${BORDER}`, borderLeft: `4px solid ${team.color || GREEN}`, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>{team.name}</div>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textAlign: "right" }}>
                      {present}/{total} present
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 8 }}>
                    {teamDeliveries.length} {teamDeliveries.length === 1 ? "delivery" : "deliveries"}
                    {teamValue > 0 && ` • ${formatCurrency(teamValue)}`}
                    {teamDeliveries.length > 0 && ` • ${delivered}/${teamDeliveries.length} done`}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(team.members || []).length === 0 ? (
                      <span style={{ fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>No members</span>
                    ) : team.members.map((m, i) => {
                      const isPresent = empPresentMap.get(m.name) !== false;
                      return (
                        <button key={i} onClick={() => toggleEmpAttendance(m.name)}
                          title={isPresent ? "Tap to mark absent" : "Tap to mark present"}
                          style={{
                            background: isPresent ? "#f0f8eb" : "#f5f5f5",
                            color: isPresent ? DARK : "#a0a0a0",
                            border: `1px solid ${isPresent ? GREEN + "88" : "#c8c8c8"}`,
                            borderRadius: 999, padding: "4px 10px",
                            fontSize: 11, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit",
                            textDecoration: isPresent ? "none" : "line-through",
                            opacity: isPresent ? 1 : 0.65,
                          }}>
                          {isPresent ? "✓" : "✕"} {m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unassigned column */}
      <SectionHeader>Unassigned — no driver ({unassigned.length})</SectionHeader>
      {unassigned.length === 0 ? (
        <div style={{ background: "#f0f8eb", border: `1px dashed ${GREEN}`, borderRadius: 10, padding: 14, textAlign: "center", fontSize: 12, color: "#6a8a5a", marginBottom: 18 }}>
          All deliveries have a driver ✓
        </div>
      ) : (
        unassigned.map(d => (
          <DashDeliveryCard key={d.id} delivery={d}
            drivers={presentDrivers} teams={teams} trucks={trucks}
            onAssignDriver={driverId => assignDriver(d, driverId)}
            onAssignTeam={teamId => assignTeam(d, teamId)}
            onAssignTruck={truckId => assignTruck(d, truckId)}
            onMoveDate={date => moveToDate(d, date)}
          />
        ))
      )}

      {/* Driver lanes */}
      {presentDrivers.map(driver => {
        const lane = byDriver.get(driver.id) || [];
        if (lane.length === 0) return null;
        const laneValue = lane.reduce((s, d) => s + (d.orderValueCents || 0), 0);
        return (
          <div key={driver.id}>
            <SectionHeader>
              🚚 {driver.name} • {lane.length} {lane.length === 1 ? "stop" : "stops"} • {formatCurrency(laneValue)}
              {driver.phone && (
                <a href={`tel:${driver.phone}`} style={{ marginLeft: 8, background: GREEN, color: DARK, borderRadius: 6, padding: "2px 8px", fontSize: 11, textDecoration: "none", fontWeight: 700 }}>📞</a>
              )}
            </SectionHeader>
            {lane.map((d, idx) => (
              <DashDeliveryCard key={d.id} delivery={d} rank={idx + 1}
                drivers={presentDrivers} teams={teams} trucks={trucks}
                onAssignDriver={driverId => assignDriver(d, driverId)}
                onAssignTeam={teamId => assignTeam(d, teamId)}
                onAssignTruck={truckId => assignTruck(d, truckId)}
                onMoveDate={date => moveToDate(d, date)}
                onMoveUp={idx > 0 ? () => moveStop(d, "up") : null}
                onMoveDown={idx < lane.length - 1 ? () => moveStop(d, "down") : null}
              />
            ))}
          </div>
        );
      })}

      {dayDeliveries.length === 0 && overdue.length === 0 && upcomingDays.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Nothing scheduled</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Sales reps add deliveries in the <b>Schedule</b> tab.</div>
        </div>
      )}

      {/* Overdue — undelivered from prior days */}
      {overdue.length > 0 && (
        <>
          <SectionHeader>
            <span style={{ color: "#d94f3d" }}>⚠ Overdue — not delivered ({overdue.length})</span>
          </SectionHeader>
          {overdue.map(d => (
            <DashDeliveryCard key={d.id} delivery={d}
              drivers={presentDrivers} teams={teams} trucks={trucks}
              onAssignDriver={driverId => assignDriver(d, driverId)}
              onAssignTeam={teamId => assignTeam(d, teamId)}
              onAssignTruck={truckId => assignTruck(d, truckId)}
              onMoveDate={date => moveToDate(d, date)}
            />
          ))}
        </>
      )}

      {/* Upcoming days preview */}
      {upcomingDays.length > 0 && (
        <>
          <SectionHeader>Upcoming days ({upcomingDays.length})</SectionHeader>
          {[...new Set(upcomingDays.map(d => d.deliveryDate))].map(date => {
            const items = upcomingDays.filter(d => d.deliveryDate === date);
            const total = items.reduce((s, d) => s + (d.orderValueCents || 0), 0);
            const label = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
            return (
              <div key={date} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", margin: "8px 4px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{label}</span>
                  <div style={{ flex: 1, height: 1, background: BORDER }} />
                  <span>{items.length} • {formatCurrency(total)}</span>
                </div>
                {items.map(d => (
                  <DashDeliveryCard key={d.id} delivery={d}
                    drivers={presentDrivers} teams={teams} trucks={trucks}
                    onAssignDriver={driverId => assignDriver(d, driverId)}
                    onAssignTeam={teamId => assignTeam(d, teamId)}
                    onAssignTruck={truckId => assignTruck(d, truckId)}
                    onMoveDate={dt => moveToDate(d, dt)}
                  />
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* Route compute footer */}
      {dayDeliveries.some(d => d.miles == null) && (
        <button onClick={computeRoutes}
          style={{ marginTop: 16, padding: "12px 18px", borderRadius: 10, border: `1.5px solid ${GREEN}`, background: "#fff", color: DARK, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          🧭 Compute routes for this day
        </button>
      )}

      {/* Fuel entry footer */}
      <div style={{ marginTop: 24, padding: 16, background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1 }}>Fuel</div>
          <div style={{ fontSize: 14, color: DARK, marginTop: 4 }}>
            {fuelFills.length} fills logged
            {costPerMile && <> • {formatCurrency(costPerMile)}/mile</>}
          </div>
        </div>
        <button onClick={() => setShowFuel(true)}
          style={{ background: DARK, color: CREAM, border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Log Fuel Fill
        </button>
      </div>

      {showFuel && <FuelForm trucks={trucks} onSave={saveFuelFill} onCancel={() => setShowFuel(false)} />}
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${highlight || BORDER}`, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: highlight || DARK, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: DARK, textTransform: "uppercase", letterSpacing: 1, margin: "14px 4px 8px", display: "flex", alignItems: "center", gap: 6 }}>
      {children}
    </div>
  );
}

function DashDeliveryCard({ delivery: d, drivers, teams, trucks, rank,
  onAssignDriver, onAssignTeam, onAssignTruck, onMoveDate, onMoveUp, onMoveDown }) {
  const pr = PRIORITY[d.priority || "normal"];
  const cust = d.customerSnapshot || {};
  const isDelivered = d.status === "delivered";
  const addr = [cust.address1, cust.city, cust.state].filter(Boolean).join(", ");
  const team = teams.find(t => t.id === d.teamId);
  const selectStyle = { padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${BORDER}`, background: "#fff", color: DARK, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", outline: "none", minWidth: 120 };

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`,
      padding: 14, marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start",
      opacity: isDelivered ? 0.6 : 1,
      borderLeft: `4px solid ${team?.color || pr.bg}`,
    }}>
      {rank != null && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          {onMoveUp
            ? <button onClick={onMoveUp} style={{ background: "none", border: "none", color: "#7a8c74", cursor: "pointer", fontSize: 12, padding: 2 }}>▲</button>
            : <div style={{ width: 16, height: 16 }} />}
          <div style={{ background: DARK, color: CREAM, borderRadius: 999, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{rank}</div>
          {onMoveDown
            ? <button onClick={onMoveDown} style={{ background: "none", border: "none", color: "#7a8c74", cursor: "pointer", fontSize: 12, padding: 2 }}>▼</button>
            : <div style={{ width: 16, height: 16 }} />}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{cust.company_name || "—"}</div>
          <span style={{ fontSize: 9, fontWeight: 800, background: pr.bg, color: pr.color, borderRadius: 999, padding: "2px 8px" }}>{pr.label}</span>
          {team && <span style={{ fontSize: 9, fontWeight: 800, background: team.color || GREEN, color: "#fff", borderRadius: 999, padding: "2px 8px" }}>{team.name}</span>}
          {isDelivered && <span style={{ fontSize: 9, fontWeight: 800, background: "#4a7a35", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>DELIVERED</span>}
          {d.deliveryTime && <span style={{ fontSize: 11, color: "#7a8c74" }}>🕒 {d.deliveryTime}</span>}
          {(cust.terms || "").toUpperCase().includes("C.O.D") && <span style={{ fontSize: 9, fontWeight: 800, background: "#c03030", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>COD</span>}
        </div>
        <div style={{ fontSize: 11, color: "#7a8c74" }}>
          {addr} • <b style={{ color: DARK }}>{formatCurrency(d.orderValueCents)}</b>
          {d.miles != null && <> • {d.miles} mi / {d.driveMinutes || "?"} min</>}
        </div>
        {Array.isArray(d.orderNumbers) && d.orderNumbers.length > 0 && (
          <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>Orders: {d.orderNumbers.join(", ")}</div>
        )}
        {d.notes && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, fontStyle: "italic" }}>{d.notes}</div>}

        {/* Assignment row */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={d.driverId || ""} onChange={e => onAssignDriver(e.target.value || null)} style={selectStyle} title="Driver">
            <option value="">🚚 Driver…</option>
            {drivers.map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
          </select>
          <select value={d.teamId || ""} onChange={e => onAssignTeam(e.target.value || null)} style={selectStyle} title="Team (optional)">
            <option value="">👥 General (no team)</option>
            {teams.filter(t => t.active !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={d.truckId || ""} onChange={e => onAssignTruck(e.target.value || null)} style={selectStyle} title="Truck">
            <option value="">🚛 Truck…</option>
            {trucks.filter(t => t.active !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="date" value={d.deliveryDate || ""} onChange={e => onMoveDate(e.target.value)}
            title="Move to a different day"
            style={{ ...selectStyle, minWidth: 130, paddingRight: 4 }} />
        </div>
      </div>
    </div>
  );
}

function FuelForm({ trucks, onSave, onCancel }) {
  const [form, setForm] = useState({
    date: toISODate(new Date()),
    gallons: "",
    cost: "",
    supplier: "Browns Oil Service",
    truckId: "",
    notes: "",
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const canSave = form.gallons && form.cost && form.date;

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          Log Fuel Fill
        </div>
        <FuelField label="Date" type="date" value={form.date} onChange={v => upd("date", v)} />
        <FuelField label="Gallons" type="number" value={form.gallons} onChange={v => upd("gallons", v)} placeholder="80" />
        <FuelField label="Total Cost ($)" type="number" value={form.cost} onChange={v => upd("cost", v)} placeholder="320.50" />
        <FuelField label="Supplier" value={form.supplier} onChange={v => upd("supplier", v)} />
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Truck (optional)</div>
          <select value={form.truckId} onChange={e => upd("truckId", e.target.value)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", background: "#fff" }}>
            <option value="">— All trucks / bulk tank —</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <FuelField label="Notes" value={form.notes} onChange={v => upd("notes", v)} multiline />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={!canSave}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: canSave ? DARK : "#c8d8c0", color: CREAM, fontSize: 14, fontWeight: 800, cursor: canSave ? "pointer" : "default", fontFamily: "inherit" }}>
            Save Fill
          </button>
        </div>
      </div>
    </div>
  );
}

function FuelField({ label, value, onChange, type, placeholder, multiline }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <Tag type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", minHeight: multiline ? 60 : undefined, resize: multiline ? "vertical" : undefined }} />
    </div>
  );
}
