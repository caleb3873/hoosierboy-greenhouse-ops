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
import { wrapWk, sizeSortVal } from "./shared";

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
// wrapWk now honors 53-week years (2026!) — shared implementation
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

export default function AddPlantDoor({ plan, onClose, onCreated, onOpenFamily, initialReadyWk }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const planYear = plan.year || new Date().getFullYear();

  const [q, setQ] = useState("");
  const [variety, setVariety] = useState(null);      // variety_library row (single-add)
  const [recipes, setRecipes] = useState([]);        // crop_recipes for the crop
  const [sizeSel, setSizeSel] = useState("");         // chosen SIZE label — the recipe is resolved/stubbed from it
  const [series, setSeries] = useState([]);          // series of the chosen recipe
  const [quote, setQuote] = useState(null);          // {landed, broker, supplier, alts}
  const [mode, setMode] = useState(initialReadyWk != null ? "week" : "date");
  const [readyDate, setReadyDate] = useState(`${planYear}-04-15`);
  const [readyWkIn, setReadyWkIn] = useState(initialReadyWk != null ? String(initialReadyWk) : "16");
  const [units, setUnits] = useState("");
  const [itemName, setItemName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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

  useEffect(() => {   // the size vocabulary — every size we already carry, for the Size dropdown
    (async () => {
      const { data } = await sb.from("crop_recipes").select("size_label").limit(400);
      setSizeOptions([...new Set((data || []).map(r => r.size_label))].sort((a, b) => sizeSortVal(a) - sizeSortVal(b) || a.localeCompare(b)));
    })();
  }, [sb]); // eslint-disable-line

  // material search — the broker catalogs ONLY (39k quote lines, by cultivar/series).
  // If nobody quotes it, it doesn't appear: you can't buy a plant with no supplier.
  // Ordered breeder → series → variety (variety names lead with the series, so
  // supplier + name A-Z clusters exactly that way). Full list, paged 30 at a time.
  const [catHits, setCatHits] = useState([]);
  const [catShow, setCatShow] = useState(30);
  const [supFilt, setSupFilt] = useState("");
  const [rawCap, setRawCap] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim().replace(/[%,()]/g, "");
      if (s.length < 2) { setCatHits([]); setRawCap(false); return; }
      const toks = s.split(/\s+/).filter(Boolean);
      let cq = sb.from("broker_prices").select("variety_key,crop,variety,broker,supplier,form_class,landed").limit(1000);
      toks.forEach(t => { cq = cq.or(`variety.ilike.%${t}%,crop.ilike.%${t}%`); });
      const { data } = await cq;
      setRawCap((data || []).length === 1000);   // hit the fetch cap — the list may be partial
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
      all.sort((a, b) => (a.best.supplier || "~").localeCompare(b.best.supplier || "~") || a.name.localeCompare(b.name));
      // grown-before badges for the WHOLE list (chunked lookups)
      const keys = all.map(x => x.key); const ks = new Set();
      for (let i = 0; i < keys.length; i += 200) {
        const { data: kn } = await sb.from("variety_library").select("variety_key").in("variety_key", keys.slice(i, i + 200));
        (kn || []).forEach(k => ks.add(k.variety_key));
      }
      setCatHits(all.map(x => ({ ...x, known: ks.has(x.key) })));
      setCatShow(30); setSupFilt("");
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  // supplier (breeder) filter options — how many varieties each supplier covers in this search
  const suppliers = useMemo(() => {
    const m = {};
    catHits.forEach(h => [...new Set(h.quotes.map(x => x.supplier).filter(Boolean))].forEach(s => { m[s] = (m[s] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catHits]);
  // filtered view: with a supplier picked, each hit shows THAT supplier's quotes/price
  const catView = useMemo(() => {
    if (!supFilt) return catHits;
    return catHits.filter(h => h.quotes.some(x => x.supplier === supFilt)).map(h => {
      const qs = h.quotes.filter(x => x.supplier === supFilt);
      return { ...h, quotes: qs, min: Math.min(...qs.map(x => x.landed)),
        brokers: [...new Set(qs.map(x => x.broker))], best: qs.reduce((a, b) => a.landed <= b.landed ? a : b) };
    });
  }, [catHits, supFilt]);

  async function pickCatalog(c) {
    setBusy(true); setErr("");
    try { setVariety(await ensureVariety(c)); setQ(""); setCatHits([]); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // family-add selection: colors of ONE crop travel together (a family = crop × size).
  // Match by NORMALIZED GENUS (the variety_key's first token), NOT the raw crop string —
  // brokers label the same genus three ways ("SALVIA" / "SALVIA SPECIES" / "SAGE"), and a
  // raw-string compare greyed out every color that wasn't labeled like the first pick
  // (Caleb 7/29). Genus token keeps all Salvia selectable while still blocking a true
  // different crop (Russian/Perovskia keys to "russian", not "sage").
  const selGenus = sel.length ? String(sel[0].key || "").split(" ")[0] : null;
  const toggleSel = c => setSel(cur => cur.some(x => x.key === c.key)
    ? cur.filter(x => x.key !== c.key) : [...cur, c]);

  // crop in play (either lane) → its recipes
  const cropName = variety?.crop_name || (sel.length ? titleCase(sel[0].crop) : null);
  useEffect(() => {
    if (!cropName) { setRecipes([]); setSizeSel(""); return; }
    (async () => {
      const { data: recs } = await sb.from("crop_recipes").select("*")
        .ilike("crop_name", cropName).order("size_label");
      setRecipes(recs || []);
      setSizeSel(recs?.length === 1 ? recs[0].size_label : "");
    })();
  }, [cropName, sb]); // eslint-disable-line

  // the SIZE drives everything; the recipe is whatever existing recipe carries that size for
  // this crop (or null → a stub gets created at confirm — you don't have to define it here)
  const recipe = useMemo(() => recipes.find(r => r.size_label === sizeSel) || null, [recipes, sizeSel]);
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

  // the chain: ready − crop = plant · plant − root = ship (URC/CALL; plug/seed ship at plant).
  // Week input takes "15" (plan year) or YYWW ("2715"); a PAST ready week blocks confirm —
  // Caleb typed 2615 for 2715 and nothing said a word (7/29).
  const chain = useMemo(() => {
    let readyWk = null, readyYear = planYear;
    if (mode === "date") {
      if (readyDate) { readyWk = isoWeek(new Date(readyDate + "T00:00:00")); readyYear = +readyDate.slice(0, 4); }
    } else {
      const d = String(readyWkIn).replace(/\D/g, "");
      if (d.length > 2) { readyYear = 2000 + +d.slice(0, 2); readyWk = +d.slice(2) || null; }
      else if (d) readyWk = Math.max(1, Math.min(53, +d));
    }
    if (!readyWk || readyWk > 53) return { readyWk, incomplete: true };
    const n = new Date();
    const curWk = isoWeek(n), curYr = n.getFullYear();
    if (readyYear < curYr || (readyYear === curYr && readyWk < curWk)) {
      return { readyWk, readyYear, past: true, incomplete: true, curWk, curYr };
    }
    // no crop weeks yet (a brand-new size / catalog stub) — the item still lands with its
    // ready week; plant/ship fill in once the recipe gets crop weeks on the family page
    if (recipe?.crop_weeks == null) return { readyWk, readyYear, weeksUnknown: true };
    const p = wrapWk(readyWk - Math.round(+recipe.crop_weeks), readyYear);
    const rooted = /^(URC|CALL)/i.test(sMatch?.form || "");
    const root = rooted ? Math.round(+(sMatch?.rooting_weeks ?? 0)) : 0;
    const s = wrapWk(p.wk - root, p.year);
    return { readyWk, readyYear, plant: p, ship: s, rooted, root };
  }, [recipe, sMatch, mode, readyDate, readyWkIn, planYear]);

  // pots-per-unit for a not-yet-created size follows the house convention (4.5" sells in
  // flats of 10, everything else 1) so the pot math holds even before the recipe exists
  const inferPPU = sz => /^\s*4\.5"/.test(String(sz || "")) ? 10 : 1;
  // item-name prefill whenever the single pick / size changes (stays editable)
  useEffect(() => {
    if (!sizeSel || !variety) return;
    setItemName(`${sizePrefix(sizeSel)} ${variety.crop_name} ${variety.variety}`.toUpperCase());
  }, [sizeSel, variety]);

  const u = Math.max(0, parseInt(units, 10) || 0);
  const ppu = recipe ? Math.max(1, Math.round(+recipe.pots_per_unit || 1)) : inferPPU(sizeSel);
  const pots = u * ppu;
  const plants = pots * (recipe ? Math.max(1, Math.round(+recipe.ppp || 1)) : 1);
  // ready week must be valid and not in the past; the recipe/crop-weeks can come LATER
  const readyOk = chain && chain.readyWk && !chain.past;
  const canConfirm = variety && sizeSel && readyOk && u > 0 && itemName.trim() && !busy;
  const canFamConfirm = famMode && sel.length > 0 && sizeSel && readyOk && !busy;

  // resolve the recipe for this crop+size, or STUB one silently — you add products to the
  // catalog by size; the recipe details (crop weeks, prop, tray) get filled on the family
  // page later. This is how the catalog gets assembled fast (Caleb 7/29).
  async function resolveRecipe(crop, sizeLabel) {
    const existing = recipes.find(r => r.size_label === sizeLabel && r.crop_name?.toLowerCase() === crop.toLowerCase());
    if (existing) return existing;
    const { data: ins, error } = await sb.from("crop_recipes").upsert({
      crop_name: crop, size_label: sizeLabel, pots_per_unit: inferPPU(sizeLabel), ppp: 1,
      updated_by: displayName || "planner",
      seeded_from: { source: "add-door", note: "catalog stub — set crop weeks / prop on the family page" },
    }, { onConflict: "crop_name,size_label" }).select("*").single();
    if (error) throw new Error(`recipe: ${error.message}`);
    await sb.from("crop_recipe_series").upsert({ recipe_id: ins.id, series_name: "(unassigned)" }, { onConflict: "recipe_id,series_name" });
    setRecipes(rs => rs.some(r => r.id === ins.id) ? rs : [...rs, ins]);
    return ins;
  }

  // one item = one write set: plant row + decision + tasks + history
  async function writeItem(v, recipeRow, unitsIn, nameOverride) {
    const sm = sMatchFor(v.variety);
    // crop weeks may be unknown for a fresh catalog stub — then plant/ship stay null (filled
    // when the recipe gets weeks); the row still lands with its ready week
    const cw = recipeRow.crop_weeks != null ? Math.round(+recipeRow.crop_weeks) : null;
    const readyYr = chain.readyYear ?? planYear;
    const rooted = /^(URC|CALL)/i.test(sm?.form || "");
    const root = rooted ? Math.round(+(sm?.rooting_weeks ?? 0)) : 0;
    const p = cw != null ? wrapWk(chain.readyWk - cw, readyYr) : null;
    const s = p ? wrapWk(p.wk - root, p.year) : null;
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
      ready_week: chain.readyWk, ready_year: chain.readyYear ?? planYear,
      plant_week: p?.wk ?? null, plant_year: p?.year ?? null,
      ship_week: s?.wk ?? null, ship_year: s?.year ?? null,
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
      plan_id: plan.id, item_name: name, target_units: uPots, decision: "grow",   // POTS (one unit, pots)
      note: "created via Add a plant", decided_by: displayName || null,
      decided_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "plan_id,item_name" });
    if (e2) throw new Error(`${name}: ${e2.message}`);
    if (unitsIn > 0 && p) {   // tasks need a plant week — a weeks-unknown stub gets them once the recipe has crop weeks
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
        detail: { units: unitsIn, pots: uPots, ready: yyww(chain.readyWk, chain.readyYear ?? planYear), plant: p ? yyww(p.wk, p.year) : null, ship: s ? yyww(s.wk, s.year) : null, weeks_pending: cw == null, broker: best?.broker || null, liner: best?.landed ?? null },
      });
    } catch { /* audit must never block */ }
    return { name, skipped: false };
  }

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true); setErr("");
    try {
      const rec = await resolveRecipe(variety.crop_name, sizeSel);   // existing recipe, or a fresh stub
      // single add honors the edited item name — same write set as the family path
      const res = await writeItem(variety, rec, u, itemName.trim());
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
      const rec = await resolveRecipe(cropName, sizeSel);   // existing recipe, or a fresh stub for this size
      for (const c of sel) {
        const v = await ensureVariety(c);
        const res = await writeItem(v, rec, u);
        (res.skipped ? skipped : added).push(res.name);
      }
      if (famPerennial !== (rec.plant_class === "perennial")) {
        await sb.from("crop_recipes").update({ plant_class: famPerennial ? "perennial" : null }).eq("id", rec.id);
      }
      onCreated?.(added.join(", "));
      onOpenFamily?.(rec.id);   // straight to the family page — numbers + recipe live there
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

  // SIZE picker — pick from the sizes we already carry, or type a new one. The recipe is
  // resolved/stubbed from it at confirm; you never define a recipe here (Caleb 7/29:
  // "allow new products to be added without determining recipe — this is how we build the catalog").
  const cropForSize = cropName || variety?.crop_name;
  const sizeSelect = (
    <div>
      <input list="apd-sizes" value={sizeSel} onChange={e => setSizeSel(e.target.value)}
        placeholder={`pick or type a size — e.g. 4.5" Pot`} style={{ ...ctl, cursor: "text" }} />
      <datalist id="apd-sizes">{sizeOptions.map(s => <option key={s} value={s} />)}</datalist>
      {sizeSel && !recipe && (
        <div style={{ fontSize: 10.5, color: C.amber, background: C.amberBg, border: "1px solid #ecd9b8", borderRadius: 8, padding: "5px 8px", marginTop: 4 }}>
          new size for {cropForSize} — added to the catalog now; crop weeks &amp; prop get set on the family page later
        </div>
      )}
      {recipe && (
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
          {recipe.crop_weeks != null ? `crop ${recipe.crop_weeks}w` : "⚠ crop weeks not set — fill on the family page"}
          {recipe.pots_per_unit > 1 ? ` · ${recipe.pots_per_unit} pots/unit` : ""}
        </div>
      )}
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
                  <div style={{ padding: "4px 11px", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, background: C.chip, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1 }}>Broker catalogs · {catView.length} match{catView.length === 1 ? "" : "es"} · click = add one · ☑ = family</span>
                    <select value={supFilt} onChange={e => { setSupFilt(e.target.value); setCatShow(30); }}
                      title="filter by supplier (breeder)"
                      style={{ padding: "2px 5px", borderRadius: 6, border: `1px solid ${C.creamBr}`, fontSize: 10, fontWeight: 700, fontFamily: FONT, maxWidth: 190, background: supFilt ? C.amberBg : "#fff" }}>
                      <option value="">All suppliers</option>
                      {suppliers.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
                    </select>
                  </div>
                  {catView.slice(0, catShow).map(c => {
                    const checked = sel.some(x => x.key === c.key);
                    const cropBlock = selGenus && String(c.key || "").split(" ")[0] !== selGenus;
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
                            {c.best.supplier ? <><b style={{ color: C.text }}>{c.best.supplier}</b> · </> : null}
                            {c.best.broker} · {c.best.form || "?"} from <b style={{ color: C.dark }}>${c.min.toFixed(3)}</b>
                            {c.brokers.length > 1 ? ` · +${c.brokers.length - 1} more broker${c.brokers.length > 2 ? "s" : ""}` : ""}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                  {catView.length > catShow && (
                    <button onClick={() => setCatShow(n => n + 30)}
                      style={{ display: "block", width: "100%", padding: "8px 11px", border: "none", background: "#fbfdf8",
                        color: C.dark, fontWeight: 800, fontSize: 11.5, cursor: "pointer", fontFamily: FONT }}>
                      ↓ Show 30 more — {catView.length - catShow} remaining
                    </button>
                  )}
                  {supFilt && !catView.length && (
                    <div style={{ padding: "8px 11px", fontSize: 11.5, color: C.muted }}>no matches from {supFilt} — clear the supplier filter to see everyone</div>
                  )}
                  {rawCap && (
                    <div style={{ padding: "5px 11px", fontSize: 10, color: C.muted, background: "#fbfdf8", borderTop: `1px solid ${C.border}` }}>
                      broad search — first 1,000 quote lines shown; add a word (series, color) to be sure nothing's cut off
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
              <button onClick={() => { setVariety(null); setRecipes([]); setSizeSel(""); setQ(""); }}
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
                <label style={lbl}>Size</label>
                {sizeSelect}
              </div>
              <div>
                <label style={lbl}>Units per variety (start)</label>
                <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="0 — set each on the family page" style={ctl} />
                {sizeSel && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                  {u > 0 ? `= ${pots.toLocaleString()} pots each${chain?.weeksUnknown ? "" : " · tasks created"}` : "0 is fine — quantities land on the family page next"}
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
            {sizeSel && (
              <div style={{ marginTop: 12, border: `1px solid ${C.creamBr}`, borderRadius: 11, overflow: "hidden", background: C.cream }}>
                <div style={rrow}><span style={rk}>Chain</span>
                  <span style={{ flex: 1, fontFamily: MONO, fontSize: 12.5 }}>
                    {chain && chain.weeksUnknown
                      ? <>ready <b style={{ color: C.green }}>{yyww(chain.readyWk, chain.readyYear)}</b> <span style={{ color: C.muted }}>· plant/stick fill in once this size has crop weeks (family page)</span></>
                    : chain && !chain.incomplete
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
              <label style={lbl}>Size</label>
              {sizeSelect}
            </div>
            <div>
              <label style={lbl}>Quantity (units)</label>
              <input value={units} onChange={e => setUnits(e.target.value)} inputMode="numeric" placeholder="e.g. 120" style={ctl} />
              {sizeSel && u > 0 && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>= {pots.toLocaleString()} pots · {plants.toLocaleString()} plants{ppu > 1 ? ` (${ppu}/unit)` : ""}</div>}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Ready by</label>
              {readyByRow}
            </div>
          </div>
        )}

        {/* ② recipe fills · ③ chain (single add) */}
        {!famMode && variety && sizeSel && (
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
                {chain?.weeksUnknown
                  ? <>ready <b style={{ color: C.green }}>{yyww(chain.readyWk, chain.readyYear)}</b> <span style={{ color: C.muted }}>· plant/stick fill in once this size has crop weeks</span></>
                : chain && !chain.incomplete
                  ? <>{chain.rooted ? `arrive/stick ${yyww(chain.ship.wk, chain.ship.year)} → ` : ""}plant <b>{yyww(chain.plant.wk, chain.plant.year)}</b> → ready <b style={{ color: C.green }}>{yyww(chain.readyWk, chain.readyYear)}</b></>
                  : chain?.past
                  ? <span style={{ color: "#c0492b", fontWeight: 800 }}>⚠ {yyww(chain.readyWk, chain.readyYear)} is in the PAST (we're in wk{chain.curWk} of {chain.curYr}) — check the year</span>
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
