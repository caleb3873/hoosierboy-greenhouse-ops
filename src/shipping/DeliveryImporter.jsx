import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { useDeliveries, useShippingCustomers, getSupabase } from "../supabase";
import { useAuth } from "../Auth";

const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const RED = "#d94f3d";
const AMBER = "#e89a3a";
const BORDER = "#e0ead8";

// Excel serial date → ISO string (YYYY-MM-DD)
function excelDateToISO(serial) {
  if (!serial || typeof serial !== "number") return null;
  // Excel epoch: Jan 0, 1900 (with the Lotus 1-2-3 leap year bug)
  const utcDays = Math.floor(serial) - 25569; // 25569 = days from 1900-01-01 to 1970-01-01
  const ms = utcDays * 86400000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

// Determine Ship Via → is this a delivery (not a pickup)?
function isDelivery(shipVia) {
  if (!shipVia) return false;
  const s = String(shipVia).toUpperCase().trim();
  if (s === "PICK UP" || s === "PICKUP" || s === "NONE") return false;
  return true; // DELIVER, "Southern IN: I-65", etc.
}

// Parse the XLS file into structured rows
function parseXLS(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const rows = [];
  for (const r of raw) {
    const shipVia = r["Ship Via"] || "";
    if (!isDelivery(shipVia)) continue;

    const shipDate = excelDateToISO(r["Ship Date"]);
    if (!shipDate) continue;

    const shipTo = (r["Ship To"] || "").trim();
    if (!shipTo) continue;

    rows.push({
      orderNumber: (r["Order Number"] || "").trim(),
      shipTo,
      billTo: (r["Bill To"] || "").trim(),
      orderTotal: parseFloat(r["Order Total"]) || 0,
      totalQty: parseFloat(r["Total Qty"]) || 0,
      shipDate,
      shipVia,
      terms: (r["Terms"] || "").trim(),
      notes: (r["Notes"] || "").trim(),
      status: (r["Status"] || "").trim(),
      enteredBy: (r["Entered By"] || "").trim(),
    });
  }
  return rows;
}

// Group rows by shipDate + shipTo → one delivery per group
function groupRows(rows) {
  const key = (r) => `${r.shipDate}||${r.shipTo.toUpperCase()}`;
  const map = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }

  return Array.from(map.values()).map(group => {
    const first = group[0];
    const orderNumbers = group.map(r => r.orderNumber).filter(Boolean);
    const totalValue = group.reduce((s, r) => s + r.orderTotal, 0);
    const totalQty = group.reduce((s, r) => s + r.totalQty, 0);
    const notes = group.map(r => r.notes).filter(Boolean).join("; ");
    return {
      shipTo: first.shipTo,
      shipDate: first.shipDate,
      shipVia: first.shipVia,
      terms: first.terms,
      enteredBy: first.enteredBy,
      orderNumbers,
      totalValueCents: Math.round(totalValue * 100),
      totalQty,
      notes,
    };
  });
}

