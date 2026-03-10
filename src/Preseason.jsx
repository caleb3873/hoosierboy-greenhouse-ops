import { useState, useRef } from "react";
import { useCropRuns, useContainers } from "./supabase";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt$ = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDec = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STORAGE_KEY  = "gh_preseason_v1";
const SALES_KEY    = "gh_sales_history_v1";
const PAYROLL_KEY  = "gh_payroll_history_v1";

function load(key, def) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────
const IS = (active) => ({
  width: "100%", padding: "7px 10px", borderRadius: 7,
  border: `1.5px solid ${active ? "#7fb069" : "#dde8d5"}`,
  background: "#fff", fontSize: 13, color: "#1e2d1a",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});
function FL({ c }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 3 }}>{c}</div>;
}

// ── MARGIN COLOR ──────────────────────────────────────────────────────────────
function marginColor(pct) {
  if (pct >= 50) return "#2e7d32";
  if (pct >= 35) return "#7fb069";
  if (pct >= 20) return "#c8791a";
  return "#c03030";
}

// ── PLUS MINUS CONTROL ───────────────────────────────────────────────────────
function PlusMinus({ value, onChange, mode, onModeChange, baseValue }) {
  const [focus, setFocus] = useState(false);
  const display = mode === "pct"
    ? (value >= 0 ? `+${value}%` : `${value}%`)
    : (value >= 0 ? `+${value}` : `${value}`);

  const projected = mode === "pct"
    ? Math.round(baseValue * (1 + value / 100))
    : baseValue + value;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <button onClick={() => onModeChange(mode === "pct" ? "num" : "pct")}
          style={{ padding: "3px 7px", borderRadius: 6, border: "1.5px solid #dde8d5", background: "#f8faf6", fontSize: 10, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          {mode === "pct" ? "%" : "#"}
        </button>
        <button onClick={() => onChange(value - (mode === "pct" ? 5 : 10))}
          style={{ width: 24, height: 28, borderRadius: 5, border: "1.5px solid #dde8d5", background: "#fff", fontSize: 14, cursor: "pointer", color: "#c03030", fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{ ...IS(focus), textAlign: "center", fontWeight: 700, fontSize: 12, padding: "4px 4px", width: 56 }} />
        <button onClick={() => onChange(value + (mode === "pct" ? 5 : 10))}
          style={{ width: 24, height: 28, borderRadius: 5, border: "1.5px solid #dde8d5", background: "#fff", fontSize: 14, cursor: "pointer", color: "#2e7d32", fontFamily: "inherit", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#9aaa90" }}>→ {projected.toLocaleString()} units</div>
    </div>
  );
}

// ── CSV IMPORT MODAL ──────────────────────────────────────────────────────────
function ImportModal({ onImport, onClose }) {
  const [step, setStep] = useState("upload"); // upload | map | preview
  const [raw, setRaw]   = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({ product: "", size: "", qty: "", price: "", year: "" });
  const [preview, setPreview] = useState([]);
  const fileRef = useRef();

  const FIELDS = [
    { id: "product", label: "Product / Crop Name", required: true },
    { id: "size",    label: "Size / Container",    required: false },
    { id: "qty",     label: "Quantity Sold",       required: true },
    { id: "price",   label: "Unit Price",          required: true },
    { id: "year",    label: "Year",                required: false },
  ];

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").filter(l => l.trim());
      const heads = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const rows  = lines.slice(1).map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
      setHeaders(heads);
      setRaw(rows);
      // Auto-map obvious columns
      const autoMap = { product: "", size: "", qty: "", price: "", year: "" };
      heads.forEach((h, i) => {
        const lh = h.toLowerCase();
        if (!autoMap.product && (lh.includes("product") || lh.includes("crop") || lh.includes("item") || lh.includes("name"))) autoMap.product = h;
        if (!autoMap.size    && (lh.includes("size") || lh.includes("container") || lh.includes("pot"))) autoMap.size = h;
        if (!autoMap.qty     && (lh.includes("qty") || lh.includes("quantity") || lh.includes("units") || lh.includes("sold"))) autoMap.qty = h;
        if (!autoMap.price   && (lh.includes("price") || lh.includes("rate") || lh.includes("unit price"))) autoMap.price = h;
        if (!autoMap.year    && (lh.includes("year") || lh.includes("season"))) autoMap.year = h;
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function buildPreview() {
    const rows = raw.slice(0, 5).map(row => {
      const get = (field) => {
        const h = mapping[field];
        if (!h) return "";
        const idx = headers.indexOf(h);
        return idx >= 0 ? row[idx] : "";
      };
      return { product: get("product"), size: get("size"), qty: get("qty"), price: get("price"), year: get("year") };
    });
    setPreview(rows);
    setStep("preview");
  }

  function handleImport() {
    const imported = raw.map(row => {
      const get = (field) => { const h = mapping[field]; if (!h) return ""; const idx = headers.indexOf(h); return idx >= 0 ? row[idx] : ""; };
      return { id: uid(), product: get("product"), size: get("size"), qty: Number(get("qty")) || 0, price: Number(get("price").replace(/[$,]/g, "")) || 0, year: Number(get("year")) || new Date().getFullYear() - 1 };
    }).filter(r => r.product && r.qty > 0);
    onImport(imported);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 640, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", padding: "20px 24px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 18, color: "#c8e6b8" }}>Import Sales History</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#c8e6b8", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
        <div style={{ padding: "24px" }}>

          {step === "upload" && (
            <div style={{ textAlign: "center", padding: "32px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>Upload a CSV file</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24, lineHeight: 1.6 }}>
                Export sales data from QuickBooks, Excel, or any spreadsheet as a CSV.<br />
                You'll map the columns on the next step.
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
              <button onClick={() => fileRef.current.click()}
                style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Choose CSV File
              </button>
              <div style={{ marginTop: 20, fontSize: 11, color: "#9aaa90" }}>
                Expected columns: Product name, Size, Quantity, Price, Year (optional)
              </div>
            </div>
          )}

          {step === "map" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>Map your columns</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Tell us which column in your file corresponds to each field. We've guessed where we can.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {FIELDS.map(f => (
                  <div key={f.id}>
                    <FL c={f.label + (f.required ? " *" : "")} />
                    <select value={mapping[f.id]} onChange={e => setMapping(m => ({ ...m, [f.id]: e.target.value }))}
                      style={{ ...IS(false), maxWidth: 300 }}>
                      <option value="">— Not in file —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep("upload")} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#7a8c74" }}>Back</button>
                <button onClick={buildPreview} disabled={!mapping.product || !mapping.qty || !mapping.price}
                  style={{ flex: 1, background: mapping.product && mapping.qty && mapping.price ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 13, fontWeight: 700, cursor: mapping.product ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  Preview Import →
                </button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>Preview (first 5 rows)</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 16 }}>{raw.length.toLocaleString()} total rows will be imported</div>
              <div style={{ overflowX: "auto", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f0f5ee" }}>
                      {["Product", "Size", "Qty", "Price", "Year"].map(h => (
                        <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #e8ede4" }}>
                        <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1e2d1a" }}>{row.product}</td>
                        <td style={{ padding: "8px 12px", color: "#7a8c74" }}>{row.size || "—"}</td>
                        <td style={{ padding: "8px 12px" }}>{Number(row.qty).toLocaleString()}</td>
                        <td style={{ padding: "8px 12px" }}>${Number(row.price).toFixed(2)}</td>
                        <td style={{ padding: "8px 12px", color: "#7a8c74" }}>{row.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep("map")} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#7a8c74" }}>Back</button>
                <button onClick={handleImport} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  ✓ Import {raw.length.toLocaleString()} Rows
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── PAYROLL INPUT MODAL ───────────────────────────────────────────────────────
function PayrollModal({ data, onSave, onClose }) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const [rows, setRows] = useState(() => {
    const base = {};
    years.forEach(y => { base[y] = { total: "", seasonal: "", fullTime: "" }; });
    return { ...base, ...data };
  });
  const [focus, setFocus] = useState(null);

  const upd = (year, field, val) => setRows(r => ({ ...r, [year]: { ...r[year], [field]: val } }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", padding: "20px 24px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 18, color: "#c8e6b8" }}>Payroll History</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#c8e6b8", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
        <div style={{ padding: "24px" }}>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Enter seasonal payroll totals. These are used to calculate true operating margin against revenue projections.</div>
          {years.map(year => (
            <div key={year} style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "16px 18px", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a", marginBottom: 14 }}>{year}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <FL c="Total Payroll" />
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9aaa90" }}>$</span>
                    <input type="number" value={rows[year]?.total || ""} onChange={e => upd(year, "total", e.target.value)}
                      onFocus={() => setFocus(`${year}-t`)} onBlur={() => setFocus(null)}
                      placeholder="0" style={{ ...IS(focus === `${year}-t`), paddingLeft: 20 }} />
                  </div>
                </div>
                <div>
                  <FL c="Seasonal Labor" />
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9aaa90" }}>$</span>
                    <input type="number" value={rows[year]?.seasonal || ""} onChange={e => upd(year, "seasonal", e.target.value)}
                      onFocus={() => setFocus(`${year}-s`)} onBlur={() => setFocus(null)}
                      placeholder="0" style={{ ...IS(focus === `${year}-s`), paddingLeft: 20 }} />
                  </div>
                </div>
                <div>
                  <FL c="Full Time" />
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9aaa90" }}>$</span>
                    <input type="number" value={rows[year]?.fullTime || ""} onChange={e => upd(year, "fullTime", e.target.value)}
                      onFocus={() => setFocus(`${year}-f`)} onBlur={() => setFocus(null)}
                      placeholder="0" style={{ ...IS(focus === `${year}-f`), paddingLeft: 20 }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => { onSave(rows); onClose(); }}
            style={{ width: "100%", background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>
            Save Payroll Data
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CAPACITY SUMMARY BAR ──────────────────────────────────────────────────────
function CapacityBar({ label, used, total, color }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const barColor = pct > 95 ? "#c03030" : pct > 80 ? "#c8791a" : color;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#4a5a40" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#7a8c74" }}>{used.toLocaleString()} / {total.toLocaleString()} ({pct}%)</span>
      </div>
      <div style={{ height: 8, background: "#e0ead8", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 4, transition: "width .3s" }} />
      </div>
    </div>
  );
}

// ── ITEM ROW ──────────────────────────────────────────────────────────────────
function ProjectionRow({ item, onChange, onRemove, isNew, containers, onCreateCropRun }) {
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus]       = useState(null);

  const projectedQty = item.adjMode === "pct"
    ? Math.round((item.lastQty || 0) * (1 + (item.adj || 0) / 100))
    : (item.lastQty || 0) + (item.adj || 0);

  const projectedUnits = isNew ? (item.projectedQty || 0) : projectedQty;
  const projectedRevenue = projectedUnits * (Number(item.price) || 0);
  const projectedCost    = projectedUnits * (Number(item.costPerUnit) || 0);
  const projectedMargin  = projectedRevenue - projectedCost;
  const marginPct        = projectedRevenue > 0 ? Math.round((projectedMargin / projectedRevenue) * 100) : 0;

  const plannedQty = item.plannedQty || 0;
  const gap        = projectedUnits - plannedQty;
  const hasGap     = gap > 0;

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${hasGap && !isNew ? "#f0c080" : "#e0ead8"}`, overflow: "hidden", marginBottom: 8 }}>
      {/* Main row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1fr 1fr 1fr auto", gap: 12, padding: "12px 16px", alignItems: "center" }}>

        {/* Product */}
        <div>
          {isNew ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input value={item.product || ""} onChange={e => onChange("product", e.target.value)}
                onFocus={() => setFocus("prod")} onBlur={() => setFocus(null)}
                placeholder="Product name..." style={{ ...IS(focus === "prod"), fontWeight: 700 }} />
              <input value={item.size || ""} onChange={e => onChange("size", e.target.value)}
                onFocus={() => setFocus("sz")} onBlur={() => setFocus(null)}
                placeholder='Size e.g. 10"' style={{ ...IS(focus === "sz"), width: 90, flexShrink: 0 }} />
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{item.product}</div>
              {item.size && <div style={{ fontSize: 11, color: "#7a8c74" }}>{item.size}</div>}
            </div>
          )}
        </div>

        {/* Last year qty */}
        <div style={{ textAlign: "center" }}>
          {isNew ? (
            <div>
              <FL c="Projected Qty" />
              <input type="number" value={item.projectedQty || ""} onChange={e => onChange("projectedQty", Number(e.target.value))}
                onFocus={() => setFocus("pq")} onBlur={() => setFocus(null)}
                placeholder="0" style={{ ...IS(focus === "pq"), textAlign: "center", fontWeight: 700 }} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#7a8c74" }}>{(item.lastQty || 0).toLocaleString()}</div>
              <div style={{ fontSize: 9, color: "#9aaa90", textTransform: "uppercase" }}>Last year</div>
            </div>
          )}
        </div>

        {/* Adjustment */}
        {!isNew && (
          <PlusMinus
            value={item.adj || 0}
            onChange={v => onChange("adj", v)}
            mode={item.adjMode || "pct"}
            onModeChange={m => onChange("adjMode", m)}
            baseValue={item.lastQty || 0}
          />
        )}
        {isNew && <div />}

        {/* Price */}
        <div>
          <FL c="Price" />
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9aaa90" }}>$</span>
            <input type="number" step="0.01" value={item.price || ""} onChange={e => onChange("price", e.target.value)}
              onFocus={() => setFocus("price")} onBlur={() => setFocus(null)}
              placeholder={item.lastPrice ? item.lastPrice.toFixed(2) : "0.00"}
              style={{ ...IS(focus === "price"), paddingLeft: 18, textAlign: "right" }} />
          </div>
          {item.lastPrice && !isNew && (
            <div style={{ fontSize: 9, color: "#9aaa90", textAlign: "right", marginTop: 2 }}>
              Was ${item.lastPrice.toFixed(2)}
              {item.price && Number(item.price) !== item.lastPrice && (
                <span style={{ color: Number(item.price) > item.lastPrice ? "#2e7d32" : "#c03030", marginLeft: 4 }}>
                  {Number(item.price) > item.lastPrice ? "▲" : "▼"}
                  {Math.abs(((Number(item.price) - item.lastPrice) / item.lastPrice) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Projected revenue */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{fmt$(projectedRevenue)}</div>
          <div style={{ fontSize: 9, color: "#9aaa90", textTransform: "uppercase" }}>Revenue</div>
        </div>

        {/* Margin */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: marginColor(marginPct) }}>{marginPct}%</div>
          <div style={{ fontSize: 9, color: "#9aaa90", textTransform: "uppercase" }}>Margin</div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {!isNew && (
            <button onClick={() => setExpanded(x => !x)}
              style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid #dde8d5", background: expanded ? "#f0f5ee" : "#fff", fontSize: 12, cursor: "pointer", color: "#7a8c74", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {expanded ? "▲" : "▼"}
            </button>
          )}
          <button onClick={onRemove}
            style={{ width: 28, height: 28, borderRadius: 7, border: "1.5px solid #f0d0c0", background: "#fff", fontSize: 14, cursor: "pointer", color: "#e07b39", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      </div>

      {/* Gap alert + create crop run */}
      {hasGap && !isNew && (
        <div style={{ background: "#fffbf0", borderTop: "1px solid #f0e0a0", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#7a5010" }}>
            ⚠️ <strong>{gap.toLocaleString()} units</strong> projected but not yet in crop runs
            {plannedQty > 0 && <span style={{ color: "#9a7030", marginLeft: 6 }}>({plannedQty.toLocaleString()} planned of {projectedUnits.toLocaleString()})</span>}
          </div>
          <button onClick={() => onCreateCropRun(item, gap)}
            style={{ background: "#e07b39", color: "#fff", border: "none", borderRadius: 8, padding: "5px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            + Create Crop Run
          </button>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && !isNew && (
        <div style={{ background: "#f8faf6", borderTop: "1px solid #e0ead8", padding: "14px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div>
              <FL c="Est. Cost / Unit" />
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9aaa90" }}>$</span>
                <input type="number" step="0.01" value={item.costPerUnit || ""} onChange={e => onChange("costPerUnit", e.target.value)}
                  onFocus={() => setFocus("cpu")} onBlur={() => setFocus(null)}
                  placeholder="0.00" style={{ ...IS(focus === "cpu"), paddingLeft: 18 }} />
              </div>
            </div>
            <div>
              <FL c="Projected Units" />
              <div style={{ fontSize: 20, fontWeight: 900, color: "#1e2d1a", paddingTop: 4 }}>{projectedUnits.toLocaleString()}</div>
            </div>
            <div>
              <FL c="Projected Revenue" />
              <div style={{ fontSize: 16, fontWeight: 800, color: "#2e7d32", paddingTop: 6 }}>{fmt$(projectedRevenue)}</div>
            </div>
            <div>
              <FL c="Projected Margin $" />
              <div style={{ fontSize: 16, fontWeight: 800, color: marginColor(marginPct), paddingTop: 6 }}>{fmt$(projectedMargin)}</div>
            </div>
            <div>
              <FL c="Notes" />
              <input value={item.notes || ""} onChange={e => onChange("notes", e.target.value)}
                onFocus={() => setFocus("notes")} onBlur={() => setFocus(null)}
                placeholder="e.g. new variety, price test..." style={IS(focus === "notes")} />
            </div>
            <div>
              <FL c="Year (historical)" />
              <div style={{ fontSize: 12, color: "#7a8c74", paddingTop: 6 }}>{item.year || "—"}</div>
            </div>
            <div>
              <FL c="Last Year Revenue" />
              <div style={{ fontSize: 14, fontWeight: 700, color: "#7a8c74", paddingTop: 6 }}>{item.lastQty && item.lastPrice ? fmt$(item.lastQty * item.lastPrice) : "—"}</div>
            </div>
            <div>
              <FL c="Planned in Crop Runs" />
              <div style={{ fontSize: 14, fontWeight: 700, color: plannedQty > 0 ? "#4a7a35" : "#9aaa90", paddingTop: 6 }}>{plannedQty > 0 ? plannedQty.toLocaleString() : "None yet"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN PRESEASON COMPONENT ──────────────────────────────────────────────────
export default function Preseason({ onNavigate, onCreateCropRun }) {
  const { rows: runs }       = useCropRuns();
  const { rows: containers } = useContainers();
  const currentYear          = new Date().getFullYear();

  // Persisted state
  const [items,      setItems]      = useState(() => load(STORAGE_KEY,   []));
  const [salesData,  setSalesData]  = useState(() => load(SALES_KEY,     []));
  const [payroll,    setPayroll]    = useState(() => load(PAYROLL_KEY,    {}));
  const [capacity,   setCapacity]   = useState(() => load("gh_capacity_v1", { basketLines: "", sqFt: "", sqFtBench: "" }));

  // UI state
  const [tab,           setTab]           = useState("projection"); // projection | sales | payroll | capacity
  const [showImport,    setShowImport]    = useState(false);
  const [showPayroll,   setShowPayroll]   = useState(false);
  const [yearFilter,    setYearFilter]    = useState("all");
  const [sortBy,        setSortBy]        = useState("revenue"); // revenue | margin | product
  const [focusCap,      setFocusCap]      = useState(null);

  // Persist on change
  const persistItems    = (u) => { setItems(u);     save(STORAGE_KEY, u); };
  const persistSales    = (u) => { setSalesData(u); save(SALES_KEY, u); };
  const persistPayroll  = (u) => { setPayroll(u);   save(PAYROLL_KEY, u); };
  const persistCapacity = (u) => { setCapacity(u);  save("gh_capacity_v1", u); };

  // When sales data is imported, build projection items from it
  function handleImport(imported) {
    persistSales([...salesData, ...imported]);
    // Group by product+size, take most recent year as "last year"
    const grouped = {};
    imported.forEach(row => {
      const key = `${row.product}||${row.size || ""}`;
      if (!grouped[key] || row.year > grouped[key].year) {
        grouped[key] = row;
      }
    });
    const newItems = Object.values(grouped).map(row => ({
      id: uid(),
      product: row.product,
      size: row.size || "",
      lastQty: row.qty,
      lastPrice: row.price,
      price: row.price,
      year: row.year,
      adj: 0,
      adjMode: "pct",
      costPerUnit: "",
      notes: "",
      isNew: false,
    }));
    // Merge with existing — don't duplicate
    const existing = items.map(i => `${i.product}||${i.size || ""}`);
    const toAdd = newItems.filter(n => !existing.includes(`${n.product}||${n.size || ""}`));
    persistItems([...items, ...toAdd]);
  }

  // Cross-reference crop runs to get planned quantities per product
  function getPlannedQty(item) {
    return runs.reduce((sum, run) => {
      const nameMatch = run.cropName?.toLowerCase().includes(item.product.toLowerCase()) ||
                        item.product.toLowerCase().includes(run.cropName?.toLowerCase() || "");
      if (!nameMatch) return sum;
      const units = run.cases && run.packSize ? Number(run.cases) * Number(run.packSize) : 0;
      return sum + units;
    }, 0);
  }

  // Compute projections
  const enriched = items.map(item => {
    const projectedQty = item.isNew
      ? (item.projectedQty || 0)
      : item.adjMode === "pct"
        ? Math.round((item.lastQty || 0) * (1 + (item.adj || 0) / 100))
        : (item.lastQty || 0) + (item.adj || 0);
    const price    = Number(item.price) || 0;
    const cost     = Number(item.costPerUnit) || 0;
    const revenue  = projectedQty * price;
    const material = projectedQty * cost;
    const margin   = revenue - material;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
    const planned  = getPlannedQty(item);
    return { ...item, projectedQty, revenue, material, margin, marginPct, planned };
  });

  // Sort
  const sorted = [...enriched].sort((a, b) => {
    if (sortBy === "revenue") return b.revenue - a.revenue;
    if (sortBy === "margin")  return b.marginPct - a.marginPct;
    if (sortBy === "product") return a.product.localeCompare(b.product);
    return 0;
  });

  // Totals
  const totalRevenue  = enriched.reduce((s, i) => s + i.revenue,  0);
  const totalMaterial = enriched.reduce((s, i) => s + i.material, 0);
  const totalMargin   = totalRevenue - totalMaterial;
  const totalMarginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;
  const totalUnits    = enriched.reduce((s, i) => s + i.projectedQty, 0);

  // Payroll for current year projection
  const thisYearPayroll = Number(payroll[currentYear]?.total || 0);
  const lastYearPayroll = Number(payroll[currentYear - 1]?.total || 0);
  const trueMargin      = totalMargin - thisYearPayroll;
  const trueMarginPct   = totalRevenue > 0 ? Math.round((trueMargin / totalRevenue) * 100) : 0;

  // Capacity
  const basketLines = Number(capacity.basketLines) || 0;
  const sqFt        = Number(capacity.sqFt) || 0;
  const sqFtBench   = Number(capacity.sqFtBench) || 0;
  const plannedBaskets = enriched.filter(i => i.product.toLowerCase().includes("basket") || i.size?.toLowerCase().includes("basket"))
    .reduce((s, i) => s + i.projectedQty, 0);

  // Add new item
  function addNewItem() {
    persistItems([...items, { id: uid(), product: "", size: "", isNew: true, projectedQty: 0, price: "", costPerUnit: "", notes: "" }]);
  }

  function updateItem(id, field, val) {
    persistItems(items.map(i => i.id === id ? { ...i, [field]: val } : i));
  }

  function removeItem(id) {
    persistItems(items.filter(i => i.id !== id));
  }

  function handleCreateCropRun(item, gap) {
    if (onCreateCropRun) {
      onCreateCropRun({ cropName: item.product, quantity: gap, size: item.size });
    } else if (onNavigate) {
      onNavigate("crops");
    }
  }

  // Years available in sales data
  const availableYears = [...new Set(salesData.map(r => r.year))].sort((a, b) => b - a);
  const filteredSales  = yearFilter === "all" ? salesData : salesData.filter(r => r.year === Number(yearFilter));

  // Sales data aggregated view
  const salesByProduct = {};
  filteredSales.forEach(row => {
    const key = `${row.product}||${row.size || ""}`;
    if (!salesByProduct[key]) salesByProduct[key] = { product: row.product, size: row.size, totalQty: 0, totalRevenue: 0, years: {} };
    salesByProduct[key].totalQty     += row.qty;
    salesByProduct[key].totalRevenue += row.qty * row.price;
    salesByProduct[key].years[row.year] = (salesByProduct[key].years[row.year] || 0) + row.qty;
  });
  const salesRows = Object.values(salesByProduct).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const TABS = [
    { id: "projection", label: "📊 Season Projection" },
    { id: "sales",      label: "📈 Sales History" },
    { id: "payroll",    label: "💼 Payroll" },
    { id: "capacity",   label: "🏡 Capacity" },
  ];

  return (
    <div>
      {showImport  && <ImportModal  onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showPayroll && <PayrollModal data={payroll} onSave={persistPayroll} onClose={() => setShowPayroll(false)} />}

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", borderRadius: 20, padding: "24px 28px", marginBottom: 24 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 26, color: "#c8e6b8", marginBottom: 4 }}>Preseason Planning</div>
        <div style={{ fontSize: 13, color: "#7fb069" }}>{currentYear} Season · {items.length} products planned</div>

        {/* Season totals */}
        {totalRevenue > 0 && (
          <div style={{ display: "flex", gap: 24, marginTop: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Projected Revenue</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{fmt$(totalRevenue)}</div>
            </div>
            {totalMaterial > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Material Cost</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#c8e6b8" }}>{fmt$(totalMaterial)}</div>
              </div>
            )}
            {totalMaterial > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Gross Margin</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: marginColor(totalMarginPct) === "#2e7d32" ? "#a8e6a0" : marginColor(totalMarginPct) }}>{totalMarginPct}% · {fmt$(totalMargin)}</div>
              </div>
            )}
            {thisYearPayroll > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>After Payroll</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: trueMargin > 0 ? "#a8e6a0" : "#f08080" }}>{trueMarginPct}% · {fmt$(trueMargin)}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 3 }}>Total Units</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{totalUnits.toLocaleString()}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#f0f5ee", borderRadius: 14, padding: 4, overflow: "hidden" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? "#1e2d1a" : "#7a8c74", fontWeight: tab === t.id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", boxShadow: tab === t.id ? "0 1px 6px rgba(0,0,0,0.08)" : "none", transition: "all .15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PROJECTION TAB ── */}
      {tab === "projection" && (
        <div>
          {/* Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[["revenue", "By Revenue"], ["margin", "By Margin"], ["product", "A–Z"]].map(([id, label]) => (
                <button key={id} onClick={() => setSortBy(id)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${sortBy === id ? "#7fb069" : "#c8d8c0"}`, background: sortBy === id ? "#f0f8eb" : "#fff", color: sortBy === id ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowImport(true)}
                style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                📥 Import Sales Data
              </button>
              <button onClick={addNewItem}
                style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add Item
              </button>
            </div>
          </div>

          {/* Column headers */}
          {items.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 1fr 1fr 1fr auto", gap: 12, padding: "6px 16px", marginBottom: 4 }}>
              {["Product", "Last Year", "Adjustment", "Price", "Revenue", "Margin", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6, textAlign: i >= 4 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
          )}

          {/* Rows */}
          {sorted.map(item => (
            <ProjectionRow
              key={item.id}
              item={{ ...item, plannedQty: getPlannedQty(item) }}
              onChange={(field, val) => updateItem(item.id, field, val)}
              onRemove={() => removeItem(item.id)}
              isNew={!!item.isNew}
              containers={containers}
              onCreateCropRun={handleCreateCropRun}
            />
          ))}

          {items.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#fafcf8", borderRadius: 20, border: "2px dashed #c8d8c0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4a5a40", marginBottom: 8 }}>No projection yet</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 24px" }}>
                Import last year's sales data to get started, or add items manually.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setShowImport(true)}
                  style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  📥 Import Sales History
                </button>
                <button onClick={addNewItem}
                  style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add Manually
                </button>
              </div>
            </div>
          )}

          {/* Totals footer */}
          {items.length > 0 && (
            <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", borderRadius: 14, padding: "16px 20px", marginTop: 16, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>Total Units</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{totalUnits.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>Gross Revenue</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{fmt$(totalRevenue)}</div>
              </div>
              {totalMaterial > 0 && <>
                <div>
                  <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>Material Cost</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#c8e6b8" }}>{fmt$(totalMaterial)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>Gross Margin</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#a8e6a0" }}>{totalMarginPct}% · {fmt$(totalMargin)}</div>
                </div>
              </>}
              {thisYearPayroll > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: "#7fb069", textTransform: "uppercase", letterSpacing: .8, marginBottom: 2 }}>After Payroll</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: trueMargin > 0 ? "#a8e6a0" : "#f08080" }}>{trueMarginPct}% · {fmt$(trueMargin)}</div>
                </div>
              )}
              <button onClick={addNewItem} style={{ marginLeft: "auto", background: "rgba(255,255,255,.15)", color: "#c8e6b8", border: "1px solid rgba(255,255,255,.25)", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Add Item
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SALES HISTORY TAB ── */}
      {tab === "sales" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setYearFilter("all")}
                style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${yearFilter === "all" ? "#7fb069" : "#c8d8c0"}`, background: yearFilter === "all" ? "#f0f8eb" : "#fff", color: yearFilter === "all" ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                All Years
              </button>
              {availableYears.map(y => (
                <button key={y} onClick={() => setYearFilter(y)}
                  style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${yearFilter === y ? "#7fb069" : "#c8d8c0"}`, background: yearFilter === y ? "#f0f8eb" : "#fff", color: yearFilter === y ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {y}
                </button>
              ))}
            </div>
            <button onClick={() => setShowImport(true)}
              style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              📥 Import More Data
            </button>
          </div>

          {salesRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#fafcf8", borderRadius: 20, border: "2px dashed #c8d8c0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4a5a40", marginBottom: 8 }}>No sales history yet</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24 }}>Import a CSV from QuickBooks or Excel to see your historical data here.</div>
              <button onClick={() => setShowImport(true)}
                style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                📥 Import Sales Data
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f0f5ee" }}>
                    {["Product", "Size", "Total Units", "Total Revenue", "Avg Price", ...availableYears.slice(0, 4).map(y => `${y} Units`)].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #e8ede4", background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1e2d1a" }}>{row.product}</td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{row.size || "—"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{row.totalQty.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2e7d32" }}>{fmt$(row.totalRevenue)}</td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{fmtDec(row.totalRevenue / row.totalQty)}</td>
                      {availableYears.slice(0, 4).map(y => (
                        <td key={y} style={{ padding: "10px 14px", color: "#4a90d9" }}>{row.years[y] ? row.years[y].toLocaleString() : "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PAYROLL TAB ── */}
      {tab === "payroll" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>Payroll History</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Used to calculate true operating margin after labor costs</div>
            </div>
            <button onClick={() => setShowPayroll(true)}
              style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Edit Payroll Data
            </button>
          </div>

          {Object.keys(payroll).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#fafcf8", borderRadius: 20, border: "2px dashed #c8d8c0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💼</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4a5a40", marginBottom: 8 }}>No payroll data yet</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24 }}>Add payroll totals to see true operating margin in your projections.</div>
              <button onClick={() => setShowPayroll(true)}
                style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Add Payroll Data
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {Object.entries(payroll).filter(([, v]) => v.total).map(([year, data]) => {
                const total    = Number(data.total) || 0;
                const seasonal = Number(data.seasonal) || 0;
                const fullTime = Number(data.fullTime) || 0;
                const revenueForYear = year == currentYear ? totalRevenue : 0;
                const pct = revenueForYear > 0 ? Math.round((total / revenueForYear) * 100) : null;
                return (
                  <div key={year} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "20px 22px" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a", marginBottom: 16 }}>{year}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#7a8c74" }}>Total Payroll</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{fmt$(total)}</span>
                      </div>
                      {seasonal > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "#9aaa90" }}>Seasonal Labor</span>
                          <span style={{ fontSize: 13, color: "#7a8c74" }}>{fmt$(seasonal)}</span>
                        </div>
                      )}
                      {fullTime > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12, color: "#9aaa90" }}>Full Time</span>
                          <span style={{ fontSize: 13, color: "#7a8c74" }}>{fmt$(fullTime)}</span>
                        </div>
                      )}
                      {pct !== null && (
                        <div style={{ background: "#f8faf6", borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>
                          <div style={{ fontSize: 11, color: "#7a8c74" }}>Labor as % of projected revenue</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: pct < 30 ? "#2e7d32" : pct < 45 ? "#c8791a" : "#c03030" }}>{pct}%</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CAPACITY TAB ── */}
      {tab === "capacity" && (
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>Facility Capacity</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Enter your maximum capacity. Projections are checked against these limits.</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
            {[
              { key: "basketLines", label: "Basket Lines", sub: "Total hanging positions", icon: "🧺" },
              { key: "sqFt",        label: "Total Sq Ft",  sub: "All greenhouse space",    icon: "🏡" },
              { key: "sqFtBench",   label: "Bench Sq Ft",  sub: "Bench/flat growing space", icon: "📐" },
            ].map(({ key, label, sub, icon }) => (
              <div key={key} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                <FL c={label} />
                <input type="number" value={capacity[key] || ""} onChange={e => persistCapacity({ ...capacity, [key]: e.target.value })}
                  onFocus={() => setFocusCap(key)} onBlur={() => setFocusCap(null)}
                  placeholder="0" style={{ ...IS(focusCap === key), fontSize: 20, fontWeight: 800, textAlign: "center", marginBottom: 4 }} />
                <div style={{ fontSize: 11, color: "#9aaa90" }}>{sub}</div>
              </div>
            ))}
          </div>

          {(basketLines > 0 || sqFt > 0) && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "20px 22px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Capacity vs Projection</div>
              {basketLines > 0 && <CapacityBar label="Basket Lines" used={plannedBaskets} total={basketLines} color="#7fb069" />}
              {sqFt > 0 && <CapacityBar label="Total Sq Ft" used={0} total={sqFt} color="#4a90d9" />}
              {sqFtBench > 0 && <CapacityBar label="Bench Sq Ft" used={0} total={sqFtBench} color="#8e44ad" />}
              <div style={{ fontSize: 11, color: "#9aaa90", marginTop: 12 }}>
                Bench/flat capacity will fill in automatically as crop runs are added with spacing profiles.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
