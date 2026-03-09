import { useState, useEffect } from "react";
import { useCropRuns } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const MATERIAL_TYPES = [
  { id: "urc",   label: "URC",   icon: "✂️",  color: "#8e44ad", bg: "#f5f0ff" },
  { id: "seed",  label: "Seed",  icon: "🌾",  color: "#c8791a", bg: "#fff4e8" },
  { id: "liner", label: "Liner", icon: "🪴",  color: "#2e7d9e", bg: "#e8f4f8" },
];

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

// ── DERIVE LINES FROM CROP RUNS ───────────────────────────────────────────────
function deriveLines(runs) {
  const lines = [];
  runs.forEach(run => {
    if (!run.materialType) return;
    const arrival = computeArrivalWeek(run);
    const matType = mt(run.materialType);
    const broker  = run.sourcingBroker || "Unassigned";
    const varieties = run.varieties || [];

    const makeLineBase = (qty) => {
      const buffered = Math.ceil(qty * (1 + (+run.bufferPct || 0) / 100));
      return {
        runId: run.id,
        cropName: run.cropName,
        groupNumber: run.groupNumber || "",
        materialType: run.materialType,
        matType,
        propTraySize: run.propTraySize || "",
        linerSize: run.linerSize || "",
        seedForm: run.seedForm || "",
        broker,
        supplier: run.sourcingSupplier || "",
        arrivalWeek: arrival?.week,
        arrivalYear: arrival?.year,
        targetWeek: run.targetWeek,
        targetYear: run.targetYear,
        baseQty: qty,
        bufferPct: +run.bufferPct || 0,
        orderQty: buffered,
        unitCost: run.unitCost ? +run.unitCost : null,
        lineCost: (buffered && run.unitCost) ? buffered * +run.unitCost : null,
      };
    };

    if (varieties.length > 0) {
      varieties.forEach(v => {
        const qty = (+v.cases || 0) * (+run.packSize || 10);
        lines.push({
          ...makeLineBase(qty),
          cultivar: v.cultivar || "",
          variety: v.name || "",
          ballItemNumber: v.ballItemNumber || "",
        });
      });
    } else {
      const qty = (+run.cases || 0) * (+run.packSize || 10);
      lines.push({
        ...makeLineBase(qty),
        cultivar: "",
        variety: run.cropName,
        ballItemNumber: "",
      });
    }
  });
  return lines;
}

