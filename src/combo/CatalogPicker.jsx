import React, { useState } from "react";
import { useBrokerCatalogs } from "../supabase";

// ── BROKER LOOKUP HOOK (mirrors CropPlanning) ────────────────────────────────
function useBrokerLookup() {
  const { rows: catalogs } = useBrokerCatalogs ? useBrokerCatalogs() : { rows: [] };
  const getBrokerNames = () => [...new Set(catalogs.map(c => c.brokerName).filter(Boolean))].sort();
  const getCultivars   = (broker) => {
    const items = catalogs.filter(c => c.brokerName === broker).flatMap(c => c.items || []);
    return [...new Set(items.map(i => i.crop).filter(Boolean))].sort();
  };
  const getSuppliers = (broker, cultivar) => {
    const items = catalogs.filter(c => c.brokerName === broker).flatMap(c => c.items || []);
    const f = cultivar ? items.filter(i => i.crop === cultivar) : items;
    return [...new Set(f.map(i => i.supplier || i.breeder).filter(Boolean))].sort();
  };
  const getSeries = (broker, cultivar, supplier) => {
    const items = catalogs.filter(c => c.brokerName === broker).flatMap(c => c.items || []);
    return [...new Set(items.filter(i =>
      (!cultivar || i.crop === cultivar) &&
      (!supplier || i.supplier === supplier || i.breeder === supplier)
    ).map(i => i.varietyName || i.series).filter(Boolean))].sort();
  };
  const getColors = (broker, cultivar, seriesName) => {
    const items = catalogs.filter(c => c.brokerName === broker).flatMap(c => c.items || []);
    return items.filter(i =>
      (!cultivar || i.crop === cultivar) &&
      (i.varietyName === seriesName || i.series === seriesName)
    );
  };
  return { getBrokerNames, getCultivars, getSuppliers, getSeries, getColors };
}

