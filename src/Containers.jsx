// Containers & Hard Goods — the master catalog of every pot, tray, basket and
// accessory we buy, with all the cost drivers (price, soil volume, pallet size,
// case pack, supplier, cells, bundled wire/tray/saucer). Seasons pull from this:
// a plan's families point at these containers (family page 🪴 / Pot Orders), and
// the pot-order worksheet reads price/pallet/soil straight off here. Add an item
// once, fill its info, and every plan that uses it costs correctly.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f2f7ec", creamBr: "#d8e6c8",
  border: "#e0e8d6", muted: "#7a8c74", text: "#2f3b2a", red: "#c0392b", amber: "#c9812a",
  amberBg: "#fbf1df", green: "#2e7d32", card: "#ffffff", chip: "#eaf2e0" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const money = n => n == null || n === "" ? "—" : `$${(+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const KINDS = [["finished", "Finished pot / basket"], ["tray", "Plug / prop tray"], ["propagation", "Propagation"], ["ring", "Ring / insert"], ["other", "Other"]];
const sizeRank = c => { const n = +c.diameter_in || (c.cells_per_flat ? 500 : 900); return /HB|COCO|BASKET/i.test(c.name || "") ? n + 200 : n; };

export default function Containers() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [rows, setRows] = useState(null);
  const [usage, setUsage] = useState({});   // container_id -> # recipes using it
  const [q, setQ] = useState("");
  const [kindFilt, setKindFilt] = useState("");
  const [edit, setEdit] = useState(null);    // container object being edited, or {} for new
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.from("containers").select("*").order("kind");
      setRows(data || []);
      const { data: recs } = await sb.from("crop_recipes").select("default_container_id");
      const u = {}; (recs || []).forEach(r => { if (r.default_container_id) u[r.default_container_id] = (u[r.default_container_id] || 0) + 1; });
      setUsage(u);
    })();
  }, [sb, tick]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || [])
      .filter(c => (!kindFilt || (c.kind || "other") === kindFilt))
      .filter(c => !term || `${c.name} ${c.sku} ${c.primary_supplier || c.supplier || ""}`.toLowerCase().includes(term))
      .sort((a, b) => sizeRank(a) - sizeRank(b) || String(a.name).localeCompare(String(b.name)));
  }, [rows, q, kindFilt]);

  async function save(draft) {
    if (!draft.name?.trim()) { setMsg("⚠ a name is required"); return; }
    setBusy(true);
    const num = v => v === "" || v == null ? null : +v;
    const payload = {
      name: draft.name.trim(), sku: draft.sku?.trim() || null, kind: draft.kind || "finished",
      material: draft.material?.trim() || null,
      diameter_in: num(draft.diameter_in), height_in: num(draft.height_in),
      volume_val: num(draft.volume_val), volume_unit: draft.volume_unit || null,
      substrate_vol: num(draft.substrate_vol), substrate_unit: draft.substrate_unit || null,
      fill_volume_cu_ft: num(draft.fill_volume_cu_ft), cells_per_flat: num(draft.cells_per_flat),
      cost_per_unit: num(draft.cost_per_unit),
      units_per_case: num(draft.units_per_case), qty_per_pallet: num(draft.qty_per_pallet),
      primary_supplier: draft.primary_supplier?.trim() || null, supplier2: draft.supplier2?.trim() || null,
      stock_qty: num(draft.stock_qty), stock_location: draft.stock_location?.trim() || null,
      has_wire: !!draft.has_wire, wire_cost: draft.has_wire ? num(draft.wire_cost) : null, wire_supplier: draft.has_wire ? (draft.wire_supplier?.trim() || null) : null, wire_sku: draft.has_wire ? (draft.wire_sku?.trim() || null) : null,
      has_carrier: !!draft.has_carrier, carrier_name: draft.has_carrier ? (draft.carrier_name?.trim() || null) : null, carrier_cost: draft.has_carrier ? num(draft.carrier_cost) : null, carrier_sku: draft.has_carrier ? (draft.carrier_sku?.trim() || null) : null, carrier_supplier: draft.has_carrier ? (draft.carrier_supplier?.trim() || null) : null, pots_per_carrier: draft.has_carrier ? num(draft.pots_per_carrier) : null,
      has_saucer: !!draft.has_saucer, saucer_cost: draft.has_saucer ? num(draft.saucer_cost) : null,
      has_sleeve: !!draft.has_sleeve, sleeve_cost: draft.has_sleeve ? num(draft.sleeve_cost) : null,
      is_hb_tagged: !!draft.is_hb_tagged, tag_cost_per_unit: draft.is_hb_tagged ? num(draft.tag_cost_per_unit) : null,
      notes: draft.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let err;
    if (draft.id) ({ error: err } = await sb.from("containers").update(payload).eq("id", draft.id));
    else ({ error: err } = await sb.from("containers").insert({ ...payload, id: crypto.randomUUID() }));
    if (err) { window.alert("Didn't save: " + err.message); setBusy(false); return; }
    setMsg(`✅ ${draft.id ? "saved" : "added"} ${payload.name}`);
    setBusy(false); setEdit(null); setTick(t => t + 1);
  }
  async function remove(c) {
    if (usage[c.id]) { window.alert(`${c.name} is used by ${usage[c.id]} famil${usage[c.id] === 1 ? "y" : "ies"} — re-point those to another container first (Pot Orders / family page).`); return; }
    if (!window.confirm(`Delete "${c.name}" from the catalog? This can't be undone.`)) return;
    setBusy(true);
    const { error } = await sb.from("containers").delete().eq("id", c.id);
    if (error) window.alert("Delete stopped: " + error.message);
    else setMsg(`🗑 ${c.name} deleted`);
    setBusy(false); setEdit(null); setTick(t => t + 1);
  }

  if (rows == null) return <div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>Loading the container catalog…</div>;
  const kindCount = k => (rows || []).filter(c => (c.kind || "other") === k).length;

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>🪴 Containers &amp; Hard Goods</div>
        <div style={{ fontSize: 12.5, color: C.muted }}>the master catalog — {rows.length} items · seasons pull price, soil, pallet &amp; supplier from here</div>
        <button onClick={() => setEdit({ kind: "finished", volume_unit: "gal", substrate_unit: "cu ft" })}
          style={{ marginLeft: "auto", padding: "9px 16px", borderRadius: 10, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>＋ New container</button>
      </div>
      {msg && <div style={{ fontSize: 12, color: C.green, fontWeight: 700, margin: "4px 0 8px" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search name / sku / supplier…"
          style={{ flex: 1, minWidth: 220, padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.creamBr}`, fontSize: 13, fontFamily: FONT }} />
        {KINDS.filter(([k]) => kindCount(k)).map(([k, l]) => (
          <button key={k} onClick={() => setKindFilt(f => f === k ? "" : k)}
            style={{ padding: "6px 11px", borderRadius: 16, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
              border: `1.5px solid ${kindFilt === k ? C.light : C.border}`, background: kindFilt === k ? "#eef6e8" : "#fff", color: kindFilt === k ? C.dark : C.muted }}>{l.split(" /")[0]} ({kindCount(k)})</button>
        ))}
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            {["Container", "Size", "Price", "Soil", "Case / pallet", "Supplier", "On hand"].map((h, i) => (
              <th key={h} style={{ textAlign: i > 1 ? "right" : "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px", borderBottom: `2px solid ${C.border}`, background: C.cream, whiteSpace: "nowrap", position: "sticky", top: 0 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {shown.map(c => {
              const td = { padding: "8px 10px", borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
              return (
                <tr key={c.id} onClick={() => setEdit(c)} style={{ cursor: "pointer" }}>
                  <td style={{ ...td, fontWeight: 700, color: C.dark }}>
                    {c.name}{c.sku ? <span style={{ color: C.muted, fontWeight: 500 }}> · {c.sku}</span> : ""}
                    <div style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>{KINDS.find(k => k[0] === (c.kind || "other"))?.[1] || c.kind}{usage[c.id] ? ` · used by ${usage[c.id]}` : ""}{c.cells_per_flat ? ` · ${c.cells_per_flat} cells` : ""}</div>
                  </td>
                  <td style={{ ...td, color: C.muted, whiteSpace: "nowrap" }}>{c.diameter_in ? `${c.diameter_in}"` : "—"}{c.volume_val ? ` · ${c.volume_val} ${c.volume_unit || ""}` : ""}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: c.cost_per_unit == null ? C.amber : C.text }}>{c.cost_per_unit == null ? "pending" : money(c.cost_per_unit)}</td>
                  <td style={{ ...td, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{c.substrate_vol ? `${c.substrate_vol} ${c.substrate_unit || "cu ft"}` : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{c.units_per_case ? `${c.units_per_case}/case` : ""}{c.qty_per_pallet ? `${c.units_per_case ? " · " : ""}${(+c.qty_per_pallet).toLocaleString()}/pal` : (c.units_per_case ? "" : "—")}</td>
                  <td style={{ ...td, textAlign: "right", color: C.muted, whiteSpace: "nowrap" }}>{c.primary_supplier || c.supplier || "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: c.stock_qty ? 700 : 400, color: c.stock_qty ? C.dark : C.muted }}>{c.stock_qty != null ? (+c.stock_qty).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan={7} style={{ padding: 20, color: C.muted }}>No containers match — clear the filter or ＋ add one.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && <EditPanel initial={edit} usage={usage[edit.id] || 0} onSave={save} onDelete={() => remove(edit)} onClose={() => setEdit(null)} busy={busy} />}
    </div>
  );
}

function EditPanel({ initial, usage, onSave, onDelete, onClose, busy }) {
  const [d, setD] = useState({ ...initial });
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  const lbl = { fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted, display: "block", marginBottom: 3 };
  const inp = { width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.creamBr}`, fontSize: 13, fontFamily: FONT };
  const F = ({ k, label, w, ph, unit, unitK, units }) => (
    <div style={{ minWidth: w || 110, flex: w ? "none" : 1 }}>
      <label style={lbl}>{label}</label>
      <div style={{ display: "flex", gap: 4 }}>
        <input value={d[k] ?? ""} onChange={e => set(k, e.target.value)} placeholder={ph || ""} style={inp} />
        {units && <select value={d[unitK] ?? ""} onChange={e => set(unitK, e.target.value)} style={{ ...inp, width: 78, padding: "7px 4px", cursor: "pointer" }}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select>}
      </div>
    </div>
  );
  const section = t => <div style={{ fontSize: 10.5, fontWeight: 800, color: C.dark, textTransform: "uppercase", letterSpacing: ".5px", margin: "14px 0 7px", borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }}>{t}</div>;
  const row = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
  const toggle = (k, label) => (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: C.text, cursor: "pointer" }}>
      <input type="checkbox" checked={!!d[k]} onChange={e => set(k, e.target.checked)} style={{ cursor: "pointer" }} /> {label}
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 14, width: "min(720px,96vw)", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.4)", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>{d.id ? "Edit container" : "New container"}</div>
          {usage > 0 && <span style={{ fontSize: 11, color: C.muted }}>used by {usage} famil{usage === 1 ? "y" : "ies"}</span>}
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {section("Identity")}
        <div style={row}>
          <div style={{ flex: 2, minWidth: 220 }}><label style={lbl}>Name *</label><input value={d.name ?? ""} onChange={e => set("name", e.target.value)} placeholder={`e.g. 4.5" Azalea Pot`} style={inp} /></div>
          <F k="sku" label="SKU" w={130} ph="vendor #" />
          <div style={{ minWidth: 150 }}><label style={lbl}>Kind</label>
            <select value={d.kind || "finished"} onChange={e => set("kind", e.target.value)} style={{ ...inp, cursor: "pointer" }}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <F k="material" label="Material" w={120} ph="plastic / fiber" />
        </div>

        {section("Size & soil")}
        <div style={row}>
          <F k="diameter_in" label="Diameter (in)" w={100} />
          <F k="height_in" label="Height (in)" w={100} />
          <F k="volume_val" label="Pot volume" w={150} units={["gal", "qt", "cu in", "L"]} unitK="volume_unit" />
          <F k="substrate_vol" label="🌱 Soil volume" w={160} units={["cu ft", "gal", "qt", "L"]} unitK="substrate_unit" />
          <F k="cells_per_flat" label="Cells / tray" w={90} ph="e.g. 18, 72" />
        </div>

        {section("Cost & ordering")}
        <div style={row}>
          <F k="cost_per_unit" label="💲 Price each" w={110} ph="0.00" />
          <F k="units_per_case" label="Per case" w={90} />
          <F k="qty_per_pallet" label="Per pallet" w={100} ph="e.g. 14400" />
          <F k="primary_supplier" label="Supplier" w={150} />
          <F k="supplier2" label="Alt supplier" w={140} />
        </div>

        {section("On-hand inventory")}
        <div style={row}>
          <F k="stock_qty" label="On hand" w={110} />
          <F k="stock_location" label="Location" w={180} ph="where it's stored" />
        </div>

        {section("Bundled hard goods (optional)")}
        <div style={{ display: "grid", gap: 8 }}>
          <div>{toggle("has_wire", "🪝 Wire / hanger (per unit)")}
            {d.has_wire && <div style={{ ...row, marginTop: 6 }}><F k="wire_cost" label="Wire $" w={90} /><F k="wire_supplier" label="Supplier" w={150} /><F k="wire_sku" label="SKU" w={140} /></div>}</div>
          <div>{toggle("has_carrier", "🥡 Carrier / flat / tray (shared across N units)")}
            {d.has_carrier && <div style={{ ...row, marginTop: 6 }}><F k="carrier_name" label="Carrier name" w={170} /><F k="pots_per_carrier" label="Units / carrier" w={100} ph="e.g. 10" /><F k="carrier_cost" label="Carrier $" w={90} /><F k="carrier_supplier" label="Supplier" w={140} /><F k="carrier_sku" label="SKU" w={130} /></div>}</div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <div>{toggle("has_saucer", "Saucer")}{d.has_saucer && <F k="saucer_cost" label="Saucer $" w={90} />}</div>
            <div>{toggle("has_sleeve", "Sleeve")}{d.has_sleeve && <F k="sleeve_cost" label="Sleeve $" w={90} />}</div>
            <div>{toggle("is_hb_tagged", "Tag")}{d.is_hb_tagged && <F k="tag_cost_per_unit" label="Tag $" w={90} />}</div>
          </div>
        </div>

        {section("Notes")}
        <textarea value={d.notes ?? ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="anything worth remembering — placeholder status, quote pending, spec details…"
          style={{ ...inp, resize: "vertical", fontFamily: FONT }} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16 }}>
          {d.id && <button onClick={onDelete} disabled={busy} style={{ padding: "9px 14px", borderRadius: 9, border: `1.5px solid ${C.red}`, background: "#fff", color: C.red, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>🗑 Delete</button>}
          <span style={{ marginLeft: "auto" }} />
          <button onClick={onClose} style={{ padding: "9px 16px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: "#fff", color: C.text, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          <button onClick={() => onSave(d)} disabled={busy || !d.name?.trim()} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: d.name?.trim() ? C.light : "#c9d4c2", color: "#fff", fontWeight: 800, fontSize: 13, cursor: d.name?.trim() ? "pointer" : "default", fontFamily: FONT }}>{busy ? "Saving…" : d.id ? "Save" : "Add container"}</button>
        </div>
      </div>
    </div>
  );
}
