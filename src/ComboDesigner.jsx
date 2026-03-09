import { useState, useCallback } from "react";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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

const CONTAINER_TYPES = [
  { id: "basket",  label: "Hanging Basket", icon: "🧺" },
  { id: "planter", label: "Combo Planter",  icon: "🪴" },
  { id: "window",  label: "Window Box",     icon: "📦" },
];

const STATUSES = [
  { id: "draft",     label: "Draft",               color: "#7a8c74", bg: "#f0f5ee" },
  { id: "submitted", label: "Submitted for Review", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "approved",  label: "Approved",             color: "#4a7a35", bg: "#e8f5e0" },
  { id: "revision",  label: "Needs Revision",       color: "#c8791a", bg: "#fff4e8" },
  { id: "ordered",   label: "Ordered",              color: "#1e2d1a", bg: "#c8e6b8" },
];

const BROKERS = [
  "Ball Seed", "Proven Winners", "Syngenta / Goldsmith",
  "PanAmerican Seed", "Dümmen Orange", "Selecta", "Other",
];

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

// ── VISUAL PREVIEW ────────────────────────────────────────────────────────────
function ComboVisual({ plants, containerType }) {
  const slots = [];
  plants.forEach(p => { for (let i = 0; i < (p.qty || 1); i++) slots.push(p); });
  const total = slots.length;
  const size = 220;
  const cx = size / 2, cy = size / 2;

  if (containerType !== "planter") {
    const rings = total <= 1 ? [slots] :
                  total <= 7 ? [slots.slice(0,1), slots.slice(1)] :
                  total <= 14 ? [slots.slice(0,1), slots.slice(1,7), slots.slice(7)] :
                  [slots.slice(0,1), slots.slice(1,7), slots.slice(7,13), slots.slice(13)];
    const radii = [0, 38, 72, 98].slice(0, rings.length);

    return (
      <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          <circle cx={cx} cy={cy} r={104} fill="#f0f5ee" stroke="#c8d8c0" strokeWidth={2.5} />
          <circle cx={cx} cy={cy} r={86} fill="none" stroke="#e0ead8" strokeWidth={1} strokeDasharray="3 4" />
        </svg>
        {rings.map((ring, ri) => ring.map((p, i) => {
          const r = radii[ri];
          const angle = ri === 0 ? 0 : (2 * Math.PI * i / ring.length) - Math.PI / 2;
          const x = cx + r * Math.cos(angle);
          const y = cy + r * Math.sin(angle);
          const role = PLANT_ROLES.find(r => r.id === p.role) || PLANT_ROLES[1];
          const sz = ri === 0 ? 42 : ri === 1 ? 34 : ri === 2 ? 28 : 22;
          return (
            <div key={`${ri}-${i}`} style={{
              position: "absolute", width: sz, height: sz, borderRadius: "50%",
              border: `2.5px solid ${role.color}`,
              background: p.imageUrl ? "transparent" : role.color + "28",
              overflow: "hidden", left: x - sz/2, top: y - sz/2,
              boxShadow: "0 2px 5px rgba(0,0,0,0.12)",
            }}>
              {p.imageUrl
                ? <img src={p.imageUrl} style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>e.target.style.display="none"} />
                : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.4 }}>🌸</div>
              }
            </div>
          );
        }))}
        <div style={{ position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)", fontSize:10, color:"#7a8c74", fontWeight:600, background:"rgba(255,255,255,.85)", borderRadius:10, padding:"2px 8px", whiteSpace:"nowrap" }}>
          {total} plants
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: size, margin: "0 auto", background: "linear-gradient(180deg,#f0f5ee,#e0ead8)", borderRadius: 14, border: "2px solid #c8d8c0", padding: "16px 12px 12px", minHeight: 130 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:5, justifyContent:"center", alignItems:"flex-end" }}>
        {slots.map((p, i) => {
          const role = PLANT_ROLES.find(r => r.id === p.role) || PLANT_ROLES[1];
          const sz = p.role==="thriller" ? 42 : p.role==="filler" ? 34 : 26;
          return (
            <div key={i} style={{ width:sz, height:sz, borderRadius:"50%", border:`2.5px solid ${role.color}`, background:p.imageUrl?"transparent":role.color+"28", overflow:"hidden", boxShadow:"0 2px 5px rgba(0,0,0,0.1)" }}>
              {p.imageUrl
                ? <img src={p.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>e.target.style.display="none"} />
                : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:sz*.38}}>🌸</div>
              }
            </div>
          );
        })}
      </div>
      <div style={{ textAlign:"center", marginTop:8, fontSize:10, color:"#7a8c74", fontWeight:600 }}>{total} plants</div>
    </div>
  );
}

