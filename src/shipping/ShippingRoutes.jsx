import { useMemo, useState } from "react";
import { useShippingRoutes, useDeliveries, useDrivers, useTrucks } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function weekMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${Math.round(c / 100).toLocaleString()}`; }

const STATUS_COLORS = {
  planned: { bg: "#f2f5ef", border: BORDER, text: MUTED },
  active: { bg: "#e8f5e0", border: GREEN, text: DARK },
  completed: { bg: "#f0f0f0", border: "#ccc", text: "#666" },
};

export default function ShippingRoutes() {
  const { rows: routes, update: updateRoute, remove: removeRoute } = useShippingRoutes();
  const { rows: deliveries, update: updateDelivery } = useDeliveries();
  const { rows: drivers } = useDrivers();
  const { rows: trucks } = useTrucks();

  const [startDate, setStartDate] = useState(() => toISODate(weekMonday()));
  const [endDate, setEndDate] = useState(() => toISODate(addDays(weekMonday(), 6)));
  const [expandedId, setExpandedId] = useState(null);

  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      if (!r.deliveryDate) return false;
      return r.deliveryDate >= startDate && r.deliveryDate <= endDate;
    }).sort((a, b) => (a.deliveryDate || "").localeCompare(b.deliveryDate || "") || (a.name || "").localeCompare(b.name || ""));
  }, [routes, startDate, endDate]);

  // Map route deliveries
  const deliveriesByRoute = useMemo(() => {
    const map = new Map();
    for (const d of deliveries) {
      if (!d.routeId) continue;
      if (!map.has(d.routeId)) map.set(d.routeId, []);
      map.get(d.routeId).push(d);
    }
    // Sort each group by stopOrder
    for (const [, arr] of map) {
      arr.sort((a, b) => (a.stopOrder || 999) - (b.stopOrder || 999));
    }
    return map;
  }, [deliveries]);

  async function setStatus(routeId, status) {
    await updateRoute(routeId, { status });
  }

  async function deleteRoute(routeId) {
    if (!window.confirm("Delete this route? Deliveries will be unlinked but not deleted.")) return;
    // Unlink all deliveries
    const routeDelivs = deliveriesByRoute.get(routeId) || [];
    for (const d of routeDelivs) {
      await updateDelivery(d.id, { routeId: null, stopOrder: null });
    }
    await removeRoute(routeId);
    if (expandedId === routeId) setExpandedId(null);
  }

  function setThisWeek() {
    setStartDate(toISODate(weekMonday()));
    setEndDate(toISODate(addDays(weekMonday(), 6)));
  }

  const totalRouteValue = (routeId) => {
    const dels = deliveriesByRoute.get(routeId) || [];
    return dels.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  };

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Routes</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={setThisWeek} style={navBtn}>This Week</button>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
            From
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ marginLeft: 4, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
            To
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ marginLeft: 4, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
          </label>
        </div>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: 14, fontSize: 13, color: MUTED, fontWeight: 700 }}>
        {filteredRoutes.length} route{filteredRoutes.length !== 1 ? "s" : ""} found
      </div>

      {/* Route cards */}
      {filteredRoutes.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: MUTED, fontSize: 14, border: `1.5px dashed ${BORDER}`, borderRadius: 12, background: "#fff" }}>
          No routes in this date range. Build routes from the Command view.
        </div>
      )}

      {filteredRoutes.map(r => {
        const driverObj = drivers.find(dr => dr.id === r.driverId);
        const truckObj = trucks.find(tr => tr.id === r.truckId);
        const routeDelivs = deliveriesByRoute.get(r.id) || [];
        const value = totalRouteValue(r.id);
        const statusStyle = STATUS_COLORS[r.status] || STATUS_COLORS.planned;
        const isExpanded = expandedId === r.id;

        return (
          <div key={r.id} style={{
            background: "#fff", border: `1.5px solid ${statusStyle.border}`, borderRadius: 12,
            marginBottom: 10, overflow: "hidden",
          }}>
            {/* Card header */}
            <div onClick={() => setExpandedId(isExpanded ? null : r.id)}
              style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>
                  {r.name || "Unnamed Route"}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                  {r.deliveryDate} · {driverObj?.name || "No driver"} · {truckObj?.name || "No truck"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                  background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}`,
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>{r.status || "planned"}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: DARK }}>{routeDelivs.length} stops</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: GREEN }}>{fmtMoney(value)}</span>
                {r.totalMiles ? <span style={{ fontSize: 11, color: MUTED }}>{Math.round(r.totalMiles)} mi</span> : null}
                {r.estimatedCost ? <span style={{ fontSize: 11, color: MUTED }}>Cost: ${(r.estimatedCost / 100).toFixed(0)}</span> : null}
                <span style={{ fontSize: 12, color: MUTED }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: "14px 18px" }}>
                {/* Mini truck diagram */}
                {routeDelivs.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Truck Loading</div>
                    <div style={{ display: "flex", alignItems: "stretch", border: `2px solid ${DARK}`, borderRadius: "10px 4px 4px 10px", overflow: "hidden", minHeight: 60 }}>
                      <div style={{
                        width: 28, background: DARK, color: CREAM, display: "flex", alignItems: "center", justifyContent: "center",
                        writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 8, fontWeight: 800, letterSpacing: 1, flexShrink: 0,
                      }}>CAB</div>
                      <div style={{ flex: 1, display: "flex", background: "#f7faf4", minHeight: 50 }}>
                        {[...routeDelivs].reverse().map((d, ri) => {
                          const stopNum = routeDelivs.length - ri;
                          const cust = d.customerSnapshot || {};
                          const totalVal = value || 1;
                          const valPct = (d.orderValueCents || 0) / totalVal;
                          const colors = ["#c8e6b8", "#b8d9a8", "#a8cc98", "#98bf88", "#88b278", "#78a568"];
                          return (
                            <div key={d.id} style={{
                              flex: `${Math.max(valPct * 100, 12)} 0 0`, minWidth: 28,
                              background: colors[ri % colors.length],
                              borderRight: ri < routeDelivs.length - 1 ? `1.5px solid ${DARK}` : "none",
                              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                              padding: "4px 2px", overflow: "hidden",
                            }}>
                              <div style={{
                                width: 16, height: 16, borderRadius: "50%", background: DARK, color: "#fff",
                                fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 1, flexShrink: 0,
                              }}>{stopNum}</div>
                              <div style={{ fontSize: 7, fontWeight: 700, color: DARK, textAlign: "center", lineHeight: 1.1, overflow: "hidden", maxHeight: 22 }}>
                                {cust.company_name || "—"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{
                        width: 16, background: "#e0ead8", display: "flex", alignItems: "center", justifyContent: "center",
                        borderLeft: `1.5px dashed ${MUTED}`, flexShrink: 0,
                      }}>
                        <div style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 7, fontWeight: 800, color: MUTED }}>DOORS</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stop list */}
                <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Stops ({routeDelivs.length})
                </div>
                {routeDelivs.length === 0 && (
                  <div style={{ fontSize: 12, color: MUTED, padding: 12, textAlign: "center", border: `1px dashed ${BORDER}`, borderRadius: 8, marginBottom: 12 }}>
                    No deliveries linked to this route.
                  </div>
                )}
                {routeDelivs.map((d, i) => {
                  const cust = d.customerSnapshot || {};
                  return (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 3, background: "#f7faf4" }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", background: DARK, color: "#fff",
                        fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>{d.stopOrder || i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cust.company_name || "—"}</div>
                        <div style={{ fontSize: 11, color: MUTED }}>
                          {cust.city || ""}{cust.state ? `, ${cust.state}` : ""}
                          {" · "}{fmtMoney(d.orderValueCents)}
                          {d.miles ? ` · ${Math.round(d.miles)}mi` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Route stats */}
                {(r.totalMiles || r.totalMinutes || r.estimatedCost) && (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: "#f2f5ef", borderRadius: 8, fontSize: 11, color: DARK }}>
                    {r.totalMiles ? <span><b>Miles:</b> {Math.round(r.totalMiles)} · </span> : null}
                    {r.totalMinutes ? <span><b>Time:</b> {Math.floor(r.totalMinutes / 60)}h {Math.round(r.totalMinutes % 60)}min · </span> : null}
                    {r.estimatedCost ? <span><b>Est. cost:</b> ${(r.estimatedCost / 100).toFixed(2)}</span> : null}
                    {r.fuelCostPerGal ? <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>Fuel rate: ${r.fuelCostPerGal.toFixed(2)}/gal</div> : null}
                  </div>
                )}

                {/* Status + delete actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  {r.status !== "active" && (
                    <button onClick={() => setStatus(r.id, "active")}
                      style={{ padding: "8px 14px", background: GREEN, color: "#fff", border: "none", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      Mark Active
                    </button>
                  )}
                  {r.status !== "completed" && (
                    <button onClick={() => setStatus(r.id, "completed")}
                      style={{ padding: "8px 14px", background: DARK, color: CREAM, border: "none", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      Mark Completed
                    </button>
                  )}
                  {r.status !== "planned" && (
                    <button onClick={() => setStatus(r.id, "planned")}
                      style={{ padding: "8px 14px", background: "#f2f5ef", color: DARK, border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      Back to Planned
                    </button>
                  )}
                  <button onClick={() => deleteRoute(r.id)}
                    style={{ padding: "8px 14px", background: "#fff", color: RED, border: `1px solid ${RED}`, borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
                    Delete Route
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const navBtn = { background: "#f2f5ef", border: `1px solid ${BORDER}`, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", color: DARK };
