import React, { useState } from "react";
import { useGrowerProfiles } from "./supabase";
import { GROWER_ROLES, uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

export default function GrowerManagement() {
  const { rows: growers, insert, update, remove } = useGrowerProfiles();
  const [editing, setEditing] = useState(null); // grower id or "new"
  const [form, setForm] = useState({ name: "", role: "assistant", code: "" });

  const startNew = () => {
    setForm({ name: "", role: "assistant", code: "" });
    setEditing("new");
  };

  const startEdit = (g) => {
    setForm({ name: g.name, role: g.role, code: g.code });
    setEditing(g.id);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    if (editing === "new") {
      await insert({ id: uid(), ...form, active: true });
    } else {
      await update(editing, form);
    }
    setEditing(null);
  };

  const toggleActive = async (g) => {
    await update(g.id, { active: !g.active });
  };

  const active = growers.filter(g => g.active !== false);
  const inactive = growers.filter(g => g.active === false);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, color: DARK, margin: 0 }}>Grower Management</h2>
        <button onClick={startNew} style={{
          background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
          padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
        }}>+ Add Grower</button>
      </div>

      {/* Edit / New form */}
      {editing && (
        <div style={{
          background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 12 }}>
            {editing === "new" ? "New Grower" : "Edit Grower"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }}>
                {GROWER_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Access Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 2026301"
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{
              background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            }}>Save</button>
            <button onClick={() => setEditing(null)} style={{
              background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8,
              padding: "8px 16px", cursor: "pointer", fontFamily: FONT,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Active growers */}
      <div style={{ display: "grid", gap: 8 }}>
        {active.map(g => {
          const roleMeta = GROWER_ROLES.find(r => r.id === g.role) || GROWER_ROLES[2];
          return (
            <div key={g.id} style={{
              background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 10,
              padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: DARK }}>{g.name}</div>
                <span style={{
                  fontSize: 11, padding: "1px 8px", borderRadius: 8,
                  background: roleMeta.bg, color: roleMeta.color,
                }}>{roleMeta.label}</span>
                <span style={{ fontSize: 12, color: "#aaa", marginLeft: 8 }}>Code: {g.code}</span>
              </div>
              <button onClick={() => startEdit(g)} style={{
                background: "transparent", border: "1px solid #d0d8c8", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: DARK, fontFamily: FONT,
              }}>Edit</button>
              <button onClick={() => toggleActive(g)} style={{
                background: "transparent", border: "1px solid #e8c0c0", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "#c03030", fontFamily: FONT,
              }}>Deactivate</button>
            </div>
          );
        })}
      </div>

      {/* Inactive growers */}
      {inactive.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74", marginBottom: 8 }}>Inactive</div>
          {inactive.map(g => (
            <div key={g.id} style={{
              background: "#fafaf8", border: "1px solid #e8e8e0", borderRadius: 10,
              padding: "10px 18px", display: "flex", alignItems: "center", gap: 12,
              opacity: 0.6, marginBottom: 6,
            }}>
              <div style={{ flex: 1, fontSize: 14, color: DARK }}>{g.name}</div>
              <button onClick={() => toggleActive(g)} style={{
                background: "transparent", border: "1px solid #c8d8c0", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: ACCENT, fontFamily: FONT,
              }}>Reactivate</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
