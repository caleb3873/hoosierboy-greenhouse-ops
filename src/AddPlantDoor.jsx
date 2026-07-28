// AddPlantDoor — Phase 3 of the 2026-07-27 spec: THE one door for adding a plant.
// You decide four things (variety · size · ready-by as DATE or WEEK · quantity);
// the crop recipe fills the rest (source+price via the pinned broker, form/tray/rooting
// from the series spec, crop weeks), the chain derives (ready − crop = plant ·
// plant − root = ship/arrive, year-wrapped), and ONE confirm writes all three layers:
// decision (plan_targets) + plant (scheduled_crops, recipe-linked, bench assigned later)
// + receive/transplant tasks. Deciding and creating stop being separate systems.
//
// HOUSE RULE (7/28): material comes from the broker catalogs ONLY. You can't buy a
// plant nobody sells — if it isn't quoted, import the quote first, then add it here.
// FAMILY ADD (7/28): check off several colors of one crop → pick the size → they land
// together and the family page opens to set quantities and the unifying recipe.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

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
const titleCase = s => String(s || "").replace(/\b\w/g, ch => ch.toUpperCase());
function sizePrefix(sizeLabel) {
  let m;
  if ((m = sizeLabel.match(/^([\d.]+)" HB$/))) return `HB ${m[1]}"`;
  if ((m = sizeLabel.match(/^([\d.]+)" Fiber$/))) return +m[1] >= 10 ? "FIBER LG." : "FIBER SM.";
  if ((m = sizeLabel.match(/^([\d.]+)" (Pot|Pan|Bowl)$/))) return +m[1] <= 6.5 ? `${m[1]}"` : `POT ${m[1]}"`;
  return sizeLabel.toUpperCase();
}
// library convention: variety names carry no crop prefix
const stripCrop = (crop, name) => {
  const c = titleCase(crop); let v = String(name || "").trim();
  return v.toLowerCase().startsWith(c.toLowerCase() + " ") ? v.slice(c.length + 1) : v;
};

export default function AddPlantDoor({ plan, onClose, onCreated, onOpenFamily }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const planYear = plan.year || new Date().getFullYear();

  const [q, setQ] = useState("");
  const [variety, setVariety] = useState(null);      // variety_library row (single-add)
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
  const [newRec, setNewRec] = useState(null);   // {size_label, crop_weeks, pots_per_unit, ppp, form, rooting_weeks}
  const [sizeOptions, setSizeOptions] = useState([]);
  const [sel, setSel] = useState([]);           // catalog hits checked for a family add
  const [famMode, setFamMode] = useState(false);
  const [famPerennial, setFamPerennial] = useState(false);

  useEffect(() => {   // Escape always exits, no matter what state the door is in
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // reuse the library row if the key exists, else mint it from the quote — the broker
  // catalog is the only birthplace of new varieties now (no free-text creation)
  async function ensureVariety(c) {
    const { data: dupe } = await sb.from("variety_library").select("id,crop_name,variety,variety_key").eq("variety_key", c.key).limit(1);
    if (dupe?.length) return dupe[0];
    const crop = titleCase(c.crop);
    const vname = stripCrop(c.crop, c.name);
    const id = crypto.randomUUID();
    const { error } = await sb.from("variety_library").insert({
      id, crop_name: crop, variety: vname, variety_key: c.key, notes: "created from the broker catalog (Add a plant)" });
    if (error) throw new Error(error.message);
    return { id, crop_name: crop, variety: vname, variety_key: c.key };
  }

  async function createRecipe() {
    const cropName = variety?.crop_name || (sel.length ? titleCase(sel[0].crop) : null);
    if (!cropName || !newRec?.size_label?.trim() || !newRec?.crop_weeks) return;
    setBusy(true); setErr("");
    try {
      const rec = {
        crop_name: cropName, size_label: newRec.size_label.trim(),
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

  // material search — the broker catalogs ONLY (39k quote lines, by cultivar/series).
  // If nobody quotes it, it doesn't appear: you can't buy a plant with no supplier.
  const [catHits, setCatHits] = useState([]);
  const [catTotal, setCatTotal] = useState(0);
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim().replace(/[%,()]/g, "");
      if (s.length < 2) { setCatHits([]); setCatTotal(0); return; }
      const toks = s.split(/\s+/).filter(Boolean);
      // wide net, NOT cheapest-first — a $0.125 legacy quote must not crowd out a new line
      let cq = sb.from("broker_prices").select("variety_key,crop,variety,broker,supplier,form_class,landed").limit(500);
      toks.forEach(t => { cq = cq.or(`variety.ilike.%${t}%,crop.ilike.%${t}%`); });
      const { data } = await cq;
      const byKey = {};
      (data || []).forEach(r => {
        const o = byKey[r.variety_key] || (byKey[r.variety_key] = { key: r.variety_key, crop: r.crop, name: r.variety, quotes: [] });
        if (r.variety && r.variety.length < o.name.length) o.name = r.variety;   // shortest = cleanest label
        o.quotes.push({ broker: r.broker, supplier: r.supplier, form: r.form_class, landed: +r.landed });
      });
      const all = Object.values(byKey).map(o => ({
        ...o,
        min: Math.min(...o.quotes.map(x => x.landed)),
        brokers: [...new Set(o.quotes.map(x => x.broker))],
        best: o.quotes.reduce((a, b) => a.landed <= b.landed ? a : b),
      }));
      // rank: name relevance first (all tokens in the VARIETY name beats crop-only), then A-Z
      const score = o => (toks.every(t => o.name.toLowerCase().includes(t.toLowerCase())) ? 0 : 1);
      all.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
      setCatTotal(all.length);
      const top = all.slice(0, 14);
      // badge the ones already in the library — grown (or at least planned) before
      let ks = new Set();
      if (top.length) {
        const { data: known } = await sb.from("variety_library").select("variety_key").in("variety_key", top.map(x => x.key));
        ks = new Set((known || []).map(k => k.variety_key));
      }
      setCatHits(top.map(x => ({ ...x, known: ks.has(x.key) })));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  async function pickCatalog(c) {
    setBusy(true); setErr("");
    try { setVariety(await ensureVariety(c)); setQ(""); setCatHits([]); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // family-add selection: colors of ONE crop travel together (a family = crop × size)
  const selCrop = sel.length ? String(sel[0].crop || "").toLowerCase() : null;
  const toggleSel = c => setSel(cur => cur.some(x => x.key === c.key)
    ? cur.filter(x => x.key !== c.key) : [...cur, c]);

  // crop in play (either lane) → its recipes
  const cropName = variety?.crop_name || (sel.length ? titleCase(sel[0].crop) : null);
  useEffect(() => {
    if (!cropName) { setRecipes([]); setRecipeId(null); return; }
    (async () => {
      const { data: recs } = await sb.from("crop_recipes").select("*")
        .ilike("crop_name", cropName).order("size_label");
      setRecipes(recs || []);
      setRecipeId(recs?.length === 1 ? recs[0].id : null);
    })();
  }, [cropName, sb]); // eslint-disable-line

  const recipe = useMemo(() => recipes.find(r => r.id === recipeId) || null, [recipes, recipeId]);
  useEffect(() => { setFamPerennial(recipe?.plant_class === "perennial"); }, [recipe]);

  // recipe chosen → its series
  useEffect(() => {
    if (!recipe) { setSeries([]); return; }
    (async () => {
      const { data: ser } = await sb.from("crop_recipe_series").select("*").eq("recipe_id", recipe.id);
      setSeries(ser || []);
    })();
  }, [recipe, sb]);

  const sMatchFor = vname => {
    if (!series.length || !vname) return null;
    const named = series.filter(s => s.series_name !== "(unassigned)").sort((a, b) => b.series_name.length - a.series_name.length);
    return named.find(s => vname.toLowerCase().startsWith(s.series_name.toLowerCase()))
      || series.find(s => s.series_name === "(unassigned)") || null;
  };
  const sMatch = useMemo(() => sMatchFor(variety?.variety
    || (sel.length ? stripCrop(sel[0].crop, sel[0].name) : null)),
    [series, variety, sel]); // eslint-disable-line

  // single-add: best quote (pinned broker first, then cheapest) for the chosen variety
  useEffect(() => {
    if (!recipe || !variety || !series.length) { setQuote(null); return; }
    (async () => {
      const sm = sMatchFor(variety.variety);
      const fc = FORM_TO_CLASS(sm?.form);
      let qq = sb.from("broker_prices").select("broker,supplier,form_class,landed").eq("variety_key", variety.variety_key).order("landed");
      if (fc) qq = qq.eq("form_class", fc);
      const { data: quotes } = await qq.limit(10);
      let best = null;
      if (quotes?.length) {
        best = (sm?.pinned_broker && quotes.find(x => x.broker === sm.pinned_broker)) || quotes[0];
        best = { ...best, alts: quotes.length - 1, pinnedHit: best.broker === sm?.pinned_broker };
      }
      setQuote(best);
    })();
  }, [recipe, variety, series, sb]); // eslint-disable-line

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

  // item-name prefill whenever the single pick changes (stays editable)
  useEffect(() => {
    if (!recipe || !variety) return;
    setItemName(`${sizePrefix(recipe.size_label)} ${variety.crop_name} ${variety.variety}`.toUpperCase());
  }, [recipe, variety]);

  const u = Math.max(0, parseInt(units, 10) || 0);
  const ppu = recipe ? Math.max(1, Math.round(+recipe.pots_per_unit || 1)) : 1;
  const pots = u * ppu;
  const plants = pots * (recipe ? Math.max(1, Math.round(+recipe.ppp || 1)) : 1);
  const canConfirm = recipe && variety && chain && !chain.incomplete && u > 0 && itemName.trim() && !busy;
  const canFamConfirm = famMode && sel.length > 0 && recipe && chain && !chain.incomplete && !busy;

  // one item = one write set: plant row + decision + tasks + history
  async function writeItem(v, recipeRow, unitsIn, nameOverride) {
    const sm = sMatchFor(v.variety);
    const cw = Math.round(+recipeRow.crop_weeks);
    const p = wrapWk(chain.readyWk - cw, planYear);
    const rooted = /^(URC|CALL)/i.test(sm?.form || "");
    const root = rooted ? Math.round(+(sm?.rooting_weeks ?? 0)) : 0;
    const s = wrapWk(p.wk - root, p.year);
    const fc = FORM_TO_CLASS(sm?.form);
    let qq = sb.from("broker_prices").select("broker,supplier,landed").eq("variety_key", v.variety_key).order("landed");
    if (fc) qq = qq.eq("form_class", fc);
    const { data: quotes } = await qq.limit(5);
    const best = quotes?.length
      ? ((sm?.pinned_broker && quotes.find(x => x.broker === sm.pinned_broker)) || quotes[0]) : null;
    const name = nameOverride || `${sizePrefix(recipeRow.size_label)} ${v.crop_name} ${v.variety}`.toUpperCase();
    const { data: clash } = await sb.from("scheduled_crops").select("id").eq("plan_id", plan.id).eq("item_name", name).limit(1);
    if (clash?.length) return { name, skipped: true };
    const uPots = unitsIn * Math.max(1, Math.round(+recipeRow.pots_per_unit || 1));
    const uPlants = uPots * Math.max(1, Math.round(+recipeRow.ppp || 1));
    const { error: e1 } = await sb.from("scheduled_crops").insert({
      id: crypto.randomUUID(), plan_id: plan.id, item_name: name,
      variety_id: v.id, recipe_id: recipeRow.id,
      container_id: recipeRow.default_container_id || null,
      qty_pots: uPots, ppp: Math.max(1, Math.round(+recipeRow.ppp || 1)),
      pack_size: Math.max(1, Math.round(+recipeRow.pots_per_unit || 1)),
      plants_per_unit: Math.max(1, Math.round(+recipeRow.pots_per_unit || 1)),
      qty_plants_ordered: null,               // supply committed at ordering, not here
      crop_weeks: cw,
      ready_week: chain.readyWk, ready_year: chain.readyYear,
      plant_week: p.wk, plant_year: p.year,
      ship_week: s.wk, ship_year: s.year,
      prop_method: sm?.form || null, prop_tray_id: sm?.prop_tray_id || null,
      broker: best?.broker || sm?.pinned_broker || null,
      supplier: best?.supplier || sm?.pinned_supplier || null,
      liner_unit_cost: best?.landed != null ? +best.landed : null,
      bench_id: null,                          // space assigned later, same as duplicates
      is_combo_component: false, sellable: true, status: "planned",
      notes: "added via Add a plant",
    });
    if (e1) throw new Error(`${name}: ${e1.message}`);
    const { error: e2 } = await sb.from("plan_targets").upsert({
      plan_id: plan.id, item_name: name, target_units: unitsIn, decision: "grow",
      note: "created via Add a plant", decided_by: displayName || null,
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "plan_id,item_name" });
    if (e2) throw new Error(`${name}: ${e2.message}`);
    if (unitsIn > 0) {   // zero-qty family stubs get their tasks once quantities land
      const tasks = [];
      if (rooted) tasks.push({
        date: isoWeekMonday(s.year, s.wk),
        title: `Receive & stick ${name} (wk ${s.wk})`,
        desc: `${uPlants.toLocaleString()} ${sm?.form || ""} arrive → stick${sm?.prop_tray_id ? " into prop trays" : ""}. Root ~${root}wk, transplant wk ${p.wk}.`,
      });
      tasks.push({
        date: isoWeekMonday(p.year, p.wk),
        title: `${rooted ? "Transplant" : "Plant"} ${name} (wk ${p.wk})`,
        desc: `${uPots.toLocaleString()} pots · ready wk ${chain.readyWk}. Bench assignment pending.`,
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
    }
    try {
      await sb.from("item_change_log").insert({
        plan_id: plan.id, item_name: name, variety_key: v.variety_key,
        change_type: "created", changed_by: displayName || null, source: "add-door",
        detail: { units: unitsIn, pots: uPots, ready: yyww(chain.readyWk, chain.readyYear), plant: yyww(p.wk, p.year), ship: yyww(s.wk, s.year), broker: best?.broker || null, liner: best?.landed ?? null },
      });
    } catch { /* audit must never block */ }
    return { name, skipped: false };
  }

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true); setErr("");
    try {
      // single add honors the edited item name — same write set as the family path
      const res = await writeItem(variety, recipe, u, itemName.trim());
      if (res.skipped) { setErr(`"${res.name}" already exists in ${plan.name} — open it instead, or change the name.`); setBusy(false); return; }
      onCreated?.(res.name);
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function famConfirm() {
    if (!canFamConfirm) return;
    setBusy(true); setErr("");
    const added = [], skipped = [];
    try {
      for (const c of sel) {
        const v = await ensureVariety(c);
        const res = await writeItem(v, recipe, u);
        (res.skipped ? skipped : added).push(res.name);
      }
      if (famPerennial !== (recipe.plant_class === "perennial")) {
        await sb.from("crop_recipes").update({ plant_class: famPerennial ? "perennial" : null }).eq("id", recipe.id);
      }
      onCreated?.(added.join(", "));
      onOpenFamily?.(recipe.id);   // straight to the family page — numbers + recipe live there
      onClose();
    } catch (e) {
      setErr(e.message + (added.length ? ` — ${added.length} of ${sel.length} were added before the failure` : ""));
      setBusy(false);
    }
  }

  const lbl = { fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, display: "block", marginBottom: 4 };
  const ctl = { width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 9, border: `1.5px solid ${C.creamBr}`, fontSize: 14, fontFamily: FONT };
  const rrow = { display: "flex", gap: 10, alignItems: "baseline", padding: "7px 12px", borderBottom: `1px solid ${C.creamBr}`, fontSize: 12.5 };
  const rk = { fontWeight: 800, color: C.dark, width: 52, flex: "none", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".4px" };

  const starterRecipePanel = !newRec
    ? <button onClick={() => setNewRec({ size_label: "", crop_weeks: "", pots_per_unit: 1, ppp: 1, form: "URC", rooting_weeks: "" })}
        style={{ marginTop: 6, padding: "7px 12px", borderRadius: 9, border: `1.5px dashed ${C.light}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
        ＋ Create a starter recipe for {cropName}</button>
    : (
      <div style={{ marginTop: 8, background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "10px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, marginBottom: 8 }}>STARTER RECIPE — set once, refine on the family page later</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Size label</label>
            <input list="apd-sizes" value={newRec?.size_label || ""} onChange={e => setNewRec({ ...newRec, size_label: e.target.value })} placeholder={`e.g. 4.5" Pot · 10" HB`} style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} />
            <datalist id="apd-sizes">{sizeOptions.map(s => <option key={s} value={s} />)}</datalist></div>
          <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Crop wks</label>
            <input value={newRec?.crop_weeks || ""} onChange={e => setNewRec({ ...newRec, crop_weeks: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
          <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Pots / unit</label>
            <input value={newRec?.pots_per_unit ?? 1} onChange={e => setNewRec({ ...newRec, pots_per_unit: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
          <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>PPP</label>
            <input value={newRec?.ppp ?? 1} onChange={e => setNewRec({ ...newRec, ppp: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
          <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Form</label>
            <select value={newRec?.form || "URC"} onChange={e => setNewRec({ ...newRec, form: e.target.value })} style={{ ...ctl, padding: "7px 9px", fontSize: 13, cursor: "pointer" }}>
              {["URC", "CALL", "PLUG", "SEED", "BULB", "LINER"].map(f => <option key={f}>{f}</option>)}
            </select></div>
          {/^(URC|CALL)$/.test(newRec?.form || "") && (
            <div><label style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>Root wks</label>
              <input value={newRec?.rooting_weeks || ""} onChange={e => setNewRec({ ...newRec, rooting_weeks: e.target.value })} inputMode="numeric" style={{ ...ctl, padding: "7px 9px", fontSize: 13 }} /></div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button disabled={busy || !newRec?.size_label?.trim() || !newRec?.crop_weeks} onClick={createRecipe}
            style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Create recipe →</button>
          <button onClick={() => setNewRec(null)} style={{ padding: "7px 13px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: C.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>back</button>
        </div>
      </div>
    );

  const readyByRow = (
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
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 640, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {famMode ? "Add a plant family" : "Add a plant"}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{plan.name} · sourced from the broker catalogs only</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {/* ① decide — search the catalogs (single click = one plant · checkboxes = a family) */}
        {!famMode && (
        <div style={{ marginTop: 12 }}>
          <label style={lbl}>Variety</label>
          {!variety ? (
            <>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search the broker catalogs — cultivar or series…" style={ctl} />
              {!!catHits.length && (
                <div style={{ border: `1px solid ${C.creamBr}`, borderRadius: 10, marginTop: 6, overflow: "hidden", background: "#fff" }}>
                  <div style={{ padding: "4px 11px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, background: C.chip }}>
                    Broker catalogs · click = add one · ☑ several colors = add a family
                  </div>
                  {catHits.map(c => {
                    const checked = sel.some(x => x.key === c.key);
                    const cropBlock = selCrop && String(c.crop || "").toLowerCase() !== selCrop;
                    return (
                      <div key={c.key} style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${C.border}`, background: checked ? C.cream : "#fff" }}>
                        <input type="checkbox" checked={checked} disabled={cropBlock}
                          title={cropBlock ? `A family is one crop — this selection is ${titleCase(sel[0].crop)}` : "check colors to add together as a family"}
                          onChange={() => toggleSel(c)} style={{ margin: "0 4px 0 10px", cursor: cropBlock ? "not-allowed" : "pointer" }} />
                        <button disabled={busy} onClick={() => pickCatalog(c)}
                          style={{ display: "block", flex: 1, textAlign: "left", padding: "8px 11px", background: "transparent",
                            border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 13 }}>
                          <b>{c.name}</b> <span style={{ color: C.muted, fontSize: 11.5 }}>{c.crop}</span>
                          {c.known && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: C.green, background: "#eaf5e9", borderRadius: 6, padding: "1px 6px" }}>in library</span>}
                          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>
                            {c.best.broker}{c.best.supplier ? ` · ${c.best.supplier}` : ""} · {c.best.form || "?"} from <b style={{ color: C.dark }}>${c.min.toFixed(3)}</b>
                            {c.brokers.length > 1 ? ` · +${c.brokers.length - 1} more broker${c.brokers.length > 2 ? "s" : ""}` : ""}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  {catTotal > catHits.length && (
                    <div style={{ padding: "6px 11px", fontSize: 10.5, color: C.muted, background: "#fbfdf8" }}>
                      showing {catHits.length} of {catTotal} catalog matches — add a word to narrow (e.g. the series)
                    </div>
                  )}
                </div>
              )}
              {q.trim().length >= 2 && !catHits.length && (
                <div style={{ marginTop: 6, background: C.amberBg, border: `1.5px solid #ecd9b8`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: C.text }}>
                  <b style={{ color: C.amber }}>Nothing in the broker catalogs for “{q.trim()}”.</b>
                  <div style={{ marginTop: 3, color: C.muted, fontSize: 11.5 }}>
                    You can't buy a plant nobody sells — import the broker's quote first (Spring Plan → Sourcing), then it shows up here with its price.
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
          {!variety && sel.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", background: C.cream, border: `1.5px solid ${C.creamBr}`, borderRadius: 10, padding: "8px 10px" }}>
              {sel.map(c => (
                <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${C.creamBr}`, borderRadius: 14, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>
                  {stripCrop(c.crop, c.name)}
                  <button onClick={() => toggleSel(c)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                </span>
              ))}
              <button onClick={() => setFamMode(true)}
                style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 9, border: "none", background: C.dark, color: "#c8e6b8", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
                🌿 Add {sel.length} as a family →
              </button>
            </div>
          )}
        </div>
        )}

        {/* family mode — one crop, many colors: size + ready + starting qty, numbers refined on the family page */}
        {famMode && (
          <>
            <div style={{ marginTop: 12, background: C.cream, border: `1.5px solid ${C.creamBr}`, borderRadius: 10, padding: "8px 10px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginBottom: 5 }}>{titleCase(sel[0]?.crop)} — {sel.length} variet{sel.length === 1 ? "y" : "ies"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sel.map(c => (
                  <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${C.creamBr}`, borderRadius: 14, padding: "3px 9px", fontSize: 11.5, fontWeight: 700 }}>
                    {stripCrop(c.crop, c.name)} <span style={{ color: C.muted, fontWeight: 600 }}>${c.min.toFixed(3)}+</span>
                    <button onClick={() => { toggleSel(c); if (sel.length === 1) setFamMode(false); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
                  </span>
                ))}
                <button onClick={() => setFamMode(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11.5, fontWeight: 700 }}>← back to search</button>
              </div>
            </div>
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
                    No recipes for {cropName} yet — set the starter once, the whole family rides it.
                  </div>
                )}
                {starterRecipePanel}
              </div>
              <div>
                <label style={lbl}>Units per variety (start)</label>
                <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="0 — set each on the family page" style={ctl} />
                {recipe && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                  {u > 0 ? `= ${pots.toLocaleString()} pots each · tasks created` : "0 is fine — quantities land on the family page next"}
                </div>}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Ready by (all — regroup later on the family page)</label>
                {readyByRow}
              </div>
              <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: C.text, cursor: "pointer" }}>
                <input type="checkbox" checked={famPerennial} onChange={e => setFamPerennial(e.target.checked)} style={{ cursor: "pointer" }} />
                🌲 This family is perennial <span style={{ fontWeight: 500, color: C.muted }}>— tags the recipe; filters in Sales vs Plan</span>
              </label>
            </div>
            {recipe && (
              <div style={{ marginTop: 12, border: `1px solid ${C.creamBr}`, borderRadius: 11, overflow: "hidden", background: C.cream }}>
                <div style={rrow}><span style={rk}>Chain</span>
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 12.5 }}>
                    {chain && !chain.incomplete
                      ? <>{chain.rooted ? `arrive/stick ${yyww(chain.ship.wk, chain.ship.year)} → ` : ""}plant <b>{yyww(chain.plant.wk, chain.plant.year)}</b> → ready <b style={{ color: C.green }}>{yyww(chain.readyWk, chain.readyYear)}</b></>
                      : <span style={{ color: C.muted }}>set a ready date…</span>}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.muted }}>← derived</span>
                </div>
                <div style={{ ...rrow, borderBottom: "none" }}><span style={rk}>Source</span>
                  <span style={{ flex: 1, color: C.muted, fontSize: 12 }}>each color takes its pinned broker (or cheapest form-matched quote) at confirm</span>
                </div>
              </div>
            )}
          </>
        )}

        {!famMode && variety && (
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
              {starterRecipePanel}
            </div>
            <div>
              <label style={lbl}>Quantity (units)</label>
              <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="e.g. 120" style={ctl} />
              {recipe && u > 0 && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>= {pots.toLocaleString()} pots · {plants.toLocaleString()} plants{ppu > 1 ? ` (${ppu}/unit)` : ""}</div>}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Ready by</label>
              {readyByRow}
            </div>
          </div>
        )}

        {/* ② recipe fills · ③ chain (single add) */}
        {!famMode && variety && recipe && (
          <div style={{ marginTop: 12, border: `1px solid ${C.creamBr}`, borderRadius: 11, overflow: "hidden", background: C.cream }}>
            <div style={rrow}><span style={rk}>Source</span>
              <span style={{ flex: 1 }}>{quote
                ? <>{quote.broker}{quote.supplier ? ` · ${quote.supplier}` : ""} · <b>${(+quote.landed).toFixed(3)}</b>/liner
                    {quote.pinnedHit ? <span style={{ marginLeft: 6, fontSize: 10, color: C.green, fontWeight: 800 }}>📌 pinned</span>
                      : sMatch?.pinned_broker ? <span style={{ marginLeft: 6, fontSize: 10, color: C.amber, fontWeight: 800 }}>⚠ pin is {sMatch.pinned_broker}</span> : null}
                    {quote.alts > 0 && <span style={{ color: C.muted, fontSize: 11 }}> · {quote.alts} alt{quote.alts > 1 ? "s" : ""}</span>}</>
                : <span style={{ color: C.amber }}>no quote in this form — the supplier exists, match the form on the family page</span>}</span>
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
            {famMode
              ? "One confirm writes every color: plant rows + decisions + history — then the family page opens for quantities."
              : "One confirm writes: decision (plan_targets) · plant row (recipe-linked, bench later) · receive + transplant tasks · history."}
          </span>
          <button onClick={onClose} style={{ padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#fff", color: C.text, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          {famMode
            ? <button disabled={!canFamConfirm} onClick={famConfirm}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: canFamConfirm ? C.light : "#c9d4c2", color: "#fff", fontWeight: 800, cursor: canFamConfirm ? "pointer" : "default", fontFamily: FONT }}>
                {busy ? "Adding…" : `Confirm — add ${sel.length} & open the family`}
              </button>
            : <button disabled={!canConfirm} onClick={confirm}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: canConfirm ? C.light : "#c9d4c2", color: "#fff", fontWeight: 800, cursor: canConfirm ? "pointer" : "default", fontFamily: FONT }}>
                {busy ? "Adding…" : `Confirm — add to ${plan.name}`}
              </button>}
        </div>
      </div>
    </div>
  );
}
