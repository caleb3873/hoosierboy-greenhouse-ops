// ProgramBuilder — start a NEW program (e.g. the Perennial Program) inside the
// projection session and keep adding items to it.
//
// Sales vs Plan covers what was grown last year; this is where the line that
// has no history gets invented. Items are intentions with real costed material
// (searched from the 39k-row sourcing db), not plan rows — production converts
// an approved program into scheduled_crops later.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", border: "#dfe7d8", muted: "#7a8c74",
  text: "#2f3b2a", red: "#c0392b", amber: "#c98a2e", green: "#2e7d32", card: "#fff" };
const money = n => n == null ? "—" : (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${(+n).toFixed(2)}`);

export default function ProgramsPanel({ plan }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [items, setItems] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data: pr } = await sb.from("plan_programs").select("*").eq("plan_id", plan.id).order("created_at");
    setPrograms(pr || []);
    const ids = (pr || []).map(p => p.id);
    if (ids.length) {
      const { data: it } = await sb.from("program_items").select("*").in("program_id", ids).order("sort");
      setItems(it || []);
    } else setItems([]);
  }
  useEffect(() => { load(); }, [plan.id]); // eslint-disable-line

  async function createProgram() {
    const name = newName.trim();
    if (!name) return;
    const { error } = await sb.from("plan_programs").insert({ id: crypto.randomUUID(), plan_id: plan.id, name, created_by: displayName || "planner" });
    if (error) { window.alert(error.message.includes("duplicate") ? "A program with that name already exists on this plan." : error.message); return; }
    setNewName(""); setNaming(false);
    await load();
    const created = (await sb.from("plan_programs").select("id").eq("plan_id", plan.id).eq("name", name).single()).data;
    if (created) setOpenId(created.id);
  }

  if (!programs.length && !naming) {
    return (
      <div style={{ background: C.card, border: `1px dashed ${C.border}`, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>Planning a line with no history — a perennial program, a new size, a new category?</span>
        <button onClick={() => setNaming(true)} style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, border: "none", background: C.dark, color: "#c8e6b8", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ＋ Start a new program
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.light}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.dark }}>🌱 New programs</span>
        <span style={{ fontSize: 11.5, color: C.muted }}>lines with no history — invented here, handed to production when approved</span>
        {!naming && <button onClick={() => setNaming(true)} style={{ marginLeft: "auto", padding: "5px 11px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>＋ New program</button>}
      </div>
      {naming && (
        <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
          <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createProgram(); if (e.key === "Escape") setNaming(false); }}
            placeholder="Program name — e.g. Perennial Program"
            style={{ flex: 1, padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.light}`, fontSize: 13, fontFamily: "inherit" }} />
          <button onClick={createProgram} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: C.dark, color: "#c8e6b8", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Create</button>
          <button onClick={() => setNaming(false)} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      )}

      {programs.map(pr => {
        const its = items.filter(i => i.program_id === pr.id);
        const units = its.reduce((a, i) => a + (+i.target_units || 0), 0);
        const rev = its.reduce((a, i) => a + (+i.target_units || 0) * (+i.target_price || 0), 0);
        const cost = its.reduce((a, i) => a + (+i.target_units || 0) * (+i.est_unit_cost || 0), 0);
        const open = openId === pr.id;
        return (
          <div key={pr.id} style={{ border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: 8, background: "#fbfdfa" }}>
            <div onClick={() => setOpenId(open ? null : pr.id)}
              style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "10px 13px", cursor: "pointer", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14.5, color: C.dark }}>{open ? "▾" : "▸"} {pr.name}</b>
              <span style={{ fontSize: 12, color: C.muted }}>{its.length} items · {units.toLocaleString()} units</span>
              {rev > 0 && <span style={{ fontSize: 12, color: C.text }}>proj. {money(rev)}{cost > 0 && <> · material {money(cost)} · <b style={{ color: (rev - cost) / rev < 0.6 ? C.red : C.green }}>{Math.round((rev - cost) / rev * 100)}% direct</b></>}</span>}
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", color: pr.status === "approved" ? C.green : C.muted }}>{pr.status}</span>
            </div>
            {open && <ProgramDetail sb={sb} program={pr} items={its} onChange={load} />}
          </div>
        );
      })}
    </div>
  );
}

