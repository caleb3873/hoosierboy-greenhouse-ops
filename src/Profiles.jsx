import { useState } from "react";
import { useBrokerProfiles, useSupplierProfiles, useBreederProfiles, useBrokerCatalogs } from "./supabase";

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card  = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS    = { padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1e2d1a", width: "100%", outline: "none", boxSizing: "border-box" };
const FL    = ({ c }) => <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>{c}</div>;
const SH    = ({ c }) => <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 14, marginTop: 20 }}>{c}</div>;

const SUPPLY_CATS = [
  { id: "young_plants", label: "Young Plants", icon: "🌱" },
  { id: "soil",         label: "Soil / Media",  icon: "🪱" },
  { id: "containers",   label: "Containers",    icon: "🪴" },
  { id: "hard_goods",   label: "Hard Goods",    icon: "🔧" },
  { id: "tropical",     label: "Tropical / Foliage", icon: "🌴" },
  { id: "structures",   label: "Structures",    icon: "🏗️" },
  { id: "other",        label: "Other",         icon: "📦" },
];

// ── STAR RATING ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange, label }) {
  const [hover, setHover] = useState(0);
  const display = hover || value || 0;
  return (
    <div>
      {label && <FL c={label} />}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map(n => (
          <span key={n}
            onClick={() => onChange(value === n ? 0 : n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            style={{ fontSize: 22, cursor: "pointer", color: n <= display ? "#f0b429" : "#d8e8d0", transition: "color .1s", userSelect: "none" }}>
            ★
          </span>
        ))}
        {value > 0 && <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 4 }}>{value.toFixed(1)}</span>}
        {value > 0 && onChange && <button onClick={() => onChange(0)} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>clear</button>}
      </div>
    </div>
  );
}

// Display-only star row
function GradeRow({ label, value }) {
  if (!value) return null;
  const stars = Math.round(value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #f0f5ee" }}>
      <div style={{ width: 160, fontSize: 13, color: "#4a5a40" }}>{label}</div>
      <div style={{ display: "flex", gap: 2 }}>
        {[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 14, color: n <= stars ? "#f0b429" : "#e0ead8" }}>★</span>)}
      </div>
      <div style={{ fontSize: 12, color: "#7a8c74" }}>{value.toFixed(1)}</div>
    </div>
  );
}

function OverallBadge({ value }) {
  if (!value) return null;
  const color = value >= 4 ? "#4a7a35" : value >= 3 ? "#c8791a" : "#d94f3d";
  const bg    = value >= 4 ? "#e8f5e0" : value >= 3 ? "#fff4e8" : "#fde8e8";
  const label = value >= 4.5 ? "Excellent" : value >= 4 ? "Good" : value >= 3 ? "Average" : value >= 2 ? "Below Avg" : "Poor";
  return (
    <div style={{ background: bg, color, borderRadius: 10, padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 16 }}>{"★".repeat(Math.round(value))}</span>
      <span style={{ fontWeight: 800, fontSize: 13 }}>{value.toFixed(1)} — {label}</span>
    </div>
  );
}

// ── IMPORT TEMPLATE EDITOR ────────────────────────────────────────────────────
// Shows the saved column mapping for this broker in a readable way
const FIELD_LABELS = {
  crop: "Crop / Species", series: "Series / Cultivar", varietyName: "Variety Name",
  color: "Color", shortCode: "Short Code", description: "Description",
  size: "Size / Form", itemNumber: "Item #", perQty: "Per / Unit Size",
  sellPrice: "Sell Price", unitPrice: "Unit Price", shipDate: "Ship Date",
  isNew: "New Flag", assortment: "Assortment", skip: "— Skip —",
};

