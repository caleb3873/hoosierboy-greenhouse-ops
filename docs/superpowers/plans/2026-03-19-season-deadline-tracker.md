# Season Deadline Tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add season planning deadline tracker with progress bars, countdown clocks, and broker-driven EODs to keep ordering ahead of schedule.

**Architecture:** Two new Supabase tables (season_targets, planning_eods). A SeasonDeadlines page under Production nav. A summary widget on PlannerHome. Progress auto-calculated from crop_runs data. EODs are broker-driven deadlines entered by planners.

**Tech Stack:** React 18, Supabase, inline CSS (existing patterns)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/SeasonDeadlines.jsx` | Full deadline page — targets, EODs, progress detail |
| Create | `src/SeasonDeadlineWidget.jsx` | Dashboard summary widget for PlannerHome |
| Modify | `src/PlannerHome.jsx` | Add widget import and render |
| Modify | `src/App.jsx` | Add page to Production nav, import + route |
| Modify | `src/supabase.js` | Add useSeasonTargets, usePlanningEods hooks |
| Modify | `supabase-schema.sql` | Add season_targets, planning_eods tables |

---

## Chunk 1: Foundation + Full Page

### Task 1: Database tables

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Add season_targets table**

Append to `supabase-schema.sql`:

```sql
-- ============================================================
-- SEASON TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS season_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT NOT NULL,
  label TEXT NOT NULL,
  target_date DATE NOT NULL,
  target_pct INTEGER NOT NULL DEFAULT 80,
  metric TEXT NOT NULL DEFAULT 'ordered',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE season_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to season_targets" ON season_targets FOR ALL USING (true);

-- ============================================================
-- PLANNING EODS (Broker-driven deadlines)
-- ============================================================
CREATE TABLE IF NOT EXISTS planning_eods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  due_date DATE NOT NULL,
  broker TEXT,
  crop TEXT,
  season TEXT,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE planning_eods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to planning_eods" ON planning_eods FOR ALL USING (true);
```

- [ ] **Step 2: Run SQL in Supabase dashboard**

- [ ] **Step 3: Add hooks to supabase.js**

After existing hooks, add:

```javascript
export const useSeasonTargets = () => useTable("season_targets", { orderBy: "target_date", localKey: "gh_season_targets_v1" });
export const usePlanningEods  = () => useTable("planning_eods",  { orderBy: "due_date",    localKey: "gh_planning_eods_v1" });
```

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql src/supabase.js
git commit -m "feat: add season_targets and planning_eods tables and hooks"
```

---

### Task 2: SeasonDeadlines page

**Files:**
- Create: `src/SeasonDeadlines.jsx`

- [ ] **Step 1: Create SeasonDeadlines.jsx**

