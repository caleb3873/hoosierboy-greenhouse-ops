// House Detail page — opens when a facility is picked from the maintenance
// Houses tab. Three sections:
//   1. Equipment register (heaters, fans, irrigation, etc.) with last-checked
//      derived from completed tasks linked to each equipment row.
//   2. Quick Actions — dynamic buttons keyed off equipment kinds present.
//      "Check all heaters" creates one task per heater (per spec).
//   3. New Task form — title (with voice), notes, tools/materials, assignee.
//      Auto-tags facility; optionally also tags equipment_id when triggered
//      from a per-equipment "Inspect" button.
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useFacilityEquipment, useManagerTasks } from "./supabase";
import { useAuth } from "./Auth";
import { facilityLabel } from "./Facilities";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

// Equipment kinds with their visual identity + which quick-action button they
// generate. The "qa" label is the text on the "Check all X" button.
export const EQUIPMENT_KINDS = [
  { id: "heater",    label: "Heater",        emoji: "🔥", qa: "heaters",     defaultName: "Heater" },
  { id: "fan",       label: "Fan / Exhaust", emoji: "💨", qa: "fans",        defaultName: "Fan" },
  { id: "irrigation",label: "Irrigation",    emoji: "💧", qa: "irrigation",  defaultName: "Irrigation" },
  { id: "electrical",label: "Electrical",    emoji: "⚡", qa: "electrical",  defaultName: "Panel" },
  { id: "hvac",      label: "HVAC / Thermo", emoji: "🌡", qa: "HVAC",        defaultName: "Thermostat" },
  { id: "plumbing",  label: "Plumbing",      emoji: "🚿", qa: "plumbing",    defaultName: "Plumbing" },
  { id: "structural",label: "Structural",    emoji: "🪟", qa: "doors/vents", defaultName: "Vent" },
  { id: "other",     label: "Other",         emoji: "🔩", qa: "items",       defaultName: "Item" },
];
const KIND_BY_ID = Object.fromEntries(EQUIPMENT_KINDS.map(k => [k.id, k]));

// Gerry handles maintenance day-to-day, so all maintenance tasks default to
// him. Managers can reassign via the picker if needed.
const DEFAULT_MAINTENANCE_ASSIGNEE = "Gerry";

