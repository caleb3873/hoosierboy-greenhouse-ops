import { useState, useMemo, useCallback, useEffect } from "react";
import { useHpSales, getSupabase } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

export default function HouseplantSales() {
  const { rows: sales, refresh } = useHpSales();
  const [searchQ, setSearchQ] = useState("");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [sortCol, setSortCol] = useState("total_sales");
  const [sortDir, setSortDir] = useState("desc");
  const [uploading, setUploading] = useState(false);

  // Upload .xls sales report
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);

    // Load xlrd-like parsing via XLSX
    if (!window.XLSX) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      await new Promise(r => { s.onload = r; document.head.appendChild(s); });
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = window.XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        // Find header row
        let headerIdx = 0;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const row = data[i] || [];
          if (row.some(c => String(c).toLowerCase().includes("sum qty") || String(c).toLowerCase().includes("total sales"))) {
            headerIdx = i; break;
          }
        }

        const period = new Date().toISOString().slice(0, 7); // YYYY-MM
        const sb = getSupabase();
        const rows = [];

        for (let i = headerIdx + 1; i < data.length; i++) {
          const r = data[i] || [];
          const desc = r[2] ? String(r[2]).trim() : null;
          if (!desc) continue;
          rows.push({
            id: crypto.randomUUID(),
            product_id: r[0] ? String(r[0]).trim() : null,
            description: desc,
            size: r[3] ? String(r[3]).trim() : null,
            product_type: r[4] ? String(r[4]).trim() : null,
            category: r[5] ? String(r[5]).trim() : "HOUSEPLANTS",
            class: r[6] ? String(r[6]).trim() : null,
            qty_sold: parseFloat(r[7]) || 0,
            total_sales: parseFloat(r[8]) || 0,
            price_per: parseFloat(r[9]) || null,
            report_period: period,
          });
        }

        if (sb && rows.length > 0) {
          for (let i = 0; i < rows.length; i += 200) {
            await sb.from("hp_sales").insert(rows.slice(i, i + 200));
          }
        }
        refresh();
      } catch (err) {
        console.error("Upload error:", err);
      }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }, [refresh]);

  const sizes = useMemo(() => [...new Set(sales.map(r => r.size).filter(Boolean))].sort(), [sales]);

  const filtered = useMemo(() => {
    let items = sales;
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
  }, [sales, searchQ, sizeFilter, sortCol, sortDir]);

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
        <div style={{ marginLeft: "auto" }}>
          <label style={{ ...BTN, display: "inline-flex", gap: 8, background: "#1e2d1a", opacity: uploading ? 0.5 : 1 }}>
            {uploading ? "Uploading..." : "Upload Sales Report"}
            <input type="file" accept=".xls,.xlsx" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search products..." style={{ ...IS(!!searchQ), maxWidth: 300 }} />
        <select value={sizeFilter} onChange={e => setSizeFilter(e.target.value)} style={{ ...IS(false), width: "auto", minWidth: 120 }}>
          <option value="all">All Sizes</option>
          {sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {sales.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No sales data loaded</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Upload an AR Sales report to start tracking</div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
