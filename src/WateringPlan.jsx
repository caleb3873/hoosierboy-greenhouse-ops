import { useState } from "react";
import { useWateringPlans, useWateringTasks, useHouses } from "./supabase";
import { useAuth } from "./Auth";
import { FERTILIZER_TYPES, URGENCY_LEVELS, uid } from "./shared";

// ── STYLING ───────────────────────────────────────────────────────────────────
const FONT  = "'DM Sans','Segoe UI',sans-serif";
const DARK  = "#1e2d1a";
const ACCENT = "#7fb069";

function FL({ children }) {
  return (
    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#4a6a3a", marginBottom: 4, fontFamily: FONT }}>
      {children}
    </label>
  );
}

function inputStyle(extra = {}) {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    border: "1.5px solid #d0dbc8",
    borderRadius: 7,
    fontSize: 14,
    fontFamily: FONT,
    color: DARK,
    background: "#fff",
    outline: "none",
    ...extra,
  };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatPlanDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(isoStr) {
  if (!isoStr) return "";
  return new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function getFertMeta(id) {
  return FERTILIZER_TYPES.find(f => f.id === id) || FERTILIZER_TYPES[0];
}

function getUrgencyMeta(id) {
  return URGENCY_LEVELS.find(u => u.id === id) || URGENCY_LEVELS[1];
}

// ── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ done, total, height = 6 }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ background: "#d0dbc8", borderRadius: 10, height, overflow: "hidden" }}>
      <div style={{
        background: ACCENT,
        height: "100%",
        borderRadius: 10,
        width: `${pct}%`,
        transition: "width 300ms ease-out",
      }} />
    </div>
  );
}

// ── BADGE ─────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      color,
      background: bg,
      fontFamily: FONT,
    }}>
      {label}
    </span>
  );
}

