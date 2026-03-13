import { useState, useRef } from "react";
import { useCropRuns } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const MATERIAL_TYPES = [
  { id: "urc",   label: "URC",   icon: "✂️",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "seed",  label: "Seed",  icon: "🌾",  color: "#c8791a", bg: "#fff4e8" },
  { id: "liner", label: "Liner", icon: "🪴",  color: "#2e7d9e", bg: "#e8f4f8" },
  { id: "plug",  label: "Plug",  icon: "🌱",  color: "#2e7a2e", bg: "#e8f8e8" },
  { id: "bulb",  label: "Bulb",  icon: "🧅",  color: "#b05a20", bg: "#fdf0e0" },
];

const LINE_STATUSES = [
  { id: "pending",     label: "Pending",     color: "#7a8c74", bg: "#f0f5ee" },
  { id: "confirmed",   label: "Confirmed",   color: "#2e7d32", bg: "#e8f8e8" },
  { id: "substituted", label: "Substituted", color: "#c8791a", bg: "#fff4e8" },
  { id: "short",       label: "Short",       color: "#c03030", bg: "#fef0f0" },
  { id: "cancelled",   label: "Cancelled",   color: "#9a9a9a", bg: "#f5f5f5" },
];

const ORDER_STATUSES = [
  { id: "draft",     label: "Draft",     color: "#7a8c74" },
  { id: "sent",      label: "Sent",      color: "#4a90d9" },
  { id: "confirmed", label: "Confirmed", color: "#2e7d32" },
  { id: "partial",   label: "Partial",   color: "#c8791a" },
  { id: "received",  label: "Received",  color: "#8e44ad" },
];

const STORAGE_KEY = "gh_order_meta_v1";

