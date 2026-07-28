// AddPlantDoor — Phase 3 of the 2026-07-27 spec: THE one door for adding a plant.
// You decide four things (variety · size · ready-by as DATE or WEEK · quantity);
// the crop recipe fills the rest (source+price via the pinned broker, form/tray/rooting
// from the series spec, crop weeks), the chain derives (ready − crop = plant ·
// plant − root = ship/arrive, year-wrapped), and ONE confirm writes all three layers:
// decision (plan_targets) + plant (scheduled_crops, recipe-linked, bench assigned later)
// + receive/transplant tasks. Deciding and creating stop being separate systems.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { makeKey } from "./brokerKey";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df",
  border: "#e4ecdd", chip: "#eaf2e0", green: "#2e7d32" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const MONO = "ui-monospace,Menlo,monospace";

const isoWeek = d => { const t = new Date(d); t.setHours(0, 0, 0, 0); const dn = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dn + 3); const f = new Date(t.getFullYear(), 0, 4); return 1 + Math.round(((t - f) / 864e5 - 3 + (f.getDay() + 6) % 7) / 7); };
function isoWeekMonday(year, week) {
  const s = new Date(Date.UTC(+year, 0, 1 + (week - 1) * 7)); const dow = s.getUTCDay();
  if (dow <= 4) s.setUTCDate(s.getUTCDate() - dow + 1); else s.setUTCDate(s.getUTCDate() + 8 - dow);
  return s.toISOString().slice(0, 10);
}
const wrapWk = (wk, year) => wk <= 0 ? { wk: wk + 52, year: year - 1 } : { wk, year };
const yyww = (wk, year) => wk == null ? "—" : `${String(year).slice(2)}${String(wk).padStart(2, "0")}`;
const FORM_TO_CLASS = f => /^URC/i.test(f || "") ? "urc" : /^(CALL|DIRECT)/i.test(f || "") ? "callused"
  : /^PLUG/i.test(f || "") ? "plug" : /^SEED/i.test(f || "") ? "seed" : null;
