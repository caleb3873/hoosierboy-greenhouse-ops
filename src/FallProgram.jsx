import React, { useState, useMemo, useEffect, useRef } from "react";
import { useFallProgramItems, useSoilMixes, useContainers, useProgramInputs, useInputProducts, useCategoryPricing, useManagerTasks, getSupabase } from "./supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

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
  { id: "orders", label: "Orders" },
  { id: "inputs", label: "Inputs" },
  { id: "cost", label: "Cost Estimate" },
  { id: "pricing", label: "Pricing" },
  { id: "shortfalls", label: "Shortfalls" },
];

// Approximate soil volume per pot by category (cu ft)
// Used to allocate per-pot overhead costs (fertilizer, soil, labor) proportionally
// Normalize categories for pricing/cost rollup — mum baskets (acorn, indian, regular)
// all have same pot, plant count, and costs — just different color mixes
function normalizeCategoryForPricing(cat) {
  if (!cat) return cat;
  const c = cat.toUpperCase();
  if (c.includes("MUM") && (c.includes("BASKET") || c.includes("BSKT"))) return "MUM BASKET";
  return cat;
}

const POT_CU_FT = {
  '4.5" PRODUCTION': 0.047,
  '8" ANNUAL': 0.067,
  '09" ASTERS': 0.100,
  '09" KALE': 0.100,
  '09" MUM': 0.100,
  '10" PREMIUM ANNUAL': 0.134,
  '12" HB': 0.200,
  '12" MUM': 0.200,
  '14" MUM W/ GRASS': 0.267,
  'MUM BASKET': 0.167,
  'MUM BSKT ACORN': 0.167,
  'MUM BSKT INDIAN': 0.167,
  '1801 COMBO': 0.016, // per cell: ~0.47 qt = 0.016 cu ft
};
// Mix definitions: product name → component varieties for sowing/sticking
const MIX_DEFS = {
  "CELOSIA KIMONO MIX": [
    { name: "CELOSIA KIMONO ORANGE", perPot: 1 },
    { name: "CELOSIA KIMONO SALMON PINK", perPot: 1 },
    { name: "CELOSIA KIMONO YELLOW", perPot: 1 },
  ],
  "SUPERCAL PREMIUM BONFIRE MIX": [
    { name: "SUPERCAL CARAMEL YELLOW", perPot: 2 },
    { name: "SUPERCAL CINNAMON", perPot: 2 },
    { name: "SUPERCAL PREMIUM FRENCH VANILLA", perPot: 2 },
  ],
  "SUPERCAL PREMIUM CITRUS MIX": [
    { name: "SUPERCAL PEARL WHITE", perPot: 2 },
    { name: "SUPERCAL SUNSET ORANGE", perPot: 2 },
    { name: "SUPERCAL YELLOW SUN", perPot: 2 },
  ],
  "SUPERCAL GUMBALL MIX": [
    { name: "SUPERCAL PINK MIST", perPot: 2 },
    { name: "SUPERCAL ROSE STAR", perPot: 2 },
    { name: "SUPERCAL YELLOW SUN", perPot: 2 },
  ],
};

function potCuFtFor(item) {
  const key = item.category || item.displayCategory || "";
  // Exact match first
  if (POT_CU_FT[key]) return POT_CU_FT[key];
  // Fallback by substring
  if (key.includes("14\"")) return 0.267;
  if (key.includes("12\"")) return 0.200;
  if (key.includes("10\"")) return 0.134;
  if (key.includes("9\"") || key.includes("09\"")) return 0.100;
  if (key.includes("8\"")) return 0.067;
  if (key.includes("4.5")) return 0.047;
  if (key.toUpperCase().includes("BASKET")) return 0.167;
  return 0.1; // default
}

// Volume conversion to cu ft
function volumeToCuFt(val, unit) {
  if (!val) return 0;
  const v = Number(val);
  if (unit === "cu ft") return v;
  if (unit === "gal")   return v * 0.134;
  if (unit === "qt")    return v * 0.0334;
  if (unit === "pt")    return v * 0.0167;
  if (unit === "L")     return v * 0.0353;
  if (unit === "ml")    return v * 0.0000353;
  return 0;
}