function ImportTemplateView({ template, onEdit }) {
  if (!template || !template.mapping || Object.keys(template.mapping).length === 0) {
    return (
      <div style={{ background: "#f8faf6", borderRadius: 10, border: "1.5px dashed #c8d8c0", padding: "16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#aabba0", marginBottom: 8 }}>No import template saved yet</div>
        <div style={{ fontSize: 12, color: "#aabba0" }}>When you import a price list for this broker, save the mapping as a template and it'll auto-apply next time</div>
      </div>
    );
  }

  const mappedFields = Object.entries(template.mapping)
    .filter(([, v]) => v && v !== "skip")
    .map(([colIdx, field]) => ({ col: Number(colIdx), field }))
    .sort((a, b) => a.col - b.col);

  return (
    <div style={{ background: "#f0f8eb", borderRadius: 10, border: "1.5px solid #b8d8a0", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>✓ Import template saved</span>
        {template.sheetName && <span style={{ fontSize: 12, color: "#7a8c74" }}>Sheet: {template.sheetName}</span>}
        {template.headerRow !== undefined && <span style={{ fontSize: 12, color: "#7a8c74" }}>Header row: {template.headerRow + 1}</span>}
        <button onClick={onEdit} style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 8, border: "1.5px solid #b8d8a0", background: "#fff", color: "#4a7a35", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {mappedFields.map(({ col, field }) => (
          <div key={col} style={{ background: "#fff", borderRadius: 8, border: "1px solid #c8d8c0", padding: "3px 10px", fontSize: 12 }}>
            <span style={{ color: "#aabba0" }}>Col {col + 1} →</span> <span style={{ fontWeight: 700, color: "#2e5c1e" }}>{FIELD_LABELS[field] || field}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SEASON HISTORY ────────────────────────────────────────────────────────────
function SeasonHistory({ history = [], onChange }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ season: "Spring 2026", overall: 0, notes: "" });

  function add() {
    if (!form.season.trim()) return;
    onChange([{ id: crypto.randomUUID(), ...form, date: new Date().toISOString() }, ...history]);
    setAdding(false);
    setForm({ season: "Spring 2026", overall: 0, notes: "" });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase" }}>Season History</div>
        <button onClick={() => setAdding(a => !a)} style={{ marginLeft: "auto", padding: "3px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add Season</button>
      </div>

      {adding && (
        <div style={{ background: "#f8faf6", borderRadius: 10, border: "1.5px solid #c8d8c0", padding: "14px", marginBottom: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><FL c="Season" /><input value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))} style={IS} placeholder="Spring 2026" /></div>
            <div><StarRating label="Overall" value={form.overall} onChange={v => setForm(f => ({ ...f, overall: v }))} /></div>
          </div>
          <div><FL c="Notes" /><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...IS, minHeight: 70, resize: "vertical" }} placeholder="How did this season go?" /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={add} style={{ padding: "8px 16px", borderRadius: 8, background: "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
            <button onClick={() => setAdding(false)} style={{ padding: "8px 16px", borderRadius: 8, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {history.length === 0 && !adding && <div style={{ color: "#aabba0", fontSize: 13 }}>No season history yet</div>}
      {history.map(h => (
        <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f5ee" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{h.season}</div>
            {h.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{h.notes}</div>}
          </div>
          {h.overall > 0 && <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>{[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 13, color: n <= h.overall ? "#f0b429" : "#e0ead8" }}>★</span>)}</div>}
          <button onClick={() => onChange(history.filter(x => x.id !== h.id))} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 14, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── BROKER PROFILES ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const BROKER_BLANK = {
  name: "", company: "", repName: "", repPhone: "", repEmail: "", website: "",
  whatTheySell: [], notes: "",
  gradeResponsiveness: 0, gradeAccuracy: 0, gradeProblemResolution: 0,
  gradeInvoicing: 0, gradeOverall: 0, gradeNotes: "",
  importTemplate: null, seasonHistory: [],
};

function BrokerForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...BROKER_BLANK, ...initial } : BROKER_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleSell = (id) => upd("whatTheySell", f.whatTheySell.includes(id) ? f.whatTheySell.filter(x => x !== id) : [...f.whatTheySell, id]);

  return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Broker" : "New Broker"}</div>
      </div>

      <div style={card}>
        <SH c="Contact Info" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><FL c="Broker / Company Name *" /><input value={f.name} onChange={e => upd("name", e.target.value)} style={IS} placeholder="e.g. Express Seed" /></div>
          <div><FL c="Rep Name" /><input value={f.repName} onChange={e => upd("repName", e.target.value)} style={IS} placeholder="e.g. John Smith" /></div>
          <div><FL c="Phone" /><input value={f.repPhone} onChange={e => upd("repPhone", e.target.value)} style={IS} placeholder="(555) 000-0000" /></div>
          <div><FL c="Email" /><input value={f.repEmail} onChange={e => upd("repEmail", e.target.value)} style={IS} placeholder="rep@broker.com" /></div>
          <div style={{ gridColumn: "1/-1" }}><FL c="Website" /><input value={f.website} onChange={e => upd("website", e.target.value)} style={IS} placeholder="https://..." /></div>
        </div>

        <SH c="What They Sell" />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {SUPPLY_CATS.map(c => {
            const on = f.whatTheySell.includes(c.id);
            return (
              <button key={c.id} onClick={() => toggleSell(c.id)}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${on ? "#7fb069" : "#c8d8c0"}`, background: on ? "#f0f8eb" : "#fff", color: on ? "#2e5c1e" : "#7a8c74", fontWeight: on ? 700 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>

        <SH c="Grade This Broker" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <StarRating label="Responsiveness"      value={f.gradeResponsiveness}     onChange={v => upd("gradeResponsiveness", v)} />
          <StarRating label="Order Accuracy"      value={f.gradeAccuracy}           onChange={v => upd("gradeAccuracy", v)} />
          <StarRating label="Problem Resolution"  value={f.gradeProblemResolution}  onChange={v => upd("gradeProblemResolution", v)} />
          <StarRating label="Invoicing / Billing" value={f.gradeInvoicing}          onChange={v => upd("gradeInvoicing", v)} />
          <div style={{ gridColumn: "1/-1" }}>
            <StarRating label="Overall Rating"    value={f.gradeOverall}            onChange={v => upd("gradeOverall", v)} />
          </div>
        </div>
        <div><FL c="Grade Notes" /><textarea value={f.gradeNotes} onChange={e => upd("gradeNotes", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} placeholder="Any specific comments about working with this broker..." /></div>

        <SH c="Notes" />
        <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS, minHeight: 80, resize: "vertical" }} placeholder="Payment terms, lead times, special agreements..." />

        <SH c="Season History" />
        <SeasonHistory history={f.seasonHistory || []} onChange={v => upd("seasonHistory", v)} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={() => f.name.trim() && onSave({ ...f, id: f.id || crypto.randomUUID() })}
          style={{ flex: 1, padding: 13, borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          {initial ? "Save Changes" : "Add Broker"}
        </button>
        <button onClick={onCancel} style={{ padding: "13px 20px", borderRadius: 10, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

function BrokerCard({ broker, onClick }) {
  const avg = [broker.gradeResponsiveness, broker.gradeAccuracy, broker.gradeProblemResolution, broker.gradeInvoicing].filter(Boolean);
  const overall = broker.gradeOverall || (avg.length ? avg.reduce((a,b) => a+b, 0) / avg.length : 0);
  const sells = (broker.whatTheySell || []).map(id => SUPPLY_CATS.find(c => c.id === id)).filter(Boolean);

  return (
    <div onClick={onClick} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all .15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; e.currentTarget.style.background = "#fafcf8"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; e.currentTarget.style.background = "#fff"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{broker.name}</div>
          {broker.repName && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Rep: {broker.repName}</div>}
          {broker.repPhone && <div style={{ fontSize: 12, color: "#7a8c74" }}>{broker.repPhone}</div>}
        </div>
        {overall > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", gap: 1 }}>{[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 14, color: n <= Math.round(overall) ? "#f0b429" : "#e0ead8" }}>★</span>)}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{overall.toFixed(1)}</div>
          </div>
        )}
      </div>
      {sells.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
          {sells.map(c => <span key={c.id} style={{ background: "#f0f8eb", color: "#4a7a35", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{c.icon} {c.label}</span>)}
        </div>
      )}
      {broker.importTemplate && <div style={{ marginTop: 8, fontSize: 11, color: "#7fb069", fontWeight: 700 }}>✓ Import template saved</div>}
    </div>
  );
}

function BrokerDetail({ broker, onEdit, onBack, onDelete }) {
  const sells = (broker.whatTheySell || []).map(id => SUPPLY_CATS.find(c => c.id === id)).filter(Boolean);
  return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 20, color: "#1e2d1a" }}>{broker.name}</div>
        <button onClick={onEdit} style={{ padding: "7px 16px", borderRadius: 9, border: "1.5px solid #c8d8c0", background: "#fff", color: "#4a5a40", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={onDelete} style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #f0c8c0", background: "#fff", color: "#d94f3d", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
      </div>

      {/* Contact */}
      <div style={card}>
        <SH c="Contact" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {broker.repName  && <div><FL c="Rep" /><div style={{ fontSize: 14, color: "#1e2d1a" }}>{broker.repName}</div></div>}
          {broker.repPhone && <div><FL c="Phone" /><a href={`tel:${broker.repPhone}`} style={{ fontSize: 14, color: "#2e7d9e", textDecoration: "none" }}>{broker.repPhone}</a></div>}
          {broker.repEmail && <div><FL c="Email" /><a href={`mailto:${broker.repEmail}`} style={{ fontSize: 14, color: "#2e7d9e", textDecoration: "none" }}>{broker.repEmail}</a></div>}
          {broker.website  && <div><FL c="Website" /><a href={broker.website} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: "#2e7d9e", textDecoration: "none" }}>↗ {broker.website.replace(/https?:\/\//, "")}</a></div>}
        </div>
        {sells.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <FL c="What They Sell" />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sells.map(c => <span key={c.id} style={{ background: "#f0f8eb", color: "#4a7a35", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{c.icon} {c.label}</span>)}
            </div>
          </div>
        )}
        {broker.notes && <div style={{ marginTop: 14 }}><FL c="Notes" /><div style={{ fontSize: 13, color: "#4a5a40", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{broker.notes}</div></div>}
      </div>

      {/* Grades */}
      <div style={card}>
        <SH c="Grades" />
        {broker.gradeOverall > 0 && <div style={{ marginBottom: 14 }}><OverallBadge value={broker.gradeOverall} /></div>}
        <GradeRow label="Responsiveness"      value={broker.gradeResponsiveness} />
        <GradeRow label="Order Accuracy"      value={broker.gradeAccuracy} />
        <GradeRow label="Problem Resolution"  value={broker.gradeProblemResolution} />
        <GradeRow label="Invoicing / Billing" value={broker.gradeInvoicing} />
        {broker.gradeNotes && <div style={{ marginTop: 12, fontSize: 13, color: "#4a5a40", background: "#f8faf6", borderRadius: 8, padding: "10px 12px" }}>{broker.gradeNotes}</div>}
      </div>

      {/* Import template */}
      <div style={card}>
        <SH c="Price List Import Template" />
        <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 12 }}>Saved column mapping — auto-applied when you upload a price list from this broker</div>
        <ImportTemplateView template={broker.importTemplate} onEdit={onEdit} />
      </div>

      {/* Season history */}
      {(broker.seasonHistory || []).length > 0 && (
        <div style={card}>
          <SH c="Season History" />
          <SeasonHistory history={broker.seasonHistory} onChange={() => {}} />
        </div>
      )}
    </div>
  );
}

export function BrokerProfiles() {
  const { rows, upsert, remove } = useBrokerProfiles();
  const [view, setView] = useState("list"); // list | form | detail
  const [selectedId, setSelectedId] = useState(null);
  const selected = rows.find(r => r.id === selectedId);

  const save = async (data) => { await upsert(data); setView("list"); };
  const del  = async (id)  => { if (window.confirm("Delete this broker?")) { await remove(id); setView("list"); } };

  if (view === "form")   return <BrokerForm initial={selected} onSave={save} onCancel={() => setView(selected ? "detail" : "list")} />;
  if (view === "detail" && selected) return <BrokerDetail broker={selected} onEdit={() => setView("form")} onBack={() => setView("list")} onDelete={() => del(selected.id)} />;

  return (
    <div style={FONT}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>Broker Profiles</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Contact info, grades, and saved import templates</div>
        </div>
        <button onClick={() => { setSelectedId(null); setView("form"); }}
          style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Broker
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "50px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No brokers yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Add Express Seed, Eason, BFG, Carlin, Berger, East Jordan...</div>
          <button onClick={() => setView("form")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Add First Broker</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {rows.map(b => <BrokerCard key={b.id} broker={b} onClick={() => { setSelectedId(b.id); setView("detail"); }} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SUPPLIER PROFILES ─────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const SUPPLIER_BLANK = {
  name: "", category: "", website: "", contactName: "", contactPhone: "",
  contactEmail: "", paymentTerms: "", leadTimeWeeks: "", notes: "",
  gradeQuality: 0, gradeOnTime: 0, gradeAccuracy: 0, gradePackaging: 0,
  gradeOverall: 0, gradeNotes: "", seasonHistory: [],
};

function SupplierForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial ? { ...SUPPLIER_BLANK, ...initial } : SUPPLIER_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Supplier" : "New Supplier"}</div>
      </div>

      <div style={card}>
        <SH c="Supplier Info" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: "1/-1" }}><FL c="Supplier Name *" /><input value={f.name} onChange={e => upd("name", e.target.value)} style={IS} placeholder="e.g. Ball Horticultural" /></div>
          <div>
            <FL c="Category" />
            <select value={f.category} onChange={e => upd("category", e.target.value)} style={{ ...IS }}>
              <option value="">— Select —</option>
              {SUPPLY_CATS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </div>
          <div><FL c="Lead Time (weeks)" /><input type="number" value={f.leadTimeWeeks} onChange={e => upd("leadTimeWeeks", e.target.value)} style={IS} placeholder="e.g. 8" /></div>
          <div><FL c="Contact Name" /><input value={f.contactName} onChange={e => upd("contactName", e.target.value)} style={IS} /></div>
          <div><FL c="Phone" /><input value={f.contactPhone} onChange={e => upd("contactPhone", e.target.value)} style={IS} /></div>
          <div><FL c="Email" /><input value={f.contactEmail} onChange={e => upd("contactEmail", e.target.value)} style={IS} /></div>
          <div><FL c="Website" /><input value={f.website} onChange={e => upd("website", e.target.value)} style={IS} /></div>
          <div style={{ gridColumn: "1/-1" }}><FL c="Payment Terms" /><input value={f.paymentTerms} onChange={e => upd("paymentTerms", e.target.value)} style={IS} placeholder="e.g. Net 30, 2/10 Net 30" /></div>
        </div>

        <SH c="Grade This Supplier" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <StarRating label="Quality on Arrival" value={f.gradeQuality}   onChange={v => upd("gradeQuality", v)} />
          <StarRating label="On-Time Delivery"   value={f.gradeOnTime}    onChange={v => upd("gradeOnTime", v)} />
          <StarRating label="Order Accuracy"     value={f.gradeAccuracy}  onChange={v => upd("gradeAccuracy", v)} />
          <StarRating label="Packaging"          value={f.gradePackaging} onChange={v => upd("gradePackaging", v)} />
          <div style={{ gridColumn: "1/-1" }}><StarRating label="Overall Rating" value={f.gradeOverall} onChange={v => upd("gradeOverall", v)} /></div>
        </div>
        <div><FL c="Grade Notes" /><textarea value={f.gradeNotes} onChange={e => upd("gradeNotes", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} placeholder="Quality notes, recurring issues, standout positives..." /></div>

        <SH c="Notes" />
        <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS, minHeight: 80, resize: "vertical" }} placeholder="General notes about this supplier..." />

        <SH c="Season History" />
        <SeasonHistory history={f.seasonHistory || []} onChange={v => upd("seasonHistory", v)} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={() => f.name.trim() && onSave({ ...f, id: f.id || crypto.randomUUID() })}
          style={{ flex: 1, padding: 13, borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          {initial ? "Save Changes" : "Add Supplier"}
        </button>
        <button onClick={onCancel} style={{ padding: "13px 20px", borderRadius: 10, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

function SupplierCard({ supplier, onClick }) {
  const cat = SUPPLY_CATS.find(c => c.id === supplier.category);
  const overall = supplier.gradeOverall || 0;
  return (
    <div onClick={onClick} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all .15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; e.currentTarget.style.background = "#fafcf8"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; e.currentTarget.style.background = "#fff"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{supplier.name}</div>
          {cat && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{cat.icon} {cat.label}</div>}
          {supplier.contactName && <div style={{ fontSize: 12, color: "#7a8c74" }}>{supplier.contactName}</div>}
          {supplier.leadTimeWeeks && <div style={{ fontSize: 12, color: "#aabba0", marginTop: 2 }}>Lead time: {supplier.leadTimeWeeks}w</div>}
        </div>
        {overall > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", gap: 1 }}>{[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 14, color: n <= Math.round(overall) ? "#f0b429" : "#e0ead8" }}>★</span>)}</div>
            <div style={{ fontSize: 11, color: "#7a8c74" }}>{overall.toFixed(1)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SupplierProfiles() {
  const { rows, upsert, remove } = useSupplierProfiles();
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const selected = rows.find(r => r.id === selectedId);

  const save = async (data) => { await upsert(data); setView("list"); };
  const del  = async (id)  => { if (window.confirm("Delete this supplier?")) { await remove(id); setView("list"); } };

  if (view === "form") return <SupplierForm initial={selected} onSave={save} onCancel={() => setView(selected ? "detail" : "list")} />;

  if (view === "detail" && selected) return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 20, color: "#1e2d1a" }}>{selected.name}</div>
        <button onClick={() => setView("form")} style={{ padding: "7px 16px", borderRadius: 9, border: "1.5px solid #c8d8c0", background: "#fff", color: "#4a5a40", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={() => del(selected.id)} style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #f0c8c0", background: "#fff", color: "#d94f3d", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
      </div>
      <div style={card}>
        <SH c="Info" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {selected.category    && <div><FL c="Category" /><div>{SUPPLY_CATS.find(c=>c.id===selected.category)?.icon} {SUPPLY_CATS.find(c=>c.id===selected.category)?.label}</div></div>}
          {selected.leadTimeWeeks && <div><FL c="Lead Time" /><div>{selected.leadTimeWeeks} weeks</div></div>}
          {selected.contactName  && <div><FL c="Contact" /><div>{selected.contactName}</div></div>}
          {selected.contactPhone && <div><FL c="Phone" /><a href={`tel:${selected.contactPhone}`} style={{ color: "#2e7d9e", textDecoration: "none" }}>{selected.contactPhone}</a></div>}
          {selected.contactEmail && <div><FL c="Email" /><a href={`mailto:${selected.contactEmail}`} style={{ color: "#2e7d9e", textDecoration: "none" }}>{selected.contactEmail}</a></div>}
          {selected.paymentTerms && <div><FL c="Payment Terms" /><div>{selected.paymentTerms}</div></div>}
        </div>
        {selected.notes && <div style={{ marginTop: 14 }}><FL c="Notes" /><div style={{ fontSize: 13, color: "#4a5a40", lineHeight: 1.6 }}>{selected.notes}</div></div>}
      </div>
      <div style={card}>
        <SH c="Grades" />
        {selected.gradeOverall > 0 && <div style={{ marginBottom: 14 }}><OverallBadge value={selected.gradeOverall} /></div>}
        <GradeRow label="Quality on Arrival" value={selected.gradeQuality} />
        <GradeRow label="On-Time Delivery"   value={selected.gradeOnTime} />
        <GradeRow label="Order Accuracy"     value={selected.gradeAccuracy} />
        <GradeRow label="Packaging"          value={selected.gradePackaging} />
        {selected.gradeNotes && <div style={{ marginTop: 12, fontSize: 13, color: "#4a5a40", background: "#f8faf6", borderRadius: 8, padding: "10px 12px" }}>{selected.gradeNotes}</div>}
      </div>
      {(selected.seasonHistory||[]).length > 0 && (
        <div style={card}><SH c="Season History" /><SeasonHistory history={selected.seasonHistory} onChange={() => {}} /></div>
      )}
    </div>
  );

  return (
    <div style={FONT}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>Supplier Profiles</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Vendors, fulfillment grades, and lead times</div>
        </div>
        <button onClick={() => { setSelectedId(null); setView("form"); }}
          style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Supplier
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "50px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No suppliers yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Add Ball, Syngenta, Berger, East Jordan...</div>
          <button onClick={() => setView("form")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Add First Supplier</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {rows.map(s => <SupplierCard key={s.id} supplier={s} onClick={() => { setSelectedId(s.id); setView("detail"); }} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── BREEDER PROFILES ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const KNOWN_BREEDERS = ["Ball Seed", "Proven Winners", "Syngenta Flowers", "PanAmerican Seed", "Dümmen Orange", "Selecta", "Beekenkamp", "Westhoff", "Sakata", "Floranova"];

const BREEDER_BLANK = {
  name: "", website: "", cultureGuideUrl: "", orderThrough: [], notes: "",
  gradeVigor: 0, gradeDiseaseResistance: 0, gradeTrueToDesc: 0,
  gradeCustomerAppeal: 0, gradeOverall: 0, gradeNotes: "",
  cultureGuideTemplate: null, seasonHistory: [],
};

function BreederForm({ initial, onSave, onCancel, brokerNames }) {
  const [f, setF] = useState(initial ? { ...BREEDER_BLANK, ...initial } : BREEDER_BLANK);
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleBroker = (name) => upd("orderThrough", f.orderThrough.includes(name) ? f.orderThrough.filter(x => x !== name) : [...f.orderThrough, name]);

  return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{initial ? "Edit Breeder" : "New Breeder"}</div>
      </div>

      <div style={card}>
        <SH c="Breeder Info" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <FL c="Breeder Name *" />
            <input value={f.name} onChange={e => upd("name", e.target.value)} style={IS} placeholder="e.g. Proven Winners" list="known-breeders" />
            <datalist id="known-breeders">{KNOWN_BREEDERS.map(b => <option key={b} value={b} />)}</datalist>
          </div>
          <div><FL c="Website" /><input value={f.website} onChange={e => upd("website", e.target.value)} style={IS} placeholder="https://..." /></div>
          <div><FL c="Culture Guide URL" /><input value={f.cultureGuideUrl} onChange={e => upd("cultureGuideUrl", e.target.value)} style={IS} placeholder="https://..." /></div>
        </div>

        <SH c="Order Through These Brokers" />
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 8 }}>Which of your brokers carry this breeder's genetics?</div>
        {brokerNames.length === 0
          ? <div style={{ fontSize: 13, color: "#aabba0" }}>Add brokers first in the Brokers tab</div>
          : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {brokerNames.map(name => {
                const on = f.orderThrough.includes(name);
                return (
                  <button key={name} onClick={() => toggleBroker(name)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${on ? "#7fb069" : "#c8d8c0"}`, background: on ? "#f0f8eb" : "#fff", color: on ? "#2e5c1e" : "#7a8c74", fontWeight: on ? 700 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    {name}
                  </button>
                );
              })}
            </div>
        }

        <SH c="Grade This Breeder" />
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>Rate their genetics performance in your conditions</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <StarRating label="Vigor / Uniformity"      value={f.gradeVigor}             onChange={v => upd("gradeVigor", v)} />
          <StarRating label="Disease Resistance"       value={f.gradeDiseaseResistance} onChange={v => upd("gradeDiseaseResistance", v)} />
          <StarRating label="True to Description"      value={f.gradeTrueToDesc}        onChange={v => upd("gradeTrueToDesc", v)} />
          <StarRating label="Customer Appeal / Sellthrough" value={f.gradeCustomerAppeal} onChange={v => upd("gradeCustomerAppeal", v)} />
          <div style={{ gridColumn: "1/-1" }}><StarRating label="Overall Rating" value={f.gradeOverall} onChange={v => upd("gradeOverall", v)} /></div>
        </div>
        <div><FL c="Grade Notes" /><textarea value={f.gradeNotes} onChange={e => upd("gradeNotes", e.target.value)} style={{ ...IS, minHeight: 70, resize: "vertical" }} placeholder="Which varieties stand out? Any consistent issues?" /></div>

        <SH c="Notes" />
        <textarea value={f.notes} onChange={e => upd("notes", e.target.value)} style={{ ...IS, minHeight: 80, resize: "vertical" }} placeholder="General notes about this breeder..." />

        <SH c="Season History" />
        <SeasonHistory history={f.seasonHistory || []} onChange={v => upd("seasonHistory", v)} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={() => f.name.trim() && onSave({ ...f, id: f.id || crypto.randomUUID() })}
          style={{ flex: 1, padding: 13, borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          {initial ? "Save Changes" : "Add Breeder"}
        </button>
        <button onClick={onCancel} style={{ padding: "13px 20px", borderRadius: 10, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

function BreederCard({ breeder, onClick }) {
  const overall = breeder.gradeOverall || 0;
  return (
    <div onClick={onClick} style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all .15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; e.currentTarget.style.background = "#fafcf8"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; e.currentTarget.style.background = "#fff"; }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{breeder.name}</div>
          {(breeder.orderThrough || []).length > 0 && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>via {breeder.orderThrough.join(", ")}</div>}
        </div>
        {overall > 0 && (
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", gap: 1 }}>{[1,2,3,4,5].map(n => <span key={n} style={{ fontSize: 14, color: n <= Math.round(overall) ? "#f0b429" : "#e0ead8" }}>★</span>)}</div>
            <div style={{ fontSize: 11, color: "#7a8c74" }}>{overall.toFixed(1)}</div>
          </div>
        )}
      </div>
      {breeder.cultureGuideUrl && <div style={{ marginTop: 8, fontSize: 11, color: "#2e7d9e" }}>↗ Culture guide linked</div>}
    </div>
  );
}

export function BreederProfiles() {
  const { rows, upsert, remove } = useBreederProfiles();
  const { rows: brokers }        = useBrokerProfiles();
  const [view, setView]          = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const selected    = rows.find(r => r.id === selectedId);
  const brokerNames = brokers.map(b => b.name);

  const save = async (data) => { await upsert(data); setView("list"); };
  const del  = async (id)  => { if (window.confirm("Delete this breeder?")) { await remove(id); setView("list"); } };

  if (view === "form") return <BreederForm initial={selected} onSave={save} onCancel={() => setView(selected ? "detail" : "list")} brokerNames={brokerNames} />;

  if (view === "detail" && selected) return (
    <div style={{ maxWidth: 700, ...FONT }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 20, color: "#1e2d1a" }}>{selected.name}</div>
        <button onClick={() => setView("form")} style={{ padding: "7px 16px", borderRadius: 9, border: "1.5px solid #c8d8c0", background: "#fff", color: "#4a5a40", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
        <button onClick={() => del(selected.id)} style={{ padding: "7px 14px", borderRadius: 9, border: "1.5px solid #f0c8c0", background: "#fff", color: "#d94f3d", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
      </div>
      <div style={card}>
        <SH c="Info" />
        {(selected.orderThrough||[]).length > 0 && <div style={{ marginBottom: 10 }}><FL c="Order Through" /><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{selected.orderThrough.map(b => <span key={b} style={{ background: "#f0f8eb", color: "#4a7a35", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{b}</span>)}</div></div>}
        {selected.website && <div style={{ marginBottom: 8 }}><FL c="Website" /><a href={selected.website} target="_blank" rel="noreferrer" style={{ color: "#2e7d9e", textDecoration: "none" }}>↗ {selected.website.replace(/https?:\/\//, "")}</a></div>}
        {selected.cultureGuideUrl && <div style={{ marginBottom: 8 }}><FL c="Culture Guide" /><a href={selected.cultureGuideUrl} target="_blank" rel="noreferrer" style={{ color: "#2e7d9e", textDecoration: "none" }}>↗ View Culture Guides</a></div>}
        {selected.notes && <div><FL c="Notes" /><div style={{ fontSize: 13, color: "#4a5a40", lineHeight: 1.6 }}>{selected.notes}</div></div>}
      </div>
      <div style={card}>
        <SH c="Grades" />
        {selected.gradeOverall > 0 && <div style={{ marginBottom: 14 }}><OverallBadge value={selected.gradeOverall} /></div>}
        <GradeRow label="Vigor / Uniformity"       value={selected.gradeVigor} />
        <GradeRow label="Disease Resistance"        value={selected.gradeDiseaseResistance} />
        <GradeRow label="True to Description"       value={selected.gradeTrueToDesc} />
        <GradeRow label="Customer Appeal"           value={selected.gradeCustomerAppeal} />
        {selected.gradeNotes && <div style={{ marginTop: 12, fontSize: 13, color: "#4a5a40", background: "#f8faf6", borderRadius: 8, padding: "10px 12px" }}>{selected.gradeNotes}</div>}
      </div>
      {(selected.seasonHistory||[]).length > 0 && (
        <div style={card}><SH c="Season History" /><SeasonHistory history={selected.seasonHistory} onChange={() => {}} /></div>
      )}
    </div>
  );

  return (
    <div style={FONT}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2a1a" }}>Breeder Profiles</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Genetics companies, variety performance grades, culture guide links</div>
        </div>
        <button onClick={() => { setSelectedId(null); setView("form"); }}
          style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Breeder
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "50px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧬</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No breeders yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Add Proven Winners, Ball, Syngenta, PanAm, Dümmen...</div>
          <button onClick={() => setView("form")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Add First Breeder</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {rows.map(b => <BreederCard key={b.id} breeder={b} onClick={() => { setSelectedId(b.id); setView("detail"); }} />)}
        </div>
      )}
    </div>
  );
}
