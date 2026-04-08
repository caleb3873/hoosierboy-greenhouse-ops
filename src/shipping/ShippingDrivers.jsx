import { useState } from "react";
import { useDrivers } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const BORDER = "#e0ead8";

export default function ShippingDrivers() {
  const { rows: drivers, insert, update, remove, loading } = useDrivers();
  const [editing, setEditing] = useState(null); // row or "new"

  async function save(row) {
    if (row.id) {
      const { id, ...changes } = row;
      await update(id, changes);
    } else {
      await insert(row);
    }
    setEditing(null);
  }

  async function del(id) {
    if (!window.confirm("Delete this driver?")) return;
    await remove(id);
  }

  const active   = drivers.filter(d => d.active);
  const inactive = drivers.filter(d => !d.active);

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Drivers</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
            {loading ? "Loading…" : `${active.length} active • ${inactive.length} inactive`}
          </div>
        </div>
        <button onClick={() => setEditing({ name: "", phone: "", license: "", notes: "", active: true })}
          style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: DARK, color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Driver
        </button>
      </div>

      {drivers.length === 0 && !loading && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚚</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No drivers added yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Tap <b>+ Add Driver</b> to get started.</div>
        </div>
      )}

      {active.length > 0 && <SectionLabel>Active</SectionLabel>}
      {active.map(d => <DriverRow key={d.id} driver={d} onEdit={() => setEditing(d)} onDelete={() => del(d.id)} />)}

      {inactive.length > 0 && <SectionLabel>Inactive</SectionLabel>}
      {inactive.map(d => <DriverRow key={d.id} driver={d} onEdit={() => setEditing(d)} onDelete={() => del(d.id)} />)}

      {editing && <DriverForm driver={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, margin: "18px 4px 8px" }}>
      {children}
    </div>
  );
}

function DriverRow({ driver: d, onEdit, onDelete }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14, opacity: d.active ? 1 : 0.55 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>{d.name}</div>
        {d.license && <div style={{ fontSize: 12, color: "#7a8c74" }}>CDL: {d.license}</div>}
        {d.notes && <div style={{ fontSize: 12, color: "#7a8c74", fontStyle: "italic", marginTop: 2 }}>{d.notes}</div>}
      </div>
      {d.phone && (
        <a href={`tel:${d.phone}`}
          style={{ background: "#f0f8eb", color: DARK, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
          📞 {d.phone}
        </a>
      )}
      <button onClick={onEdit} style={{ background: "none", border: `1px solid ${BORDER}`, color: "#7a8c74", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        Edit
      </button>
      <button onClick={onDelete} style={{ background: "none", border: "none", color: "#c0c0c0", fontSize: 20, cursor: "pointer", padding: 4 }}>🗑</button>
    </div>
  );
}

function DriverForm({ driver, onSave, onCancel }) {
  const [d, setD] = useState({ ...driver });
  const upd = (k, v) => setD(p => ({ ...p, [k]: v }));

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          {driver.id ? "Edit Driver" : "New Driver"}
        </div>
        <Field label="Name" value={d.name || ""} onChange={v => upd("name", v)} />
        <Field label="Phone" value={d.phone || ""} onChange={v => upd("phone", v)} placeholder="317-555-1234" />
        <Field label="CDL / License" value={d.license || ""} onChange={v => upd("license", v)} />
        <Field label="Notes" value={d.notes || ""} onChange={v => upd("notes", v)} multiline />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: DARK, fontWeight: 700 }}>
          <input type="checkbox" checked={d.active !== false} onChange={e => upd("active", e.target.checked)} />
          Active
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(d)} disabled={!d.name?.trim()}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: d.name?.trim() ? DARK : "#c8d8c0", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: d.name?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, placeholder }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <Tag value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`,
          fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
          minHeight: multiline ? 70 : undefined, resize: multiline ? "vertical" : undefined,
        }} />
    </div>
  );
}
