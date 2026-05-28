// Live inventory of pots on the pads. Spreadsheet-style grid optimized for
// phones: tap a Fall Program item from the search to auto-create a row
// pre-filled with location/row/size/type/variety — count is the only thing
// the user types.
import React, { useMemo, useState } from "react";
import { useAuth } from "./Auth";
import {
  useInventoryLots,
  useFallProgramItems,
} from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

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

// Compact column widths designed for phones — total ~720px, sticky Location.
const COLS = [
  { key: "location",   label: "Loc",   width: 130, sticky: true },
  { key: "rowId",      label: "Row",   width: 90  },
  { key: "potSize",    label: "Size",  width: 64  },
  { key: "plantType",  label: "Type",  width: 80  },
  { key: "variety",    label: "Variety", width: 180 },
  { key: "quantity",   label: "Qty",   width: 76  },
  { key: "notes",      label: "Notes", width: 140 },
  { key: "actions",    label: "",      width: 80  },
];

export default function InventoryView({ onBack }) {
  const { displayName } = useAuth();
  const { rows: lots, insert, update, remove } = useInventoryLots();
  const { rows: planItems } = useFallProgramItems();

  const [filterLocation, setFilterLocation] = useState("");
  const [search, setSearch] = useState("");

  // ── Derived dictionaries from Fall Program items ───────────────────────────
  const allLocations = useMemo(() => {
    const set = new Set();
    (planItems || []).forEach(p => p.location && set.add(p.location.trim()));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [planItems]);

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

  // ── Item search — top of page. Filters Fall Program items by location +
  // variety, deduped to one row per (location · rowId · variety) so tapping
  // a result spawns a pre-filled inventory lot. ───────────────────────────────
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const seen = new Set();
    const out = [];
    for (const p of planItems || []) {
      if (!p.variety) continue;
      const hay = `${p.variety} ${p.location || ""} ${p.rowId || ""} ${p.category || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      const k = `${p.location}||${p.rowId}||${p.variety}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 20) break;
    }
    return out;
  }, [planItems, search]);

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

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addLot(seed = {}) {
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

  function addFromPlanItem(p) {
    addLot({
      location: p.location || "",
      rowId: p.rowId || "",
      potSize: sizeFromCategory(p.category),
      plantType: typeFromCategory(p.category, p.variety),
      variety: p.variety || "",
    });
    setSearch("");
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
  const stickyLeft = 0;
  const locWidth = COLS[0].width;

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

      {/* Item search — primary input. Tapping a result auto-fills a new row */}
      <div style={{ padding: "10px 12px", background: "#fff", borderBottom: "1.5px solid #e0ead8" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search Fall Program — variety, location, row…"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
        />
        {searchResults.length > 0 && (
          <div style={{ marginTop: 8, background: "#f7faf3", border: "1.5px solid #c8d8c0", borderRadius: 10, maxHeight: 280, overflowY: "auto" }}>
            {searchResults.map((p, i) => (
              <button key={`${p.id}-${i}`} onClick={() => addFromPlanItem(p)}
                style={{
                  width: "100%", textAlign: "left", background: i % 2 === 0 ? "#fff" : "#f7faf3",
                  border: "none", borderBottom: i === searchResults.length - 1 ? "none" : "1px solid #e8ede4",
                  padding: "10px 12px", cursor: "pointer", fontFamily: "inherit",
                }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", lineHeight: 1.25 }}>{p.variety}</div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                  📍 {p.location || "—"} · {p.rowId || "—"} · {sizeFromCategory(p.category) || p.category}
                </div>
              </button>
            ))}
          </div>
        )}
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

      {/* Spreadsheet grid. Horizontal scroll on phones; first column sticky. */}
      <div style={{ overflowX: "auto", background: "#fff", borderBottom: "1.5px solid #e0ead8" }}>
        <div style={{ minWidth: totalWidth, position: "relative" }}>
          {/* Sticky header row */}
          <div style={{
            display: "grid",
            gridTemplateColumns: COLS.map(c => `${c.width}px`).join(" "),
            background: "#162212", color: "#c8e6b8",
            position: "sticky", top: 0, zIndex: 6,
          }}>
            {COLS.map((c, i) => (
              <div key={c.key} style={{
                padding: "8px 6px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.6,
                borderRight: "1px solid #2a3e22",
                ...(c.sticky ? { position: "sticky", left: stickyLeft, background: "#162212", zIndex: 7 } : {}),
              }}>
                {c.label}
              </div>
            ))}
          </div>

          {/* Body */}
          {visibleLots.length === 0 && (
            <div style={{ padding: "28px 14px", textAlign: "center", color: "#7a8c74" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📊</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>No rows yet.</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Search above or tap “+ Add”.</div>
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
                alignItems: "stretch",
              }}>
                {/* Sticky Location — uses textarea for wrap */}
                <Cell sticky stickyBg={altBg} width={locWidth}>
                  <AutoTextarea
                    list={`locs-${lot.id}`} value={lot.location || ""}
                    onChange={v => patch(lot, { location: v })}
                    placeholder="Bluff Q10" />
                  <datalist id={`locs-${lot.id}`}>{allLocations.map(l => <option key={l} value={l} />)}</datalist>
                </Cell>
                {/* Row */}
                <Cell>
                  <AutoTextarea
                    list={`rows-${lot.id}`} value={lot.rowId || ""}
                    onChange={v => patch(lot, { rowId: v })}
                    placeholder="BQ1003" />
                  <datalist id={`rows-${lot.id}`}>{[...rowOptions].sort().map(r => <option key={r} value={r} />)}</datalist>
                </Cell>
                {/* Size */}
                <Cell>
                  <select value={lot.potSize || ""} onChange={e => patch(lot, { potSize: e.target.value })} style={cellSelect}>
                    {POT_SIZES.map(s => <option key={s} value={s}>{s || "—"}</option>)}
                  </select>
                </Cell>
                {/* Plant Type */}
                <Cell>
                  <select value={lot.plantType || ""} onChange={e => patch(lot, { plantType: e.target.value })} style={cellSelect}>
                    <option value="">—</option>
                    {plantTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Cell>
                {/* Variety */}
                <Cell>
                  <AutoTextarea
                    list={`vars-${lot.id}`} value={lot.variety || ""}
                    onChange={v => patch(lot, { variety: v })}
                    placeholder="Pick from search above" />
                  <datalist id={`vars-${lot.id}`}>{[...varOptions].sort().map(v => <option key={v} value={v} />)}</datalist>
                </Cell>
                {/* Qty */}
                <Cell>
                  <input type="number" inputMode="numeric" value={lot.quantity ?? 0}
                    onChange={e => patch(lot, { quantity: parseInt(e.target.value, 10) || 0 })}
                    style={{ ...cellInputBase, fontWeight: 800, textAlign: "right", fontSize: 14 }} />
                </Cell>
                {/* Notes */}
                <Cell>
                  <AutoTextarea value={lot.notes || ""}
                    onChange={v => patch(lot, { notes: v })}
                    placeholder="small, wilted…" />
                </Cell>
                {/* Actions */}
                <div style={{ padding: 4, display: "flex", alignItems: "center", gap: 3, borderRight: "1px solid #e8ede4" }}>
                  <button onClick={() => duplicate(lot)} title="Duplicate (next row)" style={miniBtn("#7fb069", "#1e2d1a")}>⎘</button>
                  <button onClick={() => { if (window.confirm(`Delete "${lot.variety || "this row"}"?`)) remove(lot.id); }}
                    title="Delete" style={miniBtn("transparent", "#d94f3d", "#d94f3d")}>🗑</button>
                </div>
              </div>
            );
          })}

          {/* Pinned "+ Add row" footer */}
          <button onClick={() => addLot({ location: filterLocation })}
            style={{
              width: "100%", padding: "10px", textAlign: "left",
              background: "#f2f5ef", border: "none", borderTop: "1.5px dashed #c8d8c0",
              fontSize: 13, fontWeight: 800, color: "#4a7a35", cursor: "pointer", fontFamily: "inherit",
            }}>
            + Add row
          </button>
        </div>
      </div>

      <div style={{ padding: "8px 14px", fontSize: 10, color: "#7a8c74", lineHeight: 1.4 }}>
        Tip: type a variety, location, or row in the search at the top — tap any match to drop in a new row pre-filled with location/row/size/type/variety. Just type the qty.
      </div>
    </div>
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

const Cell = ({ children, sticky, stickyBg, width }) => (
  <div style={{
    padding: 0, borderRight: "1px solid #e8ede4", display: "flex", alignItems: "stretch",
    ...(sticky ? { position: "sticky", left: 0, background: stickyBg, zIndex: 4, width } : {}),
  }}>{children}</div>
);

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
