import { useState, useMemo } from "react";
import { useHpCultureGuides } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });

const InfoRow = ({ label, value }) => {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0f5ee" }}>
      <div style={{ width: 130, fontSize: 12, color: "#7a8c74", fontWeight: 700, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#1e2d1a" }}>{value}</div>
    </div>
  );
};

const SH = ({ children }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 12, marginTop: 20 }}>{children}</div>;

export default function HouseplantLibrary() {
  const { rows: guides } = useHpCultureGuides();
  const [searchQ, setSearchQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return guides;
    const q = searchQ.toLowerCase();
    return guides.filter(g =>
      (g.genus || "").toLowerCase().includes(q) ||
      (g.commonName || "").toLowerCase().includes(q) ||
      (g.pests || "").toLowerCase().includes(q)
    );
  }, [guides, searchQ]);

  const selected = guides.find(g => g.id === selectedId);

  if (selected) {
    return (
      <div style={{ maxWidth: 700, ...FONT }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => setSelectedId(null)} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#1e2d1a" }}>{selected.genus}</div>
        </div>

        <div style={card}>
          <SH>Propagation</SH>
          <InfoRow label="Time" value={selected.propTime} />
          <InfoRow label="Temperature" value={selected.propTemp} />
          <InfoRow label="Light" value={selected.propLight} />
          <InfoRow label="Humidity" value={selected.propHumidity} />
          {selected.propNotes && <div style={{ fontSize: 13, color: "#4a5a40", marginTop: 10, lineHeight: 1.6, background: "#f8faf6", padding: "10px 12px", borderRadius: 8 }}>{selected.propNotes}</div>}
        </div>

        <div style={card}>
          <SH>Finishing</SH>
          <InfoRow label="Time (from liner)" value={selected.finishTime} />
          <InfoRow label="Temperature" value={selected.finishTemp} />
          <InfoRow label="Light" value={selected.finishLight} />
          <InfoRow label="pH" value={selected.finishPh} />
          <InfoRow label="EC" value={selected.finishEc} />
          <InfoRow label="Fertilizer" value={selected.finishFeed} />
          <InfoRow label="PGR" value={selected.finishPgr} />
          <InfoRow label="Height" value={selected.height} />
          <InfoRow label="Width" value={selected.width} />
          {selected.notes && <div style={{ fontSize: 13, color: "#4a5a40", marginTop: 10, lineHeight: 1.6, background: "#f8faf6", padding: "10px 12px", borderRadius: 8 }}>{selected.notes}</div>}
        </div>

        <div style={card}>
          <SH>Pest & Disease</SH>
          <InfoRow label="Pests" value={selected.pests} />
          <InfoRow label="Diseases" value={selected.diseases} />
        </div>

        <div style={{ fontSize: 11, color: "#aabba0", marginTop: 8 }}>Source: {selected.source}</div>
      </div>
    );
  }

  return (
    <div style={FONT}>
      <div style={{ marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search genera, pests, diseases..."
          style={{ ...IS(!!searchQ), maxWidth: 400, fontSize: 15 }} />
      </div>

      {guides.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No culture guides loaded</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(g => (
            <div key={g.id} onClick={() => setSelectedId(g.id)}
              style={{ ...card, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", marginBottom: 6 }}>{g.genus}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                {g.propTime && <div style={{ fontSize: 11, color: "#7a8c74" }}>Prop: {g.propTime}</div>}
                {g.finishTime && <div style={{ fontSize: 11, color: "#7a8c74" }}>Finish: {g.finishTime}</div>}
                {g.finishPh && <div style={{ fontSize: 11, color: "#7a8c74" }}>pH: {g.finishPh}</div>}
              </div>
              {g.pests && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {g.pests.split(", ").map(p => (
                    <span key={p} style={{ background: "#fde8e8", color: "#d94f3d", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 600 }}>{p}</span>
                  ))}
                </div>
              )}
              {g.diseases && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {g.diseases.split(", ").map(d => (
                    <span key={d} style={{ background: "#fff4e8", color: "#c8791a", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 600 }}>{d}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
