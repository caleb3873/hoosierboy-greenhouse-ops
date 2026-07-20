// WorkRecords — the compliance side of the Work Hub.
//   📒 Records  — running application/fertigation log, filterable, XLSX export
//                 formatted for Indiana State Chemist record-keeping
//   🧪 Products — chem_products library (EPA #, AI, REI, default rates)
//   🔬 Purdue   — fill the official PPDL-006-004 sample submission PDF; the
//                 "chemicals applied" field auto-fills from the records log
import { useMemo, useState } from "react";
import { useSprayRecords, useChemProducts, useSampleSubmissions } from "./supabase";
import { useAuth } from "./Auth";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const GREEN_DARK = "#1e2d1a";
const GREEN = "#7fb069";
const MUTED = "#7a8c74";
const RED = "#d94f3d";
const AMBER = "#e89a3a";

function ensureXLSX() {
  return new Promise((resolve) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    document.head.appendChild(script);
  });
}

function fmtDT(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
const isoDay = (d) => d.toISOString().slice(0, 10);

// Submitter defaults for the PPDL form — editable in the UI, remembered per device.
const DEFAULT_SUBMITTER = {
  name: "", business: "Schlegel Greenhouse (Hoosier Boy Plants)",
  address: "4425 Bluff Rd", city: "Indianapolis", state: "IN", zip: "46217",
  county: "Marion", phone: "", email: "caleb@schlegelgreenhouse.com",
};

const input = {
  width: "100%", padding: 10, borderRadius: 8, border: "1.5px solid #c8d8c0",
  fontSize: 13.5, fontFamily: FONT, boxSizing: "border-box", outline: "none", background: "#fff",
};
const label = { fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, display: "block", margin: "10px 0 4px" };
const btn = (bg = GREEN_DARK, color = "#c8e6b8") => ({
  padding: "10px 18px", borderRadius: 9, border: "none", background: bg, color,
  fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
});

export default function WorkRecords({ embedded, initialTab }) {
  const [tab, setTab] = useState(initialTab || "records");
  return (
    <div style={{ fontFamily: FONT, ...(embedded ? {} : { maxWidth: 980, margin: "0 auto" }) }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: GREEN_DARK, fontSize: 26, margin: "0 0 4px" }}>Work Records</h2>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
        Applications & fertigations log themselves here when their tasks are completed. Export for the state chemist any time.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {[["records", "📒 Records"], ["products", "🧪 Product Library"], ["purdue", "🔬 Purdue Samples"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: "9px 18px", borderRadius: 9, border: `1.5px solid ${tab === id ? GREEN : "#c8d8c0"}`,
            background: tab === id ? GREEN : "#fff", color: tab === id ? "#fff" : MUTED,
            fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT,
          }}>{l}</button>
        ))}
      </div>
      {tab === "records" && <RecordsTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "purdue" && <PurdueTab />}
    </div>
  );
}

