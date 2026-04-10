import { useState } from "react";
import { useTrucks } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const BORDER = "#e0ead8";

export default function ShippingTrucks() {
  const { rows: trucks, insert, update, remove, loading } = useTrucks();
  const [editing, setEditing] = useState(null);

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
    if (!window.confirm("Delete this truck?")) return;
    await remove(id);
  }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Trucks</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>
            {loading ? "Loading…" : `${trucks.length} total`}
          </div>
        </div>
        <button onClick={() => setEditing({ name: "", licensePlate: "", riverlinkTag: "", mpg: 8, capacityNotes: "", active: true, isRental: false, rentalReceivedDate: "", rentalCostPerDay: "", rentalMileageCost: "", hasRiverlink: false })}
          style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: DARK, color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          + Add Truck
        </button>
      </div>

      {trucks.length === 0 && !loading && (
        <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, padding: "60px 20px", textAlign: "center", color: "#7a8c74" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚛</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>No trucks added yet</div>
        </div>
      )}

      {trucks.map(t => (
        <div key={t.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${BORDER}`, padding: 18, marginBottom: 10, opacity: t.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: DARK }}>{t.name}</div>
              <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: "#7a8c74", flexWrap: "wrap" }}>
                {t.licensePlate && <div>🔢 <b style={{ color: DARK }}>{t.licensePlate}</b></div>}
                {t.hasRiverlink && <div style={{ color: GREEN, fontWeight: 700 }}>🌉 RiverLink</div>}
                {!t.hasRiverlink && <div style={{ color: "#d94f3d", fontWeight: 700 }}>🌉 No RiverLink</div>}
                {t.mpg && <div>⛽ {t.mpg} mpg</div>}
                {t.isRental && <div style={{ color: "#e89a3a", fontWeight: 700 }}>🏷 Rental</div>}
              </div>
              {t.isRental && (
                <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 12, color: "#7a8c74", flexWrap: "wrap" }}>
                  {t.rentalReceivedDate && <div>📅 Received: <b style={{ color: DARK }}>{t.rentalReceivedDate}</b></div>}
                  {t.rentalCostPerDay && <div>💰 ${t.rentalCostPerDay}/day</div>}
                  {t.rentalMileageCost && <div>📍 ${t.rentalMileageCost}/mile</div>}
                </div>
              )}
              {t.capacityNotes && <div style={{ fontSize: 12, color: "#7a8c74", fontStyle: "italic", marginTop: 6 }}>{t.capacityNotes}</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setEditing(t)} style={{ background: "none", border: `1px solid ${BORDER}`, color: "#7a8c74", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Edit
              </button>
              <button onClick={() => del(t.id)} style={{ background: "none", border: "none", color: "#c0c0c0", fontSize: 20, cursor: "pointer", padding: 4 }}>🗑</button>
            </div>
          </div>
        </div>
      ))}

      {editing && <TruckForm truck={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function TruckForm({ truck, onSave, onCancel }) {
  const [t, setT] = useState({ ...truck });
  const upd = (k, v) => setT(p => ({ ...p, [k]: v }));

  return (
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 16, fontFamily: "'DM Serif Display',Georgia,serif" }}>
          {truck.id ? "Edit Truck" : "New Truck"}
        </div>
        <F label="Name / Number" value={t.name || ""} onChange={v => upd("name", v)} placeholder="Truck 1" />
        <F label="License Plate" value={t.licensePlate || ""} onChange={v => upd("licensePlate", v)} />
        <F label="MPG (loaded)" value={String(t.mpg ?? "")} onChange={v => upd("mpg", parseFloat(v) || 0)} type="number" />
        <F label="Capacity Notes" value={t.capacityNotes || ""} onChange={v => upd("capacityNotes", v)} multiline />

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: DARK, fontWeight: 700 }}>
          <input type="checkbox" checked={!!t.hasRiverlink} onChange={e => upd("hasRiverlink", e.target.checked)} />
          🌉 Has RiverLink (can go to Louisville)
        </label>
        {t.hasRiverlink && <F label="RiverLink Tag #" value={t.riverlinkTag || ""} onChange={v => upd("riverlinkTag", v)} />}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: DARK, fontWeight: 700 }}>
          <input type="checkbox" checked={!!t.isRental} onChange={e => upd("isRental", e.target.checked)} />
          🏷 Rental Truck
        </label>
        {t.isRental && (
          <div style={{ marginLeft: 26, marginTop: 6, padding: 12, background: "#fff7ec", borderRadius: 8, border: "1px solid #e89a3a44" }}>
            <F label="Date Received" value={t.rentalReceivedDate || ""} onChange={v => upd("rentalReceivedDate", v)} type="date" />
            <F label="Cost per Day ($)" value={String(t.rentalCostPerDay ?? "")} onChange={v => upd("rentalCostPerDay", parseFloat(v) || 0)} type="number" />
            <F label="Mileage Cost ($/mile)" value={String(t.rentalMileageCost ?? "")} onChange={v => upd("rentalMileageCost", parseFloat(v) || 0)} type="number" />
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: DARK, fontWeight: 700 }}>
          <input type="checkbox" checked={t.active !== false} onChange={e => upd("active", e.target.checked)} />
          Active
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${BORDER}`, background: "#fff", color: "#7a8c74", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={() => onSave(t)} disabled={!t.name?.trim()}
            style={{ flex: 2, padding: "12px 0", borderRadius: 10, border: "none", background: t.name?.trim() ? DARK : "#c8d8c0", color: "#c8e6b8", fontSize: 14, fontWeight: 800, cursor: t.name?.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, value, onChange, multiline, placeholder, type }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <Tag type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: "100%", padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`,
          fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
          minHeight: multiline ? 70 : undefined, resize: multiline ? "vertical" : undefined,
        }} />
    </div>
  );
}