export default function DeliveryImporter({ onDone }) {
  const { rows: deliveries, insert, update } = useDeliveries();
  const { rows: customers, insert: insertCustomer } = useShippingCustomers();
  const { displayName } = useAuth();
  const fileRef = useRef(null);

  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResults(null);

    try {
      const buf = await file.arrayBuffer();
      const rows = parseXLS(buf);
      const grouped = groupRows(rows);
      setParsed({ fileName: file.name, totalRows: rows.length, deliveryRows: rows.length, pickupSkipped: 0, groups: grouped });
    } catch (err) {
      setError(`Failed to parse file: ${err.message}`);
    }
  }

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    setError(null);

    const stats = { added: 0, updated: 0, skipped: 0, customersCreated: 0, errors: [] };

    try {
      // Build customer lookup (normalize name for matching)
      const custByName = new Map();
      for (const c of customers) {
        custByName.set((c.companyName || "").toUpperCase().trim(), c);
      }

      for (const group of parsed.groups) {
        try {
          // Find or create customer
          const nameKey = group.shipTo.toUpperCase().trim();
          let cust = custByName.get(nameKey);

          if (!cust) {
            // Auto-create customer
            cust = await insertCustomer({
              companyName: group.shipTo,
              terms: group.terms || null,
            });
            custByName.set(nameKey, cust);
            stats.customersCreated++;
          }

          // Update terms on existing customer if needed
          if (cust && group.terms && cust.terms !== group.terms) {
            const db = getSupabase();
            if (db) {
              await db.from("shipping_customers").update({ terms: group.terms }).eq("id", cust.id);
              cust.terms = group.terms;
            }
          }

          // Find existing delivery for this customer + date
          const existing = deliveries.find(d =>
            d.customerId === cust.id &&
            d.deliveryDate === group.shipDate &&
            d.lifecycle !== "cancelled"
          );

          if (existing) {
            // Check if any team has already pulled
            const anyPulled = existing.bluff1PulledAt || existing.bluff2PulledAt || existing.spraguePulledAt || existing.houseplantsPulledAt;

            // Build changes
            const changes = {};
            const existingOrders = existing.orderNumbers || [];
            const mergedOrders = [...new Set([...existingOrders, ...group.orderNumbers])];
            if (JSON.stringify(mergedOrders) !== JSON.stringify(existingOrders)) {
              changes.orderNumbers = mergedOrders;
            }
            if (group.totalValueCents !== existing.orderValueCents) {
              changes.orderValueCents = group.totalValueCents;
            }
            if (group.notes && group.notes !== existing.notes) {
              changes.notes = group.notes;
            }

            if (Object.keys(changes).length === 0) {
              stats.skipped++;
              continue;
            }

            if (anyPulled) {
              // Already pulled — update but also flag as late change
              const alertEntry = {
                text: `Import updated order (already pulled): ${Object.keys(changes).join(", ")} changed`,
                author: displayName || "Import",
                created_at: new Date().toISOString(),
                severity: "warning",
              };
              changes.alerts = [...(existing.alerts || []), alertEntry];
            }

            await update(existing.id, changes);
            stats.updated++;
          } else {
            // New delivery
            const snapshot = {
              company_name: cust.companyName,
              address1: cust.address1 || "",
              city: cust.city || "",
              state: cust.state || "",
              zip: cust.zip || "",
              phone: cust.phone || "",
              email: cust.email || "",
              terms: cust.terms || "",
              customer_type: cust.customerType || "",
              allow_carts: !!cust.allowCarts,
            };

            await insert({
              customerId: cust.id,
              customerSnapshot: snapshot,
              deliveryDate: group.shipDate,
              deliveryTime: null,
              priority: "normal",
              orderNumbers: group.orderNumbers,
              orderValueCents: group.totalValueCents,
              cartCount: 0,
              notes: group.notes || null,
              status: "scheduled",
              lifecycle: "proposed",
              salesConfirmedAt: new Date().toISOString(),
              salesConfirmedBy: displayName || group.enteredBy || "Import",
              createdBy: group.enteredBy || displayName || "Import",
              needsBluff1: true,
              needsBluff2: false,
              needsSprague: false,
              needsHouseplants: false,
            });
            stats.added++;
          }
        } catch (err) {
          stats.errors.push(`${group.shipTo} (${group.shipDate}): ${err.message}`);
        }
      }
    } catch (err) {
      setError(`Import failed: ${err.message}`);
    }

    setResults(stats);
    setImporting(false);
  }

  const pillStyle = (color, bg) => ({
    display: "inline-block", padding: "4px 10px", borderRadius: 999,
    background: bg, color, fontWeight: 800, fontSize: 13, marginRight: 6,
  });

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      {/* File picker */}
      <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" onChange={handleFile} style={{ display: "none" }} />
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          padding: "10px 20px", background: GREEN, color: "#fff", border: "none",
          borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        📁 Import Delivery Schedule
      </button>

      {error && (
        <div style={{ marginTop: 12, padding: 12, background: "#fff3f1", border: `1px solid ${RED}`, borderRadius: 8, color: RED, fontWeight: 700, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Preview */}
      {parsed && !results && (
        <div style={{ marginTop: 16, background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: DARK, marginBottom: 8 }}>
            📋 Preview: {parsed.fileName}
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
            {parsed.groups.length} deliveries found ({parsed.totalRows} line items, pickups excluded)
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f7faf4", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Ship To</th>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Date</th>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Orders</th>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Value</th>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Terms</th>
                  <th style={{ padding: "6px 8px", fontWeight: 800, color: DARK }}>Route</th>
                </tr>
              </thead>
              <tbody>
                {parsed.groups.map((g, i) => {
                  const existing = customers.find(c => (c.companyName || "").toUpperCase().trim() === g.shipTo.toUpperCase().trim());
                  const existingDel = existing && deliveries.find(d => d.customerId === existing.id && d.deliveryDate === g.shipDate && d.lifecycle !== "cancelled");
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "6px 8px" }}>
                        {g.shipTo}
                        {!existing && <span style={{ ...pillStyle(AMBER, "#fff7ec"), marginLeft: 6, fontSize: 10 }}>NEW CUSTOMER</span>}
                        {existingDel && <span style={{ ...pillStyle(GREEN, "#f0f9ec"), marginLeft: 6, fontSize: 10 }}>UPDATE</span>}
                      </td>
                      <td style={{ padding: "6px 8px" }}>{g.shipDate}</td>
                      <td style={{ padding: "6px 8px" }}>{g.orderNumbers.join(", ")}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>${(g.totalValueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {g.terms === "C.O.D." && <span style={{ color: RED, fontWeight: 800 }}>💰 COD</span>}
                        {g.terms !== "C.O.D." && g.terms}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: 11, color: MUTED }}>{g.shipVia}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={runImport}
              disabled={importing}
              style={{
                padding: "10px 24px", background: importing ? MUTED : GREEN, color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 800, fontSize: 14,
                cursor: importing ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {importing ? "Importing..." : `✓ Import ${parsed.groups.length} deliveries`}
            </button>
            <button
              onClick={() => { setParsed(null); setResults(null); if (fileRef.current) fileRef.current.value = ""; }}
              style={{
                padding: "10px 20px", background: "#fff", color: MUTED,
                border: `1px solid ${BORDER}`, borderRadius: 8, fontWeight: 700, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 16, background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: DARK, marginBottom: 10 }}>Import complete</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {results.added > 0 && <span style={pillStyle("#fff", GREEN)}>+{results.added} added</span>}
            {results.updated > 0 && <span style={pillStyle(DARK, CREAM)}>↻ {results.updated} updated</span>}
            {results.skipped > 0 && <span style={pillStyle(MUTED, "#f5f5f5")}>— {results.skipped} unchanged</span>}
            {results.customersCreated > 0 && <span style={pillStyle(AMBER, "#fff7ec")}>👤 {results.customersCreated} new customers</span>}
          </div>
          {results.errors.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: "#fff3f1", borderRadius: 8, fontSize: 12, color: RED }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>Errors ({results.errors.length}):</div>
              {results.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          )}
          <button
            onClick={() => { setParsed(null); setResults(null); if (fileRef.current) fileRef.current.value = ""; onDone?.(); }}
            style={{
              marginTop: 12, padding: "8px 16px", background: GREEN, color: "#fff",
              border: "none", borderRadius: 8, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