// ── PLAN LIST VIEW ────────────────────────────────────────────────────────────
function PlanList({ plans, tasks, onSelectPlan, onNewPlan }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: DARK, fontFamily: FONT }}>
          Watering Plans
        </h2>
        <button
          onClick={onNewPlan}
          style={{
            background: ACCENT,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          + New Plan
        </button>
      </div>

      {plans.length === 0 && (
        <div style={{ textAlign: "center", color: "#7a8c74", padding: 48, fontSize: 14 }}>
          No watering plans yet. Create one to get started.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {plans.map(plan => {
          const planTasks = tasks.filter(t => t.planId === plan.id);
          const done  = planTasks.filter(t => t.completed).length;
          const total = planTasks.length;
          const estMins = planTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

          return (
            <div
              key={plan.id}
              onClick={() => onSelectPlan(plan)}
              style={{
                background: "#fff",
                border: "1.5px solid #e0e8d8",
                borderRadius: 12,
                padding: 18,
                cursor: "pointer",
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.1)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: DARK, fontFamily: FONT }}>{plan.title}</div>
                  <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{formatPlanDate(plan.planDate)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: done === total && total > 0 ? ACCENT : "#7a8c74" }}>
                    {done}/{total} tasks
                  </div>
                  {estMins > 0 && (
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>{estMins} min est.</div>
                  )}
                </div>
              </div>

              {plan.weatherNotes && (
                <div style={{ fontSize: 12, color: "#4a6a9e", marginBottom: 8 }}>
                  {plan.weatherNotes}
                </div>
              )}

              {total > 0 && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar done={done} total={total} height={5} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── NEW PLAN FORM ─────────────────────────────────────────────────────────────
function NewPlanForm({ onSave, onCancel, growerProfile }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ title: "", planDate: today, weatherNotes: "", notes: "" });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        planDate: form.planDate,
        weatherNotes: form.weatherNotes.trim(),
        notes: form.notes.trim(),
        createdById: growerProfile?.id || null,
        createdByName: growerProfile?.name || "Unknown",
        status: "active",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          onClick={onCancel}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#7a8c74", padding: 0 }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: DARK, fontFamily: FONT }}>
          New Watering Plan
        </h2>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <FL>Title *</FL>
          <input
            style={inputStyle()}
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder="e.g. Monday Morning Watering"
          />
        </div>

        <div>
          <FL>Date</FL>
          <input
            type="date"
            style={inputStyle()}
            value={form.planDate}
            onChange={e => set("planDate", e.target.value)}
          />
        </div>

        <div>
          <FL>Weather Conditions</FL>
          <input
            style={inputStyle()}
            value={form.weatherNotes}
            onChange={e => set("weatherNotes", e.target.value)}
            placeholder="e.g. Sunny, warm — high evaporation expected"
          />
        </div>

        <div>
          <FL>Notes</FL>
          <textarea
            style={inputStyle({ resize: "vertical", minHeight: 80 })}
            value={form.notes}
            onChange={e => set("notes", e.target.value)}
            placeholder="Any additional notes..."
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "9px 20px", border: "1.5px solid #d0dbc8", borderRadius: 8,
              background: "#fff", fontSize: 14, cursor: "pointer", fontFamily: FONT,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            style={{
              padding: "9px 20px", border: "none", borderRadius: 8,
              background: saving || !form.title.trim() ? "#c8dab8" : ACCENT,
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer",
              fontFamily: FONT,
            }}
          >
            {saving ? "Creating..." : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ADD TASK FORM ─────────────────────────────────────────────────────────────
function AddTaskForm({ houses, onSave, onCancel }) {
  const [form, setForm] = useState({
    houseId: "",
    houseName: "",
    zoneLabel: "",
    instructions: "",
    fertilizerType: "none",
    fertilizerDetail: "",
    urgency: "normal",
    estimatedMinutes: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  function handleHouseChange(houseId) {
    const h = houses.find(h => h.id === houseId);
    set("houseId", houseId);
    set("houseName", h ? h.name : "");
  }

  async function handleSave() {
    if (!form.houseId) return;
    setSaving(true);
    try {
      await onSave({
        houseId: form.houseId,
        houseName: form.houseName,
        zoneLabel: form.zoneLabel.trim(),
        instructions: form.instructions.trim(),
        fertilizerType: form.fertilizerType,
        fertilizerDetail: form.fertilizerDetail.trim(),
        urgency: form.urgency,
        estimatedMinutes: form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null,
        notes: form.notes.trim(),
        completed: false,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      border: "2px dashed #b0c8a0",
      borderRadius: 12,
      padding: 18,
      background: "#f8faf6",
      display: "flex",
      flexDirection: "column",
      gap: 14,
      marginTop: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: DARK, fontFamily: FONT }}>Add Watering Task</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <FL>House *</FL>
          <select
            style={inputStyle()}
            value={form.houseId}
            onChange={e => handleHouseChange(e.target.value)}
          >
            <option value="">Select house...</option>
            {houses.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>

        <div>
          <FL>Zone / Bench</FL>
          <input
            style={inputStyle()}
            value={form.zoneLabel}
            onChange={e => set("zoneLabel", e.target.value)}
            placeholder="e.g. Bench 3 North"
          />
        </div>
      </div>

      <div>
        <FL>Instructions</FL>
        <input
          style={inputStyle()}
          value={form.instructions}
          onChange={e => set("instructions", e.target.value)}
          placeholder="e.g. Water thoroughly, check for dry spots"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <FL>Fertilizer</FL>
          <select
            style={inputStyle()}
            value={form.fertilizerType}
            onChange={e => set("fertilizerType", e.target.value)}
          >
            {FERTILIZER_TYPES.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <FL>Urgency</FL>
          <select
            style={inputStyle()}
            value={form.urgency}
            onChange={e => set("urgency", e.target.value)}
          >
            {URGENCY_LEVELS.map(u => (
              <option key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </div>

        <div>
          <FL>Est. Minutes</FL>
          <input
            type="number"
            min="1"
            style={inputStyle()}
            value={form.estimatedMinutes}
            onChange={e => set("estimatedMinutes", e.target.value)}
            placeholder="15"
          />
        </div>
      </div>

      {form.fertilizerType === "custom" && (
        <div>
          <FL>Fertilizer Detail</FL>
          <input
            style={inputStyle()}
            value={form.fertilizerDetail}
            onChange={e => set("fertilizerDetail", e.target.value)}
            placeholder="Describe the custom fertilizer..."
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 16px", border: "1.5px solid #d0dbc8", borderRadius: 7,
            background: "#fff", fontSize: 13, cursor: "pointer", fontFamily: FONT,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.houseId}
          style={{
            padding: "7px 16px", border: "none", borderRadius: 7,
            background: saving || !form.houseId ? "#c8dab8" : ACCENT,
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: saving || !form.houseId ? "default" : "pointer",
            fontFamily: FONT,
          }}
        >
          {saving ? "Saving..." : "Add Task"}
        </button>
      </div>
    </div>
  );
}

// ── TASK CARD ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, toggling }) {
  const urgency = getUrgencyMeta(task.urgency);
  const fert    = getFertMeta(task.fertilizerType);

  return (
    <div style={{
      background: "#fff",
      border: "1.5px solid #e0e8d8",
      borderLeft: `4px solid ${urgency.color}`,
      borderRadius: 10,
      padding: "14px 16px",
      opacity: task.completed ? 0.6 : 1,
      display: "flex",
      gap: 14,
      alignItems: "flex-start",
    }}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task)}
        disabled={toggling}
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          border: `2px solid ${task.completed ? ACCENT : "#c0d0b0"}`,
          background: task.completed ? ACCENT : "#fff",
          cursor: toggling ? "default" : "pointer",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
          padding: 0,
        }}
      >
        {task.completed && (
          <span style={{ color: "#fff", fontSize: 14, lineHeight: 1 }}>✓</span>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: DARK, fontFamily: FONT }}>
            {task.houseName}
          </span>
          {task.zoneLabel && (
            <span style={{ fontSize: 12, color: "#7a8c74" }}>{task.zoneLabel}</span>
          )}
        </div>

        {task.instructions && (
          <div style={{ fontSize: 13, color: "#4a5a40", marginBottom: 8, lineHeight: 1.5 }}>
            {task.instructions}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Badge label={fert.label} color={fert.color} bg={fert.bg} />
          <Badge label={urgency.label} color={urgency.color} bg={urgency.bg} />
          {task.estimatedMinutes && (
            <span style={{ fontSize: 11, color: "#7a8c74", fontFamily: FONT }}>
              {task.estimatedMinutes} min
            </span>
          )}
        </div>

        {task.completed && task.completedByName && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#7a8c74", fontFamily: FONT }}>
            Done by {task.completedByName}{task.completedAt ? ` at ${formatTime(task.completedAt)}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PLAN DETAIL VIEW ──────────────────────────────────────────────────────────
function PlanDetail({ plan, tasks, houses, onBack, insertTask, updateTask, growerProfile }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [toggling, setToggling]       = useState(null);

  const planTasks = tasks
    .filter(t => t.planId === plan.id)
    .sort((a, b) => {
      // Sort by urgency priority (critical > high > normal > low) then sortOrder
      const uPriority = { critical: 0, high: 1, normal: 2, low: 3 };
      const ua = uPriority[a.urgency] ?? 2;
      const ub = uPriority[b.urgency] ?? 2;
      if (ua !== ub) return ua - ub;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

  const done  = planTasks.filter(t => t.completed).length;
  const total = planTasks.length;
  const estMins = planTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);

  async function handleToggle(task) {
    setToggling(task.id);
    try {
      if (task.completed) {
        await updateTask(task.id, {
          completed: false,
          completedAt: null,
          completedById: null,
          completedByName: null,
        });
      } else {
        await updateTask(task.id, {
          completed: true,
          completedAt: new Date().toISOString(),
          completedById: growerProfile?.id || null,
          completedByName: growerProfile?.name || "Unknown",
        });
      }
    } finally {
      setToggling(null);
    }
  }

  async function handleAddTask(taskData) {
    const sortOrder = planTasks.length;
    await insertTask({
      plan_id: plan.id,
      sort_order: sortOrder,
      house_id: taskData.houseId,
      house_name: taskData.houseName,
      zone_label: taskData.zoneLabel,
      instructions: taskData.instructions,
      fertilizer_type: taskData.fertilizerType,
      fertilizer_detail: taskData.fertilizerDetail,
      urgency: taskData.urgency,
      estimated_minutes: taskData.estimatedMinutes,
      notes: taskData.notes,
      completed: false,
      completed_at: null,
      completed_by_id: null,
      completed_by_name: null,
    });
    setShowAddForm(false);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#7a8c74", padding: 0, marginTop: 2 }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: DARK, fontFamily: FONT }}>
            {plan.title}
          </h2>
          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{formatPlanDate(plan.planDate)}</div>
        </div>
      </div>

      {/* Weather & summary bar */}
      <div style={{
        background: "#e0ecf8",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, color: "#2a5a8a", fontFamily: FONT }}>
          {plan.weatherNotes || "No weather notes"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#2a5a8a", fontFamily: FONT, whiteSpace: "nowrap" }}>
          {done}/{total} done
          {estMins > 0 && <span style={{ fontWeight: 400, marginLeft: 6 }}>· {estMins} min est.</span>}
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ marginBottom: 20 }}>
          <ProgressBar done={done} total={total} height={7} />
        </div>
      )}

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {planTasks.length === 0 && !showAddForm && (
          <div style={{ textAlign: "center", color: "#7a8c74", padding: "24px 0", fontSize: 13 }}>
            No tasks yet. Add one below.
          </div>
        )}

        {planTasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={handleToggle}
            toggling={toggling === task.id}
          />
        ))}
      </div>

      {/* Add task inline form or button */}
      {showAddForm ? (
        <AddTaskForm
          houses={houses}
          onSave={handleAddTask}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            display: "block",
            width: "100%",
            marginTop: 14,
            padding: "12px 0",
            border: "2px dashed #b0c8a0",
            borderRadius: 10,
            background: "transparent",
            color: ACCENT,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
            textAlign: "center",
          }}
        >
          + Add Watering Task
        </button>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function WateringPlan({ embedded = false }) {
  const { growerProfile } = useAuth();
  const { rows: plans, insert: insertPlan } = useWateringPlans();
  const { rows: tasks, insert: insertTask, update: updateTask } = useWateringTasks();
  const { rows: houses } = useHouses();

  const [view, setView]         = useState("list"); // "list" | "plan" | "new"
  const [selectedPlan, setSelectedPlan] = useState(null);

  function handleSelectPlan(plan) {
    setSelectedPlan(plan);
    setView("plan");
  }

  function handleBack() {
    setSelectedPlan(null);
    setView("list");
  }

  async function handleCreatePlan(planData) {
    const newPlan = await insertPlan(planData);
    setSelectedPlan(newPlan);
    setView("plan");
  }

  // Sort plans by planDate descending
  const sortedPlans = [...plans].sort((a, b) => {
    if (!a.planDate) return 1;
    if (!b.planDate) return -1;
    return b.planDate.localeCompare(a.planDate);
  });

  const content = (
    <div style={{ fontFamily: FONT }}>
      {view === "list" && (
        <PlanList
          plans={sortedPlans}
          tasks={tasks}
          onSelectPlan={handleSelectPlan}
          onNewPlan={() => setView("new")}
        />
      )}

      {view === "new" && (
        <NewPlanForm
          growerProfile={growerProfile}
          onSave={handleCreatePlan}
          onCancel={() => setView("list")}
        />
      )}

      {view === "plan" && selectedPlan && (
        <PlanDetail
          plan={selectedPlan}
          tasks={tasks}
          houses={houses}
          onBack={handleBack}
          insertTask={insertTask}
          updateTask={updateTask}
          growerProfile={growerProfile}
        />
      )}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {content}
    </div>
  );
}
