// Live inventory of pots on the pads. Replacement for the existing Google Sheet.
// Grain: one row per pad-row of a variety. Mobile-friendly card grid with
// datalist autocompletes pulled from existing app data so users barely type.
import React, { useMemo, useState } from "react";
import { useAuth } from "./Auth";
import {
  useInventoryLots,
  useFallProgramItems,
  useHouses,
  usePads,
  useVarieties,
} from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

const POT_SIZES = ["4.5\"", "6\"", "8\"", "9\"", "10\"", "12\"", "14\"", "HB", "Tray", "Liner"];

export default function InventoryView({ onBack }) {
  const { displayName } = useAuth();
  const { rows: lots, insert, update, remove } = useInventoryLots();
  const { rows: planItems } = useFallProgramItems();
  const { rows: houses } = useHouses();
  const { rows: pads } = usePads();
  const { rows: varieties } = useVarieties();

  const [filterLocation, setFilterLocation] = useState("");
  const [savingId, setSavingId] = useState(null);

  // ── Autocomplete sources ───────────────────────────────────────────────────
  // Locations: union of fall_program_items.location, houses.name, pads.name.
  // Sorted, deduped.
  const allLocations = useMemo(() => {
    const set = new Set();
    (planItems || []).forEach(p => p.location && set.add(p.location.trim()));
    (houses || []).forEach(h => h.name && set.add(h.name.trim()));
    (pads || []).forEach(p => p.name && set.add(p.name.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [planItems, houses, pads]);

  // Rows-for-a-location: filtered from fall_program_items.row_id
  const rowsForLocation = useMemo(() => {
    const byLoc = new Map();
    (planItems || []).forEach(p => {
      if (!p.location || !p.rowId) return;
      if (!byLoc.has(p.location)) byLoc.set(p.location, new Set());
      byLoc.get(p.location).add(p.rowId);
    });
    return byLoc;
  }, [planItems]);

  // Plant types: distinct crop_name from variety_library, plus stable extras
  const plantTypes = useMemo(() => {
    const set = new Set(["Mum", "Aster", "Cabbage", "Kale", "Pansy"]);
    (varieties || []).forEach(v => v.cropName && set.add(v.cropName));
    return [...set].sort();
  }, [varieties]);

  // Varieties for a plant type: pulled from variety_library + fall_program_items.variety
  const varietiesForType = useMemo(() => {
    const byType = new Map();
    (varieties || []).forEach(v => {
      if (!v.cropName || !v.variety) return;
      if (!byType.has(v.cropName)) byType.set(v.cropName, new Set());
      byType.get(v.cropName).add(v.variety);
    });
    // Add Fall Program varieties under their inferred type (best-effort: parse "MUM PARADISO WHITE" → type MUM)
    (planItems || []).forEach(p => {
      if (!p.variety) return;
      const tokens = p.variety.split(/\s+/);
      const type = tokens.find(t => plantTypes.some(pt => pt.toUpperCase() === t.toUpperCase())) || null;
      if (!type) return;
      const cap = plantTypes.find(pt => pt.toUpperCase() === type.toUpperCase());
      if (!byType.has(cap)) byType.set(cap, new Set());
      byType.get(cap).add(p.variety);
    });
    return byType;
  }, [varieties, planItems, plantTypes]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const visibleLots = useMemo(() => {
    if (!filterLocation) return lots;
    return lots.filter(l => (l.location || "").toLowerCase() === filterLocation.toLowerCase());
  }, [lots, filterLocation]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addLot(seed = {}) {
    await insert({
      location: seed.location || "",
      rowId: seed.rowId || "",
      potSize: seed.potSize || "",
      plantType: seed.plantType || "",
      variety: seed.variety || "",
      quantity: 0,
      notes: "",
      countedAt: new Date().toISOString(),
      countedBy: displayName || "Manager",
    });
  }

  async function patch(lot, changes) {
    setSavingId(lot.id);
    try {
      await update(lot.id, { ...changes, countedAt: new Date().toISOString(), countedBy: displayName || lot.countedBy });
    } finally {
      setSavingId(null);
    }
  }

  function duplicate(lot) {
    // Try to bump the row_id by one: "BQ1003" → "BQ1004", "Row 3" → "Row 4"
    let nextRow = lot.rowId || "";
    const m = nextRow.match(/(\d+)(?!.*\d)/);
    if (m) {
      const n = String(parseInt(m[1], 10) + 1).padStart(m[1].length, "0");
      nextRow = nextRow.slice(0, m.index) + n + nextRow.slice(m.index + m[1].length);
    }
    addLot({
      location: lot.location,
      rowId: nextRow,
      potSize: lot.potSize,
      plantType: lot.plantType,
      variety: lot.variety,
    });
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📊 Inventory</div>
        <div style={{ width: 60 }} />
      </div>

      {/* Filter / summary */}
      <div style={{ padding: 12, background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Filter:</span>
        <input list="all-locs" value={filterLocation} onChange={e => setFilterLocation(e.target.value)} placeholder="All locations"
          style={{ flex: 1, minWidth: 0, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit" }} />
        <datalist id="all-locs">{allLocations.map(l => <option key={l} value={l} />)}</datalist>
        {filterLocation && <button onClick={() => setFilterLocation("")} style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#7a8c74", fontWeight: 700 }}>
          {visibleLots.length} lot{visibleLots.length !== 1 ? "s" : ""} · {visibleLots.reduce((s, l) => s + (l.quantity || 0), 0).toLocaleString()} pots
        </span>
      </div>

      {/* Lots — one card per inventory_lot */}
      <div style={{ padding: 12 }}>
        {visibleLots.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#7a8c74" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No inventory yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tap the + button below to add your first lot.</div>
          </div>
        )}

        {visibleLots.map(lot => {
          const rowOptions = rowsForLocation.get(lot.location) || new Set();
          const varOptions = varietiesForType.get(lot.plantType) || new Set();
          return (
            <div key={lot.id} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, padding: 12, marginBottom: 10 }}>
              <Field label="Location">
                <input list={`locs-${lot.id}`} value={lot.location || ""}
                  onChange={e => patch(lot, { location: e.target.value })}
                  placeholder="e.g. Bluff Quonset 10" style={inputStyle} />
                <datalist id={`locs-${lot.id}`}>{allLocations.map(l => <option key={l} value={l} />)}</datalist>
              </Field>
              <Field label="Row">
                <input list={`rows-${lot.id}`} value={lot.rowId || ""}
                  onChange={e => patch(lot, { rowId: e.target.value })}
                  placeholder="e.g. BQ1003" style={inputStyle} />
                <datalist id={`rows-${lot.id}`}>{[...rowOptions].sort().map(r => <option key={r} value={r} />)}</datalist>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Field label="Size">
                  <select value={lot.potSize || ""} onChange={e => patch(lot, { potSize: e.target.value })} style={inputStyle}>
                    <option value="">—</option>
                    {POT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Plant Type">
                  <select value={lot.plantType || ""} onChange={e => patch(lot, { plantType: e.target.value, variety: "" })} style={inputStyle}>
                    <option value="">—</option>
                    {plantTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Variety">
                <input list={`vars-${lot.id}`} value={lot.variety || ""}
                  onChange={e => patch(lot, { variety: e.target.value })}
                  placeholder={lot.plantType ? `Type / pick a ${lot.plantType}` : "Pick plant type first"} style={inputStyle} />
                <datalist id={`vars-${lot.id}`}>{[...varOptions].sort().map(v => <option key={v} value={v} />)}</datalist>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                <Field label="Quantity">
                  <input type="number" value={lot.quantity ?? 0}
                    onChange={e => patch(lot, { quantity: parseInt(e.target.value, 10) || 0 })}
                    style={{ ...inputStyle, fontSize: 18, fontWeight: 800, textAlign: "center" }} />
                </Field>
                <Field label="Notes">
                  <input value={lot.notes || ""}
                    onChange={e => patch(lot, { notes: e.target.value })}
                    placeholder="optional — showed up small, shrunk, etc." style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => duplicate(lot)}
                  style={{ flex: 1, background: "#7fb069", color: "#1e2d1a", border: "none", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  ➕ Duplicate (next row)
                </button>
                <button onClick={() => { if (window.confirm("Delete this lot?")) remove(lot.id); }}
                  style={{ background: "transparent", border: "1.5px solid #d94f3d", color: "#d94f3d", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  🗑
                </button>
              </div>
              {savingId === lot.id && <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 4, textAlign: "right" }}>saving…</div>}
            </div>
          );
        })}
      </div>

      {/* Floating add button */}
      <button onClick={() => addLot()}
        style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          width: 70, height: 70, borderRadius: "50%", background: "#7fb069",
          border: "4px solid #fff", color: "#fff", fontSize: 32, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(26,42,26,0.3)",
        }}>+</button>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0",
  fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.8 }}>{label}</div>
      {children}
    </div>
  );
}
