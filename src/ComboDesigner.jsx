import { useState, useCallback, useRef } from "react";
import { useCombos, useComboTags, useBrokerCatalogs } from "./supabase";
import { useContainers, useSoilMixes, useCropRuns } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
const dc  = (o) => JSON.parse(JSON.stringify(o));

const FORM_TYPES = [
  { id: "URC",  label: "URC",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "PLUG", label: "Plug", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "SEED", label: "Seed", color: "#c8791a", bg: "#fff4e8" },
  { id: "BULB", label: "Bulb", color: "#7a5a20", bg: "#fdf5e0" },
  { id: "CALL", label: "Call", color: "#7a8c74", bg: "#f0f5ee" },
];

const PLANT_ROLES = [
  { id: "thriller", label: "Thriller", color: "#8e44ad", emoji: "🔮" },
  { id: "filler",   label: "Filler",   color: "#7fb069", emoji: "🌿" },
  { id: "spiller",  label: "Spiller",  color: "#4a90d9", emoji: "💧" },
  { id: "accent",   label: "Accent",   color: "#e07b39", emoji: "✨" },
];

const STATUSES = [
  { id: "draft",     label: "Draft",               color: "#7a8c74", bg: "#f0f5ee" },
  { id: "submitted", label: "Submitted for Review", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "approved",  label: "Approved",             color: "#4a7a35", bg: "#e8f5e0" },
  { id: "revised",   label: "Revised",              color: "#7b3fa0", bg: "#f5eeff" },
  { id: "revision",  label: "Needs Revision",       color: "#c8791a", bg: "#fff4e8" },
  { id: "ordered",   label: "Ordered",              color: "#1e2d1a", bg: "#c8e6b8" },
];

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

// ── SOIL COST HELPER ──────────────────────────────────────────────────────────
function soilCostPerCuFt(mix) {
  if (!mix?.costPerBag || !mix?.bagSize) return null;
  const cost = Number(mix.costPerBag), size = Number(mix.bagSize);
  if (!cost || !size) return null;
  if (mix.bagUnit === "cu ft") return cost / size;
  if (mix.bagUnit === "gal")   return cost / (size * 0.134);
  if (mix.bagUnit === "L")     return cost / (size * 0.0353);
  if (mix.bagUnit === "qt")    return cost / (size * 0.0334);
  return null;
}

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────
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

