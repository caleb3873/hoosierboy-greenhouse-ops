// Live inventory of pots on the pads. Spreadsheet-style grid optimized for
// phones: tap a Fall Program item from the search to auto-create a row
// pre-filled with location/row/size/type/variety — count is the only thing
// the user types.
import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "./Auth";
import {
  useInventoryLots,
  useFallProgramItems,
  getSupabase,
} from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

// Derive a "site" group from a location string so the picker can show top-
// level chips like Bluff / SE Pad / North Pad / East Pad / BASKETS that
// drill down into the specific quonset/pad.
function siteFromLocation(loc) {
  if (!loc) return loc;
  let s = loc.trim();
  // Strip "Quonset N", "Hut N"
  s = s.replace(/\s+(Quonset|Hut)\s+\S+\s*$/i, "");
  // Strip trailing number with optional letter suffix (SE Pad 06, SE Pad 06A)
  s = s.replace(/\s+\d+[A-Z]?\s*$/i, "");
  // For *Pad locations strip trailing direction qualifier
  if (/\bPad\b/i.test(s)) {
    s = s.replace(/\s+(North|South|East|West|Outside)\s*$/i, "");
  }
  return s.trim() || loc;
}

// Pull pot size out of a Fall Program category string.
// "09\" MUM" → "9\"", "14\" MUM W/ GRASS" → "14\"", "MUM BASKET" → "HB"
function sizeFromCategory(cat) {
  if (!cat) return "";
  const m = cat.match(/^(\d+(?:\.\d+)?)"/);
  if (m) return `${parseFloat(m[1])}"`;
  if (/HB|BASKET|BSKT/i.test(cat)) return "HB";
  if (/COMBO/i.test(cat)) return "Combo";
  return "";
}

// Pull plant type out of category (preferred) or variety (fallback)
function typeFromCategory(cat, variety) {
  const u = (cat || "").toUpperCase();
  if (u.includes("MUM"))     return "Mum";
  if (u.includes("ASTER"))   return "Aster";
  if (u.includes("KALE"))    return "Kale";
  if (u.includes("CABBAGE")) return "Cabbage";
  if (u.includes("PANSY"))   return "Pansy";
  if (u.includes("COMBO"))   return "Combo";
  if (u.includes("ANNUAL"))  return "Annual";
  const v = (variety || "").toUpperCase();
  if (v.includes("MUM"))   return "Mum";
  if (v.includes("ASTER")) return "Aster";
  return "";
}

const POT_SIZES = ["", "4.5\"", "6\"", "8\"", "9\"", "10\"", "12\"", "14\"", "HB", "Tray", "Liner", "Combo"];

// Mobile-first layout: every record renders in two visual rows so the four
// critical fields (Loc · Row · Item · Qty) all fit across a phone viewport
// without horizontal scroll. Notes + Actions sit on a second line spanning
// the full width. Header mirrors the top-row grid template.
//
// Top-row grid: fractional widths (sum 100%) — Item gets the most space.
const TOP_COLS = "1.1fr 0.8fr 1.9fr 0.8fr";

export default function InventoryView({ onBack }) {
  const { displayName } = useAuth();
  const { rows: lots, insert, update, remove } = useInventoryLots();
  const { rows: planItems } = useFallProgramItems();

  // Screen mode: "index" = location drilldown cards (like maintenance houses);
  // "sheet" = the spreadsheet for a single location (or the flat view).
  const [screen, setScreen] = useState("index");
  // Walk mode within the sheet: "census" counts everything, "sweep" focuses
  // on clearing emptied rows (subsequent visits after the initial count).
  const [walkMode, setWalkMode] = useState("census");
  // Session state — tracks edits + manual additions since this location was
  // opened so the user can Undo before hitting Save & done.
  //   sessionEdits: Map<lotId, {field → original value}>
  //   sessionAdded: Set<lotId> for rows the user added manually this session
  const [sessionEdits, setSessionEdits] = useState(new Map());
  const [sessionAdded, setSessionAdded] = useState(new Set());
  const [filterLocation, setFilterLocation] = useState("");
  // Photo viewer modal — opens when 📷 is tapped on a row. Holds { lot, scope }
  // where scope is "row" (this row only) or "pad" (all lots at this location).
  const [photoLot, setPhotoLot] = useState(null);
  const [photoScope, setPhotoScope] = useState("row");
  // Location picker — two-step: pick site, then pick location within site.
  const [locPickerLot, setLocPickerLot] = useState(null);
  const [locPickerSite, setLocPickerSite] = useState(null);
  // Row picker — multi-select with "Select all". Confirming creates one lot
  // per selected row, all sharing the source lot's location.
  const [rowPickerLot, setRowPickerLot] = useState(null);
  const [rowPickerSelection, setRowPickerSelection] = useState(new Set());
  // Item picker is two-step:
  //   1. pickerSize = null → show the size chip grid
  //   2. pickerSize = "9\"" (etc) → show varieties in that size, searchable
  const [pickerLot, setPickerLot] = useState(null);
  const [pickerSize, setPickerSize] = useState(null);
  const [pickerQuery, setPickerQuery] = useState("");

  // ── Derived dictionaries from Fall Program items ───────────────────────────
  const allLocations = useMemo(() => {
    const set = new Set();
    (planItems || []).forEach(p => p.location && set.add(p.location.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [planItems]);

  // Sites → set of locations, computed once
  const locationsBySite = useMemo(() => {
    const m = new Map();
    allLocations.forEach(loc => {
      const site = siteFromLocation(loc);
      if (!m.has(site)) m.set(site, new Set());
      m.get(site).add(loc);
    });
    return m;
  }, [allLocations]);

  const allSites = useMemo(() => {
    return [...locationsBySite.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [locationsBySite]);

  // Map: location → set of row_ids planted there
  const rowsForLocation = useMemo(() => {
    const m = new Map();
    (planItems || []).forEach(p => {
      if (!p.location || !p.rowId) return;
      if (!m.has(p.location)) m.set(p.location, new Set());
      m.get(p.location).add(p.rowId);
    });
    return m;
  }, [planItems]);

  const plantTypes = useMemo(() => {
    const s = new Set();
    (planItems || []).forEach(p => {
      const t = typeFromCategory(p.category, p.variety);
      if (t) s.add(t);
    });
    if (s.size === 0) ["Mum", "Aster", "Cabbage", "Kale", "Pansy"].forEach(t => s.add(t));
    return [...s].sort();
  }, [planItems]);

  // Map: plant type → set of varieties grown
  const varietiesForType = useMemo(() => {
    const m = new Map();
    (planItems || []).forEach(p => {
      if (!p.variety) return;
      const t = typeFromCategory(p.category, p.variety);
      if (!t) return;
      if (!m.has(t)) m.set(t, new Set());
      m.get(t).add(p.variety);
    });
    return m;
  }, [planItems]);

  // ── Step 1 of picker: list of distinct sizes in Fall Program, each with
  // a count of unique varieties available in that size. ──────────────────────
  const pickerSizes = useMemo(() => {
    if (!pickerLot) return [];
    const byCat = new Map(); // size label → Set of varieties
    for (const p of planItems || []) {
      if (!p.variety) continue;
      const size = sizeFromCategory(p.category) || p.category || "—";
      if (!byCat.has(size)) byCat.set(size, new Set());
      byCat.get(size).add(p.variety);
    }
    return [...byCat.entries()]
      .map(([size, vSet]) => ({ size, count: vSet.size }))
      .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }));
  }, [planItems, pickerLot]);

  // ── Step 2 of picker: varieties (deduped on (location · rowId · variety))
  // for the chosen size, filtered by query. ─────────────────────────────────
  const pickerResults = useMemo(() => {
    if (!pickerLot || !pickerSize) return [];
    const q = pickerQuery.trim().toLowerCase();
    const seen = new Set();
    const out = [];
    for (const p of planItems || []) {
      if (!p.variety) continue;
      const size = sizeFromCategory(p.category) || p.category || "—";
      if (size !== pickerSize) continue;
      if (q) {
        const hay = `${p.variety} ${p.location || ""} ${p.rowId || ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const k = `${p.location}||${p.rowId}||${p.variety}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 80) break;
    }
    return out;
  }, [planItems, pickerLot, pickerSize, pickerQuery]);

  // ── Per-location roll-up — drives the drilldown index cards ───────────────
  const locationSummary = useMemo(() => {
    // Union of plan locations + locations that have manual lots
    const all = new Set([...allLocations]);
    (lots || []).forEach(l => l.location && all.add(l.location));

    return [...all]
      .map(loc => {
        const lotsHere = (lots || []).filter(l => (l.location || "") === loc);
        const planHere = (planItems || []).filter(p => (p.location || "") === loc);
        const plannedKeys = new Set();
        planHere.forEach(p => { if (p.rowId && p.variety) plannedKeys.add(`${p.rowId}||${p.variety}`); });
        const walkedKeys = new Set();
        lotsHere.forEach(l => { if (l.rowId && l.variety) walkedKeys.add(`${l.rowId}||${l.variety}`); });
        const unwalked = [...plannedKeys].filter(k => !walkedKeys.has(k)).length;
        const lastCount = lotsHere
          .map(l => l.lastCountedAt).filter(Boolean)
          .sort().reverse()[0] || null;
        const countedToday = lotsHere.filter(l => {
          if (!l.lastCountedAt) return false;
          return new Date(l.lastCountedAt).toDateString() === new Date().toDateString();
        }).length;
        return {
          location: loc,
          plannedCount: plannedKeys.size,
          walkedCount: walkedKeys.size,
          unwalked,
          lots: lotsHere.length,
          totalPots: lotsHere.reduce((s, l) => s + (l.quantity || 0), 0),
          lastCount,
          countedToday,
        };
      })
      .sort((a, b) => a.location.localeCompare(b.location, undefined, { numeric: true }));
  }, [allLocations, lots, planItems]);

  // ── Duplicate detection: groups of lots sharing (location · row · variety) ─
  const duplicateKeys = useMemo(() => {
    const counts = new Map();
    (lots || []).forEach(l => {
      if (!l.location || !l.rowId || !l.variety) return;
      const k = `${l.location}||${l.rowId}||${l.variety}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [lots]);
  const isDup = (lot) => {
    if (!lot.location || !lot.rowId || !lot.variety) return false;
    return duplicateKeys.has(`${lot.location}||${lot.rowId}||${lot.variety}`);
  };

  // ── Visible lots (filter + sort) ───────────────────────────────────────────
  const visibleLots = useMemo(() => {
    const filtered = filterLocation
      ? (lots || []).filter(l => (l.location || "").toLowerCase().includes(filterLocation.toLowerCase()))
      : (lots || []);
    return [...filtered].sort((a, b) =>
      (a.location || "").localeCompare(b.location || "", undefined, { numeric: true }) ||
      (a.rowId || "").localeCompare(b.rowId || "", undefined, { numeric: true })
    );
  }, [lots, filterLocation]);

  // Most recently touched lot — drives the "+ Add row" autofill. useInventoryLots
  // orders by updated_at desc, so lots[0] is whatever the user just edited or
  // inserted. Walking a pad means: set location once, then "+ Add row" keeps
  // pre-filling location + next row id so you only pick item + qty.
  const lastLot = (lots || [])[0];

  function nextRowId(currentRowId) {
    if (!currentRowId) return "";
    const m = currentRowId.match(/(\d+)(?!.*\d)/);
    if (!m) return currentRowId;
    const n = String(parseInt(m[1], 10) + 1).padStart(m[1].length, "0");
    return currentRowId.slice(0, m.index) + n + currentRowId.slice(m.index + m[1].length);
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  // addLot called from "+ Add row" buttons. If no explicit seed, pre-fills
  // location + incremented row from the last edited lot. Records the new row
  // in sessionAdded so Undo can remove it.
  async function addLot(seed = {}) {
    const fallbackLocation = filterLocation || lastLot?.location || "";
    const fallbackRowId    = lastLot?.location === fallbackLocation ? nextRowId(lastLot?.rowId) : "";
    const created = await insert({
      location: seed.location ?? fallbackLocation,
      rowId:    seed.rowId    ?? fallbackRowId,
      potSize:  seed.potSize  || "",
      plantType: seed.plantType || "",
      variety:  seed.variety || "",
      quantity: seed.quantity ?? null,
      notes: "",
      countedAt: new Date().toISOString(),
      countedBy: displayName || "Manager",
    });
    if (created?.id && screen === "sheet") {
      setSessionAdded(prev => new Set(prev).add(created.id));
    }
  }

  // ── Location picker ────────────────────────────────────────────────────────
  function openLocationPicker(lot) {
    setLocPickerLot(lot);
    setLocPickerSite(lot.location ? siteFromLocation(lot.location) : null);
  }
  function closeLocationPicker() {
    setLocPickerLot(null);
    setLocPickerSite(null);
  }
  async function applyLocationToLot(loc) {
    if (!locPickerLot) return;
    // Changing the location invalidates the row id, so clear it
    await patch(locPickerLot, { location: loc, rowId: "" });
    closeLocationPicker();
  }

  // ── Row picker (multi-select / select all) ─────────────────────────────────
  function openRowPicker(lot) {
    setRowPickerLot(lot);
    setRowPickerSelection(new Set(lot.rowId ? [lot.rowId] : []));
  }
  function closeRowPicker() {
    setRowPickerLot(null);
    setRowPickerSelection(new Set());
  }
  function toggleRowSelection(rowId) {
    setRowPickerSelection(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }
  async function confirmRowSelection() {
    if (!rowPickerLot) return;
    const picks = [...rowPickerSelection].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (picks.length === 0) {
      // Nothing selected — just close
      closeRowPicker();
      return;
    }
    // First pick goes on the source lot. Remaining picks become new lots
    // sharing the same location, blank item/qty so the user can fill in.
    await patch(rowPickerLot, { rowId: picks[0] });
    for (let i = 1; i < picks.length; i++) {
      await insert({
        location: rowPickerLot.location || "",
        rowId: picks[i],
        potSize: "",
        plantType: "",
        variety: "",
        quantity: 0,
        notes: "",
        countedAt: new Date().toISOString(),
        countedBy: displayName || "Manager",
      });
    }
    closeRowPicker();
  }

  function openPicker(lot) {
    setPickerLot(lot);
    // If the lot already has a size, jump straight to the variety step
    setPickerSize(lot.potSize || null);
    setPickerQuery("");
  }

  function closePicker() {
    setPickerLot(null);
    setPickerSize(null);
    setPickerQuery("");
  }

  // Step-2 selection: patches the lot with ONLY the picked size + variety.
  // Location/Row are set by the user (they're standing in the row counting);
  // the plan's location is just shown in the picker list for orientation.
  async function applyPlanItemToLot(p) {
    if (!pickerLot) return;
    await patch(pickerLot, {
      potSize:   pickerSize || sizeFromCategory(p.category) || pickerLot.potSize || "",
      plantType: typeFromCategory(p.category, p.variety) || pickerLot.plantType || "",
      variety:   p.variety || "",
    });
    closePicker();
  }

  async function patch(lot, changes) {
    // Record original values for Undo, only for fields not yet snapshotted
    // this session. Only do this in the sheet (drilled-in) view.
    if (screen === "sheet") {
      setSessionEdits(prev => {
        const next = new Map(prev);
        const snap = { ...(next.get(lot.id) || {}) };
        for (const key of Object.keys(changes)) {
          if (!(key in snap)) snap[key] = lot[key] ?? null;
        }
        next.set(lot.id, snap);
        return next;
      });
    }
    // If qty changed and is a real number, append a count history entry so we
    // have a season-long timeline per lot ("counted 198 last Tue, 174 Wed,
    // 156 today"). Also stamp last_counted_at for the status pill.
    const qtyChanged = ("quantity" in changes) && changes.quantity !== lot.quantity;
    let countHistory = lot.countHistory || [];
    let lastCountedAt = lot.lastCountedAt || null;
    if (qtyChanged && Number.isFinite(changes.quantity)) {
      lastCountedAt = new Date().toISOString();
      countHistory = [...countHistory, { qty: changes.quantity, countedAt: lastCountedAt, countedBy: displayName || "Manager" }];
    }
    await update(lot.id, {
      ...changes,
      countedAt: new Date().toISOString(),
      countedBy: displayName || lot.countedBy,
      ...(qtyChanged ? { countHistory, lastCountedAt } : {}),
    });
  }

  // ── Walk-from-Plan ─────────────────────────────────────────────────────────
  // Reads fall_program_items for the location and creates an inventory lot
  // for every planned (location · row · variety) that doesn't already exist.
  // Existing lots are untouched — idempotent + safe mid-season.
  //
  // silent=true skips alerts/confirmations so we can call it automatically
  // when the user drills into a location for the first time.
  async function walkFromPlan(location, { silent = false } = {}) {
    if (!location) return 0;
    const planned = (planItems || []).filter(p =>
      (p.location || "").trim().toLowerCase() === location.trim().toLowerCase() &&
      p.variety && p.rowId
    );
    if (planned.length === 0) {
      if (!silent) alert(`No Fall Program plan rows for "${location}".`);
      return 0;
    }
    // Aggregate planned qty by (rowId · variety) — multi-bench varieties
    // can appear as several rows in the plan.
    const byKey = new Map();
    for (const p of planned) {
      const k = `${p.rowId}||${p.variety}`;
      const prev = byKey.get(k) || { ...p, qty: 0 };
      prev.qty += (p.qty || 0) * (p.ppp || 1);
      byKey.set(k, prev);
    }
    const existing = new Set(
      (lots || [])
        .filter(l => (l.location || "").toLowerCase() === location.toLowerCase())
        .map(l => `${l.rowId || ""}||${l.variety || ""}`)
    );
    const toCreate = [...byKey.values()].filter(p => !existing.has(`${p.rowId}||${p.variety}`));
    if (toCreate.length === 0) {
      if (!silent) alert(`Nothing to add — every planned row at "${location}" is already in the grid.`);
      return 0;
    }
    if (!silent && !window.confirm(`Add ${toCreate.length} planned row${toCreate.length === 1 ? "" : "s"} for "${location}"?\n\nExisting rows won't be touched.`)) return 0;
    for (const p of toCreate) {
      await insert({
        location: p.location,
        rowId: p.rowId,
        potSize: sizeFromCategory(p.category),
        plantType: typeFromCategory(p.category, p.variety),
        variety: p.variety,
        // Quantity intentionally null until the user counts — lets us tell
        // 'uncounted' apart from 'counted 0'. lastCountedAt stays null too.
        quantity: null,
        plannedQty: p.qty,
        notes: "",
      });
    }
    return toCreate.length;
  }

  // ── Photos ─────────────────────────────────────────────────────────────────
  async function uploadPhotoForLot(lot, file) {
    const sb = getSupabase();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeLoc = (lot.location || "no-loc").replace(/[^a-z0-9-]/gi, "_");
    const path = `${safeLoc}/${lot.id}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("inventory-photos").upload(path, file, { upsert: false });
    if (error) throw error;
    const entry = { path, takenAt: new Date().toISOString(), takenBy: displayName || "Manager" };
    const nextPhotos = [...(lot.photos || []), entry];
    await patch(lot, { photos: nextPhotos });
  }

  async function removePhotoFromLot(lot, photoPath) {
    const sb = getSupabase();
    await sb.storage.from("inventory-photos").remove([photoPath]);
    const nextPhotos = (lot.photos || []).filter(p => p.path !== photoPath);
    await patch(lot, { photos: nextPhotos });
  }

  // Gather photos for the viewer. Scope = "row" → only this lot's photos.
  // Scope = "pad" → all photos across every lot at the same location.
  function photosFor(lot, scope) {
    if (!lot) return [];
    const seed = scope === "pad"
      ? (lots || []).filter(l => (l.location || "").toLowerCase() === (lot.location || "").toLowerCase())
      : [lot];
    const out = [];
    seed.forEach(l => (l.photos || []).forEach(p => out.push({ ...p, _lot: l })));
    return out.sort((a, b) => (b.takenAt || "").localeCompare(a.takenAt || ""));
  }

  function duplicate(lot) {
    addLot({
      location: lot.location,
      rowId: nextRowId(lot.rowId),
      potSize: lot.potSize,
      plantType: lot.plantType,
      variety: lot.variety,
    });
  }

  // Sweep mode: one-tap "this row is empty now". Sets qty=0, stamps history.
  async function markEmpty(lot) {
    if ((lot.quantity || 0) === 0) return; // already 0, nothing to do
    await patch(lot, { quantity: 0 });
  }

  // XLSX export — current visible lots, columns matched to what Tyler used
  // in the old Google Sheet (so it drops in without retraining).
  function exportExcel() {
    const rows = visibleLots.map(l => ({
      Location: l.location || "",
      Row: l.rowId || "",
      Size: l.potSize || "",
      Type: l.plantType || "",
      Variety: l.variety || "",
      Plan: Number.isFinite(l.plannedQty) ? l.plannedQty : "",
      Count: l.quantity ?? 0,
      Variance: Number.isFinite(l.plannedQty) ? ((l.quantity || 0) - l.plannedQty) : "",
      "Counts taken": (l.countHistory || []).length,
      "Last counted": l.lastCountedAt ? new Date(l.lastCountedAt).toLocaleString() : "",
      "Counted by": l.countedBy || "",
      Notes: l.notes || "",
      Duplicate: isDup(l) ? "yes" : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Column widths
    ws["!cols"] = [
      { wch: 22 }, { wch: 10 }, { wch: 7 }, { wch: 10 }, { wch: 28 },
      { wch: 6 }, { wch: 7 }, { wch: 9 }, { wch: 8 },
      { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 9 },
    ];
    const wb = XLSX.utils.book_new();
    const sheetName = (filterLocation || "Inventory").replace(/[^a-z0-9 _-]/gi, "").slice(0, 31) || "Inventory";
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const today = new Date().toISOString().slice(0, 10);
    const scope = filterLocation ? filterLocation.replace(/[^a-z0-9_-]/gi, "_") : "all";
    XLSX.writeFile(wb, `inventory_${scope}_${today}.xlsx`);
  }

  // Bulk delete — wipes everything currently visible (respects the location
  // filter). Two-step confirmation when more than 10 rows so a stray tap
  // can't nuke a whole walk.
  async function deleteAllShown() {
    const count = visibleLots.length;
    if (count === 0) return;
    const scope = filterLocation ? `the ${count} row${count === 1 ? "" : "s"} at "${filterLocation}"` : `all ${count} inventory row${count === 1 ? "" : "s"}`;
    if (!window.confirm(`Delete ${scope}? This can't be undone.`)) return;
    if (count > 10 && !window.confirm(`Really delete ${count} rows? Tap OK once more to confirm.`)) return;
    // Delete sequentially — useTable handles the in-memory state per call.
    for (const lot of visibleLots) {
      await remove(lot.id);
    }
  }

  // (Layout now responsive — no fixed widths needed)

  // Drilldown helper — enter the sheet for one location, in census mode, and
  // silently pre-load every planned row so the user just confirms or changes
  // counts. Idempotent: re-entering pulls in any new planned rows added
  // mid-season without disturbing existing counts.
  async function openLocation(loc) {
    setFilterLocation(loc);
    setScreen("sheet");
    setWalkMode("census");
    // Start a fresh session — clear undo state. walkFromPlan inserts are
    // pre-load, not user edits, so we don't track them as session adds.
    setSessionEdits(new Map());
    setSessionAdded(new Set());
    await walkFromPlan(loc, { silent: true });
  }

  const hasChanges = sessionEdits.size > 0 || sessionAdded.size > 0;

  // Undo every edit + manual addition made since openLocation. Edits revert
  // to their pre-session values; manually-added rows are deleted.
  async function undoChanges() {
    if (!hasChanges) return;
    if (!window.confirm(`Undo all ${sessionEdits.size + sessionAdded.size} change${sessionEdits.size + sessionAdded.size === 1 ? "" : "s"} made this session?`)) return;
    // Revert edits
    for (const [lotId, snapshot] of sessionEdits) {
      const cur = (lots || []).find(l => l.id === lotId);
      if (!cur) continue;
      await update(lotId, snapshot);
    }
    // Remove manually-added rows
    for (const lotId of sessionAdded) {
      await remove(lotId);
    }
    setSessionEdits(new Map());
    setSessionAdded(new Set());
  }

  // Save = location-check confirmation + return to index. Data is already in
  // the DB (we patch-on-edit for safety + history); this just clears the
  // session and bounces back to the location grid.
  function saveAndDone() {
    if (!window.confirm(`Save count for "${filterLocation || "all locations"}"?\n\nAre you in the right house / location?`)) return;
    setSessionEdits(new Map());
    setSessionAdded(new Set());
    setScreen("index");
  }

  // ── INDEX SCREEN — list of locations like the maintenance facility cards ──
  if (screen === "index") {
    return (
      <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 70 }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onBack}
            style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ← Hub
          </button>
          <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📊 Inventory</div>
          <button onClick={() => { setFilterLocation(""); setScreen("sheet"); }}
            style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Flat view
          </button>
        </div>

        <div style={{ padding: "12px 14px 4px", fontSize: 12, color: "#7a8c74", lineHeight: 1.4 }}>
          Tap a location to count it. <strong>Initial walk</strong> uses <em>Census</em> (count every row). After that, switch to <em>Sweep</em> to quickly clear rows that have emptied out.
        </div>

        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {locationSummary.length === 0 && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#7a8c74", padding: 30 }}>
              No locations in the Fall Program yet.
            </div>
          )}
          {locationSummary.map(s => {
            // Status: counted today, partial, stale, never
            const planFull = s.plannedCount > 0;
            const isCounted = s.lastCount && new Date(s.lastCount).toDateString() === new Date().toDateString();
            const daysAgo = s.lastCount ? Math.floor((Date.now() - new Date(s.lastCount).getTime()) / 86400000) : null;
            let chip, chipBg, chipColor;
            if (!s.lots && planFull)             { chip = "Not walked"; chipBg = "#e8eee5"; chipColor = "#7a8c74"; }
            else if (isCounted && s.unwalked === 0) { chip = "Counted today"; chipBg = "#dff2d2"; chipColor = "#2e5e1a"; }
            else if (s.unwalked > 0)             { chip = `${s.unwalked} unwalked`; chipBg = "#fff3c4"; chipColor = "#7a5a00"; }
            else if (daysAgo > 7)                { chip = `${daysAgo}d ago · stale`; chipBg = "#fdecea"; chipColor = "#7a2418"; }
            else                                 { chip = daysAgo === 1 ? "1 day ago" : `${daysAgo}d ago`; chipBg = "#fff3c4"; chipColor = "#7a5a00"; }
            return (
              <button key={s.location} onClick={() => openLocation(s.location)}
                style={{
                  background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12,
                  padding: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", lineHeight: 1.25, wordBreak: "break-word" }}>
                  📍 {s.location}
                </div>
                <div style={{ alignSelf: "flex-start", background: chipBg, color: chipColor, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 0.3 }}>
                  {chip}
                </div>
                <div style={{ fontSize: 11, color: "#7a8c74", lineHeight: 1.35 }}>
                  {s.lots > 0
                    ? <>{s.lots} row{s.lots === 1 ? "" : "s"} · <strong style={{ color: "#1e2d1a" }}>{s.totalPots.toLocaleString()}</strong> pots</>
                    : <>{s.plannedCount} planned row{s.plannedCount === 1 ? "" : "s"}</>}
                </div>
                {s.lastCount && (
                  <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>
                    Last: {new Date(s.lastCount).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── SHEET SCREEN — the existing spreadsheet, now reached via drilldown ────
  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 70 }}>
      {/* Header */}
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setScreen("index")}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Locations
        </button>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", textAlign: "center", flex: 1, padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {filterLocation || "All locations"}
        </div>
        <button onClick={exportExcel} title="Download Excel"
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ⬇ XLSX
        </button>
      </div>

      {/* Mode toggle — Census vs Sweep */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", padding: "8px 12px", display: "flex", gap: 6 }}>
        {[
          { id: "census", label: "Census", desc: "type qty" },
          { id: "sweep",  label: "Sweep",  desc: "tap empty" },
        ].map(m => (
          <button key={m.id} onClick={() => setWalkMode(m.id)}
            style={{
              flex: 1, padding: "8px 10px", borderRadius: 8,
              background: walkMode === m.id ? "#1e2d1a" : "#f2f5ef",
              color: walkMode === m.id ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${walkMode === m.id ? "#1e2d1a" : "#c8d8c0"}`,
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
            <span>{m.label}</span>
            <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8 }}>{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Filter + summary toolbar */}
      <div style={{ padding: "8px 12px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", alignItems: "center", gap: 8 }}>
        <input
          list="invloc-list"
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          placeholder="Filter by location"
          style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 12, fontFamily: "inherit" }}
        />
        <datalist id="invloc-list">{allLocations.map(l => <option key={l} value={l} />)}</datalist>
        {filterLocation && (
          <button onClick={() => setFilterLocation("")} style={btnSecondary}>✕</button>
        )}
        {filterLocation && allLocations.some(l => l.toLowerCase() === filterLocation.toLowerCase()) && (
          <button onClick={() => walkFromPlan(filterLocation)} title="Pull in any newly-planned rows since you last walked"
            style={btnSecondary}>↻ Sync plan</button>
        )}
        <button onClick={() => addLot({ location: filterLocation })} style={btnPrimary}>+ Add row</button>
        <span style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, whiteSpace: "nowrap" }}>
          {visibleLots.length} · {visibleLots.reduce((s, l) => s + (l.quantity || 0), 0).toLocaleString()}
        </span>
      </div>

      {/* (Walk-from-plan now runs automatically when you tap a location card.
          A small "Pull in latest plan rows" button stays in the toolbar for
          the case where the plan changes mid-season.) */}

      {/* Undo bar — only when there are session changes to undo. Replaces
          the older 'Delete shown' bar since destructive bulk-delete is now
          available behind the long-press 🗑 per row + Undo handles in-session
          mistakes. */}
      {hasChanges && (
        <div style={{ padding: "6px 12px", background: "#fff8e8", borderBottom: "1.5px solid #f0d8a8", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#7a5a00", fontWeight: 700 }}>
            ✎ {sessionEdits.size + sessionAdded.size} change{sessionEdits.size + sessionAdded.size === 1 ? "" : "s"} this session
          </div>
          <button onClick={undoChanges}
            style={{ background: "#fff", border: "1.5px solid #e89a3a", color: "#a86a10", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ↺ Undo changes
          </button>
        </div>
      )}

      {/* Two-line record list. No horizontal scroll — everything fits the phone width. */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8" }}>
        {/* Sticky header — mirrors the top row of each record */}
        <div style={{
          display: "grid", gridTemplateColumns: TOP_COLS,
          background: "#162212", color: "#c8e6b8",
          position: "sticky", top: 0, zIndex: 6,
        }}>
          {["Loc", "Row", "Item", "Qty"].map(label => (
            <div key={label} style={{
              padding: "8px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6,
              borderRight: "1px solid #2a3e22",
            }}>
              {label}
            </div>
          ))}
        </div>

        {visibleLots.length === 0 && (
          <div style={{ padding: "28px 14px", textAlign: "center", color: "#7a8c74" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>No rows yet.</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Tap "+ Add" to start.</div>
          </div>
        )}

        {visibleLots.map((lot, idx) => {
          const altBg = idx % 2 === 0 ? "#fff" : "#fafbf7";
          const dup = isDup(lot);
          return (
            <div key={lot.id} style={{
              background: altBg, borderTop: "1px solid #e0ead8",
              ...(dup ? { boxShadow: "inset 4px 0 0 #e89a3a" } : {}),
            }}>
              {dup && (
                <div style={{ background: "#fff3c4", color: "#7a5a00", padding: "2px 10px", fontSize: 10, fontWeight: 800, letterSpacing: 0.3 }}>
                  ⚠ DUPLICATE — same location · row · variety as another row
                </div>
              )}
              {/* Top row — Loc · Row · Item · Qty (+ Empty in Sweep mode) */}
              <div style={{ display: "grid", gridTemplateColumns: TOP_COLS, alignItems: "stretch" }}>
                <Cell>
                  <button onClick={() => openLocationPicker(lot)} style={pickerCellBtn(lot.location)}>
                    {lot.location || <span style={{ color: "#bbc8b6" }}>—</span>}
                  </button>
                </Cell>
                <Cell>
                  <button
                    onClick={() => lot.location ? openRowPicker(lot) : openLocationPicker(lot)}
                    title={lot.location ? "Pick row(s)" : "Pick a location first"}
                    style={pickerCellBtn(lot.rowId)}>
                    {lot.rowId || <span style={{ color: "#bbc8b6" }}>—</span>}
                  </button>
                </Cell>
                <Cell>
                  <button onClick={() => openPicker(lot)} style={pickerCellBtn(lot.variety)}>
                    {lot.variety
                      ? <span><span style={{ fontWeight: 800, color: "#4a7a35" }}>{lot.potSize || "—"}</span> · {lot.variety}</span>
                      : <span style={{ color: "#bbc8b6" }}>—</span>}
                  </button>
                </Cell>
                <Cell>
                  <QtyCell lot={lot} walkMode={walkMode} patch={patch} markEmpty={markEmpty} />
                </Cell>
              </div>
              {/* Bottom row — status pill + notes + actions */}
              <div style={{ display: "flex", alignItems: "stretch", borderTop: "1px dashed #e8ede4", background: altBg }}>
                <div style={{ flex: 1, padding: "4px 6px", borderRight: "1px dashed #e8ede4", display: "flex", flexDirection: "column", gap: 4 }}>
                  <StatusPill lot={lot} />
                  <AutoTextarea value={lot.notes || ""}
                    onChange={v => patch(lot, { notes: v })}
                    placeholder="📝 notes — small, wilted, etc." />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", flexShrink: 0 }}>
                  <button onClick={() => duplicate(lot)} title="Duplicate (next row)" style={actionBtn("#7fb069", "#1e2d1a")}>⎘</button>
                  <button onClick={() => { setPhotoLot(lot); setPhotoScope("row"); }} title="Photos"
                    style={actionBtn("#fff", "#4a90d9", "#4a90d9")}>
                    📷{(lot.photos || []).length > 0 ? <sup style={{ fontSize: 9, marginLeft: 1 }}>{(lot.photos || []).length}</sup> : ""}
                  </button>
                  <button onClick={() => { if (window.confirm(`Delete "${lot.variety || "this row"}"?`)) remove(lot.id); }}
                    title="Delete" style={actionBtn("transparent", "#d94f3d", "#d94f3d")}>🗑</button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Pinned "+ Add row" footer */}
        <button onClick={() => addLot({ location: filterLocation })}
          style={{
            width: "100%", padding: "12px", textAlign: "left",
            background: "#f2f5ef", border: "none", borderTop: "1.5px dashed #c8d8c0",
            fontSize: 13, fontWeight: 800, color: "#4a7a35", cursor: "pointer", fontFamily: "inherit",
          }}>
          + Add row
        </button>
      </div>

      <div style={{ padding: "8px 14px 80px", fontSize: 10, color: "#7a8c74", lineHeight: 1.4 }}>
        <div><strong>Census</strong> mode — tap ✓ to confirm planned qty, ✏ to type a different number, or ✕0 to mark empty. Already-confirmed rows show a regular input.</div>
        <div style={{ marginTop: 4 }}><strong>Sweep</strong> mode — single red button per row, tap to mark Empty. Use for follow-up walks.</div>
        <div style={{ marginTop: 4 }}>Amber stripe = duplicate (same loc · row · variety on another row). ⬇ XLSX in the header exports what you're looking at.</div>
      </div>

      {/* Sticky bottom action bar — Save & done with location-check confirm */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        background: "#1e2d1a", color: "#c8e6b8", padding: "10px 14px",
        display: "flex", gap: 8, alignItems: "center", borderTop: "2px solid #4a6a3a",
        zIndex: 50,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#c8e6b8", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          📍 {filterLocation || "All locations"}
        </div>
        <button onClick={saveAndDone}
          style={{ background: "#7fb069", color: "#1e2d1a", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          ✓ Save &amp; Done
        </button>
      </div>

      {/* Photo viewer modal */}
      {photoLot && (
        <PhotoViewer
          lot={photoLot}
          scope={photoScope}
          setScope={setPhotoScope}
          photos={photosFor(photoLot, photoScope)}
          onUpload={file => uploadPhotoForLot(photoLot, file)}
          onRemove={(p) => removePhotoFromLot(p._lot || photoLot, p.path)}
          onClose={() => setPhotoLot(null)}
        />
      )}

      {/* Location picker — site chip grid, then locations within a site */}
      {locPickerLot && (
        <div onClick={closeLocationPicker}
          style={{ position: "fixed", inset: 0, background: "rgba(20,30,18,0.55)", zIndex: 100, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              {locPickerSite ? (
                <button onClick={() => setLocPickerSite(null)}
                  style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  ← Site
                </button>
              ) : <div style={{ width: 60 }} />}
              <div style={{ fontSize: 14, fontWeight: 800, flex: 1, textAlign: "center" }}>
                {locPickerSite ? `${locPickerSite} · pick location` : "Pick site"}
              </div>
              <button onClick={closeLocationPicker}
                style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
            {!locPickerSite ? (
              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, overflowY: "auto" }}>
                {allSites.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#7a8c74", padding: 20, fontSize: 13 }}>No locations found.</div>
                )}
                {allSites.map(site => {
                  const count = (locationsBySite.get(site) || new Set()).size;
                  return (
                    <button key={site} onClick={() => setLocPickerSite(site)}
                      style={{
                        padding: "18px 12px", borderRadius: 12, border: "1.5px solid #c8d8c0",
                        background: "#f7faf3", cursor: "pointer", fontFamily: "inherit",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: "#1e2d1a", textAlign: "center" }}>{site}</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>{count} location{count === 1 ? "" : "s"}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto" }}>
                {[...(locationsBySite.get(locPickerSite) || new Set())]
                  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                  .map((loc, i) => (
                    <button key={loc} onClick={() => applyLocationToLot(loc)}
                      style={{
                        width: "100%", textAlign: "left", background: i % 2 === 0 ? "#fff" : "#fafbf7",
                        border: "none", borderBottom: "1px solid #f0f4ec",
                        padding: "13px 16px", cursor: "pointer", fontFamily: "inherit",
                        fontSize: 14, fontWeight: 700, color: "#1e2d1a",
                      }}>
                      📍 {loc}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row picker — multi-select rows for the lot's location. First pick
          patches this lot's row; remaining picks become new lots in the grid. */}
      {rowPickerLot && (() => {
        const rowsAtLoc = [...(rowsForLocation.get(rowPickerLot.location) || new Set())]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const allSelected = rowsAtLoc.length > 0 && rowsAtLoc.every(r => rowPickerSelection.has(r));
        return (
          <div onClick={closeRowPicker}
            style={{ position: "fixed", inset: 0, background: "rgba(20,30,18,0.55)", zIndex: 100, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <button onClick={closeRowPicker}
                  style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <div style={{ fontSize: 13, fontWeight: 800, flex: 1, textAlign: "center", padding: "0 6px" }}>
                  Rows · {rowPickerLot.location}
                </div>
                <button onClick={confirmRowSelection} disabled={rowPickerSelection.size === 0}
                  style={{ background: rowPickerSelection.size > 0 ? "#7fb069" : "#3a5a35", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: rowPickerSelection.size > 0 ? "pointer" : "default", fontFamily: "inherit", opacity: rowPickerSelection.size > 0 ? 1 : 0.55 }}>
                  Add {rowPickerSelection.size || ""}
                </button>
              </div>
              <div style={{ padding: "10px 14px", borderBottom: "1.5px solid #e0ead8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setRowPickerSelection(allSelected ? new Set() : new Set(rowsAtLoc))}
                  style={{ background: "#f2f5ef", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 800, color: "#1e2d1a", cursor: "pointer", fontFamily: "inherit" }}>
                  {allSelected ? "Clear" : `Select all (${rowsAtLoc.length})`}
                </button>
                <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>
                  {rowPickerSelection.size} of {rowsAtLoc.length} selected
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {rowsAtLoc.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#7a8c74", fontSize: 13 }}>
                    No rows for this location in the Fall Program plan.
                  </div>
                ) : (
                  rowsAtLoc.map((r, i) => {
                    const checked = rowPickerSelection.has(r);
                    return (
                      <button key={r} onClick={() => toggleRowSelection(r)}
                        style={{
                          width: "100%", textAlign: "left", background: i % 2 === 0 ? "#fff" : "#fafbf7",
                          border: "none", borderBottom: "1px solid #f0f4ec",
                          padding: "12px 16px", cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          background: checked ? "#7fb069" : "#fff",
                          border: `2px solid ${checked ? "#7fb069" : "#c8d8c0"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#1e2d1a", fontSize: 14, fontWeight: 900, lineHeight: 1,
                        }}>{checked ? "✓" : ""}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a" }}>{r}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Two-step Fall Program item picker */}
      {pickerLot && (
        <div onClick={closePicker}
          style={{ position: "fixed", inset: 0, background: "rgba(20,30,18,0.55)", zIndex: 100, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              {pickerSize ? (
                <button onClick={() => { setPickerSize(null); setPickerQuery(""); }}
                  style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  ← Size
                </button>
              ) : <div style={{ width: 60 }} />}
              <div style={{ fontSize: 14, fontWeight: 800, flex: 1, textAlign: "center" }}>
                {pickerSize ? `${pickerSize} · pick variety` : "Step 1 — pick size"}
              </div>
              <button onClick={closePicker}
                style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>

            {!pickerSize ? (
              /* STEP 1 — grid of size chips */
              <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, overflowY: "auto" }}>
                {pickerSizes.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#7a8c74", padding: 20, fontSize: 13 }}>
                    No Fall Program items found.
                  </div>
                )}
                {pickerSizes.map(({ size, count }) => (
                  <button key={size} onClick={() => { setPickerSize(size); setPickerQuery(""); }}
                    style={{
                      padding: "18px 12px", borderRadius: 12, border: "1.5px solid #c8d8c0",
                      background: "#f7faf3", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                    }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#1e2d1a" }}>{size}</div>
                    <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>{count} variet{count === 1 ? "y" : "ies"}</div>
                  </button>
                ))}
              </div>
            ) : (
              /* STEP 2 — search + scrollable variety list within the chosen size */
              <>
                <div style={{ padding: 12, borderBottom: "1.5px solid #e0ead8" }}>
                  <input
                    autoFocus
                    value={pickerQuery}
                    onChange={e => setPickerQuery(e.target.value)}
                    placeholder={`Search variety / color in ${pickerSize}…`}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {pickerResults.length === 0 ? (
                    <div style={{ padding: 30, textAlign: "center", color: "#7a8c74", fontSize: 13 }}>
                      No matches.
                    </div>
                  ) : (
                    pickerResults.map((p, i) => (
                      <button key={`${p.id}-${i}`} onClick={() => applyPlanItemToLot(p)}
                        style={{
                          width: "100%", textAlign: "left", background: i % 2 === 0 ? "#fff" : "#fafbf7",
                          border: "none", borderBottom: "1px solid #f0f4ec",
                          padding: "11px 14px", cursor: "pointer", fontFamily: "inherit",
                        }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", lineHeight: 1.25 }}>{p.variety}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                          📍 {p.location || "—"} · {p.rowId || "—"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Qty cell — Census mode shows confirm/change/empty buttons until the user
// commits a value; once committed, edits an input directly. Sweep mode is a
// single big "Empty" button as before. ─────────────────────────────────────
function QtyCell({ lot, walkMode, patch, markEmpty }) {
  if (walkMode === "sweep") {
    return (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", padding: "2px 0" }}>
        <button onClick={() => markEmpty(lot)}
          style={{
            background: (lot.quantity || 0) === 0 ? "#fdecea" : "#d94f3d",
            color: (lot.quantity || 0) === 0 ? "#7a2418" : "#fff",
            border: "none", borderRadius: 8, padding: "10px 6px",
            fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", width: "100%",
          }}>
          {(lot.quantity || 0) === 0 ? "✓ Empty" : "Tap = Empty"}
        </button>
        {Number.isFinite(lot.plannedQty) && <PlanVariance lot={lot} />}
      </div>
    );
  }
  // Census mode
  const uncounted = !lot.lastCountedAt && lot.quantity == null;
  // While unconfirmed AND plan exists, show 3 quick buttons. Once the user
  // commits a value (or there's no plan), drop to a normal numeric input.
  if (uncounted && Number.isFinite(lot.plannedQty)) {
    return (
      <div style={{ width: "100%", display: "flex", flexDirection: "column", padding: "2px 0", gap: 2 }}>
        <button onClick={() => patch(lot, { quantity: lot.plannedQty })}
          style={{ background: "#4a7a35", color: "#fff", border: "none", borderRadius: 6, padding: "6px 4px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
          ✓ {lot.plannedQty}
        </button>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => {
              const raw = window.prompt(`Count for ${lot.variety}?`, lot.plannedQty);
              if (raw == null) return;
              const n = parseInt(raw, 10);
              if (Number.isFinite(n)) patch(lot, { quantity: n });
            }}
            style={{ flex: 1, background: "#fff", color: "#1e2d1a", border: "1.5px solid #c8d8c0", borderRadius: 6, padding: "4px 2px", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✏
          </button>
          <button onClick={() => patch(lot, { quantity: 0 })}
            style={{ flex: 1, background: "#fff", color: "#d94f3d", border: "1.5px solid #d94f3d", borderRadius: 6, padding: "4px 2px", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✕0
          </button>
        </div>
        <PlanVariance lot={lot} />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", padding: "2px 0" }}>
      <input type="number" inputMode="numeric" value={lot.quantity ?? ""}
        onChange={e => patch(lot, { quantity: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 })}
        placeholder="—"
        style={{ ...cellInputBase, fontWeight: 800, textAlign: "right", fontSize: 15, padding: "4px 6px" }} />
      {Number.isFinite(lot.plannedQty) && <PlanVariance lot={lot} />}
    </div>
  );
}

function PlanVariance({ lot }) {
  if (!Number.isFinite(lot.plannedQty)) return null;
  const delta = (lot.quantity || 0) - lot.plannedQty;
  const isShort = delta < 0 && lot.quantity != null;
  const isExtra = delta > 0;
  return (
    <div style={{ fontSize: 9, color: "#7a8c74", textAlign: "right", padding: "1px 6px 2px", lineHeight: 1.2 }}>
      <div>plan {lot.plannedQty}</div>
      {lot.quantity != null && (isShort || isExtra) && (
        <div style={{ color: isShort ? "#d94f3d" : "#4a7a35", fontWeight: 800 }}>
          {isShort ? "" : "+"}{delta}
        </div>
      )}
    </div>
  );
}

// ── Status pill on each record ───────────────────────────────────────────────
// "Uncounted" → grey, "Counted today" → green, "X days ago" → amber → red
// when stale > 7 days.
function StatusPill({ lot }) {
  const ts = lot.lastCountedAt ? new Date(lot.lastCountedAt) : null;
  if (!ts) {
    return (
      <span style={{ alignSelf: "flex-start", background: "#e8eee5", color: "#7a8c74", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 0.3 }}>
        ◯ Uncounted
      </span>
    );
  }
  const diffMs = Date.now() - ts.getTime();
  const days = Math.floor(diffMs / 86400000);
  let label, bg, color;
  if (days === 0)       { label = "Counted today";   bg = "#dff2d2"; color = "#2e5e1a"; }
  else if (days === 1)  { label = "1 day ago";       bg = "#fff3c4"; color = "#7a5a00"; }
  else if (days <= 7)   { label = `${days} days ago`; bg = "#fff3c4"; color = "#7a5a00"; }
  else                  { label = `${days}d ago · stale`; bg = "#fdecea"; color = "#7a2418"; }
  const history = (lot.countHistory || []).length;
  return (
    <span style={{ alignSelf: "flex-start", background: bg, color, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 0.3 }}>
      ✓ {label}{history > 1 ? ` · ${history} counts` : ""}
    </span>
  );
}

// ── Wrapping textarea that grows with its content ───────────────────────────
// Replaces <input> in the grid so long variety names / locations stay
// readable instead of getting cut off.
function AutoTextarea({ value, onChange, placeholder, list }) {
  return (
    <textarea
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      list={list}
      onInput={e => {
        // Grow with content — simple manual auto-resize
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      style={{
        width: "100%", minHeight: 28,
        padding: "6px 6px",
        border: "1px solid transparent", background: "transparent",
        fontSize: 12, fontFamily: "inherit", color: "#1e2d1a",
        resize: "none", outline: "none", boxSizing: "border-box",
        overflow: "hidden", lineHeight: 1.3, wordBreak: "break-word",
      }}
    />
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const cellInputBase = {
  width: "100%", padding: "6px 6px", border: "1px solid transparent",
  background: "transparent", fontSize: 12, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box", color: "#1e2d1a",
};
const cellSelect = { ...cellInputBase, appearance: "none" };

const Cell = ({ children }) => (
  <div style={{ padding: 0, borderRight: "1px solid #e8ede4", display: "flex", alignItems: "stretch", minWidth: 0 }}>
    {children}
  </div>
);

const actionBtn = (bg, color, border = null) => ({
  background: bg, color, border: border ? `1.5px solid ${border}` : "none",
  borderRadius: 6, padding: "6px 7px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  flexShrink: 0,
});

const btnPrimary = {
  background: "#7fb069", color: "#1e2d1a", border: "none", borderRadius: 8,
  padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const btnSecondary = {
  background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 8,
  padding: "7px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const miniBtn = (bg, color, border = null) => ({
  background: bg, color, border: border ? `1.5px solid ${border}` : "none",
  borderRadius: 6, padding: "6px 6px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  flex: 1, minWidth: 0,
});

// Shared style for cells that act as picker triggers (Location, Row, Item)
const pickerCellBtn = (hasValue) => ({
  width: "100%", textAlign: "left", background: "transparent",
  border: "none", padding: "8px 8px", cursor: "pointer", fontFamily: "inherit",
  color: hasValue ? "#1e2d1a" : "#bbc8b6",
  fontSize: 12, lineHeight: 1.25, wordBreak: "break-word", overflowWrap: "anywhere",
  minHeight: 36, display: "flex", alignItems: "flex-start",
});

// ── Photo viewer / uploader modal ────────────────────────────────────────────
// Shows photos at a single row OR across the whole pad (location). Lets the
// user take new photos with the device camera. Each thumb shows the date so
// you can scrub the season's development.
function PhotoViewer({ lot, scope, setScope, photos, onUpload, onRemove, onClose }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  async function handlePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { await onUpload(file); }
    catch (err) { alert("Upload failed: " + (err?.message || err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,30,18,0.6)", zIndex: 110, display: "flex", alignItems: "stretch", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#f2f5ef", width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose}
            style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back
          </button>
          <div style={{ fontSize: 14, fontWeight: 800, textAlign: "center", flex: 1, padding: "0 8px" }}>
            📷 {lot.location || "—"}{scope === "row" && lot.rowId ? ` · ${lot.rowId}` : ""}
          </div>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ background: "#7fb069", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: uploading ? "default" : "pointer", fontFamily: "inherit" }}>
            {uploading ? "…" : "+ Photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePick} style={{ display: "none" }} />
        </div>

        {/* Scope toggle */}
        <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", padding: "8px 12px", display: "flex", gap: 6 }}>
          {[
            { id: "row", label: "This row" },
            { id: "pad", label: `Whole ${(lot.location || "").includes("Pad") ? "pad" : "location"}` },
          ].map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              style={{
                flex: 1, padding: "8px 10px", borderRadius: 8,
                background: scope === s.id ? "#1e2d1a" : "#f2f5ef",
                color: scope === s.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${scope === s.id ? "#1e2d1a" : "#c8d8c0"}`,
                fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
              }}>{s.label}</button>
          ))}
        </div>

        {/* Photo grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {photos.length === 0 ? (
            <div style={{ textAlign: "center", padding: 30, color: "#7a8c74" }}>
              <div style={{ fontSize: 30, marginBottom: 6 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No photos yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Tap "+ Photo" to take one with the camera.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {photos.map((p, i) => (
                <InventoryPhotoThumb key={`${p.path}-${i}`} photo={p} onOpen={() => setLightbox(p)} onRemove={() => onRemove(p)} />
              ))}
            </div>
          )}
        </div>

        {/* Lightbox */}
        {lightbox && (
          <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />
        )}
      </div>
    </div>
  );
}

function InventoryPhotoThumb({ photo, onOpen, onRemove }) {
  const [url, setUrl] = useState(null);
  React.useEffect(() => {
    const sb = getSupabase();
    sb.storage.from("inventory-photos").createSignedUrl(photo.path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [photo.path]);
  const date = photo.takenAt ? new Date(photo.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 10, overflow: "hidden", position: "relative" }}>
      <button onClick={onOpen} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "block", width: "100%" }}>
        {url
          ? <img src={url} alt={photo.path} style={{ width: "100%", height: 140, objectFit: "cover" }} />
          : <div style={{ width: "100%", height: 140, background: "#e0ead8" }} />}
      </button>
      <div style={{ padding: "6px 8px", fontSize: 11, color: "#1e2d1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>{date}</span>
        <button onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this photo?")) onRemove(); }}
          style={{ background: "transparent", border: "none", color: "#d94f3d", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
      </div>
      {photo._lot?.rowId && (
        <div style={{ padding: "0 8px 6px", fontSize: 10, color: "#7a8c74" }}>{photo._lot.rowId}{photo._lot.variety ? ` · ${photo._lot.variety}` : ""}</div>
      )}
    </div>
  );
}

function PhotoLightbox({ photo, onClose }) {
  const [url, setUrl] = useState(null);
  React.useEffect(() => {
    const sb = getSupabase();
    sb.storage.from("inventory-photos").createSignedUrl(photo.path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [photo.path]);
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      {url
        ? <img src={url} alt={photo.path} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        : <div style={{ color: "#fff" }}>Loading…</div>}
    </div>
  );
}
