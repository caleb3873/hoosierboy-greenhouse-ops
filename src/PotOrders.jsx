// PotOrders — the pot-buying worksheet. A live ledger off the projection: every
// family targeted for next year → its matched pot → pots needed, minus what's on
// hand, = what to order (in whole cases). The point is to STOP over-ordering hard
// goods (Caleb 7/29: it ties up cash). Match families to pots as you project;
// enter on-hand inventory; the order list nets it all out and shows the cash.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { plantOrder, sizeLabelForItem } from "./shared";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f2f7ec", creamBr: "#d8e6c8",
  border: "#e0e8d6", muted: "#7a8c74", text: "#2f3b2a", red: "#c0392b", amber: "#c9812a",
  amberBg: "#fbf1df", green: "#2e7d32", card: "#ffffff", chip: "#eaf2e0" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const money = n => n == null ? "—" : `$${(+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = n => n == null ? "—" : `$${Math.round(+n).toLocaleString()}`;

// native pot encoding — same convention as the family page (pot-entered vs flat-entered)
const potFactor = r => { const ppp = Math.max(1, +r.ppp || 1); const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1); return ppp >= ppu && ppu > 1 ? ppu : 1; };
const potsOf = r => (+r.qty_pots || 0) * potFactor(r);
const caseOf = c => Math.max(1, Math.round(+c?.units_per_case || +c?.case_size || 1));

export default function PotOrders({ plan }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [recipes, setRecipes] = useState(null);
  const [containers, setContainers] = useState([]);
  const [rows, setRows] = useState([]);
  const [targets, setTargets] = useState({});
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [expand, setExpand] = useState({});   // container_id → show family breakdown
  const [basis, setBasis] = useState("target");   // "target" (projection) | "planned" (current rows)

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const page = async (tbl, sel, filt) => { let out = [], f = 0; for (;;) { let q = sb.from(tbl).select(sel).range(f, f + 999); if (filt) q = filt(q); const { data } = await q; out = out.concat(data || []); if (!data || data.length < 1000) break; f += 1000; } return out; };
      const [recs, cons, sc, tg] = await Promise.all([
        sb.from("crop_recipes").select("id,crop_name,size_label,display_name,default_container_id"),
        sb.from("containers").select("id,name,sku,kind,diameter_in,units_per_case,case_size,cost_per_unit,stock_qty,primary_supplier,supplier").eq("kind", "finished").order("diameter_in"),
        page("scheduled_crops", "id,item_name,recipe_id,qty_pots,ppp,plants_per_unit,pack_size,is_combo_component,container_id", q => q.eq("plan_id", plan.id)),
        sb.from("plan_targets").select("item_name,target_units,decision,archived_at").eq("plan_id", plan.id),
      ]);
      setRecipes((recs.data || []).map(r => ({ ...r, label: r.display_name || `${r.size_label} ${r.crop_name}` })));
      setContainers(cons.data || []);
      setRows(sc || []);
      setTargets(Object.fromEntries((tg.data || []).map(t => [t.item_name, t])));
    })();
  }, [sb, plan.id, tick]);

  const conById = useMemo(() => Object.fromEntries(containers.map(c => [c.id, c])), [containers]);
  const recById = useMemo(() => Object.fromEntries((recipes || []).map(r => [r.id, r])), [recipes]);

  // pots needed per family, off the projection (target where decided, else the current plan)
  const ledger = useMemo(() => {
    if (!recipes) return null;
    // per item: planned pots + pack + its recipe
    const itemPots = {}, itemPack = {}, itemRecipe = {};
    rows.forEach(r => {
      if (r.is_combo_component) return;   // components are plants, not pots
      itemPots[r.item_name] = (itemPots[r.item_name] || 0) + potsOf(r);
      itemPack[r.item_name] = Math.max(itemPack[r.item_name] || 1, Math.round(+r.plants_per_unit || +r.pack_size || 1));
      if (r.recipe_id && !itemRecipe[r.item_name]) itemRecipe[r.item_name] = r.recipe_id;
    });
    // per family: sum item pots (target-driven or planned), remember basis + whether all decided
    const fam = {};
    Object.keys(itemPots).forEach(it => {
      const rid = itemRecipe[it];
      const t = targets[it];
      const archived = t?.archived_at != null;
      const planned = itemPots[it];
      const pack = itemPack[it];
      const decided = t && (t.target_units != null || t.decision);
      // target_units is POTS now (Caleb 7/29 — one unit, pots)
      const targetPots = archived || t?.decision === "drop" || t?.target_units === 0 ? 0
        : (t?.target_units != null ? Math.round(+t.target_units) : planned);
      const usePots = basis === "planned" ? planned : targetPots;
      const key = rid || `__nofam__${sizeLabelForItem(it)}`;
      const f = fam[key] = fam[key] || { recipeId: rid || null, label: rid ? (recById[rid]?.label || it) : `(no family) ${sizeLabelForItem(it)}`,
        containerId: rid ? recById[rid]?.default_container_id : null, pots: 0, planned: 0, items: 0, decidedItems: 0, size: rid ? recById[rid]?.size_label : sizeLabelForItem(it) };
      f.pots += usePots; f.planned += planned; f.items += 1; if (decided) f.decidedItems += 1;
    });
    // infer container from row-level container_id when the family has no default
    const famList = Object.values(fam).filter(f => f.pots > 0 || f.planned > 0);
    famList.forEach(f => {
      if (!f.containerId && f.recipeId) {
        const cc = {}; rows.filter(r => r.recipe_id === f.recipeId && r.container_id).forEach(r => { cc[r.container_id] = (cc[r.container_id] || 0) + 1; });
        const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0];
        if (top) f.containerId = top[0];
      }
    });
    // group by container
    const byCon = {};
    const unmatched = [];
    famList.forEach(f => {
      if (!f.containerId || !conById[f.containerId]) { if (f.pots > 0) unmatched.push(f); return; }
      const g = byCon[f.containerId] = byCon[f.containerId] || { container: conById[f.containerId], fams: [], needed: 0 };
      g.fams.push(f); g.needed += f.pots;
    });
    const groups = Object.values(byCon).map(g => {
      const c = g.container;
      const onHand = Math.max(0, +c.stock_qty || 0);
      const net = Math.max(0, g.needed - onHand);
      const cs = caseOf(c);
      const cases = Math.ceil(net / cs);
      const orderUnits = cases * cs;
      const unit = +c.cost_per_unit || 0;
      return { ...g, onHand, net, cs, cases, orderUnits, unit, cost: orderUnits * unit, grossCost: g.needed * unit };
    }).sort((a, b) => (a.container.diameter_in || 99) - (b.container.diameter_in || 99) || plantOrder(a.container.name, b.container.name));
    const tot = groups.reduce((a, g) => ({
      needed: a.needed + g.needed, onHand: a.onHand + g.onHand, order: a.order + g.orderUnits,
      cost: a.cost + g.cost, gross: a.gross + g.grossCost,
    }), { needed: 0, onHand: 0, order: 0, cost: 0, gross: 0 });
    const famCount = famList.length, decidedFams = famList.filter(f => f.decidedItems > 0).length;
    return { groups, unmatched, tot, famCount, decidedFams };
  }, [recipes, rows, targets, conById, recById, basis]);

  async function setStock(container, val) {
    const q = val === "" ? null : Math.max(0, Math.round(+val));
    setContainers(cs => cs.map(c => c.id === container.id ? { ...c, stock_qty: q } : c));
    await sb.from("containers").update({ stock_qty: q, updated_at: new Date().toISOString() }).eq("id", container.id);
  }
  async function matchFamily(f, containerId) {
    if (!f.recipeId || !containerId) return;
    setBusy(true);
    await sb.from("crop_recipes").update({ default_container_id: containerId }).eq("id", f.recipeId);
    try {
      await sb.from("item_change_log").insert({ plan_id: plan.id, item_name: `(family) ${f.label}`, change_type: "pot_matched",
        detail: { container: conById[containerId]?.name, sku: conById[containerId]?.sku }, changed_by: displayName || null, source: "pot-orders" });
    } catch { /* audit must not block */ }
    setBusy(false); setTick(t => t + 1);
  }

  if (!ledger) return <div style={{ padding: 20, color: C.muted }}>Loading the pot ledger…</div>;
  const { groups, unmatched, tot } = ledger;
  const saved = tot.gross - tot.cost;

  const th = { textAlign: "left", padding: "7px 10px", fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px", borderBottom: `2px solid ${C.border}`, position: "sticky", top: 0, background: C.cream, whiteSpace: "nowrap" };
  const td = { padding: "7px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };
  const conPicker = (onPick, cur) => (
    <select value={cur || ""} onChange={e => onPick(e.target.value)} disabled={busy}
      style={{ padding: "4px 6px", borderRadius: 7, border: `1.5px solid ${C.creamBr}`, fontSize: 11.5, fontFamily: FONT, fontWeight: 700, maxWidth: 230, cursor: "pointer" }}>
      <option value="">— pick a pot —</option>
      {[...containers].sort((a, b) => (a.diameter_in || 99) - (b.diameter_in || 99) || plantOrder(a.name, b.name)).map(c => (
        <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ""} — {money(c.cost_per_unit)}</option>
      ))}
    </select>
  );

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: FONT }}>
      {/* the cash story up top — needed, netted against inventory, what it costs, what inventory saved */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Stat label="Pots needed" value={tot.needed.toLocaleString()} sub={`${ledger.decidedFams}/${ledger.famCount} families decided`} accent={C.dark} />
        <Stat label="On hand (entered)" value={tot.onHand.toLocaleString()} sub="your in-house inventory" accent={C.light} />
        <Stat label="To order" value={tot.order.toLocaleString()} sub="after netting inventory, whole cases" accent={C.dark} />
        <Stat label="Cash to order" value={money0(tot.cost)} sub="at current pot costs" accent={C.amber} />
        <Stat label="Saved by inventory" value={money0(saved)} sub="cash NOT tied up in over-ordering" accent={C.green} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
        <span style={{ fontWeight: 800, color: C.dark }}>Needed based on:</span>
        {[["target", "🎯 the projection targets"], ["planned", "current plan (replay)"]].map(([k, l]) => (
          <button key={k} onClick={() => setBasis(k)}
            style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 800, fontSize: 11.5,
              border: `1.5px solid ${basis === k ? C.light : C.border}`, background: basis === k ? "#eef6e8" : "#fff", color: basis === k ? C.dark : C.muted }}>{l}</button>
        ))}
        <span style={{ color: C.muted }}>· families you haven't decided yet fall back to last year's plan, so this is a live estimate as you project</span>
      </div>

      {/* families with production but no pot matched — fix these so nothing is under-counted */}
      {unmatched.length > 0 && (
        <div style={{ background: C.amberBg, border: `1.5px solid #ecd9b8`, borderRadius: 10, padding: "11px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 8 }}>
            ⚠ {unmatched.length} famil{unmatched.length === 1 ? "y" : "ies"} not matched to a pot — {unmatched.reduce((a, f) => a + f.pots, 0).toLocaleString()} pots uncounted
          </div>
          {unmatched.sort((a, b) => plantOrder(a.label, b.label)).map(f => (
            <div key={f.recipeId || f.label} style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 0", fontSize: 12.5, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200, fontWeight: 700 }}>{f.label} <span style={{ color: C.muted, fontWeight: 500 }}>· {f.pots.toLocaleString()} pots</span></span>
              {f.recipeId ? conPicker(cid => matchFamily(f, cid), f.containerId) : <span style={{ fontSize: 11, color: C.muted }}>no family recipe — match items in ⚙ Manage families first</span>}
            </div>
          ))}
        </div>
      )}

      {/* the order ledger, one row per pot */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Pot</th>
            <th style={{ ...th, textAlign: "right" }}>Needed</th>
            <th style={{ ...th, textAlign: "right" }}>On hand</th>
            <th style={{ ...th, textAlign: "right" }}>To order</th>
            <th style={{ ...th, textAlign: "right" }}>Cases</th>
            <th style={{ ...th, textAlign: "right" }}>Unit</th>
            <th style={{ ...th, textAlign: "right" }}>Cost</th>
          </tr></thead>
          <tbody>
            {groups.map(g => {
              const c = g.container; const open = expand[c.id];
              return (
                <>
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setExpand(e => ({ ...e, [c.id]: !open }))}>
                    <td style={{ ...td, fontWeight: 700 }}>
                      <span style={{ color: C.muted, fontSize: 10, marginRight: 5 }}>{open ? "▾" : "▸"}</span>
                      {c.name}{c.sku ? <span style={{ color: C.muted, fontWeight: 500 }}> · {c.sku}</span> : ""}
                      <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 500, marginLeft: 15 }}>
                        {g.fams.length} famil{g.fams.length === 1 ? "y" : "ies"}{c.primary_supplier || c.supplier ? ` · ${c.primary_supplier || c.supplier}` : ""}{g.cs > 1 ? ` · ${g.cs}/case` : ""}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{g.needed.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <input defaultValue={c.stock_qty ?? ""} placeholder="0" inputMode="numeric"
                        onBlur={e => { if (e.target.value.trim() !== String(c.stock_qty ?? "")) setStock(c, e.target.value.trim()); }}
                        onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        title="how many of this pot you already have — netted out of the order"
                        style={{ width: 66, padding: "4px 6px", textAlign: "right", borderRadius: 6, border: `1.5px solid ${c.stock_qty ? C.light : C.creamBr}`, fontSize: 12, fontFamily: "inherit", fontWeight: c.stock_qty ? 700 : 400 }} />
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: g.net > 0 ? C.dark : C.green }}>{g.net > 0 ? g.orderUnits.toLocaleString() : "✓ covered"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{g.net > 0 && g.cs > 1 ? g.cases.toLocaleString() : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: C.muted }}>{money(g.unit)}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{g.net > 0 ? money0(g.cost) : "—"}</td>
                  </tr>
                  {open && g.fams.sort((a, b) => plantOrder(a.label, b.label)).map(f => (
                    <tr key={c.id + "|" + (f.recipeId || f.label)} style={{ background: "#fafcf7" }}>
                      <td style={{ ...td, paddingLeft: 30, fontSize: 11.5, color: C.text }}>
                        {f.label}
                        {f.recipeId && <span onClick={e => e.stopPropagation()} style={{ marginLeft: 8 }}>{conPicker(cid => matchFamily(f, cid), f.containerId)}</span>}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: C.muted }}>{f.pots.toLocaleString()}</td>
                      <td style={td} colSpan={5}></td>
                    </tr>
                  ))}
                </>
              );
            })}
            {!groups.length && <tr><td style={{ ...td, color: C.muted, padding: 20 }} colSpan={7}>No matched pots yet — set 2027 targets and match families to pots.</td></tr>}
          </tbody>
          {groups.length > 0 && (
            <tfoot><tr style={{ background: C.cream }}>
              <td style={{ ...td, fontWeight: 800 }}>Total</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{tot.needed.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{tot.onHand.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{tot.order.toLocaleString()}</td>
              <td style={td}></td>
              <td style={td}></td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: C.amber }}>{money0(tot.cost)}</td>
            </tr></tfoot>
          )}
        </table>
      </div>
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        Pots needed comes from the projection: each family's 2027 target (in pots) where you've decided, otherwise last year's plan — so it firms up live as you and Mario walk the families. Match a family to a pot here or on its family page; enter on-hand inventory in the <b>On hand</b> column and the order nets it out, rounded up to whole cases. <b>Saved by inventory</b> = the cash you're NOT tying up by ordering over what you already have.
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 140, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 13px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent, fontFamily: "'DM Serif Display',Georgia,serif", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
