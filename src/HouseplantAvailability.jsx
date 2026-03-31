import { useState, useEffect, useMemo, useCallback } from "react";
import { useHpSuppliers, useHpAvailability, getSupabase } from "./supabase";
import { readWorkbook, parseSheet, parseWeekLabel } from "./hpParsers";
import { matchSupplierConfig } from "./hpDefaultConfigs";

// ── Design tokens (matches app palette) ──────────────────────────────────────
const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`,
  background: "#fff", fontSize: 14, color: "#1e2d1a",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});
const SH = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2,
    textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8",
    paddingBottom: 8, marginBottom: 16, marginTop: 24 }}>{children}</div>
);
const FL = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase",
    letterSpacing: .7, marginBottom: 5 }}>{children}</div>
);
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10,
  padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0",
  borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

// ── XLSX CDN loader ──────────────────────────────────────────────────────────
function useXLSX() {
  const [ready, setReady] = useState(!!window.XLSX);
  useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function HouseplantAvailability() {
  const xlsxReady = useXLSX();
  const { rows: suppliers, upsert: upsertSupplier, refresh: refreshSuppliers } = useHpSuppliers();
  const { rows: availability, insert: insertAvail, remove: removeAvail, refresh: refreshAvail } = useHpAvailability();

  const [view, setView] = useState("search"); // "search" | "upload" | "mapping"
  const [searchQ, setSearchQ] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("any");
  const [uploadState, setUploadState] = useState(null);
  const [mappingSupplier, setMappingSupplier] = useState(null);

  // ── Search logic ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = availability;
    if (brokerFilter !== "all") {
      items = items.filter(r => r.broker === brokerFilter);
    }
    if (supplierFilter !== "all") {
      items = items.filter(r => r.supplierName === supplierFilter);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter(r =>
        (r.plantName || "").toLowerCase().includes(q) ||
        (r.variety || "").toLowerCase().includes(q) ||
        (r.commonName || "").toLowerCase().includes(q) ||
        (r.supplierName || "").toLowerCase().includes(q)
      );
    }
    if (weekFilter !== "any") {
      items = items.filter(r => {
        const avail = r.availability || {};
        return avail[weekFilter] && avail[weekFilter] > 0;
      });
    }
    return items;
  }, [availability, searchQ, brokerFilter, supplierFilter, weekFilter]);

  const allWeekKeys = useMemo(() => {
    const keys = new Set();
    availability.forEach(r => {
      Object.keys(r.availability || {}).forEach(k => keys.add(k));
    });
    return Array.from(keys).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
  }, [availability]);

  const brokers = useMemo(() => {
    const set = new Set(availability.map(r => r.broker));
    return Array.from(set).sort();
  }, [availability]);

  const supplierNames = useMemo(() => {
    let items = availability;
    if (brokerFilter !== "all") items = items.filter(r => r.broker === brokerFilter);
    const set = new Set(items.map(r => r.supplierName).filter(Boolean));
    return Array.from(set).sort();
  }, [availability, brokerFilter]);

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadState({ broker: "Express Seed", status: "reading", sheets: null, parsed: null });
    try {
      const sheets = await readWorkbook(file);
      const tabNames = Object.keys(sheets).filter(n => n !== "Directory");

      const parsed = tabNames.map(tabName => {
        const match = matchSupplierConfig(tabName);
        const existing = suppliers.find(s => s.tabName === tabName || s.name === (match?.key || tabName));
        const config = existing?.formatConfig || match?.config || {};
        const rows = parseSheet(sheets[tabName], config);
        return {
          tabName,
          supplierKey: match?.key || tabName,
          config,
          rows,
          matched: !!match,
          existing,
          rowCount: rows.length,
        };
      });

      setUploadState({ broker: "Express Seed", status: "preview", sheets, parsed });
    } catch (err) {
      setUploadState({ broker: "Express Seed", status: "error", error: err.message });
    }
    // Reset the file input so re-uploading the same file triggers onChange
    e.target.value = "";
  }, [suppliers]);

  // ── Import confirmed ─────────────────────────────────────────────────────
  const handleImportConfirm = useCallback(async () => {
    if (!uploadState?.parsed) return;
    setUploadState(prev => ({ ...prev, status: "importing" }));

    const batchId = crypto.randomUUID();
    const broker = uploadState.broker;

    try {
      // Try bulk Supabase operations first, fall back to useTable hooks (localStorage) if tables don't exist
      const sb = getSupabase();
      let useDirectDb = false;

      if (sb) {
        const { error: testErr } = await sb.from("hp_availability").select("id").limit(1);
        useDirectDb = !testErr; // tables exist if no error
      }

      // 1. Delete existing availability for this broker
      if (useDirectDb) {
        await sb.from("hp_availability").delete().eq("broker", broker);
      } else {
        // localStorage fallback: remove matching rows
        const existing = availability.filter(r => r.broker === broker);
        for (const row of existing) {
          await removeAvail(row.id);
        }
      }

      // 2. Upsert supplier records and track their IDs
      const supplierIdMap = {}; // supplierKey → id
      for (const tab of uploadState.parsed) {
        const supplierId = tab.existing?.id || crypto.randomUUID();
        supplierIdMap[tab.supplierKey] = supplierId;

        if (useDirectDb) {
          const { error } = await sb.from("hp_suppliers").upsert({
            id: supplierId,
            broker,
            name: tab.supplierKey,
            tab_name: tab.tabName,
            format_config: tab.config,
          }, { onConflict: "broker,name" });
          if (error) {
            // If upsert conflict, fetch the existing ID
            const { data } = await sb.from("hp_suppliers")
              .select("id").eq("broker", broker).eq("name", tab.supplierKey).single();
            if (data) supplierIdMap[tab.supplierKey] = data.id;
          }
        } else {
          await upsertSupplier({
            id: supplierId,
            broker,
            name: tab.supplierKey,
            tabName: tab.tabName,
            formatConfig: tab.config,
          });
        }
      }

      // 3. Build all availability rows using tracked IDs
      const allRows = [];
      for (const tab of uploadState.parsed) {
        const supplierId = supplierIdMap[tab.supplierKey];
        for (const row of tab.rows) {
          allRows.push({
            id: crypto.randomUUID(),
            supplierId,
            broker,
            supplierName: tab.supplierKey,
            plantName: row.plantName,
            variety: row.variety,
            commonName: row.commonName,
            size: row.size,
            form: row.form,
            productId: row.productId,
            location: row.location,
            availability: row.availability,
            availabilityText: row.availabilityText,
            comments: row.comments,
            uploadBatch: batchId,
          });
        }
      }

      // 4. Insert rows
      if (useDirectDb) {
        // Bulk insert in chunks (snake_case for direct DB)
        for (let i = 0; i < allRows.length; i += 500) {
          const chunk = allRows.slice(i, i + 500).map(r => ({
            id: r.id,
            supplier_id: r.supplierId,
            broker: r.broker,
            supplier_name: r.supplierName,
            plant_name: r.plantName,
            variety: r.variety,
            common_name: r.commonName,
            size: r.size,
            form: r.form,
            product_id: r.productId,
            location: r.location,
            availability: r.availability,
            availability_text: r.availabilityText,
            comments: r.comments,
            upload_batch: r.uploadBatch,
          }));
          const { error } = await sb.from("hp_availability").insert(chunk);
          if (error) throw error;
        }
      } else {
        // localStorage fallback via useTable hooks (camelCase)
        for (const row of allRows) {
          await insertAvail(row);
        }
      }

      refreshSuppliers();
      refreshAvail();
      setUploadState(null);
      setView("search");
    } catch (err) {
      setUploadState(prev => ({ ...prev, status: "error", error: err.message }));
    }
  }, [uploadState, availability, suppliers, upsertSupplier, insertAvail, removeAvail, refreshSuppliers, refreshAvail]);

  // ── Week label display ───────────────────────────────────────────────────
  function weekLabel(key) {
    if (!key) return "";
    if (key === "ready") return "Ready";
    if (key === "1month") return "1 Month";
    if (key === "future") return "Future";
    if (key === "total") return "Total";
    if (key.startsWith("wk")) return "Wk " + key.replace("wk", "");
    if (key.startsWith("month_")) return key.replace("month_", "").charAt(0).toUpperCase() + key.replace("month_", "").slice(1);
    return key;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, fontWeight: 400, color: "#1a2a1a" }}>
            Houseplant Availability
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            {availability.length} items from {brokers.length} broker{brokers.length !== 1 ? "s" : ""}
            {suppliers.length > 0 && ` / ${suppliers.length} suppliers`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...BTN, display: "flex", alignItems: "center", gap: 8, opacity: xlsxReady ? 1 : 0.5, cursor: xlsxReady ? "pointer" : "wait" }}>
            Upload Availability
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={handleFileUpload}
              disabled={!xlsxReady} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Upload preview overlay */}
      {uploadState && uploadState.status === "preview" && (
        <UploadPreview
          state={uploadState}
          onConfirm={handleImportConfirm}
          onCancel={() => setUploadState(null)}
          onEditMapping={(tab) => { setMappingSupplier(tab); setView("mapping"); }}
          weekLabel={weekLabel}
        />
      )}

      {uploadState && uploadState.status === "importing" && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>Importing availability...</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>This may take a moment for large files.</div>
        </div>
      )}

      {uploadState && uploadState.status === "reading" && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a" }}>Reading Excel file...</div>
        </div>
      )}

      {uploadState && uploadState.status === "error" && (
        <div style={{ ...card, borderColor: "#f0c8c0", padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#d94f3d", marginBottom: 6 }}>Upload Error</div>
          <div style={{ fontSize: 13, color: "#7a5a5a" }}>{uploadState.error}</div>
          <button onClick={() => setUploadState(null)} style={{ ...BTN_SEC, marginTop: 12 }}>Dismiss</button>
        </div>
      )}

      {/* Mapping editor */}
      {view === "mapping" && mappingSupplier && (
        <MappingEditor
          tab={mappingSupplier}
          sheets={uploadState?.sheets}
          onSave={(updatedTab) => {
            setUploadState(prev => ({
              ...prev,
              parsed: prev.parsed.map(t => t.tabName === updatedTab.tabName ? updatedTab : t),
            }));
            setView("search");
          }}
          onCancel={() => setView("search")}
        />
      )}

      {/* Search view */}
      {(view === "search" && !uploadState) && (
        <>
          {/* Search bar + filters */}
          <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search plants, varieties, suppliers..."
                style={{ ...IS(!!searchQ), fontSize: 15 }}
              />
            </div>
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}
              style={{ ...IS(false), width: "auto", minWidth: 140 }}>
              <option value="all">All Brokers</option>
              {brokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}
              onFocus={() => { if (supplierFilter !== "all" && !supplierNames.includes(supplierFilter)) setSupplierFilter("all"); }}
              style={{ ...IS(false), width: "auto", minWidth: 160 }}>
              <option value="all">All Suppliers</option>
              {supplierNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
              style={{ ...IS(false), width: "auto", minWidth: 120 }}>
              <option value="any">Any Week</option>
              {allWeekKeys.map(k => <option key={k} value={k}>{weekLabel(k)}</option>)}
            </select>
            <div style={{ fontSize: 13, color: "#7a8c74", fontWeight: 600 }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Results */}
          {availability.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No availability loaded</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
                Upload an Express Seed availability spreadsheet to get started. All tabs will be parsed and searchable.
              </div>
              <label style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 8, cursor: xlsxReady ? "pointer" : "wait" }}>
                Upload Availability File
                <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileUpload}
                  disabled={!xlsxReady} style={{ display: "none" }} />
              </label>
            </div>
          ) : (
            <AvailabilityTable rows={filtered} weekLabel={weekLabel} />
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── UPLOAD PREVIEW ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function UploadPreview({ state, onConfirm, onCancel, onEditMapping }) {
  const totalRows = state.parsed.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div style={{ ...card, borderColor: "#7fb069", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>Upload Preview — {state.broker}</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            {state.parsed.length} supplier tabs / {totalRows.toLocaleString()} total items parsed
          </div>
          <div style={{ fontSize: 12, color: "#c8791a", fontWeight: 600, marginTop: 4 }}>
            This will replace ALL existing {state.broker} availability.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={BTN}>Import All</button>
          <button onClick={onCancel} style={BTN_SEC}>Cancel</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {state.parsed.map(tab => (
          <div key={tab.tabName} style={{
            background: tab.matched ? "#f8fcf6" : "#fff8f0",
            borderRadius: 10, border: `1.5px solid ${tab.matched ? "#b8d8a0" : "#e8d0a0"}`,
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{tab.supplierKey}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 12, padding: "2px 8px",
                background: tab.matched ? "#e0f0d8" : "#fde8d0",
                color: tab.matched ? "#4a7a35" : "#c87a1a",
              }}>
                {tab.matched ? "Auto-mapped" : "Needs mapping"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>
              Tab: "{tab.tabName}" — {tab.rowCount} items
            </div>
            {tab.rows.length > 0 && (
              <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>
                Sample: {tab.rows.slice(0, 3).map(r => r.plantName).join(", ")}
              </div>
            )}
            <button onClick={() => onEditMapping(tab)}
              style={{ marginTop: 8, padding: "4px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0",
                background: "#fff", color: "#7a8c74", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Edit Mapping
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── AVAILABILITY TABLE ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function AvailabilityTable({ rows, weekLabel }) {
  const [sortCol, setSortCol] = useState("plantName");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a[sortCol] || "").toLowerCase();
      const bv = (b[sortCol] || "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const paged = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(sorted.length / PER_PAGE);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  useEffect(() => setPage(0), [rows]);

  const thStyle = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 800,
    color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, cursor: "pointer",
    borderBottom: "2px solid #e0ead8", userSelect: "none", whiteSpace: "nowrap" };
  const tdStyle = { padding: "10px 12px", fontSize: 13, color: "#1e2d1a", borderBottom: "1px solid #f0f5ee" };

  const visibleWeekKeys = useMemo(() => {
    const keys = new Set();
    paged.forEach(r => Object.keys(r.availability || {}).forEach(k => keys.add(k)));
    const arr = Array.from(keys);
    arr.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
    return arr.slice(0, 12);
  }, [paged]);

  return (
    <div>
      <div style={{ overflowX: "auto", background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              <th onClick={() => toggleSort("plantName")} style={thStyle}>
                Plant {sortCol === "plantName" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
              </th>
              <th onClick={() => toggleSort("variety")} style={thStyle}>
                Variety {sortCol === "variety" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
              </th>
              <th onClick={() => toggleSort("supplierName")} style={thStyle}>
                Supplier {sortCol === "supplierName" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}
              </th>
              <th style={thStyle}>Size</th>
              <th style={thStyle}>Form</th>
              {visibleWeekKeys.map(k => (
                <th key={k} style={{ ...thStyle, textAlign: "right", minWidth: 55 }}>{weekLabel(k)}</th>
              ))}
              <th style={thStyle}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={row.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{row.plantName}</td>
                <td style={tdStyle}>{row.variety || ""}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: "#7a8c74" }}>{row.supplierName}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{row.size || ""}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{row.form || ""}</td>
                {visibleWeekKeys.map(k => {
                  const val = (row.availability || {})[k];
                  return (
                    <td key={k} style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums",
                      color: val ? "#1e2d1a" : "#d0d8cc", fontWeight: val ? 600 : 400 }}>
                      {val ? val.toLocaleString() : "\u2014"}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontSize: 12, color: "#7a8c74", maxWidth: 200 }}>
                  {row.availabilityText || row.comments || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>{"\u2190"} Prev</button>
          <span style={{ fontSize: 13, color: "#7a8c74" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next {"\u2192"}</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAPPING EDITOR ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MappingEditor({ tab, sheets, onSave, onCancel }) {
  const sheetData = sheets?.[tab.tabName] || [];
  const [cfg, setCfg] = useState({ ...tab.config });
  const upd = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));

  const previewRows = sheetData.slice(0, 8);
  const parsed = useMemo(() => parseSheet(sheetData, cfg), [sheetData, cfg]);

  function save() {
    onSave({
      ...tab,
      config: cfg,
      rows: parsed,
      rowCount: parsed.length,
      matched: true,
    });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>Edit Mapping — {tab.supplierKey}</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Tab: "{tab.tabName}"</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} style={BTN}>Save & Apply ({parsed.length} items)</button>
          <button onClick={onCancel} style={BTN_SEC}>Cancel</button>
        </div>
      </div>

      {/* Raw data preview */}
      <SH>Raw Data Preview</SH>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri === (cfg.headerRow ?? 0) ? "#e0f0d8" : ri < (cfg.dataStartRow ?? 1) ? "#f0f0f0" : "#fff" }}>
                <td style={{ padding: "3px 6px", color: "#aabba0", fontWeight: 700, borderRight: "1px solid #e0ead8" }}>{ri}</td>
                {(row || []).slice(0, 20).map((cell, ci) => (
                  <td key={ci} style={{ padding: "3px 6px", borderRight: "1px solid #f0f5ee", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                    background: ci === cfg.plantCol ? "#e8f5e0" : ci === cfg.varietyCol ? "#e0f0f5" : undefined }}>
                    {cell != null ? String(cell).slice(0, 30) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 16 }}>
        Green row = header row. Green column = plant name. Blue column = variety.
      </div>

      {/* Config fields */}
      <SH>Column Mapping</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div>
          <FL>Header Row (0-indexed)</FL>
          <input type="number" value={cfg.headerRow ?? 0} onChange={e => upd("headerRow", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Data Start Row</FL>
          <input type="number" value={cfg.dataStartRow ?? 1} onChange={e => upd("dataStartRow", parseInt(e.target.value) || 1)} style={IS(false)} />
        </div>
        <div>
          <FL>Plant Name Col</FL>
          <input type="number" value={cfg.plantCol ?? 0} onChange={e => upd("plantCol", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Variety Col</FL>
          <input type="number" value={cfg.varietyCol ?? ""} onChange={e => upd("varietyCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Common Name Col</FL>
          <input type="number" value={cfg.commonNameCol ?? ""} onChange={e => upd("commonNameCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Size Col</FL>
          <input type="number" value={cfg.sizeCol ?? ""} onChange={e => upd("sizeCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Form Col</FL>
          <input type="number" value={cfg.formCol ?? ""} onChange={e => upd("formCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Product ID Col</FL>
          <input type="number" value={cfg.productIdCol ?? ""} onChange={e => upd("productIdCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div>
          <FL>Availability Type</FL>
          <select value={cfg.weekType || "weekly"} onChange={e => upd("weekType", e.target.value)} style={IS(false)}>
            <option value="weekly">Weekly (wk14, 15-2026, etc.)</option>
            <option value="monthly">Monthly (MAR, APR, etc.)</option>
            <option value="buckets">Buckets (Ready, 1 Month, Future)</option>
            <option value="text">Text (lead times, descriptions)</option>
            <option value="simple_qty">Simple Quantity</option>
          </select>
        </div>
        <div>
          <FL>Week Start Col</FL>
          <input type="number" value={cfg.weekStartCol ?? 2} onChange={e => upd("weekStartCol", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Week End Col (blank = auto)</FL>
          <input type="number" value={cfg.weekEndCol ?? ""} onChange={e => upd("weekEndCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="Auto" />
        </div>
        <div>
          <FL>Comments Col</FL>
          <input type="number" value={cfg.commentsCol ?? ""} onChange={e => upd("commentsCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1e2d1a" }}>
          <input type="checkbox" checked={cfg.twoColumnLayout || false}
            onChange={e => upd("twoColumnLayout", e.target.checked)} />
          Two-column layout (side-by-side plant lists)
        </label>
      </div>

      {/* Parsed preview */}
      <SH>Parsed Preview ({parsed.length} items)</SH>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Plant</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Variety</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Size</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Availability</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {parsed.slice(0, 10).map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.plantName}</td>
                <td style={{ padding: "6px 10px" }}>{r.variety || ""}</td>
                <td style={{ padding: "6px 10px" }}>{r.size || ""}</td>
                <td style={{ padding: "6px 10px", fontSize: 11 }}>
                  {Object.keys(r.availability || {}).length > 0
                    ? Object.entries(r.availability).slice(0, 5).map(([k, v]) => `${weekLabel(k)}: ${v}`).join(", ")
                    : r.availabilityText || "\u2014"}
                </td>
                <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{r.comments || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {parsed.length > 10 && <div style={{ padding: "8px 10px", fontSize: 12, color: "#aabba0" }}>...and {parsed.length - 10} more</div>}
      </div>
    </div>
  );
}
