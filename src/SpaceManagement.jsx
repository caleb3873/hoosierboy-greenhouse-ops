import { useState, useEffect } from "react";
import { useHouses, usePads, useManualTasks, useCropRuns, useContainers } from "./supabase";


const LOCATIONS = ["Bluff Road", "Sprague Road"];
const BENCH_WIDTHS = [1, 4, 6, 8];
const BENCH_TYPES = [
  { id: "single",   label: "Single",            desc: "Single bench, one side access" },
  { id: "double",   label: "Double (back-to-back)", desc: "Two 4' benches sharing a spine" },
  { id: "shelf",    label: "Wall Shelf",         desc: "Wall-mounted shelf (1' wide)" },
];
const BENCH_MATERIALS = ["Durabench Plastic", "Wood", "Metal", "Wire", "Other"];
const POT_SIZES = [
  { label: "4.5\"",  dia: 4.5  },
  { label: "6\"",    dia: 6    },
  { label: "8\"",    dia: 8    },
  { label: "10\"",   dia: 10   },
  { label: "11\"",   dia: 11   },
  { label: "12\"",   dia: 12   },
  { label: "14\"",   dia: 14   },
  { label: "1020 flat", dia: 10 }, // flat tray ~10" wide
];
// pots per sq ft at different spacings (pot-to-pot center)
function potsPerSqFt(diaIn, spacingIn) {
  // center-to-center spacing in inches → pots per sq ft
  const s = spacingIn / 12; // convert to feet
  return s > 0 ? (1 / (s * s)).toFixed(1) : 0;
}
function benchPotCapacity(widthFt, lengthFt, diaIn, spacingIn) {
  if (!widthFt || !lengthFt || !diaIn) return null;
  const s = spacingIn / 12;
  const cols = Math.floor(widthFt / s);
  const rows = Math.floor(lengthFt / s);
  return cols * rows;
}
const LIGHTING_TYPES = ["Natural Only", "HPS Supplemental", "LED Supplemental", "HID", "Shade Cloth", "Blackout Capable"];
const TUBE_POSITIONS = ["Left edge", "Right edge", "Center", "Left-center", "Right-center", "Custom — see notes"];
const FLOOR_TYPES = ["Bare ground", "Gravel", "Concrete", "Weed fabric", "Pea gravel", "Poured rubber", "Other"];
const HEATER_TYPES = ["Propane unit heater", "Gas unit heater", "Boiler / hot water", "Electric"];
const ZONE_TYPES = [
  { id: "bench",     label: "Bench Zone",          icon: "🌿", color: "#7fb069" },
  { id: "hanging",   label: "Hanging Basket Lines", icon: "🧺", color: "#4a90d9" },
  { id: "lowbasket", label: "Low Basket Lines",     icon: "🪴", color: "#8e44ad" },
  { id: "rackzone",  label: "Low Planter Racks",    icon: "📦", color: "#e07b39" },
];
const ROW_CFG = {
  hanging:   { addLabel: "Add Line",     rowLabel: "Line", capLabel: "positions", color: "#4a90d9" },
  lowbasket: { addLabel: "Add Line",     rowLabel: "Line", capLabel: "positions", color: "#8e44ad" },
  rackzone:  { addLabel: "Add Rack Row", rowLabel: "Row",  capLabel: "pots",      color: "#e07b39" },
};

const ztc = (id) => ZONE_TYPES.find(z => z.id === id) || ZONE_TYPES[0];
const uid = () => crypto.randomUUID();
const dc  = (o) => JSON.parse(JSON.stringify(o));
function reIdHouse(h) { return { ...h, id: uid(), name: h.name + " (Copy)", zones: (h.zones||[]).map(z => ({ ...z, id: uid(), items: (z.items||[]).map(i => ({ ...i, id: uid(), cropId: null })) })) }; }
function reIdPad(p)   { return { ...p, id: uid(), name: p.name + " (Copy)", bays: (p.bays||[]).map(b => ({ ...b, id: uid() })) }; }

// ── helpers: space stats ──────────────────────────────────────────────────────
function houseStats(house) {
  const benches = house.zones.filter(z => z.type === "bench").flatMap(z => z.items || []);
  const sqFt    = benches.reduce((s, b) => {
    const w = b.benchType === "double" ? 8 : (b.widthFt || 0);
    return s + (w && b.lengthFt ? Number(w) * Number(b.lengthFt) : 0);
  }, 0);
  const occupied = benches.filter(b => b.cropId).length;
  const heated   = benches.filter(b => b.heated).length;
  const capsPerType = {};
  house.zones.forEach(z => { if (z.type !== "bench") capsPerType[z.type] = (capsPerType[z.type] || 0) + (z.items || []).reduce((s, r) => s + (Number(r.capacityPerRow) || 0), 0); });
  return { benches: benches.length, sqFt, occupied, heated, capsPerType, available: benches.length - occupied };
}
function padStats(pad) {
  const sqFt  = pad.bays.reduce((s, b) => s + (b.lengthFt && b.widthFt ? Number(b.lengthFt) * Number(b.widthFt) : 0), 0);
  const frost = pad.bays.filter(b => b.frostCover).length;
  return { bays: pad.bays.length, sqFt, frost };
}