function sizePrefix(sizeLabel) {
  let m;
  if ((m = sizeLabel.match(/^([\d.]+)" HB$/))) return `HB ${m[1]}"`;
  if ((m = sizeLabel.match(/^([\d.]+)" Fiber$/))) return +m[1] >= 10 ? "FIBER LG." : "FIBER SM.";
  if ((m = sizeLabel.match(/^([\d.]+)" (Pot|Pan|Bowl)$/))) return +m[1] <= 6.5 ? `${m[1]}"` : `POT ${m[1]}"`;
  return sizeLabel.toUpperCase();
}

export default function AddPlantDoor({ plan, onClose, onCreated }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const planYear = plan.year || new Date().getFullYear();

  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [variety, setVariety] = useState(null);      // variety_library row
  const [recipes, setRecipes] = useState([]);        // crop_recipes for the crop
  const [recipeId, setRecipeId] = useState(null);
  const [series, setSeries] = useState([]);          // series of the chosen recipe
  const [quote, setQuote] = useState(null);          // {landed, broker, supplier, alts}
  const [mode, setMode] = useState("date");
  const [readyDate, setReadyDate] = useState(`${planYear}-04-15`);
  const [readyWkIn, setReadyWkIn] = useState("16");
  const [units, setUnits] = useState("");
  const [itemName, setItemName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newVar, setNewVar] = useState(null);   // {crop, variety} — the Jamesbrittenia path
  const [newRec, setNewRec] = useState(null);   // {size_label, crop_weeks, pots_per_unit, ppp, form, rooting_weeks}
  const [sizeOptions, setSizeOptions] = useState([]);

  useEffect(() => {   // Escape always exits, no matter what state the door is in
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function createVariety() {
    const crop = (newVar?.crop || "").trim(), vname = (newVar?.variety || "").trim();
    if (!crop || !vname) return;
    setBusy(true); setErr("");
    try {
      const vkey = makeKey(crop, "", vname);
      const { data: dupe } = await sb.from("variety_library").select("id,crop_name,variety").eq("variety_key", vkey).limit(1);
      if (dupe?.length) { setVariety({ ...dupe[0], variety_key: vkey }); setNewVar(null); setBusy(false); return; }  // same genetics already known
      const id = crypto.randomUUID();
      const { error } = await sb.from("variety_library").insert({
        id, crop_name: crop, variety: vname, variety_key: vkey, notes: "created via Add a plant (new crop)" });
      if (error) throw new Error(error.message);
      setVariety({ id, crop_name: crop, variety: vname, variety_key: vkey });
      setNewVar(null); setQ("");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function createRecipe() {
    if (!variety || !newRec?.size_label?.trim() || !newRec?.crop_weeks) return;
    setBusy(true); setErr("");
    try {
      const rec = {
        crop_name: variety.crop_name, size_label: newRec.size_label.trim(),
        crop_weeks: +newRec.crop_weeks, pots_per_unit: Math.max(1, +newRec.pots_per_unit || 1),
        ppp: Math.max(1, +newRec.ppp || 1), updated_by: displayName || "planner",
        seeded_from: { source: "add-door", note: "starter recipe — refine on the family page" },
      };
      const { data: ins, error } = await sb.from("crop_recipes")
        .upsert(rec, { onConflict: "crop_name,size_label" }).select("*").single();
      if (error) throw new Error(error.message);
      await sb.from("crop_recipe_series").upsert({
        recipe_id: ins.id, series_name: "(unassigned)", form: newRec.form || null,
        rooting_weeks: /^(URC|CALL)/i.test(newRec.form || "") && newRec.rooting_weeks ? +newRec.rooting_weeks : null,
      }, { onConflict: "recipe_id,series_name" });
      setRecipes(rs => [...rs.filter(r => r.id !== ins.id), ins]);
      setRecipeId(ins.id); setNewRec(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  useEffect(() => {   // distinct size labels across all recipes — suggestions for a starter recipe
    if (!newRec) return;
    (async () => {
      const { data } = await sb.from("crop_recipes").select("size_label").limit(400);
      setSizeOptions([...new Set((data || []).map(r => r.size_label))].sort());
    })();
  }, [newRec, sb]); // eslint-disable-line

  // variety search
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim();
      if (s.length < 2) { setHits([]); return; }
      const { data } = await sb.from("variety_library").select("id,crop_name,variety,variety_key")
        .or(`variety.ilike.%${s}%,crop_name.ilike.%${s}%`).order("crop_name").limit(14);
      setHits(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  // variety chosen → its crop's recipes
  useEffect(() => {
    if (!variety) return;
    (async () => {
      const { data: recs } = await sb.from("crop_recipes").select("*")
        .eq("crop_name", variety.crop_name).order("size_label");
      setRecipes(recs || []);
      setRecipeId(recs?.length === 1 ? recs[0].id : null);
    })();
  }, [variety, sb]);

  const recipe = useMemo(() => recipes.find(r => r.id === recipeId) || null, [recipes, recipeId]);

  // recipe chosen → series + best quote (pinned broker first, then cheapest)
  useEffect(() => {
    if (!recipe || !variety) { setSeries([]); setQuote(null); return; }
    (async () => {
      const { data: ser } = await sb.from("crop_recipe_series").select("*").eq("recipe_id", recipe.id);
      setSeries(ser || []);
      const named = (ser || []).filter(s => s.series_name !== "(unassigned)")
        .sort((a, b) => b.series_name.length - a.series_name.length);
      const sMatch = named.find(s => variety.variety.toLowerCase().startsWith(s.series_name.toLowerCase()))
        || (ser || []).find(s => s.series_name === "(unassigned)") || null;
      const fc = FORM_TO_CLASS(sMatch?.form);
      let qq = sb.from("broker_prices").select("broker,supplier,form_class,landed").eq("variety_key", variety.variety_key).order("landed");
      if (fc) qq = qq.eq("form_class", fc);
      const { data: quotes } = await qq.limit(10);
      let best = null;
      if (quotes?.length) {
        best = (sMatch?.pinned_broker && quotes.find(x => x.broker === sMatch.pinned_broker)) || quotes[0];
        best = { ...best, alts: quotes.length - 1, pinnedHit: best.broker === sMatch?.pinned_broker };
      }
      setQuote(best);
    })();
  }, [recipe, variety, sb]);

  const sMatch = useMemo(() => {
    if (!series.length || !variety) return null;
    const named = series.filter(s => s.series_name !== "(unassigned)").sort((a, b) => b.series_name.length - a.series_name.length);
    return named.find(s => variety.variety.toLowerCase().startsWith(s.series_name.toLowerCase()))
      || series.find(s => s.series_name === "(unassigned)") || null;
  }, [series, variety]);

  // the chain: ready − crop = plant · plant − root = ship (URC/CALL; plug/seed ship at plant)
  const chain = useMemo(() => {
    if (!recipe) return null;
    const readyWk = mode === "date"
      ? (readyDate ? isoWeek(new Date(readyDate + "T00:00:00")) : null)
      : Math.max(1, Math.min(52, parseInt(readyWkIn, 10) || 0)) || null;
    if (!readyWk || recipe.crop_weeks == null) return { readyWk, incomplete: true };
    const p = wrapWk(readyWk - Math.round(+recipe.crop_weeks), planYear);
    const rooted = /^(URC|CALL)/i.test(sMatch?.form || "");
    const root = rooted ? Math.round(+(sMatch?.rooting_weeks ?? 0)) : 0;
    const s = wrapWk(p.wk - root, p.year);
    return { readyWk, readyYear: planYear, plant: p, ship: s, rooted, root };
  }, [recipe, sMatch, mode, readyDate, readyWkIn, planYear]);

  // item-name prefill whenever the pick changes (stays editable)
  useEffect(() => {
    if (!recipe || !variety) return;
    setItemName(`${sizePrefix(recipe.size_label)} ${variety.crop_name} ${variety.variety}`.toUpperCase());
  }, [recipe, variety]);

  const u = Math.max(0, parseInt(units, 10) || 0);
  const ppu = recipe ? Math.max(1, Math.round(+recipe.pots_per_unit || 1)) : 1;
  const pots = u * ppu;
  const plants = pots * (recipe ? Math.max(1, Math.round(+recipe.ppp || 1)) : 1);
  const canConfirm = recipe && variety && chain && !chain.incomplete && u > 0 && itemName.trim() && !busy;

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true); setErr("");
    try {
      const name = itemName.trim();
      const { data: clash } = await sb.from("scheduled_crops").select("id").eq("plan_id", plan.id).eq("item_name", name).limit(1);
      if (clash?.length) { setErr(`"${name}" already exists in ${plan.name} — open it instead, or change the name.`); setBusy(false); return; }
      const scRow = {
        id: crypto.randomUUID(), plan_id: plan.id, item_name: name,
        variety_id: variety.id, recipe_id: recipe.id,
        container_id: recipe.default_container_id || null,
        qty_pots: pots, ppp: Math.max(1, Math.round(+recipe.ppp || 1)),
        pack_size: ppu, plants_per_unit: ppu,
        qty_plants_ordered: null,               // supply committed at ordering, not here
        crop_weeks: Math.round(+recipe.crop_weeks),
        ready_week: chain.readyWk, ready_year: chain.readyYear,
        plant_week: chain.plant.wk, plant_year: chain.plant.year,
        ship_week: chain.ship.wk, ship_year: chain.ship.year,
        prop_method: sMatch?.form || null, prop_tray_id: sMatch?.prop_tray_id || null,
        broker: quote?.broker || sMatch?.pinned_broker || null,
        supplier: quote?.supplier || sMatch?.pinned_supplier || null,
        liner_unit_cost: quote?.landed != null ? +quote.landed : null,
        bench_id: null,                          // space assigned later, same as duplicates
        is_combo_component: false, sellable: true, status: "planned",
        notes: "added via Add a plant",
      };
      const { error: e1 } = await sb.from("scheduled_crops").insert(scRow);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await sb.from("plan_targets").upsert({
        plan_id: plan.id, item_name: name, target_units: u, decision: "grow",
        note: "created via Add a plant", decided_by: displayName || null,
        decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "plan_id,item_name" });
      if (e2) throw new Error(e2.message);
      // tasks: receive(&stick) + transplant — idempotent by title+date, same as receiving tasks
      const tasks = [];
      if (chain.rooted) tasks.push({
        date: isoWeekMonday(chain.ship.year, chain.ship.wk),
        title: `Receive & stick ${name} (wk ${chain.ship.wk})`,
        desc: `${plants.toLocaleString()} ${sMatch?.form || ""} arrive → stick${sMatch?.prop_tray_id ? " into prop trays" : ""}. Root ~${chain.root}wk, transplant wk ${chain.plant.wk}.`,
      });
      tasks.push({
        date: isoWeekMonday(chain.plant.year, chain.plant.wk),
        title: `${chain.rooted ? "Transplant" : "Plant"} ${name} (wk ${chain.plant.wk})`,
        desc: `${pots.toLocaleString()} pots · ready wk ${chain.readyWk}. Bench assignment pending.`,
      });
      for (const t of tasks) {
        const { data: ex } = await sb.from("manager_tasks").select("id").eq("plan_id", plan.id).eq("target_date", t.date).eq("title", t.title).limit(1);
        if (ex?.length) continue;
        await sb.from("manager_tasks").insert({
          plan_id: plan.id, category: "production", title: t.title, description: t.desc,
          target_date: t.date, priority: 3, status: "pending",
          week_number: isoWeek(new Date(t.date + "T00:00:00")), year: new Date(t.date).getFullYear(),
          created_by: "auto:add-plant",
        });
      }
      try {
        await sb.from("item_change_log").insert({
          plan_id: plan.id, item_name: name, variety_key: variety.variety_key,
          change_type: "created", changed_by: displayName || null, source: "add-door",
          detail: { units: u, pots, ready: yyww(chain.readyWk, chain.readyYear), plant: yyww(chain.plant.wk, chain.plant.year), ship: yyww(chain.ship.wk, chain.ship.year), broker: scRow.broker, liner: scRow.liner_unit_cost },
        });
      } catch { /* audit must never block */ }
      onCreated?.(name);
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  const lbl = { fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, display: "block", marginBottom: 4 };
  const ctl = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${C.creamBr}`, fontSize: 14, fontFamily: FONT };
  const rrow = { display: "flex", gap: 10, alignItems: "baseline", padding: "7px 12px", borderBottom: `1px solid ${C.creamBr}`, fontSize: 12.5 };
  const rk = { fontWeight: 800, color: C.dark, width: 52, flex: "none", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".4px" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 640, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>Add a plant</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{plan.name} · you decide 4 things, the recipe does the rest</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {/* ① decide */}
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Variety</label>
          {!variety ? (
            <>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search the variety library…" style={ctl} />
              {!!hits.length && (
                <div style={{ border: `1px solid ${C.creamBr}`, borderRadius: 10, marginTop: 6, overflow: "hidden", background: "#fff" }}>
                  {hits.map(h => (
                    <button key={h.id} onClick={() => { setVariety(h); setHits([]); }}
                      style={{ display: "flex", gap: 8, width: "100%", textAlign: "left", padding: "8px 11px", background: "#fff",
                        border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>
                      <b>{h.variety}</b><span style={{ color: C.muted }}>{h.crop_name}</span>
                    </button>
                  ))}
                </div>
              )}
              {q.trim().length >= 2 && !hits.length && !newVar && (
                <button onClick={() => setNewVar({ crop: "", variety: q.trim().replace(/\b\w/g, c => c.toUpperCase()) })}
                  style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 12px", borderRadius: 10, textAlign: "left",
                    border: `1.5px dashed ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>
                  🆕 Nothing on file — create “{q.trim()}” as a new variety
                </button>
              )}
              {newVar && (
                <div style={{ marginTop: 8, background: C.amberBg, border: `1.5px solid #ecd9b8`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 8 }}>🆕 NEW VARIETY — first time growing it (the Jamesbrittenia moment)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Crop (genus)</label>
                      <input value={newVar.crop} onChange={e => setNewVar({ ...newVar, crop: e.target.value })} placeholder="e.g. Jamesbrittenia" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                    <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Variety</label>
                      <input value={newVar.variety} onChange={e => setNewVar({ ...newVar, variety: e.target.value })} placeholder="series + color" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button disabled={busy || !newVar.crop.trim() || !newVar.variety.trim()} onClick={createVariety}
                      style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Create variety →</button>
                    <button onClick={() => setNewVar(null)} style={{ padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>back</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.cream, border: `1.5px solid ${C.creamBr}`, borderRadius: 10, padding: "8px 12px" }}>
              <b style={{ fontSize: 14 }}>{variety.variety}</b>
              <span style={{ color: C.muted, fontSize: 12 }}>{variety.crop_name}</span>
              <button onClick={() => { setVariety(null); setRecipes([]); setRecipeId(null); setQ(""); }}
                style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>change</button>
            </div>
          )}
        </div>

        {variety && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={lbl}>Size (the recipe)</label>
              {recipes.length ? (
                <select value={recipeId || ""} onChange={e => setRecipeId(e.target.value || null)} style={{ ...ctl, cursor: "pointer" }}>
                  <option value="">— pick a size —</option>
                  {recipes.map(r => <option key={r.id} value={r.id}>{r.size_label} · crop {r.crop_weeks}w</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: C.amber, background: C.amberBg, border: `1px solid #ecd9b8`, borderRadius: 9, padding: "9px 11px" }}>
                  No recipes for {variety.crop_name} yet — a new crop needs its recipe set ONCE, then every future add fills itself.
                </div>
              )}
              {!newRec
                ? <button onClick={() => setNewRec({ size_label: "", crop_weeks: "", pots_per_unit: 1, ppp: 1, form: "URC", rooting_weeks: "" })}
                    style={{ marginTop: 6, padding: "7px 12px", borderRadius: 9, border: `1.5px dashed ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                    ＋ Create a starter recipe for {variety.crop_name}</button>
                : (
                  <div style={{ marginTop: 8, background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 8 }}>STARTER RECIPE — set once, refine on the family page later</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                      <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Size label</label>
                        <input list="apd-sizes" value={newRec.size_label} onChange={e => setNewRec({ ...newRec, size_label: e.target.value })} placeholder={`e.g. 4.5" Pot · 10" HB`} style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} />
                        <datalist id="apd-sizes">{sizeOptions.map(s => <option key={s} value={s} />)}</datalist></div>
                      <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Crop wks</label>
                        <input value={newRec.crop_weeks} onChange={e => setNewRec({ ...newRec, crop_weeks: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Pots / unit</label>
                        <input value={newRec.pots_per_unit} onChange={e => setNewRec({ ...newRec, pots_per_unit: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>PPP</label>
                        <input value={newRec.ppp} onChange={e => setNewRec({ ...newRec, ppp: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                      <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Form</label>
                        <select value={newRec.form} onChange={e => setNewRec({ ...newRec, form: e.target.value })} style={{ ...ctl, padding: "7px 9px", fontSize: 13, cursor: "pointer" }}>
                          {["URC", "CALL", "PLUG", "SEED", "BULB", "LINER"].map(f => <option key={f}>{f}</option>)}
                        </select></div>
                      {/^(URC|CALL)$/.test(newRec.form) && (
                        <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Root wks</label>
                          <input value={newRec.rooting_weeks} onChange={e => setNewRec({ ...newRec, rooting_weeks: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button disabled={busy || !newRec.size_label.trim() || !newRec.crop_weeks} onClick={createRecipe}
                        style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Create recipe →</button>
                      <button onClick={() => setNewRec(null)} style={{ padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>back</button>
                    </div>
                  </div>
                )}
            </div>
            <div>
              <label style={lbl}>Quantity (units)</label>
              <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="e.g. 120" style={ctl} />
              {recipe && u > 0 && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>= {pots.toLocaleString()} pots · {plants.toLocaleString()} plants{ppu > 1 ? ` (${ppu}/unit)` : ""}</div>}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Ready by</label>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ display: "inline-flex", background: C.chip, border: `1px solid ${C.border}`, borderRadius: 9, padding: 3, gap: 2, alignSelf: "center" }}>
                  {[["date", "Date"], ["week", "Week"]].map(([k, l]) => (
                    <button key={k} onClick={() => setMode(k)} style={{ fontSize: 11.5, fontWeight: 700, border: 0, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: FONT,
                      background: mode === k ? "#fff" : "transparent", color: mode === k ? C.dark : C.muted, boxShadow: mode === k ? "0 1px 3px rgba(30,45,26,.12)" : "none" }}>{l}</button>
                  ))}
                </span>
                {mode === "date"
                  ? <input type="date" value={readyDate} onChange={e => setReadyDate(e.target.value)} style={{ ...ctl, flex: 1 }} />
                  : <input value={readyWkIn} onChange={e => setReadyWkIn(e.target.value)} inputMode="numeric" placeholder={`week # of ${planYear}`} style={{ ...ctl, flex: 1 }} />}
              </div>
            </div>
          </div>
        )}

        {/* ② recipe fills · ③ chain */}
        {recipe && (
          <div style={{ marginTop: 12, border: `1px solid ${C.creamBr}`, borderRadius: 11, overflow: "hidden", background: C.cream }}>
            <div style={rrow}><span style={rk}>Source</span>
              <span style={{ flex: 1 }}>{quote
                ? <>{quote.broker}{quote.supplier ? ` · ${quote.supplier}` : ""} · <b>${(+quote.landed).toFixed(3)}</b>/liner
                    {quote.pinnedHit ? <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 800 }}>📌 pinned</span>
                      : sMatch?.pinned_broker ? <span style={{ marginLeft: 6, fontSize: 10, color: C.amber, fontWeight: 800 }}>⚠ pin is {sMatch.pinned_broker}</span> : null}
                    {quote.alts > 0 && <span style={{ color: C.muted, fontSize: 11 }}> · {quote.alts} alt{quote.alts > 1 ? "s" : ""}</span>}</>
                : <span style={{ color: C.amber }}>no live quote — source later in the drill</span>}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>← broker_prices</span>
            </div>
            <div style={rrow}><span style={rk}>Prop</span>
              <span style={{ flex: 1 }}><b>{sMatch?.form || "—"}</b>{sMatch?.rooting_weeks != null && /^(URC|CALL)/i.test(sMatch?.form || "") ? ` · root ${sMatch.rooting_weeks}w` : ""}{sMatch?.series_name ? ` · ${sMatch.series_name} series` : ""}</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>← recipe series</span>
            </div>
            <div style={rrow}><span style={rk}>Chain</span>
              <span style={{ flex: 1, fontFamily: MONO, fontSize: 12.5 }}>
                {chain && !chain.incomplete
                  ? <>{chain.rooted ? `arrive/stick ${yyww(chain.ship.wk, chain.ship.year)} → ` : ""}plant <b>{yyww(chain.plant.wk, chain.plant.year)}</b> → ready <b style={{ color: C.green }}>{yyww(chain.readyWk, chain.readyYear)}</b></>
                  : <span style={{ color: C.muted }}>set a ready date…</span>}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>← derived</span>
            </div>
            <div style={{ ...rrow, borderBottom: "none" }}><span style={rk}>Item</span>
              <input value={itemName} onChange={e => setItemName(e.target.value)}
                style={{ flex: 1, padding: "5px 9px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 12.5, fontWeight: 700, fontFamily: FONT }} />
            </div>
          </div>
        )}

        {err && <div style={{ marginTop: 10, fontSize: 12.5, color: "#c0492b", background: "#fae9e5", border: "1px solid #eccfc7", borderRadius: 9, padding: "8px 11px" }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 10.5, color: C.muted, flex: 1 }}>
            One confirm writes: decision (plan_targets) · plant row (recipe-linked, bench later) · receive + transplant tasks · history.
          </span>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#fff", color: C.text, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          <button disabled={!canConfirm} onClick={confirm}
            style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: canConfirm ? C.light : "#c9d4c2", color: "#fff", fontWeight: 800, cursor: canConfirm ? "pointer" : "default", fontFamily: FONT }}>
            {busy ? "Adding…" : `Confirm — add to ${plan.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