function ProgramDetail({ sb, program, items, onChange }) {
  const [adding, setAdding] = useState(false);

  async function patchItem(id, patch) {
    await sb.from("program_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    onChange();
  }
  async function delItem(id) { await sb.from("program_items").delete().eq("id", id); onChange(); }
  async function setStatus(status) { await sb.from("plan_programs").update({ status, updated_at: new Date().toISOString() }).eq("id", program.id); onChange(); }
  async function delProgram() {
    if (!window.confirm(`Delete "${program.name}" and its ${items.length} item(s)?`)) return;
    await sb.from("plan_programs").delete().eq("id", program.id); onChange();
  }

  const inp = { padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit", background: "#fff" };
  return (
    <div style={{ padding: "0 13px 12px" }}>
      {items.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 8 }}>
          <thead><tr>
            {["Item", "Size", "Units", "Price", "Material", "Cost/unit", "Margin", ""].map((h, i) => (
              <th key={i} style={{ textAlign: i >= 2 && i <= 6 ? "right" : "left", padding: "4px 8px", fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {items.map(it => {
              const gm = it.target_price && it.est_unit_cost ? (it.target_price - it.est_unit_cost) / it.target_price : null;
              return (
                <tr key={it.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{it.item_name}</td>
                  <td style={{ padding: "5px 8px", color: C.muted }}>{it.size || "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <input defaultValue={it.target_units ?? ""} inputMode="numeric" style={{ ...inp, width: 62, textAlign: "right" }}
                      onBlur={e => { const n = parseInt(e.target.value.replace(/\D/g, "")); if (!isNaN(n) && n !== it.target_units) patchItem(it.id, { target_units: n }); }} />
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <input defaultValue={it.target_price ?? ""} inputMode="decimal" style={{ ...inp, width: 62, textAlign: "right" }}
                      onBlur={e => { const n = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); if (!isNaN(n) && n !== +it.target_price) patchItem(it.id, { target_price: n }); }} />
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 11.5, color: C.muted }}>
                    {it.material ? `${it.material.variety || ""}${it.ppp > 1 ? ` ×${it.ppp}` : ""} (${[it.material.broker, it.material.supplier].filter(Boolean).join("/")})` : "—"}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{money(it.est_unit_cost)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: gm == null ? C.muted : gm < 0.6 ? C.red : C.green }}>{gm == null ? "—" : Math.round(gm * 100) + "%"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <button onClick={() => delItem(it.id)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {adding
        ? <AddProgramItem sb={sb} program={program} onDone={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />
        : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setAdding(true)} style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ Add item</button>
            {program.status === "planning" && <button onClick={() => setStatus("approved")} style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${C.green}`, background: "#fff", color: C.green, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✓ Approve — hand to production</button>}
            {program.status === "approved" && <button onClick={() => setStatus("planning")} style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↩ Back to planning</button>}
            <button onClick={delProgram} style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 8, border: "none", background: "none", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Delete program</button>
          </div>
        )}
    </div>
  );
}

// New item: name it, size it, target it — and cost it from the real sourcing db.
function AddProgramItem({ sb, program, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [units, setUnits] = useState("");
  const [price, setPrice] = useState("");
  const [ppp, setPpp] = useState("1");
  const [mat, setMat] = useState(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 3) { setHits([]); return; }
      const { data } = await sb.from("v_sourcing_prices")
        .select("crop,variety,broker,supplier,form_class,landed,variety_key")
        .or(`variety.ilike.%${term}%,crop.ilike.%${term}%`).limit(30);
      setHits((data || []).sort((a, b) => (+a.landed || 9) - (+b.landed || 9)));
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  async function save() {
    if (!name.trim()) return;
    const estCost = mat && mat.landed ? (+mat.landed) * (parseInt(ppp) || 1) : null;
    await sb.from("program_items").insert({
      id: crypto.randomUUID(), program_id: program.id,
      item_name: name.trim(), size: size.trim() || null,
      target_units: units ? parseInt(units) : null,
      target_price: price ? parseFloat(price) : null,
      ppp: parseInt(ppp) || 1,
      material: mat ? { variety: mat.variety, crop: mat.crop, broker: mat.broker, supplier: mat.supplier, form: mat.form_class, landed: +mat.landed || null, variety_key: mat.variety_key } : null,
      est_unit_cost: estCost,
      sort: Date.now() % 100000,
    });
    onDone();
  }

  const inp = { padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder='Item — e.g. 1 GAL SALVIA MAY NIGHT' style={{ ...inp, flex: 2, minWidth: 220 }} />
        <input value={size} onChange={e => setSize(e.target.value)} placeholder="Size — 1 GAL" style={{ ...inp, width: 110 }} />
        <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="Units" style={{ ...inp, width: 84 }} />
        <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="Price $" style={{ ...inp, width: 84 }} />
        <input value={ppp} onChange={e => setPpp(e.target.value)} inputMode="numeric" title="plants per pot" placeholder="ppp" style={{ ...inp, width: 60 }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder={mat ? `Material: ${mat.variety} — ${money(+mat.landed)} (${mat.broker}) — search to change` : "🔍 cost it from the sourcing catalog — crop or variety…"}
          style={{ ...inp, width: "100%", borderColor: mat ? C.light : C.border }} />
        {hits.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 170, overflow: "auto" }}>
            {hits.map((h, i) => (
              <div key={i} onClick={() => { setMat(h); setQ(""); setHits([]); if (!name.trim() && h.variety) setName(`${size ? size + " " : ""}${h.variety.toUpperCase()}`); }}
                style={{ display: "flex", gap: 8, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                <b style={{ flex: 1 }}>{h.variety}</b>
                <span style={{ color: C.muted }}>{h.crop} · {h.form_class} · {[h.broker, h.supplier].filter(Boolean).join("/")}</span>
                <b style={{ color: C.green }}>{money(+h.landed)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={save} disabled={!name.trim()}
          style={{ flex: 1, padding: "8px 13px", borderRadius: 8, border: "none", background: name.trim() ? C.dark : "#c8d8c0", color: "#c8e6b8", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Add to {program.name}
        </button>
      </div>
    </div>
  );
}
