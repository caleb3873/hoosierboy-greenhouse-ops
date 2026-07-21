// CategoryProfiles — look at the business the way it actually gets discussed:
// by crop and by series, not variety by variety.
//
// "I want to look up bacopa… 4.5" Reiger Begonias and see when they sold first,
//  average price, how close we were to projections, cost per plant, and trends.
//  Calliope Geraniums across sizes so we can see which sizes we are most
//  profitable on, which sell first and are most popular."
//
// Every number here is real: plan quantities and costs from v_scheduled_crops_pl
// (liner + pot + soil + ring), actuals from sales_totals / sales_weekly matched
// through sales_sku_map. Nothing is estimated except where labelled.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";

const C = {
  dark: "#1e2d1a", light: "#7fb069", card: "#fff", border: "#dfe7d8",
  muted: "#7a8c74", text: "#2f3b2a", red: "#c0392b", amber: "#c98a2e", green: "#2e7d32",
};
const money = n => n == null ? "—" : (Math.abs(n) >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${(+n).toFixed(2)}`);
const pct = n => n == null ? "—" : `${Math.round(n * 100)}%`;
const sizeOf = n => (String(n || "").trim().match(/^(HB\s*\d+"?|\d+(?:\.\d+)?"|1801[LS]?|FIBER|POT|MARKET|BOWL|[A-Z]+)/i) || ["—"])[0].toUpperCase();

async function pageAll(sb, table, cols, mod) {
  let out = [], from = 0;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

export default function CategoryProfiles({ plan }) {
  const sb = getSupabase();
  const [items, setItems] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [crop, setCrop] = useState("");        // category
  const [series, setSeries] = useState("");
  const [size, setSize] = useState("");
  const [variety, setVariety] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("rev");
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!sb || !plan?.id) return;
    (async () => {
      try {
        const [pl, sc, vars, xw, tot, wk, comps] = await Promise.all([
          pageAll(sb, "v_scheduled_crops_pl", "id,variety_id,qty_pots,ppp,is_combo_component,liner_cost,pot_cost,soil_cost,ring_cost,direct_cost_total,sale_price_per_pot,revenue,gross_profit", q => q.eq("plan_id", plan.id)),
          pageAll(sb, "scheduled_crops", "id,item_name,variety_id,qty_pots,ppp,pack_size,ready_week,ready_year,sellable,is_combo_component", q => q.eq("plan_id", plan.id)),
          pageAll(sb, "variety_library", "id,crop_name"),
          pageAll(sb, "sales_sku_map", "sku,plan_item_name"),
          pageAll(sb, "sales_totals", "sku,units,revenue,avg_price"),
          pageAll(sb, "sales_weekly", "sku,wk,units,revenue"),
          pageAll(sb, "scheduled_crops", "variety_id,qty_plants_ordered,combo_parent_id,is_combo_component", q => q.eq("plan_id", plan.id).eq("is_combo_component", true)),
        ]);
        const crop = Object.fromEntries(vars.map(v => [v.id, v.crop_name]));
        // Series only exists inside item names (variety_library.series is empty),
        // so derive it: strip the size prefix, strip the crop word, take what's left.
        const SIZE_RE = /^(HB\s*\d+"?|\d+(?:\.\d+)?"|1801[LS]?|FIBER(\s+LG\.?)?|POT\s*\d*"?|MARKET(\s+BASKET)?|BOWL\s*\d*"?|\d+\s*CELL)\s*/i;
        const seriesOf = (name, cropName) => {
          let n = String(name || "").replace(SIZE_RE, "").trim();
          for (const w of String(cropName || "").toUpperCase().split(/\s+/)) {
            if (w && n.toUpperCase().startsWith(w)) n = n.slice(w.length).trim();
          }
          const tok = (n.split(/\s+/)[0] || "").replace(/[^A-Za-z0-9'-]/g, "");
          return tok.length > 2 ? tok.toUpperCase() : null;
        };
        // what each variety owes to combos — cut it and those baskets break
        const parentName = {};
        sc.forEach(r => { if (!r.is_combo_component) parentName[r.id] = r.item_name; });
        const comboDraw = {};
        (comps || []).forEach(c => {
          if (!c.variety_id) return;
          const d = comboDraw[c.variety_id] || (comboDraw[c.variety_id] = { plants: 0, combos: new Set() });
          d.plants += +c.qty_plants_ordered || 0;
          if (c.combo_parent_id && parentName[c.combo_parent_id]) d.combos.add(parentName[c.combo_parent_id]);
        });
        const plById = Object.fromEntries(pl.map(r => [r.id, r]));
        const skuToItem = {}; xw.forEach(x => { if (x.plan_item_name) skuToItem[x.sku] = x.plan_item_name; });

        const wkList = [...new Set(wk.map(w => +w.wk))].sort((a, b) => a - b);
        const wIdx = Object.fromEntries(wkList.map((w, i) => [w, i]));
        const sold = {}, srev = {}, sprice = {}, spn = {}, curve = {};
        for (const t of tot) { const it = skuToItem[t.sku]; if (!it) continue;
          sold[it] = (sold[it] || 0) + +t.units; srev[it] = (srev[it] || 0) + +t.revenue;
          sprice[it] = (sprice[it] || 0) + +t.avg_price; spn[it] = (spn[it] || 0) + 1; }
        for (const w of wk) { const it = skuToItem[w.sku]; if (!it) continue;
          (curve[it] = curve[it] || Array(wkList.length).fill(0))[wIdx[+w.wk]] += +w.units; }

        // one row per finished item: plan cost/quantity + what it actually did
        const byItem = {};
        for (const r of sc) {
          if (r.is_combo_component || r.sellable === false || !(+r.qty_pots > 0)) continue;
          const k = r.item_name;
          const p = plById[r.id] || {};
          const o = byItem[k] || (byItem[k] = {
            item: k, crop: crop[r.variety_id] || "—", size: sizeOf(k),
            pots: 0, plants: 0, cost: 0, planRev: 0, units: 0,
            pack: +r.pack_size || 1, ppp: +r.ppp || 1, price: +r.sale_price_per_pot || null,
            ready: r.ready_week ?? null,
            series: seriesOf(k, crop[r.variety_id]),
            comboPlants: comboDraw[r.variety_id]?.plants || 0,
            comboCount: comboDraw[r.variety_id]?.combos.size || 0,
          });
          o.pots += +r.qty_pots;
          o.plants += (+r.qty_pots) * (+r.ppp || 1);
          o.cost += +p.direct_cost_total || 0;
          o.planRev += +p.revenue || 0;
          if (r.ready_week != null) o.ready = o.ready == null ? r.ready_week : Math.min(o.ready, r.ready_week);
        }
        for (const o of Object.values(byItem)) {
          o.units = o.pack > 1 ? Math.round(o.pots / o.pack) : o.pots;   // sellable units
          o.sold = sold[o.item] || 0;
          o.rev = srev[o.item] || 0;
          o.avgPrice = spn[o.item] ? sprice[o.item] / spn[o.item] : null;
          o.st = o.units ? o.sold / o.units : null;
          o.costPerPlant = o.plants ? o.cost / o.plants : null;
          o.costPerUnit = o.units ? o.cost / o.units : null;
          o.gmPct = o.rev ? (o.rev - o.cost) / o.rev : null;
          const cv = curve[o.item];
          o.curve = cv || null;
          const idx = cv ? cv.map((u, i) => u > 0 ? i : -1).filter(i => i >= 0) : [];
          o.firstWk = idx.length ? wkList[idx[0]] : null;
          o.peakWk = cv && cv.some(x => x > 0) ? wkList[cv.indexOf(Math.max(...cv))] : null;
        }
        setItems(Object.values(byItem));
        setWeeks(wkList);

      } catch (e) { setErr(e.message || String(e)); }
    })();
  }, [sb, plan?.id]);

  // Cascading options — each dropdown only offers what the ones above allow.
  const opts = useMemo(() => {
    if (!items) return { crops: [], series: [], sizes: [], varieties: [] };
    const byCrop = items.filter(i => !crop || i.crop === crop);
    const bySeries = byCrop.filter(i => !series || i.series === series);
    const bySize = bySeries.filter(i => !size || i.size === size);
    const tally = (rows, key) => {
      const m = new Map();
      rows.forEach(r => { const k = r[key]; if (!k) return;
        const o = m.get(k) || { k, n: 0, rev: 0 }; o.n++; o.rev += r.rev || 0; m.set(k, o); });
      return [...m.values()].sort((a, b) => b.rev - a.rev || a.k.localeCompare(b.k));
    };
    return {
      crops: tally(items, "crop"),
      series: tally(byCrop, "series"),
      sizes: tally(bySeries, "size"),
      varieties: tally(bySize, "item"),
    };
  }, [items, crop, series, size]);

  const shown = useMemo(() => {
    if (!items) return [];
    const ql = q.trim().toLowerCase();
    return items.filter(i =>
      (!crop || i.crop === crop) && (!series || i.series === series) &&
      (!size || i.size === size) && (!variety || i.item === variety) &&
      (!ql || i.item.toLowerCase().includes(ql)));
  }, [items, crop, series, size, variety, q]);

  const label = [crop || "All crops", series, size, variety && variety.replace(/^\S+\s/, "")]
    .filter(Boolean).join(" · ");

  if (err) return <div style={{ padding: 20, color: C.red }}>Couldn't load: {err}</div>;
  if (!items) return <div style={{ padding: 20, color: C.muted }}>Loading categories…</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12.5, color: C.muted }}>
        Pick a category to see it as a whole — what it costs, what it earned, when it started selling, and how close the plan was.
        Costs are <strong>direct only</strong> (liner + pot + soil + ring); no labour or overhead, so margins read high.
        Actuals are the 2026 season.
      </div>

      <Picker opts={opts}
        crop={crop} series={series} size={size} variety={variety}
        setCrop={v => { setCrop(v); setSeries(""); setSize(""); setVariety(""); }}
        setSeries={v => { setSeries(v); setSize(""); setVariety(""); }}
        setSize={v => { setSize(v); setVariety(""); }}
        setVariety={setVariety} />

      {shown.length > 0 && (
        <>
          <CategoryHeadline label={label} rows={shown} weeks={weeks} />
          <ComboDependency rows={shown} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 free-text narrow…"
              style={{ padding: "7px 11px", borderRadius: 16, border: `1px solid ${C.border}`, fontSize: 12.5, fontFamily: "inherit", width: 210 }} />
            <span style={{ fontSize: 12, color: C.muted }}>{shown.length} items</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>sort:</span>
            {[["rev", "revenue"], ["st", "sell-through"], ["gmPct", "margin"], ["firstWk", "sells first"], ["costPerPlant", "cost/plant"]].map(([k, l]) => (
              <button key={k} onClick={() => setSortBy(k)} style={{
                padding: "5px 11px", borderRadius: 14, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${sortBy === k ? C.light : C.border}`, background: sortBy === k ? C.light : "#fff",
                color: sortBy === k ? "#fff" : C.text }}>{l}</button>
            ))}
          </div>
          <BySize rows={shown} />
          <ItemTable rows={shown} sortBy={sortBy} weeks={weeks} />
        </>
      )}
      {shown.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Nothing matches that combination.</div>}
    </div>
  );
}

