import { useState, useMemo } from "react";
import { useFallProgramItems, useSoilMixes, useContainers } from "./supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`, background: "#fff", fontSize: 14, color: "#1e2d1a", outline: "none", boxSizing: "border-box", fontFamily: "inherit" });
const FL = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>{children}</div>;
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

const COLOR_PALETTE = {
  PURPLE: "#8e44ad", RED: "#c03030", WHITE: "#d8d8d8", ORANGE: "#e07b39",
  BRONZE: "#a0612a", PINK: "#e89bb0", CORAL: "#ff7f50", YELLOW: "#f0c020",
  GOLD: "#d4a017", LAVENDER: "#b48ce0", BLUE: "#4a90d9",
  TRICOLOR: "linear-gradient(90deg, #c03030 0%, #f0c020 50%, #8e44ad 100%)",
};

const fmt$ = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtN = (n) => Number(n || 0).toLocaleString();

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "color", label: "Color Mix" },
  { id: "schedule", label: "Schedule" },
  { id: "sowing", label: "Sowing & Prop" },
  { id: "cost", label: "Cost Estimate" },
];

// Volume conversion to cu ft
function volumeToCuFt(val, unit) {
  if (!val) return 0;
  const v = Number(val);
  if (unit === "cu ft") return v;
  if (unit === "gal")   return v * 0.134;
  if (unit === "qt")    return v * 0.0334;
  if (unit === "L")     return v * 0.0353;
  return 0;
}

// Map category to a container (which pot to use for which item type)
function pickContainerForCategory(category, containers) {
  if (!category) return null;
  const c = category.toUpperCase();
  // Mum category → matching pot
  if (c.includes('9"') && c.includes('MUM'))   return containers.find(x => x.sku === "XAM09001");
  if (c.includes('9"') && c.includes('ASTER')) return containers.find(x => x.sku === "XAM09001");
  if (c.includes('12"') && c.includes('MUM'))  return containers.find(x => x.sku === "PA.12000" && (x.name || "").includes("Cl"));
  if (c.includes('14"'))                       return containers.find(x => x.sku === "PA.14000");
  return null;
}

// Pick the default soil mix (BM5HP Compressed)
function pickDefaultSoil(soilMixes) {
  return soilMixes.find(s => (s.name || "").toLowerCase().includes("bm5hp compressed"))
      || soilMixes.find(s => (s.name || "").toLowerCase().includes("bm5 hp"));
}

function soilCostPerCuFt(mix) {
  if (!mix) return 0;
  const fluffed = parseFloat(mix.fluffedVolume);
  const cost = parseFloat(mix.costPerBag);
  if (fluffed > 0) return cost / fluffed;
  if (mix.bagSize && mix.bagUnit) {
    const cf = volumeToCuFt(mix.bagSize, mix.bagUnit);
    if (cf > 0) return cost / cf;
  }
  return 0;
}

// Compute effective sow week from ship_week + plant_week
// "SOW 4 WKS BEFORE" + "WEEK 25" → "WEEK 21"
// "DIRECT SOW" → returns the plant week (sown when planted)
function computeSowWeek(item) {
  const sw = (item.shipWeek || "").trim().toUpperCase();
  const pw = (item.plantWeek || "").trim().toUpperCase();

  if (sw.startsWith("DIRECT SOW")) return pw || "Direct sow";

  const sowMatch = sw.match(/^SOW\s+(\d+)\s+WKS?\s+BEFORE/i);
  if (sowMatch && pw) {
    const wks = parseInt(sowMatch[1]);
    const pwMatch = pw.match(/WEEK\s+(\d+)/);
    if (pwMatch) {
      const wkNum = parseInt(pwMatch[1]) - wks;
      return `WEEK ${wkNum}`;
    }
  }
  return null;
}

function isSeedSow(item) {
  const pm = (item.propMethod || "").toUpperCase();
  if (pm === "SEED" || pm === "URC") return true;
  const sw = (item.shipWeek || "").toUpperCase();
  return sw.includes("SOW") || (item.breeder || "").toUpperCase() === "SEED";
}

const PROP_BADGE = {
  SEED:  { bg: "#fff4e8", color: "#c8791a", label: "SEED" },
  URC:   { bg: "#f5f0ff", color: "#8e44ad", label: "URC" },
  LINER: { bg: "#f0f8eb", color: "#4a7a35", label: "LINER" },
};

