import { useState, useEffect, useRef } from "react";
import { getUnviewedPhotoCount, getRecentPhotos, getSessionsWithPhotos } from "./TradeShow";
import { computeSchedule, getCurrentWeek, getCropRunCalendarEvents, makeGCalUrl, CROP_STATUS, formatWeekDate } from "./shared";
import { useCropRuns, useMaintenanceRequests } from "./supabase";

const CURRENT_WEEK = getCurrentWeek();
const CURRENT_YEAR = new Date().getFullYear();

const EVENT_COLORS = {
  seed:       { label: "Order / Propagate", color: "#8e44ad", bg: "#f5f0ff" },
  transplant: { label: "Transplant",        color: "#4a90d9", bg: "#e8f4ff" },
  moveout:    { label: "Move Outside",      color: "#c8791a", bg: "#fff4e0" },
  ready:      { label: "Ready to Ship",     color: "#2e7a2e", bg: "#e8f8e8" },
};

export default function PlannerHome({ onNavigate }) {
  const { rows: runs, upsert: upsertRun } = useCropRuns();
  const { rows: maintenanceRequests, upsert: upsertMaintenance } = useMaintenanceRequests();
  const [gcalRun, setGcalRun] = useState(null);
  const [unviewedPhotos,   setUnviewedPhotos  ] = useState(() => getUnviewedPhotoCount());
  const [recentPhotos,     setRecentPhotos    ] = useState(() => getRecentPhotos(8));
  const [photoSessions,    setPhotoSessions   ] = useState(() => getSessionsWithPhotos());

  // Refresh photo counts when home page mounts or regains focus
  useEffect(() => {
    function refresh() {
      setUnviewedPhotos(getUnviewedPhotoCount());
      setRecentPhotos(getRecentPhotos(8));
      setPhotoSessions(getSessionsWithPhotos());
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Backup overdue check
  const lastExport = (() => { try { return localStorage.getItem("gh_last_export_date_v1") || null; } catch { return null; } })();
  const daysSinceExport = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60 * 24)) : null;
  const exportOverdue = daysSinceExport === null || daysSinceExport >= 14;

  // Summary counts
  const byStatus = {};
  CROP_STATUS.forEach(s => { byStatus[s.id] = 0; });
  runs.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });

  // Upcoming events across all runs (next 3 weeks)
  const upcoming = runs.flatMap(r => getCropRunCalendarEvents(r))
    .filter(e => {
      const diff = (e.year - CURRENT_YEAR) * 52 + e.week - CURRENT_WEEK;
      return diff >= -1 && diff <= 3;
    })
    .sort((a, b) => {
      const da = (a.year - CURRENT_YEAR) * 52 + a.week;
      const db = (b.year - CURRENT_YEAR) * 52 + b.week;
      return da - db;
    })
    .slice(0, 12);

  const readyCount = runs.filter(r => r.status === "ready").length;
  const noSourcing = runs.filter(r => !r.materialType).length;

  // Unconfirmed orders: orderStatus === "ordered" but missing at least one confirmation number
  // confirmationNumbers is an object keyed by broker name
  const unconfirmedRuns = runs.filter(r => {
    if (r.orderStatus !== "ordered") return false;
    const brokers = [...new Set((r.varieties || []).map(v => v.broker).filter(Boolean))];
    if (brokers.length === 0) return true; // ordered but no broker = unconfirmed
    const confirmations = r.confirmationNumbers || {};
    return brokers.some(b => !confirmations[b]); // any broker missing confirmation
  });

  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, color: "#1a2a1a", marginBottom: 6 }}>Good morning</div>
      <div style={{ fontSize: 14, color: "#7a8c74", marginBottom: 28 }}>Week {CURRENT_WEEK} &middot; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>

      {/* Alerts */}
      {exportOverdue && (
        <div style={{ background: daysSinceExport === null ? "#fff8e8" : "#fde8e8", border: `1.5px solid ${daysSinceExport === null ? "#f0d080" : "#f0b0a0"}`, borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: daysSinceExport === null ? "#7a5a10" : "#c03030", fontWeight: 700 }}>
            {daysSinceExport === null ? "📋 No backup on record" : `⚠️ Last backup was ${daysSinceExport} days ago`}
          </span>
          <button onClick={() => onNavigate("export")} style={{ background: daysSinceExport === null ? "#e0a820" : "#d94f3d", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Export Now</button>
        </div>
      )}
      {readyCount > 0 && (
        <div style={{ background: "#e8f8e8", border: "1.5px solid #7fb069", borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#1e5a1e", fontWeight: 700 }}>{readyCount} crop{readyCount !== 1 ? "s" : ""} ready to ship</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View</button>
        </div>
      )}
      {noSourcing > 0 && (
        <div style={{ background: "#fff8e8", border: "1.5px solid #f0d080", borderRadius: 12, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#7a5a10", fontWeight: 700 }}>{noSourcing} run{noSourcing !== 1 ? "s" : ""} missing sourcing info</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#e0a820", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fix</button>
        </div>
      )}

      {/* Unconfirmed Orders Widget */}
      <UnconfirmedOrdersWidget runs={runs} unconfirmedRuns={unconfirmedRuns} onNavigate={onNavigate} />

      {/* PDF Drop Zone */}
      <ConfirmationDropZone runs={runs} upsertRun={upsertRun} onNavigate={onNavigate} />

      {/* Status summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 32 }}>
        {CROP_STATUS.filter(s => s.id !== "shipped").map(s => (
          <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px", cursor: "pointer" }}
            onClick={() => onNavigate("crops")}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{byStatus[s.id] || 0}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Upcoming milestones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8 }}>Upcoming Milestones</div>
        <span style={{ fontSize: 11, color: "#7a8c74" }}>Next 3 weeks</span>
      </div>

      {upcoming.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>No milestones in the next 3 weeks. Add crop runs to see them here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
          {upcoming.map(event => {
            const meta = EVENT_COLORS[event.type] || EVENT_COLORS.transplant;
            const diff = (event.year - CURRENT_YEAR) * 52 + event.week - CURRENT_WEEK;
            const timing = diff < 0 ? "Overdue" : diff === 0 ? "This week" : `In ${diff} week${diff !== 1 ? "s" : ""}`;
            const timingColor = diff < 0 ? "#c03030" : diff === 0 ? "#2e7a2e" : "#7a8c74";
            const gcalUrl = makeGCalUrl({ title: event.title, description: event.description, week: event.week, year: event.year, location: event.location });

            return (
              <div key={event.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${meta.color}30`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 4, height: 44, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#7a8c74" }}>Wk {event.week} &middot; {formatWeekDate(event.week, event.year)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: timingColor }}>{timing}</span>
                  </div>
                </div>
                <a href={gcalUrl} target="_blank" rel="noreferrer"
                  style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}40`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}>
                  + Cal
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Maintenance Widget */}
      <MaintenanceWidget requests={maintenanceRequests} onResolve={upsertMaintenance} />

      {/* Trade Show Widget */}
      <TradeShowWidget recentPhotos={recentPhotos} photoSessions={photoSessions} unviewedCount={unviewedPhotos} onNavigate={onNavigate} />

      {/* Quick actions */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "New Crop Run",    icon: "🌱", page: "crops",   color: "#7fb069", desc: "Plan a new production run" },
          { label: "Design a Combo",  icon: "🎨", page: "combos",  color: "#e07b39", desc: "Build a new combo planter" },
          { label: "View Orders",     icon: "📋", page: "orders",  color: "#8e44ad", desc: "Young plant & container orders" },
          { label: "Space Map",       icon: "🏠", page: "space",   color: "#4a90d9", desc: "Range & bay assignments" },
          { label: "Libraries",       icon: "📚", page: "library", color: "#c8791a", desc: "Varieties, containers, brokers" },
          { label: "Meetings",        icon: "📅", page: "meetings",color: "#2e7a2e", desc: "Scheduled meetings & notes" },
        ].map(a => (
          <button key={a.page} onClick={() => onNavigate(a.page)}
            style={{ padding: "16px", borderRadius: 14, border: `1.5px solid ${a.color}30`, background: "#fff", color: "#1a2a1a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color .15s, box-shadow .15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 2px 12px ${a.color}20`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = `${a.color}30`; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{a.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a" }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 3, fontWeight: 400 }}>{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── UNCONFIRMED ORDERS WIDGET ─────────────────────────────────────────────────
function UnconfirmedOrdersWidget({ runs, unconfirmedRuns, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const [localConfirm, setLocalConfirm] = useState({});
  const { upsert } = useCropRuns();

  if (unconfirmedRuns.length === 0 && !runs.some(r => r.orderStatus === "ordered")) return null;

  // Also show recently confirmed (last 7 days) as a "done" section
  const confirmedRecent = runs.filter(r => {
    if (r.orderStatus !== "confirmed") return false;
    const brokers = [...new Set((r.varieties || []).map(v => v.broker).filter(Boolean))];
    const confirmations = r.confirmationNumbers || {};
    return brokers.every(b => confirmations[b]);
  }).slice(0, 3);

  function getKey(runId, broker) { return `${runId}__${broker}`; }

  async function saveConfirmation(run, broker, number) {
    if (!number.trim()) return;
    const updated = {
      ...run,
      confirmationNumbers: { ...(run.confirmationNumbers || {}), [broker]: number.trim() },
    };
    // Check if all brokers now confirmed
    const brokers = [...new Set((run.varieties || []).map(v => v.broker).filter(Boolean))];
    const allConfirmed = brokers.every(b => (updated.confirmationNumbers)[b]);
    if (allConfirmed) updated.orderStatus = "confirmed";
    await upsert(updated);
    setLocalConfirm(lc => {
      const next = { ...lc };
      delete next[getKey(run.id, broker)];
      return next;
    });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e07b39", marginBottom: 20, overflow: "hidden" }}>
      {/* Header — always visible, acts as toggle */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: unconfirmedRuns.length > 0 ? "#fff8f4" : "#f8faf6" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          {unconfirmedRuns.length > 0 && (
            <span style={{ position: "absolute", top: -4, right: -6, background: "#e07b39", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 900, padding: "1px 5px", minWidth: 16, textAlign: "center", lineHeight: "16px" }}>
              {unconfirmedRuns.length}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a" }}>
            {unconfirmedRuns.length > 0
              ? `${unconfirmedRuns.length} order${unconfirmedRuns.length !== 1 ? "s" : ""} awaiting confirmation`
              : "All orders confirmed ✓"}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
            {unconfirmedRuns.length > 0 ? "Enter broker confirmation numbers to mark as confirmed" : "No pending confirmations"}
          </div>
        </div>
        <div style={{ fontSize: 18, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0e8e0" }}>
          {unconfirmedRuns.length === 0 ? (
            <div style={{ padding: "20px 18px", fontSize: 13, color: "#7a8c74", textAlign: "center" }}>
              No unconfirmed orders right now.
            </div>
          ) : (
            <div>
              {unconfirmedRuns.map((run, ri) => {
                const brokers = [...new Set((run.varieties || []).map(v => v.broker).filter(Boolean))];
                const confirmations = run.confirmationNumbers || {};
                const [rowExpanded, setRowExpanded] = useState(false);
                const totalPlants = (run.varieties || []).reduce((s, v) => s + (Number(v.cases) || 0) * (Number(run.packSize) || 10), 0);

                return (
                  <div key={run.id} style={{ borderBottom: ri < unconfirmedRuns.length - 1 ? "1px solid #f5f0ee" : "none" }}>
                    {/* Run row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", padding: "12px 18px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a" }}>{run.cropName}</span>
                          {run.targetWeek && <span style={{ fontSize: 11, background: "#f0f8eb", color: "#2e5c1e", padding: "1px 7px", borderRadius: 6, fontWeight: 700 }}>Wk {run.targetWeek}</span>}
                          {run.cases && <span style={{ fontSize: 11, color: "#aabba0" }}>{run.cases} cases · {totalPlants.toLocaleString()} plants</span>}
                        </div>

                        {/* Per-broker confirmation inputs */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {(brokers.length > 0 ? brokers : ["(no broker)"]).map(broker => {
                            const key = getKey(run.id, broker);
                            const existing = confirmations[broker];
                            const draft = localConfirm[key] ?? "";
                            const confirmed = !!existing;
                            return (
                              <div key={broker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", minWidth: 80, flexShrink: 0 }}>{broker}</span>
                                {confirmed ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#2e5c1e", background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 6, padding: "3px 10px" }}>
                                    ✓ {existing}
                                  </span>
                                ) : (
                                  <div style={{ display: "flex", gap: 6, flex: 1 }}>
                                    <input
                                      value={draft}
                                      onChange={e => setLocalConfirm(lc => ({ ...lc, [key]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === "Enter") saveConfirmation(run, broker, draft); }}
                                      placeholder="Confirmation #"
                                      style={{ flex: 1, maxWidth: 180, padding: "4px 9px", border: "1.5px solid #f0c080", borderRadius: 7, fontSize: 12, fontFamily: "inherit", outline: "none" }}
                                    />
                                    <button
                                      onClick={() => saveConfirmation(run, broker, draft)}
                                      disabled={!draft.trim()}
                                      style={{ background: draft.trim() ? "#e07b39" : "#f0d0b8", color: "#fff", border: "none", borderRadius: 7, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                                      Save
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Expand toggle */}
                      <button onClick={() => setRowExpanded(e => !e)}
                        style={{ background: "none", border: "1px solid #e0ead8", borderRadius: 7, padding: "4px 10px", fontSize: 11, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", marginTop: 2, whiteSpace: "nowrap" }}>
                        {rowExpanded ? "▲ Less" : "▼ Details"}
                      </button>
                    </div>

                    {/* Expanded variety detail */}
                    {rowExpanded && (
                      <div style={{ padding: "0 18px 12px", background: "#fafcf8" }}>
                        <div style={{ borderRadius: 8, border: "1px solid #e8ede4", overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: "#f4f6f2" }}>
                                {["Color / Variety", "Broker", "Supplier", "Cases", "Plants", "$/unit"].map(h => (
                                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(run.varieties || []).map((v, i) => (
                                <tr key={i} style={{ borderTop: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                                  <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1a2a1a" }}>{v.color || v.name || v.cultivar || "—"}</td>
                                  <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{v.broker || "—"}</td>
                                  <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{v.supplier || "—"}</td>
                                  <td style={{ padding: "6px 10px", fontWeight: 700 }}>{v.cases || "—"}</td>
                                  <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{v.cases && run.packSize ? (Number(v.cases) * Number(run.packSize)).toLocaleString() : "—"}</td>
                                  <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{v.costPerUnit ? `$${Number(v.costPerUnit).toFixed(3)}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button onClick={() => onNavigate("crops")}
                          style={{ marginTop: 8, background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "4px 12px", fontSize: 11, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                          Open in Crop Planning →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer nav */}
          <div style={{ padding: "10px 18px", borderTop: "1px solid #f5f0ee", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => onNavigate("orders")}
              style={{ background: "none", border: "1px solid #e07b39", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#e07b39", cursor: "pointer", fontFamily: "inherit" }}>
              View All Orders →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONFIRMATION PDF DROP ZONE ────────────────────────────────────────────────
function ConfirmationDropZone({ runs, upsertRun, onNavigate }) {
  const [dragOver,   setDragOver  ] = useState(false);
  const [stage,      setStage     ] = useState("idle"); // idle | reading | matching | review | done | error
  const [result,     setResult    ] = useState(null);   // { broker, poNumber, matches: [...], rawText, discrepancies }
  const [applying,   setApplying  ] = useState(false);
  const [errorMsg,   setErrorMsg  ] = useState("");
  const fileRef = useRef(null);

  async function processFile(file) {
    if (!file || file.type !== "application/pdf") {
      setErrorMsg("Please drop a PDF file."); setStage("error"); return;
    }

    setStage("reading"); setErrorMsg(""); setResult(null);

    // Read PDF as base64
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(",")[1]);
      reader.onerror = () => rej(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

    setStage("matching");

    // Build run summary for matching context
    const runSummary = runs.map(r => ({
      id: r.id,
      cropName: r.cropName,
      broker: [...new Set((r.varieties||[]).map(v=>v.broker).filter(Boolean))].join(", "),
      varieties: (r.varieties||[]).map(v => ({
        name: [v.cultivar, v.color, v.name].filter(Boolean).join(" "),
        cases: v.cases,
        plants: v.cases && r.packSize ? Number(v.cases)*Number(r.packSize) : null,
        costPerUnit: v.costPerUnit,
      })),
      cases: r.cases,
      targetWeek: r.targetWeek,
      orderStatus: r.orderStatus || "",
      existingConfirmations: r.confirmationNumbers || {},
    }));

    const prompt = `You are a greenhouse production planning assistant for Hoosier Boy Greenhouse in Indianapolis.

A broker order confirmation PDF has been uploaded. Extract the key information and match it to the crop runs below.

MATCHING STRATEGY (in priority order):
1. PRIMARY: Look for a PO Reference code in format "CR{YEAR}-{####}-{##}" (e.g. CR2026-0001-01). This is the broker sub-code. Match the base code (e.g. CR2026-0001) to the crop run's cropRunCode field. The suffix (-01, -02) identifies which broker slot.
2. SECONDARY: If no code found, match by broker name + variety names + quantities (fuzzy match, lower confidence)

CROP RUNS ON FILE:
${JSON.stringify(runSummary, null, 2)}

INSTRUCTIONS:
1. Extract from the PDF: broker name, PO/confirmation number, order date, all line items
2. Search the ENTIRE PDF text for any code matching pattern CR\d{4}-\d{4}(-\d{2})?
3. If found, use that for exact matching — set confidence to "high"
4. If not found, fall back to fuzzy matching by variety names and quantities
5. Flag any quantity or price discrepancies
6. Return ONLY valid JSON, no markdown, no explanation

REQUIRED JSON FORMAT:
{
  "broker": "broker name from PDF",
  "poNumber": "the PO or confirmation number from broker",
  "cropRunCode": "the CR code found in PDF e.g. CR2026-0001 or null if not found",
  "brokerSubCode": "the full sub-code e.g. CR2026-0001-01 or null",
  "orderDate": "date from PDF or null",
  "lineItems": [
    {
      "description": "variety description from PDF",
      "quantity": 500,
      "unitPrice": 1.25,
      "itemNumber": "item # if present"
    }
  ],
  "matches": [
    {
      "runId": "crop run id that matches",
      "cropName": "crop name",
      "confidence": "high|medium|low",
      "matchReason": "brief explanation — e.g. Matched via CR2026-0001 code",
      "discrepancies": ["quantity ordered was 500 but PDF shows 480"] or []
    }
  ],
  "unmatchedItems": ["line items from PDF that couldn't be matched to any crop run"],
  "summary": "one sentence summary of what was found"
}`;

    try {
      const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY || "";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 }
              },
              { type: "text", text: prompt }
            ]
          }]
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();
      const text = data.content?.find(b => b.type === "text")?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
      setStage("review");
    } catch(e) {
      setErrorMsg(e.message || "Could not read the PDF. Check your API key and try again.");
      setStage("error");
    }
  }

  async function applyConfirmations() {
    if (!result?.matches?.length) return;
    setApplying(true);
    for (const match of result.matches) {
      const run = runs.find(r => r.id === match.runId);
      if (!run || !result.poNumber) continue;
      const broker = result.broker;
      const updatedConfirmations = { ...(run.confirmationNumbers || {}), [broker]: result.poNumber };
      const brokers = [...new Set((run.varieties||[]).map(v=>v.broker).filter(Boolean))];
      const allConfirmed = brokers.every(b => updatedConfirmations[b]);
      await upsertRun({
        ...run,
        confirmationNumbers: updatedConfirmations,
        orderStatus: allConfirmed ? "confirmed" : "ordered",
      });
    }
    setApplying(false);
    setStage("done");
  }

  function reset() { setStage("idle"); setResult(null); setErrorMsg(""); }

  const CONFIDENCE_COLORS = { high: "#2e5c1e", medium: "#c8791a", low: "#b03020" };
  const CONFIDENCE_BG     = { high: "#f0f8eb", medium: "#fff4e8", low: "#fff0f0" };

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Drop zone — only show when idle or error */}
      {(stage === "idle" || stage === "error") && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#7fb069" : "#c8d8c0"}`,
            borderRadius: 14,
            padding: "20px 24px",
            background: dragOver ? "#f0f8eb" : "#fafcf8",
            cursor: "pointer",
            transition: "all .2s",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ""; }} />
          <div style={{ fontSize: 32, flexShrink: 0 }}>{dragOver ? "📂" : "📄"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a", marginBottom: 3 }}>
              {dragOver ? "Drop to process" : "Drop broker confirmation PDF here"}
            </div>
            <div style={{ fontSize: 12, color: "#7a8c74", lineHeight: 1.5 }}>
              Drag & drop or click to browse · AI reads the PDF, extracts the PO number and line items, and matches to your crop runs automatically
            </div>
            {stage === "error" && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b03020", fontWeight: 600 }}>⚠️ {errorMsg}</div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#aabba0", flexShrink: 0, textAlign: "right" }}>
            Ball · Dümmen<br />Syngenta · PanAm<br />& more
          </div>
        </div>
      )}

      {/* Reading / Matching states */}
      {(stage === "reading" || stage === "matching") && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "28px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>
            {stage === "reading" ? "📄" : "🔍"}
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#1a2a1a", marginBottom: 6 }}>
            {stage === "reading" ? "Reading PDF..." : "Matching to your crop runs..."}
          </div>
          <div style={{ fontSize: 12, color: "#7a8c74" }}>
            {stage === "reading" ? "Uploading to Claude for extraction" : "Comparing line items to your orders"}
          </div>
          {/* Animated dots */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 16 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: "#7fb069", animation: `pulse 1.2s ease-in-out ${i*0.4}s infinite` }} />
            ))}
          </div>
          <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
        </div>
      )}

      {/* Review stage */}
      {stage === "review" && result && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #7fb069", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ background: "#f0f8eb", padding: "16px 20px", borderBottom: "1.5px solid #c8e0b8", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{ fontSize: 28, flexShrink: 0 }}>📋</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>Confirmation found — {result.broker}</div>
              <div style={{ fontSize: 13, color: "#2e5c1e", marginTop: 3 }}>
                PO / Confirmation #: <strong>{result.poNumber}</strong>
                {result.orderDate && <span style={{ marginLeft: 12, color: "#7a8c74" }}>{result.orderDate}</span>}
              </div>
              {result.cropRunCode && (
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "#1e2d1a", color: "#7fb069", borderRadius: 5, padding: "2px 10px", fontSize: 11, fontWeight: 900, fontFamily: "monospace" }}>{result.brokerSubCode || result.cropRunCode}</span>
                  <span style={{ fontSize: 11, color: "#2e5c1e", fontWeight: 600 }}>✓ Matched via crop run code — exact match</span>
                </div>
              )}
              {result.summary && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>{result.summary}</div>}
            </div>
            <button onClick={reset} style={{ background: "none", border: "none", fontSize: 20, color: "#aabba0", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          {/* Matched crop runs */}
          {result.matches?.length > 0 && (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 10 }}>
                Matched to {result.matches.length} crop run{result.matches.length !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {result.matches.map((m, i) => (
                  <div key={i} style={{ borderRadius: 10, border: `1.5px solid ${CONFIDENCE_COLORS[m.confidence]}40`, background: CONFIDENCE_BG[m.confidence], padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a", flex: 1 }}>{m.cropName}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, background: CONFIDENCE_COLORS[m.confidence] + "20", color: CONFIDENCE_COLORS[m.confidence], padding: "2px 8px", borderRadius: 6, border: `1px solid ${CONFIDENCE_COLORS[m.confidence]}40` }}>
                        {m.confidence === "high" ? "✓ High confidence" : m.confidence === "medium" ? "~ Medium confidence" : "⚠ Low confidence"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>{m.matchReason}</div>
                    {m.discrepancies?.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                        {m.discrepancies.map((d, di) => (
                          <div key={di} style={{ fontSize: 11, color: "#b03020", background: "#fff5f5", borderRadius: 5, padding: "3px 8px", border: "1px solid #f0b0a0" }}>
                            ⚠️ {d}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unmatched items */}
          {result.unmatchedItems?.length > 0 && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#b03020", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
                ⚠️ {result.unmatchedItems.length} item{result.unmatchedItems.length !== 1 ? "s" : ""} not matched to any crop run
              </div>
              <div style={{ background: "#fff5f5", borderRadius: 8, border: "1px solid #f0c0b8", padding: "10px 14px" }}>
                {result.unmatchedItems.map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#7a4040", padding: "2px 0", borderBottom: i < result.unmatchedItems.length - 1 ? "1px solid #f8e8e4" : "none" }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Line items detail */}
          {result.lineItems?.length > 0 && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>
                Line Items from PDF
              </div>
              <div style={{ borderRadius: 8, border: "1px solid #e0ead8", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8faf6" }}>
                      {["Description", "Item #", "Qty", "$/unit"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 800, fontSize: 10, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.lineItems.map((li, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #f0f5ee", background: i%2===0?"#fff":"#fafcf8" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600, color: "#1e2d1a" }}>{li.description}</td>
                        <td style={{ padding: "6px 10px", color: "#aabba0" }}>{li.itemNumber || "—"}</td>
                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>{li.quantity?.toLocaleString() || "—"}</td>
                        <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{li.unitPrice ? `$${Number(li.unitPrice).toFixed(3)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ padding: "14px 20px", borderTop: "1.5px solid #e0ead8", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={applyConfirmations} disabled={applying || !result.matches?.length}
              style={{ background: result.matches?.length ? "#2e5c1e" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: result.matches?.length ? "pointer" : "default", fontFamily: "inherit" }}>
              {applying ? "Saving..." : `✅ Apply PO #${result.poNumber} to ${result.matches?.length || 0} run${(result.matches?.length||0) !== 1 ? "s" : ""}`}
            </button>
            <button onClick={reset}
              style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={() => onNavigate("orders")}
              style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
              View Orders →
            </button>
          </div>
        </div>
      )}

      {/* Done state */}
      {stage === "done" && (
        <div style={{ background: "#f0f8eb", borderRadius: 14, border: "1.5px solid #7fb069", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 32 }}>✅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>Confirmation logged — PO #{result?.poNumber}</div>
            <div style={{ fontSize: 12, color: "#2e5c1e", marginTop: 3 }}>
              {result?.matches?.length || 0} crop run{(result?.matches?.length||0) !== 1 ? "s" : ""} updated · Order status set to Confirmed
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset}
              style={{ background: "#fff", border: "1.5px solid #c8e0b8", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>
              Drop Another
            </button>
            <button onClick={() => onNavigate("orders")}
              style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              View Orders →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRADE SHOW WIDGET ─────────────────────────────────────────────────────────
function TradeShowWidget({ recentPhotos, photoSessions, unviewedCount, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const hasPhotos = recentPhotos.length > 0;

  function isPhotoNew(photo) {
    try {
      const v = JSON.parse(localStorage.getItem("gh_tradeshow_viewed_v1") || "{}");
      return photo.capturedAt > (v[photo.sessionId] || 0);
    } catch { return false; }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", marginBottom: 24, overflow: "hidden" }}>
      {/* Header */}
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", background: unviewedCount > 0 ? "#fafcf8" : "#fff", userSelect: "none" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>📸</span>
          {unviewedCount > 0 && (
            <span style={{ position: "absolute", top: -5, right: -8, background: "#7fb069", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 900, padding: "1px 5px", minWidth: 16, textAlign: "center", lineHeight: "15px", border: "2px solid #fff", animation: "pulse-badge 2s ease-in-out infinite" }}>
              {unviewedCount}
            </span>
          )}
          <style>{`@keyframes pulse-badge { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }`}</style>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a", display: "flex", alignItems: "center", gap: 8 }}>
            Trade Show Photos
            {unviewedCount > 0 && (
              <span style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", color: "#2e5c1e", borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 8px" }}>
                {unviewedCount} new
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
            {(photoSessions || []).length > 0
              ? `${(photoSessions || []).length} session${(photoSessions || []).length !== 1 ? "s" : ""} · ${recentPhotos.length} recent photo${recentPhotos.length !== 1 ? "s" : ""}`
              : "No photos yet — start a trade show or trial day session"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={e => { e.stopPropagation(); onNavigate("tradeshow"); }}
            style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Open →
          </button>
          <div style={{ fontSize: 18, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</div>
        </div>
      </div>

      {/* Expanded — grouped by session */}
      {expanded && (
        <div style={{ borderTop: "1.5px solid #f0f5ee" }}>
          {!hasPhotos ? (
            <div style={{ padding: "28px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No photos yet</div>
              <div style={{ fontSize: 12, color: "#aabba0", marginBottom: 16 }}>Create a session to start capturing</div>
              <button onClick={() => onNavigate("tradeshow")}
                style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 9, padding: "9px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                📸 Start Session
              </button>
            </div>
          ) : (
            <div>
              {(photoSessions || []).slice(0, 4).map((session, si) => {
                const sessionNewCount = (session.photos || []).filter(p => isPhotoNew({ ...p, sessionId: session.id })).length;
                const sessions = photoSessions || [];
                return (
                  <div key={session.id} style={{ borderBottom: si < Math.min(sessions.length, 4) - 1 ? "1px solid #f5f5f2" : "none" }}>
                    {/* Session header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 6px", background: "#fafcf8" }}>
                      <span style={{ fontSize: 14 }}>{session.type === "quickshot" ? "⚡" : "🎪"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: "#1e2d1a", display: "flex", alignItems: "center", gap: 6 }}>
                          {session.name}
                          {sessionNewCount > 0 && (
                            <span style={{ background: "#7fb069", color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>{sessionNewCount} new</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#aabba0" }}>
                          {new Date(session.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {session.time && ` · ${session.time}`}
                          {session.location && ` · 📍 ${session.location}`}
                          {` · ${session.photos.length} photo${session.photos.length !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                      <button onClick={() => onNavigate("tradeshow")}
                        style={{ background: "none", border: "1px solid #e0ead8", borderRadius: 6, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                        View →
                      </button>
                    </div>
                    {/* Photo strip */}
                    <div style={{ overflowX: "auto", padding: "6px 16px 12px", display: "flex", gap: 8 }}>
                      {(session.photos || []).slice(0, 8).map(photo => {
                        const isNew = isPhotoNew({ ...photo, sessionId: session.id });
                        return (
                          <div key={photo.id} onClick={() => onNavigate("tradeshow")}
                            style={{ flexShrink: 0, width: 110, cursor: "pointer", position: "relative" }}>
                            {isNew && (
                              <div style={{ position: "absolute", top: 4, left: 4, zIndex: 1, background: "#7fb069", color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 900, padding: "1px 5px" }}>NEW</div>
                            )}
                            <img src={photo.imgData} alt={photo.comment || ""}
                              style={{ width: 110, height: 78, objectFit: "cover", borderRadius: 7, border: `1.5px solid ${isNew ? "#7fb069" : "#e0ead8"}`, display: "block" }} />
                            {photo.comment && (
                              <div style={{ fontSize: 9, color: "#7a8c74", marginTop: 4, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                {photo.comment}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(session.photos || []).length > 8 && (
                        <div onClick={() => onNavigate("tradeshow")}
                          style={{ flexShrink: 0, width: 110, height: 78, borderRadius: 7, border: "1.5px solid #e0ead8", background: "#f8faf6", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, color: "#7a8c74" }}>+{session.photos.length - 8}</div>
                            <div style={{ fontSize: 9, color: "#aabba0" }}>more</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: "10px 18px", borderTop: "1px solid #f5f5f2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "#aabba0" }}>
                  {(photoSessions || []).length > 4 ? `Showing 4 of ${(photoSessions || []).length} sessions` : `${(photoSessions || []).length} session${(photoSessions || []).length !== 1 ? "s" : ""}`}
                </div>
                <button onClick={() => onNavigate("tradeshow")}
                  style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "5px 14px", fontSize: 11, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>
                  View All →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MAINTENANCE WIDGET ────────────────────────────────────────────────────────
function MaintenanceWidget({ requests, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(null);

  const open = requests.filter(r => r.status === "open" || r.status === "in_progress");
  const critical = open.filter(r => {
    const hrs = (Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / 36e5;
    return r.priority === "critical" || hrs > 72;
  });
  const urgent = open.filter(r => {
    const hrs = (Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / 36e5;
    return !critical.includes(r) && (r.priority === "urgent" || hrs > 24);
  });
  const normal = open.filter(r => !critical.includes(r) && !urgent.includes(r));

  // Widget border/bg escalates with severity
  const hasAnyCritical = critical.length > 0;
  const hasAnyUrgent   = urgent.length > 0;
  const borderColor = hasAnyCritical ? "#c03030" : hasAnyUrgent ? "#c8791a" : open.length > 0 ? "#c8d8c0" : "#e0ead8";
  const bgColor     = hasAnyCritical ? "#fff5f5" : hasAnyUrgent ? "#fff8f0" : "#fff";

  function getAgeLabel(req) {
    const ms   = Date.now() - new Date(req.submittedAt || req.createdAt).getTime();
    const hrs  = Math.floor(ms / 36e5);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d`;
    if (hrs > 0)  return `${hrs}h`;
    return "New";
  }

  function getItemColor(req) {
    const hrs = (Date.now() - new Date(req.submittedAt || req.createdAt).getTime()) / 36e5;
    if (req.priority === "critical" || hrs > 72) return "#c03030";
    if (req.priority === "urgent"   || hrs > 24) return "#c8791a";
    return "#7a8c74";
  }

  async function markResolved(req) {
    setResolving(req.id);
    await onResolve({ ...req, status: "resolved", resolvedAt: new Date().toISOString() });
    setResolving(null);
  }

  return (
    <div style={{ background: bgColor, borderRadius: 14, border: `2px solid ${borderColor}`, marginBottom: 20, overflow: "hidden", transition: "border-color .3s, background .3s" }}>
      {/* Header */}
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>

        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>🔧</span>
          {open.length > 0 && (
            <span style={{ position: "absolute", top: -5, right: -8, background: hasAnyCritical ? "#c03030" : hasAnyUrgent ? "#c8791a" : "#7a8c74", color: "#fff", borderRadius: 10, fontSize: 9, fontWeight: 900, padding: "1px 5px", minWidth: 16, textAlign: "center", lineHeight: "15px", border: "2px solid #fff" }}>
              {open.length}
            </span>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1a2a1a", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            Maintenance
            {critical.length > 0 && <span style={{ background: "#fff0f0", border: "1px solid #f0b0b0", color: "#c03030", borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 8px" }}>🔴 {critical.length} critical</span>}
            {urgent.length > 0   && <span style={{ background: "#fff4e8", border: "1px solid #f0c090", color: "#c8791a", borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 8px" }}>🟠 {urgent.length} urgent</span>}
            {normal.length > 0 && !critical.length && !urgent.length && <span style={{ background: "#f4f6f2", border: "1px solid #c8d8c0", color: "#7a8c74", borderRadius: 20, fontSize: 10, fontWeight: 700, padding: "1px 8px" }}>{normal.length} open</span>}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
            {open.length === 0 ? "No open repair requests" : `${open.length} open · ${requests.filter(r => r.status === "resolved").length} resolved`}
          </div>
        </div>

        <div style={{ fontSize: 18, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</div>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div style={{ borderTop: `1.5px solid ${borderColor}40` }}>
          {open.length === 0 ? (
            <div style={{ padding: "24px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e" }}>All clear — no open repairs</div>
              <div style={{ fontSize: 11, color: "#aabba0", marginTop: 4 }}>Repairs are submitted from the floor crew's mobile view</div>
            </div>
          ) : (
            <div>
              {open.map((req, i) => {
                const itemColor = getItemColor(req);
                const age = getAgeLabel(req);
                const isResolving = resolving === req.id;
                return (
                  <div key={req.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 18px", borderBottom: i < open.length - 1 ? "1px solid #f5f0ee" : "none", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)" }}>
                    {/* Photo thumb */}
                    {req.photo ? (
                      <img src={req.photo} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1.5px solid ${itemColor}40` }} />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 8, background: itemColor + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🔧</div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#1a2a1a", flex: 1, lineHeight: 1.3 }}>{req.title}</div>
                        <span style={{ fontSize: 10, fontWeight: 800, color: itemColor, background: itemColor + "15", padding: "2px 7px", borderRadius: 6, flexShrink: 0, border: `1px solid ${itemColor}30` }}>{age}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#7a8c74", display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {req.category && <span>{req.category}</span>}
                        {req.location && <span>· 📍 {req.location}</span>}
                        {req.submittedBy && <span>· {req.submittedBy}</span>}
                        {req.status === "in_progress" && <span style={{ color: "#4a90d9", fontWeight: 700 }}>· In Progress</span>}
                      </div>
                      {req.description && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>{req.description.slice(0, 80)}{req.description.length > 80 ? "..." : ""}</div>}
                    </div>

                    {/* Resolve button */}
                    <button onClick={() => markResolved(req)} disabled={isResolving}
                      style={{ background: isResolving ? "#c8d8c0" : "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {isResolving ? "..." : "✓ Done"}
                    </button>
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ padding: "10px 18px", borderTop: "1px solid #f0ece8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "#aabba0" }}>Mark resolved from here or from the floor view</div>
                {requests.filter(r => r.status === "resolved").length > 0 && (
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {requests.filter(r => r.status === "resolved").length} resolved total
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