function Picker({ opts, crop, series, size, variety, setCrop, setSeries, setSize, setVariety }) {
  const sel = { padding: "8px 11px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontSize: 13,
    fontFamily: "inherit", background: "#fff", color: C.text, minWidth: 150, cursor: "pointer" };
  const wrap = { display: "flex", flexDirection: "column", gap: 4 };
  const lab = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 };
  const Drop = ({ label, value, onChange, options, allLabel, fmt }) => (
    <div style={wrap}>
      <span style={lab}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...sel, borderColor: value ? C.light : C.border, fontWeight: value ? 700 : 400 }}>
        <option value="">{allLabel}</option>
        {options.map(o => <option key={o.k} value={o.k}>{fmt ? fmt(o) : `${o.k} (${o.n})`}</option>)}
      </select>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <Drop label="Category" value={crop} onChange={setCrop} options={opts.crops} allLabel="All crops" />
      <Drop label="Series" value={series} onChange={setSeries} options={opts.series} allLabel="All series" />
      <Drop label="Size" value={size} onChange={setSize} options={opts.sizes} allLabel="All sizes" />
      <Drop label="Variety" value={variety} onChange={setVariety} options={opts.varieties} allLabel="All varieties"
        fmt={o => o.k.length > 44 ? o.k.slice(0, 42) + "…" : o.k} />
      {(crop || series || size || variety) && (
        <button onClick={() => { setCrop(""); }} style={{ padding: "8px 13px", borderRadius: 9, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>reset</button>
      )}
    </div>
  );
}

