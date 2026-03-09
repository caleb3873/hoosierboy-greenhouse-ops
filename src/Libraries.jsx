import { useState, useEffect, useRef } from "react";

// ── STORAGE ───────────────────────────────────────────────────────────────────
function useStorage(key, fallback) {
  const [val, setVal] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

// ── BREEDER CONFIG ────────────────────────────────────────────────────────────
const BREEDERS = [
  { name: "Ball Seed", color: "#c0392b", url: "https://www.ballseed.com/culture-guides" },
  { name: "Proven Winners", color: "#27ae60", url: "https://www.provenwinners.com/growers/culture-guides" },
  { name: "Syngenta / Goldsmith", color: "#2980b9", url: "https://www.syngentaflowers-us.com/culture-guides" },
  { name: "PanAmerican Seed", color: "#8e44ad", url: "https://www.panamseed.com/culture-guides" },
  { name: "Dümmen Orange", color: "#e67e22", url: "https://www.dummenorange.com/culture-guides" },
  { name: "Other", color: "#7a8c74", url: null },
];

const LIGHT_OPTIONS = ["Low (< 2,500 fc)", "Medium (2,500–5,000 fc)", "High (> 5,000 fc)", "Full Sun", "Shade Tolerant"];
const PGR_OPTIONS = ["None", "Bonzi (paclobutrazol)", "Cycocel (chlormequat)", "B-Nine (daminozide)", "Sumagic (uniconazole)", "A-Rest (ancymidol)", "Florel (ethephon)", "Multiple — see notes"];

// ── UI PRIMITIVES ─────────────────────────────────────────────────────────────
function inputStyle(focus) {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1.5px solid ${focus ? "#7fb069" : "#c8d8c0"}`,
    background: "#fff", fontSize: 14, color: "#1e2d1a",
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
}

function FormField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7a8c74", marginBottom: 5, letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
      {label}
    </span>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 16, marginTop: 24 }}>
      {children}
    </div>
  );
}

// ── PARSE PROMPT ──────────────────────────────────────────────────────────────
function buildParsePrompt(breeder) {
  return `You are a horticulture data extraction assistant. The user has uploaded a breeder culture guide PDF from ${breeder || "a flower breeder"}.

Extract ALL variety/cultivar data found in the document. For each variety, return a JSON array of objects with these exact fields:

{
  "cropName": "",
  "variety": "",
  "breeder": "${breeder || ""}",
  "type": "Annual | Perennial | Biennial",
  "propTraySize": "",
  "propCellCount": "",
  "propWeeks": "",
  "finishWeeks": "",
  "finishTempDay": "",
  "finishTempNight": "",
  "lightRequirement": "",
  "fertilizerRate": "",
  "fertilizerType": "",
  "spacing": "",
  "pgrType": "",
  "pgrRate": "",
  "pgrTiming": "",
  "pinchingNotes": "",
  "generalNotes": ""
}

Rules:
- Extract every variety you can find
- Use null for fields not mentioned
- propWeeks and finishWeeks should be numbers or ranges like "8-10"
- temperatures in °F
- spacing in inches
- Return ONLY a valid JSON array, no markdown, no explanation, no backticks`;
}

// ── VARIETY FORM ──────────────────────────────────────────────────────────────
function VarietyForm({ initial, onSave, onCancel, title }) {
  const [form, setForm] = useState(initial || {
    cropName: "", variety: "", breeder: "", type: "Annual",
    propTraySize: "", propCellCount: "", propWeeks: "",
    finishWeeks: "", finishTempDay: "", finishTempNight: "",
    lightRequirement: "", fertilizerRate: "", fertilizerType: "",
    spacing: "", pgrType: "None", pgrRate: "", pgrTiming: "",
    pinchingNotes: "", generalNotes: "", cultureGuideUrl: "",
  });
  const [focus, setFocus] = useState(null);
  const f = (field) => ({ style: inputStyle(focus === field), value: form[field] || "", onChange: e => setForm(x => ({ ...x, [field]: e.target.value })), onFocus: () => setFocus(field), onBlur: () => setFocus(null) });

  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 28, border: "1.5px solid #e0ead8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: "#1e2d1a" }}>{title || "Variety Details"}</h3>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aabba0" }}>×</button>}
      </div>

      <SectionHeader>Identity</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Crop Name *"><input {...f("cropName")} placeholder="e.g. Petunia" /></FormField>
        <FormField label="Variety / Series *"><input {...f("variety")} placeholder="e.g. Wave Purple" /></FormField>
        <FormField label="Breeder">
          <select style={inputStyle(false)} value={form.breeder || ""} onChange={e => setForm(x => ({ ...x, breeder: e.target.value }))}>
            <option value="">— Select —</option>
            {BREEDERS.map(b => <option key={b.name}>{b.name}</option>)}
          </select>
        </FormField>
        <FormField label="Type">
          <select style={inputStyle(false)} value={form.type || "Annual"} onChange={e => setForm(x => ({ ...x, type: e.target.value }))}>
            <option>Annual</option><option>Perennial</option><option>Biennial</option>
          </select>
        </FormField>
      </div>
      <FormField label="Culture Guide URL" hint="Link to official breeder culture guide for grower reference">
        <input {...f("cultureGuideUrl")} placeholder="https://..." />
      </FormField>

      <SectionHeader>Propagation</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="Tray Size"><input {...f("propTraySize")} placeholder="e.g. 288, 512" /></FormField>
        <FormField label="Cell Count"><input {...f("propCellCount")} placeholder="e.g. 288" /></FormField>
        <FormField label="Prop Time (weeks)"><input {...f("propWeeks")} placeholder="e.g. 4-6" /></FormField>
      </div>

      <SectionHeader>Finish Conditions</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="Finish Time (weeks)"><input {...f("finishWeeks")} placeholder="e.g. 8-10" /></FormField>
        <FormField label="Day Temp (°F)"><input {...f("finishTempDay")} placeholder="e.g. 68" /></FormField>
        <FormField label="Night Temp (°F)"><input {...f("finishTempNight")} placeholder="e.g. 58" /></FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Light Requirement">
          <select style={inputStyle(false)} value={form.lightRequirement || ""} onChange={e => setForm(x => ({ ...x, lightRequirement: e.target.value }))}>
            <option value="">— Select —</option>
            {LIGHT_OPTIONS.map(l => <option key={l}>{l}</option>)}
          </select>
        </FormField>
        <FormField label="Spacing (inches)"><input {...f("spacing")} placeholder="e.g. 10-12" /></FormField>
      </div>

      <SectionHeader>Fertility</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FormField label="Fertilizer Type"><input {...f("fertilizerType")} placeholder="e.g. Peters 20-10-20" /></FormField>
        <FormField label="Rate (ppm N)"><input {...f("fertilizerRate")} placeholder="e.g. 150-200" /></FormField>
      </div>

      <SectionHeader>PGR Program</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FormField label="PGR Type">
          <select style={inputStyle(false)} value={form.pgrType || "None"} onChange={e => setForm(x => ({ ...x, pgrType: e.target.value }))}>
            {PGR_OPTIONS.map(p => <option key={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Rate"><input {...f("pgrRate")} placeholder="e.g. 5 ppm" /></FormField>
        <FormField label="Timing / Application"><input {...f("pgrTiming")} placeholder="e.g. Weeks 3-5, drench" /></FormField>
      </div>

      <SectionHeader>Cultural Notes</SectionHeader>
      <FormField label="Pinching & Pruning">
        <textarea style={{ ...inputStyle(focus === "pinching"), minHeight: 70, resize: "vertical" }} value={form.pinchingNotes || ""} onChange={e => setForm(x => ({ ...x, pinchingNotes: e.target.value }))} onFocus={() => setFocus("pinching")} onBlur={() => setFocus(null)} placeholder="Pinch timing, number of pinches, pruning recommendations..." />
      </FormField>
      <FormField label="General Notes">
        <textarea style={{ ...inputStyle(focus === "notes"), minHeight: 70, resize: "vertical" }} value={form.generalNotes || ""} onChange={e => setForm(x => ({ ...x, generalNotes: e.target.value }))} onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} placeholder="Pest susceptibility, special handling, disease notes..." />
      </FormField>

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={() => onSave(form)} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          Save to Library
        </button>
        {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
      </div>
    </div>
  );
}

// ── VARIETY CARD ──────────────────────────────────────────────────────────────
function VarietyCard({ variety, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const breeder = BREEDERS.find(b => b.name === variety.breeder);
  const breederColor = breeder?.color || "#7a8c74";

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }} onClick={() => setExpanded(e => !e)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#1e2d1a" }}>{variety.cropName}</span>
            {variety.variety && <span style={{ color: "#7a8c74", fontSize: 14 }}>— {variety.variety}</span>}
            {variety.breeder && <Badge label={variety.breeder} color={breederColor} />}
            {variety.type && <Badge label={variety.type} color="#4a90d9" />}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#aabba0" }}>
            {variety.finishWeeks && <span>🗓 {variety.finishWeeks} wks finish</span>}
            {variety.finishTempDay && <span>🌡 {variety.finishTempDay}°F day</span>}
            {variety.pgrType && variety.pgrType !== "None" && <span>💊 {variety.pgrType}</span>}
            {variety.lightRequirement && <span>☀ {variety.lightRequirement}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12 }}>
          {variety.cultureGuideUrl && (
            <a href={variety.cultureGuideUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, color: "#4a90d9", textDecoration: "none", border: "1px solid #b0d0f0", borderRadius: 7, padding: "4px 10px", fontWeight: 600, background: "#f0f7ff", whiteSpace: "nowrap" }}>
              📄 Culture Guide
            </a>
          )}
          <span style={{ color: "#aabba0", fontSize: 18, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee", padding: "20px", background: "#fafcf8" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
            {[
              { label: "Prop Tray", value: variety.propTraySize },
              { label: "Cell Count", value: variety.propCellCount },
              { label: "Prop Time", value: variety.propWeeks ? `${variety.propWeeks} weeks` : null },
              { label: "Finish Time", value: variety.finishWeeks ? `${variety.finishWeeks} weeks` : null },
              { label: "Day Temp", value: variety.finishTempDay ? `${variety.finishTempDay}°F` : null },
              { label: "Night Temp", value: variety.finishTempNight ? `${variety.finishTempNight}°F` : null },
              { label: "Light", value: variety.lightRequirement },
              { label: "Spacing", value: variety.spacing ? `${variety.spacing}"` : null },
              { label: "Fertilizer", value: variety.fertilizerType },
              { label: "Fert Rate", value: variety.fertilizerRate ? `${variety.fertilizerRate} ppm` : null },
              { label: "PGR", value: variety.pgrType !== "None" ? variety.pgrType : null },
              { label: "PGR Rate", value: variety.pgrRate },
              { label: "PGR Timing", value: variety.pgrTiming },
            ].filter(f => f.value).map(f => (
              <div key={f.label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#aabba0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 3 }}>{f.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e2d1a" }}>{f.value}</div>
              </div>
            ))}
          </div>

          {variety.pinchingNotes && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aabba0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Pinching & Pruning</div>
              <div style={{ fontSize: 13, color: "#1e2d1a", background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid #e0ead8" }}>{variety.pinchingNotes}</div>
            </div>
          )}
          {variety.generalNotes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aabba0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>General Notes</div>
              <div style={{ fontSize: 13, color: "#1e2d1a", background: "#fff", borderRadius: 8, padding: "10px 14px", border: "1px solid #e0ead8" }}>{variety.generalNotes}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onEdit(variety)} style={{ background: "none", color: "#4a90d9", border: "1px solid #b0d0f0", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Edit</button>
            <button onClick={() => onDelete(variety.id)} style={{ background: "none", color: "#e07b39", border: "1px solid #f0d0c0", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PDF UPLOADER ──────────────────────────────────────────────────────────────
function PDFUploader({ onExtracted }) {
  const [breeder, setBreeder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const fileRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }

    setLoading(true);
    setError(null);
    setStatus("Reading PDF...");

    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(",")[1]);
        reader.onerror = () => rej(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      setStatus("Extracting variety data with AI...");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 }
              },
              {
                type: "text",
                text: buildParsePrompt(breeder)
              }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";

      let parsed;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(clean);
      } catch {
        throw new Error("Could not parse variety data from this PDF. Try a different guide or add manually.");
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No variety data found in this PDF.");
      }

      setStatus(`Found ${parsed.length} variet${parsed.length === 1 ? "y" : "ies"} — review below before saving.`);
      onExtracted(parsed.map(v => ({ ...v, id: Date.now().toString() + Math.random(), breeder: breeder || v.breeder || "" })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "24px 28px", marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#1e2d1a", marginBottom: 4 }}>📄 Import from Culture Guide PDF</div>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 18 }}>Upload a breeder PDF and AI will extract variety data automatically. You'll review before saving.</div>

      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", letterSpacing: 0.6, textTransform: "uppercase", display: "block", marginBottom: 5 }}>Breeder Source</label>
          <select style={inputStyle(false)} value={breeder} onChange={e => setBreeder(e.target.value)}>
            <option value="">— Select breeder —</option>
            {BREEDERS.map(b => <option key={b.name}>{b.name}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", letterSpacing: 0.6, textTransform: "uppercase", display: "block", marginBottom: 5 }}>PDF File</label>
          <label style={{ display: "inline-block", background: loading ? "#e0ead8" : "#7fb069", color: "#fff", borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
            {loading ? "Processing..." : "Choose PDF"}
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} disabled={loading} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {status && !error && (
        <div style={{ marginTop: 14, fontSize: 13, color: "#4a7a35", background: "#f0f8eb", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          {loading && <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #7fb069", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
          {status}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 14, fontSize: 13, color: "#c0392b", background: "#fdf0ee", borderRadius: 8, padding: "10px 14px" }}>⚠ {error}</div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {BREEDERS.filter(b => b.url).map(b => (
          <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: b.color, textDecoration: "none", border: `1px solid ${b.color}55`, borderRadius: 20, padding: "3px 10px", fontWeight: 600, background: b.color + "11" }}>
            {b.name} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function VarietyLibrary() {
  const [library, setLibrary] = useStorage("gh_variety_library", []);
  const [view, setView] = useState("library"); // library | add | edit | review
  const [editingId, setEditingId] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [filterBreeder, setFilterBreeder] = useState("");
  const [filterType, setFilterType] = useState("");

  function saveVariety(form) {
    if (!form.cropName) return;
    if (editingId) {
      setLibrary(l => l.map(x => x.id === editingId ? { ...x, ...form } : x));
    } else {
      setLibrary(l => [...l, { ...form, id: Date.now().toString() }]);
    }
    setView("library");
    setEditingId(null);
  }

  function startEdit(variety) {
    setEditingId(variety.id);
    setView("edit");
  }

  function deleteVariety(id) {
    if (window.confirm("Remove this variety from the library?")) {
      setLibrary(l => l.filter(x => x.id !== id));
    }
  }

  function handleExtracted(varieties) {
    setReviewQueue(varieties);
    setReviewIndex(0);
    setView("review");
  }

  function saveReviewed(form) {
    setLibrary(l => [...l, { ...form, id: Date.now().toString() }]);
    if (reviewIndex < reviewQueue.length - 1) {
      setReviewIndex(i => i + 1);
    } else {
      setView("library");
      setReviewQueue([]);
    }
  }

  function skipReviewed() {
    if (reviewIndex < reviewQueue.length - 1) {
      setReviewIndex(i => i + 1);
    } else {
      setView("library");
      setReviewQueue([]);
    }
  }

  const filtered = library.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.cropName?.toLowerCase().includes(q) || v.variety?.toLowerCase().includes(q) || v.breeder?.toLowerCase().includes(q);
    const matchBreeder = !filterBreeder || v.breeder === filterBreeder;
    const matchType = !filterType || v.type === filterType;
    return matchSearch && matchBreeder && matchType;
  });

  const breeders = [...new Set(library.map(v => v.breeder).filter(Boolean))];

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy by Schlegel Greenhouse" style={{ height: 52, objectFit: "contain" }} />
          <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Variety Library</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {view !== "library" && (
            <button onClick={() => { setView("library"); setEditingId(null); }} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Library</button>
          )}
          {view === "library" && (
            <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add Variety</button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

        {/* LIBRARY VIEW */}
        {view === "library" && (
          <>
            <PDFUploader onExtracted={handleExtracted} />

            {/* Search & Filter */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle(false), flex: 2, minWidth: 180 }}
                placeholder="Search varieties..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select style={{ ...inputStyle(false), flex: 1, minWidth: 140 }} value={filterBreeder} onChange={e => setFilterBreeder(e.target.value)}>
                <option value="">All Breeders</option>
                {breeders.map(b => <option key={b}>{b}</option>)}
              </select>
              <select style={{ ...inputStyle(false), flex: 1, minWidth: 120 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                <option>Annual</option><option>Perennial</option><option>Biennial</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#7a8c74" }}>{filtered.length} variet{filtered.length === 1 ? "y" : "ies"} in library</div>
            </div>

            {filtered.length === 0 && library.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#aabba0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🌿</div>
                <div style={{ fontSize: 15, marginBottom: 8 }}>Your variety library is empty</div>
                <div style={{ fontSize: 13 }}>Upload a breeder PDF above or add a variety manually</div>
              </div>
            )}

            {filtered.length === 0 && library.length > 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0", fontSize: 14 }}>No varieties match your search</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map(variety => (
                <VarietyCard key={variety.id} variety={variety} onEdit={startEdit} onDelete={deleteVariety} />
              ))}
            </div>
          </>
        )}

        {/* ADD VIEW */}
        {view === "add" && (
          <VarietyForm
            title="Add New Variety"
            onSave={saveVariety}
            onCancel={() => setView("library")}
          />
        )}

        {/* EDIT VIEW */}
        {view === "edit" && editingId && (
          <VarietyForm
            title="Edit Variety"
            initial={library.find(v => v.id === editingId)}
            onSave={saveVariety}
            onCancel={() => { setView("library"); setEditingId(null); }}
          />
        )}

        {/* REVIEW VIEW — extracted from PDF */}
        {view === "review" && reviewQueue.length > 0 && (
          <div>
            <div style={{ background: "#f0f8eb", border: "1.5px solid #c8e6b8", borderRadius: 12, padding: "14px 20px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#2e5c1e", fontSize: 14 }}>Reviewing extracted varieties</div>
                <div style={{ fontSize: 12, color: "#7a9a6a", marginTop: 2 }}>{reviewIndex + 1} of {reviewQueue.length} — review each variety, edit if needed, then save or skip</div>
              </div>
              <button onClick={() => { setView("library"); setReviewQueue([]); }} style={{ background: "none", color: "#7a8c74", border: "1px solid #c8d8c0", borderRadius: 7, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Exit Review
              </button>
            </div>

            <VarietyForm
              title={`${reviewQueue[reviewIndex].cropName || "Variety"} ${reviewQueue[reviewIndex].variety || ""}`}
              initial={reviewQueue[reviewIndex]}
              onSave={saveReviewed}
              onCancel={null}
            />

            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button onClick={skipReviewed} style={{ background: "none", color: "#aabba0", border: "none", fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
                Skip this variety →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══ CONTAINER LIBRARY ═══


// ── STORAGE ───────────────────────────────────────────────────────────────────
// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const CONTAINER_TYPES = [
  { id: "pot",     label: "Pot / Container",    icon: "🪴", color: "#7fb069" },
  { id: "basket",  label: "Hanging Basket",     icon: "🧺", color: "#4a90d9" },
  { id: "bowl",    label: "Jumbo / Color Bowl", icon: "🌸", color: "#8e44ad" },
  { id: "gallon",  label: "Gallon Container",   icon: "🫙", color: "#c8791a" },
  { id: "quart",   label: "Quart",              icon: "🥤", color: "#2e8b57" },
  { id: "custom",  label: "Custom",             icon: "📦", color: "#7a8c74" },
];
const TRAY_TYPES = [
  { id: "plug",    label: "Plug Tray",          icon: "🌱", color: "#7fb069" },
  { id: "liner",   label: "Liner Tray",         icon: "🌿", color: "#4a90d9" },
  { id: "flat",    label: "Bedding Flat",       icon: "▦",  color: "#8e44ad" },
  { id: "cell",    label: "Cell Pack",          icon: "⊞",  color: "#c8791a" },
  { id: "trayOther", label: "Other Tray",       icon: "📋", color: "#7a8c74" },
];
const MATERIALS = ["Plastic", "Biodegradable", "Fiber", "Terracotta", "Foam", "Other"];
const VOLUME_UNITS = ["qt", "gal", "cu in", "L"];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dc  = (o) => JSON.parse(JSON.stringify(o));
const ctc = (id) => CONTAINER_TYPES.find(c => c.id === id) || CONTAINER_TYPES[0];
const ttc = (id) => TRAY_TYPES.find(t => t.id === id) || TRAY_TYPES[0];

function fmtVolume(val, unit) { return val ? `${val} ${unit || "qt"}` : null; }
function substrateTotal(substrateVol, substrateUnit, units) {
  if (!substrateVol || !units) return null;
  const perUnit = Number(substrateVol);
  const total   = perUnit * units;
  // convert to cubic feet for ordering context (1 cu ft = 25.71 qt, 1 gal = 4 qt)
  let cuFt = null;
  if (substrateUnit === "qt")    cuFt = total / 25.71;
  if (substrateUnit === "gal")   cuFt = (total * 4) / 25.71;
  if (substrateUnit === "cu in") cuFt = total / 1728;
  if (substrateUnit === "L")     cuFt = total / 28.32;
  return { total: total.toFixed(1), unit: substrateUnit, cuFt: cuFt ? cuFt.toFixed(1) : null };
}

// ── PRIMITIVES ────────────────────────────────────────────────────────────────
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const TA = (f) => ({ ...IS(f), minHeight: 55, resize: "vertical" });
function FL({ c }) { return <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7a8c74", marginBottom: 5, letterSpacing: .6, textTransform: "uppercase" }}>{c}</label>; }
function SH({ c, mt, color }) { return <div style={{ fontSize: 11, fontWeight: 800, color: color || "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: `1.5px solid ${color ? color + "33" : "#e0ead8"}`, paddingBottom: 7, marginBottom: 14, marginTop: mt || 10 }}>{c}</div>; }
function IBtn({ onClick, danger, children }) { return <button onClick={onClick} style={{ background: "none", border: `1px solid ${danger ? "#f0d0c0" : "#e0ead8"}`, borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: danger ? "#e07b39" : "#aabba0", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{children}</button>; }
function ABtn({ onClick, label, color, border }) { return <button onClick={onClick} style={{ background: color || "none", color: color ? "#fff" : "#7a8c74", border: `1px solid ${border || "#c8d8c0"}`, borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: color ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>; }

// ── SPACING BLOCK ─────────────────────────────────────────────────────────────
function SpacingBlock({ spacing, onChange, cropSpecific }) {
  // spacing = { tight, spaced, finish } each = { inchesX, inchesY, sqFtPer, note }
  const sp = spacing || {};
  const upd = (stage, field, val) => onChange({ ...sp, [stage]: { ...(sp[stage] || {}), [field]: val } });

  const stages = [
    { id: "tight",  label: "Tight (initial)",   icon: "⬛", desc: "Pot-to-pot density right after transplant" },
    { id: "spaced", label: "Spaced (mid)",       icon: "⬜", desc: "First spacing — pull every other, or spread out" },
    { id: "finish", label: "Finish spacing",     icon: "◻️", desc: "Final position until move-out or ship" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {cropSpecific && (
        <div style={{ background: "#fff8f0", border: "1px solid #f0c080", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#7a4a10" }}>
          🌱 Crop-specific spacing — these values override container defaults for this crop run
        </div>
      )}
      {stages.map(stage => {
        const s = sp[stage.id] || {};
        return (
          <div key={stage.id} style={{ background: "#f8faf6", borderRadius: 10, border: "1px solid #e0ead8", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>{stage.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{stage.label}</div>
                <div style={{ fontSize: 10, color: "#aabba0" }}>{stage.desc}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 8 }}>
              <div><FL c='Spacing X (")' /><input type="number" step="0.5" style={IS(false)} value={s.inchesX || ""} onChange={e => upd(stage.id, "inchesX", e.target.value)} placeholder='e.g. 8' /></div>
              <div><FL c='Spacing Y (")' /><input type="number" step="0.5" style={IS(false)} value={s.inchesY || ""} onChange={e => upd(stage.id, "inchesY", e.target.value)} placeholder='e.g. 8' /></div>
              <div>
                <FL c="Sq ft / unit" />
                <input type="number" step="0.01" style={IS(false)} value={s.sqFtPer || ""} onChange={e => upd(stage.id, "sqFtPer", e.target.value)} placeholder="e.g. 0.44" />
                {s.inchesX && s.inchesY && !s.sqFtPer && (
                  <div style={{ fontSize: 10, color: "#7fb069", marginTop: 3, cursor: "pointer", fontWeight: 600 }}
                    onClick={() => upd(stage.id, "sqFtPer", ((Number(s.inchesX) * Number(s.inchesY)) / 144).toFixed(3))}>
                    ↑ Auto-fill: {((Number(s.inchesX) * Number(s.inchesY)) / 144).toFixed(3)} sf
                  </div>
                )}
              </div>
              <div><FL c="Note" /><input style={IS(false)} value={s.note || ""} onChange={e => upd(stage.id, "note", e.target.value)} placeholder="e.g. Pull every other at wk 4" /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CONTAINER FORM ────────────────────────────────────────────────────────────
function ContainerForm({ initial, onSave, onCancel }) {
  const blank = {
    kind: "finished", // finished | propagation
    type: "pot", trayType: "plug",
    name: "", diameter: "", heightIn: "", material: "",
    volumeVal: "", volumeUnit: "qt",
    cellsPerFlat: "", unitsPerCase: "", qtyPerPallet: "",
    costPerUnit: "",
    substrateVol: "", substrateUnit: "qt",
    supplier: "", supplier2: "", sku: "", notes: "",
    spacing: {},
  };
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [focus, setFocus] = useState(null);
  const [tab, setTab] = useState("details");
  const upd = (f, v) => setForm(x => ({ ...x, [f]: v }));

  const isFinished   = form.kind === "finished";
  const typeList     = isFinished ? CONTAINER_TYPES : TRAY_TYPES;
  const selectedType = isFinished ? ctc(form.type) : ttc(form.trayType);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit Container" : "New Container"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>

      <div style={{ padding: "22px 24px" }}>
        {/* Kind toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["finished","🛒 Finished Product"],["propagation","🌱 Propagation / Tray"]].map(([id, label]) => (
            <button key={id} onClick={() => upd("kind", id)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${form.kind === id ? "#7fb069" : "#c8d8c0"}`, background: form.kind === id ? "#f0f8eb" : "#fff", color: form.kind === id ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        {/* Type picker */}
        <div style={{ marginBottom: 18 }}>
          <FL c="Container Type" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {typeList.map(t => (
              <button key={t.id} onClick={() => upd(isFinished ? "type" : "trayType", t.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${selectedType.id === t.id ? t.color : "#c8d8c0"}`, background: selectedType.id === t.id ? t.color + "14" : "#fff", color: selectedType.id === t.id ? t.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1.5px solid #e0ead8", marginBottom: 20 }}>
          {[["details","Details"],["substrate","Substrate"],["spacing","Spacing"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: `3px solid ${tab === id ? "#7fb069" : "transparent"}`, padding: "10px 18px", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? "#1e2d1a" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        {/* ── DETAILS TAB ── */}
        {tab === "details" && (
          <div>
            <SH c="Identity" mt={0} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div style={{ gridColumn: "span 2" }}>
                <FL c="Container Name *" />
                <input style={IS(focus === "name")} value={form.name} onChange={e => upd("name", e.target.value)} onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder={isFinished ? 'e.g. 4.5" Standard Pot, 12" Basket' : 'e.g. 1204 Plug Tray, 606 Flat'} />
              </div>
              {isFinished && (<>
                <div>
                  <FL c='Diameter (")' />
                  <input type="number" step="0.25" style={IS(focus === "dia")} value={form.diameter} onChange={e => upd("diameter", e.target.value)} onFocus={() => setFocus("dia")} onBlur={() => setFocus(null)} placeholder='e.g. 4.5' />
                </div>
                <div>
                  <FL c='Height (")' />
                  <input type="number" step="0.25" style={IS(focus === "ht")} value={form.heightIn} onChange={e => upd("heightIn", e.target.value)} onFocus={() => setFocus("ht")} onBlur={() => setFocus(null)} placeholder='e.g. 3.5' />
                </div>
                <div>
                  <FL c="Material" />
                  <select style={IS(false)} value={form.material} onChange={e => upd("material", e.target.value)}>
                    <option value="">— Select —</option>
                    {MATERIALS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </>)}
              {!isFinished && (
                <div>
                  <FL c="Cells per Flat" />
                  <input type="number" style={IS(focus === "cells")} value={form.cellsPerFlat} onChange={e => upd("cellsPerFlat", e.target.value)} onFocus={() => setFocus("cells")} onBlur={() => setFocus(null)} placeholder="e.g. 128, 288, 512" />
                </div>
              )}
              <div>
                <FL c="Units per Case" />
                <input type="number" style={IS(focus === "upc")} value={form.unitsPerCase} onChange={e => upd("unitsPerCase", e.target.value)} onFocus={() => setFocus("upc")} onBlur={() => setFocus(null)} placeholder="e.g. 10, 18, 50" />
              </div>
              <div>
                <FL c="Qty per Pallet" />
                <input type="number" style={IS(focus === "qpp")} value={form.qtyPerPallet} onChange={e => upd("qtyPerPallet", e.target.value)} onFocus={() => setFocus("qpp")} onBlur={() => setFocus(null)} placeholder="e.g. 1000, 2500" />
              </div>
            </div>

            <SH c="Volume" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <FL c="Container Volume" />
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" step="0.1" style={{ ...IS(focus === "vol"), flex: 1 }} value={form.volumeVal} onChange={e => upd("volumeVal", e.target.value)} onFocus={() => setFocus("vol")} onBlur={() => setFocus(null)} placeholder="e.g. 1.5" />
                  <select style={{ ...IS(false), width: 72, flexShrink: 0 }} value={form.volumeUnit} onChange={e => upd("volumeUnit", e.target.value)}>
                    {VOLUME_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <SH c="Sourcing & Cost" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div><FL c="Primary Supplier" /><input style={IS(focus === "sup")} value={form.supplier} onChange={e => upd("supplier", e.target.value)} onFocus={() => setFocus("sup")} onBlur={() => setFocus(null)} placeholder="e.g. Landmark, Nursery Supplies" /></div>
              <div><FL c="Secondary Supplier" /><input style={IS(focus === "sup2")} value={form.supplier2} onChange={e => upd("supplier2", e.target.value)} onFocus={() => setFocus("sup2")} onBlur={() => setFocus(null)} placeholder="Alternate source" /></div>
              <div><FL c="SKU / Item #" /><input style={IS(focus === "sku")} value={form.sku} onChange={e => upd("sku", e.target.value)} onFocus={() => setFocus("sku")} onBlur={() => setFocus(null)} placeholder="e.g. NP-45-STD" /></div>
              <div>
                <FL c="Cost per Unit ($)" />
                <input type="number" step="0.001" style={IS(focus === "cpu")} value={form.costPerUnit} onChange={e => upd("costPerUnit", e.target.value)} onFocus={() => setFocus("cpu")} onBlur={() => setFocus(null)} placeholder="e.g. 0.085" />
                {form.costPerUnit && form.unitsPerCase && (
                  <div style={{ fontSize: 11, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>
                    ${(Number(form.costPerUnit) * Number(form.unitsPerCase)).toFixed(2)} / case
                    {form.qtyPerPallet && <span style={{ marginLeft: 8 }}> · ${(Number(form.costPerUnit) * Number(form.qtyPerPallet)).toFixed(2)} / pallet</span>}
                  </div>
                )}
              </div>
            </div>

            <FL c="Notes" />
            <textarea style={TA(focus === "notes")} value={form.notes} onChange={e => upd("notes", e.target.value)} onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} placeholder="Color, special features, compatible crops..." />
          </div>
        )}

        {/* ── SUBSTRATE TAB ── */}
        {tab === "substrate" && (
          <div>
            <SH c="Substrate Volume" mt={0} />
            <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 16, lineHeight: 1.5 }}>
              Enter how much growing medium this container holds. Used to calculate total substrate needed per lot when this container is assigned to a crop run.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <FL c="Substrate Volume per Unit" />
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" step="0.1" style={{ ...IS(focus === "svol"), flex: 1 }} value={form.substrateVol} onChange={e => upd("substrateVol", e.target.value)} onFocus={() => setFocus("svol")} onBlur={() => setFocus(null)} placeholder="e.g. 0.75" />
                  <select style={{ ...IS(false), width: 72, flexShrink: 0 }} value={form.substrateUnit} onChange={e => upd("substrateUnit", e.target.value)}>
                    {VOLUME_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Preview substrate calc at different quantities */}
            {form.substrateVol && (
              <div style={{ background: "#f0f8eb", borderRadius: 12, border: "1px solid #c8e0b8", padding: "16px 18px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4a7a35", textTransform: "uppercase", letterSpacing: .6, marginBottom: 12 }}>Substrate Calculator Preview</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[100, 500, 1000, 5000].map(qty => {
                    const r = substrateTotal(form.substrateVol, form.substrateUnit, qty);
                    return r ? (
                      <div key={qty} style={{ background: "#fff", borderRadius: 8, border: "1px solid #c8e0b8", padding: "10px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 4 }}>{qty.toLocaleString()} units</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#2e5c1e" }}>{r.total} {r.unit}</div>
                        {r.cuFt && <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>{r.cuFt} cu ft</div>}
                      </div>
                    ) : null;
                  })}
                </div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 10 }}>Actual lot totals calculate automatically when this container is assigned to a crop run.</div>
              </div>
            )}
          </div>
        )}

        {/* ── SPACING TAB ── */}
        {tab === "spacing" && (
          <div>
            <SH c="Default Spacing" mt={0} />
            <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14, lineHeight: 1.5 }}>
              Set default spacing for this container. These values pre-fill when the container is assigned to a crop run. Crop runs can override any stage for crop-specific needs.
            </div>
            <SpacingBlock spacing={form.spacing} onChange={v => upd("spacing", v)} cropSpecific={false} />
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={() => form.name.trim() && onSave({ ...form, id: form.id || uid() })} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>{initial ? "Save Changes" : "Add Container"}</button>
          {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

// ── CONTAINER CARD ────────────────────────────────────────────────────────────
function ContainerCard({ container: c, onEdit, onDelete, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);
  const isFinished   = c.kind === "finished";
  const selectedType = isFinished ? ctc(c.type) : ttc(c.trayType);
  const sp = c.spacing || {};
  const hasSpacing = sp.tight?.inchesX || sp.spaced?.inchesX || sp.finish?.inchesX;

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: selectedType.color + "18", border: `1.5px solid ${selectedType.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{selectedType.icon}</div>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>{c.name}</span>
            <Badge label={isFinished ? "Finished Product" : "Propagation"} color={isFinished ? "#7fb069" : "#8e44ad"} />
            <Badge label={selectedType.label} color={selectedType.color} />
            {c.material && <Badge label={c.material} color="#7a8c74" />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {c.diameter && <Pill label='Diameter' value={c.diameter + '"'} color={selectedType.color} />}
            {c.cellsPerFlat && <Pill label="Cells" value={c.cellsPerFlat} color={selectedType.color} />}
            {c.unitsPerCase && <Pill label="/ Case" value={c.unitsPerCase} color="#7a8c74" />}
            {c.qtyPerPallet && <Pill label="/ Pallet" value={Number(c.qtyPerPallet).toLocaleString()} color="#7a8c74" />}
            {c.costPerUnit && <Pill label="$/unit" value={`$${Number(c.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
            {c.volumeVal && <Pill label="Volume" value={fmtVolume(c.volumeVal, c.volumeUnit)} color="#4a90d9" />}
            {c.substrateVol && <Pill label="Substrate/unit" value={fmtVolume(c.substrateVol, c.substrateUnit)} color="#2e8b57" />}
            {hasSpacing && <Pill label="Spacing" value="Set" color="#c8791a" />}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <ABtn onClick={() => onEdit(c)} label="Edit" color="#4a90d9" />
          <ABtn onClick={() => onDuplicate(c)} label="Duplicate" />
          <ABtn onClick={() => onDelete(c.id)} label="Remove" border="#f0d0c0" />
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee", padding: "16px 18px", background: "#fafcf8" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Details column */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 10 }}>Details</div>
              {[
                c.diameter     && ["Diameter",          c.diameter + '"'],
                c.heightIn     && ["Height",            c.heightIn + '"'],
                c.cellsPerFlat && ["Cells per flat",    c.cellsPerFlat],
                c.unitsPerCase && ["Units per case",    c.unitsPerCase],
                c.qtyPerPallet && ["Qty per pallet",    Number(c.qtyPerPallet).toLocaleString()],
                c.costPerUnit  && ["Cost per unit",     `$${Number(c.costPerUnit).toFixed(3)}`],
                c.costPerUnit && c.unitsPerCase && ["Cost per case", `$${(Number(c.costPerUnit) * Number(c.unitsPerCase)).toFixed(2)}`],
                c.costPerUnit && c.qtyPerPallet && ["Cost per pallet", `$${(Number(c.costPerUnit) * Number(c.qtyPerPallet)).toFixed(2)}`],
                c.volumeVal    && ["Container volume",  fmtVolume(c.volumeVal, c.volumeUnit)],
                c.substrateVol && ["Substrate / unit",  fmtVolume(c.substrateVol, c.substrateUnit)],
                c.supplier     && ["Primary supplier",  c.supplier],
                c.supplier2    && ["Secondary supplier",c.supplier2],
                c.sku          && ["SKU",               c.sku],
              ].filter(Boolean).map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "1px solid #f0f5ee" }}>
                  <span style={{ color: "#7a8c74" }}>{label}</span>
                  <span style={{ fontWeight: 600, color: "#1e2d1a" }}>{val}</span>
                </div>
              ))}
              {c.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 10, fontStyle: "italic" }}>{c.notes}</div>}
            </div>

            {/* Spacing column */}
            {hasSpacing && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 10 }}>Default Spacing</div>
                {[["tight","⬛ Tight"],["spaced","⬜ Spaced"],["finish","◻️ Finish"]].map(([stage, label]) => {
                  const s = sp[stage] || {};
                  if (!s.inchesX && !s.sqFtPer) return null;
                  return (
                    <div key={stage} style={{ background: "#fff", borderRadius: 8, border: "1px solid #e0d4c0", padding: "8px 12px", marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#c8791a", marginBottom: 4 }}>{label}</div>
                      {s.inchesX && <div style={{ fontSize: 12, color: "#1e2d1a" }}>{s.inchesX}" × {s.inchesY || s.inchesX}" spacing</div>}
                      {s.sqFtPer && <div style={{ fontSize: 11, color: "#7a8c74" }}>{s.sqFtPer} sf / unit</div>}
                      {s.note && <div style={{ fontSize: 11, color: "#aabba0", marginTop: 2 }}>{s.note}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Substrate reference table */}
          {c.substrateVol && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#2e8b57", textTransform: "uppercase", letterSpacing: .6, marginBottom: 10 }}>Substrate Reference</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[100,250,500,1000,2000,5000].map(qty => {
                  const r = substrateTotal(c.substrateVol, c.substrateUnit, qty);
                  return r ? (
                    <div key={qty} style={{ background: "#fff", borderRadius: 8, border: "1px solid #c8e0b8", padding: "8px 12px", textAlign: "center", minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: "#7a8c74" }}>{qty.toLocaleString()} units</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>{r.total} {r.unit}</div>
                      {r.cuFt && <div style={{ fontSize: 10, color: "#7a8c74" }}>{r.cuFt} cu ft</div>}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function ContainerLibrary() {
  const [containers, setContainers] = useStorage("gh_containers_v1", []);
  const [view,      setView      ] = useState("list");
  const [editingId, setEditingId ] = useState(null);
  const [kindFilter, setKindFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search,     setSearch   ] = useState("");

  function save(c) { if (editingId) setContainers(x => x.map(i => i.id === editingId ? c : i)); else setContainers(x => [...x, c]); setView("list"); setEditingId(null); }
  function del(id) { if (window.confirm("Remove this container?")) setContainers(x => x.filter(i => i.id !== id)); }
  function dup(c)  { setContainers(x => [...x, { ...dc(c), id: uid(), name: c.name + " (Copy)" }]); }

  const finished     = containers.filter(c => c.kind === "finished");
  const propagation  = containers.filter(c => c.kind === "propagation");

  const filtered = containers.filter(c => {
    if (kindFilter !== "all" && c.kind !== kindFilter) return false;
    if (typeFilter !== "all") {
      const t = c.kind === "finished" ? c.type : c.trayType;
      if (t !== typeFilter) return false;
    }
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain" }} />
          <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Container Library</div>
        </div>
        {view === "list"
          ? <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add Container</button>
          : <button onClick={() => { setView("list"); setEditingId(null); }} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        }
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {view === "list" && (<>

          {/* Summary */}
          {containers.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 24px", marginBottom: 24 }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 14 }}>Container Library</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill label="Total" value={containers.length} color="#1e2d1a" />
                <Pill label="🛒 Finished" value={finished.length} color="#7fb069" />
                <Pill label="🌱 Propagation" value={propagation.length} color="#8e44ad" />
                {[...CONTAINER_TYPES, ...TRAY_TYPES].map(t => {
                  const n = containers.filter(c => (c.kind === "finished" ? c.type : c.trayType) === t.id).length;
                  return n > 0 ? <Pill key={t.id} label={t.icon + " " + t.label} value={n} color={t.color} /> : null;
                })}
              </div>
            </div>
          )}

          {/* Search + filters */}
          {containers.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." style={{ ...IS(false), width: 200, flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 4 }}>
                {[["all","All"],["finished","🛒 Finished"],["propagation","🌱 Propagation"]].map(([id, label]) => (
                  <button key={id} onClick={() => setKindFilter(id)} style={{ background: kindFilter === id ? "#1e2d1a" : "#fff", color: kindFilter === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${kindFilter === id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Finished section */}
          {(kindFilter === "all" || kindFilter === "finished") && filtered.filter(c => c.kind === "finished").length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                🛒 Finished Product Containers
                <span style={{ background: "#7fb06920", color: "#7fb069", border: "1px solid #7fb06944", borderRadius: 10, padding: "1px 8px", fontSize: 10 }}>{filtered.filter(c => c.kind === "finished").length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.filter(c => c.kind === "finished").map(c => (
                  <ContainerCard key={c.id} container={c} onEdit={x => { setEditingId(x.id); setView("edit"); }} onDelete={del} onDuplicate={dup} />
                ))}
              </div>
            </div>
          )}

          {/* Propagation section */}
          {(kindFilter === "all" || kindFilter === "propagation") && filtered.filter(c => c.kind === "propagation").length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                🌱 Propagation Trays
                <span style={{ background: "#8e44ad20", color: "#8e44ad", border: "1px solid #8e44ad44", borderRadius: 10, padding: "1px 8px", fontSize: 10 }}>{filtered.filter(c => c.kind === "propagation").length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtered.filter(c => c.kind === "propagation").map(c => (
                  <ContainerCard key={c.id} container={c} onEdit={x => { setEditingId(x.id); setView("edit"); }} onDelete={del} onDuplicate={dup} />
                ))}
              </div>
            </div>
          )}

          {containers.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#aabba0" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>🪴</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No containers yet</div>
              <div style={{ fontSize: 13, marginBottom: 24, color: "#aabba0" }}>Build your library of finished product containers and propagation trays</div>
              <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add First Container</button>
            </div>
          )}

          {containers.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0", fontSize: 13 }}>No containers match your filters</div>
          )}
        </>)}

        {view === "add"  && <ContainerForm onSave={save} onCancel={() => setView("list")} />}
        {view === "edit" && editingId && <ContainerForm initial={containers.find(c => c.id === editingId)} onSave={save} onCancel={() => { setView("list"); setEditingId(null); }} />}
      </div>
    </div>
  );
}


// ═══ SPACING LIBRARY ═══


// ── STORAGE ───────────────────────────────────────────────────────────────────
// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const PROFILE_TAGS = [
  { id: "crop",      label: "Crop-Based",      icon: "🌿", color: "#7fb069", desc: "Defined by crop behavior (e.g. Impatiens, Geranium)" },
  { id: "container", label: "Container-Based",  icon: "🪴", color: "#4a90d9", desc: "Defined by pot/basket size (e.g. 4.5\", 6\", 10\" basket)" },
  { id: "general",   label: "General",          icon: "📐", color: "#7a8c74", desc: "Applies broadly regardless of crop or container" },
];

const STAGE_DEFS = [
  { id: "tight",  label: "Tight",  icon: "⬛", desc: "Initial density — pots touching or trays close", color: "#4a90d9" },
  { id: "spaced", label: "Spaced", icon: "⬜", desc: "Mid-stage — pull every other or spread out",      color: "#c8791a" },
  { id: "finish", label: "Finish", icon: "◻️", desc: "Final position — held until ship or move-out",    color: "#7fb069" },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function calcSqFt(x, y) {
  const xn = Number(x), yn = Number(y || x);
  if (!xn || !yn) return null;
  return (xn * yn / 144).toFixed(3);
}
function calcPotsPerBench(x, y, benchW, benchL) {
  const xn = Number(x), yn = Number(y || x);
  const wn = Number(benchW), ln = Number(benchL);
  if (!xn || !yn || !wn || !ln) return null;
  const cols = Math.floor((wn * 12) / xn);
  const rows = Math.floor((ln * 12) / yn);
  return cols * rows;
}

// ── PRIMITIVES ────────────────────────────────────────────────────────────────
// ── STAGE EDITOR ──────────────────────────────────────────────────────────────
function StageEditor({ stage, data, onChange, benchW, benchL }) {
  const [focus, setFocus] = useState(null);
  const sf  = calcSqFt(data?.x, data?.y);
  const pots = calcPotsPerBench(data?.x, data?.y, benchW, benchL);
  const def  = STAGE_DEFS.find(s => s.id === stage);
  const enabled = !!data?.enabled;

  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${enabled ? def.color + "55" : "#e0ead8"}`, overflow: "hidden", transition: "border-color .2s" }}>
      {/* Stage header */}
      <div style={{ background: enabled ? def.color + "10" : "#f8faf6", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => onChange({ ...data, enabled: !enabled })}
          style={{ width: 36, height: 20, borderRadius: 10, background: enabled ? def.color : "#c8d8c0", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background .2s" }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 3, left: enabled ? 19 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
        </button>
        <span style={{ fontSize: 16 }}>{def.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: enabled ? "#1e2d1a" : "#aabba0" }}>{def.label}</div>
          <div style={{ fontSize: 11, color: "#aabba0" }}>{def.desc}</div>
        </div>
        {enabled && sf && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: def.color }}>{sf} sf/pot</div>
            {pots && <div style={{ fontSize: 10, color: "#7a8c74" }}>{pots.toLocaleString()} pots on {benchW}′×{benchL}′</div>}
          </div>
        )}
      </div>

      {/* Stage inputs */}
      {enabled && (
        <div style={{ padding: "14px 16px", background: "#fff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 10 }}>
            <div>
              <FL c='Center-to-Center X (")' />
              <input type="number" step="0.5" style={IS(focus === stage + "x")}
                value={data?.x || ""} onChange={e => onChange({ ...data, enabled: true, x: e.target.value })}
                onFocus={() => setFocus(stage + "x")} onBlur={() => setFocus(null)}
                placeholder='e.g. 8' />
            </div>
            <div>
              <FL c='Center-to-Center Y (")' />
              <input type="number" step="0.5" style={IS(focus === stage + "y")}
                value={data?.y || ""} onChange={e => onChange({ ...data, enabled: true, y: e.target.value })}
                onFocus={() => setFocus(stage + "y")} onBlur={() => setFocus(null)}
                placeholder='same as X' />
              {data?.x && !data?.y && <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 3 }}>Defaults to X ({data.x}")</div>}
            </div>
            <div>
              <FL c="Sq ft / pot" />
              <div style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #e0ead8", background: "#f8faf6", fontSize: 14, fontWeight: 700, color: sf ? def.color : "#aabba0" }}>
                {sf ? sf : "—"}
              </div>
              {sf && <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 3 }}>{Math.round(144 / (Number(data.x) * Number(data.y || data.x)))} pots/sf</div>}
            </div>
            <div>
              <FL c="Note" />
              <input style={IS(focus === stage + "note")}
                value={data?.note || ""} onChange={e => onChange({ ...data, enabled: true, note: e.target.value })}
                onFocus={() => setFocus(stage + "note")} onBlur={() => setFocus(null)}
                placeholder='e.g. Pull every other at wk 4, move to finish' />
            </div>
          </div>

          {/* Bench density preview */}
          {data?.x && (
            <div style={{ marginTop: 12, background: def.color + "08", borderRadius: 8, padding: "10px 14px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Bench density preview</div>
              {[["4", "100"], ["4", "150"], ["6", "100"], ["6", "150"], ["8", "100"]].map(([w, l]) => {
                const n = calcPotsPerBench(data.x, data.y || data.x, w, l);
                return n ? (
                  <div key={w + "x" + l} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#1e2d1a" }}>{n.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: "#7a8c74" }}>{w}′×{l}′</div>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SPACING FORM ──────────────────────────────────────────────────────────────
function SpacingForm({ initial, onSave, onCancel }) {
  const blank = {
    name: "", tag: "crop", cropRef: "", containerRef: "", notes: "",
    stages: { tight: { enabled: false }, spaced: { enabled: false }, finish: { enabled: true } },
    benchW: "4", benchL: "100",
  };
  const [form, setForm] = useState(initial ? dc({ ...blank, ...initial }) : blank);
  const [focus, setFocus] = useState(null);
  const tag = PROFILE_TAGS.find(t => t.id === form.tag) || PROFILE_TAGS[0];
  const upd = (f, v) => setForm(x => ({ ...x, [f]: v }));
  const updStage = (stage, data) => setForm(x => ({ ...x, stages: { ...x.stages, [stage]: data } }));

  const activeStages = STAGE_DEFS.filter(s => form.stages[s.id]?.enabled);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit Spacing Profile" : "New Spacing Profile"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>

      <div style={{ padding: "24px" }}>
        {/* Name */}
        <SH c="Profile Identity" mt={0} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <FL c="Profile Name *" />
            <input style={IS(focus === "name")} value={form.name}
              onChange={e => upd("name", e.target.value)}
              onFocus={() => setFocus("name")} onBlur={() => setFocus(null)}
              placeholder='e.g. Impatiens Finish, 4.5" Tight, Geranium Standard' />
          </div>
          <div>
            <FL c="Profile Type" />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {PROFILE_TAGS.map(t => (
                <button key={t.id} onClick={() => upd("tag", t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${form.tag === t.id ? t.color : "#c8d8c0"}`, background: form.tag === t.id ? t.color + "12" : "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ fontSize: 14 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: form.tag === t.id ? t.color : "#7a8c74" }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: "#aabba0", lineHeight: 1.3 }}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Crop / container reference */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {(form.tag === "crop" || form.tag === "general") && (
            <div>
              <FL c="Crop Reference" />
              <input style={IS(focus === "cr")} value={form.cropRef}
                onChange={e => upd("cropRef", e.target.value)}
                onFocus={() => setFocus("cr")} onBlur={() => setFocus(null)}
                placeholder='e.g. Impatiens, Geranium, Petunia' />
            </div>
          )}
          {(form.tag === "container" || form.tag === "general") && (
            <div>
              <FL c="Container Reference" />
              <input style={IS(focus === "conr")} value={form.containerRef}
                onChange={e => upd("containerRef", e.target.value)}
                onFocus={() => setFocus("conr")} onBlur={() => setFocus(null)}
                placeholder='e.g. 4.5" pot, 10" basket, 6" gallon' />
            </div>
          )}
          <div>
            <FL c="Notes" />
            <input style={IS(focus === "notes")} value={form.notes}
              onChange={e => upd("notes", e.target.value)}
              onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)}
              placeholder='Any additional context...' />
          </div>
        </div>

        {/* Bench preview dimensions */}
        <SH c="Spacing Stages" />
        <div style={{ background: "#f0f8eb", borderRadius: 10, border: "1px solid #c8e0b8", padding: "10px 14px", marginBottom: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4a7a35", textTransform: "uppercase", letterSpacing: .5 }}>Bench preview dimensions</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#7a8c74" }}>Width</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["4","6","8"].map(w => (
                <button key={w} onClick={() => upd("benchW", w)}
                  style={{ padding: "4px 10px", borderRadius: 6, border: `1.5px solid ${form.benchW === w ? "#7fb069" : "#c8d8c0"}`, background: form.benchW === w ? "#f0f8eb" : "#fff", fontSize: 12, fontWeight: 700, color: form.benchW === w ? "#2e5c1e" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                  {w}′
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#7a8c74" }}>Length</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["50","100","150","200"].map(l => (
                <button key={l} onClick={() => upd("benchL", l)}
                  style={{ padding: "4px 10px", borderRadius: 6, border: `1.5px solid ${form.benchL === l ? "#7fb069" : "#c8d8c0"}`, background: form.benchL === l ? "#f0f8eb" : "#fff", fontSize: 12, fontWeight: 700, color: form.benchL === l ? "#2e5c1e" : "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                  {l}′
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>Used only to show pot count previews — doesn't save to profile</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STAGE_DEFS.map(s => (
            <StageEditor key={s.id} stage={s.id}
              data={form.stages[s.id]}
              onChange={data => updStage(s.id, data)}
              benchW={form.benchW} benchL={form.benchL} />
          ))}
        </div>

        {/* Profile summary */}
        {activeStages.length > 0 && (
          <div style={{ marginTop: 18, background: "#f8faf6", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 12 }}>Profile Summary</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeStages.map(s => {
                const d = form.stages[s.id];
                const sf = calcSqFt(d.x, d.y);
                return sf ? (
                  <Pill key={s.id} label={s.label} value={`${d.x}"${d.y && d.y !== d.x ? ` × ${d.y}"` : ""}`} sub={sf + " sf/pot"} color={s.color} />
                ) : null;
              })}
            </div>
            {activeStages.length > 1 && (() => {
              const first = form.stages[activeStages[0].id];
              const last  = form.stages[activeStages[activeStages.length - 1].id];
              const sfFirst = calcSqFt(first.x, first.y);
              const sfLast  = calcSqFt(last.x, last.y);
              if (!sfFirst || !sfLast) return null;
              const mult = (Number(sfLast) / Number(sfFirst)).toFixed(1);
              return (
                <div style={{ marginTop: 10, fontSize: 12, color: "#7a8c74" }}>
                  Tight → Finish expansion: <strong style={{ color: "#1e2d1a" }}>{mult}×</strong> the bench space
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={() => form.name.trim() && onSave({ ...form, id: form.id || uid() })}
            style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {initial ? "Save Changes" : "Save Profile"}
          </button>
          {onCancel && <button onClick={onCancel}
            style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>}
        </div>
      </div>
    </div>
  );
}

// ── SPACING CARD ──────────────────────────────────────────────────────────────
function SpacingCard({ profile: p, onEdit, onDelete, onDuplicate }) {
  const [expanded, setExpanded] = useState(false);
  const tag = PROFILE_TAGS.find(t => t.id === p.tag) || PROFILE_TAGS[0];
  const activeStages = STAGE_DEFS.filter(s => p.stages?.[s.id]?.enabled);

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* Icon */}
        <div style={{ width: 40, height: 40, borderRadius: 10, background: tag.color + "18", border: `1.5px solid ${tag.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tag.icon}</div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>{p.name}</span>
            <Badge label={tag.label} color={tag.color} />
            {p.cropRef && <Badge label={"🌿 " + p.cropRef} color="#7fb069" />}
            {p.containerRef && <Badge label={"🪴 " + p.containerRef} color="#4a90d9" />}
          </div>

          {/* Stage pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {activeStages.map(s => {
              const d = p.stages[s.id];
              const sf = calcSqFt(d.x, d.y);
              return sf ? (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 5, background: s.color + "12", border: `1px solid ${s.color}33`, borderRadius: 8, padding: "5px 10px" }}>
                  <span style={{ fontSize: 12 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#1e2d1a", fontWeight: 600 }}>{d.x}″{d.y && d.y !== d.x ? ` × ${d.y}″` : ""} · {sf} sf/pot</div>
                  </div>
                </div>
              ) : null;
            })}
            {activeStages.length === 0 && <span style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic" }}>No stages defined</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <button onClick={() => onEdit(p)} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          <button onClick={() => onDuplicate(p)} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "6px 14px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Duplicate</button>
          <button onClick={() => onDelete(p.id)} style={{ background: "none", border: "1px solid #f0d0c0", borderRadius: 7, padding: "6px 14px", fontSize: 12, color: "#e07b39", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee", padding: "16px 18px", background: "#fafcf8" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: p.notes ? 14 : 0 }}>
            {activeStages.map(s => {
              const d = p.stages[s.id];
              const sf = calcSqFt(d.x, d.y);
              const pps = sf ? Math.round(144 / (Number(d.x) * Number(d.y || d.x))) : null;
              return (
                <div key={s.id} style={{ background: "#fff", borderRadius: 10, border: `1.5px solid ${s.color}33`, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 16 }}>{s.icon}</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: s.color }}>{s.label}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>Spacing</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{d.x}″ × {d.y || d.x}″</div>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>Sq ft / pot</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{sf}</div>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>Pots / sq ft</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{pps}</div>
                  </div>

                  {/* Bench density grid */}
                  <div style={{ marginTop: 10, borderTop: "1px solid #f0f5ee", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase", letterSpacing: .4, marginBottom: 6 }}>Pots per bench</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                      {[["4","100"],["4","150"],["6","100"],["6","150"],["8","100"],["8","150"]].map(([w, l]) => {
                        const n = calcPotsPerBench(d.x, d.y || d.x, w, l);
                        return n ? (
                          <div key={w+l} style={{ background: s.color + "10", borderRadius: 6, padding: "4px 6px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#1e2d1a" }}>{n.toLocaleString()}</div>
                            <div style={{ fontSize: 9, color: "#7a8c74" }}>{w}′×{l}′</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </div>

                  {d.note && <div style={{ marginTop: 8, fontSize: 11, color: "#7a8c74", fontStyle: "italic", borderTop: "1px solid #f0f5ee", paddingTop: 8 }}>{d.note}</div>}
                </div>
              );
            })}
          </div>

          {/* Tight → finish expansion ratio */}
          {activeStages.length > 1 && (() => {
            const first = p.stages[activeStages[0].id];
            const last  = p.stages[activeStages[activeStages.length - 1].id];
            const sfFirst = Number(calcSqFt(first.x, first.y));
            const sfLast  = Number(calcSqFt(last.x, last.y));
            if (!sfFirst || !sfLast) return null;
            const mult = (sfLast / sfFirst).toFixed(1);
            return (
              <div style={{ marginTop: 4, padding: "10px 14px", background: "#f0f8eb", borderRadius: 8, fontSize: 12, color: "#4a7a35" }}>
                📐 Spacing expansion: <strong>{activeStages[0].label}</strong> → <strong>{activeStages[activeStages.length - 1].label}</strong> uses <strong>{mult}×</strong> the bench space per pot
              </div>
            );
          })()}

          {p.notes && <div style={{ marginTop: 12, fontSize: 13, color: "#7a8c74", fontStyle: "italic" }}>{p.notes}</div>}
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function SpacingLibrary() {
  const [profiles,  setProfiles ] = useStorage("gh_spacing_v1", []);
  const [view,      setView     ] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [tagFilter, setTagFilter] = useState("all");
  const [search,    setSearch   ] = useState("");

  function save(p) { if (editingId) setProfiles(x => x.map(i => i.id === editingId ? p : i)); else setProfiles(x => [...x, p]); setView("list"); setEditingId(null); }
  function del(id) { if (window.confirm("Remove this spacing profile?")) setProfiles(x => x.filter(i => i.id !== id)); }
  function dup(p)  { setProfiles(x => [...x, { ...dc(p), id: uid(), name: p.name + " (Copy)" }]); }

  const filtered = profiles.filter(p => {
    if (tagFilter !== "all" && p.tag !== tagFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !(p.cropRef || "").toLowerCase().includes(search.toLowerCase()) &&
        !(p.containerRef || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain" }} />
          <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Spacing Library</div>
        </div>
        {view === "list"
          ? <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ New Profile</button>
          : <button onClick={() => { setView("list"); setEditingId(null); }} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
        }
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {view === "list" && (<>

          {/* Summary */}
          {profiles.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 24px", marginBottom: 24 }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: "#1e2d1a", marginBottom: 14 }}>Spacing Library</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Pill label="Profiles" value={profiles.length} color="#1e2d1a" />
                {PROFILE_TAGS.map(t => {
                  const n = profiles.filter(p => p.tag === t.id).length;
                  return n > 0 ? <Pill key={t.id} label={t.icon + " " + t.label} value={n} color={t.color} /> : null;
                })}
              </div>
            </div>
          )}

          {/* Search + filter */}
          {profiles.length > 0 && (
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, crop, container..." style={{ ...IS(false), width: 260, flexShrink: 0 }} />
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setTagFilter("all")} style={{ background: tagFilter === "all" ? "#1e2d1a" : "#fff", color: tagFilter === "all" ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${tagFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>All</button>
                {PROFILE_TAGS.map(t => (
                  <button key={t.id} onClick={() => setTagFilter(t.id)} style={{ background: tagFilter === t.id ? "#1e2d1a" : "#fff", color: tagFilter === t.id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${tagFilter === t.id ? "#1e2d1a" : "#c8d8c0"}`, borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.icon} {t.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* Profile list */}
          {filtered.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(p => (
                <SpacingCard key={p.id} profile={p}
                  onEdit={x => { setEditingId(x.id); setView("edit"); }}
                  onDelete={del} onDuplicate={dup} />
              ))}
            </div>
          )}

          {profiles.length === 0 && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#aabba0" }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>📐</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No spacing profiles yet</div>
              <div style={{ fontSize: 13, color: "#aabba0", marginBottom: 24, maxWidth: 360, margin: "0 auto 24px" }}>
                Build reusable spacing profiles — crop-based like Impatiens or Geranium spacing, container-based like 4.5" Tight or 10" Basket Finish, or general-purpose profiles
              </div>
              <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Create First Profile</button>
            </div>
          )}

          {profiles.length > 0 && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0", fontSize: 13 }}>No profiles match your search or filter</div>
          )}
        </>)}

        {view === "add"  && <SpacingForm onSave={save} onCancel={() => setView("list")} />}
        {view === "edit" && editingId && <SpacingForm initial={profiles.find(p => p.id === editingId)} onSave={save} onCancel={() => { setView("list"); setEditingId(null); }} />}
      </div>
    </div>
  );
}


// ═══ BROKER CATALOGS ═══

import { useState, useRef, useEffect } from "react";

// ── STORAGE ───────────────────────────────────────────────────────────────────
function useCatalogs() {
  const [catalogs, setCatalogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gh_broker_catalogs_v1") || "[]"); }
    catch { return []; }
  });
  const save = (v) => { setCatalogs(v); try { localStorage.setItem("gh_broker_catalogs_v1", JSON.stringify(v)); } catch {} };
  return [catalogs, save];
}


// ── COLUMN FIELD OPTIONS ──────────────────────────────────────────────────────
const FIELD_OPTIONS = [
  { id: "skip",        label: "— Skip —"         },
  { id: "crop",        label: "Crop Name"         },
  { id: "description", label: "Description / Variety" },
  { id: "size",        label: "Size / Form Type"  },
  { id: "itemNumber",  label: "Item / Material #" },
  { id: "perQty",      label: "Per (qty per tray)"},
  { id: "sellPrice",   label: "Sell Price"        },
  { id: "unitPrice",   label: "Unit Price"        },
  { id: "shipDate",    label: "Ship Date"         },
  { id: "isNew",       label: "New Flag"          },
];

// ── PARSE EXCEL IN BROWSER ────────────────────────────────────────────────────
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // SheetJS is loaded via CDN script tag — use global XLSX
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function guessMapping(headers) {
  const map = {};
  const h = headers.map(h => String(h).toLowerCase());
  h.forEach((col, i) => {
    if (!col) return;
    if (col.includes("crop"))                            map[i] = "crop";
    else if (col.includes("desc"))                       map[i] = "description";
    else if (col.includes("size") || col.includes("form")) map[i] = "size";
    else if (col.includes("material") || col.includes("item") || col.includes("mat no")) map[i] = "itemNumber";
    else if (col.includes("per") && !col.includes("percent")) map[i] = "perQty";
    else if (col.includes("sell"))                       map[i] = "sellPrice";
    else if (col.includes("unit price") || col === "unit") map[i] = "unitPrice";
    else if (col.includes("ship"))                       map[i] = "shipDate";
    else if (col.includes("new"))                        map[i] = "isNew";
  });
  return map;
}

function applyMapping(rows, mapping, headerRow) {
  const items = [];
  rows.forEach((row, i) => {
    if (i <= headerRow) return;
    if (!row || row.every(c => !c)) return;

    const get = (field) => {
      const idx = Object.entries(mapping).find(([, f]) => f === field)?.[0];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };

    const crop = get("crop");
    const desc = get("description");
    if (!crop && !desc) return;

    items.push({
      id:          uid(),
      crop:        crop,
      description: desc,
      size:        get("size"),
      itemNumber:  get("itemNumber"),
      perQty:      get("perQty"),
      sellPrice:   parseFloat(get("sellPrice")) || null,
      unitPrice:   parseFloat(get("unitPrice")) || null,
      shipDate:    get("shipDate"),
      isNew:       !!get("isNew"),
    });
  });
  return items;
}

// ── UPLOAD WIZARD ─────────────────────────────────────────────────────────────
function UploadWizard({ onSave, onCancel }) {
  const [step, setStep]       = useState(1); // 1=file, 2=map, 3=confirm
  const [rows, setRows]       = useState([]);
  const [headers, setHeaders] = useState([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({});
  const [brokerName, setBrokerName] = useState("");
  const [season, setSeason]   = useState("Spring 2026");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const allRows = await parseExcel(file);
      // Find header row - first row with 3+ non-empty cells
      let hRow = 0;
      for (let i = 0; i < Math.min(10, allRows.length); i++) {
        if (allRows[i].filter(c => c).length >= 3) { hRow = i; break; }
      }
      setHeaderRow(hRow);
      setHeaders(allRows[hRow]);
      setRows(allRows);
      setMapping(guessMapping(allRows[hRow]));
      setStep(2);
    } catch (e) {
      setError("Could not read file. Make sure it's a .xlsx or .xls file.");
    }
    setLoading(false);
  };

  const preview = rows.slice(headerRow + 1, headerRow + 6);
  const items   = step === 3 ? applyMapping(rows, mapping, headerRow) : [];

  const s = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

  if (step === 1) return (
    <div style={s}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>Upload Broker Price List</div>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24 }}>Upload an Excel file (.xlsx or .xls) from any broker. You'll map the columns in the next step.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Broker Name</div>
          <input value={brokerName} onChange={e => setBrokerName(e.target.value)} placeholder="e.g. Ball Seed"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, color: "#1a2a1a", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Season</div>
          <input value={season} onChange={e => setSeason(e.target.value)} placeholder="e.g. Spring 2026"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, color: "#1a2a1a", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        style={{ border: "2px dashed #c8d8c0", borderRadius: 14, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: "#fafcf8" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>📊</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#4a5a40", marginBottom: 4 }}>Drop Excel file here</div>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>or click to browse</div>
        {loading && <div style={{ fontSize: 13, color: "#7fb069", marginTop: 12, fontWeight: 700 }}>Reading file...</div>}
        {error  && <div style={{ fontSize: 13, color: "#c03030", marginTop: 12 }}>{error}</div>}
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={s}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>Map Columns</div>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Tell the app what each column contains. We've made our best guess — adjust anything that's wrong.</div>

      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f2f5ef" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8" }}>Column Header</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8" }}>Sample Data</th>
              <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8" }}>Maps To</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f5ee" }}>
                <td style={{ padding: "8px 12px", color: "#1a2a1a", fontWeight: 600 }}>{h || <span style={{ color: "#aabba0" }}>(empty)</span>}</td>
                <td style={{ padding: "8px 12px", color: "#7a8c74", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview.map(r => r[i]).filter(Boolean).slice(0, 2).join(", ") || "—"}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <select value={mapping[i] || "skip"} onChange={e => setMapping(m => ({ ...m, [i]: e.target.value }))}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "1.5px solid #c8d8c0", fontSize: 13, color: "#1a2a1a", fontFamily: "inherit", background: "#fff" }}>
                    {FIELD_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(1)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
        <button onClick={() => setStep(3)} style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Preview Import →
        </button>
      </div>
    </div>
  );

  if (step === 3) return (
    <div style={s}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a", marginBottom: 4 }}>Confirm Import</div>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>
        Found <strong style={{ color: "#1a2a1a" }}>{items.length.toLocaleString()} items</strong> from {brokerName || "broker"} — {season}
      </div>

      {/* Crop summary */}
      <div style={{ background: "#f2f5ef", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 10 }}>Crops Found</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[...new Set(items.map(i => i.crop).filter(Boolean))].sort().map(crop => (
            <span key={crop} style={{ background: "#fff", border: "1px solid #c8d8c0", borderRadius: 20, padding: "3px 12px", fontSize: 12, color: "#4a5a40", fontWeight: 600 }}>
              {crop} ({items.filter(i => i.crop === crop).length})
            </span>
          ))}
        </div>
      </div>

      {/* Sample rows */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>Sample Rows</div>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f2f5ef" }}>
              {["Crop","Description","Size","Item #","Per","Sell Price"].map(h => (
                <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 8).map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f0f5ee" }}>
                <td style={{ padding: "6px 10px", color: "#1a2a1a", fontWeight: 600 }}>{item.crop}</td>
                <td style={{ padding: "6px 10px", color: "#4a5a40", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</td>
                <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{item.size}</td>
                <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{item.itemNumber}</td>
                <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{item.perQty}</td>
                <td style={{ padding: "6px 10px", color: "#2e7a2e", fontWeight: 700 }}>{item.sellPrice ? `$${item.sellPrice.toFixed(4)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(2)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
        <button onClick={() => onSave({ id: uid(), brokerName, season, items, importedAt: new Date().toISOString() })}
          style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          Import {items.length.toLocaleString()} Items ✓
        </button>
      </div>
    </div>
  );
}

// ── CATALOG DETAIL VIEW ───────────────────────────────────────────────────────
function CatalogDetail({ catalog, onBack, onDelete }) {
  const [search, setSearch] = useState("");
  const [cropFilter, setCropFilter] = useState("all");

  const crops = [...new Set(catalog.items.map(i => i.crop).filter(Boolean))].sort();
  const filtered = catalog.items.filter(item => {
    const matchesCrop = cropFilter === "all" || item.crop === cropFilter;
    const matchesSearch = !search ||
      item.description?.toLowerCase().includes(search.toLowerCase()) ||
      item.crop?.toLowerCase().includes(search.toLowerCase()) ||
      item.itemNumber?.includes(search);
    return matchesCrop && matchesSearch;
  });

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>{catalog.brokerName}</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>{catalog.season} · {catalog.items.length.toLocaleString()} items</div>
        </div>
        <button onClick={() => { if (window.confirm("Delete this catalog?")) onDelete(catalog.id); }}
          style={{ marginLeft: "auto", background: "#fff0f0", border: "1px solid #f0c0c0", borderRadius: 8, padding: "6px 14px", color: "#c03030", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Delete
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search varieties..."
          style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, color: "#1a2a1a", fontFamily: "inherit" }} />
        <select value={cropFilter} onChange={e => setCropFilter(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, color: "#1a2a1a", fontFamily: "inherit", background: "#fff" }}>
          <option value="all">All Crops</option>
          {crops.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 10 }}>{filtered.length.toLocaleString()} items</div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f2f5ef", position: "sticky", top: 0 }}>
              {["Crop","Description","Size","Item #","Per","Sell Price"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(item => (
              <tr key={item.id} style={{ borderBottom: "1px solid #f0f5ee" }}
                onMouseEnter={e => e.currentTarget.style.background = "#fafcf8"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <td style={{ padding: "7px 12px", color: "#1a2a1a", fontWeight: 600 }}>{item.crop}</td>
                <td style={{ padding: "7px 12px", color: "#4a5a40" }}>
                  {item.isNew && <span style={{ background: "#8e44ad", color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, marginRight: 6 }}>NEW</span>}
                  {item.description}
                </td>
                <td style={{ padding: "7px 12px", color: "#7a8c74" }}>{item.size}</td>
                <td style={{ padding: "7px 12px", color: "#7a8c74", fontFamily: "monospace" }}>{item.itemNumber}</td>
                <td style={{ padding: "7px 12px", color: "#7a8c74" }}>{item.perQty}</td>
                <td style={{ padding: "7px 12px", color: "#2e7a2e", fontWeight: 700 }}>
                  {item.sellPrice ? `$${item.sellPrice.toFixed(4)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div style={{ textAlign: "center", padding: "16px", fontSize: 13, color: "#7a8c74" }}>
            Showing 200 of {filtered.length.toLocaleString()} — use search to narrow results
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN BROKER CATALOGS COMPONENT ───────────────────────────────────────────
function BrokerCatalogs() {
  const [catalogs, saveCatalogs] = useCatalogs();
  const [view, setView]          = useState("list"); // list | upload | detail
  const [selectedId, setSelectedId] = useState(null);

  // Load SheetJS from CDN if not already loaded
  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      document.head.appendChild(script);
    }
  }, []);

  const handleSave = (catalog) => {
    saveCatalogs([...catalogs, catalog]);
    setView("list");
  };

  const handleDelete = (id) => {
    saveCatalogs(catalogs.filter(c => c.id !== id));
    setView("list");
  };

  const selected = catalogs.find(c => c.id === selectedId);

  if (view === "upload") return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <UploadWizard onSave={handleSave} onCancel={() => setView("list")} />
    </div>
  );

  if (view === "detail" && selected) return (
    <CatalogDetail
      catalog={selected}
      onBack={() => setView("list")}
      onDelete={(id) => { handleDelete(id); setView("list"); }}
    />
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>Broker Catalogs</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Upload price lists to auto-fill varieties and pricing in crop runs</div>
        </div>
        <button onClick={() => setView("upload")}
          style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Upload Price List
        </button>
      </div>

      {catalogs.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 8 }}>No catalogs yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 400, margin: "0 auto 24px" }}>
            Upload a price list from any broker. Once loaded, varieties and pricing will auto-fill when you select a broker in a crop run.
          </div>
          <button onClick={() => setView("upload")}
            style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Upload First Price List
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {catalogs.map(cat => {
            const crops = [...new Set(cat.items.map(i => i.crop).filter(Boolean))];
            return (
              <div key={cat.id}
                onClick={() => { setSelectedId(cat.id); setView("detail"); }}
                style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "18px 20px", cursor: "pointer", transition: "all .15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; e.currentTarget.style.background = "#fafcf8"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; e.currentTarget.style.background = "#fff"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>{cat.brokerName}</div>
                    <div style={{ fontSize: 12, color: "#7a8c74" }}>{cat.season}</div>
                  </div>
                  <span style={{ background: "#f2f5ef", color: "#4a5a40", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                    {cat.items.length.toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 8 }}>{crops.length} crops</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {crops.slice(0, 6).map(c => (
                    <span key={c} style={{ background: "#f2f5ef", color: "#4a5a40", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{c}</span>
                  ))}
                  {crops.length > 6 && <span style={{ fontSize: 10, color: "#aabba0" }}>+{crops.length - 6} more</span>}
                </div>
                <div style={{ fontSize: 10, color: "#aabba0", marginTop: 10 }}>
                  Imported {new Date(cat.importedAt).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── EXPORTED HOOK FOR CROP PLANNING ──────────────────────────────────────────
// Use this in the sourcing tab to look up varieties from catalogs
function useBrokerLookup() {
  const [catalogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("gh_broker_catalogs_v1") || "[]"); }
    catch { return []; }
  });

  const getBrokerNames = () => [...new Set(catalogs.map(c => c.brokerName).filter(Boolean))].sort();

  const getCatalogForBroker = (brokerName) =>
    catalogs.filter(c => c.brokerName === brokerName);

  const searchVarieties = (brokerName, cropName, query = "") => {
    const cats = getCatalogForBroker(brokerName);
    const items = cats.flatMap(c => c.items);
    return items.filter(item => {
      const matchesCrop = !cropName || item.crop?.toLowerCase().includes(cropName.toLowerCase());
      const matchesQuery = !query ||
        item.description?.toLowerCase().includes(query.toLowerCase()) ||
        item.itemNumber?.includes(query);
      return matchesCrop && matchesQuery;
    }).slice(0, 50);
  };

  const lookupByItemNumber = (itemNumber) => {
    for (const cat of catalogs) {
      const item = cat.items.find(i => i.itemNumber === itemNumber);
      if (item) return { ...item, brokerName: cat.brokerName, season: cat.season };
    }
    return null;
  };

  return { getBrokerNames, getCatalogForBroker, searchVarieties, lookupByItemNumber };
}


// ── LIBRARIES TAB WRAPPER ────────────────────────────────────────────────────
const LIBRARY_TABS = [
  { id: "variety",   label: "Varieties",  icon: "🌿" },
  { id: "container", label: "Containers", icon: "🪴" },
  { id: "spacing",   label: "Spacing",    icon: "📐" },
  { id: "brokers",   label: "Brokers",    icon: "📊" },
];

export default function Libraries() {
  const [tab, setTab] = useState("variety");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {LIBRARY_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px", borderRadius: 10, border: "1.5px solid",
              borderColor: tab === t.id ? "#7fb069" : "#c8d8c0",
              background: tab === t.id ? "#7fb069" : "#fff",
              color: tab === t.id ? "#fff" : "#4a5a40",
              fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit"
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === "variety"   && <VarietyLibrary />}
      {tab === "container" && <ContainerLibrary />}
      {tab === "spacing"   && <SpacingLibrary />}
      {tab === "brokers"   && <BrokerCatalogs />}
    </div>
  );
}
