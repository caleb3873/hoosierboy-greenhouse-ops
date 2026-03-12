import { useState, useEffect } from "react";
import { useCropRuns, useFlags, useManualTasks, useContainers, useHouses, usePads } from "./supabase";

// ── HELPERS ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "gh_meeting_notes_v1";

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
function MeetingNotes() {
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });
  const [view, setView] = useState("list"); // list | new | detail
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ title: "", body: "", actionItems: [], tags: [] });
  const [newAction, setNewAction] = useState("");
  const [filterTag, setFilterTag] = useState("all");

  const save = (n) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
    setNotes(n);
  };

  const allTags = [...new Set(notes.flatMap(n => n.tags || []))].sort();
  const { week: nowW, year: nowY } = nowWeekYear();

  function startNew() {
    setForm({ title: `Week ${nowW} Meeting — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, body: "", actionItems: [], tags: [], date: new Date().toISOString() });
    setEditId(null);
    setView("new");
  }

  function startEdit(note) {
    setForm({ ...note });
    setEditId(note.id);
    setView("new");
  }

  function saveNote() {
    if (!form.title.trim()) return;
    const id = editId || crypto.randomUUID();
    const updated = editId
      ? notes.map(n => n.id === editId ? { ...form, id } : n)
      : [{ ...form, id, date: form.date || new Date().toISOString() }, ...notes];
    save(updated);
    setView("list");
    setEditId(null);
  }

  function deleteNote(id) {
    if (!window.confirm("Delete this meeting note?")) return;
    save(notes.filter(n => n.id !== id));
  }

  function addAction() {
    if (!newAction.trim()) return;
    setForm(f => ({ ...f, actionItems: [...(f.actionItems || []), { id: crypto.randomUUID(), text: newAction.trim(), done: false }] }));
    setNewAction("");
  }

  function toggleAction(aid) {
    setForm(f => ({ ...f, actionItems: f.actionItems.map(a => a.id === aid ? { ...a, done: !a.done } : a) }));
  }

  function removeAction(aid) {
    setForm(f => ({ ...f, actionItems: f.actionItems.filter(a => a.id !== aid) }));
  }

  // Toggle action done in list view (without editing full note)
  function toggleActionInList(noteId, actionId) {
    const updated = notes.map(n => n.id !== noteId ? n : {
      ...n, actionItems: n.actionItems.map(a => a.id === actionId ? { ...a, done: !a.done } : a)
    });
    save(updated);
  }

  const TAG_OPTIONS = ["transplant", "order", "labor", "quality", "variety", "schedule", "equipment", "other"];

  const filtered = notes.filter(n => filterTag === "all" || (n.tags || []).includes(filterTag));

  const IS = { padding: "10px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#1e2d1a", width: "100%", outline: "none", boxSizing: "border-box" };

  if (view === "new") return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#7a8c74", fontSize: 22, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>{editId ? "Edit Meeting Notes" : "New Meeting Notes"}</div>
      </div>

      <div style={S.card}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Meeting Title</div>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={IS} placeholder="e.g. Week 18 Production Meeting" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TAG_OPTIONS.map(t => {
              const on = (form.tags || []).includes(t);
              return (
                <button key={t} onClick={() => setForm(f => ({ ...f, tags: on ? f.tags.filter(x => x !== t) : [...(f.tags||[]), t] }))}
                  style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${on ? "#7fb069" : "#c8d8c0"}`, background: on ? "#f0f8eb" : "#fff", color: on ? "#2e5c1e" : "#7a8c74", fontWeight: on ? 700 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Notes</div>
          <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            style={{ ...IS, minHeight: 160, resize: "vertical", lineHeight: 1.6 }}
            placeholder="What was discussed? Any decisions made? Key observations from the floor..." />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>Action Items</div>
          {(form.actionItems || []).map(a => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input type="checkbox" checked={a.done} onChange={() => toggleAction(a.id)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#7fb069" }} />
              <span style={{ flex: 1, fontSize: 13, color: a.done ? "#aabba0" : "#1e2d1a", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</span>
              <button onClick={() => removeAction(a.id)} style={{ background: "none", border: "none", color: "#aabba0", fontSize: 16, cursor: "pointer", padding: "0 4px" }}>×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={newAction} onChange={e => setNewAction(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addAction()}
              style={{ ...IS, flex: 1 }} placeholder="Add action item... (press Enter)" />
            <button onClick={addAction} style={{ padding: "10px 16px", borderRadius: 10, background: "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={saveNote} style={{ flex: 1, padding: 13, borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
          {editId ? "Save Changes" : "Save Meeting Notes"}
        </button>
        <button onClick={() => setView("list")} style={{ padding: "13px 20px", borderRadius: 10, background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16, color: "#1e2d1a" }}>Meeting Notes</div>
        <button onClick={startNew} style={{ padding: "9px 18px", borderRadius: 10, background: "#1e2d1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>+ New Meeting</button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {["all", ...allTags].map(t => (
            <button key={t} onClick={() => setFilterTag(t)}
              style={{ padding: "4px 12px", borderRadius: 20, border: `1.5px solid ${filterTag === t ? "#7fb069" : "#c8d8c0"}`, background: filterTag === t ? "#f0f8eb" : "#fff", color: filterTag === t ? "#2e5c1e" : "#7a8c74", fontWeight: filterTag === t ? 700 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
          <div style={{ fontWeight: 700, color: "#1e2d1a", marginBottom: 6 }}>No meeting notes yet</div>
          <div style={{ color: "#7a8c74", fontSize: 13, marginBottom: 20 }}>Start logging your weekly production meetings</div>
          <button onClick={startNew} style={{ padding: "10px 22px", borderRadius: 10, background: "#7fb069", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Start First Meeting</button>
        </div>
      ) : (
        filtered.map(note => {
          const openActions = (note.actionItems || []).filter(a => !a.done);
          const doneActions = (note.actionItems || []).filter(a => a.done);
          return (
            <div key={note.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: note.body || note.actionItems?.length ? 12 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "#1e2d1a" }}>{note.title}</div>
                  <div style={{ fontSize: 12, color: "#aabba0", marginTop: 2 }}>
                    {new Date(note.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </div>
                  {(note.tags || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {note.tags.map(t => <span key={t} style={S.pill("#7a8c74", "#f0f5ee")}>{t}</span>)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => startEdit(note)} style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", background: "#fff", color: "#7a8c74", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                  <button onClick={() => deleteNote(note.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #f0d0c0", background: "#fff", color: "#e07b39", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                </div>
              </div>

              {note.body && (
                <div style={{ fontSize: 13, color: "#4a5a40", lineHeight: 1.65, whiteSpace: "pre-wrap", background: "#f8faf6", borderRadius: 8, padding: "10px 14px", marginBottom: note.actionItems?.length ? 12 : 0 }}>
                  {note.body}
                </div>
              )}

              {(note.actionItems || []).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>
                    Action Items · <span style={{ color: openActions.length > 0 ? "#c8791a" : "#7fb069" }}>{openActions.length} open</span>
                    {doneActions.length > 0 && <span style={{ color: "#aabba0" }}> · {doneActions.length} done</span>}
                  </div>
                  {note.actionItems.map(a => (
                    <div key={a.id} onClick={() => toggleActionInList(note.id, a.id)}
                      style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", cursor: "pointer" }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${a.done ? "#7fb069" : "#c8d8c0"}`, background: a.done ? "#7fb069" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {a.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: a.done ? "#aabba0" : "#1e2d1a", textDecoration: a.done ? "line-through" : "none" }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}
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
