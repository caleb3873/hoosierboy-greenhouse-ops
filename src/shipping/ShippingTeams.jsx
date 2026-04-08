import { useMemo, useState } from "react";
import { useShippingTeams, useFloorCodes, useEmployees } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const BORDER = "#e0ead8";

const TEAM_COLORS = ["#7fb069", "#4a9d7f", "#d9a04a", "#a94aa0", "#4a6a8a", "#c56e3a"];

export default function ShippingTeams() {
  const { rows: teams, insert, update, remove, loading } = useShippingTeams();
  const { rows: employees } = useEmployees();
  const { rows: floorCodes } = useFloorCodes();
  const [editing, setEditing] = useState(null);

  // Candidates = every active employee, annotated with role from floor_codes if available
  const people = useMemo(() => {
    const roleByName = new Map();
    for (const fc of floorCodes) {
      if (fc.workerName) roleByName.set(fc.workerName, { role: fc.role, code: fc.code });
    }
    return employees
      .filter(e => e.active !== false)
      .map(e => ({
        id: e.id,
        name: e.name,
        role: roleByName.get(e.name)?.role || e.role || "staff",
        code: roleByName.get(e.name)?.code || null,
      }));
  }, [employees, floorCodes]);

  async function save(row) {
    if (row.id) {
      const { id, ...rest } = row;
      await update(id, rest);
    } else {
      await insert(row);
    }
    setEditing(null);
  }

  async function del(id) {
    if (!window.confirm("Delete this team?")) return;
    await remove(id);
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Teams</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
            {loading ? "Loading…" : `${teams.length} teams`}
          </div>
        </div>
        <button onClick={() => setEditing({ name: "", members: [], color: TEAM_COLORS[teams.length % TEAM_COLORS.length], notes: "", active: true })}
          style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: DARK, color: CREAM, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + New Team
        </button>
      </div>

      {teams.length === 0 && !loading && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No shipping teams yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Group your staff into teams for easier assignment.</div>
        </div>
      )}

      {teams.map(t => (
        <div key={t.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, borderLeft: `5px solid ${t.color || GREEN}`, padding: 18, marginBottom: 10, opacity: t.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: DARK, fontFamily: "'DM Serif Display',Georgia,serif" }}>{t.name}</div>
              <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{(t.members || []).length} {(t.members || []).length === 1 ? "member" : "members"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(t)} style={{ background: "none", border: `1px solid ${BORDER}`, color: "#7a8c74", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
              <button onClick={() => del(t.id)} style={{ background: "none", border: "none", color: "#c0c0c0", fontSize: 20, cursor: "pointer", padding: 4 }}>🗑</button>
            </div>
          </div>
          {(t.members || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {t.members.map((m, i) => (
                <span key={i} style={{ background: "#f2f5ef", color: DARK, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>
                  {m.name}
                </span>
              ))}
            </div>
          )}
          {t.notes && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 8, fontStyle: "italic" }}>{t.notes}</div>}
        </div>
      ))}

      {editing && <TeamForm team={editing} people={people} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function TeamForm({ team, people, onSave, onCancel }) {
  const [t, setT] = useState({ ...team, members: team.members || [] });
  const upd = (k, v) => setT(p => ({ ...p, [k]: v }));

  const selected = new Set((t.members || []).map(m => m.name));

  function toggleMember(p) {
    const exists = selected.has(p.name);
    upd("members", exists
      ? t.members.filter(m => m.name !== p.name)
      : [...t.members, { name: p.name, role: p.role, code: p.code }]);
  }

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ background: DARK, color: CREAM, padding: "16px 22px", borderRadius: "16px 16px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {team.id ? "Edit Team" : "New Team"}
          </div>
          <button onClick={onCancel} style={{ background: "none", border: "none", color: CREAM, fontSize: 26, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          <Label>Team Name</Label>
          <input value={t.name || ""} onChange={e => upd("name", e.target.value)}
            placeholder="e.g. North Route, Sam's Crew"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 14 }} />

          <Label>Color</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {TEAM_COLORS.map(c => (
              <button key={c} onClick={() => upd("color", c)}
                style={{
                  width: 36, height: 36, borderRadius: "50%", background: c,
                  border: t.color === c ? `3px solid ${DARK}` : `3px solid #fff`,
                  boxShadow: t.color === c ? `0 0 0 2px ${c}` : "none",
                  cursor: "pointer",
                }} />
            ))}
          </div>

          <Label>Members</Label>
          {people.length === 0 ? (
            <div style={{ fontSize: 13, color: "#7a8c74", padding: "12px 0" }}>
              No employees found. Add them to the employees roster first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 260, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 8 }}>
              {people.map(p => {
                const isSelected = selected.has(p.name);
                return (
                  <label key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: isSelected ? "#f0f8eb" : "#fff",
                    border: `1.5px solid ${isSelected ? GREEN : BORDER}`,
                    borderRadius: 8, cursor: "pointer",
                  }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleMember(p)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#7a8c74", textTransform: "capitalize" }}>{p.role}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <Label>Notes</Label>
          <textarea value={t.notes || ""} onChange={e => upd("notes", e.target.value)}
            placeholder="What does this team cover?"
            style={{ width: "100%", minHeight: 70, padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", marginBottom: 14 }} />

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 13, color: DARK, fontWeight: 700 }}>
            <input type="checkbox" checked={t.active !== false} onChange={e => upd("active", e.target.checked)} />
            Active
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel}
              style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
            <button onClick={() => onSave(t)} disabled={!t.name?.trim()}
              style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: t.name?.trim() ? DARK : "#c8d8c0", color: CREAM, fontSize: 14, fontWeight: 800, cursor: t.name?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Save Team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{children}</div>;
}
