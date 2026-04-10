import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useDeliveries, useShippingCustomers, useDeliveryClaims, useDrivers, useTrucks, getSupabase } from "../supabase";
import { useAuth } from "../Auth";
import DeliveryImporter from "./DeliveryImporter";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

const TEAMS = [
  { key: "bluff1", label: "Bluff 1", icon: "🌱1" },
  { key: "bluff2", label: "Bluff 2", icon: "🌱2" },
  { key: "sprague", label: "Sprague", icon: "🌿" },
  { key: "houseplants", label: "Houseplants", icon: "🪴" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function todayISO() { return toISODate(new Date()); }
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

export function customerConfirmationValid(delivery) {
  if (!delivery.customerConfirmedAt) return false;
  const deliveryDate = new Date(delivery.deliveryDate);
  const confirmedAt = new Date(delivery.customerConfirmedAt);
  const daysUntilDelivery = (deliveryDate - Date.now()) / 86400000;
  const daysSinceConfirm = (Date.now() - confirmedAt) / 86400000;
  if (daysUntilDelivery > 14) return true;
  return daysSinceConfirm <= 14;
}

export function tooLateToAdd(delivery) {
  if (delivery.tooLateReason) return true;
  if (delivery.loadedAt) return true;
  return false;
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function ShippingCommand() {
  const { rows: deliveries, update } = useDeliveries();
  const { rows: customers, update: updateCustomer } = useShippingCustomers();
  const { rows: claims } = useDeliveryClaims();
  const { rows: drivers } = useDrivers();
  const { rows: trucks } = useTrucks();
  const { displayName } = useAuth();

  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null); // 'reconfirm' | 'late' | 'import' | null

  // Filters
  const [filterShipVia, setFilterShipVia] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterMinDollars, setFilterMinDollars] = useState("");
  const [filterMaxDollars, setFilterMaxDollars] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Customer name search filter
  const [filterCustomer, setFilterCustomer] = useState("");
  const [custChecked, setCustChecked] = useState(new Set()); // set of customer IDs to include

  // Drag state
  const [dragId, setDragId] = useState(null);

  // Route builder state
  const [routeMode, setRouteMode] = useState(false);
  const [routeStops, setRouteStops] = useState([]); // array of delivery IDs in order
  const [routeDriver, setRouteDriver] = useState("");
  const [routeTruck, setRouteTruck] = useState("");
  const [fuelCostPerGal, setFuelCostPerGal] = useState(5.00);
  const DRIVER_RATE = 22; // $/hr
  const MPG = 8; // rough box truck fuel economy

  const monday = useMemo(() => addDays(weekMonday(), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(monday, i)), [monday]);

  // Claims-per-customer count (last 6 months)
  const claimsByCustomer = useMemo(() => {
    const cutoff = Date.now() - 180 * 86400000;
    const deliveryById = new Map(deliveries.map(d => [d.id, d]));
    const map = new Map();
    for (const cl of claims) {
      const repAt = cl.reportedAt ? new Date(cl.reportedAt).getTime() : 0;
      if (repAt < cutoff) continue;
      const del = deliveryById.get(cl.deliveryId);
      const custId = del?.customerId;
      if (!custId) continue;
      map.set(custId, (map.get(custId) || 0) + 1);
    }
    return map;
  }, [claims, deliveries]);

  const allWeekDeliveries = useMemo(() => {
    const start = toISODate(monday);
    const end = toISODate(addDays(monday, 7));
    return deliveries.filter(d => d.deliveryDate && d.deliveryDate >= start && d.deliveryDate < end && d.lifecycle !== "cancelled");
  }, [deliveries, monday]);

  // Extract unique filter values from all deliveries (not just filtered)
  const filterOptions = useMemo(() => {
    const shipVias = new Set(), cities = new Set(), states = new Set();
    for (const d of allWeekDeliveries) {
      const c = d.customerSnapshot || {};
      const fc = customers.find(x => x.id === d.customerId);
      if (d.shipVia) shipVias.add(d.shipVia);
      if (fc?.city) cities.add(fc.city);
      else if (c.city) cities.add(c.city);
      if (fc?.state) states.add(fc.state);
      else if (c.state) states.add(c.state);
    }
    return {
      shipVias: [...shipVias].sort(),
      cities: [...cities].sort(),
      states: [...states].sort(),
    };
  }, [allWeekDeliveries, customers]);

  // Apply filters
  const weekDeliveries = useMemo(() => {
    return allWeekDeliveries.filter(d => {
      const c = d.customerSnapshot || {};
      const fc = customers.find(x => x.id === d.customerId) || {};
      if (filterShipVia && !(d.shipVia || "").toUpperCase().includes(filterShipVia.toUpperCase())) return false;
      if (filterCity) {
        const city = (fc.city || c.city || "").toUpperCase();
        if (!city.includes(filterCity.toUpperCase())) return false;
      }
      if (filterState) {
        const state = (fc.state || c.state || "").toUpperCase();
        if (!state.includes(filterState.toUpperCase())) return false;
      }
      const dollars = (d.orderValueCents || 0) / 100;
      if (filterMinDollars && dollars < parseFloat(filterMinDollars)) return false;
      if (filterMaxDollars && dollars > parseFloat(filterMaxDollars)) return false;
      if (custChecked.size > 0 && !custChecked.has(d.customerId)) return false;
      return true;
    });
  }, [allWeekDeliveries, customers, filterShipVia, filterCity, filterState, filterMinDollars, filterMaxDollars, custChecked]);

  // Customer search matches (for filter UI)
  const custMatches = useMemo(() => {
    if (!filterCustomer || filterCustomer.length < 2) return [];
    const q = filterCustomer.toUpperCase();
    const seen = new Set();
    const results = [];
    for (const d of allWeekDeliveries) {
      if (!d.customerId || seen.has(d.customerId)) continue;
      const name = (d.customerSnapshot?.company_name || "").toUpperCase();
      const fc = customers.find(x => x.id === d.customerId);
      const fcName = (fc?.companyName || "").toUpperCase();
      if (name.includes(q) || fcName.includes(q)) {
        seen.add(d.customerId);
        results.push({ id: d.customerId, name: d.customerSnapshot?.company_name || fc?.companyName || "—" });
      }
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [filterCustomer, allWeekDeliveries, customers]);

  function toggleCustFilter(custId) {
    setCustChecked(prev => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId); else next.add(custId);
      return next;
    });
  }

  // Route builder helpers
  function toggleRouteStop(deliveryId) {
    setRouteStops(prev => {
      if (prev.includes(deliveryId)) return prev.filter(id => id !== deliveryId);
      return [...prev, deliveryId];
    });
  }
  function moveRouteStop(idx, dir) {
    setRouteStops(prev => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }
  function removeRouteStop(idx) {
    setRouteStops(prev => prev.filter((_, i) => i !== idx));
  }
  const routeDeliveries = routeStops.map(id => deliveries.find(d => d.id === id)).filter(Boolean);
  const routeTotal = routeDeliveries.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const routeTotalDollars = routeTotal / 100;
  const TRUCK_WARN = 22000;

  // Auto-compute distance for route stops that don't have it
  const computedRef = useRef(new Set());
  useEffect(() => {
    for (const d of routeDeliveries) {
      if (d.miles || computedRef.current.has(d.id)) continue;
      computedRef.current.add(d.id);
      const c = d.customerSnapshot || {};
      const destination = [c.address1, c.city, c.state, c.zip].filter(Boolean).join(", ");
      if (!destination) continue;
      fetch("/api/shipping-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data) update(d.id, { miles: data.miles, driveMinutes: data.minutes });
      }).catch(() => {});
    }
  }, [routeDeliveries, update]);

  async function saveRoute() {
    for (let i = 0; i < routeStops.length; i++) {
      const patch = { stopOrder: i + 1 };
      if (routeDriver) patch.driverId = routeDriver;
      if (routeTruck) patch.truckId = routeTruck;
      await update(routeStops[i], patch);
    }
    setRouteMode(false);
    setRouteStops([]);
  }

  function handleChipClick(del) {
    if (routeMode) {
      toggleRouteStop(del.id);
    } else {
      setSelected(del);
    }
  }

  // Drag handlers
  async function handleDrop(e, targetDate, targetSlot) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/deliveryId");
    if (!id) return;
    const del = deliveries.find(d => d.id === id);
    if (!del || del.dateLocked) return;
    const iso = toISODate(targetDate);
    if (del.deliveryDate === iso) return;
    await update(id, { deliveryDate: iso });
    setDragId(null);
  }

  const lateChanges = useMemo(() => weekDeliveries.filter(tooLateToAdd), [weekDeliveries]);
  const needReconfirm = useMemo(() => {
    const today = todayISO();
    return deliveries.filter(d =>
      d.lifecycle === "confirmed" && d.deliveryDate >= today && !customerConfirmationValid(d)
    );
  }, [deliveries]);

  function bucket(date, ampm) {
    const iso = toISODate(date);
    return weekDeliveries
      .filter(d => {
        if (d.deliveryDate !== iso) return false;
        const t = d.deliveryTime || "12:00";
        const hr = parseInt(t.split(":")[0], 10) || 12;
        return ampm === "AM" ? hr < 12 : hr >= 12;
      })
      .sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999) || (a.deliveryTime || "").localeCompare(b.deliveryTime || ""));
  }

  const weekLabel = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(monday, 5).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Command</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setWeekOffset(0)} style={navBtn}>Today</button>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>‹</button>
          <div style={{ fontSize: 14, fontWeight: 800, color: DARK, minWidth: 150, textAlign: "center" }}>{weekLabel}</div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>›</button>
        </div>
      </div>

      {/* Counter strip */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={() => setModal("late")}
          style={{ padding: "10px 16px", borderRadius: 999, border: `1.5px solid ${lateChanges.length ? RED : BORDER}`, background: lateChanges.length ? "#fff3f1" : "#fff", color: lateChanges.length ? RED : MUTED, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ⚠ {lateChanges.length} late changes
        </button>
        <button onClick={() => setModal("reconfirm")}
          style={{ padding: "10px 16px", borderRadius: 999, border: `1.5px solid ${needReconfirm.length ? AMBER : BORDER}`, background: needReconfirm.length ? "#fff7ec" : "#fff", color: needReconfirm.length ? AMBER : MUTED, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          🟡 {needReconfirm.length} need reconfirmation
        </button>
        <button onClick={() => { setRouteMode(true); setRouteStops([]); setRouteDriver(""); setRouteTruck(""); }}
          style={{ padding: "10px 16px", borderRadius: 999, border: `1.5px solid ${DARK}`, background: routeMode ? DARK : "#fff", color: routeMode ? "#fff" : DARK, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          🚛 Build Route
        </button>
        <button onClick={() => setModal("import")}
          style={{ padding: "10px 16px", borderRadius: 999, border: `1.5px solid ${GREEN}`, background: "#f0f9ec", color: DARK, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
          📁 Import schedule
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setShowFilters(f => !f)}
          style={{ ...navBtn, fontSize: 12, marginBottom: showFilters ? 8 : 0 }}>
          🔍 {showFilters ? "Hide filters" : "Filters"}
          {(filterShipVia || filterCity || filterState || filterMinDollars || filterMaxDollars || custChecked.size > 0) && " (active)"}
        </button>
        {showFilters && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <FilterSelect label="Route" value={filterShipVia} onChange={setFilterShipVia} options={filterOptions.shipVias} />
            <FilterSelect label="City" value={filterCity} onChange={setFilterCity} options={filterOptions.cities} />
            <FilterSelect label="State" value={filterState} onChange={setFilterState} options={filterOptions.states} />
            <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
              Min $
              <input type="number" value={filterMinDollars} onChange={e => setFilterMinDollars(e.target.value)}
                style={{ marginLeft: 4, width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
              Max $
              <input type="number" value={filterMaxDollars} onChange={e => setFilterMaxDollars(e.target.value)}
                style={{ marginLeft: 4, width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
            </label>
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
                Customer
                <input type="text" value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} placeholder="Type to search…"
                  style={{ marginLeft: 4, width: 140, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
              </label>
              {custMatches.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 180, overflowY: "auto", width: 240, marginTop: 4 }}>
                  {custMatches.map(cm => (
                    <label key={cm.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: custChecked.has(cm.id) ? 800 : 500 }}
                      onMouseDown={e => e.preventDefault()}>
                      <input type="checkbox" checked={custChecked.has(cm.id)} onChange={() => toggleCustFilter(cm.id)} />
                      {cm.name}
                    </label>
                  ))}
                </div>
              )}
              {custChecked.size > 0 && (
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[...custChecked].map(id => {
                    const name = custMatches.find(c => c.id === id)?.name || customers.find(c => c.id === id)?.companyName || id;
                    return (
                      <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: CREAM, borderRadius: 999, fontSize: 10, fontWeight: 700, color: DARK }}>
                        {name}
                        <span onClick={() => toggleCustFilter(id)} style={{ cursor: "pointer", fontWeight: 900 }}>×</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => { setFilterShipVia(""); setFilterCity(""); setFilterState(""); setFilterMinDollars(""); setFilterMaxDollars(""); setFilterCustomer(""); setCustChecked(new Set()); }}
              style={{ ...navBtn, fontSize: 11, color: RED }}>Clear</button>
          </div>
        )}
      </div>

      {/* Week grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "60px repeat(6, minmax(0, 1fr))",
        gap: 6,
        background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: 10,
      }}>
        <div />
        {days.map((d, i) => {
          const isToday = toISODate(d) === todayISO();
          return (
            <div key={i} style={{ textAlign: "center", padding: "6px 2px", fontSize: 11, fontWeight: 800, color: isToday ? GREEN : DARK, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {d.toLocaleDateString("en-US", { weekday: "short" })}<br />
              <span style={{ fontSize: 13 }}>{d.getDate()}</span>
            </div>
          );
        })}

        {["AM", "PM"].map(slot => (
          <>
            <div key={slot + "-lbl"} style={{ fontSize: 11, fontWeight: 800, color: MUTED, textAlign: "right", paddingRight: 6, paddingTop: 6 }}>{slot}</div>
            {days.map((d, i) => (
              <div key={slot + i}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "#e8f5e0"; }}
                onDragLeave={e => { e.currentTarget.style.background = "#f7faf4"; }}
                onDrop={e => { e.currentTarget.style.background = "#f7faf4"; handleDrop(e, d, slot); }}
                style={{ minHeight: 120, background: "#f7faf4", borderRadius: 8, padding: 4, border: `1px solid ${BORDER}`, transition: "background 0.15s" }}>
                {bucket(d, slot).map(del => {
                  const routeIdx = routeStops.indexOf(del.id);
                  return (
                    <Chip key={del.id} delivery={del} customers={customers} claimsCount={claimsByCustomer.get(del.customerId) || 0}
                      onClick={() => handleChipClick(del)}
                      onDragStart={() => setDragId(del.id)}
                      onDragEnd={() => setDragId(null)}
                      isDragging={dragId === del.id}
                      routeMode={routeMode}
                      routeIndex={routeIdx >= 0 ? routeIdx + 1 : null} />
                  );
                })}
              </div>
            ))}
          </>
        ))}
      </div>

      {/* Route Builder — fixed side panel */}
      {routeMode && (
        <div style={{
          position: "fixed", top: 0, right: 0, width: 380, height: "100vh",
          background: "#fff", borderLeft: `2px solid ${DARK}`, boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
          zIndex: 500, overflowY: "auto", padding: 20, ...FONT,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>🚛 Route Builder</div>
            <button onClick={() => { setRouteMode(false); setRouteStops([]); }}
              style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: MUTED }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>Click deliveries on the calendar to add stops in delivery order.</div>

          {/* Driver + truck */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, marginBottom: 3 }}>Driver</div>
              <select value={routeDriver} onChange={e => setRouteDriver(e.target.value)}
                style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }}>
                <option value="">— Driver —</option>
                {drivers.map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, marginBottom: 3 }}>Truck</div>
              <select value={routeTruck} onChange={e => setRouteTruck(e.target.value)}
                style={{ width: "100%", padding: "7px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }}>
                <option value="">— Truck —</option>
                {trucks.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
              </select>
            </label>
          </div>

          {/* $22k warning */}
          {routeTotalDollars > TRUCK_WARN && (
            <div style={{ padding: "8px 12px", background: "#fff3f1", border: `1.5px solid ${RED}`, borderRadius: 8, marginBottom: 12, fontWeight: 800, fontSize: 12, color: RED }}>
              ⚠ ${routeTotalDollars.toLocaleString()} exceeds ${TRUCK_WARN.toLocaleString()} — truck might be full!
            </div>
          )}

          {/* Truck diagram — top-down box truck view
              Looking down at the truck from above:
              Left = CAB (front). Right = DOORS (back).
              Last stop loaded first → goes to front (left).
              First stop loaded last → goes to back/doors (right), unloaded first. */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Truck Loading — Top View</div>
            <div style={{ display: "flex", alignItems: "stretch", border: `2px solid ${DARK}`, borderRadius: "12px 4px 4px 12px", overflow: "hidden", minHeight: 90 }}>
              {/* Cab */}
              <div style={{
                width: 36, background: DARK, color: CREAM, display: "flex", alignItems: "center", justifyContent: "center",
                writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 9, fontWeight: 800, letterSpacing: 1, flexShrink: 0,
              }}>
                CAB
              </div>
              {/* Cargo area — each delivery is a section from left (front) to right (back/doors) */}
              <div style={{ flex: 1, display: "flex", background: "#f7faf4", position: "relative", minHeight: 80 }}>
                {routeDeliveries.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 11 }}>
                    Empty truck
                  </div>
                )}
                {/* Reverse order: last stop at front (left), first stop at back (right/doors) */}
                {[...routeDeliveries].reverse().map((d, ri) => {
                  const stopNum = routeDeliveries.length - ri;
                  const c = d.customerSnapshot || {};
                  const isFirst = stopNum === 1;
                  const isLast = stopNum === routeDeliveries.length;
                  // Width proportional to order value, min 40px
                  const valPct = routeTotal > 0 ? (d.orderValueCents || 0) / routeTotal : 1 / (routeDeliveries.length || 1);
                  const colors = ["#c8e6b8", "#b8d9a8", "#a8cc98", "#98bf88", "#88b278", "#78a568"];
                  const bgColor = colors[ri % colors.length];
                  return (
                    <div key={d.id} style={{
                      flex: `${Math.max(valPct * 100, 12)} 0 0`,
                      minWidth: 36,
                      background: bgColor,
                      borderRight: ri < routeDeliveries.length - 1 ? `2px solid ${DARK}` : "none",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: "6px 2px", position: "relative", overflow: "hidden",
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", background: DARK, color: "#fff",
                        fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                        marginBottom: 2, flexShrink: 0,
                      }}>{stopNum}</div>
                      <div style={{ fontSize: 8, fontWeight: 700, color: DARK, textAlign: "center", lineHeight: 1.2, overflow: "hidden", maxHeight: 28 }}>
                        {c.company_name || "—"}
                      </div>
                      <div style={{ fontSize: 7, color: "#4a6a3a", fontWeight: 700, marginTop: 1 }}>
                        {fmtMoney(d.orderValueCents)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Doors */}
              <div style={{
                width: 20, background: "#e0ead8", display: "flex", alignItems: "center", justifyContent: "center",
                borderLeft: `2px dashed ${MUTED}`, flexShrink: 0,
              }}>
                <div style={{ writingMode: "vertical-rl", textOrientation: "mixed", fontSize: 8, fontWeight: 800, color: MUTED, letterSpacing: 1 }}>
                  DOORS
                </div>
              </div>
            </div>
            {/* Labels */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: MUTED, fontWeight: 700 }}>
              <span>← Load first, unload last</span>
              <span>Load last, unload first →</span>
            </div>
            {/* Fill meter */}
            {routeDeliveries.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: routeTotalDollars > TRUCK_WARN ? RED : DARK, marginBottom: 3 }}>
                  ${routeTotalDollars.toLocaleString()} / ${TRUCK_WARN.toLocaleString()}
                </div>
                <div style={{ background: "#e0ead8", borderRadius: 6, height: 6, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min((routeTotalDollars / TRUCK_WARN) * 100, 100)}%`,
                    height: "100%", borderRadius: 6,
                    background: routeTotalDollars > TRUCK_WARN ? RED : GREEN,
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Stop list */}
          <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Stops ({routeStops.length}) · ${routeTotalDollars.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          </div>
          {routeDeliveries.length === 0 && (
            <div style={{ padding: 16, textAlign: "center", color: MUTED, fontSize: 12, border: `1.5px dashed ${BORDER}`, borderRadius: 8, marginBottom: 12 }}>
              Click deliveries on the calendar to add stops
            </div>
          )}
          {routeDeliveries.map((d, i) => {
            const c = d.customerSnapshot || {};
            const fc = customers.find(x => x.id === d.customerId) || {};
            const computing = d._computingDistance;
            return (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 3, background: "#f7faf4" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: DARK, color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 11, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.company_name || "—"}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>
                    {fc.city || c.city || ""}{(fc.state || c.state) ? `, ${fc.state || c.state}` : ""}
                    {" · "}{fmtMoney(d.orderValueCents)}
                    {d.miles ? ` · ${Math.round(d.miles)}mi` : ""}
                    {d.driveMinutes ? ` · ~${Math.round(d.driveMinutes)}min` : ""}
                    {!d.miles && !computing && " · ⏳ computing..."}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <button onClick={() => moveRouteStop(i, -1)} disabled={i === 0}
                    style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", fontSize: 12, opacity: i === 0 ? 0.3 : 1, padding: 0, lineHeight: 1 }}>▲</button>
                  <button onClick={() => moveRouteStop(i, 1)} disabled={i === routeDeliveries.length - 1}
                    style={{ background: "none", border: "none", cursor: i === routeDeliveries.length - 1 ? "default" : "pointer", fontSize: 12, opacity: i === routeDeliveries.length - 1 ? 0.3 : 1, padding: 0, lineHeight: 1 }}>▼</button>
                </div>
                <button onClick={() => removeRouteStop(i)}
                  style={{ background: "none", border: "none", color: RED, fontSize: 14, cursor: "pointer", padding: 0, fontWeight: 900 }}>×</button>
              </div>
            );
          })}

          {/* Time estimate */}
          {routeDeliveries.length > 0 && (() => {
            const totalDriveMins = routeDeliveries.reduce((s, d) => s + (d.driveMinutes || 0), 0);
            const totalMiles = routeDeliveries.reduce((s, d) => s + (d.miles || 0), 0);
            const dropoffMins = routeDeliveries.length * 30;
            const lastStopMins = routeDeliveries[routeDeliveries.length - 1]?.driveMinutes || 0;
            const lastStopMiles = routeDeliveries[routeDeliveries.length - 1]?.miles || 0;
            const totalMins = totalDriveMins + dropoffMins + lastStopMins;
            const totalRouteMiles = totalMiles + lastStopMiles; // include return
            const hrs = Math.floor(totalMins / 60);
            const mins = Math.round(totalMins % 60);
            const missingDist = routeDeliveries.filter(d => !d.miles).length;
            // Cost estimate
            const driverCost = (totalMins / 60) * DRIVER_RATE;
            const fuelGallons = totalRouteMiles / MPG;
            const fuelCost = fuelGallons * fuelCostPerGal;
            const totalCost = driverCost + fuelCost;
            return (
              <div style={{ marginTop: 10, padding: "8px 10px", background: "#f2f5ef", borderRadius: 8, fontSize: 11, color: DARK }}>
                <b>Est. route time:</b> {hrs > 0 ? `${hrs}h ` : ""}{mins}min · {Math.round(totalRouteMiles)} miles
                <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>
                  {Math.round(totalDriveMins)}min driving + {dropoffMins}min drop-offs + ~{Math.round(lastStopMins)}min return
                </div>
                {missingDist > 0 && (
                  <div style={{ color: AMBER, fontSize: 10, marginTop: 2, fontWeight: 700 }}>
                    ⚠ {missingDist} stop{missingDist > 1 ? "s" : ""} missing distance data — estimate may be low
                  </div>
                )}
                {/* Cost estimate */}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}` }}>
                  <b>Est. delivery cost:</b> ${totalCost.toFixed(2)}
                  <div style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>
                    Driver: ${driverCost.toFixed(2)} ({(totalMins / 60).toFixed(1)}hrs × ${DRIVER_RATE}/hr)
                    {" · "}Fuel: ${fuelCost.toFixed(2)} ({fuelGallons.toFixed(1)}gal × ${fuelCostPerGal.toFixed(2)}/gal)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>
                      Fuel $/gal:
                      <input type="number" step="0.01" value={fuelCostPerGal}
                        onChange={e => setFuelCostPerGal(parseFloat(e.target.value) || 0)}
                        style={{ marginLeft: 4, width: 60, padding: "3px 6px", borderRadius: 4, border: `1px solid ${BORDER}`, fontSize: 11, fontFamily: "inherit" }} />
                    </label>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Save */}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={saveRoute} disabled={routeStops.length === 0}
              style={{
                flex: 1, padding: "10px 0", background: routeStops.length === 0 ? MUTED : GREEN, color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 800, fontSize: 13,
                cursor: routeStops.length === 0 ? "default" : "pointer", fontFamily: "inherit",
              }}>
              ✓ Save Route ({routeStops.length} stops)
            </button>
            <button onClick={() => { setRouteMode(false); setRouteStops([]); }}
              style={{ padding: "10px 16px", background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {selected && (
        <DetailDrawer
          delivery={selected}
          displayName={displayName}
          drivers={drivers}
          trucks={trucks}
          customers={customers}
          onUpdateCustomer={updateCustomer}
          onUpdateDelivery={update}
          onClose={() => setSelected(null)}
          onUpdate={async patch => {
            await update(selected.id, patch);
            setSelected(s => s ? { ...s, ...patch } : s);
          }}
        />
      )}

      {modal === "reconfirm" && (
        <ListModal title="Need reconfirmation" items={needReconfirm} onClose={() => setModal(null)}
          renderAction={(d) => (
            <button onClick={async () => {
              await update(d.id, { customerConfirmedAt: new Date().toISOString(), customerConfirmedBy: displayName });
            }}
              style={{ padding: "8px 14px", background: GREEN, color: DARK, border: "none", borderRadius: 8, fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              📞 Reconfirmed
            </button>
          )}
        />
      )}
      {modal === "late" && (
        <ListModal title="Late changes" items={lateChanges} onClose={() => setModal(null)} />
      )}
      {modal === "import" && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(30,45,26,0.6)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setModal(null)}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: 24, maxWidth: 800, width: "100%",
            maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: DARK }}>Import Delivery Schedule</div>
              <button onClick={() => setModal(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: MUTED }}>✕</button>
            </div>
            <DeliveryImporter onDone={() => setModal(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn = { background: "#f2f5ef", border: `1px solid ${BORDER}`, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", color: DARK };

// ── Chip ────────────────────────────────────────────────────────────────────
function Chip({ delivery: d, customers, claimsCount, onClick, onDragStart, onDragEnd, isDragging, routeMode, routeIndex }) {
  const cust = d.customerSnapshot || {};
  const fullCust = customers.find(c => c.id === d.customerId) || {};
  const isProposed = d.lifecycle === "proposed" || (!d.lifecycle);
  const isCancelled = d.lifecycle === "cancelled";
  const isCOD = (fullCust.terms || cust.terms || "").toUpperCase().includes("COD") || (fullCust.terms || "").toUpperCase().includes("C.O.D");
  const needsCustomerConfirm = fullCust.delivery_confirmation_required || fullCust.deliveryConfirmationRequired;

  const salesOk = !!d.salesConfirmedAt;
  const custOk = customerConfirmationValid(d);
  const shipOk = !!d.shippingConfirmedAt;

  const latestAlert = Array.isArray(d.alerts) && d.alerts.length > 0 ? d.alerts[d.alerts.length - 1] : null;

  return (
    <div
      draggable={!d.dateLocked}
      onDragStart={e => { e.dataTransfer.setData("text/deliveryId", d.id); e.dataTransfer.effectAllowed = "move"; onDragStart?.(); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      style={{
      background: routeIndex ? "#e8f5e0" : isCancelled ? "#f0f0f0" : "#fff",
      border: routeIndex ? `2px solid ${GREEN}` : isProposed ? `1.5px dashed ${MUTED}` : `1.5px solid ${DARK}`,
      borderRadius: 6, padding: 6, marginBottom: 4, cursor: routeMode ? "pointer" : d.dateLocked ? "pointer" : "grab",
      opacity: isDragging ? 0.4 : isProposed ? 0.75 : isCancelled ? 0.5 : 1,
      position: "relative",
      fontSize: 10, lineHeight: 1.3,
    }}>
      {routeIndex && (
        <div style={{
          position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: "50%",
          background: DARK, color: "#fff", fontSize: 10, fontWeight: 900,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{routeIndex}</div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontWeight: 800, color: DARK }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {d.dateLocked && "🔒 "}{cust.company_name || "—"}
        </span>
        <span style={{ color: GREEN }}>{fmtMoney(d.orderValueCents)}</span>
      </div>
      <div style={{ color: MUTED }}>
        {d.deliveryTime || "—"}{d.cartCount ? ` · 🛒${d.cartCount}` : ""}
      </div>
      <div>
        <span title="sales">{salesOk ? "🟢" : "🟡"}S</span>{" "}
        <span title="customer">{custOk ? "🟢" : "🟡"}C</span>{" "}
        <span title="shipping">{shipOk ? "🟢" : "🟡"}T</span>
      </div>
      <div>
        {(d.needsBluff1 || d.needsBluff2) && (() => {
          const b1Done = !d.needsBluff1 || d.bluff1PulledAt;
          const b2Done = !d.needsBluff2 || d.bluff2PulledAt;
          return <span title="Bluff">🌱{b1Done && b2Done ? "✅" : "⬜"} </span>;
        })()}
        {d.needsSprague && <span title="Sprague">🌿{d.spraguePulledAt ? "✅" : "⬜"} </span>}
        {d.needsHouseplants && <span title="Houseplants">🪴{d.houseplantsPulledAt ? "✅" : "⬜"} </span>}
      </div>
      {(isCOD || needsCustomerConfirm || claimsCount > 0) && (
        <div style={{ marginTop: 2 }}>
          {isCOD && <span style={{ color: RED, fontWeight: 800 }}>💰COD </span>}
          {needsCustomerConfirm && !d.customerConfirmedAt && <span style={{ color: AMBER, fontWeight: 800 }}>⚠Unconf </span>}
          {claimsCount > 0 && <span style={{ color: RED, fontWeight: 700 }}>⚖{claimsCount} </span>}
        </div>
      )}
      {latestAlert && (
        <div style={{ marginTop: 2, padding: "2px 4px", background: "#fff3f1", color: RED, borderRadius: 4, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          🔔 {latestAlert.text}
        </div>
      )}
    </div>
  );
}

// ── Detail Drawer ──────────────────────────────────────────────────────────
function DetailDrawer({ delivery: d, displayName, drivers = [], trucks = [], customers = [], onUpdateCustomer, onUpdateDelivery, onClose, onUpdate }) {
  const cust = d.customerSnapshot || {};
  const fullCust = customers.find(c => c.id === d.customerId) || {};
  const hasAddress = !!(fullCust.address1 || cust.address1);
  const [alertText, setAlertText] = useState("");
  const [moveDate, setMoveDate] = useState(d.deliveryDate || "");
  const [editingAddress, setEditingAddress] = useState(false);
  const [addrForm, setAddrForm] = useState({
    address1: fullCust.address1 || cust.address1 || "",
    city: fullCust.city || cust.city || "",
    state: fullCust.state || cust.state || "",
    zip: fullCust.zip || cust.zip || "",
  });

  async function saveAddress() {
    if (!d.customerId || !onUpdateCustomer) return;
    // Update the customer record
    await onUpdateCustomer(d.customerId, {
      address1: addrForm.address1,
      city: addrForm.city,
      state: addrForm.state,
      zip: addrForm.zip,
    });
    // Update the delivery snapshot so distance can be computed
    const newSnapshot = {
      ...cust,
      address1: addrForm.address1,
      city: addrForm.city,
      state: addrForm.state,
      zip: addrForm.zip,
    };
    await onUpdate({ customerSnapshot: newSnapshot });
    // Auto-compute distance
    const destination = [addrForm.address1, addrForm.city, addrForm.state, addrForm.zip].filter(Boolean).join(", ");
    if (destination && onUpdateDelivery) {
      fetch("/api/shipping-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data) onUpdateDelivery(d.id, { miles: data.miles, driveMinutes: data.minutes });
      }).catch(() => {});
    }
    setEditingAddress(false);
  }

  async function addAlert(severity = "info") {
    if (!alertText.trim()) return;
    const newAlert = { text: alertText.trim(), author: displayName, created_at: new Date().toISOString(), severity };
    const alerts = [...(Array.isArray(d.alerts) ? d.alerts : []), newAlert];
    await onUpdate({ alerts });
    setAlertText("");
  }

  async function confirmRole(which) {
    const patch = {};
    const ts = new Date().toISOString();
    if (which === "sales") { patch.salesConfirmedAt = ts; patch.salesConfirmedBy = displayName; }
    if (which === "customer") { patch.customerConfirmedAt = ts; patch.customerConfirmedBy = displayName; }
    if (which === "shipping") {
      patch.shippingConfirmedAt = ts;
      patch.shippingConfirmedBy = displayName;
      if (d.lifecycle === "proposed") patch.lifecycle = "confirmed";
    }
    await onUpdate(patch);
  }

  async function toggleNeeds(key) {
    const field = `needs${key[0].toUpperCase() + key.slice(1)}`;
    await onUpdate({ [field]: !d[field] });
  }

  async function toggleLock() {
    await onUpdate({ dateLocked: !d.dateLocked });
  }

  async function cancelDelivery() {
    if (!window.confirm("Cancel this delivery?")) return;
    await onUpdate({ lifecycle: "cancelled" });
    onClose();
  }

  async function moveToDate() {
    if (!moveDate || moveDate === d.deliveryDate) return;
    await onUpdate({ deliveryDate: moveDate });
  }

  const picksByTeam = {};
  for (const p of (Array.isArray(d.pickSheetPhotos) ? d.pickSheetPhotos : [])) {
    if (!picksByTeam[p.team]) picksByTeam[p.team] = [];
    picksByTeam[p.team].push(p);
  }
  const signedInvoices = Array.isArray(d.signedInvoicePhotos) ? d.signedInvoicePhotos : [];
  const alerts = Array.isArray(d.alerts) ? d.alerts : [];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 520, height: "100%", overflowY: "auto" }}>
        <div style={{ background: DARK, color: CREAM, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>{cust.company_name || "Delivery"}</div>
            <div style={{ fontSize: 12, color: "#9cb894" }}>{d.deliveryDate} · {d.deliveryTime || "—"} · {fmtMoney(d.orderValueCents)}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: CREAM, fontSize: 26, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Address */}
          <Section title="Delivery Address">
            {!editingAddress && hasAddress && (
              <div style={{ fontSize: 12, color: DARK }}>
                <div>{fullCust.address1 || cust.address1}</div>
                <div>{fullCust.city || cust.city}{(fullCust.state || cust.state) ? `, ${fullCust.state || cust.state}` : ""} {fullCust.zip || cust.zip || ""}</div>
                {d.miles && <div style={{ color: MUTED, marginTop: 4 }}>📍 {Math.round(d.miles)} miles · ~{Math.round(d.driveMinutes || 0)} min from greenhouse</div>}
                <button onClick={() => setEditingAddress(true)}
                  style={{ marginTop: 6, padding: "4px 10px", background: "#f2f5ef", border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: MUTED }}>
                  Edit address
                </button>
              </div>
            )}
            {!editingAddress && !hasAddress && (
              <div>
                <div style={{ fontSize: 12, color: AMBER, fontWeight: 700, marginBottom: 6 }}>⚠ No address on file — distance cannot be computed</div>
                <button onClick={() => setEditingAddress(true)}
                  style={{ padding: "8px 14px", background: AMBER, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add Address
                </button>
              </div>
            )}
            {editingAddress && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={addrForm.address1} onChange={e => setAddrForm(f => ({ ...f, address1: e.target.value }))} placeholder="Street address"
                  style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} placeholder="City"
                    style={{ flex: 2, padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit" }} />
                  <input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} placeholder="State"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit" }} />
                  <input value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} placeholder="Zip"
                    style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit" }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveAddress}
                    style={{ padding: "8px 14px", background: GREEN, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                    Save & compute distance
                  </button>
                  <button onClick={() => setEditingAddress(false)}
                    style={{ padding: "8px 12px", background: "#fff", color: MUTED, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </Section>

          <Section title="Flags">
            <div style={{ fontSize: 12, color: MUTED }}>
              {(cust.terms || "").toUpperCase().includes("COD") && <div style={{ color: RED, fontWeight: 700 }}>💰 COD</div>}
              {cust.shipping_notes && <div>📝 {cust.shipping_notes}</div>}
              {d.dateLocked && <div>🔒 Date locked (fundraiser)</div>}
            </div>
          </Section>

          <Section title="Driver & Truck">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, marginBottom: 4 }}>Driver</div>
                <select
                  value={d.driverId || ""}
                  onChange={e => onUpdate({ driverId: e.target.value || null })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
                  <option value="">— Unassigned —</option>
                  {drivers.map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, marginBottom: 4 }}>Truck</div>
                <select
                  value={d.truckId || ""}
                  onChange={e => onUpdate({ truckId: e.target.value || null })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
                  <option value="">— Unassigned —</option>
                  {trucks.map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
                </select>
              </label>
            </div>
          </Section>

          <Section title="Confirmations">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <ConfBtn label={`Sales ${d.salesConfirmedAt ? "🟢" : "🟡"}`} active={!!d.salesConfirmedAt} onClick={() => confirmRole("sales")} />
              <ConfBtn label={`Customer ${customerConfirmationValid(d) ? "🟢" : "🟡"}`} active={customerConfirmationValid(d)} onClick={() => confirmRole("customer")} />
              <ConfBtn label={`Shipping ${d.shippingConfirmedAt ? "🟢" : "🟡"}`} active={!!d.shippingConfirmedAt} onClick={() => confirmRole("shipping")} />
            </div>
          </Section>

          <Section title="Teams">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TEAMS.map(t => {
                const field = `needs${t.key[0].toUpperCase() + t.key.slice(1)}`;
                const pulledAt = d[`${t.key}PulledAt`];
                const pulledBy = d[`${t.key}PulledBy`];
                const active = !!d[field];
                return (
                  <div key={t.key} style={{ padding: 8, border: `1px solid ${BORDER}`, borderRadius: 8, background: active ? "#f7faf4" : "#fafafa" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={active} onChange={() => toggleNeeds(t.key)} />
                      <b>{t.icon} {t.label}</b>
                      {pulledAt && <span style={{ color: GREEN, fontSize: 11, marginLeft: "auto" }}>✅ {new Date(pulledAt).toLocaleString()} by {pulledBy}</span>}
                    </label>
                    {picksByTeam[t.key] && picksByTeam[t.key].length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {picksByTeam[t.key].map((p, i) => <PhotoThumb key={i} path={p.storage_path} bucket="pick-sheet-photos" />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Alerts">
            <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 8 }}>
              {alerts.length === 0 && <div style={{ fontSize: 12, color: MUTED }}>No alerts yet.</div>}
              {alerts.map((a, i) => (
                <div key={i} style={{ padding: 6, background: "#fff3f1", borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                  <div><b>{a.author}:</b> {a.text}</div>
                  <div style={{ color: MUTED, fontSize: 10 }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={alertText} onChange={e => setAlertText(e.target.value)} placeholder="Add alert…"
                style={{ flex: 1, padding: 8, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
              <button onClick={() => addAlert()} style={{ padding: "8px 12px", background: DARK, color: CREAM, border: "none", borderRadius: 6, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Add</button>
            </div>
          </Section>

          <Section title="Signed invoices">
            {signedInvoices.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED }}>None yet.</div>
            ) : (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {signedInvoices.map((p, i) => <PhotoThumb key={i} path={p.storage_path} bucket="signed-invoices" />)}
              </div>
            )}
          </Section>

          <Section title="Actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} style={{ padding: 8, borderRadius: 6, border: `1px solid ${BORDER}`, fontFamily: "inherit" }} />
                <button onClick={moveToDate} disabled={d.dateLocked} style={{ padding: "8px 12px", background: d.dateLocked ? "#ccc" : DARK, color: CREAM, border: "none", borderRadius: 6, fontWeight: 800, cursor: d.dateLocked ? "default" : "pointer", fontFamily: "inherit", fontSize: 12 }}>
                  Move date
                </button>
              </div>
              <button onClick={toggleLock} style={{ padding: "8px 12px", background: "#f2f5ef", color: DARK, border: `1px solid ${BORDER}`, borderRadius: 6, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                {d.dateLocked ? "🔓 Unlock date" : "🔒 Lock date"}
              </button>
              <button onClick={cancelDelivery} style={{ padding: "8px 12px", background: "#fff", color: RED, border: `1px solid ${RED}`, borderRadius: 6, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                Cancel delivery
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function ConfBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 12px",
      background: active ? GREEN : "#f2f5ef",
      color: DARK,
      border: `1.5px solid ${active ? GREEN : BORDER}`,
      borderRadius: 8, fontWeight: 800, fontSize: 12,
      cursor: "pointer", fontFamily: "inherit",
    }}>{label}</button>
  );
}

function PhotoThumb({ path, bucket }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !path) return;
    sb.storage.from(bucket).createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path, bucket]);
  if (!url) return <div style={{ width: 60, height: 60, background: "#eee", borderRadius: 6 }} />;
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6 }} /></a>;
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ marginLeft: 4, padding: "6px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit", background: "#fff", minWidth: 80 }}>
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ListModal({ title, items, onClose, renderAction }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 540, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ background: DARK, color: CREAM, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: CREAM, fontSize: 24, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          {items.length === 0 ? <div style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 20 }}>Nothing here.</div> :
            items.map(d => (
              <div key={d.id} style={{ padding: 10, border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: DARK }}>{d.customerSnapshot?.company_name || "—"}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{d.deliveryDate} · {fmtMoney(d.orderValueCents)}</div>
                </div>
                {renderAction && renderAction(d)}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
