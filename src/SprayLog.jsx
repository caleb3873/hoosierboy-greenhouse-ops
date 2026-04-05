import { useState } from "react";
import { useSprayRecords, useHouses, useGrowerProfiles } from "./supabase";
import { useAuth } from "./Auth";
import { APPLICATION_METHODS, REI_PRESETS, PPE_OPTIONS, uid } from "./shared";

// ── SHARED STYLES ─────────────────────────────────────────────────────────────
const FONT   = "'DM Sans','Segoe UI',sans-serif";
const DARK   = "#1e2d1a";
const ACCENT = "#7fb069";

function inputStyle(focus, field) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: `1.5px solid ${focus === field ? ACCENT : "#c8d8c0"}`,
    fontSize: 14,
    fontFamily: FONT,
    background: "#fff",
    color: DARK,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .15s",
  };
}

// Form label
function FL({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#7a8c74",
      textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5,
    }}>
      {children}
    </div>
  );
}

// Form field wrapper
function Field({ label, children, half }) {
  return (
    <div style={{ marginBottom: 14, width: half ? "calc(50% - 6px)" : "100%" }}>
      {label && <FL>{label}</FL>}
      {children}
    </div>
  );
}

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
function nowLocal() {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function reiExpiresAt(appliedAt, reiHours) {
  if (!appliedAt || !reiHours) return null;
  const d = new Date(appliedAt);
  d.setHours(d.getHours() + Number(reiHours));
  return d.toISOString();
}

function isReiActive(reiExpiresAt) {
  if (!reiExpiresAt) return false;
  return new Date(reiExpiresAt) > new Date();
}

// ── COMPLIANCE REPORT SUB-COMPONENT ──────────────────────────────────────────
function SprayReport({ rows }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate,   setToDate]   = useState("");
  const [focus, setFocus] = useState(null);

  const filtered = rows.filter(r => {
    if (!r.appliedAt) return false;
    const d = r.appliedAt.slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  }).sort((a, b) => (b.appliedAt || "").localeCompare(a.appliedAt || ""));

  const totalCost   = filtered.reduce((s, r) => s + (Number(r.productCost)   || 0), 0);
  const totalLabor  = filtered.reduce((s, r) => s + (Number(r.laborMinutes)  || 0), 0);

  const thStyle = {
    padding: "9px 10px", fontSize: 11, fontWeight: 700, color: "#7a8c74",
    textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap",
    borderBottom: "2px solid #e0e8d8", textAlign: "left", background: "#f8faf6",
  };
  const tdStyle = {
    padding: "9px 10px", fontSize: 13, color: DARK,
    borderBottom: "1px solid #e8f0e0", verticalAlign: "top",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18, alignItems: "flex-end" }}>
        <div style={{ minWidth: 160 }}>
          <FL>From date</FL>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            onFocus={() => setFocus("from")} onBlur={() => setFocus(null)}
            style={inputStyle(focus, "from")} />
        </div>
        <div style={{ minWidth: 160 }}>
          <FL>To date</FL>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            onFocus={() => setFocus("to")} onBlur={() => setFocus(null)}
            style={inputStyle(focus, "to")} />
        </div>
        {(fromDate || toDate) && (
          <button onClick={() => { setFromDate(""); setToDate(""); }}
            style={{ padding: "10px 16px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ background: "#f8faf6", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#7a8c74" }}>Records: </span>
          <strong style={{ color: DARK }}>{filtered.length}</strong>
        </div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#7a8c74" }}>Total Cost: </span>
          <strong style={{ color: DARK }}>${totalCost.toFixed(2)}</strong>
        </div>
        <div style={{ fontSize: 13 }}>
          <span style={{ color: "#7a8c74" }}>Total Labor: </span>
          <strong style={{ color: DARK }}>{totalLabor} min</strong>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#7a8c74", fontSize: 14 }}>
          No records in this date range
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1.5px solid #e0e8d8" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>EPA #</th>
                <th style={thStyle}>House</th>
                <th style={thStyle}>Method</th>
                <th style={thStyle}>Rate</th>
                <th style={thStyle}>REI</th>
                <th style={thStyle}>Applicator</th>
                <th style={thStyle}>PPE</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                  <td style={tdStyle}>{fmtDate(r.appliedAt)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.productName || "—"}</td>
                  <td style={tdStyle}>{r.epaRegNumber || "—"}</td>
                  <td style={tdStyle}>{r.houseName || "—"}</td>
                  <td style={tdStyle}>{r.applicationMethod || "—"}</td>
                  <td style={tdStyle}>{r.rate || "—"}</td>
                  <td style={tdStyle}>{r.reiHours ? `${r.reiHours}h` : "—"}</td>
                  <td style={tdStyle}>{r.growerName || "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{r.ppeWorn || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function SprayLog({ embedded }) {
  const { growerProfile, isAdmin } = useAuth();
  const { rows: sprayRows, insert } = useSprayRecords();
  const { rows: houses }            = useHouses();
  const { rows: growers }           = useGrowerProfiles();

  const [view, setView] = useState("log"); // log | new | report
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [focus,  setFocus]  = useState(null);

  // ── FORM STATE ──────────────────────────────────────────────────────────────
  const blankForm = () => ({
    growerId:          isAdmin ? "" : (growerProfile?.id || ""),
    growerName:        isAdmin ? "" : (growerProfile?.name || ""),
    productName:       "",
    epaRegNumber:      "",
    activeIngredient:  "",
    houseId:           "",
    houseName:         "",
    applicationMethod: "",
    rate:              "",
    totalVolume:       "",
    targetPest:        "",
    appliedAt:         nowLocal(),
    reiHours:          "",
    customRei:         "",
    ppeWorn:           [],
    windSpeed:         "",
    temperature:       "",
    productCost:       "",
    laborMinutes:      "",
    notes:             "",
    photo:             null,
  });

  const [form, setForm] = useState(blankForm);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function togglePpe(opt) {
    setForm(f => ({
      ...f,
      ppeWorn: f.ppeWorn.includes(opt)
        ? f.ppeWorn.filter(p => p !== opt)
        : [...f.ppeWorn, opt],
    }));
  }

  async function handleSave() {
    if (!form.productName.trim()) { setError("Product Name is required."); return; }
    if (!form.houseId)            { setError("House is required."); return; }
    setError("");
    setSaving(true);

    const effectiveRei = form.reiHours === "custom" ? Number(form.customRei) || null : Number(form.reiHours) || null;
    const expiresAt    = reiExpiresAt(form.appliedAt, effectiveRei);

    try {
      await insert({
        id:                 uid(),
        grower_id:          form.growerId || null,
        grower_name:        form.growerName || null,
        product_name:       form.productName.trim(),
        epa_reg_number:     form.epaRegNumber.trim() || null,
        active_ingredient:  form.activeIngredient.trim() || null,
        application_method: form.applicationMethod || null,
        rate:               form.rate.trim() || null,
        total_volume:       form.totalVolume.trim() || null,
        house_id:           form.houseId || null,
        house_name:         form.houseName || null,
        target_pest:        form.targetPest.trim() || null,
        applied_at:         form.appliedAt ? new Date(form.appliedAt).toISOString() : new Date().toISOString(),
        rei_hours:          effectiveRei,
        rei_expires_at:     expiresAt,
        wind_speed:         form.windSpeed.trim() || null,
        temperature:        form.temperature.trim() || null,
        ppe_worn:           form.ppeWorn.join(", ") || null,
        product_cost:       form.productCost !== "" ? Number(form.productCost) : null,
        labor_minutes:      form.laborMinutes !== "" ? Number(form.laborMinutes) : null,
        notes:              form.notes.trim() || null,
        photo:              form.photo || null,
      });
      setForm(blankForm());
      setView("log");
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── SORTED LOG ──────────────────────────────────────────────────────────────
  const sortedRows = [...sprayRows].sort((a, b) =>
    (b.appliedAt || "").localeCompare(a.appliedAt || "")
  );

  // ── CONTAINER ───────────────────────────────────────────────────────────────
  const containerStyle = {
    fontFamily: FONT,
    ...(embedded ? {} : { maxWidth: 760, margin: "0 auto", padding: "24px 20px" }),
  };

  // ── VIEW SWITCHER ────────────────────────────────────────────────────────────
  const tabBtn = (id, label, icon) => (
    <button key={id} onClick={() => setView(id)} style={{
      padding: "8px 18px", borderRadius: 8,
      border: `1.5px solid ${view === id ? ACCENT : "#c8d8c0"}`,
      background: view === id ? ACCENT : "#fff",
      color: view === id ? "#fff" : "#7a8c74",
      fontWeight: view === id ? 700 : 500,
      fontSize: 13, cursor: "pointer", fontFamily: FONT,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      {icon} {label}
    </button>
  );

  return (
    <div style={containerStyle}>
      {/* Header + view tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: DARK }}>💨 Spray Log</h2>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>State chemist compliance records</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabBtn("log",    "Records",  "📋")}
          {tabBtn("new",    "New Entry", "+")}
          {tabBtn("report", "Report",   "📊")}
        </div>
      </div>

      {/* ── LOG VIEW ── */}
      {view === "log" && (
        <div>
          {sortedRows.length === 0 ? (
            <div style={{
              background: "#fff", borderRadius: 12, border: "1.5px solid #e0e8d8",
              padding: 40, textAlign: "center", color: "#7a8c74",
            }}>
              No spray records yet. Use <strong>New Entry</strong> to add one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sortedRows.map(r => {
                const active = isReiActive(r.reiExpiresAt);
                return (
                  <div key={r.id} style={{
                    background: "#fff", borderRadius: 12,
                    border: `1.5px solid ${active ? "#f0b429" : "#e0e8d8"}`,
                    padding: "14px 16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: DARK }}>{r.productName}</div>
                        {r.activeIngredient && (
                          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 1 }}>{r.activeIngredient}</div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {active && (
                          <span style={{
                            background: "#fff8e0", border: "1.5px solid #f0b429",
                            color: "#b07d00", borderRadius: 8, padding: "3px 10px",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            ⚠ REI Active — expires {fmtDateTime(r.reiExpiresAt)}
                          </span>
                        )}
                        {r.productCost != null && (
                          <span style={{
                            background: "#f0f8eb", border: "1.5px solid #c8e6b8",
                            color: "#4a7a35", borderRadius: 8, padding: "3px 10px",
                            fontSize: 11, fontWeight: 700,
                          }}>
                            ${Number(r.productCost).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {r.houseName && (
                        <span style={{ fontSize: 12, color: "#4a5a40" }}>🏠 {r.houseName}</span>
                      )}
                      {r.applicationMethod && (
                        <span style={{ fontSize: 12, color: "#4a5a40" }}>
                          {APPLICATION_METHODS.find(m => m.id === r.applicationMethod)?.icon || ""} {r.applicationMethod}
                        </span>
                      )}
                      {r.growerName && (
                        <span style={{ fontSize: 12, color: "#4a5a40" }}>👤 {r.growerName}</span>
                      )}
                      {r.appliedAt && (
                        <span style={{ fontSize: 12, color: "#7a8c74" }}>🕐 {fmtDateTime(r.appliedAt)}</span>
                      )}
                      {r.reiHours && (
                        <span style={{ fontSize: 12, color: "#7a8c74" }}>REI: {r.reiHours}h</span>
                      )}
                    </div>

                    {r.targetPest && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#7a8c74" }}>
                        Target: {r.targetPest}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── NEW ENTRY FORM ── */}
      {view === "new" && (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1.5px solid #e0e8d8",
          padding: "20px 20px",
        }}>
          {error && (
            <div style={{
              background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 8,
              padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c03030", fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {/* Section: Applicator */}
          <SectionHead>Applicator</SectionHead>

          {isAdmin ? (
            <Field label="Applicator">
              <select
                value={form.growerId}
                onChange={e => {
                  const sel = growers.find(g => g.id === e.target.value);
                  set("growerId",   sel?.id   || "");
                  set("growerName", sel?.name || "");
                }}
                onFocus={() => setFocus("growerId")} onBlur={() => setFocus(null)}
                style={inputStyle(focus, "growerId")}
              >
                <option value="">— Select applicator —</option>
                {growers.filter(g => g.active !== false).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <div style={{
              background: "#f8faf6", borderRadius: 10, padding: "10px 14px",
              marginBottom: 14, fontSize: 14, color: DARK, fontWeight: 600,
            }}>
              👤 {growerProfile?.name || "—"}
            </div>
          )}

          {/* Section: Product */}
          <SectionHead>Product Information</SectionHead>

          <Field label="Product Name *">
            <input type="text" value={form.productName}
              onChange={e => set("productName", e.target.value)}
              onFocus={() => setFocus("productName")} onBlur={() => setFocus(null)}
              placeholder="e.g. Avid 0.15 EC"
              style={inputStyle(focus, "productName")} />
          </Field>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="EPA Reg Number" half>
              <input type="text" value={form.epaRegNumber}
                onChange={e => set("epaRegNumber", e.target.value)}
                onFocus={() => setFocus("epaRegNumber")} onBlur={() => setFocus(null)}
                placeholder="e.g. 59639-120"
                style={inputStyle(focus, "epaRegNumber")} />
            </Field>
            <Field label="Active Ingredient" half>
              <input type="text" value={form.activeIngredient}
                onChange={e => set("activeIngredient", e.target.value)}
                onFocus={() => setFocus("activeIngredient")} onBlur={() => setFocus(null)}
                placeholder="e.g. Abamectin"
                style={inputStyle(focus, "activeIngredient")} />
            </Field>
          </div>

          {/* Section: Application */}
          <SectionHead>Application Details</SectionHead>

          <Field label="House *">
            <select value={form.houseId}
              onChange={e => {
                const sel = houses.find(h => h.id === e.target.value);
                set("houseId",   sel?.id   || "");
                set("houseName", sel?.name || "");
              }}
              onFocus={() => setFocus("houseId")} onBlur={() => setFocus(null)}
              style={inputStyle(focus, "houseId")}
            >
              <option value="">— Select house —</option>
              {houses.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Application Method">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {APPLICATION_METHODS.map(m => (
                <button key={m.id}
                  onClick={() => set("applicationMethod", form.applicationMethod === m.id ? "" : m.id)}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    border: `1.5px solid ${form.applicationMethod === m.id ? ACCENT : "#c8d8c0"}`,
                    background: form.applicationMethod === m.id ? ACCENT : "#fff",
                    color: form.applicationMethod === m.id ? "#fff" : "#4a5a40",
                    fontWeight: form.applicationMethod === m.id ? 700 : 400,
                    fontSize: 13, cursor: "pointer", fontFamily: FONT,
                  }}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </Field>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Rate" half>
              <input type="text" value={form.rate}
                onChange={e => set("rate", e.target.value)}
                onFocus={() => setFocus("rate")} onBlur={() => setFocus(null)}
                placeholder="e.g. 2 oz/100 gal"
                style={inputStyle(focus, "rate")} />
            </Field>
            <Field label="Total Volume Mixed" half>
              <input type="text" value={form.totalVolume}
                onChange={e => set("totalVolume", e.target.value)}
                onFocus={() => setFocus("totalVolume")} onBlur={() => setFocus(null)}
                placeholder="e.g. 50 gal"
                style={inputStyle(focus, "totalVolume")} />
            </Field>
          </div>

          <Field label="Target Pest / Disease">
            <input type="text" value={form.targetPest}
              onChange={e => set("targetPest", e.target.value)}
              onFocus={() => setFocus("targetPest")} onBlur={() => setFocus(null)}
              placeholder="e.g. Spider mites, Botrytis"
              style={inputStyle(focus, "targetPest")} />
          </Field>

          <Field label="Date & Time Applied">
            <input type="datetime-local" value={form.appliedAt}
              onChange={e => set("appliedAt", e.target.value)}
              onFocus={() => setFocus("appliedAt")} onBlur={() => setFocus(null)}
              style={inputStyle(focus, "appliedAt")} />
          </Field>

          {/* Section: REI */}
          <SectionHead>Re-Entry Interval (REI)</SectionHead>

          <Field label="REI">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REI_PRESETS.map(p => {
                const val = p.hours == null ? "custom" : String(p.hours);
                const active = form.reiHours === val;
                return (
                  <button key={p.label}
                    onClick={() => set("reiHours", active ? "" : val)}
                    style={{
                      padding: "8px 14px", borderRadius: 8,
                      border: `1.5px solid ${active ? ACCENT : "#c8d8c0"}`,
                      background: active ? ACCENT : "#fff",
                      color: active ? "#fff" : "#4a5a40",
                      fontWeight: active ? 700 : 400,
                      fontSize: 13, cursor: "pointer", fontFamily: FONT,
                    }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {form.reiHours === "custom" && (
            <Field label="Custom REI (hours)">
              <input type="number" min="0" value={form.customRei}
                onChange={e => set("customRei", e.target.value)}
                onFocus={() => setFocus("customRei")} onBlur={() => setFocus(null)}
                placeholder="Enter hours"
                style={inputStyle(focus, "customRei")} />
            </Field>
          )}

          {/* Section: PPE */}
          <SectionHead>PPE Worn</SectionHead>

          <Field label="Select all that apply">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PPE_OPTIONS.map(opt => {
                const selected = form.ppeWorn.includes(opt);
                return (
                  <button key={opt} onClick={() => togglePpe(opt)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "9px 14px", borderRadius: 8, cursor: "pointer",
                    border: `1.5px solid ${selected ? ACCENT : "#c8d8c0"}`,
                    background: selected ? "#f0f8eb" : "#fff",
                    color: selected ? "#4a7a35" : "#4a5a40",
                    fontWeight: selected ? 700 : 400,
                    fontSize: 13, fontFamily: FONT, textAlign: "left",
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 4,
                      border: `2px solid ${selected ? ACCENT : "#c8d8c0"}`,
                      background: selected ? ACCENT : "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      {selected && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Section: Conditions */}
          <SectionHead>Conditions</SectionHead>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Wind Speed" half>
              <input type="text" value={form.windSpeed}
                onChange={e => set("windSpeed", e.target.value)}
                onFocus={() => setFocus("windSpeed")} onBlur={() => setFocus(null)}
                placeholder="e.g. calm / 5 mph"
                style={inputStyle(focus, "windSpeed")} />
            </Field>
            <Field label="Temperature" half>
              <input type="text" value={form.temperature}
                onChange={e => set("temperature", e.target.value)}
                onFocus={() => setFocus("temperature")} onBlur={() => setFocus(null)}
                placeholder="e.g. 72°F"
                style={inputStyle(focus, "temperature")} />
            </Field>
          </div>

          {/* Section: Cost */}
          <SectionHead>Cost Tracking</SectionHead>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Field label="Product Cost $" half>
              <input type="number" min="0" step="0.01" value={form.productCost}
                onChange={e => set("productCost", e.target.value)}
                onFocus={() => setFocus("productCost")} onBlur={() => setFocus(null)}
                placeholder="0.00"
                style={inputStyle(focus, "productCost")} />
            </Field>
            <Field label="Labor (minutes)" half>
              <input type="number" min="0" value={form.laborMinutes}
                onChange={e => set("laborMinutes", e.target.value)}
                onFocus={() => setFocus("laborMinutes")} onBlur={() => setFocus(null)}
                placeholder="e.g. 30"
                style={inputStyle(focus, "laborMinutes")} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes}
              onChange={e => set("notes", e.target.value)}
              onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)}
              rows={3} placeholder="Additional observations..."
              style={{ ...inputStyle(focus, "notes"), resize: "vertical", minHeight: 80 }} />
          </Field>

          {/* Photo */}
          <Field label="Photo">
            {form.photo ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <img src={form.photo} alt="Spray" style={{ maxWidth: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />
                <button onClick={() => set("photo", null)} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 20, width: 28, height: 28, cursor: "pointer", fontSize: 14 }}>&times;</button>
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 10, border: "1.5px dashed #c8d8c0", background: "#fafcf8", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "#7a8c74" }}>
                Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = ev => set("photo", ev.target.result); r.readAsDataURL(file); }} style={{ display: "none" }} />
              </label>
            )}
          </Field>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button onClick={() => { setForm(blankForm()); setError(""); setView("log"); }}
              style={{
                padding: "11px 22px", borderRadius: 10,
                border: "1.5px solid #c8d8c0", background: "#fff",
                color: "#7a8c74", fontWeight: 600, fontSize: 14,
                cursor: "pointer", fontFamily: FONT,
              }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{
                padding: "11px 28px", borderRadius: 10, border: "none",
                background: saving ? "#7a8c74" : DARK,
                color: "#fff", fontWeight: 800, fontSize: 14,
                cursor: saving ? "wait" : "pointer", fontFamily: FONT,
                transition: "background .15s",
              }}>
              {saving ? "Saving..." : "Save Record"}
            </button>
          </div>
        </div>
      )}

      {/* ── REPORT VIEW ── */}
      {view === "report" && (
        <div style={{
          background: "#fff", borderRadius: 14, border: "1.5px solid #e0e8d8",
          padding: "20px 20px",
        }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: DARK }}>
            Compliance Report
          </h3>
          <SprayReport rows={sprayRows} />
        </div>
      )}
    </div>
  );
}

// ── SECTION HEADER HELPER ──────────────────────────────────────────────────────
function SectionHead({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, color: ACCENT,
      letterSpacing: 1.2, textTransform: "uppercase",
      borderBottom: "1.5px solid #e0e8d8",
      paddingBottom: 8, marginBottom: 14, marginTop: 20,
    }}>
      {children}
    </div>
  );
}