```javascript
import React, { useState, useMemo } from "react";
import { useSeasonTargets, usePlanningEods, useCropRuns } from "./supabase";
import { uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

const METRICS = [
  { id: "created",   label: "Runs Created",     desc: "Crop runs entered in system" },
  { id: "sourced",   label: "Sourcing Assigned", desc: "Broker & supplier assigned" },
  { id: "ordered",   label: "Orders Placed",     desc: "POs sent to brokers" },
  { id: "confirmed", label: "Confirmed",         desc: "Broker confirmed availability" },
];

function FL({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{children}</label>;
}

function inputStyle() {
  return { width: "100%", padding: "10px 12px", border: "1.5px solid #d0d8c8", borderRadius: 10, fontFamily: FONT, fontSize: 14, boxSizing: "border-box" };
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + "T23:59:59");
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}

function statusColor(daysLeft, pctProgress, pctTarget) {
  if (daysLeft < 0) return "#c03030"; // overdue
  const pace = pctTarget > 0 ? pctProgress / pctTarget : 1;
  if (pace >= 0.9) return "#4a7a35"; // on track
  if (pace >= 0.6) return "#c8791a"; // falling behind
  return "#c03030"; // way behind
}

function calcProgress(runs, metric) {
  if (!runs.length) return 0;
  let count = 0;
  if (metric === "created") count = runs.length;
  if (metric === "sourced") count = runs.filter(r => r.sourcingBroker || r.sourcingSupplier).length;
  if (metric === "ordered") count = runs.filter(r => ["ordered", "confirmed", "growing", "propagating", "outside", "ready", "shipped"].includes(r.status)).length;
  if (metric === "confirmed") count = runs.filter(r => ["confirmed", "growing", "propagating", "outside", "ready", "shipped"].includes(r.status)).length;
  return Math.round((count / runs.length) * 100);
}

export default function SeasonDeadlines() {
  const { rows: targets, insert: insertTarget, update: updateTarget, remove: removeTarget } = useSeasonTargets();
  const { rows: eods, insert: insertEod, update: updateEod, remove: removeEod } = usePlanningEods();
  const { rows: runs } = useCropRuns();

  const [showNewTarget, setShowNewTarget] = useState(false);
  const [showNewEod, setShowNewEod] = useState(false);
  const [targetForm, setTargetForm] = useState({ season: "", label: "", targetDate: "", targetPct: 80, metric: "ordered", notes: "" });
  const [eodForm, setEodForm] = useState({ title: "", dueDate: "", broker: "", crop: "", season: "", notes: "" });

  // Group targets by season
  const seasons = useMemo(() => {
    const map = {};
    targets.forEach(t => {
      if (!map[t.season]) map[t.season] = [];
      map[t.season].push(t);
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate)));
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [targets]);

  const activeEods = useMemo(() => eods.filter(e => !e.completed).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)), [eods]);
  const completedEods = useMemo(() => eods.filter(e => e.completed).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)), [eods]);

  const saveTarget = async () => {
    if (!targetForm.season || !targetForm.label || !targetForm.targetDate) return;
    await insertTarget({ id: uid(), ...targetForm });
    setTargetForm({ season: "", label: "", targetDate: "", targetPct: 80, metric: "ordered", notes: "" });
    setShowNewTarget(false);
  };

  const saveEod = async () => {
    if (!eodForm.title || !eodForm.dueDate) return;
    await insertEod({ id: uid(), ...eodForm });
    setEodForm({ title: "", dueDate: "", broker: "", crop: "", season: "", notes: "" });
    setShowNewEod(false);
  };

  const toggleEod = async (eod) => {
    await updateEod(eod.id, { completed: !eod.completed, completedAt: eod.completed ? null : new Date().toISOString() });
  };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: 0 }}>Season Deadlines</h2>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>Track ordering progress and broker EODs</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowNewTarget(true)} style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>+ Season Target</button>
          <button onClick={() => setShowNewEod(true)} style={{
            background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>+ EOD</button>
        </div>
      </div>

      {/* New Target Form */}
      {showNewTarget && (
        <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 14 }}>New Season Target</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Season</FL><input value={targetForm.season} onChange={e => setTargetForm(f => ({ ...f, season: e.target.value }))} placeholder="Spring 2027" style={inputStyle()} /></div>
            <div><FL>Milestone Label</FL><input value={targetForm.label} onChange={e => setTargetForm(f => ({ ...f, label: e.target.value }))} placeholder="80% ordered" style={inputStyle()} /></div>
            <div><FL>Target Date</FL><input type="date" value={targetForm.targetDate} onChange={e => setTargetForm(f => ({ ...f, targetDate: e.target.value }))} style={inputStyle()} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Target %</FL><input type="number" min="1" max="100" value={targetForm.targetPct} onChange={e => setTargetForm(f => ({ ...f, targetPct: parseInt(e.target.value) || 80 }))} style={inputStyle()} /></div>
            <div><FL>Metric</FL>
              <select value={targetForm.metric} onChange={e => setTargetForm(f => ({ ...f, metric: e.target.value }))} style={inputStyle()}>
                {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div><FL>Notes</FL><input value={targetForm.notes} onChange={e => setTargetForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveTarget} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Save Target</button>
            <button onClick={() => setShowNewTarget(false)} style={{ background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          </div>
        </div>
      )}

      {/* New EOD Form */}
      {showNewEod && (
        <div style={{ background: "#fff", border: "1.5px solid #b0c8e8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 14 }}>New Broker EOD</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Deadline Title</FL><input value={eodForm.title} onChange={e => setEodForm(f => ({ ...f, title: e.target.value }))} placeholder="All Ball Seed orders finalized" style={inputStyle()} /></div>
            <div><FL>Due Date</FL><input type="date" value={eodForm.dueDate} onChange={e => setEodForm(f => ({ ...f, dueDate: e.target.value }))} style={inputStyle()} /></div>
            <div><FL>Broker</FL><input value={eodForm.broker} onChange={e => setEodForm(f => ({ ...f, broker: e.target.value }))} placeholder="Ball Seed" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div><FL>Crop (optional)</FL><input value={eodForm.crop} onChange={e => setEodForm(f => ({ ...f, crop: e.target.value }))} placeholder="All" style={inputStyle()} /></div>
            <div><FL>Season</FL><input value={eodForm.season} onChange={e => setEodForm(f => ({ ...f, season: e.target.value }))} placeholder="Spring 2027" style={inputStyle()} /></div>
            <div><FL>Notes</FL><input value={eodForm.notes} onChange={e => setEodForm(f => ({ ...f, notes: e.target.value }))} placeholder="From broker rep" style={inputStyle()} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={saveEod} style={{ background: "#4a90d9", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>Save EOD</button>
            <button onClick={() => setShowNewEod(false)} style={{ background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Season Targets */}
      {seasons.map(([season, tgts]) => (
        <div key={season} style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 12 }}>{season}</div>
          <div style={{ display: "grid", gap: 10 }}>
            {tgts.map(t => {
              const progress = calcProgress(runs, t.metric);
              const days = daysUntil(t.targetDate);
              const color = statusColor(days, progress, t.targetPct);
              const metricLabel = METRICS.find(m => m.id === t.metric)?.label || t.metric;
              return (
                <div key={t.id} style={{ background: "#fff", border: `1.5px solid ${color}33`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: DARK }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "#7a8c74" }}>{metricLabel} — target {t.targetPct}% by {new Date(t.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color }}>{days > 0 ? days : 0}</div>
                      <div style={{ fontSize: 10, color: "#7a8c74" }}>{days > 0 ? "days left" : days === 0 ? "TODAY" : `${Math.abs(days)}d overdue`}</div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, background: "#e8ede4", borderRadius: 6, height: 10, overflow: "hidden", position: "relative" }}>
                      {/* Target marker */}
                      <div style={{ position: "absolute", left: `${t.targetPct}%`, top: 0, bottom: 0, width: 2, background: "#1e2d1a", zIndex: 1 }} />
                      <div style={{ background: color, height: "100%", borderRadius: 6, width: `${Math.min(progress, 100)}%`, transition: "width 0.4s ease" }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color, minWidth: 45, textAlign: "right" }}>{progress}%</div>
                  </div>
                  {t.notes && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>{t.notes}</div>}
                  <button onClick={() => removeTarget(t.id)} style={{ marginTop: 6, background: "none", border: "none", color: "#c8d8c0", fontSize: 11, cursor: "pointer", fontFamily: FONT, padding: 0 }}>Remove</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {seasons.length === 0 && !showNewTarget && (
        <div style={{ textAlign: "center", padding: 40, color: "#7a8c74", background: "#fafcf8", borderRadius: 16, border: "2px dashed #c8d8c0", marginBottom: 24 }}>
          No season targets yet. Click "+ Season Target" to set your first milestone.
        </div>
      )}

      {/* EODs Section */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 12 }}>Broker EODs</div>

        {activeEods.length === 0 && completedEods.length === 0 && !showNewEod && (
          <div style={{ textAlign: "center", padding: 32, color: "#7a8c74", background: "#fafcf8", borderRadius: 12, border: "2px dashed #c8d8c0" }}>
            No broker EODs set. Click "+ EOD" to add a deadline.
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {activeEods.map(eod => {
            const days = daysUntil(eod.dueDate);
            const color = days < 0 ? "#c03030" : days <= 3 ? "#c8791a" : days <= 7 ? "#4a90d9" : "#7a8c74";
            return (
              <div key={eod.id} onClick={() => toggleEod(eod)} style={{
                background: "#fff", border: `1.5px solid ${color}33`, borderLeft: `4px solid ${color}`,
                borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6, border: `2px solid ${color}`, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: DARK }}>{eod.title}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {eod.broker && `${eod.broker} · `}
                    {eod.crop && `${eod.crop} · `}
                    {new Date(eod.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color }}>{days > 0 ? days : 0}</div>
                  <div style={{ fontSize: 9, color: "#7a8c74" }}>{days > 0 ? "days" : days === 0 ? "TODAY" : "OVERDUE"}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); removeEod(eod.id); }} style={{ background: "none", border: "none", color: "#c8d8c0", fontSize: 14, cursor: "pointer" }}>x</button>
              </div>
            );
          })}
        </div>

        {completedEods.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#7a8c74", marginBottom: 6 }}>Completed</div>
            {completedEods.slice(0, 5).map(eod => (
              <div key={eod.id} onClick={() => toggleEod(eod)} style={{
                background: "#fafcf8", border: "1px solid #e8e8e0", borderRadius: 8,
                padding: "8px 14px", marginBottom: 4, cursor: "pointer", opacity: 0.6,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: ACCENT, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</div>
                <div style={{ flex: 1, fontSize: 13, color: DARK, textDecoration: "line-through" }}>{eod.title}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>{eod.broker}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SeasonDeadlines.jsx
git commit -m "feat: add SeasonDeadlines page with targets, progress bars, and broker EODs"
```