// ── 📒 Records ────────────────────────────────────────────────────────────────
function RecordsTab() {
  const { rows } = useSprayRecords();
  const [from, setFrom] = useState(() => isoDay(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (rows || [])
      .filter(r => {
        const d = (r.appliedAt || "").slice(0, 10);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (cat !== "all" && (r.category || "application") !== cat) return false;
        if (ql) {
          const hay = `${r.productName} ${r.epaRegNumber} ${r.houses} ${r.houseName} ${r.crop} ${r.growerName} ${r.targetPest}`.toLowerCase();
          if (!hay.includes(ql)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));
  }, [rows, from, to, cat, q]);

  async function exportXLSX() {
    const XLSX = await ensureXLSX();
    const header = [
      "Date Applied", "Time", "Applicator", "Category", "Product Name", "EPA Reg. No.",
      "Active Ingredient", "Method", "Rate", "Total Volume", "Site / Houses", "Crop",
      "Target Pest", "REI (hrs)", "REI Expired", "Wind", "Temp", "PPE Worn", "Notes",
    ];
    const data = filtered.map(r => {
      const d = r.appliedAt ? new Date(r.appliedAt) : null;
      return [
        d ? d.toLocaleDateString("en-US") : "", d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "",
        r.growerName || "", r.category || "application", r.productName || "", r.epaRegNumber || "",
        r.activeIngredient || "", r.applicationMethod || "", r.rate || "", r.totalVolume || "",
        r.houses || r.houseName || "", r.crop || "", r.targetPest || "",
        r.reiHours ?? "", r.reiExpiresAt ? fmtDT(r.reiExpiresAt) : "", r.windSpeed || "", r.temperature || "",
        r.ppeWorn || "", r.notes || "",
      ];
    });
    const ws = XLSX.utils.aoa_to_sheet([
      [`Schlegel Greenhouse — Pesticide & Fertigation Application Records`],
      [`Period: ${from} to ${to} · Exported ${new Date().toLocaleDateString("en-US")} · ${filtered.length} records`],
      [],
      header,
      ...data,
    ]);
    ws["!cols"] = header.map((h, i) => ({ wch: i === header.length - 1 ? 40 : Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Applications");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Application_Records_${from}_to_${to}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  const now = new Date();
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div><span style={label}>From</span><input type="date" style={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><span style={label}>To</span><input type="date" style={input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <div>
          <span style={label}>Category</span>
          <select style={input} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="all">All</option>
            <option value="application">Applications</option>
            <option value="fertigation">Fertigations</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <span style={label}>Search</span>
          <input style={input} placeholder="product, house, crop, applicator…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={exportXLSX} disabled={!filtered.length} style={{ ...btn(), opacity: filtered.length ? 1 : 0.5 }}>
          ⬇ Export Excel ({filtered.length})
        </button>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 50, color: MUTED, background: "#fff", borderRadius: 12, border: "1.5px solid #e0e8d8" }}>
          No records in this range yet. Complete an application or fertigation task and it lands here automatically.
        </div>
      )}

      {filtered.map(r => {
        const reiActive = r.reiExpiresAt && new Date(r.reiExpiresAt) > now;
        const fert = (r.category || "application") === "fertigation";
        return (
          <div key={r.id} style={{ background: "#fff", border: `1.5px solid ${reiActive ? RED : "#e0e8d8"}`, borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: GREEN_DARK }}>{fert ? "🧪" : "💧"} {r.productName}</span>
              {r.rate && <span style={{ fontSize: 12.5, color: MUTED }}>@ {r.rate}</span>}
              {r.epaRegNumber && <span style={{ fontSize: 11, background: "#f0f5ee", border: "1px solid #dce6d4", borderRadius: 6, padding: "2px 7px", color: MUTED, fontWeight: 700 }}>EPA {r.epaRegNumber}</span>}
              {reiActive && <span style={{ fontSize: 11, background: RED, color: "#fff", borderRadius: 999, padding: "2px 9px", fontWeight: 800 }}>⚠ REI until {fmtDT(r.reiExpiresAt)}</span>}
              {r.taskId && <span style={{ fontSize: 11, background: "#e6f0fa", color: "#2a6ab0", borderRadius: 999, padding: "2px 9px", fontWeight: 800 }}>from task</span>}
            </div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>
              {fmtDT(r.appliedAt)} · {r.growerName || "—"}
              {(r.houses || r.houseName) && <> · 📍 {r.houses || r.houseName}</>}
              {r.crop && <> · {r.crop}</>}
              {r.targetPest && <> · target: {r.targetPest}</>}
              {r.reiHours ? <> · REI {r.reiHours}h</> : null}
            </div>
            {r.notes && <div style={{ fontSize: 12, color: MUTED, marginTop: 4, fontStyle: "italic" }}>📝 {r.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── 🧪 Product Library ────────────────────────────────────────────────────────
function ProductsTab() {
  const { rows, insert, update } = useChemProducts();
  const [editing, setEditing] = useState(null); // row or "new"
  const sorted = useMemo(() => [...(rows || [])].sort((a, b) =>
    (a.productType || "").localeCompare(b.productType || "") || (a.name || "").localeCompare(b.name || "")), [rows]);

  return (
    <div>
      <button onClick={() => setEditing("new")} style={{ ...btn(), marginBottom: 14 }}>+ Add Product</button>
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: MUTED, background: "#fff", borderRadius: 12, border: "1.5px solid #e0e8d8" }}>
          The library is empty. Add the chemicals and fertilizers your crew uses — growers pick from this list, so EPA numbers and REIs are always right.
        </div>
      )}
      {sorted.map(p => (
        <div key={p.id} onClick={() => setEditing(p)} style={{
          background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: "11px 16px", marginBottom: 8,
          cursor: "pointer", opacity: p.active === false ? 0.5 : 1,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: GREEN_DARK }}>
              {p.productType === "fertigation" ? "🧪" : "💧"} {p.name}
            </span>
            <span style={{ fontSize: 11, background: "#f0f5ee", borderRadius: 6, padding: "2px 8px", color: MUTED, fontWeight: 700, textTransform: "capitalize" }}>{p.productType}</span>
            {p.moa && <span style={{ fontSize: 11, background: "#e6ecf7", borderRadius: 6, padding: "2px 8px", color: "#3a5a9a", fontWeight: 800 }}>{p.moa}</span>}
            {p.productType !== "fertigation" && p.reiHours == null && <span style={{ fontSize: 11, background: "#fde4e1", borderRadius: 6, padding: "2px 8px", color: RED, fontWeight: 800 }}>REI missing</span>}
            {p.signalWord && <span style={{ fontSize: 11, background: "#fdf0e0", borderRadius: 6, padding: "2px 8px", color: "#a86a10", fontWeight: 800, textTransform: "uppercase" }}>{p.signalWord}</span>}
            {p.active === false && <span style={{ fontSize: 11, background: "#eee", borderRadius: 6, padding: "2px 8px", color: "#888", fontWeight: 700 }}>inactive</span>}
          </div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
            {p.epaRegNumber ? `EPA ${p.epaRegNumber}` : "no EPA #"}
            {p.activeIngredient && ` · ${p.activeIngredient}`}
            {p.defaultRate && ` · ${p.defaultRate}`}
            {p.reiHours != null && ` · REI ${p.reiHours}h`}
          </div>
        </div>
      ))}
      {editing && (
        <ProductEditModal
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (row) => {
            if (editing === "new") await insert({ id: crypto.randomUUID(), ...row });
            else await update(editing.id, row);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProductEditModal({ product, onClose, onSave }) {
  const [f, setF] = useState(() => ({
    name: product?.name || "",
    productType: product?.productType || "spray",
    epaRegNumber: product?.epaRegNumber || "",
    activeIngredient: product?.activeIngredient || "",
    defaultRate: product?.defaultRate || "",
    reiHours: product?.reiHours ?? "",
    signalWord: product?.signalWord || "",
    moa: product?.moa || "",
    notes: product?.notes || "",
    active: product?.active !== false,
  }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: GREEN_DARK, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 10 }}>
          {product ? "Edit Product" : "New Product"}
        </div>
        <span style={label}>Name</span>
        <input style={input} value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Avid 0.15EC" />
        <span style={label}>Type</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["spray", "drench", "fertigation"].map(t => (
            <button key={t} onClick={() => set("productType", t)} style={{
              padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${f.productType === t ? GREEN : "#c8d8c0"}`,
              background: f.productType === t ? GREEN : "#fff", color: f.productType === t ? "#fff" : MUTED,
              fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: FONT, textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
        {f.productType !== "fertigation" && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><span style={label}>EPA Reg. #</span><input style={input} value={f.epaRegNumber} onChange={e => set("epaRegNumber", e.target.value)} /></div>
              <div style={{ flex: 1 }}><span style={label}>REI hours</span><input style={input} inputMode="numeric" value={f.reiHours} onChange={e => set("reiHours", e.target.value)} /></div>
            </div>
            <span style={label}>Active ingredient</span>
            <input style={input} value={f.activeIngredient} onChange={e => set("activeIngredient", e.target.value)} />
            <span style={label}>Signal word</span>
            <input style={input} value={f.signalWord} onChange={e => set("signalWord", e.target.value)} placeholder="Caution / Warning / Danger" />
            <span style={label}>MOA group (IRAC / FRAC)</span>
            <input style={input} value={f.moa} onChange={e => set("moa", e.target.value)} placeholder="e.g. IRAC 4A, FRAC 11, PGR, Biological" />
          </>
        )}
        <span style={label}>Default rate</span>
        <input style={input} value={f.defaultRate} onChange={e => set("defaultRate", e.target.value)} placeholder={f.productType === "fertigation" ? "e.g. 200 ppm" : "e.g. 8 oz/100 gal"} />
        <span style={label}>Notes</span>
        <textarea style={{ ...input, minHeight: 50, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, fontWeight: 700, color: GREEN_DARK, cursor: "pointer" }}>
          <input type="checkbox" checked={f.active} onChange={e => set("active", e.target.checked)} /> Active (shown to growers)
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btn("#fff", MUTED), border: "1.5px solid #c8d8c0", flex: 1 }}>Cancel</button>
          <button
            onClick={() => f.name.trim() && onSave({
              ...f,
              name: f.name.trim(),
              epaRegNumber: f.epaRegNumber.trim() || null,
              activeIngredient: f.activeIngredient.trim() || null,
              defaultRate: f.defaultRate.trim() || null,
              reiHours: f.reiHours !== "" ? Number(f.reiHours) : null,
              signalWord: f.signalWord.trim() || null,
              moa: f.moa.trim() || null,
              notes: f.notes.trim() || null,
            })}
            style={{ ...btn(), flex: 2, opacity: f.name.trim() ? 1 : 0.5 }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 🔬 Purdue PPDL sample submissions ─────────────────────────────────────────
function PurdueTab() {
  const { rows: submissions, insert, update, remove } = useSampleSubmissions();
  const { rows: sprayRows } = useSprayRecords();
  const { displayName } = useAuth();
  const [submitter, setSubmitter] = useState(() => {
    try { return { ...DEFAULT_SUBMITTER, ...(JSON.parse(localStorage.getItem("gh_ppdl_submitter_v1")) || {}) }; }
    catch { return { ...DEFAULT_SUBMITTER }; }
  });
  const [showSubmitter, setShowSubmitter] = useState(false);
  const [f, setF] = useState({
    plantHost: "", cultivarVariety: "", fieldId: "", datePlanted: "", plantAge: "",
    pctAffected: "", dateNoticed: "", distribution: "Scattered", chemicalsApplied: "",
    problemDescription: "", tentativeDiagnosis: "", advancedTesting: false,
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setSub = (k, v) => setSubmitter(s => {
    const next = { ...s, [k]: v };
    try { localStorage.setItem("gh_ppdl_submitter_v1", JSON.stringify(next)); } catch {}
    return next;
  });

  // Auto-fill "chemicals/fertilizers applied" from the records log — last 60
  // days, narrowed by house/crop text when provided.
  function autofillChemicals() {
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const houseQ = (f.fieldId || "").toLowerCase();
    const cropQ = (f.plantHost + " " + f.cultivarVariety).trim().toLowerCase();
    const hits = (sprayRows || [])
      .filter(r => (r.appliedAt || "") >= cutoff)
      .filter(r => {
        if (!houseQ && !cropQ) return true;
        const houseHay = `${r.houses || ""} ${r.houseName || ""}`.toLowerCase();
        const cropHay = (r.crop || "").toLowerCase();
        const houseMatch = houseQ && houseHay && (houseHay.includes(houseQ) || houseQ.includes(houseHay.trim()));
        const cropMatch = cropQ && cropHay && cropQ.split(/\s+/).some(w => w.length > 3 && cropHay.includes(w));
        return houseMatch || cropMatch || (!houseHay && !cropHay);
      })
      .sort((a, b) => (a.appliedAt || "").localeCompare(b.appliedAt || ""));
    if (!hits.length) { alert("No application records in the last 60 days matched. Fill in manually or widen the Field ID / Plant fields."); return; }
    const lines = hits.map(r => {
      const d = r.appliedAt ? new Date(r.appliedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "?";
      return `${d}: ${r.productName}${r.rate ? ` @ ${r.rate}` : ""}${(r.houses || r.houseName) ? ` (${r.houses || r.houseName})` : ""}`;
    });
    set("chemicalsApplied", lines.join("; "));
  }

  async function saveSubmission() {
    if (!f.plantHost.trim()) { alert("Plant/Host is required."); return; }
    await insert({
      id: crypto.randomUUID(),
      createdBy: displayName || "Staff",
      plantHost: f.plantHost.trim(),
      cultivarVariety: f.cultivarVariety.trim() || null,
      fieldId: f.fieldId.trim() || null,
      datePlanted: f.datePlanted || null,
      plantAge: f.plantAge.trim() || null,
      pctAffected: f.pctAffected.trim() || null,
      dateNoticed: f.dateNoticed || null,
      distribution: f.distribution,
      chemicalsApplied: f.chemicalsApplied.trim() || null,
      problemDescription: f.problemDescription.trim() || null,
      tentativeDiagnosis: f.tentativeDiagnosis.trim() || null,
      advancedTesting: f.advancedTesting,
      status: "draft",
      form_data: { submitter },
    });
    setF({ plantHost: "", cultivarVariety: "", fieldId: "", datePlanted: "", plantAge: "", pctAffected: "", dateNoticed: "", distribution: "Scattered", chemicalsApplied: "", problemDescription: "", tentativeDiagnosis: "", advancedTesting: false });
  }

  async function downloadPdf(sub) {
    const { PDFDocument } = await import("pdf-lib"); // lazy — keeps it out of the main bundle
    const bytes = await fetch("/ppdl-form-006-004.pdf").then(r => r.arrayBuffer());
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    const S = { ...DEFAULT_SUBMITTER, ...(sub.formData?.submitter || submitter) };
    const setText = (name, val) => { try { if (val) form.getTextField(name).setText(String(val)); } catch {} };
    const check = (name) => { try { form.getCheckBox(name).check(); } catch {} };

    setText("Submitters Name", S.name || sub.createdBy);
    setText("Submitters Business", S.business);
    setText("Submitters Street Address", S.address);
    setText("Submitters City", S.city);
    try { form.getDropdown("Submitters State").select(S.state || "IN"); } catch {}
    setText("Submitters Zip", S.zip);
    setText("Submitters County", S.county);
    setText("Submitters Phone", S.phone);
    setText("Submitters Email", S.email);
    try { form.getRadioGroup("Submitter is").select("Greenhouse"); } catch {}
    check("Client Check if same as submitter");
    check("Send results to Submitter");
    check("Send invoice to Submitter");
    if (sub.advancedTesting) check("Advanced testing Yes up to 50");

    setText("Plant Host", sub.plantHost);
    setText("Cultivar Variety", sub.cultivarVariety);
    setText("Field ID Identification", sub.fieldId);
    check("Location Greenhouse");
    setText("Date planted", sub.datePlanted);
    setText("Approximate age of plant", sub.plantAge);
    setText("Percent of plants affected", sub.pctAffected);
    setText("Date first noticed problem", sub.dateNoticed);
    if (sub.distribution === "Scattered") check("Distribution Scattered");
    else if (sub.distribution === "General") check("Distribution General");
    else if (sub.distribution) { check("Distribution Other"); setText("Distribution Other specify", sub.distribution); }
    setText("Chemicals fertilizers applied", sub.chemicalsApplied);
    setText("Describe the problem", sub.problemDescription);
    setText("Your tentative diagnosis ID or main concern", sub.tentativeDiagnosis);

    const out = await pdf.save();
    const blob = new Blob([out], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PPDL_Sample_${(sub.plantHost || "plant").replace(/\W+/g, "_")}_${(sub.createdAt || "").slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    if (sub.status === "draft") await update(sub.id, { status: "printed" });
  }

  const sorted = useMemo(() => [...(submissions || [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [submissions]);
  const STATUS_META = {
    draft: { label: "Draft", bg: "#eee", color: "#666" },
    printed: { label: "Printed", bg: "#e6f0fa", color: "#2a6ab0" },
    sent: { label: "Sent to Purdue", bg: "#fdf0e0", color: "#a86a10" },
    results: { label: "Results back", bg: "#e8f5e0", color: "#4a7a35" },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, alignItems: "start" }}>
      {/* Left — new submission form */}
      <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: GREEN_DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>New Sample Submission</div>
        <div style={{ fontSize: 12, color: MUTED, margin: "3px 0 8px" }}>
          Fills the official Purdue PPDL-006-004 form. Ship samples to: PPDL, LSPS Room 116, 915 Mitch Daniels Blvd., West Lafayette, IN 47907.
        </div>

        <button onClick={() => setShowSubmitter(s => !s)} style={{ background: "none", border: "none", color: "#2a6ab0", fontSize: 12.5, fontWeight: 800, cursor: "pointer", padding: 0, fontFamily: FONT }}>
          {showSubmitter ? "▾" : "▸"} Submitter info ({submitter.business || "not set"})
        </button>
        {showSubmitter && (
          <div style={{ background: "#f7faf4", borderRadius: 10, padding: 12, marginTop: 8 }}>
            {[["name", "Your name"], ["business", "Business"], ["address", "Address"], ["city", "City"], ["zip", "Zip"], ["county", "County"], ["phone", "Phone"], ["email", "Email"]].map(([k, l]) => (
              <div key={k}><span style={label}>{l}</span><input style={input} value={submitter[k]} onChange={e => setSub(k, e.target.value)} /></div>
            ))}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Remembered on this device and stamped on every form.</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><span style={label}>Plant / Host *</span><input style={input} value={f.plantHost} onChange={e => set("plantHost", e.target.value)} placeholder="e.g. Chrysanthemum" /></div>
          <div style={{ flex: 1 }}><span style={label}>Cultivar / Variety</span><input style={input} value={f.cultivarVariety} onChange={e => set("cultivarVariety", e.target.value)} /></div>
        </div>
        <span style={label}>Field ID (house / bench)</span>
        <input style={input} value={f.fieldId} onChange={e => set("fieldId", e.target.value)} placeholder="e.g. Bluff H4" />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><span style={label}>Date planted</span><input style={input} value={f.datePlanted} onChange={e => set("datePlanted", e.target.value)} placeholder="e.g. 5/15/26" /></div>
          <div style={{ flex: 1 }}><span style={label}>Age of plant</span><input style={input} value={f.plantAge} onChange={e => set("plantAge", e.target.value)} placeholder="e.g. 8 weeks" /></div>
          <div style={{ flex: 1 }}><span style={label}>% affected</span><input style={input} value={f.pctAffected} onChange={e => set("pctAffected", e.target.value)} placeholder="e.g. 10%" /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><span style={label}>Date first noticed</span><input style={input} value={f.dateNoticed} onChange={e => set("dateNoticed", e.target.value)} placeholder="e.g. 7/18/26" /></div>
          <div style={{ flex: 1 }}>
            <span style={label}>Distribution</span>
            <select style={input} value={f.distribution} onChange={e => set("distribution", e.target.value)}>
              <option>Scattered</option><option>General</option><option value="Along edges">Other — describe in notes</option>
            </select>
          </div>
        </div>

        <span style={label}>Chemicals / fertilizers applied (dates & rates)</span>
        <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={f.chemicalsApplied} onChange={e => set("chemicalsApplied", e.target.value)} />
        <button onClick={autofillChemicals} style={{ ...btn("#e6f0fa", "#2a6ab0"), marginTop: 6, padding: "8px 14px", fontSize: 12.5 }}>
          ⚡ Auto-fill from application log (last 60 days)
        </button>

        <span style={label}>Describe the problem</span>
        <textarea style={{ ...input, minHeight: 90, resize: "vertical" }} value={f.problemDescription} onChange={e => set("problemDescription", e.target.value)} placeholder="Symptoms, plant parts affected, pattern of occurrence…" />
        <span style={label}>Your tentative diagnosis / main concern</span>
        <input style={input} value={f.tentativeDiagnosis} onChange={e => set("tentativeDiagnosis", e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, fontWeight: 700, color: GREEN_DARK, cursor: "pointer" }}>
          <input type="checkbox" checked={f.advancedTesting} onChange={e => set("advancedTesting", e.target.checked)} />
          Advanced testing (up to $50)
        </label>

        <button onClick={saveSubmission} style={{ ...btn(), width: "100%", marginTop: 14, padding: "13px 0" }}>
          Save Submission
        </button>
      </div>

      {/* Right — history */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
          Sample History ({sorted.length})
        </div>
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: MUTED, background: "#fff", borderRadius: 12, border: "1.5px solid #e0e8d8" }}>
            No samples yet.
          </div>
        )}
        {sorted.map(s => {
          const meta = STATUS_META[s.status] || STATUS_META.draft;
          return (
            <div key={s.id} style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: GREEN_DARK }}>🔬 {s.plantHost}{s.cultivarVariety ? ` — ${s.cultivarVariety}` : ""}</span>
                <span style={{ fontSize: 11, background: meta.bg, color: meta.color, borderRadius: 999, padding: "2px 9px", fontWeight: 800 }}>{meta.label}</span>
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                {fmtDT(s.createdAt)} · {s.createdBy}{s.fieldId ? ` · 📍 ${s.fieldId}` : ""}
              </div>
              {s.tentativeDiagnosis && <div style={{ fontSize: 12, color: MUTED, marginTop: 3, fontStyle: "italic" }}>Suspects: {s.tentativeDiagnosis}</div>}
              {s.resultsNotes && <div style={{ fontSize: 12, color: "#4a7a35", marginTop: 3 }}>✓ {s.resultsNotes}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => downloadPdf(s)} style={{ ...btn("#2a6ab0", "#fff"), padding: "7px 12px", fontSize: 12 }}>📄 Download PDF</button>
                {s.status === "printed" && <button onClick={() => update(s.id, { status: "sent" })} style={{ ...btn("#fdf0e0", "#a86a10"), padding: "7px 12px", fontSize: 12 }}>Mark Sent</button>}
                {s.status === "sent" && <button onClick={() => {
                  const notes = prompt("What did Purdue find?");
                  if (notes != null) update(s.id, { status: "results", resultsNotes: notes });
                }} style={{ ...btn("#e8f5e0", "#4a7a35"), padding: "7px 12px", fontSize: 12 }}>Log Results</button>}
                <button onClick={() => window.confirm("Delete this submission record?") && remove(s.id)} style={{ ...btn("#fff", RED), border: `1.5px solid ${RED}55`, padding: "7px 12px", fontSize: 12 }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
