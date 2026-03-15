import { useState, useRef } from "react";
import { useCropRuns, useContainers } from "./supabase";
import { VarietySwapTab, AdvancedSearchTab } from "./VarietySwapAdvancedSearch";

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
    const broker = run.sourcingBroker || run.broker || "";
    if (!broker) return;
    const arrival = computeArrivalWeek(run);
    const matType = mt(run.materialType);
    const makeLineBase = (qty) => {
      const buffered = Math.ceil(qty * (1 + (+run.bufferPct || 0) / 100));
      const lineCost = run.unitCost ? +(run.unitCost * buffered).toFixed(2) : null;
      return {
        runId: run.id, broker, cropName: run.cropName,
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

// ── CONTAINER ORDERS TAB ──────────────────────────────────────────────────────
function ContainerOrdersTab({ containerTotals, propTrayTotals, containers, runs, tagOrderLines = [], tagByType = {}, tagGrandTotal = 0, tagTotalCost = 0 }) {
  const propTraySizes = Object.values(propTrayTotals).sort((a,b) => a.cellSize - b.cellSize);
  const finishedEntries = Object.entries(containerTotals)
    .map(([id, data]) => ({ id, ...data, container: containers.find(c => c.id === id) }))
    .sort((a,b) => (a.container?.name || "").localeCompare(b.container?.name || ""));

  const totalFinishedCost = finishedEntries.reduce((s, e) => {
    return s + (e.container?.costPerUnit ? e.totalPots * Number(e.container.costPerUnit) : 0);
  }, 0);

  // Find matching prop tray containers from library
  const propTrayContainers = containers.filter(c => c.kind === "propagation");
  function matchPropTray(cellSize) {
    return propTrayContainers.find(c => Number(c.cellsPerFlat) === cellSize);
  }

  async function downloadXLSX() {
    const XLSX = await new Promise((res, rej) => {
      if (window.XLSX) { res(window.XLSX); return; }
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => res(window.XLSX); s.onerror = rej;
      document.head.appendChild(s);
    });
    const wb = XLSX.utils.book_new();

    // Sheet 1: Finished containers
    const finRows = [
      ["FINISHED CONTAINER ORDER", "", "", "", ""],
      ["Container", "Supplier / SKU", "Pots Needed", "Cost/Unit", "Est. Total"],
      ...finishedEntries.map(e => [
        e.container?.name || e.id,
        [e.container?.supplier, e.container?.sku].filter(Boolean).join(" / ") || "—",
        e.totalPots,
        e.container?.costPerUnit ? Number(e.container.costPerUnit).toFixed(4) : "",
        e.container?.costPerUnit ? (e.totalPots * Number(e.container.costPerUnit)).toFixed(2) : "",
      ]),
      [],
      ["TOTAL EST. COST", "", "", "", totalFinishedCost > 0 ? totalFinishedCost.toFixed(2) : ""],
    ];

    // Sheet 2: Prop trays
    const propRows = [
      ["PROPAGATION TRAY ORDER", "", "", ""],
      ["Cell Size", "Trays Needed", "Supplier / SKU", "Est. Cost"],
      ...propTraySizes.map(pt => {
        const lib = matchPropTray(pt.cellSize);
        return [
          `${pt.cellSize}-cell`,
          pt.totalTrays,
          lib ? [lib.supplier, lib.sku].filter(Boolean).join(" / ") || "—" : "—",
          lib?.costPerUnit ? (pt.totalTrays * Number(lib.costPerUnit)).toFixed(2) : "",
        ];
      }),
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(finRows);
    ws1["!cols"] = [28, 20, 14, 12, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, "Finished Containers");

    if (propTraySizes.length > 0) {
      const ws2 = XLSX.utils.aoa_to_sheet(propRows);
      ws2["!cols"] = [14, 14, 22, 14].map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws2, "Prop Trays");
    }

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "Container_Order_" + new Date().getFullYear() + "_Spring.xlsx";
    a.click(); URL.revokeObjectURL(url);
  }

  const [innerTab, setInnerTab] = useState("containers");

  const TAG_TYPE_META = {
    ordered: { label: "📦 Order from supplier",        color: "#2e5c1e", bg: "#f0f8eb", desc: "Physical decorative tag — ordered from printer" },
    sticker: { label: "🏷 Decorative + print sticker", color: "#1a4a7a", bg: "#e8f3fc", desc: "Order tag body, print our own label stickers" },
    inhouse: { label: "🖨 Print in-house",             color: "#7a2a9a", bg: "#f5f0ff", desc: "We print the entire tag on our printer" },
  };

  return (
    <div>
      {/* Header + download */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, color: "#1e2d1a" }}>Orders Running Total</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 3 }}>Across all crop runs — order everything at once</div>
        </div>
        <button onClick={downloadXLSX}
          style={{ background: "#2e5c1e", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          📥 Download Order (.xlsx)
        </button>
      </div>

      {/* Inner tabs: Containers | Tags */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #e0ead8" }}>
        {[["containers","📦 Containers & Trays"],["tags","🏷 Tag Orders"]].map(([id, label]) => (
          <button key={id} onClick={() => setInnerTab(id)}
            style={{ padding: "8px 18px", borderRadius: "8px 8px 0 0", border: "1.5px solid #e0ead8", borderBottom: innerTab === id ? "2px solid #fff" : "none", background: innerTab === id ? "#fff" : "#f8faf6", color: innerTab === id ? "#1e2d1a" : "#7a8c74", fontWeight: innerTab === id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: innerTab === id ? -2 : 0 }}>
            {label}{id === "tags" && tagGrandTotal > 0 ? ` (${tagGrandTotal.toLocaleString()})` : ""}
          </button>
        ))}
      </div>

      {innerTab === "tags" && (
        <TagOrdersTab tagByType={tagByType} tagGrandTotal={tagGrandTotal} tagTotalCost={tagTotalCost} tagOrderLines={tagOrderLines} TAG_TYPE_META={TAG_TYPE_META} />
      )}

      {innerTab === "containers" && (<>

      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Container Types", value: finishedEntries.length, color: "#1e2d1a" },
          { label: "Total Pots", value: finishedEntries.reduce((s,e) => s+e.totalPots, 0).toLocaleString(), color: "#4a90d9" },
          { label: "Est. Container Cost", value: totalFinishedCost > 0 ? "$" + Math.round(totalFinishedCost).toLocaleString() : "—", color: "#7fb069" },
          { label: "Prop Tray Sizes", value: propTraySizes.length, color: "#8e44ad" },
          { label: "Total Prop Trays", value: propTraySizes.reduce((s,p) => s+p.totalTrays, 0).toLocaleString(), color: "#e07b39" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .6, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── FINISHED CONTAINERS ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#1e2d1a", marginBottom: 12 }}>🛒 Finished Containers</div>
        {finishedEntries.length === 0 ? (
          <div style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #c8d8c0", padding: "32px", textAlign: "center", color: "#7a8c74", fontSize: 13 }}>
            No containers assigned to crop runs yet — set containers on each crop run.
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8faf6", borderBottom: "1.5px solid #e0ead8" }}>
                  {["Container", "Supplier", "SKU", "Pots Needed", "$/unit", "Est. Total", "Crop Runs"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finishedEntries.map((e, i) => {
                  const cost = e.container?.costPerUnit ? e.totalPots * Number(e.container.costPerUnit) : null;
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1e2d1a" }}>
                        {e.container?.name || "Unknown container"}
                        {e.container?.diameter && <span style={{ fontSize: 11, color: "#7a8c74", marginLeft: 6 }}>{e.container.diameter}"</span>}
                      </td>
                      <td style={{ padding: "10px 14px", color: "#4a5a40" }}>{e.container?.supplier || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74", fontFamily: "monospace", fontSize: 11 }}>{e.container?.sku || "—"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 800, color: "#1e2d1a" }}>{e.totalPots.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", color: "#7a8c74" }}>{e.container?.costPerUnit ? "$" + Number(e.container.costPerUnit).toFixed(4) : "—"}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2e5c1e" }}>{cost ? "$" + cost.toFixed(2) : "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {e.runs.slice(0,4).map((r,ri) => (
                            <span key={ri} style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "2px 8px", fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>
                              {r.cropName} ({r.pots.toLocaleString()})
                            </span>
                          ))}
                          {e.runs.length > 4 && <span style={{ fontSize: 11, color: "#7a8c74" }}>+{e.runs.length-4} more</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalFinishedCost > 0 && (
              <div style={{ background: "#f0f8eb", padding: "10px 14px", display: "flex", justifyContent: "flex-end", gap: 20, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: "#2e5c1e" }}>Total: ${totalFinishedCost.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PROPAGATION TRAYS ── */}
      <div>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#1e2d1a", marginBottom: 4 }}>🌱 Propagation Trays</div>
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
          Auto-calculated from URC and Seed runs. 105-cell trays = 100 ordered plants (5 extras not counted).
        </div>
        {propTraySizes.length === 0 ? (
          <div style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #c8d8c0", padding: "32px", textAlign: "center", color: "#7a8c74", fontSize: 13 }}>
            No URC or Seed runs with a prop tray size set — add a tray size on each crop run.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {propTraySizes.map(pt => {
              const lib = matchPropTray(pt.cellSize);
              const cost = lib?.costPerUnit ? pt.totalTrays * Number(lib.costPerUnit) : null;
              return (
                <div key={pt.cellSize} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ background: "#f5f0ff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#4a2a8a" }}>{pt.cellSize}-cell trays</span>
                      {lib && <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 10 }}>{lib.name}{lib.supplier ? ` · ${lib.supplier}` : ""}{lib.sku ? ` · ${lib.sku}` : ""}</span>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: "#4a2a8a" }}>{pt.totalTrays.toLocaleString()} trays</div>
                      <div style={{ fontSize: 11, color: "#7a8c74" }}>{pt.totalPlants.toLocaleString()} plants across {pt.runs.length} run{pt.runs.length !== 1 ? "s" : ""}</div>
                      {cost && <div style={{ fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>${cost.toFixed(2)}</div>}
                    </div>
                  </div>
                  {/* Run breakdown */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#fafcf8", borderBottom: "1px solid #e0ead8" }}>
                        {["Crop Run", "Plants ordered", "Trays needed"].map(h => (
                          <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "#7a8c74", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pt.runs.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                          <td style={{ padding: "8px 14px", fontWeight: 600, color: "#1e2d1a" }}>{r.cropName}</td>
                          <td style={{ padding: "8px 14px", color: "#7a8c74" }}>{r.plants.toLocaleString()}</td>
                          <td style={{ padding: "8px 14px", fontWeight: 700, color: "#4a2a8a" }}>{r.trays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!lib && (
                    <div style={{ padding: "8px 14px", background: "#fff8f0", fontSize: 11, color: "#a04010" }}>
                      ⚠️ No {pt.cellSize}-cell tray found in your container library — add one to get cost estimates and supplier info.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      </>)}  {/* end innerTab === "containers" */}
    </div>
  );
}

// ── TAG ORDERS TAB ────────────────────────────────────────────────────────────
function TagOrdersTab({ tagByType, tagGrandTotal, tagTotalCost, tagOrderLines, TAG_TYPE_META }) {
  const [expandedRuns, setExpandedRuns] = useState({});
  const ordered = tagByType.ordered || [];
  const sticker = tagByType.sticker || [];
  const inhouse = tagByType.inhouse || [];
  const totalOrdered = ordered.reduce((s,t) => s+t.qty, 0);
  const totalSticker = sticker.reduce((s,t) => s+t.qty, 0);
  const totalInhouse = inhouse.reduce((s,t) => s+t.qty, 0);

  function toggleRun(key) { setExpandedRuns(p => ({ ...p, [key]: !p[key] })); }

  if (tagGrandTotal === 0) {
    return (
      <div style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #c8d8c0", padding: "40px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🏷</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a", marginBottom: 6 }}>No tag orders yet</div>
        <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 380, margin: "0 auto", lineHeight: 1.6 }}>
          Open each crop run → Tags tab → auto-populate from varieties. Each color gets its own tag row.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Summary tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Tags",              value: tagGrandTotal.toLocaleString(), color: "#1e2d1a" },
          { label: "📦 Order from supplier",  value: totalOrdered.toLocaleString(), color: "#2e5c1e" },
          { label: "🏷 Decorative + sticker", value: totalSticker.toLocaleString(), color: "#1a4a7a" },
          { label: "🖨 Print in-house",        value: totalInhouse.toLocaleString(), color: "#7a2a9a" },
          ...(tagTotalCost > 0 ? [{ label: "Est. Cost", value: "$"+tagTotalCost.toFixed(2), color: "#7fb069" }] : []),
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* One section per tag type */}
      {[
        { key: "ordered", rows: ordered, total: totalOrdered },
        { key: "sticker", rows: sticker, total: totalSticker },
        { key: "inhouse", rows: inhouse, total: totalInhouse },
      ].filter(g => g.rows.length > 0).map(({ key, rows, total }) => {
        const meta = TAG_TYPE_META[key];
        // Group rows by crop run
        const byRun = {};
        rows.forEach(t => {
          const rk = t.runId || t.cropName;
          if (!byRun[rk]) byRun[rk] = { runName: t.runName || t.cropName, rows: [] };
          byRun[rk].rows.push(t);
        });
        const runGroups = Object.entries(byRun);
        const sectionCost = rows.reduce((s,t) => s+t.qty*t.costPerTag, 0);

        return (
          <div key={key} style={{ marginBottom: 28 }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#1e2d1a" }}>{meta.label}</div>
              <span style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 20, padding: "2px 12px", fontSize: 12, fontWeight: 700, color: meta.color }}>{total.toLocaleString()} tags</span>
              {sectionCost > 0 && <span style={{ fontSize: 12, color: "#7a8c74" }}>Est. ${sectionCost.toFixed(2)}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 10, fontStyle: "italic" }}>{meta.desc}</div>

            {/* Crop run cards — expandable */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {runGroups.map(([rk, group]) => {
                const isOpen = expandedRuns[key + rk];
                const runTotal = group.rows.reduce((s,t) => s+t.qty, 0);
                const runCost  = group.rows.reduce((s,t) => s+t.qty*t.costPerTag, 0);
                return (
                  <div key={rk} style={{ border: `1.5px solid ${meta.color}30`, borderRadius: 12, overflow: "hidden" }}>
                    {/* Run header — click to expand */}
                    <div onClick={() => toggleRun(key+rk)}
                      style={{ background: meta.bg, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none" }}>
                      <span style={{ fontSize: 14, color: meta.color, transition: "transform .2s", display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a", flex: 1 }}>{group.runName}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{runTotal.toLocaleString()} tags</span>
                      {runCost > 0 && <span style={{ fontSize: 12, color: "#7a8c74" }}>${runCost.toFixed(2)}</span>}
                      <span style={{ fontSize: 11, color: "#aabba0" }}>{group.rows.length} color{group.rows.length !== 1 ? "s" : ""}</span>
                    </div>

                    {/* Expanded color rows */}
                    {isOpen && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#fafcf8", borderBottom: "1px solid #e0ead8" }}>
                            {["Color / Variety","Supplier","Qty","Price / tag","Total","Notes"].map(h => (
                              <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((t, i) => {
                            const lineCost = t.qty * t.costPerTag;
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                                <td style={{ padding: "9px 14px" }}>
                                  <span style={{ background: meta.bg, border: `1px solid ${meta.color}40`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600, color: meta.color }}>{t.color || "—"}</span>
                                </td>
                                <td style={{ padding: "9px 14px", color: "#7a8c74" }}>{t.supplier || "—"}</td>
                                <td style={{ padding: "9px 14px", fontWeight: 800, color: "#1e2d1a" }}>{(t.qty||0).toLocaleString()}</td>
                                <td style={{ padding: "9px 14px", color: "#8e44ad", fontWeight: 600 }}>{t.costPerTag ? "$"+Number(t.costPerTag).toFixed(4) : "—"}</td>
                                <td style={{ padding: "9px 14px", fontWeight: 700, color: "#2e5c1e" }}>{lineCost > 0 ? "$"+lineCost.toFixed(2) : "—"}</td>
                                <td style={{ padding: "9px 14px", color: "#aabba0", fontSize: 11, fontStyle: "italic" }}>{t.notes}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Section footer total */}
            <div style={{ background: meta.bg, borderRadius: "0 0 10px 10px", padding: "8px 16px", display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label} — {runGroups.length} crop run{runGroups.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: meta.color }}>
                {total.toLocaleString()} tags{sectionCost > 0 && <span style={{ marginLeft: 16 }}>${sectionCost.toFixed(2)}</span>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function YoungPlantOrders() {
  const { rows: runs, upsert: upsertRun } = useCropRuns();
  const currentYear = new Date().getFullYear();

  const [mainTab,    setMainTab   ] = useState("plants");
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [matFilter,  setMatFilter ] = useState("all");
  const [activePO,   setActivePO  ] = useState(null);
  const [allMeta,    setAllMeta   ] = useState(() => load(STORAGE_KEY, {}));
  const { rows: containers } = useContainers();

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

  // ── CONTAINER + PROP TRAY TOTALS ──────────────────────────────────────────
  // For each run: finished container qty, prop tray qty (URC/Seed uses prop trays)
  function getPropTrayCount(run) {
    // Plants ordered — 105-cell = 100 plants (5 are extras), otherwise face value
    const packSz = Number(run.packSize) || 10;
    const cases  = Number(run.cases) || 0;
    const rawPlants = cases * packSz;
    // 105 tray = 100 ordered plants
    const orderedPlants = packSz === 105 ? cases * 100 : rawPlants;
    const traySize = Number(String(run.propTraySize || "").replace(/[^0-9]/g, "")) || 0;
    if (!traySize || !["urc","seed"].includes(run.materialType)) return null;
    return { trays: Math.ceil(orderedPlants / traySize), cellSize: traySize, plants: orderedPlants };
  }

  // Build container totals: finished containers grouped by containerId
  const containerTotals = {};
  runs.forEach(run => {
    if (!run.containerId) return;
    const isCased = run.isCased ?? true;
    const packSz  = isCased ? (Number(run.packSize) || 10) : 1;
    const pots    = (Number(run.cases) || 0) * packSz;
    if (!pots) return;
    if (!containerTotals[run.containerId]) {
      containerTotals[run.containerId] = { runs: [], totalPots: 0 };
    }
    containerTotals[run.containerId].runs.push({ cropName: run.cropName, pots, week: run.targetWeek });
    containerTotals[run.containerId].totalPots += pots;
  });

  // Build tag totals: across all runs, grouped by tagType (ordered/sticker/inhouse)
  const tagOrderLines = []; // { runName, cropName, color, tagType, supplier, qty, costPerTag }
  runs.forEach(run => {
    if (!run.needsTags) return;
    const colorTags = run.colorTags || [];
    if (colorTags.length === 0) return;
    colorTags.forEach(t => {
      tagOrderLines.push({
        runId: run.id,
        runName: run.cropName,
        cropName: t.cropName || run.cropName,
        color: t.color || "",
        tagType: t.tagType || "ordered",
        supplier: t.supplier || "",
        qty: Number(t.qty) || 0,
        costPerTag: Number(t.costPerTag) || 0,
        notes: t.notes || "",
      });
    });
  });
  const tagByType = {
    ordered: tagOrderLines.filter(t => t.tagType === "ordered"),
    sticker: tagOrderLines.filter(t => t.tagType === "sticker"),
    inhouse: tagOrderLines.filter(t => t.tagType === "inhouse"),
  };
  const tagGrandTotal = tagOrderLines.reduce((s,t) => s+t.qty, 0);
  const tagTotalCost  = tagOrderLines.reduce((s,t) => s+t.qty*t.costPerTag, 0);

  // Build prop tray totals: grouped by cell size
  const propTrayTotals = {};
  runs.forEach(run => {
    const info = getPropTrayCount(run);
    if (!info) return;
    const key = String(info.cellSize);
    if (!propTrayTotals[key]) propTrayTotals[key] = { cellSize: info.cellSize, runs: [], totalTrays: 0, totalPlants: 0 };
    propTrayTotals[key].runs.push({ cropName: run.cropName, trays: info.trays, plants: info.plants });
    propTrayTotals[key].totalTrays += info.trays;
    propTrayTotals[key].totalPlants += info.plants;
  });

  return (
    <div>
      {/* ── TOP TABS ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #e0ead8", paddingBottom: 0 }}>
        {[["plants","🌱 Plant Orders"],["containers","📦 Container Orders"],["swap","🔄 Variety Swap"],["search","🔍 Search"]].map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)}
            style={{ padding: "9px 20px", borderRadius: "8px 8px 0 0", border: "1.5px solid #e0ead8", borderBottom: mainTab === id ? "2px solid #fff" : "none", background: mainTab === id ? "#fff" : "#f8faf6", color: mainTab === id ? "#1e2d1a" : "#7a8c74", fontWeight: mainTab === id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: mainTab === id ? -2 : 0 }}>
            {label}
          </button>
        ))}
      </div>

      {mainTab === "containers" && (
        <ContainerOrdersTab containerTotals={containerTotals} propTrayTotals={propTrayTotals} containers={containers} runs={runs} tagOrderLines={tagOrderLines} tagByType={tagByType} tagGrandTotal={tagGrandTotal} tagTotalCost={tagTotalCost} />
      )}

      {mainTab === "swap" && (
        <VarietySwapTab runs={runs} onSaveRun={upsertRun} />
      )}

      {mainTab === "search" && (
        <AdvancedSearchTab runs={runs} onSaveRun={upsertRun} />
      )}

      {mainTab === "plants" && (<>
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
        // Collect all colorTag rows from all runs that need tags
        const allColorTags = [];
        runs.forEach(run => {
          if (!run.needsTags) return;
          const isCased = run.isCased ?? true;
          const pSize = isCased ? (Number(run.packSize) || 10) : 1;
          const defaultQty = (Number(run.cases) || 0) * 10;
          const tags = run.colorTags && run.colorTags.length > 0
            ? run.colorTags
            : run.needsTags ? [{ id: run.id + "_default", cropName: run.cropName, color: "", tagType: run.tagPrintInHouse ? "inhouse" : "ordered", supplier: run.tagSupplier || "", qty: Number(run.tagOrderQty) || defaultQty, costPerTag: run.tagCostPerTag || "", notes: "" }]
            : [];
          tags.forEach(t => allColorTags.push({ ...t, runId: run.id }));
        });

        if (allColorTags.length === 0) return null;

        const byType = { ordered: [], sticker: [], inhouse: [] };
        allColorTags.forEach(t => { const key = t.tagType || "ordered"; if (byType[key]) byType[key].push(t); });
        const totalOrdered  = byType.ordered.reduce((s,t)  => s+(Number(t.qty)||0), 0);
        const totalSticker  = byType.sticker.reduce((s,t)  => s+(Number(t.qty)||0), 0);
        const totalInhouse  = byType.inhouse.reduce((s,t)  => s+(Number(t.qty)||0), 0);
        const grandTotal    = totalOrdered + totalSticker + totalInhouse;
        const totalCost     = allColorTags.reduce((s,t) => s + (Number(t.qty)||0)*(Number(t.costPerTag)||0), 0);

        const TAG_TYPES = [
          { id: "ordered", label: "📦 Order from supplier",        color: "#2e5c1e", bg: "#f0f8eb", border: "#c8e0b8" },
          { id: "sticker", label: "🏷 Decorative + print sticker", color: "#1a4a7a", bg: "#e8f3fc", border: "#a0c4e8" },
          { id: "inhouse", label: "🖨 Print in-house",             color: "#7a2a9a", bg: "#f5f0ff", border: "#c0a0e0" },
        ];

        return (
          <div style={{ marginTop: 32 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a" }}>🏷 Tag Orders</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{grandTotal.toLocaleString()} total</span>
                {totalOrdered > 0  && <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>📦 {totalOrdered.toLocaleString()} ordered</span>}
                {totalSticker > 0  && <span style={{ background: "#e8f3fc", border: "1px solid #a0c4e8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#1a4a7a" }}>🏷 {totalSticker.toLocaleString()} sticker</span>}
                {totalInhouse > 0  && <span style={{ background: "#f5f0ff", border: "1px solid #c0a0e0", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#7a2a9a" }}>🖨 {totalInhouse.toLocaleString()} in-house</span>}
                {totalCost > 0     && <span style={{ background: "#fdf8ff", border: "1px solid #d0a8e8", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#6a2a9a" }}>${totalCost.toFixed(2)}</span>}
              </div>
            </div>

            {/* Three panels side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 }}>
              {TAG_TYPES.map(type => {
                const rows = byType[type.id];
                const typeTotal = rows.reduce((s,t) => s+(Number(t.qty)||0), 0);
                if (rows.length === 0) return (
                  <div key={type.id} style={{ background: "#f8faf6", borderRadius: 12, border: "1.5px dashed #e0ead8", padding: "24px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{type.label.split(" ")[0]}</div>
                    <div style={{ fontSize: 12, color: "#aabba0" }}>None this season</div>
                  </div>
                );
                return (
                  <div key={type.id} style={{ background: type.bg, borderRadius: 12, border: `1.5px solid ${type.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: `1px solid ${type.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: type.color }}>{type.label}</div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: type.color }}>{typeTotal.toLocaleString()}</div>
                    </div>
                    <div style={{ padding: "8px 0" }}>
                      {rows.map((t, i) => (
                        <div key={t.id || i} style={{ padding: "7px 14px", borderBottom: i < rows.length-1 ? `1px solid ${type.border}60` : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{t.cropName}</div>
                            {t.color && <div style={{ fontSize: 11, color: "#7a8c74" }}>{t.color}</div>}
                            {t.supplier && <div style={{ fontSize: 10, color: "#aabba0" }}>{t.supplier}</div>}
                            {t.notes && <div style={{ fontSize: 10, color: "#aabba0", fontStyle: "italic" }}>{t.notes}</div>}
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: type.color }}>{(Number(t.qty)||0).toLocaleString()}</div>
                            {t.costPerTag && <div style={{ fontSize: 10, color: "#7a8c74" }}>${(Number(t.qty)*Number(t.costPerTag)).toFixed(2)}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full table */}
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8faf6", borderBottom: "1.5px solid #e0ead8" }}>
                    {["Crop", "Color / Variety", "Tag Type", "Supplier", "Qty", "$/tag", "Total", "Notes"].map(h => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allColorTags.map((t, i) => {
                    const type = TAG_TYPES.find(x => x.id === (t.tagType || "ordered")) || TAG_TYPES[0];
                    return (
                      <tr key={t.id || i} style={{ borderBottom: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#1e2d1a" }}>{t.cropName}</td>
                        <td style={{ padding: "9px 12px", color: "#4a5a40" }}>{t.color || "—"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: type.bg, color: type.color, border: `1px solid ${type.border}` }}>
                            {type.label}
                          </span>
                        </td>
                        <td style={{ padding: "9px 12px", color: "#7a8c74" }}>{t.supplier || "—"}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 800, color: "#1e2d1a" }}>{(Number(t.qty)||0).toLocaleString()}</td>
                        <td style={{ padding: "9px 12px", color: "#7a8c74" }}>{t.costPerTag ? "$"+Number(t.costPerTag).toFixed(3) : "—"}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2e5c1e" }}>{t.costPerTag && t.qty ? "$"+(Number(t.qty)*Number(t.costPerTag)).toFixed(2) : "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#aabba0", fontStyle: "italic", fontSize: 11 }}>{t.notes || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      </>)}  {/* end mainTab === "plants" */}
    </div>
  );
}
