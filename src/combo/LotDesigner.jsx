import React, { useState, useCallback, useRef } from "react";
import ComboEditor from "./ComboEditor";
import { CostRollup } from "./ComboEditor";
import OrderSummary from "./OrderSummary";
import { calcUnitBreakdown } from "./CostEngine";

// ── CONSTANTS / HELPERS ──────────────────────────────────────────────────────
const STATUSES = [
  { id: "draft",     label: "Draft",               color: "#7a8c74", bg: "#f0f5ee" },
  { id: "submitted", label: "Submitted for Review", color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "approved",  label: "Approved",             color: "#4a7a35", bg: "#e8f5e0" },
  { id: "revised",   label: "Revised",              color: "#7b3fa0", bg: "#f5eeff" },
  { id: "revision",  label: "Needs Revision",       color: "#c8791a", bg: "#fff4e8" },
  { id: "ordered",   label: "Ordered",              color: "#1e2d1a", bg: "#c8e6b8" },
  { id: "completed", label: "Completed",            color: "#4a7a35", bg: "#e0f0e0" },
];

const uid = () => crypto.randomUUID();
const dc  = (o) => JSON.parse(JSON.stringify(o));

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

// ── LOT DESIGNER ─────────────────────────────────────────────────────────────
function LotDesigner({ initial, onSave, onCancel, containers, soilMixes, tags }) {
  const blankCombo = (name="") => ({ id:uid(), name, qty:null, plants:[], containerId:"", soilId:"", tagId:"", tagDescription:"" });
  const blank = { id:null, name:"", season:"", totalQty:"", status:"draft", notes:"", approvalNote:"", combos:[blankCombo()] };
  const [lot, setLot] = useState(initial ? dc({...blank,...initial}) : blank);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showOrder, setShowOrder] = useState(false);

  // Completion modal state
  const [showComplete, setShowComplete] = useState(false);
  const [completeQty, setCompleteQty] = useState(initial?.totalQty || "");
  const [completePhotos, setCompletePhotos] = useState([]);
  const completePhotoRef = useRef(null);

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

      {/* Completion modal */}
      {showComplete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, padding: 28, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#1e2d1a", marginBottom: 16 }}>Complete Production</div>

            <div style={{ marginBottom: 16 }}>
              <FL c="Actual Units Produced" />
              <input type="number" min="0" value={completeQty} onChange={e => setCompleteQty(e.target.value)}
                placeholder={String(lot.totalQty || "")}
                style={{ ...IS(false), fontSize: 18, fontWeight: 800, textAlign: "center" }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <FL c="Finished Photos" />
              <input ref={completePhotoRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => {
                  Array.from(e.target.files).forEach(file => {
                    const reader = new FileReader();
                    reader.onload = ev => setCompletePhotos(prev => [...prev, { id: uid(), imgData: ev.target.result, caption: "", capturedAt: Date.now() }]);
                    reader.readAsDataURL(file);
                  });
                }} />
              <button onClick={() => completePhotoRef.current?.click()} style={{
                width: "100%", padding: 12, borderRadius: 10, border: "2px dashed #c8d8c0",
                background: "#fafcf8", color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              }}>Add Photos</button>
              {completePhotos.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {completePhotos.map((p, i) => (
                    <div key={p.id} style={{ width: 60, height: 60, borderRadius: 8, overflow: "hidden", position: "relative" }}>
                      <img src={p.imgData} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={() => setCompletePhotos(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer", lineHeight: 1 }}>x</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                const qty = parseInt(completeQty) || Number(lot.totalQty) || 0;
                onSave({
                  ...effectiveLot,
                  status: "completed",
                  completedAt: new Date().toISOString(),
                  isTemplate: true,
                  productionQty: qty,
                  finishedPhotos: completePhotos,
                });
              }} style={{
                flex: 1, background: "#4a7a35", color: "#fff", border: "none", borderRadius: 10,
                padding: "12px 0", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
              }}>Complete & Add to Library</button>
              <button onClick={() => setShowComplete(false)} style={{
                background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 10,
                padding: "12px 20px", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div style={{background:"linear-gradient(135deg,#1e2d1a,#2e4a22)",borderRadius:"20px 20px 0 0",padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <input value={lot.name} onChange={e=>updLot("name",e.target.value)} placeholder="Lot name, e.g. Spring 400 Hanging Baskets..."
              style={{background:"transparent",border:"none",borderBottom:"2px solid rgba(200,230,184,.4)",outline:"none",fontFamily:"Georgia,serif",fontSize:20,color:"#c8e6b8",width:"100%",paddingBottom:6,letterSpacing:.3}} />
            <div style={{fontSize:12,color:"#7fb069",marginTop:6,display:"flex",gap:10,flexWrap:"wrap"}}>
              {lot.season&&<span>🌱 {lot.season}</span>}
              {totalQty>0&&<span>· {totalQty.toLocaleString()} total</span>}
              {totalQty>0&&lot.combos.length>1&&<span style={{color:remaining===0?"#c8e6b8":remaining<0?"#f08080":"#f0c080"}}>{remaining===0?"Fully assigned":remaining<0?`${Math.abs(remaining)} over`:`${remaining} unassigned`}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <span style={{background:status.bg,color:status.color,border:`1px solid ${status.color}55`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,alignSelf:"center"}}>{status.label}</span>
            {onCancel&&<button onClick={onCancel} style={{background:"rgba(255,255,255,.1)",color:"#c8e6b8",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"8px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Back</button>}
            <button onClick={()=>handleSave()} style={{background:"rgba(255,255,255,.15)",color:"#c8e6b8",border:"1px solid rgba(255,255,255,.25)",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
            {lot.status==="draft"&&<button onClick={()=>handleSave("submitted")} style={{background:"#2e7d9e",color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Submit for Approval</button>}
            {(lot.status==="approved"||lot.status==="submitted")&&<button onClick={()=>setShowOrder(true)} style={{background:"#7fb069",color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 3px 10px rgba(127,176,105,.4)"}}>View Order</button>}
            {lot.status === "ordered" && (
              <button onClick={() => setShowComplete(true)} style={{
                background: "#4a7a35", color: "#fff", border: "none", borderRadius: 10,
                padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Mark Complete</button>
            )}
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
                  {comboQty>0&&<span style={{background:isActive?"#f0f8eb":"#f5f5f5",color:isActive?"#4a7a35":"#9aaa90",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>x{comboQty}</span>}
                  {plantCount>0&&<span style={{fontSize:10,color:"#9aaa90"}}>{plantCount} plants</span>}
                  {hasContainer&&<span style={{fontSize:10,color:"#4a90d9"}}>container</span>}
                </button>
                {lot.combos.length>1&&<button onClick={()=>removeCombo(idx)} style={{background:"none",border:"none",color:"#c8d8c0",fontSize:14,cursor:"pointer",paddingRight:12,paddingTop:2}}>x</button>}
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
                {remaining===0?"Fully assigned":remaining<0?`${Math.abs(remaining)} over`:`${remaining} remaining`}
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

export default LotDesigner;
