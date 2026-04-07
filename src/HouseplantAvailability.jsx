import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useHpSuppliers, useHpAvailability, useHpPricing, useHpOrderItems, getSupabase, authFetch } from "./supabase";
import { readWorkbook, parseSheet } from "./hpParsers";
import { matchSupplierConfig } from "./hpDefaultConfigs";
import HouseplantSales from "./HouseplantSales";
import HouseplantProductLines from "./HouseplantProductLines";
import HouseplantLibrary from "./HouseplantLibrary";

// ── Design tokens ────────────────────────────────────────────────────────────
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

// ── Week label display ───────────────────────────────────────────────────────
function weekLabel(key) {
  if (!key) return "";
  if (key === "ready") return "Ready";
  if (key === "1month") return "1 Mo";
  if (key === "future") return "Future";
  if (key === "total") return "Qty";
  if (key.startsWith("wk")) {
    const num = key.replace("wk", "");
    return num.includes("-") ? `Wk${num}` : `Wk${num}`;
  }
  if (key.startsWith("month_")) {
    const m = key.replace("month_", "");
    return m.charAt(0).toUpperCase() + m.slice(1);
  }
  return key;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function HouseplantAvailability() {
  const xlsxReady = useXLSX();
  const { rows: suppliers, upsert: upsertSupplier, refresh: refreshSuppliers } = useHpSuppliers();
  const { rows: availability, insert: insertAvail, remove: removeAvail, refresh: refreshAvail } = useHpAvailability();
  const { rows: pricing, upsert: upsertPrice } = useHpPricing();
  const { rows: orderItems, upsert: upsertOrder, remove: removeOrder } = useHpOrderItems();

  const [section, setSectionState] = useState(() => {
    try { return localStorage.getItem("gh_hp_section") || "sales"; } catch { return "sales"; }
  });
  const setSection = (s) => {
    setSectionState(s);
    try { localStorage.setItem("gh_hp_section", s); } catch {}
  };
  const [activeTab, setActiveTab] = useState(null); // null = summary
  const [searchQ, setSearchQ] = useState("");
  const [uploadState, setUploadState] = useState(null);
  const [mappingSupplier, setMappingSupplier] = useState(null);
  const [view, setView] = useState("browse"); // "browse" | "mapping"
  const [sendModal, setSendModal] = useState(null); // { supplierName, to, cc, subject, body, sending, sent, error }

  // ── Group availability by supplier ───────────────────────────────────────
  const bySupplier = useMemo(() => {
    const map = {};
    availability.forEach(r => {
      const key = r.supplierName || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [availability]);

  const supplierNames = useMemo(() => Object.keys(bySupplier).sort(), [bySupplier]);

  // ── Search filter ────────────────────────────────────────────────────────
  const searchFiltered = useMemo(() => {
    if (!searchQ.trim()) return bySupplier;
    const q = searchQ.toLowerCase();
    const result = {};
    for (const [sup, rows] of Object.entries(bySupplier)) {
      const matched = rows.filter(r =>
        (r.plantName || "").toLowerCase().includes(q) ||
        (r.variety || "").toLowerCase().includes(q) ||
        (r.commonName || "").toLowerCase().includes(q)
      );
      if (matched.length > 0) result[sup] = matched;
    }
    return result;
  }, [bySupplier, searchQ]);

  // Supplier match counts for tab badges
  const supplierCounts = useMemo(() => {
    const counts = {};
    for (const name of supplierNames) {
      counts[name] = searchFiltered[name]?.length || 0;
    }
    return counts;
  }, [supplierNames, searchFiltered]);

  // ── Pricing lookup ───────────────────────────────────────────────────────
  const priceMap = useMemo(() => {
    const map = {};
    pricing.forEach(p => {
      const key = `${p.supplierName}||${p.plantName}||${p.variety || ""}`;
      map[key] = parseFloat(p.unitPrice) || 0;
    });
    return map;
  }, [pricing]);

  function getPrice(supplierName, plantName, variety) {
    return priceMap[`${supplierName}||${plantName}||${variety || ""}`] || 0;
  }

  // ── Order lookup ─────────────────────────────────────────────────────────
  const orderMap = useMemo(() => {
    const map = {};
    orderItems.forEach(o => {
      const key = `${o.supplierName}||${o.plantName}||${o.variety || ""}||${o.weekKey}`;
      map[key] = o;
    });
    return map;
  }, [orderItems]);

  function getOrderQty(supplierName, plantName, variety, weekKey) {
    const o = orderMap[`${supplierName}||${plantName}||${variety || ""}||${weekKey}`];
    return o?.quantity || 0;
  }

  function setOrderQty(row, weekKey, qty) {
    const key = `${row.supplierName}||${row.plantName}||${row.variety || ""}||${weekKey}`;
    const existing = orderMap[key];
    if (qty <= 0 && existing) {
      removeOrder(existing.id);
      return;
    }
    if (qty <= 0) return;
    const price = getPrice(row.supplierName, row.plantName, row.variety);
    upsertOrder({
      id: existing?.id || crypto.randomUUID(),
      broker: row.broker,
      supplierName: row.supplierName,
      plantName: row.plantName,
      variety: row.variety || null,
      size: row.size || null,
      form: row.form || null,
      weekKey,
      quantity: qty,
      unitPrice: price || null,
    });
  }

  // ── Price setter (saves to hp_pricing) ────────────────────────────────────
  function setPrice(row, unitPrice) {
    const key = `${row.supplierName}||${row.plantName}||${row.variety || ""}`;
    const existing = pricing.find(p =>
      p.supplierName === row.supplierName && p.plantName === row.plantName && (p.variety || "") === (row.variety || "")
    );
    if (unitPrice <= 0 && existing) {
      // Could remove, but just set to 0
    }
    upsertPrice({
      id: existing?.id || crypto.randomUUID(),
      broker: row.broker,
      supplierName: row.supplierName,
      plantName: row.plantName,
      variety: row.variety || null,
      unitPrice: unitPrice || 0,
    });
  }

  // ── Order totals per supplier ────────────────────────────────────────────
  const ordersBySupplier = useMemo(() => {
    const map = {};
    orderItems.forEach(o => {
      if (!map[o.supplierName]) map[o.supplierName] = [];
      map[o.supplierName].push(o);
    });
    return map;
  }, [orderItems]);

  const totalOrderItems = orderItems.length;

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadState({ broker: "Express Seed", status: "reading" });
    try {
      const sheets = await readWorkbook(file);
      const tabNames = Object.keys(sheets).filter(n => n !== "Directory");
      const parsed = tabNames.map(tabName => {
        const match = matchSupplierConfig(tabName);
        const existing = suppliers.find(s => s.tabName === tabName || s.name === (match?.key || tabName));
        const config = existing?.formatConfig || match?.config || {};
        const rows = parseSheet(sheets[tabName], config);
        return { tabName, supplierKey: match?.key || tabName, config, rows, matched: !!match, existing, rowCount: rows.length };
      });
      setUploadState({ broker: "Express Seed", status: "preview", sheets, parsed });
    } catch (err) {
      setUploadState({ broker: "Express Seed", status: "error", error: err.message });
    }
    e.target.value = "";
  }, [suppliers]);

  // ── Import confirmed ─────────────────────────────────────────────────────
  const handleImportConfirm = useCallback(async () => {
    if (!uploadState?.parsed) return;
    setUploadState(prev => ({ ...prev, status: "importing" }));
    const batchId = crypto.randomUUID();
    const broker = uploadState.broker;

    try {
      const sb = getSupabase();
      let useDirectDb = false;
      if (sb) {
        const { error: testErr } = await sb.from("hp_availability").select("id").limit(1);
        useDirectDb = !testErr;
      }

      if (useDirectDb) {
        await sb.from("hp_availability").delete().eq("broker", broker);
      } else {
        const existing = availability.filter(r => r.broker === broker);
        for (const row of existing) await removeAvail(row.id);
      }

      const supplierIdMap = {};
      for (const tab of uploadState.parsed) {
        const supplierId = tab.existing?.id || crypto.randomUUID();
        supplierIdMap[tab.supplierKey] = supplierId;
        if (useDirectDb) {
          const { error } = await sb.from("hp_suppliers").upsert({
            id: supplierId, broker, name: tab.supplierKey, tab_name: tab.tabName, format_config: tab.config,
          }, { onConflict: "broker,name" });
          if (error) {
            const { data } = await sb.from("hp_suppliers").select("id").eq("broker", broker).eq("name", tab.supplierKey).single();
            if (data) supplierIdMap[tab.supplierKey] = data.id;
          }
        } else {
          await upsertSupplier({ id: supplierId, broker, name: tab.supplierKey, tabName: tab.tabName, formatConfig: tab.config });
        }
      }

      const allRows = [];
      for (const tab of uploadState.parsed) {
        const supplierId = supplierIdMap[tab.supplierKey];
        for (const row of tab.rows) {
          allRows.push({
            id: crypto.randomUUID(), supplier_id: supplierId, broker, supplier_name: tab.supplierKey,
            plant_name: row.plantName, variety: row.variety, common_name: row.commonName,
            size: row.size, form: row.form, product_id: row.productId, location: row.location,
            availability: row.availability, availability_text: row.availabilityText,
            comments: row.comments, upload_batch: batchId,
          });
        }
      }

      if (useDirectDb) {
        for (let i = 0; i < allRows.length; i += 500) {
          const chunk = allRows.slice(i, i + 500);
          const { error } = await sb.from("hp_availability").insert(chunk);
          if (error) throw error;
        }
      } else {
        for (const row of allRows) await insertAvail(row);
      }

      refreshSuppliers();
      refreshAvail();
      setUploadState(null);
    } catch (err) {
      setUploadState(prev => ({ ...prev, status: "error", error: err.message }));
    }
  }, [uploadState, availability, suppliers, upsertSupplier, insertAvail, removeAvail, refreshSuppliers, refreshAvail]);

  // ── Excel download ───────────────────────────────────────────────────────
  function downloadOrders(supplierName) {
    const XLSX = window.XLSX;
    if (!XLSX) return;
    const items = supplierName ? (ordersBySupplier[supplierName] || []) : orderItems;
    if (items.length === 0) return;

    const wb = XLSX.utils.book_new();
    const broker = "Express Seed"; // TODO: dynamic when multi-broker

    const grouped = {};
    items.forEach(o => {
      if (!grouped[o.supplierName]) grouped[o.supplierName] = [];
      grouped[o.supplierName].push(o);
    });

    for (const [sup, rows] of Object.entries(grouped)) {
      // Get unique weeks ordered, sorted
      const weeks = [...new Set(rows.map(r => r.weekKey))].sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.replace(/\D/g, "")) || 0;
        return na - nb;
      });

      // Group by plant+variety
      const byPlant = {};
      rows.forEach(r => {
        const key = `${r.plantName}||${r.variety || ""}`;
        if (!byPlant[key]) byPlant[key] = { ...r, weekOrders: {} };
        byPlant[key].weekOrders[r.weekKey] = r.quantity;
      });

      // Header rows
      const headerRow1 = ["Broker", "Supplier", "", "", "", ""];
      const headerRow2 = [broker, sup, "", "", "", ""];
      const headerRow3 = [];
      const colHeaders = ["Plant", "Variety", "Size", "Form", "Unit Price", "Notes"];
      weeks.forEach(wk => { colHeaders.push(weekLabel(wk) + " (Arrival)"); colHeaders.push("Order Qty"); colHeaders.push("Cost"); });
      colHeaders.push("Total Cost");

      const dataRows = Object.values(byPlant).map(r => {
        const price = getPrice(r.supplierName, r.plantName, r.variety) || parseFloat(r.unitPrice) || 0;
        const row = [r.plantName, r.variety || "", r.size || "", r.form || "", price || "", ""];
        let rowTotal = 0;
        weeks.forEach(wk => {
          const qty = r.weekOrders[wk] || 0;
          const cost = qty * price;
          rowTotal += cost;
          row.push(""); // arrival week placeholder
          row.push(qty || "");
          row.push(cost || "");
        });
        row.push(rowTotal || "");
        return row;
      });

      const sheetData = [headerRow1, headerRow2, [], colHeaders, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, sup.slice(0, 31));
    }

    const filename = supplierName
      ? `Order_${broker}_${supplierName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Orders_${broker}_All_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // ── Build Excel as base64 for email attachment ────────────────────────────
  function buildOrderExcel(supplierName) {
    const XLSX = window.XLSX;
    if (!XLSX) return null;
    const items = supplierName ? (ordersBySupplier[supplierName] || []) : orderItems;
    if (items.length === 0) return null;

    const broker = "Express Seed";
    const wb = XLSX.utils.book_new();

    const grouped = {};
    items.forEach(o => {
      if (!grouped[o.supplierName]) grouped[o.supplierName] = [];
      grouped[o.supplierName].push(o);
    });

    for (const [sup, rows] of Object.entries(grouped)) {
      const weeks = [...new Set(rows.map(r => r.weekKey))].sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.replace(/\D/g, "")) || 0;
        return na - nb;
      });

      const byPlant = {};
      rows.forEach(r => {
        const key = `${r.plantName}||${r.variety || ""}`;
        if (!byPlant[key]) byPlant[key] = { ...r, weekOrders: {} };
        byPlant[key].weekOrders[r.weekKey] = r.quantity;
      });

      const colHeaders = ["Plant", "Variety", "Size", "Form", "Unit Price", "Notes"];
      weeks.forEach(wk => { colHeaders.push(weekLabel(wk) + " (Arrival)"); colHeaders.push("Order Qty"); colHeaders.push("Cost"); });
      colHeaders.push("Total Cost");

      const dataRows = Object.values(byPlant).map(r => {
        const price = getPrice(r.supplierName, r.plantName, r.variety) || parseFloat(r.unitPrice) || 0;
        const row = [r.plantName, r.variety || "", r.size || "", r.form || "", price || "", ""];
        let rowTotal = 0;
        weeks.forEach(wk => {
          const qty = r.weekOrders[wk] || 0;
          const cost = qty * price;
          rowTotal += cost;
          row.push("");
          row.push(qty || "");
          row.push(cost || "");
        });
        row.push(rowTotal || "");
        return row;
      });

      const sheetData = [[`Broker: ${broker}`, `Supplier: ${sup}`], [], colHeaders, ...dataRows];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, sup.slice(0, 31));
    }

    const xlsxData = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const filename = supplierName
      ? `Order_${broker}_${supplierName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Orders_${broker}_All_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { base64: xlsxData, filename };
  }

  function openSendModal(supplierName) {
    const items = supplierName ? (ordersBySupplier[supplierName] || []) : orderItems;
    const totalQty = items.reduce((s, o) => s + o.quantity, 0);
    const totalCost = items.reduce((s, o) => s + (o.quantity * (parseFloat(o.unitPrice) || 0)), 0);

    setSendModal({
      supplierName: supplierName || "All Suppliers",
      to: "",
      cc: "",
      subject: `Order — ${supplierName || "Multiple Suppliers"} — Schlegel Greenhouse`,
      body: `Hi,\n\nPlease find our order attached.\n\n${totalQty} total units${totalCost > 0 ? ` / $${totalCost.toFixed(2)}` : ""}.\n\nPlease confirm availability and expected ship dates.\n\nThank you,\nSchlegel Greenhouse`,
      sending: false,
      sent: false,
      error: null,
    });
  }

  async function handleSendOrder() {
    if (!sendModal) return;
    setSendModal(prev => ({ ...prev, sending: true, error: null }));

    const excel = buildOrderExcel(sendModal.supplierName === "All Suppliers" ? null : sendModal.supplierName);
    if (!excel) {
      setSendModal(prev => ({ ...prev, sending: false, error: "Failed to generate Excel" }));
      return;
    }

    try {
      const resp = await authFetch("/api/send-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendModal.to,
          cc: sendModal.cc || undefined,
          subject: sendModal.subject,
          body: sendModal.body.replace(/\n/g, "<br>"),
          attachment: excel.base64,
          filename: excel.filename,
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setSendModal(prev => ({ ...prev, sending: false, sent: true }));
      } else {
        setSendModal(prev => ({ ...prev, sending: false, error: data.error || "Send failed" }));
      }
    } catch (err) {
      setSendModal(prev => ({ ...prev, sending: false, error: err.message }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  const SECTIONS = [
    { id: "sales", label: "Sales" },
    { id: "availability", label: "Availability" },
    { id: "products", label: "Product Lines" },
    { id: "library", label: "Culture Guide" },
  ];

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Send order modal */}
      {sendModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => !sendModal.sending && setSendModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 520, width: "90%" }}>
            {sendModal.sent ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#4a7a35", marginBottom: 8 }}>Order Sent</div>
                <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>Email with Excel attachment sent to {sendModal.to}</div>
                <button onClick={() => setSendModal(null)} style={BTN}>Done</button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>
                  Send Order — {sendModal.supplierName}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>To *</div>
                  <input value={sendModal.to} onChange={e => setSendModal(p => ({ ...p, to: e.target.value }))}
                    placeholder="broker@email.com" style={IS(!!sendModal.to)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>CC</div>
                  <input value={sendModal.cc} onChange={e => setSendModal(p => ({ ...p, cc: e.target.value }))}
                    placeholder="optional — your email to get a copy" style={IS(false)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>Subject</div>
                  <input value={sendModal.subject} onChange={e => setSendModal(p => ({ ...p, subject: e.target.value }))}
                    style={IS(false)} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", marginBottom: 4 }}>Message</div>
                  <textarea value={sendModal.body} onChange={e => setSendModal(p => ({ ...p, body: e.target.value }))}
                    rows={6} style={{ ...IS(false), resize: "vertical", fontFamily: "inherit" }} />
                </div>
                <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#4a7a35" }}>
                  Excel order sheet will be attached automatically
                </div>
                {sendModal.error && (
                  <div style={{ background: "#fde8e8", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#d94f3d" }}>
                    {sendModal.error}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={handleSendOrder} disabled={!sendModal.to || sendModal.sending}
                    style={{ ...BTN, flex: 1, opacity: !sendModal.to || sendModal.sending ? 0.5 : 1 }}>
                    {sendModal.sending ? "Sending..." : "Send Order"}
                  </button>
                  <button onClick={() => setSendModal(null)} style={BTN_SEC}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0ead8", marginBottom: 20 }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ padding: "12px 22px", fontSize: 14, fontWeight: section === s.id ? 800 : 600,
              color: section === s.id ? "#1e2d1a" : "#7a8c74", background: "none", border: "none",
              borderBottom: section === s.id ? "3px solid #7fb069" : "3px solid transparent",
              cursor: "pointer", fontFamily: "inherit" }}>
            {s.label}
          </button>
        ))}
      </div>

      {section === "sales" && <HouseplantSales />}
      {section === "products" && <HouseplantProductLines />}
      {section === "library" && <HouseplantLibrary />}

      {section === "availability" && <>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, fontWeight: 400, color: "#1a2a1a" }}>
            Availability
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            {availability.length} items / {supplierNames.length} suppliers
            {totalOrderItems > 0 && <span style={{ color: "#7fb069", fontWeight: 700 }}> / {totalOrderItems} items in cart</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {totalOrderItems > 0 && (
            <button onClick={() => downloadOrders(activeTab)} style={BTN}>
              {activeTab ? `Download ${activeTab} Order` : "Download All Orders"}
            </button>
          )}
          <label style={{ ...BTN, display: "flex", alignItems: "center", gap: 8, opacity: xlsxReady ? 1 : 0.5, background: "#1e2d1a" }}>
            Upload Availability
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={handleFileUpload}
              disabled={!xlsxReady} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 16 }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
          placeholder="Search plants across all suppliers..."
          style={{ ...IS(!!searchQ), fontSize: 15, maxWidth: 500 }} />
      </div>

      {/* Upload states */}
      {uploadState && uploadState.status === "preview" && (
        <UploadPreview state={uploadState} onConfirm={handleImportConfirm}
          onCancel={() => setUploadState(null)}
          onEditMapping={(tab) => { setMappingSupplier(tab); setView("mapping"); }} />
      )}
      {uploadState && uploadState.status === "importing" && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a" }}>Importing availability...</div>
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
        <MappingEditor tab={mappingSupplier} sheets={uploadState?.sheets}
          onSave={(updatedTab) => {
            setUploadState(prev => ({ ...prev, parsed: prev.parsed.map(t => t.tabName === updatedTab.tabName ? updatedTab : t) }));
            setView("browse");
          }}
          onCancel={() => setView("browse")} />
      )}

      {/* Tab bar */}
      {view === "browse" && !uploadState && availability.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0ead8", marginBottom: 16, overflowX: "auto" }}>
            <button onClick={() => setActiveTab(null)}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: activeTab === null ? 800 : 600,
                color: activeTab === null ? "#1e2d1a" : "#7a8c74", background: "none", border: "none",
                borderBottom: activeTab === null ? "3px solid #7fb069" : "3px solid transparent",
                cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>
              Summary
            </button>
            {supplierNames.map(name => {
              const count = supplierCounts[name] || 0;
              const hasOrders = (ordersBySupplier[name]?.length || 0) > 0;
              const dimmed = searchQ && count === 0;
              return (
                <button key={name} onClick={() => !dimmed && setActiveTab(name)}
                  style={{
                    padding: "10px 14px", fontSize: 12, fontWeight: activeTab === name ? 800 : 600,
                    color: dimmed ? "#c8d8c0" : activeTab === name ? "#1e2d1a" : "#7a8c74",
                    background: "none", border: "none",
                    borderBottom: activeTab === name ? "3px solid #7fb069" : "3px solid transparent",
                    cursor: dimmed ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                  {name}
                  {searchQ && count > 0 && <span style={{ background: "#e0f0d8", color: "#4a7a35", borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{count}</span>}
                  {hasOrders && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#7fb069", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Summary view */}
          {activeTab === null && (
            <SummaryView
              supplierNames={supplierNames}
              bySupplier={searchFiltered}
              ordersBySupplier={ordersBySupplier}
              onSelectSupplier={setActiveTab}
              onDownload={downloadOrders}
              xlsxReady={xlsxReady}
              handleFileUpload={handleFileUpload}
              totalAvailability={availability.length}
            />
          )}

          {/* Supplier tab view */}
          {activeTab && (
            <SupplierTab
              supplierName={activeTab}
              rows={searchFiltered[activeTab] || []}
              orders={ordersBySupplier[activeTab] || []}
              getPrice={getPrice}
              getOrderQty={getOrderQty}
              setOrderQty={setOrderQty}
              setPrice={setPrice}
              onDownload={() => downloadOrders(activeTab)}
              onSendOrder={() => openSendModal(activeTab)}
              weekLabel={weekLabel}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {availability.length === 0 && !uploadState && (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No availability loaded</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20 }}>
            Upload an Express Seed availability spreadsheet to get started.
          </div>
          <label style={{ ...BTN, display: "inline-flex", cursor: xlsxReady ? "pointer" : "wait" }}>
            Upload Availability File
            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileUpload} disabled={!xlsxReady} style={{ display: "none" }} />
          </label>
        </div>
      )}
      </>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SUMMARY VIEW ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function SummaryView({ supplierNames, bySupplier, ordersBySupplier, onSelectSupplier, onDownload, totalAvailability }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {supplierNames.map(name => {
          const rows = bySupplier[name] || [];
          const orders = ordersBySupplier[name] || [];
          const orderTotal = orders.reduce((sum, o) => sum + (o.quantity * (parseFloat(o.unitPrice) || 0)), 0);
          return (
            <div key={name} onClick={() => onSelectSupplier(name)}
              style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all .15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#7fb069"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e0ead8"; }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a", marginBottom: 4 }}>{name}</div>
              <div style={{ fontSize: 12, color: "#7a8c74" }}>{rows.length} items available</div>
              {orders.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ background: "#e0f0d8", color: "#4a7a35", borderRadius: 10, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                    {orders.length} ordered
                  </span>
                  {orderTotal > 0 && (
                    <span style={{ fontSize: 12, color: "#4a7a35", fontWeight: 700 }}>
                      ${orderTotal.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
              {rows.length > 0 && (
                <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>
                  {rows.slice(0, 4).map(r => r.plantName).join(", ")}{rows.length > 4 ? "..." : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SUPPLIER TAB ──────────────────────────────────────────────────────────────
// Layout: Identifying cols → Price (editable) → [Avail | Order] per week
// AG 2 gets section headers. Text-only suppliers get order+price at far right.
// ══════════════════════════════════════════════════════════════════════════════
function SupplierTab({ supplierName, rows, orders, getPrice, getOrderQty, setOrderQty, setPrice, onDownload, onSendOrder, weekLabel }) {
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  useEffect(() => setPage(0), [supplierName, rows]);

  const weekKeys = useMemo(() => {
    const keys = new Set();
    rows.forEach(r => Object.keys(r.availability || {}).forEach(k => keys.add(k)));
    const arr = Array.from(keys);
    arr.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
    return arr;
  }, [rows]);

  const isTextOnly = weekKeys.length === 0 && rows.some(r => r.availabilityText);
  const isSimpleQty = weekKeys.length > 0 && weekKeys.every(k => k === "total");
  const hasSections = rows.some(r => r.section);
  const hasVariety = rows.some(r => r.variety);
  const hasCommonName = rows.some(r => r.commonName);
  const hasSize = rows.some(r => r.size);
  const hasForm = rows.some(r => r.form);
  const hasLocation = rows.some(r => r.location);
  const hasProductId = rows.some(r => r.productId);
  const hasComments = rows.some(r => r.comments);

  const paged = rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(rows.length / PER_PAGE);
  const orderCount = orders.length;

  const thStyle = { padding: "8px 8px", textAlign: "left", fontSize: 10, fontWeight: 800,
    color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5,
    borderBottom: "2px solid #e0ead8", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#fff", zIndex: 1 };
  const tdStyle = { padding: "6px 8px", fontSize: 12, color: "#1e2d1a", borderBottom: "1px solid #f0f5ee" };
  const orderInputStyle = (hasVal) => ({
    width: 50, padding: "3px 5px", borderRadius: 5, fontSize: 11, textAlign: "right",
    border: hasVal ? "1.5px solid #7fb069" : "1px solid #e0ead8",
    background: hasVal ? "#fff" : "#fafcf8", color: "#1e2d1a", outline: "none", fontFamily: "inherit",
  });
  const priceInputStyle = (hasVal) => ({
    width: 58, padding: "3px 5px", borderRadius: 5, fontSize: 11, textAlign: "right",
    border: hasVal ? "1.5px solid #4a90d9" : "1px solid #e0ead8",
    background: hasVal ? "#f0f4ff" : "#fafcf8", color: "#1e2d1a", outline: "none", fontFamily: "inherit",
  });

  // Track current section for section headers
  let lastSection = null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>{supplierName}</span>
          <span style={{ fontSize: 13, color: "#7a8c74", marginLeft: 10 }}>{rows.length} items</span>
        </div>
        {orderCount > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onSendOrder} style={{ ...BTN, background: "#1e2d1a" }}>
              Email Order
            </button>
            <button onClick={onDownload} style={BTN_SEC}>
              Download Excel
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: 40, color: "#7a8c74" }}>No matching items</div>
      ) : (
        <div style={{ overflowX: "auto", background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, minWidth: 160 }}>Plant</th>
                {hasVariety && <th style={thStyle}>Variety</th>}
                {hasCommonName && <th style={thStyle}>Common Name</th>}
                {hasSize && <th style={thStyle}>Size</th>}
                {hasForm && <th style={thStyle}>Form</th>}
                {hasLocation && <th style={thStyle}>Location</th>}
                {hasProductId && <th style={thStyle}>ID</th>}
                <th style={{ ...thStyle, textAlign: "right", background: "#f0f4ff", color: "#4a6a9a", minWidth: 65 }}>Price</th>
                {isTextOnly && (
                  <>
                    <th style={thStyle}>Availability</th>
                    <th style={{ ...thStyle, background: "#f8fcf6", color: "#4a7a35", minWidth: 55 }}>Order</th>
                  </>
                )}
                {isSimpleQty && (
                  <>
                    <th style={{ ...thStyle, textAlign: "right", minWidth: 50 }}>Qty</th>
                    <th style={{ ...thStyle, background: "#f8fcf6", color: "#4a7a35", minWidth: 55 }}>Order</th>
                  </>
                )}
                {!isTextOnly && !isSimpleQty && weekKeys.map(k => (
                  <React.Fragment key={k}>
                    <th style={{ ...thStyle, textAlign: "right", minWidth: 50 }}>{weekLabel(k)}</th>
                    <th style={{ ...thStyle, background: "#f8fcf6", color: "#4a7a35", minWidth: 55, textAlign: "center" }}>Order</th>
                  </React.Fragment>
                ))}
                {hasComments && <th style={thStyle}>Notes</th>}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => {
                const price = getPrice(row.supplierName, row.plantName, row.variety);
                const sectionChanged = hasSections && row.section && row.section !== lastSection;
                if (hasSections && row.section) lastSection = row.section;
                const totalCols = 1 + (hasVariety?1:0) + (hasCommonName?1:0) + (hasSize?1:0) + (hasForm?1:0) + (hasLocation?1:0) + (hasProductId?1:0) + 1 + (isTextOnly?2:0) + (isSimpleQty?2:0) + (!isTextOnly&&!isSimpleQty ? weekKeys.length*2 : 0) + (hasComments?1:0);

                return (
                  <React.Fragment key={row.id || i}>
                    {sectionChanged && (
                      <tr>
                        <td colSpan={totalCols} style={{ padding: "10px 10px 6px", fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1, textTransform: "uppercase", background: "#f8faf6", borderBottom: "2px solid #e0ead8" }}>
                          {row.section}
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{row.plantName}</td>
                      {hasVariety && <td style={tdStyle}>{row.variety || ""}</td>}
                      {hasCommonName && <td style={tdStyle}>{row.commonName || ""}</td>}
                      {hasSize && <td style={{ ...tdStyle, fontSize: 11 }}>{row.size || ""}</td>}
                      {hasForm && <td style={{ ...tdStyle, fontSize: 11 }}>{row.form || ""}</td>}
                      {hasLocation && <td style={{ ...tdStyle, fontSize: 11 }}>{row.location || ""}</td>}
                      {hasProductId && <td style={{ ...tdStyle, fontSize: 11 }}>{row.productId || ""}</td>}
                      {/* Price column — editable */}
                      <td style={{ ...tdStyle, padding: "4px 4px", background: price > 0 ? "#f0f4ff" : undefined }}>
                        <input type="number" step="0.01"
                          value={price || ""}
                          onChange={e => setPrice(row, parseFloat(e.target.value) || 0)}
                          placeholder="$"
                          style={priceInputStyle(price > 0)} />
                      </td>
                      {/* Text-only: availability text + order */}
                      {isTextOnly && (
                        <>
                          <td style={{ ...tdStyle, fontSize: 11 }}>{row.availabilityText || ""}</td>
                          <td style={{ ...tdStyle, padding: "4px 4px" }}>
                            <input type="number"
                              value={getOrderQty(row.supplierName, row.plantName, row.variety, "total") || ""}
                              onChange={e => setOrderQty(row, "total", parseInt(e.target.value) || 0)}
                              style={orderInputStyle(getOrderQty(row.supplierName, row.plantName, row.variety, "total") > 0)} />
                          </td>
                        </>
                      )}
                      {/* Simple qty: total + order */}
                      {isSimpleQty && (
                        <>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {(row.availability || {}).total ? Number((row.availability || {}).total).toLocaleString() : "\u2014"}
                          </td>
                          <td style={{ ...tdStyle, padding: "4px 4px" }}>
                            <input type="number"
                              value={getOrderQty(row.supplierName, row.plantName, row.variety, "total") || ""}
                              onChange={e => setOrderQty(row, "total", parseInt(e.target.value) || 0)}
                              style={orderInputStyle(getOrderQty(row.supplierName, row.plantName, row.variety, "total") > 0)} />
                          </td>
                        </>
                      )}
                      {/* Weekly/monthly columns: avail + order */}
                      {!isTextOnly && !isSimpleQty && weekKeys.map(k => {
                        const avail = (row.availability || {})[k];
                        const oq = getOrderQty(row.supplierName, row.plantName, row.variety, k);
                        return (
                          <React.Fragment key={k}>
                            <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums",
                              color: avail ? "#1e2d1a" : "#d0d8cc", fontWeight: avail ? 600 : 400 }}>
                              {avail ? Number(avail).toLocaleString() : "\u2014"}
                            </td>
                            <td style={{ ...tdStyle, padding: "4px 3px", background: oq > 0 ? "#f0f8eb" : undefined }}>
                              <input type="number" value={oq || ""}
                                onChange={e => setOrderQty(row, k, parseInt(e.target.value) || 0)}
                                style={orderInputStyle(oq > 0)} />
                            </td>
                          </React.Fragment>
                        );
                      })}
                      {hasComments && <td style={{ ...tdStyle, fontSize: 11, color: "#7a8c74", maxWidth: 150 }}>{row.comments || ""}</td>}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>{"\u2190"} Prev</button>
          <span style={{ fontSize: 13, color: "#7a8c74" }}>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next {"\u2192"}</button>
        </div>
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
            {state.parsed.length} supplier tabs / {totalRows.toLocaleString()} total items
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
            background: tab.matched ? "#f8fcf6" : "#fff8f0", borderRadius: 10,
            border: `1.5px solid ${tab.matched ? "#b8d8a0" : "#e8d0a0"}`, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{tab.supplierKey}</div>
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 12, padding: "2px 8px",
                background: tab.matched ? "#e0f0d8" : "#fde8d0", color: tab.matched ? "#4a7a35" : "#c87a1a" }}>
                {tab.matched ? "Auto-mapped" : "Needs mapping"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>
              Tab: "{tab.tabName}" — {tab.rowCount} items
            </div>
            {tab.rows.length > 0 && (
              <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>
                {tab.rows.slice(0, 3).map(r => r.plantName).join(", ")}
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
// ── MAPPING EDITOR ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MappingEditor({ tab, sheets, onSave, onCancel }) {
  const sheetData = sheets?.[tab.tabName] || [];
  const [cfg, setCfg] = useState({ ...tab.config });
  const upd = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));
  const previewRows = sheetData.slice(0, 8);
  const parsed = useMemo(() => parseSheet(sheetData, cfg), [sheetData, cfg]);

  function save() {
    onSave({ ...tab, config: cfg, rows: parsed, rowCount: parsed.length, matched: true });
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

      <SH>Column Mapping</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div><FL>Header Row (0-indexed)</FL><input type="number" value={cfg.headerRow ?? 0} onChange={e => upd("headerRow", parseInt(e.target.value) || 0)} style={IS(false)} /></div>
        <div><FL>Data Start Row</FL><input type="number" value={cfg.dataStartRow ?? 1} onChange={e => upd("dataStartRow", parseInt(e.target.value) || 1)} style={IS(false)} /></div>
        <div><FL>Plant Name Col</FL><input type="number" value={cfg.plantCol ?? 0} onChange={e => upd("plantCol", parseInt(e.target.value) || 0)} style={IS(false)} /></div>
        <div><FL>Variety Col</FL><input type="number" value={cfg.varietyCol ?? ""} onChange={e => upd("varietyCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
        <div><FL>Common Name Col</FL><input type="number" value={cfg.commonNameCol ?? ""} onChange={e => upd("commonNameCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
        <div><FL>Size Col</FL><input type="number" value={cfg.sizeCol ?? ""} onChange={e => upd("sizeCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
        <div><FL>Form Col</FL><input type="number" value={cfg.formCol ?? ""} onChange={e => upd("formCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
        <div><FL>Product ID Col</FL><input type="number" value={cfg.productIdCol ?? ""} onChange={e => upd("productIdCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div>
          <FL>Availability Type</FL>
          <select value={cfg.weekType || "weekly"} onChange={e => upd("weekType", e.target.value)} style={IS(false)}>
            <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            <option value="buckets">Buckets</option><option value="text">Text</option>
            <option value="simple_qty">Simple Quantity</option>
          </select>
        </div>
        <div><FL>Week Start Col</FL><input type="number" value={cfg.weekStartCol ?? 2} onChange={e => upd("weekStartCol", parseInt(e.target.value) || 0)} style={IS(false)} /></div>
        <div><FL>Week End Col</FL><input type="number" value={cfg.weekEndCol ?? ""} onChange={e => upd("weekEndCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="Auto" /></div>
        <div><FL>Comments Col</FL><input type="number" value={cfg.commentsCol ?? ""} onChange={e => upd("commentsCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="\u2014" /></div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1e2d1a", marginBottom: 16 }}>
        <input type="checkbox" checked={cfg.twoColumnLayout || false} onChange={e => upd("twoColumnLayout", e.target.checked)} />
        Two-column layout (side-by-side plant lists)
      </label>

      <SH>Parsed Preview ({parsed.length} items)</SH>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              {["Plant", "Variety", "Size", "Availability", "Notes"].map(h => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>{h}</th>
              ))}
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
