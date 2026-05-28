// Live inventory of pots on the pads. Spreadsheet-style grid (like Google
// Sheets / Excel): one row per pad-row of a variety, sticky header, cells
// editable in place, + Add row / Duplicate beneath each lot.
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

const POT_SIZES = ["", "4.5\"", "6\"", "8\"", "9\"", "10\"", "12\"", "14\"", "HB", "Tray", "Liner"];

// Column widths — sum drives horizontal scroll. Designed for an 8" tablet
// but works on phones with horizontal scroll.
const COLS = [
  { key: "location",   label: "Location",   width: 180 },
  { key: "rowId",      label: "Row",        width: 110 },
  { key: "potSize",    label: "Size",       width: 80  },
  { key: "plantType",  label: "Type",       width: 120 },
  { key: "variety",    label: "Variety",    width: 200 },
  { key: "quantity",   label: "Qty",        width: 90  },
  { key: "notes",      label: "Notes",      width: 200 },
  { key: "actions",    label: "",           width: 96  },
];

export default function InventoryView({ onBack }) {
  const { displayName } = useAuth();
  const { rows: lots, insert, update, remove } = useInventoryLots();
  const { rows: planItems } = useFallProgramItems();
  const { rows: houses } = useHouses();
  const { rows: pads } = usePads();
  const { rows: varieties } = useVarieties();

  const [filterLocation, setFilterLocation] = useState("");

  // ── Autocomplete sources ───────────────────────────────────────────────────
  const allLocations = useMemo(() => {
    const set = new Set();
    (planItems || []).forEach(p => p.location && set.add(p.location.trim()));
    (houses || []).forEach(h => h.name && set.add(h.name.trim()));
    (pads || []).forEach(p => p.name && set.add(p.name.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [planItems, houses, pads]);

  const rowsForLocation = useMemo(() => {
    const byLoc = new Map();
    (planItems || []).forEach(p => {
      if (!p.location || !p.rowId) return;
      if (!byLoc.has(p.location)) byLoc.set(p.location, new Set());
      byLoc.get(p.location).add(p.rowId);
    });
    return byLoc;
  }, [planItems]);

  const plantTypes = useMemo(() => {
    const set = new Set(["Mum", "Aster", "Cabbage", "Kale", "Pansy"]);
    (varieties || []).forEach(v => v.cropName && set.add(v.cropName));
    return [...set].sort();
  }, [varieties]);

  const varietiesForType = useMemo(() => {
    const byType = new Map();
    (varieties || []).forEach(v => {
      if (!v.cropName || !v.variety) return;
      if (!byType.has(v.cropName)) byType.set(v.cropName, new Set());
      byType.get(v.cropName).add(v.variety);
    });
    (planItems || []).forEach(p => {
      if (!p.variety) return;
      const tokens = p.variety.split(/\s+/);
      const matched = plantTypes.find(pt => tokens.some(t => t.toUpperCase() === pt.toUpperCase()));
      if (!matched) return;
      if (!byType.has(matched)) byType.set(matched, new Set());
      byType.get(matched).add(p.variety);
    });
    return byType;
  }, [varieties, planItems, plantTypes]);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const visibleLots = useMemo(() => {
    const filtered = filterLocation
      ? (lots || []).filter(l => (l.location || "").toLowerCase().includes(filterLocation.toLowerCase()))
      : (lots || []);
    // Sort: Location alpha, then row natural, so the sheet stays scannable
    return [...filtered].sort((a, b) =>
      (a.location || "").localeCompare(b.location || "", undefined, { numeric: true }) ||
      (a.rowId || "").localeCompare(b.rowId || "", undefined, { numeric: true })
    );
  }, [lots, filterLocation]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addLot(seed = {}, afterId = null) {
    // afterId not used for ordering (sort is location-based) but kept for future
    void afterId;
    await insert({
      location: seed.location || filterLocation || "",
      rowId: seed.rowId || "",
      potSize: seed.potSize || "",
      plantType: seed.plantType || "",
      variety: seed.variety || "",
      quantity: seed.quantity ?? 0,
      notes: "",
      countedAt: new Date().toISOString(),
      countedBy: displayName || "Manager",
    });
  }

  async function patch(lot, changes) {
    await update(lot.id, {
      ...changes,
      countedAt: new Date().toISOString(),
      countedBy: displayName || lot.countedBy,
    });
  }

  function duplicate(lot) {
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

  const totalWidth = COLS.reduce((s, c) => s + c.width, 0);

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

      {/* Toolbar */}
      <div style={{ padding: "10px 14px", background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input
          list="all-locs"
          value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          placeholder="🔍 Filter by location…"
          style={{ flex: "1 1 200px", minWidth: 0, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit" }}
        />
        <datalist id="all-locs">{allLocations.map(l => <option key={l} value={l} />)}</datalist>
        {filterLocation && (
          <button onClick={() => setFilterLocation("")} style={btnSecondary}>
            ✕ Clear
          </button>
        )}
        <span style={{ fontSize: 12, color: "#7a8c74", fontWeight: 700, marginLeft: "auto" }}>
          {visibleLots.length} lot{visibleLots.length !== 1 ? "s" : ""} · {visibleLots.reduce((s, l) => s + (l.quantity || 0), 0).toLocaleString()} pots
        </span>
        <button onClick={() => addLot({ location: filterLocation })} style={btnPrimary}>
          + Add row
        </button>
      </div>

      {/* Spreadsheet grid — horizontally scrolls on narrow screens */}
      <div style={{ overflowX: "auto", background: "#fff", borderBottom: "1.5px solid #e0ead8" }}>
        <div style={{ minWidth: totalWidth }}>
          {/* Sticky header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: COLS.map(c => `${c.width}px`).join(" "),
            background: "#162212", color: "#c8e6b8",
            position: "sticky", top: 0, zIndex: 5,
          }}>
            {COLS.map(c => (
              <div key={c.key} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8, borderRight: "1px solid #2a3e22" }}>
                {c.label}
              </div>
            ))}
          </div>

          {/* Body rows */}
          {visibleLots.length === 0 && (
            <div style={{ padding: "32px 14px", textAlign: "center", color: "#7a8c74" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No inventory rows yet.</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Tap "+ Add row" to start the count.</div>
            </div>
          )}

          {visibleLots.map((lot, idx) => {
            const rowOptions = rowsForLocation.get(lot.location) || new Set();
            const varOptions = varietiesForType.get(lot.plantType) || new Set();
            const altBg = idx % 2 === 0 ? "#fff" : "#fafbf7";
            return (
              <div key={lot.id} style={{
                display: "grid",
                gridTemplateColumns: COLS.map(c => `${c.width}px`).join(" "),
                background: altBg, borderTop: "1px solid #e0ead8",
              }}>
                {/* Location */}
                <Cell>
                  <input list={`locs-${lot.id}`} value={lot.location || ""}
                    onChange={e => patch(lot, { location: e.target.value })}
                    placeholder="Bluff Quonset 10" style={cellInput} />
                  <datalist id={`locs-${lot.id}`}>{allLocations.map(l => <option key={l} value={l} />)}</datalist>
                </Cell>
                {/* Row */}
                <Cell>
                  <input list={`rows-${lot.id}`} value={lot.rowId || ""}
                    onChange={e => patch(lot, { rowId: e.target.value })}
                    placeholder="BQ1003" style={cellInput} />
                  <datalist id={`rows-${lot.id}`}>{[...rowOptions].sort().map(r => <option key={r} value={r} />)}</datalist>
                </Cell>
                {/* Size */}
                <Cell>
                  <select value={lot.potSize || ""} onChange={e => patch(lot, { potSize: e.target.value })} style={cellInput}>
                    {POT_SIZES.map(s => <option key={s} value={s}>{s || "—"}</option>)}
                  </select>
                </Cell>
                {/* Plant Type */}
                <Cell>
                  <select value={lot.plantType || ""} onChange={e => patch(lot, { plantType: e.target.value, variety: "" })} style={cellInput}>
                    <option value="">—</option>
                    {plantTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Cell>
                {/* Variety */}
                <Cell>
                  <input list={`vars-${lot.id}`} value={lot.variety || ""}
                    onChange={e => patch(lot, { variety: e.target.value })}
                    placeholder={lot.plantType ? `Type a ${lot.plantType}` : "Pick type first"} style={cellInput} />
                  <datalist id={`vars-${lot.id}`}>{[...varOptions].sort().map(v => <option key={v} value={v} />)}</datalist>
                </Cell>
                {/* Qty */}
                <Cell>
                  <input type="number" value={lot.quantity ?? 0}
                    onChange={e => patch(lot, { quantity: parseInt(e.target.value, 10) || 0 })}
                    style={{ ...cellInput, fontWeight: 800, textAlign: "right" }} />
                </Cell>
                {/* Notes */}
                <Cell>
                  <input value={lot.notes || ""}
                    onChange={e => patch(lot, { notes: e.target.value })}
                    placeholder="showed up small, etc." style={cellInput} />
                </Cell>
                {/* Actions */}
                <div style={{ padding: 4, display: "flex", alignItems: "center", gap: 4, borderRight: "1px solid #e8ede4" }}>
                  <button onClick={() => duplicate(lot)} title="Duplicate row (next row id)"
                    style={miniBtn("#7fb069", "#1e2d1a")}>⎘</button>
                  <button onClick={() => { if (window.confirm(`Delete "${lot.variety || "this row"}"?`)) remove(lot.id); }}
                    title="Delete row" style={miniBtn("transparent", "#d94f3d", "#d94f3d")}>🗑</button>
                </div>
              </div>
            );
          })}

          {/* "+ Add row" pinned to the bottom of the sheet */}
          <button onClick={() => addLot({ location: filterLocation })}
            style={{
              width: "100%", padding: "12px 10px", textAlign: "left",
              background: "#f2f5ef", border: "none", borderTop: "1.5px dashed #c8d8c0",
              fontSize: 13, fontWeight: 800, color: "#4a7a35", cursor: "pointer", fontFamily: "inherit",
            }}>
            + Add row
          </button>
        </div>
      </div>

      <div style={{ padding: "10px 14px", fontSize: 11, color: "#7a8c74" }}>
        Tip: pick a Location from the list, then the Row dropdown auto-filters to the rows on that quonset. Tap ⎘ on any row to duplicate it with the next row number — quantity blanks out so you just type the count.
      </div>
    </div>
  );
}

const cellInput = {
  width: "100%", padding: "8px 8px", border: "1px solid transparent",
  background: "transparent", fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};

const Cell = ({ children }) => (
  <div style={{ padding: 0, borderRight: "1px solid #e8ede4", display: "flex", alignItems: "stretch" }}>{children}</div>
);

const btnPrimary = {
  background: "#7fb069", color: "#1e2d1a", border: "none", borderRadius: 8,
  padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
};
const btnSecondary = {
  background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 8,
  padding: "8px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
const miniBtn = (bg, color, border = null) => ({
  background: bg, color, border: border ? `1.5px solid ${border}` : "none",
  borderRadius: 6, padding: "6px 8px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
  flex: 1, minWidth: 0,
});