// ── VISUAL PREVIEW ────────────────────────────────────────────────────────────
function ComboVisual({ plants, isBasket }) {
  const slots = [];
  plants.forEach(p => { for (let i = 0; i < (p.qty || 1); i++) slots.push(p); });
  const total = slots.length;
  const size = 220, cx = size / 2, cy = size / 2;

  if (isBasket !== false) {
    const rings = total <= 1 ? [slots] :
                  total <= 7 ? [slots.slice(0,1), slots.slice(1)] :
                  total <= 14 ? [slots.slice(0,1), slots.slice(1,7), slots.slice(7)] :
                  [slots.slice(0,1), slots.slice(1,7), slots.slice(7,13), slots.slice(13)];
    const radii = [0, 38, 72, 98].slice(0, rings.length);
    return (
      <div style={{ position:"relative", width:size, height:size, margin:"0 auto" }}>
        <svg width={size} height={size} style={{ position:"absolute", top:0, left:0, pointerEvents:"none" }}>
          <circle cx={cx} cy={cy} r={104} fill="#f0f5ee" stroke="#c8d8c0" strokeWidth={2.5} />
          <circle cx={cx} cy={cy} r={86} fill="none" stroke="#e0ead8" strokeWidth={1} strokeDasharray="3 4" />
        </svg>
        {rings.map((ring,ri) => ring.map((p,i) => {
          const r = radii[ri];
          const angle = ri===0 ? 0 : (2*Math.PI*i/ring.length) - Math.PI/2;
          const x = cx + r*Math.cos(angle), y = cy + r*Math.sin(angle);
          const role = PLANT_ROLES.find(r=>r.id===p.role)||PLANT_ROLES[1];
          const sz = ri===0?42:ri===1?34:ri===2?28:22;
          return (
            <div key={`${ri}-${i}`} style={{ position:"absolute", width:sz, height:sz, borderRadius:"50%", border:`2.5px solid ${role.color}`, background:p.imageUrl?"transparent":role.color+"28", overflow:"hidden", left:x-sz/2, top:y-sz/2, boxShadow:"0 2px 5px rgba(0,0,0,0.12)" }}>
              {p.imageUrl ? <img src={p.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"} /> : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.4}}>🌸</div>}
            </div>
          );
        }))}
        <div style={{ position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", fontSize:10, color:"#7a8c74", fontWeight:600, background:"rgba(255,255,255,.85)", borderRadius:10, padding:"2px 8px", whiteSpace:"nowrap" }}>{total} plants</div>
      </div>
    );
  }

  return (
    <div style={{ width:size, margin:"0 auto", background:"linear-gradient(180deg,#f0f5ee,#e0ead8)", borderRadius:14, border:"2px solid #c8d8c0", padding:"16px 12px 12px", minHeight:130 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:5, justifyContent:"center", alignItems:"flex-end" }}>
        {slots.map((p,i) => {
          const role = PLANT_ROLES.find(r=>r.id===p.role)||PLANT_ROLES[1];
          const sz = p.role==="thriller"?42:p.role==="filler"?34:26;
          return <div key={i} style={{ width:sz, height:sz, borderRadius:"50%", border:`2.5px solid ${role.color}`, background:p.imageUrl?"transparent":role.color+"28", overflow:"hidden", boxShadow:"0 2px 5px rgba(0,0,0,0.1)" }}>{p.imageUrl?<img src={p.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.38}}>🌸</div>}</div>;
        })}
      </div>
      <div style={{ textAlign:"center", marginTop:8, fontSize:10, color:"#7a8c74", fontWeight:600 }}>{total} plants</div>
    </div>
  );
}

// ── COMPONENT ROW ─────────────────────────────────────────────────────────────

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
  const [speciesFilter, setSpeciesFilter]   = useState(plant._speciesFilter  || "");
  const [seriesQuery, setSeriesQuery]        = useState("");

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

function ComponentRow({ plant, index, onChange, onRemove }) {
  const [imgErr,     setImgErr]     = useState(false);
  const [dragging,   setDragging]   = useState(false);
  const [focusField, setFocusField] = useState(null);
  const role    = PLANT_ROLES.find(r=>r.id===plant.role)||PLANT_ROLES[1];
  const fileRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    // File dragged from file explorer
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = ev => { onChange("imageUrl", ev.target.result); setImgErr(false); };
        reader.readAsDataURL(file);
        return;
      }
    }
    // Image dragged from browser tab
    const url = e.dataTransfer.getData("text/uri-list")||e.dataTransfer.getData("text/plain")||e.dataTransfer.getData("URL");
    if (url && url.startsWith("http")) { onChange("imageUrl", url); setImgErr(false); }
  }, [onChange]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { onChange("imageUrl", ev.target.result); setImgErr(false); };
    reader.readAsDataURL(file);
  }, [onChange]);

  return (
    <div style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${role.color}22`, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
      <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
        {/* Photo — click to browse, drag file from desktop, or drag URL from browser */}
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFileInput} />
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
          onClick={()=>{ if(!plant.imageUrl||imgErr) fileRef.current?.click(); }}
          style={{ width:72, height:72, borderRadius:10, flexShrink:0, border:`2px dashed ${dragging?role.color:"#c8d8c0"}`, background:dragging?role.color+"14":"#f8faf6", overflow:"hidden", cursor:"pointer", position:"relative", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
          {plant.imageUrl && !imgErr
            ? <img src={plant.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setImgErr(true)} onClick={e=>{e.stopPropagation();onChange("imageUrl","");setImgErr(false);}} title="Click to remove" />
            : <div style={{textAlign:"center",padding:4}}><div style={{fontSize:20}}>📷</div><div style={{fontSize:8,color:"#aabba0",lineHeight:1.3}}>Tap or drop</div></div>
          }
          <div style={{ position:"absolute",top:3,left:3,width:16,height:16,borderRadius:"50%",background:role.color,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center" }}>{index+1}</div>
        </div>

        {/* Fields grid */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Catalog / Manual toggle */}
          <div style={{ display:"flex", gap:5, marginBottom:8 }}>
            <button onClick={()=>onChange("_useCatalog",true)}
              style={{ padding:"3px 12px", borderRadius:20, border:`1.5px solid ${plant._useCatalog?"#7fb069":"#dde8d5"}`, background:plant._useCatalog?"#f0f8eb":"#fff", color:plant._useCatalog?"#2e5c1e":"#9aaa90", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
              📋 Catalog
            </button>
            <button onClick={()=>onChange("_useCatalog",false)}
              style={{ padding:"3px 12px", borderRadius:20, border:`1.5px solid ${!plant._useCatalog?"#7fb069":"#dde8d5"}`, background:!plant._useCatalog?"#f0f8eb":"#fff", color:!plant._useCatalog?"#2e5c1e":"#9aaa90", fontWeight:700, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
              ✏️ Manual
            </button>
          </div>

          {plant._useCatalog && (
            <PlantCatalogPicker
              plant={plant}
              onChange={onChange}
            />
          )}

          <div style={{ display: plant._useCatalog ? "none" : "grid", gridTemplateColumns:"1.8fr 1fr 0.9fr 0.9fr 0.8fr 0.8fr auto", gap:8, alignItems:"end" }}>
            <div>
              <FL c="Variety" />
              <input value={plant.name||""} onChange={e=>onChange("name",e.target.value)} onFocus={()=>setFocusField("name")} onBlur={()=>setFocusField(null)} placeholder="Variety name..." style={{...IS(focusField==="name"),fontWeight:600}} />
            </div>
            <div>
              <FL c="Broker" />
              <ManualBrokerSelect value={plant.broker||""} onChange={v=>onChange("broker",v)} />
            </div>
            <div>
              <FL c="Form" />
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {FORM_TYPES.map(f=>(
                  <button key={f.id} onClick={()=>onChange("formType",f.id)} style={{flex:1,padding:"5px 0",borderRadius:6,border:`1.5px solid ${plant.formType===f.id?f.color:"#dde8d5"}`,background:plant.formType===f.id?f.bg:"#fff",color:plant.formType===f.id?f.color:"#9aaa90",fontWeight:700,fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FL c="Need By" />
              <input type="date" value={plant.needBy||""} onChange={e=>onChange("needBy",e.target.value)} onFocus={()=>setFocusField("nb")} onBlur={()=>setFocusField(null)} style={{...IS(focusField==="nb"),fontSize:12}} />
            </div>
            <div>
              <FL c="$/plant" />
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#9aaa90"}}>$</span>
                <input type="number" step="0.01" min="0" value={plant.costPerPlant||""} onChange={e=>onChange("costPerPlant",e.target.value)} onFocus={()=>setFocusField("cost")} onBlur={()=>setFocusField(null)} placeholder="0.00" style={{...IS(focusField==="cost"),paddingLeft:20}} />
              </div>
            </div>
            <div>
              <FL c="Qty/unit" />
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <button onClick={()=>onChange("qty",Math.max(1,(plant.qty||1)-1))} style={{width:26,height:34,borderRadius:6,border:"1.5px solid #dde8d5",background:"#fff",fontSize:16,cursor:"pointer",color:"#7a8c74",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <div style={{flex:1,textAlign:"center",fontWeight:800,fontSize:18,color:"#1e2d1a"}}>{plant.qty||1}</div>
                <button onClick={()=>onChange("qty",(plant.qty||1)+1)} style={{width:26,height:34,borderRadius:6,border:"1.5px solid #dde8d5",background:"#fff",fontSize:16,cursor:"pointer",color:"#7a8c74",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              </div>
            </div>
            <div style={{paddingBottom:2}}>
              <button onClick={onRemove} style={{width:30,height:34,borderRadius:7,border:"1.5px solid #f0d0c0",background:"#fff",color:"#e07b39",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
          </div>{/* end manual grid */}
          {/* Role + image URL row */}
          <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:4}}>
              {PLANT_ROLES.map(r=>(
                <button key={r.id} onClick={()=>onChange("role",r.id)} style={{padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:700,border:`1.5px solid ${plant.role===r.id?r.color:"#dde8d5"}`,background:plant.role===r.id?r.color+"18":"#fff",color:plant.role===r.id?r.color:"#aabba0",cursor:"pointer",fontFamily:"inherit"}}>
                  {r.emoji} {r.label}
                </button>
              ))}
            </div>
            <input value={plant.imageUrl||""} onChange={e=>{onChange("imageUrl",e.target.value);setImgErr(false);}} placeholder="Or paste image URL here..." style={{flex:1,padding:"4px 10px",borderRadius:7,border:"1.5px solid #dde8d5",fontSize:11,color:"#9aaa90",outline:"none",fontFamily:"inherit",minWidth:160}} />
            {plant.costPerPlant && <div style={{fontSize:12,color:"#4a7a35",fontWeight:700,whiteSpace:"nowrap"}}>${(Number(plant.costPerPlant)*(plant.qty||1)).toFixed(2)}/unit</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LOT MATERIALS PANEL ───────────────────────────────────────────────────────
// Container, soil, tag selectors with cost display
function LotMaterials({ lot, onChange, containers, soilMixes, tags }) {
  const [focus, setFocus] = useState(null);

  // Derived selections
  const selContainer = containers.find(c=>c.id===lot.containerId);
  const selSoil      = soilMixes.find(s=>s.id===lot.soilId);
  const selTag       = tags.find(t=>t.id===lot.tagId);

  // Filter to finished containers only (not trays)
  const finishedContainers = containers.filter(c=>c.kind==="finished");

  // Soil cost per unit (needs substrateVol from container if available)
  const soilCpf = selSoil ? soilCostPerCuFt(selSoil) : null;
  const substrateVolCuFt = selContainer?.substrateVol
    ? (selContainer.substrateUnit==="pt"    ? Number(selContainer.substrateVol)/51.43
     : selContainer.substrateUnit==="qt"    ? Number(selContainer.substrateVol)/25.71
     : selContainer.substrateUnit==="gal"   ? Number(selContainer.substrateVol)*0.134
     : selContainer.substrateUnit==="cu in" ? Number(selContainer.substrateVol)/1728
     : selContainer.substrateUnit==="L"     ? Number(selContainer.substrateVol)*0.0353
     : Number(selContainer.substrateVol))
    : null;
  const soilCostPerUnit = soilCpf && substrateVolCuFt ? soilCpf * substrateVolCuFt : null;

  return (
    <div style={{ background:"#f8faf6", borderRadius:16, border:"1.5px solid #e0ead8", padding:"20px 22px", marginBottom:24 }}>
      <SH c="Materials" />

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:20 }}>

        {/* ── CONTAINER ── */}
        <div>
          <FL c="Container" />
          <select value={lot.containerId||""} onChange={e=>onChange("containerId",e.target.value)}
            style={{...IS(false), marginBottom:8}}>
            <option value="">— Select container —</option>
            {finishedContainers.map(c=>(
              <option key={c.id} value={c.id}>
                {c.name}{c.diameter?` (${c.diameter}")`:""}
              </option>
            ))}
          </select>
          {selContainer && (
            <div style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e0ead8", padding:"10px 14px" }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a", marginBottom:6 }}>{selContainer.name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
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
          <select value={lot.soilId||""} onChange={e=>onChange("soilId",e.target.value)}
            style={{...IS(false), marginBottom:8}}>
            <option value="">— Select soil mix —</option>
            {soilMixes.map(s=>(
              <option key={s.id} value={s.id}>{s.name}{s.category?` · ${s.category}`:""}</option>
            ))}
          </select>
          {selSoil && (
            <div style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e0ead8", padding:"10px 14px" }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a", marginBottom:6 }}>{selSoil.name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {selSoil.vendor && <CostPill label="Vendor" value={selSoil.vendor} color="#7a8c74" />}
                {selSoil.bagSize && <CostPill label="Bag" value={`${selSoil.bagSize} ${selSoil.bagUnit}`} color="#c8791a" />}
                {soilCpf && <CostPill label="$/cu ft" value={`$${soilCpf.toFixed(3)}`} color="#4a7a35" />}
                {soilCostPerUnit && <CostPill label="$/unit" value={`$${soilCostPerUnit.toFixed(3)}`} color="#8e44ad" />}
              </div>
              {!substrateVolCuFt && selContainer && (
                <div style={{ fontSize:10, color:"#c8791a", marginTop:6 }}>💡 Add substrate volume to container for per-unit soil cost</div>
              )}
              {!selContainer && soilCpf && (
                <div style={{ fontSize:10, color:"#9aaa90", marginTop:6 }}>Select a container to calculate per-unit soil cost</div>
              )}
            </div>
          )}
        </div>

        {/* ── TAG ── */}
        <div>
          <FL c="Tag" />
          <select value={lot.tagId||""} onChange={e=>onChange("tagId",e.target.value)}
            style={{...IS(false), marginBottom:8}}>
            <option value="">— Select tag —</option>
            {tags.map(t=>(
              <option key={t.id} value={t.id}>{t.name}{t.tier?` · ${t.tier}`:""}</option>
            ))}
          </select>
          {selTag && (
            <div style={{ background:"#fff", borderRadius:10, border:"1.5px solid #e0ead8", padding:"10px 14px", marginBottom:8 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a", marginBottom:6 }}>{selTag.name}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {selTag.tier && <CostPill label="Tier" value={selTag.tier} color={selTag.tier==="retail"?"#c8791a":"#7a8c74"} />}
                {selTag.type && <CostPill label="Type" value={selTag.type} color="#4a90d9" />}
                {selTag.costPerUnit && <CostPill label="$/tag" value={`$${Number(selTag.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
                {selTag.printSpec && <CostPill label="Print file" value={selTag.printSpec} color="#2e7d9e" />}
              </div>
            </div>
          )}
          {/* Tag description — always show */}
          <div style={{ marginTop: selTag ? 0 : 8 }}>
            <FL c="Tag Description / Print Copy" />
            <textarea value={lot.tagDescription||""} onChange={e=>onChange("tagDescription",e.target.value)}
              onFocus={()=>setFocus("td")} onBlur={()=>setFocus(null)}
              placeholder={"e.g.\nTropical Sunset™ Hanging Basket\nFull Sun · Water regularly\nSchlegel Greenhouse / Hoosier Boy"}
              style={{...IS(focus==="td"), minHeight:80, resize:"vertical", fontSize:12, lineHeight:1.5}} />
            <div style={{ fontSize:10, color:"#9aaa90", marginTop:3 }}>This copy will appear on printed tags for this lot</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small pill for material details
function CostPill({ label, value, color }) {
  return (
    <div style={{ background: color+"12", border:`1px solid ${color}30`, borderRadius:6, padding:"3px 8px" }}>
      <span style={{ fontSize:9, color:"#9aaa90", textTransform:"uppercase", letterSpacing:.5 }}>{label} </span>
      <span style={{ fontSize:11, fontWeight:700, color }}>{value}</span>
    </div>
  );
}

// ── COST ROLLUP BAR ───────────────────────────────────────────────────────────
function CostRollup({ plants, lot, containers, soilMixes, tags }) {
  const selContainer = containers.find(c=>c.id===lot.containerId);
  const selSoil      = soilMixes.find(s=>s.id===lot.soilId);
  const selTag       = tags.find(t=>t.id===lot.tagId);

  const plantCost = plants.reduce((s,p)=>s+(Number(p.costPerPlant||0)*(p.qty||1)),0);
  const containerCost = selContainer?.costPerUnit ? Number(selContainer.costPerUnit) : 0;
  const tagCost = selTag?.costPerUnit ? Number(selTag.costPerUnit) : 0;
  const trayCost   = selContainer?.hasCarrier ? (Number(selContainer.carrierCost)||0) / Math.max(Number(selContainer.potsPerCarrier)||1, 1) : 0;
  const wireCost   = selContainer?.hasWire    ? (Number(selContainer.wireCost)||0)       : 0;
  const saucerCost = selContainer?.hasSaucer  ? (Number(selContainer.saucerCost)||0)     : 0;
  const sleeveCost = selContainer?.hasSleeve  ? (Number(selContainer.sleeveCost)||0)     : 0;
  const hbTagCost  = selContainer?.isHBTagged ? (Number(selContainer.tagCostPerUnit)||0) : 0;
  const accessoryCost = trayCost + wireCost + saucerCost + sleeveCost + hbTagCost;

  const soilCpf = selSoil ? soilCostPerCuFt(selSoil) : null;
  const substrateVolCuFt = selContainer?.substrateVol
    ? (selContainer.substrateUnit==="pt"    ? Number(selContainer.substrateVol)/51.43
     : selContainer.substrateUnit==="qt"    ? Number(selContainer.substrateVol)/25.71
     : selContainer.substrateUnit==="gal"   ? Number(selContainer.substrateVol)*0.134
     : selContainer.substrateUnit==="cu in" ? Number(selContainer.substrateVol)/1728
     : selContainer.substrateUnit==="L"     ? Number(selContainer.substrateVol)*0.0353
     : Number(selContainer.substrateVol))
    : null;
  const soilCost = soilCpf && substrateVolCuFt ? soilCpf * substrateVolCuFt : 0;

  const totalPerUnit = plantCost + containerCost + soilCost + tagCost + accessoryCost;
  const comboQty = Number(lot.qty) || Number(lot.totalQty) || 0;
  const totalMaterial = totalPerUnit * comboQty;

  const items = [
    { label:"Plants",    value: plantCost,     color:"#7fb069",  show: plantCost>0 },
    { label:"Container", value: containerCost, color:"#4a90d9",  show: containerCost>0 },
    { label:"Tray",      value: trayCost,       color:"#2e7d9e",  show: trayCost>0 },
    { label:"Wire",      value: wireCost,       color:"#5a5a40",  show: wireCost>0 },
    { label:"Saucer",    value: saucerCost,     color:"#7b3fa0",  show: saucerCost>0 },
    { label:"Sleeve",    value: sleeveCost,     color:"#2a6a20",  show: sleeveCost>0 },
    { label:"Soil",      value: soilCost,       color:"#c8791a",  show: soilCost>0 },
    { label:"Tag",       value: tagCost,        color:"#8e44ad",  show: tagCost>0 },
    { label:"HB Tag",    value: hbTagCost,      color:"#1e2d1a",  show: hbTagCost>0 },
  ].filter(i=>i.show);

  if (items.length===0) return null;

  return (
    <div style={{ background:"linear-gradient(135deg,#1e2d1a,#2e4a22)", borderRadius:14, padding:"16px 22px", display:"flex", gap:20, flexWrap:"wrap", alignItems:"center" }}>
      {items.map(item=>(
        <div key={item.label} style={{ minWidth:80 }}>
          <div style={{ fontSize:10, color:item.color, textTransform:"uppercase", letterSpacing:.8, marginBottom:3 }}>{item.label}</div>
          <div style={{ fontSize:18, fontWeight:800, color:"#fff" }}>${item.value.toFixed(3)}</div>
        </div>
      ))}
      <div style={{ width:"1px", background:"rgba(255,255,255,.15)", alignSelf:"stretch" }} />
      <div style={{ minWidth:100 }}>
        <div style={{ fontSize:10, color:"#7fb069", textTransform:"uppercase", letterSpacing:.8, marginBottom:3 }}>Total / unit</div>
        <div style={{ fontSize:24, fontWeight:900, color:"#fff" }}>${totalPerUnit.toFixed(2)}</div>
      </div>
      {comboQty>0 && (
        <div style={{ minWidth:100 }}>
          <div style={{ fontSize:10, color:"#7fb069", textTransform:"uppercase", letterSpacing:.8, marginBottom:3 }}>Total ({comboQty.toLocaleString()} units)</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#c8e6b8" }}>${totalMaterial.toFixed(0)}</div>
        </div>
      )}
    </div>
  );
}

// ── SINGLE COMBO EDITOR ───────────────────────────────────────────────────────
// ── COMBO NAME GENERATOR ──────────────────────────────────────────────────────
function ComboNameGenerator({ plants, containerType, onSelect, onClose }) {
  const [names, setNames]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [picked, setPicked]     = useState(null);

  const plantSummary = plants
    .filter(p => p.name || p.cultivar)
    .map(p => `${p.role}: ${[p.cultivar, p.name].filter(Boolean).join(" ")}${p.color ? " ("+p.color+")" : ""}`.trim())
    .join(", ");

  const generate = async () => {
    setLoading(true); setError(null); setNames([]); setPicked(null);
    try {
      const prompt = `You are a creative director for a premium wholesale greenhouse called Hoosier Boy in Indianapolis. Generate 6 evocative, marketable combo planter names for a ${containerType||"combo pot"} with these plants:\n\n${plantSummary||"mixed annuals"}\n\nRules:\n- Names 2-4 words, poetic and sellable to garden center customers\n- Mix styles: nature-inspired, mood/feeling, place names, bold/punchy\n- DO NOT use plant names directly — evoke the colors and feel\n- Return ONLY a JSON array of 6 strings, nothing else, no markdown\n\nExample: ["Copper Sunset","Prairie Fire","Twilight Garden","Bold & Brilliant","Summer Storm","Indigo Nights"]`;
      const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY || "";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API error ${response.status}`);
      }
      const data = await response.json();
      const text = data.content?.find(b => b.type === "text")?.text || "[]";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setNames(Array.isArray(parsed) ? parsed : []);
    } catch(e) { setError("Couldn't generate names — try again"); }
    setLoading(false);
  };

  useEffect(() => { generate(); }, []);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:460, padding:"28px", boxShadow:"0 8px 40px rgba(0,0,0,.2)", fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ display:"flex", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:"#1e2d1a" }}>✨ Name Generator</div>
            <div style={{ fontSize:12, color:"#7a8c74", marginTop:2 }}>AI names based on your plants</div>
          </div>
          <button onClick={onClose} style={{ marginLeft:"auto", background:"none", border:"none", fontSize:24, color:"#aabba0", cursor:"pointer", lineHeight:1 }}>×</button>
        </div>

        {plantSummary && (
          <div style={{ background:"#f8faf6", borderRadius:10, border:"1px solid #e0ead8", padding:"8px 12px", marginBottom:16, fontSize:12, color:"#7a8c74", lineHeight:1.6 }}>
            {plantSummary}
          </div>
        )}

        {loading && (
          <div style={{ textAlign:"center", padding:"36px 0" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🌸</div>
            <div style={{ fontSize:13, color:"#7a8c74" }}>Crafting names for your combo...</div>
          </div>
        )}

        {error && <div style={{ background:"#fde8e8", border:"1px solid #f0c0c0", borderRadius:10, padding:"12px 14px", marginBottom:16, fontSize:13, color:"#c03030" }}>{error}</div>}

        {!loading && names.length > 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:18 }}>
            {names.map((name, i) => (
              <button key={i} onClick={() => setPicked(name)}
                style={{ padding:"11px 16px", borderRadius:10, border:`2px solid ${picked===name?"#7fb069":"#e0ead8"}`, background:picked===name?"#f0f8eb":"#fff", textAlign:"left", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:10, transition:"all .1s" }}
                onMouseEnter={e => { if(picked!==name){e.currentTarget.style.borderColor="#c8d8c0";e.currentTarget.style.background="#fafcf8";}}}
                onMouseLeave={e => { if(picked!==name){e.currentTarget.style.borderColor="#e0ead8";e.currentTarget.style.background="#fff";}}}>
                <span style={{ fontSize:14, color:picked===name?"#7fb069":"#d0ddc8" }}>{picked===name?"●":"○"}</span>
                <span style={{ fontSize:15, fontWeight:700, color:picked===name?"#1e2d1a":"#4a5a40" }}>{name}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={generate} disabled={loading}
            style={{ padding:"11px 16px", borderRadius:10, border:"1.5px solid #c8d8c0", background:"#fff", color:"#7a8c74", fontWeight:700, fontSize:13, cursor:loading?"wait":"pointer", fontFamily:"inherit" }}>
            ↻ New Names
          </button>
          <button onClick={() => picked && onSelect(picked)} disabled={!picked}
            style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", background:picked?"#1e2d1a":"#e0ead8", color:picked?"#fff":"#aabba0", fontWeight:800, fontSize:14, cursor:picked?"pointer":"default", fontFamily:"inherit", transition:"background .15s" }}>
            {picked ? `Use "${picked}"` : "Select a name"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComboEditor({ combo, onChange, lotQty, containerType, containers, soilMixes, tags }) {
  const [showNameGen, setShowNameGen] = useState(false);
  const plants = combo.plants || [];
  const totalPlantsPerUnit = plants.reduce((s,p)=>s+(p.qty||1),0);

  const updPlant = (idx,field,val) => {
    const updated=[...plants]; updated[idx]={...updated[idx],[field]:val};
    onChange({...combo,plants:updated});
  };
  const addPlant = () => {
    if(plants.length>=10) return;
    onChange({...combo,plants:[...plants,{id:uid(),name:"",imageUrl:"",role:"filler",qty:1,costPerPlant:"",broker:"",formType:"URC",needBy:""}]});
  };
  const removePlant = (idx) => onChange({...combo,plants:plants.filter((_,i)=>i!==idx)});

  // Determine preview type from selected container
  const selContainer = containers.find(c=>c.id===combo.containerId);
  const isBasket = selContainer?.type==="basket" || combo.containerId==null;

  return (
    <div>
      {/* Combo name + qty */}
      <div style={{display:"flex",gap:14,marginBottom:18,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:2,minWidth:200}}>
          <FL c="Combo Name" />
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input value={combo.name||""} onChange={e=>onChange({...combo,name:e.target.value})} placeholder='e.g. "Tropical Sunset"' style={{...IS(false),fontWeight:700,fontSize:14,flex:1}} />
            <button onClick={()=>setShowNameGen(true)} title="Generate name ideas with AI"
              style={{padding:"10px 14px",borderRadius:10,border:"1.5px solid #c8d8c0",background:"#f8faf6",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#f0f8eb";e.currentTarget.style.borderColor="#7fb069";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#f8faf6";e.currentTarget.style.borderColor="#c8d8c0";}}>
              ✨
            </button>
          </div>
        </div>
        {showNameGen && (
          <ComboNameGenerator
            plants={plants}
            containerType={containerType}
            onSelect={name => { onChange({...combo, name}); setShowNameGen(false); }}
            onClose={() => setShowNameGen(false)}
          />
        )}
        <div style={{minWidth:130}}>
          <FL c="Quantity (this combo)" />
          <input type="number" min="1" value={combo.qty||""} onChange={e=>onChange({...combo,qty:Number(e.target.value)})} placeholder={String(lotQty||"")} style={{...IS(false),fontWeight:700,fontSize:15,textAlign:"center"}} />
          {lotQty>0 && <div style={{fontSize:10,color:"#9aaa90",marginTop:2,textAlign:"center"}}>of {lotQty} total</div>}
        </div>
        {totalPlantsPerUnit>0 && (
          <div style={{background:"#f0f8eb",borderRadius:10,padding:"8px 14px",textAlign:"center"}}>
            <div style={{fontSize:20,fontWeight:900,color:"#2e5c1e"}}>{totalPlantsPerUnit}</div>
            <div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>plants/unit</div>
          </div>
        )}
      </div>

      {/* Materials panel — per combo so each combo can have its own container/soil/tag */}
      <LotMaterials
        lot={combo}
        onChange={(f,v)=>onChange({...combo,[f]:v})}
        containers={containers}
        soilMixes={soilMixes}
        tags={tags}
      />

      {/* Visual + components */}
      <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:20}}>
        {/* Preview */}
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#9aaa90",textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Preview</div>
          <div style={{background:"#f8faf6",borderRadius:14,border:"1.5px solid #e0ead8",padding:16}}>
            {plants.length===0
              ? <div style={{textAlign:"center",padding:"30px 0",color:"#aabba0"}}><div style={{fontSize:32,marginBottom:6}}>🌸</div><div style={{fontSize:11}}>Add plants to preview</div></div>
              : <ComboVisual plants={plants} isBasket={isBasket} />
            }
          </div>
          {plants.length>0 && (
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4}}>
              {PLANT_ROLES.filter(r=>plants.some(p=>p.role===r.id)).map(r=>{
                const count=plants.filter(p=>p.role===r.id).reduce((s,p)=>s+(p.qty||1),0);
                return <div key={r.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"4px 8px",background:r.color+"12",borderRadius:6}}><span style={{color:r.color,fontWeight:700}}>{r.emoji} {r.label}</span><span style={{color:"#7a8c74"}}>{count}</span></div>;
              })}
            </div>
          )}
        </div>

        {/* Components */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:700,color:"#9aaa90",textTransform:"uppercase",letterSpacing:.7}}>Plants ({plants.length}/10)</div>
            <button onClick={addPlant} disabled={plants.length>=10} style={{background:plants.length>=10?"#f0f0f0":"#7fb069",color:plants.length>=10?"#aabba0":"#fff",border:"none",borderRadius:9,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:plants.length>=10?"not-allowed":"pointer",fontFamily:"inherit"}}>
              + Add Plant
            </button>
          </div>
          {plants.length===0 && (
            <div style={{textAlign:"center",padding:"32px 20px",background:"#f8faf6",borderRadius:14,border:"2px dashed #c8d8c0"}}>
              <div style={{fontSize:32,marginBottom:8}}>🌿</div>
              <div style={{fontSize:13,fontWeight:700,color:"#4a5a40",marginBottom:6}}>No plants yet</div>
              <div style={{fontSize:12,color:"#7a8c74",marginBottom:14,lineHeight:1.5}}>Drag photos from supplier sites or paste a URL.</div>
              <button onClick={addPlant} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:10,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add First Plant</button>
            </div>
          )}
          {plants.map((plant,idx)=>(
            <ComponentRow key={plant.id} plant={plant} index={idx} onChange={(f,v)=>updPlant(idx,f,v)} onRemove={()=>removePlant(idx)} />
          ))}
        </div>
      </div>

      {/* Cost rollup */}
      {plants.length>0 && (
        <div style={{marginTop:20}}>
          <CostRollup plants={plants} lot={{...combo, totalQty: combo.qty||lotQty}} containers={containers} soilMixes={soilMixes} tags={tags} />
        </div>
      )}
    </div>
  );
}

// ── ORDER SUMMARY MODAL ───────────────────────────────────────────────────────
function OrderSummary({ lot, onClose, onMarkOrdered, containers, soilMixes, tags }) {
  const [copied, setCopied] = useState(null);

  const brokerMap = {};
  (lot.combos||[]).forEach(combo=>{
    const qty = combo.qty || lot.totalQty || 0;
    (combo.plants||[]).forEach(p=>{
      if(!p.name) return;
      const broker = p.broker||"Unassigned";
      if(!brokerMap[broker]) brokerMap[broker]=[];
      const existing = brokerMap[broker].find(x=>x.name===p.name&&x.formType===p.formType&&x.needBy===p.needBy);
      if(existing) existing.totalQty += (p.qty||1)*qty;
      else brokerMap[broker].push({name:p.name,formType:p.formType,needBy:p.needBy,costPerPlant:p.costPerPlant,totalQty:(p.qty||1)*qty,comboName:combo.name||lot.name});
    });
  });

  const brokers = Object.keys(brokerMap).sort();
  const grandTotal = brokers.reduce((s,b)=>s+brokerMap[b].reduce((ss,p)=>ss+(Number(p.costPerPlant||0)*p.totalQty),0),0);

  // Per-combo material summary
  const materialRows = (lot.combos||[]).map(combo=>{
    const qty = combo.qty||lot.totalQty||0;
    const selContainer = containers.find(c=>c.id===combo.containerId);
    const selSoil      = soilMixes.find(s=>s.id===combo.soilId);
    const selTag       = tags.find(t=>t.id===combo.tagId);
    const soilCpf      = selSoil ? soilCostPerCuFt(selSoil) : null;
    const substrateVolCuFt = selContainer?.substrateVol
      ? (selContainer.substrateUnit==="qt"?Number(selContainer.substrateVol)/25.71
        :selContainer.substrateUnit==="gal"?Number(selContainer.substrateVol)*0.134
        :selContainer.substrateUnit==="cu in"?Number(selContainer.substrateVol)/1728
        :selContainer.substrateUnit==="L"?Number(selContainer.substrateVol)*0.0353
        :Number(selContainer.substrateVol)) : null;
    const soilCost = soilCpf && substrateVolCuFt ? soilCpf*substrateVolCuFt : 0;
    const containerCost = selContainer?.costPerUnit ? Number(selContainer.costPerUnit) : 0;
    const tagCost = selTag?.costPerUnit ? Number(selTag.costPerUnit) : 0;
    const plantCost = (combo.plants||[]).reduce((s,p)=>s+(Number(p.costPerPlant||0)*(p.qty||1)),0);
    const accessoryCost2 = (selContainer?.hasCarrier?(Number(selContainer.carrierCost)||0)/Math.max(Number(selContainer.potsPerCarrier)||1,1):0)
                         + (selContainer?.hasWire?(Number(selContainer.wireCost)||0):0)
                         + (selContainer?.hasSaucer?(Number(selContainer.saucerCost)||0):0)
                         + (selContainer?.hasSleeve?(Number(selContainer.sleeveCost)||0):0)
                         + (selContainer?.isHBTagged?(Number(selContainer.tagCostPerUnit)||0):0);
    const totalPerUnit = plantCost+containerCost+soilCost+tagCost+accessoryCost2;
    return { combo, qty, selContainer, selSoil, selTag, plantCost, containerCost, soilCost, tagCost, accessoryCost: accessoryCost2, totalPerUnit, totalCost: totalPerUnit*qty };
  });

  const grandMaterialTotal = materialRows.reduce((s,r)=>s+r.totalCost,0);

  const buildEmail = (broker) => {
    const lines = brokerMap[broker];
    return `Hi,\n\nPlease see our young plant order for the ${lot.name||"upcoming"} production run.\n\nORDER DATE: ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}\nACCOUNT: Schlegel Greenhouse / Hoosier Boy\n\n${lines.map(p=>`${p.name} | ${p.formType} | Qty: ${p.totalQty.toLocaleString()} | Need by: ${p.needBy||"TBD"}${p.costPerPlant?` | $${Number(p.costPerPlant).toFixed(2)}/unit`:""}`).join("\n")}\n\nTotal: ${lines.reduce((s,p)=>s+(Number(p.costPerPlant||0)*p.totalQty),0).toLocaleString("en-US",{style:"currency",currency:"USD"})}\n\nPlease confirm availability and ship dates. Thank you.\n\nSchlegel Greenhouse`;
  };
  const copyEmail = (broker) => { navigator.clipboard.writeText(buildEmail(broker)); setCopied(broker); setTimeout(()=>setCopied(null),2000); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:820,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",padding:"22px 28px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"Georgia,serif",fontSize:20,color:"#c8e6b8"}}>Order Summary</div>
            <div style={{fontSize:12,color:"#7fb069",marginTop:3}}>{lot.name} · {brokers.length} broker{brokers.length!==1?"s":""}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",color:"#c8e6b8",borderRadius:10,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
        </div>
        <div style={{padding:"24px 28px"}}>

          {/* Material cost summary per combo */}
          {materialRows.length>0 && (
            <div style={{marginBottom:24}}>
              <SH c="Material Cost Summary" />
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:"#f0f5ee"}}>
                    {["Combo","Qty","Container","Soil","Tag","Plants","Total/unit","Total"].map(h=>(
                      <th key={h} style={{padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.4}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materialRows.map((r,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #e8ede4"}}>
                      <td style={{padding:"9px 12px",fontWeight:700,color:"#1e2d1a"}}>{r.combo.name||`Combo ${i+1}`}</td>
                      <td style={{padding:"9px 12px",color:"#7a8c74"}}>{r.qty}</td>
                      <td style={{padding:"9px 12px",color:"#4a90d9"}}>{r.selContainer?.name||"—"}{r.containerCost>0?<span style={{color:"#4a90d9",fontWeight:700}}> ${r.containerCost.toFixed(3)}</span>:""}</td>
                      <td style={{padding:"9px 12px",color:"#c8791a"}}>{r.selSoil?.name||"—"}{r.soilCost>0?<span style={{fontWeight:700}}> ${r.soilCost.toFixed(3)}</span>:""}</td>
                      <td style={{padding:"9px 12px",color:"#8e44ad"}}>{r.selTag?.name||"—"}{r.tagCost>0?<span style={{fontWeight:700}}> ${r.tagCost.toFixed(3)}</span>:""}</td>
                      <td style={{padding:"9px 12px",color:"#7fb069",fontWeight:700}}>${r.plantCost.toFixed(2)}</td>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#1e2d1a"}}>${r.totalPerUnit.toFixed(2)}</td>
                      <td style={{padding:"9px 12px",fontWeight:800,color:"#4a7a35"}}>${r.totalCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tag descriptions */}
          {(lot.combos||[]).some(c=>c.tagDescription) && (
            <div style={{marginBottom:24}}>
              <SH c="Tag Descriptions" />
              {(lot.combos||[]).filter(c=>c.tagDescription).map((c,i)=>(
                <div key={i} style={{background:"#f8faf6",borderRadius:10,border:"1.5px solid #e0ead8",padding:"12px 16px",marginBottom:10}}>
                  <div style={{fontWeight:700,fontSize:12,color:"#4a5a40",marginBottom:6}}>{c.name||`Combo ${i+1}`}</div>
                  <pre style={{margin:0,fontFamily:"inherit",fontSize:13,color:"#1e2d1a",whiteSpace:"pre-wrap"}}>{c.tagDescription}</pre>
                </div>
              ))}
            </div>
          )}

          {/* Plant orders by broker */}
          {brokers.length===0 && <div style={{textAlign:"center",padding:40,color:"#7a8c74"}}>No plants with brokers assigned yet.</div>}
          {brokers.map(broker=>{
            const lines = brokerMap[broker];
            const subtotal = lines.reduce((s,p)=>s+(Number(p.costPerPlant||0)*p.totalQty),0);
            return (
              <div key={broker} style={{marginBottom:20,background:"#f8faf6",borderRadius:14,border:"1.5px solid #e0ead8",overflow:"hidden"}}>
                <div style={{background:"#1e2d1a",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:800,fontSize:15,color:"#c8e6b8"}}>{broker}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:13,color:"#7fb069",fontWeight:700}}>${subtotal.toFixed(2)}</span>
                    <button onClick={()=>copyEmail(broker)} style={{background:copied===broker?"#4a7a35":"#7fb069",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      {copied===broker?"✓ Copied!":"📋 Copy Email Draft"}
                    </button>
                  </div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#f0f5ee"}}>
                    {["Variety","Form","Qty","Need By","$/unit","Subtotal"].map(h=>(
                      <th key={h} style={{padding:"8px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {lines.map((p,i)=>{
                      const ft=FORM_TYPES.find(f=>f.id===p.formType);
                      return (
                        <tr key={i} style={{borderTop:"1px solid #e8ede4"}}>
                          <td style={{padding:"10px 14px",fontWeight:700,color:"#1e2d1a"}}>{p.name}</td>
                          <td style={{padding:"10px 14px"}}>{ft&&<span style={{background:ft.bg,color:ft.color,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{ft.label}</span>}</td>
                          <td style={{padding:"10px 14px",fontWeight:800,fontSize:15,color:"#1e2d1a"}}>{p.totalQty.toLocaleString()}</td>
                          <td style={{padding:"10px 14px",color:"#7a8c74"}}>{p.needBy||"—"}</td>
                          <td style={{padding:"10px 14px",color:"#7a8c74"}}>{p.costPerPlant?`$${Number(p.costPerPlant).toFixed(2)}`:"—"}</td>
                          <td style={{padding:"10px 14px",fontWeight:700,color:"#4a7a35"}}>{p.costPerPlant?`$${(Number(p.costPerPlant)*p.totalQty).toFixed(2)}`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Grand total */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",borderRadius:14,padding:"18px 22px"}}>
            <div style={{display:"flex",gap:28}}>
              {grandMaterialTotal>0 && (
                <div>
                  <div style={{fontSize:11,color:"#7fb069",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Total Material Cost</div>
                  <div style={{fontSize:24,fontWeight:900,color:"#fff"}}>${grandMaterialTotal.toFixed(2)}</div>
                </div>
              )}
              {grandTotal>0 && (
                <div>
                  <div style={{fontSize:11,color:"#7fb069",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Plant Order Total</div>
                  <div style={{fontSize:24,fontWeight:900,color:"#c8e6b8"}}>${grandTotal.toFixed(2)}</div>
                </div>
              )}
            </div>
            <button onClick={()=>{onMarkOrdered();onClose();}} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(127,176,105,.4)"}}>
              ✓ Mark as Ordered
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LOT DESIGNER ─────────────────────────────────────────────────────────────
function LotDesigner({ initial, onSave, onCancel, containers, soilMixes, tags }) {
  const blankCombo = (name="") => ({ id:uid(), name, qty:null, plants:[], containerId:"", soilId:"", tagId:"", tagDescription:"" });
  const blank = { id:null, name:"", season:"", totalQty:"", status:"draft", notes:"", approvalNote:"", combos:[blankCombo()] };
  const [lot, setLot] = useState(initial ? dc({...blank,...initial}) : blank);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showOrder, setShowOrder] = useState(false);

  const updLot = (f,v) => setLot(x=>({...x,[f]:v}));
  const updCombo = (idx,combo) => setLot(x=>({...x,combos:x.combos.map((c,i)=>i===idx?combo:c)}));
  const addCombo = () => {
    const labels=["A","B","C","D","E","F","G","H"];
    const newCombo = blankCombo(`Combo ${labels[lot.combos.length]||lot.combos.length+1}`);
    setLot(x=>({...x,combos:[...x.combos,newCombo]}));
    setActiveIdx(lot.combos.length);
  };
  const removeCombo = (idx) => {
    if(lot.combos.length<=1) return;
    setLot(x=>({...x,combos:x.combos.filter((_,i)=>i!==idx)}));
    setActiveIdx(Math.max(0,idx-1));
  };

  const totalQty = Number(lot.totalQty)||0;
  const assignedQty = lot.combos.reduce((s,c)=>s+(Number(c.qty)||0),0);
  const remaining = totalQty - assignedQty;
  const status = STATUSES.find(s=>s.id===lot.status)||STATUSES[0];
  const effectiveLot = { ...lot, combos: lot.combos.map(c=> lot.combos.length===1 ? {...c,qty:totalQty} : c) };

  const handleSave = (newStatus) => {
    if(!lot.name.trim()) return;
    onSave({...effectiveLot, id:lot.id||uid(), status:newStatus||lot.status});
  };

  return (
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      {showOrder && <OrderSummary lot={{...effectiveLot,name:lot.name}} onClose={()=>setShowOrder(false)} onMarkOrdered={()=>handleSave("ordered")} containers={containers} soilMixes={soilMixes} tags={tags} />}

      {/* Header bar */}
      <div style={{background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",borderRadius:"20px 20px 0 0",padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <input value={lot.name} onChange={e=>updLot("name",e.target.value)} placeholder="Lot name, e.g. Spring 400 Hanging Baskets..."
              style={{background:"transparent",border:"none",borderBottom:"2px solid rgba(200,230,184,.4)",outline:"none",fontFamily:"Georgia,serif",fontSize:20,color:"#c8e6b8",width:"100%",paddingBottom:6,letterSpacing:.3}} />
            <div style={{fontSize:12,color:"#7fb069",marginTop:6,display:"flex",gap:10,flexWrap:"wrap"}}>
              {lot.season&&<span>🌱 {lot.season}</span>}
              {totalQty>0&&<span>· {totalQty.toLocaleString()} total</span>}
              {totalQty>0&&lot.combos.length>1&&<span style={{color:remaining===0?"#c8e6b8":remaining<0?"#f08080":"#f0c080"}}>{remaining===0?"✓ Fully assigned":remaining<0?`⚠️ ${Math.abs(remaining)} over`:`${remaining} unassigned`}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{background:status.bg,color:status.color,border:`1px solid ${status.color}55`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,alignSelf:"center"}}>{status.label}</span>
            {onCancel&&<button onClick={onCancel} style={{background:"rgba(255,255,255,.1)",color:"#c8e6b8",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>}
            <button onClick={()=>handleSave()} style={{background:"rgba(255,255,255,.15)",color:"#c8e6b8",border:"1px solid rgba(255,255,255,.25)",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>💾 Save</button>
            {lot.status==="draft"&&<button onClick={()=>handleSave("submitted")} style={{background:"#2e7d9e",color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Submit for Approval →</button>}
            {(lot.status==="approved"||lot.status==="submitted")&&<button onClick={()=>setShowOrder(true)} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 3px 10px rgba(127,176,105,.4)"}}>📦 View Order →</button>}
          </div>
        </div>
        {/* Season + qty */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:18,maxWidth:400}}>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Season</div>
            <input value={lot.season||""} onChange={e=>updLot("season",e.target.value)} placeholder="Spring 2026" style={{...IS(false),background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(200,230,184,.25)",color:"#c8e6b8",fontSize:13}} />
          </div>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Total Qty</div>
            <input type="number" min="1" value={lot.totalQty||""} onChange={e=>updLot("totalQty",e.target.value)} placeholder="e.g. 400" style={{...IS(false),background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(200,230,184,.25)",color:"#c8e6b8",fontSize:16,fontWeight:800,textAlign:"center"}} />
          </div>
        </div>
      </div>

      {/* Combo tabs */}
      <div style={{background:"#fff",borderRadius:"0 0 20px 20px",border:"2px solid #e0ead8",borderTop:"none"}}>
        <div style={{display:"flex",alignItems:"center",borderBottom:"2px solid #e0ead8",paddingLeft:20,overflowX:"auto"}}>
          {lot.combos.map((combo,idx)=>{
            const comboQty = lot.combos.length===1?totalQty:(combo.qty||0);
            const plantCount = (combo.plants||[]).reduce((s,p)=>s+(p.qty||1),0);
            const isActive = idx===activeIdx;
            const hasContainer = !!combo.containerId;
            return (
              <div key={combo.id} style={{display:"flex",alignItems:"center",borderBottom:`3px solid ${isActive?"#7fb069":"transparent"}`,marginBottom:-2,flexShrink:0}}>
                <button onClick={()=>setActiveIdx(idx)} style={{background:"none",border:"none",padding:"14px 18px 12px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:isActive?800:600,fontSize:14,color:isActive?"#1e2d1a":"#7a8c74"}}>{combo.name||`Combo ${idx+1}`}</span>
                  {comboQty>0&&<span style={{background:isActive?"#f0f8eb":"#f5f5f5",color:isActive?"#4a7a35":"#9aaa90",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>×{comboQty}</span>}
                  {plantCount>0&&<span style={{fontSize:10,color:"#9aaa90"}}>· {plantCount}🌸</span>}
                  {hasContainer&&<span style={{fontSize:10,color:"#4a90d9"}}>🪴</span>}
                </button>
                {lot.combos.length>1&&<button onClick={()=>removeCombo(idx)} style={{background:"none",border:"none",color:"#c8d8c0",fontSize:14,cursor:"pointer",paddingRight:12,paddingTop:2}}>×</button>}
              </div>
            );
          })}
          {lot.combos.length<8&&<button onClick={addCombo} style={{background:"none",border:"none",padding:"14px 16px",cursor:"pointer",fontFamily:"inherit",color:"#7fb069",fontWeight:700,fontSize:13,flexShrink:0}}>+ Add Combo</button>}
        </div>

        <div style={{padding:"24px 28px"}}>
          {lot.combos.length>1&&totalQty>0&&(
            <div style={{background:"#f8faf6",borderRadius:12,border:"1.5px solid #e0ead8",padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#4a5a40"}}>Allocation:</div>
              {lot.combos.map((c,i)=>(
                <div key={c.id} style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:12,color:"#7a8c74"}}>{c.name||`Combo ${i+1}`}:</span>
                  <span style={{fontWeight:800,fontSize:14,color:i===activeIdx?"#2e5c1e":"#1e2d1a"}}>{c.qty||0}</span>
                </div>
              ))}
              <div style={{marginLeft:"auto",fontSize:12,fontWeight:700,color:remaining===0?"#4a7a35":remaining<0?"#c03030":"#c8791a"}}>
                {remaining===0?"✓ Fully assigned":remaining<0?`⚠️ ${Math.abs(remaining)} over`:`${remaining} remaining`}
              </div>
            </div>
          )}

          <ComboEditor
            key={effectiveLot.combos[activeIdx]?.id}
            combo={effectiveLot.combos[activeIdx]||effectiveLot.combos[0]}
            onChange={(updated)=>updCombo(activeIdx,updated)}
            lotQty={totalQty}
            containers={containers}
            soilMixes={soilMixes}
            tags={tags}
          />
        </div>
      </div>
    </div>
  );
}

// ── LOT CARD ─────────────────────────────────────────────────────────────────
function LotCard({ lot, onEdit, onDelete, onDuplicate, onApprove, onRevision, onMarkRevised, isApprover, containers, soilMixes, tags }) {
  const status = STATUSES.find(s=>s.id===lot.status)||STATUSES[0];
  const allPlants = (lot.combos||[]).flatMap(c=>c.plants||[]);
  const hasPhotos = allPlants.some(p=>p.imageUrl);

  // Cost rollup across all combos
  const totalMaterial = (lot.combos||[]).reduce((sum,combo)=>{
    const qty = combo.qty||Number(lot.totalQty)||0;
    const selContainer = containers.find(c=>c.id===combo.containerId);
    const selSoil = soilMixes.find(s=>s.id===combo.soilId);
    const selTag = tags.find(t=>t.id===combo.tagId);
    const plantCost = (combo.plants||[]).reduce((s,p)=>s+(Number(p.costPerPlant||0)*(p.qty||1)),0);
    const containerCost = selContainer?.costPerUnit?Number(selContainer.costPerUnit):0;
    const tagCost = selTag?.costPerUnit?Number(selTag.costPerUnit):0;
    const soilCpf = selSoil?soilCostPerCuFt(selSoil):null;
    const subVol = selContainer?.substrateVol?(selContainer.substrateUnit==="qt"?Number(selContainer.substrateVol)/25.71:selContainer.substrateUnit==="gal"?Number(selContainer.substrateVol)*0.134:selContainer.substrateUnit==="cu in"?Number(selContainer.substrateVol)/1728:selContainer.substrateUnit==="L"?Number(selContainer.substrateVol)*0.0353:Number(selContainer.substrateVol)):null;
    const soilCost = soilCpf&&subVol?soilCpf*subVol:0;
    const acc = (selContainer?.hasCarrier?(Number(selContainer.carrierCost)||0)/Math.max(Number(selContainer.potsPerCarrier)||1,1):0)+(selContainer?.hasWire?(Number(selContainer.wireCost)||0):0)+(selContainer?.hasSaucer?(Number(selContainer.saucerCost)||0):0)+(selContainer?.hasSleeve?(Number(selContainer.sleeveCost)||0):0)+(selContainer?.isHBTagged?(Number(selContainer.tagCostPerUnit)||0):0);
    return sum + (plantCost+containerCost+soilCost+tagCost+acc)*qty;
  },0);

  const brokers = [...new Set(allPlants.map(p=>p.broker).filter(Boolean))];

  return (
    <div style={{background:"#fff",borderRadius:16,border:`2px solid ${status.color}33`,overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.05)"}}>
      {hasPhotos&&(
        <div style={{display:"flex",height:65,overflow:"hidden"}}>
          {allPlants.filter(p=>p.imageUrl).slice(0,6).map((p,i)=>(
            <div key={i} style={{flex:1,overflow:"hidden"}}><img src={p.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"} /></div>
          ))}
        </div>
      )}
      <div style={{padding:"16px 18px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#1e2d1a",marginBottom:3}}>{lot.name||"Untitled Lot"}</div>
            <div style={{fontSize:12,color:"#7a8c74"}}>{lot.season?`🌱 ${lot.season} · `:""}{lot.totalQty?`${Number(lot.totalQty).toLocaleString()} units`:""}</div>
          </div>
          <span style={{background:status.bg,color:status.color,border:`1px solid ${status.color}44`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>{status.label}</span>
        </div>
        {(lot.combos||[]).length>1&&(
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {(lot.combos||[]).map((c,i)=><div key={i} style={{background:"#f0f8eb",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#2e5c1e"}}>{c.name||`Combo ${i+1}`} ×{c.qty||0}</div>)}
          </div>
        )}
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          {totalMaterial>0&&<div style={{background:"#f5f0ff",borderRadius:8,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:"#6a3db0"}}>${totalMaterial.toFixed(0)}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase"}}>total material</div></div>}
          {brokers.length>0&&<div style={{background:"#e8f4f8",borderRadius:8,padding:"6px 12px"}}><div style={{fontSize:10,fontWeight:700,color:"#2e7d9e",marginBottom:2}}>Brokers</div><div style={{fontSize:12,color:"#1e2d1a"}}>{brokers.join(", ")}</div></div>}
        </div>
        {lot.approvalNote&&<div style={{background:"#fff8f0",border:"1px solid #f0c080",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#7a5010"}}>💬 {lot.approvalNote}</div>}
        {lot.changelog&&lot.changelog.length>0&&(
          <div style={{background:"#f5eeff",border:"1px solid #c8a8e840",borderRadius:8,padding:"8px 12px",marginBottom:12}}>
            <div style={{fontSize:10,fontWeight:800,color:"#7b3fa0",textTransform:"uppercase",letterSpacing:.5,marginBottom:5}}>Revision History</div>
            {lot.changelog.map((entry,i)=>(
              <div key={i} style={{fontSize:12,color:"#4a2a6a",padding:"3px 0",borderTop:i>0?"1px solid #e8d8f840":undefined}}>
                <span style={{color:"#9aaa90",marginRight:6}}>{entry.date}</span>{entry.note}
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>onEdit(lot)} style={{background:"#4a90d9",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit</button>
          <button onClick={()=>onDuplicate(lot)} style={{background:"none",color:"#7a8c74",border:"1px solid #c8d8c0",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Duplicate</button>
          {isApprover&&lot.status==="submitted"&&<>
            <button onClick={()=>onApprove(lot.id)} style={{background:"#4a7a35",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
            <button onClick={()=>onRevision(lot.id)} style={{background:"#c8791a",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩ Needs Revision</button>
          </>}
          {(lot.status==="approved"||lot.status==="revised")&&(
            <button onClick={()=>onMarkRevised(lot.id)} style={{background:"#7b3fa0",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✏️ Mark as Revised</button>
          )}
          <button onClick={()=>onDelete(lot.id)} style={{background:"none",color:"#e07b39",border:"1px solid #f0d0c0",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── WEEK → DATE HELPER (mirrors CropPlanning logic) ──────────────────────────
function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(s);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}
function fmtWeekDate(week, year) {
  if (!week || !year) return "—";
  return weekToDate(+week, +year).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function subtractWeeks(week, year, n) {
  let w = +week - n, y = +year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}
function computeRunSchedule(run) {
  const { targetWeek, targetYear, movesOutside, weeksIndoor, weeksOutdoor, weeksProp } = run;
  if (!targetWeek || !targetYear) return null;
  const totalFinish = (movesOutside ? (+weeksIndoor||0) + (+weeksOutdoor||0) : (+weeksIndoor||0));
  const transplantWk = subtractWeeks(targetWeek, targetYear, totalFinish);
  const prop = +weeksProp || 0;
  const seedWk = prop > 0 ? subtractWeeks(transplantWk.week, transplantWk.year, prop) : null;
  return {
    transplant: transplantWk,
    seed: seedWk,
    ready: { week: +targetWeek, year: +targetYear },
  };
}

// ── DESIGN QUEUE SCREEN ───────────────────────────────────────────────────────
function DesignQueue({ runs, containers, onStartDesign }) {
  const queued = runs.filter(r => r.status === "needs_design");

  if (queued.length === 0) {
    return (
      <div style={{ background: "#f8faf6", borderRadius: 16, border: "2px dashed #c8d8c0", padding: "32px 24px", marginBottom: 28, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4a5a40", marginBottom: 4 }}>No lots waiting on design</div>
        <div style={{ fontSize: 12, color: "#7a8c74" }}>When Tyler marks a crop run "Needs Design" it will appear here</div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#e07b39", textTransform: "uppercase", letterSpacing: .8 }}>
          🎨 Ready to Design
        </div>
        <div style={{ background: "#e07b39", color: "#fff", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>
          {queued.length}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {queued.map(run => {
          const sched = computeRunSchedule(run);
          const container = containers.find(c => c.id === run.containerId);
          const units = run.cases && run.packSize ? Number(run.cases) * Number(run.packSize) : null;
          const readyDate = sched ? fmtWeekDate(sched.ready.week, sched.ready.year) : null;
          const transplantDate = sched ? fmtWeekDate(sched.transplant.week, sched.transplant.year) : null;

          return (
            <div key={run.id} style={{ background: "#fff", borderRadius: 14, border: "2px solid #f0d8c0", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
              {/* Orange header */}
              <div style={{ background: "linear-gradient(135deg, #e07b39, #c8791a)", padding: "12px 16px" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#fff", marginBottom: 2 }}>
                  {run.cropName || "Unnamed Crop"}
                  {run.groupNumber ? <span style={{ fontSize: 12, fontWeight: 400, opacity: .8 }}> — Group {run.groupNumber}</span> : ""}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>
                  {container ? `${container.name}${container.diameter ? ` · ${container.diameter}"` : ""}` : "No container set"}
                </div>
              </div>

              <div style={{ padding: "14px 16px" }}>
                {/* Key dates + qty */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {units && (
                    <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#2e5c1e" }}>{units.toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Units</div>
                    </div>
                  )}
                  {readyDate && (
                    <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#2e5c1e" }}>{readyDate}</div>
                      <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Ready Wk {sched.ready.week}</div>
                    </div>
                  )}
                  {transplantDate && (
                    <div style={{ background: "#e8f4f8", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#2e7d9e" }}>{transplantDate}</div>
                      <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>Transplant</div>
                    </div>
                  )}
                </div>

                {run.notes && (
                  <div style={{ fontSize: 11, color: "#7a8c74", background: "#f8faf6", borderRadius: 7, padding: "6px 10px", marginBottom: 12, fontStyle: "italic" }}>
                    {run.notes}
                  </div>
                )}

                <button onClick={() => onStartDesign(run, sched, container, units)}
                  style={{ width: "100%", background: "linear-gradient(135deg, #e07b39, #c8791a)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  🎨 Start Designing →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function ComboLibrary() {
  const { rows: containers } = useContainers();
  const { rows: soilMixes  } = useSoilMixes();
  const { rows: runs        } = useCropRuns();
  const { rows: tags, insert: insertTag, remove: removeTag } = useComboTags();

  const { rows: lots, insert: insertLot, update: updateLot, remove: removeLot } = useCombos();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const isApprover = true;

  const saveLot = async (lot) => {
    if (editId) { await updateLot(editId, lot); }
    else { await insertLot({ ...lot, id: lot.id || uid() }); }
    setView("list"); setEditId(null);
  };
  const del  = async (id) => { if(window.confirm("Remove this lot?")) await removeLot(id); };
  const dup  = async (lot) => { await insertLot({...dc(lot), id:uid(), name:lot.name+" (Copy)", status:"draft"}); };
  const approve     = async (id) => { await updateLot(id, {status:"approved"}); };
  const revision    = async (id) => { await updateLot(id, {status:"revision"}); };
  const markRevised = async (id) => {
    const note = window.prompt("What did you change? (optional — leave blank to skip)");
    const lot = lots.find(l => l.id === id);
    const entry = { date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), note: note||"Revised by planner" };
    await updateLot(id, { status:"revised", changelog:[...(lot?.changelog||[]), entry] });
  };

  const shared = { containers, soilMixes, tags };

  // Pre-populate a new lot from a crop run
  const handleStartDesign = (run, sched, container, units) => {
    const needByDate = sched?.seed
      ? weekToDate(sched.seed.week, sched.seed.year).toISOString().slice(0, 10)
      : sched?.transplant
      ? weekToDate(sched.transplant.week, sched.transplant.year).toISOString().slice(0, 10)
      : "";

    const prefilled = {
      id: null,
      name: [run.cropName, run.groupNumber ? `Group ${run.groupNumber}` : null].filter(Boolean).join(" — "),
      season: `Spring ${sched?.ready.year || new Date().getFullYear()}`,
      totalQty: units || "",
      status: "draft",
      notes: run.notes || "",
      approvalNote: "",
      cropRunId: run.id,
      combos: [{
        id: uid(),
        name: "",
        qty: null,
        plants: [],
        containerId: run.containerId || "",
        soilId: "",
        tagId: "",
        tagDescription: "",
        // Store the need-by date so Mario can see it while designing
        suggestedNeedBy: needByDate,
        readyWeek: sched?.ready.week,
        readyYear: sched?.ready.year,
      }],
    };
    setEditId(null);
    // Pass prefilled lot into LotDesigner via a temporary state slot
    setPrefilledLot(prefilled);
    setView("add");
  };

  const [prefilledLot, setPrefilledLot] = useState(null);

  if (view==="add") return (
    <LotDesigner
      initial={prefilledLot || undefined}
      onSave={(lot) => { save(lot); setPrefilledLot(null); }}
      onCancel={() => { setView("list"); setPrefilledLot(null); }}
      {...shared}
    />
  );
  if (view==="edit") {
    const lot = lots.find(l=>l.id===editId);
    return lot ? <LotDesigner initial={lot} onSave={saveLot} onCancel={()=>{setView("list");setEditId(null);}} {...shared} /> : null;
  }

  const filtered = lots.filter(l=>statusFilter==="all"||l.status===statusFilter);
  const pending = lots.filter(l=>l.status==="submitted").length;
  const needsDesign = runs.filter(r=>r.status==="needs_design").length;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#1e2d1a"}}>Combo Designs</div>
          <div style={{fontSize:12,color:"#7a8c74",marginTop:2}}>{lots.length} lot{lots.length!==1?"s":""}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {needsDesign>0&&<div style={{background:"#fff4e8",border:"1.5px solid #f0c080",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#e07b39",fontWeight:700}}>🎨 {needsDesign} lot{needsDesign!==1?"s":""} need design</div>}
          {pending>0&&<div style={{background:"#e8f4f8",border:"1.5px solid #b0d8e8",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#2e7d9e",fontWeight:700}}>🔔 {pending} awaiting approval</div>}
          <button onClick={()=>{setPrefilledLot(null);setView("add");}} style={{background:"linear-gradient(135deg,#7fb069,#4a7a35)",color:"#fff",border:"none",borderRadius:12,padding:"10px 22px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(79,160,69,.3)"}}>+ New Combo Lot</button>
        </div>
      </div>

      {/* Design queue — always shown at top when there are runs waiting */}
      <DesignQueue runs={runs} containers={containers} onStartDesign={handleStartDesign} />

      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {[["all","All Statuses"],...STATUSES.map(s=>[s.id,s.label])].map(([id,label])=>{
          const s=STATUSES.find(x=>x.id===id);
          return <button key={id} onClick={()=>setStatusFilter(id)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${statusFilter===id?(s?.color||"#7fb069"):"#c8d8c0"}`,background:statusFilter===id?(s?.bg||"#f0f8eb"):"#fff",color:statusFilter===id?(s?.color||"#2e5c1e"):"#7a8c74",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>;
        })}
      </div>

      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"40px 20px",background:"#fafcf8",borderRadius:20,border:"2px dashed #c8d8c0"}}>
          <div style={{fontSize:52,marginBottom:16}}>🌸</div>
          <div style={{fontSize:18,fontWeight:800,color:"#4a5a40",marginBottom:8}}>No combo lots yet</div>
          <div style={{fontSize:13,color:"#7a8c74",marginBottom:24,lineHeight:1.6,maxWidth:400,margin:"0 auto 24px"}}>Design your combos here, or start from a lot in the queue above.</div>
          <button onClick={()=>{setPrefilledLot(null);setView("add");}} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>+ Create First Lot</button>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
          {filtered.map(lot=>(
            <LotCard key={lot.id} lot={lot} isApprover={isApprover} onEdit={()=>{setEditId(lot.id);setView("edit");}} onDelete={del} onDuplicate={dup} onApprove={approve} onRevision={revision} onMarkRevised={markRevised} {...shared} />
          ))}
        </div>
      )}
    </div>
  );
}