function fmtDate(d) {
  if (!d) return "never";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HouseDetail({ facilityId, assignees, isTyler, currentUserName, onBack }) {
  const { rows: allEquipment, upsert: upsertEquipment, remove: removeEquipment } = useFacilityEquipment();
  const { rows: allTasks, upsert: upsertTask } = useManagerTasks();

  const equipment = useMemo(() =>
    (allEquipment || [])
      .filter(e => e.facilityId === facilityId)
      .sort((a, b) => (KIND_BY_ID[a.kind]?.label || "z").localeCompare(KIND_BY_ID[b.kind]?.label || "z") || (a.name || "").localeCompare(b.name || "")),
    [allEquipment, facilityId]
  );

  // For each equipment, find the most recent completed task that referenced it
  const lastCheckedByEquip = useMemo(() => {
    const m = new Map();
    for (const t of (allTasks || [])) {
      if (t.status !== "completed" || !t.equipmentId) continue;
      const prev = m.get(t.equipmentId);
      const ts = t.completedAt || t.completed_at;
      if (!prev || new Date(ts) > new Date(prev.ts)) m.set(t.equipmentId, { ts, by: t.completedBy });
    }
    return m;
  }, [allTasks]);

  // Quick-action button per kind that exists in this house
  const presentKinds = useMemo(() => {
    const set = new Set(equipment.map(e => e.kind));
    return EQUIPMENT_KINDS.filter(k => set.has(k.id));
  }, [equipment]);

  return (
    <div style={{ ...FONT, padding: "12px 14px 100px", background: "#f2f5ef" }}>
      <EquipmentSection
        facilityId={facilityId}
        equipment={equipment}
        lastCheckedByEquip={lastCheckedByEquip}
        upsertEquipment={upsertEquipment}
        removeEquipment={removeEquipment}
        upsertTask={upsertTask}
        currentUserName={currentUserName}
        assignees={assignees}
        allTasks={allTasks}
      />

      <QuickActions
        facilityId={facilityId}
        equipment={equipment}
        presentKinds={presentKinds}
        upsertTask={upsertTask}
        currentUserName={currentUserName}
      />

      <NewTaskForm
        facilityId={facilityId}
        equipment={equipment}
        assignees={assignees}
        upsertTask={upsertTask}
        currentUserName={currentUserName}
      />
    </div>
  );
}

// ── EQUIPMENT SECTION ───────────────────────────────────────────────────────
function EquipmentSection({ facilityId, equipment, lastCheckedByEquip, upsertEquipment, removeEquipment, upsertTask, currentUserName, assignees, allTasks }) {
  const [showAdd, setShowAdd] = useState(false);
  const [historyForId, setHistoryForId] = useState(null);

  async function inspectEquipment(eq) {
    // One task per equipment, pre-linked. Lands in their tab + the facility's task list.
    await upsertTask({
      id: crypto.randomUUID(),
      title: `Inspect ${eq.name}`,
      category: "maintenance",
      facility: facilityId,
      equipmentId: eq.id,
      status: "pending",
      priority: 100,
      weekNumber: getWeek().week,
      year: getWeek().year,
      bucket: "today",
      createdBy: currentUserName || "Manager",
      assignedTo: DEFAULT_MAINTENANCE_ASSIGNEE,
      assignedAt: new Date().toISOString(),
      photos: [],
    });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a" }}>⚙ Equipment · {equipment.length}</div>
        <button onClick={() => setShowAdd(true)}
          style={{ background: "#7fb069", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Add
        </button>
      </div>

      {equipment.length === 0 ? (
        <div style={{ fontSize: 13, color: "#7a8c74", padding: "12px 0", textAlign: "center" }}>
          No equipment logged yet. Tap "+ Add" to register the heaters, fans, etc. in this house.
        </div>
      ) : equipment.map(eq => {
        const kind = KIND_BY_ID[eq.kind] || KIND_BY_ID.other;
        const lc = lastCheckedByEquip.get(eq.id);
        const days = lc ? Math.floor((Date.now() - new Date(lc.ts).getTime()) / 86400000) : null;
        return (
          <div key={eq.id} style={{ borderTop: "1px solid #e0ead8", padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>
                  {kind.emoji} {eq.name}
                </div>
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 3 }}>
                  {kind.label}
                  {eq.locationNotes && <> · {eq.locationNotes}</>}
                  {eq.model && <> · {eq.model}</>}
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: !lc ? "#d94f3d" : days > 90 ? "#e89a3a" : "#4a7a35", fontWeight: 700 }}>
                  Last checked: {lc ? `${fmtDate(lc.ts)}${lc.by ? ` by ${lc.by}` : ""} (${days}d ago)` : "never"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                <button onClick={() => inspectEquipment(eq)}
                  style={{ background: "#1e2d1a", border: "none", borderRadius: 6, color: "#c8e6b8", padding: "5px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  Inspect
                </button>
                <button onClick={() => setHistoryForId(historyForId === eq.id ? null : eq.id)}
                  style={{ background: "transparent", border: "1.5px solid #c8d8c0", borderRadius: 6, color: "#7a8c74", padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  History
                </button>
              </div>
            </div>
            {historyForId === eq.id && <EquipmentHistory equipmentId={eq.id} allTasks={allTasks} />}
          </div>
        );
      })}

      {showAdd && <AddEquipmentModal facilityId={facilityId} currentUserName={currentUserName}
        onClose={() => setShowAdd(false)}
        onSaved={async (payload) => { await upsertEquipment(payload); setShowAdd(false); }} />}
    </div>
  );
}

function EquipmentHistory({ equipmentId, allTasks }) {
  const items = (allTasks || [])
    .filter(t => t.equipmentId === equipmentId)
    .sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));
  return (
    <div style={{ marginTop: 8, padding: "8px 10px", background: "#f8fbf5", borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: "#7a8c74", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>History · {items.length}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: "#7a8c74" }}>No prior tasks for this item.</div>
      ) : items.map(t => (
        <div key={t.id} style={{ fontSize: 12, color: "#1e2d1a", padding: "4px 0", borderBottom: "1px dashed #e0ead8" }}>
          {t.status === "completed" ? "✓" : "○"} {t.title}
          <span style={{ color: "#7a8c74", marginLeft: 6, fontSize: 11 }}>
            {t.status === "completed"
              ? `Done ${fmtDate(t.completedAt)}${t.completedBy ? ` by ${t.completedBy}` : ""}`
              : `Created ${fmtDate(t.createdAt)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function AddEquipmentModal({ facilityId, currentUserName, onClose, onSaved }) {
  const [kind, setKind] = useState("heater");
  const [name, setName] = useState("");
  const [locationNotes, setLocationNotes] = useState("");
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [installedAt, setInstalledAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Default the name to "Heater 1", "Heater 2", etc. based on kind — saves typing
  useEffect(() => {
    if (!name) setName(KIND_BY_ID[kind]?.defaultName || "");
  }, [kind]); // eslint-disable-line

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaved({
        id: crypto.randomUUID(),
        facilityId,
        name: name.trim(),
        kind,
        locationNotes: locationNotes.trim() || null,
        model: model.trim() || null,
        notes: notes.trim() || null,
        installedAt: installedAt || null,
        createdBy: currentUserName || "Manager",
      });
    } finally { setSaving(false); }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center", ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>Add Equipment</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7a8c74" }}>✕</button>
        </div>

        <label style={lblStyle}>Kind</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
          {EQUIPMENT_KINDS.map(k => (
            <button key={k.id} onClick={() => { setKind(k.id); setName(KIND_BY_ID[k.id]?.defaultName || ""); }}
              style={{ ...kindBtn, ...(kind === k.id ? kindBtnOn : {}) }}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>

        <label style={lblStyle}>Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder='e.g. "Heater 1"'
          style={inputStyle} />

        <label style={lblStyle}>Location in house</label>
        <input value={locationNotes} onChange={e => setLocationNotes(e.target.value)} placeholder='e.g. "north end" or "above door"'
          style={inputStyle} />

        <label style={lblStyle}>Model / brand <span style={{ color: "#a8b0a0", fontWeight: 600 }}>(optional)</span></label>
        <input value={model} onChange={e => setModel(e.target.value)} placeholder='e.g. "Modine PDP100"'
          style={inputStyle} />

        <label style={lblStyle}>Installed <span style={{ color: "#a8b0a0", fontWeight: 600 }}>(optional)</span></label>
        <input type="date" value={installedAt} onChange={e => setInstalledAt(e.target.value)} style={inputStyle} />

        <label style={lblStyle}>Notes <span style={{ color: "#a8b0a0", fontWeight: 600 }}>(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={!name.trim() || saving} style={{ ...btnPrimary, opacity: name.trim() && !saving ? 1 : 0.5 }}>
            {saving ? "Saving…" : "+ Add Equipment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QUICK ACTIONS ───────────────────────────────────────────────────────────
function QuickActions({ facilityId, equipment, presentKinds, upsertTask, currentUserName }) {
  const [busy, setBusy] = useState(null);

  async function checkAllOfKind(kindId) {
    // One task per equipment of this kind, all auto-assigned to the creator.
    const items = equipment.filter(e => e.kind === kindId);
    if (items.length === 0) return;
    setBusy(kindId);
    const w = getWeek();
    try {
      for (const eq of items) {
        await upsertTask({
          id: crypto.randomUUID(),
          title: `Inspect ${eq.name}`,
          category: "maintenance",
          facility: facilityId,
          equipmentId: eq.id,
          status: "pending",
          priority: 100,
          weekNumber: w.week,
          year: w.year,
          bucket: "today",
          createdBy: currentUserName || "Manager",
          assignedTo: DEFAULT_MAINTENANCE_ASSIGNEE,
          assignedAt: new Date().toISOString(),
          photos: [],
        });
      }
    } finally { setBusy(null); }
  }

  async function generalWalkthrough() {
    const w = getWeek();
    await upsertTask({
      id: crypto.randomUUID(),
      title: `Walk-through ${facilityLabel(facilityId)}`,
      category: "maintenance",
      facility: facilityId,
      status: "pending",
      priority: 100,
      weekNumber: w.week,
      year: w.year,
      bucket: "today",
      createdBy: currentUserName || "Manager",
      assignedTo: DEFAULT_MAINTENANCE_ASSIGNEE,
      assignedAt: new Date().toISOString(),
      photos: [],
    });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 10 }}>⚡ Quick Actions</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {presentKinds.map(k => {
          const count = equipment.filter(e => e.kind === k.id).length;
          return (
            <button key={k.id} onClick={() => checkAllOfKind(k.id)} disabled={busy === k.id}
              style={{ ...quickBtn, opacity: busy === k.id ? 0.5 : 1 }}>
              {k.emoji} Check {count > 1 ? `all ${k.qa}` : k.qa} <span style={{ background: "#fff", color: "#1e2d1a", borderRadius: 999, padding: "1px 6px", fontSize: 10, marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
        <button onClick={generalWalkthrough} style={quickBtn}>
          🚶 Walk-through
        </button>
      </div>
      {presentKinds.length === 0 && (
        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 6 }}>
          Add equipment above to enable per-kind quick actions (e.g. "Check all heaters").
        </div>
      )}
    </div>
  );
}

// ── NEW TASK FORM ───────────────────────────────────────────────────────────
function NewTaskForm({ facilityId, equipment, assignees, upsertTask, currentUserName }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tools, setTools] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  // Default to Gerry — primary maintenance person. Falls back to the creator
  // if Gerry isn't yet in the assignees list for some reason.
  const initialAssign = (assignees || []).some(a => a.key === DEFAULT_MAINTENANCE_ASSIGNEE)
    ? DEFAULT_MAINTENANCE_ASSIGNEE
    : (currentUserName || "").split(/\s+/)[0] || "";
  const [assignTo, setAssignTo] = useState(initialAssign);
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  function toggleDictation() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Tap the 🎤 on your keyboard to dictate.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const r = new SpeechRecognition();
    r.continuous = true; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      let txt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) txt += e.results[i][0].transcript;
      }
      if (txt) setTitle(prev => (prev + " " + txt).trim());
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const w = getWeek();
    try {
      await upsertTask({
        id: crypto.randomUUID(),
        title: title.trim(),
        notes: notes.trim() || null,
        toolsMaterials: tools.trim() || null,
        category: "maintenance",
        facility: facilityId,
        equipmentId: equipmentId || null,
        status: "pending",
        priority: priority === "high" ? 200 : 100,
        weekNumber: w.week,
        year: w.year,
        bucket: "today",
        createdBy: currentUserName || "Manager",
        assignedTo: assignTo || null,
        assignedAt: assignTo ? new Date().toISOString() : null,
        photos: [],
      });
      setTitle(""); setNotes(""); setTools(""); setEquipmentId(""); setPriority("normal");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 10 }}>➕ New Task</div>

      <label style={lblStyle}>Title *</label>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Patch roof leak above bench 3"
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
        <button onClick={toggleDictation}
          style={{ background: listening ? "#d94f3d" : "#1e2d1a", border: "none", borderRadius: 8, color: "#fff", padding: "0 14px", fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>
          🎤
        </button>
      </div>
      <div style={{ height: 12 }} />

      <label style={lblStyle}>Notes</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
        placeholder="Optional context, symptoms, what to look for…"
        style={{ ...inputStyle, resize: "vertical" }} />

      <label style={lblStyle}>Tools / materials needed <span style={{ color: "#a8b0a0", fontWeight: 600 }}>+ where to find them</span></label>
      <textarea value={tools} onChange={e => setTools(e.target.value)} rows={2}
        placeholder='e.g. "ladder + duct tape — shop shelf 3"'
        style={{ ...inputStyle, resize: "vertical" }} />

      {equipment.length > 0 && (
        <>
          <label style={lblStyle}>Related equipment <span style={{ color: "#a8b0a0", fontWeight: 600 }}>(optional)</span></label>
          <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)} style={selectStyle}>
            <option value="">— none —</option>
            {equipment.map(eq => (
              <option key={eq.id} value={eq.id}>
                {KIND_BY_ID[eq.kind]?.emoji} {eq.name}
              </option>
            ))}
          </select>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={lblStyle}>Assign to</label>
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={selectStyle}>
            <option value="">— unassigned —</option>
            {(assignees || []).map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lblStyle}>Priority</label>
          <select value={priority} onChange={e => setPriority(e.target.value)} style={selectStyle}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <button onClick={submit} disabled={!title.trim() || saving}
        style={{ ...btnPrimary, width: "100%", marginTop: 12, opacity: title.trim() && !saving ? 1 : 0.5 }}>
        {saving ? "Creating…" : "Create Task"}
      </button>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function getWeek() {
  const d = new Date();
  const first = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - first) / 86400000);
  return { week: Math.ceil((days + first.getDay() + 1) / 7), year: d.getFullYear() };
}

const lblStyle = { display: "block", fontSize: 10, color: "#7a8c74", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, color: "#1e2d1a", background: "#fff" };
const selectStyle = { ...inputStyle, background: "#fff" };
const btnPrimary = { background: "#7fb069", border: "none", borderRadius: 8, color: "#1e2d1a", padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", flex: 1 };
const btnSecondary = { background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, color: "#7a8c74", padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flex: 1 };
const kindBtn = { background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 8, color: "#1e2d1a", padding: "8px 6px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" };
const kindBtnOn = { background: "#7fb069", borderColor: "#7fb069", color: "#1e2d1a", fontWeight: 800 };
const quickBtn = { background: "#1e2d1a", border: "none", borderRadius: 8, color: "#c8e6b8", padding: "10px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
