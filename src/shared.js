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
