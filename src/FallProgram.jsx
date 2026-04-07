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
  GOLD: "#d4a017", LAVENDER: "#b48ce0",
};

const fmt$ = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtN = (n) => Number(n || 0).toLocaleString();

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "items", label: "Items" },
  { id: "color", label: "Color Mix" },
  { id: "schedule", label: "Schedule" },
];

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
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── OVERVIEW ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function OverviewTab({ items, year }) {
  const stats = useMemo(() => {
    const totalQty = items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
    const totalCost = items.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0);
    const varieties = new Set(items.map(i => i.variety)).size;
    const locations = new Set(items.map(i => i.location).filter(Boolean)).size;

    const byCategory = {};
    items.forEach(i => {
      const c = i.category || "Other";
      if (!byCategory[c]) byCategory[c] = { name: c, qty: 0, cost: 0 };
      byCategory[c].qty += parseFloat(i.qty) || 0;
      byCategory[c].cost += parseFloat(i.cost) || 0;
    });
    const cats = Object.values(byCategory).sort((a, b) => b.qty - a.qty);

    const byBreeder = {};
    items.forEach(i => {
      const b = i.breeder || "Unknown";
      if (!byBreeder[b]) byBreeder[b] = { name: b, qty: 0, cost: 0 };
      byBreeder[b].qty += parseFloat(i.qty) || 0;
      byBreeder[b].cost += parseFloat(i.cost) || 0;
    });
    const breeders = Object.values(byBreeder).sort((a, b) => b.qty - a.qty);

    return { totalQty, totalCost, varieties, locations, cats, breeders };
  }, [items]);

  const KPI = ({ label, value, color, sub }) => (
    <div style={{ ...card, padding: "16px 20px", margin: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#1e2d1a", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <KPI label="Total Liners" value={fmtN(stats.totalQty)} color="#7fb069" />
        <KPI label="Liner Cost" value={fmt$(stats.totalCost)} color="#4a7a35" />
        <KPI label="Varieties" value={stats.varieties} color="#4a90d9" />
        <KPI label="Locations" value={stats.locations} color="#8e44ad" />
        <KPI label="Order Lines" value={items.length} color="#1e2d1a" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>By Category</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.cats} layout="vertical" margin={{ left: 140, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#7a8c74" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1e2d1a" }} width={140} />
              <Tooltip formatter={v => fmtN(v)} />
              <Bar dataKey="qty" name="Liners" fill="#7fb069" radius={[0, 6, 6, 0]} />
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
              <Bar dataKey="qty" name="Liners" fill="#4a90d9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COLOR MIX ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ColorTab({ items }) {
  const colorStats = useMemo(() => {
    const byColor = {};
    items.forEach(i => {
      const c = i.color || "UNKNOWN";
      if (!byColor[c]) byColor[c] = { name: c, qty: 0, varieties: new Set(), cost: 0 };
      byColor[c].qty += parseFloat(i.qty) || 0;
      byColor[c].cost += parseFloat(i.cost) || 0;
      byColor[c].varieties.add(i.variety);
    });
    return Object.values(byColor)
      .map(c => ({ ...c, varietyCount: c.varieties.size }))
      .sort((a, b) => b.qty - a.qty);
  }, [items]);

  const totalQty = colorStats.reduce((s, c) => s + c.qty, 0);

  return (
    <div>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#1e2d1a", marginBottom: 16 }}>Color Distribution by Liner Count</div>
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
// ── ITEMS LIST ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function ItemsTab({ items, soilMixes, containers, upsert }) {
  const [searchQ, setSearchQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");

  const categories = useMemo(() => [...new Set(items.map(i => i.category).filter(Boolean))].sort(), [items]);
  const colors = useMemo(() => [...new Set(items.map(i => i.color).filter(Boolean))].sort(), [items]);
  const weeks = useMemo(() => [...new Set(items.map(i => i.shipWeek).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (categoryFilter !== "all") result = result.filter(i => i.category === categoryFilter);
    if (colorFilter !== "all") result = result.filter(i => i.color === colorFilter);
    if (weekFilter !== "all") result = result.filter(i => i.shipWeek === weekFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      result = result.filter(i =>
        (i.variety || "").toLowerCase().includes(q) ||
        (i.location || "").toLowerCase().includes(q) ||
        (i.breeder || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, categoryFilter, colorFilter, weekFilter, searchQ]);

  return (
    <div>
      <div style={{ ...card, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search variety, location, breeder..."
          style={{ ...IS(!!searchQ), maxWidth: 280, fontSize: 14 }} />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ ...IS(false), width: "auto", fontSize: 13 }}>
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={colorFilter} onChange={e => setColorFilter(e.target.value)}
          style={{ ...IS(false), width: "auto", fontSize: 13 }}>
          <option value="all">All Colors</option>
          {colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
          style={{ ...IS(false), width: "auto", fontSize: 13 }}>
          <option value="all">All Weeks</option>
          {weeks.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#7a8c74" }}>
          {filtered.length} of {items.length}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "#fafcf8", borderBottom: "2px solid #e0ead8" }}>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Category</th>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Variety</th>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Color</th>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Location</th>
              <th style={{ padding: "10px", textAlign: "left", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Ship Wk</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Qty</th>
              <th style={{ padding: "10px", textAlign: "right", fontSize: 10, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((i, idx) => (
              <tr key={i.id} style={{ borderBottom: "1px solid #f0f5ee", background: idx % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#7a8c74" }}>{i.category}</td>
                <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{i.variety}</td>
                <td style={{ padding: "8px 10px", fontSize: 12 }}>
                  {i.color && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_PALETTE[i.color] || "#7a8c74" }}></span>
                      <span style={{ color: "#1e2d1a" }}>{i.color}</span>
                    </span>
                  )}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#7a8c74" }}>{i.location}</td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#c8791a", fontWeight: 700 }}>{i.shipWeek}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtN(i.qty)}</td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 12, color: "#4a7a35", fontWeight: 600 }}>{i.cost > 0 ? fmt$(i.cost) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div style={{ padding: "12px", textAlign: "center", fontSize: 12, color: "#aabba0", background: "#fafcf8" }}>
            Showing first 200 of {filtered.length} — refine filters to see more
          </div>
        )}
      </div>
    </div>
  );
}
