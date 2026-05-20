import React, { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useFallProgramItems, useManagerTasks, getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "16px 20px", marginBottom: 14 };
const fmtN = (n) => Number(n || 0).toLocaleString();

// Orders to skip from the diff (foliage / non-fall-program orders that show up on Ball reports)
const IGNORE_ORDERS = new Set(["9205502"]);

// ── Normalizer ────────────────────────────────────────────────────────────────
// Matches Ball / EHR broker variety names against our DB conventions.
// 93% accurate against the 5/18/2026 Ball report. Refine here as new edge cases emerge.
function normalizeVariety(v) {
  let s = String(v || "").toUpperCase().trim();
  s = s.replace(/[#®™]/g, "").replace(/[''']/g, "");
  // Genus prefixes
  s = s.replace(/^MUMGDN\s+/, "").replace(/^MUM\s+(?:YODER\s+)?/, "");
  s = s.replace(/^ASTER\s+ROYALTY\s+/, "ASTER ").replace(/^ASTER\s+/, "ASTER ");
  s = s.replace(/^CHRYSANTHEMUM\s+/, "");
  s = s.replace(/^LYSIMACHIA\s+(?:NUM\.?\s+)?/, "LYSIMACHIA ");
  s = s.replace(/^PETCHOA\s+/, "").replace(/^CALIBRACHOA\s+/, "");
  s = s.replace(/^FO\s+/, "").replace(/^AGERATUM\s+/, "AGERATUM ").replace(/^VIOLA\s+/, "VIOLA ");
  // Supercal premium / supercal abbreviation
  s = s.replace(/\bSUPCALPRM\b/g, "SUPERCAL PREMIUM").replace(/\bSUPCAL\b/g, "SUPERCAL");
  // Merged-word color abbreviations Ball uses
  s = s.replace(/\bYELSUNIPD\b/g, "YELLOW SUN IPD");
  s = s.replace(/\bSUNRAYPK\b/g, "SUNRAY PINK").replace(/\bPINKMIST\b/g, "PINK MIST");
  s = s.replace(/\bORNGSUNSET\b/g, "ORANGE SUNSET").replace(/\bROSESTAR\b/g, "ROSE STAR");
  s = s.replace(/\bPEARLWHITE\b/g, "PEARL WHITE");
  // Short forms
  s = s.replace(/\bFRNCH\b/g, "FRENCH").replace(/\bVANLA\b/g, "VANILLA");
  s = s.replace(/\bYEL\b/g, "YELLOW").replace(/\bPK\b/g, "PINK").replace(/\bORNG\b/g, "ORANGE");
  s = s.replace(/\bWHT\b/g, "WHITE").replace(/\bBLU\b/g, "BLUE").replace(/\bPRP\b/g, "PURPLE");
  s = s.replace(/\bBLCH\b/g, "BLOTCH").replace(/\bGLDN\b/g, "GOLDEN");
  // Cultivar alias — Lysimachia DB has extra " CREEPING JENNY" the report omits
  s = s.replace(/^LYSIMACHIA\s+GOLDILOCKS(\s+CREEPING\s+JENNY)?$/, "LYSIMACHIA GOLDILOCKS");
  s = s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  return s;
}

// Parse the Customer PO sheet from a Ball "order_download" xlsx
function parseBallReport(workbook) {
  const sheet = workbook.Sheets["Customer PO"];
  if (!sheet) throw new Error("Couldn't find 'Customer PO' sheet — is this a Ball order_download .xlsx?");
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  const hi = raw.findIndex(r => Array.isArray(r) && r[0] === "PO Number");
  if (hi < 0) throw new Error("Couldn't find header row 'PO Number'");
  const headers = raw[hi];
  const data = raw.slice(hi + 1).filter(r => r && r[0] && r[2] && r[3])
    .map(arr => Object.fromEntries(headers.map((h, i) => [h, arr[i]])));
  return data.map(r => ({
    po: String(r["PO Number"] || ""),
    shipWeek: String(r["Ship Week"] || ""),
    orderNumber: String(r["Order Number"] || ""),
    variety: String(r["Variety"] || ""),
    size: String(r["Size"] || ""),
    qty: Number(r["Quantity"]) || 0,
    extPrice: Number(r["Extended Value"]) || 0,
  }));
}

// Run the diff: report rows × current DB items → categorized changes
function computeDiff(reportRows, dbItems) {
  const report = new Map();
  for (const r of reportRows) {
    if (IGNORE_ORDERS.has(r.orderNumber)) continue;
    const norm = normalizeVariety(r.variety);
    const k = r.orderNumber + "||" + norm;
    const existing = report.get(k) || { ...r, normalized: norm, qtyTotal: 0 };
    existing.qtyTotal += r.qty;
    report.set(k, existing);
  }
  const dbByKey = new Map();
  for (const it of dbItems) {
    if (!it.orderNumber) continue;
    const norm = normalizeVariety(it.variety);
    const k = it.orderNumber + "||" + norm;
    const e = dbByKey.get(k) || {
      variety: it.variety, normalized: norm, orderNumber: it.orderNumber,
      qtyTotal: 0, ordQtyTotal: 0, shipWeek: it.shipWeek, ppp: parseFloat(it.ppp) || 1, items: [],
    };
    e.qtyTotal += parseFloat(it.qty) || 0;
    e.ordQtyTotal += parseFloat(it.ordQty) || 0;
    e.items.push(it);
    dbByKey.set(k, e);
  }

  const lines = [];
  for (const [k, r] of report) {
    const db = dbByKey.get(k);
    if (!db) {
      lines.push({ type: "new", key: k, orderNumber: r.orderNumber, variety: r.variety,
        normalized: r.normalized, reportQty: r.qtyTotal, dbQty: null, shipWeek: r.shipWeek });
      continue;
    }
    const dbQty = db.ordQtyTotal || Math.round(db.qtyTotal * db.ppp);
    if (dbQty !== r.qtyTotal) {
      lines.push({ type: "qty_changed", key: k, orderNumber: r.orderNumber, variety: r.variety,
        normalized: r.normalized, reportQty: r.qtyTotal, dbQty, shipWeek: r.shipWeek,
        dbShipWeek: db.shipWeek, dbItems: db.items });
    } else {
      lines.push({ type: "unchanged", key: k, orderNumber: r.orderNumber, variety: r.variety,
        normalized: r.normalized, reportQty: r.qtyTotal, dbQty, shipWeek: r.shipWeek });
    }
  }
  for (const [k, db] of dbByKey) {
    if (!report.has(k) && db.ordQtyTotal > 0) {
      lines.push({ type: "only_in_db", key: k, orderNumber: db.orderNumber, variety: db.variety,
        normalized: db.normalized, reportQty: null, dbQty: db.ordQtyTotal, dbShipWeek: db.shipWeek,
        dbItems: db.items });
    }
  }
  // Sort: biggest absolute change first, then "new", then "only in db", then unchanged
  const priority = { qty_changed: 0, new: 1, only_in_db: 2, unchanged: 3 };
  lines.sort((a, b) => {
    if (priority[a.type] !== priority[b.type]) return priority[a.type] - priority[b.type];
    const diffA = Math.abs((a.reportQty || 0) - (a.dbQty || 0));
    const diffB = Math.abs((b.reportQty || 0) - (b.dbQty || 0));
    return diffB - diffA;
  });
  return lines;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BrokerReports() {
  const { rows: items, update: updateItem, refresh: refreshItems } = useFallProgramItems();
  const { upsert: upsertTask } = useManagerTasks();
  const { displayName } = useAuth();
  const fileInputRef = useRef(null);
  const [parseError, setParseError] = useState("");
  const [reportRows, setReportRows] = useState(null);
  const [reportMeta, setReportMeta] = useState(null); // { filename, brokerName, reportDate }
  const [actions, setActions] = useState({}); // { lineKey: { action, savedAt } }
  const [busy, setBusy] = useState(null); // lineKey while applying
  const [acknowledged, setAcknowledged] = useState({}); // persisted ignore lookup

  // Pull saved actions so previously-ignored changes can stay hidden
  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    db.from("broker_change_actions").select("*").then(({ data }) => {
      if (!data) return;
      const map = {};
      for (const a of data) {
        const k = a.order_number + "||" + a.variety_normalized + "||" + a.broker_qty;
        map[k] = a.action;
      }
      setAcknowledged(map);
    });
  }, []);

  function handleFile(file) {
    setParseError("");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const rows = parseBallReport(wb);
        if (rows.length === 0) throw new Error("Report has no rows");
        setReportRows(rows);
        // Try to extract a date from the filename: order_download_20260518022509.xlsx
        const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
        const reportDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null;
        setReportMeta({ filename: file.name, brokerName: "Ball", reportDate });
      } catch (err) {
        setParseError(err.message);
        setReportRows(null);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const diff = useMemo(() => {
    if (!reportRows) return null;
    return computeDiff(reportRows, items);
  }, [reportRows, items]);

  const counts = useMemo(() => {
    if (!diff) return null;
    return diff.reduce((acc, l) => {
      acc[l.type] = (acc[l.type] || 0) + 1;
      return acc;
    }, {});
  }, [diff]);

  // Apply: scale ord_qty across bench-level rows so the variety total matches the report
  async function applyQtyChange(line) {
    if (!line.dbItems || line.dbItems.length === 0) return;
    setBusy(line.key);
    const newTotal = line.reportQty;
    const oldTotal = line.dbItems.reduce((s, i) => s + (parseFloat(i.ordQty) || 0), 0) || line.dbQty;
    try {
      // Proportional split. If oldTotal is 0 (degenerate), dump everything on first row.
      let allocated = 0;
      for (let idx = 0; idx < line.dbItems.length; idx++) {
        const it = line.dbItems[idx];
        const oldVal = parseFloat(it.ordQty) || 0;
        let newVal;
        if (oldTotal > 0) {
          if (idx === line.dbItems.length - 1) newVal = newTotal - allocated; // remainder on last
          else newVal = Math.round((oldVal / oldTotal) * newTotal);
        } else {
          newVal = idx === 0 ? newTotal : 0;
        }
        allocated += newVal;
        await updateItem(it.id, { ordQty: newVal });
      }
      await saveAction(line, "apply");
      setActions(prev => ({ ...prev, [line.key]: { action: "apply", at: new Date().toISOString() } }));
      refreshItems();
    } catch (err) {
      alert("Apply failed: " + err.message);
    }
    setBusy(null);
  }

  async function ignoreLine(line) {
    setBusy(line.key);
    try {
      await saveAction(line, "ignore");
      setActions(prev => ({ ...prev, [line.key]: { action: "ignore", at: new Date().toISOString() } }));
    } finally { setBusy(null); }
  }

  async function sourceMoreTask(line) {
    setBusy(line.key);
    try {
      const today = new Date();
      const jan4 = new Date(today.getFullYear(), 0, 4);
      const s = new Date(jan4); s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
      const week = Math.ceil((today - s) / (7 * 86400000));
      const shortBy = (line.dbQty || 0) - line.reportQty;
      await upsertTask({
        id: crypto.randomUUID(),
        title: `🔍 Source ${fmtN(shortBy)} more ${line.variety} (Ball #${line.orderNumber} confirmed ${fmtN(line.reportQty)}, planned ${fmtN(line.dbQty)})`,
        description: `Broker reduced confirmed quantity. Need to source ${shortBy} more units from another supplier or adjust production plan.`,
        category: "production",
        location: "bluff",
        year: today.getFullYear(),
        weekNumber: week,
        bucket: "this_week",
        targetDate: today.toISOString().slice(0, 10),
        status: "pending",
        priority: 70,
        createdBy: displayName || "Broker Report",
        photos: [],
      });
      await saveAction(line, "task");
      setActions(prev => ({ ...prev, [line.key]: { action: "task", at: new Date().toISOString() } }));
    } catch (err) {
      alert("Couldn't create task: " + err.message);
    }
    setBusy(null);
  }

  async function saveAction(line, action) {
    const db = getSupabase();
    if (!db) return;
    await db.from("broker_change_actions").upsert({
      order_number: line.orderNumber,
      variety_normalized: line.normalized,
      broker_qty: line.reportQty || 0,
      action,
      action_by: displayName || null,
    }, { onConflict: "order_number,variety_normalized,broker_qty" });
  }

  function isPreviouslyHandled(line) {
    const k = line.orderNumber + "||" + line.normalized + "||" + (line.reportQty || 0);
    return acknowledged[k];
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 24, fontWeight: 400, color: "#1a2a1a" }}>
            Broker Order Reports
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            Upload a Ball weekly order_download .xlsx — the system compares it against current orders and flags any changes.
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div style={{ ...card, border: reportRows ? "1.5px solid #e0ead8" : "2px dashed #c8d8c0", textAlign: "center", padding: "30px 20px" }}>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files?.[0])} />
        {!reportRows ? (
          <>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a1a", marginBottom: 4 }}>Upload Ball order report</div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 14 }}>
              The .xlsx Ball emails you (filename starts with "order_download_")
            </div>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ padding: "10px 22px", borderRadius: 10, background: "#7fb069", color: "#fff", border: "none", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              Choose file
            </button>
          </>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a" }}>
                ✓ {reportMeta?.filename || "report"} — {reportRows.length} lines parsed
              </div>
              {reportMeta?.reportDate && (
                <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Report date: {reportMeta.reportDate}</div>
              )}
            </div>
            <button onClick={() => { setReportRows(null); setReportMeta(null); setActions({}); }}
              style={{ padding: "8px 16px", borderRadius: 8, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              Clear
            </button>
          </div>
        )}
        {parseError && (
          <div style={{ color: "#d94f3d", fontSize: 13, marginTop: 12 }}>⚠ {parseError}</div>
        )}
      </div>

      {/* Diff summary */}
      {diff && counts && (
        <div style={{ ...card, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Stat label="Qty changes" value={counts.qty_changed || 0} color="#c8791a" />
          <Stat label="New in report" value={counts.new || 0} color="#4a90d9" />
          <Stat label="Missing / cancelled" value={counts.only_in_db || 0} color="#d94f3d" />
          <Stat label="Unchanged" value={counts.unchanged || 0} color="#7fb069" />
        </div>
      )}

      {/* Diff rows */}
      {diff && diff.filter(l => l.type !== "unchanged").map(line => {
        const localAction = actions[line.key]?.action;
        const persistedAction = isPreviouslyHandled(line);
        const handled = localAction || persistedAction;
        const isBusy = busy === line.key;
        return (
          <DiffRow key={line.key} line={line} handled={handled} isBusy={isBusy}
            onApply={() => applyQtyChange(line)}
            onIgnore={() => ignoreLine(line)}
            onSourceMore={() => sourceMoreTask(line)} />
        );
      })}

      {diff && diff.filter(l => l.type !== "unchanged").length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "40px 20px", color: "#7a8c74" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a1a" }}>No changes detected</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>This report matches your current DB.</div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DiffRow({ line, handled, isBusy, onApply, onIgnore, onSourceMore }) {
  const opacity = handled ? 0.5 : 1;
  const delta = line.reportQty != null && line.dbQty != null ? line.reportQty - line.dbQty : null;
  const deltaText = delta != null ? (delta > 0 ? `+${delta}` : `${delta}`) : null;

  let badge;
  if (line.type === "qty_changed") badge = { color: "#c8791a", bg: "#fff4e8", text: "QTY CHANGE" };
  else if (line.type === "new") badge = { color: "#4a90d9", bg: "#e8f4fc", text: "NEW IN REPORT" };
  else badge = { color: "#d94f3d", bg: "#fff3f1", text: "ONLY IN DB" };

  return (
    <div style={{ ...card, opacity, padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, letterSpacing: 0.5 }}>{badge.text}</span>
            <span style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700 }}>#{line.orderNumber}</span>
            {handled && <span style={{ fontSize: 10, color: "#7a8c74", fontStyle: "italic" }}>· {handled === "apply" ? "Applied" : handled === "ignore" ? "Ignored" : handled === "task" ? "Task created" : "Handled"}</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2a1a", marginTop: 4 }}>{line.variety}</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {line.dbQty != null && <span>DB: <b style={{ color: "#1a2a1a" }}>{fmtN(line.dbQty)}</b></span>}
            {line.reportQty != null && <span>Report: <b style={{ color: "#1a2a1a" }}>{fmtN(line.reportQty)}</b></span>}
            {deltaText != null && <span style={{ color: delta > 0 ? "#4a7a35" : "#d94f3d", fontWeight: 800 }}>({deltaText})</span>}
            {line.shipWeek && <span>Ship wk: {line.shipWeek}</span>}
          </div>
        </div>
        {!handled && (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {line.type === "qty_changed" && (
              <>
                <button disabled={isBusy} onClick={onApply}
                  style={btnPrimary(isBusy)} title="Update DB ord_qty to match report">
                  {isBusy ? "..." : "✓ Apply"}
                </button>
                {(line.dbQty || 0) > line.reportQty && (
                  <button disabled={isBusy} onClick={onSourceMore}
                    style={btnSec(isBusy)} title="Create a task to source replacement material">
                    🔍 Source more
                  </button>
                )}
                <button disabled={isBusy} onClick={onIgnore}
                  style={btnGhost(isBusy)} title="Acknowledge but leave the DB unchanged">
                  Ignore
                </button>
              </>
            )}
            {line.type === "new" && (
              <>
                <button disabled={isBusy} onClick={onIgnore}
                  style={btnGhost(isBusy)}>Ignore</button>
              </>
            )}
            {line.type === "only_in_db" && (
              <>
                <button disabled={isBusy} onClick={onSourceMore}
                  style={btnSec(isBusy)}>🔍 Source more</button>
                <button disabled={isBusy} onClick={onIgnore}
                  style={btnGhost(isBusy)}>Ignore</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary = (busy) => ({
  background: busy ? "#b0c8a0" : "#7fb069", color: "#1e2d1a",
  border: "none", borderRadius: 8, padding: "8px 14px",
  fontSize: 12, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});
const btnSec = (busy) => ({
  background: "#fff", color: "#4a90d9", border: "1.5px solid #4a90d9",
  borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});
const btnGhost = (busy) => ({
  background: "transparent", color: "#7a8c74", border: "1.5px solid #c8d8c0",
  borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});
