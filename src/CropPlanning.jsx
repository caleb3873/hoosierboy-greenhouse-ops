import { useState, useEffect, useRef } from "react";
import { useCropRuns, useHouses, usePads, useContainers, useSpacingProfiles, useVarieties, useBrokerCatalogs } from "./supabase";
import { CatalogPicker } from "./Libraries";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const SENSITIVITY = [
  { id: "hardy",      label: "Hardy",       desc: "Tolerates light frost",      color: "#4a90d9", minTemp: 28 },
  { id: "semi",       label: "Semi-Hardy",  desc: "No frost, cool nights ok",   color: "#7fb069", minTemp: 35 },
  { id: "tender",     label: "Tender",      desc: "Warm nights required",       color: "#e07b39", minTemp: 45 },
  { id: "veryTender", label: "Very Tender", desc: "No cold exposure at all",    color: "#d94f3d", minTemp: 55 },
];
const VARIETY_TAGS = [
  { id: "new",      label: "New",      color: "#8e44ad", bg: "#f5f0ff" },
  { id: "compact",  label: "Compact",  color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "vigorous", label: "Vigorous", color: "#c8791a", bg: "#fff4e8" },
  { id: "trial",    label: "Trial",    color: "#7a8c74", bg: "#f0f5ee" },
];

