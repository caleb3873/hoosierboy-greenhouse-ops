import { useEffect, useRef, useState } from "react";
import { isoWeekMonday } from "./ripple";
// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
// Replace these with your actual Supabase project values after setup
// Get them from: supabase.com → your project → Settings → API
export const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

let supabase = null;
export function getSupabase() {
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    // Dynamically imported to avoid errors before credentials are set
    const { createClient } = require("@supabase/supabase-js");
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

// ── SHARED CONSTANTS ──────────────────────────────────────────────────────────
export const SENSITIVITY = [
  { id: "hardy",      label: "Hardy",       desc: "Tolerates light frost",    color: "#4a90d9", minTemp: 28 },
  { id: "semi",       label: "Semi-Hardy",  desc: "No frost, cool nights ok", color: "#7fb069", minTemp: 35 },
  { id: "tender",     label: "Tender",      desc: "Warm nights required",     color: "#e07b39", minTemp: 45 },
  { id: "veryTender", label: "Very Tender", desc: "No cold exposure at all",  color: "#d94f3d", minTemp: 55 },
];

export const CROP_STATUS = [
  { id: "planned",     label: "Planned",     color: "#7a8c74" },
  { id: "propagating", label: "Propagating", color: "#8e44ad" },
  { id: "growing",     label: "Growing",     color: "#4a90d9" },
  { id: "outside",     label: "Outside",     color: "#c8791a" },
  { id: "ready",       label: "Ready",       color: "#7fb069" },
  { id: "shipped",     label: "Shipped",     color: "#1e2d1a" },
];

export const VARIETY_TAGS = [
  { id: "new",      label: "New",      color: "#8e44ad", bg: "#f5f0ff" },
  { id: "compact",  label: "Compact",  color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "vigorous", label: "Vigorous", color: "#c8791a", bg: "#fff4e8" },
  { id: "trial",    label: "Trial",    color: "#7a8c74", bg: "#f0f5ee" },
];

export const MATERIAL_TYPES = [
  { id: "urc",   label: "URC",   desc: "Unrooted cutting",    color: "#8e44ad", bg: "#f5f0ff" },
  { id: "seed",  label: "Seed",  desc: "Pelletized or raw",   color: "#c8791a", bg: "#fff4e8" },
  { id: "liner", label: "Liner", desc: "Finished plug/liner", color: "#2e7d9e", bg: "#e8f4f8" },
];

export const FLAG_TYPES = [
  { id: "pest",      label: "Pest",      color: "#c03030" },
  { id: "disease",   label: "Disease",   color: "#c8791a" },
  { id: "equipment", label: "Equipment", color: "#2e7d9e" },
  { id: "other",     label: "Other",     color: "#7a8c74" },
];

export const GROWER_ROLES = [
  { id: "head_grower", label: "Head Grower", color: "#1e5a8e", bg: "#e0ecf8" },
  { id: "grower",      label: "Grower",      color: "#2e7a2e", bg: "#e0f0e0" },
  { id: "assistant",   label: "Assistant",   color: "#7a8c74", bg: "#f0f5ee" },
];

export const APPLICATION_METHODS = [
  { id: "spray",    label: "Spray",    icon: "💨" },
  { id: "drench",   label: "Drench",   icon: "💧" },
  { id: "fog",      label: "Fog",      icon: "🌫" },
  { id: "granular", label: "Granular", icon: "🟤" },
];

export const REI_PRESETS = [
  { label: "4 hours",  hours: 4 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "Custom",   hours: null },
];

export const PPE_OPTIONS = [
  "Chemical-resistant gloves",
  "Long-sleeve shirt & pants",
  "Chemical-resistant apron",
  "Shoes + socks",
  "Protective eyewear",
  "Respirator (NIOSH approved)",
  "Chemical-resistant headgear",
  "Full-body chemical-resistant suit",
];

// ── SHARED HELPERS ────────────────────────────────────────────────────────────
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const dc  = (o) => JSON.parse(JSON.stringify(o));
export const sens = (id) => SENSITIVITY.find(s => s.id === id) || SENSITIVITY[1];
export const stat = (id) => CROP_STATUS.find(s => s.id === id) || CROP_STATUS[0];

export function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(s);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}

