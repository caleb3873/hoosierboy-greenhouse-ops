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

  // Approved program → real plan rows → the B2B reconcile absorbs them like any
  // other plan edit. Varieties that don't exist in the library yet are created
  // (new perennials won't be there — that's expected, not an error).
  async function convertProgram(pr) {
    const its = items.filter(i => i.program_id === pr.id && !i.scheduled_crop_id);
    const ready = its.filter(i => i.container_id && (+i.target_units > 0));
    const skipped = its.length - ready.length;
    if (!ready.length) { window.alert("Nothing convertible — items need a finished size and target units."); return; }
    if (!window.confirm(`Create ${ready.length} plan item(s) from "${pr.name}"?${skipped ? ` (${skipped} skipped — missing size or units)` : ""}\n\nBenches and plant weeks stay empty for the production session. The B2B catalog absorbs them as draft profiles automatically.`)) return;
    const FORM_MAP = { urc: "URC", callused: "CALL", plug: "PLUG", liner: "PLUG", bareroot: "BULB", seed: "SEED" };
    for (const it of ready) {
      const cropName = (it.material?.crop || "").trim() || "Perennial";
      let varName = (it.material?.variety || it.item_name).trim();
      const cw = cropName.toLowerCase();
      if (varName.toLowerCase().startsWith(cw)) varName = varName.slice(cropName.length).trim() || varName;
      let { data: v } = await sb.from("variety_library").select("id")
        .ilike("crop_name", cropName).ilike("variety", varName).limit(1);
      let varietyId = v && v[0] ? v[0].id : null;
      if (!varietyId) {
        varietyId = crypto.randomUUID();
        const { error: ve } = await sb.from("variety_library").insert({
          id: varietyId, crop_name: cropName, variety: varName,
          breeder: it.material?.supplier || null,
          notes: `created from program "${pr.name}"`,
        });
        if (ve) { window.alert(`Variety for ${it.item_name}: ${ve.message}`); continue; }
      }
      const rowId = crypto.randomUUID();
      const { error } = await sb.from("scheduled_crops").insert({
        id: rowId, plan_id: plan.id, item_name: it.item_name,
        variety_id: varietyId, container_id: it.container_id,
        qty_pots: +it.target_units, ppp: +it.ppp || 1, pack_size: 1,
        sale_price_per_pot: it.target_price ?? null,
        liner_unit_cost: it.material?.landed ?? null,
        broker: it.material?.broker ?? null, supplier: it.material?.supplier ?? null,
        prop_method: FORM_MAP[String(it.material?.form || "").toLowerCase()] || null,
        is_combo_component: false, sellable: true, status: "planned",
        notes: `from program: ${pr.name}`,
      });
      if (error) { window.alert(`${it.item_name}: ${error.message}`); continue; }
      await sb.from("program_items").update({ scheduled_crop_id: rowId }).eq("id", it.id);
    }
    await sb.from("plan_programs").update({ status: "building", updated_at: new Date().toISOString() }).eq("id", pr.id);
    // absorb into B2B now rather than waiting for the next cron tick
    try { await sb.rpc("reconcile_production_items", { p_plan: plan.id }); } catch { /* cron will catch it */ }
    await load();
    window.alert(`${ready.length} item(s) are now in the plan and the B2B catalog (as drafts). Benches + plant weeks are the production session's job.`);
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
            {open && <ProgramDetail sb={sb} program={pr} items={its} onChange={load} onConvert={() => convertProgram(pr)} />}
          </div>
        );
      })}
    </div>
  );
}

