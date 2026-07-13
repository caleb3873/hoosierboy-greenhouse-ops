import { useState, useEffect } from "react";
import { useCropRuns, useFlags, useManualTasks, useContainers, useHouses, usePads, useMeetings } from "./supabase";

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function weekLabel(week, year) {
  // Get Monday of that week
  const jan4 = new Date(year, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function subtractWeeks(week, year, n) {
  let w = week - n, y = year;
  while (w < 1) { w += 52; y--; }
  return { week: w, year: y };
}

function addWeeks(week, year, n) {
  let w = week + n, y = year;
  while (w > 52) { w -= 52; y++; }
  return { week: w, year: y };
}

function scheduleFor(run) {
  const { targetWeek, targetYear, weeksProp, weeksIndoor, weeksOutdoor } = run;
  if (!targetWeek || !targetYear) return null;
  const tw = Number(targetWeek), ty = Number(targetYear);
  const totalFinish = (Number(weeksIndoor) || 0) + (Number(weeksOutdoor) || 0);
  const propWks = Number(weeksProp) || 0;
  const transplant = subtractWeeks(tw, ty, totalFinish);
  const seed = propWks > 0 ? subtractWeeks(transplant.week, transplant.year, propWks) : null;
  const moveOut = weeksOutdoor > 0 ? subtractWeeks(tw, ty, Number(weeksOutdoor)) : null;
  return { transplant, seed, moveOut, ready: { week: tw, year: ty } };
}

function nowWeekYear() {
  const now = new Date();
  return { week: getWeekNumber(now), year: now.getFullYear() };
}

function weeksFrom(week, year, nowW, nowY) {
  return (year - nowY) * 52 + (week - nowW);
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  card: { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 14 },
  sectionHead: { fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2, textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8", paddingBottom: 8, marginBottom: 14, marginTop: 4 },
  pill: (color, bg) => ({ background: bg, color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, display: "inline-block" }),
  row: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #f0f5ee" },
};

function StatusPill({ status }) {
  const map = {
    planned:     ["#4a90d9", "#e8f2fc"],
    propagating: ["#8e44ad", "#f5f0ff"],
    transplanted:["#c8791a", "#fff4e8"],
    finishing:   ["#2e7d9e", "#e8f4f8"],
    ready:       ["#4a7a35", "#e8f5e0"],
    shipped:     ["#7a8c74", "#f0f5ee"],
  };
  const [c, bg] = map[status] || ["#7a8c74", "#f0f5ee"];
  return <span style={S.pill(c, bg)}>{status}</span>;
}

function WeekBadge({ diff }) {
  const abs = Math.abs(diff);
  let color = "#7a8c74", bg = "#f0f5ee", label = "";
  if (diff < 0)      { color = "#d94f3d"; bg = "#fde8e8"; label = `${abs}w overdue`; }
  else if (diff === 0) { color = "#c8791a"; bg = "#fff4e8"; label = "This week"; }
  else if (diff <= 2)  { color = "#c8791a"; bg = "#fff4e8"; label = `${diff}w away`; }
  else if (diff <= 4)  { color = "#2e7d9e"; bg = "#e8f4f8"; label = `${diff}w away`; }
  else               { color = "#7a8c74"; bg = "#f0f5ee"; label = `Wk ${diff} away`; }
  return <span style={S.pill(color, bg)}>{label}</span>;
}

// ── PREP SHEET ────────────────────────────────────────────────────────────────
function PrepSheet({ runs, flags, tasks, containers, houses, pads }) {
  const { week: nowW, year: nowY } = nowWeekYear();
  const LOOK_AHEAD = 3; // weeks

  // ── Categorize crop runs ──────────────────────────────────────────────────
  const withSched = runs.map(r => ({ ...r, sched: scheduleFor(r) })).filter(r => r.sched);

  // Due to transplant this week or next 2
  const transplantDue = withSched.filter(r => {
    const { week, year } = r.sched.transplant;
    const diff = weeksFrom(week, year, nowW, nowY);
    return diff >= -1 && diff <= LOOK_AHEAD && r.status === "planned";
  }).sort((a, b) => weeksFrom(a.sched.transplant.week, a.sched.transplant.year, nowW, nowY)
                  - weeksFrom(b.sched.transplant.week, b.sched.transplant.year, nowW, nowY));

  // Move outside due soon
  const moveOutDue = withSched.filter(r => {
    if (!r.sched.moveOut) return false;
    const { week, year } = r.sched.moveOut;
    const diff = weeksFrom(week, year, nowW, nowY);
    return diff >= -1 && diff <= LOOK_AHEAD && r.status !== "shipped";
  });

  // Ready / shipping soon
  const readySoon = withSched.filter(r => {
    const { week, year } = r.sched.ready;
    const diff = weeksFrom(week, year, nowW, nowY);
    return diff >= -1 && diff <= LOOK_AHEAD + 1 && r.status !== "shipped";
  }).sort((a, b) => weeksFrom(a.sched.ready.week, a.sched.ready.year, nowW, nowY)
                  - weeksFrom(b.sched.ready.week, b.sched.ready.year, nowW, nowY));

  // Behind schedule — transplant already passed but status still planned
  const behind = withSched.filter(r => {
    const diff = weeksFrom(r.sched.transplant.week, r.sched.transplant.year, nowW, nowY);
    return diff < -1 && r.status === "planned";
  });

  // Open flags
  const openFlags = (flags || []).filter(f => !f.resolved);

  // Open tasks
  const openTasks = (tasks || []).filter(t => !t.completedAt);

  const getContainer = id => containers.find(c => c.id === id);

  function RunRow({ run, dateKey, label }) {
    const sched = run.sched;
    const { week, year } = sched[dateKey] || sched.ready;
    const diff = weeksFrom(week, year, nowW, nowY);
    const container = getContainer(run.containerId);
    return (
      <div style={S.row}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {run.cropName}
            {run.varieties?.length > 0 && <span style={{ fontWeight: 400, color: "#7a8c74", fontSize: 12 }}> · {run.varieties.map(v => v.color || v.name).filter(Boolean).join(", ")}</span>}
          </div>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>
            {container && <span>{container.name} · </span>}
            {run.cases && <span>{run.cases} cases · </span>}
            <span>Wk {week} ({weekLabel(week, year)})</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <StatusPill status={run.status} />
          <WeekBadge diff={diff} />
        </div>
      </div>
    );
  }

  const Section = ({ title, icon, items, dateKey, emptyMsg, accentColor = "#7fb069" }) => (
    <div style={{ ...S.card, borderLeft: `4px solid ${accentColor}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{title}</span>
        <span style={{ marginLeft: "auto", background: accentColor + "22", color: accentColor, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{items.length}</span>
      </div>
      {items.length === 0
        ? <div style={{ color: "#aabba0", fontSize: 13, padding: "8px 0" }}>{emptyMsg}</div>
        : items.map(r => <RunRow key={r.id} run={r} dateKey={dateKey} />)
      }
    </div>
  );

  return (
    <div>
      {/* Week header */}
      <div style={{ background: "#1e2d1a", borderRadius: 14, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7fb069", letterSpacing: 1, textTransform: "uppercase" }}>Week {nowW} · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginTop: 4 }}>Production Meeting Prep</div>
          <div style={{ fontSize: 13, color: "#6a8a5a", marginTop: 2 }}>Showing activity for weeks {nowW - 1}–{nowW + LOOK_AHEAD}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {behind.length > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 900, color: "#e87070" }}>{behind.length}</div><div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase", letterSpacing: .8 }}>Behind</div></div>}
          {openFlags.length > 0 && <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 900, color: "#e8a030" }}>{openFlags.length}</div><div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase", letterSpacing: .8 }}>Flags</div></div>}
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 900, color: "#7fb069" }}>{readySoon.length}</div><div style={{ fontSize: 10, color: "#aabba0", textTransform: "uppercase", letterSpacing: .8 }}>Shipping</div></div>
        </div>
      </div>

      {/* Behind schedule — show first if any */}
      {behind.length > 0 && (
        <div style={{ ...S.card, borderLeft: "4px solid #d94f3d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#d94f3d" }}>Behind Schedule</span>
            <span style={{ marginLeft: "auto", background: "#fde8e8", color: "#d94f3d", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{behind.length}</span>
          </div>
          <div style={{ fontSize: 12, color: "#d94f3d", marginBottom: 10 }}>These runs missed their transplant window — needs decision</div>
          {behind.map(r => <RunRow key={r.id} run={r} dateKey="transplant" />)}
        </div>
      )}

      {/* Open flags */}
      {openFlags.length > 0 && (
        <div style={{ ...S.card, borderLeft: "4px solid #e8a030" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🚩</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>Open Floor Flags</span>
            <span style={{ marginLeft: "auto", background: "#fff4e8", color: "#e8a030", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{openFlags.length}</span>
          </div>
          {openFlags.map(f => (
            <div key={f.id} style={S.row}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{f.title || f.description || "Flag"}</div>
                {f.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{f.notes}</div>}
                {f.createdAt && <div style={{ fontSize: 11, color: "#aabba0", marginTop: 2 }}>{new Date(f.createdAt).toLocaleDateString()}</div>}
              </div>
              <span style={S.pill("#e8a030", "#fff4e8")}>{f.category || "flag"}</span>
            </div>
          ))}
        </div>
      )}

      <Section title="Transplanting This Week / Next 3 Weeks" icon="🪴" items={transplantDue} dateKey="transplant" emptyMsg="Nothing due to transplant soon — you're in good shape." accentColor="#8e44ad" />
      <Section title="Moving Outside Soon" icon="🌤" items={moveOutDue} dateKey="moveOut" emptyMsg="No move-outs scheduled in the next 3 weeks." accentColor="#2e7d9e" />
      <Section title="Ready / Shipping Soon" icon="✅" items={readySoon} dateKey="ready" emptyMsg="Nothing ready to ship in the next few weeks." accentColor="#4a7a35" />

      {/* Open tasks */}
      {openTasks.length > 0 && (
        <div style={{ ...S.card, borderLeft: "4px solid #7a8c74" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>📋</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>Open Tasks</span>
            <span style={{ marginLeft: "auto", background: "#f0f5ee", color: "#7a8c74", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 800 }}>{openTasks.length}</span>
          </div>
          {openTasks.slice(0, 8).map(t => (
            <div key={t.id} style={S.row}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1e2d1a" }}>{t.title || t.description}</div>
                {t.assignedTo && <div style={{ fontSize: 12, color: "#7a8c74" }}>→ {t.assignedTo}</div>}
              </div>
              {t.dueDate && <span style={S.pill("#7a8c74", "#f0f5ee")}>{new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NOTES ─────────────────────────────────────────────────────────────────────
const MEETING_TEMPLATES = {
  "Blank": "",
  "Tissue Culture lab (vendor)": `GOAL: leave knowing (1) their business model, (2) what it takes to build & run a TC area here, (3) economics — cost per liner in-house vs. buying.

PIN DOWN FIRST
- What are they offering? Turnkey lab design/build · sell us initiated cultures we multiply · sell finished plantlets we just acclimatize · license/partnership?
- Do they provide mother stock / explants, or do we source them?

VARIETIES & IP
- Which of our crops are good TC candidates? (houseplants / aroids, perennials, mums, poinsettias?)
- Licensing / royalties on patented varieties — what can we legally micropropagate?

FACILITY BUILD-OUT
- Rooms + sq ft: media prep · transfer room (laminar flow hoods) · growth room · acclimatization greenhouse
- Clean room: HEPA / positive pressure / sterilizable surfaces / flooring
- Utilities: power load · RO/DI water · drainage · HVAC temp + humidity

EQUIPMENT & COST
- Laminar flow hoods (how many for our volume?) · autoclave · media prep (balance, pH, stirrers, dispenser) · growth-room shelving + LED lighting · glassware / washing
- Capital cost for the equipment package

PROCESS & THROUGHPUT
- Stages: initiation → multiplication → rooting → acclimatization; time per stage
- Throughput (plantlets/week per footprint); what volume justifies a lab?
- Contamination rate + sterility / QC protocols

ACCLIMATIZATION (where losses happen)
- Weaning in-vitro plantlets into our greenhouse: humidity / fog, hardening, expected survival %

CONSUMABLES (recurring)
- Media (MS salts, sucrose, agar), PGRs (cytokinins / auxins), vessels, PPM — cost per plantlet

LABOR & TRAINING
- Skilled labor / sterile technique; who runs it; vendor training + ongoing support

ECONOMICS & DECISION
- Capex to build · cost/liner in-house vs. buying · breakeven volume · ROI timeline
- MOQs, lead times, support contract`,
  "Broker / supplier": `- Availability & confirmations for our list
- Pricing / minimums / lead times
- Substitution policy
- Ship windows & freight
- New varieties worth trying`,
  "Weekly production": `- Transplanting / shipping this week
- Crops behind or needing attention
- Sourcing gaps / confirmations needed
- Labor & space
- Decisions needed`,
};

// Tiny, safe markdown renderer (no deps, no dangerouslySetInnerHTML) for meeting notes:
// "## heading", "# heading", "- bullet" / "• bullet", and inline **bold**.
export function FormattedNotes({ text, style }) {
  const inline = (s, key) => String(s).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong> : <span key={`${key}-${i}`}>{p}</span>);
  const out = []; let bullets = null;
  const flush = (k) => { if (bullets) { out.push(<ul key={`ul-${k}`} style={{ margin: "2px 0 8px", paddingLeft: 20 }}>{bullets}</ul>); bullets = null; } };
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (l.startsWith("## ")) { flush(i); out.push(<div key={i} style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a", margin: "12px 0 4px" }}>{inline(l.slice(3), i)}</div>); }
    else if (l.startsWith("# ")) { flush(i); out.push(<div key={i} style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", margin: "14px 0 6px" }}>{inline(l.slice(2), i)}</div>); }
    else if (l.startsWith("- ") || l.startsWith("• ")) { (bullets = bullets || []).push(<li key={i} style={{ fontSize: 13, color: "#3a4a34", lineHeight: 1.5, marginBottom: 2 }}>{inline(l.slice(2), i)}</li>); }
    else if (!l) { flush(i); }
    else { flush(i); out.push(<div key={i} style={{ fontSize: 13, color: "#3a4a34", lineHeight: 1.5, marginBottom: 6 }}>{inline(l, i)}</div>); }
  });
  flush("end");
  return <div style={style}>{out}</div>;
}

function MeetingNotes() {
  const { rows: meetings, upsert, remove } = useMeetings();
  const [view, setView] = useState("list"); // list | edit
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [newAction, setNewAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [sumErr, setSumErr] = useState(null);

  const IS = { padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1e2d1a", width: "100%", outline: "none", boxSizing: "border-box" };
  const LBL = { fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 };
  const todayStr = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  function startNew() {
    setForm({ title: `Meeting — ${todayStr()}`, meetingDate: new Date().toISOString().slice(0, 10), type: "", attendees: "", agenda: "", transcript: "", summary: "", notes: "", actionItems: [], tags: [] });
    setEditId(null); setSumErr(null); setView("edit");
  }
  function openMeeting(m) {
    setForm({ title: m.title || "", meetingDate: m.meetingDate || new Date().toISOString().slice(0, 10), type: m.type || "", attendees: m.attendees || "", agenda: m.agenda || "", transcript: m.transcript || "", summary: m.summary || "", notes: m.notes || "", actionItems: m.actionItems || [], tags: m.tags || [] });
    setEditId(m.id); setSumErr(null); setView("edit");
  }
  async function saveMeeting() {
    if (!form.title.trim()) return;
    setBusy(true);
    try { await upsert({ ...form, id: editId || crypto.randomUUID() }); setView("list"); setEditId(null); }
    catch (e) { alert("Save failed: " + e.message); }
    finally { setBusy(false); }
  }
  async function deleteMeeting(id) {
    if (!window.confirm("Delete this meeting?")) return;
    await remove(id);
  }
  function applyTemplate(name) {
    const t = MEETING_TEMPLATES[name] || "";
    const guessType = name.indexOf("Tissue") >= 0 ? "Vendor / Setup" : name.indexOf("Broker") >= 0 ? "Broker" : name.indexOf("Weekly") >= 0 ? "Production" : "";
    setForm(f => ({ ...f, agenda: t, type: f.type || guessType }));
  }
  async function summarize() {
    if (!form.transcript || !form.transcript.trim()) { setSumErr("Paste the Teams transcript (or your notes) first."); return; }
    setBusy(true); setSumErr(null);
    try {
      const r = await fetch("/api/meeting-summary", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: form.transcript, agenda: form.agenda, title: form.title }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "failed");
      setForm(f => ({ ...f, summary: data.summary }));
    } catch (e) { setSumErr(e.message || "summary failed"); }
    finally { setBusy(false); }
  }
  function addAction() {
    if (!newAction.trim()) return;
    setForm(f => ({ ...f, actionItems: [...(f.actionItems || []), { id: crypto.randomUUID(), text: newAction.trim(), done: false }] }));
    setNewAction("");
  }
  function toggleAction(aid) { setForm(f => ({ ...f, actionItems: f.actionItems.map(a => a.id === aid ? { ...a, done: !a.done } : a) })); }
  function removeAction(aid) { setForm(f => ({ ...f, actionItems: f.actionItems.filter(a => a.id !== aid) })); }

  if (view === "edit" && form) return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <button onClick={() => { setView("list"); setEditId(null); }} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{editId ? "Meeting" : "New Meeting"}</div>
      </div>

      <div style={S.card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 12, marginBottom: 14 }}>
          <div><div style={LBL}>Title</div><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} /></div>
          <div><div style={LBL}>Date</div><input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} style={IS} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div><div style={LBL}>Type</div>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={IS}>
              <option value="">—</option><option>Vendor / Setup</option><option>Broker</option><option>Breeder / Trade Show</option><option>Production</option><option>Internal</option><option>Other</option>
            </select>
          </div>
          <div><div style={LBL}>Attendees</div><input value={form.attendees} onChange={e => setForm(f => ({ ...f, attendees: e.target.value }))} style={IS} placeholder="who was there" /></div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={LBL}>Notes <span style={{ fontWeight: 400, textTransform: "none", color: "#aabba0" }}>· formatted — <code>##</code> heading · <code>-</code> bullet · <code>**bold**</code></span></div>
          <textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ ...IS, minHeight: 200, resize: "vertical", lineHeight: 1.5, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}
            placeholder={"## Salvia — best fit\n- **Midnight** — good for quarts · wk 16\n- **Salute** — great for combos, heavy pollinator traffic"} />
          {(form.notes || "").trim() && (
            <div style={{ marginTop: 8, border: "1.5px solid #e0ead8", borderRadius: 10, padding: "8px 14px 12px", background: "#fbfdfa" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#aabba0", textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>Preview</div>
              <FormattedNotes text={form.notes} />
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={LBL}>Agenda / prep — load a template</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {Object.keys(MEETING_TEMPLATES).map(n => (
              <button key={n} onClick={() => applyTemplate(n)} style={{ padding: "5px 12px", borderRadius: 16, border: "1.5px solid #c8d8c0", background: "#fff", color: "#4a6a3a", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{n}</button>
            ))}
          </div>
          <textarea value={form.agenda} onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))} style={{ ...IS, minHeight: 120, resize: "vertical", lineHeight: 1.5 }} placeholder="Agenda / questions to ask…" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={LBL}>Transcript / raw notes</div>
          <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 6 }}>Turn on live transcription in Teams, then paste the transcript here after the call — or jot notes live.</div>
          <textarea value={form.transcript} onChange={e => setForm(f => ({ ...f, transcript: e.target.value }))} style={{ ...IS, minHeight: 140, resize: "vertical", lineHeight: 1.5 }} placeholder="Paste transcript or type notes…" />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <button onClick={summarize} disabled={busy} style={{ padding: "9px 16px", borderRadius: 10, background: busy ? "#cdd" : "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Summarizing…" : "✨ Summarize with AI"}</button>
            {sumErr && <span style={{ color: "#c03030", fontSize: 12 }}>⚠️ {sumErr}</span>}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={LBL}>Summary (AI — editable)</div>
          <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} style={{ ...IS, minHeight: 160, resize: "vertical", lineHeight: 1.6, background: "#f8faf6" }} placeholder="Click ✨ Summarize, or write your own…" />
        </div>

        <div>
          <div style={LBL}>Action items</div>
          {(form.actionItems || []).map(a => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#7fb069" }} />
              <span style={{ flex: 1, fontSize: 13, color: a.done ? "#aabba0" : "#1e2d1a", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</span>
              <button onClick={() => removeAction(a.id)} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 16, cursor: "pointer" }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={newAction} onChange={e => setNewAction(e.target.value)} onKeyDown={e => e.key === "Enter" && addAction()} style={{ ...IS, flex: 1 }} placeholder="Add action item… (Enter)" />
            <button onClick={addAction} style={{ padding: "10px 16px", borderRadius: 10, background: "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={saveMeeting} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>{editId ? "Save Changes" : "Save Meeting"}</button>
        <button onClick={() => { setView("list"); setEditId(null); }} style={{ padding: "13px 20px", borderRadius: 10, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );

  // LIST
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>Meeting Notes</div>
        <button onClick={startNew} style={{ padding: "9px 18px", borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>+ New Meeting</button>
      </div>

      {(!meetings || meetings.length === 0) ? (
        <div style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
          <div style={{ fontWeight: 700, color: "#1e2d1a", marginBottom: 6 }}>No meetings yet</div>
          <div style={{ color: "#7a8c74", fontSize: 13, marginBottom: 20 }}>Start a meeting, load a template, capture notes, and summarize.</div>
          <button onClick={startNew} style={{ padding: "10px 22px", borderRadius: 10, background: "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Start a Meeting</button>
        </div>
      ) : (
        meetings.map(m => {
          const open = (m.actionItems || []).filter(a => !a.done).length;
          return (
            <div key={m.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => openMeeting(m)}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: "#aabba0", marginTop: 2 }}>
                    {m.meetingDate ? new Date(m.meetingDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }) : ""}
                    {m.type ? ` · ${m.type}` : ""}{m.attendees ? ` · ${m.attendees}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openMeeting(m)} style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Open</button>
                  <button onClick={() => deleteMeeting(m.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #f0d0c0", background: "#fff", color: "#e07b39", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                </div>
              </div>
              {m.summary && (
                <div style={{ fontSize: 13, color: "#4a5a40", lineHeight: 1.6, whiteSpace: "pre-wrap", background: "#f8faf6", borderRadius: 8, padding: "10px 14px", marginTop: 10, maxHeight: 220, overflow: "hidden" }}>
                  {m.summary.length > 600 ? m.summary.slice(0, 600) + "…" : m.summary}
                </div>
              )}
              {m.notes && (
                <div onClick={() => openMeeting(m)} style={{ marginTop: 10, cursor: "pointer", background: "#fbfdfa", border: "1px solid #e0ead8", borderRadius: 8, padding: "4px 14px 10px", maxHeight: 300, overflow: "hidden", position: "relative" }}>
                  <FormattedNotes text={m.notes} />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 44, background: "linear-gradient(transparent, #fbfdfa)" }} />
                </div>
              )}
              {open > 0 && <div style={{ fontSize: 12, color: "#c8791a", fontWeight: 700, marginTop: 8 }}>{open} open action item{open === 1 ? "" : "s"}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}


// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export default function Meetings() {
  const { rows: runs }  = useCropRuns();
  const { rows: flags } = useFlags();
  const { rows: tasks } = useManualTasks();
  const { rows: containers } = useContainers();
  const { rows: houses } = useHouses();
  const { rows: pads }  = usePads();

  const [tab, setTab] = useState("prep"); // prep | notes

  const TAB_BTN = (id, label, icon) => (
    <button key={id} onClick={() => setTab(id)}
      style={{ padding: "10px 22px", borderRadius: 10, border: `2px solid ${tab === id ? "#1e2d1a" : "#c8d8c0"}`, background: tab === id ? "#1e2d1a" : "#fff", color: tab === id ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 7 }}>
      <span>{icon}</span> {label}
    </button>
  );

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: "#1e2d1a", marginBottom: 4 }}>Meetings</div>
        <div style={{ fontSize: 14, color: "#7a8c74" }}>Weekly production meeting prep and notes</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {TAB_BTN("prep",  "Prep Sheet", "📊")}
        {TAB_BTN("notes", "Notes & Actions", "📝")}
      </div>

      {tab === "prep"  && <PrepSheet runs={runs} flags={flags} tasks={tasks} containers={containers} houses={houses} pads={pads} />}
      {tab === "notes" && <MeetingNotes />}
    </div>
  );
}