export default function FallProgram() {
  const { rows: items, upsert, remove } = useFallProgramItems();
  const { rows: soilMixes } = useSoilMixes();
  const { rows: containers } = useContainers();

  const allYears = useMemo(() => {
    const ys = [...new Set(items.map(i => i.year).filter(Boolean))].sort((a, b) => b - a);
    if (!ys.includes(new Date().getFullYear())) ys.unshift(new Date().getFullYear());
    return ys;
  }, [items]);

  const [year, setYear] = useState(allYears[0] || new Date().getFullYear());
  const [section, setSection] = useState("overview");

  const yearItems = useMemo(() => items.filter(i => i.year === year), [items, year]);

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 28, fontWeight: 400, color: "#1a2a1a" }}>
            Fall Program
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            Mums, asters, kale & fall annuals
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #c8d8c0", background: "#fff", fontSize: 14, fontWeight: 700, color: "#1e2d1a", fontFamily: "inherit", cursor: "pointer" }}>
            {allYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #e0ead8", marginBottom: 20, overflowX: "auto" }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            style={{ padding: "12px 22px", fontSize: 14, fontWeight: section === s.id ? 800 : 600,
              color: section === s.id ? "#1e2d1a" : "#7a8c74", background: "none", border: "none",
              borderBottom: section === s.id ? "3px solid #7fb069" : "3px solid transparent",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {s.label}
          </button>
        ))}
      </div>

      {yearItems.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🍂</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No items for {year}</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Import a workbook or duplicate from another year</div>
        </div>
      ) : (
        <>
          {section === "overview" && <OverviewTab items={yearItems} year={year} />}
          {section === "items" && <ItemsTab items={yearItems} soilMixes={soilMixes} containers={containers} upsert={upsert} remove={remove} />}
          {section === "color" && <ColorTab items={yearItems} />}
          {section === "schedule" && <ScheduleTab items={yearItems} />}
          {section === "sowing" && <SowingTab items={yearItems} />}
          {section === "cost" && <CostTab items={yearItems} containers={containers} soilMixes={soilMixes} />}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── OVERVIEW ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ items, year }) {
  const [shipFilter, setShipFilter] = useState("all");
  const [plantFilter, setPlantFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState("all");

  const shipWeeks = useMemo(() => [...new Set(items.map(i => i.shipWeek).filter(Boolean))].sort(), [items]);
  const plantWeeks = useMemo(() => [...new Set(items.map(i => i.plantWeek).filter(Boolean))].sort(), [items]);
  const timings = useMemo(() => [...new Set(items.map(i => i.timing).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (shipFilter !== "all") r = r.filter(i => i.shipWeek === shipFilter);
    if (plantFilter !== "all") r = r.filter(i => i.plantWeek === plantFilter);
    if (timingFilter !== "all") r = r.filter(i => i.timing === timingFilter);
    return r;
  }, [items, shipFilter, plantFilter, timingFilter]);

  const stats = useMemo(() => {
    // qty = items being produced (finished pots), ord_qty = liners needed
    const itemsProducing = filtered.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
    const linersNeeded = filtered.reduce((s, i) => s + (parseFloat(i.ordQty) || 0), 0);
    const totalCost = filtered.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0);
    const varieties = new Set(filtered.map(i => i.variety)).size;
    const locations = new Set(filtered.map(i => i.location).filter(Boolean)).size;

    const byCategory = {};
    filtered.forEach(i => {
      const c = i.category || "Other";
      if (!byCategory[c]) byCategory[c] = { name: c, qty: 0, cost: 0 };
      byCategory[c].qty += parseFloat(i.qty) || 0;
      byCategory[c].cost += parseFloat(i.cost) || 0;
    });
    const cats = Object.values(byCategory).sort((a, b) => b.qty - a.qty);

    const byBreeder = {};
    filtered.forEach(i => {
      const b = i.breeder || "Unknown";
      if (!byBreeder[b]) byBreeder[b] = { name: b, qty: 0, cost: 0 };
      byBreeder[b].qty += parseFloat(i.qty) || 0;
      byBreeder[b].cost += parseFloat(i.cost) || 0;
    });
    const breeders = Object.values(byBreeder).sort((a, b) => b.qty - a.qty);

    return { itemsProducing, linersNeeded, totalCost, varieties, locations, cats, breeders };
  }, [filtered]);

  const KPI = ({ label, value, color, sub }) => (
    <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#1e2d1a", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* Filter chips */}
      <div style={{ ...card, padding: "12px 18px" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Ship Week:</span>
          <button onClick={() => setShipFilter("all")}
            style={chipStyle(shipFilter === "all", "#c8791a")}>All</button>
          {shipWeeks.map(w => (
            <button key={w} onClick={() => setShipFilter(w)}
              style={chipStyle(shipFilter === w, "#c8791a")}>{w}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Plant Week:</span>
          <button onClick={() => setPlantFilter("all")}
            style={chipStyle(plantFilter === "all", "#4a90d9")}>All</button>
          {plantWeeks.map(w => (
            <button key={w} onClick={() => setPlantFilter(w)}
              style={chipStyle(plantFilter === w, "#4a90d9")}>{w}</button>
          ))}
        </div>
        {timings.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Response Time:</span>
            <button onClick={() => setTimingFilter("all")}
              style={chipStyle(timingFilter === "all", "#7fb069")}>All</button>
            {timings.map(t => (
              <button key={t} onClick={() => setTimingFilter(t)}
                style={chipStyle(timingFilter === t, "#7fb069")}>{t}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KPI label="Items Producing" value={fmtN(stats.itemsProducing)} color="#7fb069" sub="finished pots" />
        <KPI label="Liners Needed" value={fmtN(stats.linersNeeded)} color="#4a90d9" />
        <KPI label="Liner Cost" value={fmt$(stats.totalCost)} color="#4a7a35" />
        <KPI label="Varieties" value={stats.varieties} color="#8e44ad" />
        <KPI label="Locations" value={stats.locations} color="#c8791a" />
        <KPI label="Rows" value={filtered.length} color="#1e2d1a" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>By Category</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.cats} layout="vertical" margin={{ left: 140, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={140} />
              <Tooltip formatter={v => fmtN(v)} />
              <Bar dataKey="qty" name="Items" fill="#7fb069" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>By Breeder</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.breeders} layout="vertical" margin={{ left: 100, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={100} />
              <Tooltip formatter={v => fmtN(v)} />
              <Bar dataKey="qty" name="Items" fill="#4a90d9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function chipStyle(active, color) {
  return {
    padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: active ? 800 : 600,
    background: active ? color : "#fff",
    color: active ? "#fff" : "#7a8c74",
    border: `1.5px solid ${active ? color : "#c8d8c0"}`,
    cursor: "pointer", fontFamily: "inherit",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COLOR MIX ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ColorTab({ items }) {
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);

  const filteredItems = useMemo(() =>
    categoryFilter === "all" ? items : items.filter(i => i.category === categoryFilter)
  , [items, categoryFilter]);

  const colorStats = useMemo(() => {
    const byColor = {};
    filteredItems.forEach(i => {
      const c = i.color || "UNKNOWN";
      if (!byColor[c]) byColor[c] = { name: c, qty: 0, varieties: new Set(), cost: 0 };
      byColor[c].qty += parseFloat(i.qty) || 0;
      byColor[c].cost += parseFloat(i.cost) || 0;
      byColor[c].varieties.add(i.variety);
    });
    return Object.values(byColor)
      .map(c => ({ ...c, varietyCount: c.varieties.size }))
      .sort((a, b) => b.qty - a.qty);
  }, [filteredItems]);

  const totalQty = colorStats.reduce((s, c) => s + c.qty, 0);

  return (
    <div>
      <div style={{ ...card, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "12px 18px" }}>
        <button onClick={() => setCategoryFilter("all")}
          style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: categoryFilter === "all" ? 800 : 600,
            background: categoryFilter === "all" ? "#1e2d1a" : "#fff",
            color: categoryFilter === "all" ? "#c8e6b8" : "#7a8c74",
            border: `1.5px solid ${categoryFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
            cursor: "pointer", fontFamily: "inherit" }}>
          All Items
        </button>
        {categories.map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: categoryFilter === c ? 800 : 600,
              background: categoryFilter === c ? "#1e2d1a" : "#fff",
              color: categoryFilter === c ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${categoryFilter === c ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>
            {c}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>
          Color Distribution by Liner Count {categoryFilter !== "all" && <span style={{ color: "#7a8c74", fontWeight: 600 }}>— {categoryFilter}</span>}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={colorStats} margin={{ left: 10, right: 10, top: 10 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} />
            <YAxis tickFormatter={v => fmtN(v)} tick={{ fontSize: 10, fill: "#7a8c74" }} />
            <Tooltip formatter={v => fmtN(v)} />
            <Bar dataKey="qty" name="Liners" radius={[6, 6, 0, 0]}>
              {colorStats.map((c, i) => <Cell key={i} fill={COLOR_PALETTE[c.name] || "#7a8c74"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Color Breakdown</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Color</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Liners</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>% of Crop</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Varieties</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {colorStats.map(c => (
              <tr key={c.name} style={{ borderBottom: "1px solid #f0f5ee" }}>
                <td style={{ padding: "10px", fontWeight: 700, color: "#1e2d1a", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: COLOR_PALETTE[c.name] || "#7a8c74", border: "1px solid #e0ead8" }}></span>
                  {c.name}
                </td>
                <td style={{ padding: "10px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtN(c.qty)}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#7a8c74" }}>{((c.qty / totalQty) * 100).toFixed(1)}%</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#7a8c74" }}>{c.varietyCount}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#4a7a35", fontWeight: 600 }}>{fmt$(c.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SCHEDULE (by ship week) ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ScheduleTab({ items }) {
  const byWeek = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const w = i.shipWeek || "Unknown";
      if (!map[w]) map[w] = { name: w, qty: 0, cost: 0, lines: 0, locations: new Set() };
      map[w].qty += parseFloat(i.qty) || 0;
      map[w].cost += parseFloat(i.cost) || 0;
      map[w].lines++;
      if (i.location) map[w].locations.add(i.location);
    });
    return Object.values(map)
      .map(w => ({ ...w, locationCount: w.locations.size }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Liners Arriving by Ship Week</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byWeek} margin={{ left: 10, right: 10 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#7a8c74" }} angle={-30} textAnchor="end" height={70} />
            <YAxis tickFormatter={v => fmtN(v)} tick={{ fontSize: 10, fill: "#7a8c74" }} />
            <Tooltip formatter={v => fmtN(v)} />
            <Bar dataKey="qty" name="Liners" fill="#c8791a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Ship Week</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Liners</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Lines</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Locations</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "2px solid #e0ead8" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {byWeek.map(w => (
              <tr key={w.name} style={{ borderBottom: "1px solid #f0f5ee" }}>
                <td style={{ padding: "10px", fontWeight: 700, color: "#1e2d1a" }}>{w.name}</td>
                <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtN(w.qty)}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#7a8c74" }}>{w.lines}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#7a8c74" }}>{w.locationCount}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "#4a7a35", fontWeight: 600 }}>{fmt$(w.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ITEMS LIST (consolidated by variety with drill-down) ────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ItemsTab({ items, soilMixes, containers, upsert }) {
  const [searchQ, setSearchQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilters, setColorFilters] = useState([]); // multi-select
  const [weekFilter, setWeekFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | confirmed | unconfirmed
  const [timingFilter, setTimingFilter] = useState("all");
  const [expandedKey, setExpandedKey] = useState(null);

  function toggleColor(c) {
    setColorFilters(curr => curr.includes(c) ? curr.filter(x => x !== c) : [...curr, c]);
  }

  // Build a "display category" that breaks 8" Annual / 10" Premium Annual into genus subcategories
  // since those have multiple plant families. Mums/Asters stay grouped.
  function displayCategoryFor(item) {
    if (!item.category) return null;
    const SPLIT_BY_GENUS = ['8" ANNUAL', '10" PREMIUM ANNUAL'];
    if (SPLIT_BY_GENUS.includes(item.category) && item.genus) {
      const g = item.genus.charAt(0) + item.genus.slice(1).toLowerCase();
      return `${item.category} — ${g}`;
    }
    return item.category;
  }
  const itemsWithDisplay = useMemo(() => items.map(i => ({ ...i, displayCategory: displayCategoryFor(i) })), [items]);
  const categories = useMemo(() => [...new Set(itemsWithDisplay.map(i => i.displayCategory).filter(Boolean))].sort(), [itemsWithDisplay]);
  const colors = useMemo(() => [...new Set(items.map(i => i.color).filter(Boolean))].sort(), [items]);
  const weeks = useMemo(() => [...new Set(items.map(i => i.shipWeek).filter(Boolean))].sort(), [items]);
  const timings = useMemo(() => [...new Set(items.map(i => i.timing).filter(Boolean))].sort(), [items]);

  // Filter raw items first
  const filtered = useMemo(() => {
    let result = itemsWithDisplay;
    if (categoryFilter !== "all") result = result.filter(i => i.displayCategory === categoryFilter);
    if (colorFilters.length > 0) result = result.filter(i => colorFilters.includes(i.color));
    if (weekFilter !== "all") result = result.filter(i => i.shipWeek === weekFilter);
    if (statusFilter === "confirmed") result = result.filter(i => i.orderNumber);
    if (statusFilter === "unconfirmed") result = result.filter(i => !i.orderNumber);
    if (timingFilter !== "all") result = result.filter(i => i.timing === timingFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(i =>
        (i.variety || "").toLowerCase().includes(q) ||
        (i.location || "").toLowerCase().includes(q) ||
        (i.breeder || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [itemsWithDisplay, categoryFilter, colorFilters, weekFilter, statusFilter, timingFilter, searchQ]);

  // Consolidate by category + variety + plant week, with tricolor detection
  const consolidated = useMemo(() => {
    // First pass: identify tricolor groups — ONLY for 12" mums
    // (3+ varieties sharing the same row + plant_week within 12" mum category)
    const rowGroups = {};
    filtered.forEach(i => {
      if (!i.rowId) return;
      if (!(i.category || "").includes('12"')) return; // tricolor only for 12" mums
      const k = `${i.rowId}||${i.category || ""}||${i.plantWeek || ""}`;
      if (!rowGroups[k]) rowGroups[k] = new Set();
      rowGroups[k].add(i.variety);
    });
    const tricolorRows = new Set(
      Object.entries(rowGroups).filter(([_, varieties]) => varieties.size >= 3).map(([k]) => k)
    );

    // Helper: find common prefix across variety names (e.g. "BRACTEANTHA SUNBRERO ORANGE/RED/YELLOW" -> "BRACTEANTHA SUNBRERO")
    function commonPrefix(varieties) {
      if (varieties.length < 2) return varieties[0] || "";
      const words = varieties.map(v => (v || "").split(" "));
      const minLen = Math.min(...words.map(w => w.length));
      const prefix = [];
      for (let i = 0; i < minLen; i++) {
        const w = words[0][i];
        if (words.every(ws => ws[i] === w)) prefix.push(w);
        else break;
      }
      return prefix.join(" ");
    }

    const map = {};
    filtered.forEach(i => {
      const rowKey = i.rowId ? `${i.rowId}||${i.category || ""}||${i.plantWeek || ""}` : null;
      const isTricolor = rowKey && tricolorRows.has(rowKey);

      // Tricolor items group by row instead of variety
      const key = isTricolor
        ? `TRI||${i.displayCategory || i.category || ""}||${i.rowId || ""}||${i.plantWeek || ""}`
        : `${i.displayCategory || i.category || ""}||${i.variety || ""}||${i.plantWeek || ""}`;

      if (!map[key]) {
        map[key] = {
          key,
          category: i.displayCategory || i.category,
          variety: i.variety,
          color: isTricolor ? "TRICOLOR" : i.color,
          breeder: i.breeder,
          timing: i.timing,
          status: i.status,
          vigor: i.vigor,
          flowerWeek: i.flowerWeek,
          plantWeek: i.plantWeek,
          isTricolor,
          tricolorVarieties: isTricolor ? new Set() : null,
          totalQty: 0,
          totalCost: 0,
          locations: [],
          shipWeeks: new Set(),
          confirmed: 0,
          unconfirmed: 0,
        };
      }
      if (isTricolor) map[key].tricolorVarieties.add(i.variety);
      map[key].totalQty += parseFloat(i.qty) || 0;
      map[key].totalCost += parseFloat(i.cost) || 0;
      map[key].locations.push(i);
      if (i.shipWeek) map[key].shipWeeks.add(i.shipWeek);
      if (i.orderNumber) map[key].confirmed++;
      else map[key].unconfirmed++;
    });

    // Re-name tricolor items with common prefix
    Object.values(map).forEach(c => {
      if (c.isTricolor && c.tricolorVarieties) {
        const list = [...c.tricolorVarieties];
        const prefix = commonPrefix(list);
        c.variety = prefix ? `${prefix} (Tricolor)` : `Mix: ${list.slice(0, 3).join(" / ")}`;
      }
    });

    // Assign group numbers per variety based on plant week order (earliest = 1)
    const all = Object.values(map);
    const byVariety = {};
    all.forEach(c => {
      const k = `${c.category || ""}||${c.variety || ""}`;
      if (!byVariety[k]) byVariety[k] = [];
      byVariety[k].push(c);
    });
    Object.values(byVariety).forEach(group => {
      // Sort by plant week ascending, assign group #
      group.sort((a, b) => (a.plantWeek || "").localeCompare(b.plantWeek || ""));
      if (group.length > 1) {
        group.forEach((c, i) => { c.groupNum = i + 1; c.totalGroups = group.length; });
      }
    });

    return all.sort((a, b) => b.totalQty - a.totalQty);
  }, [filtered]);

  const totals = useMemo(() => ({
    qty: consolidated.reduce((s, c) => s + c.totalQty, 0),
    cost: consolidated.reduce((s, c) => s + c.totalCost, 0),
    unconfirmedLines: filtered.filter(i => !i.orderNumber).length,
  }), [consolidated, filtered]);

  return (
    <div>
      {/* Filter section with chips */}
      <div style={{ ...card, padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search variety, location, breeder..."
            style={{ ...IS(!!searchQ), maxWidth: 280, fontSize: 14 }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...IS(false), width: "auto", fontSize: 13 }}>
            <option value="all">All Status</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="unconfirmed">Unconfirmed Only</option>
          </select>
          <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
            style={{ ...IS(false), width: "auto", fontSize: 13 }}>
            <option value="all">All Ship Weeks</option>
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#7a8c74", display: "flex", gap: 16 }}>
            <span><strong>{consolidated.length}</strong> varieties</span>
            <span><strong>{fmtN(totals.qty)}</strong> liners</span>
            <span style={{ color: "#4a7a35" }}><strong>{fmt$(totals.cost)}</strong></span>
            {totals.unconfirmedLines > 0 && <span style={{ color: "#d94f3d", fontWeight: 700 }}>⚠ {totals.unconfirmedLines} unconfirmed</span>}
          </div>
        </div>

        {/* Item type chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6, alignSelf: "center" }}>Item:</span>
          <button onClick={() => setCategoryFilter("all")}
            style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: categoryFilter === "all" ? 800 : 600,
              background: categoryFilter === "all" ? "#1e2d1a" : "#fff",
              color: categoryFilter === "all" ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${categoryFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: categoryFilter === c ? 800 : 600,
                background: categoryFilter === c ? "#1e2d1a" : "#fff",
                color: categoryFilter === c ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${categoryFilter === c ? "#1e2d1a" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
          ))}
        </div>

        {/* Color chips - multi-select */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6, alignSelf: "center" }}>Color:</span>
          {colors.map(c => {
            const active = colorFilters.includes(c);
            const cc = COLOR_PALETTE[c] || "#7a8c74";
            return (
              <button key={c} onClick={() => toggleColor(c)}
                style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: active ? 800 : 600,
                  background: active ? cc + "20" : "#fff",
                  color: active ? cc : "#7a8c74",
                  border: `1.5px solid ${active ? cc : "#c8d8c0"}`,
                  cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: cc, border: "1px solid #00000022" }}></span>
                {c}
              </button>
            );
          })}
          {colorFilters.length > 0 && (
            <button onClick={() => setColorFilters([])}
              style={{ padding: "4px 10px", borderRadius: 16, fontSize: 11, fontWeight: 600, background: "none", color: "#7a8c74", border: "1.5px solid #e0ead8", cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
          )}
        </div>

        {/* Timing/response time chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6, alignSelf: "center" }}>Response Time:</span>
          <button onClick={() => setTimingFilter("all")}
            style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: timingFilter === "all" ? 800 : 600,
              background: timingFilter === "all" ? "#1e2d1a" : "#fff",
              color: timingFilter === "all" ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${timingFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>All</button>
          {timings.map(t => (
            <button key={t} onClick={() => setTimingFilter(t)}
              style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: timingFilter === t ? 800 : 600,
                background: timingFilter === t ? "#1e2d1a" : "#fff",
                color: timingFilter === t ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${timingFilter === t ? "#1e2d1a" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 90px 100px 100px 1.4fr 90px 90px 100px", padding: "12px 16px", background: "#fafcf8", borderBottom: "2px solid #e0ead8", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>
          <div></div>
          <div>Variety</div>
          <div>Color</div>
          <div>Ship Week</div>
          <div>Plant Week</div>
          <div>Locations</div>
          <div style={{ textAlign: "right" }}>Qty</div>
          <div style={{ textAlign: "right" }}>Cost</div>
          <div style={{ textAlign: "center" }}>Status</div>
        </div>
        {consolidated.map((c, idx) => {
          const isOpen = expandedKey === c.key;
          const allConfirmed = c.unconfirmed === 0;
          const noneConfirmed = c.confirmed === 0;
          return (
            <div key={c.key}>
              <div onClick={() => setExpandedKey(isOpen ? null : c.key)}
                style={{ display: "grid", gridTemplateColumns: "30px 1fr 90px 100px 100px 1.4fr 90px 90px 100px", padding: "10px 16px", borderBottom: "1px solid #f0f5ee", cursor: "pointer", alignItems: "center", background: idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <div style={{ color: "#7a8c74", fontSize: 14 }}>{isOpen ? "▼" : "▶"}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a" }}>
                    {c.variety}
                    {c.groupNum && (
                      <span style={{ marginLeft: 8, background: "#f0f8eb", color: "#4a7a35", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>
                        Group {c.groupNum}
                      </span>
                    )}
                    {(() => {
                      const propBadge = PROP_BADGE[c.locations[0]?.propMethod];
                      return propBadge ? (
                        <span style={{ marginLeft: 6, background: propBadge.bg, color: propBadge.color, borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 700 }}>{propBadge.label}</span>
                      ) : null;
                    })()}
                  </div>
                  <div style={{ fontSize: 10, color: "#aabba0" }}>{c.category} • {c.breeder}</div>
                </div>
                <div style={{ fontSize: 11 }}>
                  {c.color && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_PALETTE[c.color] || "#7a8c74" }}></span>
                      <span style={{ color: "#1e2d1a" }}>{c.color}</span>
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#c8791a", fontWeight: 700 }}>{[...c.shipWeeks].sort().join(", ")}</div>
                <div style={{ fontSize: 10, color: "#4a90d9", fontWeight: 700 }}>{c.plantWeek || ""}</div>
                <div style={{ fontSize: 10, color: "#7a8c74", lineHeight: 1.4 }}>
                  {[...new Set(c.locations.map(l => l.location).filter(Boolean))].slice(0, 4).join(", ")}
                  {[...new Set(c.locations.map(l => l.location).filter(Boolean))].length > 4 && ` +${[...new Set(c.locations.map(l => l.location).filter(Boolean))].length - 4} more`}
                  <span style={{ color: "#aabba0", marginLeft: 4 }}>({c.locations.length} rows)</span>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtN(c.totalQty)}</div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#4a7a35", fontWeight: 600 }}>{c.totalCost > 0 ? fmt$(c.totalCost) : "—"}</div>
                <div style={{ textAlign: "center", fontSize: 10 }}>
                  {allConfirmed ? <span style={{ background: "#e8f5e0", color: "#4a7a35", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>✓ All</span>
                    : noneConfirmed ? <span style={{ background: "#fde8e8", color: "#d94f3d", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>⚠ None</span>
                    : <span style={{ background: "#fff4e8", color: "#c8791a", borderRadius: 10, padding: "2px 8px", fontWeight: 700 }}>{c.confirmed}/{c.locations.length}</span>}
                </div>
              </div>

              {/* Drill-down rows */}
              {isOpen && (
                <div style={{ background: "#fafcf8", padding: "10px 16px 14px 56px", borderBottom: "1px solid #e0ead8" }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 10, padding: "6px 10px", background: "#fff", borderRadius: 8, fontSize: 11 }}>
                    <div><span style={{ color: "#aabba0" }}>Vigor:</span> <strong style={{ color: "#1e2d1a" }}>{c.vigor || "—"}</strong></div>
                    <div><span style={{ color: "#aabba0" }}>Flower Wk:</span> <strong style={{ color: "#1e2d1a" }}>{c.flowerWeek || "—"}</strong></div>
                    <div><span style={{ color: "#aabba0" }}>Breeder:</span> <strong style={{ color: "#1e2d1a" }}>{c.breeder || "—"}</strong></div>
                  </div>
                  {c.locations.map(loc => (
                    <div key={loc.id} style={{ display: "grid", gridTemplateColumns: "150px 60px 90px 100px 100px 1fr 90px 90px", padding: "6px 0", borderBottom: "1px solid #f0f5ee", alignItems: "center", fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color: "#1e2d1a" }}>{loc.location}</div>
                      <div style={{ color: "#7a8c74" }}>{loc.rowId}</div>
                      <div style={{ color: "#7a8c74" }}>{loc.direction}</div>
                      <div style={{ color: "#c8791a", fontWeight: 700 }}>Ship: {loc.shipWeek}</div>
                      <div style={{ color: "#7a8c74" }}>Plant: {loc.plantWeek}</div>
                      <div style={{ color: loc.orderNumber ? "#4a7a35" : "#d94f3d", fontWeight: 700 }}>
                        {loc.orderNumber ? `Order #${loc.orderNumber}` : "⚠ Not confirmed"}
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtN(loc.qty)}</div>
                      <div style={{ textAlign: "right", color: "#4a7a35" }}>{loc.cost > 0 ? fmt$(loc.cost) : "—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {consolidated.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#7a8c74" }}>No items match these filters</div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SOWING & PROP TAB ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function SowingTab({ items }) {
  // Filter to only items that are seed-sown or need prop
  const seedItems = useMemo(() => items.filter(isSeedSow), [items]);

  // Group by sow week
  const bySowWeek = useMemo(() => {
    const map = {};
    seedItems.forEach(i => {
      const sowWk = computeSowWeek(i) || "Unknown";
      if (!map[sowWk]) map[sowWk] = [];
      map[sowWk].push(i);
    });
    return Object.entries(map).sort(([a], [b]) => {
      const na = parseInt((a.match(/\d+/) || [0])[0]) || 999;
      const nb = parseInt((b.match(/\d+/) || [0])[0]) || 999;
      return na - nb;
    });
  }, [seedItems]);

  const totalSeed = seedItems.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);

  return (
    <div>
      <div style={{ background: "#fff4e8", border: "1.5px solid #e8d0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#6a4a20" }}>
        🌱 This tab shows items that need to be sown from seed or propagated from cuttings before planting.
        "SOW X WKS BEFORE" entries are auto-calculated based on the plant week.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Sowing/Prop Items</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#7fb069", marginTop: 4 }}>{seedItems.length}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Total Quantity</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#4a90d9", marginTop: 4 }}>{fmtN(totalSeed)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Sow Weeks</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#c8791a", marginTop: 4 }}>{bySowWeek.length}</div>
        </div>
      </div>

      {seedItems.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>No seed-sown or prop items in this year</div>
        </div>
      ) : (
        bySowWeek.map(([sowWeek, sowItems]) => {
          const wkQty = sowItems.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
          return (
            <div key={sowWeek} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>{sowWeek}</span>
                  <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 10 }}>{sowItems.length} items / {fmtN(wkQty)} qty</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "#fafcf8", borderBottom: "1px solid #e0ead8" }}>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Variety</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Category</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Original</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Plant Wk</th>
                      <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Location</th>
                      <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sowItems.map((i, idx) => (
                      <tr key={i.id} style={{ borderBottom: "1px solid #f0f5ee", background: idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                        <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{i.variety}</td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "#7a8c74" }}>{i.category}</td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "#aabba0", fontStyle: "italic" }}>{i.shipWeek}</td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "#4a90d9", fontWeight: 700 }}>{i.plantWeek}</td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "#7a8c74" }}>{i.location}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtN(i.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COST ESTIMATE TAB ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function CostTab({ items, containers, soilMixes }) {
  const defaultSoil = pickDefaultSoil(soilMixes);
  const soilCpf = soilCostPerCuFt(defaultSoil);

  // Compute per-row cost: liner + soil + pot
  const costRows = useMemo(() => {
    const map = {};
    items.forEach(i => {
      const key = `${i.category || "Other"}`;
      const container = pickContainerForCategory(i.category, containers);
      const potCost = container ? parseFloat(container.costPerUnit) || 0 : 0;
      const potCuFt = container ? volumeToCuFt(container.volumeVal, container.volumeUnit) : 0;
      const soilCostPerPot = potCuFt * soilCpf;
      const linerCostPerPot = (parseFloat(i.qty) || 0) > 0 ? (parseFloat(i.cost) || 0) / parseFloat(i.qty) : 0;

      if (!map[key]) {
        map[key] = {
          category: i.category,
          container,
          potCost,
          potCuFt,
          soilCostPerPot,
          linerCostPerPot: 0,
          totalQty: 0,
          totalLinerCost: 0,
          rows: 0,
        };
      }
      const e = map[key];
      e.totalQty += parseFloat(i.qty) || 0;
      e.totalLinerCost += parseFloat(i.cost) || 0;
      e.rows++;
    });
    // Compute averages
    Object.values(map).forEach(e => {
      e.linerCostPerPot = e.totalQty > 0 ? e.totalLinerCost / e.totalQty : 0;
      e.totalCostPerPot = e.linerCostPerPot + e.soilCostPerPot + e.potCost;
      e.totalProductionCost = e.totalCostPerPot * e.totalQty;
      e.totalSoilCost = e.soilCostPerPot * e.totalQty;
      e.totalPotCost = e.potCost * e.totalQty;
    });
    return Object.values(map).sort((a, b) => b.totalProductionCost - a.totalProductionCost);
  }, [items, containers, soilCpf]);

  const grand = useMemo(() => ({
    qty: costRows.reduce((s, r) => s + r.totalQty, 0),
    liner: costRows.reduce((s, r) => s + r.totalLinerCost, 0),
    soil: costRows.reduce((s, r) => s + r.totalSoilCost, 0),
    pot: costRows.reduce((s, r) => s + r.totalPotCost, 0),
    total: costRows.reduce((s, r) => s + r.totalProductionCost, 0),
  }), [costRows]);

  const KPI = ({ label, value, color, sub }) => (
    <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || "#1e2d1a", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ background: "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#2e5c1e" }}>
        Soil cost based on <strong>{defaultSoil?.name || "BM5HP Compressed (not found)"}</strong>
        {defaultSoil && ` — $${soilCpf.toFixed(2)}/cu ft (fluffed ${defaultSoil.fluffedVolume} cu ft per ${defaultSoil.bagSize} ${defaultSoil.bagUnit} bag at $${defaultSoil.costPerBag})`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KPI label="Total Items" value={fmtN(grand.qty)} color="#7fb069" sub="finished pots" />
        <KPI label="Liner Cost" value={fmt$(grand.liner)} color="#4a90d9" />
        <KPI label="Soil Cost" value={fmt$(grand.soil)} color="#8e44ad" />
        <KPI label="Pot Cost" value={fmt$(grand.pot)} color="#c8791a" />
        <KPI label="Total Production Cost" value={fmt$(grand.total)} color="#4a7a35" />
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Category</th>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Container</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Pot $/ea</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Soil cu ft</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Soil $/ea</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Liner $/ea</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Cost / pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Qty</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {costRows.map((r, idx) => (
              <tr key={r.category} style={{ borderBottom: "1px solid #f0f5ee", background: idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ padding: "10px", fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{r.category}</td>
                <td style={{ padding: "10px", fontSize: 11, color: r.container ? "#7a8c74" : "#d94f3d" }}>
                  {r.container ? r.container.name : "⚠ No container assigned"}
                </td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 12, color: "#c8791a", fontVariantNumeric: "tabular-nums" }}>{r.potCost > 0 ? fmt$2(r.potCost) : "—"}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 12, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{r.potCuFt > 0 ? r.potCuFt.toFixed(3) : "—"}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 12, color: "#8e44ad", fontVariantNumeric: "tabular-nums" }}>{r.soilCostPerPot > 0 ? fmt$2(r.soilCostPerPot) : "—"}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 12, color: "#4a90d9", fontVariantNumeric: "tabular-nums" }}>{r.linerCostPerPot > 0 ? fmt$2(r.linerCostPerPot) : "—"}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 13, color: "#4a7a35", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{r.totalCostPerPot > 0 ? fmt$2(r.totalCostPerPot) : "—"}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtN(r.totalQty)}</td>
                <td style={{ padding: "10px", textAlign: "right", fontSize: 13, color: "#1e2d1a", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt$(r.totalProductionCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const fmt$2 = (n) => "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
