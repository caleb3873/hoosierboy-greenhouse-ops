import React, { useState } from "react";
import PlantRow from "./PlantRow";
import ComboVisual from "./ComboVisual";
import ComboNameGenerator from "./ComboNameGen";
import { calcUnitBreakdown, getCostLineItems, soilCostPerCuFt, substrateVolCuFt, calcSoilCostPerUnit } from "./CostEngine";

const uid = () => crypto.randomUUID();

const PLANT_ROLES = [
  { id: "thriller", label: "Thriller", color: "#8e44ad", emoji: "🔮" },
  { id: "filler",   label: "Filler",   color: "#7fb069", emoji: "🌿" },
  { id: "spiller",  label: "Spiller",  color: "#4a90d9", emoji: "💧" },
  { id: "accent",   label: "Accent",   color: "#e07b39", emoji: "✨" },
];

const IS = (active) => ({
  width: "100%", padding: "8px 10px", borderRadius: 7,
  border: `1.5px solid ${active ? "#7fb069" : "#dde8d5"}`,
  background: "#fff", fontSize: 13, color: "#1e2d1a",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});

function FL({ c }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 3 }}>{c}</div>;
}

function SH({ c }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 7, marginBottom: 14 }}>{c}</div>;
}

// Small pill for material details
export function CostPill({ label, value, color }) {
  return (
    <div style={{ background: color + "12", border: `1px solid ${color}30`, borderRadius: 6, padding: "3px 8px" }}>
      <span style={{ fontSize: 9, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .5 }}>{label} </span>
      <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── LOT MATERIALS PANEL ───────────────────────────────────────────────────────
export function LotMaterials({ lot, onChange, containers, soilMixes, tags }) {
  const [focus, setFocus] = useState(null);

  const selContainer = containers.find(c => c.id === lot.containerId);
  const selSoil      = soilMixes.find(s => s.id === lot.soilId);
  const selTag       = tags.find(t => t.id === lot.tagId);

  const finishedContainers = containers.filter(c => c.kind === "finished");

  const soilCpf        = selSoil ? soilCostPerCuFt(selSoil) : null;
  const subVol         = selContainer ? substrateVolCuFt(selContainer) : null;
  const soilCostPerUnit = (soilCpf && subVol) ? soilCpf * subVol : null;

  return (
    <div style={{ background: "#f8faf6", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "20px 22px", marginBottom: 24 }}>
      <SH c="Materials" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

        {/* ── CONTAINER ── */}
        <div>
          <FL c="Container" />
          <select value={lot.containerId || ""} onChange={e => onChange("containerId", e.target.value)}
            style={{ ...IS(false), marginBottom: 8 }}>
            <option value="">— Select container —</option>
            {finishedContainers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.diameter ? ` (${c.diameter}")` : ""}
              </option>
            ))}
          </select>
          {selContainer && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e0ead8", padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", marginBottom: 6 }}>{selContainer.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selContainer.diameter && <CostPill label='Size' value={`${selContainer.diameter}"`} color="#4a90d9" />}
                {selContainer.type && <CostPill label="Type" value={selContainer.type} color="#7a8c74" />}
                {selContainer.costPerUnit && <CostPill label="$/unit" value={`$${Number(selContainer.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
                {selContainer.supplier && <CostPill label="Supplier" value={selContainer.supplier} color="#7a8c74" />}
              </div>
            </div>
          )}
        </div>

        {/* ── SOIL ── */}
        <div>
          <FL c="Soil Mix" />
          <select value={lot.soilId || ""} onChange={e => onChange("soilId", e.target.value)}
            style={{ ...IS(false), marginBottom: 8 }}>
            <option value="">— Select soil mix —</option>
            {soilMixes.map(s => (
              <option key={s.id} value={s.id}>{s.name}{s.category ? ` · ${s.category}` : ""}</option>
            ))}
          </select>
          {selSoil && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e0ead8", padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", marginBottom: 6 }}>{selSoil.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selSoil.vendor && <CostPill label="Vendor" value={selSoil.vendor} color="#7a8c74" />}
                {selSoil.bagSize && <CostPill label="Bag" value={`${selSoil.bagSize} ${selSoil.bagUnit}`} color="#c8791a" />}
                {soilCpf && <CostPill label="$/cu ft" value={`$${soilCpf.toFixed(3)}`} color="#4a7a35" />}
                {soilCostPerUnit && <CostPill label="$/unit" value={`$${soilCostPerUnit.toFixed(3)}`} color="#8e44ad" />}
              </div>
              {!subVol && selContainer && (
                <div style={{ fontSize: 10, color: "#c8791a", marginTop: 6 }}>💡 Add substrate volume to container for per-unit soil cost</div>
              )}
              {!selContainer && soilCpf && (
                <div style={{ fontSize: 10, color: "#9aaa90", marginTop: 6 }}>Select a container to calculate per-unit soil cost</div>
              )}
            </div>
          )}
        </div>

        {/* ── TAG ── */}
        <div>
          <FL c="Tag" />
          <select value={lot.tagId || ""} onChange={e => onChange("tagId", e.target.value)}
            style={{ ...IS(false), marginBottom: 8 }}>
            <option value="">— Select tag —</option>
            {tags.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.tier ? ` · ${t.tier}` : ""}</option>
            ))}
          </select>
          {selTag && (
            <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e0ead8", padding: "10px 14px", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", marginBottom: 6 }}>{selTag.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selTag.tier && <CostPill label="Tier" value={selTag.tier} color={selTag.tier === "retail" ? "#c8791a" : "#7a8c74"} />}
                {selTag.type && <CostPill label="Type" value={selTag.type} color="#4a90d9" />}
                {selTag.costPerUnit && <CostPill label="$/tag" value={`$${Number(selTag.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
                {selTag.printSpec && <CostPill label="Print file" value={selTag.printSpec} color="#2e7d9e" />}
              </div>
            </div>
          )}
          <div style={{ marginTop: selTag ? 0 : 8 }}>
            <FL c="Tag Description / Print Copy" />
            <textarea value={lot.tagDescription || ""} onChange={e => onChange("tagDescription", e.target.value)}
              onFocus={() => setFocus("td")} onBlur={() => setFocus(null)}
              placeholder={"e.g.\nTropical Sunset™ Hanging Basket\nFull Sun · Water regularly\nSchlegel Greenhouse / Hoosier Boy"}
              style={{ ...IS(focus === "td"), minHeight: 80, resize: "vertical", fontSize: 12, lineHeight: 1.5 }} />
            <div style={{ fontSize: 10, color: "#9aaa90", marginTop: 3 }}>This copy will appear on printed tags for this lot</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COST ROLLUP BAR ───────────────────────────────────────────────────────────
export function CostRollup({ plants, lot, containers, soilMixes, tags }) {
  const selContainer = containers.find(c => c.id === lot.containerId);
  const selSoil      = soilMixes.find(s => s.id === lot.soilId);
  const selTag       = tags.find(t => t.id === lot.tagId);

  const items = getCostLineItems(plants, selContainer, selSoil, selTag);
  const { totalPerUnit } = calcUnitBreakdown(plants, selContainer, selSoil, selTag);

  const comboQty     = Number(lot.qty) || Number(lot.totalQty) || 0;
  const totalMaterial = totalPerUnit * comboQty;

  if (items.length === 0) return null;

  return (
    <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", borderRadius: 14, padding: "16px 22px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
      {items.map(item => (
        <div key={item.label} style={{ minWidth: 80 }}>
          <div style={{ fontSize: 10, color: item.color, textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>{item.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>${item.value.toFixed(3)}</div>
        </div>
      ))}
      <div style={{ width: "1px", background: "rgba(255,255,255,.15)", alignSelf: "stretch" }} />
      <div style={{ minWidth: 100 }}>
        <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Total / unit</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>${totalPerUnit.toFixed(2)}</div>
      </div>
      {comboQty > 0 && (
        <div style={{ minWidth: 100 }}>
          <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Total ({comboQty.toLocaleString()} units)</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#c8e6b8" }}>${totalMaterial.toFixed(0)}</div>
        </div>
      )}
    </div>
  );
}

// ── SINGLE COMBO EDITOR ───────────────────────────────────────────────────────
function ComboEditor({ combo, onChange, lotQty, containerType, containers, soilMixes, tags }) {
  const [showNameGen, setShowNameGen] = useState(false);
  const plants = combo.plants || [];
  const totalPlantsPerUnit = plants.reduce((s, p) => s + (p.qty || 1), 0);

  const updPlant = (idx, field, val) => {
    // Support batch update: if field is an object, merge all keys at once
    if (typeof field === "object" && field !== null) {
      const updated = [...plants]; updated[idx] = { ...updated[idx], ...field };
      onChange({ ...combo, plants: updated });
      return;
    }
    const updated = [...plants]; updated[idx] = { ...updated[idx], [field]: val };
    onChange({ ...combo, plants: updated });
  };
  const [newPlantId, setNewPlantId] = useState(null);
  const addPlant = () => {
    if (plants.length >= 10) return;
    const id = uid();
    setNewPlantId(id);
    onChange({ ...combo, plants: [...plants, { id, name: "", imageUrl: "", role: "filler", qty: 1, costPerPlant: "", broker: "", formType: "URC", needBy: "", _useCatalog: true }] });
  };
  const removePlant = (idx) => onChange({ ...combo, plants: plants.filter((_, i) => i !== idx) });

  const movePlant = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= plants.length) return;
    const updated = [...plants];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onChange({ ...combo, plants: updated });
  };

  const duplicatePlant = (idx) => {
    if (plants.length >= 10) return;
    const copy = { ...plants[idx], id: uid() };
    const updated = [...plants];
    updated.splice(idx + 1, 0, copy);
    onChange({ ...combo, plants: updated });
  };

  const selContainer = containers.find(c => c.id === combo.containerId);
  const isBasket = selContainer?.type === "basket" || combo.containerId == null;

  return (
    <div>
      {/* Combo name + qty */}
      <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <FL c="Combo Name" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={combo.name || ""} onChange={e => onChange({ ...combo, name: e.target.value })} placeholder='e.g. "Tropical Sunset"' style={{ ...IS(false), fontWeight: 700, fontSize: 14, flex: 1 }} />
            <button onClick={() => setShowNameGen(true)} title="Generate name ideas with AI"
              style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#f8faf6", cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0, transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f0f8eb"; e.currentTarget.style.borderColor = "#7fb069"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#f8faf6"; e.currentTarget.style.borderColor = "#c8d8c0"; }}>
              ✨
            </button>
          </div>
        </div>
        {showNameGen && (
          <ComboNameGenerator
            plants={plants}
            containerType={containerType}
            onSelect={name => { onChange({ ...combo, name }); setShowNameGen(false); }}
            onClose={() => setShowNameGen(false)}
          />
        )}
        <div style={{ minWidth: 130 }}>
          <FL c="Quantity (this combo)" />
          <input type="number" min="1" value={combo.qty || ""} onChange={e => onChange({ ...combo, qty: Number(e.target.value) })} placeholder={String(lotQty || "")} style={{ ...IS(false), fontWeight: 700, fontSize: 15, textAlign: "center" }} />
          {lotQty > 0 && <div style={{ fontSize: 10, color: "#9aaa90", marginTop: 2, textAlign: "center" }}>of {lotQty} total</div>}
        </div>
        {totalPlantsPerUnit > 0 && (
          <div style={{ background: "#f0f8eb", borderRadius: 10, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#2e5c1e" }}>{totalPlantsPerUnit}</div>
            <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>plants/unit</div>
          </div>
        )}
      </div>

      {/* Materials panel */}
      <LotMaterials
        lot={combo}
        onChange={(f, v) => onChange({ ...combo, [f]: v })}
        containers={containers}
        soilMixes={soilMixes}
        tags={tags}
      />

      {/* Visual + components */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 20 }}>
        {/* Preview */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 10 }}>Preview</div>
          <div style={{ background: "#f8faf6", borderRadius: 14, border: "1.5px solid #e0ead8", padding: 16 }}>
            {plants.length === 0
              ? <div style={{ textAlign: "center", padding: "30px 0", color: "#aabba0" }}><div style={{ fontSize: 32, marginBottom: 6 }}>🌸</div><div style={{ fontSize: 11 }}>Add plants to preview</div></div>
              : <ComboVisual plants={plants} isBasket={isBasket} />
            }
          </div>
          {plants.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {PLANT_ROLES.filter(r => plants.some(p => p.role === r.id)).map(r => {
                const count = plants.filter(p => p.role === r.id).reduce((s, p) => s + (p.qty || 1), 0);
                return <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 8px", background: r.color + "12", borderRadius: 6 }}><span style={{ color: r.color, fontWeight: 700 }}>{r.emoji} {r.label}</span><span style={{ color: "#7a8c74" }}>{count}</span></div>;
              })}
            </div>
          )}
        </div>

        {/* Components */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7 }}>Plants ({plants.length}/10)</div>
            <button onClick={addPlant} disabled={plants.length >= 10} style={{ background: plants.length >= 10 ? "#f0f0f0" : "#7fb069", color: plants.length >= 10 ? "#aabba0" : "#fff", border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: plants.length >= 10 ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              + Add Plant
            </button>
          </div>
          {plants.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 20px", background: "#f8faf6", borderRadius: 14, border: "2px dashed #c8d8c0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🌿</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4a5a40", marginBottom: 6 }}>No plants yet</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14, lineHeight: 1.5 }}>Drag photos from supplier sites or paste a URL.</div>
              <button onClick={addPlant} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "9px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add First Plant</button>
            </div>
          )}
          {plants.map((plant, idx) => (
            <PlantRow
              key={plant.id}
              plant={plant}
              index={idx}
              onChange={(f, v) => updPlant(idx, f, v)}
              onRemove={() => removePlant(idx)}
              onDuplicate={() => duplicatePlant(idx)}
              onMoveUp={() => movePlant(idx, idx - 1)}
              onMoveDown={() => movePlant(idx, idx + 1)}
              isFirst={idx === 0}
              isLast={idx === plants.length - 1}
              initialExpanded={plant.id === newPlantId}
            />
          ))}
        </div>
      </div>

      {/* Cost rollup */}
      {plants.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <CostRollup plants={plants} lot={{ ...combo, totalQty: combo.qty || lotQty }} containers={containers} soilMixes={soilMixes} tags={tags} />
        </div>
      )}
    </div>
  );
}

export default ComboEditor;
