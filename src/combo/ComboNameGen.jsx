import React, { useState, useEffect } from "react";

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

export default ComboNameGenerator;
