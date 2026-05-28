// Live inventory of pots on the pads. Spreadsheet-style grid optimized for
// phones: tap a Fall Program item from the search to auto-create a row
// pre-filled with location/row/size/type/variety — count is the only thing
// the user types.
import React, { useMemo, useRef, useState } from "react";
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
  // location + incremented row from the last edited lot.
  async function addLot(seed = {}) {
    const fallbackLocation = filterLocation || lastLot?.location || "";
    const fallbackRowId    = lastLot?.location === fallbackLocation ? nextRowId(lastLot?.rowId) : "";
    await insert({
      location: seed.location ?? fallbackLocation,
      rowId:    seed.rowId    ?? fallbackRowId,
      potSize:  seed.potSize  || "",
      plantType: seed.plantType || "",
      variety:  seed.variety || "",
      quantity: seed.quantity ?? 0,
      notes: "",
      countedAt: new Date().toISOString(),
      countedBy: displayName || "Manager",
    });
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
  // For a given location, look at fall_program_items and create an inventory
  // lot for every planned (location · row · variety) that doesn't already
  // exist. Pre-fills size, plant type, variety, planned_qty. Existing lots
  // are untouched — re-running this is idempotent and safe mid-season.
  async function walkFromPlan(location) {
    if (!location) return;
    const planned = (planItems || []).filter(p =>
      (p.location || "").trim().toLowerCase() === location.trim().toLowerCase() &&
      p.variety && p.rowId
    );
    if (planned.length === 0) {
      alert(`No Fall Program plan rows for "${location}".`);
      return;
    }
    // Aggregate planned qty by (rowId · variety) since multi-bench varieties
    // can have multiple rows in the plan
    const byKey = new Map();
    for (const p of planned) {
      const k = `${p.rowId}||${p.variety}`;
      const prev = byKey.get(k) || { ...p, qty: 0 };
      prev.qty += (p.qty || 0) * (p.ppp || 1);
      byKey.set(k, prev);
    }
    // Skip rows that already exist as inventory lots for this location
    const existing = new Set(
      (lots || [])
        .filter(l => (l.location || "").toLowerCase() === location.toLowerCase())
        .map(l => `${l.rowId || ""}||${l.variety || ""}`)
    );
    const toCreate = [...byKey.values()].filter(p => !existing.has(`${p.rowId}||${p.variety}`));
    if (toCreate.length === 0) {
      alert(`Already walked — all ${byKey.size} planned rows at "${location}" are in the grid.`);
      return;
    }
    if (!window.confirm(`Add ${toCreate.length} planned row${toCreate.length === 1 ? "" : "s"} for "${location}"?\n\nExisting rows won't be touched.`)) return;
    for (const p of toCreate) {
      await insert({
        location: p.location,
        rowId: p.rowId,
        potSize: sizeFromCategory(p.category),
        plantType: typeFromCategory(p.category, p.variety),
        variety: p.variety,
        quantity: 0,
        plannedQty: p.qty,
        notes: "",
        countedAt: new Date().toISOString(),
        countedBy: displayName || "Manager",
      });
    }
    // Auto-filter so the user immediately sees what they just walked
    setFilterLocation(location);
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

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 70 }}>
      {/* Header */}
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📊 Inventory</div>
        <div style={{ width: 50 }} />
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
        <button onClick={() => addLot({ location: filterLocation })} style={btnPrimary}>+ Add</button>
        <span style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, whiteSpace: "nowrap" }}>
          {visibleLots.length} · {visibleLots.reduce((s, l) => s + (l.quantity || 0), 0).toLocaleString()}
        </span>
      </div>

      {/* Walk-from-Plan bar — appears when filtered to a real location.
          Pulls every planned (row · variety) from fall_program_items and
          inserts a pre-filled lot for each. Idempotent: rerun any time. */}
      {filterLocation && allLocations.some(l => l.toLowerCase() === filterLocation.toLowerCase()) && (
        <div style={{ padding: "8px 12px", background: "#eef7e8", borderBottom: "1.5px solid #b8d8b0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, color: "#1e2d1a", fontWeight: 700, lineHeight: 1.35 }}>
            <span style={{ color: "#4a7a35", fontWeight: 900 }}>🚶 Walk this location?</span> Pre-fills every planned row + variety for <strong>{filterLocation}</strong>. Existing rows stay put.
          </div>
          <button onClick={() => walkFromPlan(filterLocation)}
            style={{ background: "#4a7a35", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Walk
          </button>
        </div>
      )}

      {/* Bulk delete bar — only renders when there's something to delete.
          Confirms with the count + 'shown' if a filter is active so the
          user knows exactly what's being cleared. */}
      {visibleLots.length > 0 && (
        <div style={{ padding: "6px 12px", background: "#fff8f7", borderBottom: "1.5px solid #f3d3cf", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <button onClick={() => deleteAllShown()}
            style={{ background: "#fff", border: "1.5px solid #d94f3d", color: "#d94f3d", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            🗑 Delete {filterLocation ? "shown" : "all"} ({visibleLots.length})
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
          return (
            <div key={lot.id} style={{ background: altBg, borderTop: "1px solid #e0ead8" }}>
              {/* Top row — Loc · Row · Item · Qty */}
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
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", padding: "2px 0" }}>
                    <input type="number" inputMode="numeric" value={lot.quantity ?? 0}
                      onChange={e => patch(lot, { quantity: parseInt(e.target.value, 10) || 0 })}
                      style={{ ...cellInputBase, fontWeight: 800, textAlign: "right", fontSize: 15, padding: "4px 6px" }} />
                    {/* Plan / variance — only shown when a plan exists on this lot */}
                    {Number.isFinite(lot.plannedQty) && (() => {
                      const delta = (lot.quantity || 0) - lot.plannedQty;
                      const isShort = delta < 0;
                      const isExtra = delta > 0;
                      return (
                        <div style={{ fontSize: 9, color: "#7a8c74", textAlign: "right", padding: "1px 6px 2px", lineHeight: 1.2 }}>
                          <div>plan {lot.plannedQty}</div>
                          {(isShort || isExtra) && (
                            <div style={{ color: isShort ? "#d94f3d" : "#4a7a35", fontWeight: 800 }}>
                              {isShort ? "" : "+"}{delta}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
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

      <div style={{ padding: "8px 14px", fontSize: 10, color: "#7a8c74", lineHeight: 1.4 }}>
        Fastest walk: filter to a location → tap <strong>Walk</strong> → every planned row + variety pre-fills with the planned qty. Just type the actual count for each. Variance (+/-) shows automatically. Manual rows (no plan) work too — just <strong>+ Add</strong>.
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