function ProgramDetail({ sb, program, items, onChange, onConvert }) {
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
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{it.item_name}{it.scheduled_crop_id && <span title="already in the plan + B2B catalog" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: C.green }}>✓ IN PLAN</span>}{it.sku && <div style={{ fontFamily: "monospace", fontSize: 10.5, fontWeight: 400, color: C.muted }}>{it.sku}</div>}</td>
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
        ? <AddProgramItem sb={sb} program={program} itemCount={items.length} onDone={() => { setAdding(false); onChange(); }} onCancel={() => setAdding(false)} />
        : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setAdding(true)} style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ Add item</button>
            {program.status === "planning" && <button onClick={() => setStatus("approved")} style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${C.green}`, background: "#fff", color: C.green, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✓ Approve — hand to production</button>}
            {program.status === "approved" && <button onClick={onConvert} style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.dark, color: "#c8e6b8", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>→ Create plan items ({items.filter(i => !i.scheduled_crop_id && i.container_id && +i.target_units > 0).length})</button>}
            {program.status === "approved" && <button onClick={() => setStatus("planning")} style={{ padding: "7px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↩ Back to planning</button>}
            <button onClick={delProgram} style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 8, border: "none", background: "none", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Delete program</button>
          </div>
        )}
    </div>
  );
}

// New item, built from real data: species → variety → finished size.
// Name and SKU generate themselves; cost = liner×ppp + container + soil.
function AddProgramItem({ sb, program, itemCount, onDone, onCancel }) {
  const [crops, setCrops] = useState([]);
  const [crop, setCrop] = useState("");
  const [vars, setVars] = useState([]);
  const [mat, setMat] = useState(null);          // chosen variety row (cheapest source)
  const [containers, setContainers] = useState([]);
  const [contId, setContId] = useState("");
  const [soil, setSoil] = useState(null);        // {name, perCuFt}
  const [ppp, setPpp] = useState("1");
  const [units, setUnits] = useState("");
  const [price, setPrice] = useState("");
  const [nameOverride, setNameOverride] = useState(null);

  useEffect(() => { (async () => {
    const { data: c } = await sb.from("v_sourcing_crops").select("*").order("varieties", { ascending: false }).limit(500);
    setCrops(c || []);
    const { data: k } = await sb.from("containers").select("id,name,cost_per_unit,fill_volume_cu_ft").order("name");
    setContainers(k || []);
    const { data: sm } = await sb.from("soil_mixes").select("name,cost_per_bag,fluffed_volume");
    const priced = (sm || []).filter(x => +x.cost_per_bag > 0 && +x.fluffed_volume > 0)
      .map(x => ({ name: x.name, perCuFt: +x.cost_per_bag / +x.fluffed_volume }))
      .sort((a, b) => a.perCuFt - b.perCuFt);
    setSoil(priced.find(x => /BM5/i.test(x.name)) || priced[0] || null);
  })(); }, []); // eslint-disable-line

  useEffect(() => { (async () => {
    setMat(null); setVars([]);
    if (!crop) return;
    const { data } = await sb.from("v_sourcing_prices")
      .select("crop,variety,broker,supplier,form_class,landed,variety_key")
      .ilike("crop", crop).order("landed").limit(1000);
    // one row per variety, cheapest source wins
    const seen = new Map();
    (data || []).forEach(r => { if (!seen.has(r.variety_key)) seen.set(r.variety_key, r); });
    setVars([...seen.values()].sort((a, b) => (a.variety || "").localeCompare(b.variety || "")));
  })(); }, [crop]); // eslint-disable-line

  const cont = containers.find(c => c.id === contId) || null;
  const sizeLabel = useMemo(() => {
    if (!cont) return null;
    const g = String(cont.name).match(/(\d+(?:\.\d+)?)\s*gal/i);
    if (g) return `${g[1]} GAL`;
    const n = String(cont.name).match(/\d+(\.\d+)?/);
    return n ? `${parseFloat(n[0])}"` : cont.name;
  }, [cont]);

  const itemName = nameOverride ?? (mat && sizeLabel ? `${sizeLabel} ${String(mat.variety).toUpperCase()}` : "");
  const sku = useMemo(() => {
    if (!mat || !sizeLabel) return null;
    const pgm = (program.name.match(/[A-Za-z]+/) || ["PGM"])[0].slice(0, 3).toUpperCase();
    const g = sizeLabel.includes("GAL") ? sizeLabel.replace(/[^0-9]/g, "") + "G"
      : String(Math.floor(parseFloat(sizeLabel))).padStart(2, "0");
    const crop3 = (crop.match(/[A-Za-z]+/) || ["XXX"])[0].slice(0, 3).toUpperCase();
    return `${pgm}${g}${crop3}${String(itemCount + 1).padStart(3, "0")}`;
  }, [mat, sizeLabel, crop, program.name, itemCount]);

  const parts = useMemo(() => {
    const liner = mat && mat.landed ? (+mat.landed) * (parseInt(ppp) || 1) : null;
    const container = cont && +cont.cost_per_unit > 0 ? +cont.cost_per_unit : null;
    const soilCost = cont && soil && +cont.fill_volume_cu_ft > 0 ? +cont.fill_volume_cu_ft * soil.perCuFt : null;
    const total = (liner || 0) + (container || 0) + (soilCost || 0);
    return { liner, container, soil: soilCost, total: total > 0 ? total : null };
  }, [mat, cont, soil, ppp]);
  const gm = parts.total && price && parseFloat(price) > 0 ? (parseFloat(price) - parts.total) / parseFloat(price) : null;

  async function save() {
    if (!itemName.trim()) return;
    await sb.from("program_items").insert({
      id: crypto.randomUUID(), program_id: program.id,
      item_name: itemName.trim(), size: sizeLabel, sku,
      container_id: contId || null,
      target_units: units ? parseInt(units) : null,
      target_price: price ? parseFloat(price) : null,
      ppp: parseInt(ppp) || 1,
      material: mat ? { variety: mat.variety, crop, broker: mat.broker, supplier: mat.supplier, form: mat.form_class, landed: +mat.landed || null, variety_key: mat.variety_key } : null,
      est_unit_cost: parts.total, cost_parts: { liner: parts.liner, container: parts.container, soil: parts.soil, soil_mix: soil?.name || null },
      sort: Date.now() % 100000,
    });
    onDone();
  }

  const inp = { padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 3 };
  return (
    <div style={{ background: "#fff", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 170 }}>
          <span style={lab}>Species</span>
          <select value={crop} onChange={e => { setCrop(e.target.value); setNameOverride(null); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">Choose…</option>
            {crops.map(c => <option key={c.crop} value={c.crop}>{c.crop} ({c.varieties})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 220, flex: 1 }}>
          <span style={lab}>Variety {crop && vars.length ? `(${vars.length})` : ""}</span>
          <select value={mat ? mat.variety_key : ""} disabled={!crop}
            onChange={e => { setMat(vars.find(v => v.variety_key === e.target.value) || null); setNameOverride(null); }}
            style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">{crop ? "Choose…" : "pick a species first"}</option>
            {vars.map(v => <option key={v.variety_key} value={v.variety_key}>{v.variety} — {money(+v.landed)} ({v.broker})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 190 }}>
          <span style={lab}>Finished size (container library)</span>
          <select value={contId} onChange={e => { setContId(e.target.value); setNameOverride(null); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">Choose…</option>
            {containers.map(c => <option key={c.id} value={c.id}>{c.name}{+c.cost_per_unit > 0 ? ` — ${money(+c.cost_per_unit)}` : ""}</option>)}
          </select>
        </div>
        <div style={{ width: 62 }}><span style={lab}>PPP</span><input value={ppp} onChange={e => setPpp(e.target.value)} inputMode="numeric" style={{ ...inp, width: "100%" }} /></div>
        <div style={{ width: 84 }}><span style={lab}>Units</span><input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" style={{ ...inp, width: "100%" }} /></div>
        <div style={{ width: 84 }}><span style={lab}>Price $</span><input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
      </div>

      {(itemName || sku) && (
        <div style={{ background: "#f4f7f1", border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <input value={itemName} onChange={e => setNameOverride(e.target.value)}
            style={{ ...inp, fontWeight: 800, minWidth: 240, flex: 1 }} title="Generated — edit if needed" />
          {sku && <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.dark, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 9px" }}>{sku}</span>}
          {parts.total != null && (
            <span style={{ fontSize: 12.5, color: C.text }}>
              💰 {parts.liner != null && <>liner {money(parts.liner)}</>}
              {parts.container != null && <> + pot {money(parts.container)}</>}
              {parts.soil != null && <> + soil {money(parts.soil)}</>}
              {" = "}<b style={{ fontSize: 14 }}>{money(parts.total)}</b>
              {gm != null && <> · <b style={{ color: gm < 0.6 ? C.red : C.green }}>{Math.round(gm * 100)}%</b> @ {money(parseFloat(price))}</>}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        <button onClick={save} disabled={!itemName.trim()}
          style={{ flex: 1, padding: "8px 13px", borderRadius: 8, border: "none", background: itemName.trim() ? C.dark : "#c8d8c0", color: "#c8e6b8", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Add to {program.name}
        </button>
      </div>
    </div>
  );
}