function load(key, def) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
const IS = (active) => ({ width: "100%", padding: "7px 10px", borderRadius: 7, border: `1.5px solid ${active ? "#7fb069" : "#dde8d5"}`, background: "#fff", fontSize: 13, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
function FL({ c }) { return <div style={{ fontSize: 10, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 3 }}>{c}</div>; }

// ── HELPERS ───────────────────────────────────────────────────────────────────
function weekToDate(week, year) {
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const d = new Date(s);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}
function formatWeekDate(week, year) {
  if (!week || !year) return "";
  return weekToDate(+week, +year).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function subtractWeeks(week, year, n) {
  let w = +week - n, y = +year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}
function computeArrivalWeek(run) {
  if (!run.targetWeek || !run.targetYear) return null;
  const finish = run.movesOutside
    ? (+run.weeksIndoor || 0) + (+run.weeksOutdoor || 0)
    : (+run.weeksIndoor || 0);
  const transplant = subtractWeeks(run.targetWeek, run.targetYear, finish);
  const prop = +run.weeksProp || 0;
  return prop > 0 ? subtractWeeks(transplant.week, transplant.year, prop) : transplant;
}
function mt(id) { return MATERIAL_TYPES.find(m => m.id === id) || MATERIAL_TYPES[0]; }
function ls(id) { return LINE_STATUSES.find(s => s.id === id) || LINE_STATUSES[0]; }
function os(id) { return ORDER_STATUSES.find(s => s.id === id) || ORDER_STATUSES[0]; }
function lineKey(l) { return `${l.runId}||${l.cultivar || ""}||${l.variety || ""}||${l.arrivalWeek || ""}`; }

// ── DERIVE LINES FROM CROP RUNS ───────────────────────────────────────────────
function deriveLines(runs) {
  const lines = [];
  runs.forEach(run => {
    if (!run.broker) return;
    const arrival = computeArrivalWeek(run);
    const matType = mt(run.materialType);
    const makeLineBase = (qty) => {
      const buffered = Math.ceil(qty * (1 + (+run.bufferPct || 0) / 100));
      const lineCost = run.unitCost ? +(run.unitCost * buffered).toFixed(2) : null;
      return {
        runId: run.id, broker: run.broker, cropName: run.cropName,
        materialType: run.materialType, matType,
        arrivalWeek: arrival?.week, arrivalYear: arrival?.year,
        propTraySize: run.propTraySize, linerSize: run.linerSize,
        seedForm: run.seedForm, ballItemNumber: run.ballItemNumber,
        orderQty: buffered, lineCost,
        groupNumber: run.groupNumber,
      };
    };
    if (run.components?.length) {
      run.components.forEach(v => {
        const qty = (+v.cases || 0) * (+run.packSize || 10);
        if (qty > 0) lines.push({ ...makeLineBase(qty), cultivar: v.cropName || run.cropName, variety: v.variety, ballItemNumber: v.ballItemNumber });
      });
    } else {
      const qty = (+run.cases || 0) * (+run.packSize || 10);
      if (qty > 0) lines.push({ ...makeLineBase(qty), cultivar: run.cropName, variety: run.variety });
    }
  });
  return lines;
}

// ── PO DOCUMENT ───────────────────────────────────────────────────────────────
function PODocument({ broker, lines, meta, onClose }) {
  const totalQty  = lines.reduce((s, l) => s + (l.orderQty || 0), 0);
  const totalCost = lines.reduce((s, l) => s + (l.lineCost || 0), 0);
  const hasCosts  = lines.some(l => l.lineCost != null);
  const today     = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const byWeek = {};
  lines.forEach(l => {
    const k = l.arrivalWeek ? `${l.arrivalYear}-${String(l.arrivalWeek).padStart(2,"0")}` : "zzz";
    if (!byWeek[k]) byWeek[k] = [];
    byWeek[k].push(l);
  });
  const weekGroups = Object.entries(byWeek).sort(([a],[b]) => a.localeCompare(b));

  function exportCSV() {
    const headers = ["Broker","Cultivar","Variety","Type","Tray/Form","Arrival Week","Arrival Date","Order Qty","Unit Cost","Line Cost","Item #","Status","Sub Variety","Notes"];
    const rows = lines.map(l => {
      const lmeta = meta?.lineOverrides?.[lineKey(l)] || {};
      const tray = l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || (l.seedForm ? `${l.seedForm} seed` : "");
      return [l.broker, l.cultivar||l.cropName, l.variety||"", l.materialType, tray, l.arrivalWeek||"", formatWeekDate(l.arrivalWeek, l.arrivalYear), l.orderQty||0, l.lineCost != null ? (l.lineCost/(l.orderQty||1)).toFixed(2) : "", l.lineCost||"", l.ballItemNumber||"", lmeta.status||"pending", lmeta.subVariety||"", lmeta.note||""];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: "data:text/csv;charset=utf-8," + encodeURIComponent(csv), download: `PO_${broker.replace(/\s+/g,"_")}.csv` });
    a.click();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 780, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
        <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", padding: "20px 26px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "#c8e6b8", marginBottom: 3 }}>Purchase Order</div>
            <div style={{ fontSize: 14, color: "#7fb069", fontWeight: 700 }}>{broker}</div>
            <div style={{ fontSize: 11, color: "#4a6a3a", marginTop: 2 }}>{today}{meta?.confirmationNum ? ` · Conf #${meta.confirmationNum}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportCSV} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", color: "#c8e6b8", borderRadius: 9, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Export CSV</button>
            <button onClick={onClose}   style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.2)", color: "#c8e6b8", borderRadius: 9, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </div>
        <div style={{ padding: "22px 26px" }}>
          <div style={{ display: "flex", gap: 24, marginBottom: 22, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 10, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .5 }}>Total Units</div><div style={{ fontSize: 26, fontWeight: 900, color: "#1e2d1a" }}>{totalQty.toLocaleString()}</div></div>
            {hasCosts && totalCost > 0 && <div><div style={{ fontSize: 10, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .5 }}>Est. Cost</div><div style={{ fontSize: 26, fontWeight: 900, color: "#7fb069" }}>${totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>}
            <div><div style={{ fontSize: 10, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .5 }}>Lines</div><div style={{ fontSize: 26, fontWeight: 900, color: "#4a90d9" }}>{lines.length}</div></div>
          </div>
          {weekGroups.map(([wkKey, wLines]) => {
            const [yr, wk] = wkKey === "zzz" ? [null, null] : wkKey.split("-").map(Number);
            const wkQty  = wLines.reduce((s,l) => s+(l.orderQty||0), 0);
            const wkCost = wLines.reduce((s,l) => s+(l.lineCost||0), 0);
            return (
              <div key={wkKey} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, paddingBottom: 6, borderBottom: "2px solid #e0ead8" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: "#1e2d1a" }}>{wk ? `Week ${wk} · ${formatWeekDate(wk, yr)}` : "No Arrival Date"}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>{wkQty.toLocaleString()} units{hasCosts && wkCost > 0 ? ` · $${wkCost.toFixed(2)}` : ""}</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8faf6" }}>
                      {["Cultivar","Variety","Type","Tray","Qty","Cost","Item #"].map(h => (
                        <th key={h} style={{ padding: "5px 10px", textAlign: "left", fontSize: 9, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wLines.map((l, i) => {
                      const m = l.matType;
                      const tray = l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || (l.seedForm ? `${l.seedForm}` : "—");
                      const lmeta = meta?.lineOverrides?.[lineKey(l)] || {};
                      const lstat = ls(lmeta.status || "pending");
                      return (
                        <tr key={i} style={{ borderTop: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                          <td style={{ padding: "7px 10px", fontWeight: 700, color: "#1e2d1a" }}>{l.cultivar || l.cropName}{l.groupNumber ? <span style={{ marginLeft: 4, background: "#e0ead8", borderRadius: 4, padding: "1px 4px", fontSize: 9, color: "#7a8c74" }}>G{l.groupNumber}</span> : null}</td>
                          <td style={{ padding: "7px 10px", color: "#4a5a40" }}>{l.variety || "—"}{lmeta.subVariety ? <span style={{ display: "block", fontSize: 10, color: "#c8791a", fontWeight: 700 }}>→ {lmeta.subVariety}</span> : null}</td>
                          <td style={{ padding: "7px 10px" }}><span style={{ background: m.bg, color: m.color, borderRadius: 8, padding: "2px 6px", fontSize: 10, fontWeight: 700 }}>{m.icon}</span></td>
                          <td style={{ padding: "7px 10px", color: "#7a8c74" }}>{tray}</td>
                          <td style={{ padding: "7px 10px", fontWeight: 800 }}>{(lmeta.subQty || l.orderQty||0).toLocaleString()}</td>
                          <td style={{ padding: "7px 10px", color: "#7fb069" }}>{l.lineCost != null ? `$${l.lineCost.toFixed(2)}` : "—"}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <span style={{ fontSize: 9, fontFamily: "monospace", color: "#9aaa90" }}>{l.ballItemNumber || "—"}</span>
                              {lmeta.status && lmeta.status !== "pending" && <span style={{ background: lstat.bg, color: lstat.color, borderRadius: 6, padding: "1px 5px", fontSize: 9, fontWeight: 700 }}>{lstat.label}</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── LINE STATUS MODAL ─────────────────────────────────────────────────────────
function LineStatusModal({ line, current, onSave, onClose }) {
  const [status,     setStatus]     = useState(current?.status     || "pending");
  const [subVariety, setSubVariety] = useState(current?.subVariety || "");
  const [subQty,     setSubQty]     = useState(current?.subQty     || "");
  const [note,       setNote]       = useState(current?.note       || "");
  const [focus,      setFocus]      = useState(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "linear-gradient(135deg,#1e2d1a,#2e4a22)", padding: "16px 22px", borderRadius: "20px 20px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 16, color: "#c8e6b8" }}>Update Line Status</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#c8e6b8", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
        <div style={{ padding: "18px 22px" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a", marginBottom: 2 }}>{line.cultivar || line.cropName}</div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 18 }}>{line.variety} · {line.broker} · {(line.orderQty||0).toLocaleString()} units</div>

          <div style={{ marginBottom: 16 }}>
            <FL c="Status" />
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {LINE_STATUSES.map(s => (
                <button key={s.id} onClick={() => setStatus(s.id)}
                  style={{ padding: "6px 13px", borderRadius: 10, border: `1.5px solid ${status === s.id ? s.color : "#dde8d5"}`, background: status === s.id ? s.bg : "#fff", color: status === s.id ? s.color : "#7a8c74", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {status === "substituted" && (
            <div style={{ background: "#fff8f0", borderRadius: 12, border: "1.5px solid #f0d0a0", padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7a5010", marginBottom: 12 }}>🔄 Substitution Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <FL c="Substitute Variety" />
                  <input value={subVariety} onChange={e => setSubVariety(e.target.value)}
                    onFocus={() => setFocus("sv")} onBlur={() => setFocus(null)}
                    placeholder="What they're sending instead..." style={IS(focus === "sv")} />
                </div>
                <div>
                  <FL c="Actual Qty" />
                  <input type="number" value={subQty} onChange={e => setSubQty(e.target.value)}
                    onFocus={() => setFocus("sq")} onBlur={() => setFocus(null)}
                    placeholder={line.orderQty} style={IS(focus === "sq")} />
                </div>
              </div>
            </div>
          )}

          {(status === "short" || status === "cancelled") && (
            <div style={{ background: "#fff0f0", borderRadius: 12, border: "1.5px solid #f0c0c0", padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7a1010", marginBottom: 10 }}>
                {status === "short" ? "⚠️ Shortage Details" : "❌ Cancellation Details"}
              </div>
              <FL c="Notes" />
              <input value={note} onChange={e => setNote(e.target.value)}
                onFocus={() => setFocus("note")} onBlur={() => setFocus(null)}
                placeholder={status === "short" ? "How short? Any alternatives?" : "Reason for cancellation..."}
                style={IS(focus === "note")} />
            </div>
          )}

          {status !== "short" && status !== "cancelled" && status !== "substituted" && (
            <div style={{ marginBottom: 14 }}>
              <FL c="Notes (optional)" />
              <input value={note} onChange={e => setNote(e.target.value)}
                onFocus={() => setFocus("n2")} onBlur={() => setFocus(null)}
                placeholder="Any notes..." style={IS(focus === "n2")} />
            </div>
          )}

          <button onClick={() => { onSave({ status, subVariety, subQty: subQty ? Number(subQty) : null, note }); onClose(); }}
            style={{ width: "100%", background: "#7fb069", color: "#fff", border: "none", borderRadius: 12, padding: "11px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── BROKER CARD ───────────────────────────────────────────────────────────────
function BrokerCard({ broker, lines, meta, onUpdateMeta, onViewPO }) {
  const [expanded,    setExpanded]    = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [focusConf,   setFocusConf]   = useState(false);
  const [focusNotes,  setFocusNotes]  = useState(false);
  const fileRef = useRef();

  const totalQty  = lines.reduce((s, l) => s + (l.orderQty || 0), 0);
  const totalCost = lines.reduce((s, l) => s + (l.lineCost || 0), 0);
  const hasCosts  = lines.some(l => l.lineCost != null);
  const matTypes  = [...new Set(lines.map(l => l.materialType))];

  const weekMap = {};
  lines.forEach(l => { const k = l.arrivalWeek||0; weekMap[k]=(weekMap[k]||0)+(l.orderQty||0); });
  const weeks = Object.entries(weekMap).sort(([a],[b])=>+a-+b);

  const overrides  = meta?.lineOverrides || {};
  const subCount   = Object.values(overrides).filter(o => o.status === "substituted").length;
  const shortCount = Object.values(overrides).filter(o => o.status === "short").length;
  const confCount  = Object.values(overrides).filter(o => o.status === "confirmed").length;
  const orderStatus = os(meta?.status || "draft");

  function updateLineMeta(key, data) {
    const current = meta?.lineOverrides || {};
    onUpdateMeta({ lineOverrides: { ...current, [key]: { ...(current[key] || {}), ...data } } });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${shortCount > 0 ? "#f0c0c0" : subCount > 0 ? "#f0d8a0" : "#e0ead8"}`, overflow: "hidden", marginBottom: 14 }}>

      {/* Header */}
      <div style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: "#fafcf8" }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1e2d1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 17 }}>📋</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{broker}</span>
            <span style={{ background: orderStatus.color + "18", color: orderStatus.color, border: `1px solid ${orderStatus.color}40`, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{orderStatus.label}</span>
            {meta?.confirmationNum && <span style={{ fontSize: 11, color: "#7a8c74" }}>#{meta.confirmationNum}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#7a8c74" }}>{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
            {matTypes.map(id => { const m = mt(id); return <span key={id} style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40`, borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{m.icon} {m.label}</span>; })}
            {subCount   > 0 && <span style={{ background: "#fff4e8", color: "#c8791a", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>🔄 {subCount} sub{subCount !== 1 ? "s" : ""}</span>}
            {shortCount > 0 && <span style={{ background: "#fef0f0", color: "#c03030", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>⚠️ {shortCount} short</span>}
            {confCount  > 0 && <span style={{ background: "#e8f8e8", color: "#2e7d32", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>✓ {confCount}</span>}
            {meta?.pdfName  && <span style={{ background: "#f0f0ff", color: "#4a50d9", borderRadius: 20, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>📎 PDF</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: "#1e2d1a" }}>{totalQty.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: "#7a8c74" }}>units</div>
          {hasCosts && totalCost > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: "#7fb069" }}>${totalCost.toFixed(0)}</div>}
        </div>
        <button onClick={e => { e.stopPropagation(); onViewPO(); }}
          style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 9, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          PO →
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee" }}>

          {/* Order meta strip */}
          <div style={{ background: "#f8faf6", padding: "12px 18px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", borderBottom: "1px solid #e8ede4" }}>
            <div>
              <FL c="Order Status" />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {ORDER_STATUSES.map(s => (
                  <button key={s.id} onClick={() => onUpdateMeta({ status: s.id })}
                    style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${(meta?.status||"draft") === s.id ? s.color : "#dde8d5"}`, background: (meta?.status||"draft") === s.id ? s.color + "18" : "#fff", color: (meta?.status||"draft") === s.id ? s.color : "#7a8c74", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 150 }}>
              <FL c="Confirmation #" />
              <input value={meta?.confirmationNum || ""} onChange={e => onUpdateMeta({ confirmationNum: e.target.value })}
                onFocus={() => setFocusConf(true)} onBlur={() => setFocusConf(false)}
                placeholder="Enter conf. number..." style={{ ...IS(focusConf) }} />
            </div>
            <div>
              <FL c="Confirmation PDF" />
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.png" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) onUpdateMeta({ pdfName: f.name, pdfDate: new Date().toLocaleDateString() }); }} />
              {meta?.pdfName ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", paddingTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#4a50d9", fontWeight: 700 }}>📎 {meta.pdfName}</span>
                  <button onClick={() => onUpdateMeta({ pdfName: null })} style={{ background: "none", border: "none", color: "#c03030", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <button onClick={() => fileRef.current.click()}
                  style={{ padding: "5px 12px", borderRadius: 7, border: "1.5px dashed #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  📎 Attach
                </button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FL c="Notes" />
              <input value={meta?.notes || ""} onChange={e => onUpdateMeta({ notes: e.target.value })}
                onFocus={() => setFocusNotes(true)} onBlur={() => setFocusNotes(false)}
                placeholder="Order notes..." style={{ ...IS(focusNotes) }} />
            </div>
          </div>

          {/* Line items */}
          <div style={{ padding: "0 0 8px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 50px 70px 55px 75px 100px", padding: "6px 18px", gap: 10, background: "#f0f5ee" }}>
              {["Cultivar","Variety","Type","Tray","Wk","Qty","Status"].map((h,i) => (
                <div key={i} style={{ fontSize: 9, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .5, textAlign: i >= 5 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            {lines.map((l, i) => {
              const m    = l.matType;
              const tray = l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || (l.seedForm ? l.seedForm : "—");
              const key  = lineKey(l);
              const over = overrides[key] || {};
              const stat = ls(over.status || "pending");
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr 50px 70px 55px 75px 100px", padding: "8px 18px", gap: 10, borderTop: "1px solid #f0f5ee", alignItems: "center", background: over.status === "short" ? "#fff8f8" : over.status === "substituted" ? "#fffbf0" : i%2===0?"#fff":"#fafcf8" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.cultivar || l.cropName}
                    {l.groupNumber && <span style={{ marginLeft: 4, background: "#e0ead8", borderRadius: 4, padding: "1px 4px", fontSize: 9, color: "#7a8c74" }}>G{l.groupNumber}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#4a5a40", overflow: "hidden" }}>
                    <div style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.variety || "—"}</div>
                    {over.subVariety && <div style={{ fontSize: 10, color: "#c8791a", fontWeight: 700 }}>→ {over.subVariety}</div>}
                  </div>
                  <div><span style={{ background: m.bg, color: m.color, borderRadius: 8, padding: "2px 5px", fontSize: 10, fontWeight: 700 }}>{m.icon}</span></div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>{tray}</div>
                  <div style={{ fontSize: 11, color: "#4a90d9", fontWeight: 700, textAlign: "right" }}>{l.arrivalWeek ? `Wk ${l.arrivalWeek}` : "—"}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", textAlign: "right" }}>
                    {(over.subQty || l.orderQty || 0).toLocaleString()}
                    {over.subQty && over.subQty !== l.orderQty && <div style={{ fontSize: 9, color: "#9aaa90", textDecoration: "line-through" }}>{(l.orderQty||0).toLocaleString()}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <button onClick={() => setEditingLine({ line: l, key })}
                      style={{ background: stat.bg, color: stat.color, border: `1.5px solid ${stat.color}40`, borderRadius: 8, padding: "3px 9px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {stat.label} ▾
                    </button>
                    {over.note && <div style={{ fontSize: 9, color: "#9aaa90", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }} title={over.note}>{over.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Week summary */}
          {weeks.length > 0 && (
            <div style={{ padding: "8px 18px 14px", display: "flex", gap: 7, flexWrap: "wrap" }}>
              {weeks.map(([wk, qty]) => (
                <div key={wk} style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 9, padding: "5px 11px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#7a8c74", fontWeight: 700 }}>Wk {wk}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#2e5c1e" }}>{qty.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingLine && (
        <LineStatusModal
          line={editingLine.line}
          current={overrides[editingLine.key]}
          onSave={data => updateLineMeta(editingLine.key, data)}
          onClose={() => setEditingLine(null)}
        />
      )}
    </div>
  );
}

// ── ALERTS PANEL ──────────────────────────────────────────────────────────────
function AlertsPanel({ brokers, allMeta }) {
  const subs = [], shorts = [], unconf = [];
  brokers.forEach(([broker, lines]) => {
    const meta = allMeta[broker] || {};
    const overrides = meta.lineOverrides || {};
    lines.forEach(l => {
      const over = overrides[lineKey(l)] || {};
      if (over.status === "substituted") subs.push({ broker, line: l, over });
      if (over.status === "short")       shorts.push({ broker, line: l, over });
    });
    if (!meta.confirmationNum && (!meta.status || meta.status === "draft" || meta.status === "sent")) {
      unconf.push({ broker, lineCount: lines.length });
    }
  });
  if (!subs.length && !shorts.length && !unconf.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      {shorts.map((s, i) => (
        <div key={`short-${i}`} style={{ background: "#fef0f0", border: "1.5px solid #f0c0c0", borderRadius: 11, padding: "10px 15px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#7a1010" }}>Shortage — {s.line.cultivar || s.line.cropName}</span>
            {s.line.variety && <span style={{ fontSize: 12, color: "#9a3030", marginLeft: 6 }}>{s.line.variety}</span>}
            <span style={{ fontSize: 11, color: "#9a5050", marginLeft: 8 }}>via {s.broker}</span>
            {s.over.note && <div style={{ fontSize: 11, color: "#7a3030", marginTop: 2 }}>{s.over.note}</div>}
          </div>
          <span style={{ fontSize: 11, color: "#c03030", fontWeight: 800 }}>{(s.line.orderQty||0).toLocaleString()} units</span>
        </div>
      ))}
      {subs.map((s, i) => (
        <div key={`sub-${i}`} style={{ background: "#fffbf0", border: "1.5px solid #f0d8a0", borderRadius: 11, padding: "10px 15px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17 }}>🔄</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#7a4a10" }}>Substitution — {s.line.cultivar || s.line.cropName}</span>
            {s.over.subVariety && <span style={{ fontSize: 12, color: "#c8791a", marginLeft: 6 }}>→ {s.over.subVariety}</span>}
            <span style={{ fontSize: 11, color: "#9a7030", marginLeft: 8 }}>via {s.broker}</span>
          </div>
          <span style={{ fontSize: 11, color: "#c8791a", fontWeight: 800 }}>{(s.over.subQty || s.line.orderQty||0).toLocaleString()} units</span>
        </div>
      ))}
      {unconf.map((u, i) => (
        <div key={`unconf-${i}`} style={{ background: "#f8f8ff", border: "1.5px solid #c8c8f0", borderRadius: 11, padding: "10px 15px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17 }}>📋</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: "#3a3a7a" }}>Awaiting Confirmation — {u.broker}</span>
            <span style={{ fontSize: 11, color: "#7a7aa0", marginLeft: 8 }}>{u.lineCount} lines · no confirmation # logged</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function YoungPlantOrders() {
  const { rows: runs } = useCropRuns();
  const currentYear = new Date().getFullYear();

  const [yearFilter, setYearFilter] = useState(currentYear);
  const [matFilter,  setMatFilter ] = useState("all");
  const [activePO,   setActivePO  ] = useState(null);
  const [allMeta,    setAllMeta   ] = useState(() => load(STORAGE_KEY, {}));

  function persistMeta(m) { setAllMeta(m); save(STORAGE_KEY, m); }
  function updateBrokerMeta(broker, updates) {
    const updated = { ...allMeta, [broker]: { ...(allMeta[broker] || {}), ...updates } };
    persistMeta(updated);
  }

  const allLines = deriveLines(runs);
  const filtered = allLines.filter(l => {
    if (yearFilter !== "all" && l.arrivalYear && +l.arrivalYear !== +yearFilter) return false;
    if (matFilter  !== "all" && l.materialType !== matFilter) return false;
    return true;
  });

  const brokerMap = {};
  filtered.forEach(l => { if (!brokerMap[l.broker]) brokerMap[l.broker]=[]; brokerMap[l.broker].push(l); });
  const brokers = Object.entries(brokerMap).sort(([a],[b]) => a.localeCompare(b));

  const years      = [...new Set([currentYear, currentYear+1, ...allLines.map(l=>+l.arrivalYear).filter(Boolean)])].sort();
  const grandQty   = filtered.reduce((s,l) => s+(l.orderQty||0), 0);
  const grandCost  = filtered.reduce((s,l) => s+(l.lineCost||0), 0);
  const noSourcing = runs.filter(r => !r.materialType).length;

  const allOverrides  = Object.values(allMeta).flatMap(m => Object.values(m.lineOverrides || {}));
  const totalSubs     = allOverrides.filter(o => o.status === "substituted").length;
  const totalShorts   = allOverrides.filter(o => o.status === "short").length;
  const totalConfirmed = allOverrides.filter(o => o.status === "confirmed").length;

  return (
    <div>
      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Total Units",    value: grandQty.toLocaleString(),  color: "#1e2d1a", alert: false },
          { label: "Est. Cost",      value: grandCost > 0 ? `$${Math.round(grandCost).toLocaleString()}` : "—", color: "#7fb069", alert: false },
          { label: "Brokers",        value: brokers.length,             color: "#4a90d9", alert: false },
          { label: "Confirmed",      value: totalConfirmed,             color: "#2e7d32", alert: false },
          { label: "Substitutions",  value: totalSubs,                  color: totalSubs   > 0 ? "#c8791a" : "#7a8c74", alert: totalSubs   > 0 },
          { label: "Shortages",      value: totalShorts,                color: totalShorts > 0 ? "#c03030" : "#7a8c74", alert: totalShorts > 0 },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${s.alert ? (s.label === "Shortages" ? "#f0c0c0" : "#f0d8a0") : "#e0ead8"}`, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {noSourcing > 0 && (
        <div style={{ background: "#fff8e8", border: "1.5px solid #f0d080", borderRadius: 11, padding: "10px 15px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span>⚠️</span>
          <div style={{ fontSize: 13, color: "#7a5a10" }}>
            <strong>{noSourcing} crop run{noSourcing !== 1 ? "s" : ""}</strong> missing sourcing — open each and complete the <strong>Sourcing</strong> tab.
          </div>
        </div>
      )}

      <AlertsPanel brokers={brokers} allMeta={allMeta} />

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6 }}>Year</span>
        {[["all","All"], ...years.map(y=>[String(y),String(y)])].map(([val, lbl]) => (
          <button key={val} onClick={() => setYearFilter(val === "all" ? "all" : +val)}
            style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${yearFilter == val ? "#1e2d1a" : "#c8d8c0"}`, background: yearFilter == val ? "#1e2d1a" : "#fff", color: yearFilter == val ? "#c8e6b8" : "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {lbl}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: "#c8d8c0" }} />
        <span style={{ fontSize: 10, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6 }}>Type</span>
        {[["all","All"], ...MATERIAL_TYPES.map(m=>[m.id,`${m.icon} ${m.label}`])].map(([val, lbl]) => (
          <button key={val} onClick={() => setMatFilter(val)}
            style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${matFilter === val ? "#7fb069" : "#c8d8c0"}`, background: matFilter === val ? "#f0f8eb" : "#fff", color: matFilter === val ? "#2e5c1e" : "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {lbl}
          </button>
        ))}
      </div>

      {brokers.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>No orders yet</div>
          <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
            Open your crop runs and fill in the <strong>Sourcing</strong> tab — set material type, broker, tray size, and cost. Orders will appear here automatically, one card per broker.
          </div>
        </div>
      ) : brokers.map(([broker, lines]) => (
        <BrokerCard
          key={broker}
          broker={broker}
          lines={lines}
          meta={allMeta[broker]}
          onUpdateMeta={updates => updateBrokerMeta(broker, updates)}
          onViewPO={() => setActivePO({ broker, lines })}
        />
      ))}

      {activePO && (
        <PODocument
          broker={activePO.broker}
          lines={activePO.lines}
          meta={allMeta[activePO.broker]}
          onClose={() => setActivePO(null)}
        />
      )}

      {/* ── TAGS SECTION ── */}
      {(() => {
        const tagRuns = runs.filter(r => r.needsTags && r.cropName);
        if (tagRuns.length === 0) return null;

        const isCased = r => r.isCased ?? true;
        const pSize = r => isCased(r) ? (Number(r.packSize) || 10) : 1;
        const tagLines = tagRuns.map(r => {
          const totalPots = (Number(r.cases) || 0) * pSize(r);
          const buffered = Math.ceil(totalPots * (1 + (Number(r.bufferPct) || 0) / 100));
          const qty = Number(r.tagOrderQty) || buffered;
          const costEach = Number(r.tagCostPerTag) || 0;
          return {
            id: r.id,
            cropName: r.cropName,
            tagDescription: r.tagDescription || r.cropName,
            supplier: r.tagSupplier || "—",
            printInHouse: r.tagPrintInHouse,
            qty,
            totalPots,
            costEach,
            totalCost: qty * costEach || null,
            notes: r.tagNotes || "",
            targetWeek: r.targetWeek,
            targetYear: r.targetYear,
          };
        }).filter(l => l.qty > 0);

        if (tagLines.length === 0) return null;

        const totalTags = tagLines.reduce((s, l) => s + l.qty, 0);
        const totalTagCost = tagLines.reduce((s, l) => s + (l.totalCost || 0), 0);
        const printCount = tagLines.filter(l => l.printInHouse).length;
        const orderCount = tagLines.filter(l => !l.printInHouse).length;

        return (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a" }}>🏷 Tag Orders</div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>{totalTags.toLocaleString()} total</span>
                {printCount > 0 && <span style={{ background: "#e8f3fc", border: "1px solid #a0c4e8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#1a4a7a" }}>🖨 {printCount} in-house</span>}
                {orderCount > 0 && <span style={{ background: "#fdf3ea", border: "1px solid #e8c090", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#a04010" }}>📦 {orderCount} to order</span>}
                {totalTagCost > 0 && <span style={{ background: "#f8f0fc", border: "1px solid #d0a8e8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#6a2a9a" }}>${totalTagCost.toFixed(2)}</span>}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8faf6", borderBottom: "1.5px solid #e0ead8" }}>
                    {["Crop Run", "Tag", "Source", "Supplier", "Qty", "$ / tag", "Total", "Wk Ready", "Notes"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, textAlign: "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tagLines.map((l, i) => (
                    <tr key={l.id} style={{ borderBottom: "1px solid #f0f5ee", background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1e2d1a" }}>{l.cropName}</td>
                      <td style={{ padding: "10px 14px", color: "#4a5a40" }}>{l.tagDescription}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: l.printInHouse ? "#e8f3fc" : "#f0f8eb", border: `1px solid ${l.printInHouse ? "#a0c4e8" : "#c8e0b8"}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: l.printInHouse ? "#1a4a7a" : "#2e5c1e" }}>
                          {l.printInHouse ? "🖨 Print" : "📦 Order"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{l.supplier}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "#1e2d1a" }}>{l.qty.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", color: "#8e44ad" }}>{l.costEach ? `$${Number(l.costEach).toFixed(3)}` : "—"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2e5c1e" }}>{l.totalCost ? `$${l.totalCost.toFixed(2)}` : "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{l.targetWeek ? `Wk ${l.targetWeek}` : "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#aabba0", fontStyle: "italic", maxWidth: 200 }}>{l.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