---

### Task 3: Wire into App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add import**

```javascript
import SeasonDeadlines from "./SeasonDeadlines";
```

- [ ] **Step 2: Add to Production nav group**

In the NAV_GROUPS production items array, add:

```javascript
{ id: "deadlines", label: "Deadlines" },
```

- [ ] **Step 3: Add page render**

In the page content section, add:

```javascript
{page === "deadlines" && <SeasonDeadlines />}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Deadlines page to Production nav"
```

---

## Chunk 2: Dashboard Widget

### Task 4: SeasonDeadlineWidget for PlannerHome

**Files:**
- Create: `src/SeasonDeadlineWidget.jsx`

- [ ] **Step 1: Create the widget**

A compact summary showing the next upcoming deadline, overall progress, and active EOD count. Clicking it navigates to the full Deadlines page.

```javascript
import React, { useMemo } from "react";
import { useSeasonTargets, usePlanningEods, useCropRuns } from "./supabase";

const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr + "T23:59:59") - new Date()) / 86400000);
}

function calcProgress(runs, metric) {
  if (!runs.length) return 0;
  let count = 0;
  if (metric === "created") count = runs.length;
  if (metric === "sourced") count = runs.filter(r => r.sourcingBroker || r.sourcingSupplier).length;
  if (metric === "ordered") count = runs.filter(r => ["ordered","confirmed","growing","propagating","outside","ready","shipped"].includes(r.status)).length;
  if (metric === "confirmed") count = runs.filter(r => ["confirmed","growing","propagating","outside","ready","shipped"].includes(r.status)).length;
  return Math.round((count / runs.length) * 100);
}

export default function SeasonDeadlineWidget({ onNavigate }) {
  const { rows: targets } = useSeasonTargets();
  const { rows: eods } = usePlanningEods();
  const { rows: runs } = useCropRuns();

  const activeEods = eods.filter(e => !e.completed);
  const overdueEods = activeEods.filter(e => daysUntil(e.dueDate) < 0).length;

  // Next upcoming target
  const nextTarget = useMemo(() => {
    const upcoming = targets
      .filter(t => daysUntil(t.targetDate) >= 0)
      .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
    return upcoming[0] || null;
  }, [targets]);

  const progress = nextTarget ? calcProgress(runs, nextTarget.metric) : null;
  const days = nextTarget ? daysUntil(nextTarget.targetDate) : null;
  const onTrack = progress !== null && nextTarget ? progress >= nextTarget.targetPct * 0.8 : true;

  if (!targets.length && !activeEods.length) return null;

  return (
    <div onClick={() => onNavigate("deadlines")} style={{
      background: onTrack ? "#fff" : "#fff8f0",
      border: `1.5px solid ${onTrack ? "#e0e8d8" : "#f0c080"}`,
      borderRadius: 14, padding: "16px 20px", cursor: "pointer",
      transition: "box-shadow 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>Season Progress</div>
        <div style={{ display: "flex", gap: 6 }}>
          {overdueEods > 0 && (
            <span style={{ background: "#fce8e8", color: "#c03030", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {overdueEods} overdue
            </span>
          )}
          {activeEods.length > 0 && (
            <span style={{ background: "#e8f4f8", color: "#2e7d9e", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
              {activeEods.length} EOD{activeEods.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {nextTarget && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: "#7a8c74" }}>{nextTarget.season} — {nextTarget.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: days <= 7 ? "#c03030" : days <= 30 ? "#c8791a" : "#7a8c74" }}>
              {days}d left
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, background: "#e8ede4", borderRadius: 5, height: 8, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: `${nextTarget.targetPct}%`, top: 0, bottom: 0, width: 2, background: "#1e2d1a", zIndex: 1 }} />
              <div style={{ background: onTrack ? ACCENT : "#c8791a", height: "100%", borderRadius: 5, width: `${Math.min(progress, 100)}%`, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: onTrack ? ACCENT : "#c8791a", minWidth: 40, textAlign: "right" }}>{progress}%</div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SeasonDeadlineWidget.jsx
git commit -m "feat: add SeasonDeadlineWidget for PlannerHome dashboard"
```

---

### Task 5: Add widget to PlannerHome

**Files:**
- Modify: `src/PlannerHome.jsx`

- [ ] **Step 1: Add import**

At top of PlannerHome.jsx:

```javascript
import SeasonDeadlineWidget from "./SeasonDeadlineWidget";
```

- [ ] **Step 2: Add widget render**

In the PlannerHome return, after the alerts section and before the upcoming milestones, add:

```javascript
<SeasonDeadlineWidget onNavigate={onNavigate} />
```

Add a small spacer div with `marginBottom: 16` around it.

- [ ] **Step 3: Commit**

```bash
git add src/PlannerHome.jsx
git commit -m "feat: add season deadline widget to PlannerHome dashboard"
```
