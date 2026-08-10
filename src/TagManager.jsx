// 🏷 Tag Manager — "tag management is difficult" (Caleb 8/10/2026).
// Every 4.5" pot ships with a variety tag (4¢, bought in bulk from Ball). Leftover
// tags carry over between seasons, so the order must NET plan demand against what's
// already in the drawer: tags to order = pots planned − tags on hand.
// The on-hand column is the input surface for whoever counts tags; it persists in
// tag_inventory (keyed by item), so next season's order starts from truth.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { plantOrder } from "./shared";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74",
  border: "#dfe7d8", red: "#d94f3d", amber: "#e89a3a", text: "#2f3b2a", chip: "#eef3e8" };
const FONT = "'DM Sans', sans-serif";
const potFactor = r => { const ppu = Math.max(1, +r.plants_per_unit || +r.pack_size || 1); const ppp = +r.ppp || 1; return (ppp >= ppu && ppu > 1) ? ppu : 1; };

export default function TagManager() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [demand, setDemand] = useState(null);     // [{item, pots}]
  const [inv, setInv] = useState({});             // item_name -> {id, on_hand}
  const [tagCost, setTagCost] = useState(0.04);
  const [q, setQ] = useState("");
  const [savedFlash, setSavedFlash] = useState(null);

  useEffect(() => {
    (async () => {
      // demand = every 4.5" item in the Spring plan (the tag-buying season), in POTS
      const { data: plans } = await sb.from("production_plans").select("id,name").ilike("name", "%spring 2027%");
      const planId = plans?.[0]?.id;
      let rows = [];
      if (planId) {
        for (let off = 0; ; off += 1000) {
          const { data } = await sb.from("scheduled_crops")
            .select("item_name,qty_pots,ppp,plants_per_unit,pack_size,is_combo_component")
            .eq("plan_id", planId).ilike("item_name", '4.5%').gt("qty_pots", 0).range(off, off + 999);
          rows = rows.concat(data || []);
          if (!data || data.length < 1000) break;
        }
      }
      const by = {};
      rows.filter(r => !r.is_combo_component).forEach(r => { by[r.item_name] = (by[r.item_name] || 0) + (+r.qty_pots || 0) * potFactor(r); });
      setDemand(Object.entries(by).map(([item, pots]) => ({ item, pots: Math.round(pots) })).sort((a, b) => plantOrder(a.item, b.item)));
      const { data: invRows } = await sb.from("tag_inventory").select("*");
      setInv(Object.fromEntries((invRows || []).map(r => [r.item_name, r])));
      const { data: cs } = await sb.from("cost_settings").select("value").eq("key", "tag_cost_45").maybeSingle();
      if (cs && !isNaN(parseFloat(cs.value))) setTagCost(parseFloat(cs.value));
    })();
  }, [sb]);

  async function toggleTag(item) {
    const cur = inv[item];
    const next = !(cur ? cur.tagged !== false : true);   // default is TAGGED — first click turns it off
    const rec = { item_name: item, tagged: next, on_hand: cur?.on_hand ?? 0, updated_by: displayName || null, updated_at: new Date().toISOString() };
    const { data, error } = await sb.from("tag_inventory").upsert(rec, { onConflict: "item_name" }).select().single();
    if (error) { window.alert("Toggle didn't save: " + error.message); return; }
    setInv(v => ({ ...v, [item]: data }));
  }

  async function saveOnHand(item, raw) {
    const n = Math.max(0, Math.round(+String(raw).replace(/[^0-9]/g, "") || 0));
    const cur = inv[item];
    if (cur && +cur.on_hand === n) return;
    const rec = { item_name: item, on_hand: n, updated_by: displayName || null, updated_at: new Date().toISOString() };
    const { data, error } = await sb.from("tag_inventory").upsert(rec, { onConflict: "item_name" }).select().single();
    if (error) { window.alert("Count didn't save: " + error.message); return; }
    setInv(v => ({ ...v, [item]: data }));
    setSavedFlash(item); setTimeout(() => setSavedFlash(null), 1200);
  }

  const rows = useMemo(() => {
    if (!demand) return null;
    const known = new Set(demand.map(d => d.item));
    // include inventory-only rows (tags on hand for items not in this plan — the "extras" drawer)
    const extras = Object.values(inv).filter(r => !known.has(r.item_name) && +r.on_hand > 0)
      .map(r => ({ item: r.item_name, pots: 0 }));
    const all = [...demand, ...extras];
    const qq = q.trim().toLowerCase();
    return all.filter(r => !qq || r.item.toLowerCase().includes(qq)).map(r => {
      const tagged = inv[r.item] ? inv[r.item].tagged !== false : true;   // DEFAULT: every 4.5" gets one tag per pot
      const onHand = +(inv[r.item]?.on_hand ?? 0);
      const need = tagged ? r.pots : 0;
      const order = Math.max(0, need - onHand);
      return { ...r, tagged, need, onHand, order, cost: order * tagCost, surplus: Math.max(0, onHand - need) };
    });
  }, [demand, inv, q, tagCost]);

  const tot = useMemo(() => (rows || []).reduce((a, r) => ({
    pots: a.pots + r.need, onHand: a.onHand + r.onHand, order: a.order + r.order, cost: a.cost + r.cost, surplus: a.surplus + r.surplus,
  }), { pots: 0, onHand: 0, order: 0, cost: 0, surplus: 0 }), [rows]);

  function copyOrder() {
    const lines = (rows || []).filter(r => r.order > 0).map(r => `${r.item}\t${r.order}`);
    const text = `TAG ORDER — Ball · ${new Date().toLocaleDateString()} · ${lines.length} designs\n` + lines.join("\n");
    navigator.clipboard?.writeText(text).then(() => { setSavedFlash("__order"); setTimeout(() => setSavedFlash(null), 1500); })
      .catch(() => window.prompt("Copy the order list:", text));
  }

  const th = { textAlign: "left", padding: "8px 11px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap", position: "sticky", top: 0, background: "#fff" };
  const td = { padding: "7px 11px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
  const num = { ...td, textAlign: "right" };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 520 }}>
          Every 4.5" pot ships a tag ({(tagCost * 100).toFixed(0)}¢, bulk from Ball). Type what's <b>in the drawer</b> — the order column nets automatically, so you never re-buy tags you already own.
        </div>
        <span style={{ flex: 1 }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="search…"
          style={{ padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 13, minWidth: 150 }} />
        <button onClick={copyOrder}
          style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: C.dark, color: C.cream, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>
          {savedFlash === "__order" ? "✓ Copied" : "📋 Copy Ball order"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 12 }}>
        {[[tot.pots.toLocaleString(), "tags needed (pots)"],
          [tot.onHand.toLocaleString(), "on hand"],
          [tot.order.toLocaleString(), "to order"],
          ["$" + tot.cost.toFixed(2), "order cost @ " + (tagCost * 100).toFixed(0) + "¢"],
          ...(tot.surplus > 0 ? [[tot.surplus.toLocaleString(), "surplus tags (no plan demand)"]] : [])]
          .map(([v, k], i) => (
            <div key={i} style={{ background: i === 2 ? "#eef6e8" : C.chip, border: `1.5px solid ${i === 2 ? C.light : C.border}`, borderRadius: 11, padding: "10px 13px" }}>
              <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 18, fontWeight: 700, color: C.dark }}>{v}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>{k}</div>
            </div>
          ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "auto", maxHeight: "68vh" }}>
        {rows === null && <div style={{ padding: 20, color: C.muted }}>Loading the 4.5" roster…</div>}
        {rows && (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>Pots planned</th>
              <th style={{ ...th, textAlign: "right" }}>Tags on hand</th>
              <th style={{ ...th, textAlign: "right" }}>To order</th>
              <th style={{ ...th, textAlign: "right" }}>Cost</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.item} style={{ background: r.pots === 0 ? "#fbf8ef" : undefined, opacity: r.tagged ? 1 : 0.55 }}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <button onClick={() => toggleTag(r.item)}
                      title={r.tagged ? "tagged — one tag per pot (click to turn OFF for this item)" : "no tag for this item (click to turn back on)"}
                      style={{ marginRight: 7, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: FONT,
                        border: `1.5px solid ${r.tagged ? C.light : C.border}`, background: r.tagged ? "#eef6e8" : "#fff", color: r.tagged ? "#2e7d32" : C.muted }}>
                      {r.tagged ? "🏷 tag" : "no tag"}
                    </button>
                    {r.item}
                    {r.pots === 0 && <span title="tags in the drawer for an item not in the plan — surplus" style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: C.amber, background: "#f7edd7", borderRadius: 5, padding: "1px 6px" }}>surplus</span>}
                    {r.surplus > 0 && r.pots > 0 && <span title={`${r.surplus.toLocaleString()} more tags than the plan needs`} style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: C.amber }}>+{r.surplus.toLocaleString()} extra</span>}
                  </td>
                  <td style={num}>{r.tagged ? (r.pots ? r.pots.toLocaleString() : "—") : <span title="tags turned off for this item">off</span>}</td>
                  <td style={{ ...num, background: savedFlash === r.item ? "#eef6e8" : undefined, transition: "background .6s" }}>
                    <input key={`${r.item}|${r.onHand}`} defaultValue={r.onHand || ""} placeholder="0" inputMode="numeric"
                      onBlur={e => saveOnHand(r.item, e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      style={{ width: 74, padding: "4px 7px", textAlign: "right", borderRadius: 7, border: `1.5px solid ${r.onHand ? C.light : C.border}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, fontWeight: 700 }} />
                  </td>
                  <td style={{ ...num, fontWeight: 800, color: r.order > 0 ? C.dark : C.muted }}>{r.order ? r.order.toLocaleString() : "—"}</td>
                  <td style={num}>{r.order ? "$" + r.cost.toFixed(2) : "—"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td style={{ ...td, color: C.muted }} colSpan={5}>Nothing matches.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.muted, padding: "10px 2px 24px", lineHeight: 1.6 }}>
        Demand = Spring 2027 4.5" items, in pots. On-hand counts persist between seasons (keyed by item), entered by whoever counts the drawer —
        signed in as {displayName || "—"}. Surplus rows show tags you own with no plan demand, so leftovers are never re-bought and never invisible.
      </div>
    </div>
  );
}
