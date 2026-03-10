import { useState, useEffect, useRef } from "react";
import { useCropRuns, useHouses, usePads, useContainers, useSpacingProfiles, useVarieties, useBrokerCatalogs } from "./supabase";

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
const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
function SpaceAssignmentPicker({ assignments, onChange, houses, pads, sched, currentYear, outsideOnly }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ type: outsideOnly ? "pad" : "house", structureId: "", zoneId: "", itemId: "" });

  const selectedHouse = houses.find(h => h.id === form.structureId);
  const selectedPad   = pads.find(p => p.id === form.structureId);
  const benchZones    = (selectedHouse?.zones || []).filter(z => z.type === "bench");
  const selectedZone  = benchZones.find(z => z.id === form.zoneId);

  function addAssignment() {
    if (!form.structureId) return;
    const house = houses.find(h => h.id === form.structureId);
    const pad   = pads.find(p => p.id === form.structureId);
    const zone  = house?.zones.find(z => z.id === form.zoneId);
    const item  = zone?.items.find(i => i.id === form.itemId);
    onChange([...assignments, {
      id: uid(),
      type: form.type,
      structureId: form.structureId,
      structureName: house?.name || pad?.name || "",
      zoneId: form.zoneId || null,
      zoneName: zone?.name || null,
      itemId: form.itemId || null,
      itemName: item?.label || null,
    }]);
    setAdding(false);
    setForm({ type: outsideOnly ? "pad" : "house", structureId: "", zoneId: "", itemId: "" });
  }

  return (
    <div>
      {assignments.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic", marginBottom: 8 }}>No space assigned yet</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {assignments.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 8, padding: "7px 12px" }}>
            <span style={{ fontSize: 13 }}>{a.type === "pad" ? "🌤" : "🏠"}</span>
            <span style={{ flex: 1, fontSize: 13, color: "#1e2d1a", fontWeight: 600 }}>
              {a.structureName}{a.zoneName ? ` › ${a.zoneName}` : ""}{a.itemName ? ` › ${a.itemName}` : ""}
            </span>
            <IBtn danger onClick={() => onChange(assignments.filter(x => x.id !== a.id))}>×</IBtn>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: "#f8faf6", borderRadius: 10, border: "1.5px solid #c8d8c0", padding: 14 }}>
          {!outsideOnly && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["house","🏠 Greenhouse"],["pad","🌤 Outdoor Pad"]].map(([t, l]) => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t, structureId: "", zoneId: "", itemId: "" }))}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${form.type === t ? "#7fb069" : "#c8d8c0"}`, background: form.type === t ? "#f0f8eb" : "#fff", color: form.type === t ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div>
              <FL c={form.type === "pad" ? "Outdoor Pad" : "Greenhouse"} />
              <select style={IS(false)} value={form.structureId} onChange={e => setForm(f => ({ ...f, structureId: e.target.value, zoneId: "", itemId: "" }))}>
                <option value="">— Select —</option>
                {(form.type === "pad" ? pads : houses).filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {form.type === "house" && benchZones.length > 0 && (
              <div>
                <FL c="Bench Zone (optional)" />
                <select style={IS(false)} value={form.zoneId} onChange={e => setForm(f => ({ ...f, zoneId: e.target.value, itemId: "" }))}>
                  <option value="">— Whole house —</option>
                  {benchZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
            )}
            {form.type === "house" && selectedZone && (selectedZone.items || []).length > 0 && (
              <div>
                <FL c="Specific Bench (optional)" />
                <select style={IS(false)} value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}>
                  <option value="">— Whole zone —</option>
                  {(selectedZone.items || []).map(i => <option key={i.id} value={i.id}>{i.label}{i.widthFt && i.lengthFt ? ` (${i.widthFt}'×${i.lengthFt}')` : ""}</option>)}
                </select>
              </div>
            )}
            {form.type === "pad" && selectedPad && (selectedPad.bays || []).length > 0 && (
              <div>
                <FL c="Bay (optional)" />
                <select style={IS(false)} value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))}>
                  <option value="">— Whole pad —</option>
                  {(selectedPad.bays || []).map(b => <option key={b.id} value={b.id}>{b.number}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addAssignment} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Assign</button>
            <button onClick={() => setAdding(false)} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
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
          placeholder={disabled ? "— select cultivar first —" : placeholder}
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
function VarietyManager({ varieties, lotCases, packSize, onChange, onIncreaseLot, varietyLibrary }) {
  const [focus, setFocus] = useState(null);
  const [overAlert, setOverAlert] = useState(null); // { needed, current }

  const assignedCases = varieties.reduce((s, v) => s + (Number(v.cases) || 0), 0);
  const remainingCases = lotCases - assignedCases;
  const isOver = assignedCases > lotCases && lotCases > 0;
  const pct = lotCases > 0 ? Math.min(100, Math.round((assignedCases / lotCases) * 100)) : 0;

  // Even-split when adding a variety
  function addVariety() {
    const newCount = varieties.length + 1;
    const evenCases = lotCases > 0 ? Math.floor(lotCases / newCount) : 0;
    // redistribute existing varieties evenly too
    const rebalanced = varieties.map(v => ({ ...v, cases: evenCases }));
    const remainder = lotCases > 0 ? lotCases - evenCases * newCount : 0;
    const newVar = { id: uid(), name: "", color: "", broker: "", supplier: "", costPerUnit: "", cases: evenCases + remainder };
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
    const even = Math.floor(lotCases / varieties.length);
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
              <span style={{ color: "#7a8c74" }}> / {lotCases > 0 ? lotCases.toLocaleString() : "—"} cases assigned</span>
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
                {/* Identity row: Ball item# | Cultivar | Variety | Color */}
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 140px", gap: 10, marginBottom: 12 }}>
                  <div>
                    <FL c="Ball Item #" />
                    <input
                      style={IS(focus === v.id + "ball")}
                      value={v.ballItemNumber || ""}
                      onChange={e => updVar(idx, "ballItemNumber", e.target.value)}
                      onFocus={() => setFocus(v.id + "ball")}
                      onBlur={() => setFocus(null)}
                      placeholder="e.g. 12345"
                    />
                  </div>
                  <div>
                    <FL c="Cultivar" />
                    <Combobox
                      value={v.cultivar || ""}
                      onChange={val => {
                        const next = varieties.map((x, i) => i !== idx ? x : { ...x, cultivar: val, name: "" });
                        onChange(next);
                      }}
                      options={cultivarOptions}
                      placeholder="e.g. Supertunia"
                      focusKey={v.id + "cult"}
                      focus={focus}
                      setFocus={setFocus}
                    />
                  </div>
                  <div>
                    <FL c="Variety" />
                    <Combobox
                      value={v.name || ""}
                      onChange={val => {
                        selectLibraryVariety(v.cultivar, val);
                        if (!libEntries.find(e => e.cropName === v.cultivar && e.variety === val)) {
                          updVar(idx, "name", val);
                        }
                      }}
                      options={varietyOptions}
                      placeholder="e.g. Vista Bubblegum"
                      focusKey={v.id + "var"}
                      focus={focus}
                      setFocus={setFocus}
                      disabled={false}
                    />
                  </div>
                  <div>
                    <FL c="Color" />
                    <input style={IS(focus === v.id + "col")} value={v.color || ""} onChange={e => updVar(idx, "color", e.target.value)} onFocus={() => setFocus(v.id + "col")} onBlur={() => setFocus(null)} placeholder="e.g. Pink" />
                  </div>
                </div>
                {/* Quantity + cost row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <FL c="Cases" />
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <FL c="Broker" />
                    <input style={IS(focus === v.id + "brk")} value={v.broker || ""} onChange={e => updVar(idx, "broker", e.target.value)} onFocus={() => setFocus(v.id + "brk")} onBlur={() => setFocus(null)} placeholder="e.g. Ball Seed" />
                  </div>
                  <div>
                    <FL c="Supplier" />
                    <input style={IS(focus === v.id + "sup")} value={v.supplier || ""} onChange={e => updVar(idx, "supplier", e.target.value)} onFocus={() => setFocus(v.id + "sup")} onBlur={() => setFocus(null)} placeholder="e.g. Dümmen" />
                  </div>
                </div>

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
        + Add Variety {lotCases > 0 && varieties.length > 0 ? `(will split ${lotCases} cases evenly)` : ""}
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
  const searchVarieties = (brokerName, cropName, query = "") => {
    const items = catalogs.filter(c => c.brokerName === brokerName).flatMap(c => c.items);
    return items.filter(item => {
      const matchesCrop = !cropName || item.crop?.toLowerCase().includes(cropName.toLowerCase());
      const matchesQuery = !query || item.description?.toLowerCase().includes(query.toLowerCase()) || item.itemNumber?.includes(query);
      return matchesCrop && matchesQuery;
    }).slice(0, 60);
  };
  return { getBrokerNames, searchVarieties };
}

function SourcingSection({ form, upd, focus, setFocus }) {
  const mt = MATERIAL_TYPES.find(m => m.id === form.materialType) || MATERIAL_TYPES[0];
  const units = form.cases && form.packSize ? Number(form.cases) * Number(form.packSize) : 0;
  const buffered = units > 0 ? Math.ceil(units * (1 + (Number(form.bufferPct) || 0) / 100)) : 0;
  const totalCost = buffered && form.unitCost ? (buffered * Number(form.unitCost)).toFixed(2) : null;
  const { getBrokerNames, searchVarieties } = useBrokerLookup();
  const brokerNames = getBrokerNames();
  const [varQuery, setVarQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const catalogVarieties = form.sourcingBroker
    ? searchVarieties(form.sourcingBroker, form.cropName, varQuery)
    : [];

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

      <SH c="Broker & Supplier" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <FL c="Broker" />
          {brokerNames.length > 0 ? (
            <select style={IS(false)} value={form.sourcingBroker || ""} onChange={e => { upd("sourcingBroker", e.target.value); setShowPicker(false); setVarQuery(""); }}>
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
          <FL c="Supplier / Breeder" />
          <input style={IS(focus === "sSupplier")} value={form.sourcingSupplier || ""} onChange={e => upd("sourcingSupplier", e.target.value)}
            onFocus={() => setFocus("sSupplier")} onBlur={() => setFocus(null)} placeholder="e.g. Dümmen Orange" />
        </div>
      </div>

      {form.sourcingBroker && form.sourcingBroker !== "__other__" && catalogVarieties.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SH c={`Varieties from ${form.sourcingBroker}`} />
          <input value={varQuery} onChange={e => setVarQuery(e.target.value)} placeholder={`Search ${form.cropName || "varieties"}...`}
            style={{ ...IS(false), marginBottom: 8 }} />
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1.5px solid #e0ead8", borderRadius: 10, background: "#fff" }}>
            {catalogVarieties.map(item => (
              <div key={item.id}
                onClick={() => {
                  const brokerDisplay = form.sourcingBroker;
                  upd("unitCost", item.sellPrice ? (item.sellPrice / (Number(item.perQty) || 100)).toFixed(4) : form.unitCost);
                  const varName = item.description?.replace(/#$/, "").trim();
                  const existing = form.varieties || [];
                  if (!existing.find(v => v.ballItemNumber === item.itemNumber)) {
                    const newVar = { id: dc({}), ballItemNumber: item.itemNumber, cultivar: varName, name: varName, color: "", cases: 0, costPerUnit: item.sellPrice ? (item.sellPrice / (Number(item.perQty)||100)).toFixed(4) : "", broker: brokerDisplay, supplier: item.size, tags: [] };
                    newVar.id = Date.now().toString(36);
                    upd("varieties", [...existing, newVar]);
                  }
                }}
                style={{ padding: "9px 14px", borderBottom: "1px solid #f0f5ee", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fcf4"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2a1a" }}>
                    {item.isNew && <span style={{ background: "#8e44ad", color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, marginRight: 6 }}>NEW</span>}
                    {item.description?.replace(/#$/, "").trim()}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>{item.size} · #{item.itemNumber} · {item.perQty}/tray</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#2e7a2e", flexShrink: 0, marginLeft: 12 }}>
                  {item.sellPrice ? `$${item.sellPrice.toFixed(2)}/${item.perQty}` : "—"}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#aabba0", marginTop: 5 }}>Click a variety to add it to the Varieties tab and auto-fill cost</div>
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

// ── CROP RUN FORM ─────────────────────────────────────────────────────────────
function CropRunForm({ initial, onSave, onCancel, houses, pads, spacingProfiles, containers, varietyLibrary, currentYear }) {
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
  };
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [focus, setFocus] = useState(null);
  const [tab, setTab] = useState("main");

  const upd = (f, v) => setForm(x => ({ ...x, [f]: v }));
  const units = form.cases && form.packSize ? Number(form.cases) * Number(form.packSize) : null;
  const sched = computeSchedule(form);
  const s = sens(form.sensitivity);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit Crop Run" : "New Crop Run"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>

      <div style={{ padding: "22px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1.5px solid #e0ead8", marginBottom: 22 }}>
          {[["main","Crop & Schedule"],["sourcing","Sourcing"],["space","Space Assignment"],["spacing","Spacing"],["detail","Varieties"]].map(([id, label]) => (
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
                  if (c?.unitsPerCase) upd("packSize", Number(c.unitsPerCase));
                  // Auto-set isCased based on container kind
                  if (c) upd("isCased", c.kind === "finished" && !!c.unitsPerCase);
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

          {/* Cases, pack size, units */}
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
                <div style={{ fontSize: 10, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>
                  ↑ Auto-filled from container library
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              {units && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>= {units.toLocaleString()} units</div>}
            </div>
          </div>

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
        {tab === "sourcing" && (
          <SourcingSection form={form} upd={upd} focus={focus} setFocus={setFocus} />
        )}

        {/* ── SPACE TAB ── */}
        {tab === "space" && (<>
          <SH c="Indoor Space Assignment" mt={0} />
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
            {sched?.transplant ? <>Bench occupied from <strong>Wk {sched.transplant.week}</strong> ({formatWeekDate(sched.transplant.week, sched.transplant.year)}) until <strong>{form.movesOutside && sched.moveOut ? `Wk ${sched.moveOut.week} (move-out)` : `Wk ${form.targetWeek} (ready)`}</strong></> : "Set schedule on the Crop & Schedule tab first"}
          </div>
          <SpaceAssignmentPicker assignments={form.indoorAssignments} onChange={v => upd("indoorAssignments", v)} houses={houses} pads={pads} sched={sched} currentYear={currentYear} outsideOnly={false} />

          {form.movesOutside && (<>
            <SH c="Outdoor Space Assignment" />
            <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
              {sched?.moveOut ? <>Pad occupied from <strong>Wk {sched.moveOut.week}</strong> ({formatWeekDate(sched.moveOut.week, sched.moveOut.year)}) until <strong>Wk {form.targetWeek} (ready)</strong></> : "Set weeks outdoors on the Crop & Schedule tab first"}
            </div>
            <SpaceAssignmentPicker assignments={form.outsideAssignments} onChange={v => upd("outsideAssignments", v)} houses={houses} pads={pads} sched={sched} currentYear={currentYear} outsideOnly={true} />

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

        {/* ── VARIETIES TAB ── */}
        {tab === "detail" && (
          <VarietyManager
            varieties={form.varieties || []}
            lotCases={Number(form.cases) || 0}
            packSize={Number(form.packSize) || 10}
            onChange={v => upd("varieties", v)}
            onIncreaseLot={newCases => upd("cases", String(newCases))}
            varietyLibrary={varietyLibrary}
          />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={() => form.cropName.trim() && onSave({ ...form, id: form.id || uid() })} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>{initial ? "Save Changes" : "Create Crop Run"}</button>
          {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
        </div>
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
          ? <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Crop Run</button>
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

        {view === "add" && <CropRunForm onSave={saveRun} onCancel={() => setView("list")} houses={houses} pads={pads} containers={containers} spacingProfiles={spacingProfiles} varietyLibrary={varietyLibrary} currentYear={currentYear} />}
        {view === "edit" && editingId && <CropRunForm initial={runs.find(r => r.id === editingId)} onSave={saveRun} onCancel={() => { setView("list"); setEditingId(null); }} houses={houses} pads={pads} containers={containers} spacingProfiles={spacingProfiles} varietyLibrary={varietyLibrary} currentYear={currentYear} />}
      </div>
    </div>
  );
}