export function formatWeekDate(week, year) {
  return weekToDate(+week, +year).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function subtractWeeks(week, year, n) {
  let w = +week - n, y = +year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}

export function addWeeks(week, year, n) {
  let w = +week + n, y = +year;
  while (w > 52) { w -= 52; y++; }
  return { week: w, year: y };
}

export function getCurrentWeek() {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.ceil((now - s) / (7 * 86400000));
}

// ── SALES SEASON LOCKOUT ─────────────────────────────────────────────────────
// Three sales windows per year when crop run planning is locked
const SALES_SEASONS = [
  { name: "Spring",  startMonth: 3,  startDay: 1,  endMonth: 5,  endDay: 31 },
  { name: "Fall",    startMonth: 8,  startDay: 1,  endMonth: 9,  endDay: 21 },
  { name: "Holiday", startMonth: 11, startDay: 15, endMonth: 12, endDay: 10 },
];

const WARNING_DAYS = 14; // Show countdown banner this many days before lockout

export function getSalesSeasonStatus(now) {
  if (!now) now = new Date();
  const m = now.getMonth() + 1; // 1-12
  const d = now.getDate();
  const y = now.getFullYear();

  // Check if currently in a sales season
  for (const season of SALES_SEASONS) {
    const start = new Date(y, season.startMonth - 1, season.startDay);
    const end = new Date(y, season.endMonth - 1, season.endDay, 23, 59, 59);
    if (now >= start && now <= end) {
      // Find next open date
      let opens = new Date(end);
      opens.setDate(opens.getDate() + 1);
      return {
        locked: true,
        season: season.name,
        opensAt: opens,
        opensLabel: opens.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      };
    }
  }

  // Check if approaching a sales season (warning period)
  for (const season of SALES_SEASONS) {
    const start = new Date(y, season.startMonth - 1, season.startDay);
    const warningStart = new Date(start);
    warningStart.setDate(warningStart.getDate() - WARNING_DAYS);
    if (now >= warningStart && now < start) {
      const daysLeft = Math.ceil((start - now) / 86400000);
      return {
        locked: false,
        warning: true,
        season: season.name,
        daysUntilLock: daysLeft,
        locksAt: start,
        locksLabel: start.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      };
    }
  }

  return { locked: false, warning: false };
}

export function weekLabel(week, year, currentYear) {
  return year !== currentYear
    ? `Wk ${week} '${String(year).slice(2)}`
    : `Wk ${week}`;
}

export function computeSchedule(run) {
  const { targetWeek: tw, targetYear: ty, movesOutside, weeksIndoor, weeksOutdoor, weeksProp } = run;
  if (!tw || !ty) return null;
  const finishWks  = movesOutside ? (+weeksIndoor||0) + (+weeksOutdoor||0) : (+weeksIndoor||0);
  const transplant = subtractWeeks(tw, ty, finishWks);
  const prop       = +weeksProp || 0;
  const seed       = prop > 0 ? subtractWeeks(transplant.week, transplant.year, prop) : null;
  const moveOut    = movesOutside && weeksOutdoor ? subtractWeeks(tw, ty, +weeksOutdoor) : null;
  return { transplant, seed, moveOut, ready: { week: +tw, year: +ty } };
}

// ── GOOGLE CALENDAR HELPERS ───────────────────────────────────────────────────
// Generates a Google Calendar event URL for a crop run milestone
// No API key needed - opens Google Calendar in browser pre-filled
export function makeGCalUrl({ title, description, week, year, location = "" }) {
  const startDate = weekToDate(week, year);
  const endDate   = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: description || "",
    location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generates all calendar events for a crop run
export function getCropRunCalendarEvents(run) {
  const sched = computeSchedule(run);
  if (!sched) return [];

  const loc = run.indoorAssignments?.[0];
  const locStr = loc
    ? `${loc.structureName}${loc.zoneName ? " / " + loc.zoneName : ""}${loc.itemName ? " / " + loc.itemName : ""}`
    : "";
  const cropLabel = `${run.cropName}${run.groupNumber ? " Grp " + run.groupNumber : ""}`;
  const baseDesc  = `Crop: ${cropLabel}\nCases: ${run.cases || "?"} x ${run.packSize || "?"}/cs\nLocation: ${locStr || "Unassigned"}`;

  const events = [];

  if (sched.seed) {
    events.push({
      id: `${run.id}-seed`,
      title: `${cropLabel} - Order / Start Propagation`,
      description: `${baseDesc}\n\nAction: Order young plants or start propagation`,
      week: sched.seed.week,
      year: sched.seed.year,
      location: locStr,
      type: "seed",
    });
  }

  events.push({
    id: `${run.id}-transplant`,
    title: `${cropLabel} - Transplant`,
    description: `${baseDesc}\n\nAction: Transplant into finish containers`,
    week: sched.transplant.week,
    year: sched.transplant.year,
    location: locStr,
    type: "transplant",
  });

  if (sched.moveOut) {
    events.push({
      id: `${run.id}-moveout`,
      title: `${cropLabel} - Move Outside`,
      description: `${baseDesc}\n\nAction: Move crop to outdoor pad`,
      week: sched.moveOut.week,
      year: sched.moveOut.year,
      location: locStr,
      type: "moveout",
    });
  }

  events.push({
    id: `${run.id}-ready`,
    title: `${cropLabel} - READY TO SHIP`,
    description: `${baseDesc}\n\nCrop is ready for customer pickup/delivery`,
    week: sched.ready.week,
    year: sched.ready.year,
    location: locStr,
    type: "ready",
  });

  return events;
}

export const FERTILIZER_TYPES = [
  { id: "none",     label: "Water Only",    color: "#4a90d9", bg: "#e0ecf8" },
  { id: "standard", label: "Standard Feed", color: "#2e7a2e", bg: "#e0f0e0" },
  { id: "geranium", label: "Geranium Feed", color: "#c03030", bg: "#fce8e8" },
  { id: "custom",   label: "Custom",        color: "#8e44ad", bg: "#f5f0ff" },
];

export const URGENCY_LEVELS = [
  { id: "low",      label: "Low",      color: "#7a8c74", bg: "#f0f5ee" },
  { id: "normal",   label: "Normal",   color: "#4a90d9", bg: "#e0ecf8" },
  { id: "high",     label: "High",     color: "#c8791a", bg: "#fff4e8" },
  { id: "critical", label: "Critical", color: "#c03030", bg: "#fce8e8" },
];


// One size vocabulary for every analysis tab (Caleb's rules):
//   POT 8" stays POT 8" (with its diameter) · FIBER keeps LG./SM. · 8" BLOOM
//   BUDDIES groups as 8" BLOOM BUDDY · a bare 8"+ with no program is CUSTOM
//   potting · 4.5"/6.5" stay themselves (pack items) · Winter styles
//   (5.5" POT X, 10 BLOOM X) map to POT 5.5" / 10 BLOOM.
export function sizeLabelForItem(name) {
  const s = String(name || "").trim().toUpperCase();
  let m;
  if ((m = s.match(/^HB\s*(\d+(?:\.\d+)?)/))) return `HB ${m[1]}"`;
  if ((m = s.match(/^POT\s*(\d+(?:\.\d+)?)/))) return `POT ${m[1]}"`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"\s*POT\b/))) return `POT ${m[1]}"`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*BLOOM\b/))) return `${m[1]} BLOOM`;
  if ((m = s.match(/^BOWL\s*(\d+(?:\.\d+)?)?/)) && /^BOWL/.test(s)) return m[1] ? `BOWL ${m[1]}"` : "BOWL";
  if ((m = s.match(/^FIBER\s*(LG|LARGE|SM|SMALL|MED|MD)?/)) && /^FIBER/.test(s)) {
    const q = m[1] || "";
    return q ? `FIBER ${q[0] === "S" ? "SM." : q[0] === "M" ? "MED." : "LG."}` : "FIBER";
  }
  if (/^1801L/.test(s)) return "1801L";
  if (/^1801S/.test(s)) return "1801S";
  if (/^1801/.test(s)) return "1801";
  if (/^MARKET/.test(s)) return "MARKET BASKET";
  if ((m = s.match(/^(\d+)\s*CELL/))) return `${m[1]} CELL`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"\s*BLOOM BUDD/))) return `${m[1]}" BLOOM BUDDY`;
  if ((m = s.match(/^(\d+(?:\.\d+)?)"/))) {
    return parseFloat(m[1]) >= 8 ? `${m[1]}" CUSTOM` : `${m[1]}"`;
  }
  return (s.match(/^[A-Z]+/) || ["—"])[0];
}

// ── THE list order (Caleb 2026-07-29, STANDING RULE): size → cultivar → series → color.
// Every list, every dropdown, every time — import plantOrder and stop re-deciding.
// Size sequence follows the pot_size_sort_order convention: pots small→large, then
// finished planters (fiber), then hanging baskets, then trays/plugs/misc, then sizeless.
// After size, plain locale compare does the rest: names run CROP SERIES COLOR, so
// alpha == cultivar → series → color.
export function sizeSortVal(label) {
  const s = String(label || "").trim();
  let m = s.match(/^(?:pot\s+)?([\d.]+)\s*"/i);          // 4.5" Pot · POT 7.5" · 9" Pan
  if (m) return +m[1];
  if (/^fiber/i.test(s)) return 100 + (/lg/i.test(s) ? 2 : 1);
  m = s.match(/^hb\s*([\d.]+)/i) || s.match(/^([\d.]+)\s*"\s*hb/i);
  if (m) return 200 + (+m[1] || 0);
  if (/^\d+\s*(cell|strip|plug)/i.test(s)) return 300;
  return 500;
}
export function plantOrder(a, b) {
  const av = sizeSortVal(a), bv = sizeSortVal(b);
  if (av !== bv) return av - bv;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

// ── ISO week-wrap that respects 53-week years (Caleb 7/29: prop 5 from plant wk5
// landed on wk52 of 2026 = SIX real weeks — 2026 has 53 ISO weeks, Jan 1 is a
// Thursday, and every inline wrap hardcoded "+52"). Use these, never "+52".
export function weeksInYear(y) {
  const jan1 = new Date(y, 0, 1).getDay();
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return (jan1 === 4 || (leap && jan1 === 3)) ? 53 : 52;
}
export function wrapWk(wk, yr) {
  while (wk <= 0) { yr -= 1; wk += weeksInYear(yr); }
  while (wk > weeksInYear(yr)) { wk -= weeksInYear(yr); yr += 1; }
  return { wk, yr, year: yr };   // both spellings — callers use .yr or .year
}

// ── ONE-NUMBER write-through (Caleb 8/4: "no more targeted, just planned") ──────
// Distribute POTS across an item's bench rows proportionally, in each row's native
// encoding (pot-native factor 1; flat-native factor ppu), and scale combo kids the
// same way. Multi-pass remainder grant so mixed-factor items land as close to the
// requested total as native units allow; returns { achieved } — CALLERS MUST record
// achieved (not requested) as the target, so plan and decision never diverge.
// Throws on any write error so callers don't stamp "applied" over a failed push.
export async function pushTargetToRows(sb, planId, itemName, pots) {
  let { data: rows0, error: e0 } = await sb.from("scheduled_crops")
    .select("id,qty_pots,ppp,plants_per_unit,pack_size,placed_at")
    .eq("plan_id", planId).eq("item_name", itemName).not("is_combo_component", "is", true);
  if (e0) throw new Error(`read rows: ${e0.message}`);
  if (!rows0 || !rows0.length) return { rows: 0, achieved: null };
  // combo items: distribute over the TRUE parent rows only — sibling "phantom" basket
  // rows (mix baskets entered once per color bench) are excluded from every planned
  // total the app displays, so scaling them here would land the real parents short
  const { data: kidRefs } = await sb.from("scheduled_crops").select("combo_parent_id").in("combo_parent_id", rows0.map(r => r.id));
  const parentIds = new Set((kidRefs || []).map(k => k.combo_parent_id));
  if (parentIds.size && parentIds.size < rows0.length) rows0 = rows0.filter(r => parentIds.has(r.id));
  const pf = r => { const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1); const ppp = +r.ppp || 1; return (ppp >= ppu && ppu > 1) ? ppu : 1; };
  const factors = rows0.map(pf);
  const oldQty = rows0.map(r => +r.qty_pots || 0);
  const curPots = rows0.reduce((a, _, i) => a + oldQty[i] * factors[i], 0);

  // largest-remainder multi-pass over a SUBSET of row indexes
  const distribute = (idxs, target) => {
    const curSub = idxs.reduce((a, ri) => a + oldQty[ri] * factors[ri], 0);
    const exact = idxs.map(ri => curSub > 0 ? (target * (oldQty[ri] * factors[ri]) / curSub) / factors[ri] : (target / idxs.length) / factors[ri]);
    const flo = exact.map(Math.floor);
    let rem = target - flo.reduce((a, n, j) => a + n * factors[idxs[j]], 0);
    const order = exact.map((e, j) => ({ j, fr: e - flo[j] })).sort((a, b) => b.fr - a.fr);
    let granted = true;
    while (rem > 0 && granted) {
      granted = false;
      for (const o of order) { if (rem >= factors[idxs[o.j]]) { flo[o.j]++; rem -= factors[idxs[o.j]]; granted = true; } }
    }
    return { flo, achieved: target - rem };
  };

  // PLACED rows (Space map) are locked: a family-number change flows into the
  // unplaced rows; benches only shrink when the target drops below what's placed.
  const freeIdx = rows0.map((r, i) => !r.placed_at ? i : -1).filter(i => i >= 0);
  const lockedIdx = rows0.map((r, i) => r.placed_at ? i : -1).filter(i => i >= 0);
  const lockedPots = lockedIdx.reduce((a, ri) => a + oldQty[ri] * factors[ri], 0);
  const newQty = oldQty.slice();
  let achieved;
  if (!lockedIdx.length || !freeIdx.length) {
    // nothing placed, or EVERYTHING placed (deliberate edit) — classic full spread
    const all = rows0.map((_, i) => i);
    const sub = distribute(all, pots);
    all.forEach((ri, j) => { newQty[ri] = sub.flo[j]; });
    achieved = sub.achieved;
  } else if (pots >= lockedPots) {
    const sub = distribute(freeIdx, pots - lockedPots);
    freeIdx.forEach((ri, j) => { newQty[ri] = sub.flo[j]; });
    achieved = lockedPots + sub.achieved;
  } else {
    // target fell below what's already on benches: unplaced to zero, placed scale down
    freeIdx.forEach(ri => { newQty[ri] = 0; });
    const sub = distribute(lockedIdx, pots);
    lockedIdx.forEach((ri, j) => { newQty[ri] = sub.flo[j]; });
    achieved = sub.achieved;
  }

  for (let i = 0; i < rows0.length; i++) {
    if (newQty[i] !== oldQty[i]) {
      const { error } = await sb.from("scheduled_crops").update({ qty_pots: newQty[i] }).eq("id", rows0[i].id);
      if (error) throw new Error(`row update: ${error.message}`);
      rows0[i].qty_pots = newQty[i];
    }
  }
  // combo kids scale by THEIR parent's factor (locked parents unchanged → kids unchanged)
  const rowFactor = {};
  rows0.forEach((r, i) => { rowFactor[r.id] = oldQty[i] > 0 ? newQty[i] / oldQty[i] : (newQty[i] > 0 ? null : 0); });
  const { data: kids } = await sb.from("scheduled_crops").select("id,qty_plants_ordered,combo_parent_id").in("combo_parent_id", rows0.map(r => r.id));
  for (const k of (kids || [])) {
    const f = rowFactor[k.combo_parent_id];
    if (k.qty_plants_ordered != null && f != null && f !== 1) {
      const { error } = await sb.from("scheduled_crops").update({ qty_plants_ordered: Math.round((+k.qty_plants_ordered || 0) * f) }).eq("id", k.id);
      if (error) throw new Error(`kid update: ${error.message}`);
    }
  }
  return { rows: rows0.length, from: curPots, achieved, locked: lockedPots || undefined };
}

// ── FINISH DATE ↔ WEEK (Caleb 8/5: "finish needs to be finish DATE — mini calendar
// or a week number") ────────────────────────────────────────────────────────────
// ISO week+year of a calendar date (the Thursday decides the ISO year).
export function isoWkYrOf(dateStr) {
  const t = new Date(dateStr + "T00:00:00");
  const dn = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dn + 3);
  const yr = t.getFullYear();
  const f = new Date(yr, 0, 4);
  const wk = 1 + Math.round(((t - f) / 864e5 - 3 + (f.getDay() + 6) % 7) / 7);
  return { wk, yr };
}

// One finish control everywhere: type a week ("18" or "2718") OR hit 📅 for a native
// mini calendar — a picked date converts to its ISO week. Commits (wk, yr) only on a
// real change; shows the week's Monday so weeks and dates stay one language.
export function FinishWkInput({ wk, yr, onCommit, disabled, placeholder = "YYWW", width = 58, amber = false, title, showDate = true }) {
  const dateRef = useRef(null);
  const cur = wk != null ? `${String((yr ?? 2027) % 100).padStart(2, "0")}${String(wk).padStart(2, "0")}` : "";
  const [draft, setDraft] = useState(cur);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(cur); }, [cur, focus]);   // eslint-disable-line
  const monday = wk != null ? isoWeekMonday(yr ?? 2027, wk) : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, position: "relative" }} onClick={e => e.stopPropagation()}>
      <input value={draft} disabled={disabled} inputMode="numeric" placeholder={placeholder} title={title}
        onFocus={() => setFocus(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          setFocus(false);
          const digits = draft.replace(/\D/g, "");
          if (!digits || draft === cur) { setDraft(cur); return; }
          const w = digits.length <= 2 ? +digits : +digits.slice(2);
          const y = digits.length <= 2 ? (yr ?? 2027) : 2000 + +digits.slice(0, 2);
          if (!w || w > 53) { setDraft(cur); return; }
          if (w === wk && y === (yr ?? y)) { setDraft(cur); return; }
          onCommit(w, y);
        }}
        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ width, padding: "3px 5px", textAlign: "center", borderRadius: 6,
          border: `1.5px solid ${amber ? "#e0b45e" : "#cfe3bd"}`, fontFamily: "ui-monospace,Menlo,monospace",
          fontSize: 11.5, fontWeight: 700, color: "#2e7d32", background: "#fff", boxSizing: "border-box" }} />
      <button type="button" disabled={disabled} title="pick a calendar date — it becomes that date's finish week"
        onClick={() => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch { el.click(); } }}
        style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>📅</button>
      <input ref={dateRef} type="date" value={monday || ""} tabIndex={-1} aria-hidden
        onChange={e => { if (!e.target.value) return; const r = isoWkYrOf(e.target.value); onCommit(r.wk, r.yr); }}
        style={{ position: "absolute", left: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none", border: 0, padding: 0 }} />
      {showDate && monday && (
        <span style={{ fontSize: 10, color: "#7a8c74", whiteSpace: "nowrap" }}>
          {new Date(monday + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
      )}
    </span>
  );
}

// ── 🛒 Lock in broker orders ─────────────────────────────────────────────────
// specs: [{ varietyName, varietyId, broker, supplier, shipWeek, shipYear,
//           plants, price, material, form }] — one per variety×ship-week.
// Hard rules (Caleb 8/10): URC/CALL = minimum 100 per color, ordered in 100s;
// supplier orders default to a 2,000 minimum (checked in the Orders tab UI,
// not enforced here — combining weeks to hit it is a human call).
// Grain: ONE DRAFT per broker+supplier+FARM+ship-week — minimums apply per
// individual farm (Dümmen Ethiopia ≠ Dümmen Mexico), not per broker/supplier.
// Re-locking the same variety UPDATES its line in place — never a second line,
// which is the no-double-ordering guard.
// Farm resolution — minimums apply per FARM. Caleb's supply-chain rules (8/10/26):
//   Ball FloraPlant: geraniums → Mexico; everything else → Las Limas
//   Syngenta:        geraniums → Syngenta Mexico; everything else → Syngenta Guatemala
//   Dümmen:          perennials → Dummen Perennials; geraniums → Dummen Oglevee Mexico;
//                    everything else → Dummen El Salvador
// Other suppliers: fall back to the quote's origin column (or none).
export function farmOf(supplier, cropName, isPerennial, quoteOrigin) {
  const sup = String(supplier || "").toLowerCase();
  const ger = /geranium|pelargonium/i.test(String(cropName || ""));
  if (/ball\s*floraplant/.test(sup)) return ger ? "Ball FloraPlant Mexico" : "Ball FloraPlant Las Limas";
  if (/syngenta/.test(sup))          return ger ? "Syngenta Mexico" : "Syngenta Guatemala";
  if (/d[uü]mmen/.test(sup)) {
    if (isPerennial) return "Dummen Perennials";
    return ger ? "Dummen Oglevee Mexico" : "Dummen El Salvador";
  }
  return quoteOrigin || null;
}

export async function lockBrokerOrders(sb, planId, specs) {
  const ready = [], skipped = [];
  specs.forEach(l => {
    if (!(l.plants > 0)) return;                       // nothing planned — not an error
    if (!l.broker || !l.shipWeek) { skipped.push(l); return; }
    const qty = /URC|CALL/i.test(l.form || "")
      ? Math.max(100, Math.ceil(l.plants / 100) * 100)
      : Math.ceil(l.plants);
    ready.push({ ...l, qty });
  });

  const groups = {};
  ready.forEach(l => {
    const k = `${l.broker}|${l.supplier || ""}|${l.farm || ""}|${l.shipYear || ""}|${l.shipWeek}`;
    (groups[k] = groups[k] || []).push(l);
  });

  const results = [];
  for (const ls of Object.values(groups)) {
    const { broker, supplier, farm, shipWeek } = ls[0];
    const shipYear = ls[0].shipYear || new Date().getFullYear() + 1;
    let q = sb.from("purchase_orders").select("id,order_number").eq("plan_id", planId)
      .eq("broker", broker).eq("ship_week", shipWeek).eq("ship_year", shipYear).eq("status", "draft");
    q = supplier ? q.eq("supplier", supplier) : q.is("supplier", null);
    q = farm ? q.eq("farm", farm) : q.is("farm", null);
    let { data: ord, error: findErr } = await q.maybeSingle();
    if (findErr) throw new Error(findErr.message);
    if (!ord) {
      const yyww = `${String(shipYear % 100).padStart(2, "0")}${String(shipWeek).padStart(2, "0")}`;
      const num = `DRAFT-${String(broker).slice(0, 4).toUpperCase()}${supplier ? "-" + String(supplier).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : ""}${farm ? "-" + String(farm).replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() : ""}-${yyww}`;
      const { data: ins, error } = await sb.from("purchase_orders").insert({
        plan_id: planId, order_number: num, broker, supplier: supplier || null, farm: farm || null,
        ship_week: shipWeek, ship_year: shipYear,
        ship_date: isoWeekMonday(shipYear, shipWeek) || null,   // already an ISO date string
        status: "draft", total_qty: 0, total_cost: 0,
      }).select("id,order_number").single();
      if (error) throw new Error(error.message);
      ord = ins;
    }
    const { data: exist, error: exErr } = await sb.from("purchase_order_lines")
      .select("id,variety_name,line_no").eq("purchase_order_id", ord.id);
    if (exErr) throw new Error(exErr.message);
    let nextNo = Math.max(0, ...(exist || []).map(l => +l.line_no || 0)) + 1;
    for (const l of ls) {
      const ext = l.price != null ? +(l.qty * l.price).toFixed(2) : null;
      const match = (exist || []).find(x => String(x.variety_name).trim().toLowerCase() === String(l.varietyName).trim().toLowerCase());
      const payload = {
        variety_name: l.varietyName, variety_id: l.varietyId || null, recipe_id: l.recipeId || null,
        qty_ordered: l.qty, unit_price: l.price ?? null, ext_price: ext,
        material: l.material || null, form: l.form || null, status: "active",
      };
      const { error } = match
        ? await sb.from("purchase_order_lines").update(payload).eq("id", match.id)
        : await sb.from("purchase_order_lines").insert({ ...payload, purchase_order_id: ord.id, line_no: nextNo++ });
      if (error) throw new Error(error.message);
    }
    const { data: allL } = await sb.from("purchase_order_lines")
      .select("qty_ordered,ext_price,status").eq("purchase_order_id", ord.id);
    const act = (allL || []).filter(x => x.status === "active");
    const totQ = act.reduce((s, x) => s + (+x.qty_ordered || 0), 0);
    const totC = act.reduce((s, x) => s + (+x.ext_price || 0), 0);
    await sb.from("purchase_orders").update({ total_qty: totQ, total_cost: +totC.toFixed(2) }).eq("id", ord.id);
    results.push({ orderNumber: ord.order_number, broker, supplier, farm, shipWeek, lines: ls.length, qty: totQ });
  }
  return { orders: results, skipped };
}
