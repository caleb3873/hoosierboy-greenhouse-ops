// ProgramBuilder — start a NEW program (e.g. the Perennial Program) inside the
// projection session and keep adding items to it.
//
// Sales vs Plan covers what was grown last year; this is where the line that
// has no history gets invented. Items are intentions with real costed material
// (searched from the 39k-row sourcing db), not plan rows — production converts
// an approved program into scheduled_crops later.
import { useEffect, useMemo, useState } from "react";
import { getSupabase, getCultureClient } from "./supabase";
import { useAuth } from "./Auth";
import { makeKey, GENUS_SYN } from "./brokerKey";

// One genus, one name. The culture db and the brokers disagree on botanical vs
// common ("Sage" at Danziger, "Salvia" everywhere else) — makeKey already
// collapses them for matching; this collapses them for HUMANS. Values are what
// we call the crop; anything makeKey canonicalizes to the same genus token
// files under it.
const canonGenus = n => { const t = String(n || "").trim().toLowerCase(); return GENUS_SYN[t] || t; };
const GENUS_DISPLAY = { sage: "Salvia", mint: "Mentha", thyme: "Thymus", rosemary: "Rosemary", basil: "Basil" };

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
        let vkey = null; try { vkey = makeKey(cropName, null, varName) || null; } catch { /* cron backfills */ }
        const { error: ve } = await sb.from("variety_library").insert({
          id: varietyId, crop_name: cropName, variety: varName,
          variety_key: vkey,
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
  const [editing, setEditing] = useState(null);   // item open in the editor modal

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
                <tr key={it.id} onClick={() => setEditing(it)} title="view / edit — sourcing details, quantities, quote"
                  style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{it.item_name}{it.scheduled_crop_id && <span title="already in the plan + B2B catalog" style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: C.green }}>✓ IN PLAN</span>}{it.sku && <div style={{ fontFamily: "monospace", fontSize: 10.5, fontWeight: 400, color: C.muted }}>{it.sku}</div>}</td>
                  <td style={{ padding: "5px 8px", color: C.muted }}>{it.size || "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{it.target_units != null ? (+it.target_units).toLocaleString() : "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{it.target_price != null ? money(+it.target_price) : "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontSize: 11.5, color: C.muted }}>
                    {it.material ? `${it.material.variety || ""}${it.ppp > 1 ? ` ×${it.ppp}` : ""} (${[it.material.broker, it.material.supplier].filter(Boolean).join("/")})` : "—"}
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>{money(it.est_unit_cost)}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: gm == null ? C.muted : gm < 0.6 ? C.red : C.green }}>{gm == null ? "—" : Math.round(gm * 100) + "%"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <button onClick={e => { e.stopPropagation(); delItem(it.id); }} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontWeight: 800 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && <ItemEditorModal sb={sb} item={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onChange(); }} />}
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