// ── PRIMITIVES ────────────────────────────────────────────────────────────────
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const TA = (f) => ({ ...IS(f), minHeight: 60, resize: "vertical" });

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
function FL({ c }) { return <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7a8c74", marginBottom: 5, letterSpacing: .6, textTransform: "uppercase" }}>{c}</label>; }
function SH({ c, mt }) { return <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 7, marginBottom: 14, marginTop: mt || 10 }}>{c}</div>; }
function Badge({ label, color }) { return <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>; }
function Pill({ label, value, color = "#7fb069" }) {
  return (
    <div style={{ background: color + "14", border: `1px solid ${color}33`, borderRadius: 8, padding: "7px 13px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginTop: 1 }}>{label}</div>
    </div>
  );
}
function IBtn({ onClick, danger, children }) { return <button onClick={onClick} style={{ background: "none", border: `1px solid ${danger ? "#f0d0c0" : "#e0ead8"}`, borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: danger ? "#e07b39" : "#aabba0", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{children}</button>; }
function ABtn({ onClick, label, color, border }) { return <button onClick={onClick} style={{ background: color || "none", color: color ? "#fff" : "#7a8c74", border: `1px solid ${border || "#c8d8c0"}`, borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: color ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>; }

function FillBar({ pct, color, label, sublabel }) {
  return (
    <div style={{ marginBottom: 6 }}>
      {(label || sublabel) && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7a8c74", marginBottom: 4 }}><span>{label}</span><span>{sublabel}</span></div>}
      <div style={{ background: "#e8ede4", borderRadius: 6, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct > 85 ? "#e07b39" : pct > 60 ? "#f0c040" : color || "#7fb069", borderRadius: 6, transition: "width .4s" }} />
      </div>
    </div>
  );
}

// ── DRIP BLOCK ────────────────────────────────────────────────────────────────
function DripBlock({ item, onUpdate, fk, focus, setFocus }) {
  return (
    <div style={{ background: "#f0f8ff", borderRadius: 10, padding: 14, border: "1.5px solid #c0d8f0", marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#4a6a8a", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Drip Configuration</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div><FL c="Drip Lines per Row" /><input type="number" style={{ ...IS(focus === fk + "dl"), background: "#fff" }} value={item.dripLines || ""} onChange={e => onUpdate("dripLines", e.target.value)} onFocus={() => setFocus(fk + "dl")} onBlur={() => setFocus(null)} placeholder="e.g. 2" /></div>
        <div><FL c="Tubes per Item" /><input type="number" style={{ ...IS(focus === fk + "tpi"), background: "#fff" }} value={item.tubesPerItem || ""} onChange={e => onUpdate("tubesPerItem", e.target.value)} onFocus={() => setFocus(fk + "tpi")} onBlur={() => setFocus(null)} placeholder="e.g. 1" /></div>
      </div>
      <FL c="Main Supply Tube Position" />
      <select style={{ ...IS(false), background: "#fff" }} value={item.mainTubePosition || ""} onChange={e => onUpdate("mainTubePosition", e.target.value)}>
        <option value="">— Select —</option>{TUBE_POSITIONS.map(p => <option key={p}>{p}</option>)}
      </select>
    </div>
  );
}

// ── ITEM EDITOR ───────────────────────────────────────────────────────────────
function ItemEditor({ item, idx, totalItems, zoneType, zt, onUpdate, onRemove, onMoveUp, onMoveDown, cropRuns, containers = [] }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(null);
  const [calcPotSize, setCalcPotSize] = useState(0);
  const [calcSpacing, setCalcSpacing] = useState(6);
  const rc = ROW_CFG[zoneType];

  // Bench number goes left to right
  const benchNum = idx + 1;

  const isShelf  = item.benchType === "shelf";
  const isDouble = item.benchType === "double";
  const effectiveWidth = isDouble ? 4 : (item.widthFt || 4); // each side of double is 4'
  const sqFt = zoneType === "bench" && effectiveWidth && item.lengthFt
    ? (isDouble ? effectiveWidth * 2 : effectiveWidth) * Number(item.lengthFt)
    : 0;
  const calcCapacity = zoneType === "bench" && effectiveWidth && item.lengthFt
    ? benchPotCapacity(isDouble ? effectiveWidth * 2 : effectiveWidth, Number(item.lengthFt), calcPotSize, calcSpacing)
    : null;

  // Occupancy: find crop runs assigned to this bench
  const assignedRuns = (cropRuns || []).filter(r =>
    (r.indoorAssignments || []).some(a => a.benchId === item.id) ||
    (r.outsideAssignments || []).some(a => a.benchId === item.id)
  );

  return (
    <div style={{ background: "#fff", borderRadius: 10, border: `1px solid ${open ? zt.color : "#e0ead8"}`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 28, height: 24, borderRadius: 5, background: zt.color + "18", border: `1px solid ${zt.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: zt.color, flexShrink: 0 }}>
          {isShelf ? "S" : benchNum}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {item.label || `Bench ${benchNum}`}
            {item.benchType && <span style={{ fontSize: 10, background: "#f0f5ee", color: "#7a8c74", border: "1px solid #c8d8c0", borderRadius: 10, padding: "1px 7px" }}>{BENCH_TYPES.find(t => t.id === item.benchType)?.label || item.benchType}</span>}
            {item.heated && <span style={{ fontSize: 10, background: "#fff0e0", color: "#c8791a", border: "1px solid #f0c080", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>🔥 Heated</span>}
            {assignedRuns.length > 0 && <span style={{ fontSize: 10, background: "#e8f4f8", color: "#2e7d9e", border: "1px solid #b0d8e8", borderRadius: 10, padding: "1px 7px", fontWeight: 700 }}>🌱 {assignedRuns.length} crop{assignedRuns.length !== 1 ? "s" : ""}</span>}
          </div>
          <div style={{ fontSize: 11, color: "#aabba0" }}>
            {zoneType === "bench" && (isDouble ? `4'+4'` : effectiveWidth ? `${effectiveWidth}'` : "")}{zoneType === "bench" && item.lengthFt ? ` × ${item.lengthFt}'` : ""}
            {sqFt > 0 ? ` · ${sqFt.toLocaleString()} sf` : ""}
            {item.material ? ` · ${item.material}` : ""}
            {zoneType !== "bench" && item.capacityPerRow ? ` ${item.capacityPerRow} ${rc.capLabel}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          <IBtn onClick={e => { e.stopPropagation(); onMoveUp(); }}>↑</IBtn>
          <IBtn onClick={e => { e.stopPropagation(); onMoveDown(); }}>↓</IBtn>
          <IBtn danger onClick={e => { e.stopPropagation(); onRemove(); }}>×</IBtn>
        </div>
        <span style={{ color: "#aabba0", fontSize: 14, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #f0f5ee", padding: 12, background: "#fafcf8" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: "span 2" }}><FL c="Label / Name" /><input style={IS(focus === "lbl")} value={item.label || ""} onChange={e => onUpdate("label", e.target.value)} onFocus={() => setFocus("lbl")} onBlur={() => setFocus(null)} placeholder={`e.g. Bench ${benchNum}`} /></div>

            {zoneType === "bench" ? (<>
              {/* Bench type */}
              <div style={{ gridColumn: "span 2" }}>
                <FL c="Bench Type" />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {BENCH_TYPES.map(t => (
                    <button key={t.id} onClick={() => {
                      onUpdate("benchType", t.id);
                      if (t.id === "shelf") onUpdate("widthFt", 1);
                      if (t.id === "double") onUpdate("widthFt", 4);
                    }}
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${item.benchType === t.id ? zt.color : "#c8d8c0"}`, background: item.benchType === t.id ? zt.color + "18" : "#fff", color: item.benchType === t.id ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {item.benchType && <div style={{ fontSize: 11, color: "#aabba0", marginTop: 4 }}>{BENCH_TYPES.find(t => t.id === item.benchType)?.desc}</div>}
              </div>

              {/* Width — only shown for single/shelf */}
              {!isDouble && (
                <div>
                  <FL c="Width" />
                  <div style={{ display: "flex", gap: 5 }}>
                    {(isShelf ? [1] : [1, 4, 6, 8]).map(w => (
                      <button key={w} onClick={() => onUpdate("widthFt", w)}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${item.widthFt === w ? zt.color : "#c8d8c0"}`, background: item.widthFt === w ? zt.color + "18" : "#fff", color: item.widthFt === w ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        {w}'
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isDouble && (
                <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 18 }}>↔</span>
                  <div><div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>4' + 4' back-to-back</div><div style={{ fontSize: 11, color: "#7a8c74" }}>Access from both sides</div></div>
                </div>
              )}

              <div><FL c="Length (ft)" /><input type="number" style={IS(focus === "len")} value={item.lengthFt || ""} onChange={e => onUpdate("lengthFt", e.target.value)} onFocus={() => setFocus("len")} onBlur={() => setFocus(null)} placeholder="e.g. 100" /></div>

              {/* Material */}
              <div style={{ gridColumn: "span 2" }}>
                <FL c="Material" />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {BENCH_MATERIALS.map(m => (
                    <button key={m} onClick={() => onUpdate("material", m)}
                      style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${item.material === m ? zt.color : "#c8d8c0"}`, background: item.material === m ? zt.color + "18" : "#fff", color: item.material === m ? "#2e5c1e" : "#7a8c74", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {sqFt > 0 && <div style={{ gridColumn: "span 2", background: "#f0f8eb", borderRadius: 7, padding: "7px 11px", fontSize: 12, color: "#2e5c1e", fontWeight: 600 }}>✓ {sqFt.toLocaleString()} sq ft total bench space</div>}

              {/* Toggles */}
              <div style={{ gridColumn: "span 2", display: "flex", gap: 20, flexWrap: "wrap" }}>
                <Toggle value={!!item.heated} onChange={v => onUpdate("heated", v)} label={item.heated ? "Heated bench" : "Not heated"} />
              </div>

              {/* Irrigation */}
              <div style={{ gridColumn: "span 2" }}>
                <FL c="Irrigation" />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {["Drip", "Hand Water", "None"].map(t => (
                    <button key={t} onClick={() => onUpdate("irrigation", t)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: `1.5px solid ${item.irrigation === t ? zt.color : "#c8d8c0"}`, background: item.irrigation === t ? zt.color + "18" : "#fff", color: item.irrigation === t ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      {t}
                    </button>
                  ))}
                </div>
                {item.irrigation === "Drip" && <DripBlock item={item} onUpdate={onUpdate} fk={item.id} focus={focus} setFocus={setFocus} />}
              </div>

              {/* Capacity Calculator */}
              {sqFt > 0 && (
                <div style={{ gridColumn: "span 2", background: "#f8f0ff", border: "1.5px solid #d4b8f0", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#7a3db0", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Capacity Calculator</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <FL c="Container" />
                      <select value={calcPotSize} onChange={e => setCalcPotSize(Number(e.target.value))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
                        <option value="">— Select container —</option>
                        {containers.filter(c => c.diameterIn).sort((a,b) => a.diameterIn - b.diameterIn).map(c => (
                          <option key={c.id} value={c.diameterIn}>{c.name} ({c.diameterIn}")</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FL c="Spacing (center-to-center, inches)" />
                      <input type="number" min="4" max="24" step="0.5" value={calcSpacing}
                        onChange={e => setCalcSpacing(Number(e.target.value))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  {calcCapacity !== null && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#7a3db0" }}>{calcCapacity.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", textTransform: "uppercase" }}>Pots at {calcSpacing}" spacing</div>
                      </div>
                      {isDouble && (
                        <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "#7a3db0" }}>{Math.round(calcCapacity / 2).toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: "#7a8c74", textTransform: "uppercase" }}>Per side</div>
                        </div>
                      )}
                      <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: "#4a5a40" }}>{sqFt.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", textTransform: "uppercase" }}>Sq Ft</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Occupancy */}
              {assignedRuns.length > 0 && (
                <div style={{ gridColumn: "span 2", background: "#e8f4f8", border: "1.5px solid #b0d8e8", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#2e7d9e", letterSpacing: .8, textTransform: "uppercase", marginBottom: 8 }}>Current Occupancy</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {assignedRuns.map(r => (
                      <div key={r.id} style={{ background: "#fff", borderRadius: 7, padding: "7px 10px", fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, color: "#1e2d1a" }}>🌱 {r.cropName}</span>
                        <span style={{ color: "#7a8c74" }}>Wk {r.targetWeek} / {r.targetYear}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </>) : (<>
              <div><FL c="Length (ft)" /><input type="number" style={IS(focus === "len")} value={item.lengthFt || ""} onChange={e => onUpdate("lengthFt", e.target.value)} onFocus={() => setFocus("len")} onBlur={() => setFocus(null)} placeholder="e.g. 100" /></div>
              <div><FL c={`${rc.capLabel} per ${rc.rowLabel}`} /><input type="number" style={IS(focus === "cap")} value={item.capacityPerRow || ""} onChange={e => onUpdate("capacityPerRow", e.target.value)} onFocus={() => setFocus("cap")} onBlur={() => setFocus(null)} placeholder="e.g. 60" /></div>
              <DripBlock item={item} onUpdate={onUpdate} fk={item.id} focus={focus} setFocus={setFocus} />
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ZONE EDITOR ───────────────────────────────────────────────────────────────
function ZoneEditor({ zone, onChange, onDelete, onMoveUp, onMoveDown, cropRuns, containers = [] }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(null);
  const zt = ztc(zone.type); const rc = ROW_CFG[zone.type];
  const upd = (f, v) => onChange({ ...zone, [f]: v });
  const updItem = (idx, f, v) => { const items = [...(zone.items || [])]; items[idx] = { ...items[idx], [f]: v }; onChange({ ...zone, items }); };
  const addItem = () => {
    const n = (zone.items || []).length + 1;
    const label = zone.type === "bench" ? `Bench ${n}` : `${rc.rowLabel} ${n}`;
    onChange({ ...zone, items: [...(zone.items || []), {
      id: uid(), label, benchType: "single", widthFt: 4, lengthFt: "",
      material: "", irrigation: "Drip", dripLines: "", tubesPerItem: "",
      mainTubePosition: "", heated: false, cropId: null,
      capacityPerRow: "",
    }]});
  };
  const removeItem = (idx) => onChange({ ...zone, items: (zone.items || []).filter((_, i) => i !== idx) });
  const moveItem = (idx, dir) => { const items = [...(zone.items || [])]; const s = idx + dir; if (s < 0 || s >= items.length) return; [items[idx], items[s]] = [items[s], items[idx]]; onChange({ ...zone, items }); };
  const totalSqFt = zone.type === "bench" ? (zone.items || []).reduce((s, b) => {
    const w = b.benchType === "double" ? 8 : (b.widthFt || 0);
    return s + (w && b.lengthFt ? Number(w) * Number(b.lengthFt) : 0);
  }, 0) : 0;
  const totalPos  = zone.type !== "bench" ? (zone.items || []).reduce((s, r) => s + (Number(r.capacityPerRow) || 0), 0) : 0;
  return (
    <div style={{ background: "#fafcf8", borderRadius: 12, border: `1.5px solid ${zt.color}44`, overflow: "hidden", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: zt.color + "10" }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{zt.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={zone.name} onChange={e => upd("name", e.target.value)} placeholder={`${zt.label} name...`} style={{ background: "transparent", border: "none", outline: "none", fontWeight: 700, fontSize: 14, color: "#1e2d1a", fontFamily: "inherit", width: "100%" }} />
          <div style={{ fontSize: 11, color: zt.color, fontWeight: 600 }}>
            {zt.label}
            {totalSqFt > 0 && <span style={{ color: "#7a8c74", marginLeft: 8 }}>{totalSqFt.toLocaleString()} sf</span>}
            {totalPos > 0 && <span style={{ color: "#7a8c74", marginLeft: 8 }}>{totalPos.toLocaleString()} {rc?.capLabel}</span>}
            {(zone.items || []).length > 0 && <span style={{ color: "#7a8c74", marginLeft: 8 }}>{(zone.items || []).length} item{(zone.items || []).length !== 1 ? "s" : ""}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <IBtn onClick={onMoveUp}>↑</IBtn><IBtn onClick={onMoveDown}>↓</IBtn>
          <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: `1px solid ${zt.color}55`, borderRadius: 6, padding: "4px 10px", fontSize: 12, color: zt.color, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>{open ? "Collapse" : "Expand"}</button>
          <IBtn danger onClick={onDelete}>×</IBtn>
        </div>
      </div>
      {open && (
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 14 }}><FL c="Zone Notes" /><input style={IS(focus === zone.id + "n")} value={zone.notes || ""} onChange={e => upd("notes", e.target.value)} onFocus={() => setFocus(zone.id + "n")} onBlur={() => setFocus(null)} placeholder="Special conditions..." /></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>{zone.type === "bench" ? "Benches" : `${rc.rowLabel}s`}</div>
            <button onClick={addItem} style={{ background: zt.color, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ {zone.type === "bench" ? "Add Bench" : rc.addLabel}</button>
          </div>
          {(zone.items || []).length === 0 && <div style={{ textAlign: "center", padding: 16, color: "#aabba0", background: "#fff", borderRadius: 8, border: `1.5px dashed ${zt.color}44`, fontSize: 12, marginBottom: 6 }}>None yet</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(zone.items || []).map((item, idx) => (
              <ItemEditor key={item.id} item={item} idx={idx} totalItems={(zone.items || []).length} zoneType={zone.type} zt={zt} cropRuns={cropRuns} containers={containers}
                onUpdate={(f, v) => updItem(idx, f, v)} onRemove={() => removeItem(idx)}
                onMoveUp={() => moveItem(idx, -1)} onMoveDown={() => moveItem(idx, 1)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HOUSE DETAILS PANEL ───────────────────────────────────────────────────────
function HouseDetailsPanel({ details, onChange }) {
  const d = details || {};
  const [focus, setFocus] = useState(null);
  const upd = (f, v) => onChange({ ...d, [f]: v });
  const updN = (g, f, v) => onChange({ ...d, [g]: { ...(d[g] || {}), [f]: v } });
  const [newYear, setNewYear] = useState(""); const [newAmt, setNewAmt] = useState("");
  const [newMDate, setNewMDate] = useState(""); const [newMNote, setNewMNote] = useState("");
  function addSales() { if (!newYear) return; const rec = [...(d.salesRecords || []).filter(r => r.year !== newYear), { year: newYear, amount: newAmt }].sort((a, b) => b.year - a.year); upd("salesRecords", rec); setNewYear(""); setNewAmt(""); }
  function addMaint() { if (!newMNote) return; upd("maintenanceLog", [{ id: uid(), date: newMDate, note: newMNote }, ...(d.maintenanceLog || [])]); setNewMDate(""); setNewMNote(""); }
  const ss = { background: "#f8faf6", borderRadius: 12, border: "1px solid #e0ead8", padding: "18px 20px", marginBottom: 16 };
  return (
    <div>
      <div style={{ background: d.activeIssues?.trim() ? "#fff8f0" : "#f8faf6", borderRadius: 12, border: `1px solid ${d.activeIssues?.trim() ? "#f0c080" : "#e0ead8"}`, padding: "18px 20px", marginBottom: 16 }}>
        <SH c="⚠ Active Issues / Repair Requests" mt={0} />
        <FL c="Describe any current problems, damage, or open repair requests" />
        <textarea style={{ ...TA(focus === "issues"), minHeight: 80, border: `1.5px solid ${d.activeIssues?.trim() ? "#f0a030" : "#c8d8c0"}`, background: d.activeIssues?.trim() ? "#fffcf5" : "#fff" }}
          value={d.activeIssues || ""} onChange={e => upd("activeIssues", e.target.value)}
          onFocus={() => setFocus("issues")} onBlur={() => setFocus(null)}
          placeholder="e.g. North gutter leaking, heater #2 not igniting, door latch broken..." />
        {d.activeIssues?.trim() && (
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => upd("activeIssues", "")} style={{ background: "none", border: "1px solid #e0c080", borderRadius: 7, padding: "5px 12px", fontSize: 11, color: "#a07020", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>✓ Mark resolved (clear)</button>
          </div>
        )}
      </div>
      <div style={ss}><SH c="Greenhouse Plastic" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><FL c="Plastic Age (years)" /><input type="number" style={IS(focus === "pA")} value={d.plasticAge || ""} onChange={e => upd("plasticAge", e.target.value)} onFocus={() => setFocus("pA")} onBlur={() => setFocus(null)} /></div>
          <div><FL c="Last Replaced" /><input type="date" style={IS(focus === "pL")} value={d.plasticLastReplaced || ""} onChange={e => upd("plasticLastReplaced", e.target.value)} onFocus={() => setFocus("pL")} onBlur={() => setFocus(null)} /></div>
          <div><FL c="Next Replacement" /><input type="date" style={IS(focus === "pN")} value={d.plasticNextReplacement || ""} onChange={e => upd("plasticNextReplacement", e.target.value)} onFocus={() => setFocus("pN")} onBlur={() => setFocus(null)} /></div>
          <div><FL c="Plastic Type / Brand" /><input style={IS(focus === "pT")} value={d.plasticType || ""} onChange={e => upd("plasticType", e.target.value)} onFocus={() => setFocus("pT")} onBlur={() => setFocus(null)} placeholder="e.g. 6-mil poly" /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Notes" /><textarea style={TA(focus === "pNotes")} value={d.plasticNotes || ""} onChange={e => upd("plasticNotes", e.target.value)} onFocus={() => setFocus("pNotes")} onBlur={() => setFocus(null)} /></div>
        </div>
      </div>
      <div style={ss}><SH c="Floor Composition" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><FL c="Floor Type" /><select style={IS(false)} value={d.floorType || ""} onChange={e => upd("floorType", e.target.value)}><option value="">— Select —</option>{FLOOR_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><FL c="Drainage" /><input style={IS(focus === "drain")} value={d.drainage || ""} onChange={e => upd("drainage", e.target.value)} onFocus={() => setFocus("drain")} onBlur={() => setFocus(null)} placeholder="e.g. French drain, slope" /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Notes" /><textarea style={TA(focus === "flNotes")} value={d.floorNotes || ""} onChange={e => upd("floorNotes", e.target.value)} onFocus={() => setFocus("flNotes")} onBlur={() => setFocus(null)} /></div>
        </div>
      </div>
      <div style={ss}><SH c="Heating" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><FL c="Heater Type" /><select style={IS(false)} value={(d.heating || {}).heaterType || ""} onChange={e => updN("heating", "heaterType", e.target.value)}><option value="">— Select —</option>{HEATER_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><FL c="Number of Heaters" /><input type="number" style={IS(focus === "hC")} value={(d.heating || {}).heaterCount || ""} onChange={e => updN("heating", "heaterCount", e.target.value)} onFocus={() => setFocus("hC")} onBlur={() => setFocus(null)} /></div>
          <div><FL c="Thermostat Brand / Model" /><input style={IS(focus === "hT")} value={(d.heating || {}).thermostat || ""} onChange={e => updN("heating", "thermostat", e.target.value)} onFocus={() => setFocus("hT")} onBlur={() => setFocus(null)} placeholder="e.g. Priva, Argus" /></div>
          <div><FL c="Last Service Date" /><input type="date" style={IS(focus === "hS")} value={(d.heating || {}).lastService || ""} onChange={e => updN("heating", "lastService", e.target.value)} onFocus={() => setFocus("hS")} onBlur={() => setFocus(null)} /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Notes" /><textarea style={TA(focus === "hNotes")} value={(d.heating || {}).notes || ""} onChange={e => updN("heating", "notes", e.target.value)} onFocus={() => setFocus("hNotes")} onBlur={() => setFocus(null)} /></div>
        </div>
      </div>
      <div style={ss}><SH c="Irrigation Automation" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><FL c="Controller Brand / Model" /><input style={IS(focus === "iC")} value={(d.irrigation || {}).controller || ""} onChange={e => updN("irrigation", "controller", e.target.value)} onFocus={() => setFocus("iC")} onBlur={() => setFocus(null)} placeholder="e.g. Rain Bird, Netafim" /></div>
          <div><FL c="Last Service / Calibration" /><input type="date" style={IS(focus === "iS")} value={(d.irrigation || {}).lastService || ""} onChange={e => updN("irrigation", "lastService", e.target.value)} onFocus={() => setFocus("iS")} onBlur={() => setFocus(null)} /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Fertigation Injector Info" /><input style={IS(focus === "inj")} value={(d.irrigation || {}).injector || ""} onChange={e => updN("irrigation", "injector", e.target.value)} onFocus={() => setFocus("inj")} onBlur={() => setFocus(null)} placeholder="Brand, ratio, program..." /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Timer Schedules" /><textarea style={TA(focus === "iT")} value={(d.irrigation || {}).timerSchedules || ""} onChange={e => updN("irrigation", "timerSchedules", e.target.value)} onFocus={() => setFocus("iT")} onBlur={() => setFocus(null)} /></div>
          <div style={{ gridColumn: "span 2" }}><FL c="Operating Instructions" /><textarea style={{ ...TA(focus === "iI"), minHeight: 80 }} value={(d.irrigation || {}).instructions || ""} onChange={e => updN("irrigation", "instructions", e.target.value)} onFocus={() => setFocus("iI")} onBlur={() => setFocus(null)} placeholder="Startup/shutdown, valve locations, staff instructions..." /></div>
        </div>
      </div>
      <div style={ss}><SH c="Maintenance Log" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div><FL c="Date" /><input type="date" style={IS(false)} value={newMDate} onChange={e => setNewMDate(e.target.value)} /></div>
          <div><FL c="Record" /><input style={IS(focus === "mNote")} value={newMNote} onChange={e => setNewMNote(e.target.value)} onFocus={() => setFocus("mNote")} onBlur={() => setFocus(null)} placeholder="e.g. Replaced poly, serviced heater..." /></div>
          <button onClick={addMaint} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
        </div>
        {(d.maintenanceLog || []).length === 0 && <div style={{ fontSize: 13, color: "#aabba0" }}>No records yet</div>}
        {(d.maintenanceLog || []).map(rec => (
          <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 8, border: "1px solid #e0ead8", padding: "8px 12px", marginBottom: 6 }}>
            {rec.date && <span style={{ fontSize: 12, color: "#7a8c74", whiteSpace: "nowrap", fontWeight: 600 }}>{rec.date}</span>}
            <span style={{ flex: 1, fontSize: 13, color: "#1e2d1a" }}>{rec.note}</span>
            <IBtn danger onClick={() => upd("maintenanceLog", (d.maintenanceLog || []).filter(r => r.id !== rec.id))}>×</IBtn>
          </div>
        ))}
      </div>
      <div style={ss}><SH c="Sales Volume by Year" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div><FL c="Year" /><input type="number" style={IS(false)} value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="2024" /></div>
          <div><FL c="Sales ($)" /><input type="number" style={IS(focus === "sA")} value={newAmt} onChange={e => setNewAmt(e.target.value)} onFocus={() => setFocus("sA")} onBlur={() => setFocus(null)} /></div>
          <button onClick={addSales} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
        </div>
        {(d.salesRecords || []).length === 0 && <div style={{ fontSize: 13, color: "#aabba0" }}>No records yet</div>}
        {(d.salesRecords || []).map(rec => (
          <div key={rec.year} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 8, border: "1px solid #e0ead8", padding: "8px 12px", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a", minWidth: 50 }}>{rec.year}</span>
            <span style={{ flex: 1, fontSize: 13, color: "#4a7a35", fontWeight: 600 }}>{rec.amount ? "$" + Number(rec.amount).toLocaleString() : "—"}</span>
            <IBtn danger onClick={() => upd("salesRecords", (d.salesRecords || []).filter(r => r.year !== rec.year))}>×</IBtn>
          </div>
        ))}
        {(d.salesRecords || []).length > 1 && <div style={{ marginTop: 10, padding: "9px 14px", background: "#f0f8eb", borderRadius: 8, fontSize: 12, color: "#2e5c1e", fontWeight: 600 }}>Historical total: ${(d.salesRecords || []).reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}</div>}
      </div>
    </div>
  );
}

// ── HOUSE FORM ────────────────────────────────────────────────────────────────
function HouseForm({ initial, onSave, onCancel, cropRuns, containers = [] }) {
  const blank = { name: "", location: "", indoor: true, heated: false, active: true, lighting: "", tempTier: "", houseType: "", notes: "", zones: [], details: {} };

  function buildQuonsetZones(lengthFt = 100) {
    return [
      {
        id: uid(), type: "hanging", name: "Hanging Basket Lines", notes: "",
        items: Array.from({ length: 10 }, (_, i) => ({ id: uid(), label: `Line ${i + 1}`, capacityPerRow: "", heated: false }))
      },
      {
        id: uid(), type: "lowbasket", name: "Low Planter Lines", notes: "",
        items: Array.from({ length: 4 }, (_, i) => ({ id: uid(), label: `Line ${i + 1}`, capacityPerRow: "", heated: false }))
      },
      {
        id: uid(), type: "bench", name: "Wall Shelves", notes: "",
        items: [
          { id: uid(), label: "Wall Shelf — East", benchType: "single", widthFt: 1, lengthFt: lengthFt, heated: false },
          { id: uid(), label: "Wall Shelf — West", benchType: "single", widthFt: 1, lengthFt: lengthFt, heated: false },
        ]
      },
      {
        id: uid(), type: "bench", name: "Wall Benches", notes: "",
        items: [
          { id: uid(), label: "Wall Bench — East", benchType: "single", widthFt: 4, lengthFt: lengthFt, heated: false },
          { id: uid(), label: "Wall Bench — West", benchType: "single", widthFt: 4, lengthFt: lengthFt, heated: false },
        ]
      },
      {
        id: uid(), type: "bench", name: "Center Double Benches", notes: "",
        items: [
          { id: uid(), label: "Center Double — North", benchType: "double", widthFt: 4, lengthFt: lengthFt, heated: false },
          { id: uid(), label: "Center Double — South", benchType: "double", widthFt: 4, lengthFt: lengthFt, heated: false },
        ]
      },
    ];
  }

  function applyHouseType(type) {
    if (type === "quonset" && form.zones.length === 0) {
      setForm(f => ({ ...f, houseType: type, zones: buildQuonsetZones() }));
    } else if (type === "quonset" && form.zones.length > 0) {
      if (window.confirm("Apply standard quonset template? This will replace your current zones.")) {
        setForm(f => ({ ...f, houseType: type, zones: buildQuonsetZones() }));
      }
    } else {
      setForm(f => ({ ...f, houseType: type }));
    }
  }
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [tab, setTab] = useState("zones");
  const [focus, setFocus] = useState(null);
  const addZone = (type) => { const zt = ztc(type); setForm(f => ({ ...f, zones: [...f.zones, { id: uid(), type, name: zt.label, notes: "", items: [] }] })); };
  const updZone = (idx, zone) => setForm(f => ({ ...f, zones: f.zones.map((z, i) => i === idx ? zone : z) }));
  const delZone = (idx) => setForm(f => ({ ...f, zones: f.zones.filter((_, i) => i !== idx) }));
  const moveZone = (idx, dir) => { const zones = [...form.zones]; const s = idx + dir; if (s < 0 || s >= zones.length) return; [zones[idx], zones[s]] = [zones[s], zones[idx]]; setForm(f => ({ ...f, zones })); };
  const totalSqFt = form.zones.filter(z => z.type === "bench").reduce((s, z) => s + (z.items || []).reduce((b, i) => b + (i.widthFt && i.lengthFt ? Number(i.widthFt) * Number(i.lengthFt) : 0), 0), 0);
  const totalBenches = form.zones.filter(z => z.type === "bench").reduce((s, z) => s + (z.items || []).length, 0);
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit House" : "New House"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>
      <div style={{ padding: "22px 24px" }}>
        <SH c="House Details" mt={0} />

        {/* House Type */}
        {!initial && (
          <div style={{ marginBottom: 16 }}>
            <FL c="House Type" hint="Select a type to pre-fill a standard layout" />
            <div style={{ display: "flex", gap: 8 }}>
              {[["quonset","🏚 Quonset","Standard single-span, pre-fills layout"],["gutterconnect","🏗 Gutter Connect","Multi-span, build manually"],["other","🏠 Other","Custom — start blank"]].map(([val, label, hint]) => (
                <button key={val} type="button" onClick={() => applyHouseType(val)}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 8, border: `2px solid ${form.houseType === val ? "#7fb069" : "#c8d8c0"}`, background: form.houseType === val ? "#f0f8eb" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: form.houseType === val ? "#2e5c1e" : "#7a8c74" }}>{label}</div>
                  <div style={{ fontSize: 10, color: "#aabba0", marginTop: 2 }}>{hint}</div>
                </button>
              ))}
            </div>
            {form.houseType === "quonset" && form.zones.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#7a8c74" }}>
                Standard layout applied — adjust basket lines, bench lengths, or any other details below.
              </div>
            )}
          </div>
        )}
        {initial && (
          <div style={{ marginBottom: 14 }}>
            <FL c="House Type" />
            <select style={IS(false)} value={form.houseType || ""} onChange={e => setForm(f => ({ ...f, houseType: e.target.value }))}>
              <option value="">— Select —</option>
              <option value="quonset">🏚 Quonset</option>
              <option value="gutterconnect">🏗 Gutter Connect</option>
              <option value="other">🏠 Other</option>
            </select>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><FL c="House Name *" /><input style={IS(focus === "name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder="e.g. Range 1, Prop House" /></div>
          <div><FL c="Location" /><select style={IS(false)} value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}><option value="">— Any / Unassigned —</option>{LOCATIONS.map(l => <option key={l}>{l}</option>)}</select></div>
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
          <Toggle value={form.indoor} onChange={v => setForm(f => ({ ...f, indoor: v }))} label={form.indoor ? "Indoor" : "Outdoor"} />
          <Toggle value={form.heated} onChange={v => setForm(f => ({ ...f, heated: v }))} label={form.heated ? "Heated" : "Unheated"} />
          <Toggle value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} label={form.active ? "Active" : "Inactive"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><FL c="Lighting Type" /><select style={IS(false)} value={form.lighting || ""} onChange={e => setForm(f => ({ ...f, lighting: e.target.value }))}><option value="">— Select —</option>{LIGHTING_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div>
            <FL c="Temperature Tier" hint="Controls crop compatibility warnings" />
            <div style={{ display: "flex", gap: 6 }}>
              {[["","— Unset —","#7a8c74","#f8faf6"],["cool","❄️ Cool","#1a4a7a","#e8f3fc"],["warm","🌡 Warm","#a04010","#fdf3ea"]].map(([val, label, color, bg]) => (
                <button key={val} type="button" onClick={() => setForm(f => ({ ...f, tempTier: val }))}
                  style={{ flex: 1, padding: "7px 4px", borderRadius: 7, border: `2px solid ${form.tempTier === val ? color : "#c8d8c0"}`, background: form.tempTier === val ? bg : "#fff", color: form.tempTier === val ? color : "#7a8c74", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 22 }}><FL c="Notes" /><textarea style={TA(focus === "notes")} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} /></div>
        <div style={{ display: "flex", borderBottom: "1.5px solid #e0ead8", marginBottom: 20 }}>
          {[["zones", "Zones"], ["details", "House Details"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: `3px solid ${tab === id ? "#7fb069" : "transparent"}`, padding: "10px 20px", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? "#1e2d1a" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>
        {tab === "zones" && (<>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {ZONE_TYPES.map(zt => <button key={zt.id} onClick={() => addZone(zt.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: zt.color + "14", color: zt.color, border: `1.5px solid ${zt.color}55`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{zt.icon} + {zt.label}</button>)}
          </div>
          {form.zones.length === 0 && <div style={{ textAlign: "center", padding: 28, color: "#aabba0", background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #c8d8c0", fontSize: 13, marginBottom: 20 }}>No zones yet</div>}
          {form.zones.map((zone, idx) => <ZoneEditor key={zone.id} zone={zone} cropRuns={cropRuns} containers={containers} onChange={z => updZone(idx, z)} onDelete={() => delZone(idx)} onMoveUp={() => moveZone(idx, -1)} onMoveDown={() => moveZone(idx, 1)} />)}
          {(totalBenches > 0 || totalSqFt > 0) && <div style={{ background: "#f0f8eb", borderRadius: 10, padding: "12px 16px", marginTop: 6, fontSize: 13, color: "#2e5c1e", fontWeight: 600 }}>✓ {totalBenches} bench{totalBenches !== 1 ? "es" : ""} · {totalSqFt.toLocaleString()} sq ft</div>}
        </>)}
        {tab === "details" && <HouseDetailsPanel details={form.details || {}} onChange={det => setForm(f => ({ ...f, details: det }))} />}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {!form.name.trim() && (
            <div style={{ fontSize: 12, color: "#e07b39", marginBottom: 6 }}>⚠️ House name is required before saving.</div>
          )}
          <button onClick={() => { if (!form.name.trim()) return; onSave({ ...form, id: form.id || uid() }); }} style={{ flex: 1, background: form.name.trim() ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: form.name.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>{initial ? "Save Changes" : "Create House"}</button>
          {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── HOUSE CARD ────────────────────────────────────────────────────────────────
function HouseCard({ house, onEdit, onDelete, onDuplicate, onToggleActive }) {
  const [expanded, setExpanded] = useState(false);
  const st = houseStats(house);
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${house.active !== false ? "#e0ead8" : "#ddd"}`, opacity: house.active !== false ? 1 : .75, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>🏠</span>
            <span style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a" }}>{house.name}</span>
            {house.location && <Badge label={house.location} color="#5a7a9a" />}
            {house.active === false && <span style={{ fontSize: 11, color: "#aabba0" }}>(Inactive)</span>}
            <Badge label={house.indoor ? "Indoor" : "Outdoor"} color={house.indoor ? "#4a90d9" : "#7fb069"} />
            <Badge label={house.heated ? "Heated" : "Unheated"} color={house.heated ? "#e07b39" : "#7a8c74"} />
            {house.houseType === "quonset" && <Badge label="🏚 Quonset" color="#7a8c74" />}
            {house.houseType === "gutterconnect" && <Badge label="🏗 Gutter Connect" color="#5a7a9a" />}
            {house.tempTier === "cool" && <Badge label="❄️ Cool Range" color="#4a90d9" />}
            {house.tempTier === "warm" && <Badge label="🌡 Warm Range" color="#e07b39" />}
            {house.lighting && <Badge label={house.lighting} color="#8e44ad" />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {st.benches > 0 && <Pill label={`${st.occupied}/${st.benches} Benches`} value={st.available > 0 ? `${st.available} free` : "Full"} color={st.available > 0 ? "#7fb069" : "#e07b39"} />}
            {st.sqFt > 0 && <Pill label="Bench Sq Ft" value={st.sqFt.toLocaleString()} color="#7fb069" />}
            {st.heated > 0 && <Pill label="🔥 Heated Benches" value={st.heated} color="#c8791a" />}
            {Object.entries(st.capsPerType).map(([t, cap]) => cap > 0 && <Pill key={t} label={ztc(t).icon + " " + (ROW_CFG[t]?.capLabel || "pos.")} value={cap.toLocaleString()} color={ztc(t).color} />)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <ABtn onClick={() => onEdit(house)} label="Edit" color="#4a90d9" />
          <ABtn onClick={() => onDuplicate(house)} label="Duplicate" />
          <ABtn onClick={() => onToggleActive(house.id)} label={house.active !== false ? "Deactivate" : "Activate"} />
          <ABtn onClick={() => onDelete(house.id)} label="Remove" border="#f0d0c0" />
        </div>
      </div>
      {expanded && house.zones.length > 0 && (
        <div style={{ borderTop: "1.5px solid #f0f5ee", padding: "16px 20px", background: "#fafcf8" }}>
          {house.zones.map(zone => {
            const zt = ztc(zone.type); const rc = ROW_CFG[zone.type];
            const zoneSqFt = zone.type === "bench" ? (zone.items || []).reduce((s, b) => s + (b.widthFt && b.lengthFt ? Number(b.widthFt) * Number(b.lengthFt) : 0), 0) : 0;
            const zonePos  = zone.type !== "bench" ? (zone.items || []).reduce((s, r) => s + (Number(r.capacityPerRow) || 0), 0) : 0;
            return (
              <div key={zone.id} style={{ background: "#fff", borderRadius: 10, border: `1px solid ${zt.color}33`, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: (zone.items || []).length > 0 ? 8 : 0, flexWrap: "wrap" }}>
                  <span>{zt.icon}</span><span style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{zone.name}</span>
                  <Badge label={zt.label} color={zt.color} />
                  {zoneSqFt > 0 && <span style={{ fontSize: 11, color: "#7a8c74" }}>{zoneSqFt.toLocaleString()} sf</span>}
                  {zonePos > 0 && <span style={{ fontSize: 11, color: "#7a8c74" }}>{zonePos.toLocaleString()} {rc?.capLabel}</span>}
                </div>
                {(zone.items || []).length > 0 && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {(zone.items || []).map(item => (
                      <div key={item.id} style={{ background: zt.color + "10", border: `1px solid ${zt.color}33`, borderRadius: 6, padding: "4px 9px", fontSize: 11 }}>
                        <span style={{ fontWeight: 700, color: "#1e2d1a" }}>{item.label}</span>
                        {item.widthFt && item.lengthFt && <span style={{ color: "#7a8c74", marginLeft: 4 }}>{item.widthFt}'×{item.lengthFt}'</span>}
                        {item.capacityPerRow && <span style={{ color: "#7a8c74", marginLeft: 4 }}>{item.capacityPerRow} {rc?.capLabel}</span>}
                        {item.heated && <span style={{ color: "#c8791a", marginLeft: 4 }}>🔥</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── BAY EDITOR ────────────────────────────────────────────────────────────────
function BayEditor({ bays, onChange }) {
  const [editIdx, setEditIdx] = useState(null);
  const [focus, setFocus] = useState(null);
  const addBay = () => { const next = [...bays, { id: uid(), number: `Bay ${bays.length + 1}`, lengthFt: "", widthFt: "", linesPerBay: "", tubesPerItem: "", frostCover: false, notes: "" }]; onChange(next); setEditIdx(next.length - 1); };
  const upd = (idx, f, v) => onChange(bays.map((b, i) => i === idx ? { ...b, [f]: v } : b));
  const remove = (idx) => { onChange(bays.filter((_, i) => i !== idx)); if (editIdx === idx) setEditIdx(null); };
  const move = (idx, dir) => { const next = [...bays]; const s = idx + dir; if (s < 0 || s >= next.length) return; [next[idx], next[s]] = [next[s], next[idx]]; onChange(next); setEditIdx(s); };
  const totalSqFt = bays.reduce((s, b) => s + (b.lengthFt && b.widthFt ? Number(b.lengthFt) * Number(b.widthFt) : 0), 0);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>{bays.length} bay{bays.length !== 1 ? "s" : ""}{totalSqFt > 0 && <span style={{ marginLeft: 8, color: "#c8791a", fontWeight: 700 }}>· {totalSqFt.toLocaleString()} sq ft</span>}</div>
        <button onClick={addBay} style={{ background: "#c8791a", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add Bay</button>
      </div>
      {bays.length === 0 && <div style={{ textAlign: "center", padding: 20, color: "#aabba0", background: "#fef8f0", borderRadius: 10, border: "1.5px dashed #e8c080", fontSize: 13 }}>No bays yet</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bays.map((bay, idx) => (
          <div key={bay.id} style={{ background: "#fff", borderRadius: 10, border: `1.5px solid ${editIdx === idx ? "#c8791a" : "#e0d4c0"}`, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer" }} onClick={() => setEditIdx(editIdx === idx ? null : idx)}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: "#fef0d8", border: "1.5px solid #e8c080", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#c8791a", flexShrink: 0 }}>{idx + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{bay.number}</div>
                <div style={{ fontSize: 11, color: "#aabba0" }}>
                  {bay.widthFt ? `${bay.widthFt}'` : ""}{bay.lengthFt ? ` × ${bay.lengthFt}'` : ""}
                  {bay.widthFt && bay.lengthFt ? ` · ${(Number(bay.widthFt) * Number(bay.lengthFt)).toLocaleString()} sf` : ""}
                  {bay.linesPerBay ? ` · ${bay.linesPerBay} lines` : ""}
                  {bay.frostCover ? <span style={{ color: "#4a90d9", marginLeft: 6 }}>❄ Frost cover</span> : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 3 }}><IBtn onClick={e => { e.stopPropagation(); move(idx, -1); }}>↑</IBtn><IBtn onClick={e => { e.stopPropagation(); move(idx, 1); }}>↓</IBtn><IBtn danger onClick={e => { e.stopPropagation(); remove(idx); }}>×</IBtn></div>
              <span style={{ color: "#aabba0", fontSize: 14, transform: editIdx === idx ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
            </div>
            {editIdx === idx && (
              <div style={{ borderTop: "1px solid #f5ede0", padding: 12, background: "#fef8f0" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div style={{ gridColumn: "span 2" }}><FL c="Bay Number / Label" /><input style={IS(focus === `bn-${idx}`)} value={bay.number || ""} onChange={e => upd(idx, "number", e.target.value)} onFocus={() => setFocus(`bn-${idx}`)} onBlur={() => setFocus(null)} /></div>
                  <div><FL c="Width (ft)" /><input type="number" style={IS(focus === `bw-${idx}`)} value={bay.widthFt || ""} onChange={e => upd(idx, "widthFt", e.target.value)} onFocus={() => setFocus(`bw-${idx}`)} onBlur={() => setFocus(null)} placeholder="e.g. 20" /></div>
                  <div><FL c="Length (ft)" /><input type="number" style={IS(focus === `bl-${idx}`)} value={bay.lengthFt || ""} onChange={e => upd(idx, "lengthFt", e.target.value)} onFocus={() => setFocus(`bl-${idx}`)} onBlur={() => setFocus(null)} placeholder="e.g. 100" /></div>
                  {bay.widthFt && bay.lengthFt && <div style={{ gridColumn: "span 2", background: "#f0f8eb", borderRadius: 7, padding: "7px 11px", fontSize: 12, color: "#2e5c1e", fontWeight: 600 }}>✓ {(Number(bay.widthFt) * Number(bay.lengthFt)).toLocaleString()} sq ft</div>}
                  <div><FL c="Drip Lines per Bay" /><input type="number" style={IS(focus === `bdl-${idx}`)} value={bay.linesPerBay || ""} onChange={e => upd(idx, "linesPerBay", e.target.value)} onFocus={() => setFocus(`bdl-${idx}`)} onBlur={() => setFocus(null)} /></div>
                  <div><FL c="Tubes per Item" /><input type="number" style={IS(focus === `btpi-${idx}`)} value={bay.tubesPerItem || ""} onChange={e => upd(idx, "tubesPerItem", e.target.value)} onFocus={() => setFocus(`btpi-${idx}`)} onBlur={() => setFocus(null)} /></div>
                </div>
                <div style={{ marginBottom: 10 }}><Toggle value={!!bay.frostCover} onChange={v => upd(idx, "frostCover", v)} label={bay.frostCover ? "Frost cover installed" : "No frost cover"} /></div>
                <FL c="Notes" /><input style={IS(focus === `bnotes-${idx}`)} value={bay.notes || ""} onChange={e => upd(idx, "notes", e.target.value)} onFocus={() => setFocus(`bnotes-${idx}`)} onBlur={() => setFocus(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PAD FORM ──────────────────────────────────────────────────────────────────
function PadForm({ initial, onSave, onCancel }) {
  const SURFACES = ["Gravel", "Crushed limestone", "Concrete", "Asphalt", "Bare ground", "Weed fabric over gravel", "Other"];
  const blank = { name: "", location: "", lengthFt: "", widthFt: "", surfaceMaterial: "", notes: "", active: true, bays: [] };
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [focus, setFocus] = useState(null);
  const padSqFt = form.lengthFt && form.widthFt ? Number(form.lengthFt) * Number(form.widthFt) : 0;
  const totalBaySqFt = form.bays.reduce((s, b) => s + (b.lengthFt && b.widthFt ? Number(b.lengthFt) * Number(b.widthFt) : 0), 0);
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0d4c0", overflow: "hidden" }}>
      <div style={{ background: "#3a2a10", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 17, color: "#f5dfa0" }}>{initial ? "Edit Outdoor Pad" : "New Outdoor Pad"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#c8a060", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>
      <div style={{ padding: "22px 24px" }}>
        <SH c="Pad Details" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><FL c="Pad Name *" /><input style={IS(focus === "name")} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder="e.g. North Pad, Main Lot" /></div>
          <div><FL c="Location" /><select style={IS(false)} value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}><option value="">— Any / Unassigned —</option>{LOCATIONS.map(l => <option key={l}>{l}</option>)}</select></div>
        </div>
        <div style={{ display: "flex", gap: 24, marginBottom: 16 }}><Toggle value={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} label={form.active ? "Active" : "Inactive"} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><FL c="Width (ft)" /><input type="number" style={IS(focus === "pW")} value={form.widthFt || ""} onChange={e => setForm(f => ({ ...f, widthFt: e.target.value }))} onFocus={() => setFocus("pW")} onBlur={() => setFocus(null)} /></div>
          <div><FL c="Length (ft)" /><input type="number" style={IS(focus === "pL")} value={form.lengthFt || ""} onChange={e => setForm(f => ({ ...f, lengthFt: e.target.value }))} onFocus={() => setFocus("pL")} onBlur={() => setFocus(null)} /></div>
          {padSqFt > 0 && <div style={{ display: "flex", alignItems: "flex-end" }}><div style={{ background: "#f0f8eb", borderRadius: 8, padding: "9px 12px", fontSize: 12, color: "#2e5c1e", fontWeight: 700, width: "100%" }}>✓ {padSqFt.toLocaleString()} sq ft</div></div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><FL c="Surface Material" /><select style={IS(false)} value={form.surfaceMaterial || ""} onChange={e => setForm(f => ({ ...f, surfaceMaterial: e.target.value }))}><option value="">— Select —</option>{SURFACES.map(s => <option key={s}>{s}</option>)}</select></div>
        </div>
        <div style={{ marginBottom: 24 }}><FL c="Notes" /><textarea style={TA(focus === "notes")} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} /></div>
        <SH c="Bays" />
        <BayEditor bays={form.bays} onChange={bays => setForm(f => ({ ...f, bays }))} />
        {totalBaySqFt > 0 && <div style={{ background: "#fef0d8", borderRadius: 10, padding: "12px 16px", marginTop: 12, fontSize: 13, color: "#8a4a10", fontWeight: 600 }}>✓ {form.bays.length} bays · {totalBaySqFt.toLocaleString()} sq ft across bays</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={() => form.name.trim() && onSave({ ...form, id: form.id || uid() })} style={{ flex: 1, background: "#c8791a", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>{initial ? "Save Changes" : "Create Pad"}</button>
          {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── PAD CARD ──────────────────────────────────────────────────────────────────
function PadCard({ pad, onEdit, onDelete, onDuplicate, onToggleActive }) {
  const [expanded, setExpanded] = useState(false);
  const st = padStats(pad);
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${pad.active !== false ? "#e0d4c0" : "#ddd"}`, opacity: pad.active !== false ? 1 : .75, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20 }}>🌤</span>
            <span style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a" }}>{pad.name}</span>
            {pad.location && <Badge label={pad.location} color="#5a7a9a" />}
            {pad.active === false && <span style={{ fontSize: 11, color: "#aabba0" }}>(Inactive)</span>}
            <Badge label="Outdoor" color="#c8791a" />
            {pad.surfaceMaterial && <Badge label={pad.surfaceMaterial} color="#7a8c74" />}
            {st.frost > 0 && <Badge label={`❄ ${st.frost} frost bay${st.frost !== 1 ? "s" : ""}`} color="#4a90d9" />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {st.sqFt > 0 && <Pill label="Pad Sq Ft" value={st.sqFt.toLocaleString()} color="#c8791a" />}
            {st.bays > 0 && <Pill label="Bays" value={st.bays} color="#c8791a" />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <ABtn onClick={() => onEdit(pad)} label="Edit" color="#c8791a" />
          <ABtn onClick={() => onDuplicate(pad)} label="Duplicate" />
          <ABtn onClick={() => onToggleActive(pad.id)} label={pad.active !== false ? "Deactivate" : "Activate"} />
          <ABtn onClick={() => onDelete(pad.id)} label="Remove" border="#f0d0c0" />
        </div>
      </div>
      {expanded && pad.bays.length > 0 && (
        <div style={{ borderTop: "1.5px solid #f5ede0", padding: "16px 20px", background: "#fef8f0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 8 }}>
            {pad.bays.map(bay => (
              <div key={bay.id} style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e0d4c0", padding: "10px 12px" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", marginBottom: 3 }}>{bay.number}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{bay.widthFt && bay.lengthFt ? `${bay.widthFt}'×${bay.lengthFt}' · ${(Number(bay.widthFt) * Number(bay.lengthFt)).toLocaleString()} sf` : ""}</div>
                {bay.linesPerBay && <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>{bay.linesPerBay} drip lines{bay.tubesPerItem ? ` · ${bay.tubesPerItem} tubes/item` : ""}</div>}
                {bay.frostCover && <div style={{ fontSize: 10, color: "#4a90d9", marginTop: 3, fontWeight: 600 }}>❄ Frost cover</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── OVERVIEW DASHBOARD ────────────────────────────────────────────────────────
function Overview({ houses, pads, locFilter }) {
  const [selected, setSelected] = useState(null); // { type: "house"|"pad", id }

  const filtH = houses.filter(h => h.active !== false && (!locFilter || h.location === locFilter));
  const filtP = pads.filter(p => p.active !== false && (!locFilter || p.location === locFilter));

  const selectedHouse = selected?.type === "house" ? houses.find(h => h.id === selected.id) : null;
  const selectedPad   = selected?.type === "pad"   ? pads.find(p => p.id === selected.id)   : null;

  // Aggregate totals
  const totBenches   = filtH.flatMap(h => h.zones.filter(z => z.type === "bench").flatMap(z => z.items || []));
  const totOccupied  = totBenches.filter(b => b.cropId).length;
  const totSqFt      = totBenches.reduce((s, b) => s + (b.widthFt && b.lengthFt ? Number(b.widthFt) * Number(b.lengthFt) : 0), 0);
  const totPadSqFt   = filtP.reduce((s, p) => s + (p.lengthFt && p.widthFt ? Number(p.lengthFt) * Number(p.widthFt) : 0), 0);

  return (
    <div>
      {/* Top summary bar */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 24px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 14 }}>
          {locFilter ? locFilter : "All Locations"} — Space Overview
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Pill label="🏠 Houses" value={filtH.length} color="#1e2d1a" />
          <Pill label="Benches" value={`${totOccupied}/${totBenches.length}`} color="#7fb069" />
          <Pill label="Available" value={totBenches.length - totOccupied} color={totBenches.length - totOccupied > 0 ? "#7fb069" : "#e07b39"} />
          {totSqFt > 0 && <Pill label="Indoor Sq Ft" value={totSqFt.toLocaleString()} color="#7fb069" />}
          <Pill label="🌤 Pads" value={filtP.length} color="#c8791a" />
          {totPadSqFt > 0 && <Pill label="Outdoor Sq Ft" value={totPadSqFt.toLocaleString()} color="#c8791a" />}
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Left: structure blocks */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {filtH.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Greenhouses</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {filtH.map(house => {
                  const st = houseStats(house);
                  const pct = st.benches > 0 ? Math.round((st.occupied / st.benches) * 100) : 0;
                  const isSelected = selected?.id === house.id;
                  const hasIssue = !!(house.details?.activeIssues?.trim());
                  return (
                    <div key={house.id} onClick={() => setSelected(isSelected ? null : { type: "house", id: house.id })}
                      style={{ background: isSelected ? (hasIssue ? "#fffbf0" : "#f0f8eb") : (hasIssue ? "#fffdf7" : "#fff"), borderRadius: 12, border: `2px solid ${isSelected ? (hasIssue ? "#f0a030" : "#7fb069") : (hasIssue ? "#f0c870" : "#e0ead8")}`, padding: "14px 16px", cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hasIssue ? 8 : 10 }}>
                        <span style={{ fontSize: 16 }}>🏠</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{house.name}</span>
                            {hasIssue && <span title={house.details.activeIssues} style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#7a8c74" }}>
                            {house.heated ? "🔥 Heated" : "Unheated"} · {house.indoor ? "Indoor" : "Outdoor"}
                            {st.heated > 0 && <span style={{ color: "#c8791a", marginLeft: 4 }}>· {st.heated} hot bench{st.heated !== 1 ? "es" : ""}</span>}
                          </div>
                        </div>
                      </div>
                      {hasIssue && <div style={{ background: "#fff3cc", border: "1px solid #f0c060", borderRadius: 7, padding: "6px 10px", fontSize: 11, color: "#7a5010", marginBottom: 8, fontWeight: 500, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{house.details.activeIssues}</div>}
                      {st.benches > 0 && (<>
                        <FillBar pct={pct} label={`${st.occupied}/${st.benches} benches occupied`} sublabel={`${st.available} free`} />
                        {st.sqFt > 0 && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>{st.sqFt.toLocaleString()} sq ft bench space</div>}
                      </>)}
                      {st.benches === 0 && <div style={{ fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>No benches configured</div>}
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {[...new Set(house.zones.map(z => z.type))].map(t => <span key={t} style={{ fontSize: 12 }}>{ztc(t).icon}</span>)}
                        {house.lighting && <Badge label={house.lighting} color="#8e44ad" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filtP.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Outdoor Pads</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {filtP.map(pad => {
                  const st = padStats(pad);
                  const isSelected = selected?.id === pad.id;
                  const frostPct = st.bays > 0 ? Math.round((st.frost / st.bays) * 100) : 0;
                  return (
                    <div key={pad.id} onClick={() => setSelected(isSelected ? null : { type: "pad", id: pad.id })}
                      style={{ background: isSelected ? "#fef8f0" : "#fff", borderRadius: 12, border: `2px solid ${isSelected ? "#c8791a" : "#e0d4c0"}`, padding: "14px 16px", cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>🌤</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pad.name}</div>
                          <div style={{ fontSize: 11, color: "#7a8c74" }}>{pad.surfaceMaterial || "Outdoor"} · {st.bays} bay{st.bays !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      {st.sqFt > 0 && <div style={{ fontSize: 12, color: "#8a4a10", fontWeight: 600, marginBottom: 6 }}>{st.sqFt.toLocaleString()} sq ft</div>}
                      {st.frost > 0 && <FillBar pct={frostPct} color="#4a90d9" label={`${st.frost}/${st.bays} bays with frost cover`} />}
                      {st.frost === 0 && st.bays > 0 && <div style={{ fontSize: 11, color: "#aabba0" }}>No frost cover</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filtH.length === 0 && filtP.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#aabba0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 14, color: "#7a8c74" }}>No active structures{locFilter ? ` at ${locFilter}` : ""}</div>
            </div>
          )}
        </div>

        {/* Right: conditions sidebar */}
        {(selectedHouse || selectedPad) && (
          <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", position: "sticky", top: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{selectedHouse ? selectedHouse.name : selectedPad.name}</div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{selectedHouse ? "Greenhouse" : "Outdoor Pad"}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>

            {selectedHouse && (() => {
              const h = selectedHouse; const st = houseStats(h); const d = h.details || {};
              return (
                <div>
                  {d.activeIssues?.trim() && (
                    <div style={{ background: "#fff3cc", border: "1.5px solid #f0b030", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#a06010", textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>⚠️ Active Issues</div>
                      <div style={{ fontSize: 12, color: "#7a4a10", lineHeight: 1.5 }}>{d.activeIssues}</div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Conditions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {[
                      ["🌡 House heat",    h.heated ? "Heated" : "Unheated",        h.heated ? "#e07b39" : "#7a8c74"],
                      ["💡 Lighting",      h.lighting || "Not specified",            "#8e44ad"],
                      ["🔥 Heated benches",st.heated > 0 ? `${st.heated} bench${st.heated !== 1 ? "es" : ""}` : "None", "#c8791a"],
                      ["🏗 Floor",         (d.floorType) || "Not recorded",          "#7a8c74"],
                      ["🌿 Plastic age",   d.plasticAge ? `${d.plasticAge} yr${d.plasticAge !== "1" ? "s" : ""}` : "Not recorded", "#4a7a35"],
                      ["🔧 Heater",        (d.heating || {}).heaterType || "Not recorded", "#7a8c74"],
                      ["💧 Irrigation",    (d.irrigation || {}).controller || "Not recorded", "#4a90d9"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 0", borderBottom: "1px solid #f0f5ee" }}>
                        <span style={{ color: "#7a8c74" }}>{label}</span>
                        <span style={{ fontWeight: 600, color, textAlign: "right" }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  {st.benches > 0 && (<>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginTop: 16, marginBottom: 10 }}>Availability</div>
                    <FillBar pct={Math.round((st.occupied / st.benches) * 100)} label={`${st.occupied} occupied · ${st.available} free`} />
                    <div style={{ marginTop: 12 }}>
                      {h.zones.filter(z => z.type === "bench").map(zone => {
                        const avail = (zone.items || []).filter(b => !b.cropId).length;
                        return (
                          <div key={zone.id} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>{zone.name}</div>
                            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                              {(zone.items || []).map(bench => (
                                <div key={bench.id} title={bench.label + (bench.heated ? " (heated)" : "") + (bench.cropId ? " — occupied" : " — available")}
                                  style={{ width: 22, height: 22, borderRadius: 4, background: bench.cropId ? "#e07b39" : bench.heated ? "#fff0d0" : "#c8ecc0", border: `1.5px solid ${bench.cropId ? "#c05a20" : bench.heated ? "#e0a040" : "#7fb069"}`, cursor: "default" }}>
                                  {bench.heated && !bench.cropId && <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>🔥</div>}
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 4 }}>{avail} of {(zone.items || []).length} available</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {[["#c8ecc0","#7fb069","Available"],["#fff0d0","#e0a040","Heated / avail."],["#e07b39","#c05a20","Occupied"]].map(([bg, border, label]) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#7a8c74" }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: bg, border: `1.5px solid ${border}` }} />{label}
                        </div>
                      ))}
                    </div>
                  </>)}
                </div>
              );
            })()}

            {selectedPad && (() => {
              const p = selectedPad; const st = padStats(p);
              return (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Conditions</div>
                  {[
                    ["🌤 Type",       "Outdoor"],
                    ["🪨 Surface",    p.surfaceMaterial || "Not recorded"],
                    ["📐 Pad size",   p.lengthFt && p.widthFt ? `${p.widthFt}' × ${p.lengthFt}' (${(Number(p.widthFt) * Number(p.lengthFt)).toLocaleString()} sf)` : "Not recorded"],
                    ["📦 Bays",       st.bays.toString()],
                    ["❄ Frost bays",  `${st.frost} of ${st.bays}`],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "6px 0", borderBottom: "1px solid #f5ede0" }}>
                      <span style={{ color: "#7a8c74" }}>{label}</span>
                      <span style={{ fontWeight: 600, color: "#1e2d1a", textAlign: "right" }}>{val}</span>
                    </div>
                  ))}
                  {st.bays > 0 && (<>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .8, marginTop: 16, marginBottom: 10 }}>Bays</div>
                    {p.bays.map(bay => (
                      <div key={bay.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f5ede0" }}>
                        <span style={{ fontWeight: 600, color: "#1e2d1a" }}>{bay.number}</span>
                        <span style={{ color: bay.frostCover ? "#4a90d9" : "#aabba0" }}>{bay.frostCover ? "❄ Frost cover" : "No cover"}</span>
                      </div>
                    ))}
                  </>)}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TASKS PAGE ────────────────────────────────────────────────────────────────
const TASK_CATEGORIES = [
  { id: "maintenance", label: "Maintenance",  icon: "🔧", color: "#e07b39" },
  { id: "production",  label: "Production",   icon: "🌱", color: "#7fb069" },
  { id: "growing",     label: "Growing",      icon: "🪴", color: "#8e44ad" },
];
const PRIORITIES = [
  { id: "high",   label: "High",   color: "#d94f3d" },
  { id: "medium", label: "Medium", color: "#c8791a" },
  { id: "low",    label: "Low",    color: "#7a8c74" },
];
const ptc  = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];
const catc = (id) => TASK_CATEGORIES.find(c => c.id === id) || TASK_CATEGORIES[0];

function TasksPage({ tasks, onAddTask, onCompleteTask, onUncompleteTask, onRemoveTask, houses, pads }) {
  const [focus, setFocus] = useState(null);
  const [catFilter, setCatFilter] = useState("all");
  const [priFilter, setPriFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);

  // New task form state
  const [form, setForm] = useState({ text: "", category: "maintenance", priority: "medium", source: "", sourceId: "" });

  // Derive auto-tasks from house issues and pad issues
  const autoTasks = [
    ...houses.filter(h => h.details?.activeIssues?.trim()).map(h => ({
      id: "auto-house-" + h.id, auto: true, text: h.details.activeIssues, category: "maintenance",
      priority: "high", source: h.name, sourceType: "house", sourceId: h.id, completedAt: null,
    })),
    ...pads.filter(p => p.notes?.trim()).map(p => ({
      id: "auto-pad-" + p.id, auto: true, text: p.notes, category: "maintenance",
      priority: "medium", source: p.name, sourceType: "pad", sourceId: p.id, completedAt: null,
    })),
  ];

  const allTasks = [
    ...autoTasks.filter(at => !tasks.some(t => t.autoRef === at.id && t.completedAt)),
    ...tasks,
  ];

  const open      = allTasks.filter(t => !t.completedAt)
    .filter(t => catFilter === "all" || t.category === catFilter)
    .filter(t => priFilter === "all" || t.priority === priFilter)
    .sort((a, b) => {
      const po = ["high","medium","low"];
      return po.indexOf(a.priority) - po.indexOf(b.priority);
    });

  const completed = allTasks.filter(t => t.completedAt)
    .filter(t => catFilter === "all" || t.category === catFilter)
    .filter(t => priFilter === "all" || t.priority === priFilter)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  function addTask() {
    if (!form.text.trim()) return;
    onAddTask({ id: uid(), ...form, text: form.text.trim(), completedAt: null, createdAt: new Date().toISOString() });
    setForm(f => ({ ...f, text: "", source: "" }));
  }

  function completeTask(task) {
    if (task.auto) {
      onAddTask({ id: uid(), autoRef: task.id, text: task.text, category: task.category, priority: task.priority, source: task.source, completedAt: new Date().toISOString() });
    } else {
      onCompleteTask(task.id);
    }
  }

  function uncompleteTask(task) {
    if (task.autoRef) {
      onRemoveTask(task.id);
    } else {
      onUncompleteTask(task.id);
    }
  }

  function removeTask(id) { onRemoveTask(id); }

  const sourceOptions = [
    { value: "", label: "— No source —" },
    ...houses.map(h => ({ value: "house:" + h.id, label: "🏠 " + h.name })),
    ...pads.map(p => ({ value: "pad:" + p.id, label: "🌤 " + p.name })),
  ];

  const priCounts = {};
  PRIORITIES.forEach(p => { priCounts[p.id] = open.filter(t => t.priority === p.id).length; });

  return (
    <div>
      {/* Summary bar */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 24px", marginBottom: 24 }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 14 }}>Task Board</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Pill label="Open" value={allTasks.filter(t => !t.completedAt).length} color="#1e2d1a" />
          {PRIORITIES.map(p => <Pill key={p.id} label={p.label} value={allTasks.filter(t => !t.completedAt && t.priority === p.id).length} color={p.color} />)}
          {TASK_CATEGORIES.map(c => <Pill key={c.id} label={c.icon + " " + c.label} value={allTasks.filter(t => !t.completedAt && t.category === c.id).length} color={c.color} />)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        {/* Left: task list */}
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all","All cats."], ...TASK_CATEGORIES.map(c => [c.id, c.icon + " " + c.label])].map(([id, label]) => (
                <button key={id} onClick={() => setCatFilter(id)} style={{ background: catFilter === id ? "#1e2d1a" : "#fff", color: catFilter === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${catFilter === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all","All priority"], ...PRIORITIES.map(p => [p.id, p.label])].map(([id, label]) => (
                <button key={id} onClick={() => setPriFilter(id)} style={{ background: priFilter === id ? ptc(id === "all" ? "medium" : id).color : "#fff", color: priFilter === id ? "#fff" : "#7a8c74", border: `1.5px solid ${priFilter === id ? ptc(id === "all" ? "medium" : id).color : "#c8d8c0"}`, borderRadius: 20, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Open tasks */}
          {open.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#aabba0", background: "#fff", borderRadius: 12, border: "1.5px dashed #c8d8c0", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7a8c74" }}>All clear{catFilter !== "all" || priFilter !== "all" ? " (for this filter)" : ""}</div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
            {open.map(task => {
              const cat = catc(task.category); const pri = ptc(task.priority);
              return (
                <div key={task.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${pri.color}33`, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <button onClick={() => completeTask(task)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${pri.color}`, background: "none", cursor: "pointer", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" }} title="Mark complete" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ background: cat.color + "18", color: cat.color, border: `1px solid ${cat.color}44`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: .4 }}>{cat.icon} {cat.label}</span>
                      <span style={{ background: pri.color + "18", color: pri.color, border: `1px solid ${pri.color}44`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: .4 }}>{pri.label}</span>
                      {task.auto && <span style={{ background: "#fff3cc", color: "#a06010", border: "1px solid #f0c060", borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>⚠️ From issues</span>}
                      {task.source && !task.auto && <span style={{ fontSize: 11, color: "#7a8c74" }}>{task.source}</span>}
                    </div>
                    <div style={{ fontSize: 14, color: "#1e2d1a", fontWeight: 500, lineHeight: 1.45 }}>{task.text}</div>
                    {task.source && task.auto && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>Source: {task.source}</div>}
                  </div>
                  {!task.auto && <IBtn danger onClick={() => removeTask(task.id)}>×</IBtn>}
                </div>
              );
            })}
          </div>

          {/* Completed section */}
          {completed.length > 0 && (
            <div>
              <button onClick={() => setShowCompleted(s => !s)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#7a8c74", marginBottom: 10, padding: 0 }}>
                <span style={{ transform: showCompleted ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block" }}>▶</span>
                Completed ({completed.length})
              </button>
              {showCompleted && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {completed.map(task => {
                    const cat = catc(task.category);
                    return (
                      <div key={task.id} style={{ background: "#f8f8f8", borderRadius: 10, border: "1px solid #e8e8e8", padding: "11px 14px", display: "flex", gap: 10, alignItems: "flex-start", opacity: .75 }}>
                        <button onClick={() => uncompleteTask(task)} style={{ width: 22, height: 22, borderRadius: 6, border: "2px solid #aabba0", background: "#c8e6b8", cursor: "pointer", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#2e5c1e", fontWeight: 700 }}>✓</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ background: cat.color + "14", color: cat.color, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{cat.icon} {cat.label}</span>
                            {task.source && <span style={{ fontSize: 11, color: "#aabba0" }}>{task.source}</span>}
                            {task.completedAt && <span style={{ fontSize: 10, color: "#aabba0" }}>✓ {new Date(task.completedAt).toLocaleDateString()}</span>}
                          </div>
                          <div style={{ fontSize: 13, color: "#7a8c74", textDecoration: "line-through", lineHeight: 1.4 }}>{task.text}</div>
                        </div>
                        <IBtn danger onClick={() => removeTask(task.id)}>×</IBtn>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: add task form */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "20px 20px", position: "sticky", top: 20 }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 15, color: "#1e2d1a", marginBottom: 16 }}>Add Task</div>

          <div style={{ marginBottom: 12 }}>
            <FL c="Category" />
            <div style={{ display: "flex", gap: 5 }}>
              {TASK_CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setForm(f => ({ ...f, category: c.id }))} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1.5px solid ${form.category === c.id ? c.color : "#c8d8c0"}`, background: form.category === c.id ? c.color + "18" : "#fff", color: form.category === c.id ? c.color : "#7a8c74", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>{c.icon}<br /><span style={{ fontSize: 10 }}>{c.label}</span></button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <FL c="Priority" />
            <div style={{ display: "flex", gap: 5 }}>
              {PRIORITIES.map(p => (
                <button key={p.id} onClick={() => setForm(f => ({ ...f, priority: p.id }))} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1.5px solid ${form.priority === p.id ? p.color : "#c8d8c0"}`, background: form.priority === p.id ? p.color + "18" : "#fff", color: form.priority === p.id ? p.color : "#7a8c74", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{p.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <FL c="Task Description *" />
            <textarea style={{ ...TA(focus === "taskText"), minHeight: 70 }} value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} onFocus={() => setFocus("taskText")} onBlur={() => setFocus(null)} placeholder="Describe the task..." />
          </div>

          <div style={{ marginBottom: 16 }}>
            <FL c="Source (house / pad / area)" />
            <select style={IS(false)} value={form.source ? (form.sourceType + ":" + form.sourceId) : ""} onChange={e => {
              const [type, id] = e.target.value.split(":");
              const name = type === "house" ? houses.find(h => h.id === id)?.name : pads.find(p => p.id === id)?.name;
              setForm(f => ({ ...f, source: name || "", sourceType: type || "", sourceId: id || "" }));
            }}>
              {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <button onClick={addTask} style={{ width: "100%", background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add Task</button>

          {autoTasks.length > 0 && (
            <div style={{ marginTop: 16, padding: "12px 14px", background: "#fff8f0", borderRadius: 10, border: "1px solid #f0c080" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#a06010", letterSpacing: .6, textTransform: "uppercase", marginBottom: 6 }}>⚠️ {autoTasks.length} active issue{autoTasks.length !== 1 ? "s" : ""} auto-listed</div>
              <div style={{ fontSize: 11, color: "#7a5010", lineHeight: 1.5 }}>House issues from the House Details tab appear automatically. Clear them there once resolved.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { rows: houses, upsert: upsertHouse, remove: removeHouseDb } = useHouses();
  const { rows: pads,   upsert: upsertPad,   remove: removePadDb   } = usePads();
  const { rows: tasks,  upsert: upsertTask,  remove: removeTaskDb  } = useManualTasks();
  const { rows: cropRuns } = useCropRuns();
  const { rows: containers } = useContainers();

  const [section,   setSection  ] = useState("overview");
  const [view,      setView     ] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [filter,    setFilter   ] = useState("all");
  const [locFilter, setLocFilter] = useState("");

  async function saveHouse(h) { await upsertHouse(h); setView("list"); setEditingId(null); }
  async function deleteHouse(id) { if (window.confirm("Remove this house?")) await removeHouseDb(id); }
  async function dupHouse(h) { const { id, ...rest } = reIdHouse(dc(h)); await upsertHouse({ ...rest }); }
  async function toggleHouseActive(id) { const h = houses.find(i => i.id === id); if (h) await upsertHouse({ ...h, active: h.active === false }); }

  async function savePad(p) { await upsertPad(p); setView("list"); setEditingId(null); }
  async function deletePad(id) { if (window.confirm("Remove this pad?")) await removePadDb(id); }
  async function dupPad(p) { const { id, ...rest } = reIdPad(dc(p)); await upsertPad({ ...rest }); }
  async function togglePadActive(id) { const p = pads.find(i => i.id === id); if (p) await upsertPad({ ...p, active: p.active === false }); }

  function switchSection(s) { setSection(s); setView("list"); setEditingId(null); setFilter("all"); }

  async function addTask(task)         { await upsertTask(task); }
  async function completeTask(id)      { await upsertTask({ id, completedAt: new Date().toISOString() }); }
  async function uncompleteTask(id)    { await upsertTask({ id, completedAt: null }); }
  async function deleteTask(id)        { await removeTaskDb(id); }

  const filteredHouses = houses.filter(h => {
    if (locFilter && h.location !== locFilter) return false;
    if (filter === "indoor") return h.indoor; if (filter === "outdoor") return !h.indoor;
    if (filter === "active") return h.active !== false; if (filter === "inactive") return h.active === false;
    return true;
  });
  const filteredPads = pads.filter(p => {
    if (locFilter && p.location !== locFilter) return false;
    if (filter === "active") return p.active !== false; if (filter === "inactive") return p.active === false;
    return true;
  });

  // derive open task count for tab badge
  const autoTaskCount = houses.filter(h => h.details?.activeIssues?.trim()).length + pads.filter(p => p.notes?.trim()).length;
  const openTaskCount = tasks.filter(t => !t.completedAt).length + autoTaskCount;
  const SECTIONS = [["overview","📊 Overview"],["houses","🏠 Greenhouses"],["outdoor","🌤 Outdoor Pads"],["tasks", openTaskCount > 0 ? `✅ Tasks (${openTaskCount})` : "✅ Tasks"]];

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain" }} />
          <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Space Management</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Location filter */}
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ background: "#2a3d22", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontFamily: "inherit", cursor: "pointer" }}>
            <option value="">All Locations</option>
            {LOCATIONS.map(l => <option key={l}>{l}</option>)}
          </select>
          {view === "list" && section !== "overview" && section !== "tasks"
            ? <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: section === "houses" ? "#7fb069" : "#c8791a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{section === "houses" ? "+ Add House" : "+ Add Pad"}</button>
            : view !== "list" ? <button onClick={() => { setView("list"); setEditingId(null); }} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
            : null}
        </div>
      </div>

      {/* Section tabs */}
      {view === "list" && (
        <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", display: "flex", gap: 0, padding: "0 32px" }}>
          {SECTIONS.map(([id, label]) => (
            <button key={id} onClick={() => switchSection(id)} style={{ background: "none", border: "none", borderBottom: `3px solid ${section === id ? "#7fb069" : "transparent"}`, padding: "14px 20px", fontSize: 14, fontWeight: section === id ? 800 : 500, color: section === id ? "#1e2d1a" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px" }}>

        {/* ── OVERVIEW ── */}
        {section === "overview" && view === "list" && <Overview houses={houses} pads={pads} locFilter={locFilter} />}

        {/* ── HOUSES ── */}
        {section === "houses" && view === "list" && (<>
          {houses.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {[["all","All"],["indoor","Indoor"],["outdoor","Outdoor"],["active","Active"],["inactive","Inactive"]].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ background: filter === id ? "#1e2d1a" : "#fff", color: filter === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${filter === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
          )}
          {filteredHouses.length === 0 && <div style={{ textAlign: "center", padding: "80px 0", color: "#aabba0" }}><div style={{ fontSize: 52, marginBottom: 14 }}>🏠</div><div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No houses yet</div><button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>+ Add First House</button></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{filteredHouses.map(h => <HouseCard key={h.id} house={h} onEdit={x => { setEditingId(x.id); setView("edit"); }} onDelete={deleteHouse} onDuplicate={dupHouse} onToggleActive={toggleHouseActive} />)}</div>
        </>)}
        {section === "houses" && view === "add" && <HouseForm onSave={saveHouse} onCancel={() => setView("list")} cropRuns={cropRuns} containers={containers} />}
        {section === "houses" && view === "edit" && editingId && <HouseForm initial={houses.find(h => h.id === editingId)} onSave={saveHouse} onCancel={() => { setView("list"); setEditingId(null); }} cropRuns={cropRuns} containers={containers} />}

        {/* ── OUTDOOR ── */}
        {section === "outdoor" && view === "list" && (<>
          {pads.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
              {[["all","All Pads"],["active","Active"],["inactive","Inactive"]].map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} style={{ background: filter === id ? "#3a2a10" : "#fff", color: filter === id ? "#f5dfa0" : "#7a8c74", border: `1.5px solid ${filter === id ? "#3a2a10" : "#e0d4c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
              ))}
            </div>
          )}
          {filteredPads.length === 0 && <div style={{ textAlign: "center", padding: "80px 0", color: "#aabba0" }}><div style={{ fontSize: 52, marginBottom: 14 }}>🌤</div><div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No outdoor pads yet</div><button onClick={() => setView("add")} style={{ background: "#c8791a", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>+ Add First Pad</button></div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{filteredPads.map(p => <PadCard key={p.id} pad={p} onEdit={x => { setEditingId(x.id); setView("edit"); }} onDelete={deletePad} onDuplicate={dupPad} onToggleActive={togglePadActive} />)}</div>
        </>)}
        {section === "outdoor" && view === "add" && <PadForm onSave={savePad} onCancel={() => setView("list")} />}
        {section === "outdoor" && view === "edit" && editingId && <PadForm initial={pads.find(p => p.id === editingId)} onSave={savePad} onCancel={() => { setView("list"); setEditingId(null); }} />}

        {/* ── TASKS ── */}
        {section === "tasks" && <TasksPage tasks={tasks} onAddTask={addTask} onCompleteTask={completeTask} onUncompleteTask={uncompleteTask} onRemoveTask={deleteTask} houses={houses} pads={pads} />}
      </div>
    </div>
  );
}
