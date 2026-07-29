// FamilyAdmin — the corrections bench for crop families (Caleb 7/29: "an area I can
// combine the families … place items in appropriate families that were autosorted
// wrong"). Same spirit as the categories corrections area: a flat list, a search box,
// and two verbs:
//   MERGE family A into B — items (ALL plans), series and overrides move; A's recipe
//     is deleted; name collisions keep B's row (B's facts win, deliberately).
//   MOVE one item to another family — this plan's rows only, recipe_id repointed.
// Everything audit-logged (family_merge / family_move).
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df",
  border: "#e4ecdd", chip: "#eaf2e0", red: "#c0492b" };
const FONT = "'DM Sans','Segoe UI',sans-serif";

export default function FamilyAdmin({ plan, onClose, onChanged }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [recipes, setRecipes] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: recs } = await sb.from("crop_recipes").select("id,crop_name,size_label,plant_class").order("crop_name");
      let all = [], from = 0;
      for (;;) {   // page past the 1,000-row cap — the lesson of 7/28
        const { data } = await sb.from("scheduled_crops").select("id,item_name,recipe_id")
          .eq("plan_id", plan.id).order("id").range(from, from + 999);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      setRecipes(recs || []); setRows(all);
    })();
  }, [sb, plan.id, tick]);

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
      .filter(f => !term || f.label.toLowerCase().includes(term))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [recipes, rows, q]);

  const orphanItems = useMemo(() => {
    const m = {};
    rows.forEach(r => { if (!r.recipe_id) m[r.item_name] = (m[r.item_name] || 0) + 1; });
    return m;
  }, [rows]);

  async function mergeFamily(a, b) {
    if (!b || a.id === b.id) return;
    if (!window.confirm(`Merge "${a.label}" INTO "${b.label}"?\n\nEvery item (all plans), series and override of ${a.label} moves over; the ${a.label} recipe is deleted. Where a series/override name collides, ${b.label}'s version wins.`)) return;
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
          change_type: "family_merge", detail: { from: a.label, into: b.label, rows_moved: a.n },
          changed_by: displayName || null, source: "family-admin" });
      } catch { /* audit must not block */ }
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
    } catch (e) { window.alert("Move stopped: " + (e.message || e)); }
    setBusy(false); setTick(t => t + 1); onChanged?.();
  }

  const famPicker = (onPick, excludeId, placeholder) => (
    <select defaultValue="" disabled={busy}
      onChange={e => { if (e.target.value) { onPick(e.target.value); e.target.value = ""; } }}
      style={{ padding: "4px 7px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: FONT, maxWidth: 210, cursor: "pointer" }}>
      <option value="">{placeholder}</option>
      {(recipes || []).filter(r => r.id !== excludeId).map(r => (
        <option key={r.id} value={r.id}>{r.size_label} {r.crop_name}</option>
      ))}
    </select>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9200,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 760, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", fontFamily: FONT, marginBottom: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>⚙ Manage families</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>merge wrongly-split families · re-home mis-sorted items ({plan.name})</div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 20, color: C.muted, cursor: "pointer" }}>✕</button>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 filter families…"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.creamBr}`, fontSize: 13, fontFamily: FONT, marginBottom: 10 }} />

        {recipes == null ? <div style={{ color: C.muted, fontSize: 13 }}>loading…</div> : (
          <>
            {Object.keys(orphanItems).length > 0 && (
              <div style={{ background: C.amberBg, border: "1.5px solid #ecd9b8", borderRadius: 10, padding: "9px 12px", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", marginBottom: 5 }}>
                  No family yet — {Object.keys(orphanItems).length} item{Object.keys(orphanItems).length > 1 ? "s" : ""}
                </div>
                {Object.entries(orphanItems).sort().map(([it, n]) => (
                  <div key={it} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 12.5 }}>
                    <span style={{ flex: 1, fontWeight: 700 }}>{it} <span style={{ color: C.muted, fontWeight: 500 }}>· {n} row{n > 1 ? "s" : ""}</span></span>
                    {famPicker(toId => moveItem(it, toId), null, "→ place in family…")}
                  </div>
                ))}
              </div>
            )}
            {fams.map(f => (
              <div key={f.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 6, background: "#fff", overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px" }}>
                  <button onClick={() => setOpen(o => ({ ...o, [f.id]: !o[f.id] }))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, transform: open[f.id] ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</button>
                  <b style={{ fontSize: 13, color: C.dark }}>{f.label}</b>
                  {f.plant_class === "perennial" && <span style={{ fontSize: 10, color: "#2e7d32", fontWeight: 800 }}>🌲</span>}
                  <span style={{ fontSize: 11, color: C.muted }}>{f.n} row{f.n === 1 ? "" : "s"} in plan · {Object.keys(f.items).length} item{Object.keys(f.items).length === 1 ? "" : "s"}</span>
                  <span style={{ marginLeft: "auto" }} />
                  {famPicker(toId => mergeFamily(f, fams.find(x => x.id === toId) || (recipes || []).map(r => ({ ...r, label: `${r.size_label} ${r.crop_name}`, n: 0 })).find(x => x.id === toId)), f.id, "⇒ merge into…")}
                </div>
                {open[f.id] && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 12px 9px", background: "#fbfdf8" }}>
                    {Object.keys(f.items).length === 0 && <div style={{ fontSize: 11.5, color: C.muted }}>no items in this plan (recipe may serve other seasons)</div>}
                    {Object.entries(f.items).sort().map(([it, n]) => (
                      <div key={it} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0", fontSize: 12.5 }}>
                        <span style={{ flex: 1 }}>{it} <span style={{ color: C.muted }}>· {n} row{n > 1 ? "s" : ""}</span></span>
                        {famPicker(toId => moveItem(it, toId), f.id, "→ move to…")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>
          Merges are global (every plan follows the recipe); item moves touch {plan.name} only. Both land in item history.
        </div>
      </div>
    </div>
  );
}
