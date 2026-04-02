import { useState, useMemo } from "react";
import { useHpProductLines, useHpCompetitorPrices } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const FL = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>{children}</div>;
const SH = ({ children }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 16, marginTop: 24 }}>{children}</div>;
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

const STATUSES = [
  { id: "exploring", label: "Exploring", color: "#7a8c74", bg: "#f0f5ee" },
  { id: "costing", label: "Costing", color: "#c8791a", bg: "#fff4e8" },
  { id: "approved", label: "Approved", color: "#4a90d9", bg: "#e8f0ff" },
  { id: "active", label: "Active", color: "#4a7a35", bg: "#e8f5e0" },
  { id: "discontinued", label: "Discontinued", color: "#d94f3d", bg: "#fde8e8" },
];

const BLANK = {
  name: "", plantName: "", variety: "", potSize: "", plantsPerPot: 1,
  linerCost: "", linerSupplier: "", soilMix: "", soilCostPerUnit: "",
  potCost: "", laborMinutes: "", laborCost: "", chemicalCost: "", otherCost: "",
  wholesalePrice: "", markupFactor: 2.5, growWeeks: "", status: "exploring",
  targetCustomer: "", notes: "", competitorRetail: "", competitorSource: "",
};

export default function HouseplantProductLines() {
  const { rows: lines, upsert, remove } = useHpProductLines();
  const { rows: compPrices, upsert: upsertComp, remove: removeComp } = useHpCompetitorPrices();

  const [view, setView] = useState("list"); // list | form | detail
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");

  const filtered = useMemo(() => {
    let items = lines;
    if (statusFilter !== "all") items = items.filter(r => r.status === statusFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter(r => (r.name || "").toLowerCase().includes(q) || (r.plantName || "").toLowerCase().includes(q));
    }
    return items;
  }, [lines, statusFilter, searchQ]);

  const selected = lines.find(r => r.id === selectedId);

  if (view === "form") return <ProductLineForm initial={selected} compPrices={compPrices} upsertComp={upsertComp}
    onSave={async (data) => { await upsert(data); setView("list"); }}
    onCancel={() => setView(selected ? "detail" : "list")} />;

  return (
    <div style={FONT}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setStatusFilter("all")} style={{ ...BTN_SEC, ...(statusFilter === "all" ? { borderColor: "#7fb069", color: "#1e2d1a", fontWeight: 800 } : {}) }}>All ({lines.length})</button>
          {STATUSES.map(s => {
            const count = lines.filter(r => r.status === s.id).length;
            return <button key={s.id} onClick={() => setStatusFilter(s.id)}
              style={{ ...BTN_SEC, ...(statusFilter === s.id ? { borderColor: s.color, color: s.color, fontWeight: 800 } : {}), fontSize: 12 }}>
              {s.label} ({count})
            </button>;
          })}
        </div>
        <button onClick={() => { setSelectedId(null); setView("form"); }} style={BTN}>+ New Product Line</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search product lines..." style={{ ...IS(!!searchQ), maxWidth: 300 }} />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No product lines yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Start building houseplant product offerings</div>
          <button onClick={() => { setSelectedId(null); setView("form"); }} style={BTN}>Create First Product Line</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map(line => {
            const st = STATUSES.find(s => s.id === line.status) || STATUSES[0];
            const totalCost = (parseFloat(line.linerCost) || 0) + (parseFloat(line.soilCostPerUnit) || 0) + (parseFloat(line.potCost) || 0) + (parseFloat(line.laborCost) || 0) + (parseFloat(line.chemicalCost) || 0) + (parseFloat(line.otherCost) || 0);
            const wholesale = parseFloat(line.wholesalePrice) || 0;
            const margin = wholesale > 0 ? ((wholesale - totalCost) / wholesale * 100) : 0;
            const retail = wholesale * (parseFloat(line.markupFactor) || 2.5);
            const compRetail = parseFloat(line.competitorRetail) || 0;
            const priceRisk = compRetail > 0 && retail > compRetail;

            return (
              <div key={line.id} onClick={() => { setSelectedId(line.id); setView("form"); }}
                style={{ ...card, cursor: "pointer", borderColor: priceRisk ? "#f0c8c0" : "#e0ead8", transition: "all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = priceRisk ? "#f0c8c0" : "#e0ead8"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{line.name || line.plantName}</div>
                    <div style={{ fontSize: 12, color: "#7a8c74" }}>{line.potSize}{line.variety ? ` - ${line.variety}` : ""}</div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase" }}>Cost</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>${totalCost.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase" }}>Wholesale</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#4a7a35" }}>${wholesale.toFixed(2)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase" }}>Margin</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: margin > 40 ? "#4a7a35" : margin > 20 ? "#c8791a" : "#d94f3d" }}>{margin.toFixed(0)}%</div>
                  </div>
                </div>

                {compRetail > 0 && (
                  <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: priceRisk ? "#fde8e8" : "#f0f8eb", fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: priceRisk ? "#d94f3d" : "#4a7a35" }}>
                      {priceRisk ? "Price risk" : "Competitive"}:
                    </span>
                    {" "}Retail @{line.markupFactor}x = ${retail.toFixed(2)} vs {line.competitorSource || "competitor"} ${compRetail.toFixed(2)}
                  </div>
                )}

                {line.targetCustomer && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>Target: {line.targetCustomer}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
function ProductLineForm({ initial, compPrices, upsertComp, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...BLANK, ...initial } : BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const totalCost = (parseFloat(f.linerCost) || 0) + (parseFloat(f.soilCostPerUnit) || 0) + (parseFloat(f.potCost) || 0) + (parseFloat(f.laborCost) || 0) + (parseFloat(f.chemicalCost) || 0) + (parseFloat(f.otherCost) || 0);
  const wholesale = parseFloat(f.wholesalePrice) || 0;
  const markup = parseFloat(f.markupFactor) || 2.5;
  const retail = wholesale * markup;
  const margin = wholesale > 0 ? ((wholesale - totalCost) / wholesale * 100) : 0;
  const compRetail = parseFloat(f.competitorRetail) || 0;
  const priceRisk = compRetail > 0 && retail > compRetail;

  // Competitor prices for this plant
  const relevantComp = compPrices.filter(c => f.plantName && c.plantName?.toLowerCase().includes(f.plantName.toLowerCase()));

  function save() {
    if (!f.plantName.trim()) return;
    onSave({
      ...f,
      id: f.id || crypto.randomUUID(),
      totalCost,
      retailAtMarkup: retail,
      marginPct: margin,
    });
  }

  return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Product Line" : "New Product Line"}</div>
      </div>

      <div style={card}>
        <SH>Product Info</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Product Name *</FL><input value={f.name} onChange={e => upd("name", e.target.value)} style={IS(false)} placeholder="e.g. 6in Pothos Golden" /></div>
          <div><FL>Status</FL>
            <select value={f.status} onChange={e => upd("status", e.target.value)} style={IS(false)}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div><FL>Plant Name *</FL><input value={f.plantName} onChange={e => upd("plantName", e.target.value)} style={IS(false)} placeholder="e.g. Epipremnum aureum" /></div>
          <div><FL>Variety</FL><input value={f.variety} onChange={e => upd("variety", e.target.value)} style={IS(false)} placeholder="e.g. Golden Pothos" /></div>
          <div><FL>Pot Size</FL><input value={f.potSize} onChange={e => upd("potSize", e.target.value)} style={IS(false)} placeholder="e.g. 6 inch" /></div>
          <div><FL>Plants per Pot</FL><input type="number" value={f.plantsPerPot} onChange={e => upd("plantsPerPot", parseInt(e.target.value) || 1)} style={IS(false)} /></div>
          <div><FL>Grow Weeks (liner to finish)</FL><input type="number" value={f.growWeeks} onChange={e => upd("growWeeks", e.target.value)} style={IS(false)} /></div>
          <div><FL>Target Customer</FL><input value={f.targetCustomer} onChange={e => upd("targetCustomer", e.target.value)} style={IS(false)} placeholder="e.g. Sullivan Hardware" /></div>
        </div>

        <SH>Cost Breakdown</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Liner Cost ($)</FL><input type="number" step="0.01" value={f.linerCost} onChange={e => upd("linerCost", e.target.value)} style={IS(false)} /></div>
          <div><FL>Liner Supplier</FL><input value={f.linerSupplier} onChange={e => upd("linerSupplier", e.target.value)} style={IS(false)} /></div>
          <div><FL>Soil Mix</FL><input value={f.soilMix} onChange={e => upd("soilMix", e.target.value)} style={IS(false)} /></div>
          <div><FL>Soil Cost/Unit ($)</FL><input type="number" step="0.01" value={f.soilCostPerUnit} onChange={e => upd("soilCostPerUnit", e.target.value)} style={IS(false)} /></div>
          <div><FL>Pot Cost ($)</FL><input type="number" step="0.01" value={f.potCost} onChange={e => upd("potCost", e.target.value)} style={IS(false)} /></div>
          <div><FL>Labor Minutes</FL><input type="number" value={f.laborMinutes} onChange={e => upd("laborMinutes", e.target.value)} style={IS(false)} /></div>
          <div><FL>Labor Cost ($)</FL><input type="number" step="0.01" value={f.laborCost} onChange={e => upd("laborCost", e.target.value)} style={IS(false)} /></div>
          <div><FL>Chemical Cost ($)</FL><input type="number" step="0.01" value={f.chemicalCost} onChange={e => upd("chemicalCost", e.target.value)} style={IS(false)} /></div>
          <div><FL>Other Cost ($)</FL><input type="number" step="0.01" value={f.otherCost} onChange={e => upd("otherCost", e.target.value)} style={IS(false)} /></div>
        </div>

        {/* Live cost summary */}
        <div style={{ background: "#f0f8eb", borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Total Cost</div><div style={{ fontSize: 20, fontWeight: 800, color: "#1e2d1a" }}>${totalCost.toFixed(2)}</div></div>
          <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Wholesale</div><div style={{ fontSize: 20, fontWeight: 800, color: "#4a7a35" }}>${wholesale.toFixed(2)}</div></div>
          <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Retail @{markup}x</div><div style={{ fontSize: 20, fontWeight: 800, color: "#4a90d9" }}>${retail.toFixed(2)}</div></div>
          <div><div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Margin</div><div style={{ fontSize: 20, fontWeight: 800, color: margin > 40 ? "#4a7a35" : margin > 20 ? "#c8791a" : "#d94f3d" }}>{margin.toFixed(1)}%</div></div>
        </div>

        <SH>Pricing & Competition</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Wholesale Price ($)</FL><input type="number" step="0.01" value={f.wholesalePrice} onChange={e => upd("wholesalePrice", e.target.value)} style={IS(false)} /></div>
          <div><FL>Markup Factor</FL><input type="number" step="0.1" value={f.markupFactor} onChange={e => upd("markupFactor", e.target.value)} style={IS(false)} /></div>
          <div><FL>Competitor Retail ($)</FL><input type="number" step="0.01" value={f.competitorRetail} onChange={e => upd("competitorRetail", e.target.value)} style={IS(false)} /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <FL>Competitor Source</FL><input value={f.competitorSource} onChange={e => upd("competitorSource", e.target.value)} style={IS(false)} placeholder="e.g. Costa Farms @ Walmart, Lowe's" />
        </div>

        {priceRisk && (
          <div style={{ background: "#fde8e8", borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, color: "#d94f3d", fontSize: 14, marginBottom: 4 }}>Price Risk</div>
            <div style={{ fontSize: 13, color: "#7a5a5a" }}>
              Your customer's retail (${retail.toFixed(2)}) exceeds {f.competitorSource || "competitor"} (${compRetail.toFixed(2)}).
              {retail > compRetail && ` Gap: $${(retail - compRetail).toFixed(2)}.`}
              {wholesale > 0 && ` Max wholesale to match: $${(compRetail / markup).toFixed(2)}`}
            </div>
          </div>
        )}

        <SH>Notes</SH>
        <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS(false), minHeight: 70, resize: "vertical" }} placeholder="Production notes, customer preferences, seasonal timing..." />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} style={{ ...BTN, flex: 1, padding: 14 }}>{initial ? "Save Changes" : "Create Product Line"}</button>
        <button onClick={onCancel} style={{ ...BTN_SEC, padding: 14 }}>Cancel</button>
      </div>
    </div>
  );
}
