import { useState, useMemo, useCallback } from "react";
import { useHpSales, getSupabase } from "./supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const CHART_COLORS = ["#7fb069", "#4a90d9", "#8e44ad", "#c8791a", "#d94f3d", "#2e7d9e", "#1e2d1a", "#c03030", "#e07b39", "#4a7a35"];

export default function HouseplantSales() {
  const { rows: sales, remove, refresh } = useHpSales();
  const [salesView, setSalesView] = useState("dashboard"); // dashboard | table
  const [searchQ, setSearchQ] = useState("");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortCol, setSortCol] = useState("total_sales");
  const [sortDir, setSortDir] = useState("desc");
  const [datePreset, setDatePreset] = useState("all"); // all | custom | preset keys
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showImports, setShowImports] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null); // { rows, fileName }
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [uploadNotes, setUploadNotes] = useState("");

  // Step 1: Parse file, show context form
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.XLSX) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      await new Promise(r => { s.onload = r; document.head.appendChild(s); });
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = window.XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        let headerIdx = 0;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          if ((data[i] || []).some(c => String(c).toLowerCase().includes("sum qty") || String(c).toLowerCase().includes("total sales"))) {
            headerIdx = i; break;
          }
        }

        const rows = [];
        for (let i = headerIdx + 1; i < data.length; i++) {
          const r = data[i] || [];
          const desc = r[2] ? String(r[2]).trim() : null;
          if (!desc) continue;
          rows.push({
            product_id: r[0] ? String(r[0]).trim() : null,
            description: desc,
            size: r[3] ? String(r[3]).trim() : null,
            product_type: r[4] ? String(r[4]).trim() : null,
            category: r[5] ? String(r[5]).trim() : "HOUSEPLANTS",
            class: r[6] ? String(r[6]).trim() : null,
            qty_sold: parseFloat(r[7]) || 0,
            total_sales: parseFloat(r[8]) || 0,
            price_per: parseFloat(r[9]) || null,
          });
        }

        const totalRev = rows.reduce((s, r) => s + r.total_sales, 0);
        const totalQty = rows.reduce((s, r) => s + r.qty_sold, 0);
        setPendingUpload({ rows, fileName: file.name, totalRev, totalQty });
        // Default to previous calendar week (Mon–Sun)
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
        const lastSun = new Date(now);
        lastSun.setDate(now.getDate() - dayOfWeek);
        const lastMon = new Date(lastSun);
        lastMon.setDate(lastSun.getDate() - 6);
        setDateFrom(lastMon.toISOString().slice(0, 10));
        setDateTo(lastSun.toISOString().slice(0, 10));
        setUploadNotes("");
      } catch (err) {
        console.error("Parse error:", err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }, []);

  // Step 2: Confirm with context
  const confirmUpload = useCallback(async () => {
    if (!pendingUpload) return;
    setUploading(true);

    const period = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom || new Date().toISOString().slice(0, 7);
    const sb = getSupabase();
    const rows = pendingUpload.rows.map(r => ({
      id: crypto.randomUUID(),
      ...r,
      report_period: period,
      notes: uploadNotes || null,
    }));

    try {
      if (sb && rows.length > 0) {
        for (let i = 0; i < rows.length; i += 200) {
          await sb.from("hp_sales").insert(rows.slice(i, i + 200));
        }
      }
      refresh();
    } catch (err) {
      console.error("Upload error:", err);
    }
    setPendingUpload(null);
    setUploading(false);
  }, [pendingUpload, dateFrom, dateTo, uploadNotes, refresh]);

  // ── Date range presets ──────────────────────────────────────────────────
  const datePresets = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const dow = now.getDay();

    function fmt(d) { return d.toISOString().slice(0, 10); }
    function weekStart(d) { const r = new Date(d); r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); return r; } // Monday
    function weekEnd(d) { const r = weekStart(d); r.setDate(r.getDate() + 6); return r; } // Sunday

    const thisWeekMon = weekStart(now);
    const lastWeekMon = new Date(thisWeekMon); lastWeekMon.setDate(lastWeekMon.getDate() - 7);
    const lastWeekSun = new Date(lastWeekMon); lastWeekSun.setDate(lastWeekSun.getDate() + 6);

    // Same week last year
    const lastYearNow = new Date(now); lastYearNow.setFullYear(y - 1);
    const sameWeekLYMon = weekStart(lastYearNow);
    const sameWeekLYSun = weekEnd(lastYearNow);

    // Next week last year
    const nextWeekLYMon = new Date(sameWeekLYMon); nextWeekLYMon.setDate(nextWeekLYMon.getDate() + 7);
    const nextWeekLYSun = new Date(nextWeekLYMon); nextWeekLYSun.setDate(nextWeekLYMon.getDate() + 6);

    // Quarters
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(y, q * 3, 1);
    const qEnd = new Date(y, q * 3 + 3, 0);
    const prevQStart = new Date(y, (q - 1) * 3, 1);
    const prevQEnd = new Date(y, q * 3, 0);

    return [
      { id: "all", label: "All Time" },
      { id: "this_week", label: "This Week", from: fmt(thisWeekMon), to: fmt(now) },
      { id: "last_week", label: "Last Week", from: fmt(lastWeekMon), to: fmt(lastWeekSun) },
      { id: "same_week_ly", label: "This Week Last Year", from: fmt(sameWeekLYMon), to: fmt(sameWeekLYSun) },
      { id: "next_week_ly", label: "Next Week Last Year", from: fmt(nextWeekLYMon), to: fmt(nextWeekLYSun) },
      { id: "this_quarter", label: `Q${q + 1} ${y}`, from: fmt(qStart), to: fmt(qEnd) },
      { id: "last_quarter", label: `Q${q} ${y}`, from: fmt(prevQStart), to: fmt(prevQEnd) },
      { id: "this_year", label: `${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
      { id: "last_year", label: `${y - 1}`, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
      { id: "custom", label: "Custom Range" },
    ];
  }, []);

  // Parse report_period "YYYY-MM-DD to YYYY-MM-DD" into dates for filtering
  function periodOverlaps(reportPeriod, fromStr, toStr) {
    if (!reportPeriod || !fromStr) return true;
    const parts = reportPeriod.split(" to ");
    const pFrom = parts[0] || reportPeriod;
    const pTo = parts[1] || pFrom;
    const filterFrom = fromStr;
    const filterTo = toStr || fromStr;
    // Overlap check: period starts before filter ends AND period ends after filter starts
    return pFrom <= filterTo && pTo >= filterFrom;
  }

  const dateFilteredSales = useMemo(() => {
    if (datePreset === "all") return sales;
    const preset = datePresets.find(p => p.id === datePreset);
    const from = datePreset === "custom" ? customFrom : preset?.from;
    const to = datePreset === "custom" ? customTo : preset?.to;
    if (!from) return sales;
    return sales.filter(r => periodOverlaps(r.reportPeriod, from, to));
  }, [sales, datePreset, datePresets, customFrom, customTo]);

  // Group imports by report_period for management
  const imports = useMemo(() => {
    const map = {};
    sales.forEach(r => {
      const period = r.reportPeriod || "Unknown";
      if (!map[period]) map[period] = { period, count: 0, revenue: 0, qty: 0, notes: r.notes || "", ids: [] };
      map[period].count++;
      map[period].revenue += r.totalSales || 0;
      map[period].qty += r.qtySold || 0;
      map[period].ids.push(r.id);
    });
    return Object.values(map).sort((a, b) => b.period.localeCompare(a.period));
  }, [sales]);

  async function deleteImport(period) {
    if (!window.confirm(`Delete all sales data for "${period}"? This cannot be undone.`)) return;
    const sb = getSupabase();
    if (sb) {
      await sb.from("hp_sales").delete().eq("report_period", period);
    } else {
      const matching = sales.filter(r => r.reportPeriod === period);
      for (const r of matching) await remove(r.id);
    }
    refresh();
  }

  const sizes = useMemo(() => [...new Set(dateFilteredSales.map(r => r.size).filter(Boolean))].sort(), [dateFilteredSales]);

  const filtered = useMemo(() => {
    let items = dateFilteredSales;
    if (sizeFilter !== "all") items = items.filter(r => r.size === sizeFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter(r => (r.description || "").toLowerCase().includes(q));
    }
    const copy = [...items];
    copy.sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
      if (typeof av === "number") return sortDir === "desc" ? bv - av : av - bv;
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [dateFilteredSales, searchQ, sizeFilter, sortCol, sortDir]);

  const totalRev = filtered.reduce((s, r) => s + (r.totalSales || 0), 0);
  const totalQty = filtered.reduce((s, r) => s + (r.qtySold || 0), 0);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const thStyle = { padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8", cursor: "pointer", whiteSpace: "nowrap" };

  return (
    <div style={FONT}>
      {/* Summary */}
      <div style={{ ...card, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Total Revenue</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#1e2d1a" }}>${totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Units Sold</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#7fb069" }}>{totalQty.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Products</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#4a90d9" }}>{filtered.length}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {imports.length > 0 && (
            <button onClick={() => setShowImports(s => !s)}
              style={{ ...BTN, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontSize: 12 }}>
              {showImports ? "Hide" : "Manage"} Imports ({imports.length})
            </button>
          )}
          <label style={{ ...BTN, display: "inline-flex", gap: 8, background: "#1e2d1a", opacity: uploading ? 0.5 : 1 }}>
            {uploading ? "Uploading..." : "Upload Sales Report"}
            <input type="file" accept=".xls,.xlsx" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Import history */}
      {showImports && (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 10 }}>Past Imports</div>
          {imports.map(imp => (
            <div key={imp.period} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f5ee" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{imp.period}</div>
                <div style={{ fontSize: 12, color: "#7a8c74" }}>
                  {imp.count} products / {imp.qty.toLocaleString()} units / ${imp.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {imp.notes ? ` — ${imp.notes}` : ""}
                </div>
              </div>
              <button onClick={() => deleteImport(imp.period)}
                style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #f0c8c0", background: "#fff", color: "#d94f3d", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload context modal */}
      {pendingUpload && (
        <div style={{ ...card, borderColor: "#7fb069", padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>Upload: {pendingUpload.fileName}</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 16 }}>
            {pendingUpload.rows.length} products / {pendingUpload.totalQty.toLocaleString()} units / ${pendingUpload.totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 6 }}>Date range</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ ...IS(!!dateFrom), flex: 1 }} />
                <span style={{ color: "#7a8c74", fontSize: 13 }}>to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ ...IS(!!dateTo), flex: 1 }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 6 }}>Variables to consider</div>
              <input value={uploadNotes} onChange={e => setUploadNotes(e.target.value)}
                style={IS(!!uploadNotes)}
                placeholder="e.g. Snowstorm week 3, crop failure on Hoya, holiday weekend..." />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={confirmUpload} disabled={!dateFrom} style={{ ...BTN, opacity: dateFrom ? 1 : 0.5 }}>
              {uploading ? "Importing..." : "Import Sales Data"}
            </button>
            <button onClick={() => setPendingUpload(null)} style={{ ...BTN, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Date filter */}
      {sales.length > 0 && (
        <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "12px 18px" }}>
          {datePresets.map(p => (
            <button key={p.id} onClick={() => setDatePreset(p.id)}
              style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: datePreset === p.id ? 700 : 500,
                background: datePreset === p.id ? "#1e2d1a" : "#fff",
                color: datePreset === p.id ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${datePreset === p.id ? "#1e2d1a" : "#e0ead8"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {p.label}
            </button>
          ))}
          {datePreset === "custom" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: 8 }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 12, fontFamily: "inherit" }} />
              <span style={{ color: "#7a8c74", fontSize: 12 }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 12, fontFamily: "inherit" }} />
            </div>
          )}
          {datePreset !== "all" && (
            <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 8 }}>
              {dateFilteredSales.length} of {sales.length} records
            </span>
          )}
        </div>
      )}

      {/* View toggle */}
      {sales.length > 0 && (
        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          {[{ id: "dashboard", label: "Dashboard" }, { id: "table", label: "Table" }].map(v => (
            <button key={v.id} onClick={() => setSalesView(v.id)}
              style={{ padding: "8px 20px", fontSize: 13, fontWeight: salesView === v.id ? 800 : 600,
                color: salesView === v.id ? "#1e2d1a" : "#7a8c74", background: salesView === v.id ? "#fff" : "none",
                border: salesView === v.id ? "1.5px solid #e0ead8" : "1.5px solid transparent",
                borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {sales.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No sales data loaded</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Upload an AR Sales report to start tracking</div>
        </div>
      ) : salesView === "dashboard" ? (
        <SalesDashboard sales={dateFilteredSales} />
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search products..." style={{ ...IS(!!searchQ), maxWidth: 300 }} />
            <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ ...IS(false), width: "auto", minWidth: 120 }}>
              <option value="all">All Sizes</option>
              {sizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ overflowX: "auto", background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort("description")} style={{ ...thStyle, minWidth: 200 }}>Product {sortCol === "description" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                  <th onClick={() => toggleSort("size")} style={thStyle}>Size</th>
                  <th onClick={() => toggleSort("qtySold")} style={{ ...thStyle, textAlign: "right" }}>Qty {sortCol === "qtySold" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                  <th onClick={() => toggleSort("totalSales")} style={{ ...thStyle, textAlign: "right" }}>Revenue {sortCol === "totalSales" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                  <th onClick={() => toggleSort("pricePer")} style={{ ...thStyle, textAlign: "right" }}>Price {sortCol === "pricePer" ? (sortDir === "asc" ? "\u2191" : "\u2193") : ""}</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Retail @2.5x</th>
                  <th style={thStyle}>Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#1e2d1a", borderBottom: "1px solid #f0f5ee" }}>{r.description}</td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: "#7a8c74", borderBottom: "1px solid #f0f5ee" }}>{r.size || ""}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, textAlign: "right", fontWeight: 600, borderBottom: "1px solid #f0f5ee" }}>{r.qtySold}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, textAlign: "right", fontWeight: 700, color: "#4a7a35", borderBottom: "1px solid #f0f5ee" }}>${(r.totalSales || 0).toFixed(2)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, textAlign: "right", borderBottom: "1px solid #f0f5ee" }}>${(r.pricePer || 0).toFixed(2)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 13, textAlign: "right", color: "#4a90d9", fontWeight: 600, borderBottom: "1px solid #f0f5ee" }}>${((r.pricePer || 0) * 2.5).toFixed(2)}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: "#aabba0", borderBottom: "1px solid #f0f5ee" }}>{r.productType || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SALES DASHBOARD ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function SalesDashboard({ sales }) {
  const [dashSearch, setDashSearch] = useState("");

  const dashFiltered = useMemo(() => {
    if (!dashSearch.trim()) return sales;
    const q = dashSearch.toLowerCase();
    return sales.filter(r =>
      (r.description || "").toLowerCase().includes(q) ||
      (r.productType || "").toLowerCase().includes(q) ||
      (r.size || "").toLowerCase().includes(q)
    );
  }, [sales, dashSearch]);

  const s = dashFiltered; // alias for brevity in memos

  const totalRev = useMemo(() => s.reduce((sum, r) => sum + (r.totalSales || 0), 0), [s]);
  const totalQty = useMemo(() => s.reduce((sum, r) => sum + (r.qtySold || 0), 0), [s]);

  const topByRevenue = useMemo(() => {
    const map = {};
    s.forEach(r => {
      const key = r.description || "Unknown";
      if (!map[key]) map[key] = { name: key, revenue: 0, qty: 0, price: r.pricePer || 0, size: r.size || "" };
      map[key].revenue += r.totalSales || 0;
      map[key].qty += r.qtySold || 0;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  }, [s]);

  const topByVolume = useMemo(() => {
    const map = {};
    s.forEach(r => {
      const key = r.description || "Unknown";
      if (!map[key]) map[key] = { name: key, revenue: 0, qty: 0, price: r.pricePer || 0, size: r.size || "" };
      map[key].revenue += r.totalSales || 0;
      map[key].qty += r.qtySold || 0;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 12);
  }, [s]);

  const bySize = useMemo(() => {
    const map = {};
    s.forEach(r => {
      let size = r.size || "Other";
      const m = size.match(/^(\d+\.?\d*)["\u201d\u2019\s]*\s*(POT|HB)/i);
      if (m) size = `${m[1]}" ${m[2].toUpperCase()}`;
      else if (!/POT|HB|PACK|AIR|MERCH/i.test(size)) size = "Other";
      if (!map[size]) map[size] = { name: size, revenue: 0, qty: 0, products: 0 };
      map[size].revenue += r.totalSales || 0;
      map[size].qty += r.qtySold || 0;
      map[size].products++;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [s]);

  const byPeriod = useMemo(() => {
    const map = {};
    s.forEach(r => {
      const period = r.reportPeriod || "Unknown";
      if (!map[period]) map[period] = { name: period, revenue: 0, qty: 0, notes: r.notes || "" };
      map[period].revenue += r.totalSales || 0;
      map[period].qty += r.qtySold || 0;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [s]);

  const byPriceTier = useMemo(() => {
    const tiers = [
      { name: "Under $2", min: 0, max: 2, revenue: 0, qty: 0, count: 0 },
      { name: "$2-$4", min: 2, max: 4, revenue: 0, qty: 0, count: 0 },
      { name: "$4-$8", min: 4, max: 8, revenue: 0, qty: 0, count: 0 },
      { name: "$8-$15", min: 8, max: 15, revenue: 0, qty: 0, count: 0 },
      { name: "$15+", min: 15, max: 9999, revenue: 0, qty: 0, count: 0 },
    ];
    s.forEach(r => {
      const price = r.pricePer || 0;
      const tier = tiers.find(t => price >= t.min && price < t.max);
      if (tier) { tier.revenue += r.totalSales || 0; tier.qty += r.qtySold || 0; tier.count++; }
    });
    return tiers.filter(t => t.revenue > 0);
  }, [s]);

  const highMargin = useMemo(() => {
    const map = {};
    s.forEach(r => {
      const key = r.description || "Unknown";
      if (!map[key]) map[key] = { name: key, price: r.pricePer || 0, qty: 0, revenue: 0, size: r.size || "", retail: (r.pricePer || 0) * 2.5 };
      map[key].qty += r.qtySold || 0;
      map[key].revenue += r.totalSales || 0;
    });
    return Object.values(map).filter(r => r.qty >= 3).sort((a, b) => b.price - a.price).slice(0, 8);
  }, [s]);

  const fmt$ = (n) => "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const shortName = (n) => n.length > 28 ? n.slice(0, 26) + "..." : n;

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: "#1e2d1a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#c8e6b8" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" && p.name.toLowerCase().includes("rev") ? fmt$(p.value) : p.value.toLocaleString()}</div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* Search + summary */}
      <div style={{ ...card, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", padding: "14px 18px" }}>
        <input value={dashSearch} onChange={e => setDashSearch(e.target.value)}
          placeholder="Search products... (e.g. Philodendron, Hoya, Ficus)"
          style={{ ...IS(!!dashSearch), maxWidth: 350, fontSize: 14 }} />
        {dashSearch && (
          <div style={{ display: "flex", gap: 16 }}>
            <div><span style={{ fontSize: 11, color: "#7a8c74" }}>Matches:</span> <span style={{ fontWeight: 800, color: "#1e2d1a" }}>{s.length}</span></div>
            <div><span style={{ fontSize: 11, color: "#7a8c74" }}>Revenue:</span> <span style={{ fontWeight: 800, color: "#4a7a35" }}>${totalRev.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div><span style={{ fontSize: 11, color: "#7a8c74" }}>Units:</span> <span style={{ fontWeight: 800, color: "#4a90d9" }}>{totalQty.toLocaleString()}</span></div>
            <button onClick={() => setDashSearch("")} style={{ background: "none", border: "none", color: "#7a8c74", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Clear</button>
          </div>
        )}
      </div>

      {/* Top row: Revenue by product + Revenue by size */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Top 12 by Revenue */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Top Products by Revenue</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topByRevenue} layout="vertical" margin={{ left: 120, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" tickFormatter={v => fmt$(v)} tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={120} tickFormatter={shortName} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#7fb069" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by Size (Pie) */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Revenue by Pot Size</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={bySize} layout="vertical" margin={{ left: 80, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" tickFormatter={v => fmt$(v)} tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" radius={[0, 6, 6, 0]}>
                {bySize.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second row: Volume chart + Price tier */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Top 12 by Volume */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Top Products by Volume</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topByVolume} layout="vertical" margin={{ left: 120, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={120} tickFormatter={shortName} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="qty" name="Units Sold" fill="#4a90d9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Price Tier Breakdown */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Revenue by Price Tier</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byPriceTier} margin={{ left: 10, right: 10 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fontSize: 10, fill: "#7a8c74" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#8e44ad" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 12 }}>
            {byPriceTier.map((t, i) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, borderBottom: "1px solid #f0f5ee" }}>
                <span style={{ color: "#1e2d1a", fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: "#7a8c74" }}>{t.count} products / {t.qty} units</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Third row: High value items + Period trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* High-value products */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 12 }}>Highest Wholesale Price (3+ sold)</div>
          {highMargin.map((r, i) => (
            <div key={r.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f5ee" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{r.size} / {r.qty} sold / {fmt$(r.revenue)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#4a7a35" }}>${r.price.toFixed(2)}</div>
                <div style={{ fontSize: 11, color: "#4a90d9" }}>Retail: ${r.retail.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Period summary */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 12 }}>Sales by Period</div>
          {byPeriod.length > 1 && (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byPeriod} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#7a8c74" }} />
                <YAxis tickFormatter={v => fmt$(v)} tick={{ fontSize: 10, fill: "#7a8c74" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#7fb069" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {byPeriod.map((p, i) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #f0f5ee" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{p.name}</div>
                {p.notes && <div style={{ fontSize: 11, color: "#c8791a", marginTop: 2 }}>{p.notes}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4a7a35" }}>{fmt$(p.revenue)}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{p.qty.toLocaleString()} units</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