// ── PO DOCUMENT ───────────────────────────────────────────────────────────────
function PODocument({ broker, lines, onClose }) {
  const totalQty  = lines.reduce((s, l) => s + (l.orderQty || 0), 0);
  const totalCost = lines.reduce((s, l) => s + (l.lineCost || 0), 0);
  const hasCosts  = lines.some(l => l.lineCost != null);
  const today     = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Group by arrival week
  const byWeek = {};
  lines.forEach(l => {
    const k = l.arrivalWeek ? `${l.arrivalYear}-${String(l.arrivalWeek).padStart(2,"0")}` : "zzz";
    if (!byWeek[k]) byWeek[k] = [];
    byWeek[k].push(l);
  });
  const weekGroups = Object.entries(byWeek).sort(([a],[b]) => a.localeCompare(b));

  function exportCSV() {
    const headers = ["Crop","Group","Cultivar","Variety","Ball Item #","Material","Tray/Size","Arrival Week","Arrival Date","Base Qty","Buffer %","Order Qty","Unit Cost","Line Total","Supplier"];
    const rows = lines.map(l => [
      l.cropName, l.groupNumber, l.cultivar, l.variety, l.ballItemNumber,
      l.matType.label,
      l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || l.seedForm || "",
      l.arrivalWeek ? `Wk ${l.arrivalWeek}` : "",
      l.arrivalWeek ? formatWeekDate(l.arrivalWeek, l.arrivalYear) : "",
      l.baseQty, `${l.bufferPct}%`, l.orderQty,
      l.unitCost != null ? `$${l.unitCost.toFixed(3)}` : "",
      l.lineCost != null ? `$${l.lineCost.toFixed(2)}` : "",
      l.supplier,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `PO-${broker.replace(/\s+/g,"-")}-${new Date().toISOString().slice(0,10)}.csv`,
    });
    a.click();
  }

  const colTemplate = `90px 1fr 1.2fr 70px 70px 80px 70px 90px${hasCosts ? " 90px" : ""}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,20,10,.6)", zIndex: 400, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 960, boxShadow: "0 30px 90px rgba(0,0,0,.3)" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 10, padding: "14px 24px", borderBottom: "1.5px solid #e0ead8", alignItems: "center" }}>
          <span style={{ flex: 1, fontSize: 13, color: "#7a8c74", fontWeight: 600 }}>PO Preview — {broker}</span>
          <button onClick={exportCSV} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>⬇ Export CSV</button>
          <button onClick={() => window.print()} style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🖨 Print</button>
          <button onClick={onClose} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>

        <div style={{ padding: "36px 40px" }}>
          {/* Letterhead */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, paddingBottom: 24, borderBottom: "3px solid #1e2d1a" }}>
            <div>
              <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5db6db690723f878c284b_HOO-Full%20Logo-Color.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain", marginBottom: 6 }} />
              <div style={{ fontSize: 11, color: "#7a8c74" }}>Schlegel Greenhouse · Indianapolis, IN</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 26, color: "#1e2d1a", fontWeight: 700 }}>Purchase Order</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>Generated: {today}</div>
            </div>
          </div>

          {/* PO meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 4 }}>Vendor / Broker</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>{broker}</div>
              {lines[0]?.supplier && lines[0].supplier !== broker && (
                <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Supplier: {lines[0].supplier}</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Material Type(s)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[...new Set(lines.map(l => l.materialType))].map(id => {
                  const m = mt(id);
                  return <span key={id} style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>{m.icon} {m.label}</span>;
                })}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 4 }}>Total Order</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#1e2d1a" }}>{totalQty.toLocaleString()}</div>
              {hasCosts && totalCost > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: "#7fb069", marginTop: 2 }}>${totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
            </div>
          </div>

          {/* Lines by arrival week */}
          {weekGroups.map(([wk, wLines]) => {
            const sample   = wLines[0];
            const wkQty    = wLines.reduce((s,l) => s+(l.orderQty||0),0);
            const wkCost   = wLines.reduce((s,l) => s+(l.lineCost||0),0);
            const wkLabel  = sample.arrivalWeek
              ? `Arrival Week ${sample.arrivalWeek} — ${formatWeekDate(sample.arrivalWeek, sample.arrivalYear)}`
              : "No Arrival Date Set";
            return (
              <div key={wk} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#1e2d1a", borderRadius: "10px 10px 0 0", padding: "9px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#c8e6b8" }}>{wkLabel}</div>
                  <div style={{ fontSize: 11, color: "#7a9a6a" }}>{wkQty.toLocaleString()} units{wkCost > 0 ? ` · $${wkCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : ""}</div>
                </div>
                <div style={{ border: "1.5px solid #e0ead8", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: colTemplate, padding: "7px 14px", gap: 8, background: "#f0f5ee" }}>
                    {["Item #","Cultivar","Variety","Type","Tray","Base","Buffer","Order Qty",...(hasCosts?["Est. Cost"]:[])].map((h,i) => (
                      <div key={i} style={{ fontSize: 9, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, textAlign: i >= 5 ? "right" : "left" }}>{h}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  {wLines.map((l, i) => {
                    const m = l.matType;
                    const tray = l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || (l.seedForm ? `${l.seedForm} seed` : "—");
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: colTemplate, padding: "9px 14px", gap: 8, borderTop: "1px solid #f0f5ee", alignItems: "center", background: i%2===0 ? "#fff" : "#fafcf8" }}>
                        <div style={{ fontSize: 11, color: "#7a8c74", fontFamily: "monospace" }}>{l.ballItemNumber || "—"}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.cultivar || l.cropName}
                          {l.groupNumber && <span style={{ marginLeft: 6, background: "#e0ead8", borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 800, color: "#7a8c74" }}>G{l.groupNumber}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.variety}</div>
                        <div><span style={{ background: m.bg, color: m.color, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{m.icon} {m.label}</span></div>
                        <div style={{ fontSize: 11, color: "#7a8c74" }}>{tray}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", textAlign: "right" }}>{(l.baseQty||0).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74", textAlign: "right" }}>+{l.bufferPct}%</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", textAlign: "right" }}>{(l.orderQty||0).toLocaleString()}</div>
                        {hasCosts && <div style={{ fontSize: 11, fontWeight: 700, color: "#7fb069", textAlign: "right" }}>{l.lineCost != null ? `$${l.lineCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}</div>}
                      </div>
                    );
                  })}
                  {/* Subtotal row */}
                  <div style={{ display: "grid", gridTemplateColumns: colTemplate, padding: "8px 14px", gap: 8, background: "#f0f5ee", borderTop: "1.5px solid #e0ead8" }}>
                    <div style={{ gridColumn: "1 / 8", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", textAlign: "right" }}>Week subtotal</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", textAlign: "right" }}>{wkQty.toLocaleString()}</div>
                    {hasCosts && <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", textAlign: "right" }}>{wkCost > 0 ? `$${wkCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—"}</div>}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 20, borderTop: "2px solid #1e2d1a" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 4 }}>Total Order</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#1e2d1a" }}>{totalQty.toLocaleString()} units</div>
              {hasCosts && totalCost > 0 && <div style={{ fontSize: 16, fontWeight: 700, color: "#7fb069", marginTop: 4 }}>${totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
            </div>
          </div>

          <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #e0ead8", fontSize: 10, color: "#aabba0" }}>
            Generated by Hoosier Boy Greenhouse Ops · {today} · Quantities include loss buffer. Confirm availability with broker before finalizing.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BROKER CARD ───────────────────────────────────────────────────────────────
function BrokerCard({ broker, lines, onViewPO }) {
  const [expanded, setExpanded] = useState(false);
  const totalQty  = lines.reduce((s,l) => s+(l.orderQty||0), 0);
  const totalCost = lines.reduce((s,l) => s+(l.lineCost||0), 0);
  const hasCosts  = lines.some(l => l.lineCost != null);
  const matTypes  = [...new Set(lines.map(l => l.materialType))];

  const weekMap = {};
  lines.forEach(l => { const k = l.arrivalWeek||0; weekMap[k]=(weekMap[k]||0)+(l.orderQty||0); });
  const weeks = Object.entries(weekMap).sort(([a],[b])=>+a-+b);

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", background: "#fafcf8" }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "#1e2d1a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>📋</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a" }}>{broker}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5 }}>
            <span style={{ fontSize: 11, color: "#7a8c74" }}>{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
            {matTypes.map(id => { const m = mt(id); return <span key={id} style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40`, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700 }}>{m.icon} {m.label}</span>; })}
            {weeks.slice(0,5).map(([wk, qty]) => (
              <span key={wk} style={{ background: "#f0f8eb", color: "#2e5c1e", border: "1px solid #c8e0b8", borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 600 }}>
                Wk {wk}: {qty.toLocaleString()}
              </span>
            ))}
            {weeks.length > 5 && <span style={{ fontSize: 10, color: "#aabba0" }}>+{weeks.length-5} more weeks</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a" }}>{totalQty.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>total units</div>
          {hasCosts && totalCost > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#7fb069", marginTop: 2 }}>${totalCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
        </div>
        <button onClick={e => { e.stopPropagation(); onViewPO(); }}
          style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          View PO →
        </button>
      </div>

      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee" }}>
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1.2fr 60px 80px 60px 90px", padding: "7px 22px", gap: 10, background: "#f8faf6" }}>
            {["Item #","Cultivar","Variety","Type","Tray","Wk","Order Qty"].map((h,i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 800, color: "#aabba0", textTransform: "uppercase", letterSpacing: .5, textAlign: i>=5?"right":"left" }}>{h}</div>
            ))}
          </div>
          {lines.map((l, i) => {
            const m = l.matType;
            const tray = l.propTraySize ? `${l.propTraySize}-cell` : l.linerSize || (l.seedForm ? `${l.seedForm}` : "—");
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1.2fr 60px 80px 60px 90px", padding: "9px 22px", gap: 10, borderTop: "1px solid #f0f5ee", alignItems: "center", background: i%2===0?"#fff":"#fafcf8" }}>
                <div style={{ fontSize: 11, color: "#7a8c74", fontFamily: "monospace" }}>{l.ballItemNumber || "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.cultivar || l.cropName}
                  {l.groupNumber && <span style={{ marginLeft: 5, background: "#e0ead8", borderRadius: 4, padding: "1px 5px", fontSize: 9, color: "#7a8c74", fontWeight: 700 }}>G{l.groupNumber}</span>}
                </div>
                <div style={{ fontSize: 12, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.variety}</div>
                <div><span style={{ background: m.bg, color: m.color, borderRadius: 10, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>{m.icon}</span></div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{tray}</div>
                <div style={{ fontSize: 11, color: "#4a90d9", fontWeight: 700, textAlign: "right" }}>{l.arrivalWeek ? `Wk ${l.arrivalWeek}` : "—"}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", textAlign: "right" }}>{(l.orderQty||0).toLocaleString()}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { rows: runs } = useCropRuns();
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [matFilter,  setMatFilter ] = useState("all");
  const [activePO,   setActivePO  ] = useState(null);

  const allLines = deriveLines(runs);

  const filtered = allLines.filter(l => {
    if (yearFilter !== "all" && l.arrivalYear && +l.arrivalYear !== +yearFilter) return false;
    if (matFilter !== "all" && l.materialType !== matFilter) return false;
    return true;
  });

  const brokerMap = {};
  filtered.forEach(l => { if (!brokerMap[l.broker]) brokerMap[l.broker]=[]; brokerMap[l.broker].push(l); });
  const brokers = Object.entries(brokerMap).sort(([a],[b]) => a.localeCompare(b));

  const years = [...new Set([currentYear, currentYear+1, ...allLines.map(l=>+l.arrivalYear).filter(Boolean)])].sort();
  const grandQty  = filtered.reduce((s,l) => s+(l.orderQty||0), 0);
  const grandCost = filtered.reduce((s,l) => s+(l.lineCost||0), 0);
  const noSourcing = runs.filter(r => !r.materialType).length;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ background: "#1e2d1a", padding: "12px 32px", display: "flex", alignItems: "center", gap: 16 }}>
        <img src="https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png" alt="Hoosier Boy" style={{ height: 52, objectFit: "contain" }} />
        <div style={{ width: 1, height: 36, background: "#4a6a3a" }} />
        <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>Young Plant Orders</div>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 24px" }}>

        {/* Warning — runs with no sourcing */}
        {noSourcing > 0 && (
          <div style={{ background: "#fff8e8", border: "1.5px solid #f0d080", borderRadius: 12, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div style={{ fontSize: 13, color: "#7a5a10" }}>
              <strong>{noSourcing} crop run{noSourcing !== 1 ? "s" : ""}</strong> {noSourcing === 1 ? "has" : "have"} no sourcing set — open each run and complete the <strong>Sourcing tab</strong> to include {noSourcing === 1 ? "it" : "them"} here.
            </div>
          </div>
        )}

        {/* Summary tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Total Order Qty",    value: grandQty.toLocaleString(),  sub: "all brokers",        color: "#1e2d1a" },
            { label: "Est. Total Cost",     value: grandCost > 0 ? `$${grandCost.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—", sub: "where cost entered", color: "#7fb069" },
            { label: "Brokers / Vendors",   value: brokers.length,             sub: "separate POs",       color: "#4a90d9" },
            { label: "Order Lines",         value: filtered.length,            sub: "varieties + runs",   color: "#8e44ad" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "16px 18px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#aabba0", marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>Filter</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all","All Years"], ...years.map(y=>[String(y),String(y)])].map(([val,label]) => (
              <button key={val} onClick={() => setYearFilter(val==="all"?"all":+val)}
                style={{ padding: "5px 13px", borderRadius: 20, border: `1.5px solid ${yearFilter==val?"#1e2d1a":"#c8d8c0"}`, background: yearFilter==val?"#1e2d1a":"#fff", color: yearFilter==val?"#c8e6b8":"#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: "#c8d8c0" }} />
          <div style={{ display: "flex", gap: 6 }}>
            {[["all","All Types"], ...MATERIAL_TYPES.map(m=>[m.id,`${m.icon} ${m.label}`])].map(([val,label]) => (
              <button key={val} onClick={() => setMatFilter(val)}
                style={{ padding: "5px 13px", borderRadius: 20, border: `1.5px solid ${matFilter===val?"#7fb069":"#c8d8c0"}`, background: matFilter===val?"#f0f8eb":"#fff", color: matFilter===val?"#2e5c1e":"#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Broker cards */}
        {brokers.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "60px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>No orders to show yet</div>
            <div style={{ fontSize: 13, color: "#7a8c74", maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
              Open your crop runs and fill in the <strong>Sourcing tab</strong> — set material type (URC, Seed, or Liner), broker, tray size, and unit cost. Orders will appear here automatically, one card per broker.
            </div>
          </div>
        ) : brokers.map(([broker, lines]) => (
          <BrokerCard key={broker} broker={broker} lines={lines} onViewPO={() => setActivePO({ broker, lines })} />
        ))}

      </div>

      {activePO && <PODocument broker={activePO.broker} lines={activePO.lines} onClose={() => setActivePO(null)} />}
    </div>
  );
}
