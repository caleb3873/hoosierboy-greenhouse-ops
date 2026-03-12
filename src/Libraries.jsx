import { useState, useEffect, useRef } from "react";
import { useVarieties, useContainers, useSpacingProfiles, useBrokerCatalogs, useSoilMixes, useInputProducts, useComboTags, useBrokerProfiles } from "./supabase";
import { BrokerProfiles, SupplierProfiles, BreederProfiles } from "./Profiles";
import ComboLibrary from "./ComboDesigner";

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
      <FormField label="Chemical Sensitivities" hint="Products this variety is known to react poorly to">
        <textarea style={{ ...inputStyle(focus === "chemSens"), minHeight: 70, resize: "vertical" }} value={form.chemSensitivities || ""} onChange={e => setForm(x => ({ ...x, chemSensitivities: e.target.value }))} onFocus={() => setFocus("chemSens")} onBlur={() => setFocus(null)} placeholder="e.g. Sensitive to Avid — causes leaf distortion. Bonzi causes excessive stunting above 15 ppm. Avoid oil-based sprays." />
      </FormField>
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

          {variety.chemSensitivities && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#c03030", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>⚠️ Chemical Sensitivities</div>
              <div style={{ fontSize: 13, color: "#c03030", background: "#fff0f0", borderRadius: 8, padding: "10px 14px", border: "1px solid #f0c0c0" }}>{variety.chemSensitivities}</div>
            </div>
          )}
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
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
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
      if (data.error) throw new Error(data.error.message || "API error");
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
  const { rows: library, upsert: upsertVariety, remove: removeVarietyDb } = useVarieties();
  const [view, setView] = useState("library"); // library | add | edit | review
  const [editingId, setEditingId] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [filterBreeder, setFilterBreeder] = useState("");
  const [filterType, setFilterType] = useState("");

  async function saveVariety(form) {
    if (!form.cropName) return;
    const clean = { ...form, id: editingId || form.id || crypto.randomUUID() };
    try { await upsertVariety(clean); setView("library"); }
    catch(e) { alert("Save failed: " + e.message); return; }
    setEditingId(null);
  }

  function startEdit(variety) {
    setEditingId(variety.id);
    setView("edit");
  }

  async function deleteVariety(id) {
    if (window.confirm("Remove this variety from the library?")) {
      await removeVarietyDb(id);
    }
  }

  function handleExtracted(varieties) {
    setReviewQueue(varieties);
    setReviewIndex(0);
    setView("review");
  }

  async function saveReviewed(form) {
    try { await upsertVariety({ ...form, id: form.id || crypto.randomUUID() }); } catch(e) { alert("Save failed: " + e.message); return; }
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
const VOLUME_UNITS = ["pt", "qt", "gal", "cu in", "L"];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
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
  if (substrateUnit === "pt")    cuFt = total / 51.43;
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
function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => onChange(!value)}>
      <div style={{ width: 40, height: 22, borderRadius: 11, background: value ? "#7fb069" : "#c8d8c0", position: "relative", transition: "background .2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </div>
      {label && <span style={{ fontSize: 13, color: "#4a5a40", fontWeight: 600 }}>{label}</span>}
    </div>
  );
}
function Pill({ label, value, color = "#7fb069" }) {
  return (
    <div style={{ background: color + "14", border: `1px solid ${color}33`, borderRadius: 8, padding: "7px 13px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginTop: 1 }}>{label}</div>
    </div>
  );
}

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
    name: "", diameterIn: "", heightIn: "", widthIn: "", lengthIn: "", material: "",
    volumeVal: "", volumeUnit: "qt",
    cellsPerFlat: "", unitsPerCase: "", qtyPerPallet: "",
    costPerUnit: "",
    substrateVol: "", substrateUnit: "qt",
    supplier: "", supplier2: "", sku: "", notes: "",
    spacing: {},
    // Tray pairing (pots)
    hasTray: false, trayName: "", traySupplier: "", traySku: "", trayCost: "", traysPerCase: "",
    // Saucer (baskets — optional)
    hasSaucer: false, saucerName: "", saucerSupplier: "", saucerSku: "", saucerCost: "",
    // Sleeve (baskets + planters — sized by diameter)
    hasSleeve: false, sleeveSupplier: "", sleeveSku: "", sleeveCost: "",
    // Hoosier Boy branded tag
    isHBTagged: false, tagCostPerUnit: "", tagSupplier: "", tagSku: "",
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
                  <input type="number" step="0.25" style={IS(focus === "dia")} value={form.diameterIn} onChange={e => upd("diameterIn", e.target.value)} onFocus={() => setFocus("dia")} onBlur={() => setFocus(null)} placeholder='e.g. 4.5' />
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

              {/* Carrier / Tray section — finished pots only */}
              {isFinished && (<>
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>Ships in Carrier / Tray?</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>e.g. ST 450-10, Shuttle Tray 6pk — used for bench capacity math</div>
                    </div>
                    <Toggle value={!!form.hasCarrier} onChange={v => upd("hasCarrier", v)} label={form.hasCarrier ? "Yes" : "No"} />
                  </div>
                  {form.hasCarrier && (
                    <div style={{ background: "#f0f8ff", border: "1.5px solid #b8d8f0", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#2e5c8a", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Carrier / Tray Info</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <FL c="Carrier Name" />
                          <input style={{ ...IS(focus === "cname"), background: "#fff" }} value={form.carrierName || ""} onChange={e => upd("carrierName", e.target.value)} onFocus={() => setFocus("cname")} onBlur={() => setFocus(null)} placeholder="e.g. Shuttle Tray Trade Gallon 6pk" />
                        </div>
                        <div>
                          <FL c="Carrier SKU" />
                          <input style={{ ...IS(focus === "csku"), background: "#fff" }} value={form.carrierSku || ""} onChange={e => upd("carrierSku", e.target.value)} onFocus={() => setFocus("csku")} onBlur={() => setFocus(null)} placeholder="e.g. ST 450-10 OS V" />
                        </div>
                        <div>
                          <FL c="Pots per Carrier" />
                          <input type="number" style={{ ...IS(focus === "cpots"), background: "#fff" }} value={form.potsPerCarrier || ""} onChange={e => upd("potsPerCarrier", e.target.value)} onFocus={() => setFocus("cpots")} onBlur={() => setFocus(null)} placeholder="e.g. 10, 6, 18" />
                        </div>
                        <div>
                          <FL c='Carrier Width (")' />
                          <input type="number" step="0.5" style={{ ...IS(focus === "cw"), background: "#fff" }} value={form.carrierWidthIn || ""} onChange={e => upd("carrierWidthIn", e.target.value)} onFocus={() => setFocus("cw")} onBlur={() => setFocus(null)} placeholder='e.g. 11' />
                        </div>
                        <div>
                          <FL c='Carrier Length (")' />
                          <input type="number" step="0.5" style={{ ...IS(focus === "cl"), background: "#fff" }} value={form.carrierLengthIn || ""} onChange={e => upd("carrierLengthIn", e.target.value)} onFocus={() => setFocus("cl")} onBlur={() => setFocus(null)} placeholder='e.g. 21' />
                        </div>
                        <div>
                          <FL c="Carrier Supplier" />
                          <input style={{ ...IS(focus === "csup"), background: "#fff" }} value={form.carrierSupplier || ""} onChange={e => upd("carrierSupplier", e.target.value)} onFocus={() => setFocus("csup")} onBlur={() => setFocus(null)} placeholder="e.g. Landmark Plastics" />
                        </div>
                        <div>
                          <FL c="Cost per Carrier ($)" />
                          <input type="number" step="0.001" style={{ ...IS(focus === "ccost"), background: "#fff" }} value={form.carrierCost || ""} onChange={e => upd("carrierCost", e.target.value)} onFocus={() => setFocus("ccost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.45" />
                        </div>
                        {form.carrierCost && form.potsPerCarrier && (
                          <div style={{ gridColumn: "span 2", background: "#e8f4ff", borderRadius: 8, border: "1px solid #b8d8f0", padding: "10px 14px" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#2e5c8a" }}>
                              Cost per pot position: ${(Number(form.carrierCost) / Number(form.potsPerCarrier)).toFixed(4)}
                            </div>
                          </div>
                        )}
                        {form.potsPerCarrier && form.carrierWidthIn && form.carrierLengthIn && (
                          <div style={{ gridColumn: "span 2", background: "#fff", borderRadius: 8, border: "1px solid #b8d8f0", padding: "10px 14px" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#2e5c8a", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Carrier Footprint Preview</div>
                            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#1e2d1a" }}>
                              <span>📐 {form.carrierWidthIn}" × {form.carrierLengthIn}"</span>
                              <span>🌱 {form.potsPerCarrier} pots/carrier</span>
                              <span style={{ color: "#7a8c74" }}>
                                {((Number(form.carrierWidthIn) * Number(form.carrierLengthIn)) / 144).toFixed(2)} sq ft each
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>)}
              {/* Wire / Hanger section — baskets only */}
              {isFinished && form.type === "basket" && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>Wire / Hanger</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Track the hanger that ships with this basket</div>
                    </div>
                    <Toggle value={!!form.hasWire} onChange={v => upd("hasWire", v)} label={form.hasWire ? "Yes" : "No"} />
                  </div>
                  {form.hasWire && (
                    <div style={{ background: "#f5f5f0", border: "1.5px solid #d0cfc0", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#5a5a40", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Wire / Hanger Info</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <FL c="Wire Type" />
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {["Plastic Coated", "Galvanized", "Black Metal", "Other"].map(t => (
                              <button key={t} onClick={() => upd("wireType", t)}
                                style={{ padding: "6px 12px", borderRadius: 7, border: `1.5px solid ${form.wireType === t ? "#7a7a50" : "#c8d8c0"}`, background: form.wireType === t ? "#f0f0e0" : "#fff", color: form.wireType === t ? "#3a3a20" : "#7a8c74", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <FL c='Wire Length (")' />
                          <input type="number" step="0.5" style={{ ...IS(focus === "wlen"), background: "#fff" }} value={form.wireLength || ""} onChange={e => upd("wireLength", e.target.value)} onFocus={() => setFocus("wlen")} onBlur={() => setFocus(null)} placeholder='e.g. 12, 14, 16' />
                        </div>
                        <div>
                          <FL c="Wire Gauge" />
                          <input style={{ ...IS(focus === "wgauge"), background: "#fff" }} value={form.wireGauge || ""} onChange={e => upd("wireGauge", e.target.value)} onFocus={() => setFocus("wgauge")} onBlur={() => setFocus(null)} placeholder='e.g. 12ga, 14ga' />
                        </div>
                        <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e2d1a" }}>Swivel</div>
                          <Toggle value={!!form.wireSwivel} onChange={v => upd("wireSwivel", v)} label={form.wireSwivel ? "Yes" : "No"} />
                        </div>
                        <div><FL c="Wire Supplier" /><input style={{ ...IS(focus === "wsup"), background: "#fff" }} value={form.wireSupplier || ""} onChange={e => upd("wireSupplier", e.target.value)} onFocus={() => setFocus("wsup")} onBlur={() => setFocus(null)} placeholder="e.g. Landmark" /></div>
                        <div><FL c="Wire SKU" /><input style={{ ...IS(focus === "wsku"), background: "#fff" }} value={form.wireSku || ""} onChange={e => upd("wireSku", e.target.value)} onFocus={() => setFocus("wsku")} onBlur={() => setFocus(null)} placeholder="e.g. W-12-PC" /></div>
                        <div>
                          <FL c="Cost per Wire ($)" />
                          <input type="number" step="0.001" style={{ ...IS(focus === "wcost"), background: "#fff" }} value={form.wireCost || ""} onChange={e => upd("wireCost", e.target.value)} onFocus={() => setFocus("wcost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.18" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}



              {/* ── SAUCER (baskets — optional) ───────────────────────── */}
              {isFinished && form.type === "basket" && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>Basket Saucer</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Optional saucer for display/retail</div>
                    </div>
                    <Toggle value={!!form.hasSaucer} onChange={v => upd("hasSaucer", v)} label={form.hasSaucer ? "Yes" : "No"} />
                  </div>
                  {form.hasSaucer && (
                    <div style={{ background: "#f5f0ff", border: "1.5px solid #c8b8f0", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#5a3a90", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Saucer Info</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={{ gridColumn: "span 2" }}><FL c="Saucer Name / Description" /><input style={{ ...IS(focus === "sname"), background: "#fff" }} value={form.saucerName || ""} onChange={e => upd("saucerName", e.target.value)} onFocus={() => setFocus("sname")} onBlur={() => setFocus(null)} placeholder='e.g. 12" Basket Saucer' /></div>
                        <div><FL c="Saucer Supplier" /><input style={{ ...IS(focus === "ssup"), background: "#fff" }} value={form.saucerSupplier || ""} onChange={e => upd("saucerSupplier", e.target.value)} onFocus={() => setFocus("ssup")} onBlur={() => setFocus(null)} placeholder="Same as basket supplier" /></div>
                        <div><FL c="Saucer SKU" /><input style={{ ...IS(focus === "ssku"), background: "#fff" }} value={form.saucerSku || ""} onChange={e => upd("saucerSku", e.target.value)} onFocus={() => setFocus("ssku")} onBlur={() => setFocus(null)} placeholder="e.g. S-12-CLR" /></div>
                        <div><FL c="Cost per Saucer ($)" /><input type="number" step="0.001" style={{ ...IS(focus === "scost"), background: "#fff" }} value={form.saucerCost || ""} onChange={e => upd("saucerCost", e.target.value)} onFocus={() => setFocus("scost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.22" /></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── SLEEVE (baskets + planters) ───────────────────────── */}
              {isFinished && ["basket","pot","combo"].includes(form.type) && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>Sleeve</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>Protection sleeve sized to {form.diameterIn ? `${form.diameterIn}"` : "this container's"} diameter</div>
                    </div>
                    <Toggle value={!!form.hasSleeve} onChange={v => upd("hasSleeve", v)} label={form.hasSleeve ? "Yes" : "No"} />
                  </div>
                  {form.hasSleeve && (
                    <div style={{ background: "#f0f8f0", border: "1.5px solid #a8d8a0", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#2a6a20", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>Sleeve Info</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><FL c="Sleeve Supplier" /><input style={{ ...IS(focus === "slsup"), background: "#fff" }} value={form.sleeveSupplier || ""} onChange={e => upd("sleeveSupplier", e.target.value)} onFocus={() => setFocus("slsup")} onBlur={() => setFocus(null)} placeholder="e.g. Belden" /></div>
                        <div><FL c="Sleeve SKU" /><input style={{ ...IS(focus === "slsku"), background: "#fff" }} value={form.sleeveSku || ""} onChange={e => upd("sleeveSku", e.target.value)} onFocus={() => setFocus("slsku")} onBlur={() => setFocus(null)} placeholder={`e.g. SL-${form.diameterIn||"X"}`} /></div>
                        <div><FL c="Cost per Sleeve ($)" /><input type="number" step="0.001" style={{ ...IS(focus === "slcost"), background: "#fff" }} value={form.sleeveCost || ""} onChange={e => upd("sleeveCost", e.target.value)} onFocus={() => setFocus("slcost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.12" /></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── HOOSIER BOY BRANDED TAG ───────────────────────────── */}
              {isFinished && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>Hoosier Boy Branded Tag</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>For hanging baskets and premium planters</div>
                    </div>
                    <Toggle value={!!form.isHBTagged} onChange={v => upd("isHBTagged", v)} label={form.isHBTagged ? "Yes" : "No"} />
                  </div>
                  {form.isHBTagged && (
                    <div style={{ background: "#1e2d1a", border: "1.5px solid #3a5a2a", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: .8, textTransform: "uppercase", marginBottom: 12 }}>HB Tag Info</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><FL c="Tag Supplier" /><input style={{ ...IS(focus === "tagsup"), background: "#2e4a22", color: "#c8e6b8", borderColor: "#4a6a3a" }} value={form.tagSupplier || ""} onChange={e => upd("tagSupplier", e.target.value)} onFocus={() => setFocus("tagsup")} onBlur={() => setFocus(null)} placeholder="e.g. Greenhouse Growers Supply" /></div>
                        <div><FL c="Tag SKU" /><input style={{ ...IS(focus === "tagsku"), background: "#2e4a22", color: "#c8e6b8", borderColor: "#4a6a3a" }} value={form.tagSku || ""} onChange={e => upd("tagSku", e.target.value)} onFocus={() => setFocus("tagsku")} onBlur={() => setFocus(null)} placeholder="e.g. HB-TAG-BAS" /></div>
                        <div><FL c="Cost per Tag ($)" /><input type="number" step="0.001" style={{ ...IS(focus === "tagcost"), background: "#2e4a22", color: "#c8e6b8", borderColor: "#4a6a3a" }} value={form.tagCostPerUnit || ""} onChange={e => upd("tagCostPerUnit", e.target.value)} onFocus={() => setFocus("tagcost")} onBlur={() => setFocus(null)} placeholder="e.g. 0.08" /></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tag assignment — all finished containers */}
              {isFinished && (
                <div style={{ gridColumn: "span 2" }}>
                  <div style={{ borderTop: "1.5px solid #e0ead8", marginBottom: 14, marginTop: 4 }} />
                  <SH c="Tag / Label" mt={0} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <FL c="Primary Tag" />
                      <input style={IS(focus === "tag1")} value={form.primaryTag || ""} onChange={e => upd("primaryTag", e.target.value)} onFocus={() => setFocus("tag1")} onBlur={() => setFocus(null)} placeholder="Tag name or SKU" />
                    </div>
                    <div>
                      <FL c="Secondary Tag (optional)" />
                      <input style={IS(focus === "tag2")} value={form.secondaryTag || ""} onChange={e => upd("secondaryTag", e.target.value)} onFocus={() => setFocus("tag2")} onBlur={() => setFocus(null)} placeholder="e.g. retail premium tag" />
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <FL c="Tag Tier" />
                      <div style={{ display: "flex", gap: 6 }}>
                        {[["standard", "Standard", "#7a8c74"], ["retail", "Retail / Premium", "#c8791a"]].map(([id, label, color]) => (
                          <button key={id} onClick={() => upd("tagTier", id)}
                            style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${form.tagTier === id ? color : "#c8d8c0"}`, background: form.tagTier === id ? color + "14" : "#fff", color: form.tagTier === id ? color : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isFinished && (<>
                <div>
                  <FL c='Width (")' />
                  <input type="number" step="0.5" style={IS(focus === "tw")} value={form.widthIn} onChange={e => upd("widthIn", e.target.value)} onFocus={() => setFocus("tw")} onBlur={() => setFocus(null)} placeholder='e.g. 11' />
                </div>
                <div>
                  <FL c='Length (")' />
                  <input type="number" step="0.5" style={IS(focus === "tl")} value={form.lengthIn} onChange={e => upd("lengthIn", e.target.value)} onFocus={() => setFocus("tl")} onBlur={() => setFocus(null)} placeholder='e.g. 21' />
                </div>
                <div>
                  <FL c="Cells per Flat" />
                  <input type="number" style={IS(focus === "cells")} value={form.cellsPerFlat} onChange={e => upd("cellsPerFlat", e.target.value)} onFocus={() => setFocus("cells")} onBlur={() => setFocus(null)} placeholder="e.g. 128, 288, 512" />
                </div>
              </>)}
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
            {c.diameterIn && <Pill label='Diameter' value={c.diameterIn + '"'} color={selectedType.color} />}
            {c.cellsPerFlat && <Pill label="Cells" value={c.cellsPerFlat} color={selectedType.color} />}
            {c.unitsPerCase && <Pill label="/ Case" value={c.unitsPerCase} color="#7a8c74" />}
            {c.qtyPerPallet && <Pill label="/ Pallet" value={Number(c.qtyPerPallet).toLocaleString()} color="#7a8c74" />}
            {c.costPerUnit && <Pill label="$/unit" value={`$${Number(c.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
            {c.volumeVal && <Pill label="Volume" value={fmtVolume(c.volumeVal, c.volumeUnit)} color="#4a90d9" />}
            {c.substrateVol && <Pill label="Substrate/unit" value={fmtVolume(c.substrateVol, c.substrateUnit)} color="#2e8b57" />}
            {hasSpacing && <Pill label="Spacing" value="Set" color="#c8791a" />}
            {c.hasCarrier && c.potsPerCarrier && <Pill label="Carrier" value={`${c.potsPerCarrier}/tray`} color="#2e7d9e" />}
            {c.hasWire && c.wireType && <Pill label="Wire" value={c.wireType} color="#5a5a40" />}
            {c.tagTier === "retail" && <Pill label="Tag" value="Retail" color="#c8791a" />}
            {c.tagTier === "standard" && c.primaryTag && <Pill label="Tag" value="Standard" color="#7a8c74" />}
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
                c.diameterIn     && ["Diameter",          c.diameterIn + '"'],
                c.widthIn && c.lengthIn && ["Footprint", `${c.widthIn}" × ${c.lengthIn}"`],
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
                c.hasCarrier && c.carrierName && ["Carrier name", c.carrierName],
                c.hasCarrier && c.carrierSku  && ["Carrier SKU",  c.carrierSku],
                c.hasCarrier && c.potsPerCarrier && ["Pots per carrier", c.potsPerCarrier],
                c.hasCarrier && c.carrierWidthIn && c.carrierLengthIn && ["Carrier size", `${c.carrierWidthIn}" × ${c.carrierLengthIn}"`],
                c.hasWire && c.wireType    && ["Wire type",     c.wireType],
                c.hasWire && c.wireLength  && ["Wire length",   c.wireLength + '"'],
                c.hasWire && c.wireGauge   && ["Wire gauge",    c.wireGauge],
                c.hasWire                  && ["Wire swivel",   c.wireSwivel ? "Yes" : "No"],
                c.hasWire && c.wireSupplier && ["Wire supplier", c.wireSupplier],
                c.hasWire && c.wireSku     && ["Wire SKU",      c.wireSku],
                c.hasWire && c.wireCost    && ["Cost per wire", `$${Number(c.wireCost).toFixed(3)}`],
                c.primaryTag               && ["Primary tag",   c.primaryTag],
                c.secondaryTag             && ["Secondary tag", c.secondaryTag],
                c.tagTier                  && ["Tag tier",      c.tagTier === "retail" ? "Retail / Premium" : "Standard"],
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


// ── BULK IMPORTER ─────────────────────────────────────────────────────────────
function downloadTemplate(filename, headers, sampleRow) {
  const sampleRows = Array.isArray(sampleRow[0]) ? sampleRow : [sampleRow];
  const rows = [headers, ...sampleRows];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function BulkImporter({ title, templateFilename, templateHeaders, templateSample, fieldMap, onImport, onCancel }) {
  const [step, setStep]       = useState("upload");
  const [headers, setHeaders] = useState([]);
  const [raw, setRaw]         = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [error, setError]     = useState(null);
  const fileRef               = useRef(null);

  function processFile(heads, rows) {
    setHeaders(heads);
    setRaw(rows);
    const auto = {};
    fieldMap.forEach(f => {
      const match = heads.find(h => f.guesses.some(g => String(h).toLowerCase().includes(g)));
      auto[f.id] = match || "";
    });
    setMapping(auto);
    setStep("map");
  }

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(null);
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const wb = window.XLSX.read(ev.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const all = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          const hi = all.findIndex(r => r.some(c => String(c).trim()));
          if (hi < 0) { setError("No data found in file."); return; }
          const heads = all[hi].map(h => String(h).trim());
          const rows = all.slice(hi + 1).filter(r => r.some(c => String(c).trim())).map(r => heads.map((_, i) => String(r[i] ?? "").trim()));
          processFile(heads, rows);
        } catch (err) { setError("Could not read file: " + err.message); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const lines = ev.target.result.split("\n").filter(l => l.trim());
        const heads = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map(l => {
          const result = []; let cur = "", inQ = false;
          for (const ch of l) {
            if (ch === '"') inQ = !inQ;
            else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
            else cur += ch;
          }
          result.push(cur.trim()); return result;
        });
        processFile(heads, rows);
      };
      reader.readAsText(file);
    }
  }

  function buildPreview() {
    const get = (row, field) => {
      const h = mapping[field]; if (!h) return "";
      const i = headers.indexOf(h); return i >= 0 ? (row[i] || "") : "";
    };
    setPreview(raw.slice(0, 5).map(r => Object.fromEntries(fieldMap.map(f => [f.id, get(r, f.id)]))));
    setStep("preview");
  }

  function doImport() {
    const get = (row, field) => {
      const h = mapping[field]; if (!h) return "";
      const i = headers.indexOf(h); return i >= 0 ? (row[i] || "") : "";
    };
    const items = raw.map(r => Object.fromEntries(fieldMap.map(f => [f.id, get(r, f.id)]))).filter(r => fieldMap.filter(f => f.required).every(f => r[f.id]));
    onImport(items);
    setStep("done");
  }

  const S = { borderRadius: 14, border: "1.5px solid #e0ead8", background: "#fff", padding: "28px 32px", maxWidth: 640, margin: "0 auto" };
  const Btn = ({ onClick, children, variant = "primary", disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 22px", borderRadius: 9, border: variant === "primary" ? "none" : "1.5px solid #c8d8c0", background: variant === "primary" ? "#7fb069" : "#fff", color: variant === "primary" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1 }}>{children}</button>
  );

  if (step === "done") return (
    <div style={S}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a", marginBottom: 8 }}>Import Complete</div>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24 }}>{raw.length} rows imported successfully.</div>
      <Btn onClick={onCancel}>Done</Btn>
    </div>
  );

  return (
    <div style={S}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a" }}>📥 {title}</div>
        <button onClick={onCancel} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aabba0" }}>×</button>
      </div>

      {step === "upload" && (
        <>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Upload a CSV or Excel file. Not sure of the format? Download the template first.</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <Btn variant="secondary" onClick={() => downloadTemplate(templateFilename, templateHeaders, templateSample)}>⬇ Download Template</Btn>
            <Btn onClick={() => fileRef.current.click()}>Choose File (.csv or .xlsx)</Btn>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
          {error && <div style={{ color: "#c03030", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </>
      )}

      {step === "map" && (
        <>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16 }}>Match your columns to the right fields. We have made our best guess.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {fieldMap.filter(f => f.show !== false).map(f => (
              <div key={f.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4a5a40" }}>{f.label}{f.required && <span style={{ color: "#c03030" }}> *</span>}</div>
                <select value={mapping[f.id] || ""} onChange={e => setMapping(m => ({ ...m, [f.id]: e.target.value }))}
                  style={{ padding: "7px 10px", borderRadius: 7, border: "1.5px solid #c8d8c0", fontSize: 13, color: "#1a2a1a", fontFamily: "inherit" }}>
                  <option value="">Skip</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setStep("upload")}>Back</Btn>
            <Btn onClick={buildPreview}>Preview</Btn>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 12 }}>First 5 rows preview:</div>
          <div style={{ overflowX: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>{fieldMap.filter(f => f.show !== false && mapping[f.id]).map(f => <th key={f.id} style={{ padding: "6px 10px", background: "#f2f5ef", fontWeight: 700, color: "#4a5a40", textAlign: "left", borderBottom: "1.5px solid #e0ead8" }}>{f.label}</th>)}</tr></thead>
              <tbody>{preview.map((r, i) => <tr key={i}>{fieldMap.filter(f => f.show !== false && mapping[f.id]).map(f => <td key={f.id} style={{ padding: "6px 10px", borderBottom: "1px solid #f0f4ee", color: "#1e2d1a" }}>{r[f.id]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 16 }}>{raw.length} total rows will be imported.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="secondary" onClick={() => setStep("map")}>Back</Btn>
            <Btn onClick={doImport}>Import {raw.length} Rows</Btn>
          </div>
        </>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
function ContainerLibrary() {
  const { rows: containers, upsert: upsertContainer, remove: removeContainerDb } = useContainers();
  const [view,      setView      ] = useState("list");
  const [editingId, setEditingId ] = useState(null);
  const CONTAINER_FIELDS = [
    { id: "name",         label: "Name *",        required: true,  guesses: ["name","container","pot","basket"] },
    { id: "kind",         label: "Kind",           required: false, guesses: ["kind","type","category"] },
    { id: "diameterIn",     label: "Diameter (in)",  required: false, guesses: ["diam","diameter"] },
    { id: "widthIn",      label: "Width (in)",      required: false, guesses: ["width","wide"] },
    { id: "lengthIn",     label: "Length (in)",      required: false, guesses: ["length","long"] },
    { id: "material",     label: "Material",       required: false, guesses: ["material","plastic","metal"] },
    { id: "cellsPerFlat", label: "Cells/Flat",     required: false, guesses: ["cell","flat","count"] },
    { id: "unitsPerCase", label: "Units/Case",     required: false, guesses: ["case","unit"] },
    { id: "costPerUnit",  label: "Cost/Unit ($)",  required: false, guesses: ["cost","price"] },
    { id: "supplier",     label: "Supplier",       required: false, guesses: ["supplier","vendor","source"] },
    { id: "sku",          label: "SKU",            required: false, guesses: ["sku","item","part","number"] },
    { id: "notes",        label: "Notes",          required: false, guesses: ["note","comment"] },
  ];
  async function bulkImportContainers(rows) {
    const DB_FIELDS = ["id","name","kind","type","trayType","diameterIn","heightIn","widthIn","lengthIn",
      "material","volumeVal","volumeUnit","cellsPerFlat","unitsPerCase","qtyPerPallet","costPerUnit",
      "substrateVol","substrateUnit","supplier","supplier2","sku","notes","spacing",
      "photo","stockQty","stockLocation","inventoryHistory","priceHistory",
      "hasCarrier","carrierName","carrierSku","carrierSupplier","carrierCost","potsPerCarrier","carrierWidthIn","carrierLengthIn",
      "hasSaucer","saucerName","saucerSupplier","saucerSku","saucerCost",
      "hasSleeve","sleeveSupplier","sleeveSku","sleeveCost",
      "isHBTagged","tagCostPerUnit","tagSupplier","tagSku",
      "hasWire","wireType","wireLength","wireGauge","wireSwivel","wireSupplier","wireSku","wireCost",
      "primaryTag","secondaryTag","tagTier"];
    const NUMERIC_FIELDS = ["diameterIn","heightIn","widthIn","lengthIn","volumeVal",
      "cellsPerFlat","unitsPerCase","qtyPerPallet","costPerUnit","substrateVol",
      "carrierCost","potsPerCarrier","saucerCost","sleeveCost","tagCostPerUnit","wireCost"];
    let errors = 0;
    for (const r of rows) {
      const row = { ...r, kind: r.kind || "finished" };
      const clean = Object.fromEntries(
        Object.entries(row)
          .filter(([k]) => DB_FIELDS.includes(k))
          .map(([k, v]) => [k, NUMERIC_FIELDS.includes(k) ? (v === "" || v === null || v === undefined ? null : Number(v)) : v])
      );
      clean.id = crypto.randomUUID();
      try { await upsertContainer(clean); }
      catch(e) { errors++; console.error("Row failed:", clean.name, e.message); }
    }
    if (errors > 0) alert("Import complete with " + errors + " error(s). Check console for details.");
  }
  const [kindFilter, setKindFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search,     setSearch   ] = useState("");

  async function save(c) {
    // Only send fields that exist in the containers table
    const DB_FIELDS = ["id","name","kind","type","trayType","diameterIn","heightIn","widthIn","lengthIn",
      "material","volumeVal","volumeUnit","cellsPerFlat","unitsPerCase","qtyPerPallet","costPerUnit",
      "substrateVol","substrateUnit","supplier","supplier2","sku","notes","spacing",
      "photo","stockQty","stockLocation","inventoryHistory","priceHistory",
      "hasCarrier","carrierName","carrierSku","carrierSupplier","carrierCost","potsPerCarrier","carrierWidthIn","carrierLengthIn",
      "hasSaucer","saucerName","saucerSupplier","saucerSku","saucerCost",
      "hasSleeve","sleeveSupplier","sleeveSku","sleeveCost",
      "isHBTagged","tagCostPerUnit","tagSupplier","tagSku",
      "hasWire","wireType","wireLength","wireGauge","wireSwivel","wireSupplier","wireSku","wireCost",
      "primaryTag","secondaryTag","tagTier"];
    const NUMERIC_FIELDS = ["diameterIn","heightIn","widthIn","lengthIn","volumeVal",
      "cellsPerFlat","unitsPerCase","qtyPerPallet","costPerUnit","substrateVol",
      "carrierCost","potsPerCarrier","saucerCost","sleeveCost","tagCostPerUnit","wireCost"];
    const clean = Object.fromEntries(
      Object.entries(c)
        .filter(([k]) => DB_FIELDS.includes(k))
        .map(([k, v]) => [k, NUMERIC_FIELDS.includes(k) ? (v === "" || v === null || v === undefined ? null : Number(v)) : v])
    );
    // Ensure ID is a valid UUID for Supabase
    if (!clean.id || !clean.id.includes("-")) {
      clean.id = crypto.randomUUID();
    }
    try {
      await upsertContainer(clean);
      setView("list");
      setEditingId(null);
    } catch(e) {
      alert("Save failed: " + e.message);
    }
  }
  async function del(id) { if (window.confirm("Remove this container?")) await removeContainerDb(id); }
  async function dup(c)  { await upsertContainer({ ...dc(c), id: uid(), name: c.name + " (Copy)" }); }

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
          ? <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setView("import")} style={{ background: "none", color: "#c8e6b8", border: "1px solid #4a6a3a", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📥 Import</button>
              <button onClick={() => { setEditingId(null); setView("add"); }} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Add Container</button>
            </div>
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

        {view === "import" && <BulkImporter title="Import Containers" templateFilename="containers-template.csv" templateHeaders={["Name","Kind (finished or propagation)","Diameter - pots/baskets (in)","Width - trays only (in)","Length - trays only (in)","Material","Cells Per Flat - trays only","Units Per Case","Cost Per Unit ($)","Supplier","SKU","Notes"]} templateSample={["6in Standard Pot","finished","6","","","Plastic","","50","0.18","Landmark","GP600",""],["4.5in Tray 18ct","propagation","","11","21","Plastic","18","50","1.25","Landmark","T18-45",""],["10in Basket Liner","finished","10","","","Plastic","","25","0.45","Landmark","BL-10",""],["10in Wire Hanger","finished","10","","","Wire","","25","0.55","Landmark","WH-10",""]} fieldMap={CONTAINER_FIELDS} onImport={bulkImportContainers} onCancel={() => setView("list")} />}
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
  const { rows: profiles, upsert: upsertProfile, remove: removeProfileDb } = useSpacingProfiles();
  const [view,      setView     ] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [tagFilter, setTagFilter] = useState("all");
  const [search,    setSearch   ] = useState("");

  async function save(p) {
    const clean = { ...p };
    if (!clean.id || !clean.id.includes("-")) clean.id = crypto.randomUUID();
    try { await upsertProfile(clean); setView("list"); setEditingId(null); }
    catch(e) { alert("Save failed: " + e.message); }
  }
  async function del(id) { if (window.confirm("Remove this spacing profile?")) await removeProfileDb(id); }
  async function dup(p)  { await upsertProfile({ ...dc(p), id: uid(), name: p.name + " (Copy)" }); }

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



// ── COLUMN FIELD OPTIONS ──────────────────────────────────────────────────────
const FIELD_OPTIONS = [
  { id: "skip",        label: "— Skip —"              },
  { id: "crop",        label: "Crop / Species"         },
  { id: "series",      label: "Series / Cultivar"      },
  { id: "varietyName", label: "Variety Name (full)"    },
  { id: "color",       label: "Color (standalone)"     },
  { id: "description", label: "Description (legacy)"   },
  { id: "size",        label: "Size / Form Type"       },
  { id: "itemNumber",  label: "Item / Material #"      },
  { id: "shortCode",   label: "Short Code"             },
  { id: "perQty",      label: "Per / Unit Size (URCs)" },
  { id: "sellPrice",   label: "Sell Price"             },
  { id: "unitPrice",   label: "Unit Price"             },
  { id: "shipDate",    label: "Ship Date"              },
  { id: "isNew",       label: "New / Status Flag"      },
  { id: "assortment",  label: "Assortment / Type"      },
];

// ── PARSE EXCEL IN BROWSER ────────────────────────────────────────────────────
async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: "array" });
        // Return all sheets so the wizard can let the user pick
        const sheetData = {};
        wb.SheetNames.forEach(name => {
          sheetData[name] = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
        });
        resolve({ sheetNames: wb.SheetNames, sheetData });
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
    if (col.includes("species") || col === "crop")       map[i] = "crop";
    else if (col === "series")                           map[i] = "series";
    else if (col.includes("variety name") || col === "variety") map[i] = "varietyName";
    else if (col === "color")                            map[i] = "color";
    else if (col.includes("short code") || col === "short") map[i] = "shortCode";
    else if (col.includes("desc"))                       map[i] = "description";
    else if (col.includes("size") || col.includes("form")) map[i] = "size";
    else if (col.includes("material") || col.includes("item") || col.includes("mat no")) map[i] = "itemNumber";
    else if (col.includes("per") || col.includes("unit size")) map[i] = "perQty";
    else if (col.includes("sell"))                       map[i] = "sellPrice";
    else if (col.includes("unit price") || col === "unit") map[i] = "unitPrice";
    else if (col.includes("ship"))                       map[i] = "shipDate";
    else if (col.includes("new") || col.includes("status")) map[i] = "isNew";
    else if (col.includes("assortment") || col.includes("type")) map[i] = "assortment";
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

    const series     = get("series");
    const varietyName = get("varietyName");
    // Derive color by stripping series prefix from varietyName
    let color = get("color");
    if (!color && series && varietyName) {
      const stripped = varietyName.trim();
      const sp = series.trim();
      color = stripped.startsWith(sp) ? stripped.slice(sp.length).trim() : stripped;
    }
    // Normalize crop name — use species if available, else crop field
    const cropName = (crop || desc || "").trim();

    items.push({
      id:          crypto.randomUUID(),
      crop:        cropName,
      series:      series || get("description") || "",
      varietyName: varietyName || desc || "",
      color:       color || "",
      shortCode:   get("shortCode"),
      description: desc,
      size:        get("size"),
      itemNumber:  get("itemNumber") || get("shortCode"),
      perQty:      get("perQty"),
      sellPrice:   parseFloat(get("sellPrice")) || null,
      unitPrice:   parseFloat(get("unitPrice")) || null,
      shipDate:    get("shipDate"),
      isNew:       !!get("isNew"),
      assortment:  get("assortment"),
    });
  });
  return items;
}

// ── UPLOAD WIZARD ─────────────────────────────────────────────────────────────
function UploadWizard({ onSave, onCancel }) {
  const [step, setStep]       = useState(1); // 1=file, 2=map, 3=confirm
  const [rows, setRows]             = useState([]);
  const [allSheets, setAllSheets]   = useState({});
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders]       = useState([]);
  const [headerRow, setHeaderRow]   = useState(0);
  const [mapping, setMapping]       = useState({});
  const [brokerName, setBrokerName] = useState("");
  const [brokerNameNew, setBrokerNameNew] = useState("");
  const [breederName, setBreederName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [season, setSeason]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [templateApplied, setTemplateApplied] = useState(false);
  const [saveTemplate, setSaveTemplate] = useState(true);
  const fileRef = useRef();
  const { rows: brokerProfiles, upsert: upsertBrokerProfile } = useBrokerProfiles();

  const applyBrokerTemplate = (template, sheets, sheetToLoad) => {
    if (!template) return false;
    const sheetName = template.sheetName || sheetToLoad;
    const allRows = sheets[sheetName] || sheets[sheetToLoad] || [];
    const hRow = template.headerRow ?? 0;
    setHeaderRow(hRow);
    setHeaders(allRows[hRow] || []);
    setRows(allRows);
    setMapping(template.mapping || {});
    if (template.sheetName && sheets[template.sheetName]) setSelectedSheet(template.sheetName);
    setTemplateApplied(true);
    return true;
  };

  const loadSheet = (name, sheets, brokerTpl) => {
    // Try broker template first
    if (brokerTpl) {
      const applied = applyBrokerTemplate(brokerTpl, sheets, name);
      if (applied) return;
    }
    const allRows = sheets[name] || [];
    // Search up to row 25 for a row that looks like a header (3+ non-empty, contains text)
    let hRow = 0;
    for (let i = 0; i < Math.min(25, allRows.length); i++) {
      const nonEmpty = allRows[i].filter(c => c && String(c).trim());
      if (nonEmpty.length >= 3) { hRow = i; break; }
    }
    setHeaderRow(hRow);
    setHeaders(allRows[hRow]);
    setRows(allRows);
    setMapping(guessMapping(allRows[hRow]));
    setTemplateApplied(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { sheetNames: names, sheetData } = await parseExcel(file);
      setAllSheets(sheetData);
      setSheetNames(names);
      const best = names.find(n => /order|price|list|catalog/i.test(n)) || names[names.length - 1];
      setSelectedSheet(best);
      // Check for saved broker template
      const bProfile = brokerProfiles.find(b => b.name.toLowerCase() === brokerName.toLowerCase());
      loadSheet(best, sheetData, bProfile?.importTemplate || null);
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

      {/* Broker → Breeder → Supplier → Year */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Broker <span style={{color:"#c8791a",fontWeight:400,fontSize:10,textTransform:"none"}}>(who you buy from)</span></div>
          {brokerProfiles.length > 0
            ? <>
                <select value={brokerName === brokerNameNew && brokerNameNew ? "__new__" : brokerName} onChange={e => { if(e.target.value==="__new__"){setBrokerName("");setBrokerNameNew("");}else{setBrokerName(e.target.value);setBrokerNameNew("");} }}
                  style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${brokerName&&brokerName!=="__new__"?"#7fb069":"#c8d8c0"}`, fontSize:14, color:"#1a2a1a", fontFamily:"inherit", boxSizing:"border-box", background:"#fff" }}>
                  <option value="">— Select broker —</option>
                  {brokerProfiles.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  <option value="__new__">+ Add new broker…</option>
                </select>
                {(brokerName===""&&brokerNameNew!==""||brokerProfiles.length===0||brokerName==="") && brokerName!=brokerProfiles.find(b=>b.name===brokerName)?.name && brokerName==="" && (
                  <input value={brokerNameNew} onChange={e=>{setBrokerNameNew(e.target.value);setBrokerName(e.target.value);}} placeholder="Type new broker name…"
                    style={{width:"100%",marginTop:6,padding:"10px 12px",borderRadius:8,border:"1.5px solid #7fb069",fontSize:14,color:"#1a2a1a",fontFamily:"inherit",boxSizing:"border-box"}} />
                )}
              </>
            : <input value={brokerName} onChange={e=>setBrokerName(e.target.value)} placeholder="e.g. Ball Seed"
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #c8d8c0",fontSize:14,color:"#1a2a1a",fontFamily:"inherit",boxSizing:"border-box"}} />
          }
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Year</div>
          <select value={season} onChange={e => setSeason(e.target.value)}
            style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1.5px solid ${season?"#7fb069":"#c8d8c0"}`, fontSize:14, color:"#1a2a1a", fontFamily:"inherit", boxSizing:"border-box", background:"#fff" }}>
            <option value="">— Select year —</option>
            {["2024","2025","2026","2027"].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Breeder <span style={{color:"#c8791a",fontWeight:400,fontSize:10,textTransform:"none"}}>(who bred it)</span></div>
          <input value={breederName} onChange={e=>setBreederName(e.target.value)} placeholder="e.g. Dummen Orange"
            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${breederName?"#7fb069":"#c8d8c0"}`,fontSize:14,color:"#1a2a1a",fontFamily:"inherit",boxSizing:"border-box"}} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Supplier <span style={{color:"#c8791a",fontWeight:400,fontSize:10,textTransform:"none"}}>(facility / origin)</span></div>
          <input value={supplierName} onChange={e=>setSupplierName(e.target.value)} placeholder="e.g. Dummen Orange Guatemala"
            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${supplierName?"#7fb069":"#c8d8c0"}`,fontSize:14,color:"#1a2a1a",fontFamily:"inherit",boxSizing:"border-box"}} />
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
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16 }}>Tell the app what each column contains. We've made our best guess — adjust anything that's wrong.</div>

      {/* Template applied banner */}
      {templateApplied && (
        <div style={{ background: "#f0f8eb", border: "1.5px solid #b8d8a0", borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>Saved template applied for <strong>{brokerName}</strong></span>
          <button onClick={() => { loadSheet(selectedSheet, allSheets, null); setTemplateApplied(false); }}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 8, border: "1.5px solid #b8d8a0", background: "#fff", color: "#4a7a35", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Override
          </button>
        </div>
      )}

      {/* Sheet selector */}
      {sheetNames.length > 1 && (
        <div style={{ background: "#fff8e8", border: "1.5px solid #f0d090", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#a06010" }}>📄 Sheet:</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {sheetNames.map(name => (
              <button key={name} onClick={() => { setSelectedSheet(name); loadSheet(name, allSheets); }}
                style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${selectedSheet === name ? "#c8791a" : "#e0c070"}`, background: selectedSheet === name ? "#fff4e8" : "#fff", color: selectedSheet === name ? "#c8791a" : "#a06010", fontWeight: selectedSheet === name ? 800 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                {name}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "#c8791a" }}>Auto-selected: {selectedSheet}</span>
        </div>
      )}

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

      {/* Save template option */}
      <div style={{ background: "#f0f8eb", border: "1.5px solid #b8d8a0", borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <input type="checkbox" id="saveTemplateChk" checked={saveTemplate} onChange={e => setSaveTemplate(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#7fb069", cursor: "pointer" }} />
        <label htmlFor="saveTemplateChk" style={{ fontSize: 13, fontWeight: 600, color: "#2e5c1e", cursor: "pointer" }}>
          Save column mapping as import template for <strong>{brokerName || "this broker"}</strong>
        </label>
        <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: "auto" }}>Auto-applies next time</span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(2)} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
        <button onClick={async () => {
          if (saveTemplate && brokerName.trim()) {
            const template = { mapping, headerRow, sheetName: selectedSheet };
            const existing = brokerProfiles.find(b => b.name.toLowerCase() === brokerName.toLowerCase());
            if (existing) { await upsertBrokerProfile({ ...existing, importTemplate: template }); }
            else { await upsertBrokerProfile({ id: crypto.randomUUID(), name: brokerName, importTemplate: template, whatTheySell: [], seasonHistory: [] }); }
          }
          onSave({ id: crypto.randomUUID(), brokerName, breederName, supplierName, season, items, importedAt: new Date().toISOString() });
        }} style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: "#7fb069", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
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
          {catalog.breederName && <div style={{ fontSize: 13, color: "#4a7a35", fontWeight: 700 }}>{catalog.breederName}{catalog.supplierName ? ` — ${catalog.supplierName}` : ""}</div>}
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
  const { rows: catalogs, upsert: upsertCatalog, remove: removeCatalogDb } = useBrokerCatalogs();
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

  const handleSave = async (catalog) => {
    await upsertCatalog(catalog);
    setView("list");
  };

  const handleDelete = async (id) => {
    await removeCatalogDb(id);
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
                    {cat.breederName && <div style={{ fontSize: 12, color: "#4a7a35", fontWeight: 700 }}>{cat.breederName}{cat.supplierName ? ` — ${cat.supplierName}` : ""}</div>}
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
function useBrokerLookup() {
  const { rows: catalogs } = useBrokerCatalogs();

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
      const item = cat.items?.find(i => i.itemNumber === itemNumber);
      if (item) return { ...item, brokerName: cat.brokerName, season: cat.season };
    }
    return null;
  };

  // Cascade: broker → crops → series → colors
  const getCascadeData = (brokerName) => {
    const cats = getCatalogForBroker(brokerName);
    const items = cats.flatMap(c => c.items);
    // Group: crop → series → [items]
    const tree = {};
    items.forEach(item => {
      const crop   = (item.crop || item.description || "Unknown").trim();
      const series = (item.series || item.description || "").trim();
      const color  = (item.color || item.varietyName || item.description || "").trim();
      if (!crop) return;
      if (!tree[crop]) tree[crop] = {};
      if (!tree[crop][series]) tree[crop][series] = [];
      tree[crop][series].push(item);
    });
    return tree;
  };

  const getCrops = (brokerName) => {
    const tree = getCascadeData(brokerName);
    return Object.keys(tree).sort();
  };

  const getSeries = (brokerName, crop) => {
    const tree = getCascadeData(brokerName);
    return Object.keys(tree[crop] || {}).sort();
  };

  const getColors = (brokerName, crop, series) => {
    const tree = getCascadeData(brokerName);
    return (tree[crop]?.[series] || []).sort((a,b) => (a.color||"").localeCompare(b.color||""));
  };

  const lookupByCascade = (brokerName, crop, series, color) => {
    const colors = getColors(brokerName, crop, series);
    return colors.find(i => (i.color || i.varietyName || "") === color) || null;
  };

  return { getBrokerNames, getCatalogForBroker, searchVarieties, lookupByItemNumber, getCascadeData, getCrops, getSeries, getColors, lookupByCascade };
}


// ── CATALOG PICKER — exported for use in CropPlanning & ComboDesigner ──────────
// Usage: <CatalogPicker broker="Ball Seed" onSelect={({crop,series,color,itemNumber,perQty,sellPrice,...}) => ...} />
export function CatalogPicker({ broker: brokerProp, onSelect, initial = {} }) {
  const { getCrops, getSeries, getColors, lookupByCascade, getBrokerNames } = useBrokerLookup();

  // Allow broker to be selected internally if not passed as prop
  const [brokerSel, setBrokerSel] = useState(initial.broker || brokerProp || "");
  const broker = brokerProp || brokerSel;

  const [crop,   setCrop]   = useState(initial.crop   || "");
  const [series, setSeries] = useState(initial.series || "");
  const [color,  setColor]  = useState(initial.color  || "");

  const brokerNames = getBrokerNames();
  const crops      = broker ? getCrops(broker)                          : [];
  const seriesList = broker && crop ? getSeries(broker, crop)           : [];
  const colorList  = broker && crop && series ? getColors(broker, crop, series) : [];

  function pickBroker(b) {
    setBrokerSel(b); setCrop(""); setSeries(""); setColor("");
  }
  function pickCrop(c) {
    setCrop(c); setSeries(""); setColor("");
  }
  function pickSeries(s) {
    setSeries(s); setColor("");
  }
  function pickColor(c) {
    setColor(c);
    if (onSelect && broker && crop && series) {
      const item = lookupByCascade(broker, crop, series, c);
      if (item) onSelect({ broker, crop, series, color: c, itemNumber: item.itemNumber || item.shortCode || "", perQty: item.perQty || "", sellPrice: item.sellPrice || item.unitPrice || null, varietyName: item.varietyName || "", shortCode: item.shortCode || "", item });
    }
  }

  const SEL = (active) => ({
    display: "inline-flex", alignItems: "center", padding: "6px 14px", borderRadius: 20,
    border: `1.5px solid ${active ? "#7fb069" : "#c8d8c0"}`,
    background: active ? "#f0f8eb" : "#fff",
    color: active ? "#2e5c1e" : "#4a5a40",
    fontWeight: active ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    whiteSpace: "nowrap", transition: "all .1s",
  });

  const SL = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1e2d1a", cursor: "pointer" };

  if (!broker && brokerNames.length === 0) return (
    <div style={{ padding: "14px", background: "#fff8e8", borderRadius: 10, fontSize: 13, color: "#c8791a", border: "1.5px solid #f0d090" }}>
      ⚠ No broker catalogs imported yet. Go to Library → Brokers to import a price list.
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Broker selector — only show if not passed as prop */}
      {!brokerProp && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Broker / Supplier</div>
          {brokerNames.length <= 6
            ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {brokerNames.map(b => (
                  <button key={b} onClick={() => pickBroker(b)} style={SEL(brokerSel === b)}>{b}</button>
                ))}
              </div>
            : <select value={brokerSel} onChange={e => pickBroker(e.target.value)} style={SL}>
                <option value="">— Select broker —</option>
                {brokerNames.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
          }
        </div>
      )}

      {broker && crops.length === 0 && (
        <div style={{ padding: "12px 14px", background: "#fff8e8", borderRadius: 10, fontSize: 13, color: "#c8791a", border: "1.5px solid #f0d090" }}>
          ⚠ No catalog imported for {broker} yet. Import one in Library → Brokers.
        </div>
      )}

      {/* Step 1: Crop */}
      {broker && crops.length > 0 && (<>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Crop / Species</div>
        <select value={crop} onChange={e => pickCrop(e.target.value)} style={SL}>
          <option value="">— Select crop —</option>
          {crops.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Step 2: Series */}
      {crop && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Series / Cultivar</div>
          {seriesList.length <= 8
            ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {seriesList.map(s => (
                  <button key={s} onClick={() => pickSeries(s)} style={SEL(series === s)}>{s || "(No series)"}</button>
                ))}
              </div>
            : <select value={series} onChange={e => pickSeries(e.target.value)} style={SL}>
                <option value="">— Select series —</option>
                {seriesList.map(s => <option key={s} value={s}>{s || "(No series)"}</option>)}
              </select>
          }
        </div>
      )}

      {/* Step 3: Color */}
      {series && colorList.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Color</div>
          {colorList.length <= 12
            ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {colorList.map(item => {
                  const c = item.color || item.varietyName || "";
                  return (
                    <button key={c} onClick={() => pickColor(c)} style={SEL(color === c)}>{c || "(No color)"}</button>
                  );
                })}
              </div>
            : <select value={color} onChange={e => pickColor(e.target.value)} style={SL}>
                <option value="">— Select color —</option>
                {colorList.map(item => {
                  const c = item.color || item.varietyName || "";
                  return <option key={c} value={c}>{c}</option>;
                })}
              </select>
          }
        </div>
      )}

      {/* Auto-fill preview */}
      {color && broker && crop && series && (() => {
        const item = lookupByCascade(broker, crop, series, color);
        if (!item) return null;
        return (
          <div style={{ background: "#f0f8eb", borderRadius: 10, border: "1.5px solid #b8d8a0", padding: "10px 14px", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {item.itemNumber && <div style={{ fontSize: 12 }}><span style={{ color: "#7a8c74" }}>Item #</span> <strong>{item.itemNumber}</strong></div>}
            {item.shortCode  && <div style={{ fontSize: 12 }}><span style={{ color: "#7a8c74" }}>Code</span> <strong>{item.shortCode}</strong></div>}
            {item.perQty     && <div style={{ fontSize: 12 }}><span style={{ color: "#7a8c74" }}>Per</span> <strong>{item.perQty}</strong></div>}
            {(item.sellPrice || item.unitPrice) && <div style={{ fontSize: 12 }}><span style={{ color: "#7a8c74" }}>Price</span> <strong>${item.sellPrice || item.unitPrice}</strong></div>}
          </div>
        );
      })()}
      </>)}
    </div>
  );
}

// ── LIBRARIES TAB WRAPPER ────────────────────────────────────────────────────

// ── PRICE UPDATE & HISTORY ────────────────────────────────────────────────────
function PriceUpdateLibrary() {
  const { rows: containers, upsert: upsertContainer } = useContainers();
  const { rows: mixes,      upsert: upsertMix }       = useSoilMixes();
  const { rows: tags,       upsert: upsertTag }        = useComboTags();

  const [section,    setSection]    = useState("containers"); // containers | soil | tags
  const [supplier,   setSupplier]   = useState("all");
  const [adjType,    setAdjType]    = useState("pct");   // pct | flat
  const [adjValue,   setAdjValue]   = useState("");
  const [note,       setNote]       = useState("");
  const [effectDate, setEffectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [preview,    setPreview]    = useState(null);   // null | [{item, oldPrice, newPrice}]
  const [histItem,   setHistItem]   = useState(null);   // item to show history for
  const [view,       setView]       = useState("update"); // update | history

  const uid = () => crypto.randomUUID();

  // ── data for current section ──
  const sectionData = {
    containers: { rows: containers, priceField: "costPerUnit", upsert: upsertContainer, label: "Containers", icon: "🪴" },
    soil:       { rows: mixes,      priceField: "costPerBag",  upsert: upsertMix,       label: "Soil / Media", icon: "🪱" },
    tags:       { rows: tags,       priceField: "costPerUnit", upsert: upsertTag,        label: "Tags & Labels", icon: "🏷️" },
  };
  const { rows, priceField, upsert, label } = sectionData[section];

  // ── suppliers for current section ──
  const suppliers = ["all", ...new Set(rows.map(r => r.supplier || r.vendor).filter(Boolean))];

  // ── filtered rows ──
  const filtered = rows.filter(r => {
    if (supplier !== "all") return (r.supplier || r.vendor) === supplier;
    return true;
  }).filter(r => r[priceField]);

  function buildPreview() {
    const adj = parseFloat(adjValue);
    if (!adj || isNaN(adj)) return;
    const items = filtered.map(r => {
      const old = parseFloat(r[priceField]) || 0;
      const newP = adjType === "pct"
        ? Math.round(old * (1 + adj / 100) * 10000) / 10000
        : Math.round((old + adj) * 10000) / 10000;
      return { item: r, oldPrice: old, newPrice: Math.max(0, newP) };
    });
    setPreview(items);
  }

  async function applyUpdate() {
    if (!preview) return;
    const dateLabel = new Date(effectDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    for (const { item, oldPrice, newPrice } of preview) {
      const entry = { id: uid(), date: dateLabel, price: oldPrice, note: note || `Updated to $${newPrice.toFixed(4)}` };
      const history = [...(item.priceHistory || []), entry];
      await upsert({ ...item, [priceField]: newPrice.toString(), priceHistory: history });
    }
    setPreview(null);
    setAdjValue("");
    setNote("");
    setView("history");
  }

  const Btn = ({ onClick, children, variant = "primary", small, disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? "7px 14px" : "10px 22px", borderRadius: 9,
      border: variant === "primary" ? "none" : "1.5px solid #c8d8c0",
      background: variant === "primary" ? "#7fb069" : "#fff",
      color: variant === "primary" ? "#fff" : "#7a8c74",
      fontWeight: 700, fontSize: small ? 12 : 13, cursor: disabled ? "default" : "pointer",
      fontFamily: "inherit", opacity: disabled ? 0.5 : 1
    }}>{children}</button>
  );

  const TabBtn = ({ id, ico, lbl }) => (
    <button onClick={() => { setSection(id); setPreview(null); setSupplier("all"); }}
      style={{ padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${section === id ? "#7fb069" : "#c8d8c0"}`, background: section === id ? "#7fb069" : "#fff", color: section === id ? "#fff" : "#4a5a40", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
      {ico} {lbl}
    </button>
  );

  // ── HISTORY VIEW ──
  if (histItem) {
    const hist = [...(histItem.priceHistory || [])].reverse();
    const currentPrice = parseFloat(histItem[priceField]) || 0;
    return (
      <div style={{ maxWidth: 600 }}>
        <button onClick={() => setHistItem(null)} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>← Back</button>
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "24px 28px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>{histItem.name}</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>{histItem.supplier || histItem.vendor || "No supplier"}</div>
          <div style={{ background: "#f2f5ef", borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6 }}>Current Price</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a" }}>${currentPrice.toFixed(4)}</div>
          </div>
          {hist.length === 0 ? (
            <div style={{ fontSize: 13, color: "#aabba0", textAlign: "center", padding: "24px 0" }}>No price history yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Price History</div>
              {hist.map((h, i) => {
                const next = hist[i + 1];
                const diff = next ? (h.price - parseFloat(next.price || 0)) : null;
                return (
                  <div key={h.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fafcf8", borderRadius: 9, border: "1px solid #e8f0e0" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>${parseFloat(h.price).toFixed(4)}</div>
                      {h.note && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{h.note}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#7a8c74" }}>{h.date}</div>
                      {diff !== null && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? "#c03030" : "#2e7d32", marginTop: 2 }}>
                          {diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(4)} from prior
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Section tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn id="containers" ico="🪴" lbl="Containers" />
        <TabBtn id="soil"       ico="🪱" lbl="Soil / Media" />
        <TabBtn id="tags"       ico="🏷️" lbl="Tags & Labels" />
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[["update", "💰 Price Update"], ["history", "📋 History"]].map(([id, lbl]) => (
          <button key={id} onClick={() => { setView(id); setPreview(null); }}
            style={{ padding: "8px 16px", borderRadius: 9, border: `1.5px solid ${view === id ? "#4a90d9" : "#c8d8c0"}`, background: view === id ? "#e8f2ff" : "#fff", color: view === id ? "#2060b0" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── PRICE UPDATE ── */}
      {view === "update" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
          {/* Controls */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "24px 28px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a", marginBottom: 18 }}>Price Adjustment</div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Supplier / Filter</div>
              <select value={supplier} onChange={e => { setSupplier(e.target.value); setPreview(null); }}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit" }}>
                {suppliers.map(s => <option key={s} value={s}>{s === "all" ? "All Suppliers" : s}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Adjustment Type</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["pct", "% Percentage"], ["flat", "$ Flat Amount"]].map(([id, lbl]) => (
                  <button key={id} onClick={() => { setAdjType(id); setPreview(null); }}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1.5px solid ${adjType === id ? "#7fb069" : "#c8d8c0"}`, background: adjType === id ? "#f2f8ee" : "#fff", color: adjType === id ? "#4a7a30" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
                {adjType === "pct" ? "Percentage Change (use – for decrease)" : "Amount to Add / Subtract"}
              </div>
              <input type="number" step={adjType === "pct" ? "0.1" : "0.01"} value={adjValue}
                onChange={e => { setAdjValue(e.target.value); setPreview(null); }}
                placeholder={adjType === "pct" ? "e.g. 6 for +6%, -3 for -3%" : "e.g. 0.50 or -0.25"}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Effective Date</div>
              <input type="date" value={effectDate} onChange={e => setEffectDate(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Note (optional)</div>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder="e.g. Spring 2026 supplier price increase"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={buildPreview} disabled={!adjValue || filtered.length === 0}>Preview {filtered.length} Items</Btn>
              {preview && <Btn variant="secondary" onClick={() => setPreview(null)}>Clear</Btn>}
            </div>
          </div>

          {/* Preview */}
          <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${preview ? "#7fb069" : "#e0ead8"}`, padding: "24px 28px" }}>
            {!preview ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
                <div style={{ fontSize: 13 }}>Fill in the adjustment details and click Preview to see the changes before applying.</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>Preview Changes</div>
                <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 16 }}>{preview.length} items · {adjType === "pct" ? `${adjValue > 0 ? "+" : ""}${adjValue}%` : `${adjValue > 0 ? "+$" : "-$"}${Math.abs(adjValue)}`}</div>
                <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                  {preview.map(({ item, oldPrice, newPrice }) => {
                    const diff = newPrice - oldPrice;
                    return (
                      <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#fafcf8", borderRadius: 8, border: "1px solid #e8f0e0" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e2d1a", flex: 1, marginRight: 12 }}>{item.name}</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#aabba0", textDecoration: "line-through" }}>${oldPrice.toFixed(4)}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a" }}>${newPrice.toFixed(4)}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? "#c03030" : "#2e7d32", minWidth: 52, textAlign: "right" }}>
                            {diff >= 0 ? "+" : ""}${diff.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Btn onClick={applyUpdate}>Apply & Archive Old Prices</Btn>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === "history" && (
        <div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16 }}>Click any item to see its full price history.</div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0", fontSize: 13 }}>No {label} with pricing found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map(item => {
                const current = parseFloat(item[priceField]) || 0;
                const hist = item.priceHistory || [];
                const last = hist[hist.length - 1];
                const prev = last ? parseFloat(last.price) : null;
                const diff = prev !== null ? current - prev : null;
                return (
                  <button key={item.id} onClick={() => setHistItem(item)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#fff", borderRadius: 10, border: "1.5px solid #e0ead8", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{item.name}</div>
                      <div style={{ fontSize: 11, color: "#aabba0", marginTop: 2 }}>{item.supplier || item.vendor || "No supplier"} · {hist.length} update{hist.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>${current.toFixed(4)}</div>
                      {diff !== null && (
                        <div style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? "#c03030" : "#2e7d32", marginTop: 2 }}>
                          {diff >= 0 ? "▲ +" : "▼ "}${Math.abs(diff).toFixed(4)} from last update
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LIBRARY_TABS = [
  { id: "variety",   label: "Varieties",  icon: "🌿" },
  { id: "container", label: "Containers", icon: "🪴" },
  { id: "soil",      label: "Soil",       icon: "🪱" },
  { id: "inputs",    label: "Inputs",     icon: "🧪" },
  { id: "spacing",   label: "Spacing",    icon: "📐" },
  { id: "brokers",   label: "Brokers",    icon: "📊" },
  { id: "tags",      label: "Tags",       icon: "🏷️" },
  { id: "combos",    label: "Combos",     icon: "🌸" },
  { id: "pricing",   label: "Pricing",    icon: "💰" },
  { id: "brkprofile", label: "Brokers",    icon: "🤝" },
  { id: "suppliers",  label: "Suppliers",  icon: "🏭" },
  { id: "breeders",   label: "Breeders",   icon: "🧬" },
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
      {tab === "soil"      && <SoilLibrary />}
      {tab === "inputs"    && <InputsLibrary />}
      {tab === "spacing"   && <SpacingLibrary />}
      {tab === "brokers"   && <BrokerCatalogs />}
      {tab === "tags"      && <TagsLibrary />}
      {tab === "combos"    && <ComboLibrary />}
      {tab === "pricing"   && <PriceUpdateLibrary />}
      {tab === "brkprofile" && <BrokerProfiles />}
      {tab === "suppliers"  && <SupplierProfiles />}
      {tab === "breeders"   && <BreederProfiles />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// SOIL / SUBSTRATE LIBRARY
// ═══════════════════════════════════════════════════════

const SOIL_CATEGORIES = [
  { id: "annual",       label: "Annual",       color: "#e07b39", bg: "#fff4e8" },
  { id: "geranium",     label: "Geranium",     color: "#c03030", bg: "#fff0f0" },
  { id: "propagation",  label: "Propagation",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "houseplant",   label: "Houseplant",   color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "other",        label: "Other",        color: "#7a8c74", bg: "#f0f5ee" },
];

const BAG_UNITS = ["cu ft", "gal", "L", "qt", "lbs"];


function SoilForm({ initial, onSave, onCancel }) {
  const blank = { id: null, name: "", category: "annual", vendor: "", productName: "", sku: "", bagSize: "", bagUnit: "cu ft", costPerBag: "", notes: "" };
  const [f, setF] = useState(initial ? { ...blank, ...initial } : blank);
  const [focus, setFocus] = useState(null);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const costPerCuFt = () => {
    if (!f.costPerBag || !f.bagSize) return null;
    const cost = Number(f.costPerBag);
    const size = Number(f.bagSize);
    if (!cost || !size) return null;
    if (f.bagUnit === "cu ft") return (cost / size).toFixed(3);
    if (f.bagUnit === "gal")   return (cost / (size * 0.134)).toFixed(3);
    if (f.bagUnit === "L")     return (cost / (size * 0.0353)).toFixed(3);
    if (f.bagUnit === "qt")    return (cost / (size * 0.0334)).toFixed(3);
    return null;
  };

  const cat = SOIL_CATEGORIES.find(c => c.id === f.category) || SOIL_CATEGORIES[0];
  const cpf = costPerCuFt();

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "24px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a", marginBottom: 20 }}>{initial ? "Edit Mix" : "New Soil Mix"}</div>

      <div style={{ marginBottom: 14 }}>
        <FL c="Mix Name" />
        <input style={IS(focus === "name")} value={f.name} onChange={e => upd("name", e.target.value)}
          onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder="e.g. Annual Mix, Geranium Pro Mix" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <FL c="Category" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SOIL_CATEGORIES.map(c => (
            <button key={c.id} onClick={() => upd("category", c.id)}
              style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${f.category === c.id ? c.color : "#c8d8c0"}`, background: f.category === c.id ? c.bg : "#fff", color: f.category === c.id ? c.color : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <FL c="Vendor" />
          <input style={IS(focus === "vendor")} value={f.vendor} onChange={e => upd("vendor", e.target.value)}
            onFocus={() => setFocus("vendor")} onBlur={() => setFocus(null)} placeholder="e.g. Sun Gro, Berger" />
        </div>
        <div>
          <FL c="Product Name" />
          <input style={IS(focus === "product")} value={f.productName} onChange={e => upd("productName", e.target.value)}
            onFocus={() => setFocus("product")} onBlur={() => setFocus(null)} placeholder="e.g. Metro-Mix 830" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <FL c="SKU / Item #" />
          <input style={IS(focus === "sku")} value={f.sku} onChange={e => upd("sku", e.target.value)}
            onFocus={() => setFocus("sku")} onBlur={() => setFocus(null)} placeholder="Optional" />
        </div>
        <div>
          <FL c="Bag Size" />
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" step="0.1" style={{ ...IS(focus === "bagSize"), flex: 1 }} value={f.bagSize} onChange={e => upd("bagSize", e.target.value)}
              onFocus={() => setFocus("bagSize")} onBlur={() => setFocus(null)} placeholder="e.g. 3.8" />
            <select value={f.bagUnit} onChange={e => upd("bagUnit", e.target.value)}
              style={{ padding: "9px 8px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, color: "#1a2a1a", fontFamily: "inherit", background: "#fff", flexShrink: 0 }}>
              {BAG_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <FL c="Cost per Bag ($)" />
          <input type="number" step="0.01" style={IS(focus === "cost")} value={f.costPerBag} onChange={e => upd("costPerBag", e.target.value)}
            onFocus={() => setFocus("cost")} onBlur={() => setFocus(null)} placeholder="e.g. 28.50" />
        </div>
      </div>

      {cpf && (
        <div style={{ background: "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 10, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 20 }}>
          <div><div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Cost / cu ft</div><div style={{ fontSize: 18, fontWeight: 800, color: "#2e5c1e" }}>${cpf}</div></div>
          {f.bagSize && f.bagUnit !== "cu ft" && <div><div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Bag in cu ft</div><div style={{ fontSize: 18, fontWeight: 800, color: "#2e5c1e" }}>{(Number(f.bagSize) * (f.bagUnit === "gal" ? 0.134 : f.bagUnit === "L" ? 0.0353 : f.bagUnit === "qt" ? 0.0334 : 1)).toFixed(2)}</div></div>}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <FL c="Notes" />
        <textarea style={{ ...IS(focus === "notes"), minHeight: 60, resize: "vertical" }} value={f.notes} onChange={e => upd("notes", e.target.value)}
          onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} placeholder="Amendments, pH notes, drainage additives..." />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => f.name && onSave({ ...f, id: f.id || uid() })}
          style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: f.name ? "#7fb069" : "#c8d8c0", color: "#fff", fontWeight: 800, fontSize: 14, cursor: f.name ? "pointer" : "default", fontFamily: "inherit" }}>
          {initial ? "Save Changes" : "Add Mix"}
        </button>
      </div>
    </div>
  );
}

function SoilCard({ mix, onEdit, onDelete }) {
  const cat = SOIL_CATEGORIES.find(c => c.id === mix.category) || SOIL_CATEGORIES[4];
  const cpf = (() => {
    if (!mix.costPerBag || !mix.bagSize) return null;
    const cost = Number(mix.costPerBag), size = Number(mix.bagSize);
    if (!cost || !size) return null;
    if (mix.bagUnit === "cu ft") return (cost / size).toFixed(3);
    if (mix.bagUnit === "gal")   return (cost / (size * 0.134)).toFixed(3);
    if (mix.bagUnit === "L")     return (cost / (size * 0.0353)).toFixed(3);
    if (mix.bagUnit === "qt")    return (cost / (size * 0.0334)).toFixed(3);
    return null;
  })();

  return (
    <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{cat.label}</span>
            {mix.vendor && <span style={{ fontSize: 12, color: "#7a8c74" }}>{mix.vendor}</span>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a" }}>{mix.name}</div>
          {mix.productName && <div style={{ fontSize: 13, color: "#4a5a40" }}>{mix.productName}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <button onClick={onEdit}   style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          <button onClick={onDelete} style={{ background: "none", border: "1px solid #f0c0c0", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#c03030", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {mix.bagSize && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a1a" }}>{mix.bagSize} {mix.bagUnit}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>Bag Size</div></div>}
        {mix.costPerBag && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a1a" }}>${Number(mix.costPerBag).toFixed(2)}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>Per Bag</div></div>}
        {cpf && <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#2e5c1e" }}>${cpf}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>Per Cu Ft</div></div>}
        {mix.sku && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a1a", fontFamily: "monospace" }}>{mix.sku}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>SKU</div></div>}
      </div>
      {mix.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 10, fontStyle: "italic" }}>{mix.notes}</div>}
    </div>
  );
}

function SoilLibrary() {
  const { rows: mixes, upsert: upsertMix, remove: removeMixDb } = useSoilMixes();
  const [view, setView]       = useState("list");
  const [editingId, setEditId] = useState(null);
  const [catFilter, setCat]    = useState("all");

  const SOIL_FIELDS = [
    { id: "name",       label: "Product Name *", required: true,  guesses: ["name","product","mix","soil","media"] },
    { id: "category",   label: "Category",       required: false, guesses: ["category","type","use"] },
    { id: "vendor",     label: "Vendor",         required: false, guesses: ["vendor","supplier","brand","manufacturer"] },
    { id: "sku",        label: "SKU",            required: false, guesses: ["sku","item","part","number"] },
    { id: "bagSize",    label: "Bag Size",       required: false, guesses: ["bag","size","volume","qty"] },
    { id: "bagUnit",    label: "Bag Unit",       required: false, guesses: ["unit","uom"] },
    { id: "costPerBag", label: "Cost/Bag ($)",   required: false, guesses: ["cost","price","per bag"] },
    { id: "notes",      label: "Notes",          required: false, guesses: ["note","comment"] },
  ];
  async function bulkImportSoil(rows) {
    const NUMERIC = ["bagSize","costPerBag"];
    let errors = 0;
    for (const r of rows) {
      const row = { ...r, bagUnit: r.bagUnit || "cu ft", category: r.category || "annual" };
      const clean = Object.fromEntries(
        Object.entries(row).map(([k,v]) => [k, NUMERIC.includes(k) ? (v===""||v==null?null:Number(v)) : v])
      );
      clean.id = crypto.randomUUID();
      try { await upsertMix(clean); }
      catch(e) { errors++; console.error("Row failed:", clean.name, e.message); }
    }
    if (errors > 0) alert("Import complete with " + errors + " error(s).");
  }

  const save = async (mix) => {
    const NUMERIC = ["bagSize","costPerBag"];
    const clean = Object.fromEntries(
      Object.entries(mix).map(([k,v]) => [k, NUMERIC.includes(k) ? (v===""||v==null?null:Number(v)) : v])
    );
    if (!clean.id || !clean.id.includes("-")) clean.id = crypto.randomUUID();
    try { await upsertMix(clean); setView("list"); setEditId(null); }
    catch(e) { alert("Save failed: " + e.message); }
  };

  const filtered = mixes.filter(m => catFilter === "all" || m.category === catFilter);

  if (view === "import") return <BulkImporter title="Import Soil / Media" templateFilename="soil-template.csv" templateHeaders={["Product Name","Category","Vendor","SKU","Bag Size","Bag Unit","Cost Per Bag","Notes"]} templateSample={["Fafard 2 Mix","annual","Sun Gro","020902016P","3.8","cu ft","28.50",""]} fieldMap={SOIL_FIELDS} onImport={bulkImportSoil} onCancel={() => setView("list")} />;
  if (view === "add")  return <SoilForm onSave={save} onCancel={() => setView("list")} />;
  if (view === "edit" && editingId) return <SoilForm initial={mixes.find(m => m.id === editingId)} onSave={save} onCancel={() => { setView("list"); setEditId(null); }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>Soil & Substrate Mixes</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView("import")} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#7a8c74" }}>📥 Import</button>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add Mix</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setCat("all")}
          style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${catFilter === "all" ? "#7fb069" : "#c8d8c0"}`, background: catFilter === "all" ? "#7fb069" : "#fff", color: catFilter === "all" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          All ({mixes.length})
        </button>
        {SOIL_CATEGORIES.map(c => {
          const count = mixes.filter(m => m.category === c.id).length;
          if (!count) return null;
          return (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${catFilter === c.id ? c.color : "#c8d8c0"}`, background: catFilter === c.id ? c.bg : "#fff", color: catFilter === c.id ? c.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {c.label} ({count})
            </button>
          );
        })}
      </div>

      {mixes.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🪱</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 8 }}>No soil mixes yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 360, margin: "0 auto 24px" }}>Add your annual mix, geranium mix, prop mix and more. Cost per cubic foot is calculated automatically.</div>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add First Mix</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(mix => (
            <SoilCard key={mix.id} mix={mix}
              onEdit={() => { setEditId(mix.id); setView("edit"); }}
              onDelete={() => removeMixDb(mix.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// INPUTS INVENTORY (PGRs, Insecticides, Fungicides, Other)
// ═══════════════════════════════════════════════════════

const INPUT_CATEGORIES = [
  { id: "pgr",         label: "PGR",         color: "#8e44ad", bg: "#f5f0ff", icon: "🌱" },
  { id: "insecticide", label: "Insecticide",  color: "#c8791a", bg: "#fff4e8", icon: "🐛" },
  { id: "fungicide",   label: "Fungicide",    color: "#2e7d9e", bg: "#e8f4f8", icon: "🍄" },
  { id: "miticide",    label: "Miticide",     color: "#c03030", bg: "#fff0f0", icon: "🕷️" },
  { id: "other",       label: "Other",        color: "#7a8c74", bg: "#f0f5ee", icon: "🧪" },
];

const INPUT_UNITS = ["oz", "lb", "fl oz", "gal", "L", "kg", "each"];
const RATE_UNITS  = ["oz/100 gal", "fl oz/100 gal", "oz/gal", "fl oz/gal", "lb/100 gal", "ppm", "ml/L"];
const SIGNAL_WORDS = ["Caution", "Warning", "Danger"];
const STOCK_STATUS = (product) => {
  if (!product.stockQty || !product.reorderAt) return "ok";
  const qty = Number(product.stockQty);
  const threshold = Number(product.reorderAt);
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "ok";
};
const STOCK_META = {
  ok:  { label: "In Stock",    color: "#2e7a2e", bg: "#e8f8e8", dot: "#7fb069" },
  low: { label: "Low — Reorder", color: "#c8791a", bg: "#fff4e8", dot: "#f0a040" },
  out: { label: "Out of Stock", color: "#c03030", bg: "#fff0f0", dot: "#e06060" },
};

function InputForm({ initial, onSave, onCancel }) {
  const blank = {
    id: null, name: "", category: "insecticide", activeIngredient: "", signalWord: "Caution",
    formulation: "", appRate: "", appRateUnit: "oz/100 gal", rei: "", phi: "",
    supplier: "", unitSize: "", unitSizeUnit: "oz", costPerUnit: "",
    stockQty: "", stockUnit: "oz", reorderAt: "", preferredOrderQty: "",
    lastOrderDate: "", lastOrderPrice: "", bulkPriceNote: "",
    crossBenefits: "", tankMixNotes: "", cropSensitivities: "", notes: "",
  };
  const [f, setF] = useState(initial ? { ...blank, ...initial } : blank);
  const [focus, setFocus] = useState(null);
  const [section, setSection] = useState("product");
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  const cat = INPUT_CATEGORIES.find(c => c.id === f.category) || INPUT_CATEGORIES[4];

  const SECTIONS = [
    { id: "product",   label: "Product"   },
    { id: "inventory", label: "Inventory" },
    { id: "ordering",  label: "Ordering"  },
    { id: "notes",     label: "Notes"     },
  ];

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "24px" }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a", marginBottom: 16 }}>{initial ? "Edit Input" : "New Input Product"}</div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "1.5px solid #e0ead8", paddingBottom: 0 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: `3px solid ${section === s.id ? "#7fb069" : "transparent"}`, color: section === s.id ? "#2e5c1e" : "#7a8c74", fontWeight: section === s.id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: -1 }}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "product" && (<>
        <div style={{ marginBottom: 14 }}>
          <FL c="Product Name" />
          <input style={IS(focus === "name")} value={f.name} onChange={e => upd("name", e.target.value)}
            onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder="e.g. Bonzi, Avid 0.15 EC" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <FL c="Category" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {INPUT_CATEGORIES.map(c => (
              <button key={c.id} onClick={() => upd("category", c.id)}
                style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${f.category === c.id ? c.color : "#c8d8c0"}`, background: f.category === c.id ? c.bg : "#fff", color: f.category === c.id ? c.color : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <FL c="Active Ingredient" />
            <input style={IS(focus === "ai")} value={f.activeIngredient} onChange={e => upd("activeIngredient", e.target.value)}
              onFocus={() => setFocus("ai")} onBlur={() => setFocus(null)} placeholder="e.g. paclobutrazol" />
          </div>
          <div>
            <FL c="Formulation" />
            <input style={IS(focus === "form")} value={f.formulation} onChange={e => upd("formulation", e.target.value)}
              onFocus={() => setFocus("form")} onBlur={() => setFocus(null)} placeholder="e.g. 0.4% SC, 50WP" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <FL c="App Rate" />
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...IS(focus === "rate"), flex: 1 }} value={f.appRate} onChange={e => upd("appRate", e.target.value)}
                onFocus={() => setFocus("rate")} onBlur={() => setFocus(null)} placeholder="e.g. 1" />
              <select value={f.appRateUnit} onChange={e => upd("appRateUnit", e.target.value)}
                style={{ padding: "9px 6px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 12, color: "#1a2a1a", fontFamily: "inherit", background: "#fff" }}>
                {RATE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FL c="REI (hrs)" />
            <input style={IS(focus === "rei")} value={f.rei} onChange={e => upd("rei", e.target.value)}
              onFocus={() => setFocus("rei")} onBlur={() => setFocus(null)} placeholder="e.g. 12" />
          </div>
          <div>
            <FL c="Signal Word" />
            <select value={f.signalWord} onChange={e => upd("signalWord", e.target.value)}
              style={{ ...IS(false), padding: "9px 12px" }}>
              {SIGNAL_WORDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <FL c="Supplier" />
            <input style={IS(focus === "supplier")} value={f.supplier} onChange={e => upd("supplier", e.target.value)}
              onFocus={() => setFocus("supplier")} onBlur={() => setFocus(null)} placeholder="e.g. Helena, Wilbur-Ellis" />
          </div>
          <div>
            <FL c="Unit Size" />
            <div style={{ display: "flex", gap: 6 }}>
              <input style={{ ...IS(focus === "unitSize"), flex: 1 }} value={f.unitSize} onChange={e => upd("unitSize", e.target.value)}
                onFocus={() => setFocus("unitSize")} onBlur={() => setFocus(null)} placeholder="e.g. 1" />
              <select value={f.unitSizeUnit} onChange={e => upd("unitSizeUnit", e.target.value)}
                style={{ padding: "9px 6px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 12, color: "#1a2a1a", fontFamily: "inherit", background: "#fff" }}>
                {INPUT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <FL c="Cost per Unit ($)" />
          <input type="number" step="0.01" style={IS(focus === "cost")} value={f.costPerUnit} onChange={e => upd("costPerUnit", e.target.value)}
            onFocus={() => setFocus("cost")} onBlur={() => setFocus(null)} placeholder="e.g. 84.50" />
        </div>
      </>)}

      {section === "inventory" && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <FL c="Current Stock" />
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.1" style={{ ...IS(focus === "stockQty"), flex: 1 }} value={f.stockQty} onChange={e => upd("stockQty", e.target.value)}
                onFocus={() => setFocus("stockQty")} onBlur={() => setFocus(null)} placeholder="0" />
              <select value={f.stockUnit} onChange={e => upd("stockUnit", e.target.value)}
                style={{ padding: "9px 6px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 12, color: "#1a2a1a", fontFamily: "inherit", background: "#fff" }}>
                {INPUT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <FL c="Reorder When Below" />
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.1" style={{ ...IS(focus === "reorderAt"), flex: 1 }} value={f.reorderAt} onChange={e => upd("reorderAt", e.target.value)}
                onFocus={() => setFocus("reorderAt")} onBlur={() => setFocus(null)} placeholder="e.g. 8" />
              <div style={{ padding: "9px 10px", borderRadius: 8, border: "1.5px solid #e0ead8", background: "#f2f5ef", fontSize: 12, color: "#7a8c74", flexShrink: 0 }}>{f.stockUnit}</div>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <FL c="Preferred Order Quantity" />
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" step="1" style={{ ...IS(focus === "orderQty"), flex: 1 }} value={f.preferredOrderQty} onChange={e => upd("preferredOrderQty", e.target.value)}
              onFocus={() => setFocus("orderQty")} onBlur={() => setFocus(null)} placeholder="e.g. 4 units at a time" />
            <div style={{ padding: "9px 10px", borderRadius: 8, border: "1.5px solid #e0ead8", background: "#f2f5ef", fontSize: 12, color: "#7a8c74", flexShrink: 0 }}>units</div>
          </div>
        </div>
        {f.stockQty && f.reorderAt && (
          <div style={{ background: STOCK_META[STOCK_STATUS(f)].bg, border: `1.5px solid ${STOCK_META[STOCK_STATUS(f)].color}40`, borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: STOCK_META[STOCK_STATUS(f)].color }}>{STOCK_META[STOCK_STATUS(f)].label}</div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{f.stockQty} {f.stockUnit} on hand · reorder at {f.reorderAt} {f.stockUnit}</div>
          </div>
        )}
      </>)}

      {section === "ordering" && (<>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <FL c="Last Order Date" />
            <input type="date" style={IS(focus === "lastDate")} value={f.lastOrderDate} onChange={e => upd("lastOrderDate", e.target.value)}
              onFocus={() => setFocus("lastDate")} onBlur={() => setFocus(null)} />
          </div>
          <div>
            <FL c="Last Order Price ($/unit)" />
            <input type="number" step="0.01" style={IS(focus === "lastPrice")} value={f.lastOrderPrice} onChange={e => upd("lastOrderPrice", e.target.value)}
              onFocus={() => setFocus("lastPrice")} onBlur={() => setFocus(null)} placeholder="e.g. 82.00" />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <FL c="Bulk Pricing Notes" />
          <textarea style={{ ...IS(focus === "bulkNote"), minHeight: 70, resize: "vertical" }} value={f.bulkPriceNote} onChange={e => upd("bulkPriceNote", e.target.value)}
            onFocus={() => setFocus("bulkNote")} onBlur={() => setFocus(null)} placeholder="e.g. Buy 4+ units: $78/unit. Pre-season order by Jan 15 for 10% discount." />
        </div>
      </>)}

      {section === "notes" && (<>
        <div style={{ marginBottom: 14 }}>
          <FL c="Crop Sensitivities" />
          <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 6 }}>Crops that have shown phytotoxicity or adverse reactions to this product</div>
          <textarea style={{ ...IS(focus === "cropSens"), minHeight: 70, resize: "vertical" }} value={f.cropSensitivities} onChange={e => upd("cropSensitivities", e.target.value)}
            onFocus={() => setFocus("cropSens")} onBlur={() => setFocus(null)} placeholder="e.g. Impatiens — tip burn at label rate. Petunias — leaf curl above 2 oz/100 gal. New Guinea Impatiens — avoid entirely." />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FL c="Cross Benefits / Secondary Activity" />
          <textarea style={{ ...IS(focus === "cross"), minHeight: 70, resize: "vertical" }} value={f.crossBenefits} onChange={e => upd("crossBenefits", e.target.value)}
            onFocus={() => setFocus("cross")} onBlur={() => setFocus(null)} placeholder="e.g. Also suppresses fungus gnats at label rate. Some mite suppression noted." />
        </div>
        <div style={{ marginBottom: 14 }}>
          <FL c="Tank Mix Notes" />
          <textarea style={{ ...IS(focus === "tank"), minHeight: 70, resize: "vertical" }} value={f.tankMixNotes} onChange={e => upd("tankMixNotes", e.target.value)}
            onFocus={() => setFocus("tank")} onBlur={() => setFocus(null)} placeholder="e.g. Compatible with most fungicides. Do not mix with alkaline products. pH 5.5–6.5." />
        </div>
        <div>
          <FL c="General Notes" />
          <textarea style={{ ...IS(focus === "notes"), minHeight: 70, resize: "vertical" }} value={f.notes} onChange={e => upd("notes", e.target.value)}
            onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)} placeholder="Timing, resistance notes..." />
        </div>
      </>)}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={() => f.name && onSave({ ...f, id: f.id || uid() })}
          style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: f.name ? "#7fb069" : "#c8d8c0", color: "#fff", fontWeight: 800, fontSize: 14, cursor: f.name ? "pointer" : "default", fontFamily: "inherit" }}>
          {initial ? "Save Changes" : "Add Product"}
        </button>
      </div>
    </div>
  );
}

function InputCard({ product, onEdit, onDelete, onUpdateStock }) {
  const cat    = INPUT_CATEGORIES.find(c => c.id === product.category) || INPUT_CATEGORIES[4];
  const status = STOCK_STATUS(product);
  const sm     = STOCK_META[status];
  const [adjusting, setAdjusting] = useState(false);
  const [adjQty, setAdjQty] = useState("");

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${status === "low" ? "#f0c070" : status === "out" ? "#f0a0a0" : "#e0ead8"}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ background: cat.bg, color: cat.color, border: `1px solid ${cat.color}30`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{cat.icon} {cat.label}</span>
            {product.stockQty !== "" && <span style={{ background: sm.bg, color: sm.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{sm.label}</span>}
            {product.signalWord && <span style={{ background: product.signalWord === "Danger" ? "#fff0f0" : product.signalWord === "Warning" ? "#fff8e8" : "#f8f8f8", color: product.signalWord === "Danger" ? "#c03030" : product.signalWord === "Warning" ? "#c8791a" : "#7a8c74", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700, border: "1px solid currentColor", opacity: .7 }}>{product.signalWord}</span>}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1a2a1a" }}>{product.name}</div>
          {product.activeIngredient && <div style={{ fontSize: 12, color: "#7a8c74" }}>{product.activeIngredient}{product.formulation ? ` · ${product.formulation}` : ""}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <button onClick={onEdit}   style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
          <button onClick={onDelete} style={{ background: "none", border: "1px solid #f0c0c0", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#c03030", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {product.stockQty !== "" && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: status === "out" ? "#c03030" : "#1a2a1a" }}>{product.stockQty} {product.stockUnit}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>On Hand</div></div>}
        {product.appRate && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: "#1a2a1a" }}>{product.appRate} {product.appRateUnit}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>App Rate</div></div>}
        {product.rei && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a1a" }}>{product.rei}hr</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>REI</div></div>}
        {product.costPerUnit && <div style={{ background: "#f2f5ef", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#1a2a1a" }}>${Number(product.costPerUnit).toFixed(2)}</div><div style={{ fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>Per Unit</div></div>}
      </div>

      {product.cropSensitivities && <div style={{ fontSize: 12, color: "#c03030", background: "#fff0f0", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>⚠️ <strong>Sensitive crops:</strong> {product.cropSensitivities}</div>}
      {product.crossBenefits && <div style={{ fontSize: 12, color: "#4a5a40", background: "#f0f8eb", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>✓ {product.crossBenefits}</div>}
      {product.bulkPriceNote && <div style={{ fontSize: 12, color: "#2e7d9e", background: "#e8f4f8", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>💰 {product.bulkPriceNote}</div>}

      {/* Quick stock adjust */}
      {product.stockQty !== "" && (
        adjusting ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input type="number" step="0.1" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="New qty"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #7fb069", fontSize: 14, fontFamily: "inherit" }} />
            <span style={{ fontSize: 12, color: "#7a8c74" }}>{product.stockUnit}</span>
            <button onClick={() => { onUpdateStock(product.id, adjQty); setAdjusting(false); setAdjQty(""); }}
              style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
            <button onClick={() => setAdjusting(false)}
              style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
          </div>
        ) : (
          <button onClick={() => { setAdjusting(true); setAdjQty(product.stockQty); }}
            style={{ marginTop: 8, background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
            Update Stock
          </button>
        )
      )}
    </div>
  );
}

function InputsLibrary() {
  const { rows: inputs, upsert: upsertInput, remove: removeInputDb } = useInputProducts();
  const [view, setView]        = useState("list");
  const [editingId, setEditId] = useState(null);
  const [catFilter, setCat]    = useState("all");
  const [statusFilter, setStat] = useState("all");
  const [search, setSearch]    = useState("");

  const INPUT_FIELDS = [
    { id: "name",            label: "Product Name *",    required: true,  guesses: ["name","product","chemical","input"] },
    { id: "category",        label: "Category",          required: false, guesses: ["category","type","class"] },
    { id: "activeIngredient",label: "Active Ingredient", required: false, guesses: ["active","ingredient","ai"] },
    { id: "signalWord",      label: "Signal Word",       required: false, guesses: ["signal","word","caution","warning"] },
    { id: "appRate",         label: "App Rate",          required: false, guesses: ["rate","dose","application rate"] },
    { id: "appRateUnit",     label: "App Rate Unit",     required: false, guesses: ["rate unit","uom","per"] },
    { id: "rei",             label: "REI",               required: false, guesses: ["rei","reentry","restricted"] },
    { id: "supplier",        label: "Supplier",          required: false, guesses: ["supplier","vendor","source"] },
    { id: "costPerUnit",     label: "Cost/Unit ($)",     required: false, guesses: ["cost","price"] },
    { id: "notes",           label: "Notes",             required: false, guesses: ["note","comment"] },
  ];
  async function bulkImportInputs(rows) {
    const NUMERIC = ["costPerUnit","stockQty","reorderAt","preferredOrderQty","lastOrderPrice"];
    let errors = 0;
    for (const r of rows) {
      const row = { ...r, category: r.category || "other", signalWord: r.signalWord || "Caution" };
      const clean = Object.fromEntries(
        Object.entries(row).map(([k,v]) => [k, NUMERIC.includes(k) ? (v===""||v==null?null:Number(v)) : v])
      );
      clean.id = crypto.randomUUID();
      try { await upsertInput(clean); }
      catch(e) { errors++; console.error("Row failed:", clean.name, e.message); }
    }
    if (errors > 0) alert("Import complete with " + errors + " error(s).");
  }

  const save = async (input) => {
    const DB_FIELDS = ["id","name","category","activeIngredient","signalWord","formulation",
      "appRate","appRateUnit","rei","supplier","unitSize","unitSizeUnit","costPerUnit",
      "stockQty","stockUnit","reorderAt","preferredOrderQty","lastOrderDate","lastOrderPrice",
      "bulkPriceNote","crossBenefits","tankMixNotes","cropSensitivities","notes"];
    const NUMERIC = ["costPerUnit","stockQty","reorderAt","preferredOrderQty","lastOrderPrice"];
    const DATE_FIELDS = ["lastOrderDate"];
    const clean = Object.fromEntries(
      Object.entries(input)
        .filter(([k]) => DB_FIELDS.includes(k))
        .map(([k,v]) => {
          if (NUMERIC.includes(k))    return [k, v===""||v==null ? null : Number(v)];
          if (DATE_FIELDS.includes(k)) return [k, v===""||v==null ? null : v];
          return [k, v];
        })
    );
    if (!clean.id || !clean.id.includes("-")) clean.id = crypto.randomUUID();
    try { await upsertInput(clean); setView("list"); setEditId(null); }
    catch(e) { alert("Save failed: " + e.message); }
  };

  const updateStock = async (id, qty) => await upsertInput({ id, stockQty: qty });

  const needsReorder = inputs.filter(i => ["low","out"].includes(STOCK_STATUS(i)));

  const filtered = inputs.filter(i => {
    const matchCat    = catFilter === "all" || i.category === catFilter;
    const matchStatus = statusFilter === "all" || STOCK_STATUS(i) === statusFilter;
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.activeIngredient?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchStatus && matchSearch;
  });

  if (view === "import") return <BulkImporter title="Import Inputs" templateFilename="inputs-template.csv" templateHeaders={["Product Name","Category","Active Ingredient","Signal Word","App Rate","App Rate Unit","REI","Supplier","Cost Per Unit","Notes"]} templateSample={["Bonzi","pgr","Paclobutrazol","Caution","1-4 oz","oz/100 gal","12 hrs","Fine Americas","125.00",""]} fieldMap={INPUT_FIELDS} onImport={bulkImportInputs} onCancel={() => setView("list")} />;
  if (view === "add")  return <InputForm onSave={save} onCancel={() => setView("list")} />;
  if (view === "edit" && editingId) return <InputForm initial={inputs.find(i => i.id === editingId)} onSave={save} onCancel={() => { setView("list"); setEditId(null); }} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>Inputs Inventory</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView("import")} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#7a8c74" }}>📥 Import</button>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add Product</button>
        </div>
      </div>

      {/* Reorder alert */}
      {needsReorder.length > 0 && (
        <div style={{ background: "#fff4e8", border: "1.5px solid #f0c070", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#7a5010" }}>⚠️ {needsReorder.length} product{needsReorder.length !== 1 ? "s" : ""} need reordering: {needsReorder.map(i => i.name).join(", ")}</span>
          <button onClick={() => setStat("low")} style={{ background: "#e0a820", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 13, color: "#1a2a1a", fontFamily: "inherit", minWidth: 180 }} />
        <button onClick={() => setStat("all")} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === "all" ? "#7fb069" : "#c8d8c0"}`, background: statusFilter === "all" ? "#7fb069" : "#fff", color: statusFilter === "all" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>All</button>
        {["low","out"].map(s => (
          <button key={s} onClick={() => setStat(s)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${statusFilter === s ? STOCK_META[s].color : "#c8d8c0"}`, background: statusFilter === s ? STOCK_META[s].bg : "#fff", color: statusFilter === s ? STOCK_META[s].color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{STOCK_META[s].label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setCat("all")} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${catFilter === "all" ? "#7fb069" : "#c8d8c0"}`, background: catFilter === "all" ? "#7fb069" : "#fff", color: catFilter === "all" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>All ({inputs.length})</button>
        {INPUT_CATEGORIES.map(c => {
          const count = inputs.filter(i => i.category === c.id).length;
          if (!count) return null;
          return <button key={c.id} onClick={() => setCat(c.id)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${catFilter === c.id ? c.color : "#c8d8c0"}`, background: catFilter === c.id ? c.bg : "#fff", color: catFilter === c.id ? c.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{c.icon} {c.label} ({count})</button>;
        })}
      </div>

      {inputs.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 8 }}>No inputs yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 360, margin: "0 auto 24px" }}>Add your PGRs, insecticides, fungicides and other crop protection products. Track stock levels, reorder thresholds, and bulk pricing notes.</div>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add First Product</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.length === 0
            ? <div style={{ textAlign: "center", padding: "40px", fontSize: 13, color: "#7a8c74" }}>No products match your filters</div>
            : filtered.map(product => (
                <InputCard key={product.id} product={product}
                  onEdit={() => { setEditId(product.id); setView("edit"); }}
                  onDelete={() => removeInputDb(product.id)}
                  onUpdateStock={updateStock} />
              ))
          }
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAGS LIBRARY
// ═══════════════════════════════════════════════════════

const TAG_TYPES = [
  { id: "potstake",  label: "Pot Stake",     icon: "📌", color: "#7fb069" },
  { id: "hangtag",   label: "Hang Tag",      icon: "🏷️", color: "#4a90d9" },
  { id: "banded",    label: "Banded Label",  icon: "🔖", color: "#8e44ad" },
  { id: "sticker",   label: "Sticker",       icon: "⭐", color: "#e07b39" },
  { id: "other",     label: "Other",         icon: "🗒️", color: "#7a8c74" },
];
const TAG_TIERS = [
  { id: "standard", label: "Standard",        color: "#7a8c74", bg: "#f0f5ee" },
  { id: "retail",   label: "Retail / Premium", color: "#c8791a", bg: "#fff4e8" },
];

function TagForm({ initial, onSave, onCancel }) {
  const blank = {
    id: null, name: "", tier: "standard", type: "potstake",
    widthIn: "", heightIn: "", supplier: "", sku: "",
    costPerUnit: "", unitsPerCase: "", printSpec: "", notes: "",
  };
  const [form, setForm] = useState(initial ? { ...blank, ...initial } : blank);
  const [focus, setFocus] = useState(null);
  const upd = (f, v) => setForm(x => ({ ...x, [f]: v }));
  const tt = TAG_TIERS.find(t => t.id === form.tier) || TAG_TIERS[0];
  const tp = TAG_TYPES.find(t => t.id === form.type) || TAG_TYPES[0];

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ background: "#1e2d1a", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 17, color: "#c8e6b8" }}>{initial ? "Edit Tag" : "New Tag"}</div>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer" }}>×</button>}
      </div>
      <div style={{ padding: "22px 24px" }}>

        {/* Tier */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {TAG_TIERS.map(t => (
            <button key={t.id} onClick={() => upd("tier", t.id)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${form.tier === t.id ? t.color : "#c8d8c0"}`, background: form.tier === t.id ? t.bg : "#fff", color: form.tier === t.id ? t.color : "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Type */}
        <div style={{ marginBottom: 18 }}>
          <FL c="Tag Type" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TAG_TYPES.map(t => (
              <button key={t.id} onClick={() => upd("type", t.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${form.type === t.id ? t.color : "#c8d8c0"}`, background: form.type === t.id ? t.color + "14" : "#fff", color: form.type === t.id ? t.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ gridColumn: "span 2" }}>
            <FL c="Tag Name *" />
            <input style={IS(focus === "name")} value={form.name} onChange={e => upd("name", e.target.value)} onFocus={() => setFocus("name")} onBlur={() => setFocus(null)} placeholder='e.g. 4.5" Standard Stake, HB Premium Hang Tag' />
          </div>
          <div>
            <FL c='Width (")' />
            <input type="number" step="0.25" style={IS(focus === "tw")} value={form.widthIn} onChange={e => upd("widthIn", e.target.value)} onFocus={() => setFocus("tw")} onBlur={() => setFocus(null)} placeholder='e.g. 2.5' />
          </div>
          <div>
            <FL c='Height (")' />
            <input type="number" step="0.25" style={IS(focus === "th")} value={form.heightIn} onChange={e => upd("heightIn", e.target.value)} onFocus={() => setFocus("th")} onBlur={() => setFocus(null)} placeholder='e.g. 4' />
          </div>
          <div><FL c="Supplier" /><input style={IS(focus === "tsup")} value={form.supplier} onChange={e => upd("supplier", e.target.value)} onFocus={() => setFocus("tsup")} onBlur={() => setFocus(null)} placeholder="e.g. Landmark, Berg's" /></div>
          <div><FL c="SKU / Item #" /><input style={IS(focus === "tsku")} value={form.sku} onChange={e => upd("sku", e.target.value)} onFocus={() => setFocus("tsku")} onBlur={() => setFocus(null)} placeholder="e.g. TAG-450-STD" /></div>
          <div>
            <FL c="Cost per Unit ($)" />
            <input type="number" step="0.001" style={IS(focus === "tcpu")} value={form.costPerUnit} onChange={e => upd("costPerUnit", e.target.value)} onFocus={() => setFocus("tcpu")} onBlur={() => setFocus(null)} placeholder="e.g. 0.04" />
          </div>
          <div>
            <FL c="Units per Case" />
            <input type="number" style={IS(focus === "tupc")} value={form.unitsPerCase} onChange={e => upd("unitsPerCase", e.target.value)} onFocus={() => setFocus("tupc")} onBlur={() => setFocus(null)} placeholder="e.g. 1000, 500" />
            {form.costPerUnit && form.unitsPerCase && (
              <div style={{ fontSize: 11, color: "#7fb069", marginTop: 4, fontWeight: 600 }}>
                ${(Number(form.costPerUnit) * Number(form.unitsPerCase)).toFixed(2)} / case
              </div>
            )}
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <FL c="Print Spec / Design File" />
            <input style={IS(focus === "tprint")} value={form.printSpec} onChange={e => upd("printSpec", e.target.value)} onFocus={() => setFocus("tprint")} onBlur={() => setFocus(null)} placeholder="e.g. HB-Annual-2026-v2.pdf, Pantone 376C" />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <FL c="Notes" />
            <textarea style={TA(focus === "tnotes")} value={form.notes} onChange={e => upd("notes", e.target.value)} onFocus={() => setFocus("tnotes")} onBlur={() => setFocus(null)} placeholder="Which containers or product lines use this tag, seasonal notes..." />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={() => form.name.trim() && onSave({ ...form, id: form.id || uid() })}
            style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 12, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            {initial ? "Save Changes" : "Add Tag"}
          </button>
          {onCancel && <button onClick={onCancel} style={{ background: "none", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "12px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

function TagCard({ tag, onEdit, onDelete }) {
  const tp = TAG_TYPES.find(t => t.id === tag.type) || TAG_TYPES[0];
  const tt = TAG_TIERS.find(t => t.id === tag.tier) || TAG_TIERS[0];
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${tt.color}33`, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: tp.color + "18", border: `1.5px solid ${tp.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tp.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>{tag.name}</span>
            <span style={{ background: tt.bg, color: tt.color, border: `1px solid ${tt.color}44`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{tt.label}</span>
            <span style={{ background: tp.color + "14", color: tp.color, border: `1px solid ${tp.color}33`, borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 700 }}>{tp.label}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tag.widthIn && tag.heightIn && <Pill label="Size" value={`${tag.widthIn}" × ${tag.heightIn}"`} color={tp.color} />}
            {tag.costPerUnit && <Pill label="$/tag" value={`$${Number(tag.costPerUnit).toFixed(3)}`} color="#8e44ad" />}
            {tag.unitsPerCase && <Pill label="/ Case" value={Number(tag.unitsPerCase).toLocaleString()} color="#7a8c74" />}
            {tag.costPerUnit && tag.unitsPerCase && <Pill label="$/case" value={`$${(Number(tag.costPerUnit) * Number(tag.unitsPerCase)).toFixed(2)}`} color="#4a7a35" />}
            {tag.supplier && <Pill label="Supplier" value={tag.supplier} color="#4a90d9" />}
            {tag.sku && <Pill label="SKU" value={tag.sku} color="#7a8c74" />}
          </div>
          {tag.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 8, fontStyle: "italic" }}>{tag.notes}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
          <ABtn onClick={() => onEdit(tag)} label="Edit" color="#4a90d9" />
          <ABtn onClick={() => onDelete(tag.id)} label="Remove" border="#f0d0c0" />
        </div>
      </div>
    </div>
  );
}

function TagsLibrary() {
  const { rows: tags, insert: insertTag, update: updateTag, remove: removeTag } = useComboTags();
  const [view, setView] = useState("list");
  const [editId, setEditId] = useState(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const TAG_FIELDS = [
    { id: "name",        label: "Tag Name *",    required: true,  guesses: ["name","tag","label","description"] },
    { id: "tier",        label: "Tier",          required: false, guesses: ["tier","level","grade","quality"] },
    { id: "type",        label: "Type",          required: false, guesses: ["type","style","format"] },
    { id: "widthIn",     label: "Width (in)",    required: false, guesses: ["width","wide","w"] },
    { id: "heightIn",    label: "Height (in)",   required: false, guesses: ["height","tall","h","length"] },
    { id: "supplier",    label: "Supplier",      required: false, guesses: ["supplier","vendor","source"] },
    { id: "sku",         label: "SKU",           required: false, guesses: ["sku","item","part","number"] },
    { id: "costPerUnit", label: "Cost/Unit ($)", required: false, guesses: ["cost","price"] },
    { id: "unitsPerCase",label: "Units/Case",    required: false, guesses: ["case","units per","qty"] },
    { id: "notes",       label: "Notes",         required: false, guesses: ["note","comment"] },
  ];
  async function bulkImportTags(rows) {
    for (const r of rows) {
      await insertTag({ ...r, id: crypto.randomUUID(), tier: r.tier || "standard", type: r.type || "potstake" });
    }
  }

  const save = async (t) => {
    if (editId) { await updateTag(editId, t); }
    else { await insertTag({ ...t, id: t.id || crypto.randomUUID() }); }
    setView("list"); setEditId(null);
  };
  const del = async (id) => {
    if (!window.confirm("Remove this tag?")) return;
    await removeTag(id);
  };

  const filtered = tags.filter(t =>
    (tierFilter === "all" || t.tier === tierFilter) &&
    (typeFilter === "all" || t.type === typeFilter)
  );

  if (view === "import") return <BulkImporter title="Import Tags" templateFilename="tags-template.csv" templateHeaders={["Tag Name","Tier","Type","Width (in)","Height (in)","Supplier","SKU","Cost Per Unit","Units Per Case","Notes"]} templateSample={["6in Annual Standard","standard","potstake","0.75","4","Landmark","TAG-6-STD","0.08","1000",""]} fieldMap={TAG_FIELDS} onImport={bulkImportTags} onCancel={() => setView("list")} />;
  if (view === "add") return <TagForm onSave={save} onCancel={() => setView("list")} />;
  if (view === "edit") {
    const tag = tags.find(t => t.id === editId);
    return tag ? <TagForm initial={tag} onSave={save} onCancel={() => { setView("list"); setEditId(null); }} /> : null;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>Tags & Labels</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setView("import")} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#7a8c74" }}>📥 Import</button>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add Tag</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {[["all", "All Tiers"], ...TAG_TIERS.map(t => [t.id, t.label])].map(([id, label]) => (
          <button key={id} onClick={() => setTierFilter(id)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${tierFilter === id ? "#7fb069" : "#c8d8c0"}`, background: tierFilter === id ? "#7fb069" : "#fff", color: tierFilter === id ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "All Types", "#7a8c74"], ...TAG_TYPES.map(t => [t.id, t.label, t.color])].map(([id, label, color]) => (
          <button key={id} onClick={() => setTypeFilter(id)}
            style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${typeFilter === id ? color : "#c8d8c0"}`, background: typeFilter === id ? color + "14" : "#fff", color: typeFilter === id ? color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#fafcf8", borderRadius: 16, border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏷️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4a5a40", marginBottom: 8 }}>No tags yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Add your standard and retail tags — pot stakes, hang tags, banded labels, stickers</div>
          <button onClick={() => setView("add")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>+ Add First Tag</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(tag => (
            <TagCard key={tag.id} tag={tag}
              onEdit={() => { setEditId(tag.id); setView("edit"); }}
              onDelete={del} />
          ))}
        </div>
      )}
    </div>
  );
}
