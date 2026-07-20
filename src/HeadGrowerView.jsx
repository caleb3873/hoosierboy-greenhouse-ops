// HeadGrowerView — command center for whoever owns the chemical program.
//   📋 Board    — active REIs, this week's applications/fertigations, response
//                 checks due, overdue growing work, REI-gap worklist
//   🔄 Rotation — per-pest MOA (IRAC/FRAC) sequence from the application log +
//                 upcoming tasks, with back-to-back same-group warnings
//   📒 Records  — full WorkRecords (log, export, product library, Purdue)
// Reached via floor code role 'head_grower' (code 5555555 until renamed) or
// PlannerShell → Operations → 🌿 Head Grower.
import { useMemo, useState } from "react";
import { useManagerTasks, useSprayRecords, useChemProducts } from "./supabase";
import { useAuth } from "./Auth";
import { NewWorkModal, ReiBanner } from "./WorkHub";
import { NotificationBanner } from "./PushNotifications";
import WorkRecords from "./WorkRecords";
import { formatTargetDate } from "./ManagerTasksView";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const GREEN_DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const RED = "#d94f3d";
const AMBER = "#e89a3a";

function getWeekInfo(date = new Date()) {
  const year = date.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.ceil((date - s) / (7 * 86400000));
  return { week, year };
}

const normPest = (p) => (p || "").trim().toLowerCase();
// only numbered resistance groups rotate — biologicals/botanicals/PGRs repeat freely
const warnableMoa = (moa) => /^(IRAC|FRAC)\s/i.test(moa || "");
const isWorkTask = (t) => t.sourceKind === "application" || t.sourceKind === "fertigation";

