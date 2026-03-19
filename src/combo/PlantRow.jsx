import React, { useState, useCallback, useRef } from "react";
import CatalogSlideOut from "./CatalogPicker";
import { ManualBrokerSelect } from "./CatalogPicker";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
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

// ── STYLE HELPERS ──────────────────────────────────────────────────────────────
const IS = (active) => ({
  width: "100%", padding: "8px 10px", borderRadius: 7,
  border: `1.5px solid ${active ? "#7fb069" : "#dde8d5"}`,
  background: "#fff", fontSize: 13, color: "#1e2d1a",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});

function FL({ c }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 3 }}>{c}</div>;
}

// ── PLANT ROW ──────────────────────────────────────────────────────────────────
function PlantRow({
  plant,
  index,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const [imgErr,       setImgErr    ] = useState(false);
  const [dragging,     setDragging  ] = useState(false);
  const [focusField,   setFocusField] = useState(null);
  const [showCatalog,  setShowCatalog] = useState(false);
  const [expanded,     setExpanded  ] = useState(false);
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

  // ── COLLAPSED SUMMARY ────────────────────────────────────────────────────────
  if (!expanded) {
    return (
      <div style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${role.color}22`, padding:"10px 14px", marginBottom:8, boxShadow:"0 1px 4px rgba(0,0,0,0.04)", display:"flex", alignItems:"center", gap:10 }}>
        {/* Thumbnail */}
        <div style={{ width:40, height:40, borderRadius:8, flexShrink:0, border:`2px solid ${role.color}44`, background:role.color+"14", overflow:"hidden", position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
          {plant.imageUrl && !imgErr
            ? <img src={plant.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setImgErr(true)} />
            : <div style={{fontSize:16}}>🌸</div>
          }
          <div style={{ position:"absolute",top:2,left:2,width:14,height:14,borderRadius:"50%",background:role.color,color:"#fff",fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center" }}>{index+1}</div>
        </div>

        {/* Summary text */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontWeight:700, fontSize:13, color:"#1e2d1a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {plant.name || <span style={{color:"#aabba0",fontStyle:"italic"}}>Unnamed plant</span>}
            </span>
            {plant.color && <span style={{ fontSize:11, color:"#7a8c74" }}>· {plant.color}</span>}
            <span style={{ fontSize:10, fontWeight:700, color:role.color, background:role.color+"14", border:`1px solid ${role.color}30`, borderRadius:10, padding:"1px 7px" }}>
              {role.emoji} {role.label}
            </span>
          </div>
          <div style={{ fontSize:11, color:"#9aaa90", marginTop:2 }}>
            Qty: <b style={{color:"#1e2d1a"}}>{plant.qty||1}</b>
            {plant.costPerPlant && <> · <b style={{color:"#4a7a35"}}>${(Number(plant.costPerPlant)*(plant.qty||1)).toFixed(2)}/unit</b></>}
            {plant.broker && <> · {plant.broker}</>}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
          <button onClick={onMoveUp} disabled={isFirst} title="Move up"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:isFirst?"default":"pointer", color:isFirst?"#dde8d5":"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▲</button>
          <button onClick={onMoveDown} disabled={isLast} title="Move down"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:isLast?"default":"pointer", color:isLast?"#dde8d5":"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▼</button>
          {onDuplicate && (
            <button onClick={onDuplicate} title="Duplicate"
              style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:"pointer", color:"#4a90d9", display:"flex", alignItems:"center", justifyContent:"center" }}>📋</button>
          )}
          <button onClick={onRemove} title="Remove"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #f0d0c0", background:"#fff", fontSize:14, cursor:"pointer", color:"#e07b39", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
          <button onClick={() => setExpanded(true)} title="Expand"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:"pointer", color:"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▼</button>
        </div>
      </div>
    );
  }

  // ── EXPANDED STATE ───────────────────────────────────────────────────────────
  return (
    <div style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${role.color}22`, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
      {/* Expanded header row with collapse + action buttons */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:role.color }}>
          <span style={{ background:role.color+"14", border:`1px solid ${role.color}30`, borderRadius:10, padding:"2px 9px" }}>{role.emoji} Plant {index+1}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <button onClick={onMoveUp} disabled={isFirst} title="Move up"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:isFirst?"default":"pointer", color:isFirst?"#dde8d5":"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▲</button>
          <button onClick={onMoveDown} disabled={isLast} title="Move down"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:isLast?"default":"pointer", color:isLast?"#dde8d5":"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▼</button>
          {onDuplicate && (
            <button onClick={onDuplicate} title="Duplicate"
              style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:"pointer", color:"#4a90d9", display:"flex", alignItems:"center", justifyContent:"center" }}>📋</button>
          )}
          <button onClick={onRemove} title="Remove"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #f0d0c0", background:"#fff", fontSize:14, cursor:"pointer", color:"#e07b39", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
          <button onClick={() => setExpanded(false)} title="Collapse"
            style={{ width:26, height:26, borderRadius:6, border:"1.5px solid #dde8d5", background:"#fff", fontSize:12, cursor:"pointer", color:"#7a8c74", display:"flex", alignItems:"center", justifyContent:"center" }}>▲</button>
        </div>
      </div>

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

          {plant._useCatalog && (<>
            {/* Show selected variety summary or browse button */}
            {plant._seriesName ? (
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"#f0f8eb", border:"1.5px solid #c8e0b8", borderRadius:9, padding:"7px 12px", marginBottom:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#1e2d1a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{plant._seriesName}{plant.color ? ` · ${plant.color}` : ""}</div>
                  <div style={{ fontSize:10, color:"#7a8c74" }}>{plant.broker}{plant.cultivar ? ` · ${plant.cultivar}` : ""}{plant.costPerPlant ? ` · $${Number(plant.costPerPlant).toFixed(4)}` : ""}</div>
                </div>
                <button onClick={() => setShowCatalog(true)}
                  style={{ background:"none", border:"1px solid #c8e0b8", borderRadius:7, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#2e5c1e", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  Change
                </button>
                <button onClick={() => { onChange("_seriesName",""); onChange("_catalogColors",[]); onChange("color",""); onChange("name",""); }}
                  style={{ background:"none", border:"none", color:"#aabba0", fontSize:16, cursor:"pointer", lineHeight:1, padding:0 }}>×</button>
              </div>
            ) : (
              <button onClick={() => setShowCatalog(true)}
                style={{ width:"100%", padding:"9px 0", borderRadius:9, border:"1.5px dashed #c8e0b8", background:"#fafcf8", color:"#2e5c1e", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit", marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>📋</span> Browse Catalog
              </button>
            )}

            {/* Slide-out catalog panel */}
            {showCatalog && (
              <CatalogSlideOut
                plant={plant}
                onChange={onChange}
                onClose={() => setShowCatalog(false)}
              />
            )}
          </>)}

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

export default PlantRow;
