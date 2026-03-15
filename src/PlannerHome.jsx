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
  const [unviewedPhotos, setUnviewedPhotos] = useState(() => getUnviewedPhotoCount());
  const [recentPhotos,   setRecentPhotos  ] = useState(() => getRecentPhotos(8));
  const [photoSessions,  setPhotoSessions ] = useState(() => getSessionsWithPhotos());
  const [showPdfDrop,    setShowPdfDrop   ] = useState(false);

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

  const lastExport = (() => { try { return localStorage.getItem("gh_last_export_date_v1") || null; } catch { return null; } })();
  const daysSinceExport = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000) : null;
  const exportOverdue = daysSinceExport === null || daysSinceExport >= 14;

  const byStatus = {};
  CROP_STATUS.forEach(s => { byStatus[s.id] = 0; });
  runs.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });

  const upcoming = runs.flatMap(r => getCropRunCalendarEvents(r))
    .filter(e => { const d = (e.year - CURRENT_YEAR) * 52 + e.week - CURRENT_WEEK; return d >= -1 && d <= 3; })
    .sort((a, b) => ((a.year - CURRENT_YEAR) * 52 + a.week) - ((b.year - CURRENT_YEAR) * 52 + b.week))
    .slice(0, 12);

  const readyCount = runs.filter(r => r.status === "ready").length;
  const noSourcing = runs.filter(r => !r.materialType).length;

  const unconfirmedRuns = runs.filter(r => {
    if (r.orderStatus !== "ordered") return false;
    const brokers = [...new Set((r.varieties || []).map(v => v.broker).filter(Boolean))];
    if (brokers.length === 0) return true;
    const conf = r.confirmationNumbers || {};
    return brokers.some(b => !conf[b]);
  });

  const openMaintenance = maintenanceRequests.filter(r => r.status === "open" || r.status === "in_progress");
  const criticalMaint   = openMaintenance.filter(r => r.priority === "critical" || (Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / 36e5 > 72);

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div>
      {/* Header */}
      <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, color: "#1a2a1a", marginBottom: 6 }}>{greeting}</div>
      <div style={{ fontSize: 14, color: "#7a8c74", marginBottom: 24 }}>Week {CURRENT_WEEK} &middot; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>

      {/* ── ALERTS — only show when actionable ── */}
      {exportOverdue && (
        <div style={{ background: daysSinceExport === null ? "#fff8e8" : "#fde8e8", border: `1.5px solid ${daysSinceExport === null ? "#f0d080" : "#f0b0a0"}`, borderRadius: 12, padding: "12px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: daysSinceExport === null ? "#7a5a10" : "#c03030", fontWeight: 700 }}>
            {daysSinceExport === null ? "📋 No backup on record" : `⚠️ Last backup was ${daysSinceExport} days ago`}
          </span>
          <button onClick={() => onNavigate("export")} style={{ background: daysSinceExport === null ? "#e0a820" : "#d94f3d", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Export Now</button>
        </div>
      )}
      {readyCount > 0 && (
        <div style={{ background: "#e8f8e8", border: "1.5px solid #7fb069", borderRadius: 12, padding: "12px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#1e5a1e", fontWeight: 700 }}>{readyCount} crop{readyCount !== 1 ? "s" : ""} ready to ship</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>View</button>
        </div>
      )}
      {noSourcing > 0 && (
        <div style={{ background: "#fff8e8", border: "1.5px solid #f0d080", borderRadius: 12, padding: "12px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#7a5a10", fontWeight: 700 }}>{noSourcing} run{noSourcing !== 1 ? "s" : ""} missing sourcing info</span>
          <button onClick={() => onNavigate("crops")} style={{ background: "#e0a820", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Fix</button>
        </div>
      )}

      {/* ── ACTIVITY BADGES ROW — compact, not full widgets ── */}
      {(unconfirmedRuns.length > 0 || openMaintenance.length > 0 || unviewedPhotos > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, marginTop: 4 }}>
          {unconfirmedRuns.length > 0 && (
            <ActivityBadge
              icon="📋" count={unconfirmedRuns.length}
              label={`${unconfirmedRuns.length} order${unconfirmedRuns.length !== 1 ? "s" : ""} awaiting confirmation`}
              color="#e07b39" onClick={() => onNavigate("orders")} />
          )}
          {criticalMaint.length > 0 && (
            <ActivityBadge
              icon="🔴" count={criticalMaint.length}
              label={`${criticalMaint.length} critical repair${criticalMaint.length !== 1 ? "s" : ""}`}
              color="#c03030" onClick={() => onNavigate("crops")} />
          )}
          {openMaintenance.length > 0 && criticalMaint.length === 0 && (
            <ActivityBadge
              icon="🔧" count={openMaintenance.length}
              label={`${openMaintenance.length} open repair${openMaintenance.length !== 1 ? "s" : ""}`}
              color="#7a8c74" onClick={() => onNavigate("crops")} />
          )}
          {unviewedPhotos > 0 && (
            <ActivityBadge
              icon="📸" count={unviewedPhotos}
              label={`${unviewedPhotos} new trade show photo${unviewedPhotos !== 1 ? "s" : ""}`}
              color="#7fb069" onClick={() => onNavigate("tradeshow")} />
          )}
        </div>
      )}

      {/* ── STATUS TILES ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 28 }}>
        {CROP_STATUS.filter(s => s.id !== "shipped").map(s => (
          <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "14px 16px", cursor: "pointer" }}
            onClick={() => onNavigate("crops")}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{byStatus[s.id] || 0}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── UPCOMING MILESTONES ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8 }}>Upcoming Milestones</div>
        <span style={{ fontSize: 11, color: "#7a8c74" }}>Next 3 weeks</span>
      </div>
      {upcoming.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>No milestones in the next 3 weeks. Add crop runs to see them here.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
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
                  style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}40`, borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                  + Cal
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* ── QUICK ACTIONS ── original 4, plus small secondary row ── */}
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1a2a1a", textTransform: "uppercase", letterSpacing: .8, marginBottom: 14 }}>Quick Actions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {[
          { label: "New Crop Run",   page: "crops",   color: "#7fb069" },
          { label: "View Orders",    page: "orders",  color: "#8e44ad" },
          { label: "Space Map",      page: "space",   color: "#4a90d9" },
          { label: "Libraries",      page: "library", color: "#c8791a" },
        ].map(a => (
          <button key={a.page} onClick={() => onNavigate(a.page)}
            style={{ padding: "16px", borderRadius: 14, border: `1.5px solid ${a.color}30`, background: "#fff", color: "#1a2a1a", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: a.color, marginBottom: 8 }} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Secondary actions row — smaller, less prominent */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 28 }}>
        {[
          { label: "🎨 Design a Combo",  page: "combos"    },
          { label: "📅 Meetings",         page: "meetings"  },
          { label: "📸 Trade Show",       page: "tradeshow" },
          { label: "📤 Export",           page: "export"    },
        ].map(a => (
          <button key={a.page} onClick={() => onNavigate(a.page)}
            style={{ padding: "8px 16px", borderRadius: 20, border: "1.5px solid #e0ead8", background: "#fff", color: "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {a.label}
          </button>
        ))}
        <button onClick={() => setShowPdfDrop(v => !v)}
          style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${showPdfDrop ? "#7fb069" : "#e0ead8"}`, background: showPdfDrop ? "#f0f8eb" : "#fff", color: showPdfDrop ? "#2e5c1e" : "#7a8c74", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          📄 Drop Confirmation PDF
        </button>
      </div>

      {/* PDF drop zone — only shown when toggled */}
      {showPdfDrop && (
        <div style={{ marginBottom: 24 }}>
          <ConfirmationDropZone runs={runs} upsertRun={upsertRun} onNavigate={onNavigate} />
        </div>
      )}

      {/* Maintenance — only shown when there are open items */}
      {openMaintenance.length > 0 && (
        <MaintenanceWidget requests={maintenanceRequests} onResolve={upsertMaintenance} />
      )}

      {/* Unconfirmed orders — only shown when there are unconfirmed */}
      {unconfirmedRuns.length > 0 && (
        <UnconfirmedOrdersWidget runs={runs} unconfirmedRuns={unconfirmedRuns} onNavigate={onNavigate} />
      )}

      {/* Trade show — only shown when there are photos */}
      {recentPhotos.length > 0 && (
        <TradeShowWidget recentPhotos={recentPhotos} photoSessions={photoSessions} unviewedCount={unviewedPhotos} onNavigate={onNavigate} />
      )}
    </div>
  );
}

// ── ACTIVITY BADGE — compact pill for the notification row ────────────────────
function ActivityBadge({ icon, count, label, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 20, border: `1.5px solid ${color}40`, background: "#fff", cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}
      onMouseEnter={e => { e.currentTarget.style.background = color + "10"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
    </button>
  );
}


// ── UNCONFIRMED ORDERS WIDGET ─────────────────────────────────────────────────
function UnconfirmedOrdersWidget({ runs, unconfirmedRuns, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const [localConfirm, setLocalConfirm] = useState({});
  const { upsert } = useCropRuns();

  function getKey(runId, broker) { return `${runId}__${broker}`; }

  async function saveConfirmation(run, broker, number) {
    if (!number.trim()) return;
    const updated = { ...run, confirmationNumbers: { ...(run.confirmationNumbers || {}), [broker]: number.trim() } };
    const brokers = [...new Set((run.varieties || []).map(v => v.broker).filter(Boolean))];
    if (brokers.every(b => updated.confirmationNumbers[b])) updated.orderStatus = "confirmed";
    await upsert(updated);
    setLocalConfirm(lc => { const n = { ...lc }; delete n[getKey(run.id, broker)]; return n; });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e07b39", marginBottom: 16, overflow: "hidden" }}>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", background: "#fff8f4" }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1a2a1a" }}>
            {unconfirmedRuns.length} order{unconfirmedRuns.length !== 1 ? "s" : ""} awaiting confirmation
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>Enter broker confirmation numbers</div>
        </div>
        <div style={{ fontSize: 16, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #f0e8e0" }}>
          {unconfirmedRuns.map((run, ri) => {
            const brokers = [...new Set((run.varieties || []).map(v => v.broker).filter(Boolean))];
            const confirmations = run.confirmationNumbers || {};
            const [rowExpanded, setRowExpanded] = useState(false);
            return (
              <div key={run.id} style={{ borderBottom: ri < unconfirmedRuns.length - 1 ? "1px solid #f5f0ee" : "none" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", padding: "10px 18px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "#1a2a1a" }}>{run.cropName}</span>
                      {run.targetWeek && <span style={{ fontSize: 10, background: "#f0f8eb", color: "#2e5c1e", padding: "1px 6px", borderRadius: 5, fontWeight: 700 }}>Wk {run.targetWeek}</span>}
                      {run.cropRunCode && <span style={{ fontSize: 10, background: "#1e2d1a", color: "#7fb069", padding: "1px 7px", borderRadius: 5, fontWeight: 800, fontFamily: "monospace" }}>{run.cropRunCode}</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(brokers.length > 0 ? brokers : ["(no broker)"]).map(broker => {
                        const key = getKey(run.id, broker);
                        const existing = confirmations[broker];
                        const draft = localConfirm[key] ?? "";
                        return (
                          <div key={broker} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", minWidth: 70, flexShrink: 0 }}>{broker}</span>
                            {existing ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#2e5c1e", background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 5, padding: "2px 8px" }}>✓ {existing}</span>
                            ) : (
                              <div style={{ display: "flex", gap: 5, flex: 1 }}>
                                <input value={draft} onChange={e => setLocalConfirm(lc => ({ ...lc, [key]: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && saveConfirmation(run, broker, draft)}
                                  placeholder="Confirmation #"
                                  style={{ flex: 1, maxWidth: 160, padding: "3px 8px", border: "1.5px solid #f0c080", borderRadius: 6, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                                <button onClick={() => saveConfirmation(run, broker, draft)} disabled={!draft.trim()}
                                  style={{ background: draft.trim() ? "#e07b39" : "#f0d0b8", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: draft.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                                  Save
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <button onClick={() => setRowExpanded(e => !e)}
                    style={{ background: "none", border: "1px solid #e0ead8", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                    {rowExpanded ? "▲" : "▼"}
                  </button>
                </div>
                {rowExpanded && (
                  <div style={{ padding: "0 18px 10px", background: "#fafcf8" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#7a8c74" }}>
                      {(run.varieties || []).map((v, i) => (
                        <span key={i} style={{ background: "#f0f5ee", padding: "2px 8px", borderRadius: 5 }}>
                          {v.color || v.name || "—"} · {v.cases} cs
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ padding: "8px 18px", borderTop: "1px solid #f5f0ee", textAlign: "right" }}>
            <button onClick={() => onNavigate("orders")}
              style={{ background: "none", border: "1px solid #e07b39", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#e07b39", cursor: "pointer", fontFamily: "inherit" }}>
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
  const [dragOver, setDragOver] = useState(false);
  const [stage,    setStage   ] = useState("idle");
  const [result,   setResult  ] = useState(null);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef(null);

  async function processFile(file) {
    if (!file || file.type !== "application/pdf") { setErrorMsg("Please drop a PDF file."); setStage("error"); return; }
    setStage("reading"); setErrorMsg(""); setResult(null);
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result.split(",")[1]);
      reader.onerror = () => rej(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    setStage("matching");
    const runSummary = runs.map(r => ({
      id: r.id, cropName: r.cropName, cropRunCode: r.cropRunCode || null,
      broker: [...new Set((r.varieties||[]).map(v=>v.broker).filter(Boolean))].join(", "),
      cases: r.cases, targetWeek: r.targetWeek, orderStatus: r.orderStatus || "",
      existingConfirmations: r.confirmationNumbers || {},
    }));
    const prompt = `You are a greenhouse planning assistant for Hoosier Boy Greenhouse.\n\nA broker order confirmation PDF has been uploaded. Extract key info and match to crop runs.\n\nMATCHING: Look first for a CR code like CR2026-0001-01. If found match base code to cropRunCode. Otherwise fuzzy match by broker + variety names.\n\nCROP RUNS:\n${JSON.stringify(runSummary, null, 2)}\n\nReturn ONLY valid JSON:\n{\n  "broker": "broker name",\n  "poNumber": "PO or confirmation number",\n  "cropRunCode": "CR code found or null",\n  "brokerSubCode": "full sub-code or null",\n  "orderDate": "date or null",\n  "lineItems": [{"description":"","quantity":0,"unitPrice":0,"itemNumber":""}],\n  "matches": [{"runId":"","cropName":"","confidence":"high|medium|low","matchReason":"","discrepancies":[]}],\n  "unmatchedItems": [],\n  "summary": "one sentence"\n}`;
    try {
      const apiKey = process.env.REACT_APP_ANTHROPIC_API_KEY || "";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: prompt }] }] }),
      });
      if (!response.ok) { const err = await response.json().catch(() => ({})); throw new Error(err?.error?.message || `API error ${response.status}`); }
      const data = await response.json();
      const text = data.content?.find(b => b.type === "text")?.text || "{}";
      setResult(JSON.parse(text.replace(/```json|```/g, "").trim()));
      setStage("review");
    } catch(e) { setErrorMsg(e.message || "Could not read the PDF."); setStage("error"); }
  }

  async function applyConfirmations() {
    if (!result?.matches?.length) return;
    setApplying(true);
    for (const match of result.matches) {
      const run = runs.find(r => r.id === match.runId);
      if (!run || !result.poNumber) continue;
      const updatedConf = { ...(run.confirmationNumbers || {}), [result.broker]: result.poNumber };
      const brokers = [...new Set((run.varieties||[]).map(v=>v.broker).filter(Boolean))];
      await upsertRun({ ...run, confirmationNumbers: updatedConf, orderStatus: brokers.every(b => updatedConf[b]) ? "confirmed" : "ordered" });
    }
    setApplying(false); setStage("done");
  }

  function reset() { setStage("idle"); setResult(null); setErrorMsg(""); }
  const CC = { high: "#2e5c1e", medium: "#c8791a", low: "#b03020" };
  const CB = { high: "#f0f8eb", medium: "#fff4e8", low: "#fff0f0" };

  if (stage === "idle" || stage === "error") return (
    <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
      onClick={() => fileRef.current?.click()}
      style={{ border: `2px dashed ${dragOver ? "#7fb069" : "#c8d8c0"}`, borderRadius: 12, padding: "16px 20px", background: dragOver ? "#f0f8eb" : "#fafcf8", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
      <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) processFile(f); e.target.value = ""; }} />
      <div style={{ fontSize: 28 }}>{dragOver ? "📂" : "📄"}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1a2a1a" }}>{dragOver ? "Drop to process" : "Drop broker confirmation PDF here"}</div>
        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>AI reads the PDF and matches to your crop runs via CR code</div>
        {stage === "error" && <div style={{ marginTop: 4, fontSize: 11, color: "#b03020", fontWeight: 600 }}>⚠️ {errorMsg}</div>}
      </div>
      <div style={{ fontSize: 10, color: "#aabba0", textAlign: "right", flexShrink: 0 }}>Ball · Dümmen<br />Syngenta · PanAm</div>
    </div>
  );

  if (stage === "reading" || stage === "matching") return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "20px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 12 }}>{stage === "reading" ? "📄 Reading PDF..." : "🔍 Matching to crop runs..."}</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: 4, background: "#7fb069", animation: `pulse 1.2s ease-in-out ${i*0.4}s infinite` }} />)}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
    </div>
  );

  if (stage === "done") return (
    <div style={{ background: "#f0f8eb", borderRadius: 12, border: "1.5px solid #7fb069", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 24 }}>✅</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>PO #{result?.poNumber} logged</div>
        <div style={{ fontSize: 11, color: "#2e5c1e" }}>{result?.matches?.length || 0} run{(result?.matches?.length||0) !== 1 ? "s" : ""} updated</div>
      </div>
      <button onClick={reset} style={{ background: "#fff", border: "1px solid #c8e0b8", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>Drop Another</button>
    </div>
  );

  if (stage === "review" && result) return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #7fb069", overflow: "hidden" }}>
      <div style={{ background: "#f0f8eb", padding: "12px 16px", borderBottom: "1px solid #c8e0b8", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{result.broker} — PO #{result.poNumber}</div>
          {result.cropRunCode && <div style={{ fontSize: 11, color: "#2e5c1e", marginTop: 3 }}>✓ Matched via {result.brokerSubCode || result.cropRunCode}</div>}
          {result.summary && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{result.summary}</div>}
        </div>
        <button onClick={reset} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 18, cursor: "pointer" }}>×</button>
      </div>
      {result.matches?.map((m, i) => (
        <div key={i} style={{ padding: "10px 16px", borderBottom: "1px solid #f0f5ee", background: CB[m.confidence] }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{m.cropName}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: CC[m.confidence] }}>{m.confidence === "high" ? "✓ High" : m.confidence === "medium" ? "~ Medium" : "⚠ Low"}</span>
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{m.matchReason}</div>
          {m.discrepancies?.map((d, di) => <div key={di} style={{ fontSize: 11, color: "#b03020", marginTop: 3 }}>⚠️ {d}</div>)}
        </div>
      ))}
      <div style={{ padding: "10px 16px", display: "flex", gap: 8 }}>
        <button onClick={applyConfirmations} disabled={applying || !result.matches?.length}
          style={{ flex: 1, background: "#2e5c1e", color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {applying ? "Saving..." : `✅ Apply to ${result.matches?.length || 0} run${(result.matches?.length||0) !== 1 ? "s" : ""}`}
        </button>
        <button onClick={reset} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 8, padding: "9px 14px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );

  return null;
}

// ── MAINTENANCE WIDGET ────────────────────────────────────────────────────────
function MaintenanceWidget({ requests, onResolve }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(null);

  const open = requests.filter(r => r.status === "open" || r.status === "in_progress");
  const critical = open.filter(r => r.priority === "critical" || (Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / 36e5 > 72);
  const borderColor = critical.length > 0 ? "#c03030" : open.some(r => r.priority === "urgent" || (Date.now() - new Date(r.submittedAt || r.createdAt).getTime()) / 36e5 > 24) ? "#c8791a" : "#e0ead8";

  function getAge(req) {
    const ms = Date.now() - new Date(req.submittedAt || req.createdAt).getTime();
    const hrs = Math.floor(ms / 36e5); const days = Math.floor(hrs / 24);
    return days > 0 ? `${days}d` : hrs > 0 ? `${hrs}h` : "New";
  }
  function getColor(req) {
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
    <div style={{ background: "#fff", borderRadius: 14, border: `2px solid ${borderColor}`, marginBottom: 16, overflow: "hidden", transition: "border-color .3s" }}>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer" }}>
        <span style={{ fontSize: 20 }}>🔧</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1a2a1a", display: "flex", gap: 8, alignItems: "center" }}>
            Maintenance
            {critical.length > 0 && <span style={{ background: "#fff0f0", color: "#c03030", border: "1px solid #f0b0b0", borderRadius: 20, fontSize: 10, fontWeight: 800, padding: "1px 8px" }}>🔴 {critical.length} critical</span>}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>{open.length} open repair{open.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ fontSize: 16, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>⌄</div>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${borderColor}40` }}>
          {open.map((req, i) => {
            const c = getColor(req); const age = getAge(req);
            return (
              <div key={req.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 18px", borderBottom: i < open.length - 1 ? "1px solid #f5f0ee" : "none" }}>
                {req.photo ? <img src={req.photo} alt="" style={{ width: 44, height: 44, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 7, background: c + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🔧</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1a2a1a" }}>{req.title}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>{req.location && `📍 ${req.location} · `}{age} open</div>
                </div>
                <button onClick={() => markResolved(req)} disabled={resolving === req.id}
                  style={{ background: "#f0f8eb", border: "1px solid #c8e0b8", borderRadius: 7, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                  {resolving === req.id ? "..." : "✓ Done"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── TRADE SHOW WIDGET ─────────────────────────────────────────────────────────
function TradeShowWidget({ recentPhotos, photoSessions, unviewedCount, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  function isNew(photo) {
    try { const v = JSON.parse(localStorage.getItem("gh_tradeshow_viewed_v1") || "{}"); return photo.capturedAt > (v[photo.sessionId] || 0); }
    catch { return false; }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", marginBottom: 16, overflow: "hidden" }}>
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>📸</span>
          {unviewedCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -7, background: "#7fb069", color: "#fff", borderRadius: 9, fontSize: 9, fontWeight: 900, padding: "1px 4px", lineHeight: "14px", border: "2px solid #fff" }}>{unviewedCount}</span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#1a2a1a" }}>
            Trade Show Photos
            {unviewedCount > 0 && <span style={{ marginLeft: 8, fontSize: 10, background: "#f0f8eb", color: "#2e5c1e", border: "1px solid #c8e0b8", borderRadius: 20, padding: "1px 7px" }}>{unviewedCount} new</span>}
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>{(photoSessions||[]).length} session{(photoSessions||[]).length !== 1 ? "s" : ""} · {recentPhotos.length} photo{recentPhotos.length !== 1 ? "s" : ""}</div>
        </div>
        <button onClick={e => { e.stopPropagation(); onNavigate("tradeshow"); }}
          style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Open →
        </button>
        <div style={{ fontSize: 16, color: "#aabba0", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s", marginLeft: 4 }}>⌄</div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #f0f5ee" }}>
          {(photoSessions||[]).slice(0, 3).map((session, si) => (
            <div key={session.id} style={{ borderBottom: si < Math.min((photoSessions||[]).length, 3) - 1 ? "1px solid #f5f5f2" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 4px", background: "#fafcf8" }}>
                <span style={{ fontSize: 12 }}>{session.type === "quickshot" ? "⚡" : "🎪"}</span>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{session.name}</div>
                <div style={{ fontSize: 10, color: "#aabba0" }}>{new Date(session.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
              </div>
              <div style={{ overflowX: "auto", padding: "4px 16px 10px", display: "flex", gap: 6 }}>
                {(session.photos||[]).slice(0, 8).map(photo => (
                  <div key={photo.id} onClick={() => onNavigate("tradeshow")} style={{ flexShrink: 0, position: "relative", cursor: "pointer" }}>
                    {isNew({ ...photo, sessionId: session.id }) && <div style={{ position: "absolute", top: 3, left: 3, zIndex: 1, background: "#7fb069", color: "#fff", borderRadius: 3, fontSize: 8, fontWeight: 900, padding: "1px 4px" }}>NEW</div>}
                    <img src={photo.imgData} alt="" style={{ width: 90, height: 65, objectFit: "cover", borderRadius: 6, border: "1px solid #e0ead8", display: "block" }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ padding: "8px 18px", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => onNavigate("tradeshow")} style={{ background: "none", border: "1px solid #c8d8c0", borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>View All →</button>
          </div>
        </div>
      )}
    </div>
  );
}