const CROP_STATUS = [
  { id: "planned",      label: "Planned",       color: "#7a8c74" },
  { id: "needs_design", label: "Needs Design",  color: "#e07b39" },
  { id: "propagating",  label: "Propagating",   color: "#8e44ad" },
  { id: "growing",      label: "Growing",       color: "#4a90d9" },
  { id: "outside",      label: "Outside",       color: "#c8791a" },
  { id: "ready",        label: "Ready",         color: "#7fb069" },
  { id: "shipped",      label: "Shipped",       color: "#1e2d1a" },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const uid  = () => crypto.randomUUID();
const dc   = (o) => JSON.parse(JSON.stringify(o));
const sens = (id) => SENSITIVITY.find(s => s.id === id) || SENSITIVITY[1];
const stat = (id) => CROP_STATUS.find(s => s.id === id) || CROP_STATUS[0];

// Week number ↔ date helpers (ISO week, year configurable)
function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(startOfWeek1);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}
function dateToWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}
function formatWeekDate(week, year) {
  const d = weekToDate(week, year);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function subtractWeeks(week, year, n) {
  let w = week - n; let y = year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}
function addWeeks(week, year, n) {
  let w = week + n; let y = year;
  while (w > 52) { w -= 52; y++; }
  return { week: w, year: y };
}
function weekLabel(week, year, currentYear) {
  return year !== currentYear ? `Wk ${week} '${String(year).slice(2)}` : `Wk ${week}`;
}

// Compute all schedule milestones for a crop run
function computeSchedule(run) {
  const { targetWeek, targetYear, movesOutside, weeksIndoor, weeksOutdoor, weeksProp } = run;
  if (!targetWeek || !targetYear) return null;
  const totalFinish = movesOutside ? (Number(weeksIndoor) || 0) + (Number(weeksOutdoor) || 0) : (Number(weeksIndoor) || 0);
  const transplantWk = subtractWeeks(targetWeek, targetYear, totalFinish);
  const propWks = Number(weeksProp) || 0;
  const seedWk = propWks > 0 ? subtractWeeks(transplantWk.week, transplantWk.year, propWks) : null;
  const moveOutWk = movesOutside && weeksOutdoor ? subtractWeeks(targetWeek, targetYear, Number(weeksOutdoor)) : null;
  return { transplant: transplantWk, seed: seedWk, moveOut: moveOutWk, ready: { week: targetWeek, year: targetYear } };
}

// ── SPACING HELPERS (mirrored from spacing-library) ───────────────────────────
function calcSqFt(x, y) {
  const xn = Number(x), yn = Number(y || x);
  if (!xn || !yn) return null;
  return (xn * yn / 144).toFixed(3);
}
function calcPotsPerBench(x, y, benchWFt, benchLFt) {
  const xn = Number(x), yn = Number(y || x);
  const wn = Number(benchWFt), ln = Number(benchLFt);
  if (!xn || !yn || !wn || !ln) return null;
  return Math.floor((wn * 12) / xn) * Math.floor((ln * 12) / yn);
}
const STAGE_DEFS = [
  { id: "tight",  label: "Tight",  icon: "⬛", color: "#4a90d9" },
  { id: "spaced", label: "Spaced", icon: "⬜", color: "#c8791a" },
  { id: "finish", label: "Finish", icon: "◻️", color: "#7fb069" },
];

// Auto-resolve spacing profile for a crop run given containers + spacing library
// Rules: cased → prefer Tight profile for container; container → prefer container's standard profile;
// if crop name matches a crop-tagged profile → that wins over everything
function resolveSpacingProfile(profiles, cropName, containerId, containers, isCased) {
  if (!profiles || profiles.length === 0) return null;
  // 1. Crop match wins always
  if (cropName) {
    const cropMatch = profiles.find(p =>
      p.tag === "crop" &&
      (p.cropRef || "").toLowerCase().split(/[,/]/).map(s => s.trim())
        .some(c => cropName.toLowerCase().includes(c) || c.includes(cropName.toLowerCase()))
    );
    if (cropMatch) return { profile: cropMatch, source: "crop" };
  }
  // 2. Container-based fallback
  const container = containers?.find(c => c.id === containerId);
  if (container) {
    const containerName = container.name || "";
    const contMatch = profiles.find(p =>
      p.tag === "container" &&
      (p.containerRef || "").toLowerCase().split(/[,/]/).map(s => s.trim())
        .some(c => containerName.toLowerCase().includes(c) || c.includes(containerName.toLowerCase()))
    );
    if (contMatch) {
      // For cased product, prefer the Tight stage of the matched profile
      return { profile: contMatch, source: "container", preferTight: isCased };
    }
  }
  return null;
}


const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const TA = (f) => ({ ...IS(f), minHeight: 60, resize: "vertical" });
function FL({ c }) { return <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7a8c74", marginBottom: 5, letterSpacing: .6, textTransform: "uppercase" }}>{c}</label>; }
function SH({ c, mt, color }) { return <div style={{ fontSize: 11, fontWeight: 800, color: color || "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: `1.5px solid ${color ? color + "33" : "#e0ead8"}`, paddingBottom: 7, marginBottom: 14, marginTop: mt || 10 }}>{c}</div>; }
function Badge({ label, color }) { return <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700, letterSpacing: .4, whiteSpace: "nowrap" }}>{label}</span>; }
function Pill({ label, value, color = "#7fb069" }) {
  return (
    <div style={{ background: color + "14", border: `1px solid ${color}33`, borderRadius: 8, padding: "7px 13px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function IBtn({ onClick, danger, children }) { return <button onClick={onClick} style={{ background: "none", border: `1px solid ${danger ? "#f0d0c0" : "#e0ead8"}`, borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: danger ? "#e07b39" : "#aabba0", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{children}</button>; }
function Toggle({ value, onChange, label }) {
  return (
    <button onClick={() => onChange(!value)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
      <div style={{ width: 40, height: 22, borderRadius: 11, background: value ? "#7fb069" : "#c8d8c0", position: "relative", transition: "background .2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 3, left: value ? 21 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
      </div>
      <span style={{ fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>{label}</span>
    </button>
  );
}

// ── SCHEDULE TIMELINE ─────────────────────────────────────────────────────────
function ScheduleTimeline({ sched, currentYear, movesOutside, sensitivity }) {
  if (!sched) return null;
  const s = sens(sensitivity);
  const steps = [
    sched.seed    && { label: "🌱 Seed / Order liners", ...sched.seed,    color: "#8e44ad" },
    sched.transplant && { label: "🪴 Transplant",         ...sched.transplant, color: "#4a90d9" },
    sched.moveOut && { label: "🌤 Move outside",          ...sched.moveOut,  color: "#c8791a" },
    { label: "✅ Ready / Ship",   ...sched.ready,    color: "#7fb069" },
  ].filter(Boolean);

  return (
    <div style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "16px 18px", marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>Computed Schedule</div>
      <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <div style={{ textAlign: "center", minWidth: 90 }}>
              <div style={{ background: step.color + "18", border: `2px solid ${step.color}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: step.color }}>{weekLabel(step.week, step.year, currentYear)}</div>
                <div style={{ fontSize: 10, color: "#7a8c74" }}>{formatWeekDate(step.week, step.year)}</div>
              </div>
              <div style={{ fontSize: 10, color: "#1e2d1a", fontWeight: 600, lineHeight: 1.3 }}>{step.label}</div>
            </div>
            {i < steps.length - 1 && <div style={{ width: 28, height: 2, background: "#c8d8c0", flexShrink: 0, margin: "0 2px", marginBottom: 20 }} />}
          </div>
        ))}
      </div>
      {movesOutside && s && (
        <div style={{ marginTop: 12, background: s.color + "10", border: `1px solid ${s.color}33`, borderRadius: 8, padding: "8px 12px", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>🌡</span>
          <div style={{ fontSize: 12, color: "#1e2d1a" }}>
            <span style={{ fontWeight: 700, color: s.color }}>{s.label}</span>
            <span style={{ color: "#7a8c74", marginLeft: 6 }}>{s.desc} · min {s.minTemp}°F nights</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BENCH / SPACE ASSIGNMENT PICKER ──────────────────────────────────────────
// ── Compatibility check: returns list of conflicting runs in a given house ────
function checkRangeCompatibility(houseId, currentRunId, currentTempGroup, allRuns, varietyLibrary) {
  if (!houseId || !currentTempGroup) return [];
  const others = allRuns.filter(r => r.id !== currentRunId && (r.indoorAssignments || []).some(a => a.structureId === houseId));
  return others.filter(r => {
    // Get tempGroup from run directly or look up from variety library
    const tg = r.tempGroup || ((() => {
      const lib = (varietyLibrary || []).find(v => v.cropName?.toLowerCase() === r.cropName?.toLowerCase());
      return lib?.tempGroup || "";
    })());
    return tg && tg !== currentTempGroup;
  });
}

// ── Capacity math for a house ────────────────────────────────────────────────
function houseCapacityInfo(house, container) {
  const benches = (house?.zones || []).filter(z => z.type === "bench").flatMap(z => z.items || []);
  const totalSqFt = benches.reduce((s, b) => {
    const w = b.benchType === "double" ? 8 : (Number(b.widthFt) || 0);
    return s + w * (Number(b.lengthFt) || 0);
  }, 0);
  const diaIn = container?.diameterIn;
  let potCapacity = null;
  if (diaIn && totalSqFt) {
    const diaFt = diaIn / 12;
    potCapacity = Math.floor(totalSqFt / (diaFt * diaFt));
  }
  return { totalSqFt: Math.round(totalSqFt), potCapacity, benchCount: benches.length };
}

// Returns total sq ft and pot capacity across all assignments for a crop run
function assignmentCapacitySummary(assignments, houses, pads, container) {
  let totalSqFt = 0;
  let totalPots = null;
  const diaIn = container?.diameterIn;
  (assignments || []).forEach(a => {
    const house = houses.find(h => h.id === a.structureId);
    const pad   = pads.find(p => p.id === a.structureId);
    if (house) {
      // If a specific bench is assigned, use just that bench; else whole house
      const zone = house.zones?.find(z => z.id === a.zoneId);
      const item = zone?.items?.find(i => i.id === a.itemId);
      if (item) {
        const w = item.benchType === "double" ? 8 : (Number(item.widthFt) || 0);
        const sqFt = w * (Number(item.lengthFt) || 0);
        totalSqFt += sqFt;
      } else if (zone) {
        const zoneSqFt = (zone.items || []).reduce((s, i) => {
          const w = i.benchType === "double" ? 8 : (Number(i.widthFt) || 0);
          return s + w * (Number(i.lengthFt) || 0);
        }, 0);
        totalSqFt += zoneSqFt;
      } else {
        const info = houseCapacityInfo(house, container);
        totalSqFt += info.totalSqFt;
      }
    } else if (pad) {
      const bay = (pad.bays || []).find(b => b.id === a.itemId);
      if (bay) {
        totalSqFt += (Number(bay.widthFt)||0) * (Number(bay.lengthFt)||0);
      } else {
        totalSqFt += (pad.bays || []).reduce((s, b) => s + (Number(b.widthFt)||0)*(Number(b.lengthFt)||0), 0);
      }
    }
  });
  if (diaIn && totalSqFt) {
    const diaFt = diaIn / 12;
    totalPots = Math.floor(totalSqFt / (diaFt * diaFt));
  }
  return { totalSqFt: Math.round(totalSqFt), totalPots };
}

function SpaceAssignmentPicker({ assignments, onChange, houses, pads, sched, currentYear, outsideOnly, allRuns = [], currentRunId, currentRunTempGroup, varietyLibrary = [], form: runForm, containers = [] }) {
  const [adding, setAdding] = useState(false);
  const [pickForm, setPickForm] = useState({ type: outsideOnly ? "pad" : "house", structureId: "", zoneId: "", itemId: "" });
  const [compatOverride, setCompatOverride] = useState(false);
  const [showOverridePrompt, setShowOverridePrompt] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState(null);

  const selectedHouse = houses.find(h => h.id === pickForm.structureId);
  const selectedPad   = pads.find(p => p.id === pickForm.structureId);
  const benchZones    = (selectedHouse?.zones || []).filter(z => z.type === "bench");
  const selectedZone  = benchZones.find(z => z.id === pickForm.zoneId);
  const container     = containers.find(c => c.id === runForm?.containerId);

  // Compatibility check for currently selected house
  const conflicts = pickForm.type === "house" && pickForm.structureId
    ? checkRangeCompatibility(pickForm.structureId, currentRunId, currentRunTempGroup, allRuns, varietyLibrary)
    : [];
  const hasConflict = conflicts.length > 0 && !compatOverride;

  // Capacity info for selected house
  const capInfo = pickForm.type === "house" && selectedHouse ? houseCapacityInfo(selectedHouse, container) : null;

  function buildAssignment() {
    const house = houses.find(h => h.id === pickForm.structureId);
    const pad   = pads.find(p => p.id === pickForm.structureId);
    const zone  = house?.zones.find(z => z.id === pickForm.zoneId);
    const item  = zone?.items.find(i => i.id === pickForm.itemId);
    return {
      id: uid(), type: pickForm.type,
      structureId: pickForm.structureId,
      structureName: house?.name || pad?.name || "",
      zoneId: pickForm.zoneId || null, zoneName: zone?.name || null,
      itemId: pickForm.itemId || null, itemName: item?.label || null,
      compatOverride: compatOverride || false,
    };
  }

  function tryAddAssignment() {
    if (!pickForm.structureId) return;
    if (hasConflict) {
      setPendingAssignment(buildAssignment());
      setShowOverridePrompt(true);
      return;
    }
    onChange([...assignments, buildAssignment()]);
    setAdding(false);
    setPickForm({ type: outsideOnly ? "pad" : "house", structureId: "", zoneId: "", itemId: "" });
    setCompatOverride(false);
  }

  function confirmOverride() {
    if (!pendingAssignment) return;
    onChange([...assignments, { ...pendingAssignment, compatOverride: true }]);
    setAdding(false);
    setPickForm({ type: outsideOnly ? "pad" : "house", structureId: "", zoneId: "", itemId: "" });
    setCompatOverride(false);
    setShowOverridePrompt(false);
    setPendingAssignment(null);
  }

  return (
    <div>
      {/* Override approval modal */}
      {showOverridePrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 420, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️ Temperature Conflict</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>
              {pendingAssignment?.structureName} already has {currentRunTempGroup === "cool" ? "warm" : "cool"} crops assigned.
            </div>
            <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16, lineHeight: 1.6 }}>
              Mixing cool and warm crops in the same range creates problems — cool crops need to move outside weeks 12-13 at temperatures that warm crops can't tolerate.<br /><br />
              <strong>Only proceed if you have a specific reason.</strong> This override will be logged.
            </div>
            <div style={{ fontSize: 12, color: "#a04010", background: "#fdf3ea", borderRadius: 8, padding: "8px 12px", marginBottom: 16 }}>
              Conflicting runs: {conflicts.map(r => r.cropName).join(", ")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowOverridePrompt(false); setPendingAssignment(null); }}
                style={{ flex: 1, background: "#f0f8eb", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#2e5c1e" }}>
                Cancel — Pick Different Range
              </button>
              <button onClick={confirmOverride}
                style={{ flex: 1, background: "#e07b39", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#fff" }}>
                Override (Caleb Approval)
              </button>
            </div>
          </div>
        </div>
      )}

      {assignments.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic", marginBottom: 8 }}>No space assigned yet</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {assignments.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: a.compatOverride ? "#fff8f0" : "#f0f8eb", border: `1px solid ${a.compatOverride ? "#f0c080" : "#c8e0b8"}`, borderRadius: 8, padding: "7px 12px" }}>
            <span style={{ fontSize: 13 }}>{a.type === "pad" ? "🌤" : "🏠"}</span>
            <span style={{ flex: 1, fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
              {a.structureName}{a.zoneName ? ` › ${a.zoneName}` : ""}{a.itemName ? ` › ${a.itemName}` : ""}
            </span>
            {a.compatOverride && <span style={{ fontSize: 10, color: "#a04010", background: "#fde8d0", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>⚠️ Override</span>}
            <IBtn danger onClick={() => onChange(assignments.filter(x => x.id !== a.id))}>×</IBtn>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: "#f8faf6", borderRadius: 10, border: "1.5px solid #c8d8c0", padding: 14 }}>
          {!outsideOnly && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["house","🏠 Greenhouse"],["pad","🌤 Outdoor Pad"]].map(([t, l]) => (
                <button key={t} onClick={() => setPickForm(f => ({ ...f, type: t, structureId: "", zoneId: "", itemId: "" }))}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${pickForm.type === t ? "#7fb069" : "#c8d8c0"}`, background: pickForm.type === t ? "#f0f8eb" : "#fff", color: pickForm.type === t ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            {/* ── RANGE BROWSER CARDS ── */}
            <div>
              <FL c={pickForm.type === "pad" ? "Outdoor Range" : "Greenhouse Range"} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, maxHeight: 340, overflowY: "auto" }}>
                {(pickForm.type === "pad" ? pads : houses).filter(s => s.active !== false).map(s => {
                  const isSelected = pickForm.structureId === s.id;
                  const conf = pickForm.type === "house" ? checkRangeCompatibility(s.id, currentRunId, currentRunTempGroup, allRuns, varietyLibrary) : [];
                  const hasTempConflict = conf.length > 0;

                  // Runs currently in this range that overlap in time with our bench window
                  const thisRangeRuns = allRuns.filter(r =>
                    r.id !== currentRunId &&
                    (r.indoorAssignments || []).some(a => a.structureId === s.id)
                  );
                  // Compute bench window for current run and each other run
                  const mySched = runForm ? computeSchedule(runForm) : null;
                  const myTransplantWk = mySched?.transplant ? mySched.transplant.week + mySched.transplant.year * 53 : null;
                  const myReadyWk = runForm?.targetWeek ? runForm.targetWeek + (runForm.targetYear||2026) * 53 : null;

                  const overlappingRuns = thisRangeRuns.filter(r => {
                    if (!myTransplantWk || !myReadyWk) return false;
                    const rs = computeSchedule(r);
                    const rStart = rs?.transplant ? rs.transplant.week + rs.transplant.year * 53 : null;
                    // Bench clears when crop moves outside (moveOut week), not at ready week
                    // If no moveOut, bench holds until ready week
                    const rBenchEnd = rs?.moveOut
                      ? rs.moveOut.week + rs.moveOut.year * 53
                      : r.targetWeek ? r.targetWeek + (r.targetYear||2026) * 53 : null;
                    if (!rStart || !rBenchEnd) return false;
                    // Exclusive on both ends: moving out week 14 frees bench for transplant week 14
                    return rStart < myReadyWk && rBenchEnd > myTransplantWk;
                  });
                  const allInRange = thisRangeRuns;

                  // Capacity for this range
                  const capI = pickForm.type === "house" ? houseCapacityInfo(s, container) : null;
                  const myPots = runForm ? (Number(runForm.cases)||0) * (runForm.isCased !== false ? (Number(runForm.packSize)||10) : 1) : 0;
                  const fits = capI?.potCapacity ? myPots <= capI.potCapacity : null;

                  // Temp group of runs already in this range
                  const rangeGroups = [...new Set(allInRange.map(r => r.tempGroup).filter(Boolean))];
                  const rangeTempLabel = rangeGroups.length === 1 ? rangeGroups[0] : rangeGroups.length > 1 ? "mixed" : null;

                  return (
                    <div key={s.id}
                      onClick={() => setPickForm(f => ({ ...f, structureId: s.id, zoneId: "", itemId: "" }))}
                      style={{
                        border: `2px solid ${isSelected ? "#7fb069" : hasTempConflict ? "#f0c080" : "#e0ead8"}`,
                        borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                        background: isSelected ? "#f0f8eb" : hasTempConflict ? "#fffbf0" : "#fff",
                        transition: "border-color .15s, background .15s",
                      }}>
                      {/* Range header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: overlappingRuns.length > 0 || capI ? 6 : 0 }}>
                        <span style={{ fontSize: 15 }}>{pickForm.type === "pad" ? "🌤" : "🏠"}</span>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", flex: 1 }}>{s.name}</span>
                        {/* Temp badge */}
                        {rangeTempLabel && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: rangeTempLabel === "cool" ? "#e8f3fc" : rangeTempLabel === "warm" ? "#fdf3ea" : "#f8f0fc", color: rangeTempLabel === "cool" ? "#1a4a7a" : rangeTempLabel === "warm" ? "#a04010" : "#6a2a9a", border: `1px solid ${rangeTempLabel === "cool" ? "#a0c4e8" : rangeTempLabel === "warm" ? "#f0c090" : "#d0a0e0"}` }}>
                            {rangeTempLabel === "cool" ? "❄️ Cool range" : rangeTempLabel === "warm" ? "🌡 Warm range" : "⚠️ Mixed"}
                          </span>
                        )}
                        {/* Temp conflict badge */}
                        {hasTempConflict && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: "#fde8d0", color: "#a04010", border: "1px solid #f0c090" }}>
                            ⚠️ Temp conflict
                          </span>
                        )}
                        {/* Capacity badge */}
                        {capI?.potCapacity && myPots > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: fits ? "#f0f8eb" : "#fff0f0", color: fits ? "#2e5c1e" : "#b03020", border: `1px solid ${fits ? "#c8e0b8" : "#f0b0a0"}` }}>
                            {fits ? "✅ Fits" : "⚠️ Too small"}
                          </span>
                        )}
                      </div>

                      {/* Capacity line */}
                      {capI && capI.totalSqFt > 0 && (
                        <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: overlappingRuns.length > 0 ? 6 : 0, display: "flex", gap: 12 }}>
                          <span>📐 {capI.totalSqFt.toLocaleString()} sq ft</span>
                          {capI.potCapacity && container && <span>~{capI.potCapacity.toLocaleString()} {container.diameterIn}" pots capacity</span>}
                          {capI.benchCount > 0 && <span>{capI.benchCount} bench{capI.benchCount !== 1 ? "es" : ""}</span>}
                        </div>
                      )}

                      {/* Overlapping runs — same bench window */}
                      {overlappingRuns.length > 0 && (
                        <div style={{ borderTop: "1px solid #e8ede4", marginTop: 4, paddingTop: 6 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>
                            Same bench window ({overlappingRuns.length} crop{overlappingRuns.length !== 1 ? "s" : ""})
                          </div>
                          {overlappingRuns.map(r => {
                            const rs = computeSchedule(r);
                            const sameTemp = !r.tempGroup || !currentRunTempGroup || r.tempGroup === currentRunTempGroup;
                            return (
                              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: sameTemp ? "#f0f8eb" : "#fff0e8", color: sameTemp ? "#2e5c1e" : "#a04010", border: `1px solid ${sameTemp ? "#c8e0b8" : "#f0c090"}` }}>
                                  {r.tempGroup === "cool" ? "❄️" : r.tempGroup === "warm" ? "🌡" : "·"} {sameTemp ? "Same" : "Diff"} temp
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#1e2d1a" }}>{r.cropName}</span>
                                <span style={{ fontSize: 11, color: "#7a8c74" }}>
                                  Wk {rs?.transplant?.week || "?"} → Wk {rs?.moveOut?.week ? `${rs.moveOut.week} (moves out)` : (r.targetWeek || "?")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Empty range callout */}
                      {overlappingRuns.length === 0 && allInRange.length === 0 && (
                        <div style={{ fontSize: 11, color: "#7fb069", fontWeight: 600 }}>✨ Empty — no other crops assigned</div>
                      )}
                      {overlappingRuns.length === 0 && allInRange.length > 0 && (
                        <div style={{ fontSize: 11, color: "#7a8c74" }}>No date conflicts — other crops are on different weeks</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Conflict warning (kept for explicitness when range is selected) */}
            {pickForm.type === "house" && conflicts.length > 0 && (
              <div style={{ background: "#fff8f0", border: "1.5px solid #f0c080", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: "#a04010", marginBottom: 4 }}>⚠️ Temperature Conflict</div>
                <div style={{ color: "#7a4a10" }}>This range has {currentRunTempGroup === "cool" ? "warm" : "cool"} crops: <strong>{conflicts.map(r => r.cropName).join(", ")}</strong>. Assigning here requires Caleb's approval.</div>
              </div>
            )}

            {pickForm.type === "house" && benchZones.length > 0 && (
              <div>
                <FL c="Bench Zone (optional)" />
                <select style={IS(false)} value={pickForm.zoneId} onChange={e => setPickForm(f => ({ ...f, zoneId: e.target.value, itemId: "" }))}>
                  <option value="">— Whole range —</option>
                  {benchZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            )}
            {pickForm.type === "house" && selectedZone && (selectedZone.items || []).length > 0 && (
              <div>
                <FL c="Specific Bench (optional)" />
                <select style={IS(false)} value={pickForm.itemId} onChange={e => setPickForm(f => ({ ...f, itemId: e.target.value }))}>
                  <option value="">— Whole zone —</option>
                  {(selectedZone.items || []).map(i => {
                    const w = i.benchType === "double" ? 8 : (Number(i.widthFt) || 0);
                    const sqFt = w && i.lengthFt ? Math.round(w * Number(i.lengthFt)) : 0;
                    const pots = container?.diameterIn && sqFt ? Math.floor(sqFt / Math.pow(container.diameterIn/12, 2)) : null;
                    return <option key={i.id} value={i.id}>{i.label}{sqFt ? ` — ${sqFt} sq ft` : ""}{pots ? ` (~${pots} pots)` : ""}</option>;
                  })}
                </select>
              </div>
            )}
            {pickForm.type === "pad" && selectedPad && (
              <div>
                <FL c="Bay *" hint="Select which bay this crop will occupy" />
                {(selectedPad.bays || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "#e07b39", background: "#fff8f0", borderRadius: 8, padding: "8px 12px" }}>
                    ⚠️ No bays configured on this pad — edit the pad to add bays first.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4, maxHeight: 340, overflowY: "auto" }}>
                    {(selectedPad.bays || []).map(b => {
                      const isSelected = pickForm.itemId === b.id;
                      const sqFt = b.widthFt && b.lengthFt ? Math.round(Number(b.widthFt) * Number(b.lengthFt)) : 0;
                      const potCap = container?.diameterIn && sqFt ? Math.floor(sqFt / Math.pow(container.diameterIn / 12, 2)) : null;
                      const myPots = runForm ? (Number(runForm.cases)||0) * (runForm.isCased !== false ? (Number(runForm.packSize)||10) : 1) : 0;
                      const fits = potCap ? myPots <= potCap : null;

                      // Runs using this bay that overlap our outdoor window
                      const mySched = runForm ? computeSchedule(runForm) : null;
                      // Outdoor window: moveOut → ready
                      const myOutStart = mySched?.moveOut ? mySched.moveOut.week + mySched.moveOut.year * 53 : null;
                      const myOutEnd   = runForm?.targetWeek ? runForm.targetWeek + (runForm.targetYear||2026) * 53 : null;

                      // Outside is one-and-done — any crop assigned to this bay occupies it for the season
                      const bayRuns = allRuns.filter(r =>
                        r.id !== currentRunId &&
                        (r.outsideAssignments || []).some(a => a.structureId === selectedPad.id && a.itemId === b.id)
                      );
                      const overlappingBayRuns = bayRuns; // no turnover — if anything is here, bay is taken

                      return (
                        <div key={b.id}
                          onClick={() => setPickForm(f => ({ ...f, itemId: b.id }))}
                          style={{
                            border: `2px solid ${isSelected ? "#7fb069" : "#e0ead8"}`,
                            borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                            background: isSelected ? "#f0f8eb" : "#fff",
                            transition: "border-color .15s, background .15s",
                          }}>
                          {/* Bay header */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: sqFt || overlappingBayRuns.length > 0 ? 5 : 0 }}>
                            <span style={{ fontSize: 15 }}>🌤</span>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", flex: 1 }}>Bay {b.number}{b.name ? ` — ${b.name}` : ""}</span>
                            {fits !== null && myPots > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 10, background: fits ? "#f0f8eb" : "#fff0f0", color: fits ? "#2e5c1e" : "#b03020", border: `1px solid ${fits ? "#c8e0b8" : "#f0b0a0"}` }}>
                                {fits ? "✅ Fits" : "⚠️ Too small"}
                              </span>
                            )}
                          </div>

                          {/* Sq ft + capacity */}
                          {sqFt > 0 && (
                            <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: overlappingBayRuns.length > 0 ? 5 : 0, display: "flex", gap: 12 }}>
                              <span>📐 {sqFt.toLocaleString()} sq ft</span>
                              {potCap && container && <span>~{potCap.toLocaleString()} {container.diameterIn}" pots capacity</span>}
                            </div>
                          )}

                          {/* Overlapping runs */}
                          {overlappingBayRuns.length > 0 && (
                            <div style={{ borderTop: "1px solid #e8ede4", marginTop: 4, paddingTop: 6 }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>
                                Already assigned this season ({overlappingBayRuns.length} crop{overlappingBayRuns.length !== 1 ? "s" : ""}) — bay is taken
                              </div>
                              {overlappingBayRuns.map(r => {
                                const rs = computeSchedule(r);
                                return (
                                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6, background: "#fdf3ea", color: "#a04010", border: "1px solid #f0c090" }}>
                                      {r.tempGroup === "cool" ? "❄️" : r.tempGroup === "warm" ? "🌡" : "·"}
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1e2d1a" }}>{r.cropName}</span>
                                    <span style={{ fontSize: 11, color: "#7a8c74" }}>
                                      Wk {rs?.moveOut?.week || "?"} → Wk {r.targetWeek || "?"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {overlappingBayRuns.length === 0 && bayRuns.length === 0 && (
                            <div style={{ fontSize: 11, color: "#7fb069", fontWeight: 600 }}>✨ Empty — no other crops in this bay</div>
                          )}
                          {overlappingBayRuns.length === 0 && bayRuns.length > 0 && (
                            <div style={{ fontSize: 11, color: "#7a8c74" }}>No other crops assigned this season</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={tryAddAssignment}
              style={{ flex: 1, background: hasConflict ? "#e07b39" : "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {hasConflict ? "⚠️ Assign (Conflict)" : "Assign"}
            </button>
            <button onClick={() => { setAdding(false); setCompatOverride(false); }} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ background: "none", border: "1.5px dashed #c8d8c0", borderRadius: 8, padding: "7px 14px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>+ Assign space</button>
      )}
    </div>
  );
}

// ── COMBOBOX (library options + free-type fallback) ───────────────────────────
function Combobox({ value, onChange, options, placeholder, focusKey, focus, setFocus, disabled }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = typed
    ? options.filter(o => o.toLowerCase().includes(typed.toLowerCase()))
    : options;

  function select(opt) { onChange(opt); setTyped(""); setOpen(false); }

  function handleInput(e) { setTyped(e.target.value); onChange(e.target.value); setOpen(true); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          style={{ ...IS(focus === focusKey), paddingRight: 28 }}
          value={typed !== "" ? typed : (value || "")}
          onChange={handleInput}
          onFocus={() => { setFocus(focusKey); setOpen(true); setTyped(""); }}
          onBlur={() => { setFocus(null); setTimeout(() => setOpen(false), 150); }}
          placeholder={disabled ? "— select crop / species first —" : placeholder}
          disabled={disabled}
        />
        <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", color: "#aabba0", fontSize: 10, pointerEvents: "none" }}>▼</span>
      </div>
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0, background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.1)", maxHeight: 200, overflowY: "auto", marginTop: 2 }}>
          {filtered.map(opt => (
            <div key={opt} onMouseDown={() => select(opt)}
              style={{ padding: "9px 12px", fontSize: 13, color: "#1e2d1a", cursor: "pointer", background: opt === value ? "#f0f8eb" : "transparent", fontWeight: opt === value ? 700 : 400 }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f8eb"}
              onMouseLeave={e => e.currentTarget.style.background = opt === value ? "#f0f8eb" : "transparent"}>
              {opt}
            </div>
          ))}
          {typed && !options.find(o => o.toLowerCase() === typed.toLowerCase()) && (
            <div onMouseDown={() => select(typed)}
              style={{ padding: "9px 12px", fontSize: 12, color: "#7fb069", cursor: "pointer", borderTop: "1px solid #f0f5ee", fontWeight: 700, fontStyle: "italic" }}>
              + Use "{typed}" (new)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── VARIETY MANAGER ───────────────────────────────────────────────────────────
function VarietyManager({ varieties, lotCases, packSize, materialType, propTraySize, linerSize, isCased, onChange, onIncreaseLot, varietyLibrary }) {
  const [focus, setFocus] = useState(null);
  const [overAlert, setOverAlert] = useState(null); // { needed, current }
  const { getSuppliers, getColors } = useBrokerLookup();

  // Determine split increment based on material type
  // URC: 100 units. Liner: tray size (e.g. 84). Seed: 1. Default: 100.
  const splitIncrement = (() => {
    if (materialType === "liner" && linerSize) {
      const match = String(linerSize).match(/\d+/);
      return match ? Number(match[0]) : 100;
    }
    if (materialType === "urc" || !materialType) return 100;
    return 100;
  })();

  const assignedCases = varieties.reduce((s, v) => s + (Number(v.cases) || 0), 0);
  const remainingCases = lotCases - assignedCases;
  const isOver = assignedCases > lotCases && lotCases > 0;
  const pct = lotCases > 0 ? Math.min(100, Math.round((assignedCases / lotCases) * 100)) : 0;

  // Even-split when adding a variety — rounded to splitIncrement
  function addVariety() {
    const newCount = varieties.length + 1;
    const totalUnits = lotCases * (packSize || 10);
    const unitsPerSlot = Math.floor(totalUnits / newCount / splitIncrement) * splitIncrement;
    const evenCases = unitsPerSlot > 0 ? Math.floor(unitsPerSlot / (packSize || 10)) : 0;
    const rebalanced = varieties.map(v => ({ ...v, cases: evenCases }));
    const remainder = lotCases > 0 ? lotCases - evenCases * newCount : 0;
    // Duplicate species/variety/broker/supplier from last row — only color needs to be selected
    const last = varieties[varieties.length - 1];
    const newVar = {
      id: uid(),
      cultivar: last?.cultivar || "",
      name: last?.name || "",
      color: "",  // color is the only thing to pick
      broker: last?.broker || "",
      supplier: last?.supplier || "",
      ballItemNumber: "",
      costPerUnit: "",
      cases: evenCases + remainder,
      _seriesName: last?._seriesName || "",
      _catalogColors: last?._catalogColors || [],
      tags: [],
    };
    onChange([...rebalanced, newVar]);
  }

  function updVar(idx, field, rawVal) {
    const updated = varieties.map((v, i) => i === idx ? { ...v, [field]: rawVal } : v);
    // If updating cases, check for over-allocation
    if (field === "cases" && lotCases > 0) {
      const newTotal = updated.reduce((s, v) => s + (Number(v.cases) || 0), 0);
      if (newTotal > lotCases) {
        setOverAlert({ needed: newTotal, current: lotCases });
        return; // block update
      }
      setOverAlert(null);
    }
    onChange(updated);
  }

  function removeVar(idx) {
    const next = varieties.filter((_, i) => i !== idx);
    setOverAlert(null);
    onChange(next);
  }

  function rebalanceEvenly() {
    if (!lotCases || varieties.length === 0) return;
    const totalUnits = lotCases * (packSize || 10);
    const unitsPerSlot = Math.floor(totalUnits / varieties.length / splitIncrement) * splitIncrement;
    const even = Math.floor(unitsPerSlot / (packSize || 10));
    const rem  = lotCases - even * varieties.length;
    onChange(varieties.map((v, i) => ({ ...v, cases: i === 0 ? even + rem : even })));
    setOverAlert(null);
  }

  const totalCost = varieties.reduce((s, v) => {
    const u = (Number(v.cases) || 0) * packSize;
    return s + (v.costPerUnit ? Number(v.costPerUnit) * u : 0);
  }, 0);

  const barColor = isOver ? "#d94f3d" : pct > 95 ? "#7fb069" : pct > 70 ? "#4a90d9" : "#c8d8c0";

  return (
    <div>
      {/* Allocation bar */}
      <div style={{ background: "#f8faf6", borderRadius: 12, border: `1.5px solid ${isOver ? "#f0c0c0" : "#e0ead8"}`, padding: "16px 18px", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6 }}>Lot Allocation</div>
            <div style={{ fontSize: 13, color: "#1e2d1a", marginTop: 3 }}>
              <span style={{ fontWeight: 800, color: isOver ? "#d94f3d" : "#1e2d1a" }}>{assignedCases.toLocaleString()}</span>
              <span style={{ color: "#7a8c74" }}> / {lotCases > 0 ? lotCases.toLocaleString() : "—"} {isCased ? "cases" : "pots"} assigned</span>
              {lotCases > 0 && !isOver && remainingCases > 0 && <span style={{ color: "#7a8c74", marginLeft: 8 }}>({remainingCases} unassigned)</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {varieties.length > 1 && <button onClick={rebalanceEvenly} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "5px 12px", fontSize: 11, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>⟳ Rebalance evenly</button>}
            {totalCost > 0 && <div style={{ fontSize: 12, color: "#8e44ad", fontWeight: 700 }}>Est. cost: ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>}
          </div>
        </div>
        {lotCases > 0 && (
          <div style={{ background: "#e0ead8", borderRadius: 6, height: 12, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .3s" }} />
          </div>
        )}
        {lotCases === 0 && <div style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic", marginTop: 4 }}>Set the lot case count on the Crop & Schedule tab first</div>}

        {/* Over-allocation warning */}
        {overAlert && (
          <div style={{ marginTop: 12, background: "#fff0f0", border: "1.5px solid #f0c0c0", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#c03030", marginBottom: 8 }}>⛔ Over-allocated by {overAlert.needed - overAlert.current} cases</div>
            <div style={{ fontSize: 12, color: "#7a3030", marginBottom: 12 }}>The variety quantities you've entered exceed the lot total of {overAlert.current} cases. Choose one of the options below to resolve this.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { onIncreaseLot(overAlert.needed); setOverAlert(null); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                ↑ Increase lot to {overAlert.needed} cases
              </button>
              <button onClick={rebalanceEvenly} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                ⟳ Rebalance varieties evenly
              </button>
              <button onClick={() => setOverAlert(null)} style={{ background: "none", border: "1px solid #f0c0c0", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#c03030", cursor: "pointer", fontFamily: "inherit" }}>
                Dismiss (leave unresolved)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Variety rows */}
      {varieties.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#aabba0", background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #c8d8c0", marginBottom: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🌸</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74" }}>No varieties added yet</div>
          <div style={{ fontSize: 12, color: "#aabba0", marginTop: 4 }}>Add varieties below — they'll split the lot evenly and you can adjust from there</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {varieties.map((v, idx) => {
          const vUnits = (Number(v.cases) || 0) * packSize;
          const vCost  = v.costPerUnit && vUnits ? Number(v.costPerUnit) * vUnits : null;
          const varPct = lotCases > 0 ? Math.round(((Number(v.cases) || 0) / lotCases) * 100) : 0;

          // Build cultivar list from variety library — unique cropNames filtered by crop run's crop
          const libEntries = varietyLibrary || [];
          const cultivarOptions = [...new Set(libEntries.map(e => e.cropName).filter(Boolean))].sort();

          // Variety options filtered by selected cultivar
          const varietyOptions = v.cultivar
            ? [...new Set(libEntries.filter(e => e.cropName === v.cultivar).map(e => e.variety).filter(Boolean))].sort()
            : [...new Set(libEntries.map(e => e.variety).filter(Boolean))].sort();

          // When a variety is selected from the library, auto-fill known fields
          function selectLibraryVariety(cultivar, varietyName) {
            const match = libEntries.find(e => e.cropName === cultivar && e.variety === varietyName);
            if (match) {
              const next = varieties.map((x, i) => i !== idx ? x : {
                ...x,
                cultivar,
                name: varietyName,
                broker: match.breeder || x.broker,
              });
              onChange(next);
            }
          }

          const displayName = [v.cultivar, v.name].filter(Boolean).join(" — ") || "New variety";

          return (
            <div key={v.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f0f5ee", background: "#fafcf8" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: "#7fb069" + "18", border: "1px solid #7fb069" + "44", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#7fb069", flexShrink: 0 }}>{idx + 1}</div>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 13, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
                {varPct > 0 && <span style={{ fontSize: 11, color: "#7a8c74", whiteSpace: "nowrap" }}>{varPct}% of lot</span>}
                <IBtn danger onClick={() => removeVar(idx)}>×</IBtn>
              </div>

              <div style={{ padding: "12px 14px" }}>
                {/* Identity row: Crop/Species | Variety | Color */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <FL c="Crop / Species" />
                    <input style={IS(focus === v.id + "cult")} value={v.cultivar || ""}
                      onChange={e => updVar(idx, "cultivar", e.target.value)}
                      onFocus={() => setFocus(v.id + "cult")} onBlur={() => setFocus(null)}
                      placeholder="e.g. Petunia" />
                  </div>
                  <div>
                    <FL c="Variety / Series" />
                    <input style={IS(focus === v.id + "var")} value={v.name || ""}
                      onChange={e => updVar(idx, "name", e.target.value)}
                      onFocus={() => setFocus(v.id + "var")} onBlur={() => setFocus(null)}
                      placeholder="e.g. Vista Bubblegum" />
                  </div>
                  <div>
                    <FL c="Color" />
                    {v._catalogColors?.length > 0 ? (
                      <select style={IS(false)} value={v.color || ""} onChange={e => {
                        const picked = v._catalogColors.find(c => c.label === e.target.value);
                        const next = varieties.map((x, i) => i !== idx ? x : {
                          ...x,
                          color: e.target.value,
                          ballItemNumber: picked?.itemNumber || x.ballItemNumber,
                          costPerUnit: picked?.price ? Number(picked.price).toFixed(4) : x.costPerUnit,
                        });
                        onChange(next);
                      }}>
                        <option value="">— Select color —</option>
                        {v._catalogColors.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                      </select>
                    ) : (
                      <input style={IS(focus === v.id + "col")} value={v.color || ""} onChange={e => updVar(idx, "color", e.target.value)} onFocus={() => setFocus(v.id + "col")} onBlur={() => setFocus(null)} placeholder="e.g. Pink" />
                    )}
                  </div>
                </div>
                {/* Quantity + cost row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <FL c={isCased ? "Cases" : "Pots"} />
                    <input type="number" style={IS(focus === v.id + "c")} value={v.cases} onChange={e => updVar(idx, "cases", e.target.value)} onFocus={() => setFocus(v.id + "c")} onBlur={() => setFocus(null)} placeholder="0" />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>{vUnits > 0 ? vUnits.toLocaleString() + " units" : "— units"}</div>
                  </div>
                  <div>
                    <FL c="Cost / unit ($)" />
                    <input type="number" step="0.01" style={IS(focus === v.id + "cpu")} value={v.costPerUnit} onChange={e => updVar(idx, "costPerUnit", e.target.value)} onFocus={() => setFocus(v.id + "cpu")} onBlur={() => setFocus(null)} placeholder="e.g. 0.85" />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    {vCost ? <div style={{ background: "#f5f0ff", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#6a3a9a", fontWeight: 700, width: "100%" }}>${vCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div> : <div style={{ borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#aabba0", width: "100%" }}>—</div>}
                  </div>
                </div>

                {/* Mini allocation bar */}
                {lotCases > 0 && (
                  <div style={{ background: "#e8ede4", borderRadius: 4, height: 5, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${Math.min(100, varPct)}%`, height: "100%", background: "#7fb069", borderRadius: 4 }} />
                  </div>
                )}

                {/* Broker / Supplier */}
                {(() => {
                  const rowSuppliers = v.broker && v.cultivar ? getSuppliers(v.broker, v.cultivar) : [];
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <FL c="Broker" />
                        <input style={IS(focus === v.id + "brk")} value={v.broker || ""} onChange={e => updVar(idx, "broker", e.target.value)} onFocus={() => setFocus(v.id + "brk")} onBlur={() => setFocus(null)} placeholder="e.g. Ball Seed" />
                      </div>
                      <div>
                        <FL c="Supplier" />
                        {rowSuppliers.length > 0 ? (
                          <select style={IS(false)} value={v.supplier || ""} onChange={e => {
                            const next = varieties.map((x, i) => i !== idx ? x : { ...x, supplier: e.target.value });
                            // Also update _catalogColors based on new supplier selection
                            const colors = getColors(v.broker, v.cultivar, v._seriesName);
                            const filtered = colors.filter(c => !e.target.value || c.supplier === e.target.value || c.breeder === e.target.value);
                            next[idx]._catalogColors = filtered.map(c => ({ label: c.color || c.varietyName, itemNumber: c.itemNumber, price: c.unitPrice || c.sellPrice }));
                            onChange(next);
                          }}>
                            <option value="">— Select supplier —</option>
                            {rowSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input style={IS(focus === v.id + "sup")} value={v.supplier || ""} onChange={e => updVar(idx, "supplier", e.target.value)} onFocus={() => setFocus(v.id + "sup")} onBlur={() => setFocus(null)} placeholder="e.g. Dümmen" />
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Attribute tag chips */}
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#aabba0", textTransform: "uppercase", letterSpacing: .6, marginRight: 2 }}>Tags</span>
                  {VARIETY_TAGS.map(tag => {
                    const active = (v.tags || []).includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => {
                        const current = v.tags || [];
                        const next = active ? current.filter(t => t !== tag.id) : [...current, tag.id];
                        updVar(idx, "tags", next);
                      }} style={{
                        padding: "4px 12px", borderRadius: 20,
                        border: `1.5px solid ${active ? tag.color : "#c8d8c0"}`,
                        background: active ? tag.bg : "#fff",
                        color: active ? tag.color : "#aabba0",
                        fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        transition: "all .15s",
                      }}>
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addVariety} style={{ width: "100%", background: "none", border: "1.5px dashed #7fb069", borderRadius: 10, padding: "11px 0", fontSize: 13, fontWeight: 700, color: "#7fb069", cursor: "pointer", fontFamily: "inherit" }}>
        + Add Variety {lotCases > 0 && varieties.length > 0 ? `(will split ${lotCases} ${isCased ? "cases" : "pots"} evenly)` : ""}
      </button>
    </div>
  );
}

// ── SPACING ASSIGNMENT ────────────────────────────────────────────────────────
function SpacingAssignment({ form, upd, spacingProfiles, containers }) {
  const [focus, setFocus] = useState(null);

  const isCased    = form.isCased ?? (Number(form.packSize) > 1);
  const resolved   = resolveSpacingProfile(spacingProfiles, form.cropName, form.containerId, containers, isCased);
  const activeProfileId = form.spacingOverride ? form.spacingProfileId : (resolved?.profile?.id || form.spacingProfileId);
  const activeProfile   = spacingProfiles.find(p => p.id === activeProfileId) || resolved?.profile;
  const preferTight     = !form.spacingOverride && resolved?.preferTight;

  const activeStages = STAGE_DEFS.filter(s => {
    if (!activeProfile?.stages?.[s.id]?.enabled) return false;
    if (preferTight && s.id !== "tight") return false; // cased: only show tight
    return true;
  });

  // Bench dimensions from first indoor assignment that has item-level data
  const firstBench = (form.indoorAssignments || []).find(a => a.itemName);
  const benchW = firstBench?.benchW || "4";
  const benchL = firstBench?.benchL || "100";

  return (
    <div>
      {/* Context strip showing what's set on main tab */}
      {(form.containerId || form.isCased !== undefined) && (() => {
        const c = containers.find(x => x.id === form.containerId);
        return (
          <div style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>🪴</span>
            <div style={{ fontSize: 12, color: "#2e5c1e" }}>
              {c ? <><strong>{c.name}</strong>{c.diameter ? ` · ${c.diameter}"` : ""}</> : <span style={{ color: "#aabba0" }}>No container selected</span>}
              <span style={{ color: "#7a8c74", marginLeft: 10 }}>{(form.isCased ?? true) ? "· Cased → Tight spacing default" : "· Open container → standard spacing"}</span>
            </div>
            <span style={{ fontSize: 11, color: "#7a8c74", marginLeft: "auto" }}>Set on Crop & Schedule tab</span>
          </div>
        );
      })()}

      <SH c="Spacing Profile" mt={0} />

      {/* Auto-resolved indicator */}
      {resolved && !form.spacingOverride && (
        <div style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>
              Auto-resolved: <span style={{ color: "#1e2d1a" }}>{resolved.profile.name}</span>
            </div>
            <div style={{ fontSize: 11, color: "#7a8c74" }}>
              Matched by {resolved.source === "crop" ? `crop name "${form.cropName}"` : `container "${containers.find(c=>c.id===form.containerId)?.name}"`}
              {preferTight && " · Cased product → Tight stage only"}
            </div>
          </div>
          <button onClick={() => { upd("spacingOverride", true); upd("spacingProfileId", resolved.profile.id); }}
            style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "5px 12px", fontSize: 11, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
            Override
          </button>
        </div>
      )}

      {/* Manual profile picker */}
      {(form.spacingOverride || !resolved) && (
        <div style={{ marginBottom: 12 }}>
          <FL c={form.spacingOverride ? "Override Profile" : "Select Profile"} />
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...IS(false), flex: 1 }} value={form.spacingProfileId || ""}
              onChange={e => upd("spacingProfileId", e.target.value)}>
              <option value="">— Choose from spacing library —</option>
              {["crop","container","general"].map(tag => {
                const group = spacingProfiles.filter(p => p.tag === tag);
                if (!group.length) return null;
                const labels = { crop: "Crop-Based", container: "Container-Based", general: "General" };
                return <optgroup key={tag} label={labels[tag]}>{group.map(p => <option key={p.id} value={p.id}>{p.name}{p.cropRef ? ` — ${p.cropRef}` : ""}{p.containerRef ? ` — ${p.containerRef}` : ""}</option>)}</optgroup>;
              })}
            </select>
            {form.spacingOverride && (
              <button onClick={() => { upd("spacingOverride", false); upd("spacingProfileId", null); }}
                style={{ background: "none", border: "1px solid #c8e0b8", borderRadius: 8, padding: "0 12px", fontSize: 11, color: "#7fb069", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                ↩ Auto-resolve
              </button>
            )}
          </div>
          {spacingProfiles.length === 0 && (
            <div style={{ fontSize: 12, color: "#aabba0", marginTop: 6 }}>No spacing profiles yet — build them in the Spacing Library module first</div>
          )}
        </div>
      )}

      {/* Spacing detail for active profile */}
      {activeProfile && (
        <div style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "16px 18px", marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 12 }}>
            {preferTight ? "Tight Spacing (Cased)" : "Spacing Stages"}
            {preferTight && <span style={{ marginLeft: 8, fontSize: 10, color: "#4a90d9", fontWeight: 400, textTransform: "none" }}>Spaced & Finish stages apply after uncasing</span>}
          </div>
          {activeStages.length === 0 && (
            <div style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic" }}>
              {preferTight ? "No Tight stage defined on this profile — add one in the Spacing Library" : "No active stages on this profile"}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {activeStages.map(s => {
              const d = activeProfile.stages[s.id];
              const sf = calcSqFt(d.x, d.y);
              const pots = calcPotsPerBench(d.x, d.y || d.x, benchW, benchL);
              return (
                <div key={s.id} style={{ background: "#fff", borderRadius: 10, border: `1.5px solid ${s.color}33`, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>{s.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 12, color: s.color }}>{s.label}</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1e2d1a", marginBottom: 2 }}>{d.x}″{d.y && d.y !== d.x ? ` × ${d.y}″` : ""}</div>
                  {sf && <div style={{ fontSize: 12, color: "#7a8c74" }}>{sf} sf/pot · {Math.round(144 / (Number(d.x) * Number(d.y || d.x)))} pots/sf</div>}
                  {pots && <div style={{ fontSize: 11, color: s.color, fontWeight: 700, marginTop: 4 }}>{pots.toLocaleString()} pots on {benchW}′×{benchL}′ bench</div>}
                  {d.note && <div style={{ fontSize: 10, color: "#aabba0", marginTop: 6, fontStyle: "italic" }}>{d.note}</div>}
                </div>
              );
            })}
          </div>
          {/* Show all stages dimmed if preferTight */}
          {preferTight && (
            <div style={{ marginTop: 10 }}>
              {STAGE_DEFS.filter(s => s.id !== "tight" && activeProfile.stages?.[s.id]?.enabled).map(s => {
                const d = activeProfile.stages[s.id];
                const sf = calcSqFt(d.x, d.y);
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, background: "#f0f5ee", marginBottom: 4, opacity: 0.6 }}>
                    <span style={{ fontSize: 12 }}>{s.icon}</span>
                    <span style={{ fontSize: 11, color: "#7a8c74", fontWeight: 600 }}>{s.label} (after uncasing)</span>
                    <span style={{ fontSize: 11, color: "#1e2d1a", marginLeft: "auto" }}>{d.x}″{d.y && d.y !== d.x ? ` × ${d.y}″` : ""}{sf ? ` · ${sf} sf/pot` : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SOURCING SECTION ──────────────────────────────────────────────────────────
const MATERIAL_TYPES = [
  { id: "urc",   label: "URC",   desc: "Unrooted cutting",    icon: "URC",   color: "#8e44ad", bg: "#f5f0ff" },
  { id: "seed",  label: "Seed",  desc: "Pelletized or raw",   icon: "SEED",  color: "#c8791a", bg: "#fff4e8" },
  { id: "liner", label: "Liner", desc: "Finished plug/liner", icon: "LINER", color: "#2e7d9e", bg: "#e8f4f8" },
];
const URC_TRAY_SIZES = ["50", "72", "84", "102"];

function useBrokerLookup() {
  const { rows: catalogs } = useBrokerCatalogs ? useBrokerCatalogs() : { rows: [] };
  const getBrokerNames = () => [...new Set(catalogs.map(c => c.brokerName).filter(Boolean))].sort();
  const getCultivars = (brokerName) => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items || []);
    return [...new Set(items.map(i => i.crop).filter(Boolean))].sort();
  };
  const getSuppliers = (brokerName, cultivar) => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items || []);
    const filtered = cultivar ? items.filter(i => i.crop === cultivar) : items;
    return [...new Set(filtered.map(i => i.supplier || i.breeder).filter(Boolean))].sort();
  };
  const getVarieties = (brokerName, cultivar, supplier, query = "") => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items || []);
    return items.filter(item => {
      const matchesCrop     = !cultivar  || item.crop === cultivar;
      const matchesSupplier = !supplier  || item.supplier === supplier || item.breeder === supplier;
      const q = query.toLowerCase();
      const matchesQuery    = !q || (item.varietyName||"").toLowerCase().includes(q) || (item.color||"").toLowerCase().includes(q) || (item.series||"").toLowerCase().includes(q) || (item.itemNumber||"").includes(q);
      return matchesCrop && matchesSupplier && matchesQuery;
    });
  };
  // Get unique series/variety names for a crop
  const getSeries = (brokerName, cultivar, supplier) => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items || []);
    const filtered = items.filter(i =>
      (!cultivar || i.crop === cultivar) &&
      (!supplier || i.supplier === supplier || i.breeder === supplier)
    );
    return [...new Set(filtered.map(i => i.varietyName || i.series).filter(Boolean))].sort();
  };
  // Get colors for a specific series from a broker
  const getColors = (brokerName, cultivar, seriesName) => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items || []);
    return items.filter(i =>
      (!cultivar || i.crop === cultivar) &&
      (i.varietyName === seriesName || i.series === seriesName)
    );
  };
  return { getBrokerNames, getCultivars, getSuppliers, getVarieties, getSeries, getColors };
}

function SourcingSection({ form, upd, focus, setFocus }) {
  const mt = MATERIAL_TYPES.find(m => m.id === form.materialType) || MATERIAL_TYPES[0];
  const units = form.cases && form.packSize ? Number(form.cases) * Number(form.packSize) : 0;
  const buffered = units > 0 ? Math.ceil(units * (1 + (Number(form.bufferPct) || 0) / 100)) : 0;
  const totalCost = buffered && form.unitCost ? (buffered * Number(form.unitCost)).toFixed(2) : null;
  const { getBrokerNames, getCultivars, getSuppliers, getSeries, getColors } = useBrokerLookup();
  const brokerNames = getBrokerNames();
  const [cultivarFilter, setCultivarFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [selectedSeries, setSelectedSeries] = useState(new Set());
  const cultivars = form.sourcingBroker ? getCultivars(form.sourcingBroker) : [];
  const suppliers = form.sourcingBroker ? getSuppliers(form.sourcingBroker, cultivarFilter) : [];
  const allSeries = form.sourcingBroker ? getSeries(form.sourcingBroker, cultivarFilter, supplierFilter) : [];
  const filteredSeries = seriesQuery ? allSeries.filter(s => s.toLowerCase().includes(seriesQuery.toLowerCase())) : allSeries;
  
  // Determine split increment based on material type
  const splitIncrement = (() => {
    if (form.materialType === "liner" && form.linerSize) {
      const match = String(form.linerSize).match(/[0-9]+/);
      return match ? Number(match[0]) : 100;
    }
    return 100; // URC and everything else: 100
  })();

  // Add a color row for a series - splits evenly in the right increment
  const addColorRow = (seriesName) => {
    const catalogItems = getColors(form.sourcingBroker, cultivarFilter, seriesName);
    const firstItem = catalogItems[0];
    const price = firstItem ? (firstItem.unitPrice || firstItem.sellPrice) : null;
    // perQty may be "100", 100, "100 URCs", or absent. Parse out the number.
    const perQtyRaw = firstItem?.perQty;
    const perQtyNum = perQtyRaw ? (Number(String(perQtyRaw).replace(/[^0-9.]/g, "")) || 100) : 100;
    // If unitPrice is stored as price-per-unit already (no perQty in catalog), use directly
    const costPerUnit = price ? (perQtyRaw ? (Number(price) / perQtyNum).toFixed(4) : Number(price).toFixed(4)) : "";
    const existing = form.varieties || [];
    const packSize = Number(form.packSize) || 10;
    const targetUnits = form.cases ? Number(form.cases) * packSize : 0;
    const newCount = existing.length + 1;
    const unitsPerSlot = targetUnits > 0 ? Math.floor(targetUnits / newCount / splitIncrement) * splitIncrement : 0;
    const evenCases = unitsPerSlot > 0 ? Math.floor(unitsPerSlot / packSize) : 0;
    const rebalanced = existing.map(v => ({ ...v, cases: evenCases }));
    // remainder goes to the new row only — based on newCount not existing.length
    const remainder = form.cases ? Math.max(0, Number(form.cases) - evenCases * newCount) : 0;
    const newVar = {
      id: crypto.randomUUID(),
      cultivar: cultivarFilter || firstItem?.crop || "",
      name: seriesName,
      color: "",
      ballItemNumber: "",
      cases: evenCases + remainder,
      costPerUnit,
      broker: form.sourcingBroker || "",
      supplier: supplierFilter || firstItem?.supplier || firstItem?.breeder || "",
      _seriesName: seriesName,
      _catalogColors: catalogItems.map(i => {
        const rawPrice = i.unitPrice || i.sellPrice;
        const perQtyRaw = i.perQty;
        const perQtyNum = perQtyRaw ? (Number(String(perQtyRaw).replace(/[^0-9.]/g, "")) || 100) : null;
        const unitPrice = rawPrice ? (perQtyNum ? Number(rawPrice) / perQtyNum : Number(rawPrice)) : null;
        return { label: i.color || i.varietyName || "", itemNumber: i.itemNumber, price: unitPrice, rawPrice, perQty: perQtyNum };
      }).filter(c => c.label),
      tags: [],
    };
    form.varieties?.length > 0 
      ? upd("varieties", [...rebalanced, newVar])
      : upd("varieties", [newVar]);
  };

  return (
    <div>
      <SH c="Material Type" mt={0} />
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {MATERIAL_TYPES.map(m => (
          <button key={m.id} onClick={() => upd("materialType", m.id)}
            style={{ flex: 1, padding: "12px 10px", borderRadius: 12, border: `2px solid ${form.materialType === m.id ? m.color : "#e0ead8"}`, background: form.materialType === m.id ? m.bg : "#fafcf8", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all .15s" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{m.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: form.materialType === m.id ? m.color : "#7a8c74" }}>{m.label}</div>
            <div style={{ fontSize: 10, color: "#aabba0", marginTop: 2 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* URC fields */}
      {form.materialType === "urc" && (<>
        <SH c="Prop Tray Size" />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {URC_TRAY_SIZES.map(sz => (
            <button key={sz} onClick={() => upd("propTraySize", sz)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: `1.5px solid ${form.propTraySize === sz ? "#8e44ad" : "#c8d8c0"}`, background: form.propTraySize === sz ? "#f5f0ff" : "#fff", color: form.propTraySize === sz ? "#8e44ad" : "#7a8c74", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {sz}
              <div style={{ fontSize: 9, fontWeight: 500, marginTop: 2 }}>cell</div>
            </button>
          ))}
          <div style={{ flex: 1 }}>
            <input style={{ ...IS(focus === "propTrayCustom"), textAlign: "center" }}
              value={URC_TRAY_SIZES.includes(form.propTraySize) ? "" : (form.propTraySize || "")}
              onChange={e => upd("propTraySize", e.target.value)}
              onFocus={() => setFocus("propTrayCustom")} onBlur={() => setFocus(null)}
              placeholder="Other" />
          </div>
        </div>
      </>)}

      {/* Seed fields */}
      {form.materialType === "seed" && (<>
        <SH c="Seed Form" />
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["pelletized", "raw"].map(sf => (
            <button key={sf} onClick={() => upd("seedForm", sf)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1.5px solid ${form.seedForm === sf ? "#c8791a" : "#c8d8c0"}`, background: form.seedForm === sf ? "#fff4e8" : "#fff", color: form.seedForm === sf ? "#c8791a" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
              {sf}
            </button>
          ))}
        </div>
        <SH c="Prop Tray Size" />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {URC_TRAY_SIZES.map(sz => (
            <button key={sz} onClick={() => upd("propTraySize", sz)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: `1.5px solid ${form.propTraySize === sz ? "#c8791a" : "#c8d8c0"}`, background: form.propTraySize === sz ? "#fff4e8" : "#fff", color: form.propTraySize === sz ? "#c8791a" : "#7a8c74", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {sz}<div style={{ fontSize: 9, fontWeight: 500, marginTop: 2 }}>cell</div>
            </button>
          ))}
          <div style={{ flex: 1 }}>
            <input style={{ ...IS(focus === "propTrayCustom"), textAlign: "center" }}
              value={URC_TRAY_SIZES.includes(form.propTraySize) ? "" : (form.propTraySize || "")}
              onChange={e => upd("propTraySize", e.target.value)}
              onFocus={() => setFocus("propTrayCustom")} onBlur={() => setFocus(null)}
              placeholder="Other" />
          </div>
        </div>
      </>)}

      {/* Liner fields */}
      {form.materialType === "liner" && (<>
        <SH c="Liner Size" />
        <div style={{ marginBottom: 16 }}>
          <input style={IS(focus === "linerSize")} value={form.linerSize || ""} onChange={e => upd("linerSize", e.target.value)}
            onFocus={() => setFocus("linerSize")} onBlur={() => setFocus(null)}
            placeholder="e.g. 84-cell liner, 4in liner, Lin30mm" />
        </div>
      </>)}

      {/* Plants per pot */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Plants Per Pot</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[1, 2, 3].map(n => (
            <button key={n} onClick={() => upd("plantsPerPot", n)}
              style={{ width: 48, height: 40, borderRadius: 8, border: `2px solid ${(form.plantsPerPot || 1) === n ? "#7fb069" : "#c8d8c0"}`, background: (form.plantsPerPot || 1) === n ? "#f0f8eb" : "#fff", color: (form.plantsPerPot || 1) === n ? "#2e5c1e" : "#7a8c74", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
              {n}
            </button>
          ))}
          <input type="number" min="1" max="10"
            value={(form.plantsPerPot || 1) > 3 ? form.plantsPerPot : ""}
            onChange={e => upd("plantsPerPot", Math.max(1, Number(e.target.value)))}
            placeholder="Other"
            style={{ width: 70, border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
          {(form.plantsPerPot || 1) > 1 && form.cases && (
            <div style={{ background: "#fff8e8", border: "1px solid #f0d080", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7a5a10", fontWeight: 600 }}>
              {Number(form.cases) * (Number(form.packSize) || 1)} pots × {form.plantsPerPot} plants = <strong>{Number(form.cases) * (Number(form.packSize) || 1) * form.plantsPerPot} plants to order</strong>
            </div>
          )}
        </div>
        {(form.plantsPerPot || 1) > 1 && <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>Variety quantities below are in plants — tags are still ordered per pot</div>}
      </div>

      <SH c="Broker & Varieties" />
      {/* Row 1: Broker · Supplier · Crop Species */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <FL c="Broker" />
          {brokerNames.length > 0 ? (
            <select style={IS(false)} value={form.sourcingBroker || ""} onChange={e => { upd("sourcingBroker", e.target.value); setCultivarFilter(""); setSupplierFilter(""); setSeriesQuery(""); setSelectedSeries(new Set()); }}>
              <option value="">— Select broker —</option>
              {brokerNames.map(b => <option key={b} value={b}>{b}</option>)}
              <option value="__other__">Other (type below)</option>
            </select>
          ) : (
            <input style={IS(focus === "sBroker")} value={form.sourcingBroker || ""} onChange={e => upd("sourcingBroker", e.target.value)}
              onFocus={() => setFocus("sBroker")} onBlur={() => setFocus(null)} placeholder="e.g. Ball Seed" />
          )}
          {form.sourcingBroker === "__other__" && (
            <input style={{ ...IS(focus === "sBrokerOther"), marginTop: 6 }} value={form.sourcingBrokerCustom || ""} onChange={e => upd("sourcingBrokerCustom", e.target.value)}
              onFocus={() => setFocus("sBrokerOther")} onBlur={() => setFocus(null)} placeholder="Enter broker name" />
          )}
        </div>
        <div>
          <FL c="Supplier" />
          {/* Always show dropdown if catalog has suppliers for this broker+species, else text input */}
          {suppliers.length > 0 ? (
            <select style={IS(false)} value={supplierFilter || form.sourcingSupplier || ""} onChange={e => {
              setSupplierFilter(e.target.value);
              upd("sourcingSupplier", e.target.value);
              setSeriesQuery("");
              setSelectedSeries(new Set());
            }}>
              <option value="">— All suppliers —</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input style={IS(focus === "sSupplier")} value={form.sourcingSupplier || ""} onChange={e => { upd("sourcingSupplier", e.target.value); setSupplierFilter(e.target.value); }}
              onFocus={() => setFocus("sSupplier")} onBlur={() => setFocus(null)} placeholder="e.g. Dümmen Orange" />
          )}
        </div>
        <div>
          <FL c="Crop Species" />
          {cultivars.length > 0 ? (
            <select style={IS(false)} value={cultivarFilter} onChange={e => { setCultivarFilter(e.target.value); setSupplierFilter(""); setSeriesQuery(""); setSelectedSeries(new Set()); }}>
              <option value="">— All species —</option>
              {cultivars.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input style={IS(focus === "cultivar")} value={cultivarFilter} onChange={e => setCultivarFilter(e.target.value)}
              onFocus={() => setFocus("cultivar")} onBlur={() => setFocus(null)} placeholder="e.g. Begonia Reiger" />
          )}
        </div>
      </div>

      {/* Variety / Series picker */}
      {form.sourcingBroker && form.sourcingBroker !== "__other__" && (
        <div style={{ marginBottom: 16, background: "#fafaf8", border: "1.5px solid #e0ead8", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f0f0ea", display: "flex", gap: 10, alignItems: "center" }}>
            <input value={seriesQuery} onChange={e => setSeriesQuery(e.target.value)} placeholder="Search varieties..."
              style={{ flex: 1, border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff" }} />
            {filteredSeries.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4a5a40", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox"
                  checked={filteredSeries.length > 0 && filteredSeries.every(s => selectedSeries.has(s))}
                  onChange={e => {
                    if (e.target.checked) setSelectedSeries(new Set(filteredSeries));
                    else setSelectedSeries(new Set());
                  }}
                  style={{ accentColor: "#7fb069", width: 15, height: 15 }} />
                Select all ({filteredSeries.length})
              </label>
            )}
          </div>

          {filteredSeries.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "#aabba0", fontSize: 13 }}>
              {form.sourcingBroker ? "No varieties found — try adjusting filters" : "Select a broker to see varieties"}
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {filteredSeries.map(s => {
                const isChecked = selectedSeries.has(s);
                const colors = getColors(form.sourcingBroker, cultivarFilter, s);
                const price = colors[0] ? (colors[0].unitPrice || colors[0].sellPrice) : null;
                return (
                  <label key={s} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid #f5f5f0", background: isChecked ? "#f0f8eb" : "#fff", cursor: "pointer" }}>
                    <input type="checkbox" checked={isChecked}
                      onChange={e => {
                        const next = new Set(selectedSeries);
                        e.target.checked ? next.add(s) : next.delete(s);
                        setSelectedSeries(next);
                      }}
                      style={{ accentColor: "#7fb069", width: 15, height: 15, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a1a" }}>{s}</div>
                      <div style={{ fontSize: 11, color: "#aabba0" }}>{colors.length} color{colors.length !== 1 ? "s" : ""}{cultivarFilter ? ` · ${cultivarFilter}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 12, color: "#2e7a2e", fontWeight: 700 }}>{price ? `$${Number(price).toFixed(4)}` : "—"}</div>
                  </label>
                );
              })}
            </div>
          )}

          {/* Add Plant button */}
          {selectedSeries.size > 0 && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid #d8eed0", background: "#f0f8eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "#2e5c1e" }}>{selectedSeries.size} variet{selectedSeries.size !== 1 ? "ies" : "y"} selected</div>
              <button onClick={() => {
                  [...selectedSeries].forEach(s => addColorRow(s));
                  setSelectedSeries(new Set());
                }}
                style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add Plant{selectedSeries.size > 1 ? "s" : ""}
              </button>
            </div>
          )}
        </div>
      )}

      <SH c="Cost & Buffer" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
        <div>
          <FL c={`Unit Cost ($ / ${mt.label.toLowerCase()})`} />
          <input type="number" step="0.001" style={IS(focus === "unitCost")} value={form.unitCost || ""}
            onChange={e => upd("unitCost", e.target.value)}
            onFocus={() => setFocus("unitCost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.42" />
        </div>
        <div>
          <FL c="Loss Buffer %" />
          <div style={{ display: "flex", gap: 6 }}>
            {[5, 10, 15, 20].map(n => (
              <button key={n} onClick={() => upd("bufferPct", n)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1.5px solid ${Number(form.bufferPct) === n ? "#7fb069" : "#c8d8c0"}`, background: Number(form.bufferPct) === n ? "#f0f8eb" : "#fff", color: Number(form.bufferPct) === n ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{n}%</button>
            ))}
          </div>
          <input type="number" min="0" max="50" style={{ ...IS(focus === "bufPct"), marginTop: 6, fontSize: 12 }}
            value={form.bufferPct ?? 10} onChange={e => upd("bufferPct", e.target.value)}
            onFocus={() => setFocus("bufPct")} onBlur={() => setFocus(null)} placeholder="%" />
        </div>
        <div>
          <FL c="Order Summary" />
          <div style={{ background: totalCost ? "#f0f8eb" : "#f8faf6", border: `1.5px solid ${totalCost ? "#c8e0b8" : "#e0ead8"}`, borderRadius: 8, padding: "10px 12px" }}>
            {units > 0 ? (<>
              <div style={{ fontSize: 12, color: "#7a8c74" }}>Base: <span style={{ fontWeight: 700, color: "#1e2d1a" }}>{units.toLocaleString()}</span> units</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Order: <span style={{ fontWeight: 800, color: mt.color, fontSize: 14 }}>{buffered.toLocaleString()}</span> {mt.label}s</div>
              {totalCost && <div style={{ fontSize: 13, fontWeight: 800, color: "#2e5c1e", marginTop: 4 }}>≈ ${Number(totalCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>}
            </>) : (
              <div style={{ fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>Set case quantity on Crop & Schedule tab</div>
            )}
          </div>
        </div>
      </div>

      {/* Sourcing summary pill */}
      {(form.sourcingBroker || form.propTraySize || form.linerSize) && (
        <div style={{ background: `${mt.bg}`, border: `1px solid ${mt.color}30`, borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <span style={{ fontSize: 14 }}>{mt.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: mt.color }}>{mt.label}</span>
          {form.propTraySize && <span style={{ fontSize: 12, color: "#1e2d1a" }}>· {form.propTraySize}-cell tray</span>}
          {form.linerSize && <span style={{ fontSize: 12, color: "#1e2d1a" }}>· {form.linerSize}</span>}
          {form.seedForm && form.materialType === "seed" && <span style={{ fontSize: 12, color: "#1e2d1a", textTransform: "capitalize" }}>· {form.seedForm}</span>}
          {form.sourcingBroker && <span style={{ fontSize: 12, color: "#7a8c74" }}>via {form.sourcingBroker}</span>}
          {form.sourcingSupplier && <span style={{ fontSize: 12, color: "#aabba0" }}>/ {form.sourcingSupplier}</span>}
        </div>
      )}
    </div>
  );
}

// ── ORDER REVIEW MODAL ────────────────────────────────────────────────────────
function OrderReviewModal({ form, containers, onClose, onSave }) {
  const isCased = form.isCased ?? true;
  const pSize = isCased ? (Number(form.packSize) || 10) : 1;
  const selC = containers.find(c => c.id === form.containerId);
  const varieties = form.varieties || [];
  const plantsPerPot = Number(form.plantsPerPot) || 1;

  // Group by broker + supplier
  const brokerMap = {};
  varieties.forEach(v => {
    const key = [v.broker || "Unassigned", v.supplier || "—"].join(" | ");
    if (!brokerMap[key]) brokerMap[key] = { broker: v.broker || "Unassigned", supplier: v.supplier || "—", lines: [] };
    brokerMap[key].lines.push(v);
  });
  const groups = Object.values(brokerMap);

  async function downloadXLSX() {
    const XLSX = await new Promise((res, rej) => {
      if (window.XLSX) { res(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX); s.onerror = rej;
      document.head.appendChild(s);
    });

    const wb = XLSX.utils.book_new();

    groups.forEach(({ broker, supplier, lines }) => {
      const rows = [
        ["Crop Run Order", form.cropName, "", "", ""],
        ["Broker", broker, "Supplier", supplier, ""],
        ["Target Week", form.targetWeek ? `Wk ${form.targetWeek} ${form.targetYear}` : "—", "", "", ""],
        [],
        ["Crop", "Series / Variety", "Color", "Item #", "Plants to Order", "Cases", "Cost/Plant", "Line Cost"],
        ...lines.map(v => {
          const plants = (Number(v.cases) || 0) * pSize * plantsPerPot;
          const lineCost = v.costPerUnit && plants ? (Number(v.costPerUnit) * plants).toFixed(2) : "";
          return [
            v.cultivar || form.cropName,
            v.name || "",
            v.color || "",
            v.ballItemNumber || "",
            plants,
            v.cases || "",
            v.costPerUnit ? Number(v.costPerUnit).toFixed(4) : "",
            lineCost,
          ];
        }),
        [],
        ["TOTALS", "", "", "",
          lines.reduce((s, v) => s + (Number(v.cases)||0) * pSize * plantsPerPot, 0),
          lines.reduce((s, v) => s + (Number(v.cases)||0), 0),
          "",
          lines.reduce((s, v) => { const p = (Number(v.cases)||0)*pSize*plantsPerPot; return s + (v.costPerUnit && p ? Number(v.costPerUnit)*p : 0); }, 0).toFixed(2),
        ],
      ];
      // Add tag row if needed
      if (form.needsTags) {
        const tagQty = Number(form.tagOrderQty) || ((Number(form.cases)||0) * 10);
        rows.push([]);
        rows.push(["TAG ORDER", form.tagDescription || "", form.tagSupplier || "", form.tagPrintInHouse ? "Print in-house" : "Order", tagQty, "", form.tagCostPerTag || "", form.tagCostPerTag ? (tagQty * Number(form.tagCostPerTag)).toFixed(2) : ""]);
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [20,25,20,15,15,10,12,12].map(w => ({ wch: w }));
      const sheetName = (broker + " - " + supplier).replace(/[\/\\:*?[\]]/g, "").slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    const filename = ("Order_" + form.cropName + "_" + groups.map(g => g.broker).filter((v,i,a)=>a.indexOf(v)===i).join("-") + "_Wk" + (form.targetWeek||"TBD") + ".xlsx").replace(/[^a-zA-Z0-9_.-]/g, "_");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "24px 16px" }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 700, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ background: "#1e2d1a", borderRadius: "18px 18px 0 0", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#c8e6b8" }}>🌱 Plant Order Review</div>
            <div style={{ fontSize: 13, color: "#7a9a6a", marginTop: 4 }}>{form.cropName}{form.targetWeek ? ` · Wk ${form.targetWeek} ${form.targetYear}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 24, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: "24px 28px" }}>
          {/* Summary strip */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              { label: "Container", value: selC?.name || "—" },
              { label: "Total Pots", value: ((Number(form.cases)||0) * pSize).toLocaleString() },
              { label: "Plants/Pot", value: plantsPerPot },
              { label: "Varieties", value: varieties.length },
              { label: "Brokers", value: groups.length },
            ].map(s => (
              <div key={s.label} style={{ background: "#f8faf6", borderRadius: 10, padding: "10px 16px", minWidth: 90 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>{s.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Order lines by broker/supplier */}
          {groups.map(({ broker, supplier, lines }) => {
            const groupPlants = lines.reduce((s,v) => s + (Number(v.cases)||0)*pSize*plantsPerPot, 0);
            const groupCost = lines.reduce((s,v) => { const p=(Number(v.cases)||0)*pSize*plantsPerPot; return s+(v.costPerUnit&&p?Number(v.costPerUnit)*p:0); }, 0);
            return (
              <div key={broker+supplier} style={{ marginBottom: 20, border: "1.5px solid #e0ead8", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ background: "#f0f8eb", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{broker}</div>
                    <div style={{ fontSize: 12, color: "#7a8c74" }}>Supplier: {supplier}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>{groupPlants.toLocaleString()} plants</div>
                    {groupCost > 0 && <div style={{ fontSize: 12, color: "#8e44ad" }}>${groupCost.toFixed(2)}</div>}
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e0ead8", background: "#fafcf8" }}>
                      {["Series", "Color", "Item #", "Plants", "$/plant"].map(h => (
                        <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((v, i) => {
                      const plants = (Number(v.cases)||0) * pSize * plantsPerPot;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{v.name || v.cultivar || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#4a5a40" }}>{v.color || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#7a8c74", fontFamily: "monospace", fontSize: 11 }}>{v.ballItemNumber || "—"}</td>
                          <td style={{ padding: "8px 12px", fontWeight: 700 }}>{plants.toLocaleString()}</td>
                          <td style={{ padding: "8px 12px", color: "#8e44ad" }}>{v.costPerUnit ? `$${Number(v.costPerUnit).toFixed(4)}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Tag summary */}
          {form.needsTags && (
            <div style={{ background: "#fdf8ff", border: "1.5px solid #d0a8e8", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#6a2a9a", marginBottom: 6 }}>🏷 Tag Order</div>
              <div style={{ fontSize: 13, color: "#1e2d1a" }}>
                {form.tagDescription || form.cropName + " tags"} · {form.tagOrderQty || ((Number(form.cases)||0)*10)} tags · {form.tagPrintInHouse ? "🖨 Print in-house" : `📦 ${form.tagSupplier || "order from supplier"}`}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={downloadXLSX}
              style={{ flex: 1, background: "#2e5c1e", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              📥 Download Order (.xlsx)
            </button>
            <button onClick={() => { onSave(); onClose(); }}
              style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "13px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✅ Confirm Order
            </button>
            <button onClick={onClose}
              style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "13px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── CROP RUN FORM ─────────────────────────────────────────────────────────────

// ── CROP RUN TEMPLATES ────────────────────────────────────────────────────────
const TEMPLATE_KEY = "gh_crop_run_templates_v1";

function useCropRunTemplates() {
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || "[]"); } catch { return []; }
  });

  const save = (name, form) => {
    // Strip run-specific fields — keep everything reusable
    const { id, cases, targetWeek, targetYear, status, groupNumber,
            indoorAssignments, outsideAssignments, ...rest } = form;
    const tpl = { id: crypto.randomUUID(), name: name.trim(), savedAt: Date.now(), ...rest };
    const next = [tpl, ...templates.filter(t => t.name !== name.trim())];
    setTemplates(next);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    return tpl;
  };

  const remove = (id) => {
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
  };

  return { templates, save, remove };
}

function CropRunForm({ initial, onSave, onCancel, houses, pads, spacingProfiles, containers, varietyLibrary, currentYear, allRuns = [] }) {
  const blank = {
    cropName: "", groupNumber: "",
    cases: "", packSize: 10,
    isCased: true,
    containerId: "", spacingProfileId: "", spacingOverride: false,
    varieties: [],
    targetWeek: "", targetYear: currentYear,
    weeksProp: "", weeksIndoor: "", weeksOutdoor: "",
    movesOutside: false,
    sensitivity: "tender", minTempOverride: "",
    tempGroup: "",
    needsSpacing: false,
    indoorAssignments: [], outsideAssignments: [],
    status: "planned", notes: "",
    // Sourcing
    materialType: "urc",   // urc | seed | liner
    propTraySize: "",       // for urc/seed: 50 | 72 | 84 | 102 | custom
    linerSize: "",          // for liner
    seedForm: "pelletized", // for seed: pelletized | raw
    sourcingBroker: "",
    sourcingSupplier: "",
    unitCost: "",
    bufferPct: 10,
    // Planting density
    plantsPerPot: 1,
    // Tags
    needsTags: true,
    tagDescription: "",
    tagPrintInHouse: false,
    tagSupplier: "",
    tagOrderQty: "",   // auto-calculated but overridable
    tagCostPerTag: "",
    tagNotes: "",
  };
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [focus, setFocus] = useState(null);
  const [tab, setTab] = useState("main");
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showOrderReview, setShowOrderReview] = useState(false);
  const [showTagReview, setShowTagReview] = useState(false);
  const [runSaved, setRunSaved] = useState(!!initial);
  const { templates, save: saveTemplate, remove: removeTemplate } = useCropRunTemplates();

  const upd = (f, v) => setForm(x => ({ ...x, [f]: v }));

  const applyTemplate = (tpl) => {
    const { id, name, savedAt, ...rest } = tpl;
    setForm(x => ({ ...x, ...rest }));
    setShowTemplates(false);
  };

  const handleSaveTemplate = () => {
    if (!saveTemplateName.trim()) return;
    saveTemplate(saveTemplateName, form);
    setTemplateSaved(true);
    setTimeout(() => { setTemplateSaved(false); setSaveTemplateName(""); }, 2000);
  };
  const units = form.cases && form.packSize ? Number(form.cases) * Number(form.packSize) : null;
  const sched = computeSchedule(form);
  const s = sens(form.sensitivity);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit Crop Run" : "New Crop Run"}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {templates.length > 0 && (
            <button onClick={() => setShowTemplates(v => !v)}
              style={{ background: showTemplates ? "#7fb069" : "none", border: "1.5px solid #7fb069", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: showTemplates ? "#fff" : "#7fb069", cursor: "pointer", fontFamily: "inherit" }}>
              📋 Templates ({templates.length})
            </button>
          )}
          {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
        </div>
      </div>

      {/* Template picker dropdown */}
      {showTemplates && (
        <div style={{ background: "#f0f8eb", borderBottom: "1.5px solid #c8e0b8", padding: "14px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#4a7a3a", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>Load a Template</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {templates.map(tpl => (
              <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1.5px solid #c8e0b8", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{tpl.name}</div>
                  <div style={{ fontSize: 11, color: "#aabba0" }}>
                    {[tpl.cropName, tpl.containerId ? "container set" : null, tpl.sourcingBroker, tpl.materialType?.toUpperCase()].filter(Boolean).join(" · ")}
                    {" · saved "}{new Date(tpl.savedAt).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={() => applyTemplate(tpl)}
                  style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  Load
                </button>
                <button onClick={() => removeTemplate(tpl.id)}
                  style={{ background: "none", border: "1px solid #e0b0b0", borderRadius: 7, padding: "6px 10px", fontSize: 12, color: "#c04040", cursor: "pointer", fontFamily: "inherit" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 10 }}>⚠ Loading fills all fields except quantity, target week, and space assignments</div>
        </div>
      )}

      <div style={{ padding: "22px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1.5px solid #e0ead8", marginBottom: 22 }}>
          {[["main","Crop & Schedule"],["space","Space Assignment"],["spacing","Spacing"],["order","Order"],["tags","🏷 Tags"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: `3px solid ${tab === id ? "#7fb069" : "transparent"}`, padding: "10px 18px", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? "#1e2d1a" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        {/* ── MAIN TAB ── */}
        {tab === "main" && (<>
          <SH c="Crop Identity" mt={0} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><FL c="Crop Name *" /><input style={IS(focus === "cn")} value={form.cropName} onChange={e => upd("cropName", e.target.value)} onFocus={() => setFocus("cn")} onBlur={() => setFocus(null)} placeholder="e.g. Petunia, Impatiens, Tomato" /></div>
            <div>
              <FL c="Group #" />
              <input type="number" min="1" style={IS(focus === "grp")} value={form.groupNumber || ""} onChange={e => upd("groupNumber", e.target.value)} onFocus={() => setFocus("grp")} onBlur={() => setFocus(null)} placeholder="e.g. 1" />
              <div style={{ fontSize: 10, color: "#aabba0", marginTop: 4 }}>Same crop, different cohort or house</div>
            </div>
            <div>
              <FL c="Status" />
              <select style={IS(false)} value={form.status} onChange={e => upd("status", e.target.value)}>
                {CROP_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <SH c="Container & Quantity" />
          {/* Container selector */}
          <div style={{ marginBottom: 12 }}>
            <FL c="Container / Pot Size" />
            {containers.length === 0 ? (
              <div style={{ background: "#f8faf6", border: "1.5px dashed #c8d8c0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#aabba0" }}>
                No containers in library yet —{" "}
                <span style={{ color: "#7fb069", fontWeight: 700 }}>add them in the Container Library module</span>{" "}
                and they'll appear here. You can still enter pack size manually below.
              </div>
            ) : (
              <select style={IS(false)} value={form.containerId || ""}
                onChange={e => {
                  const id = e.target.value;
                  upd("containerId", id);
                  if (!form.spacingOverride) upd("spacingProfileId", null);
                  // Auto-fill pack size from container's unitsPerCase
                  const c = containers.find(x => x.id === id);
                  if (c) {
                    // Use unitsPerCase first, fall back to potsPerCarrier
                    const caseQty = Number(c.unitsPerCase) || 0;
                    const carrierQty = Number(c.potsPerCarrier) || 0;
                    const packQty = caseQty > 1 ? caseQty : carrierQty > 1 ? carrierQty : 0;
                    upd("isCased", packQty > 1);
                    upd("packSize", packQty > 1 ? packQty : 1);
                  }
                }}>
                <option value="">— Select container —</option>
                <optgroup label="── Finished Product">
                  {containers.filter(c => c.kind === "finished").map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.diameter ? ` · ${c.diameter}"` : ""}{c.unitsPerCase ? ` · ${c.unitsPerCase}/case` : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="── Propagation / Tray">
                  {containers.filter(c => c.kind === "propagation").map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.cellsPerFlat ? ` · ${c.cellsPerFlat}-cell` : ""}{c.unitsPerCase ? ` · ${c.unitsPerCase}/case` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
            {/* Show selected container detail strip */}
            {form.containerId && (() => {
              const c = containers.find(x => x.id === form.containerId);
              if (!c) return null;
              return (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {c.diameter    && <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>{c.diameter}" dia</span>}
                  {c.heightIn    && <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>{c.heightIn}" tall</span>}
                  {c.volumeVal   && <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>{c.volumeVal} {c.volumeUnit}</span>}
                  {c.cellsPerFlat && <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>{c.cellsPerFlat} cells</span>}
                  {c.material    && <span style={{ background: "#f8faf6", border: "1px solid #e0ead8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#7a8c74" }}>{c.material}</span>}
                  {c.supplier    && <span style={{ background: "#f8faf6", border: "1px solid #e0ead8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#7a8c74" }}>{c.supplier}</span>}
                  {/* Auto-detect badge */}
                  {(() => {
                    const cQty = Number(c.unitsPerCase) || 0;
                    const pQty = Number(c.potsPerCarrier) || 0;
                    const qty = cQty > 1 ? cQty : pQty > 1 ? pQty : 0;
                    const label = cQty > 1 ? `${cQty}/case` : pQty > 1 ? `${pQty}/carrier` : null;
                    return qty > 1
                      ? <span style={{ background: "#e8f3fc", border: "1px solid #a0c4e8", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#1a4a7a", fontWeight: 700 }}>📦 {label} → {qty} per pack</span>
                      : <span style={{ background: "#fdf3ea", border: "1px solid #e8c090", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#a04010", fontWeight: 700 }}>🪴 Individual pots</span>;
                  })()}
                </div>
              );
            })()}
          </div>

          {/* Cased toggle */}
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => upd("isCased", !(form.isCased ?? true))}
              style={{ display: "flex", alignItems: "center", gap: 10, background: (form.isCased ?? true) ? "#f0f8eb" : "#fff", border: `1.5px solid ${(form.isCased ?? true) ? "#7fb069" : "#c8d8c0"}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left" }}>
              <div style={{ width: 38, height: 20, borderRadius: 10, background: (form.isCased ?? true) ? "#7fb069" : "#c8d8c0", position: "relative", flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 3, left: (form.isCased ?? true) ? 21 : 3, transition: "left .2s" }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: (form.isCased ?? true) ? "#2e5c1e" : "#7a8c74" }}>
                  {(form.isCased ?? true) ? "Cased product — pots ship in cases" : "Open / individual container"}
                </div>
                <div style={{ fontSize: 11, color: "#aabba0" }}>
                  {(form.isCased ?? true) ? "Spacing defaults to Tight until uncased" : "Spacing defaults to container standard"}
                </div>
              </div>
            </button>
          </div>

          {/* Cases / Pots, pack size, units */}
          {(form.isCased ?? true) ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><FL c="Cases" /><input type="number" style={IS(focus === "cases")} value={form.cases} onChange={e => upd("cases", e.target.value)} onFocus={() => setFocus("cases")} onBlur={() => setFocus(null)} placeholder="e.g. 400" /></div>
              <div>
                <FL c="Pack Size (units/case)" />
                <div style={{ display: "flex", gap: 5 }}>
                  {[4,6,8,10,12,18].map(n => (
                    <button key={n} onClick={() => upd("packSize", n)} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: `1.5px solid ${form.packSize === n ? "#7fb069" : "#c8d8c0"}`, background: form.packSize === n ? "#f0f8eb" : "#fff", color: form.packSize === n ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{n}</button>
                  ))}
                </div>
                {form.containerId && containers.find(x => x.id === form.containerId)?.unitsPerCase && (
                  <div style={{ fontSize: 10, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>↑ Auto-filled from container library</div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                {units && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>= {units.toLocaleString()} pots</div>}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <FL c="Pot Count" />
                <input type="number" style={IS(focus === "cases")} value={form.cases}
                  onChange={e => { upd("cases", e.target.value); upd("packSize", 1); }}
                  onFocus={() => setFocus("cases")} onBlur={() => setFocus(null)} placeholder="e.g. 5000" />
                <div style={{ fontSize: 10, color: "#aabba0", marginTop: 4 }}>Individual pots — each pot counts as 1</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                {form.cases && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>{Number(form.cases).toLocaleString()} pots</div>}
              </div>
            </div>
          )}

          <SH c="Target Ready Date" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
            <div>
              <FL c="Target Week" />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="number" min="1" max="52" style={{ ...IS(focus === "tw"), width: 80, flexShrink: 0 }} value={form.targetWeek} onChange={e => upd("targetWeek", e.target.value)} onFocus={() => setFocus("tw")} onBlur={() => setFocus(null)} placeholder="18" />
                <span style={{ fontSize: 13, color: "#7a8c74" }}>of</span>
                <input type="number" min="2024" max="2035" style={{ ...IS(focus === "ty"), width: 90, flexShrink: 0 }} value={form.targetYear} onChange={e => upd("targetYear", Number(e.target.value))} onFocus={() => setFocus("ty")} onBlur={() => setFocus(null)} />
              </div>
            </div>
            {form.targetWeek && form.targetYear && (
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>
                  Week {form.targetWeek} starts {formatWeekDate(Number(form.targetWeek), Number(form.targetYear))}
                </div>
              </div>
            )}
          </div>

          <SH c="Finish Path" />
          <div style={{ marginBottom: 16 }}>
            <Toggle value={form.movesOutside} onChange={v => upd("movesOutside", v)} label={form.movesOutside ? "Finishes outside" : "Finishes indoors"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: form.movesOutside ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <FL c="Prop weeks (before transplant)" />
              <input type="number" style={IS(focus === "wp")} value={form.weeksProp} onChange={e => upd("weeksProp", e.target.value)} onFocus={() => setFocus("wp")} onBlur={() => setFocus(null)} placeholder="e.g. 4" />
            </div>
            <div>
              <FL c={form.movesOutside ? "Weeks indoors" : "Weeks to finish (indoors)"} />
              <input type="number" style={IS(focus === "wi")} value={form.weeksIndoor} onChange={e => upd("weeksIndoor", e.target.value)} onFocus={() => setFocus("wi")} onBlur={() => setFocus(null)} placeholder="e.g. 6" />
            </div>
            {form.movesOutside && (
              <div>
                <FL c="Weeks to finish (outside)" />
                <input type="number" style={IS(focus === "wo")} value={form.weeksOutdoor} onChange={e => upd("weeksOutdoor", e.target.value)} onFocus={() => setFocus("wo")} onBlur={() => setFocus(null)} placeholder="e.g. 4" />
              </div>
            )}
          </div>

          {form.movesOutside && (<>
            <SH c="Cold Sensitivity" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
              {SENSITIVITY.map(sv => (
                <button key={sv.id} onClick={() => upd("sensitivity", sv.id)} style={{ padding: "9px 6px", borderRadius: 9, border: `1.5px solid ${form.sensitivity === sv.id ? sv.color : "#c8d8c0"}`, background: form.sensitivity === sv.id ? sv.color + "18" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: form.sensitivity === sv.id ? sv.color : "#7a8c74" }}>{sv.label}</div>
                  <div style={{ fontSize: 10, color: "#aabba0", marginTop: 2, lineHeight: 1.3 }}>{sv.desc}</div>
                  <div style={{ fontSize: 10, color: sv.color, marginTop: 3, fontWeight: 700 }}>≥{sv.minTemp}°F</div>
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
              <div>
                <FL c="Min Temp Override (°F nights)" />
                <input type="number" style={IS(focus === "mt")} value={form.minTempOverride} onChange={e => upd("minTempOverride", e.target.value)} onFocus={() => setFocus("mt")} onBlur={() => setFocus(null)} placeholder={`Default: ${s.minTemp}°F`} />
              </div>
            </div>
            {sched?.moveOut && (
              <div style={{ background: "#fff8f0", border: "1px solid #f0c080", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7a4a10", marginBottom: 8 }}>
                🌤 Move-outside target: <strong>Week {sched.moveOut.week}</strong> ({formatWeekDate(sched.moveOut.week, sched.moveOut.year)}) · bench clears at that point
              </div>
            )}
          </>)}

          {/* Schedule timeline */}
          <ScheduleTimeline sched={sched} currentYear={currentYear} movesOutside={form.movesOutside} sensitivity={form.sensitivity} />

          <div style={{ marginTop: 16 }}>
            <FL c="Notes" />
            <textarea style={TA(focus === "notes")} value={form.notes} onChange={e => upd("notes", e.target.value)} onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} placeholder="Production notes, special instructions..." />
          </div>
        </>)}

        {/* ── SOURCING TAB ── */}


        {/* ── SPACE TAB ── */}
        {tab === "space" && (<>
          <SH c="Indoor Space Assignment" mt={0} />

          {/* Temperature group for this run */}
          <div style={{ marginBottom: 14 }}>
            <FL c="Temperature Group *" />
            <div style={{ display: "flex", gap: 8 }}>
              {[["cool","❄️ Cool","Moves outside wk 12-13"],["warm","🌡 Warm","Stays inside longer"]].map(([val, label, hint]) => (
                <button key={val} type="button" onClick={() => upd("tempGroup", val)}
                  style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `2px solid ${form.tempGroup === val ? (val === "cool" ? "#4a90d9" : "#e07b39") : "#c8d8c0"}`, background: form.tempGroup === val ? (val === "cool" ? "#e8f3fc" : "#fdf3ea") : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: form.tempGroup === val ? (val === "cool" ? "#1a4a7a" : "#a04010") : "#7a8c74" }}>{label}</div>
                  <div style={{ fontSize: 10, color: "#aabba0" }}>{hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Spacing flag — only for crops that need to be spaced out (4.5" Geraniums) */}
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="needsSpacing" checked={!!form.needsSpacing} onChange={e => upd("needsSpacing", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            <label htmlFor="needsSpacing" style={{ fontSize: 13, color: "#1e2d1a", cursor: "pointer" }}>
              This run needs to be spaced out mid-season <span style={{ color: "#7a8c74", fontWeight: 400 }}>(e.g. 4.5" Geraniums — starts tight, spaces to finish density)</span>
            </label>
          </div>

          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
            {sched?.transplant ? <>Bench occupied from <strong>Wk {sched.transplant.week}</strong> ({formatWeekDate(sched.transplant.week, sched.transplant.year)}) until <strong>{form.movesOutside && sched.moveOut ? `Wk ${sched.moveOut.week} (move-out)` : `Wk ${form.targetWeek} (ready)`}</strong></> : "Set schedule on the Crop & Schedule tab first"}
          </div>
          <SpaceAssignmentPicker assignments={form.indoorAssignments} onChange={v => upd("indoorAssignments", v)} houses={houses} pads={pads} sched={sched} currentYear={currentYear} outsideOnly={false} allRuns={allRuns} currentRunId={form.id} currentRunTempGroup={form.tempGroup} varietyLibrary={varietyLibrary} form={form} containers={containers} />

          {/* ── INDOOR CAPACITY CHECK ── */}
          {form.indoorAssignments?.length > 0 && (() => {
            const selC = containers.find(c => c.id === form.containerId);
            const isCased = form.isCased ?? true;
            const pSize = isCased ? (Number(form.packSize) || 10) : 1;
            const totalPots = (Number(form.cases) || 0) * pSize;
            const cap = assignmentCapacitySummary(form.indoorAssignments, houses, pads, selC);
            const fits = cap.totalPots == null || totalPots === 0 || cap.totalPots >= totalPots;
            const overBy = cap.totalPots != null && totalPots > 0 ? totalPots - cap.totalPots : 0;
            const pct = cap.totalPots && totalPots ? Math.round((totalPots / cap.totalPots) * 100) : null;
            return (
              <div style={{ marginTop: 10, borderRadius: 10, border: `1.5px solid ${fits ? "#c8e0b8" : "#f0b0a0"}`, background: fits ? "#f0f8eb" : "#fff5f5", padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: fits ? "#2e5c1e" : "#b03020" }}>
                    {fits ? "✅ Fits in assigned space" : "⚠️ Won't fit — need more space"}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {totalPots > 0 && cap.totalPots ? `${totalPots.toLocaleString()} pots needed · ${cap.totalPots.toLocaleString()} capacity` : ""}
                  </div>
                </div>
                {/* Capacity bar */}
                {pct != null && (
                  <div style={{ background: "#e0ead8", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: fits ? "#7fb069" : "#e05030", borderRadius: 4, transition: "width .3s" }} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, fontSize: 12, flexWrap: "wrap" }}>
                  {cap.totalSqFt > 0 && <span style={{ color: "#4a7a35" }}>📐 {cap.totalSqFt.toLocaleString()} sq ft assigned</span>}
                  {totalPots > 0 && <span style={{ color: "#1e2d1a", fontWeight: 600 }}>🪴 {totalPots.toLocaleString()} pots this run</span>}
                  {cap.totalPots && <span style={{ color: "#7a8c74" }}>Capacity: ~{cap.totalPots.toLocaleString()} pots (pot-tight)</span>}
                  {!fits && overBy > 0 && <span style={{ color: "#b03020", fontWeight: 700 }}>Need {overBy.toLocaleString()} more pot spaces</span>}
                </div>
                {!fits && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#b03020", fontStyle: "italic", flex: 1 }}>
                      Add another space below to accommodate the overflow, or reduce your case count.
                    </div>
                  </div>
                )}
                {!selC?.diameterIn && totalPots > 0 && (
                  <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>Set a container with a diameter to calculate pot capacity</div>
                )}
              </div>
            );
          })()}

          {form.movesOutside && (<>
            <SH c="Outdoor Space Assignment" />
            <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
              {sched?.moveOut ? <>Pad occupied from <strong>Wk {sched.moveOut.week}</strong> ({formatWeekDate(sched.moveOut.week, sched.moveOut.year)}) until <strong>Wk {form.targetWeek} (ready)</strong></> : "Set weeks outdoors on the Crop & Schedule tab first"}
            </div>
            <SpaceAssignmentPicker assignments={form.outsideAssignments} onChange={v => upd("outsideAssignments", v)} houses={houses} pads={pads} sched={sched} currentYear={currentYear} outsideOnly={true} allRuns={allRuns} currentRunId={form.id} currentRunTempGroup={form.tempGroup} varietyLibrary={varietyLibrary} form={form} containers={containers} />

            <div style={{ marginTop: 14, background: "#fff8f0", border: "1px solid #f0c080", borderRadius: 10, padding: "12px 16px", fontSize: 12, color: "#7a4a10" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>🌡 Cold sensitivity: {s.label}</div>
              <div>Min night temp: {form.minTempOverride || s.minTemp}°F. If temperatures drop below this threshold before move-out week, delay moving outside and extend indoor bench time accordingly.</div>
            </div>
          </>)}
        </>)}

        {/* ── SPACING TAB ── */}
        {tab === "spacing" && (
          <SpacingAssignment
            form={form}
            upd={upd}
            spacingProfiles={spacingProfiles}
            containers={containers}
          />
        )}

        {/* ── ORDER TAB ── */}
        {tab === "order" && (() => {
          const isCased = form.isCased ?? true;
          const pSize = isCased ? (Number(form.packSize) || 10) : 1;
          const totalPots = (Number(form.cases) || 0) * pSize;
          const varieties = form.varieties || [];
          const assignedPots = varieties.reduce((s, v) => s + (Number(v.cases) || 0) * pSize, 0);

          // Plant cost
          const plantCostPerUnit = assignedPots > 0
            ? varieties.reduce((s, v) => s + (Number(v.costPerUnit || 0) * (Number(v.cases) || 0) * pSize), 0) / assignedPots
            : 0;

          // Container costs (same logic as ComboDesigner CostRollup)
          const selC = containers.find(c => c.id === form.containerId);
          const potCost      = selC?.costPerUnit   ? Number(selC.costPerUnit)   : 0;
          const trayCost     = selC?.hasCarrier    ? (Number(selC.carrierCost) || 0) / Math.max(Number(selC.potsPerCarrier) || 1, 1) : 0;
          const wireCost     = selC?.hasWire       ? (Number(selC.wireCost)    || 0) : 0;
          const saucerCost   = selC?.hasSaucer     ? (Number(selC.saucerCost)  || 0) : 0;
          const sleeveCost   = selC?.hasSleeve     ? (Number(selC.sleeveCost)  || 0) : 0;
          const hbTagCost    = selC?.isHBTagged    ? (Number(selC.tagCostPerUnit) || 0) : 0;
          const accessoryPerPot = trayCost + wireCost + saucerCost + sleeveCost + hbTagCost;
          const containerPerPot = potCost + accessoryPerPot;

          const totalPerPot  = plantCostPerUnit + containerPerPot;
          const grandTotal   = totalPerPot * (assignedPots || 0);
          const allHaveCost  = varieties.length > 0 && varieties.every(v => v.costPerUnit);
          const hasAnyCost   = plantCostPerUnit > 0 || containerPerPot > 0;

          // Cost line items for breakdown
          const costLines = [
            plantCostPerUnit > 0  && { label: "Plant / URC",   value: plantCostPerUnit,   color: "#2e7a2e" },
            potCost > 0           && { label: "Pot",           value: potCost,            color: "#4a90d9" },
            trayCost > 0          && { label: "Tray / Carrier", value: trayCost,          color: "#7a5a9a" },
            saucerCost > 0        && { label: "Saucer",        value: saucerCost,         color: "#7a5a9a" },
            sleeveCost > 0        && { label: "Sleeve",        value: sleeveCost,         color: "#7a5a9a" },
            wireCost > 0          && { label: "Wire",          value: wireCost,           color: "#7a5a9a" },
            hbTagCost > 0         && { label: "HB Tag",        value: hbTagCost,          color: "#e07b39" },
          ].filter(Boolean);

          return (
            <div>
              <SourcingSection form={form} upd={upd} focus={focus} setFocus={setFocus} />
              <div style={{ borderTop: "2px solid #e0ead8", marginTop: 8, marginBottom: 16 }} />

              {/* Cost summary */}
              {(varieties.length > 0 || selC) && (
                <div style={{ background: "#f8faf6", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  {/* Top row: pots total + assignment status */}
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-end", marginBottom: costLines.length > 0 ? 14 : 0, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Total Pots</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a" }}>{totalPots > 0 ? totalPots.toLocaleString() : "—"}</div>
                    </div>
                    {assignedPots > 0 && assignedPots !== totalPots && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Assigned</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#d94f3d" }}>{assignedPots.toLocaleString()}</div>
                      </div>
                    )}
                    {assignedPots > 0 && assignedPots === totalPots && (
                      <div style={{ fontSize: 12, color: "#2e5c1e", fontWeight: 700, paddingBottom: 4 }}>✓ Fully assigned</div>
                    )}
                    {grandTotal > 0 && (
                      <div style={{ marginLeft: "auto" }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Est. Total Cost</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#2e5c1e" }}>${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    )}
                    {totalPerPot > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Per Pot</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#8e44ad" }}>${totalPerPot.toFixed(3)}</div>
                      </div>
                    )}
                  </div>

                  {/* Cost breakdown lines */}
                  {costLines.length > 0 && (
                    <div style={{ borderTop: "1px solid #e8eed8", paddingTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#aabba0", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Cost Breakdown — per pot</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {costLines.map(({ label, value, color }) => (
                          <div key={label} style={{ background: "#fff", border: `1.5px solid ${color}30`, borderRadius: 8, padding: "6px 12px", minWidth: 90 }}>
                            <div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color }}>${value.toFixed(4)}</div>
                          </div>
                        ))}
                        {costLines.length > 1 && (
                          <div style={{ background: "#1e2d1a", border: "1.5px solid #1e2d1a", borderRadius: 8, padding: "6px 12px", minWidth: 90 }}>
                            <div style={{ fontSize: 10, color: "#7fb069", fontWeight: 700, textTransform: "uppercase" }}>Total / Pot</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#c8e6b8" }}>${totalPerPot.toFixed(4)}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!allHaveCost && varieties.length > 0 && varieties.some(v => !v.costPerUnit) && (
                    <div style={{ fontSize: 11, color: "#e07b39", fontWeight: 600, marginTop: 8 }}>⚠ Some varieties missing plant cost — select a color from catalog or enter manually</div>
                  )}
                  {varieties.length > 0 && !selC && (
                    <div style={{ fontSize: 11, color: "#aabba0", marginTop: 8 }}>💡 Select a container on the Crop & Schedule tab to include pot + accessory costs</div>
                  )}
                </div>
              )}

              <VarietyManager
                varieties={form.varieties || []}
                lotCases={Number(form.cases) || 0}
                packSize={pSize}
                materialType={form.materialType || "urc"}
                propTraySize={form.propTraySize || ""}
                linerSize={form.linerSize || ""}
                isCased={isCased}
                onChange={v => upd("varieties", v)}
                onIncreaseLot={newCases => upd("cases", String(newCases))}
                varietyLibrary={varietyLibrary}
              />
            </div>
          );
        })()}

        {/* ── TAGS TAB ── */}
        {tab === "tags" && (() => {
          // Tags per pot = cases × 10 (always 10 pots per case)
          const totalPots = (Number(form.cases) || 0) * 10;
          const selC = containers.find(c => c.id === form.containerId);
          const autoTagQty = totalPots > 0 ? totalPots : 0;
          const tagQty = Number(form.tagOrderQty) || autoTagQty;
          const tagCostEach = Number(form.tagCostPerTag) || (selC?.isHBTagged ? Number(selC.tagCostPerUnit) || 0 : 0);
          const tagTotalCost = tagQty && tagCostEach ? tagQty * tagCostEach : 0;

          return (
            <div>
              <SH c="Tag Setup" mt={0} />

              {/* Needs tags toggle */}
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => upd("needsTags", !form.needsTags)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: form.needsTags ? "#f0f8eb" : "#fff", border: `1.5px solid ${form.needsTags ? "#7fb069" : "#c8d8c0"}`, borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left" }}>
                  <div style={{ width: 38, height: 20, borderRadius: 10, background: form.needsTags ? "#7fb069" : "#c8d8c0", position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 3, left: form.needsTags ? 21 : 3, transition: "left .2s" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: form.needsTags ? "#2e5c1e" : "#7a8c74" }}>{form.needsTags ? "Tags required for this crop" : "No tags needed"}</div>
                    <div style={{ fontSize: 11, color: "#aabba0" }}>Tags are always ordered per pot, never per plant</div>
                  </div>
                </button>
              </div>

              {form.needsTags && (<>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <FL c="Tag Description / Name" />
                    <input style={IS(focus === "tagDesc")} value={form.tagDescription || ""}
                      onChange={e => upd("tagDescription", e.target.value)}
                      onFocus={() => setFocus("tagDesc")} onBlur={() => setFocus(null)}
                      placeholder={form.cropName ? `e.g. ${form.cropName} 4in tag` : "e.g. Petunia Vista 4in tag"} />
                  </div>
                  <div>
                    <FL c="Tag Supplier" />
                    <input style={IS(focus === "tagSupp")} value={form.tagSupplier || ""}
                      onChange={e => upd("tagSupplier", e.target.value)}
                      onFocus={() => setFocus("tagSupp")} onBlur={() => setFocus(null)}
                      placeholder="e.g. Emerald Prints" />
                  </div>
                </div>

                {/* Print in house vs order */}
                <div style={{ marginBottom: 14 }}>
                  <FL c="Tag Source" />
                  <div style={{ display: "flex", gap: 8 }}>
                    {[["false","📦 Order from supplier"],["true","🖨 Print in-house"]].map(([val, label]) => (
                      <button key={val} onClick={() => upd("tagPrintInHouse", val === "true")}
                        style={{ flex: 1, padding: "10px 8px", borderRadius: 9, border: `2px solid ${String(form.tagPrintInHouse) === val ? "#7fb069" : "#c8d8c0"}`, background: String(form.tagPrintInHouse) === val ? "#f0f8eb" : "#fff", color: String(form.tagPrintInHouse) === val ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity + cost */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <FL c="Tags to Order" />
                    <input type="number" style={IS(focus === "tagQty")} value={form.tagOrderQty || ""}
                      onChange={e => upd("tagOrderQty", e.target.value)}
                      onFocus={() => setFocus("tagQty")} onBlur={() => setFocus(null)}
                      placeholder={autoTagQty > 0 ? String(autoTagQty) : "auto"} />
                    {autoTagQty > 0 && !form.tagOrderQty && (
                      <div style={{ fontSize: 10, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>↑ Auto: {(Number(form.cases)||0).toLocaleString()} cases × 10 pots = {totalPots.toLocaleString()} tags</div>
                    )}
                  </div>
                  <div>
                    <FL c="Cost per Tag ($)" />
                    <input type="number" step="0.001" style={IS(focus === "tagCost")} value={form.tagCostPerTag || ""}
                      onChange={e => upd("tagCostPerTag", e.target.value)}
                      onFocus={() => setFocus("tagCost")} onBlur={() => setFocus(null)}
                      placeholder={selC?.isHBTagged && selC?.tagCostPerUnit ? String(selC.tagCostPerUnit) : "0.00"} />
                    {selC?.isHBTagged && selC?.tagCostPerUnit && !form.tagCostPerTag && (
                      <div style={{ fontSize: 10, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>↑ From container library</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    {tagTotalCost > 0 && (
                      <div style={{ background: "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 8, padding: "9px 14px", width: "100%" }}>
                        <div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>EST. TAG COST</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#2e5c1e" }}>${tagTotalCost.toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <FL c="Tag Notes" />
                  <textarea style={{ ...IS(focus === "tagNotes"), height: 70, resize: "vertical" }} value={form.tagNotes || ""}
                    onChange={e => upd("tagNotes", e.target.value)}
                    onFocus={() => setFocus("tagNotes")} onBlur={() => setFocus(null)}
                    placeholder="e.g. 4-color process, double-sided, needs barcode, artwork due week 6..." />
                </div>

                {/* Summary card */}
                {(tagQty > 0 || form.tagDescription) && (
                  <div style={{ background: "#fafcf8", border: "1.5px solid #c8e0b8", borderRadius: 12, padding: "14px 16px", marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#4a7a3a", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>🏷 Tag Order Summary</div>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {form.tagDescription && <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>TAG</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{form.tagDescription}</div></div>}
                      <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>QTY</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{tagQty.toLocaleString()}</div></div>
                      <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>SOURCE</div><div style={{ fontSize: 13, fontWeight: 700, color: form.tagPrintInHouse ? "#4a90d9" : "#2e5c1e" }}>{form.tagPrintInHouse ? "🖨 Print in-house" : "📦 Order"}</div></div>
                      {form.tagSupplier && <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>SUPPLIER</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{form.tagSupplier}</div></div>}
                      {tagTotalCost > 0 && <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700 }}>COST</div><div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>${tagTotalCost.toFixed(2)}</div></div>}
                    </div>
                    {form.tagNotes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 10, fontStyle: "italic" }}>{form.tagNotes}</div>}
                  </div>
                )}
              </>)}
            </div>
          );
        })()}

        {/* Save as Template */}
        <div style={{ background: "#f8faf6", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "14px 16px", marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>💾 Save as Template</div>
          <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 10 }}>
            Saves everything except quantity, target week, and space assignments — reuse for repeat crops
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveTemplate()}
              placeholder={form.cropName ? `e.g. ${form.cropName} standard` : "Template name..."}
              style={{ flex: 1, border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", background: "#fff" }} />
            <button onClick={handleSaveTemplate} disabled={!saveTemplateName.trim()}
              style={{ background: saveTemplateName.trim() ? "#4a7a3a" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: saveTemplateName.trim() ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {templateSaved ? "✓ Saved!" : "Save Template"}
            </button>
          </div>
        </div>

        {/* ── TAB-SPECIFIC ACTION BUTTONS ── */}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {/* MAIN TAB: Create Crop Run */}
          {tab === "main" && (<>
            <button onClick={() => {
              if (!form.cropName.trim()) return;
              const saved = { ...form, id: form.id || uid() };
              onSave(saved);
              setRunSaved(true);
              if ((form.varieties || []).length > 0) setShowOrderReview("prompt");
              else setTab("space");
            }} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: form.cropName.trim() ? "pointer" : "default", opacity: form.cropName.trim() ? 1 : 0.5, fontFamily: "inherit" }}>
              {initial ? "💾 Save Changes" : "✅ Create Crop Run"}
            </button>
            {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
          </>)}

          {/* SPACE TAB: Save Space Assignment */}
          {tab === "space" && (<>
            <button onClick={() => { onSave({ ...form, id: form.id || uid() }); setTab("spacing"); }}
              style={{ flex: 1, background: "#4a90d9", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              🗂 Save Space Assignment
            </button>
            {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
          </>)}

          {/* SPACING TAB: Save Spacing */}
          {tab === "spacing" && (<>
            <button onClick={() => { onSave({ ...form, id: form.id || uid() }); }}
              style={{ flex: 1, background: "#7a5a9a", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              📐 {form.spacingOverride ? "Save Spacing Configuration" : "Confirm — Spacing set to Tight"}
            </button>
            {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
          </>)}

          {/* ORDER TAB: Create Plant Order */}
          {tab === "order" && (<>
            <button onClick={() => {
              if ((form.varieties || []).length === 0) return;
              if (form.needsTags !== false) { setShowTagReview(true); return; }
              setShowOrderReview("review");
            }}
              style={{ flex: 1, background: "#e07b39", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: (form.varieties || []).length > 0 ? "pointer" : "default", opacity: (form.varieties || []).length > 0 ? 1 : 0.5, fontFamily: "inherit" }}>
              🌱 Create Plant Order
            </button>
            {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
          </>)}

          {/* TAGS TAB: goes to order */}
          {tab === "tags" && (<>
            <button onClick={() => setTab("order")}
              style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              → Continue to Plant Order
            </button>
          </>)}
        </div>

        {/* ── ORDER PROMPT (after Create Crop Run on main tab) ── */}
        {showOrderReview === "prompt" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 18, padding: "32px 36px", maxWidth: 460, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>🌱</div>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 8, textAlign: "center" }}>Crop run saved!</div>
              <div style={{ fontSize: 14, color: "#7a8c74", textAlign: "center", marginBottom: 24, lineHeight: 1.6 }}>
                You have <strong>{(form.varieties || []).length} variet{(form.varieties || []).length !== 1 ? "ies" : "y"}</strong> ready to order.
                {(form.varieties || []).length > 0 && ` (${(form.varieties || []).reduce((s,v) => s + (Number(v.cases)||0), 0) * (Number(form.packSize)||1)} plants)`}
                {" "}Would you like to place your order now?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={() => { setShowOrderReview(null); setTab("order"); }}
                  style={{ background: "#e07b39", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  📋 Review Order
                </button>
                <button onClick={() => { setShowOrderReview(null); setTab("order"); }}
                  style={{ background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  ✏️ Change Order
                </button>
                <button onClick={() => { setShowOrderReview(null); setTab("space"); }}
                  style={{ background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  Skip for now → Space Assignment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAG REVIEW PROMPT (before order) ── */}
        {showTagReview && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: 18, padding: "32px 36px", maxWidth: 480, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>🏷</div>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 8, textAlign: "center" }}>Review Tag Order</div>
              <div style={{ background: "#f8faf6", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                {form.needsTags ? (<>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>{form.tagDescription || form.cropName + " tags"}</div>
                  <div style={{ fontSize: 12, color: "#7a8c74" }}>
                    Qty: {form.tagOrderQty || ((Number(form.cases)||0)*10)} tags
                    {form.tagSupplier && ` · ${form.tagSupplier}`}
                    {` · ${form.tagPrintInHouse ? "🖨 Print in-house" : "📦 Order from supplier"}`}
                  </div>
                </>) : (
                  <div style={{ fontSize: 13, color: "#7a8c74" }}>No tags set for this crop run — go to Tags tab to configure.</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={() => { setShowTagReview(false); setShowOrderReview("review"); }}
                  style={{ background: "#e07b39", color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  ✅ Tags look good — Continue to Plant Order
                </button>
                <button onClick={() => { setShowTagReview(false); setTab("tags"); }}
                  style={{ background: "#fff", color: "#4a90d9", border: "1.5px solid #4a90d9", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  ✏️ Edit Tag Order First
                </button>
                <button onClick={() => setShowTagReview(false)}
                  style={{ background: "none", color: "#aabba0", border: "none", padding: "8px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ORDER REVIEW MODAL ── */}
        {showOrderReview === "review" && (
          <OrderReviewModal
            form={form}
            containers={containers}
            onClose={() => setShowOrderReview(null)}
            onSave={() => { onSave({ ...form, id: form.id || uid() }); setShowOrderReview(null); }}
          />
        )}
      </div>
    </div>
  );
}

// ── CROP RUN CARD ─────────────────────────────────────────────────────────────
function CropRunCard({ run, onEdit, onDelete, onStatusChange, currentYear, spacingProfiles, containers }) {
  const [expanded, setExpanded] = useState(false);
  const sched = computeSchedule(run);
  const st = stat(run.status);
  const s  = sens(run.sensitivity);
  const units = run.cases && run.packSize ? Number(run.cases) * Number(run.packSize) : null;
  const varieties = run.varieties || [];
  const assignedCases = varieties.reduce((s, v) => s + (Number(v.cases) || 0), 0);
  const totalCost = varieties.reduce((s, v) => {
    const u = (Number(v.cases) || 0) * Number(run.packSize || 10);
    return s + (v.costPerUnit ? Number(v.costPerUnit) * u : 0);
  }, 0);

  const nowWeek = dateToWeek(new Date());
  const isLate  = sched?.transplant && run.status === "planned" && (sched.transplant.year < currentYear || (sched.transplant.year === currentYear && sched.transplant.week < nowWeek));

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${isLate ? "#f0c060" : "#e0ead8"}`, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>🌱</span>
            <span style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a" }}>{run.cropName}</span>
            {run.groupNumber && <span style={{ background: "#1e2d1a", color: "#c8e6b8", borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: 800, letterSpacing: .3 }}>Group {run.groupNumber}</span>}
            {run.variety && <span style={{ fontSize: 13, color: "#7a8c74" }}>{run.variety}{run.color ? ` · ${run.color}` : ""}</span>}
            <Badge label={st.label} color={st.color} />
            {run.movesOutside && <Badge label={`${s.label} · ≥${run.minTempOverride || s.minTemp}°F`} color={s.color} />}
            {isLate && <Badge label="⚠ Transplant overdue" color="#d94f3d" />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {run.cases && <Pill label="Cases" value={Number(run.cases).toLocaleString()} color="#7fb069" />}
            {units && <Pill label="Units" value={units.toLocaleString()} color="#7fb069" />}
            {varieties.length > 0 && <Pill label="Varieties" value={varieties.length} color="#8e44ad" />}
            {varieties.length > 0 && assignedCases > 0 && Number(run.cases) > 0 && assignedCases < Number(run.cases) && <Pill label="Unassigned" value={`${Number(run.cases) - assignedCases} cases`} color="#c8791a" />}
            {sched?.transplant && <Pill label="Transplant" value={weekLabel(sched.transplant.week, sched.transplant.year, currentYear)} color="#4a90d9" />}
            {sched?.moveOut && <Pill label="Move Out" value={weekLabel(sched.moveOut.week, sched.moveOut.year, currentYear)} color="#c8791a" />}
            {sched?.ready && <Pill label="Ready" value={`Wk ${sched.ready.week}`} color="#7fb069" />}
            {(run.spacingProfileId || run.containerId) ? (() => {
              const profiles = spacingProfiles || [];
              const conts    = containers || [];
              const resolved  = resolveSpacingProfile(profiles, run.cropName, run.containerId, conts, run.isCased ?? true);
              const profileId = run.spacingOverride ? run.spacingProfileId : (resolved?.profile?.id || run.spacingProfileId);
              const profile   = profiles.find(p => p.id === profileId) || resolved?.profile;
              return profile ? <Pill label="📐 Spacing" value={profile.name} color="#c8791a" /> : null;
            })() : null}
            {totalCost > 0 && <Pill label="Est. Cost" value={`$${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}`} color="#8e44ad" />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <button onClick={() => onEdit(run)} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          <button onClick={() => onDelete(run.id)} style={{ background: "none", color: "#7a8c74", border: "1px solid #f0d0c0", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee", padding: "16px 20px", background: "#fafcf8" }}>
          <ScheduleTimeline sched={sched} currentYear={currentYear} movesOutside={run.movesOutside} sensitivity={run.sensitivity} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            {(run.indoorAssignments || []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4a90d9", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>🏠 Indoor Space</div>
                {run.indoorAssignments.map(a => (
                  <div key={a.id} style={{ fontSize: 12, color: "#1e2d1a", padding: "4px 0", borderBottom: "1px solid #f0f5ee" }}>{a.structureName}{a.zoneName ? ` › ${a.zoneName}` : ""}{a.itemName ? ` › ${a.itemName}` : ""}</div>
                ))}
              </div>
            )}
            {(run.outsideAssignments || []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>🌤 Outdoor Space</div>
                {run.outsideAssignments.map(a => (
                  <div key={a.id} style={{ fontSize: 12, color: "#1e2d1a", padding: "4px 0", borderBottom: "1px solid #f0f5ee" }}>{a.structureName}{a.itemName ? ` › ${a.itemName}` : ""}</div>
                ))}
              </div>
            )}
          </div>

          {varieties.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", letterSpacing: .6, marginBottom: 10 }}>🌸 Varieties ({varieties.length})</div>
              {/* Allocation bar */}
              {Number(run.cases) > 0 && (
                <div style={{ background: "#e0ead8", borderRadius: 5, height: 8, overflow: "hidden", marginBottom: 10 }}>
                  {varieties.map((v, i) => {
                    const pct = Math.round(((Number(v.cases) || 0) / Number(run.cases)) * 100);
                    const hues = ["#7fb069","#4a90d9","#8e44ad","#c8791a","#d94f3d","#2e8b57","#e07b39","#5a6aaa"];
                    return pct > 0 ? <div key={v.id} style={{ width: `${pct}%`, height: "100%", background: hues[i % hues.length], display: "inline-block" }} title={`${v.name || "Variety " + (i+1)}: ${v.cases} cases`} /> : null;
                  })}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {varieties.map((v, i) => {
                  const hues = ["#7fb069","#4a90d9","#8e44ad","#c8791a","#d94f3d","#2e8b57","#e07b39","#5a6aaa"];
                  const vUnits = (Number(v.cases) || 0) * Number(run.packSize || 10);
                  const vCost  = v.costPerUnit && vUnits ? Number(v.costPerUnit) * vUnits : null;
                  return (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8faf6", borderRadius: 8, border: "1px solid #e0ead8", padding: "8px 12px" }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: hues[i % hues.length], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{v.name || <em style={{ color: "#aabba0" }}>Unnamed variety</em>}</span>
                        {v.color && <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 6 }}>{v.color}</span>}
                        {v.broker && <span style={{ fontSize: 11, color: "#aabba0", marginLeft: 6 }}>· {v.broker}</span>}
                        {(v.tags || []).length > 0 && (
                          <span style={{ marginLeft: 8, display: "inline-flex", gap: 4 }}>
                            {(v.tags).map(tid => {
                              const tag = VARIETY_TAGS.find(t => t.id === tid);
                              return tag ? <span key={tid} style={{ padding: "1px 8px", borderRadius: 20, background: tag.bg, color: tag.color, border: `1px solid ${tag.color}55`, fontSize: 10, fontWeight: 700 }}>{tag.label}</span> : null;
                            })}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#1e2d1a", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {v.cases ? `${Number(v.cases).toLocaleString()} cases` : "—"}
                        {vUnits > 0 && <span style={{ color: "#7a8c74", fontWeight: 400, marginLeft: 4 }}>/ {vUnits.toLocaleString()} units</span>}
                        {vCost && <span style={{ color: "#8e44ad", fontWeight: 700, marginLeft: 8 }}>${vCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalCost > 0 && <div style={{ marginTop: 8, textAlign: "right", fontSize: 12, color: "#8e44ad", fontWeight: 700 }}>Total input cost: ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>}
            </div>
          )}

          {/* Sourcing summary */}
          {run.materialType && (() => {
            const mt = MATERIAL_TYPES.find(m => m.id === run.materialType);
            if (!mt) return null;
            const units = run.cases && run.packSize ? Number(run.cases) * Number(run.packSize) : 0;
            const buffered = units > 0 ? Math.ceil(units * (1 + (Number(run.bufferPct) || 0) / 100)) : 0;
            const totalCost = buffered && run.unitCost ? (buffered * Number(run.unitCost)).toFixed(2) : null;
            return (
              <div style={{ marginTop: 14, background: mt.bg, border: `1.5px solid ${mt.color}30`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: mt.color, textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>
                  {mt.icon} {mt.label} Sourcing
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                  {run.propTraySize && <span style={{ color: "#1e2d1a" }}>🗂 {run.propTraySize}-cell tray</span>}
                  {run.linerSize && <span style={{ color: "#1e2d1a" }}>📐 {run.linerSize}</span>}
                  {run.seedForm && run.materialType === "seed" && <span style={{ color: "#1e2d1a", textTransform: "capitalize" }}>🌱 {run.seedForm}</span>}
                  {run.sourcingBroker && <span style={{ color: "#7a8c74" }}>Broker: <strong>{run.sourcingBroker}</strong></span>}
                  {run.sourcingSupplier && <span style={{ color: "#7a8c74" }}>Supplier: <strong>{run.sourcingSupplier}</strong></span>}
                  {run.unitCost && <span style={{ color: "#7a8c74" }}>${run.unitCost}/{mt.label.toLowerCase()}</span>}
                  {buffered > 0 && <span style={{ color: mt.color, fontWeight: 700 }}>Order qty: {buffered.toLocaleString()}</span>}
                  {totalCost && <span style={{ color: "#2e5c1e", fontWeight: 800 }}>Est. ${Number(totalCost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
                </div>
              </div>
            );
          })()}

          {run.notes && <div style={{ marginTop: 12, fontSize: 13, color: "#7a8c74", fontStyle: "italic" }}>{run.notes}</div>}

          {/* Spacing detail */}
          {(run.spacingProfileId || run.containerId) && (() => {
            const profiles = spacingProfiles || [];
            const conts    = containers || [];
            const resolved = resolveSpacingProfile(profiles, run.cropName, run.containerId, conts, run.isCased ?? true);
            const profileId = run.spacingOverride ? run.spacingProfileId : (resolved?.profile?.id || run.spacingProfileId);
            const profile   = profiles.find(p => p.id === profileId) || resolved?.profile;
            const preferTight = !run.spacingOverride && resolved?.preferTight;
            if (!profile) return null;
            const activeStages = STAGE_DEFS.filter(s => {
              if (!profile.stages?.[s.id]?.enabled) return false;
              if (preferTight && s.id !== "tight") return false;
              return true;
            });
            const container = conts.find(c => c.id === run.containerId);
            const firstBench = (run.indoorAssignments || []).find(a => a.itemName);
            const benchW = firstBench?.benchW || "4";
            const benchL = firstBench?.benchL || "100";
            return (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>
                  📐 Spacing · {profile.name}
                  {container && <span style={{ fontWeight: 400, color: "#7a8c74", marginLeft: 8 }}>· {container.name}</span>}
                  {(run.isCased ?? true) && <span style={{ fontWeight: 400, color: "#4a90d9", marginLeft: 8 }}>· Cased → Tight first</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  {activeStages.map(s => {
                    const d = profile.stages[s.id];
                    const sf = calcSqFt(d.x, d.y);
                    const pots = calcPotsPerBench(d.x, d.y || d.x, benchW, benchL);
                    return (
                      <div key={s.id} style={{ background: "#fff", borderRadius: 10, border: `1.5px solid ${s.color}33`, padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                          <span>{s.icon}</span><span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>{d.x}″{d.y && d.y !== d.x ? ` × ${d.y}″` : ""}</div>
                        {sf && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{sf} sf/pot · {Math.round(144 / (Number(d.x) * Number(d.y || d.x)))} pots/sf</div>}
                        {pots && <div style={{ fontSize: 11, color: s.color, fontWeight: 700, marginTop: 4 }}>{pots.toLocaleString()} pots on {benchW}′×{benchL}′</div>}
                        {d.note && <div style={{ fontSize: 10, color: "#aabba0", marginTop: 4, fontStyle: "italic" }}>{d.note}</div>}
                      </div>
                    );
                  })}
                  {preferTight && STAGE_DEFS.filter(s => s.id !== "tight" && profile.stages?.[s.id]?.enabled).map(s => {
                    const d = profile.stages[s.id];
                    const sf = calcSqFt(d.x, d.y);
                    return (
                      <div key={s.id} style={{ background: "#f8faf6", borderRadius: 10, border: "1px solid #e0ead8", padding: "10px 14px", opacity: 0.65 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                          <span>{s.icon}</span><span style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74" }}>{s.label} (after uncasing)</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#7a8c74" }}>{d.x}″{d.y && d.y !== d.x ? ` × ${d.y}″` : ""}</div>
                        {sf && <div style={{ fontSize: 11, color: "#aabba0" }}>{sf} sf/pot</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Quick status change */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Update Status</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {CROP_STATUS.map(cs => (
                <button key={cs.id} onClick={() => onStatusChange(run.id, cs.id)} style={{ padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${run.status === cs.id ? cs.color : "#c8d8c0"}`, background: run.status === cs.id ? cs.color + "18" : "#fff", color: run.status === cs.id ? cs.color : "#7a8c74", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{cs.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WEEK CALENDAR VIEW ────────────────────────────────────────────────────────
function WeekCalendar({ runs, currentYear }) {
  const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);
  const nowWeek = dateToWeek(new Date());

  // For each week, collect what's happening
  function eventsForWeek(week) {
    const events = [];
    runs.forEach(run => {
      const sched = computeSchedule(run);
      if (!sched) return;
      if (sched.seed?.week === week && sched.seed?.year === currentYear)      events.push({ type: "seed",      run, color: "#8e44ad" });
      if (sched.transplant?.week === week && sched.transplant?.year === currentYear) events.push({ type: "transplant", run, color: "#4a90d9" });
      if (sched.moveOut?.week === week && sched.moveOut?.year === currentYear) events.push({ type: "moveout",   run, color: "#c8791a" });
      if (sched.ready?.week === week && sched.ready?.year === currentYear)     events.push({ type: "ready",     run, color: "#7fb069" });
    });
    return events;
  }

  const LABELS = { seed: "🌱 Seed", transplant: "🪴 Transplant", moveout: "🌤 Move out", ready: "✅ Ready" };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 4, minWidth: 900 }}>
        {WEEKS.map(week => {
          const events = eventsForWeek(week);
          const isNow = week === nowWeek;
          return (
            <div key={week} style={{ background: isNow ? "#f0f8eb" : "#fff", borderRadius: 8, border: `1.5px solid ${isNow ? "#7fb069" : "#e0ead8"}`, padding: "8px 6px", minHeight: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: isNow ? "#2e5c1e" : "#7a8c74", marginBottom: 5, textAlign: "center" }}>
                Wk {week}
                {isNow && <div style={{ fontSize: 9, color: "#7fb069" }}>NOW</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {events.map((ev, i) => (
                  <div key={i} title={`${ev.run.cropName} — ${LABELS[ev.type]}`} style={{ background: ev.color + "18", border: `1px solid ${ev.color}44`, borderRadius: 4, padding: "2px 4px", fontSize: 9, fontWeight: 700, color: ev.color, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.run.cropName}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(LABELS).map(([type, label]) => {
          const colors = { seed: "#8e44ad", transplant: "#4a90d9", moveout: "#c8791a", ready: "#7fb069" };
          return <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#7a8c74" }}><div style={{ width: 12, height: 12, borderRadius: 3, background: colors[type] + "30", border: `1.5px solid ${colors[type]}` }} />{label}</div>;
        })}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
// ── COPY RUN MODAL ────────────────────────────────────────────────────────────
function CopyRunModal({ runs, currentYear, onCopy, onClose }) {
  const years = [...new Set(runs.map(r => r.targetYear || r.year || "").filter(Boolean))].sort((a,b) => b-a);
  const [srcYear, setSrcYear] = useState(years[0] || (currentYear - 1));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [copying, setCopying] = useState(false);

  const srcRuns = runs.filter(r => String(r.targetYear || r.year || "") === String(srcYear));
  const filtered = srcRuns.filter(r => !search || (r.cropName || r.crop || "").toLowerCase().includes(search.toLowerCase()) || (r.containerName || r.size || "").toLowerCase().includes(search.toLowerCase()));

  // Group by crop name
  const grouped = filtered.reduce((acc, r) => {
    const key = r.cropName || r.crop || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const allIds = filtered.map(r => r.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleCopy = async () => {
    const toCopy = runs.filter(r => selected.has(r.id));
    if (!toCopy.length) return;
    setCopying(true);
    await onCopy(toCopy);
    setCopying(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        {/* Header */}
        <div style={{ background: "#1e2d1a", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#fff" }}>📋 Copy Crop Runs</div>
            <div style={{ fontSize: 12, color: "#7a9a6a", marginTop: 2 }}>Copies everything except pricing — update that once available</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Controls */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #e0ead8", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, marginBottom: 4 }}>COPY FROM YEAR</div>
            <select value={srcYear} onChange={e => { setSrcYear(e.target.value); setSelected(new Set()); }}
              style={{ border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", background: "#fafaf8" }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
              {!years.length && <option value={currentYear - 1}>{currentYear - 1}</option>}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, marginBottom: 4 }}>SEARCH</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by crop or container..."
              style={{ width: "100%", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontFamily: "inherit", background: "#fafaf8", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* Select all bar */}
        <div style={{ padding: "10px 24px", borderBottom: "1px solid #f0f0ea", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafaf8" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 16, height: 16, accentColor: "#7fb069" }} />
            Select All ({filtered.length} runs)
          </label>
          <div style={{ fontSize: 12, color: "#7a8c74" }}>{selected.size} selected → {currentYear}</div>
        </div>

        {/* Run list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px" }}>
          {srcRuns.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#aabba0" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌱</div>
              <div>No crop runs found for {srcYear}</div>
            </div>
          )}
          {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cropName, cropRuns]) => (
            <div key={cropName} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6, paddingBottom: 4, borderBottom: "1px solid #f0f0ea" }}>
                {cropName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cropRuns.map(run => {
                  const sel = selected.has(run.id);
                  const qty = run.quantity || run.units || "";
                  const container = run.containerName || run.size || "";
                  const space = run.indoorAssignments?.length ? run.indoorAssignments.map(a => a.houseName || a.rangeName || "").filter(Boolean).join(", ") : "";
                  const readyWk = run.readyWeek || run.targetWeek || "";
                  return (
                    <label key={run.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${sel ? "#7fb069" : "#e0ead8"}`, background: sel ? "#f0f8eb" : "#fff", cursor: "pointer", transition: "all .1s" }}>
                      <input type="checkbox" checked={sel} onChange={() => toggle(run.id)} style={{ width: 16, height: 16, accentColor: "#7fb069", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{run.varietyName || run.variety || "—"}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {container && <span>📦 {container}</span>}
                          {qty && <span>· {Number(qty).toLocaleString()} units</span>}
                          {readyWk && <span>· Wk {readyWk}</span>}
                          {space && <span>· 🏠 {space}</span>}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1.5px solid #e0ead8", display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", background: "#fafaf8" }}>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "9px 20px", fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleCopy} disabled={!selected.size || copying}
            style={{ background: selected.size ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 8, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: selected.size ? "pointer" : "default", fontFamily: "inherit" }}>
            {copying ? "Copying..." : `Copy ${selected.size} Run${selected.size !== 1 ? "s" : ""} → ${currentYear}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { rows: runs,            upsert: upsertRun,   remove: removeRun,   loading: runsLoading   } = useCropRuns();
  const { rows: houses                                                                              } = useHouses();
  const { rows: pads                                                                                } = usePads();
  const { rows: containers                                                                          } = useContainers();
  const { rows: spacingProfiles                                                                     } = useSpacingProfiles();
  const { rows: varietyLibrary                                                                      } = useVarieties();

  const currentYear = new Date().getFullYear();
  const [view,      setView     ] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [tabView,   setTabView  ] = useState("list"); // list | calendar
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter,   setYearFilter  ] = useState(currentYear);

  async function saveRun(r) {
    await upsertRun(r);
    setView("list");
    setEditingId(null);
  }
  async function deleteRun(id) {
    if (window.confirm("Remove this crop run?")) await removeRun(id);
  }
  async function statusChange(id, status) {
    await upsertRun({ id, status });
  }

  const filtered = runs
    .filter(r => statusFilter === "all" || r.status === statusFilter)
    .filter(r => !r.targetYear || Number(r.targetYear) === yearFilter);

  const totalUnits = filtered.reduce((s, r) => s + (r.cases && r.packSize ? Number(r.cases) * Number(r.packSize) : 0), 0);
  const totalCost  = filtered.reduce((s, r) => { const u = r.cases && r.packSize ? Number(r.cases) * Number(r.packSize) : 0; return s + (r.costPerUnit ? Number(r.costPerUnit) * u : 0); }, 0);

  const years = [...new Set([currentYear, currentYear + 1, ...runs.map(r => Number(r.targetYear)).filter(Boolean)])].sort();

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain" }} />
          <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Crop Planning</div>
        </div>
        {view === "list"
          ? <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowCopyModal(true)} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📋 Copy Existing</button>
            <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Crop Run</button>
          </div>
          : <button onClick={() => { setView("list"); setEditingId(null); }} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        }
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px" }}>

        {view === "list" && (<>
          {/* Summary */}
          {runs.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 24px", marginBottom: 24 }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 14 }}>Season {yearFilter}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill label="Crop Runs" value={filtered.length} color="#1e2d1a" />
                {totalUnits > 0 && <Pill label="Total Units" value={totalUnits.toLocaleString()} color="#7fb069" />}
                {totalCost > 0 && <Pill label="Input Cost" value={`$${totalCost.toLocaleString(undefined,{maximumFractionDigits:0})}`} color="#8e44ad" />}
                {CROP_STATUS.map(cs => { const n = filtered.filter(r => r.status === cs.id).length; return n > 0 ? <Pill key={cs.id} label={cs.label} value={n} color={cs.color} /> : null; })}
              </div>
            </div>
          )}

          {/* View toggle + filters */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {/* Year filter */}
              <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))} style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#1e2d1a", fontFamily: "inherit", cursor: "pointer" }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {/* Status filter */}
              {[["all","All"], ...CROP_STATUS.map(s => [s.id, s.label])].map(([id, label]) => (
                <button key={id} onClick={() => setStatusFilter(id)} style={{ background: statusFilter === id ? "#1e2d1a" : "#fff", color: statusFilter === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${statusFilter === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              {[["list","☰ List"],["calendar","📅 Calendar"]].map(([id, label]) => (
                <button key={id} onClick={() => setTabView(id)} style={{ background: tabView === id ? "#1e2d1a" : "#fff", color: tabView === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${tabView === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
          </div>

          {tabView === "list" && (<>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "80px 0", color: "#aabba0" }}>
                <div style={{ fontSize: 52, marginBottom: 14 }}>🌱</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No crop runs yet for {yearFilter}</div>
                <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>+ Add First Crop Run</button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map(run => <CropRunCard key={run.id} run={run} onEdit={r => { setEditingId(r.id); setView("edit"); }} onDelete={deleteRun} onStatusChange={statusChange} currentYear={currentYear} spacingProfiles={spacingProfiles} containers={containers} />)}
            </div>
          </>)}

          {tabView === "calendar" && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px 24px" }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 15, color: "#1e2d1a", marginBottom: 16 }}>Week-by-Week — {yearFilter}</div>
              <WeekCalendar runs={filtered.filter(r => Number(r.targetYear) === yearFilter)} currentYear={yearFilter} />
            </div>
          )}
        </>)}

        {view === "add" && <CropRunForm onSave={saveRun} onCancel={() => setView("list")} houses={houses} pads={pads} containers={containers} spacingProfiles={spacingProfiles} varietyLibrary={varietyLibrary} currentYear={currentYear} allRuns={runs} />}
        {view === "edit" && editingId && <CropRunForm initial={runs.find(r => r.id === editingId)} onSave={saveRun} onCancel={() => { setView("list"); setEditingId(null); }} houses={houses} pads={pads} containers={containers} spacingProfiles={spacingProfiles} varietyLibrary={varietyLibrary} currentYear={currentYear} allRuns={runs} />}
      </div>
      {showCopyModal && (
        <CopyRunModal
          runs={runs}
          currentYear={currentYear}
          onCopy={async (selectedRuns) => {
            for (const run of selectedRuns) {
              const { id, unitCost, sellPrice, ...rest } = run;
              await upsertRun({
                ...rest,
                id: uid(),
                targetYear: currentYear,
                status: "planned",
                unitCost: "",
                sellPrice: "",
                indoorAssignments: run.indoorAssignments || [],
                outsideAssignments: run.outsideAssignments || [],
              });
            }
            setShowCopyModal(false);
          }}
          onClose={() => setShowCopyModal(false)}
        />
      )}
    </div>
  );
}