// New item, Caleb's flow: Annual/Perennial → species → breeder → variety
// (with culture on file) → size from our containers → quantity.
// The culture DB drives the lookup; the sourcing catalog attaches the price.
function AddProgramItem({ sb, program, itemCount, onDone, onCancel }) {
  const cc = getCultureClient();
  const [corpus, setCorpus] = useState(null);   // light rows from culture_guides_public
  const [ptype, setPtype] = useState("");
  const [crop, setCrop] = useState("");
  const [breeder, setBreeder] = useState("");
  const [varId, setVarId] = useState("");
  const [culture, setCulture] = useState(null);  // full record for the modal
  const [mat, setMat] = useState(null);          // matched sourcing price
  const [matNote, setMatNote] = useState("");
  const [matKey, setMatKey] = useState(null);    // canonical key of the chosen variety
  const [showQuotes, setShowQuotes] = useState(false);
  const [containers, setContainers] = useState([]);
  const [contId, setContId] = useState("");
  const [soil, setSoil] = useState(null);
  const [stick, setStick] = useState(0);   // cost_settings.urc_stick_cost
  const [ppp, setPpp] = useState("1");
  const [units, setUnits] = useState("");
  const [price, setPrice] = useState("");
  const [nameOverride, setNameOverride] = useState(null);

  useEffect(() => { (async () => {
    if (cc) {
      let out = [], from = 0;
      for (;;) {
        const { data } = await cc.from("culture_guides_public")
          .select("id,category,crop_name,breeder_name,series_name,series_variety").range(from, from + 999);
        out = out.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      setCorpus(out);
    } else setCorpus([]);
    const { data: k } = await sb.from("containers").select("id,name,cost_per_unit,fill_volume_cu_ft,cells_per_flat,has_carrier,carrier_name,carrier_cost,pots_per_carrier,case_size").order("name");
    const { data: cs } = await sb.from("cost_settings").select("value").eq("key", "urc_stick_cost");
    setStick(+(cs?.[0]?.value) || 0);
    setContainers(k || []);
    const { data: sm } = await sb.from("soil_mixes").select("name,cost_per_bag,fluffed_volume");
    const priced = (sm || []).filter(x => +x.cost_per_bag > 0 && +x.fluffed_volume > 0)
      .map(x => ({ name: x.name, perCuFt: +x.cost_per_bag / +x.fluffed_volume })).sort((a, b) => a.perCuFt - b.perCuFt);
    setSoil(priced.find(x => /BM5/i.test(x.name)) || priced[0] || null);
  })(); }, []); // eslint-disable-line

  // cascades, each narrowed by the choices above it
  const lc = v => String(v || "").trim();
  // crop dropdown values are CANONICAL genus tokens so "Sage" and "Salvia" are one entry
  const pool = useMemo(() => (corpus || []).filter(r =>
    (!ptype || lc(r.category).toLowerCase() === ptype) &&
    (!crop || canonGenus(r.crop_name) === crop) &&
    (!breeder || lc(r.breeder_name) === breeder)), [corpus, ptype, crop, breeder]);
  const cropOpts = useMemo(() => {
    const m = new Map();   // canon → { display, count, names: raw-name tally }
    (corpus || []).filter(r => !ptype || lc(r.category).toLowerCase() === ptype)
      .forEach(r => {
        const raw = lc(r.crop_name); if (!raw) return;
        const k = canonGenus(raw);
        const e = m.get(k) || { count: 0, names: new Map() };
        e.count++; e.names.set(raw, (e.names.get(raw) || 0) + 1);
        m.set(k, e);
      });
    return [...m.entries()].map(([k, e]) => {
      const display = GENUS_DISPLAY[k] || [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return [k, e.count, display];
    }).sort((a, b) => a[2].localeCompare(b[2]));
  }, [corpus, ptype]);
  const cropDisplay = useMemo(() => {
    const m = {}; cropOpts.forEach(([k, , d]) => { m[k] = d; }); return m;
  }, [cropOpts]);
  const breederOpts = useMemo(() => {
    const m = new Map();
    (corpus || []).filter(r => (!ptype || lc(r.category).toLowerCase() === ptype) && (!crop || canonGenus(r.crop_name) === crop))
      .forEach(r => { const k = lc(r.breeder_name); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [corpus, ptype, crop]);
  const varOpts = useMemo(() => pool
    .map(r => ({ id: r.id, label: [lc(r.series_name), lc(r.series_variety)].filter(Boolean).join(" ") || lc(r.crop_name) }))
    .filter(v => v.label).sort((a, b) => a.label.localeCompare(b.label)), [pool]);
  const chosen = (corpus || []).find(r => r.id === varId) || null;

  // culture on file for the chosen variety
  async function openCulture() {
    if (!cc || !chosen) return;
    const { data } = await cc.from("culture_guides_public")
      .select("*").eq("id", chosen.id).single();
    setCulture(data || {});
  }

  // price from the sourcing catalog once a variety is chosen — EXACT key join
  // first (same normalizer that keys broker_prices, so Danziger "Sage May
  // Night" lands on the Salvia quotes), fuzzy name-scoring only as fallback
  useEffect(() => { (async () => {
    setMat(null); setMatNote("");
    if (!chosen) return;
    const series = lc(chosen.series_name), varn = lc(chosen.series_variety);
    const cols = "crop,variety,broker,supplier,form_class,form_raw,landed,variety_key";
    let key = null;
    try { key = makeKey(chosen.crop_name, null, [series, varn].filter(Boolean).join(" ") || chosen.crop_name); } catch { /* fall through to fuzzy */ }
    setMatKey(key);
    if (key) {
      const { data: exact } = await sb.from("broker_prices").select(cols).eq("season", QUOTE_SEASON).eq("variety_key", key).gt("landed", 0).limit(50);
      if (exact && exact.length) {
        const cheapest = [...exact].sort((a, b) => (+a.landed || 9e9) - (+b.landed || 9e9))[0];
        setMat(cheapest); setMatNote("");
        return;
      }
    }
    let q = sb.from("v_sourcing_prices").select(cols).limit(200);
    q = series ? q.ilike("variety", `%${series}%`) : q.ilike("crop", `%${cropDisplay[canonGenus(chosen.crop_name)] || lc(chosen.crop_name)}%`);
    const { data } = await q;
    const toks = varn.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = (data || []).map(r => ({ r,
      score: toks.filter(w => String(r.variety).toLowerCase().includes(w)).length }))
      .sort((a, b) => b.score - a.score || (+a.r.landed || 9) - (+b.r.landed || 9));
    const best = scored[0];
    // the exact key already missed, so anything from here is a guess — say so.
    // NEVER attach a zero-score row (that's how an ivy once wore a begonia's price).
    if (best && best.score > 0) { setMat(best.r); setMatNote("closest match — verify"); }
    else setMatNote("no close match — 🔍 search the quotes");
  })(); }, [varId]); // eslint-disable-line

  const cont = containers.find(c => c.id === contId) || null;
  const sizeLabel = useMemo(() => {
    if (!cont) return null;
    const g = String(cont.name).match(/(\d+(?:\.\d+)?)\s*gal/i);
    if (g) return `${g[1]} GAL`;
    const n = String(cont.name).match(/\d+(\.\d+)?/);
    return n ? `${parseFloat(n[0])}"` : cont.name;
  }, [cont]);

  const varietyText = chosen ? [lc(chosen.series_name), lc(chosen.series_variety)].filter(Boolean).join(" ") : "";
  // item names use OUR name for the genus (Salvia), whatever the breeder calls it (Sage)
  const cropWord = chosen ? (cropDisplay[canonGenus(chosen.crop_name)] || lc(chosen.crop_name)) : (cropDisplay[crop] || crop);
  const fullVariety = varietyText.toLowerCase().includes(cropWord.toLowerCase()) ? varietyText : `${cropWord} ${varietyText}`.trim();
  const itemName = nameOverride ?? (chosen && sizeLabel ? `${sizeLabel} ${fullVariety.toUpperCase()}` : "");
  const sku = useMemo(() => {
    if (!chosen || !sizeLabel) return null;
    const pgm = (program.name.match(/[A-Za-z]+/) || ["PGM"])[0].slice(0, 3).toUpperCase();
    const g = sizeLabel.includes("GAL") ? sizeLabel.replace(/[^0-9]/g, "") + "G"
      : String(Math.floor(parseFloat(sizeLabel))).padStart(2, "0");
    const crop3 = (cropWord.match(/[A-Za-z]+/) || ["XXX"])[0].slice(0, 3).toUpperCase();
    return `${pgm}${g}${crop3}${String(itemCount + 1).padStart(3, "0")}`;
  }, [chosen, sizeLabel, cropWord, program.name, itemCount]);

  const parts = useMemo(() => {
    const liner = mat && mat.landed ? (+mat.landed) * (parseInt(ppp) || 1) : null;
    const container = cont && +cont.cost_per_unit > 0 ? +cont.cost_per_unit : null;
    const soilCost = cont && soil && +cont.fill_volume_cu_ft > 0 ? +cont.fill_volume_cu_ft * soil.perCuFt : null;
    // pots that ship in a carry tray (4.5" = 10-pack) owe their share of the tray
    const carrier = cont && cont.has_carrier && +cont.carrier_cost > 0 && +cont.pots_per_carrier > 0
      ? +cont.carrier_cost / +cont.pots_per_carrier : null;
    // cuttings owe sticking labor + a 105-tray cell (per plant, so × ppp)
    let prop = null;
    if (mat && /urc|callused/i.test(mat.form_class || "")) {
      const t105 = containers.find(x => /105/.test(x.name) && +x.cells_per_flat > 0);
      prop = (stick + (t105 ? +t105.cost_per_unit / +t105.cells_per_flat : 0)) * (parseInt(ppp) || 1) || null;
    }
    const total = (liner || 0) + (container || 0) + (soilCost || 0) + (carrier || 0) + (prop || 0);
    return { liner, container, soil: soilCost, carrier, prop, total: total > 0 ? total : null };
  }, [mat, cont, soil, ppp, stick, containers]);
  // selling increment: case_size (or pots per carrier) — 4.5" sells in 10s, period
  const caseOf = cont ? (+cont.case_size || +cont.pots_per_carrier || null) : null;
  const unitsOff = caseOf && units && parseInt(units) > 0 && parseInt(units) % caseOf !== 0;
  const gm = parts.total && price && parseFloat(price) > 0 ? (parseFloat(price) - parts.total) / parseFloat(price) : null;

  async function save() {
    if (!itemName.trim()) return;
    await sb.from("program_items").insert({
      id: crypto.randomUUID(), program_id: program.id,
      item_name: itemName.trim(), size: sizeLabel, sku,
      container_id: contId || null,
      target_units: units ? (caseOf ? Math.ceil(parseInt(units) / caseOf) * caseOf : parseInt(units)) : null,
      target_price: price ? parseFloat(price) : null,
      ppp: parseInt(ppp) || 1,
      material: {
        crop: cropWord, variety: fullVariety, breeder: chosen ? lc(chosen.breeder_name) : null,
        plant_type: ptype || (chosen ? lc(chosen.category) : null), culture_source_id: chosen?.id || null,
        ...(mat ? { broker: mat.broker, supplier: mat.supplier, form: mat.form_class, form_raw: mat.form_raw || null, item_min: mat.item_min || null, landed: +mat.landed || null, variety_key: mat.variety_key } : {}),
      },
      est_unit_cost: parts.total,
      cost_parts: { liner: parts.liner, container: parts.container, carrier: parts.carrier, prop: parts.prop, soil: parts.soil, soil_mix: soil?.name || null, case_size: caseOf },
      sort: Date.now() % 100000,
    });
    onDone();
  }

  const inp = { padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 3 };
  if (corpus === null) return <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>Loading the culture library…</div>;

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: 12 }}>
      {/* step 1: type */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["annual", "🌸 Annual"], ["perennial", "🌿 Perennial"]].map(([k, l]) => (
          <button key={k} onClick={() => { setPtype(ptype === k ? "" : k); setCrop(""); setBreeder(""); setVarId(""); setNameOverride(null); }}
            style={{ padding: "8px 16px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800,
              border: `1.5px solid ${ptype === k ? C.light : C.border}`, background: ptype === k ? C.light : "#fff", color: ptype === k ? "#fff" : C.text }}>{l}</button>
        ))}
        {!cc && <span style={{ fontSize: 11.5, color: C.amber, alignSelf: "center" }}>culture library not configured — lookup limited</span>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 170 }}>
          <span style={lab}>Species</span>
          <select value={crop} onChange={e => { setCrop(e.target.value); setBreeder(""); setVarId(""); setNameOverride(null); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">Choose…</option>
            {cropOpts.map(([c, n, d]) => <option key={c} value={c}>{d} ({n})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <span style={lab}>Breeder</span>
          <select value={breeder} disabled={!crop} onChange={e => { setBreeder(e.target.value); setVarId(""); setNameOverride(null); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">{crop ? "All breeders" : "pick a species"}</option>
            {breederOpts.map(([b, n]) => <option key={b} value={b}>{b} ({n})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 230, flex: 1 }}>
          <span style={lab}>Variety</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select value={varId} disabled={!crop} onChange={e => { setVarId(e.target.value); setNameOverride(null); }} style={{ ...inp, flex: 1, cursor: "pointer" }}>
              <option value="">{crop ? "Choose…" : "pick a species"}</option>
              {varOpts.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <button onClick={openCulture} disabled={!chosen} title="Culture information on file"
              style={{ padding: "0 12px", borderRadius: 8, border: `1.5px solid ${chosen ? C.light : C.border}`, background: "#fff", color: chosen ? C.dark : C.muted, cursor: chosen ? "pointer" : "default", fontSize: 15 }}>📖</button>
          </div>
        </div>
        <div style={{ minWidth: 190 }}>
          <span style={lab}>Size (our containers)</span>
          <select value={contId} onChange={e => { setContId(e.target.value); setNameOverride(null); }} style={{ ...inp, width: "100%", cursor: "pointer" }}>
            <option value="">Choose…</option>
            {containers.map(c => <option key={c.id} value={c.id}>{c.name}{+c.cost_per_unit > 0 ? ` — ${money(+c.cost_per_unit)}` : ""}</option>)}
          </select>
        </div>
        <div style={{ width: 62 }}><span style={lab}>PPP</span><input value={ppp} onChange={e => setPpp(e.target.value)} inputMode="numeric" style={{ ...inp, width: "100%" }} /></div>
        <div style={{ width: 108 }}>
          <span style={lab}>Quantity{caseOf ? ` (×${caseOf})` : ""}</span>
          <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric"
            onBlur={() => { const n = parseInt(units); if (caseOf && n > 0 && n % caseOf !== 0) setUnits(String(Math.ceil(n / caseOf) * caseOf)); }}
            style={{ ...inp, width: "100%", borderColor: unitsOff ? C.amber : undefined }} />
          {caseOf && parseInt(units) > 0 && !unitsOff &&
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{(parseInt(units) / caseOf).toLocaleString()} cases of {caseOf}</div>}
        </div>
        <div style={{ width: 84 }}><span style={lab}>Price $</span><input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
      </div>

      {chosen && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {mat
            ? <span>💵 Sourcing: <b style={{ color: C.text }}>{mat.variety}</b> — {money(+mat.landed)} {mat.form_class}{mat.form_raw ? ` (${mat.form_raw})` : ""} ({[mat.broker, mat.supplier].filter(Boolean).join("/")}){matNote && <b style={{ color: C.amber }}> · {matNote}</b>}</span>
            : <b style={{ color: C.amber }}>💵 {matNote || "matching a broker quote…"}</b>}
          <button onClick={() => setShowQuotes(true)} style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🔍 Search quotes</button>
        </div>
      )}
      {showQuotes && chosen && <QuotePicker sb={sb} varietyKey={matKey}
        initialQuery={fullVariety} current={mat}
        onPick={r => { setMat({ ...r, form_class: r.form_class }); setMatNote("hand-picked"); setShowQuotes(false); }}
        onClose={() => setShowQuotes(false)} />}

      {(itemName || sku) && (
        <div style={{ background: "#f4f7f1", border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <input value={itemName} onChange={e => setNameOverride(e.target.value)} style={{ ...inp, fontWeight: 800, minWidth: 240, flex: 1 }} />
          {sku && <span style={{ fontFamily: "monospace", fontWeight: 700, color: C.dark, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 9px" }}>{sku}</span>}
          {parts.total != null && (
            <span style={{ fontSize: 12.5, color: C.text }}>
              {parts.liner != null && <>liner {money(parts.liner)}</>}
              {parts.container != null && <> + pot {money(parts.container)}</>}
              {parts.carrier != null && <> + case {money(parts.carrier)} <span style={{ color: C.muted }}>({cont.carrier_name || `tray`} {money(+cont.carrier_cost)} ÷ {+cont.pots_per_carrier})</span></>}
              {parts.prop != null && <> + stick/tray {money(parts.prop)}</>}
              {parts.soil != null && <> + soil {money(parts.soil)}</>}
              {" = "}<b style={{ fontSize: 14 }}>{money(parts.total)}</b>
              {gm != null && <> · <b style={{ color: gm < 0.6 ? C.red : C.green }}>{Math.round(gm * 100)}%</b></>}
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

      {culture && <CultureModal record={culture} onClose={() => setCulture(null)} />}
    </div>
  );
}

// Click an item row → this. Everything is DRAFT until Save — nothing writes on
// blur or on quote pick, so a wrong click costs nothing.
function ItemEditorModal({ sb, item, onClose, onSaved }) {
  const [units, setUnits] = useState(item.target_units ?? "");
  const [price, setPrice] = useState(item.target_price ?? "");
  const [ppp, setPpp] = useState(item.ppp || 1);
  const [mat, setMat] = useState(item.material || null);
  const [showQuotes, setShowQuotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const caseOf = +(item.cost_parts?.case_size) || null;

  const cp = item.cost_parts || {};
  const liner = mat && mat.landed != null ? (+mat.landed) * (parseInt(ppp) || 1) : (cp.liner ?? null);
  const est = (liner || 0) + (+cp.container || 0) + (+cp.carrier || 0) + (+cp.soil || 0) || null;
  const gm = est && parseFloat(price) > 0 ? (parseFloat(price) - est) / parseFloat(price) : null;
  const dirty = String(units) !== String(item.target_units ?? "") || String(price) !== String(item.target_price ?? "")
    || +ppp !== +(item.ppp || 1) || mat !== item.material;

  async function save() {
    setSaving(true);
    let n = parseInt(units);
    if (caseOf && n > 0 && n % caseOf !== 0) n = Math.ceil(n / caseOf) * caseOf;
    const cost_parts = { ...cp, liner };
    const { error } = await sb.from("program_items").update({
      target_units: isNaN(n) ? null : n,
      target_price: price === "" ? null : parseFloat(price),
      ppp: parseInt(ppp) || 1,
      material: mat, cost_parts, est_unit_cost: est,
      updated_at: new Date().toISOString(),
    }).eq("id", item.id);
    setSaving(false);
    if (error) { window.alert(`Did NOT save: ${error.message}`); return; }
    onSaved();
  }

  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", display: "block", marginBottom: 3 };
  const inp = { padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff" };
  const Fact = ({ k, v }) => <div style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "1.5px 0" }}><span style={{ minWidth: 90, color: C.muted }}>{k}</span><b style={{ color: C.text }}>{v || "—"}</b></div>;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9350, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "auto", padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>{item.item_name}</div>
            <div style={{ fontSize: 11.5, color: C.muted, fontFamily: "monospace" }}>{item.sku}{item.size ? ` · ${item.size}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: C.muted, cursor: "pointer" }}>×</button>
        </div>

        {/* where the plant comes from */}
        <div style={{ background: "#fff", border: `1.5px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", margin: "8px 0" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase" }}>Sourcing</span>
            <button onClick={() => setShowQuotes(true)} style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.light}`, background: "#fff", color: C.dark, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🔍 Change quote</button>
          </div>
          {mat ? <>
            <Fact k="Plant" v={mat.variety} />
            <Fact k="Form" v={[mat.form, mat.form_raw].filter(Boolean).join(" · ")} />
            <Fact k="Broker" v={mat.broker} />
            <Fact k="Supplier" v={mat.supplier} />
            <Fact k="Per cell" v={mat.landed != null ? money(+mat.landed) : null} />
            {mat.item_min && <Fact k="Minimum" v={mat.item_min} />}
          </> : <div style={{ fontSize: 12.5, color: C.amber }}>No quote attached — cost uses pot + soil only. 🔍 to pick one.</div>}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0" }}>
          <div style={{ width: 110 }}>
            <span style={lab}>Quantity{caseOf ? ` (×${caseOf})` : ""}</span>
            <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" style={{ ...inp, width: "100%" }} />
          </div>
          <div style={{ width: 90 }}>
            <span style={lab}>Price</span>
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" style={{ ...inp, width: "100%" }} />
          </div>
          <div style={{ width: 90 }}>
            <span style={lab}>Plants/pot</span>
            <input value={ppp} onChange={e => setPpp(e.target.value)} inputMode="numeric" style={{ ...inp, width: "100%" }} />
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: C.text, margin: "6px 0 12px" }}>
          {liner != null && <>liner {money(liner)}</>}
          {cp.container != null && <> + pot {money(+cp.container)}</>}
          {cp.carrier != null && <> + case {money(+cp.carrier)}</>}
          {cp.soil != null && <> + soil {money(+cp.soil)}</>}
          {est != null && <>{" = "}<b style={{ fontSize: 14 }}>{money(est)}</b></>}
          {gm != null && <b style={{ marginLeft: 8, color: gm < 0.6 ? C.red : C.green }}>{Math.round(gm * 100)}% margin</b>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 13px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={save} disabled={!dirty || saving}
            style={{ flex: 1, padding: "8px 13px", borderRadius: 8, border: "none", background: dirty ? C.dark : "#c8d8c0", color: "#c8e6b8", fontWeight: 800, cursor: dirty ? "pointer" : "default", fontFamily: "inherit" }}>
            {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
          </button>
        </div>

        {showQuotes && <QuotePicker sb={sb} varietyKey={mat?.variety_key || null}
          initialQuery={mat?.variety || item.item_name.replace(/^[\d.\"]+\s*/, "")}
          current={mat}
          onPick={r => { setMat({ ...(mat || {}), crop: r.crop, variety: r.variety, broker: r.broker, supplier: r.supplier, form: r.form_class, form_raw: r.form_raw, item_min: r.item_min, landed: r.landed, variety_key: r.variety_key }); setShowQuotes(false); }}
          onClose={() => setShowQuotes(false)} />}
      </div>
    </div>
  );
}

// Quote comparison window — the auto-attach can't answer "URC or callused?
// 160 or 288? whose price?" so the human gets the whole quote set: form, tray,
// broker, supplier, minimums, list vs landed. Exact key matches float to the
// top with a ●; the search box covers everything else.
const QUOTE_COLS = "id,crop,variety,broker,supplier,form_class,form_raw,item_min,list_price,landed,royalty,freight,variety_key";
const QUOTE_SEASON = "2026-2027"; // the loaded broker files
export function QuotePicker({ sb, varietyKey, initialQuery, current, onPick, onClose }) {
  const [q, setQ] = useState(initialQuery || "");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fForm, setFForm] = useState("");
  const [fBroker, setFBroker] = useState("");
  const [fSupplier, setFSupplier] = useState("");
  const [sort, setSort] = useState(null);   // {col, dir} — null = exact-first, cheapest-first
  async function load(term) {
    setBusy(true);
    const out = new Map();
    if (varietyKey) {
      const { data } = await sb.from("broker_prices").select(QUOTE_COLS)
        .eq("season", QUOTE_SEASON).eq("variety_key", varietyKey).gt("landed", 0).limit(100);
      (data || []).forEach(r => out.set(r.id, { ...r, exact: true }));
    }
    const toks = String(term || "").trim().split(/\s+/).filter(t => t.length > 1).slice(0, 5);
    if (toks.length) {
      let qq = sb.from("broker_prices").select(QUOTE_COLS).eq("season", QUOTE_SEASON).gt("landed", 0).limit(300);
      toks.forEach(t => { qq = qq.or(`variety.ilike.*${t}*,crop.ilike.*${t}*`); });
      const { data } = await qq;
      (data || []).forEach(r => { if (!out.has(r.id)) out.set(r.id, { ...r, exact: false }); });
    }
    setRows([...out.values()].sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || (+a.landed || 9e9) - (+b.landed || 9e9)));
    setBusy(false);
  }
  useEffect(() => { load(q); }, []); // eslint-disable-line

  // filters + sorting are client-side over whatever the search pulled in
  const opts = useMemo(() => {
    const u = k => [...new Set((rows || []).map(r => r[k]).filter(Boolean))].sort();
    return { form: u("form_class"), broker: u("broker"), supplier: u("supplier") };
  }, [rows]);
  const shown = useMemo(() => {
    let out = (rows || []).filter(r =>
      (!fForm || r.form_class === fForm) && (!fBroker || r.broker === fBroker) && (!fSupplier || r.supplier === fSupplier));
    if (sort) {
      const num = ["item_min", "list_price", "landed"].includes(sort.col);
      out = [...out].sort((a, b) => {
        const av = num ? (+a[sort.col] || (sort.dir > 0 ? 9e9 : -1)) : String(a[sort.col] || "").toLowerCase();
        const bv = num ? (+b[sort.col] || (sort.dir > 0 ? 9e9 : -1)) : String(b[sort.col] || "").toLowerCase();
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
    }
    return out;
  }, [rows, fForm, fBroker, fSupplier, sort]);
  const clickSort = col => setSort(s => s && s.col === col ? (s.dir > 0 ? { col, dir: -1 } : null) : { col, dir: 1 });

  const th = { textAlign: "left", padding: "4px 8px", fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: "#f6f9f3", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };
  const td = { padding: "5px 8px", fontSize: 12, borderBottom: `1px solid ${C.border}` };
  const Th = ({ col, right, children }) => (
    <th style={{ ...th, textAlign: right ? "right" : "left" }} onClick={() => clickSort(col)} title="sort">
      {children}{sort?.col === col ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
  const filtSel = { padding: "5px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: "#fff", cursor: "pointer" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "100%", maxWidth: 860, maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>💵 Broker quotes</div>
          {current?.variety && <span style={{ fontSize: 11.5, color: C.muted }}>current: <b>{current.variety}</b> {money(+current.landed)} ({[current.broker, current.supplier].filter(Boolean).join("/")})</span>}
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, color: C.muted, cursor: "pointer" }}>×</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); load(q); }} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="search variety or crop…" autoFocus
            style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
          <button type="submit" style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Search</button>
        </form>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={fForm} onChange={e => setFForm(e.target.value)} style={filtSel}>
            <option value="">All forms</option>{opts.form.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={fBroker} onChange={e => setFBroker(e.target.value)} style={filtSel}>
            <option value="">All brokers</option>{opts.broker.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={fSupplier} onChange={e => setFSupplier(e.target.value)} style={filtSel}>
            <option value="">All suppliers</option>{opts.supplier.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          {(fForm || fBroker || fSupplier) && (
            <button onClick={() => { setFForm(""); setFBroker(""); setFSupplier(""); }}
              style={{ background: "none", border: "none", color: C.red, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ clear</button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.muted }}>{rows ? `${shown.length} of ${rows.length} quotes` : ""}</span>
        </div>
        <div style={{ overflow: "auto", flex: 1, background: "#fff", borderRadius: 9, border: `1px solid ${C.border}` }}>
          {rows === null || busy ? <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>Searching the catalog…</div>
          : !shown.length ? <div style={{ padding: 16, color: C.muted, fontSize: 13 }}>{rows.length ? "Nothing matches those filters." : "No quotes found — try fewer words."}</div>
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...th, cursor: "default" }}></th>
                <Th col="variety">Variety</Th><Th col="form_class">Form</Th><Th col="broker">Broker</Th><Th col="supplier">Supplier</Th>
                <Th col="item_min" right>Min</Th><Th col="list_price" right>List</Th><Th col="landed" right>Landed</Th>
              </tr></thead>
              <tbody>
                {shown.slice(0, 200).map(r => (
                  <tr key={r.id} onClick={() => onPick(r)} title="use this quote"
                    style={{ cursor: "pointer", background: r.exact ? "#f2f8ee" : "#fff" }}>
                    <td style={{ ...td, color: C.green, fontWeight: 800 }}>{r.exact ? "●" : ""}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{r.variety}<div style={{ fontSize: 10.5, fontWeight: 400, color: C.muted }}>{r.crop}</div></td>
                    <td style={td}>{r.form_class}{r.form_raw ? <div style={{ fontSize: 10.5, color: C.muted }}>{r.form_raw}</div> : null}</td>
                    <td style={td}>{r.broker}</td>
                    <td style={td}>{r.supplier}</td>
                    <td style={{ ...td, textAlign: "right", color: C.muted }}>{r.item_min || "—"}</td>
                    <td style={{ ...td, textAlign: "right", color: C.muted }}>{r.list_price != null ? money(+r.list_price) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{money(+r.landed)}
                      {(+r.royalty > 0 || +r.freight > 0) && <div style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>{+r.royalty > 0 ? `roy ${money(+r.royalty)}` : ""}{+r.freight > 0 ? ` frt ${money(+r.freight)}` : ""}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>● = exact catalog match for this variety · landed = list + royalty + freight per cell · click a row to use it</div>
      </div>
    </div>
  );
}

function CultureModal({ record, onClose }) {
  const cd = record.culture_details || {};
  const pd = record.propagation_details || {};
  const pdf = cd["Culture Guide PDF"] || cd["Culture Guide PDF (Origin)"] || null;
  const rows = obj => Object.entries(obj || {}).filter(([k, v]) => v != null && String(v).trim() && !/pdf/i.test(k));
  // finishing size, pulled to the top — Mario plans space off these
  const sizeOf = re => {
    const hit = Object.entries(cd).find(([k, v]) => re.test(k) && !/prop/i.test(k) && v != null && String(v).trim());
    return hit ? String(hit[1]) : null;
  };
  const finH = sizeOf(/height/i), finW = sizeOf(/width|spread/i);
  const Section = ({ title, obj }) => rows(obj).length ? (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {rows(obj).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "2px 0" }}>
          <span style={{ minWidth: 170, color: C.muted }}>{k}</span>
          <span style={{ color: C.text }}>{String(v)}</span>
        </div>
      ))}
    </div>
  ) : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#f6f9f3", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "86vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
              📖 {[record.crop_name, record.series_name, record.series_variety].filter(Boolean).join(" ")}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>{record.breeder_name} · {record.category}{record.propagation_weeks ? ` · prop ${record.propagation_weeks} wks` : ""}{record.requires_heat ? " · needs heat" : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: C.muted, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 9, background: "#fff", border: `1.5px solid ${finH || finW ? C.light : C.border}`, display: "flex", gap: 18, fontSize: 13 }}>
          <span><span style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Finish height</span><br /><b style={{ color: finH ? C.dark : C.muted }}>{finH || "not on file"}</b></span>
          <span><span style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>Finish width</span><br /><b style={{ color: finW ? C.dark : C.muted }}>{finW || "not on file"}</b></span>
        </div>
        {pdf && <a href={pdf} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, padding: "7px 13px", borderRadius: 8, background: C.dark, color: "#c8e6b8", fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>📄 Open culture guide PDF</a>}
        <Section title="Culture" obj={cd} />
        <Section title="Propagation" obj={pd} />
        {!rows(cd).length && !rows(pd).length && !pdf && <div style={{ marginTop: 12, color: C.muted, fontSize: 13 }}>Nothing on file for this one yet.</div>}
      </div>
    </div>
  );
}
