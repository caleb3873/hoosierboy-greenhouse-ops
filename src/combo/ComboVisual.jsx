import React from "react";

const PLANT_ROLES = [
  { id: "thriller", label: "Thriller", color: "#8e44ad", emoji: "🔮" },
  { id: "filler",   label: "Filler",   color: "#7fb069", emoji: "🌿" },
  { id: "spiller",  label: "Spiller",  color: "#4a90d9", emoji: "💧" },
  { id: "accent",   label: "Accent",   color: "#e07b39", emoji: "✨" },
];

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

export default ComboVisual;