export default function HeadGrowerView({ onSwitchMode, embedded }) {
  const { rows: tasks, upsert, refresh } = useManagerTasks();
  const { rows: sprayRows } = useSprayRecords();
  const { rows: products } = useChemProducts();
  const { displayName } = useAuth();
  const [tab, setTab] = useState("board");
  const [recordsTab, setRecordsTab] = useState("records");
  const [showNewWork, setShowNewWork] = useState(false);
  const today = useMemo(() => getWeekInfo(), []);

  const productFor = (wp) => {
    if (!wp) return null;
    return (products || []).find(p => p.id === wp.product_id)
      || (products || []).find(p => (p.name || "").toLowerCase() === (wp.product_name || "").toLowerCase())
      || null;
  };

  // ── application/fertigation tasks this week ────────────────────────────────
  const workTasks = useMemo(() => (tasks || [])
    .filter(t => isWorkTask(t) && t.status !== "requested" && t.status !== "rejected")
    .filter(t => t.year === today.year && t.weekNumber === today.week)
    .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999")), [tasks, today]);

  // ── pest → MOA history (applied last 90 days + planned tasks) ──────────────
  const pestHistory = useMemo(() => {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const entries = [];
    for (const r of (sprayRows || [])) {
      if ((r.category || "application") !== "application") continue;
      if (!r.appliedAt || r.appliedAt < cutoff) continue;
      const pest = normPest(r.targetPest);
      if (!pest) continue;
      const prod = (products || []).find(p => p.id === r.productId)
        || (products || []).find(p => (p.name || "").toLowerCase() === (r.productName || "").toLowerCase());
      entries.push({ pest, date: r.appliedAt.slice(0, 10), product: r.productName, moa: prod?.moa || null, planned: false });
    }
    for (const t of (tasks || [])) {
      if (t.sourceKind !== "application" || t.status === "completed" || t.status === "requested" || t.status === "rejected") continue;
      const wp = t.workPayload;
      const pest = normPest(wp?.target_pest);
      if (!pest) continue;
      const prod = productFor(wp);
      entries.push({ pest, date: t.targetDate || "upcoming", product: wp.product_name, moa: prod?.moa || null, planned: true });
    }
    const byPest = new Map();
    for (const e of entries.sort((a, b) => a.date.localeCompare(b.date))) {
      if (!byPest.has(e.pest)) byPest.set(e.pest, []);
      byPest.get(e.pest).push(e);
    }
    // flag back-to-back same numbered group
    for (const seq of byPest.values()) {
      for (let i = 1; i < seq.length; i++) {
        if (seq[i].moa && seq[i].moa === seq[i - 1].moa && warnableMoa(seq[i].moa)) seq[i].repeat = true;
      }
    }
    return [...byPest.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [sprayRows, tasks, products]); // eslint-disable-line

  // planned-task warnings for the Board: next application repeats the last-used group
  const rotationWarnings = useMemo(() => {
    const out = new Map(); // taskId -> message
    for (const [pest, seq] of pestHistory) {
      for (const e of seq) {
        if (e.planned && e.repeat) {
          const t = workTasks.find(w => normPest(w.workPayload?.target_pest) === pest && (w.workPayload?.product_name || "") === (e.product || ""));
          if (t) out.set(t.id, `${e.moa} was also the last group used on ${pest} — consider rotating`);
        }
      }
    }
    return out;
  }, [pestHistory, workTasks]);

  const activeReis = useMemo(() => (sprayRows || []).filter(r => r.reiExpiresAt && new Date(r.reiExpiresAt) > new Date()), [sprayRows]);
  const missingRei = useMemo(() => (products || []).filter(p => p.active !== false && p.productType !== "fertigation" && p.reiHours == null), [products]);
  const responseChecksDue = useMemo(() => (tasks || []).filter(t =>
    t.sourceKind === "response" && t.status !== "completed" && t.status !== "requested" && t.status !== "rejected" &&
    t.targetDate && t.targetDate <= new Date().toISOString().slice(0, 10)), [tasks]);
  const overdueGrowing = useMemo(() => (tasks || []).filter(t =>
    (t.category || "production") === "growing" && t.carriedOver && t.status !== "completed" && t.status !== "requested"), [tasks]);

  const statTile = (emoji, num, label, warn, onClick) => (
    <div onClick={onClick} style={{
      flex: "1 1 130px", background: warn && num > 0 ? "#3a1e18" : "#263821", borderRadius: 12,
      border: `1.5px solid ${warn && num > 0 ? RED : GREEN + "44"}`, padding: "12px 14px",
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: warn && num > 0 ? "#ffb3a8" : CREAM }}>{emoji} {num}</div>
      <div style={{ fontSize: 11, color: warn && num > 0 ? "#ffb3a8" : "#9cb894", fontWeight: 700, marginTop: 2 }}>{label}</div>
    </div>
  );

  const statusChip = (t) => {
    if (t.status === "completed") return <span style={{ background: GREEN, color: GREEN_DARK, borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>✓ done {t.completedBy ? `· ${t.completedBy}` : ""}</span>;
    if (t.claimedBy) return <span style={{ background: AMBER, color: GREEN_DARK, borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>🙋 {t.claimedBy}</span>;
    return <span style={{ background: "#7a8c74", color: "#fff", borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>pending</span>;
  };

  return (
    <div style={{ ...FONT, minHeight: embedded ? "auto" : "100vh", background: GREEN_DARK, color: "#fff", paddingBottom: 90, ...(embedded ? { borderRadius: 16, overflow: "hidden" } : {}) }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      {!embedded && <div style={{ padding: "10px 14px 0" }}><NotificationBanner /></div>}

      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>🌿 Head Grower</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {displayName ? `Hi ${displayName.split(" ")[0]}` : "Chemical Program"} · Week {today.week}
          </div>
        </div>
        {!embedded && onSwitchMode && (
          <button onClick={onSwitchMode} style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "6px 12px", borderRadius: 6, cursor: "pointer", ...FONT }}>Sign out</button>
        )}
      </div>

      <ReiBanner />

      {/* tabs */}
      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        {[["board", "📋 Board"], ["rotation", "🔄 Rotation"], ["records", "📒 Records"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${GREEN}66`,
            background: tab === id ? GREEN : "transparent",
            color: tab === id ? GREEN_DARK : CREAM, fontWeight: 800, fontSize: 13, ...FONT,
          }}>{l}</button>
        ))}
      </div>

      {tab === "board" && (
        <div style={{ padding: "0 12px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {statTile("⚠️", activeReis.length, "active REIs", true)}
            {statTile("🏷", missingRei.length, "products missing REI", true, () => { setRecordsTab("products"); setTab("records"); })}
            {statTile("📸", responseChecksDue.length, "response checks due", false)}
            {statTile("⏰", overdueGrowing.length, "overdue growing tasks", true)}
          </div>

          {missingRei.length > 0 && (
            <div onClick={() => { setRecordsTab("products"); setTab("records"); }} style={{ background: "#3a2c14", border: `1.5px solid ${AMBER}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, cursor: "pointer" }}>
              <div style={{ fontSize: 12.5, color: "#ffd9a8", fontWeight: 700 }}>
                🏷 {missingRei.length} products have no REI on file — the re-entry alerts can't protect anyone until these are filled from the labels. Tap to work the list.
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 800, color: CREAM, textTransform: "uppercase", letterSpacing: 1.2, margin: "6px 4px 10px" }}>
            💧 Applications & fertigations this week ({workTasks.length})
          </div>
          {workTasks.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#6a8a5a" }}>Nothing scheduled this week — tap 🧪 New Work to plan one.</div>
          )}
          {workTasks.map(t => {
            const wp = t.workPayload || {};
            const prod = productFor(wp);
            const warning = rotationWarnings.get(t.id);
            return (
              <div key={t.id} style={{ background: "#263821", border: `1px solid ${warning ? AMBER : GREEN + "44"}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: CREAM }}>{t.title}</span>
                  {statusChip(t)}
                  {prod?.moa && <span style={{ background: "#2c3c5a", color: "#a8c4f0", borderRadius: 999, padding: "2px 9px", fontSize: 10, fontWeight: 800 }}>{prod.moa}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "#9cb894", marginTop: 4 }}>
                  {t.targetDate && <>📅 {formatTargetDate(t.targetDate)}</>}
                  {wp.target_pest && <> · 🎯 {wp.target_pest}</>}
                  {wp.rei_hours ? <> · REI {wp.rei_hours}h</> : null}
                  {t.createdBy && <> · by {t.createdBy}</>}
                </div>
                {warning && (
                  <div style={{ fontSize: 12, color: "#ffd9a8", marginTop: 6, fontWeight: 700 }}>⚠ {warning}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "rotation" && (
        <div style={{ padding: "0 12px" }}>
          <div style={{ fontSize: 12, color: "#9cb894", margin: "2px 4px 12px" }}>
            Last 90 days of applications + what's planned, grouped by target. ⚠ marks back-to-back use of the same IRAC/FRAC group — rotate before resistance builds. Biologicals and PGRs repeat freely.
          </div>
          {pestHistory.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#6a8a5a" }}>
              No applications with a target pest logged yet. Once application tasks complete, the rotation picture builds itself here.
            </div>
          )}
          {pestHistory.map(([pest, seq]) => (
            <div key={pest} style={{ background: "#263821", border: `1px solid ${seq.some(e => e.repeat) ? AMBER : GREEN + "44"}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: CREAM, textTransform: "capitalize", marginBottom: 8 }}>
                🎯 {pest} <span style={{ fontSize: 11, color: "#9cb894", fontWeight: 600 }}>({seq.length} applications)</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {seq.map((e, i) => (
                  <span key={i} style={{
                    background: e.repeat ? "#3a2c14" : e.planned ? "#2c3c5a" : "#1e2d1a",
                    border: `1px solid ${e.repeat ? AMBER : e.planned ? "#4a6a9a" : "#4a6a3a"}`,
                    borderRadius: 8, padding: "5px 9px", fontSize: 11.5, color: e.repeat ? "#ffd9a8" : CREAM,
                  }}>
                    {e.repeat && "⚠ "}{e.planned && "→ "}{e.date.slice(5)} <b>{e.product}</b>{e.moa ? ` · ${e.moa}` : " · MOA?"}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "records" && (
        <div style={{ background: "#f2f5ef", borderRadius: 14, margin: "0 10px", padding: 14, color: GREEN_DARK }}>
          <WorkRecords embedded initialTab={recordsTab} key={recordsTab} />
        </div>
      )}

      {/* New Work FAB */}
      <button onClick={() => setShowNewWork(true)} style={{
        position: "fixed", bottom: 24, right: 20, padding: "14px 20px", borderRadius: 999,
        background: AMBER, border: "3px solid #fff", color: GREEN_DARK, fontSize: 14, fontWeight: 800,
        cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,.3)", zIndex: 200, ...FONT,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        🧪 New Work
      </button>

      {showNewWork && (
        <NewWorkModal
          tasks={tasks}
          upsert={upsert}
          createdBy={displayName || "Head Grower"}
          onClose={() => setShowNewWork(false)}
          onCreated={() => refresh()}
        />
      )}
    </div>
  );
}
