// OrderReconciliation — Phase 5, the last piece of the 2026-07-27 spec.
// THE single order-quantity writer. The plan stays exact (need = pots × ppp × overage);
// this page rounds to orderable reality (100s, per-broker pooling, minimums), makes every
// residue an explicit disposition, suggests shoulder-week borrows (judged by the recipe's
// hold tolerance), and commits supply (qty_plants_ordered) with a full audit trail.
import { useState, useEffect, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", text: "#2f3b2a", amber: "#c9812a", amberBg: "#fbf1df", red: "#c0492b",
  redBg: "#fae9e5", border: "#e4ecdd", chip: "#eaf2e0", green: "#2e7d32" };
const FONT = "'DM Sans','Segoe UI',sans-serif";
const MONO = "ui-monospace,Menlo,monospace";
const wkFmt = (yr, wk) => (yr == null || wk == null) ? "—" : `${String(yr).slice(2)}${String(wk).padStart(2, "0")}`;
const PROPPED = m => /^(URC|CALL|SEED|PLUG)/i.test(m || "");

export default function OrderReconciliation({ plan }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [lines, setLines] = useState(null);     // assembled buy lines
  const [orders, setOrders] = useState({});     // lineKey -> chosen order qty (draft)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const page = async (table, cols, f) => {
        const out = [];
        for (let from = 0; ; from += 1000) {
          let q = sb.from(table).select(cols).order("id").range(from, from + 999);
          if (f) q = f(q);
          const { data } = await q; out.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      const sc = await page("scheduled_crops",
        "id,item_name,variety_id,recipe_id,qty_pots,ppp,qty_plants_ordered,ship_week,ship_year,plant_week,prop_method,broker,supplier,liner_unit_cost,is_combo_component,combo_parent_id",
        q => q.eq("plan_id", plan.id));
      const vids = [...new Set(sc.map(r => r.variety_id).filter(Boolean))];
      const vmap = {};
      for (let i = 0; i < vids.length; i += 200) {
        const { data } = await sb.from("variety_library").select("id,crop_name,variety,variety_key").in("id", vids.slice(i, i + 200));
        (data || []).forEach(v => { vmap[v.id] = v; });
      }
      const rids = [...new Set(sc.map(r => r.recipe_id).filter(Boolean))];
      const rmap = {};
      for (let i = 0; i < rids.length; i += 200) {
        const { data } = await sb.from("crop_recipes").select("id,overage_pct,hold_tolerance_wks").in("id", rids.slice(i, i + 200));
        (data || []).forEach(r => { rmap[r.id] = r; });
      }
      const { data: brules } = await sb.from("breeder_rules").select("*");
      const { data: ackLog } = await sb.from("item_change_log").select("item_name,change_type")
        .eq("plan_id", plan.id).eq("change_type", "order_confirmation").limit(500);
      const acked = new Set((ackLog || []).map(x => x.item_name));

      // buy grain: variety_key × arrival week. Parents contribute pots×ppp×(1+overage);
      // components contribute their own plant counts (0 = bank draw, contributes nothing).
      const m = {};
      for (const r of sc) {
        if (!PROPPED(r.prop_method)) continue;
        const v = vmap[r.variety_id]; if (!v) continue;
        let need = 0;
        if (r.is_combo_component) need = +r.qty_plants_ordered || 0;   // 0 = drawn from a stock bank
        else {
          const ov = +(rmap[r.recipe_id]?.overage_pct || 0);
          need = Math.ceil((+r.qty_pots || 0) * (+r.ppp || 1) * (100 + ov) / 100);
        }
        if (!need) continue;
        const wk = r.ship_week, yr = r.ship_year;
        const k = `${v.variety_key}|${wk ?? "?"}`;
        const o = m[k] || (m[k] = { key: k, vkey: v.variety_key, name: `${v.crop_name} ${v.variety}`.trim(),
          crop: v.crop_name, wk, yr, need: 0, rows: [], items: new Set(), brokers: new Set(),
          liner: null, form: r.prop_method, hold: rmap[r.recipe_id]?.hold_tolerance_wks ?? null, acked: false });
        o.need += need;
        o.rows.push({ id: r.id, share: need, committed: r.is_combo_component ? null : r.qty_plants_ordered });
        o.items.add(r.item_name);
        if (r.broker) o.brokers.add(r.broker);
        if (r.liner_unit_cost != null && +r.liner_unit_cost !== 1) o.liner = +r.liner_unit_cost;
        if (acked.has(r.item_name)) o.acked = true;
      }
      const list = Object.values(m).sort((a, b) => (a.wk ?? 99) - (b.wk ?? 99) || a.name.localeCompare(b.name));
      // breeder pooling rules by series pattern
      list.forEach(l => {
        const rule = (brules || []).find(b => l.name.toLowerCase().includes(String(b.series_pattern).toLowerCase()));
        l.breeder = rule?.breeder || null;
        l.minOrder = rule?.min_order ?? 2000;
        l.inc = rule?.order_increment ?? 100;
        l.broker = [...l.brokers][0] || null;
        // committed already? (all parent rows carry supply)
        const committedRows = l.rows.filter(r => r.committed != null && r.committed > 0);
        l.committed = committedRows.length === l.rows.length && l.rows.length > 0
          ? l.rows.reduce((a, r) => a + (+r.committed || 0), 0) : null;
      });
      setLines(list);
      const drafts = {};
      list.forEach(l => { drafts[l.key] = l.committed ?? Math.max(l.inc, Math.ceil(l.need / l.inc) * l.inc); });
      setOrders(drafts);
    })();
  }, [sb, plan.id, tick]); // eslint-disable-line

  // shoulder-borrow suggestions: same variety in an adjacent week where one side rounds long
  const shoulder = useMemo(() => {
    if (!lines) return {};
    const out = {};
    for (const l of lines) {
      const ord = +orders[l.key] || 0;
      if (ord >= l.need) continue;   // only short lines need a donor
      const short = l.need - ord;
      const donor = lines.find(d => d.vkey === l.vkey && d.key !== l.key && d.wk != null && l.wk != null
        && Math.abs(d.wk - l.wk) === 1 && ((+orders[d.key] || 0) - d.need) >= short);
      if (donor) {
        const holdOk = l.hold == null ? null : 1 <= +l.hold;
        out[l.key] = { from: donor, short, holdOk };
      }
    }
    return out;
  }, [lines, orders]);

  const pools = useMemo(() => {
    if (!lines) return [];
    const by = {};
    lines.forEach(l => {
      const k = `${l.broker || "unpinned"}|${l.breeder || l.crop}`;
      const p = by[k] || (by[k] = { broker: l.broker || "unpinned", pool: l.breeder || l.crop, plants: 0, dollars: 0, min: l.minOrder, n: 0 });
      const ord = +orders[l.key] || 0;
      p.plants += ord; p.dollars += ord * (l.liner || 0); p.n++;
      p.min = Math.max(p.min, l.minOrder);
    });
    return Object.values(by).sort((a, b) => b.plants - a.plants);
  }, [lines, orders]);

  async function commit() {
    const toWrite = (lines || []).filter(l => {
      const ord = +orders[l.key] || 0;
      return ord > 0 && ord !== l.committed;
    });
    if (!toWrite.length) return;
    const totPlants = toWrite.reduce((a, l) => a + (+orders[l.key] || 0), 0);
    if (!window.confirm(`Commit order quantities for ${toWrite.length} lines (${totPlants.toLocaleString()} plants)?\n\nWrites qty_plants_ordered onto the plan rows (largest-remainder split) and logs every line. The PLAN quantities stay untouched — this is supply, not demand.`)) return;
    setBusy(true);
    let written = 0;
    for (const l of toWrite) {
      const ord = +orders[l.key] || 0;
      // distribute across contributing rows proportionally, largest remainder
      const exact = l.rows.map(r => l.need > 0 ? ord * r.share / l.need : ord / l.rows.length);
      const flo = exact.map(Math.floor);
      let rem = ord - flo.reduce((a, b) => a + b, 0);
      exact.map((e, i) => ({ i, fr: e - flo[i] })).sort((a, b) => b.fr - a.fr).slice(0, Math.max(0, rem)).forEach(x => flo[x.i]++);
      for (let i = 0; i < l.rows.length; i++) {
        await sb.from("scheduled_crops").update({ qty_plants_ordered: flo[i] }).eq("id", l.rows[i].id);
      }
      const delta = ord - l.need;
      try {
        for (const it of l.items) {
          await sb.from("item_change_log").insert({
            plan_id: plan.id, item_name: it, variety_key: l.vkey, change_type: "order_committed",
            detail: { variety: l.name, week: wkFmt(l.yr, l.wk), need: l.need, ordered: ord,
              disposition: delta > 0 ? `round up +${delta}` : delta < 0 ? `accept short ${-delta}` : "exact" },
            changed_by: displayName || null, source: "reconciliation",
          });
        }
      } catch { /* audit must not block */ }
      written++;
    }
    setBusy(false); setDone(`✅ committed ${written} lines · ${totPlants.toLocaleString()} plants`); setTick(t => t + 1);
  }

  const th = { textAlign: "left", padding: "6px 9px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "7px 9px", fontSize: 12.5, color: C.text, borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums", verticalAlign: "top" };

  if (!lines) return <div style={{ padding: 24, color: C.muted, fontFamily: FONT }}>Rolling up the buy list…</div>;
  if (!lines.length) return <div style={{ padding: 24, color: C.muted, fontFamily: FONT }}>Nothing to order — no propagated rows with plant needs in {plan.name}.</div>;

  const totNeed = lines.reduce((a, l) => a + l.need, 0);
  const totOrd = lines.reduce((a, l) => a + (+orders[l.key] || 0), 0);
  const totCost = lines.reduce((a, l) => a + (+orders[l.key] || 0) * (l.liner || 0), 0);
  const roundCost = lines.reduce((a, l) => a + Math.max(0, (+orders[l.key] || 0) - l.need) * (l.liner || 0), 0);

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>🧾 Order reconciliation</div>
        <div style={{ fontSize: 12, color: C.muted }}>the plan stays exact — this is where need becomes orderable. One writer, full audit.</div>
        {done && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{done}</span>}
        <span style={{ flex: 1 }} />
        <button disabled={busy} onClick={commit}
          style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: C.light, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
          {busy ? "Committing…" : "💾 Commit order quantities"}
        </button>
      </div>

      {/* totals + pools */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8, marginBottom: 10 }}>
        {[[totNeed.toLocaleString(), "plants needed (exact)"],
          [totOrd.toLocaleString(), "plants at current orders"],
          [`$${Math.round(totCost).toLocaleString()}`, "liner spend (priced lines)"],
          [`$${Math.round(roundCost).toLocaleString()}`, "cost of the round-ups"]].map(([v, k], i) => (
          <div key={i} style={{ background: C.cream, border: `1px solid ${C.creamBr}`, borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: i === 3 && roundCost > 0 ? C.amber : C.dark }}>{v}</div>
            <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {pools.map(p => (
          <span key={`${p.broker}|${p.pool}`} title={`${p.n} lines`}
            style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 7, padding: "4px 9px",
              background: p.plants < p.min ? C.redBg : C.chip, color: p.plants < p.min ? C.red : C.text,
              border: `1px solid ${p.plants < p.min ? "#eccfc7" : C.border}` }}>
            {p.broker} · {p.pool}: {p.plants.toLocaleString()} pl · ${Math.round(p.dollars).toLocaleString()}
            {p.plants < p.min ? ` — ⚠ under ${p.min.toLocaleString()} min` : ""}
          </span>
        ))}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr>{["Arrive", "Variety", "Form", "Items", "Need (exact)", "Order", "Δ", "$/liner", "Line $", "Status"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {lines.map(l => {
              const ord = +orders[l.key] || 0;
              const delta = ord - l.need;
              const sh = shoulder[l.key];
              const status = l.committed != null
                ? (l.acked ? <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.green, background: C.chip, borderRadius: 5, padding: "2px 6px" }}>✓ ack'd</span>
                  : <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.dark, background: C.chip, borderRadius: 5, padding: "2px 6px" }}>● committed</span>)
                : <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: C.muted, background: C.chip, borderRadius: 5, padding: "2px 6px" }}>○ plan</span>;
              return (
                <tr key={l.key}>
                  <td style={{ ...td, fontFamily: MONO, fontWeight: 700 }}>{wkFmt(l.yr, l.wk)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{l.name}
                    {l.broker && <span style={{ marginLeft: 6, fontSize: 9.5, color: C.muted }}>📌 {l.broker}</span>}
                    {sh && (
                      <div style={{ fontSize: 10, color: sh.holdOk === false ? C.red : C.amber, marginTop: 2 }}>
                        ↔ short {sh.short}: borrow from wk{wkFmt(sh.from.yr, sh.from.wk)} surplus
                        {sh.holdOk === true ? " (+1wk hold ✓ within tolerance)" : sh.holdOk === false ? " (⚠ exceeds hold tolerance)" : " (set hold tolerance on the recipe to referee)"}
                      </div>
                    )}
                  </td>
                  <td style={td}><span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>{(l.form || "").split(" ")[0]}</span></td>
                  <td style={{ ...td, fontSize: 11, color: C.muted }}>{l.items.size}</td>
                  <td style={{ ...td, textAlign: "right" }}>{l.need.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <OrderInput value={orders[l.key] ?? ""} disabled={busy}
                      onCommit={v => setOrders(o => ({ ...o, [l.key]: v }))} />
                    <div style={{ fontSize: 9, color: C.muted }}>inc {l.inc}</div>
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {delta === 0 ? <span style={{ color: C.muted }}>—</span>
                      : <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: delta > 0 ? C.amber : C.red }}>
                          {delta > 0 ? `+${delta}` : delta}</span>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{l.liner != null ? `$${l.liner.toFixed(3)}` : <span style={{ color: C.amber, fontSize: 10 }}>no quote</span>}</td>
                  <td style={{ ...td, textAlign: "right" }}>{l.liner != null ? `$${Math.round(ord * l.liner).toLocaleString()}` : "—"}</td>
                  <td style={td}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
        Need = pots × ppp × (1 + recipe overage), components at their own counts (bank draws = 0, never re-ordered).
        Orders default to the next increment up — edit freely; Δ shows the residue and the round-up cost is totaled above.
        Committing writes supply (qty_plants_ordered) across the underlying rows and logs a disposition per item — the plan's demand numbers are never touched.
        Ack reconciliation deepens as order confirmations import (item history already shows them).
      </div>
    </div>
  );
}

function OrderInput({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(String(value)); }, [value, focus]);
  return (
    <input value={draft} disabled={disabled} inputMode="numeric"
      onFocus={() => setFocus(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocus(false); const v = parseInt(draft, 10); if (!Number.isNaN(v) && v >= 0) onCommit(v); else setDraft(String(value)); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ width: 76, padding: "4px 6px", textAlign: "right", borderRadius: 7, border: "1.5px solid #cfe3bd",
        fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, fontWeight: 700 }} />
  );
}
