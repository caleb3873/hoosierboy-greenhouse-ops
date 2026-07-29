// FamilyAdmin v2 — the corrections bench for crop families.
// Caleb 7/29, in order of arrival:
//   · "combine the families … place items that were autosorted wrong"  → MERGE + MOVE
//   · "sorted by size then cultivar then series then color. every time" → plantOrder everywhere
//   · "search doesn't seem to work"                                     → search hits family
//     labels AND item names, auto-expands matches
//   · "filtering options … the dropdown reflects the filter"            → size + 🌲 chips
//     constrain the list AND every merge/move dropdown
//   · "auto generate new families based on the series"                  → ⚡ scans orphan
//     items, creates crop×size families with series rows derived from variety names
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { plantOrder, sizeSortVal } from "./shared";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df",
  border: "#e4ecdd", chip: "#eaf2e0", red: "#c0492b" };
const FONT = "'DM Sans','Segoe UI',sans-serif";

// item-name size prefix → recipe size_label (the door's convention, reversed)
function sizeLabelFromItem(name) {
  const s = String(name || "").trim();
  let m = s.match(/^([\d.]+)"\s/);            if (m) return `${m[1]}" Pot`;
  m = s.match(/^POT\s+([\d.]+)"/i);           if (m) return `${m[1]}" Pot`;
  m = s.match(/^HB\s+([\d.]+)"/i);            if (m) return `${m[1]}" HB`;
  m = s.match(/^([\d.]+)"\s*HB/i);            if (m) return `${m[1]}" HB`;
  return null;
}

export default function FamilyAdmin({ plan, onClose, onChanged }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [recipes, setRecipes] = useState(null);
  const [rows, setRows] = useState([]);
  const [vmap, setVmap] = useState({});
  const [q, setQ] = useState("");
  const [sizeFilt, setSizeFilt] = useState("");
  const [perFilt, setPerFilt] = useState(false);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [newFam, setNewFam] = useState(null);   // {crop, size, weeks}
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: recs } = await sb.from("crop_recipes").select("id,crop_name,size_label,plant_class").order("crop_name");
      let all = [], from = 0;
      for (;;) {   // page past the 1,000-row cap
        const { data } = await sb.from("scheduled_crops")
          .select("id,item_name,recipe_id,variety_id,prop_method,is_combo_component")
          .eq("plan_id", plan.id).order("id").range(from, from + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      const vids = [...new Set(all.map(r => r.variety_id).filter(Boolean))];
      const vm = {};
      for (let i = 0; i < vids.length; i += 200) {
        const { data: vs } = await sb.from("variety_library").select("id,crop_name,variety").in("id", vids.slice(i, i + 200));
        (vs || []).forEach(v => { vm[v.id] = v; });
      }
      setRecipes(recs || []); setRows(all); setVmap(vm);
    })();
  }, [sb, plan.id, tick]);

  // family list: counts + items, searched (labels AND item names), filtered, THE order
  const fams = useMemo(() => {
    const counts = {}, items = {};
    rows.forEach(r => {
      const k = r.recipe_id || "__none";
      counts[k] = (counts[k] || 0) + 1;
      (items[k] = items[k] || {});
      items[k][r.item_name] = (items[k][r.item_name] || 0) + 1;
    });
    const term = q.trim().toLowerCase();
    return (recipes || [])
      .map(rec => ({ ...rec, label: `${rec.size_label} ${rec.crop_name}`, n: counts[rec.id] || 0, items: items[rec.id] || {} }))
      .filter(f => !sizeFilt || f.size_label === sizeFilt)
      .filter(f => !perFilt || f.plant_class === "perennial")
      .map(f => ({ ...f, hitItems: term ? Object.keys(f.items).filter(it => it.toLowerCase().includes(term)) : [] }))
      .filter(f => !term || f.label.toLowerCase().includes(term) || f.hitItems.length > 0)
      .sort((a, b) => plantOrder(a.label, b.label));
  }, [recipes, rows, q, sizeFilt, perFilt]);

  const sizeChips = useMemo(() =>
    [...new Set((recipes || []).map(r => r.size_label))].sort((a, b) => sizeSortVal(a) - sizeSortVal(b) || a.localeCompare(b)),
  [recipes]);

  const orphanRows = useMemo(() => rows.filter(r => !r.recipe_id && !r.is_combo_component), [rows]);
  const orphanItems = useMemo(() => {
    const m = {};
    orphanRows.forEach(r => { m[r.item_name] = (m[r.item_name] || 0) + 1; });
    return m;
  }, [orphanRows]);

  // dropdowns REFLECT the active filters (Caleb) — clearing the chips widens them again
  const pickerPool = useMemo(() =>
    (recipes || [])
      .filter(r => !sizeFilt || r.size_label === sizeFilt)
      .filter(r => !perFilt || r.plant_class === "perennial")
      .map(r => ({ ...r, label: `${r.size_label} ${r.crop_name}` }))
      .sort((a, b) => plantOrder(a.label, b.label)),
  [recipes, sizeFilt, perFilt]);

  async function mergeFamily(a, toId) {
    const b = (recipes || []).find(r => r.id === toId);
    if (!b || a.id === b.id) return;
    const bl = `${b.size_label} ${b.crop_name}`;
    if (!window.confirm(`Merge "${a.label}" INTO "${bl}"?\n\nEvery item (all plans), series and override of ${a.label} moves over; the ${a.label} recipe is deleted. Where a series/override collides, ${bl}'s version wins.`)) return;
    setBusy(true);
    try {
      await sb.from("scheduled_crops").update({ recipe_id: b.id }).eq("recipe_id", a.id);
      const { data: aSer } = await sb.from("crop_recipe_series").select("id,series_name").eq("recipe_id", a.id);
      const { data: bSer } = await sb.from("crop_recipe_series").select("series_name").eq("recipe_id", b.id);
      const bNames = new Set((bSer || []).map(s => s.series_name));
      for (const s of aSer || []) {
        if (bNames.has(s.series_name)) await sb.from("crop_recipe_series").delete().eq("id", s.id);
        else await sb.from("crop_recipe_series").update({ recipe_id: b.id }).eq("id", s.id);
      }
      const { data: aOv } = await sb.from("crop_recipe_overrides").select("id,variety_key").eq("recipe_id", a.id);
      const { data: bOv } = await sb.from("crop_recipe_overrides").select("variety_key").eq("recipe_id", b.id);
      const bKeys = new Set((bOv || []).map(o => o.variety_key));
      for (const o of aOv || []) {
        if (bKeys.has(o.variety_key)) await sb.from("crop_recipe_overrides").delete().eq("id", o.id);
        else await sb.from("crop_recipe_overrides").update({ recipe_id: b.id }).eq("id", o.id);
      }
      await sb.from("crop_recipes").delete().eq("id", a.id);
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: "[family merge]",
          change_type: "family_merge", detail: { from: a.label, into: bl, rows_moved: a.n },
          changed_by: displayName || null, source: "family-admin" });
      } catch { /* audit must not block */ }
      setMsg(`✅ merged ${a.label} → ${bl}`);
    } catch (e) { window.alert("Merge stopped: " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1); onChanged?.();
  }

  async function moveItem(item, toId) {
    setBusy(true);
    try {
      await sb.from("scheduled_crops").update({ recipe_id: toId }).eq("plan_id", plan.id).eq("item_name", item);
      const dest = (recipes || []).find(r => r.id === toId);
      try {
        await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: item,
          change_type: "family_move", detail: { to: dest ? `${dest.size_label} ${dest.crop_name}` : null },
          changed_by: displayName || null, source: "family-admin" });
      } catch { /* audit must not block */ }
      setMsg(`✅ ${item} → ${dest ? `${dest.size_label} ${dest.crop_name}` : "family"}`);
    } catch (e) { window.alert("Move stopped: " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1); onChanged?.();
  }

  async function createFamily({ crop, size, weeks }, attachItems = []) {
    const { data: ins, error } = await sb.from("crop_recipes")
      .upsert({ crop_name: crop.trim(), size_label: size.trim(),
        crop_weeks: weeks ? +weeks : null, pots_per_unit: 1, ppp: 1,
        updated_by: displayName || "planner",
        seeded_from: { source: "family-admin", note: "created in Manage families" } },
        { onConflict: "crop_name,size_label" }).select("*").single();
    if (error) throw new Error(error.message);
    await sb.from("crop_recipe_series").upsert(
      { recipe_id: ins.id, series_name: "(unassigned)" }, { onConflict: "recipe_id,series_name" });
    for (const it of attachItems) {
      await sb.from("scheduled_crops").update({ recipe_id: ins.id }).eq("plan_id", plan.id).eq("item_name", it);
    }
    return ins;
  }

  // ⚡ Auto-create: group ORPHAN items by (crop from the variety spine, size from the
  // item-name prefix) → one family each; series rows derived from variety-name prefixes
  // (a two-word series needs two varieties sharing it — the seeder's lumping rule, lite).
  async function autoCreate() {
    const groups = {};   // "crop|size" -> { crop, size, items:Set, varieties:Set, forms:{} }
    const skipped = [];
    for (const r of orphanRows) {
      const v = vmap[r.variety_id];
      const size = sizeLabelFromItem(r.item_name);
      if (!v?.crop_name || !size) { skipped.push(r.item_name); continue; }
      const k = `${v.crop_name}|${size}`;
      const g = groups[k] || (groups[k] = { crop: v.crop_name, size, items: new Set(), varieties: new Set(), forms: {} });
      g.items.add(r.item_name);
      if (v.variety) g.varieties.add(v.variety);
      if (r.prop_method) g.forms[r.prop_method] = (g.forms[r.prop_method] || 0) + 1;
    }
    const list = Object.values(groups);
    if (!list.length) { window.alert("No orphan items with a readable crop + size — nothing to create."); return; }
    const summary = list.map(g => `  ${g.size} ${g.crop} — ${g.items.size} item(s), ${g.varieties.size} variet(ies)`).join("\n");
    if (!window.confirm(`Auto-create ${list.length} famil${list.length > 1 ? "ies" : "y"} from orphan items?\n\n${summary}\n${skipped.length ? `\n(${[...new Set(skipped)].length} item(s) skipped — no readable size)` : ""}\n\nSeries derive from variety names; finish weeks stay blank for you to set on each family page.`)) return;
    setBusy(true);
    try {
      for (const g of list) {
        const rec = await createFamily({ crop: g.crop, size: g.size, weeks: null }, [...g.items]);
        // series from variety-name prefixes: two-word prefix needs ≥2 sharing varieties
        const vars = [...g.varieties];
        const two = {}, one = {};
        vars.forEach(v => {
          const t = v.split(/\s+/);
          if (t.length >= 2) two[`${t[0]} ${t[1]}`] = (two[`${t[0]} ${t[1]}`] || 0) + 1;
          one[t[0]] = (one[t[0]] || 0) + 1;
        });
        const names = new Set();
        vars.forEach(v => {
          const t = v.split(/\s+/);
          const p2 = t.length >= 2 ? `${t[0]} ${t[1]}` : null;
          if (p2 && two[p2] >= 2 && t.length >= 3) names.add(p2);
          else if (one[t[0]] >= 2 && t.length >= 2) names.add(t[0]);
        });
        const form = Object.entries(g.forms).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        for (const nm of names) {
          await sb.from("crop_recipe_series").upsert(
            { recipe_id: rec.id, series_name: nm, form }, { onConflict: "recipe_id,series_name" });
        }
        if (form) await sb.from("crop_recipe_series").update({ form }).eq("recipe_id", rec.id).eq("series_name", "(unassigned)");
        try {
          await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `[${g.size} ${g.crop}]`,
            change_type: "family_autocreated", detail: { items: [...g.items], series: [...names], form },
            changed_by: displayName || null, source: "family-admin" });
        } catch { /* audit must not block */ }
      }
      setMsg(`✅ created ${list.length} famil${list.length > 1 ? "ies" : "y"} — set finish weeks on each family page`);
    } catch (e) { window.alert("Auto-create stopped: " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1); onChanged?.();
  }

  const famPicker = (onPick, excludeId, placeholder) => (
    <select defaultValue="" disabled={busy}
      onChange={e => { if (e.target.value) { onPick(e.target.value); e.target.value = ""; } }}
      style={{ padding: "4px 7px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, maxWidth: 210, cursor: "pointer" }}>
      <option value="">{placeholder}{sizeFilt || perFilt ? " (filtered)" : ""}</option>
      {pickerPool.filter(r => r.id !== excludeId).map(r => (
        <option key={r.id} value={r.id}>{r.label}</option>
      ))}
    </select>
  );

  const chipStyle = act => ({ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: "pointer",
    border: `1.5px solid ${act ? C.light : C.border}`, background: act ? C.light : "#fff", color: act ? "#fff" : C.text, fontFamily: FONT });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9200,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 780, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", fontFamily: FONT, marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>⚙ Manage families</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{plan.name}</div>
          {msg && <span style={{ fontSize: 11.5, color: "#2e7d32", fontWeight: 700 }}>{msg}</span>}
          <span style={{ flex: 1 }} />
          <button onClick={() => setNewFam(newFam ? null : { crop: "", size: sizeFilt || "", weeks: "" })}
            style={{ padding: "5px 11px", borderRadius: 8, border: `1.5px dashed ${C.light}`, background: "#fff", color: C.dark, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>＋ New family</button>
          {Object.keys(orphanItems).length > 0 && (
            <button disabled={busy} onClick={autoCreate}
              title="scan orphan items → one family per crop×size, series derived from variety names"
              style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: C.dark, color: "#c8e6b8", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: FONT }}>
              ⚡ Auto-create from {Object.keys(orphanItems).length} orphans
            </button>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>

        {newFam && (
          <div style={{ background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "9px 12px", marginBottom: 8, display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            {[["crop", "Crop", "e.g. Gaillardia", 160], ["size", "Size label", `e.g. 4.5" Pot`, 120], ["weeks", "Finish wks", "6", 70]].map(([k, l, ph, w]) => (
              <label key={k} style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", color: C.muted }}>{l}
                <input list={k === "size" ? "fa-sizes" : undefined} value={newFam[k]} onChange={e => setNewFam({ ...newFam, [k]: e.target.value })} placeholder={ph}
                  style={{ display: "block", width: w, padding: "6px 8px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 12.5, fontFamily: FONT, marginTop: 2 }} />
              </label>
            ))}
            <datalist id="fa-sizes">{sizeChips.map(s => <option key={s} value={s} />)}</datalist>
            <button disabled={busy || !newFam.crop.trim() || !newFam.size.trim()}
              onClick={async () => { setBusy(true); try { await createFamily(newFam); setMsg(`✅ ${newFam.size} ${newFam.crop} created`); setNewFam(null); } catch (e) { window.alert(e.message); } setBusy(false); setTick(t => t + 1); onChanged?.(); }}
              style={{ padding: "7px 13px", borderRadius: 8, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Create →</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 search families AND items…" autoFocus
            style={{ flex: 1, minWidth: 200, boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.creamBr}`, fontSize: 13, fontFamily: FONT }} />
          <button onClick={() => setPerFilt(p => !p)} style={chipStyle(perFilt)}>🌲 perennial</button>
          {sizeChips.map(s => (
            <button key={s} onClick={() => setSizeFilt(f => f === s ? "" : s)} style={chipStyle(sizeFilt === s)}>{s}</button>
          ))}
        </div>

        {recipes == null ? <div style={{ color: C.muted, fontSize: 13 }}>loading…</div> : (
          <>
            {Object.keys(orphanItems).length > 0 && (
              <div style={{ background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "9px 12px", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", marginBottom: 5 }}>
                  No family yet — {Object.keys(orphanItems).length} item{Object.keys(orphanItems).length > 1 ? "s" : ""} (⚡ auto-create above, or place by hand)
                </div>
                {Object.keys(orphanItems).sort(plantOrder).map(it => (
                  <div key={it} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ flex: 1, fontWeight: 700 }}>{it} <span style={{ color: C.muted, fontWeight: 500 }}>· {orphanItems[it]} row{orphanItems[it] > 1 ? "s" : ""}</span></span>
                    {famPicker(toId => moveItem(it, toId), null, "→ place in family…")}
                  </div>
                ))}
              </div>
            )}
            {fams.map(f => {
              const isOpen = open[f.id] ?? (f.hitItems.length > 0);   // search hits auto-expand
              return (
                <div key={f.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 6, background: "#fff", overflow: "hidden" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px" }}>
                    <button onClick={() => setOpen(o => ({ ...o, [f.id]: !isOpen }))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</button>
                    <b style={{ fontSize: 13, color: C.dark }}>{f.label}</b>
                    {f.plant_class === "perennial" && <span style={{ fontSize: 10, color: "#2e7d32", fontWeight: 800 }}>🌲</span>}
                    <span style={{ fontSize: 11, color: C.muted }}>{f.n} row{f.n === 1 ? "" : "s"} · {Object.keys(f.items).length} item{Object.keys(f.items).length === 1 ? "" : "s"}</span>
                    {f.hitItems.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: C.amber }}>{f.hitItems.length} match</span>}
                    <span style={{ marginLeft: "auto" }} />
                    {famPicker(toId => mergeFamily(f, toId), f.id, "⇒ merge into…")}
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 12px 9px", background: "#fbfdf8" }}>
                      {Object.keys(f.items).length === 0 && <div style={{ fontSize: 11.5, color: C.muted }}>no items in this plan (recipe may serve other seasons)</div>}
                      {Object.keys(f.items).sort(plantOrder).map(it => (
                        <div key={it} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 12.5,
                          background: f.hitItems.includes(it) ? "#fdf3dc" : "transparent", borderRadius: 6 }}>
                          <span style={{ flex: 1 }}>{it} <span style={{ color: C.muted }}>· {f.items[it]} row{f.items[it] > 1 ? "s" : ""}</span></span>
                          {famPicker(toId => moveItem(it, toId), f.id, "→ move to…")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
          Order everywhere: size → cultivar → series → color. Merges are global (every plan follows the recipe); item moves touch {plan.name} only. Both land in item history.
        </div>
      </div>
    </div>
  );
}