// The wire-vine guard: what breaks downstream if this selection gets cut.
function ComboDependency({ rows }) {
  const dep = useMemo(() => rows.filter(r => r.comboPlants > 0)
    .sort((a, b) => b.comboPlants - a.comboPlants), [rows]);
  if (!dep.length) return null;
  const totalPlants = dep.reduce((a, r) => a + r.comboPlants, 0);
  const maxCombos = Math.max(...dep.map(r => r.comboCount));
  return (
    <div style={{ background: "#fdf7ec", border: `1.5px solid ${C.amber}`, borderRadius: 10, padding: "11px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#8a5d12" }}>
        🪴 Combos depend on this — {totalPlants.toLocaleString()} plants across up to {maxCombos} baskets
      </div>
      <div style={{ fontSize: 12, color: "#8a5d12", marginTop: 3, marginBottom: 7 }}>
        These quantities are ordered separately for combos. Cutting the retail line does not free them, and cutting them breaks the baskets.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {dep.slice(0, 12).map(r => (
          <span key={r.item} style={{ fontSize: 11.5, background: "#fff", border: `1px solid ${C.amber}55`, borderRadius: 7, padding: "3px 8px", color: "#6b4a10" }}>
            {r.item.length > 34 ? r.item.slice(0, 32) + "…" : r.item} — <b>{r.comboPlants.toLocaleString()}</b> plants → {r.comboCount} combo{r.comboCount !== 1 ? "s" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryHeadline({ label, rows, weeks }) {
  const t = rows.reduce((a, r) => ({
    pots: a.pots + r.pots, plants: a.plants + r.plants, units: a.units + r.units,
    sold: a.sold + r.sold, cost: a.cost + r.cost, rev: a.rev + r.rev,
  }), { pots: 0, plants: 0, units: 0, sold: 0, cost: 0, rev: 0 });
  const st = t.units ? t.sold / t.units : null;
  const gm = t.rev ? (t.rev - t.cost) / t.rev : null;
  const firsts = rows.map(r => r.firstWk).filter(Boolean);
  const first = firsts.length ? Math.min(...firsts) : null;
  const curve = weeks.map((_, i) => rows.reduce((a, r) => a + (r.curve ? r.curve[i] : 0), 0));
  const peak = curve.some(x => x > 0) ? weeks[curve.indexOf(Math.max(...curve))] : null;
  const avgPrice = t.sold ? t.rev / t.sold : null;
  const maxC = Math.max(...curve, 1);

  const Stat = ({ label, value, sub, accent }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 116 }}>
      <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent || C.dark, lineHeight: 1.25 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <Stat label="2026 revenue" value={money(t.rev)} sub={`${t.sold.toLocaleString()} units sold`} />
        <Stat label="Avg price" value={avgPrice ? money(avgPrice) : "—"} sub="per selling unit" />
        <Stat label="Sell-through" value={pct(st)} sub={`${t.units.toLocaleString()} planned`}
          accent={st == null ? C.muted : st >= 0.95 ? C.green : st < 0.6 ? C.red : C.dark} />
        <Stat label="Direct cost" value={money(t.cost)} sub={t.plants ? `${money(t.cost / t.plants)} / plant` : null} />
        <Stat label="Direct margin" value={pct(gm)} sub="excl. labour" accent={C.green} />
        <Stat label="First sold" value={first ? `wk ${first}` : "—"} sub={peak ? `peak wk ${peak}` : null} />
        <Stat label="Plants grown" value={t.plants.toLocaleString()} sub={`${t.pots.toLocaleString()} pots`} />
      </div>
      {curve.some(x => x > 0) && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>Weekly demand (2026)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
            {curve.map((v, i) => (
              <div key={i} title={`wk${weeks[i]}: ${Math.round(v).toLocaleString()} units`}
                style={{ flex: 1, height: Math.max(2, v / maxC * 84), background: weeks[i] === peak ? C.dark : C.light, borderRadius: "3px 3px 0 0" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
            {weeks.map(w => <div key={w} style={{ flex: 1, fontSize: 8.5, color: C.muted, textAlign: "center" }}>{w}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// Which size earns, which sells first — the Calliope-across-sizes question
function BySize({ rows }) {
  const bySize = useMemo(() => {
    const m = new Map();
    rows.forEach(r => {
      const o = m.get(r.size) || { size: r.size, items: 0, units: 0, sold: 0, cost: 0, rev: 0, plants: 0, firsts: [] };
      o.items++; o.units += r.units; o.sold += r.sold; o.cost += r.cost; o.rev += r.rev; o.plants += r.plants;
      if (r.firstWk) o.firsts.push(r.firstWk);
      m.set(r.size, o);
    });
    return [...m.values()].map(o => ({
      ...o, st: o.units ? o.sold / o.units : null,
      gm: o.rev ? (o.rev - o.cost) / o.rev : null,
      price: o.sold ? o.rev / o.sold : null,
      cpp: o.plants ? o.cost / o.plants : null,
      first: o.firsts.length ? Math.min(...o.firsts) : null,
      profit: o.rev - o.cost,
    })).sort((a, b) => b.rev - a.rev);
  }, [rows]);
  if (bySize.length < 2) return null;
  const th = { textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` };
  const td = { padding: "7px 10px", fontSize: 13, borderBottom: `1px solid ${C.border}` };
  const best = { gm: Math.max(...bySize.map(s => s.gm ?? -9)), first: Math.min(...bySize.map(s => s.first ?? 99)) };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "11px 14px", fontWeight: 800, color: C.dark, fontSize: 14 }}>By size — where the money actually is</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>Size</th><th style={{ ...th, textAlign: "right" }}>Items</th>
          <th style={{ ...th, textAlign: "right" }}>Planned</th><th style={{ ...th, textAlign: "right" }}>Sold</th>
          <th style={{ ...th, textAlign: "right" }}>Sell-thru</th><th style={{ ...th, textAlign: "right" }}>Avg price</th>
          <th style={{ ...th, textAlign: "right" }}>Cost/plant</th><th style={{ ...th, textAlign: "right" }}>Revenue</th>
          <th style={{ ...th, textAlign: "right" }}>Profit</th><th style={{ ...th, textAlign: "right" }}>Margin</th>
          <th style={{ ...th, textAlign: "right" }}>First sold</th>
        </tr></thead>
        <tbody>
          {bySize.map(s => (
            <tr key={s.size}>
              <td style={{ ...td, fontWeight: 800 }}>{s.size}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }}>{s.items}</td>
              <td style={{ ...td, textAlign: "right" }}>{s.units.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>{s.sold.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: s.st == null ? C.muted : s.st >= 0.95 ? C.green : s.st < 0.6 ? C.red : C.text }}>{pct(s.st)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(s.price)}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }}>{money(s.cpp)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(s.rev)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{money(s.profit)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, color: s.gm === best.gm ? C.green : C.text }}>{pct(s.gm)}{s.gm === best.gm ? " ★" : ""}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: s.first === best.first ? 800 : 400, color: s.first === best.first ? C.green : C.text }}>{s.first ? `wk ${s.first}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemTable({ rows, sortBy, weeks }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sortBy === "firstWk") return (a.firstWk ?? 99) - (b.firstWk ?? 99);
    if (sortBy === "costPerPlant") return (a.costPerPlant ?? 9e9) - (b.costPerPlant ?? 9e9);
    return (b[sortBy] ?? -9e9) - (a[sortBy] ?? -9e9);
  }), [rows, sortBy]);
  const th = { textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: "#eef3e8", zIndex: 2 };
  const td = { padding: "7px 10px", fontSize: 13, borderBottom: `1px solid ${C.border}` };
  const spark = a => { if (!a) return ""; const m = Math.max(...a) || 1; return a.map(v => " ▁▂▃▄▅▆▇█"[Math.round(v / m * 8)]).join(""); };
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "auto", maxHeight: "60vh" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>Planned</th>
          <th style={{ ...th, textAlign: "right" }}>Sold</th><th style={{ ...th, textAlign: "right" }}>Sell-thru</th>
          <th style={{ ...th, textAlign: "right" }}>Avg price</th><th style={{ ...th, textAlign: "right" }}>Cost/plant</th>
          <th style={{ ...th, textAlign: "right" }}>Revenue</th><th style={{ ...th, textAlign: "right" }}>Margin</th>
          <th style={{ ...th, textAlign: "right" }}>1st</th><th style={th}>Demand</th>
        </tr></thead>
        <tbody>
          {sorted.slice(0, 300).map(r => (
            <tr key={r.item}>
              <td style={{ ...td, fontWeight: 600 }}>{r.item}</td>
              <td style={{ ...td, textAlign: "right" }}>{r.units.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right" }}>{r.sold.toLocaleString()}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.st == null ? C.muted : r.st >= 0.95 ? C.green : r.st < 0.6 ? C.red : C.text }}>{pct(r.st)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(r.avgPrice)}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }}>{money(r.costPerPlant)}</td>
              <td style={{ ...td, textAlign: "right" }}>{money(r.rev)}</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{pct(r.gmPct)}</td>
              <td style={{ ...td, textAlign: "right", color: C.muted }}>{r.firstWk ? `wk${r.firstWk}` : "—"}</td>
              <td style={{ ...td, fontFamily: "monospace", color: "#4a6b3a", letterSpacing: 1 }}>{spark(r.curve)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
