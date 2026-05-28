// Admin-only page for Tyler / Paul to control which task categories each
// manager-tier user can access on their hub. Writes to floor_codes.task_categories.
// NULL on a row means "use defaults"; once admin saves explicit toggles the
// list becomes the source of truth.
import React, { useState, useMemo } from "react";
import { useFloorCodes2 } from "./supabase";

// Roles that can possibly see the manager hub — kept broad so admins can
// manage every staff member who lands on a hub view (managers, assistant
// managers, ops manager Tyler, shipping office staff who also see tasks,
// and the named worker exceptions like Reese who get manager-like access).
const ELIGIBLE_ROLES = new Set([
  "manager",
  "assistant_manager",
  "operations_manager",
  "shipping_manager",
  "shipping_office",
]);

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

// All five task categories that show as cards on the manager hub
export const ACCESS_CATEGORIES = [
  { id: "production",  label: "Production",  emoji: "🌱" },
  { id: "growing",     label: "Growing",     emoji: "🌿" },
  { id: "maintenance", label: "Maintenance", emoji: "🔧" },
  { id: "sales",       label: "Sales",       emoji: "💼" },
  { id: "receiving",   label: "Receiving",   emoji: "📦" },
];

// Default visibility for a person with no explicit task_categories set.
// Mirrors the hub-card defaults: everyone sees production/growing/maintenance/
// receiving; sales is gated to sales-involved roles.
export function defaultCategoriesFor(profile) {
  const out = new Set(["production", "growing", "maintenance", "receiving"]);
  const n = (profile?.workerName || profile?.name || "").toLowerCase();
  const group = (profile?.staffGroup || profile?.group || "").toUpperCase();
  if (
    group === "SALES" ||
    n.includes("tyler") || n.includes("paul") ||
    n.includes("trish") || n.includes("patricia") || n.includes("garrison") ||
    n.includes("mario")
  ) out.add("sales");
  return out;
}

// Effective set of categories visible to a person — explicit list if set,
// otherwise the default.
export function effectiveCategoriesFor(profile) {
  const explicit = profile?.taskCategories || profile?.task_categories;
  if (explicit) return new Set(explicit);
  return defaultCategoriesFor(profile);
}

export default function AccessControl({ onBack }) {
  const { rows: floorCodes, update } = useFloorCodes2();
  const [savingId, setSavingId] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  const eligible = useMemo(() => {
    return (floorCodes || [])
      .filter(fc => fc.active !== false && ELIGIBLE_ROLES.has((fc.role || "").toLowerCase()))
      .sort((a, b) => (a.workerName || "").localeCompare(b.workerName || ""));
  }, [floorCodes]);

  async function toggle(profile, categoryId) {
    setSavingId(profile.id);
    setErrMsg("");
    try {
      const current = profile.taskCategories || [...defaultCategoriesFor(profile)];
      const set = new Set(current);
      if (set.has(categoryId)) set.delete(categoryId);
      else set.add(categoryId);
      const next = [...set].sort();
      await update(profile.id, { taskCategories: next });
    } catch (e) {
      console.error("AccessControl toggle failed:", e);
      setErrMsg(`Save failed: ${e?.message || e}`);
    } finally {
      setSavingId(null);
    }
  }

  async function reset(profile) {
    setSavingId(profile.id);
    setErrMsg("");
    try {
      await update(profile.id, { taskCategories: null });
    } catch (e) {
      console.error("AccessControl reset failed:", e);
      setErrMsg(`Reset failed: ${e?.message || e}`);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 60 }}>
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Hub
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>🔒 Access Control</div>
        <div style={{ width: 60 }} />
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 12, color: "#7a8c74" }}>
          Toggle which task categories each manager-tier staff member sees on their hub. Blue rows are using defaults — tap any toggle to override.
        </div>

        {errMsg && (
          <div style={{ background: "#fdecea", border: "1.5px solid #d94f3d", color: "#7a2418", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, fontWeight: 700 }}>
            ⚠ {errMsg}
          </div>
        )}

        {eligible.length === 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 12, color: "#7a8c74", textAlign: "center" }}>
            No eligible staff found.
          </div>
        )}

        {eligible.map(p => {
          const effective = effectiveCategoriesFor(p);
          const usingDefault = !p.taskCategories;
          return (
            <div key={p.id} style={{ background: "#fff", border: `1.5px solid ${usingDefault ? "#c8d8ff" : "#7fb069"}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{p.workerName}</div>
                  <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>
                    {(p.role || "").replace("_", " ")} · {p.staffGroup || p.department || "—"}
                    {usingDefault ? <span style={{ marginLeft: 6, color: "#4a6aa0", fontWeight: 700 }}>· default</span> : <span style={{ marginLeft: 6, color: "#4a7a35", fontWeight: 700 }}>· custom</span>}
                  </div>
                </div>
                {!usingDefault && (
                  <button onClick={() => reset(p)} disabled={savingId === p.id}
                    style={{ background: "transparent", border: "1px solid #c8d8c0", color: "#7a8c74", borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Reset to default
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {ACCESS_CATEGORIES.map(c => {
                  const on = effective.has(c.id);
                  return (
                    <button key={c.id} onClick={() => toggle(p, c.id)} disabled={savingId === p.id}
                      style={{
                        padding: "8px 6px", borderRadius: 8,
                        background: on ? "#7fb069" : "#fff",
                        border: `1.5px solid ${on ? "#7fb069" : "#c8d8c0"}`,
                        color: on ? "#1e2d1a" : "#7a8c74",
                        fontSize: 11, fontWeight: 800, cursor: savingId === p.id ? "default" : "pointer", fontFamily: "inherit",
                      }}>
                      {on ? "☑" : "☐"} {c.emoji} {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
