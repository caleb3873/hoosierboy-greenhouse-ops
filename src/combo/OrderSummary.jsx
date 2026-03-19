import React, { useState, useMemo } from "react";
import { calcUnitBreakdown, soilCostPerCuFt, substrateVolCuFt } from "./CostEngine";

const FORM_TYPES = [
  { id: "URC",  label: "URC",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "PLUG", label: "Plug", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "SEED", label: "Seed", color: "#c8791a", bg: "#fff4e8" },
  { id: "BULB", label: "Bulb", color: "#7a5a20", bg: "#fdf5e0" },
  { id: "CALL", label: "Call", color: "#7a8c74", bg: "#f0f5ee" },
];

function SH({ c }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 7, marginBottom: 14 }}>{c}</div>;
}

// ── ORDER SUMMARY MODAL ───────────────────────────────────────────────────────
function OrderSummary({ lot, onClose, onMarkOrdered, containers, soilMixes, tags }) {
  const [copied, setCopied] = useState(null);

  const brokerMap = {};
  (lot.combos || []).forEach(combo => {
    const qty = combo.qty || lot.totalQty || 0;
    (combo.plants || []).forEach(p => {
      if (!p.name) return;
      const broker = p.broker || "Unassigned";
      if (!brokerMap[broker]) brokerMap[broker] = [];
      const existing = brokerMap[broker].find(x => x.name === p.name && x.formType === p.formType && x.needBy === p.needBy);
      if (existing) existing.totalQty += (p.qty || 1) * qty;
      else brokerMap[broker].push({ name: p.name, formType: p.formType, needBy: p.needBy, costPerPlant: p.costPerPlant, totalQty: (p.qty || 1) * qty, comboName: combo.name || lot.name });
    });
  });

  const brokers = Object.keys(brokerMap).sort();
  const grandTotal = brokers.reduce((s, b) => s + brokerMap[b].reduce((ss, p) => ss + (Number(p.costPerPlant || 0) * p.totalQty), 0), 0);

  // Per-combo material summary using CostEngine
  const materialRows = (lot.combos || []).map(combo => {
    const qty          = combo.qty || lot.totalQty || 0;
    const selContainer = containers.find(c => c.id === combo.containerId);
    const selSoil      = soilMixes.find(s => s.id === combo.soilId);
    const selTag       = tags.find(t => t.id === combo.tagId);

    const { plantCost, containerCost, soilCost, tagCost, accessoryCost, totalPerUnit } =
      calcUnitBreakdown(combo.plants || [], selContainer, selSoil, selTag);

    return {
      combo,
      qty,
      selContainer,
      selSoil,
      selTag,
      plantCost,
      containerCost,
      soilCost,
      tagCost,
      accessoryCost,
      totalPerUnit,
      totalCost: totalPerUnit * qty,
    };
  });

  const grandMaterialTotal = materialRows.reduce((s, r) => s + r.totalCost, 0);

  const buildEmail = (broker) => {
    const lines = brokerMap[broker];
    return `Hi,\n\nPlease see our young plant order for the ${lot.name || "upcoming"} production run.\n\nORDER DATE: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}\nACCOUNT: Schlegel Greenhouse / Hoosier Boy\n\n${lines.map(p => `${p.name} | ${p.formType} | Qty: ${p.totalQty.toLocaleString()} | Need by: ${p.needBy || "TBD"}${p.costPerPlant ? ` | $${Number(p.costPerPlant).toFixed(2)}/unit` : ""}`).join("\n")}\n\nTotal: ${lines.reduce((s, p) => s + (Number(p.costPerPlant || 0) * p.totalQty), 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\nPlease confirm availability and ship dates. Thank you.\n\nSchlegel Greenhouse`;
  };
  const copyEmail = (broker) => { navigator.clipboard.writeText(buildEmail(broker)); setCopied(broker); setTimeout(() => setCopied(null), 2000); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 820, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", padding: "22px 28px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "#c8e6b8" }}>Order Summary</div>
            <div style={{ fontSize: 12, color: "#7fb069", marginTop: 3 }}>{lot.name} · {brokers.length} broker{brokers.length !== 1 ? "s" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#c8e6b8", borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
        <div style={{ padding: "24px 28px" }}>

          {/* Material cost summary per combo */}
          {materialRows.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <SH c="Material Cost Summary" />
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#f0f5ee" }}>
                    {["Combo", "Qty", "Container", "Soil", "Tag", "Plants", "Total/unit", "Total"].map(h => (
                      <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materialRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #e8ede4" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e2d1a" }}>{r.combo.name || `Combo ${i + 1}`}</td>
                      <td style={{ padding: "9px 12px", color: "#7a8c74" }}>{r.qty}</td>
                      <td style={{ padding: "9px 12px", color: "#4a90d9" }}>{r.selContainer?.name || "—"}{r.containerCost > 0 ? <span style={{ color: "#4a90d9", fontWeight: 700 }}> ${r.containerCost.toFixed(3)}</span> : ""}</td>
                      <td style={{ padding: "9px 12px", color: "#c8791a" }}>{r.selSoil?.name || "—"}{r.soilCost > 0 ? <span style={{ fontWeight: 700 }}> ${r.soilCost.toFixed(3)}</span> : ""}</td>
                      <td style={{ padding: "9px 12px", color: "#8e44ad" }}>{r.selTag?.name || "—"}{r.tagCost > 0 ? <span style={{ fontWeight: 700 }}> ${r.tagCost.toFixed(3)}</span> : ""}</td>
                      <td style={{ padding: "9px 12px", color: "#7fb069", fontWeight: 700 }}>${r.plantCost.toFixed(2)}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e2d1a" }}>${r.totalPerUnit.toFixed(2)}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, color: "#4a7a35" }}>${r.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tag descriptions */}
          {(lot.combos || []).some(c => c.tagDescription) && (
            <div style={{ marginBottom: 24 }}>
              <SH c="Tag Descriptions" />
              {(lot.combos || []).filter(c => c.tagDescription).map((c, i) => (
                <div key={i} style={{ background: "#f8faf6", borderRadius: 10, border: "1.5px solid #e0ead8", padding: "12px 16px", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#4a5a40", marginBottom: 6 }}>{c.name || `Combo ${i + 1}`}</div>
                  <pre style={{ margin: 0, fontFamily: "inherit", fontSize: 13, color: "#1e2d1a", whiteSpace: "pre-wrap" }}>{c.tagDescription}</pre>
                </div>
              ))}
            </div>
          )}

          {/* Plant orders by broker */}
          {brokers.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#7a8c74" }}>No plants with brokers assigned yet.</div>}
          {brokers.map(broker => {
            const lines = brokerMap[broker];
            const subtotal = lines.reduce((s, p) => s + (Number(p.costPerPlant || 0) * p.totalQty), 0);
            return (
              <div key={broker} style={{ marginBottom: 20, background: "#f8faf6", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
                <div style={{ background: "#1e2d1a", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#c8e6b8" }}>{broker}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "#7fb069", fontWeight: 700 }}>${subtotal.toFixed(2)}</span>
                    <button onClick={() => copyEmail(broker)} style={{ background: copied === broker ? "#4a7a35" : "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {copied === broker ? "✓ Copied!" : "📋 Copy Email Draft"}
                    </button>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: "#f0f5ee" }}>
                    {["Variety", "Form", "Qty", "Need By", "$/unit", "Subtotal"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {lines.map((p, i) => {
                      const ft = FORM_TYPES.find(f => f.id === p.formType);
                      return (
                        <tr key={i} style={{ borderTop: "1px solid #e8ede4" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1e2d1a" }}>{p.name}</td>
                          <td style={{ padding: "10px 14px" }}>{ft && <span style={{ background: ft.bg, color: ft.color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{ft.label}</span>}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{p.totalQty.toLocaleString()}</td>
                          <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{p.needBy || "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{p.costPerPlant ? `$${Number(p.costPerPlant).toFixed(2)}` : "—"}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: "#4a7a35" }}>{p.costPerPlant ? `$${(Number(p.costPerPlant) * p.totalQty).toFixed(2)}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Grand total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", borderRadius: 14, padding: "18px 22px" }}>
            <div style={{ display: "flex", gap: 28 }}>
              {grandMaterialTotal > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 }}>Total Material Cost</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>${grandMaterialTotal.toFixed(2)}</div>
                </div>
              )}
              {grandTotal > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 }}>Plant Order Total</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#c8e6b8" }}>${grandTotal.toFixed(2)}</div>
                </div>
              )}
            </div>
            <button onClick={() => { onMarkOrdered(); onClose(); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(127,176,105,.4)" }}>
              ✓ Mark as Ordered
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrderSummary;