// ── COMPONENT ROW ─────────────────────────────────────────────────────────────
function ComponentRow({ plant, index, onChange, onRemove }) {
  const [imgErr, setImgErr] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const role = PLANT_ROLES.find(r => r.id === plant.role) || PLANT_ROLES[1];

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("URL");
    if (url && url.startsWith("http")) { onChange("imageUrl", url); setImgErr(false); }
  }, [onChange]);

  return (
    <div style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${role.color}22`, padding:"14px 16px", marginBottom:10, boxShadow:"0 1px 6px rgba(0,0,0,0.04)" }}>
      <div style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
        {/* Photo */}
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={handleDrop}
          style={{ width:72, height:72, borderRadius:10, flexShrink:0, border:`2px dashed ${dragging?role.color:"#c8d8c0"}`, background:dragging?role.color+"14":"#f8faf6", overflow:"hidden", cursor:"pointer", position:"relative", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
          {plant.imageUrl && !imgErr
            ? <img src={plant.imageUrl} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setImgErr(true)} />
            : <div style={{textAlign:"center",padding:4}}><div style={{fontSize:20}}>🌸</div><div style={{fontSize:8,color:"#aabba0",lineHeight:1.3}}>Drop photo</div></div>
          }
          <div style={{ position:"absolute",top:3,left:3,width:16,height:16,borderRadius:"50%",background:role.color,color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center" }}>{index+1}</div>
        </div>

        {/* Fields */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1.8fr 1fr 0.9fr 0.9fr 0.8fr 0.8fr auto", gap:8, alignItems:"end" }}>
            <div>
              <FL c="Variety" />
              <input value={plant.name||""} onChange={e=>onChange("name",e.target.value)} onFocus={()=>setFocusField("name")} onBlur={()=>setFocusField(null)} placeholder="Variety name..." style={{...IS(focusField==="name"),fontWeight:600}} />
            </div>
            <div>
              <FL c="Broker" />
              <select value={plant.broker||""} onChange={e=>onChange("broker",e.target.value)} style={{...IS(false),paddingRight:4}}>
                <option value="">— Broker —</option>
                {BROKERS.map(b=><option key={b}>{b}</option>)}
              </select>
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
          </div>

          {/* Second row */}
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

// ── SINGLE COMBO EDITOR ───────────────────────────────────────────────────────
function ComboEditor({ combo, onChange, lotQty, containerType }) {
  const plants = combo.plants || [];
  const totalPlantsPerUnit = plants.reduce((s,p)=>s+(p.qty||1),0);
  const costPerUnit = plants.reduce((s,p)=>s+(Number(p.costPerPlant||0)*(p.qty||1)),0);
  const comboQty = combo.qty || lotQty || 0;
  const totalMaterialCost = costPerUnit * comboQty;

  const updPlant = (idx, field, val) => {
    const updated = [...plants];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange({ ...combo, plants: updated });
  };
  const addPlant = () => {
    if (plants.length >= 10) return;
    onChange({ ...combo, plants: [...plants, { id:uid(), name:"", imageUrl:"", role:"filler", qty:1, costPerPlant:"", broker:"", formType:"URC", needBy:"" }] });
  };
  const removePlant = (idx) => onChange({ ...combo, plants: plants.filter((_,i)=>i!==idx) });

  return (
    <div>
      <div style={{display:"flex",gap:14,marginBottom:18,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:2,minWidth:200}}>
          <FL c="Combo Name" />
          <input value={combo.name||""} onChange={e=>onChange({...combo,name:e.target.value})} placeholder='e.g. "Tropical Sunset" — leave blank to use lot name' style={{...IS(false),fontWeight:700,fontSize:14}} />
        </div>
        <div style={{minWidth:130}}>
          <FL c="Quantity (this combo)" />
          <input type="number" min="1" value={combo.qty||""} onChange={e=>onChange({...combo,qty:Number(e.target.value)})} placeholder={String(lotQty||"")} style={{...IS(false),fontWeight:700,fontSize:15,textAlign:"center"}} />
          {lotQty>0 && <div style={{fontSize:10,color:"#9aaa90",marginTop:2,textAlign:"center"}}>of {lotQty} total</div>}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {totalPlantsPerUnit>0 && <div style={{background:"#f0f8eb",borderRadius:10,padding:"8px 14px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:"#2e5c1e"}}>{totalPlantsPerUnit}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>plants/unit</div></div>}
          {costPerUnit>0 && <div style={{background:"#f5f0ff",borderRadius:10,padding:"8px 14px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:"#6a3db0"}}>${costPerUnit.toFixed(2)}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>$/unit</div></div>}
          {totalMaterialCost>0 && <div style={{background:"#e8f4f8",borderRadius:10,padding:"8px 14px",textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,color:"#1e5a7a"}}>${totalMaterialCost.toFixed(0)}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>total material</div></div>}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:20}}>
        {/* Visual */}
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#9aaa90",textTransform:"uppercase",letterSpacing:.7,marginBottom:10}}>Preview</div>
          <div style={{background:"#f8faf6",borderRadius:14,border:"1.5px solid #e0ead8",padding:16}}>
            {plants.length===0
              ? <div style={{textAlign:"center",padding:"30px 0",color:"#aabba0"}}><div style={{fontSize:32,marginBottom:6}}>🌸</div><div style={{fontSize:11}}>Add plants to preview</div></div>
              : <ComboVisual plants={plants} containerType={containerType} />
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
            <div style={{fontSize:10,fontWeight:700,color:"#9aaa90",textTransform:"uppercase",letterSpacing:.7}}>Components ({plants.length}/10)</div>
            <button onClick={addPlant} disabled={plants.length>=10} style={{background:plants.length>=10?"#f0f0f0":"#7fb069",color:plants.length>=10?"#aabba0":"#fff",border:"none",borderRadius:9,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:plants.length>=10?"not-allowed":"pointer",fontFamily:"inherit"}}>
              + Add Component
            </button>
          </div>
          {plants.length===0 && (
            <div style={{textAlign:"center",padding:"32px 20px",background:"#f8faf6",borderRadius:14,border:"2px dashed #c8d8c0"}}>
              <div style={{fontSize:32,marginBottom:8}}>🌿</div>
              <div style={{fontSize:13,fontWeight:700,color:"#4a5a40",marginBottom:6}}>No components yet</div>
              <div style={{fontSize:12,color:"#7a8c74",marginBottom:14,lineHeight:1.5}}>Drag photos from supplier sites or paste a URL.<br/>Set variety, broker, form, date, and quantity.</div>
              <button onClick={addPlant} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:10,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add First Component</button>
            </div>
          )}
          {plants.map((plant,idx)=>(
            <ComponentRow key={plant.id} plant={plant} index={idx} onChange={(f,v)=>updPlant(idx,f,v)} onRemove={()=>removePlant(idx)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ORDER SUMMARY MODAL ───────────────────────────────────────────────────────
function OrderSummary({ lot, onClose, onMarkOrdered }) {
  const [copied, setCopied] = useState(null);

  const brokerMap = {};
  (lot.combos||[]).forEach(combo=>{
    const qty = combo.qty || lot.totalQty || 0;
    (combo.plants||[]).forEach(p=>{
      if(!p.name) return;
      const broker = p.broker || "Unassigned";
      if(!brokerMap[broker]) brokerMap[broker]=[];
      const existing = brokerMap[broker].find(x=>x.name===p.name&&x.formType===p.formType&&x.needBy===p.needBy);
      if(existing) { existing.totalQty += (p.qty||1)*qty; }
      else brokerMap[broker].push({ name:p.name, formType:p.formType, needBy:p.needBy, costPerPlant:p.costPerPlant, totalQty:(p.qty||1)*qty, comboName:combo.name||lot.name });
    });
  });

  const brokers = Object.keys(brokerMap).sort();
  const grandTotal = brokers.reduce((s,b)=>s+brokerMap[b].reduce((ss,p)=>ss+(Number(p.costPerPlant||0)*p.totalQty),0),0);

  const buildEmail = (broker) => {
    const lines = brokerMap[broker];
    const dateStr = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
    return `Hi,\n\nPlease see our young plant order below for the ${lot.name||"upcoming"} production run.\n\nORDER DATE: ${dateStr}\nACCOUNT: Schlegel Greenhouse / Hoosier Boy\n\n${lines.map(p=>`${p.name} | ${p.formType} | Qty: ${p.totalQty.toLocaleString()} | Need by: ${p.needBy||"TBD"}${p.costPerPlant?` | $${Number(p.costPerPlant).toFixed(2)}/unit`:""}`).join("\n")}\n\nTotal: ${lines.reduce((s,p)=>s+(Number(p.costPerPlant||0)*p.totalQty),0).toLocaleString("en-US",{style:"currency",currency:"USD"})}\n\nPlease confirm availability and ship dates. Thank you.\n\nSchlegel Greenhouse`;
  };

  const copyEmail = (broker) => { navigator.clipboard.writeText(buildEmail(broker)); setCopied(broker); setTimeout(()=>setCopied(null),2000); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:780,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.3)"}}>
        <div style={{background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",padding:"22px 28px",borderRadius:"20px 20px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"Georgia,serif",fontSize:20,color:"#c8e6b8"}}>Order Summary</div>
            <div style={{fontSize:12,color:"#7fb069",marginTop:3}}>{lot.name} · {brokers.length} broker{brokers.length!==1?"s":""} · ${grandTotal.toFixed(2)} total</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",color:"#c8e6b8",borderRadius:10,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
        </div>
        <div style={{padding:"24px 28px"}}>
          {brokers.length===0 && <div style={{textAlign:"center",padding:40,color:"#7a8c74"}}>No components with brokers assigned yet.</div>}
          {brokers.map(broker=>{
            const lines = brokerMap[broker];
            const subtotal = lines.reduce((s,p)=>s+(Number(p.costPerPlant||0)*p.totalQty),0);
            return (
              <div key={broker} style={{marginBottom:24,background:"#f8faf6",borderRadius:14,border:"1.5px solid #e0ead8",overflow:"hidden"}}>
                <div style={{background:"#1e2d1a",padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:800,fontSize:15,color:"#c8e6b8"}}>{broker}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:13,color:"#7fb069",fontWeight:700}}>${subtotal.toFixed(2)}</span>
                    <button onClick={()=>copyEmail(broker)} style={{background:copied===broker?"#4a7a35":"#7fb069",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"background .2s"}}>
                      {copied===broker?"✓ Copied!":"📋 Copy Email Draft"}
                    </button>
                  </div>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{background:"#f0f5ee"}}>
                      {["Variety","Form","Qty","Need By","$/unit","Subtotal","Combo"].map(h=>(
                        <th key={h} style={{padding:"8px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#7a8c74",textTransform:"uppercase",letterSpacing:.5}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
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
                          <td style={{padding:"10px 14px",fontSize:11,color:"#9aaa90"}}>{p.comboName}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          {brokers.length>0 && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",borderRadius:14,padding:"18px 22px"}}>
              <div>
                <div style={{fontSize:11,color:"#7fb069",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Grand Total</div>
                <div style={{fontSize:28,fontWeight:900,color:"#fff"}}>${grandTotal.toFixed(2)}</div>
              </div>
              <button onClick={()=>{onMarkOrdered();onClose();}} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(127,176,105,.4)"}}>
                ✓ Mark as Ordered
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── LOT DESIGNER ─────────────────────────────────────────────────────────────
function LotDesigner({ initial, onSave, onCancel }) {
  const blankCombo = (name="") => ({ id:uid(), name, qty:null, plants:[] });
  const blank = { id:null, name:"", containerType:"basket", containerSize:"", season:"", totalQty:"", status:"draft", notes:"", approvalNote:"", combos:[blankCombo()] };
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
  const ct = CONTAINER_TYPES.find(c=>c.id===lot.containerType)||CONTAINER_TYPES[0];
  const status = STATUSES.find(s=>s.id===lot.status)||STATUSES[0];

  // When only one combo, auto-assign full qty
  const effectiveLot = { ...lot, combos: lot.combos.map((c,i)=> lot.combos.length===1 ? {...c,qty:totalQty} : c) };

  const handleSave = (newStatus) => {
    if(!lot.name.trim()) return;
    onSave({...effectiveLot, id:lot.id||uid(), status:newStatus||lot.status});
  };

  return (
    <div style={{maxWidth:1100,margin:"0 auto"}}>
      {showOrder && <OrderSummary lot={{...effectiveLot,name:lot.name}} onClose={()=>setShowOrder(false)} onMarkOrdered={()=>handleSave("ordered")} />}

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",borderRadius:"20px 20px 0 0",padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <input value={lot.name} onChange={e=>updLot("name",e.target.value)} placeholder="Lot name, e.g. Spring 400 Hanging Baskets..."
              style={{background:"transparent",border:"none",borderBottom:"2px solid rgba(200,230,184,.4)",outline:"none",fontFamily:"Georgia,serif",fontSize:20,color:"#c8e6b8",width:"100%",paddingBottom:6,letterSpacing:.3}} />
            <div style={{fontSize:12,color:"#7fb069",marginTop:6,display:"flex",gap:10,flexWrap:"wrap"}}>
              <span>{ct.icon} {ct.label}{lot.containerSize?` · ${lot.containerSize}`:""}</span>
              {lot.season&&<span>· {lot.season}</span>}
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

        {/* Metadata */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:18}}>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Container</div>
            <div style={{display:"flex",gap:5}}>
              {CONTAINER_TYPES.map(c=>(
                <button key={c.id} onClick={()=>updLot("containerType",c.id)} style={{flex:1,padding:"5px 0",borderRadius:7,border:`1.5px solid ${lot.containerType===c.id?"#7fb069":"rgba(200,230,184,.2)"}`,background:lot.containerType===c.id?"rgba(127,176,105,.25)":"transparent",color:lot.containerType===c.id?"#c8e6b8":"rgba(200,230,184,.5)",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                  {c.icon}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Size</div>
            <input value={lot.containerSize} onChange={e=>updLot("containerSize",e.target.value)} placeholder='10", 12", 14"'
              style={{...IS(false),background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(200,230,184,.25)",color:"#c8e6b8",fontSize:13}} />
          </div>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Season</div>
            <input value={lot.season||""} onChange={e=>updLot("season",e.target.value)} placeholder="Spring 2026"
              style={{...IS(false),background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(200,230,184,.25)",color:"#c8e6b8",fontSize:13}} />
          </div>
          <div>
            <div style={{fontSize:10,color:"rgba(200,230,184,.7)",textTransform:"uppercase",letterSpacing:.7,marginBottom:5}}>Total Qty</div>
            <input type="number" min="1" value={lot.totalQty||""} onChange={e=>updLot("totalQty",e.target.value)} placeholder="e.g. 400"
              style={{...IS(false),background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(200,230,184,.25)",color:"#c8e6b8",fontSize:16,fontWeight:800,textAlign:"center"}} />
          </div>
        </div>
      </div>

      {/* Tabs + editor */}
      <div style={{background:"#fff",borderRadius:"0 0 20px 20px",border:"2px solid #e0ead8",borderTop:"none"}}>
        {/* Tab bar */}
        <div style={{display:"flex",alignItems:"center",borderBottom:"2px solid #e0ead8",paddingLeft:20,overflowX:"auto"}}>
          {lot.combos.map((combo,idx)=>{
            const comboQty = lot.combos.length===1 ? totalQty : (combo.qty||0);
            const plantCount = (combo.plants||[]).reduce((s,p)=>s+(p.qty||1),0);
            const isActive = idx===activeIdx;
            return (
              <div key={combo.id} style={{display:"flex",alignItems:"center",borderBottom:`3px solid ${isActive?"#7fb069":"transparent"}`,marginBottom:-2,flexShrink:0}}>
                <button onClick={()=>setActiveIdx(idx)} style={{background:"none",border:"none",padding:"14px 18px 12px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontWeight:isActive?800:600,fontSize:14,color:isActive?"#1e2d1a":"#7a8c74"}}>{combo.name||`Combo ${idx+1}`}</span>
                  {comboQty>0&&<span style={{background:isActive?"#f0f8eb":"#f5f5f5",color:isActive?"#4a7a35":"#9aaa90",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>×{comboQty}</span>}
                  {plantCount>0&&<span style={{fontSize:10,color:"#9aaa90"}}>· {plantCount}🌸</span>}
                </button>
                {lot.combos.length>1&&<button onClick={()=>removeCombo(idx)} style={{background:"none",border:"none",color:"#c8d8c0",fontSize:14,cursor:"pointer",paddingRight:12,paddingTop:2}}>×</button>}
              </div>
            );
          })}
          {lot.combos.length<8&&<button onClick={addCombo} style={{background:"none",border:"none",padding:"14px 16px",cursor:"pointer",fontFamily:"inherit",color:"#7fb069",fontWeight:700,fontSize:13,flexShrink:0}}>+ Add Combo</button>}
        </div>

        <div style={{padding:"24px 28px"}}>
          {/* Allocation bar (multi-combo only) */}
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
            containerType={lot.containerType}
          />
        </div>
      </div>
    </div>
  );
}

// ── LOT CARD ─────────────────────────────────────────────────────────────────
function LotCard({ lot, onEdit, onDelete, onDuplicate, onApprove, onRevision, isApprover }) {
  const status = STATUSES.find(s=>s.id===lot.status)||STATUSES[0];
  const ct = CONTAINER_TYPES.find(c=>c.id===lot.containerType)||CONTAINER_TYPES[0];
  const allPlants = (lot.combos||[]).flatMap(c=>c.plants||[]);
  const totalPlantsPerUnit = allPlants.reduce((s,p)=>s+(p.qty||1),0);
  const costPerUnit = allPlants.reduce((s,p)=>s+(Number(p.costPerPlant||0)*(p.qty||1)),0);
  const materialCost = costPerUnit*(Number(lot.totalQty)||0);
  const brokers = [...new Set(allPlants.map(p=>p.broker).filter(Boolean))];
  const hasPhotos = allPlants.some(p=>p.imageUrl);

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
            <div style={{fontSize:12,color:"#7a8c74"}}>{ct.icon} {ct.label}{lot.containerSize?` · ${lot.containerSize}`:""}{lot.season?` · ${lot.season}`:""}{lot.totalQty?` · ${Number(lot.totalQty).toLocaleString()} units`:""}</div>
          </div>
          <span style={{background:status.bg,color:status.color,border:`1px solid ${status.color}44`,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700}}>{status.label}</span>
        </div>
        {(lot.combos||[]).length>1&&(
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            {(lot.combos||[]).map((c,i)=><div key={i} style={{background:"#f0f8eb",borderRadius:8,padding:"4px 10px",fontSize:11,fontWeight:700,color:"#2e5c1e"}}>{c.name||`Combo ${i+1}`} ×{c.qty||0}</div>)}
          </div>
        )}
        <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          {totalPlantsPerUnit>0&&<div style={{background:"#f0f8eb",borderRadius:8,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:"#2e5c1e"}}>{totalPlantsPerUnit}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase"}}>plants/unit</div></div>}
          {materialCost>0&&<div style={{background:"#f5f0ff",borderRadius:8,padding:"6px 12px",textAlign:"center"}}><div style={{fontSize:16,fontWeight:800,color:"#6a3db0"}}>${materialCost.toFixed(0)}</div><div style={{fontSize:9,color:"#7a8c74",textTransform:"uppercase"}}>total material</div></div>}
          {brokers.length>0&&<div style={{background:"#e8f4f8",borderRadius:8,padding:"6px 12px"}}><div style={{fontSize:10,fontWeight:700,color:"#2e7d9e",marginBottom:2}}>Brokers</div><div style={{fontSize:12,color:"#1e2d1a"}}>{brokers.join(", ")}</div></div>}
        </div>
        {lot.approvalNote&&<div style={{background:"#fff8f0",border:"1px solid #f0c080",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#7a5010"}}>💬 {lot.approvalNote}</div>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>onEdit(lot)} style={{background:"#4a90d9",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✏️ Edit</button>
          <button onClick={()=>onDuplicate(lot)} style={{background:"none",color:"#7a8c74",border:"1px solid #c8d8c0",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Duplicate</button>
          {isApprover&&lot.status==="submitted"&&<>
            <button onClick={()=>onApprove(lot.id)} style={{background:"#4a7a35",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
            <button onClick={()=>onRevision(lot.id)} style={{background:"#c8791a",color:"#fff",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>↩ Revision</button>
          </>}
          <button onClick={()=>onDelete(lot.id)} style={{background:"none",color:"#e07b39",border:"1px solid #f0d0c0",borderRadius:8,padding:"7px 14px",fontSize:12,cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>Remove</button>
        </div>
      </div>
    </div>
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function ComboLibrary() {
  const [lots, setLots] = useState(()=>{ try{return JSON.parse(localStorage.getItem("gh_combos_v1")||"[]")}catch{return[]} });
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const isApprover = true;

  const persist = (u) => { setLots(u); localStorage.setItem("gh_combos_v1",JSON.stringify(u)); };
  const save = (lot) => { persist(editId?lots.map(l=>l.id===editId?lot:l):[...lots,lot]); setView("list"); setEditId(null); };
  const del  = (id) => { if(window.confirm("Remove this combo lot?")) persist(lots.filter(l=>l.id!==id)); };
  const dup  = (lot) => persist([...lots,{...dc(lot),id:uid(),name:lot.name+" (Copy)",status:"draft"}]);
  const approve  = (id) => persist(lots.map(l=>l.id===id?{...l,status:"approved"}:l));
  const revision = (id) => persist(lots.map(l=>l.id===id?{...l,status:"revision"}:l));

  if(view==="add") return <LotDesigner onSave={save} onCancel={()=>setView("list")} />;
  if(view==="edit"){ const lot=lots.find(l=>l.id===editId); return lot?<LotDesigner initial={lot} onSave={save} onCancel={()=>{setView("list");setEditId(null);}} />:null; }

  const filtered = lots.filter(l=>(statusFilter==="all"||l.status===statusFilter)&&(typeFilter==="all"||l.containerType===typeFilter));
  const pending = lots.filter(l=>l.status==="submitted").length;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#1e2d1a"}}>Combo Designs</div>
          <div style={{fontSize:12,color:"#7a8c74",marginTop:2}}>{lots.length} lot{lots.length!==1?"s":""}</div>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {pending>0&&<div style={{background:"#e8f4f8",border:"1.5px solid #b0d8e8",borderRadius:10,padding:"8px 14px",fontSize:13,color:"#2e7d9e",fontWeight:700}}>🔔 {pending} awaiting approval</div>}
          <button onClick={()=>setView("add")} style={{background:"linear-gradient(135deg,#7fb069,#4a7a35)",color:"#fff",border:"none",borderRadius:12,padding:"10px 22px",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(79,160,69,.3)"}}>+ New Combo Lot</button>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        {[["all","All Statuses"],...STATUSES.map(s=>[s.id,s.label])].map(([id,label])=>{
          const s=STATUSES.find(x=>x.id===id);
          return <button key={id} onClick={()=>setStatusFilter(id)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${statusFilter===id?(s?.color||"#7fb069"):"#c8d8c0"}`,background:statusFilter===id?(s?.bg||"#f0f8eb"):"#fff",color:statusFilter===id?(s?.color||"#2e5c1e"):"#7a8c74",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>;
        })}
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {[["all","All Types"],...CONTAINER_TYPES.map(t=>[t.id,`${t.icon} ${t.label}`])].map(([id,label])=>(
          <button key={id} onClick={()=>setTypeFilter(id)} style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${typeFilter===id?"#7fb069":"#c8d8c0"}`,background:typeFilter===id?"#f0f8eb":"#fff",color:typeFilter===id?"#2e5c1e":"#7a8c74",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{label}</button>
        ))}
      </div>
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"60px 20px",background:"#fafcf8",borderRadius:20,border:"2px dashed #c8d8c0"}}>
          <div style={{fontSize:52,marginBottom:16}}>🌸</div>
          <div style={{fontSize:18,fontWeight:800,color:"#4a5a40",marginBottom:8}}>No combo lots yet</div>
          <div style={{fontSize:13,color:"#7a8c74",marginBottom:24,lineHeight:1.6,maxWidth:400,margin:"0 auto 24px"}}>Design your combos here. Each lot can have multiple combo designs split across a quantity.</div>
          <button onClick={()=>setView("add")} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>+ Create First Lot</button>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:16}}>
          {filtered.map(lot=>(
            <LotCard key={lot.id} lot={lot} isApprover={isApprover} onEdit={()=>{setEditId(lot.id);setView("edit");}} onDelete={del} onDuplicate={dup} onApprove={approve} onRevision={revision} />
          ))}
        </div>
      )}
    </div>
  );
}
