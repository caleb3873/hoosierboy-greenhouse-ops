// FamilyPage — the crop-family item page (Phase 2 slice 1 of the 2026-07-27 spec).
// One page for a whole crop × size family (e.g. 4.5" Lantana): planting groups,
// variety roster with sold-vs-planned, and the RECIPE editor (lock/save) writing the
// live spine (crop_recipes + crop_recipe_series). The page is a VIEW over the spine —
// recipe + plan rows + sales — never a second place to enter a fact.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df", red: "#c0492b",
  redBg: "#fae9e5", border: "#e4ecdd", chip: "#eaf2e0", green: "#2e7d32" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const wkFmt = (yr, wk) => (yr == null || wk == null) ? "—" : `${String(yr).slice(2)}${String(wk).padStart(2, "0")}`;

export default function FamilyPage({ plan, recipeId, onClose }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [series, setSeries] = useState([]);
  const [rows, setRows] = useState(null);
  const [vmap, setVmap] = useState({});
  const [trays, setTrays] = useState({});      // container id -> {name, cells_per_flat}
  const [sales, setSales] = useState([]);      // matched '26 sales rows
  const [locked, setLocked] = useState(true);
  const [snap, setSnap] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: rec } = await sb.from("crop_recipes").select("*").eq("id", recipeId).single();
      setRecipe(rec || null);
      if (!rec) { setRows([]); return; }
      const { data: ser } = await sb.from("crop_recipe_series").select("*").eq("recipe_id", recipeId).order("series_name");
      setSeries(ser || []);
      const { data: sc } = await sb.from("scheduled_crops")
        .select("id,item_name,variety_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,ship_week,ready_week,broker,supplier,liner_unit_cost,prop_method,bench_id,is_combo_component")
        .eq("plan_id", plan.id).eq("recipe_id", recipeId).not("is_combo_component", "is", true).limit(2000);
      setRows(sc || []);
      const vids = [...new Set((sc || []).map(r => r.variety_id).filter(Boolean))];
      if (vids.length) {
        const { data: vs } = await sb.from("variety_library").select("id,variety,variety_key").in("id", vids);
        setVmap(Object.fromEntries((vs || []).map(v => [v.id, v])));
      }
      const trayIds = [...new Set((ser || []).map(s => s.prop_tray_id).filter(Boolean))];
      if (trayIds.length) {
        const { data: ts } = await sb.from("containers").select("id,name,cells_per_flat").in("id", trayIds);
        setTrays(Object.fromEntries((ts || []).map(t => [t.id, t])));
      }
      // sales heuristic v1: match by crop token + size family (family page shows it as "matched '26 sales")
      const sizeLike = /HB/i.test(rec.size_label) ? "%HB%" : /Fiber/i.test(rec.size_label) ? "%FIBER%"
        : /Bowl/i.test(rec.size_label) ? "%BOWL%" : /Pan/i.test(rec.size_label) ? "%PAN%"
        : `%${(rec.size_label.match(/^[\d.]+/) || [""])[0]}%`;
      const { data: st } = await sb.from("sales_totals").select("sku,description,size,units,avg_price")
        .ilike("description", `%${rec.crop_name}%`).ilike("size", sizeLike);
      setSales(st || []);
    })();
  }, [sb, plan.id, recipeId, tick]); // eslint-disable-line

  // series lookup for a variety (same name-prefix derivation the seed used, vs stored series names)
  const seriesOf = useMemo(() => {
    const names = series.map(s => s.series_name).filter(n => n !== "(unassigned)")
      .sort((a, b) => b.length - a.length);
    return (varietyName) => {
      const vn = String(varietyName || "");
      const hit = names.find(n => vn.toLowerCase().startsWith(n.toLowerCase()));
      return series.find(s => s.series_name === hit) || series.find(s => s.series_name === "(unassigned)") || null;
    };
  }, [series]);

  // '26 sold per variety: longest-variety-name-wins matching over the sales rows
  const soldByVariety = useMemo(() => {
    const vars = Object.values(vmap).map(v => v.variety).sort((a, b) => b.length - a.length);
    const out = {};
    for (const s of sales) {
      const d = (s.description || "").toUpperCase();
      const hit = vars.find(v => d.includes(String(v).toUpperCase()));
      if (hit) out[hit] = (out[hit] || 0) + (+s.units || 0);
    }
    return out;
  }, [sales, vmap]);

  // planting groups: cluster parent rows by (plant_week | ship_week), finish order
  const groups = useMemo(() => {
    if (!rows) return [];
    const m = {};
    rows.forEach(r => {
      const k = `${r.plant_week ?? "?"}|${r.ship_week ?? "?"}`;
      (m[k] = m[k] || { key: k, plant: r.plant_week, ship: r.ship_week, plantYear: r.plant_year,
        ready: r.ready_week, rows: [] }).rows.push(r);
      if (r.ready_week != null) m[k].ready = Math.min(m[k].ready ?? 99, r.ready_week);
    });
    const gs = Object.values(m).sort((a, b) => (a.ready ?? 99) - (b.ready ?? 99) || (a.plant ?? 99) - (b.plant ?? 99));
    gs.forEach((g, i) => {
      g.n = i + 1;
      // variety aggregation within the group
      const byVar = {};
      g.rows.forEach(r => {
        const v = vmap[r.variety_id];
        const key = v?.variety || r.item_name;
        (byVar[key] = byVar[key] || { variety: key, vkey: v?.variety_key, rows: [], pots: 0, liner: null, broker: null }).rows.push(r);
        byVar[key].pots += +r.qty_pots || 0;
        if (r.liner_unit_cost != null && r.liner_unit_cost !== 1) byVar[key].liner = +r.liner_unit_cost;
        if (r.broker) byVar[key].broker = r.broker;
      });
      g.vars = Object.values(byVar).sort((a, b) => {
        const sa = seriesOf(a.variety)?.series_name || "~", sbn = seriesOf(b.variety)?.series_name || "~";
        return sa.localeCompare(sbn) || a.variety.localeCompare(b.variety);
      });
    });
    // FIFO sold allocation: variety total → oldest group first
    const remaining = { ...soldByVariety };
    gs.forEach(g => g.vars.forEach(vr => {
      const rem = remaining[vr.variety] || 0;
      vr.sold = Math.min(rem, vr.pots || rem);
      remaining[vr.variety] = rem - vr.sold;
    }));
    // leftover (sold beyond all grew) piles on the last group holding that variety
    gs.slice().reverse().forEach(g => g.vars.forEach(vr => {
      if ((remaining[vr.variety] || 0) > 0) { vr.sold += remaining[vr.variety]; remaining[vr.variety] = 0; }
    }));
    return gs;
  }, [rows, vmap, soldByVariety, seriesOf]);

  const [openG, setOpenG] = useState({});
  const totals = useMemo(() => {
    let pots = 0, plants = 0, liner = 0, traysN = 0;
    const ov = +(recipe?.overage_pct || 0), ppp = +(recipe?.ppp || 1);
    groups.forEach(g => g.vars.forEach(vr => {
      pots += vr.pots;
      const s = seriesOf(vr.variety);
      const need = Math.ceil(vr.pots * ppp * (100 + ov) / 100);
      plants += need;
      liner += need * (vr.liner ?? 0);
      const cells = s?.prop_tray_id ? (+trays[s.prop_tray_id]?.cells_per_flat || 105) : 105;
      if (/^(URC|CALL|SEED)/i.test(s?.form || "")) traysN += need / cells;
    }));
    return { pots, plants, liner, traysN };
  }, [groups, recipe, seriesOf, trays]);

  // ── recipe lock/save ──
  function unlock() { setSnap(JSON.stringify({ r: recipe, s: series })); setLocked(false); setSavedMsg(""); }
  function cancel() {
    const a = JSON.parse(snap); setRecipe(a.r); setSeries(a.s); setLocked(true); setSavedMsg("reverted — nothing changed");
  }
  async function save() {
    const a = JSON.parse(snap); const ch = [];
    ["crop_weeks", "ppp", "pots_per_unit", "overage_pct", "hold_tolerance_wks"].forEach(k => {
      if (String(a.r[k] ?? "") !== String(recipe[k] ?? "")) ch.push(`${k.replace(/_/g, " ")} ${a.r[k] ?? "—"} → ${recipe[k] ?? "—"}`);
    });
    series.forEach(s => {
      const o = a.s.find(x => x.id === s.id) || {};
      if (o.form !== s.form) ch.push(`${s.series_name} form ${o.form || "—"} → ${s.form}`);
      if (String(o.rooting_weeks ?? "") !== String(s.rooting_weeks ?? "")) ch.push(`${s.series_name} root ${o.rooting_weeks ?? "—"} → ${s.rooting_weeks ?? "—"}w`);
    });
    if (!ch.length) { setLocked(true); setSavedMsg("no changes"); return; }
    if (!window.confirm(`Save the ${recipe.crop_name} ${recipe.size_label} recipe?\n\n• ${ch.join("\n• ")}\n\nCascades to every color, group and task using this recipe.`)) return;
    setBusy(true);
    const { id, created_at, ...rec } = recipe;
    await sb.from("crop_recipes").update({ ...rec, updated_by: displayName || "planner", updated_at: new Date().toISOString() }).eq("id", recipeId);
    for (const s of series) {
      const o = a.s.find(x => x.id === s.id) || {};
      if (o.form !== s.form || String(o.rooting_weeks ?? "") !== String(s.rooting_weeks ?? "")) {
        await sb.from("crop_recipe_series").update({ form: s.form, rooting_weeks: s.rooting_weeks, updated_at: new Date().toISOString() }).eq("id", s.id);
      }
    }
    setBusy(false); setLocked(true); setSavedMsg(`✅ saved — ${ch.length} change${ch.length > 1 ? "s" : ""} (crop_recipes)`);
  }

  // plan-qty edit: distribute a variety's new total across its bench rows (largest remainder)
  async function setVarQty(vr, newTotal) {
    const tot = Math.max(0, Math.round(newTotal));
    const cur = vr.pots || 0;
    if (tot === cur) return;
    const exact = vr.rows.map(r => cur > 0 ? tot * (+r.qty_pots || 0) / cur : tot / vr.rows.length);
    const flo = exact.map(Math.floor);
    let rem = tot - flo.reduce((a, b) => a + b, 0);
    exact.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr).slice(0, Math.max(0, rem)).forEach(x => flo[x.i]++);
    setBusy(true);
    for (let i = 0; i < vr.rows.length; i++) {
      if (flo[i] !== +vr.rows[i].qty_pots) await sb.from("scheduled_crops").update({ qty_pots: flo[i] }).eq("id", vr.rows[i].id);
    }
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: vr.rows[0]?.item_name || vr.variety,
        variety_key: vr.vkey || null, change_type: "family_qty", detail: { variety: vr.variety, from: cur, to: tot },
        changed_by: displayName || null, source: "family-page" });
    } catch { /* audit must not block */ }
    setBusy(false); setTick(t => t + 1);
  }

  const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12 };
  const th = { textAlign: "left", padding: "6px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "7px 9px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" };
  const wkStyle = { fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 };

  if (!recipe && rows !== null) return (
    <Overlay onClose={onClose}><div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>No recipe found for this item — run the recipe seed, or this item's rows aren't linked yet.</div></Overlay>
  );
  if (!rows) return <Overlay onClose={onClose}><div style={{ padding: 30, color: C.muted, fontFamily: FONT }}>Loading the family…</div></Overlay>;

  return (
    <Overlay onClose={onClose}>
      <div style={{ fontFamily: FONT }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>
            {recipe.size_label} {recipe.crop_name} — the whole family
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>{groups.length} planting group{groups.length === 1 ? "" : "s"} · {Object.keys(vmap).length} varieties · {plan.name}</div>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.muted }}>✕</button>
        </div>

        {/* hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, margin: "10px 0 12px" }}>
          {[[totals.pots.toLocaleString(), "planned (pots/flats)"],
            [totals.plants.toLocaleString(), `plants to order${recipe.overage_pct ? ` (+${recipe.overage_pct}% ov)` : ""}`],
            [totals.traysN.toFixed(1), "prop trays to stick"],
            [`$${Math.round(totals.liner).toLocaleString()}`, "liner spend (priced rows)"]]
            .map(([v, k], i) => (
              <div key={i} style={{ background: C.cream, border: `1px solid ${C.creamBr}`, borderRadius: 10, padding: "9px 12px" }}>
                <div style={{ ...wkStyle, fontSize: 17, color: C.dark }}>{v}</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>{k}</div>
              </div>
            ))}
        </div>

        {/* recipe card — lock/save */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", flexWrap: "wrap",
            background: locked ? C.chip : C.amberBg, borderBottom: `1px solid ${C.border}`, borderRadius: "12px 12px 0 0" }}>
            <b style={{ fontSize: 12.5, color: locked ? C.text : C.amber }}>
              {locked ? "🔒 Family recipe — source of truth; edits cascade everywhere" : "✏️ EDITING THE RECIPE — nothing commits until you save"}
            </b>
            {savedMsg && <span style={{ fontSize: 11.5, color: C.green }}>{savedMsg}</span>}
            <span style={{ flex: 1 }} />
            {locked
              ? <button onClick={unlock} style={{ background: C.dark, color: C.cream, border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Unlock to edit</button>
              : <>
                <button disabled={busy} onClick={save} style={{ background: C.light, color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>💾 Save recipe</button>
                <button onClick={cancel} style={{ background: "none", color: C.muted, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              </>}
          </div>
          <div style={{ padding: "10px 14px", opacity: locked ? .65 : 1, pointerEvents: locked ? "none" : "auto" }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, marginBottom: 8 }}>
              {[["crop_weeks", "crop wks"], ["ppp", "ppp"], ["pots_per_unit", "pots/unit"], ["overage_pct", "overage %"], ["hold_tolerance_wks", "hold tol. wks"]].map(([k, l]) => (
                <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px", color: C.muted }}>
                  {l}<input type="number" value={recipe[k] ?? ""} onChange={e => setRecipe({ ...recipe, [k]: e.target.value === "" ? null : +e.target.value })}
                    style={{ width: 52, padding: "4px 6px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700 }} />
                </label>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>{["Series", "Broker 📌", "Form", "Root (wks)", "Tray"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {series.map(s => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 700 }}>{s.series_name}</td>
                      <td style={td}>{s.pinned_broker || "—"}{s.pinned_supplier ? ` · ${s.pinned_supplier}` : ""}</td>
                      <td style={td}>
                        <select value={s.form || ""} onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, form: e.target.value || null } : x))}
                          style={{ padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontWeight: 700, fontFamily: "ui-monospace,Menlo,monospace" }}>
                          {["", "URC", "CALL", "PLUG", "SEED", "BULB", "LINER", "DIRECT STICK"].map(f => <option key={f} value={f}>{f || "—"}</option>)}
                        </select>
                      </td>
                      <td style={td}>
                        <input type="number" value={s.rooting_weeks ?? ""} onChange={e => setSeries(series.map(x => x.id === s.id ? { ...x, rooting_weeks: e.target.value === "" ? null : +e.target.value } : x))}
                          style={{ width: 48, padding: "3px 5px", borderRadius: 6, border: `1.5px solid ${C.creamBr}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, fontWeight: 700 }} />
                      </td>
                      <td style={td}>{s.prop_tray_id ? (trays[s.prop_tray_id]?.name || "…") : "—"}</td>
                    </tr>
                  ))}
                  {!series.length && <tr><td style={td} colSpan={5}>No series yet — the seed derives them from variety names; add via re-seed or SQL.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* planting groups */}
        {groups.map(g => {
          const open = openG[g.key] ?? true;
          const gPots = g.vars.reduce((a, v) => a + v.pots, 0);
          return (
            <div key={g.key} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer",
                background: C.cream, borderBottom: open ? `1px solid ${C.border}` : "none", borderRadius: open ? "12px 12px 0 0" : 12 }}
                onClick={() => setOpenG({ ...openG, [g.key]: !open })}>
                <span style={{ color: C.muted, fontSize: 11, transform: open ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▶</span>
                <b style={{ fontSize: 12 }}>Group {g.n}</b>
                <span style={{ fontSize: 11, color: C.muted }}>
                  ship <b style={wkStyle}>{wkFmt(g.plantYear, g.ship)}</b> → plant <b style={wkStyle}>{wkFmt(g.plantYear, g.plant)}</b> → ready <b style={{ ...wkStyle, color: C.green }}>{wkFmt(g.plantYear, g.ready)}</b>
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: C.muted }}>{g.vars.length} varieties · {gPots.toLocaleString()} pots</span>
              </div>
              {open && (
                <div style={{ padding: "4px 10px 10px", overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr>{["Variety", "Series", "Form", "'26 sold", "Sell-thru", "Planned (pots)", "$/liner", "Broker"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {g.vars.map(vr => {
                        const s = seriesOf(vr.variety);
                        const pct = vr.pots > 0 && vr.sold != null ? Math.round(vr.sold * 100 / vr.pots) : null;
                        return (
                          <tr key={vr.variety}>
                            <td style={{ ...td, fontWeight: 700 }}>{vr.variety}</td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{s?.series_name || "—"}</td>
                            <td style={td}><span style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: /CALL/.test(s?.form || "") ? C.amberBg : C.chip, color: /CALL/.test(s?.form || "") ? C.amber : C.green }}>{s?.form || "—"}</span></td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{vr.sold ? vr.sold.toLocaleString() : "—"}</td>
                            <td style={{ ...td, minWidth: 90 }}>
                              {pct == null ? <span style={{ color: C.muted, fontSize: 10 }}>—</span> : (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ width: 52, height: 8, background: C.chip, borderRadius: 4, overflow: "hidden", display: "inline-block" }}>
                                    <span style={{ display: "block", height: "100%", width: `${Math.min(100, pct)}%`, background: pct >= 95 ? C.light : pct >= 60 ? "#a8c95d" : C.amber }} />
                                  </span>
                                  <b style={{ fontSize: 11, color: pct < 60 ? C.amber : C.dark, fontVariantNumeric: "tabular-nums" }}>{pct}%</b>
                                </span>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: "right" }}>
                              <QtyInput value={vr.pots} disabled={busy} onCommit={v => setVarQty(vr, v)} />
                            </td>
                            <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{vr.liner != null ? `$${vr.liner.toFixed(3)}` : <span style={{ color: C.amber, fontSize: 10 }}>no quote</span>}</td>
                            <td style={{ ...td, color: C.muted, fontSize: 11 }}>{vr.broker || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {!groups.length && <div style={{ ...card, padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>No plan rows linked to this recipe in {plan.name}.</div>}

        <div style={{ fontSize: 10.5, color: C.muted, textAlign: "center", marginTop: 4 }}>
          Sold figures are a v1 heuristic match on '26 sales by name + size, allocated FIFO across groups. Qty edits redistribute across bench rows (largest remainder) and log to the item history.
        </div>
      </div>
    </Overlay>
  );
}

// commit-on-blur qty input (never resets mid-typing)
function QtyInput({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(String(value)); }, [value, focus]);
  return (
    <input value={draft} disabled={disabled} inputMode="numeric"
      onFocus={() => setFocus(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocus(false); const v = parseInt(draft, 10); if (!Number.isNaN(v) && v !== value) onCommit(v); else setDraft(String(value)); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: 68, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: "1.5px solid #cfe3bd",
        fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, fontWeight: 700 }} />
  );
}

function Overlay({ children, onClose }) {
  return (
    <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.55)", zIndex: 9300,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "4vh 14px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fbfdf8", borderRadius: 16, maxWidth: 1040, width: "100%",
        padding: 18, boxShadow: "0 22px 60px rgba(0,0,0,.4)", maxHeight: "92vh", overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}