// ── MANUAL BROKER SELECT ──────────────────────────────────────────────────────
function ManualBrokerSelect({ value, onChange }) {
  const { getBrokerNames } = useBrokerLookup();
  const brokerNames = getBrokerNames();
  const IS = (active) => ({ width:"100%", padding:"7px 10px", borderRadius:8, border:`1.5px solid ${active?"#7fb069":"#c8d8c0"}`, fontSize:13, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" });
  if (brokerNames.length > 0) return (
    <select value={value} onChange={e=>onChange(e.target.value)} style={IS(false)}>
      <option value="">— Broker —</option>
      {brokerNames.map(b=><option key={b}>{b}</option>)}
    </select>
  );
  return <input value={value} onChange={e=>onChange(e.target.value)} placeholder="e.g. Ball Seed" style={IS(false)} />;
}

// ── PLANT CATALOG PICKER (Broker → Supplier → Species → Series → Color) ───────
function PlantCatalogPicker({ plant, onChange }) {
  const { getBrokerNames, getCultivars, getSuppliers, getSeries, getColors } = useBrokerLookup();
  const IS = (active) => ({ width:"100%", padding:"7px 10px", borderRadius:8, border:`1.5px solid ${active?"#7fb069":"#c8d8c0"}`, fontSize:13, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" });
  const FL = ({ c }) => <div style={{ fontSize:10, fontWeight:700, color:"#7a8c74", textTransform:"uppercase", letterSpacing:.5, marginBottom:3 }}>{c}</div>;

  const brokerNames = getBrokerNames();
  const [supplierFilter, setSupplierFilter] = useState(plant._supplierFilter || "");
  const [speciesFilter,  setSpeciesFilter]   = useState(plant._speciesFilter  || "");
  const [seriesQuery,    setSeriesQuery]        = useState("");

  const cultivars = plant.broker ? getCultivars(plant.broker) : [];
  const suppliers = plant.broker ? getSuppliers(plant.broker, speciesFilter) : [];
  const allSeries = plant.broker ? getSeries(plant.broker, speciesFilter, supplierFilter) : [];
  const filteredSeries = seriesQuery ? allSeries.filter(s => s.toLowerCase().includes(seriesQuery.toLowerCase())) : allSeries;

  const selectedSeries = plant._seriesName || "";
  const catalogColors  = plant._catalogColors || [];

  return (
    <div>
      {/* Row 1: Broker · Supplier · Species */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
        <div>
          <FL c="Broker" />
          {brokerNames.length > 0 ? (
            <select value={plant.broker||""} onChange={e=>{ onChange("broker",e.target.value); setSupplierFilter(""); setSpeciesFilter(""); setSeriesQuery(""); onChange("_seriesName",""); onChange("_catalogColors",[]); }} style={IS(false)}>
              <option value="">— Select —</option>
              {brokerNames.map(b=><option key={b}>{b}</option>)}
            </select>
          ) : (
            <input value={plant.broker||""} onChange={e=>onChange("broker",e.target.value)} placeholder="e.g. Ball Seed" style={IS(false)} />
          )}
        </div>
        <div>
          <FL c="Supplier" />
          {suppliers.length > 0 ? (
            <select value={supplierFilter} onChange={e=>{ setSupplierFilter(e.target.value); setSeriesQuery(""); }} style={IS(false)}>
              <option value="">— All —</option>
              {suppliers.map(s=><option key={s}>{s}</option>)}
            </select>
          ) : (
            <input value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)} placeholder="e.g. Dümmen" style={IS(false)} />
          )}
        </div>
        <div>
          <FL c="Crop Species" />
          {cultivars.length > 0 ? (
            <select value={speciesFilter} onChange={e=>{ setSpeciesFilter(e.target.value); setSupplierFilter(""); setSeriesQuery(""); }} style={IS(false)}>
              <option value="">— All —</option>
              {cultivars.map(c=><option key={c}>{c}</option>)}
            </select>
          ) : (
            <input value={speciesFilter} onChange={e=>setSpeciesFilter(e.target.value)} placeholder="e.g. Petunia" style={IS(false)} />
          )}
        </div>
      </div>

      {/* Series picker */}
      {plant.broker && !selectedSeries && (
        <div style={{ border:"1.5px solid #e0ead8", borderRadius:10, overflow:"hidden", marginBottom:8 }}>
          <div style={{ padding:"7px 10px", borderBottom:"1px solid #f0f0ea", background:"#fafaf8" }}>
            <input value={seriesQuery} onChange={e=>setSeriesQuery(e.target.value)} placeholder="Search varieties..."
              style={{ width:"100%", border:"1.5px solid #c8d8c0", borderRadius:7, padding:"5px 9px", fontSize:12, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" }} />
          </div>
          {filteredSeries.length === 0 ? (
            <div style={{ padding:"14px", textAlign:"center", color:"#aabba0", fontSize:12 }}>No varieties found</div>
          ) : (
            <div style={{ maxHeight:160, overflowY:"auto" }}>
              {filteredSeries.map(s => {
                const colors = getColors(plant.broker, speciesFilter, s);
                const price = colors[0] ? (colors[0].unitPrice || colors[0].sellPrice) : null;
                return (
                  <div key={s} onClick={() => {
                    const catalogItems = colors;
                    onChange("_seriesName", s);
                    onChange("cultivar", speciesFilter || catalogItems[0]?.crop || "");
                    onChange("name", s);
                    onChange("_catalogColors", catalogItems.map(i => ({ label: i.color || i.varietyName || "", itemNumber: i.itemNumber, price: i.unitPrice || i.sellPrice, perQty: i.perQty })).filter(c => c.label));
                    onChange("color", "");
                    if (catalogItems[0]) {
                      const p = catalogItems[0].unitPrice || catalogItems[0].sellPrice;
                      if (p) onChange("costPerPlant", String(p));
                    }
                  }}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 12px", borderBottom:"1px solid #f5f5f0", cursor:"pointer", background:"#fff" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f8eb"}
                  onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#1a2a1a" }}>{s}</div>
                      <div style={{ fontSize:10, color:"#aabba0" }}>{colors.length} color{colors.length!==1?"s":""}{speciesFilter?` · ${speciesFilter}`:""}</div>
                    </div>
                    <div style={{ fontSize:11, color:"#2e7a2e", fontWeight:700 }}>{price?`$${Number(price).toFixed(4)}`:"—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Selected series + color dropdown */}
      {selectedSeries && (
        <div style={{ background:"#f0f8eb", border:"1.5px solid #c8e0b8", borderRadius:10, padding:"10px 12px", marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a" }}>{selectedSeries}</div>
            <button onClick={()=>{ onChange("_seriesName",""); onChange("_catalogColors",[]); onChange("color",""); onChange("name",""); }}
              style={{ background:"none", border:"none", color:"#7a8c74", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
              ← Change variety
            </button>
          </div>
          <FL c="Color" />
          {catalogColors.length > 0 ? (
            <select value={plant.color||""} onChange={e=>{
              const picked = catalogColors.find(c=>c.label===e.target.value);
              onChange("color", e.target.value);
              onChange("name", [selectedSeries, e.target.value].filter(Boolean).join(" "));
              if (picked?.itemNumber) onChange("itemNumber", picked.itemNumber);
              if (picked?.price) onChange("costPerPlant", String(picked.price));
            }} style={IS(false)}>
              <option value="">— Select color —</option>
              {catalogColors.map(c=><option key={c.label} value={c.label}>{c.label}{c.price?` · $${Number(c.price).toFixed(4)}`:""}</option>)}
            </select>
          ) : (
            <input value={plant.color||""} onChange={e=>onChange("color",e.target.value)} placeholder="Color" style={IS(false)} />
          )}
        </div>
      )}
    </div>
  );
}


// ── CATALOG SLIDE-OUT PANEL ───────────────────────────────────────────────────
function CatalogSlideOut({ plant, onChange, onClose }) {
  const { getBrokerNames, getCultivars, getSuppliers, getSeries, getColors } = useBrokerLookup();
  const [broker,         setBroker        ] = useState(plant.broker || "");
  const [supplierFilter, setSupplierFilter ] = useState("");
  const [speciesFilter,  setSpeciesFilter  ] = useState("");
  const [seriesQuery,    setSeriesQuery    ] = useState("");
  const [selectedSeries, setSelectedSeries ] = useState("");
  const [selectedColor,  setSelectedColor  ] = useState("");

  const brokerNames = getBrokerNames();
  const suppliers   = broker ? getSuppliers(broker, speciesFilter) : [];
  const cultivars   = broker ? getCultivars(broker) : [];
  const allSeries   = broker ? getSeries(broker, speciesFilter, supplierFilter) : [];
  const filtered    = seriesQuery ? allSeries.filter(s => s.toLowerCase().includes(seriesQuery.toLowerCase())) : allSeries;
  const colors      = selectedSeries ? getColors(broker, speciesFilter, selectedSeries) : [];

  function confirm() {
    if (!selectedSeries) return;
    const colorItem = colors.find(c => (c.color || c.varietyName || "") === selectedColor);
    onChange("broker",         broker);
    onChange("cultivar",       speciesFilter || colors[0]?.crop || "");
    onChange("_seriesName",    selectedSeries);
    onChange("name",           [selectedSeries, selectedColor].filter(Boolean).join(" "));
    onChange("_catalogColors", colors.map(c => ({ label: c.color || c.varietyName || "", itemNumber: c.itemNumber, price: c.unitPrice || c.sellPrice, perQty: c.perQty })).filter(c => c.label));
    onChange("color",          selectedColor);
    if (colorItem?.itemNumber) onChange("itemNumber", colorItem.itemNumber);
    const price = colorItem ? (colorItem.unitPrice || colorItem.sellPrice) : (colors[0]?.unitPrice || colors[0]?.sellPrice);
    if (price) onChange("costPerPlant", String(price));
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:998 }} />

      {/* Panel */}
      <div style={{ position:"fixed", top:0, right:0, bottom:0, width:420, maxWidth:"92vw", background:"#fff", zIndex:999, boxShadow:"-4px 0 32px rgba(0,0,0,0.15)", display:"flex", flexDirection:"column", fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>

        {/* Header */}
        <div style={{ background:"#1e2d1a", padding:"18px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontSize:18, color:"#c8e6b8" }}>📋 Browse Catalog</div>
            <div style={{ fontSize:11, color:"#7a9a6a", marginTop:2 }}>Select broker, species, and variety</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#7a9a6a", fontSize:22, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>

          {/* Broker */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#7a8c74", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Broker</div>
            {brokerNames.length > 0 ? (
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {brokerNames.map(b => (
                  <button key={b} onClick={() => { setBroker(b); setSpeciesFilter(""); setSupplierFilter(""); setSeriesQuery(""); setSelectedSeries(""); setSelectedColor(""); }}
                    style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${broker===b?"#7fb069":"#c8d8c0"}`, background:broker===b?"#f0f8eb":"#fff", color:broker===b?"#2e5c1e":"#7a8c74", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                    {b}
                  </button>
                ))}
              </div>
            ) : (
              <input value={broker} onChange={e => setBroker(e.target.value)} placeholder="Broker name"
                style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #c8d8c0", borderRadius:9, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
            )}
          </div>

          {broker && (<>
            {/* Species filter */}
            {cultivars.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#7a8c74", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Crop / Species</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button onClick={() => { setSpeciesFilter(""); setSupplierFilter(""); setSeriesQuery(""); setSelectedSeries(""); setSelectedColor(""); }}
                    style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${!speciesFilter?"#7fb069":"#c8d8c0"}`, background:!speciesFilter?"#f0f8eb":"#fff", color:!speciesFilter?"#2e5c1e":"#7a8c74", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                    All
                  </button>
                  {cultivars.map(c => (
                    <button key={c} onClick={() => { setSpeciesFilter(c); setSupplierFilter(""); setSeriesQuery(""); setSelectedSeries(""); setSelectedColor(""); }}
                      style={{ padding:"5px 12px", borderRadius:20, border:`1.5px solid ${speciesFilter===c?"#7fb069":"#c8d8c0"}`, background:speciesFilter===c?"#f0f8eb":"#fff", color:speciesFilter===c?"#2e5c1e":"#7a8c74", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Supplier filter */}
            {suppliers.length > 1 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#7a8c74", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Supplier</div>
                <select value={supplierFilter} onChange={e => { setSupplierFilter(e.target.value); setSeriesQuery(""); setSelectedSeries(""); setSelectedColor(""); }}
                  style={{ width:"100%", padding:"8px 12px", border:"1.5px solid #c8d8c0", borderRadius:9, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }}>
                  <option value="">All suppliers</option>
                  {suppliers.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            )}

            {/* Series search + list */}
            {!selectedSeries && (<>
              <div style={{ marginBottom:10 }}>
                <input value={seriesQuery} onChange={e => setSeriesQuery(e.target.value)}
                  placeholder="Search varieties..."
                  style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #c8d8c0", borderRadius:9, fontSize:13, fontFamily:"inherit", boxSizing:"border-box" }} />
              </div>
              <div style={{ border:"1.5px solid #e0ead8", borderRadius:10, overflow:"hidden" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding:"24px", textAlign:"center", color:"#aabba0", fontSize:13 }}>
                    {broker ? "No varieties found" : "Select a broker to browse"}
                  </div>
                ) : (
                  filtered.map(s => {
                    const cols = getColors(broker, speciesFilter, s);
                    const price = cols[0] ? (cols[0].unitPrice || cols[0].sellPrice) : null;
                    return (
                      <div key={s} onClick={() => { setSelectedSeries(s); setSelectedColor(""); }}
                        style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:"1px solid #f0f5ee", cursor:"pointer", background:"#fff" }}
                        onMouseEnter={e => e.currentTarget.style.background="#f0f8eb"}
                        onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:"#1e2d1a" }}>{s}</div>
                          <div style={{ fontSize:10, color:"#aabba0", marginTop:2 }}>
                            {cols.length} color{cols.length!==1?"s":""}
                            {speciesFilter ? ` · ${speciesFilter}` : ""}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {price && <span style={{ fontSize:11, color:"#2e7a2e", fontWeight:700 }}>${Number(price).toFixed(4)}</span>}
                          <span style={{ fontSize:16, color:"#c8d8c0" }}>›</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>)}

            {/* Color picker after series selected */}
            {selectedSeries && (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <button onClick={() => { setSelectedSeries(""); setSelectedColor(""); }}
                    style={{ background:"none", border:"none", color:"#7a8c74", fontSize:13, cursor:"pointer", fontFamily:"inherit", padding:0 }}>← Back</button>
                  <div style={{ fontWeight:800, fontSize:16, color:"#1e2d1a" }}>{selectedSeries}</div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {colors.map(c => {
                    const label = c.color || c.varietyName || "";
                    const price = c.unitPrice || c.sellPrice;
                    const isSelected = selectedColor === label;
                    return (
                      <div key={label} onClick={() => setSelectedColor(isSelected ? "" : label)}
                        style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:`2px solid ${isSelected?"#7fb069":"#e0ead8"}`, background:isSelected?"#f0f8eb":"#fff", cursor:"pointer", transition:"all .15s" }}>
                        <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${isSelected?"#7fb069":"#c8d8c0"}`, background:isSelected?"#7fb069":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          {isSelected && <span style={{ color:"#fff", fontSize:11, fontWeight:900 }}>✓</span>}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a" }}>{label || "—"}</div>
                          {c.itemNumber && <div style={{ fontSize:10, color:"#aabba0" }}>#{c.itemNumber}</div>}
                        </div>
                        {price && <div style={{ fontSize:12, fontWeight:700, color:"#2e7a2e" }}>${Number(price).toFixed(4)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>)}
        </div>

        {/* Footer confirm */}
        <div style={{ padding:"14px 20px", borderTop:"1.5px solid #e0ead8", flexShrink:0 }}>
          <button onClick={confirm} disabled={!selectedSeries}
            style={{ width:"100%", padding:13, borderRadius:10, border:"none", background:selectedSeries?"#7fb069":"#c8d8c0", color:"#fff", fontWeight:800, fontSize:14, cursor:selectedSeries?"pointer":"default", fontFamily:"inherit" }}>
            {selectedSeries
              ? selectedColor ? `✓ Select ${selectedSeries} · ${selectedColor}` : `✓ Select ${selectedSeries}`
              : "Choose a variety first"}
          </button>
        </div>
      </div>
    </>
  );
}

export { useBrokerLookup, ManualBrokerSelect, PlantCatalogPicker, CatalogSlideOut };
export default CatalogSlideOut;
