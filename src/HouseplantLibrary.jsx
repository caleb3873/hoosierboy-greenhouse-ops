import { useState, useMemo } from "react";
import { useHpCultureGuides } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const FL = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>{children}</div>;
const SH = ({ children }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 12, marginTop: 20 }}>{children}</div>;
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

const InfoRow = ({ label, value }) => {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0f5ee" }}>
      <div style={{ width: 130, fontSize: 12, color: "#7a8c74", fontWeight: 700, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#1e2d1a" }}>{value}</div>
    </div>
  );
};

const BLANK = {
  genus: "", commonName: "", propTime: "", propTemp: "", propLight: "", propHumidity: "", propNotes: "",
  finishTime: "", finishTemp: "", finishLight: "", finishPh: "", finishEc: "", finishFeed: "", finishPgr: "",
  height: "", width: "", pests: "", diseases: "", notes: "", source: "",
};

export default function HouseplantLibrary() {
  const { rows: guides, upsert, remove } = useHpCultureGuides();
  const [searchQ, setSearchQ] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("list"); // list | detail | form

  const filtered = useMemo(() => {
    if (!searchQ.trim()) return guides;
    const q = searchQ.toLowerCase();
    return guides.filter(g =>
      (g.genus || "").toLowerCase().includes(q) ||
      (g.commonName || "").toLowerCase().includes(q) ||
      (g.pests || "").toLowerCase().includes(q) ||
      (g.diseases || "").toLowerCase().includes(q)
    );
  }, [guides, searchQ]);

  const selected = guides.find(g => g.id === selectedId);

  // ── Form view ─────────────────────────────────────────────────────────────
  if (view === "form") {
    return <GuideForm initial={selected} onSave={async (data) => { await upsert(data); setView("list"); setSelectedId(null); }}
      onCancel={() => setView(selected ? "detail" : "list")} />;
  }

  // ── Detail view ───────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    return (
      <div style={{ maxWidth: 700, ...FONT }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => { setView("list"); setSelectedId(null); }} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 20, color: "#1e2d1a" }}>{selected.genus}</div>
          <button onClick={() => setView("form")} style={{ ...BTN_SEC, fontSize: 12 }}>Edit</button>
          <button onClick={async () => { if (window.confirm("Delete this guide?")) { await remove(selected.id); setView("list"); setSelectedId(null); } }}
            style={{ ...BTN_SEC, fontSize: 12, borderColor: "#f0c8c0", color: "#d94f3d" }}>Delete</button>
        </div>

        {selected.commonName && <div style={{ fontSize: 14, color: "#7a8c74", marginBottom: 16 }}>{selected.commonName}</div>}

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

        {selected.source && <div style={{ fontSize: 11, color: "#aabba0", marginTop: 8 }}>Source: {selected.source}</div>}
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div style={FONT}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search genera, pests, diseases..."
          style={{ ...IS(!!searchQ), maxWidth: 400, fontSize: 15 }} />
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => { setSelectedId(null); setView("form"); }} style={BTN}>+ Add Guide</button>
        </div>
      </div>

      {guides.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📖</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No culture guides loaded</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Add growing guides for your houseplant team</div>
          <button onClick={() => { setSelectedId(null); setView("form"); }} style={BTN}>Add First Guide</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(g => (
            <div key={g.id} onClick={() => { setSelectedId(g.id); setView("detail"); }}
              style={{ ...card, cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", marginBottom: 2 }}>{g.genus}</div>
              {g.commonName && <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 6 }}>{g.commonName}</div>}
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
              {g.source && <div style={{ fontSize: 10, color: "#aabba0", marginTop: 6 }}>{g.source}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── GUIDE FORM ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function GuideForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...BLANK, ...initial } : BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  function save() {
    if (!f.genus.trim()) return;
    onSave({ ...f, id: f.id || crypto.randomUUID() });
  }

  return (
    <div style={{ maxWidth: 700, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer" }}>&larr;</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Culture Guide" : "New Culture Guide"}</div>
      </div>

      <div style={card}>
        <SH>Plant Info</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Genus / Plant Name *</FL><input value={f.genus} onChange={e => upd("genus", e.target.value)} style={IS(false)} placeholder="e.g. Aglaonema" /></div>
          <div><FL>Common Name</FL><input value={f.commonName} onChange={e => upd("commonName", e.target.value)} style={IS(false)} placeholder="e.g. Chinese Evergreen" /></div>
          <div><FL>Height</FL><input value={f.height} onChange={e => upd("height", e.target.value)} style={IS(false)} placeholder='e.g. 12-24"' /></div>
          <div><FL>Width</FL><input value={f.width} onChange={e => upd("width", e.target.value)} style={IS(false)} placeholder='e.g. 12-20"' /></div>
        </div>

        <SH>Propagation</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Prop Time</FL><input value={f.propTime} onChange={e => upd("propTime", e.target.value)} style={IS(false)} placeholder="e.g. 4-6 weeks" /></div>
          <div><FL>Prop Temperature</FL><input value={f.propTemp} onChange={e => upd("propTemp", e.target.value)} style={IS(false)} placeholder="e.g. 70-85F" /></div>
          <div><FL>Prop Light</FL><input value={f.propLight} onChange={e => upd("propLight", e.target.value)} style={IS(false)} placeholder="e.g. 1000-2500 fc" /></div>
          <div><FL>Prop Humidity</FL><input value={f.propHumidity} onChange={e => upd("propHumidity", e.target.value)} style={IS(false)} placeholder="e.g. 80-90%" /></div>
        </div>
        <div><FL>Prop Notes</FL><textarea value={f.propNotes} onChange={e => upd("propNotes", e.target.value)} style={{ ...IS(false), minHeight: 60, resize: "vertical" }} placeholder="IBA rates, mist settings, rooting tips..." /></div>

        <SH>Finishing</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Finish Time (from liner)</FL><input value={f.finishTime} onChange={e => upd("finishTime", e.target.value)} style={IS(false)} placeholder="e.g. 8-12 wks" /></div>
          <div><FL>Finish Temperature</FL><input value={f.finishTemp} onChange={e => upd("finishTemp", e.target.value)} style={IS(false)} placeholder="e.g. 70-85F" /></div>
          <div><FL>Finish Light</FL><input value={f.finishLight} onChange={e => upd("finishLight", e.target.value)} style={IS(false)} placeholder="e.g. 1500-3500 fc" /></div>
          <div><FL>pH</FL><input value={f.finishPh} onChange={e => upd("finishPh", e.target.value)} style={IS(false)} placeholder="e.g. 5.5-6.5" /></div>
          <div><FL>EC</FL><input value={f.finishEc} onChange={e => upd("finishEc", e.target.value)} style={IS(false)} placeholder="e.g. 1.5-2.0" /></div>
          <div><FL>Fertilizer</FL><input value={f.finishFeed} onChange={e => upd("finishFeed", e.target.value)} style={IS(false)} placeholder="e.g. 150-200 ppm" /></div>
          <div><FL>PGR</FL><input value={f.finishPgr} onChange={e => upd("finishPgr", e.target.value)} style={IS(false)} placeholder="e.g. B-Nine 2500ppm" /></div>
        </div>

        <SH>Pest & Disease</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL>Pests</FL><input value={f.pests} onChange={e => upd("pests", e.target.value)} style={IS(false)} placeholder="e.g. Mealybugs, Aphids, Thrips" /></div>
          <div><FL>Diseases</FL><input value={f.diseases} onChange={e => upd("diseases", e.target.value)} style={IS(false)} placeholder="e.g. Erwinia, Pythium" /></div>
        </div>

        <SH>Notes & Source</SH>
        <div style={{ marginBottom: 12 }}>
          <FL>Growing Notes</FL>
          <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS(false), minHeight: 70, resize: "vertical" }} placeholder="Finishing tips, sensitivities, calcium sprays, etc." />
        </div>
        <div>
          <FL>Source</FL>
          <input value={f.source} onChange={e => upd("source", e.target.value)} style={IS(false)} placeholder="e.g. Danziger Technical Guide 2026, Amanda's notes" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={save} style={{ ...BTN, flex: 1, padding: 14 }}>{initial ? "Save Changes" : "Add Culture Guide"}</button>
        <button onClick={onCancel} style={{ ...BTN_SEC, padding: 14 }}>Cancel</button>
      </div>
    </div>
  );
}