// Map category to a container (which pot to use for which item type)
function pickContainerForCategory(category, containers) {
  if (!category) return null;
  const c = category.toUpperCase();
  // All 9" items (Mum, Aster, Kale) use the same 9" pot
  if (c.includes('9"') || c.includes("09\"")) return containers.find(x => x.sku === "XAM09001");
  if (c.includes('12"') && c.includes('HB'))   return containers.find(x => x.sku === "SHB1200 ATH");
  if (c.includes('12"') && c.includes('MUM'))  return containers.find(x => x.sku === "SPP 1300");
  if (c.includes('14"'))                       return containers.find(x => x.sku === "SPP 1400");
  if (c.includes('10"') || c.includes("PREMIUM ANNUAL")) return containers.find(x => x.sku === "SPP 1000");
  if (c.includes('8"') && c.includes("ANNUAL")) return containers.find(x => x.sku === "SHB 900");
  // 4.5" PRODUCTION → 4.5 Azalea Pot with Schlegel logo
  if (c.includes("4.5"))                       return containers.find(x => x.sku === "SP 450" && (x.name || "").toLowerCase().includes("schlegel logo"));
  // 1801 COMBO → 1801 Landscape Tray
  if (c.includes("1801"))                      return containers.find(x => x.sku === "1801-LAND");
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

  // For seed/URC items with a plain "WEEK XX" ship_week, that IS the sow week
  if (isSeedSow(item) && sw.match(/^WEEK\s+\d+$/)) {
    return sw;
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
  const { rows: items, upsert, update: updateItem, remove } = useFallProgramItems();
  const { rows: soilMixes } = useSoilMixes();
  const { rows: containers } = useContainers();
  const { rows: programInputs, insert: insertProgramInput, update: updateProgramInput, remove: removeProgramInput } = useProgramInputs();
  const { rows: inputsLibrary } = useInputProducts();
  const { rows: managerTasks, upsert: upsertTask } = useManagerTasks();

  const allYears = useMemo(() => {
    const ys = [...new Set(items.map(i => i.year).filter(Boolean))].sort((a, b) => b - a);
    if (!ys.includes(new Date().getFullYear())) ys.unshift(new Date().getFullYear());
    return ys;
  }, [items]);

  const [year, setYear] = useState(allYears[0] || new Date().getFullYear());
  const [section, setSectionState] = useState(() => {
    try { return localStorage.getItem("gh_fall_section") || "overview"; } catch { return "overview"; }
  });
  const setSection = (s) => {
    setSectionState(s);
    try { localStorage.setItem("gh_fall_section", s); } catch {}
  };

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
          {section === "overview" && <OverviewTab items={yearItems} year={year} upsert={upsert} />}
          {section === "items" && <ItemsTab items={yearItems} soilMixes={soilMixes} containers={containers} upsert={upsert} updateItem={updateItem} remove={remove} />}
          {section === "color" && <ColorTab items={yearItems} />}
          {section === "schedule" && <ProductionScheduleTab items={yearItems} containers={containers} soilMixes={soilMixes} year={year} upsertTask={upsertTask} managerTasks={managerTasks} />}
          {section === "sowing" && <SowingTab items={yearItems} upsert={upsert} />}
          {section === "orders" && <OrdersTab items={yearItems} />}
          {section === "inputs" && <InputsTab year={year} items={yearItems} programInputs={programInputs.filter(p => p.year === year)} inputsLibrary={inputsLibrary} insertProgramInput={insertProgramInput} updateProgramInput={updateProgramInput} removeProgramInput={removeProgramInput} />}
          {section === "cost" && <CostTab items={yearItems} containers={containers} soilMixes={soilMixes} programInputs={programInputs.filter(p => p.year === year)} />}
          {section === "pricing" && <PricingTab year={year} items={yearItems} containers={containers} soilMixes={soilMixes} programInputs={programInputs.filter(p => p.year === year)} />}
          {section === "shortfalls" && <ShortfallsTab items={yearItems} />}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── OVERVIEW ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ items, year, upsert }) {
  const [shipFilter, setShipFilter] = useState("all");
  const [plantFilter, setPlantFilter] = useState("all");
  const [timingFilter, setTimingFilter] = useState("all");

  const shipWeeks = useMemo(() => [...new Set(items.map(i => i.shipWeek).filter(Boolean))].sort(), [items]);
  const plantWeeks = useMemo(() => [...new Set(items.map(i => i.plantWeek).filter(Boolean))].sort(), [items]);
  const respWeeks = useMemo(() => [...new Set(items.map(i => i.responseWeek).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)), [items]);

  const filtered = useMemo(() => {
    let r = items;
    if (shipFilter !== "all") r = r.filter(i => i.shipWeek === shipFilter);
    if (plantFilter !== "all") r = r.filter(i => i.plantWeek === plantFilter);
    if (timingFilter !== "all") {
      if (timingFilter === "missing") r = r.filter(i => !i.responseWeek);
      else r = r.filter(i => i.responseWeek === timingFilter);
    }
    return r;
  }, [items, shipFilter, plantFilter, timingFilter]);

  // Missing response week varieties (consolidated)
  const missingRW = useMemo(() => {
    const m = {};
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED" && !i.responseWeek).forEach(i => {
      const key = i.variety || "—";
      if (!m[key]) m[key] = { variety: key, category: i.category, qty: 0 };
      m[key].qty += parseFloat(i.qty) || 0;
    });
    return Object.values(m).sort((a, b) => b.qty - a.qty);
  }, [items]);

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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Response Wk:</span>
          <button onClick={() => setTimingFilter("all")}
            style={chipStyle(timingFilter === "all", "#7fb069")}>All</button>
          {respWeeks.map(w => (
            <button key={w} onClick={() => setTimingFilter(w)}
              style={chipStyle(timingFilter === w, "#7fb069")}>Wk {w}</button>
          ))}
          {missingRW.length > 0 && (
            <button onClick={() => setTimingFilter("missing")}
              style={{ ...chipStyle(timingFilter === "missing", "#d94f3d"), background: timingFilter === "missing" ? "#d94f3d" : "#fff3f1", color: timingFilter === "missing" ? "#fff" : "#d94f3d", border: `1.5px solid ${timingFilter === "missing" ? "#d94f3d" : "#d94f3d66"}` }}>⚠ Missing ({missingRW.length})</button>
          )}
        </div>
      </div>

      {/* Missing response week banner */}
      {missingRW.length > 0 && (
        <div style={{ background: "#fff3f1", border: "1.5px solid #d94f3d", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 12, color: "#1e2d1a" }}>
          <div style={{ fontWeight: 800, color: "#d94f3d", marginBottom: 6 }}>
            ⚠ {missingRW.length} variet{missingRW.length !== 1 ? "ies" : "y"} missing response week (ready date)
          </div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 8 }}>
            These items won't show up on the ready-week schedule until assigned. Add a week number to each:
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missingRW.map(m => (
              <div key={m.variety} style={{ display: "flex", gap: 4, alignItems: "center", background: "#fff", padding: "6px 10px", borderRadius: 8, border: "1px solid #e0ead8" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{m.variety}</span>
                <span style={{ fontSize: 10, color: "#7a8c74" }}>({fmtN(m.qty)})</span>
                <input type="text" placeholder="Wk #" defaultValue=""
                  onBlur={async e => {
                    if (!e.target.value.trim()) return;
                    const matches = items.filter(i => (i.variety || "") === m.variety);
                    for (const loc of matches) {
                      if (upsert) await upsert({ ...loc, responseWeek: e.target.value.trim() });
                    }
                  }}
                  style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 12, fontFamily: "inherit" }} />
              </div>
            ))}
          </div>
        </div>
      )}

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
  const [respWeekFilter, setRespWeekFilter] = useState("all");

  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);
  const respWeeks = useMemo(() => [...new Set(items.map(i => i.responseWeek).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)), [items]);

  const filteredItems = useMemo(() => {
    let r = items;
    if (categoryFilter !== "all") r = r.filter(i => i.category === categoryFilter);
    if (respWeekFilter !== "all") r = r.filter(i => i.responseWeek === respWeekFilter);
    return r;
  }, [items, categoryFilter, respWeekFilter]);

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
      <div style={{ ...card, padding: "12px 18px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5 }}>Product:</span>
          <button onClick={() => setCategoryFilter("all")}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: categoryFilter === "all" ? 800 : 600,
              background: categoryFilter === "all" ? "#1e2d1a" : "#fff",
              color: categoryFilter === "all" ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${categoryFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>
            All
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5 }}>Resp Wk:</span>
          <button onClick={() => setRespWeekFilter("all")}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: respWeekFilter === "all" ? 800 : 600,
              background: respWeekFilter === "all" ? "#1e2d1a" : "#fff",
              color: respWeekFilter === "all" ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${respWeekFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>
            All
          </button>
          {respWeeks.map(rw => {
            const rwQty = items.filter(i => i.responseWeek === rw && (categoryFilter === "all" || i.category === categoryFilter)).reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
            return (
              <button key={rw} onClick={() => setRespWeekFilter(rw)}
                style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: respWeekFilter === rw ? 800 : 600,
                  background: respWeekFilter === rw ? "#1e2d1a" : "#fff",
                  color: respWeekFilter === rw ? "#c8e6b8" : "#7a8c74",
                  border: `1.5px solid ${respWeekFilter === rw ? "#1e2d1a" : "#c8d8c0"}`,
                  cursor: "pointer", fontFamily: "inherit" }}>
                Wk {rw} <span style={{ fontSize: 10, opacity: 0.7 }}>({fmtN(rwQty)})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>
          Color Distribution by Liner Count
          {categoryFilter !== "all" && <span style={{ color: "#7a8c74", fontWeight: 600 }}> — {categoryFilter}</span>}
          {respWeekFilter !== "all" && <span style={{ color: "#c8791a", fontWeight: 600 }}> — Wk {respWeekFilter}</span>}
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
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Color Mix — Pie Chart</div>
        <ResponsiveContainer width="100%" height={350}>
          <PieChart>
            <Pie
              data={colorStats}
              dataKey="qty"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={130}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
              labelLine={{ stroke: "#7a8c74" }}
              style={{ fontSize: 11, fontWeight: 700 }}
            >
              {colorStats.map((c, i) => <Cell key={i} fill={COLOR_PALETTE[c.name] || "#7a8c74"} />)}
            </Pie>
            <Tooltip formatter={v => fmtN(v)} />
          </PieChart>
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
// ── PRODUCTION SCHEDULE ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function weekToDate(weekNum, year = 2026) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7);
  return monday;
}

function parseWeekNum(str) {
  if (!str) return null;
  const m = String(str).match(/WEEK\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

// Deterministic ID from components — simple hash to UUID-like string
function deterministicId(parts) {
  const str = parts.join("|");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `f${hex.slice(0,7)}-${hex.slice(0,4)}-4${hex.slice(1,4)}-a${hex.slice(2,5)}-${hex.padEnd(12, "0").slice(0,12)}`;
}

const TASK_COLORS = {
  prop:     { bg: "#eaf2fb", color: "#4a90d9", label: "Prop/Seed" },
  potfill:  { bg: "#fef5e8", color: "#c8791a", label: "Pot Filling" },
  planting: { bg: "#f0f8eb", color: "#7fb069", label: "Planting" },
  tags:     { bg: "#f5f0ff", color: "#8e44ad", label: "Tags" },
};

function ExpandableTaskRow({ task: t, section }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = (t.rowList && t.rowList.length > 0) || t.destinations;
  const tc = TASK_COLORS[section] || TASK_COLORS.prop;
  return (
    <div style={{
      background: tc.bg, borderRadius: 8, marginBottom: 4,
      borderLeft: `3px solid ${tc.color}`,
    }}>
      <div onClick={() => hasDetail && setExpanded(!expanded)} style={{
        padding: "8px 12px", fontSize: 13, color: "#1e2d1a",
        cursor: hasDetail ? "pointer" : "default",
        display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{t.title}</div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {t.location && <span>📍 {t.location}</span>}
            {t.soilMix && <span>Soil: {t.soilMix}</span>}
            {t.rowCount > 0 && <span>{t.rowCount} row{t.rowCount !== 1 ? "s" : ""}</span>}
            {section === "prop" && t.propTrayCost > 0 && <span>Tray cost: {fmt$(t.propTrayCost)}</span>}
          </div>
          {section === "prop" && t.destinations && (
            <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>→ {t.destinations}</div>
          )}
        </div>
        {hasDetail && <span style={{ fontSize: 11, color: "#7a8c74", flexShrink: 0 }}>{expanded ? "▾" : "▸"}</span>}
      </div>
      {expanded && t.rowList && t.rowList.length > 0 && (
        <div style={{ padding: "4px 12px 8px 20px", fontSize: 11, color: "#7a8c74", borderTop: "1px solid #e0ead8" }}>
          {section === "planting" ? (
            t.rowList.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{r.rowId} — {r.location || ""}</span>
                <span>{fmtN(r.qty)} pots</span>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.rowList.map((r, i) => (
                <span key={i} style={{ background: "#fff", padding: "2px 8px", borderRadius: 4, border: "1px solid #e0ead8" }}>{r}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductionScheduleTab({ items, containers, soilMixes = [], year, upsertTask, managerTasks }) {
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [pushedWeeks, setPushedWeeks] = useState({});
  const [pushing, setPushing] = useState({});

  // Find prop tray for cost calculation
  const propTray = useMemo(() => {
    return containers.find(c => c.name && c.name.toLowerCase().includes("50") && c.name.toLowerCase().includes("plug"));
  }, [containers]);

  // Compute all tasks from items
  const weeklySchedule = useMemo(() => {
    const weeks = {}; // weekNum → { prop: [], potfill: [], planting: [], tags: [] }

    function ensureWeek(wk) {
      if (!weeks[wk]) weeks[wk] = { prop: [], potfill: [], planting: [], tags: [] };
    }

    const propAccum = {}; // key: "sowWk||VARIETY" → consolidated prop data
    const potfillAccum = {}; // key: "fillWk||container||location"
    const plantingAccum = {}; // key: "plantWk||VARIETY"
    const tagAccum = {}; // key: "tagWk||VARIETY"

    // Find prop trays from library
    const seedTray = containers.find(c => c.name && c.name.toLowerCase().includes("105") && c.name.toLowerCase().includes("hex"));
    const urcTray = containers.find(c => c.sku === "PTT 50 V");
    const seedCells = seedTray ? (parseInt(seedTray.cellsPerFlat) || 100) : 100;
    const urcCells = urcTray ? (parseInt(urcTray.cellsPerFlat) || 50) : 50;

    items.forEach(item => {
      const qty = parseFloat(item.qty) || 0;
      if (qty <= 0) return;
      const variety = item.variety || "Unknown";
      const pm = (item.propMethod || "").toUpperCase();
      const category = (item.category || "").toUpperCase();
      const container = pickContainerForCategory(item.category, containers);
      const containerName = container ? container.name : (item.category || "pot");
      const plantWeekNum = parseWeekNum(item.plantWeek);

      // ── Prop/Seed tasks — accumulate by individual seed/cutting variety ──
      if (isSeedSow(item)) {
        const sowWeekStr = computeSowWeek(item);
        const sowWk = parseWeekNum(sowWeekStr);
        if (sowWk) {
          ensureWeek(sowWk);
          const germRate = item.germinationRate ? item.germinationRate / 100 : 1;
          const varUpper = variety.toUpperCase();

          // Check if this is a mix product — break into component seeds/cuttings
          const mixKey = Object.keys(MIX_DEFS).find(k => varUpper.includes(k));
          if (mixKey) {
            const components = MIX_DEFS[mixKey];
            components.forEach(mc => {
              const compQty = qty * mc.perPot; // e.g., 60 pots × 1 seed/color = 60
              const adjCompQty = germRate < 1 ? Math.ceil(compQty / germRate) : compQty;
              const propKey = `${sowWk}||${mc.name}`;
              if (!propAccum[propKey]) {
                propAccum[propKey] = { variety: mc.name, sowWk, pm, germRate, totalQty: 0, destinations: [] };
              }
              propAccum[propKey].totalQty += adjCompQty;
              propAccum[propKey].destinations.push({ category: item.category || "", qty: compQty, containerName: `${containerName} (${variety})` });
            });
          } else {
            const adjQty = germRate < 1 ? Math.ceil(qty / germRate) : qty;
            const propKey = `${sowWk}||${varUpper}`;
            if (!propAccum[propKey]) {
              propAccum[propKey] = { variety, sowWk, pm, germRate, totalQty: 0, destinations: [] };
            }
            propAccum[propKey].totalQty += adjQty;
            propAccum[propKey].destinations.push({ category: item.category || "", qty, containerName });
          }
        }
      }

      // ── Pot Filling — accumulate by fillWeek + container + location ──
      if (plantWeekNum) {
        const shipWk = parseWeekNum(item.shipWeek);
        const isLiner = pm === "LINER" || (shipWk && shipWk === plantWeekNum);
        const fillWeek = isLiner ? (shipWk || plantWeekNum) - 1 : plantWeekNum - 1;
        const loc = (item.location || "").replace(/\s*(EQ|WP|SP)\d+.*/i, "").trim() || "TBD";
        const fillKey = `${fillWeek}||${containerName}||${loc}`;
        if (!potfillAccum[fillKey]) {
          potfillAccum[fillKey] = { fillWeek, containerName, location: loc, totalQty: 0, rows: new Set() };
        }
        potfillAccum[fillKey].totalQty += qty;
        if (item.rowId) potfillAccum[fillKey].rows.add(item.rowId);
      }

      // ── Planting — accumulate by plantWeek + variety ──
      if (plantWeekNum) {
        const shipWk = parseWeekNum(item.shipWeek);
        const sameDayArrival = shipWk && shipWk === plantWeekNum;
        const isPropagated = isSeedSow(item);
        const plantKey = `${plantWeekNum}||${variety.toUpperCase()}`;
        if (!plantingAccum[plantKey]) {
          plantingAccum[plantKey] = { plantWeekNum, variety, containerName, category: item.category, pm, sameDayArrival, isPropagated, ppp: item.ppp || 1, totalQty: 0, rows: [], locations: new Set(), color: item.color };
        }
        plantingAccum[plantKey].totalQty += qty;
        if (item.rowId) plantingAccum[plantKey].rows.push({ rowId: item.rowId, qty, location: item.location });
        if (item.location) plantingAccum[plantKey].locations.add((item.location || "").replace(/\s*(EQ|WP|SP)\d+.*/i, "").trim());
      }

      // ── Tag tasks — accumulate by variety with retail info ──
      if (plantWeekNum) {
        if (!category.includes('4.5" PRODUCTION') && !category.includes("4.5") && !category.includes("1801")) {
          const tagWeek = plantWeekNum - 1;
          const tagKey = `${tagWeek}||${variety.toUpperCase()}`;
          if (!tagAccum[tagKey]) {
            tagAccum[tagKey] = { tagWeek, variety, category: item.category, color: item.color, upc: item.upc || null, totalQty: 0 };
          }
          tagAccum[tagKey].totalQty += qty;
          if (item.upc && !tagAccum[tagKey].upc) tagAccum[tagKey].upc = item.upc;
        }
      }
    });

    // ── Consolidate prop/seed tasks by variety ──
    Object.values(propAccum).forEach(p => {
      const { variety, sowWk, pm, germRate, totalQty, destinations } = p;
      ensureWeek(sowWk);
      const roundedQty = Math.ceil(totalQty / 50) * 50; // round up to nearest 50
      const isSeed = pm === "SEED";
      const tray = isSeed ? seedTray : urcTray;
      const cells = isSeed ? seedCells : urcCells;
      const trayCount = Math.ceil(roundedQty / cells);
      const trayCost = tray ? trayCount * (parseFloat(tray.costPerUnit) || 0) : 0;
      const trayName = isSeed ? "105-cell hex" : "50-cell square";
      const destStr = destinations.map(d => `${fmtN(d.qty)} → ${d.containerName}`).join(", ");
      let title;
      if (isSeed) {
        title = `Sow ${fmtN(roundedQty)} ${variety} — ${trayCount} ${trayName} trays`;
        if (germRate < 1) title += ` (${Math.round(germRate * 100)}% germ)`;
      } else {
        title = `Stick ${fmtN(roundedQty)} ${variety} URCs — ${trayCount} ${trayName} trays`;
      }
      weeks[sowWk].prop.push({
        variety, qty: roundedQty, title, trayCount, propTrayCost: trayCost,
        trayType: trayName, destinations: destStr, emoji: "\u{1F331}", item: destinations[0],
      });
    });

    // ── Consolidate pot filling tasks ──
    const defaultSoilName = pickDefaultSoil(soilMixes)?.name || "BM5HP Compressed";
    Object.values(potfillAccum).forEach(p => {
      ensureWeek(p.fillWeek);
      const rowList = [...p.rows].sort();
      weeks[p.fillWeek].potfill.push({
        variety: p.containerName, qty: p.totalQty,
        title: `${fmtN(p.totalQty)} ${p.containerName}`,
        location: p.location,
        soilMix: defaultSoilName,
        rowCount: rowList.length,
        rowList,
        containerName: p.containerName,
        emoji: "\u{1F4E6}", item: null,
      });
    });

    // ── Consolidate planting tasks ──
    Object.values(plantingAccum).forEach(p => {
      ensureWeek(p.plantWeekNum);
      const locList = p.locations.size > 0 ? [...p.locations].join(", ") : null;
      const rowList = p.rows.sort((a, b) => (a.rowId || "").localeCompare(b.rowId || ""));
      let title;
      if (p.sameDayArrival && !p.isPropagated) {
        title = `${p.variety} — ${fmtN(p.totalQty)} pots (liners on arrival)`;
      } else if (p.isPropagated) {
        title = `${p.variety} — ${fmtN(p.totalQty)} pots (from prop)`;
      } else {
        title = `${p.variety} — ${fmtN(p.totalQty)} pots (${p.ppp}/pot)`;
      }
      if (p.color) title += ` · ${p.color}`;
      weeks[p.plantWeekNum].planting.push({
        variety: p.variety, qty: p.totalQty, title,
        location: locList,
        rowCount: rowList.length,
        rowList,
        containerName: p.containerName,
        category: p.category,
        emoji: "\u{1F33F}", item: null,
      });
    });

    // ── Consolidate tag tasks — sorted by category then variety for printing ──
    Object.values(tagAccum).forEach(t => {
      ensureWeek(t.tagWeek);
      weeks[t.tagWeek].tags.push({
        variety: t.variety, qty: t.totalQty,
        category: t.category,
        color: t.color,
        upc: t.upc,
        title: t.variety,
        emoji: "\u{1F3F7}", item: null,
      });
    });
    // Sort tags within each week by category then variety
    Object.values(weeks).forEach(w => {
      w.tags.sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.variety || "").localeCompare(b.variety || ""));
    });

    // Sort weeks and compute totals
    return Object.entries(weeks)
      .map(([wk, tasks]) => {
        const weekNum = parseInt(wk);
        const monday = weekToDate(weekNum, year);
        const totalPots = tasks.potfill.reduce((s, t) => s + t.qty, 0);
        const totalPlants = tasks.planting.reduce((s, t) => s + t.qty, 0);
        const totalTags = tasks.tags.reduce((s, t) => s + t.qty, 0);
        const totalTrays = tasks.prop.reduce((s, t) => s + t.trayCount, 0);
        const totalPropCost = tasks.prop.reduce((s, t) => s + (t.propTrayCost || 0), 0);
        const allTasks = [...tasks.prop, ...tasks.potfill, ...tasks.planting, ...tasks.tags];
        return { weekNum, monday, tasks, totalPots, totalPlants, totalTags, totalTrays, totalPropCost, taskCount: allTasks.length };
      })
      .filter(w => w.taskCount > 0)
      .sort((a, b) => a.weekNum - b.weekNum);
  }, [items, containers, year, propTray]);

  // Check which weeks have already been pushed
  useEffect(() => {
    const pushed = {};
    weeklySchedule.forEach(w => {
      const prefix = `f${Math.abs(["fall", String(year), `wk${w.weekNum}`, "prop"].join("|").split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(16).padStart(8, "0").slice(0, 7)}`;
      const hasTasks = managerTasks.some(t => t.id && t.id.startsWith("f") && (t.createdBy || "").includes("Production Schedule") && t.weekNumber === w.weekNum && t.year === year);
      if (hasTasks) pushed[w.weekNum] = true;
    });
    setPushedWeeks(pushed);
  }, [managerTasks, weeklySchedule, year]);

  function toggleWeek(wk) {
    setExpandedWeeks(prev => ({ ...prev, [wk]: !prev[wk] }));
  }

  const [pushingAll, setPushingAll] = useState(false);
  const allPushed = weeklySchedule.length > 0 && weeklySchedule.every(w => pushedWeeks[w.weekNum]);

  async function pushAllWeeks() {
    setPushingAll(true);
    try {
      for (const w of weeklySchedule) {
        if (!pushedWeeks[w.weekNum]) await pushWeekToTasks(w);
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
    setPushingAll(false);
  }

  async function pushWeekToTasks(weekData) {
    const wk = weekData.weekNum;
    setPushing(p => ({ ...p, [wk]: true }));
    try {
      const monday = weekData.monday;
      const targetDate = monday.toISOString().split("T")[0];
      const allTasks = [
        ...weekData.tasks.prop.map(t => ({ ...t, type: "prop" })),
        ...weekData.tasks.potfill.map(t => ({ ...t, type: "potfill" })),
        ...weekData.tasks.planting.map(t => ({ ...t, type: "planting" })),
        ...weekData.tasks.tags.map(t => ({ ...t, type: "tags" })),
      ];
      for (const t of allTasks) {
        const id = deterministicId(["fall", String(year), `wk${wk}`, t.type, t.variety]);
        await upsertTask({
          id,
          title: `${t.emoji} ${t.title}`,
          priority: 50,
          weekNumber: wk,
          year,
          status: "pending",
          category: "production",
          bucket: "this_week",
          targetDate,
          location: "bluff",
          createdBy: "Production Schedule",
        });
      }
      setPushedWeeks(p => ({ ...p, [wk]: true }));
    } catch (err) {
      console.error("Failed to push tasks:", err);
      alert("Failed to push tasks: " + err.message);
    } finally {
      setPushing(p => ({ ...p, [wk]: false }));
    }
  }

  const formatDate = (d) => {
    if (!d) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div>
      {/* Summary bar */}
      <div style={{ ...card, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',serif" }}>
          Production Schedule
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginLeft: "auto" }}>
          {Object.entries(TASK_COLORS).map(([k, v]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Push all button */}
      {weeklySchedule.length > 0 && (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>
            {Object.keys(pushedWeeks).length} of {weeklySchedule.length} weeks pushed to tasks
          </div>
          <button onClick={pushAllWeeks} disabled={allPushed || pushingAll}
            style={{
              padding: "12px 24px", borderRadius: 10, border: "none",
              background: allPushed ? "#c8e6b8" : pushingAll ? "#b0c8a0" : "#1e2d1a",
              color: allPushed ? "#4a7a35" : "#c8e6b8",
              fontSize: 14, fontWeight: 800, cursor: allPushed ? "default" : "pointer", fontFamily: "inherit",
            }}>
            {allPushed ? "✓ All weeks pushed" : pushingAll ? "Pushing all..." : "Push All Weeks to Tasks"}
          </button>
        </div>
      )}

      {propTray && (
        <div style={{ ...card, background: "#f9f9f5", fontSize: 12, color: "#7a8c74" }}>
          Prop tray: {propTray.name} @ {fmt$(propTray.costPerUnit)}/tray (50-cell)
        </div>
      )}

      {weeklySchedule.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "40px", color: "#7a8c74" }}>
          No schedule data. Items need ship_week and plant_week values.
        </div>
      )}

      {/* Week cards */}
      {weeklySchedule.map(w => {
        const expanded = expandedWeeks[w.weekNum];
        const pushed = pushedWeeks[w.weekNum];
        const isPushing = pushing[w.weekNum];

        return (
          <div key={w.weekNum} style={{ ...card, padding: 0, overflow: "hidden" }}>
            {/* Week header — always visible */}
            <div
              onClick={() => toggleWeek(w.weekNum)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                cursor: "pointer", background: expanded ? "#f4f9f0" : "#fff",
                borderBottom: expanded ? "1.5px solid #e0ead8" : "none",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a", minWidth: 90 }}>
                Week {w.weekNum}
              </div>
              <div style={{ fontSize: 12, color: "#7a8c74", fontWeight: 600 }}>
                {formatDate(w.monday)}
              </div>

              {/* Compact totals */}
              <div style={{ display: "flex", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
                {w.tasks.prop.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: TASK_COLORS.prop.color, background: TASK_COLORS.prop.bg, borderRadius: 8, padding: "2px 8px" }}>
                    {"\u{1F331}"} {w.totalTrays} trays
                  </span>
                )}
                {w.tasks.potfill.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: TASK_COLORS.potfill.color, background: TASK_COLORS.potfill.bg, borderRadius: 8, padding: "2px 8px" }}>
                    {"\u{1F4E6}"} {fmtN(w.totalPots)} pots
                  </span>
                )}
                {w.tasks.planting.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: TASK_COLORS.planting.color, background: TASK_COLORS.planting.bg, borderRadius: 8, padding: "2px 8px" }}>
                    {"\u{1F33F}"} {fmtN(w.totalPlants)} plants
                  </span>
                )}
                {w.tasks.tags.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: TASK_COLORS.tags.color, background: TASK_COLORS.tags.bg, borderRadius: 8, padding: "2px 8px" }}>
                    {"\u{1F3F7}"} {fmtN(w.totalTags)} tags
                  </span>
                )}
              </div>

              <span style={{ fontSize: 14, color: "#7a8c74", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                {"\u25BC"}
              </span>
            </div>

            {/* Expanded content */}
            {expanded && (
              <div style={{ padding: "16px 20px" }}>
                {/* Task type sections */}
                {[
                  { key: "prop", tasks: w.tasks.prop },
                  { key: "potfill", tasks: w.tasks.potfill },
                  { key: "planting", tasks: w.tasks.planting },
                  { key: "tags", tasks: w.tasks.tags },
                ].filter(s => s.tasks.length > 0).map(section => (
                  <div key={section.key} style={{ marginBottom: 14 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 800, color: TASK_COLORS[section.key].color,
                      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: TASK_COLORS[section.key].color, display: "inline-block" }} />
                      {TASK_COLORS[section.key].label} ({section.tasks.length})
                      <span style={{ fontWeight: 600, textTransform: "none", fontSize: 11, marginLeft: 8 }}>
                        {section.key === "prop" && (() => {
                          const seedTrays = section.tasks.filter(t => t.trayType && t.trayType.includes("105")).reduce((s, t) => s + t.trayCount, 0);
                          const urcTrays = section.tasks.filter(t => t.trayType && t.trayType.includes("50")).reduce((s, t) => s + t.trayCount, 0);
                          return <>
                            {seedTrays > 0 && `${seedTrays} × 105-cell`}{seedTrays > 0 && urcTrays > 0 && " + "}{urcTrays > 0 && `${urcTrays} × 50-cell`}
                            {" = "}{seedTrays + urcTrays} trays total
                          </>;
                        })()}
                        {section.key === "potfill" && (() => {
                          const totalPots = section.tasks.reduce((s, t) => s + t.qty, 0);
                          const totalRows = section.tasks.reduce((s, t) => s + (t.rowCount || 0), 0);
                          return <>{fmtN(totalPots)} pots · {totalRows} rows</>;
                        })()}
                        {section.key === "planting" && (() => {
                          const totalPots = section.tasks.reduce((s, t) => s + t.qty, 0);
                          const totalRows = section.tasks.reduce((s, t) => s + (t.rowCount || 0), 0);
                          return <>{fmtN(totalPots)} pots · {totalRows} rows</>;
                        })()}
                        {section.key === "tags" && (() => {
                          const totalTags = section.tasks.reduce((s, t) => s + t.qty, 0);
                          return <>{fmtN(totalTags)} tags · {section.tasks.length} varieties</>;
                        })()}
                      </span>
                    </div>
                    {section.key === "tags" ? (
                      /* Tags — formatted as a printable table */
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                            <th style={{ padding: "6px 8px", textAlign: "left" }}>Size</th>
                            <th style={{ padding: "6px 8px", textAlign: "left" }}>Variety</th>
                            <th style={{ padding: "6px 8px", textAlign: "left" }}>Color</th>
                            <th style={{ padding: "6px 8px", textAlign: "left" }}>UPC</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.tasks.map((t, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid #f0f5ee", background: idx % 2 === 0 ? "#faf5ff" : "#fff" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 700, color: "#8e44ad", whiteSpace: "nowrap" }}>{t.category || "—"}</td>
                              <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e2d1a" }}>{t.variety}</td>
                              <td style={{ padding: "6px 8px", color: "#7a8c74" }}>{t.color || "—"}</td>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace", color: t.upc ? "#1e2d1a" : "#c8d8c0", fontSize: 11 }}>{t.upc || "—"}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtN(t.qty)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : section.tasks.map((t, idx) => (
                      <ExpandableTaskRow key={idx} task={t} section={section.key} />
                    ))}
                  </div>
                ))}

                {/* Summary + Push button */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e0ead8" }}>
                  <div style={{ fontSize: 12, color: "#7a8c74" }}>
                    {w.taskCount} tasks total
                    {w.totalPropCost > 0 && <span> &middot; Prop tray cost: {fmt$(w.totalPropCost)}</span>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); pushWeekToTasks(w); }}
                    disabled={pushed || isPushing}
                    style={{
                      ...BTN,
                      background: pushed ? "#c8e6b8" : isPushing ? "#b0c8a0" : "#7fb069",
                      fontSize: 13, padding: "8px 18px",
                      opacity: pushed ? 0.8 : 1,
                      cursor: pushed ? "default" : "pointer",
                    }}
                  >
                    {pushed ? "\u2713 Pushed" : isPushing ? "Pushing..." : "Push to Tasks"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ITEMS LIST (consolidated by variety with drill-down) ────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ItemsTab({ items, soilMixes, containers, upsert, updateItem }) {
  const [searchQ, setSearchQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilters, setColorFilters] = useState([]); // multi-select
  const [weekFilter, setWeekFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | confirmed | unconfirmed
  const [timingFilter, setTimingFilter] = useState("all");
  const [expandedKey, setExpandedKey] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null); // opened row data
  const [sortCol, setSortCol] = useState("totalQty");
  const [sortDir, setSortDir] = useState("desc");

  function toggleColor(c) {
    setColorFilters(curr => curr.includes(c) ? curr.filter(x => x !== c) : [...curr, c]);
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
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
    if (timingFilter !== "all") result = result.filter(i => i.responseWeek === timingFilter || (!i.responseWeek && i.timing === timingFilter));
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
          responseWeek: i.responseWeek,
          b2bAdded: true,
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
          companionVariety: i.companionVariety || null,
          transplantFrom: i.transplantFrom || null,
          transplantWeek: i.transplantWeek || null,
          isComboComponent: i.isComboComponent || false,
          orderNumber: i.orderNumber || null,
          confirmationPdfPath: i.confirmationPdfPath || null,
          broker: i.broker || null,
          supplier: i.supplier || null,
          substitutedFrom: i.substitutedFrom || null,
          substitutedAt: i.substitutedAt || null,
        };
      }
      if (isTricolor) map[key].tricolorVarieties.add(i.variety);
      map[key].totalQty += parseFloat(i.qty) || 0;
      map[key].totalCost += parseFloat(i.cost) || 0;
      map[key].locations.push(i);
      if (i.shipWeek) map[key].shipWeeks.add(i.shipWeek);
      if (i.orderNumber) map[key].confirmed++;
      else map[key].unconfirmed++;
      if (!i.b2bAdded) map[key].b2bAdded = false;
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

    return all;
  }, [filtered]);

  // Apply sort
  const sortedConsolidated = useMemo(() => {
    const copy = [...consolidated];
    copy.sort((a, b) => {
      let av, bv;
      switch (sortCol) {
        case "variety":    av = (a.variety || "").toLowerCase(); bv = (b.variety || "").toLowerCase(); break;
        case "color":      av = (a.color || "").toLowerCase(); bv = (b.color || "").toLowerCase(); break;
        case "shipWeek":   av = (a.shipWeeks && [...a.shipWeeks].sort()[0]) || ""; bv = (b.shipWeeks && [...b.shipWeeks].sort()[0]) || ""; break;
        case "plantWeek":  av = a.plantWeek || ""; bv = b.plantWeek || ""; break;
        case "responseWeek": av = parseFloat(a.responseWeek) || 99; bv = parseFloat(b.responseWeek) || 99; break;
        case "timing":     av = (a.timing || "").toLowerCase(); bv = (b.timing || "").toLowerCase(); break;
        case "totalCost":  av = a.totalCost || 0; bv = b.totalCost || 0; break;
        case "totalQty":
        default:           av = a.totalQty || 0; bv = b.totalQty || 0; break;
      }
      if (typeof av === "number") return sortDir === "desc" ? bv - av : av - bv;
      return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return copy;
  }, [consolidated, sortCol, sortDir]);

  const totals = useMemo(() => ({
    qty: consolidated.reduce((s, c) => s + c.totalQty, 0),
    cost: consolidated.reduce((s, c) => s + c.totalCost, 0),
    unconfirmedLines: filtered.filter(i => !i.orderNumber).length,
  }), [consolidated, filtered]);

  const missingRespWeek = useMemo(() =>
    consolidated.filter(c => !c.responseWeek && c.category !== "4.5\" PRODUCTION" || (!c.responseWeek && c.totalQty > 0))
  , [consolidated]);

  // Actually, let's keep it simple — any consolidated row with no response_week
  const missingRW = useMemo(() =>
    consolidated.filter(c => !c.responseWeek)
  , [consolidated]);
  const [showMissingRW, setShowMissingRW] = useState(false);

  return (
    <div>
      {missingRW.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowMissingRW(!showMissingRW)}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px solid #e89a3a", background: "#fff7ec", color: "#1e2d1a", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            📅 {missingRW.length} variet{missingRW.length !== 1 ? "ies" : "y"} missing response week (ready date) {showMissingRW ? "▾" : "▸"}
          </button>
          {showMissingRW && (
            <div style={{ marginTop: 8, background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, overflow: "hidden" }}>
              {missingRW.map(c => (
                <div key={c.key} style={{ padding: "10px 14px", borderBottom: "1px solid #f0f5ee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{c.variety}</div>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>{c.category} · {fmtN(c.totalQty)} pots</div>
                  </div>
                  <input type="text" placeholder="Week #" defaultValue=""
                    onBlur={async (e) => {
                      if (e.target.value.trim()) {
                        for (const loc of c.locations) {
                          await updateItem(loc.id, { responseWeek: e.target.value.trim() });
                        }
                      }
                    }}
                    style={{ width: 100, padding: "6px 10px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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

        {/* Response week filter chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6, alignSelf: "center" }}>Response Wk:</span>
          <button onClick={() => setTimingFilter("all")}
            style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: timingFilter === "all" ? 800 : 600,
              background: timingFilter === "all" ? "#1e2d1a" : "#fff",
              color: timingFilter === "all" ? "#c8e6b8" : "#7a8c74",
              border: `1.5px solid ${timingFilter === "all" ? "#1e2d1a" : "#c8d8c0"}`,
              cursor: "pointer", fontFamily: "inherit" }}>All</button>
          {[...new Set(items.map(i => i.responseWeek).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b)).map(rw => (
            <button key={rw} onClick={() => setTimingFilter(rw)}
              style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: timingFilter === rw ? 800 : 600,
                background: timingFilter === rw ? "#1e2d1a" : "#fff",
                color: timingFilter === rw ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${timingFilter === rw ? "#1e2d1a" : "#c8d8c0"}`,
                cursor: "pointer", fontFamily: "inherit" }}>Wk {rw}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "30px 50px 1fr 85px 90px 90px 100px 1.2fr 80px 85px 95px", padding: "12px 16px", background: "#fafcf8", borderBottom: "2px solid #e0ead8", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5 }}>
          <div></div>
          <div style={{ textAlign: "center" }}>B2B</div>
          <div onClick={() => toggleSort("variety")} style={{ cursor: "pointer", userSelect: "none" }}>Variety {sortCol === "variety" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div onClick={() => toggleSort("color")} style={{ cursor: "pointer", userSelect: "none" }}>Color {sortCol === "color" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div onClick={() => toggleSort("shipWeek")} style={{ cursor: "pointer", userSelect: "none" }}>Ship Wk {sortCol === "shipWeek" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div onClick={() => toggleSort("plantWeek")} style={{ cursor: "pointer", userSelect: "none" }}>Plant Wk {sortCol === "plantWeek" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div onClick={() => toggleSort("responseWeek")} style={{ cursor: "pointer", userSelect: "none" }}>Resp Wk {sortCol === "responseWeek" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div>Locations</div>
          <div onClick={() => toggleSort("totalQty")} style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }}>Qty {sortCol === "totalQty" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div onClick={() => toggleSort("totalCost")} style={{ textAlign: "right", cursor: "pointer", userSelect: "none" }}>Cost {sortCol === "totalCost" ? (sortDir === "asc" ? "↑" : "↓") : ""}</div>
          <div style={{ textAlign: "center" }}>Status</div>
        </div>
        {sortedConsolidated.map((c, idx) => {
          const isOpen = expandedKey === c.key;
          const allConfirmed = c.unconfirmed === 0;
          const noneConfirmed = c.confirmed === 0;
          return (
            <div key={c.key}>
              <div onClick={() => setExpandedKey(isOpen ? null : c.key)}
                style={{ display: "grid", gridTemplateColumns: "30px 50px 1fr 85px 90px 90px 100px 1.2fr 80px 85px 95px", padding: "10px 16px", borderBottom: "1px solid #f0f5ee", cursor: "pointer", alignItems: "center", background: c.b2bAdded ? "#f0f9ec" : idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <div style={{ color: "#7a8c74", fontSize: 14 }}>{isOpen ? "▼" : "▶"}</div>
                <div style={{ textAlign: "center" }} onClick={async (e) => {
                  e.stopPropagation();
                  const newVal = !c.b2bAdded;
                  const now = newVal ? new Date().toISOString() : null;
                  for (const loc of c.locations) {
                    await updateItem(loc.id, { b2bAdded: newVal, b2bAddedAt: now });
                  }
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    background: c.b2bAdded ? "#7fb069" : "#fff",
                    border: c.b2bAdded ? "2px solid #7fb069" : "2px solid #c8d8c0",
                    color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer",
                  }}>{c.b2bAdded ? "✓" : ""}</div>
                </div>
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
                    {c.isComboComponent && (
                      <span style={{ marginLeft: 6, background: "#e89a3a", color: "#fff", borderRadius: 10, padding: "1px 8px", fontSize: 10, fontWeight: 800 }} title="Grown as combo component — not sold individually">
                        🎨 FOR COMBO
                      </span>
                    )}
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
                <div style={{ fontSize: 11, color: "#1e2d1a", fontWeight: 700 }}>{c.responseWeek ? `Wk ${c.responseWeek}` : (c.timing || "—")}</div>
                <div style={{ fontSize: 10, color: "#7a8c74", lineHeight: 1.4 }}>
                  {[...new Set(c.locations.map(l => l.location).filter(Boolean))].slice(0, 4).join(", ")}
                  {[...new Set(c.locations.map(l => l.location).filter(Boolean))].length > 4 && ` +${[...new Set(c.locations.map(l => l.location).filter(Boolean))].length - 4} more`}
                  <span style={{ color: "#aabba0", marginLeft: 4 }}>({c.locations.length} rows)</span>
                </div>
                <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtN(c.totalQty)}</div>
                <div style={{ textAlign: "right", fontSize: 12, color: "#4a7a35", fontWeight: 600 }}>{c.totalCost > 0 ? fmt$(c.totalCost) : "—"}</div>
                <div style={{ textAlign: "center", fontSize: 10 }}
                  onClick={(e) => { e.stopPropagation(); setConfirmationModal(c); }}>
                  {allConfirmed ? (
                    <span style={{ background: "#e8f5e0", color: "#4a7a35", borderRadius: 10, padding: "2px 8px", fontWeight: 700, cursor: "pointer", display: "inline-block" }}>
                      ✓{c.orderNumber ? ` #${c.orderNumber}` : " All"}
                    </span>
                  ) : noneConfirmed ? (
                    <span style={{ background: "#fde8e8", color: "#d94f3d", borderRadius: 10, padding: "2px 8px", fontWeight: 700, cursor: "pointer", display: "inline-block" }}>⚠ None</span>
                  ) : (
                    <span style={{ background: "#fff4e8", color: "#c8791a", borderRadius: 10, padding: "2px 8px", fontWeight: 700, cursor: "pointer", display: "inline-block" }}>{c.confirmed}/{c.locations.length}</span>
                  )}
                </div>
              </div>

              {/* Drill-down rows */}
              {isOpen && (
                <div style={{ background: "#fafcf8", padding: "10px 16px 14px 56px", borderBottom: "1px solid #e0ead8" }}>
                  {/* Companion / combo info for 14" mums */}
                  {c.companionVariety && (
                    <div style={{ marginBottom: 10, padding: "10px 12px", background: "#fff4e8", borderRadius: 8, border: "1.5px solid #e89a3a44" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Combo Pot — Companion</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{c.companionVariety}</div>
                      {(() => {
                        // Find the companion items to compute combo cost
                        const grassItems = items.filter(i => i.category === c.category && (i.variety || "").toUpperCase().includes("PURPLE FOUNTAIN") || (i.variety || "").toUpperCase().includes("GRASS"));
                        const grassCostPerUnit = grassItems.length > 0 ? (parseFloat(grassItems[0].cost) || 0) / (parseFloat(grassItems[0].qty) || 1) : 0;
                        const mumCostPerUnit = c.totalQty > 0 ? c.totalCost / c.totalQty : 0;
                        const comboCost = mumCostPerUnit + grassCostPerUnit;
                        return (
                          <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>
                            Mum: {fmt$(mumCostPerUnit * 100)}/unit + Grass: ${grassCostPerUnit.toFixed(2)}/unit = <strong style={{ color: "#1e2d1a" }}>${comboCost.toFixed(2)}/pot combo cost</strong>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Transplant info */}
                  {c.transplantFrom && (
                    <div style={{ marginBottom: 10, padding: "10px 12px", background: "#f0f8eb", borderRadius: 8, border: "1.5px solid #7fb06944" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#4a7a35", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Transplant</div>
                      <div style={{ fontSize: 12, color: "#1e2d1a" }}>
                        Arrives in: <strong>{c.transplantFrom}</strong>
                        {c.transplantWeek && <span> · Transplant: <strong>{c.transplantWeek}</strong></span>}
                        {!c.transplantWeek && <span style={{ color: "#e89a3a", fontWeight: 700 }}> · Transplant date TBD</span>}
                      </div>
                    </div>
                  )}

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
        {sortedConsolidated.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "30px 50px 1fr 85px 90px 90px 100px 1.2fr 80px 85px 95px", padding: "14px 16px", background: "#1e2d1a", color: "#c8e6b8", fontWeight: 800, fontSize: 12, alignItems: "center" }}>
            <div></div>
            <div style={{ fontSize: 10, textAlign: "center" }}>{sortedConsolidated.filter(c => c.b2bAdded).length}/{sortedConsolidated.length}</div>
            <div>TOTALS ({sortedConsolidated.length} {sortedConsolidated.length === 1 ? "variety" : "varieties"})</div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div style={{ fontSize: 11, color: "#7a9a6a" }}>{filtered.length} rows / {new Set(filtered.map(f => f.location).filter(Boolean)).size} locations</div>
            <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(totals.qty)}</div>
            <div style={{ textAlign: "right", color: "#7fb069", fontVariantNumeric: "tabular-nums" }}>{fmt$(totals.cost)}</div>
            <div></div>
          </div>
        )}
      </div>
      {confirmationModal && (
        <ConfirmationModal row={confirmationModal} items={items} upsert={upsert} updateItem={updateItem} onClose={() => setConfirmationModal(null)} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CONFIRMATION MODAL ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ConfirmationModal({ row, items, upsert, updateItem, onClose }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [substituting, setSubstituting] = useState(false);
  const [subName, setSubName] = useState("");
  const [subCost, setSubCost] = useState("");
  const [subOrderNumber, setSubOrderNumber] = useState("");
  const [respWeek, setRespWeek] = useState(row.responseWeek || "");
  const fileRef = useRef(null);

  async function saveResponseWeek() {
    if (respWeek === (row.responseWeek || "")) return;
    for (const loc of row.locations) {
      await updateItem(loc.id, { responseWeek: respWeek || null });
    }
  }

  const sb = getSupabase();

  useEffect(() => {
    if (!sb || !row.confirmationPdfPath) return;
    sb.storage.from("order-confirmations").createSignedUrl(row.confirmationPdfPath, 3600).then(({ data }) => {
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    });
  }, [row.confirmationPdfPath]);

  async function handleReplace(file) {
    if (!file) return;
    setLoading(true);
    try {
      const path = row.confirmationPdfPath || `${row.orderNumber || crypto.randomUUID()}.pdf`;
      // Remove existing then upload
      try { await sb.storage.from("order-confirmations").remove([path]); } catch {}
      const { error } = await sb.storage.from("order-confirmations").upload(path, file, { contentType: "application/pdf", upsert: true });
      if (error) throw error;
      // Update all items in this variety group
      for (const loc of row.locations) {
        await updateItem(loc.id, { confirmationPdfPath: path });
      }
      // Refresh signed url
      const { data } = await sb.storage.from("order-confirmations").createSignedUrl(path, 3600);
      if (data?.signedUrl) setPdfUrl(data.signedUrl + "&t=" + Date.now());
      alert("Confirmation replaced successfully.");
    } catch (err) {
      alert("Replace failed: " + err.message);
    }
    setLoading(false);
  }

  async function handleSubstitute() {
    if (!subName.trim()) return;
    const newName = subName.trim().toUpperCase();
    const cost = parseFloat(subCost) || null;
    const origVariety = row.variety;
    const now = new Date().toISOString();
    for (const loc of row.locations) {
      const patch = { variety: newName, substitutedFrom: origVariety, substitutedAt: now };
      if (cost !== null) patch.cost = cost;
      if (subOrderNumber.trim()) patch.orderNumber = subOrderNumber.trim();
      await updateItem(loc.id, patch);
    }
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e2d1a", fontFamily: "'DM Serif Display',Georgia,serif" }}>{row.variety}</div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{row.category} · {row.totalQty} total</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7a8c74" }}>✕</button>
        </div>

        {row.substitutedFrom && (
          <div style={{ padding: "10px 12px", background: "#fff7ec", border: "1.5px solid #e89a3a", borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: 0.5 }}>Substitution</div>
            <div style={{ fontSize: 13, color: "#1e2d1a", marginTop: 2 }}>
              Substituted from <strong>{row.substitutedFrom}</strong>
              {row.substitutedAt && <span style={{ color: "#7a8c74" }}> · {new Date(row.substitutedAt).toLocaleDateString()}</span>}
            </div>
          </div>
        )}

        <div style={{ padding: "12px 14px", background: "#f2f5ef", borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Order Details</div>
          {row.orderNumber ? (
            <>
              <div style={{ fontSize: 13, color: "#1e2d1a" }}><strong>Sales Order #:</strong> {row.orderNumber}</div>
              {row.broker && <div style={{ fontSize: 13, color: "#1e2d1a" }}><strong>Broker:</strong> {row.broker}</div>}
              {row.supplier && <div style={{ fontSize: 13, color: "#1e2d1a" }}><strong>Supplier:</strong> {row.supplier}</div>}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#d94f3d", fontWeight: 700 }}>⚠ Not yet confirmed</div>
          )}
        </div>

        {/* Response Week (Ready Date) */}
        <div style={{ padding: "12px 14px", background: row.responseWeek ? "#f0f8eb" : "#fff3f1", border: `1.5px solid ${row.responseWeek ? "#7fb069" : "#d94f3d"}`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Response Week — Ready Date</div>
          {!row.responseWeek && (
            <div style={{ fontSize: 12, color: "#d94f3d", fontWeight: 700, marginBottom: 6 }}>
              ⚠ No response week assigned. Add one so this item shows up correctly on the schedule.
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="text" value={respWeek} onChange={e => setRespWeek(e.target.value)} placeholder="e.g. 37 or 37/38"
              style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={saveResponseWeek} disabled={respWeek === (row.responseWeek || "")}
              style={{ padding: "8px 14px", background: respWeek === (row.responseWeek || "") ? "#c8d8c0" : "#7fb069", color: "#fff", border: "none", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: respWeek === (row.responseWeek || "") ? "default" : "pointer", fontFamily: "inherit" }}>
              Save
            </button>
          </div>
          <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 4 }}>
            Enter the week number the plant is expected to be shippable/ready (e.g. 35, 37, 37/38).
          </div>
        </div>

        {/* PDF view + replace */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Confirmation PDF</div>
          {pdfUrl ? (
            <div style={{ display: "flex", gap: 8 }}>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, padding: "10px 14px", background: "#7fb069", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 800, fontSize: 13, textAlign: "center" }}>
                📄 View PDF
              </a>
              <button onClick={() => fileRef.current?.click()} disabled={loading}
                style={{ padding: "10px 14px", background: "#fff", color: "#1e2d1a", border: "1.5px solid #c8d8c0", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
                {loading ? "..." : "Replace"}
              </button>
            </div>
          ) : (
            <div>
              <button onClick={() => fileRef.current?.click()} disabled={loading}
                style={{ width: "100%", padding: "14px 0", background: "#fff4e8", color: "#c8791a", border: "1.5px dashed #e89a3a", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
                {loading ? "Uploading..." : "📎 Upload confirmation PDF"}
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
            onChange={e => handleReplace(e.target.files?.[0])} />
        </div>

        {/* Substitute */}
        <div style={{ marginBottom: 14 }}>
          {!substituting ? (
            <button onClick={() => setSubstituting(true)}
              style={{ width: "100%", padding: "10px 0", background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              🔄 Substitute with different variety
            </button>
          ) : (
            <div style={{ padding: "12px 14px", background: "#fff7ec", border: "1.5px solid #e89a3a", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#c8791a", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Substitute Variety</div>
              <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="New variety name" autoFocus
                style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={subOrderNumber} onChange={e => setSubOrderNumber(e.target.value)} placeholder="Order # (optional)"
                  style={{ flex: 2, padding: "10px 12px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                <input type="number" step="0.01" value={subCost} onChange={e => setSubCost(e.target.value)} placeholder="New cost"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setSubstituting(false)}
                  style={{ flex: 1, padding: "10px 0", background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0", borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={handleSubstitute} disabled={!subName.trim()}
                  style={{ flex: 2, padding: "10px 0", background: subName.trim() ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 6, fontWeight: 800, fontSize: 12, cursor: subName.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                  Apply substitution
                </button>
              </div>
              <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 6 }}>
                The original variety "{row.variety}" will be saved as the substitution source.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SOWING & PROP TAB ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function SowingTab({ items, upsert }) {
  const [propTab, setPropTab] = useState("seed"); // "seed" | "urc"
  const thStyle = { padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" };

  // Split items by prop method
  const seedOnly = useMemo(() => items.filter(i => {
    const pm = (i.propMethod || "").toUpperCase();
    return pm === "SEED" || (isSeedSow(i) && pm !== "URC");
  }), [items]);

  const urcOnly = useMemo(() => items.filter(i => (i.propMethod || "").toUpperCase() === "URC"), [items]);

  const activeItems = propTab === "seed" ? seedOnly : urcOnly;

  // Group by sow/arrival week
  const byWeek = useMemo(() => {
    const map = {};
    activeItems.forEach(i => {
      const wk = computeSowWeek(i) || i.shipWeek || "Unknown";
      if (!map[wk]) map[wk] = [];
      map[wk].push(i);
    });
    return Object.entries(map).sort(([a], [b]) => {
      const na = parseInt((a.match(/\d+/) || [0])[0]) || 999;
      const nb = parseInt((b.match(/\d+/) || [0])[0]) || 999;
      return na - nb;
    });
  }, [activeItems]);

  const totalQty = activeItems.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
  const seedTotalQty = seedOnly.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
  const urcTotalQty = urcOnly.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);

  return (
    <div>
      {/* Seed vs URC toggle */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 12, overflow: "hidden", border: "1.5px solid #e0ead8" }}>
        <button onClick={() => setPropTab("seed")}
          style={{
            flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: "none",
            background: propTab === "seed" ? "#1e2d1a" : "#fff",
            color: propTab === "seed" ? "#c8e6b8" : "#7a8c74",
          }}>
          🌱 Seed ({fmtN(seedTotalQty)})
        </button>
        <button onClick={() => setPropTab("urc")}
          style={{
            flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", border: "none",
            borderLeft: "1.5px solid #e0ead8",
            background: propTab === "urc" ? "#1e2d1a" : "#fff",
            color: propTab === "urc" ? "#c8e6b8" : "#7a8c74",
          }}>
          ✂️ Unrooted Cuttings ({fmtN(urcTotalQty)})
        </button>
      </div>

      <div style={{ background: propTab === "seed" ? "#fff4e8" : "#f5f0ff", border: `1.5px solid ${propTab === "seed" ? "#e8d0a0" : "#d0c0e8"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: propTab === "seed" ? "#6a4a20" : "#5a3a8a" }}>
        {propTab === "seed"
          ? '🌱 Seed items that need to be sown before planting. Items marked "DIRECT SOW" are sown directly into the pot.'
          : '✂️ Unrooted cuttings that arrive and need to be stuck/rooted before planting.'}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>{propTab === "seed" ? "Seed Varieties" : "URC Varieties"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#7fb069", marginTop: 4 }}>{activeItems.length}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Total Quantity</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#4a90d9", marginTop: 4 }}>{fmtN(totalQty)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>{propTab === "seed" ? "Sow Weeks" : "Arrival Weeks"}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#c8791a", marginTop: 4 }}>{byWeek.length}</div>
        </div>
      </div>

      {activeItems.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>No {propTab === "seed" ? "seed" : "URC"} items in this year</div>
        </div>
      ) : (
        byWeek.map(([sowWeek, sowItems]) => {
          // Consolidate by seed color — break mix items into component colors
          const consolidated = {};
          const mixUsages = []; // track which products use each seed color
          sowItems.forEach(i => {
            const variety = (i.variety || "").toUpperCase();
            const isMix = variety.includes("MIX");
            const qty = parseFloat(i.qty) || 0;

            // Mix definitions: product name → component varieties with per-basket count
            const MIX_DEFS = {
              "CELOSIA KIMONO MIX": [
                { name: "CELOSIA KIMONO ORANGE", perPot: 1, ordered: 1000 },
                { name: "CELOSIA KIMONO SALMON PINK", perPot: 1, ordered: 1000 },
                { name: "CELOSIA KIMONO YELLOW", perPot: 1, ordered: 0 }, // ordered is on the standalone row
              ],
              "SUPERCAL PREMIUM BONFIRE MIX": [
                { name: "SUPERCAL CARAMEL YELLOW", perPot: 2, ordered: 100 },
                { name: "SUPERCAL CINNAMON", perPot: 2, ordered: 100 },
                { name: "SUPERCAL PREMIUM FRENCH VANILLA", perPot: 2, ordered: 0 }, // ordered is on the straight row
              ],
              "SUPERCAL PREMIUM CITRUS MIX": [
                { name: "SUPERCAL PEARL WHITE", perPot: 2, ordered: 100 },
                { name: "SUPERCAL SUNSET ORANGE", perPot: 2, ordered: 100 },
                { name: "SUPERCAL YELLOW SUN", perPot: 2, ordered: 0 }, // split across citrus + gumball
              ],
              "SUPERCAL GUMBALL MIX": [
                { name: "SUPERCAL PINK MIST", perPot: 2, ordered: 100 },
                { name: "SUPERCAL ROSE STAR", perPot: 2, ordered: 100 },
                { name: "SUPERCAL YELLOW SUN", perPot: 2, ordered: 200 }, // 200 ordered total for yellow sun
              ],
            };

            // Check if this is a known mix
            const mixKey = Object.keys(MIX_DEFS).find(k => variety.includes(k));
            if (isMix && mixKey) {
              const components = MIX_DEFS[mixKey];
              components.forEach(mc => {
                if (!consolidated[mc.name]) {
                  consolidated[mc.name] = { variety: mc.name, category: i.category, shipWeek: i.shipWeek, plantWeek: i.plantWeek, propMethod: i.propMethod, seedsPerPot: mc.perPot, seedsOrdered: mc.ordered || 0, seedsOnHand: 0, seedShortage: false, seedOrderNumber: i.seedOrderNumber, germinationRate: i.germinationRate || null, qty: 0, seedsNeededOverride: 0, usedIn: [] };
                } else if (mc.ordered) {
                  consolidated[mc.name].seedsOrdered += mc.ordered; // accumulate if shared across mixes
                }
                consolidated[mc.name].qty += qty;
                consolidated[mc.name].seedsNeededOverride += qty * mc.perPot;
                consolidated[mc.name].usedIn.push({ product: i.variety, pots: qty, seedsPerPot: mc.perPot });
              });
            } else {
              const key = variety;
              if (!consolidated[key]) {
                consolidated[key] = { variety: i.variety, category: i.category, shipWeek: i.shipWeek, plantWeek: i.plantWeek, propMethod: i.propMethod, seedsPerPot: i.seedsPerPot || 0, seedsOrdered: 0, seedsOnHand: 0, seedShortage: i.seedShortage || false, seedOrderNumber: i.seedOrderNumber || null, germinationRate: i.germinationRate || null, qty: 0, seedsNeededOverride: 0, usedIn: [] };
              }
              // Take max seedsOrdered/seedsOnHand across all rows (they should all be the same for a variety's total order)
              if ((i.seedsOrdered || 0) > consolidated[key].seedsOrdered) consolidated[key].seedsOrdered = i.seedsOrdered;
              if ((i.seedsOnHand || 0) > consolidated[key].seedsOnHand) consolidated[key].seedsOnHand = i.seedsOnHand;
              if (!consolidated[key].seedOrderNumber && i.seedOrderNumber) consolidated[key].seedOrderNumber = i.seedOrderNumber;
              if (!consolidated[key].seedsPerPot && i.seedsPerPot) consolidated[key].seedsPerPot = i.seedsPerPot;
              consolidated[key].qty += qty;
              const spp = i.seedsPerPot || 0;
              consolidated[key].seedsNeededOverride += qty * spp;
              consolidated[key].usedIn.push({ product: i.variety, pots: qty, seedsPerPot: spp });
            }
          });
          const rows = Object.values(consolidated).sort((a, b) => (a.variety || "").localeCompare(b.variety || ""));
          const wkQty = rows.reduce((s, r) => s + r.seedsNeededOverride, 0);
          return (
            <div key={sowWeek} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a" }}>{sowWeek}</span>
                  <span style={{ fontSize: 12, color: "#7a8c74", marginLeft: 10 }}>{rows.length} {rows.length === 1 ? "variety" : "varieties"} / {fmtN(wkQty)} total</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: "#fafcf8", borderBottom: "1px solid #e0ead8" }}>
                      <th style={thStyle}>Variety</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Plant Wk</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Pots</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{propTab === "seed" ? "Seeds/Pot" : "/Plant"}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{propTab === "seed" ? "Seeds Needed" : "Cuttings"}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Germ %</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>{propTab === "seed" ? "Seeds to Sow" : "To Stick"}</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Ordered</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>On Hand</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const propBadge = PROP_BADGE[r.propMethod];
                      const seedsNeeded = r.seedsNeededOverride || (r.seedsPerPot > 0 ? r.qty * r.seedsPerPot : r.qty);
                      const germRate = r.germinationRate ? r.germinationRate / 100 : 1;
                      const seedsToSow = germRate < 1 ? Math.ceil(seedsNeeded / germRate / 100) * 100 : seedsNeeded;
                      const hasUsedIn = r.usedIn && r.usedIn.length > 1;
                      const totalAvail = (r.seedsOrdered || 0) + (r.seedsOnHand || 0);
                      const isShort = seedsToSow > totalAvail && totalAvail > 0;
                      return (<React.Fragment key={r.variety || idx}>
                      <tr style={{ borderBottom: r.usedIn?.length > 1 ? "none" : "1px solid #f0f5ee", background: isShort ? "#fff3f1" : r.seedShortage ? "#fff3f1" : idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                        <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>
                          {r.variety}
                          {r.seedOrderNumber && <span style={{ marginLeft: 6, fontSize: 9, color: "#7a8c74" }}>#{r.seedOrderNumber}</span>}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {propBadge ? <span style={{ background: propBadge.bg, color: propBadge.color, borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{propBadge.label}</span> : <span style={{ fontSize: 11, color: "#7a8c74" }}>{r.propMethod || "—"}</span>}
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: "#4a90d9", fontWeight: 700 }}>{r.plantWeek}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtN(r.qty)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#7a8c74" }}>{r.seedsPerPot || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1e2d1a" }}>{fmtN(seedsNeeded)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <input type="number" defaultValue={r.germinationRate || ""} placeholder="%"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value) || 0;
                              for (const item of sowItems.filter(i => (i.variety || "").toUpperCase() === (r.variety || "").toUpperCase())) {
                                await upsert({ ...item, germinationRate: val });
                              }
                            }}
                            style={{ width: 45, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e0ead8", fontSize: 12, fontFamily: "inherit", textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 800, color: "#c8791a" }}>{fmtN(seedsToSow)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#7a8c74" }}>{r.seedsOrdered ? fmtN(r.seedsOrdered) : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          <input type="number" defaultValue={r.seedsOnHand || ""} placeholder="0"
                            onBlur={async (e) => {
                              const val = parseInt(e.target.value) || 0;
                              for (const item of sowItems.filter(i => (i.variety || "").toUpperCase() === (r.variety || "").toUpperCase())) {
                                await upsert({ ...item, seedsOnHand: val });
                              }
                            }}
                            style={{ width: 60, padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e0ead8", fontSize: 12, fontFamily: "inherit", textAlign: "right" }} />
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {isShort || r.seedShortage
                            ? <span style={{ background: "#fde8e8", color: "#d94f3d", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>SHORT {isShort ? fmtN(seedsToSow - totalAvail) : ""}</span>
                            : totalAvail > 0
                              ? <span style={{ background: "#e8f5e0", color: "#4a7a35", borderRadius: 10, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>OK +{fmtN(totalAvail - seedsToSow)}</span>
                              : <span style={{ color: "#7a8c74", fontSize: 10 }}>—</span>}
                        </td>
                      </tr>
                      {r.usedIn && r.usedIn.length > 1 && (
                        <tr style={{ background: "#fafcf8", borderBottom: "1px solid #f0f5ee" }}>
                          <td colSpan={11} style={{ padding: "2px 10px 6px 30px" }}>
                            <div style={{ fontSize: 10, color: "#7a8c74" }}>
                              {r.usedIn.map((u, ui) => (
                                <span key={ui} style={{ marginRight: 14 }}>
                                  <span style={{ fontWeight: 700, color: "#1e2d1a" }}>{u.product}</span>: {fmtN(u.pots)} pots × {u.seedsPerPot} seed{u.seedsPerPot !== 1 ? "s" : ""} = {fmtN(u.pots * u.seedsPerPot)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>);
                    })}
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
// ── ORDERS TAB ───────────────────────────────────────────────────────────────
// View all plants on order grouped by order number / supplier
// ══════════════════════════════════════════════════════════════════════════════
function OrdersTab({ items }) {
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [pdfUrls, setPdfUrls] = useState({});
  const sb = getSupabase();

  const isCancelled = (status) => {
    if (!status) return false;
    const s = status.toUpperCase();
    return s === "CANCELLED" || s === "NOT NEEDED";
  };

  // Build order-level rollup
  const orders = useMemo(() => {
    const map = {};
    items.filter(i => i.orderNumber).forEach(i => {
      const key = i.orderNumber;
      if (!map[key]) map[key] = {
        orderNumber: key,
        supplier: i.supplier || "Unknown Supplier",
        broker: i.broker || null,
        confirmationPdfPath: i.confirmationPdfPath || null,
        lines: [],
        categories: new Set(),
        shipWeeks: new Set(),
      };
      if (i.confirmationPdfPath && !map[key].confirmationPdfPath) map[key].confirmationPdfPath = i.confirmationPdfPath;
      map[key].lines.push(i);
      map[key].categories.add(i.category);
      if (i.shipWeek) map[key].shipWeeks.add(i.shipWeek);
    });
    return Object.values(map).sort((a, b) => {
      const weekNum = (sw) => { const m = [...sw].sort()[0]?.match(/\d+/); return m ? parseInt(m[0]) : 99; };
      return weekNum(a.shipWeeks) - weekNum(b.shipWeeks) || a.orderNumber.localeCompare(b.orderNumber);
    });
  }, [items]);

  // Build variety-level rollup within each order
  function buildVarietyRows(lines) {
    const map = {};
    lines.forEach(i => {
      const key = `${i.variety}||${i.category}||${i.shipWeek}||${i.propMethod}`;
      if (!map[key]) map[key] = {
        variety: i.variety,
        category: i.category,
        shipWeek: i.shipWeek,
        propMethod: i.propMethod,
        ppp: parseInt(i.ppp) || 1,
        pots: 0,
        ordQty: 0,
        extras: 0,
        cost: 0,
        status: i.status,
        benches: 0,
      };
      const e = map[key];
      e.pots += parseInt(i.qty) || 0;
      e.ordQty += parseInt(i.ordQty) || 0;
      e.extras += parseInt(i.extras) || 0;
      e.cost += parseFloat(i.cost) || 0;
      e.benches++;
      if (i.status) e.status = i.status;
    });
    return Object.values(map).sort((a, b) => a.category.localeCompare(b.category) || a.variety.localeCompare(b.variety));
  }

  // Filters
  const allCategories = useMemo(() => [...new Set(items.filter(i => i.orderNumber).map(i => i.category))].sort(), [items]);
  const allSuppliers = useMemo(() => [...new Set(orders.map(o => o.supplier))].sort(), [orders]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (supplierFilter !== "all") result = result.filter(o => o.supplier === supplierFilter);
    if (categoryFilter !== "all") result = result.filter(o => o.categories.has(categoryFilter));
    return result;
  }, [orders, categoryFilter, supplierFilter]);

  // Totals — "confirmed" and "extras" only count non-cancelled items
  const totals = useMemo(() => {
    let ordered = 0, confirmed = 0, extras = 0, cost = 0;
    filteredOrders.forEach(o => o.lines.forEach(i => {
      ordered += parseInt(i.ordQty) || 0;
      cost += parseFloat(i.cost) || 0;
      if (!isCancelled(i.status)) {
        confirmed += (parseInt(i.qty) || 0) * (parseInt(i.ppp) || 1);
        extras += parseInt(i.extras) || 0;
      }
    }));
    return { ordered, confirmed, extras, cost };
  }, [filteredOrders]);

  // Load PDF signed URLs for expanded orders
  useEffect(() => {
    if (!sb || !expandedOrder) return;
    const order = orders.find(o => o.orderNumber === expandedOrder);
    if (!order?.confirmationPdfPath || pdfUrls[expandedOrder]) return;
    sb.storage.from("order-confirmations").createSignedUrl(order.confirmationPdfPath, 3600).then(({ data }) => {
      if (data?.signedUrl) setPdfUrls(prev => ({ ...prev, [expandedOrder]: data.signedUrl }));
    });
  }, [expandedOrder, orders, sb, pdfUrls]);

  const chipStyle = (active, color) => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
    background: active ? color : "#f2f5ef", color: active ? "#fff" : "#7a8c74", fontFamily: "inherit",
  });

  const statusBadge = (status) => {
    if (!status) return null;
    const s = status.toUpperCase();
    if (s === "CANCELLED") return { bg: "#fde8e8", color: "#d94f3d", label: "CANCELLED" };
    if (s === "NOT NEEDED") return { bg: "#fde8e8", color: "#d94f3d", label: "NOT NEEDED" };
    if (s === "SHORT") return { bg: "#fff4e8", color: "#c8791a", label: "SHORT" };
    return null;
  };

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={{ ...card, padding: "14px 18px", margin: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Orders</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a", marginTop: 4 }}>{filteredOrders.length}</div>
        </div>
        <div style={{ ...card, padding: "14px 18px", margin: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Ordered</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#4a90d9", marginTop: 4 }}>{fmtN(totals.ordered)}</div>
        </div>
        <div style={{ ...card, padding: "14px 18px", margin: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Confirmed</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#4a7a35", marginTop: 4 }}>{fmtN(totals.confirmed)}</div>
          {totals.ordered !== totals.confirmed && totals.ordered > 0 && <div style={{ fontSize: 10, color: "#c8791a", marginTop: 2 }}>{totals.ordered > totals.confirmed ? `${fmtN(totals.ordered - totals.confirmed)} short` : `${fmtN(totals.confirmed - totals.ordered)} over`}</div>}
        </div>
        <div style={{ ...card, padding: "14px 18px", margin: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Extras</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#c8791a", marginTop: 4 }}>{fmtN(totals.extras)}</div>
        </div>
        <div style={{ ...card, padding: "14px 18px", margin: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Total Cost</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e2d1a", marginTop: 4 }}>{fmt$(totals.cost)}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: "12px 18px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Supplier</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => setSupplierFilter("all")} style={chipStyle(supplierFilter === "all", "#1e2d1a")}>All</button>
            {allSuppliers.map(s => <button key={s} onClick={() => setSupplierFilter(s)} style={chipStyle(supplierFilter === s, "#1e2d1a")}>{s}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginBottom: 6 }}>Category</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => setCategoryFilter("all")} style={chipStyle(categoryFilter === "all", "#1e2d1a")}>All</button>
            {allCategories.map(c => <button key={c} onClick={() => setCategoryFilter(c)} style={chipStyle(categoryFilter === c, "#1e2d1a")}>{c}</button>)}
          </div>
        </div>
      </div>

      {/* Order cards */}
      {filteredOrders.map(order => {
        const isExpanded = expandedOrder === order.orderNumber;
        const lines = categoryFilter !== "all" ? order.lines.filter(l => l.category === categoryFilter) : order.lines;
        const rows = buildVarietyRows(lines);
        const orderOrdered = lines.reduce((s, i) => s + (parseInt(i.ordQty) || 0), 0);
        const confirmedLines = lines.filter(i => !isCancelled(i.status));
        const orderConfirmed = confirmedLines.reduce((s, i) => s + (parseInt(i.qty) || 0) * (parseInt(i.ppp) || 1), 0);
        const orderExtras = confirmedLines.reduce((s, i) => s + (parseInt(i.extras) || 0), 0);
        const orderCost = lines.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0);
        const cancelledCount = rows.filter(r => isCancelled(r.status)).length;
        const shipWeeks = [...order.shipWeeks].sort();
        const shipLabel = shipWeeks.length === 1 ? shipWeeks[0] : shipWeeks.length > 1 ? `${shipWeeks[0]}–${shipWeeks[shipWeeks.length - 1]}` : "";

        return (
          <div key={order.orderNumber} style={{ ...card, padding: 0, overflow: "hidden" }}>
            {/* Order header */}
            <div onClick={() => setExpandedOrder(isExpanded ? null : order.orderNumber)}
              style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                background: isExpanded ? "#f0f8eb" : "#fff", borderBottom: isExpanded ? "1.5px solid #c8e0b8" : "none" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>
                  Order #{order.orderNumber}
                  {order.confirmationPdfPath && <span style={{ marginLeft: 8, fontSize: 11, color: "#4a90d9" }}>📄 PDF</span>}
                  {cancelledCount > 0 && <span style={{ marginLeft: 8, fontSize: 10, background: "#fde8e8", color: "#d94f3d", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{cancelledCount} cancelled</span>}
                </div>
                <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>
                  {order.supplier}{order.broker ? ` (via ${order.broker})` : ""} — {[...order.categories].sort().join(", ")}
                  {shipLabel && <span style={{ marginLeft: 8, background: "#e8f0e3", color: "#4a7a35", padding: "1px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{shipLabel}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, color: "#4a90d9" }}>{fmtN(orderOrdered)} ordered</div>
                  <div style={{ color: orderOrdered !== orderConfirmed && orderOrdered > 0 ? "#c8791a" : "#4a7a35", fontWeight: 700 }}>{fmtN(orderConfirmed)} confirmed{orderExtras > 0 ? ` · ${fmtN(orderExtras)} extras` : ""}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{fmt$(orderCost)}</div>
                <div style={{ fontSize: 18, color: "#7a8c74" }}>{isExpanded ? "▲" : "▼"}</div>
              </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: "0" }}>
                {/* PDF link */}
                {pdfUrls[order.orderNumber] && (
                  <div style={{ padding: "10px 18px", background: "#f8fbf5", borderBottom: "1px solid #e0ead8" }}>
                    <a href={pdfUrls[order.orderNumber]} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#4a90d9", fontWeight: 700, textDecoration: "none" }}>
                      📄 View Order Confirmation PDF — #{order.orderNumber}
                    </a>
                  </div>
                )}

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                    <thead>
                      <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
                        <th style={{ padding: 8, textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Variety</th>
                        <th style={{ padding: 8, textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Category</th>
                        <th style={{ padding: 8, textAlign: "center", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Ship Wk</th>
                        <th style={{ padding: 8, textAlign: "center", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Prop</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#4a90d9", textTransform: "uppercase" }}>Ordered</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#4a7a35", textTransform: "uppercase" }}>Confirmed</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#c8791a", textTransform: "uppercase" }}>Extras</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>PPP</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Pots</th>
                        <th style={{ padding: 8, textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Cost</th>
                        <th style={{ padding: 8, textAlign: "center", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const badge = statusBadge(r.status);
                        const rowCancelled = badge && (r.status.toUpperCase() === "CANCELLED" || r.status.toUpperCase() === "NOT NEEDED");
                        const confirmed = r.pots * r.ppp;
                        const mismatch = r.ordQty > 0 && confirmed > 0 && r.ordQty !== confirmed;
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid #f0f5ee", background: rowCancelled ? "#fef8f8" : mismatch ? "#fffbf0" : idx % 2 === 0 ? "#fff" : "#fafcf8",
                            opacity: rowCancelled ? 0.5 : 1, textDecoration: rowCancelled ? "line-through" : "none" }}>
                            <td style={{ padding: 8, fontSize: 12, fontWeight: 700, color: "#1e2d1a" }}>{r.variety}</td>
                            <td style={{ padding: 8, fontSize: 11, color: "#7a8c74" }}>{r.category}</td>
                            <td style={{ padding: 8, fontSize: 11, color: "#7a8c74", textAlign: "center" }}>{r.shipWeek}</td>
                            <td style={{ padding: 8, fontSize: 10, textAlign: "center" }}>
                              {r.propMethod && <span style={{ background: r.propMethod === "SEED" ? "#fff4e8" : r.propMethod === "URC" ? "#f5f0ff" : "#f0f8eb",
                                color: r.propMethod === "SEED" ? "#c8791a" : r.propMethod === "URC" ? "#8e44ad" : "#4a7a35",
                                padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{r.propMethod}</span>}
                            </td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 800, color: "#4a90d9", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.ordQty)}</td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 700, color: mismatch ? "#c8791a" : "#4a7a35", fontVariantNumeric: "tabular-nums" }}>{fmtN(confirmed)}{mismatch && <span style={{ fontSize: 9, color: "#c8791a", marginLeft: 4 }}>{confirmed < r.ordQty ? "▼" : "▲"}</span>}</td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#c8791a", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.extras)}</td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 11, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{r.ppp}</td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 11, color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.pots)}</td>
                            <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmt$(r.cost)}</td>
                            <td style={{ padding: 8, textAlign: "center" }}>
                              {badge && <span style={{ background: badge.bg, color: badge.color, padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{badge.label}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: "2px solid #e0ead8", background: "#fafcf8" }}>
                        <td colSpan={4} style={{ padding: 8, fontSize: 12, fontWeight: 800, color: "#1e2d1a" }}>Total — {rows.length} varieties ({rows.filter(r => !isCancelled(r.status)).length} confirmed)</td>
                        <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 800, color: "#4a90d9" }}>{fmtN(orderOrdered)}</td>
                        <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 800, color: "#4a7a35" }}>{fmtN(orderConfirmed)}</td>
                        <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 800, color: "#c8791a" }}>{fmtN(orderExtras)}</td>
                        <td colSpan={2} />
                        <td style={{ padding: 8, textAlign: "right", fontSize: 12, fontWeight: 800, color: "#1e2d1a" }}>{fmt$(orderCost)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filteredOrders.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "40px 20px", color: "#7a8c74" }}>
          No orders found{supplierFilter !== "all" || categoryFilter !== "all" ? " matching filters" : ""}.
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── INPUTS TAB ───────────────────────────────────────────────────────────────
// Pull inputs from the general library and allocate their cost across program items
// ══════════════════════════════════════════════════════════════════════════════
function InputsTab({ year, items, programInputs, inputsLibrary, insertProgramInput, updateProgramInput, removeProgramInput }) {
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [qty, setQty] = useState("");
  const [method, setMethod] = useState("soil_volume");
  const [search, setSearch] = useState("");

  // Join programInputs with library data
  const joined = useMemo(() => programInputs.map(pi => {
    const lib = inputsLibrary.find(l => l.id === pi.inputId);
    return { ...pi, libraryItem: lib };
  }), [programInputs, inputsLibrary]);

  // Total soil volume for allocation base
  const totalSoilVol = useMemo(() =>
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED")
      .reduce((s, i) => s + (parseFloat(i.qty) || 0) * potCuFtFor(i), 0)
  , [items]);

  const totalPots = useMemo(() =>
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED")
      .reduce((s, i) => s + (parseFloat(i.qty) || 0), 0)
  , [items]);

  const totalInputsCost = joined.reduce((s, p) => s + (parseFloat(p.totalCost) || 0), 0);

  // Library filtered by search
  const libMatches = useMemo(() => {
    if (!search || search.length < 2) return inputsLibrary.slice(0, 10);
    const q = search.toLowerCase();
    return inputsLibrary.filter(l =>
      (l.name || "").toLowerCase().includes(q) ||
      (l.category || "").toLowerCase().includes(q) ||
      (l.supplier || "").toLowerCase().includes(q)
    ).slice(0, 15);
  }, [search, inputsLibrary]);

  async function addInput() {
    const lib = inputsLibrary.find(l => l.id === selectedId);
    if (!lib || !qty) return;
    const quantity = parseFloat(qty) || 0;
    const unitCost = parseFloat(lib.costPerUnit) || 0;
    const totalCost = quantity * unitCost;
    await insertProgramInput({
      id: crypto.randomUUID(),
      year,
      inputId: lib.id,
      name: lib.name,
      category: lib.category,
      supplier: lib.supplier,
      quantity,
      unit: lib.unitSizeUnit || "unit",
      unitCost,
      totalCost,
      allocationMethod: method,
    });
    setSelectedId(""); setQty(""); setSearch(""); setAdding(false);
  }

  return (
    <div>
      <div style={{ ...card, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>Program Inputs — {year}</div>
            <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
              {totalPots.toLocaleString()} pots · {totalSoilVol.toFixed(1)} cu ft soil total · {joined.length} input{joined.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#7a8c74", fontWeight: 700, textTransform: "uppercase" }}>Total Inputs Cost</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#4a7a35" }}>{fmt$(totalInputsCost)}</div>
            <div style={{ fontSize: 11, color: "#7a8c74" }}>
              {totalPots > 0 ? fmt$(totalInputsCost / totalPots) : "—"}/pot (avg)
            </div>
          </div>
        </div>

        {joined.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#7a8c74", fontSize: 13, border: "1.5px dashed #c8d8c0", borderRadius: 10 }}>
            No inputs added yet. Pull one from the library below.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {joined.map(p => (
              <div key={p.id} style={{ padding: "12px 14px", background: "#fafcf8", border: "1px solid #e0ead8", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 2 }}>
                    {p.category}{p.supplier ? ` · ${p.supplier}` : ""}{p.libraryItem ? " · from library" : " · (unlinked)"}
                  </div>
                  <div style={{ fontSize: 12, color: "#1e2d1a", marginTop: 6 }}>
                    {p.quantity} {p.unit} × {fmt$(p.unitCost)} = <strong>{fmt$(p.totalCost)}</strong>
                  </div>
                  <div style={{ fontSize: 10, color: "#7a8c74", marginTop: 2 }}>
                    Allocated by: {p.allocationMethod === "soil_volume" ? "soil volume" : p.allocationMethod === "per_pot" ? "per pot (even)" : p.allocationMethod}
                    {p.allocationMethod === "soil_volume" && totalSoilVol > 0 && <span> · {fmt$(p.totalCost / totalSoilVol)}/cu ft</span>}
                    {p.allocationMethod === "per_pot" && totalPots > 0 && <span> · {fmt$(p.totalCost / totalPots)}/pot</span>}
                  </div>
                </div>
                <button onClick={() => { if (window.confirm(`Remove "${p.name}" from ${year} program?`)) removeProgramInput(p.id); }}
                  style={{ background: "none", border: "none", color: "#d94f3d", fontSize: 18, cursor: "pointer" }}>🗑</button>
              </div>
            ))}
          </div>
        )}

        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ ...BTN, marginTop: 14 }}>+ Pull from Inputs Library</button>
        ) : (
          <div style={{ marginTop: 14, padding: 14, background: "#f2f5ef", borderRadius: 10, border: "1.5px solid #c8d8c0" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Pull from library</div>
            {!selectedId ? (
              <>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search library (name, category, supplier)..." autoFocus
                  style={{ ...IS(true), marginBottom: 8 }} />
                {inputsLibrary.length === 0 && (
                  <div style={{ fontSize: 12, color: "#d94f3d", padding: 10, background: "#fff3f1", borderRadius: 8 }}>
                    ⚠ No items in the inputs library yet. Add them via the Libraries section first.
                  </div>
                )}
                {libMatches.length > 0 && (
                  <div style={{ maxHeight: 240, overflowY: "auto", background: "#fff", border: "1px solid #e0ead8", borderRadius: 8 }}>
                    {libMatches.map(lib => (
                      <button key={lib.id} onClick={() => setSelectedId(lib.id)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid #f0f5ee", cursor: "pointer", fontFamily: "inherit" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{lib.name}</div>
                        <div style={{ fontSize: 11, color: "#7a8c74" }}>
                          {lib.category || "Uncategorized"}{lib.supplier ? ` · ${lib.supplier}` : ""}{lib.costPerUnit ? ` · ${fmt$(lib.costPerUnit)}/${lib.unitSizeUnit || "unit"}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (() => {
              const lib = inputsLibrary.find(l => l.id === selectedId);
              return (
                <>
                  <div style={{ padding: "10px 12px", background: "#fff", border: "1.5px solid #7fb069", borderRadius: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{lib?.name}</div>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>
                      {lib?.category}{lib?.supplier ? ` · ${lib.supplier}` : ""} · {fmt$(lib?.costPerUnit)}/{lib?.unitSizeUnit || "unit"}
                    </div>
                  </div>
                  <FL>Expected quantity this season ({lib?.unitSizeUnit || "unit"}s)</FL>
                  <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 720 bags"
                    style={{ ...IS(!!qty), marginBottom: 8 }} />
                  {qty && <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 8 }}>Total cost: {fmt$((parseFloat(qty) || 0) * (parseFloat(lib?.costPerUnit) || 0))}</div>}
                  <FL>Allocation method</FL>
                  <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...IS(true), marginBottom: 10 }}>
                    <option value="soil_volume">Soil volume (larger pots get more)</option>
                    <option value="per_pot">Per pot (even split)</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setSelectedId(""); setQty(""); }} style={BTN_SEC}>← Back</button>
                    <button onClick={addInput} disabled={!qty} style={{ ...BTN, flex: 1, opacity: qty ? 1 : 0.5 }}>Add to program</button>
                  </div>
                </>
              );
            })()}
            <button onClick={() => { setAdding(false); setSelectedId(""); setQty(""); }} style={{ ...BTN_SEC, marginTop: 10, width: "100%" }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Per-category allocation preview */}
      {joined.length > 0 && totalSoilVol > 0 && (
        <div style={{ ...card, padding: "18px 20px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 10 }}>Allocation Preview — Input Cost per Pot by Category</div>
          <div style={{ fontSize: 11, color: "#7a8c74", marginBottom: 12 }}>
            Soil volume used for allocation: larger pots pay proportionally more
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
                <th style={{ padding: 8, textAlign: "left", fontWeight: 800, color: "#7a8c74" }}>Category</th>
                <th style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "#7a8c74" }}>Pots</th>
                <th style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "#7a8c74" }}>Cu Ft/Pot</th>
                <th style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "#7a8c74" }}>$/Pot</th>
                <th style={{ padding: 8, textAlign: "right", fontWeight: 800, color: "#7a8c74" }}>Total $</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const byCategory = {};
                items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED").forEach(i => {
                  const key = i.category || "Unknown";
                  if (!byCategory[key]) byCategory[key] = { pots: 0, cuFtPer: potCuFtFor(i) };
                  byCategory[key].pots += parseFloat(i.qty) || 0;
                });
                const soilVolCost = totalInputsCost / totalSoilVol;
                return Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([cat, d]) => {
                  const perPot = d.cuFtPer * soilVolCost;
                  const total = d.pots * perPot;
                  return (
                    <tr key={cat} style={{ borderBottom: "1px solid #f0f5ee" }}>
                      <td style={{ padding: 8, fontWeight: 700, color: "#1e2d1a" }}>{cat}</td>
                      <td style={{ padding: 8, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(d.pots)}</td>
                      <td style={{ padding: 8, textAlign: "right", color: "#7a8c74" }}>{d.cuFtPer.toFixed(3)}</td>
                      <td style={{ padding: 8, textAlign: "right", color: "#4a7a35", fontWeight: 700 }}>{fmt$(perPot)}</td>
                      <td style={{ padding: 8, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt$(total)}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COST ESTIMATE TAB ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function CostTab({ items, containers, soilMixes, programInputs = [] }) {
  const defaultSoil = pickDefaultSoil(soilMixes);
  const soilCpf = soilCostPerCuFt(defaultSoil);

  const [shipFilter, setShipFilter] = useState("all");
  const [plantFilter, setPlantFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const shipWeeks = useMemo(() => [...new Set(items.map(i => i.shipWeek).filter(Boolean))].sort(), [items]);
  const plantWeeks = useMemo(() => [...new Set(items.map(i => i.plantWeek).filter(Boolean))].sort(), [items]);
  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);

  const filteredItems = useMemo(() => {
    let r = items;
    if (shipFilter !== "all") r = r.filter(i => i.shipWeek === shipFilter);
    if (plantFilter !== "all") r = r.filter(i => i.plantWeek === plantFilter);
    if (categoryFilter !== "all") r = r.filter(i => i.category === categoryFilter);
    return r;
  }, [items, shipFilter, plantFilter, categoryFilter]);

  // Total cu ft + pot count across all items for input allocation
  const allTotals = useMemo(() => {
    let totalCuFt = 0;
    let totalPots = 0;
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED").forEach(i => {
      const container = pickContainerForCategory(i.category, containers);
      const cuFt = container ? volumeToCuFt(container.volumeVal, container.volumeUnit) : potCuFtFor(i);
      const qty = parseFloat(i.qty) || 0;
      totalCuFt += qty * cuFt;
      totalPots += qty;
    });
    return { totalCuFt, totalPots };
  }, [items, containers]);

  // Input cost per cu ft / per pot (for overhead allocation)
  const soilVolInputs = programInputs.filter(p => (p.allocationMethod || "soil_volume") === "soil_volume").reduce((s, p) => s + (parseFloat(p.totalCost) || 0), 0);
  const perPotInputs = programInputs.filter(p => p.allocationMethod === "per_pot").reduce((s, p) => s + (parseFloat(p.totalCost) || 0), 0);
  const inputCostPerCuFt = allTotals.totalCuFt > 0 ? soilVolInputs / allTotals.totalCuFt : 0;
  const inputCostPerPotFixed = allTotals.totalPots > 0 ? perPotInputs / allTotals.totalPots : 0;
  const totalInputsCost = soilVolInputs + perPotInputs;

  // Compute per-row cost: liner + soil + pot + inputs
  const costRows = useMemo(() => {
    const map = {};
    filteredItems.forEach(i => {
      const key = normalizeCategoryForPricing(i.category || "Other");
      const container = pickContainerForCategory(i.category, containers);
      const potCost = container ? parseFloat(container.costPerUnit) || 0 : 0;
      const potCuFt = container ? volumeToCuFt(container.volumeVal, container.volumeUnit) : potCuFtFor(i);
      const soilCostPerPot = potCuFt * soilCpf;
      const inputCostPerPot = (potCuFt * inputCostPerCuFt) + inputCostPerPotFixed;
      const linerCostPerPot = (parseFloat(i.qty) || 0) > 0 ? (parseFloat(i.cost) || 0) / parseFloat(i.qty) : 0;

      if (!map[key]) {
        map[key] = {
          category: key,
          container,
          potCost,
          potCuFt,
          soilCostPerPot,
          inputCostPerPot,
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
      e.totalCostPerPot = e.linerCostPerPot + e.soilCostPerPot + e.potCost + e.inputCostPerPot;
      e.totalProductionCost = e.totalCostPerPot * e.totalQty;
      e.totalSoilCost = e.soilCostPerPot * e.totalQty;
      e.totalPotCost = e.potCost * e.totalQty;
      e.totalInputCost = e.inputCostPerPot * e.totalQty;
    });
    return Object.values(map).sort((a, b) => b.totalProductionCost - a.totalProductionCost);
  }, [filteredItems, containers, soilCpf, inputCostPerCuFt, inputCostPerPotFixed]);

  const grand = useMemo(() => ({
    qty: costRows.reduce((s, r) => s + r.totalQty, 0),
    liner: costRows.reduce((s, r) => s + r.totalLinerCost, 0),
    soil: costRows.reduce((s, r) => s + r.totalSoilCost, 0),
    pot: costRows.reduce((s, r) => s + r.totalPotCost, 0),
    inputs: costRows.reduce((s, r) => s + (r.totalInputCost || 0), 0),
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

      {/* Filter chips */}
      <div style={{ ...card, padding: "12px 18px" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Item:</span>
          <button onClick={() => setCategoryFilter("all")} style={chipStyle(categoryFilter === "all", "#1e2d1a")}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)} style={chipStyle(categoryFilter === c, "#1e2d1a")}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Ship Week:</span>
          <button onClick={() => setShipFilter("all")} style={chipStyle(shipFilter === "all", "#c8791a")}>All</button>
          {shipWeeks.map(w => (
            <button key={w} onClick={() => setShipFilter(w)} style={chipStyle(shipFilter === w, "#c8791a")}>{w}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", marginRight: 6 }}>Plant Week:</span>
          <button onClick={() => setPlantFilter("all")} style={chipStyle(plantFilter === "all", "#4a90d9")}>All</button>
          {plantWeeks.map(w => (
            <button key={w} onClick={() => setPlantFilter(w)} style={chipStyle(plantFilter === w, "#4a90d9")}>{w}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KPI label="Total Items" value={fmtN(grand.qty)} color="#7fb069" sub="finished pots" />
        <KPI label="Avg Cost / Pot" value={grand.qty > 0 ? fmt$2(grand.total / grand.qty) : "—"} color="#1e2d1a" sub="liner + soil + pot + inputs" />
        <KPI label="Liner Cost" value={fmt$(grand.liner)} color="#4a90d9" />
        <KPI label="Soil Cost" value={fmt$(grand.soil)} color="#8e44ad" />
        <KPI label="Pot Cost" value={fmt$(grand.pot)} color="#c8791a" />
        <KPI label="Inputs (Fertilizer+)" value={fmt$(grand.inputs)} color="#e89a3a" sub={programInputs.length + " input" + (programInputs.length !== 1 ? "s" : "")} />
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

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// ── PRICING TAB ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function PricingTab({ year, items, containers, soilMixes, programInputs }) {
  const { rows: pricing, upsert: upsertPrice } = useCategoryPricing();
  const defaultSoil = pickDefaultSoil(soilMixes);
  const soilCpf = soilCostPerCuFt(defaultSoil);
  const [expandedCat, setExpandedCat] = useState(null);

  // Compute per-category cost rollup (same logic as CostTab)
  const costByCategory = useMemo(() => {
    let totalCuFt = 0, totalPots = 0;
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED").forEach(i => {
      const container = pickContainerForCategory(i.category, containers);
      const cuFt = container ? volumeToCuFt(container.volumeVal, container.volumeUnit) : potCuFtFor(i);
      const qty = parseFloat(i.qty) || 0;
      totalCuFt += qty * cuFt;
      totalPots += qty;
    });
    const soilVolInputs = programInputs.filter(p => (p.allocationMethod || "soil_volume") === "soil_volume").reduce((s, p) => s + (parseFloat(p.totalCost) || 0), 0);
    const perPotInputs = programInputs.filter(p => p.allocationMethod === "per_pot").reduce((s, p) => s + (parseFloat(p.totalCost) || 0), 0);
    const inputCostPerCuFt = totalCuFt > 0 ? soilVolInputs / totalCuFt : 0;
    const inputCostPerPotFixed = totalPots > 0 ? perPotInputs / totalPots : 0;

    const map = {};
    items.filter(i => (i.status || "").toUpperCase() !== "CANCELLED").forEach(i => {
      const key = normalizeCategoryForPricing(i.category || "Other");
      const container = pickContainerForCategory(i.category, containers);
      const potCost = container ? parseFloat(container.costPerUnit) || 0 : 0;
      const potCuFt = container ? volumeToCuFt(container.volumeVal, container.volumeUnit) : potCuFtFor(i);
      const soilCostPerPot = potCuFt * soilCpf;
      const inputCostPerPot = (potCuFt * inputCostPerCuFt) + inputCostPerPotFixed;
      if (!map[key]) {
        map[key] = {
          category: key,
          container,
          potCost,
          soilCostPerPot,
          inputCostPerPot,
          totalQty: 0,
          totalLinerCost: 0,
        };
      }
      map[key].totalQty += parseFloat(i.qty) || 0;
      map[key].totalLinerCost += parseFloat(i.cost) || 0;
    });
    Object.values(map).forEach(e => {
      e.linerCostPerPot = e.totalQty > 0 ? e.totalLinerCost / e.totalQty : 0;
      e.totalCostPerPot = e.linerCostPerPot + e.soilCostPerPot + e.potCost + e.inputCostPerPot;
    });
    return Object.values(map).sort((a, b) => (b.totalQty || 0) - (a.totalQty || 0));
  }, [items, containers, soilCpf, programInputs]);

  // Pricing lookup by year + category
  const priceByCat = useMemo(() => {
    const m = {};
    pricing.filter(p => p.year === year).forEach(p => { m[p.category] = p; });
    return m;
  }, [pricing, year]);

  async function setPrice(category, proposedPrice, notes) {
    const existing = priceByCat[category];
    await upsertPrice({
      id: existing?.id || crypto.randomUUID(),
      year,
      category,
      proposedPrice: parseFloat(proposedPrice) || 0,
      notes: notes || null,
      updatedAt: new Date().toISOString(),
    });
  }

  const totals = useMemo(() => {
    let cost = 0, revenue = 0;
    costByCategory.forEach(c => {
      const p = priceByCat[c.category]?.proposedPrice || 0;
      cost += c.totalCostPerPot * c.totalQty;
      revenue += p * c.totalQty;
    });
    return { cost, revenue, margin: revenue - cost, marginPct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
  }, [costByCategory, priceByCat]);

  return (
    <div>
      <div style={{ background: "#fff4e8", border: "1.5px solid #e8d0a0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 12, color: "#6a4a20" }}>
        💰 Set a proposed wholesale price per category. Costs include liner + soil + pot + allocated inputs. Prices save automatically as you type.
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Total Cost</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#d94f3d", marginTop: 4 }}>{fmt$(totals.cost)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Projected Revenue</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#4a90d9", marginTop: 4 }}>{fmt$(totals.revenue)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Gross Margin $</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totals.margin >= 0 ? "#4a7a35" : "#d94f3d", marginTop: 4 }}>{fmt$(totals.margin)}</div>
        </div>
        <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase" }}>Gross Margin %</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totals.marginPct >= 30 ? "#4a7a35" : totals.marginPct >= 15 ? "#e89a3a" : "#d94f3d", marginTop: 4 }}>{totals.marginPct.toFixed(1)}%</div>
        </div>
      </div>

      {/* Pricing table */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Category</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Pots</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Liner $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Soil $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Pot $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Inputs $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Cost $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Proposed Price</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Margin $/pot</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Margin %</th>
            </tr>
          </thead>
          <tbody>
            {costByCategory.map(r => {
              const existing = priceByCat[r.category];
              const proposedPrice = parseFloat(existing?.proposedPrice) || 0;
              const marginDollar = proposedPrice - r.totalCostPerPot;
              const marginPct = proposedPrice > 0 ? (marginDollar / proposedPrice) * 100 : 0;
              const isOpen = expandedCat === r.category;
              // Items in this normalized category
              const catItems = items.filter(i => normalizeCategoryForPricing(i.category) === r.category && (i.status || "").toUpperCase() !== "CANCELLED");
              // Build per-item drill-down data
              const itemRows = isOpen ? (() => {
                const perVariety = {};
                catItems.forEach(i => {
                  const v = i.variety || "—";
                  if (!perVariety[v]) perVariety[v] = { variety: v, color: i.color, qty: 0, linerCost: 0, subCategory: i.category };
                  perVariety[v].qty += parseFloat(i.qty) || 0;
                  perVariety[v].linerCost += parseFloat(i.cost) || 0;
                });
                return Object.values(perVariety).map(v => {
                  const linerPerPot = v.qty > 0 ? v.linerCost / v.qty : 0;
                  const totalPerPot = linerPerPot + r.soilCostPerPot + r.potCost + r.inputCostPerPot;
                  const margin = proposedPrice - totalPerPot;
                  const mPct = proposedPrice > 0 ? (margin / proposedPrice) * 100 : 0;
                  return { ...v, linerPerPot, totalPerPot, margin, mPct };
                }).sort((a, b) => b.qty - a.qty);
              })() : [];
              return (
                <React.Fragment key={r.category}>
                <tr onDoubleClick={() => setExpandedCat(isOpen ? null : r.category)}
                    style={{ borderBottom: "1px solid #f0f5ee", cursor: "pointer", background: isOpen ? "#f0f8eb" : "transparent" }}>
                  <td style={{ padding: "10px", fontWeight: 800, color: "#1e2d1a" }}>
                    <span style={{ color: "#7a8c74", marginRight: 6 }}>{isOpen ? "▼" : "▶"}</span>
                    {r.category}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(r.totalQty)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#4a90d9", fontVariantNumeric: "tabular-nums" }}>{fmt$2(r.linerCostPerPot)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#8e44ad", fontVariantNumeric: "tabular-nums" }}>{fmt$2(r.soilCostPerPot)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#c8791a", fontVariantNumeric: "tabular-nums" }}>{fmt$2(r.potCost)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#e89a3a", fontVariantNumeric: "tabular-nums" }}>{fmt$2(r.inputCostPerPot)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 800, color: "#1e2d1a", fontVariantNumeric: "tabular-nums" }}>{fmt$2(r.totalCostPerPot)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }} onDoubleClick={e => e.stopPropagation()}>
                    <input type="number" step="0.01" defaultValue={existing?.proposedPrice || ""} placeholder="0.00"
                      onBlur={e => {
                        if (e.target.value && parseFloat(e.target.value) !== (existing?.proposedPrice || 0)) {
                          setPrice(r.category, e.target.value, existing?.notes);
                        }
                      }}
                      style={{ width: 90, padding: "6px 8px", borderRadius: 6, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", textAlign: "right", fontWeight: 700, color: "#4a7a35" }} />
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 800, color: marginDollar >= 0 ? "#4a7a35" : "#d94f3d", fontVariantNumeric: "tabular-nums" }}>
                    {proposedPrice > 0 ? fmt$2(marginDollar) : "—"}
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 800, color: marginPct >= 30 ? "#4a7a35" : marginPct >= 15 ? "#e89a3a" : marginPct > 0 ? "#c8791a" : "#d94f3d", fontVariantNumeric: "tabular-nums" }}>
                    {proposedPrice > 0 ? marginPct.toFixed(1) + "%" : "—"}
                  </td>
                </tr>
                {isOpen && (
                  <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
                    <td colSpan={10} style={{ padding: "10px 16px 14px 32px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                        {itemRows.length} varieties · prices apply uniformly across category
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e0ead8", color: "#7a8c74" }}>
                            <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Variety</th>
                            <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700 }}>Color</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Pots</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Liner $/pot</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Cost $/pot</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Price</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Margin $</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Margin %</th>
                            <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>Total Margin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itemRows.map(v => (
                            <tr key={v.variety} style={{ borderBottom: "1px solid #f0f5ee" }}>
                              <td style={{ padding: "6px 8px", fontWeight: 700, color: "#1e2d1a" }}>{v.variety}</td>
                              <td style={{ padding: "6px 8px", color: "#7a8c74" }}>
                                {v.color && (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_PALETTE[v.color] || "#7a8c74" }}></span>
                                    {v.color}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtN(v.qty)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", color: "#4a90d9", fontVariantNumeric: "tabular-nums" }}>{fmt$2(v.linerPerPot)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#1e2d1a", fontVariantNumeric: "tabular-nums" }}>{fmt$2(v.totalPerPot)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", color: "#7a8c74", fontVariantNumeric: "tabular-nums" }}>{proposedPrice > 0 ? fmt$2(proposedPrice) : "—"}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: v.margin >= 0 ? "#4a7a35" : "#d94f3d", fontVariantNumeric: "tabular-nums" }}>
                                {proposedPrice > 0 ? fmt$2(v.margin) : "—"}
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: v.mPct >= 30 ? "#4a7a35" : v.mPct >= 15 ? "#e89a3a" : v.mPct > 0 ? "#c8791a" : "#d94f3d", fontVariantNumeric: "tabular-nums" }}>
                                {proposedPrice > 0 ? v.mPct.toFixed(1) + "%" : "—"}
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: v.margin >= 0 ? "#4a7a35" : "#d94f3d", fontVariantNumeric: "tabular-nums" }}>
                                {proposedPrice > 0 ? fmt$(v.margin * v.qty) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SHORTFALLS & SUBSTITUTIONS ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ShortfallsTab({ items }) {
  const shortfalls = useMemo(() => {
    const unconfirmed = items.filter(i => !i.orderNumber);
    const map = {};
    unconfirmed.forEach(i => {
      const key = `${i.variety || ""}||${i.shipWeek || ""}`;
      if (!map[key]) {
        map[key] = {
          variety: i.variety,
          category: i.category,
          color: i.color,
          shipWeek: i.shipWeek,
          plantWeek: i.plantWeek,
          breeder: i.breeder,
          timing: i.timing,
          totalQty: 0,
          locations: [],
        };
      }
      map[key].totalQty += parseFloat(i.qty) || 0;
      map[key].locations.push(i);
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  }, [items]);

  function findSubstitutes(shortfall) {
    const candidates = items.filter(i =>
      i.orderNumber &&
      i.color === shortfall.color &&
      i.category === shortfall.category &&
      i.variety !== shortfall.variety &&
      i.shipWeek === shortfall.shipWeek
    );
    const subMap = {};
    candidates.forEach(c => {
      const k = c.variety;
      if (!subMap[k]) {
        subMap[k] = { variety: k, breeder: c.breeder, totalQty: 0, orderNumber: c.orderNumber };
      }
      subMap[k].totalQty += parseFloat(c.qty) || 0;
    });
    return Object.values(subMap).sort((a, b) => b.totalQty - a.totalQty);
  }

  const totalShortQty = shortfalls.reduce((s, sh) => s + sh.totalQty, 0);

  const colorShortages = useMemo(() => {
    const map = {};
    shortfalls.forEach(s => {
      const k = `${s.category || ""}||${s.shipWeek || ""}||${s.color || "Unknown"}`;
      if (!map[k]) {
        map[k] = { category: s.category, shipWeek: s.shipWeek, color: s.color || "Unknown", shortQty: 0, shortVarieties: 0 };
      }
      map[k].shortQty += s.totalQty;
      map[k].shortVarieties++;
    });
    return Object.values(map).sort((a, b) => b.shortQty - a.shortQty);
  }, [shortfalls]);

  if (shortfalls.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "60px 40px" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#4a7a35", marginBottom: 6 }}>All items confirmed</div>
        <div style={{ fontSize: 13, color: "#7a8c74" }}>No shortfalls found</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: "#fde8e8", border: "1.5px solid #f0c8c0", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#7a3535" }}>
        ⚠ <strong>{shortfalls.length}</strong> unconfirmed varieties totaling <strong>{fmtN(totalShortQty)}</strong> items.
        Substitutes below match same color, category, and ship week of already-confirmed items.
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 12 }}>Shortage Summary</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafcf8" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "1px solid #e0ead8" }}>Category</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "1px solid #e0ead8" }}>Ship Wk</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "1px solid #e0ead8" }}>Color</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "1px solid #e0ead8" }}>Short Qty</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", borderBottom: "1px solid #e0ead8" }}>Varieties</th>
            </tr>
          </thead>
          <tbody>
            {colorShortages.map((cs, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f5ee" }}>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#1e2d1a", fontWeight: 600 }}>{cs.category}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#c8791a", fontWeight: 700 }}>{cs.shipWeek}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_PALETTE[cs.color] || "#7a8c74" }}></span>
                    <span>{cs.color}</span>
                  </span>
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 700, color: "#d94f3d", fontVariantNumeric: "tabular-nums" }}>{fmtN(cs.shortQty)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#7a8c74" }}>{cs.shortVarieties}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", margin: "20px 0 12px 0" }}>Shortfall Detail & Suggested Substitutes</div>
      {shortfalls.map((s, idx) => {
        const subs = findSubstitutes(s);
        return (
          <div key={idx} style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{s.variety}</div>
                <div style={{ fontSize: 11, color: "#7a8c74" }}>
                  {s.category} • {s.shipWeek} • Plant {s.plantWeek} • {s.breeder}
                </div>
              </div>
              {s.color && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: COLOR_PALETTE[s.color] || "#7a8c74", border: "1px solid #e0ead8" }}></span>
                  <span style={{ fontSize: 12, color: "#1e2d1a", fontWeight: 600 }}>{s.color}</span>
                </div>
              )}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#7a8c74", textTransform: "uppercase", fontWeight: 700 }}>Short</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#d94f3d" }}>{fmtN(s.totalQty)}</div>
              </div>
            </div>

            {subs.length === 0 ? (
              <div style={{ fontSize: 12, color: "#aabba0", fontStyle: "italic", padding: "10px 0" }}>
                No matching substitutes (same color + category + ship week) found. Try nearby ship weeks or similar colors.
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4a7a35", textTransform: "uppercase", marginBottom: 6 }}>
                  ✓ {subs.length} potential substitute{subs.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {subs.map(sub => (
                    <div key={sub.variety} style={{ border: "1.5px solid #c8e0b8", background: "#f0f8eb", borderRadius: 10, padding: "8px 12px", minWidth: 200 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#1e2d1a" }}>{sub.variety}</div>
                      <div style={{ fontSize: 10, color: "#7a8c74" }}>{sub.breeder} • Order #{sub.orderNumber}</div>
                      <div style={{ fontSize: 11, color: "#4a7a35", marginTop: 4 }}>
                        Current: <strong>{fmtN(sub.totalQty)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
