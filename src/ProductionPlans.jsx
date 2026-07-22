// Production Plans — top-level planning + profitability view.
// Phase 1: plan list + dashboard + property map (SVG) colored by per-house profit.
// Future phases: per-bench drilldown, inline crop edit, satellite-photo overlays.

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { getSupabase, getCultureClient } from "./supabase";
import { useAuth } from "./Auth";
import { sizeLabelForItem } from "./shared";
import CategoryProfiles from "./CategoryProfiles";
import BasketPlanner from "./BasketPlanner";
import ItemDrill from "./ItemDrill";
import ProgramsPanel from "./ProgramBuilder";

const COLORS = {
  bg:        "#f7f8f5",
  card:      "#ffffff",
  dark:      "#1e2d1a",
  light:     "#7fb069",
  cream:     "#c8e6b8",
  muted:     "#7a8c74",
  text:      "#2d3a26",
  border:    "#e0ead8",
  red:       "#d94f3d",
  amber:     "#e89a3a",
};

// Profit-density color ramp: low → high (deeper green = more profit per sq-ft)
function profitColor(profitPerSqFt) {
  if (profitPerSqFt == null || isNaN(profitPerSqFt)) return "#d6d6d6";
  if (profitPerSqFt <= 0)  return "#e8c4c4";
  if (profitPerSqFt < 1)   return "#fff3e0";
  if (profitPerSqFt < 3)   return "#dcedc8";
  if (profitPerSqFt < 6)   return "#a5d6a7";
  if (profitPerSqFt < 10)  return "#66bb6a";
  if (profitPerSqFt < 20)  return "#388e3c";
  return "#1b5e20";
}

const fmtMoney = (n) => n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct   = (n) => n == null ? "—" : Number(n).toFixed(1) + "%";
// Format a stored 10-digit phone string as (xxx) xxx-xxxx; pass through anything else.
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : (p || ""); };

// Aggressive houseplant description normalization — strips size/pot prefixes and
// packaging suffixes, normalizes quotes, uppercases. Single module-level copy used
// across the Catalog, Presentation, and History tabs (was duplicated 3×).
function normalizeDesc(d) {
  return String(d || "")
    // strip leading "Pot N\"" or "Pot NG" or "Pot N''" prefix
    .replace(/^Pot \d+(\.\d+)?(?:"|G|'')\s*/i, "")
    // strip leading size: '4.5"', '3"', 'HB 6"', etc.
    .replace(/^HB \d+(\.\d+)?"\s*/i, "")
    .replace(/^\d+(\.\d+)?"\s*/, "")
    // strip packaging suffixes
    .replace(/\s*\(Individual\)\s*/gi, "")
    .replace(/\s*\(Case of \d+\)\s*/gi, "")
    .replace(/\s*\(whole flat \d+\)\s*/gi, "")
    .replace(/\s*\(1\/2 flat \d+\)\s*/gi, "")
    // strip redundant 'Plant' suffix INSIDE quotes ('Swiss Cheese Plant' → 'Swiss Cheese')
    .replace(/'\s*([^']+?)\s+Plant\s*'/g, "'$1'")
    // normalize all quote styles to plain '
    .replace(/[‘’‚‛′‵]/g, "'")
    .replace(/[“”„‟″‶]/g, '"')
    // collapse whitespace + case
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export default function ProductionPlans() {
  const sb = getSupabase();
  const { isHouseplantPlanner } = useAuth();
  const [plans, setPlans]             = useState([]);
  const [selectedPlanId, setSelected] = useState(() => { try { return localStorage.getItem("gh_plan_open") || null; } catch { return null; } });
  const [initialTab, setInitialTab]   = useState(() => { try { return localStorage.getItem("gh_plan_tab") || null; } catch { return null; } });
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!sb) { setLoading(false); return; }
    sb.from("production_plans").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        setPlans(data || []);
        if (data?.length && isHouseplantPlanner) {
          // Amanda/Kim/Rachel still land directly in the current houseplant catalog.
          const target = data.find(p => p.name === "Houseplants H1 2027") || data[0];
          setSelected(target.id);
          setInitialTab("catalog");
        }
        setLoading(false);
      });
  }, [sb, isHouseplantPlanner]);

  if (loading) return <div style={{ padding: 40, color: COLORS.muted }}>Loading plans…</div>;
  if (!plans.length) return <div style={{ padding: 40, color: COLORS.muted }}>No production plans yet. Create one in the database to start.</div>;

  const selected = plans.find(p => p.id === selectedPlanId);
  const openPlan = (plan, tab) => {
    const t = tab || nextActionForPlan(plan).tab;
    setInitialTab(t);
    setSelected(plan.id);
    try { localStorage.setItem("gh_plan_open", plan.id); localStorage.setItem("gh_plan_tab", t); } catch {}
  };
  const closePlan = () => { setSelected(null); try { localStorage.removeItem("gh_plan_open"); } catch {} };

  return (
    <div style={{ padding: 24, background: COLORS.bg, minHeight: "100vh" }}>
      {selected ? (
        <>
          <button onClick={closePlan}
            style={{ background: "none", border: "none", color: COLORS.muted, padding: 0, marginBottom: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ← All production plans
          </button>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
            <div>
              <div style={{ color: seasonMeta(selected).color, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.3, marginBottom: 3 }}>
                {seasonMeta(selected).label} · {selected.year}
              </div>
              <h1 style={{ fontFamily: "'DM Serif Display', serif", color: COLORS.dark, margin: 0 }}>
                {selected.name}
              </h1>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {plans.map(p => (
                <button key={p.id} onClick={() => openPlan(p)}
                  style={{
                    padding: "7px 11px", borderRadius: 20,
                    border: `1.5px solid ${selectedPlanId === p.id ? COLORS.dark : COLORS.border}`,
                    background: selectedPlanId === p.id ? COLORS.dark : COLORS.card,
                    color: selectedPlanId === p.id ? "#fff" : COLORS.text,
                    fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                  }}>
                  {seasonMeta(p).label} {p.year}
                </button>
              ))}
            </div>
          </div>
          <PlanDashboard key={selected.id} plan={selected} initialTab={initialTab} />
        </>
      ) : (
        <PlansIndex plans={plans} onOpen={openPlan} />
      )}
    </div>
  );
}

const SEASON_STYLES = {
  fall:        { label: "Fall",        color: "#a85d18", pale: "#fff3e5", mark: "F" },
  winter:      { label: "Winter",      color: "#376c83", pale: "#eaf5f8", mark: "W" },
  spring:      { label: "Spring",      color: "#4f8a3d", pale: "#edf7e8", mark: "S" },
  houseplants: { label: "Houseplants", color: "#416f52", pale: "#e8f3ec", mark: "H" },
  summer:      { label: "Summer",      color: "#a67913", pale: "#fff8df", mark: "S" },
  other:       { label: "Other",       color: COLORS.muted, pale: "#f0f3ed", mark: "P" },
};

function seasonMeta(plan) {
  const text = `${plan?.season || ""} ${plan?.name || ""}`.toLowerCase();
  if (text.includes("houseplant")) return SEASON_STYLES.houseplants;
  if (text.includes("spring")) return SEASON_STYLES.spring;
  if (text.includes("fall") || text.includes("mum")) return SEASON_STYLES.fall;
  if (text.includes("winter") || text.includes("holiday") || text.includes("poinsettia")) return SEASON_STYLES.winter;
  if (text.includes("summer")) return SEASON_STYLES.summer;
  return SEASON_STYLES.other;
}

function statusMeta(status) {
  const key = String(status || "draft").toLowerCase();
  if (key === "active") return { label: "Active", color: "#2f7436", bg: "#e7f5e7" };
  if (key === "archived") return { label: "Archived", color: "#6f786b", bg: "#edf0eb" };
  return { label: key.charAt(0).toUpperCase() + key.slice(1), color: "#9a641b", bg: "#fff1d8" };
}

function nextActionForPlan(plan) {
  const season = seasonMeta(plan).label;
  const archived = String(plan?.status || "").toLowerCase() === "archived";
  if (archived) return { label: "Review archived plan", tab: season === "Houseplants" ? "catalog" : "dashboard" };
  if (season === "Houseplants") return { label: "Review catalog", tab: "catalog" };
  if (season === "Fall") return { label: "Review orders", tab: "orders" };
  if (season === "Winter") return { label: "Review plant schedule", tab: "week" };
  if (season === "Spring") return { label: "Continue plant schedule", tab: "week" };
  return { label: "Open plan dashboard", tab: "dashboard" };
}

function formatLastEdited(plan) {
  const value = plan?.updated_at || plan?.created_at;
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "Not recorded";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PlansIndex({ plans, onOpen }) {
  const sorted = [...plans].sort((a, b) => {
    const statusOrder = { active: 0, draft: 1, archived: 2 };
    const statusDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    if (statusDiff) return statusDiff;
    return (b.year || 0) - (a.year || 0);
  });

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: COLORS.light, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 4 }}>Plan index</div>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", color: COLORS.dark, margin: "0 0 6px", fontSize: 34 }}>
          Production Plans
        </h1>
        <div style={{ color: COLORS.muted, fontSize: 14 }}>Choose a season to pick up the right planning workflow.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 16 }}>
        {sorted.map(plan => {
          const season = seasonMeta(plan);
          const status = statusMeta(plan.status);
          const action = nextActionForPlan(plan);
          return (
            <div key={plan.id} onClick={() => onOpen(plan, action.tab)}
              style={{
                background: COLORS.card, border: `1.5px solid ${COLORS.border}`, borderRadius: 16,
                overflow: "hidden", cursor: "pointer", boxShadow: "0 3px 12px rgba(30,45,26,0.05)",
                display: "flex", flexDirection: "column", minHeight: 245,
              }}>
              <div style={{ height: 8, background: season.color }} />
              <div style={{ padding: 20, display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: season.pale, color: season.color, display: "grid", placeItems: "center", fontFamily: "'DM Serif Display', serif", fontSize: 24, flexShrink: 0 }}>
                      {season.mark}
                    </div>
                    <div>
                      <div style={{ color: season.color, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.2 }}>{season.label}</div>
                      <div style={{ color: COLORS.dark, fontFamily: "'DM Serif Display', serif", fontSize: 22, lineHeight: 1.08 }}>{plan.name}</div>
                    </div>
                  </div>
                  <span style={{ background: status.bg, color: status.color, borderRadius: 20, padding: "5px 9px", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: .5, flexShrink: 0 }}>
                    {status.label}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 22 }}>
                  <div style={{ background: COLORS.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: COLORS.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .7 }}>Season</div>
                    <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 800, marginTop: 2 }}>{season.label} {plan.year}</div>
                  </div>
                  <div style={{ background: COLORS.bg, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ color: COLORS.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .7 }}>Last edited</div>
                    <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 800, marginTop: 2 }}>{formatLastEdited(plan)}</div>
                  </div>
                </div>

                <button onClick={e => { e.stopPropagation(); onOpen(plan, action.tab); }}
                  style={{ marginTop: "auto", paddingTop: 20, background: "none", border: "none", color: season.color, fontSize: 13, fontWeight: 900, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  {action.label} →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Plan Dashboard ──────────────────────────────────────────────────────────
// Acquisition type colors (used in Catalog + Sourcing badges)
// Return the [startMonth, endMonth] range for a plan.
// Honors month_start/month_end on the plan record when set (houseplant H1/H2 plans
// use Jan-May / Jun-Dec instead of quarters). Falls back to Q1-Q4 math otherwise.
function planMonthRange(plan) {
  if (plan?.month_start && plan?.month_end) return [plan.month_start, plan.month_end];
  const q = parseInt(plan?.season?.replace(/[^0-9]/g, "")) || 1;
  return [(q - 1) * 3 + 1, q * 3];
}
// Short label for the plan window (e.g., "Jan–May", "Q1")
function planRangeLabel(plan) {
  if (plan?.month_start && plan?.month_end) {
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${M[plan.month_start - 1]}–${M[plan.month_end - 1]}`;
  }
  return plan?.season || "—";
}

const ACQ_COLOR = {
  finished:  "#1976d2",  // blue — buy ready-to-sell
  liner:     "#7fb069",  // green — grow from a liner we receive
  propagate: "#5e35b1",  // purple — propagate in-house
  partner:   "#fb8c00",  // orange — outsourced
};

// Canonical size ordering used everywhere container sizes are listed:
// pots (small→large) → finished planters (small→large) → hanging baskets
// (small→large) → non-container tail (bulbs, misc, plugs, air). Returns a
// sortable number; parse the inches so "10\"" sorts after "2\"", not before it.
function sizeRank(potSize) {
  const s = String(potSize || "").trim();
  const inches = (() => { const m = s.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; })();
  const low = s.toLowerCase();
  // Tail buckets (always last, in this order)
  const TAIL = ["bulb", "misc", "plug", "air"];
  for (let i = 0; i < TAIL.length; i++) if (low.includes(TAIL[i])) return 4000 + i;
  // Hanging baskets
  if (/^hb\b/i.test(s) || low.includes("basket")) return 3000 + inches;
  // Finished planters (patio planters, combos, decorative planters)
  if (low.includes("planter") || low.includes("patio") || low.includes("combo")) return 2000 + inches;
  // Plain pots (numeric inch sizes) — the common case
  if (inches > 0) return 1000 + inches;
  // Anything unrecognized sorts just above the tail
  return 3900;
}
// Comparator: size order first, then description.
function bySizeThenDesc(a, b) {
  const d = sizeRank(a.pot_size) - sizeRank(b.pot_size);
  return d !== 0 ? d : String(a.description || a.desc || "").localeCompare(String(b.description || b.desc || ""));
}
const ACQ_LABEL = {
  finished:  "🛒 Finished",
  liner:     "🌱 Liner",
  propagate: "🌿 Propagate",
  partner:   "🤝 Partner",
};

// Tabbed shell. Same tabs for every plan; each tab is a focused panel.
// Default tabs (poinsettia / mum / spring / other production plans)
const PLAN_TABS = [
  { id: "dashboard", label: "📊 Dashboard" },
  { id: "bench",     label: "🗺 By Bench" },
  { id: "review",    label: "🚩 Notes" },
  { id: "variety",   label: "🌱 By Variety" },
  { id: "week",      label: "📅 By Plant Week" },
  { id: "tasks",     label: "✓ Tasks" },
  { id: "materials", label: "📦 Materials" },
  { id: "prop",      label: "🌱 Propagation" },
  { id: "plugs",     label: "🧮 Plug Orders" },
  { id: "sales",     label: "📈 Sales vs Plan" },
  { id: "categories",label: "🏷 Categories" },
  { id: "orders",    label: "📋 Orders" },
  { id: "sourcing",  label: "🧭 Sourcing" },
  { id: "inputs",    label: "⚙ Inputs" },
  { id: "pricing",   label: "💰 Pricing" },
  { id: "combos",    label: "🪴 Combos" },
  { id: "baskets",   label: "🧺 Baskets" },
  { id: "benchprep", label: "📐 Bench Prep" },
  { id: "items",     label: "📑 Items" },
];

// Houseplants plans have a different workflow: catalog-driven, not bench-driven
const HOUSEPLANT_TABS = [
  { id: "catalog",     label: "🛒 Catalog" },
  { id: "insights",    label: "📊 Insights" },
  { id: "presentation",label: "🎬 Presentation" },
  { id: "history",     label: "📈 Sales History" },
  { id: "tasks",       label: "✓ Tasks" },
  { id: "sourcing",    label: "🚚 Sourcing" },
];

function tabsForPlan(plan) {
  if (plan?.name?.toLowerCase().startsWith("houseplants")) return HOUSEPLANT_TABS;
  return PLAN_TABS;
}

function PlanDashboard({ plan, initialTab }) {
  const sb = getSupabase();
  const isHouseplant = plan?.name?.toLowerCase().startsWith("houseplants");
  const availableTabs = tabsForPlan(plan);
  const startingTab = availableTabs.some(t => t.id === initialTab)
    ? initialTab
    : (isHouseplant ? "catalog" : "dashboard");
  const [tab, setTabState]        = useState(startingTab);
  const setTab = (t) => { setTabState(t); try { localStorage.setItem("gh_plan_tab", t); } catch {} };
  const [pl, setPL]               = useState(null);
  const [housesProfit, setHouses] = useState([]);
  const [houses, setHousesList]   = useState([]);
  const [drilldown, setDrilldown] = useState(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      const rows = await srcPageAll(sb, "v_scheduled_crops_pl", "liner_cost,pot_cost,soil_cost,ring_cost,direct_cost_total,revenue,gross_profit,bench_id,qty_pots,is_combo_component,combo_parent_id", q => q.eq("plan_id", plan.id));

      const totals = (rows || []).reduce((acc, r) => ({
        liner:    acc.liner    + (+r.liner_cost   || 0),
        pot:      acc.pot      + (+r.pot_cost     || 0),
        soil:     acc.soil     + (+r.soil_cost    || 0),
        ring:     acc.ring     + (+r.ring_cost    || 0),
        cost:     acc.cost     + (+r.direct_cost_total || 0),
        revenue:  acc.revenue  + (+r.revenue      || 0),
        profit:   acc.profit   + (+r.gross_profit || 0),
        pots:     acc.pots     + (r.is_combo_component && r.combo_parent_id ? 0 : (+r.qty_pots || 0)),
      }), { liner:0, pot:0, soil:0, ring:0, cost:0, revenue:0, profit:0, pots:0 });
      totals.margin = totals.revenue ? totals.profit / totals.revenue * 100 : null;
      setPL(totals);

      // Per-bench → per-house profit (reuse the paginated rows)
      const benchIds = [...new Set(rows.map(r => r.bench_id).filter(Boolean))];
      let bench = [];   // chunk the .in() — hundreds of bench UUIDs overflow the URL
      for (let i = 0; i < benchIds.length; i += 150) { const { data } = await sb.from("benches").select("id,zone_label").in("id", benchIds.slice(i, i + 150)); if (data) bench = bench.concat(data); }
      const byHouse = {};
      for (const r of rows) {
        const b = bench.find(x => x.id === r.bench_id);
        const house = b?.zone_label || "—";
        if (!byHouse[house]) byHouse[house] = { house, cost:0, revenue:0, profit:0 };
        byHouse[house].cost    += +r.direct_cost_total || 0;
        byHouse[house].revenue += +r.revenue || 0;
        byHouse[house].profit  += +r.gross_profit || 0;
      }
      setHouses(Object.values(byHouse).sort((a,b) => b.profit - a.profit));

      const { data: hs } = await sb.from("houses")
        .select("id,name,location,type,width_ft,length_ft,layout_x,layout_y,dimension_source,notes")
        .not("layout_x", "is", null);
      setHousesList(hs || []);
      setLoading(false);
    })();
  }, [sb, plan.id]);

  if (loading) return <div style={{ padding: 20, color: COLORS.muted }}>Loading dashboard…</div>;
  if (!pl) return null;

  const hasData = pl.cost > 0 || pl.revenue > 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Tab bar — sticky so it stays visible while the user scrolls the catalog */}
      <div style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        borderBottom: `2px solid ${COLORS.border}`,
        paddingBottom: 0,
        position: "sticky", top: 0, zIndex: 50,
        background: "#f2f5ef",
        marginTop: -4, paddingTop: 4,
      }}>
        {tabsForPlan(plan).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "10px 16px", fontWeight: 700, fontSize: 13,
              background: tab === t.id ? COLORS.card : "transparent",
              color: tab === t.id ? COLORS.dark : COLORS.muted,
              border: "none",
              borderBottom: tab === t.id ? `3px solid ${COLORS.light}` : "3px solid transparent",
              cursor: "pointer", marginBottom: -2,
            }}>{t.label}</button>
        ))}
      </div>

      {/* Houseplant plans go straight to their tabs (no scheduled_crops empty state) */}
      {isHouseplant ? (
        <>
          {tab === "catalog"     && <CatalogTab plan={plan} />}
          {tab === "insights"    && <HpInsightsTab plan={plan} />}
          {tab === "presentation"&& <HpPresentationTab plan={plan} />}
          {tab === "history"     && <HpHistoryTab plan={plan} />}
          {tab === "tasks"       && <PlanTasks planId={plan.id} />}
          {tab === "sourcing"    && <HpSourcingTab plan={plan} />}
        </>
      ) : (
        <>
          {!hasData && tab !== "tasks" && tab !== "sourcing" && (
            <div style={{ background: COLORS.card, border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: 40, textAlign: "center", color: COLORS.muted }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div>No scheduled crops yet for <strong>{plan.name}</strong>.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Add crops to populate this plan, or check the Tasks tab if you only have planning tasks for now.</div>
            </div>
          )}
          {hasData && tab === "dashboard" && (
            <DashboardTab pl={pl} planId={plan.id} houses={houses} housesProfit={housesProfit} onHouseClick={setDrilldown} drilldown={drilldown} setDrilldown={setDrilldown} />
          )}
          {hasData && tab === "bench"     && <BenchTab plan={plan} houses={houses} housesProfit={housesProfit} drilldown={drilldown} setDrilldown={setDrilldown} />}
          {hasData && tab === "review"    && <ReviewNotesTab plan={plan} />}
          {hasData && tab === "variety"   && <VarietyTab planId={plan.id} />}
          {hasData && tab === "week"      && <WeekTab planId={plan.id} />}
          {tab === "tasks"     && <PlanTasks planId={plan.id} />}
          {hasData && tab === "materials" && <MaterialsTab plan={plan} />}
          {hasData && tab === "prop"      && <PropagationTab plan={plan} />}
          {hasData && tab === "plugs"     && <PlugOrdersTab plan={plan} />}
          {hasData && tab === "sales"     && <SalesVsPlanTab plan={plan} />}
          {hasData && tab === "categories" && <CategoryProfiles plan={plan} />}
          {hasData && tab === "baskets"    && <BasketPlanner plan={plan} onOpenCombos={() => setTab("combos")} />}
          {hasData && tab === "orders"    && <OrdersTab plan={plan} />}
          {tab === "sourcing"  && <SourcingTab plan={plan} />}
          {hasData && tab === "inputs"    && <InputsTab plan={plan} />}
          {hasData && tab === "pricing"   && <PricingTab plan={plan} />}
          {hasData && tab === "items"     && <ItemsTab plan={plan} />}
          {hasData && tab === "combos"    && <CombosTab plan={plan} />}
          {hasData && tab === "benchprep" && <BenchPrepTab plan={plan} />}
        </>
      )}
    </div>
  );
}

// ── Dashboard tab ───────────────────────────────────────────────────────────
function DashboardTab({ pl, planId, houses, housesProfit, drilldown, setDrilldown }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KPI label="Direct Cost"  value={fmtMoney(pl.cost)}    color={COLORS.dark} />
        <KPI label="Revenue"      value={fmtMoney(pl.revenue)} color={COLORS.light} />
        <KPI label="Gross Profit" value={fmtMoney(pl.profit)}  color={COLORS.dark} sub={fmtPct(pl.margin) + " margin"} />
        <KPI label="Cost / Pot"   value={pl.pots ? "$" + (pl.cost / pl.pots).toFixed(2) : "—"} color={COLORS.muted} sub={`${pl.pots.toLocaleString()} pots`} />
      </div>
      <CostBreakdown pl={pl} />
      <ProfitBySize planId={planId} />
      <PropertyMap houses={houses} housesProfit={housesProfit} onHouseClick={setDrilldown} />
      {drilldown && <HouseDrilldown houseName={drilldown} houses={houses} planId={planId} onClose={() => setDrilldown(null)} />}
    </div>
  );
}

// ── By Bench tab — full property map + drilldown ─────────────────────────────
// Shared: write a single manager_task covering one or many items.
async function createManagerTask(sb, { title, description, items, planId, houseId, team, targetDate }) {
  const benches = [...new Set((items || []).map(i => i.bench).filter(Boolean))];
  const itemList = (items || []).map(i => `${i.item}${i.bench ? ` (${i.bench})` : ""}`).join("; ");
  const due = targetDate ? new Date(targetDate + "T12:00:00") : new Date();
  const utc = new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()));
  const dow = (utc.getUTCDay() + 6) % 7; utc.setUTCDate(utc.getUTCDate() - dow + 3);
  const firstThu = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
  const wkNum = 1 + Math.round(((utc - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  // If any item is a combo (carries a planting_layout), publish its diagram and attach the
  // no-login share link so the task can pull it up / text it to the crew.
  let diagram_url = null;
  const comboItem = (items || []).find(i => i.planting_layout && (i.planting_layout.plants || i.planting_layout.dots || i.planting_layout.rings));
  if (comboItem) {
    try { diagram_url = await shareComboDiagram({ planting_layout: comboItem.planting_layout, item_name: comboItem.item_name || comboItem.item }, planId, comboItem.item_name || comboItem.item); } catch { diagram_url = null; }
  }
  return sb.from("manager_tasks").insert([{
    id: crypto.randomUUID(), title,
    week_number: wkNum, year: utc.getUTCFullYear(),
    description: ((description || "").trim() ? description.trim() + "\n\n" : "") + "Items: " + itemList,
    bench_numbers: benches, house_id: houseId || null, plan_id: planId,
    target_date: targetDate || null, team: team || null, diagram_url,
    status: "pending", created_by: "Production Plan",
  }]);
}

// Centered popup overlay so detail/task windows appear in view regardless of scroll.
function Modal({ onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "5vh 16px", overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, maxWidth: 640, width: "100%", boxShadow: "0 12px 48px rgba(0,0,0,0.35)" }}>
        {children}
      </div>
    </div>
  );
}

// Shared task form — used by the bench drilldown and the facility Find.
function TaskComposer({ items, planId, houseId, onClose }) {
  const sb = getSupabase();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [team, setTeam] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await createManagerTask(sb, { title: title.trim(), description, items, planId, houseId, team, targetDate: target });
    setSaving(false);
    if (error) { alert("Task save failed: " + error.message); return; }
    alert("Task created — it'll show in the task manager.");
    onClose?.();
  }
  const inp = { width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, marginBottom: 8, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" };
  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontWeight: 800, color: COLORS.dark, marginBottom: 6 }}>New task · {items.length} item{items.length === 1 ? "" : "s"} (one task)</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8, maxHeight: 60, overflow: "auto" }}>{items.map(i => `${i.item}${i.bench ? ` (${i.bench})` : ""}`).join(" · ")}</div>
      <input placeholder="Task title" value={title} onChange={e => setTitle(e.target.value)} style={inp} />
      <textarea placeholder="Details (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 12, color: COLORS.muted }}>Due <input type="date" value={target} onChange={e => setTarget(e.target.value)} style={{ marginLeft: 4, padding: "4px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontFamily: "inherit" }} /></label>
        <select value={team} onChange={e => setTeam(e.target.value)} style={{ padding: "5px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}>
          <option value="">Team…</option><option value="bluff">Bluff</option><option value="sprague">Sprague</option><option value="houseplants">Houseplants</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving || !title.trim()} style={{ background: COLORS.light, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: (saving || !title.trim()) ? "default" : "pointer", fontFamily: "inherit" }}>{saving ? "Saving…" : "Create task"}</button>
        <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.muted, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

// Suggestion → review → accept loop on the Notes page: anyone proposes a change; the owner
// accepts (which flags the item as a tracked fix-next-year note) or declines.
function SuggestionsSection({ plan, onAccepted }) {
  const sb = getSupabase();
  const [list, setList] = useState([]);
  const [items, setItems] = useState([]);
  const [by, setBy] = useState("");
  const [item, setItem] = useState("");
  const [text, setText] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { (async () => {
    if (!sb) return;
    const { data: s } = await sb.from("plan_suggestions").select("*").eq("plan_id", plan.id).order("created_at", { ascending: false });
    setList(s || []);
    const it = await srcPageAll(sb, "scheduled_crops", "item_name", q => q.eq("plan_id", plan.id).not("item_name", "is", null)); // paginate — >1000 rows
    setItems([...new Set((it || []).map(r => r.item_name))].sort());
  })(); }, [sb, plan.id, tick]);
  async function add() {
    if (!sb || !text.trim()) return;
    await sb.from("plan_suggestions").insert({ plan_id: plan.id, item_name: item.trim() || null, suggested_by: by.trim() || "Anonymous", suggestion: text.trim(), status: "pending" });
    setText(""); setItem(""); setTick(t => t + 1);
  }
  async function review(s, status) {
    if (!sb) return;
    await sb.from("plan_suggestions").update({ status, reviewed_at: new Date().toISOString() }).eq("id", s.id);
    if (status === "accepted" && s.item_name) {
      const { data: rows } = await sb.from("scheduled_crops").select("id,improvement_note").eq("plan_id", plan.id).eq("item_name", s.item_name).eq("is_combo_component", false);
      for (const r of rows || []) {
        const tag = `[${s.suggested_by}] ${s.suggestion}`;
        if (!(r.improvement_note || "").includes(tag)) await sb.from("scheduled_crops").update({ improvement_note: (r.improvement_note ? r.improvement_note + " " : "") + tag }).eq("id", r.id);
      }
      onAccepted?.();
    }
    setTick(t => t + 1);
  }
  const pending = list.filter(s => s.status === "pending");
  const reviewed = list.filter(s => s.status !== "pending");
  const inp = { padding: "7px 9px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13 };
  return (
    <div style={{ background: "#f7faf3", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.dark, marginBottom: 8 }}>💡 Suggested changes <span style={{ color: COLORS.muted, fontWeight: 400 }}>· anyone proposes, you review &amp; accept</span></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 10 }}>
        <input placeholder="Your name" value={by} onChange={e => setBy(e.target.value)} style={{ ...inp, width: 120 }} />
        <input list="sg-items" placeholder="Item / basket (optional)" value={item} onChange={e => setItem(e.target.value)} style={{ ...inp, width: 200 }} />
        <datalist id="sg-items">{items.map(n => <option key={n} value={n} />)}</datalist>
        <textarea placeholder="Suggested change (e.g. swap red cali → coral; move plant date +1 wk)" value={text} onChange={e => setText(e.target.value)} rows={1} style={{ ...inp, flex: 1, minWidth: 200, resize: "vertical" }} />
        <button onClick={add} disabled={!text.trim()} style={{ background: COLORS.light, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>+ Suggest</button>
      </div>
      {pending.length === 0 ? <div style={{ fontSize: 12, color: COLORS.muted }}>No pending suggestions.</div> : (
        <div style={{ display: "grid", gap: 8 }}>
          {pending.map(s => (
            <div key={s.id} style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderLeft: "4px solid #e89a3a", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 13, color: COLORS.text }}>{s.suggestion}</div>
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3 }}>— {s.suggested_by || "Anonymous"}{s.item_name ? ` · ${s.item_name}` : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => review(s, "accepted")} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 7, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✓ Accept{s.item_name ? " → flag item" : ""}</button>
                <button onClick={() => review(s, "declined")} style={{ background: "#fff", color: COLORS.red, border: `1px solid ${COLORS.red}`, borderRadius: 7, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✗ Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {reviewed.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>{reviewed.length} reviewed</summary>
          <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
            {reviewed.map(s => (
              <div key={s.id} style={{ fontSize: 12, color: COLORS.muted }}>
                <span style={{ color: s.status === "accepted" ? COLORS.light : COLORS.red, fontWeight: 700 }}>{s.status === "accepted" ? "✓ accepted" : "✗ declined"}</span> — {s.suggestion} <span style={{ opacity: 0.7 }}>({s.suggested_by}{s.item_name ? ` · ${s.item_name}` : ""})</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Facility-wide review: every item flagged with a 🚩 fix-next-year note, grouped by recipe.
function ReviewNotesTab({ plan }) {
  const sb = getSupabase();
  const [groups, setGroups] = useState([]);
  const [keepGroups, setKeepGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { (async () => {
    if (!sb) { setLoading(false); return; }
    const { data: sc } = await sb.from("scheduled_crops").select("id,item_name,variety_id,bench_id,improvement_note,kept_note,plant_week").eq("plan_id", plan.id).or("improvement_note.not.is.null,kept_note.not.is.null");
    const benchIds = [...new Set((sc || []).map(r => r.bench_id).filter(Boolean))];
    const { data: benches } = benchIds.length ? await sb.from("benches").select("id,code,zone_label").in("id", benchIds).limit(2000) : { data: [] };
    const vIds = [...new Set((sc || []).map(r => r.variety_id).filter(Boolean))];
    const { data: vars } = vIds.length ? await sb.from("variety_library").select("id,variety,crop_name").in("id", vIds) : { data: [] };
    const bmap = {}; (benches || []).forEach(b => { bmap[b.id] = b; });
    const vmap = {}; (vars || []).forEach(v => { vmap[v.id] = v; });
    const build = (field) => {
      const g = {};
      (sc || []).forEach(r => {
        const note = r[field]; if (!note) return;
        const v = vmap[r.variety_id]; const item = r.item_name || (v ? `${v.crop_name} ${v.variety}` : "item");
        const key = item + "||" + note;
        if (!g[key]) g[key] = { item, note, houses: new Set(), benches: new Set(), ids: [], itemName: r.item_name };
        const b = bmap[r.bench_id]; if (b?.zone_label) g[key].houses.add(b.zone_label); if (b?.code) g[key].benches.add(b.code); g[key].ids.push(r.id);
      });
      return Object.values(g).map(x => ({ ...x, houses: [...x.houses].sort(), benches: [...x.benches] })).sort((a, b) => a.item.localeCompare(b.item));
    };
    setGroups(build("improvement_note"));
    setKeepGroups(build("kept_note"));
    setLoading(false);
  })(); }, [sb, plan.id, tick]);
  async function saveNote(grp, val, field = "improvement_note") { let q = sb.from("scheduled_crops").update({ [field]: val.trim() || null }); if (grp.itemName) q = q.eq("item_name", grp.itemName).eq("plan_id", plan.id); else q = q.in("id", grp.ids); await q; setTick(t => t + 1); }
  const filtered = groups.filter(g => !search || (g.item + " " + g.note + " " + g.houses.join(" ")).toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: COLORS.dark }}>🚩 Fix-next-year notes</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>Every item across the facility flagged for improvement — your punch-list when building next year's plan. {groups.length} flagged.</div>
        </div>
        <input placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} style={{ padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", minWidth: 200 }} />
      </div>
      <SuggestionsSection plan={plan} onAccepted={() => setTick(t => t + 1)} />
      {keepGroups.length > 0 && (<>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#2e7d32", margin: "18px 0 8px" }}>✅ Worked well — keep ({keepGroups.length})</div>
        <div style={{ display: "grid", gap: 10 }}>
          {keepGroups.filter(g => !search || (g.item + " " + g.note + " " + g.houses.join(" ")).toLowerCase().includes(search.toLowerCase())).map((g, i) => (
            <div key={i} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: "4px solid #7fb069", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, color: COLORS.dark }}>{g.item}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{g.houses.join(" · ")}{g.benches.length ? ` · ${g.benches.length} bench${g.benches.length === 1 ? "" : "es"}` : ""}</div>
              </div>
              <textarea defaultValue={g.note} onBlur={e => { if ((e.target.value || "") !== (g.note || "")) saveNote(g, e.target.value, "kept_note"); }} rows={2} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "7px 9px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
              <button onClick={() => { if (window.confirm("Remove this keep-note?")) saveNote(g, "", "kept_note"); }} style={{ marginTop: 6, background: "#fff", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            </div>
          ))}
        </div>
      </>)}
      <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.dark, margin: "18px 0 8px" }}>🚩 Flagged items ({groups.length})</div>
      {loading ? <div style={{ color: COLORS.muted }}>Loading…</div> : filtered.length === 0 ? (
        <div style={{ color: COLORS.muted, padding: 24, textAlign: "center", background: COLORS.card, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>No flagged items. Open any item in <b>🗺 By Bench</b> and use the "🚩 Fix-next-year note" box — it'll show up here for the whole facility.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((g, i) => (
            <div key={i} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: "4px solid #d94f3d", borderRadius: 10, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800, color: COLORS.dark }}>{g.item}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>{g.houses.join(" · ")}{g.benches.length ? ` · ${g.benches.length} bench${g.benches.length === 1 ? "" : "es"}` : ""}</div>
              </div>
              <textarea defaultValue={g.note} onBlur={e => { if ((e.target.value || "") !== (g.note || "")) saveNote(g, e.target.value); }} rows={2} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "7px 9px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical" }} />
              <button onClick={() => { if (window.confirm("Resolve & clear this note?")) saveNote(g, ""); }} style={{ marginTop: 6, background: "#fff", color: COLORS.light, border: `1px solid ${COLORS.light}`, borderRadius: 7, padding: "5px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✓ Resolve</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BenchTab({ plan, houses, housesProfit, drilldown, setDrilldown }) {
  const sb = getSupabase();
  const [all, setAll] = useState([]);
  const [q, setQ] = useState("");
  const [wk, setWk] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [taskItems, setTaskItems] = useState(null);

  useEffect(() => {
    if (!sb || !plan?.id) return;
    (async () => {
      const scd = await srcPageAll(sb, "scheduled_crops", "id,item_name,plant_week,bench_id,variety_id,container_id,qty_pots,is_combo_component,improvement_note", q => q.eq("plan_id", plan.id)); // paginate — >1000 rows
      const benchIds = [...new Set((scd || []).map(r => r.bench_id).filter(Boolean))];
      const varIds = [...new Set((scd || []).map(r => r.variety_id).filter(Boolean))];
      const { data: bdata } = benchIds.length ? await sb.from("benches").select("id,code,zone_label").in("id", benchIds) : { data: [] };
      const { data: vdata } = varIds.length ? await sb.from("variety_library").select("id,variety,crop_name").in("id", varIds) : { data: [] };
      const contIds = [...new Set((scd || []).map(r => r.container_id).filter(Boolean))];
      const { data: cdata } = contIds.length ? await sb.from("containers").select("id,name").in("id", contIds) : { data: [] };
      setAll((scd || []).map(r => {
        const b = (bdata || []).find(x => x.id === r.bench_id);
        const v = (vdata || []).find(x => x.id === r.variety_id);
        const cont = (cdata || []).find(x => x.id === r.container_id);
        // item_name is the display name; when a plan lacks it, variety + container
        // still tells you WHAT and WHAT SIZE (the Winter-2026 lesson)
        const label = r.item_name || [v?.variety, cont?.name && `(${cont.name})`].filter(Boolean).join(" ") || "?";
        return { id: r.id, item: r.item_name, label, plant_week: r.plant_week, bench: b?.code, house: b?.zone_label, variety: v?.variety, crop: v?.crop_name, container: cont?.name, is_combo_component: r.is_combo_component, improvement_note: r.improvement_note };
      }));
    })();
  }, [sb, plan?.id]);
  // Houses (zone_labels) that have at least one item flagged with a fix-next-year note.
  const flaggedHouses = useMemo(() => new Set(all.filter(r => r.improvement_note && r.house).map(r => r.house)), [all]);

  const weeks = wk.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  const active = !!(q.trim() || weeks.length);
  const matches = !active ? [] : all.filter(r => {
    const txt = `${r.item || ""} ${r.variety || ""} ${r.crop || ""} ${r.container || ""}`.toLowerCase();
    const okText = !q.trim() || txt.includes(q.trim().toLowerCase());
    const ww = r.plant_week != null ? (r.plant_week % 100) : null;
    const okWeek = !weeks.length || weeks.some(w => w.length >= 3 ? String(r.plant_week) === w : ww === +w);
    return !r.is_combo_component && okText && okWeek;
  });
  const matchCounts = {};
  matches.forEach(m => { if (m.house) matchCounts[m.house] = (matchCounts[m.house] || 0) + 1; });
  const byHouse = {};
  matches.forEach(m => { (byHouse[m.house || "—"] = byHouse[m.house || "—"] || []).push(m); });
  const toggleSel = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const finp = { padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13 };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <strong style={{ color: COLORS.dark }}>🔎 Find across facility</strong>
        <input placeholder="crop or item (e.g. geranium)" value={q} onChange={e => setQ(e.target.value)} style={{ ...finp, flex: "1 1 220px" }} />
        <input placeholder="plant week(s) e.g. 5,6" value={wk} onChange={e => setWk(e.target.value)} style={{ ...finp, width: 150 }} />
        {active && <span style={{ color: COLORS.muted, fontSize: 13 }}>{matches.length} match{matches.length === 1 ? "" : "es"} · {Object.keys(matchCounts).length} house(s)</span>}
        {active && <button onClick={() => { setQ(""); setWk(""); setSel(new Set()); setTaskItems(null); }} style={{ background: "transparent", border: "none", color: COLORS.muted, cursor: "pointer" }}>clear</button>}
      </div>

      <PropertyMap houses={houses} housesProfit={housesProfit} onHouseClick={setDrilldown} highlight={active ? matchCounts : null} flaggedHouses={flaggedHouses} />

      {active && (
        <div style={{ background: COLORS.card, border: `2px solid ${COLORS.dark}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, color: COLORS.dark }}>Results · {matches.length}</div>
            <button onClick={() => setSel(new Set(matches.map(m => m.id)))} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Select all</button>
            {sel.size > 0 && <button onClick={() => setTaskItems(matches.filter(m => sel.has(m.id)).map(m => ({ item: m.label || "item", bench: m.bench })))} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "5px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>＋ Create one task ({sel.size})</button>}
            {sel.size > 0 && <button onClick={() => setSel(new Set())} style={{ background: "transparent", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 13 }}>clear</button>}
          </div>
          {taskItems && <Modal onClose={() => { setTaskItems(null); setSel(new Set()); }}><TaskComposer items={taskItems} planId={plan.id} houseId={null} onClose={() => { setTaskItems(null); setSel(new Set()); }} /></Modal>}
          {matches.length === 0 ? <div style={{ color: COLORS.muted }}>No matches.</div> : Object.keys(byHouse).sort().map(h => (
            <div key={h} style={{ marginBottom: 10 }}>
              <div onClick={() => setDrilldown(h)} style={{ fontWeight: 700, fontSize: 13, color: COLORS.dark, margin: "6px 0", cursor: "pointer" }}>{h} · {byHouse[h].length} →</div>
              {byHouse[h].slice().sort((a, b) => (a.bench || "").localeCompare(b.bench || "") || (a.item || "").localeCompare(b.item || "")).map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 13 }}>
                  <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggleSel(m.id)} style={{ cursor: "pointer", accentColor: COLORS.light }} />
                  <span style={{ color: COLORS.muted, width: 72, flexShrink: 0 }}>{m.bench}</span>
                  <span>{m.label} <span style={{ color: COLORS.muted, fontSize: 11 }}>· wk {m.plant_week}</span></span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {drilldown && <HouseDrilldown houseName={drilldown} houses={houses} planId={plan.id} onClose={() => setDrilldown(null)} />}
    </div>
  );
}

// ── By Variety tab ──────────────────────────────────────────────────────────
function VarietyTab({ planId }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [sortCol, setSortCol] = useState("profit");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      // paginate — plans exceed PostgREST's 1000-row cap (was silently truncating totals)
      const pl = await srcPageAll(sb, "v_scheduled_crops_pl", "variety_id,container_id,qty_pots,qty_plants_ordered,direct_cost_total,revenue,gross_profit,is_combo_component,combo_parent_id", q => q.eq("plan_id", planId));
      const vars = await srcPageAll(sb, "variety_library", "id,variety,breeder,series,typical_color");
      const containers = await srcPageAll(sb, "containers", "id,sku");

      const byVar = {};
      for (const r of (pl || [])) {
        const v = (vars || []).find(x => x.id === r.variety_id);
        const c = (containers || []).find(x => x.id === r.container_id);
        const key = r.variety_id;
        if (!byVar[key]) byVar[key] = {
          variety: v?.variety, breeder: v?.breeder, series: v?.series, color: v?.typical_color,
          containers: new Set(),
          liners: 0, pots: 0, cost: 0, revenue: 0, profit: 0,
        };
        byVar[key].containers.add(c?.sku);
        byVar[key].liners  += +r.qty_plants_ordered || 0;
        byVar[key].pots    += (r.is_combo_component && r.combo_parent_id ? 0 : (+r.qty_pots || 0));
        byVar[key].cost    += +r.direct_cost_total || 0;
        byVar[key].revenue += +r.revenue || 0;
        byVar[key].profit  += +r.gross_profit || 0;
      }
      const arr = Object.values(byVar).map(r => ({
        ...r,
        containers: Array.from(r.containers).filter(Boolean).join(", "),
        margin: r.revenue ? r.profit / r.revenue * 100 : 0,
      }));
      setRows(arr);
    })();
  }, [sb, planId]);

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av - bv) : (bv - av);
  });

  function clickSort(c) {
    if (c === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(c); setSortDir("desc"); }
  }
  const SortHdr = ({ col, label, align }) => (
    <th style={{...th, textAlign: align || "left", cursor: "pointer" }} onClick={() => clickSort(col)}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 12 }}>
        By Variety · {rows.length} varieties
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f3f5ef" }}>
              <SortHdr col="variety" label="Variety" />
              <SortHdr col="breeder" label="Breeder" />
              <SortHdr col="color"   label="Color" />
              <th style={th}>Containers</th>
              <SortHdr col="liners"  label="Liners"   align="right" />
              <SortHdr col="pots"    label="Pots"     align="right" />
              <SortHdr col="cost"    label="Cost"     align="right" />
              <SortHdr col="revenue" label="Revenue"  align="right" />
              <SortHdr col="profit"  label="Profit"   align="right" />
              <SortHdr col="margin"  label="Margin %" align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={td}><strong>{r.variety}</strong>{r.series && <span style={{ color: COLORS.muted, fontSize: 11 }}> · {r.series}</span>}</td>
                <td style={{...td, color: COLORS.muted, fontSize: 11}}>{r.breeder}</td>
                <td style={td}>{r.color}</td>
                <td style={{...td, fontSize: 11, color: COLORS.muted}}>{r.containers}</td>
                <td style={{...td, textAlign:"right"}}>{r.liners.toLocaleString()}</td>
                <td style={{...td, textAlign:"right"}}>{r.pots.toLocaleString()}</td>
                <td style={{...td, textAlign:"right"}}>{fmtMoney(r.cost)}</td>
                <td style={{...td, textAlign:"right"}}>{fmtMoney(r.revenue)}</td>
                <td style={{...td, textAlign:"right", fontWeight: 700, color: COLORS.dark}}>{fmtMoney(r.profit)}</td>
                <td style={{...td, textAlign:"right"}}>{fmtPct(r.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── By Plant Week tab — calendar-style timeline ─────────────────────────────
// "6.5 Azalea Pot - NEW Schlegel Logo Print" is too many words for a task —
// the crew needs the size: 6.5" Pot. (Caleb)
const potShort = n => { const m = String(n || "").match(/\d+(\.\d+)?/); return m ? `${parseFloat(m[0])}" Pot` : (n || "—"); };
const sizeNumOf = label => { const m = String(label || "").match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 999; };

function WeekTab({ planId }) {
  const sb = getSupabase();
  const [weeks, setWeeks] = useState(null);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      // scheduled_crops directly (not the P&L view) — grouping needs plant_year,
      // and prep needs ppp / prop / tray / soil / source per row
      const sc = await srcPageAll(sb, "scheduled_crops",
        "id,item_name,variety_id,container_id,soil_mix_id,bench_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,ready_week,prop_method,prop_tray_size,broker,supplier,liner_unit_cost,is_combo_component,combo_parent_id",
        q => q.eq("plan_id", planId));
      const pl = await srcPageAll(sb, "v_scheduled_crops_pl", "id,direct_cost_total,revenue", q => q.eq("plan_id", planId));
      const cost = Object.fromEntries(pl.map(r => [r.id, { c: +r.direct_cost_total || 0, rev: +r.revenue || 0 }]));
      const vars = await srcPageAll(sb, "variety_library", "id,variety,crop_name");
      const vmap = Object.fromEntries(vars.map(v => [v.id, v]));
      const { data: bench } = await sb.from("benches").select("id,code,zone_label").limit(2000);
      const bmap = Object.fromEntries((bench || []).map(b => [b.id, b]));
      const { data: conts } = await sb.from("containers").select("id,name");
      const cmap = Object.fromEntries((conts || []).map(c => [c.id, c.name]));
      const { data: soils } = await sb.from("soil_mixes").select("id,name");
      const smap = Object.fromEntries((soils || []).map(x => [x.id, x.name]));
      const parentById = Object.fromEntries(sc.filter(r => !r.is_combo_component).map(r => [r.id, r]));

      const byW = {};
      const weekOf = r => `${r.plant_year || "?"}-${String(r.plant_week ?? "?").padStart(2, "0")}`;
      const wk = key => byW[key] || (byW[key] = { key, year: key.split("-")[0], week: +key.split("-")[1] || null,
        items: {}, pots: 0, plants: 0, cost: 0, revenue: 0, zones: new Set(), varieties: new Set(), fillBySize: {} });

      for (const r of sc) {
        // components fold into their parent item — they're the liners you stick INTO it
        if (r.is_combo_component) {
          const par = parentById[r.combo_parent_id];
          if (!par) continue;
          const w = wk(weekOf(par));
          const key = par.item_name || par.id;
          const it = w.items[key];
          const v = vmap[r.variety_id];
          const plants = +r.qty_plants_ordered || 0;
          w.plants += plants;
          w.cost += plants * (+r.liner_unit_cost || 0);
          if (it) {
            it.plants += plants;
            it.linerCost += plants * (+r.liner_unit_cost || 0);
            it.comps.push(`${(v?.variety || v?.crop_name || "?")} ×${plants.toLocaleString()}${r.prop_method ? ` (${r.prop_method})` : ""}`);
            if (r.broker || r.supplier) it.srcs.add(r.broker || r.supplier);
          }
          if (v?.variety) w.varieties.add(v.variety);
          continue;
        }
        if (!(+r.qty_pots > 0)) continue;
        const w = wk(weekOf(r));
        const v = vmap[r.variety_id];
        const b = bmap[r.bench_id];
        const key = r.item_name || r.id;
        const label = r.item_name || [v?.variety, cmap[r.container_id] && `(${cmap[r.container_id]})`].filter(Boolean).join(" ") || "?";
        const it = w.items[key] || (w.items[key] = { label, pots: 0, plants: 0, ppp: +r.ppp || 1,
          prop: r.prop_method, tray: r.prop_tray_size, container: cmap[r.container_id] || null, pot: potShort(cmap[r.container_id]),
          soil: smap[r.soil_mix_id] || null, benches: new Set(), srcs: new Set(), linerCost: 0,
          comps: [], ready: r.ready_week ?? null, rev: 0 });
        const pots = +r.qty_pots, plants = pots * (+r.ppp || 1);
        it.pots += pots; it.plants += plants;
        w.fillBySize[potShort(cmap[r.container_id])] = (w.fillBySize[potShort(cmap[r.container_id])] || 0) + pots;
        it.ppp = Math.max(it.ppp, +r.ppp || 1);
        it.linerCost += plants * (+r.liner_unit_cost || 0);
        if (b?.code) it.benches.add(b.code);
        if (r.broker || r.supplier) it.srcs.add(r.broker || r.supplier);
        if (r.ready_week != null) it.ready = it.ready == null ? r.ready_week : Math.min(it.ready, r.ready_week);
        it.rev += (cost[r.id]?.rev || 0);
        w.pots += pots; w.plants += plants;
        w.cost += cost[r.id]?.c || 0; w.revenue += cost[r.id]?.rev || 0;
        if (b?.zone_label) w.zones.add(b.zone_label);
        if (v?.variety) w.varieties.add(v.variety);
      }
      setWeeks(Object.values(byW).sort((a, b) => a.key.localeCompare(b.key)));
    })();
  }, [sb, planId]);

  if (!weeks) return <div style={{ padding: 20, color: COLORS.muted }}>Loading plant weeks…</div>;

  // open the first week that hasn't passed yet — that's the one being prepped
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(Math.ceil(((now - new Date(now.getFullYear(), 0, 4)) / 86400000 + new Date(now.getFullYear(), 0, 4).getDay() + 1) / 7)).padStart(2, "0")}`;
  const nextIdx = weeks.findIndex(w => w.key >= curKey);

  const th2 = { textAlign: "left", padding: "6px 9px", fontSize: 10.5, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" };
  const td2 = { padding: "6px 9px", fontSize: 12.5, borderBottom: `1px solid ${COLORS.border}`, verticalAlign: "top" };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "11px 14px", fontSize: 12.5, color: COLORS.muted }}>
        Each week opens into everything planting that week — item, pots, plants per pot, what arrives (URC / plugs / direct stick), tray, soil, source and benches — so the week can be prepped from one screen. Combo components are folded into their basket with the full liner list.
      </div>
      {weeks.map((w, i) => {
        const items = Object.values(w.items).sort((a, b) => {
          const ba = [...a.benches].sort()[0] || "™", bb = [...b.benches].sort()[0] || "™";
          if (ba !== bb) return ba.localeCompare(bb);              // bench codes encode location
          const sa = sizeNumOf(a.label), sb = sizeNumOf(b.label);
          if (sa !== sb) return sa - sb;                           // then size
          return a.label.localeCompare(b.label);                   // then name (colors group)
        });
        const fillSizes = Object.entries(w.fillBySize).sort((x, y) => sizeNumOf(x[0]) - sizeNumOf(y[0]));
        return (
          <details key={w.key} open={i === (nextIdx === -1 ? weeks.length - 1 : nextIdx)}
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${COLORS.light}`, borderRadius: 8 }}>
            <summary style={{ cursor: "pointer", padding: "11px 14px", display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap", listStyle: "none" }}>
              <span style={{ fontFamily: "'DM Serif Display',serif", fontSize: 19, color: COLORS.dark }}>
                Week {w.week}<span style={{ fontSize: 12, color: COLORS.muted }}> ’{String(w.year).slice(2)}</span>
              </span>
              <span style={{ fontSize: 12.5, color: COLORS.text }}><b>{items.length}</b> items</span>
              <span style={{ fontSize: 12.5, color: COLORS.text }}><b>{w.pots.toLocaleString()}</b> pots</span>
              <span style={{ fontSize: 12.5, color: COLORS.text }}><b>{w.plants.toLocaleString()}</b> plants</span>
              <span style={{ fontSize: 12.5, color: COLORS.muted }}>{fmtMoney(w.cost)} cost</span>
              <span style={{ fontSize: 12.5, color: COLORS.muted, marginLeft: "auto" }}>{[...w.zones].slice(0, 5).join(" · ")}{w.zones.size > 5 ? ` +${w.zones.size - 5}` : ""}</span>
            </summary>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 14px 4px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase" }}>Pot fill:</span>
              {fillSizes.map(([sz, n]) => (
                <span key={sz} style={{ background: "#eef3e9", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 10px", fontSize: 12.5, fontWeight: 800, color: "#2e5c1e" }}>
                  {n.toLocaleString()} × {sz}
                </span>
              ))}
              <span style={{ marginLeft: "auto", background: "#1e2d1a", color: "#c8e6b8", borderRadius: 8, padding: "4px 10px", fontSize: 12.5, fontWeight: 800 }}>
                Plant: {items.length} items · {w.pots.toLocaleString()} pots · {w.plants.toLocaleString()} plants
              </span>
            </div>
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th2}>Item</th><th style={th2}>Pot</th><th style={{ ...th2, textAlign: "right" }}>Pots</th>
                  <th style={{ ...th2, textAlign: "right" }}>PPP</th><th style={{ ...th2, textAlign: "right" }}>Plants</th>
                  <th style={th2}>Arrives as</th><th style={th2}>Tray</th><th style={th2}>Soil</th>
                  <th style={th2}>Source</th><th style={{ ...th2, textAlign: "right" }}>Liner $</th>
                  <th style={{ ...th2, textAlign: "right" }}>Ready</th><th style={th2}>Benches</th>
                </tr></thead>
                <tbody>
                  {items.map((it, j) => (
                    <tr key={j}>
                      <td style={{ ...td2, fontWeight: 700 }}>
                        {it.label}
                        {it.comps.length > 0 && (
                          <div style={{ fontSize: 11, fontWeight: 400, color: COLORS.muted, marginTop: 2 }}>
                            🪴 {it.comps.join(" · ")}
                          </div>
                        )}
                      </td>
                      <td style={td2}>{it.pot || "—"}</td>
                      <td style={{ ...td2, textAlign: "right" }}>{it.pots.toLocaleString()}</td>
                      <td style={{ ...td2, textAlign: "right", fontWeight: 700, color: it.ppp > 1 ? "#2e5c1e" : COLORS.muted }}>{it.ppp}</td>
                      <td style={{ ...td2, textAlign: "right", fontWeight: 700 }}>{it.plants.toLocaleString()}</td>
                      <td style={td2}>{it.prop || "—"}</td>
                      <td style={td2}>{it.tray || "—"}</td>
                      <td style={td2}>{it.soil || "—"}</td>
                      <td style={td2}>{[...it.srcs].join(", ") || "—"}</td>
                      <td style={{ ...td2, textAlign: "right", color: COLORS.muted }}>{it.linerCost ? fmtMoney(it.linerCost) : "—"}</td>
                      <td style={{ ...td2, textAlign: "right", color: COLORS.muted }}>{it.ready != null ? `wk${it.ready}` : "—"}</td>
                      <td style={{ ...td2, fontFamily: "monospace", fontSize: 11 }}>{[...it.benches].sort().slice(0, 6).join(" ")}{it.benches.size > 6 ? ` +${it.benches.size - 6}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ── Pricing tab ─────────────────────────────────────────────────────────────
// Interactive sale-pricing editor (built for the Winter poinsettia price-set).
// Per-size BASE price (auto-fills every item that size) + optional per-item override.
// Shows last year's price as the anchor + projected qty; bulk % adjust + individual edit;
// copy-to-clipboard for transcription into the B2B system.
const priceNum = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[$,]/g, "")); return isFinite(n) ? n : null; };
const round2 = n => Math.round(n * 100) / 100;
// Poinsettias sell by COLOR, not variety — consolidate every variety of a color into one
// item. NOVELTY (or blank) keeps its variety name (priced individually). Keys = scheduled_crops.color.
const POIN_COLORS = { RED: "Red", WHITE: "White", PINK: "Pink", MARBLE: "Marble", CRYSTAL: "Ice Crystal", GLITTER: "Glitter" };
const POIN_COLOR_ORDER = ["Red", "White", "Pink", "Marble", "Ice Crystal", "Glitter"];
// Pot-cover material cost per pot size (from 2025 sheet). 10"/13" not yet provided.
const POIN_POTCOVER = { 5.5: 0.52, 6.5: 0.57, 7.5: 0.90, 8.5: 0.99 };
const potCoverFor = d => { const v = POIN_POTCOVER[Number(d)]; return v == null ? null : v; };
// Poinsettia big pots are sold by bloom count, not diameter (display name only).
const POIN_BLOOM = { 10: "8 Bloom", 13: "10 Bloom" };
// Premium lines that command a higher price (more space + quality reputation). Detected by name.
const PREMIUM_PATTERNS = [/sunpatiens/i, /new\s*guinea/i, /i.?conia/i, /reiger/i, /bacio/i];
const isPremiumName = n => PREMIUM_PATTERNS.some(re => re.test(String(n || "")));
const median = arr => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
// Size label + sort rank for a plan's container size group {diameter, sku, name}. Handles
// non-pot containers (baskets, bowls, trays, flats) that have no numeric diameter — those
// fall back to the container name instead of showing 0", and sort via sizeRank().
const sizeLabelOf = s => {
  const d = Number(s.diameter);
  if (isFinite(d) && d > 0) return `${d}"`;
  const nm = String(s.name || "").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return nm || String(s.sku || "—");
};
const sizeRankOf = s => {
  const d = Number(s.diameter);
  const nm = String(s.name || s.sku || "");
  if (isFinite(d) && d > 0) return sizeRank(`${d} ${nm}`);
  if (/\b1801\b|tray|insert|landscape|\bflat\b|\bcell\b/i.test(nm)) return 3800; // flats/inserts → after baskets, before plugs
  return sizeRank(nm);
};

function PricingTab({ plan }) {
  const sb = getSupabase();
  const lastYear = plan.year - 1;
  const [sizes, setSizes] = useState(null);   // [{containerId, diameter, sku, cropName, lastBase, items:[...] }]
  const [baseEdit, setBaseEdit] = useState({}); // containerId -> this-year base (string)
  const [ovEdit, setOvEdit] = useState({});     // `${cId}|${vId}` -> this-year override (string; "" = inherit base)
  const [rowIds, setRowIds] = useState({ base: {}, ov: {} }); // existing crop_pricing ids for in-place update/delete
  const [colorMode, setColorMode] = useState(false); // poinsettia plans group by color; others per-variety
  const [costOpen, setCostOpen] = useState(() => new Set()); // item keys with cost breakdown expanded
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState("");

  async function reload() {
    setBusy(true);
    // paginate everything — PostgREST caps at 1000 (plans + variety_library exceed it)
    const sc = await srcPageAll(sb, "scheduled_crops", "id,container_id,variety_id,color,qty_pots,item_name,plants_per_unit", q => q.eq("plan_id", plan.id).eq("is_combo_component", false));
    const vars = await srcPageAll(sb, "variety_library", "id,variety,crop_name");
    const conts = await srcPageAll(sb, "containers", "id,sku,name,diameter_in");
    const prices = await srcPageAll(sb, "crop_pricing", "id,container_id,variety_id,crop_name,effective_year,price", q => q.in("effective_year", [plan.year, lastYear]));
    const pl = await srcPageAll(sb, "v_scheduled_crops_pl", "id,direct_cost_total,liner_cost,pot_cost,soil_cost,ring_cost", q => q.eq("plan_id", plan.id));
    const costById = {}, compById = {};
    pl.forEach(r => {
      costById[r.id] = +r.direct_cost_total || 0;
      compById[r.id] = { liner: +r.liner_cost || 0, pot: +r.pot_cost || 0, soil: +r.soil_cost || 0, ring: +r.ring_cost || 0 };
    });
    // 2026 realized sales by plan item_name (same crosswalk as Sales-vs-Plan): avg $ per sold unit
    const xw = await srcPageAll(sb, "sales_sku_map", "sku,plan_item_name");
    const skuToItem = {}; xw.forEach(x => { if (x.plan_item_name) skuToItem[x.sku] = x.plan_item_name; });
    const stot = await srcPageAll(sb, "sales_totals", "sku,units,revenue");
    const soldRev = {}, soldUnits = {};
    stot.forEach(t => { const it = skuToItem[t.sku]; if (!it) return; soldRev[it] = (soldRev[it] || 0) + (+t.revenue || 0); soldUnits[it] = (soldUnits[it] || 0) + (+t.units || 0); });
    const vById = {}; (vars || []).forEach(v => { vById[v.id] = v; });
    const cById = {}; (conts || []).forEach(c => { cById[c.id] = c; });

    // Poinsettia plans sell by COLOR (consolidate); every other plan prices per VARIETY.
    // Detect: all of this plan's items are poinsettias.
    const cm = sc.length > 0 && sc.every(r => String((vById[r.variety_id] || {}).crop_name || "").toUpperCase() === "POINSETTIA");
    const baseTag = cm ? "POINSETTIA" : "__BASE__";

    // split existing prices: size base (variety_id null + crop_name = baseTag); color override
    // (color mode only: variety_id null + crop_name = color code); variety override (variety_id set).
    const baseThis = {}, baseLast = {}, ovThis = {}, ovLast = {}, baseIds = {}, ovIds = {};
    (prices || []).forEach(p => {
      const cn = String(p.crop_name || "").toUpperCase();
      const isBase = p.variety_id == null && (cm ? cn === "POINSETTIA" : true);
      if (isBase) {
        if (p.effective_year === plan.year) { baseThis[p.container_id] = +p.price; baseIds[p.container_id] = p.id; }
        else baseLast[p.container_id] = +p.price;
        return;
      }
      const key = p.variety_id == null ? p.container_id + "|C|" + cn : p.container_id + "|V|" + p.variety_id;
      if (p.effective_year === plan.year) { ovThis[key] = +p.price; ovIds[key] = p.id; }
      else ovLast[key] = +p.price;
    });

    // group plan rows: color mode → by container+color (NOVELTY/blank keeps variety);
    // otherwise → by container+variety.
    const groups = {};
    for (const r of sc) {
      if (!r.container_id) continue;
      const code = String(r.color || "").trim().toUpperCase();
      const isColor = cm && !!POIN_COLORS[code];
      const key = r.container_id + (isColor ? "|C|" + code : "|V|" + (r.variety_id || "_"));
      if (!groups[key]) {
        const v = vById[r.variety_id] || {};
        groups[key] = {
          key, containerId: r.container_id, kind: isColor ? "color" : "variety",
          code: isColor ? code : null, varietyId: isColor ? null : r.variety_id,
          label: isColor ? POIN_COLORS[code] : (v.variety || "(unnamed)"),
          cropName: v.crop_name || "", qty: 0, cost: 0, liner: 0, pot: 0, soil: 0, ring: 0, names: new Set(),
        };
      }
      groups[key].qty += (+r.qty_pots || 0);
      groups[key].cost += costById[r.id] || 0;
      const cm2 = compById[r.id]; if (cm2) { groups[key].liner += cm2.liner; groups[key].pot += cm2.pot; groups[key].soil += cm2.soil; groups[key].ring += cm2.ring; }
      if (r.item_name) groups[key].names.add(r.item_name);
    }
    // bucket groups under their container (size); attach cost/plant + 2026 realized avg
    const byCont = {};
    Object.values(groups).forEach(g => {
      const c = cById[g.containerId] || {};
      let rRev = 0, rUnits = 0; g.names.forEach(nm => { rRev += soldRev[nm] || 0; rUnits += soldUnits[nm] || 0; });
      byCont[g.containerId] = byCont[g.containerId] || {
        containerId: g.containerId, diameter: c.diameter_in, sku: c.sku, name: c.name,
        lastBase: baseLast[g.containerId] ?? null, items: [],
      };
      const nm0 = [...g.names][0] || "";
      byCont[g.containerId].items.push({
        key: g.key, kind: g.kind, code: g.code, varietyId: g.varietyId, label: g.label, cropName: g.cropName, qty: g.qty,
        name: nm0, premium: isPremiumName(nm0 || (g.cropName + " " + g.label)),
        unitCost: g.qty > 0 ? g.cost / g.qty : null,        // direct cost per sold unit
        cc: g.qty > 0 ? { liner: g.liner / g.qty, pot: g.pot / g.qty, soil: g.soil / g.qty, ring: g.ring / g.qty } : null, // per-unit cost components
        soldAvg: rUnits > 0 ? rRev / rUnits : null,         // 2026 realized avg $ per sold unit
        lastOv: ovLast[g.key] ?? null,
      });
    });
    setColorMode(cm);
    const list = Object.values(byCont).sort((a, b) => sizeRankOf(a) - sizeRankOf(b) || (a.sku || "").localeCompare(b.sku || ""));
    // Suggested price = the size's STANDARD realized average (keeps pricing uniform per size);
    // premium lines get their own (higher) tier. Round to cents. Falls back to the item's own avg.
    list.forEach(s => {
      const std = [], prem = [];
      s.items.forEach(it => { if (it.soldAvg != null) (it.premium ? prem : std).push(it.soldAvg); });
      s.stdSug = median(std); s.premSug = median(prem);
      s.items.forEach(it => {
        const anchor = it.premium ? (s.premSug ?? s.stdSug) : (s.stdSug ?? s.premSug);
        const v = anchor != null ? anchor : it.soldAvg;
        it.suggested = v != null ? Math.round(v * 100) / 100 : null;
      });
    });
    // colors first (fixed order), then novelties alpha
    list.forEach(s => s.items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "color" ? -1 : 1;
      if (a.kind === "color") return (POIN_COLOR_ORDER.indexOf(a.label) + 1 || 99) - (POIN_COLOR_ORDER.indexOf(b.label) + 1 || 99);
      return a.label.localeCompare(b.label);
    }));

    // seed edit buffers: this-year base defaults to existing this-year, else last-year
    const be = {}, oe = {};
    list.forEach(s => {
      be[s.containerId] = (baseThis[s.containerId] ?? baseLast[s.containerId] ?? "");
      s.items.forEach(it => { if (ovThis[it.key] != null) oe[it.key] = String(ovThis[it.key]); });
    });
    setSizes(list); setBaseEdit(p => Object.keys(p).length ? p : be); setOvEdit(p => Object.keys(p).length ? p : oe);
    setRowIds({ base: baseIds, ov: ovIds });
    setBusy(false);
  }
  useEffect(() => { if (sb) reload(); }, [sb, plan.id]);

  // effective this-year price for an item = override if set, else its size base
  const effThis = (s, it) => { const o = priceNum(ovEdit[it.key]); return o != null ? o : priceNum(baseEdit[s.containerId]); };
  const effLast = (s, it) => (it.lastOv != null ? it.lastOv : s.lastBase);

  function applyPct() {
    const p = priceNum(pct); if (p == null) return;
    const f = 1 + p / 100;
    setBaseEdit(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { const v = priceNum(n[k]); if (v != null) n[k] = String(round2(v * f)); }); return n; });
    setOvEdit(prev => { const n = { ...prev }; Object.keys(n).forEach(k => { const v = priceNum(n[k]); if (v != null && n[k] !== "") n[k] = String(round2(v * f)); }); return n; });
    setMsg(`Adjusted all this-year prices by ${p > 0 ? "+" : ""}${p}%. Review, then Save.`);
  }

  // Fill This-Year from the suggested ceilings: size standard → base; premium items → override.
  function applySuggested() {
    const be = {}, oe = { ...ovEdit };
    (sizes || []).forEach(s => {
      if (s.stdSug != null) be[s.containerId] = String(round2(s.stdSug));
      else if (baseEdit[s.containerId]) be[s.containerId] = baseEdit[s.containerId];
      s.items.forEach(it => { if (it.premium && it.suggested != null) oe[it.key] = String(round2(it.suggested)); });
    });
    setBaseEdit(prev => ({ ...prev, ...be }));
    setOvEdit(oe);
    setMsg("Filled this-year from suggested (size standard + premium tiers). Review, adjust with %, then Save.");
  }

  async function save() {
    if (!sizes) return;
    const baseTag = colorMode ? "POINSETTIA" : "__BASE__";
    setBusy(true); setMsg("Saving…");
    try {
      for (const s of sizes) {
        const baseVal = priceNum(baseEdit[s.containerId]);
        const id = rowIds.base[s.containerId];
        if (baseVal != null) {
          if (id) await sb.from("crop_pricing").update({ price: baseVal }).eq("id", id);
          else await sb.from("crop_pricing").insert({ container_id: s.containerId, variety_id: null, crop_name: baseTag, effective_year: plan.year, price: baseVal, price_tier: "pre-book", source_doc: "pricing tool" });
        }
        for (const it of s.items) {
          const ovStr = ovEdit[it.key]; const ovVal = priceNum(ovStr); const ovId = rowIds.ov[it.key];
          if (ovStr != null && ovStr !== "" && ovVal != null) {
            if (ovId) await sb.from("crop_pricing").update({ price: ovVal }).eq("id", ovId);
            else {
              // color override → variety_id null + crop_name = color code; per-variety → variety_id row
              const rec = it.kind === "color"
                ? { container_id: s.containerId, variety_id: null, crop_name: it.code, effective_year: plan.year, price: ovVal, price_tier: "pre-book", source_doc: "pricing tool" }
                : { container_id: s.containerId, variety_id: it.varietyId, crop_name: it.cropName || null, effective_year: plan.year, price: ovVal, price_tier: "pre-book", source_doc: "pricing tool" };
              await sb.from("crop_pricing").insert(rec);
            }
          } else if (ovId) {
            await sb.from("crop_pricing").delete().eq("id", ovId); // override cleared → fall back to base
          }
        }
      }
      setMsg("✓ Saved this-year prices.");
      await reload();
    } catch (e) { setMsg("Save failed: " + e.message); }
    setBusy(false);
  }

  const sizePrefix = s => (colorMode && POIN_BLOOM[Number(s.diameter)]) ? POIN_BLOOM[Number(s.diameter)] : sizeLabelOf(s);
  const itemName = (s, it) => `${sizePrefix(s)} ${[it.cropName, it.label].filter(Boolean).join(" ")}`;
  function copyTable() {
    const yy = String(plan.year).slice(2);
    const lines = [`Item\tProjected\tAvg sold ${yy}\tLast Year\tSuggested\tThis Year\tCost\tMargin %` + (colorMode ? "\tPot Cover" : "")];
    (sizes || []).forEach(s => { const pc = potCoverFor(s.diameter); s.items.forEach(it => {
      const et = effThis(s, it), el = effLast(s, it);
      const mp = (et != null && it.unitCost != null && et) ? ((et - it.unitCost) / et * 100).toFixed(0) + "%" : "";
      lines.push(`${itemName(s, it)}\t${it.qty}\t${it.soldAvg != null ? "$" + it.soldAvg.toFixed(2) : ""}\t${el != null ? "$" + el.toFixed(2) : ""}\t${it.suggested != null ? "$" + it.suggested.toFixed(2) : ""}\t${et != null ? "$" + et.toFixed(2) : ""}\t${it.unitCost != null ? "$" + it.unitCost.toFixed(2) : ""}\t${mp}` + (colorMode ? `\t${pc != null ? "$" + pc.toFixed(2) : ""}` : ""));
    }); });
    const text = lines.join("\r\n");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setMsg("✓ Copied " + (lines.length - 1) + " items to clipboard — paste into Sheets/Excel or the B2B form."));
  }

  if (sizes == null) return <div style={{ padding: 30, color: COLORS.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading pricing…</div>;
  const totalItems = sizes.reduce((n, s) => n + s.items.length, 0);
  const totalQty = sizes.reduce((n, s) => n + s.items.reduce((m, it) => m + it.qty, 0), 0);
  // KPIs: projected revenue at this-year prices vs last-year prices (same volumes) + blended margin
  let projRev = 0, lastRev = 0, mNum = 0, mDen = 0;
  sizes.forEach(s => s.items.forEach(it => {
    const et = effThis(s, it), el = effLast(s, it);
    if (et != null) projRev += it.qty * et;
    if (el != null) lastRev += it.qty * el;
    if (et != null && it.unitCost != null) { mNum += it.qty * (et - it.unitCost); mDen += it.qty * et; }
  }));
  const uplift = projRev - lastRev, blended = mDen > 0 ? mNum / mDen * 100 : null;
  const m$ = v => (v == null ? "—" : (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString());
  const inp = { width: 84, padding: "5px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", textAlign: "right", boxSizing: "border-box" };

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark }}>💲 Sale Pricing — {plan.name}</div>
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 3, maxWidth: 660 }}>
            Set a <strong>base price per size</strong> (fills every item that size); type a price on any item to <strong>override</strong>. {colorMode ? "Poinsettias are grouped by color (novelties listed individually)." : "Each variety is listed individually."} {totalItems} items · {totalQty.toLocaleString()} projected pots. Last year = {lastYear}.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: COLORS.muted }}>Adjust all by</span>
          <input value={pct} onChange={e => setPct(e.target.value)} placeholder="%" style={{ ...inp, width: 56 }} />
          <button onClick={applyPct} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Apply %</button>
          <button onClick={applySuggested} title="Fill this-year from suggested: each size's standard realized price, premium lines at their higher tier" style={{ border: `1px solid ${COLORS.light}`, background: "#eef6e7", color: COLORS.dark, borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✨ Use suggested</button>
          <button onClick={copyTable} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 7, padding: "6px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>⧉ Copy</button>
          <button onClick={save} disabled={busy} style={{ border: "none", background: busy ? "#8aa67a" : COLORS.dark, color: "#fff", borderRadius: 7, padding: "6px 14px", fontSize: 12.5, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "…" : "Save"}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <SrcStat label="Projected revenue" value={m$(projRev)} color={COLORS.light} />
        <SrcStat label={`vs ${lastYear} prices`} value={m$(lastRev)} />
        <SrcStat label="Uplift this yr" value={(uplift >= 0 ? "+" : "") + m$(uplift)} color={uplift > 0 ? COLORS.light : uplift < 0 ? COLORS.red : undefined} />
        <SrcStat label="Blended margin" value={blended == null ? "—" : blended.toFixed(0) + "%"} color={blended != null && blended < 0 ? COLORS.red : undefined} />
      </div>
      {msg && <div style={{ fontSize: 12.5, color: COLORS.dark, background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "7px 11px", marginBottom: 10 }}>{msg}</div>}

      {sizes.length === 0 ? <div style={{ color: COLORS.muted, padding: "20px 0" }}>No items in this plan yet.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted, background: "#f3f5ef" }}>
              <th style={th}>Item</th>
              <th style={{ ...th, textAlign: "right" }}>Projected</th>
              <th style={{ ...th, textAlign: "right" }} title={`Realized avg $ per sold unit, ${plan.year} sales`}>Avg sold {String(plan.year).slice(2)}</th>
              <th style={{ ...th, textAlign: "right" }}>Last Yr</th>
              <th style={{ ...th, textAlign: "right" }} title="size standard from realized sales; premium lines at their higher tier — click to use">Suggested</th>
              <th style={{ ...th, textAlign: "right" }}>This Yr</th>
              <th style={{ ...th, textAlign: "right" }} title="direct cost per unit (liner + pot + soil + ring)">Cost</th>
              <th style={{ ...th, textAlign: "right" }} title="margin at this-year price">Margin</th>
              {colorMode && <th style={{ ...th, textAlign: "right" }}>Pot Cover</th>}
            </tr>
          </thead>
          <tbody>
            {sizes.map(s => { const pc = potCoverFor(s.diameter); const hc = s.items.every(i => i.cropName === s.items[0].cropName) ? (s.items[0]?.cropName || "") : ""; return (
              <Fragment key={s.containerId}>
                <tr style={{ background: "#f7f9f4", borderTop: `2px solid ${COLORS.border}` }}>
                  <td style={{ ...td, fontWeight: 800, color: COLORS.dark }}>{sizePrefix(s)}{hc ? " " + hc : ""} <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 11 }}>· {s.sku} · {s.items.length} items</span></td>
                  <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{s.items.reduce((m, it) => m + it.qty, 0).toLocaleString()}</td>
                  <td style={td} />
                  <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{s.lastBase != null ? "$" + s.lastBase.toFixed(2) : "—"}</td>
                  <td onClick={() => s.stdSug != null && setBaseEdit(p => ({ ...p, [s.containerId]: String(round2(s.stdSug)) }))}
                    title={s.stdSug != null ? "click to set this size's base to the suggested standard" : ""}
                    style={{ ...td, textAlign: "right", fontWeight: 700, color: s.stdSug != null ? COLORS.dark : COLORS.muted, cursor: s.stdSug != null ? "pointer" : "default" }}>{s.stdSug != null ? "$" + s.stdSug.toFixed(2) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <span style={{ fontSize: 11, color: COLORS.muted, marginRight: 4 }}>base</span>
                    <input value={baseEdit[s.containerId] ?? ""} onChange={e => setBaseEdit(p => ({ ...p, [s.containerId]: e.target.value }))} style={inp} />
                  </td>
                  <td style={td} />
                  <td style={td} />
                  {colorMode && <td style={{ ...td, textAlign: "right", fontWeight: 700, color: pc != null ? COLORS.text : COLORS.muted }}>{pc != null ? "$" + pc.toFixed(2) : "—"}</td>}
                </tr>
                {s.items.map(it => {
                  const et = effThis(s, it), el = effLast(s, it);
                  const overridden = priceNum(ovEdit[it.key]) != null && ovEdit[it.key] !== "";
                  const mg = (et != null && it.unitCost != null) ? et - it.unitCost : null;
                  const mp = (mg != null && et) ? mg / et * 100 : null;
                  const mcol = mp == null ? COLORS.muted : mp < 15 ? COLORS.red : mp < 35 ? COLORS.amber : COLORS.light;
                  const cc = it.cc, open = costOpen.has(it.key);
                  const ccTip = cc ? `Liner $${cc.liner.toFixed(2)} · Pot $${cc.pot.toFixed(2)} · Soil $${cc.soil.toFixed(2)} · Ring $${cc.ring.toFixed(2)}  (click for detail)` : "";
                  return (
                    <Fragment key={it.key}>
                    <tr style={{ borderBottom: open ? "none" : `1px solid ${COLORS.border}` }}>
                      <td style={{ ...td, paddingLeft: 18 }}>{itemName(s, it)}{it.premium && <span title="premium line — priced higher (more space + quality reputation)" style={{ marginLeft: 6, fontSize: 9.5, color: "#a86a10", fontWeight: 800 }}>✦ premium</span>}{colorMode && it.kind === "variety" && <span title="novelty — priced individually" style={{ marginLeft: 6, fontSize: 9.5, color: COLORS.muted }}>novelty</span>}{overridden && <span title="custom price (overrides the size base)" style={{ marginLeft: 6, fontSize: 10, color: COLORS.amber, fontWeight: 700 }}>◆ custom</span>}</td>
                      <td style={{ ...td, textAlign: "right" }}>{it.qty.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: "right", color: it.soldAvg != null ? COLORS.dark : "#cbd5c0", fontWeight: it.soldAvg != null ? 700 : 400 }} title={it.soldAvg != null ? `realized average per sold unit, ${plan.year}` : "no matched sales"}>{it.soldAvg != null ? "$" + it.soldAvg.toFixed(2) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{el != null ? "$" + el.toFixed(2) : "—"}</td>
                      <td onClick={() => it.suggested != null && setOvEdit(p => ({ ...p, [it.key]: String(round2(it.suggested)) }))}
                        title={it.suggested != null ? (it.premium ? "suggested premium-tier price — click to use" : "suggested size-standard price — click to use") : ""}
                        style={{ ...td, textAlign: "right", color: it.suggested != null ? (it.premium ? "#a86a10" : COLORS.dark) : COLORS.muted, fontWeight: 700, cursor: it.suggested != null ? "pointer" : "default" }}>{it.suggested != null ? "$" + it.suggested.toFixed(2) : "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input value={ovEdit[it.key] ?? ""} placeholder={priceNum(baseEdit[s.containerId]) != null ? priceNum(baseEdit[s.containerId]).toFixed(2) : ""}
                          onChange={e => setOvEdit(p => ({ ...p, [it.key]: e.target.value }))} style={{ ...inp, borderColor: overridden ? COLORS.amber : COLORS.border }} />
                        <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>{et != null ? "= $" + et.toFixed(2) : ""}</div>
                      </td>
                      <td onClick={() => cc && setCostOpen(p => { const n = new Set(p); n.has(it.key) ? n.delete(it.key) : n.add(it.key); return n; })}
                        title={ccTip}
                        style={{ ...td, textAlign: "right", color: COLORS.muted, cursor: cc ? "pointer" : "default", textDecoration: cc ? "underline dotted" : "none" }}>
                        {it.unitCost != null ? "$" + it.unitCost.toFixed(2) : "—"}{cc ? <span style={{ marginLeft: 3, fontSize: 9, color: COLORS.muted }}>{open ? "▾" : "▸"}</span> : null}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: mcol, fontWeight: 700 }} title={mg != null ? `$${mg.toFixed(2)}/unit margin` : ""}>{mp != null ? mp.toFixed(0) + "%" : "—"}</td>
                      {colorMode && <td style={{ ...td, textAlign: "right", color: COLORS.muted, fontSize: 11 }}>{pc != null ? "$" + pc.toFixed(2) : ""}</td>}
                    </tr>
                    {open && cc && (
                      <tr style={{ borderBottom: `1px solid ${COLORS.border}`, background: "#fbfdf9" }}>
                        <td colSpan={8 + (colorMode ? 1 : 0)} style={{ ...td, padding: "4px 18px 8px 30px" }}>
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                            <span style={{ color: COLORS.muted, fontWeight: 700 }}>Cost breakdown ${it.unitCost.toFixed(2)}/unit:</span>
                            {[["Liner", cc.liner, "#1976d2"], ["Pot", cc.pot, "#c8791a"], ["Soil", cc.soil, "#7a5230"], ["Ring", cc.ring, "#3d7a2f"]].map(([lbl, v, c]) => (
                              <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: c, display: "inline-block" }} />
                                <strong style={{ color: COLORS.dark }}>{lbl}</strong> ${v.toFixed(2)}
                                <span style={{ color: COLORS.muted }}>({it.unitCost > 0 ? Math.round(v / it.unitCost * 100) : 0}%)</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ); })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Items tab — flat scheduled_crops table ──────────────────────────────────
function ItemsTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [brokers, setBrokers] = useState({}); // name -> {rep_name, rep_email, rep_phone}
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      // paginate — Spring has >1000 crops and variety_library >1000 rows (PostgREST caps at 1000)
      const sc = await srcPageAll(sb, "scheduled_crops", "id,variety_id,container_id,bench_id,color,qty_pots,ppp,qty_plants_ordered,liner_unit_cost,broker,item_name,plant_week,ship_week,status", q => q.eq("plan_id", plan.id));
      const vars = await srcPageAll(sb, "variety_library", "id,variety,breeder");
      const containers = await srcPageAll(sb, "containers", "id,sku");
      const { data: bench } = await sb.from("benches").select("id,code,zone_label").limit(2000);
      const { data: bp } = await sb.from("broker_profiles").select("name,rep_name,rep_email,rep_phone");
      const bmap = {}; (bp || []).forEach(b => { bmap[b.name] = b; }); setBrokers(bmap);

      setRows((sc || []).map(r => ({
        ...r,
        variety: (vars || []).find(v => v.id === r.variety_id),
        container: (containers || []).find(c => c.id === r.container_id),
        bench: (bench || []).find(b => b.id === r.bench_id),
      })).sort((a, b) => a.plant_week - b.plant_week || (a.bench?.code || "").localeCompare(b.bench?.code || "")));
    })();
  }, [sb, plan.id]);

  // Open a prefilled email to the row's broker rep — for shortages, issues, or re-orders.
  function contactBroker(r) {
    const b = resolveBrokerProfile(brokers, r.broker);
    const itemName = r.item_name || r.variety?.variety || "this item";
    const subject = `Schlegel Greenhouse — ${itemName} (${plan.name})`;
    const body =
      `Hi ${b?.rep_name || r.broker || ""},\n\n` +
      `Regarding ${itemName} on our ${plan.name} plan` +
      (r.qty_plants_ordered ? ` (planned ${r.qty_plants_ordered} liners)` : "") + `:\n\n` +
      `- [ ] Need to request additional material\n- [ ] Shortage / availability question\n- [ ] Other issue\n\n` +
      `Please advise on availability and timing. Thanks,\nSchlegel Greenhouse`;
    const to = b?.rep_email || "";
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const q = search.toLowerCase();
  const filtered = q ? rows.filter(r =>
    (r.variety?.variety || "").toLowerCase().includes(q) ||
    (r.bench?.code || "").toLowerCase().includes(q) ||
    (r.container?.sku || "").toLowerCase().includes(q) ||
    (r.color || "").toLowerCase().includes(q)
  ) : rows;

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>
          Items · {rows.length} crop blocks · {filtered.length} shown
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search variety / bench / SKU / color"
          style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, minWidth: 280 }} />
      </div>
      <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: "#f3f5ef" }}>
            <tr>
              <th style={th}>Wk</th>
              <th style={th}>Bench</th>
              <th style={th}>Variety</th>
              <th style={th}>Container</th>
              <th style={th}>Color</th>
              <th style={{...th, textAlign:"right"}}>Pots</th>
              <th style={{...th, textAlign:"right"}}>ppp</th>
              <th style={{...th, textAlign:"right"}}>Liners</th>
              <th style={{...th, textAlign:"right"}}>$/liner</th>
              <th style={th}>Broker</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const b = resolveBrokerProfile(brokers, r.broker);
              return (
              <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={td}>{r.plant_week}</td>
                <td style={td}>{r.bench?.code}</td>
                <td style={td}>{r.variety?.variety} <span style={{ color: COLORS.muted, fontSize: 10 }}>{r.variety?.breeder}</span></td>
                <td style={td}>{r.container?.sku}</td>
                <td style={td}>{r.color}</td>
                <td style={{...td, textAlign:"right"}}>{r.qty_pots}</td>
                <td style={{...td, textAlign:"right"}}>{r.ppp}</td>
                <td style={{...td, textAlign:"right"}}>{r.qty_plants_ordered}</td>
                <td style={{...td, textAlign:"right"}}>${(+r.liner_unit_cost || 0).toFixed(3)}</td>
                <td style={td}>
                  {r.broker ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, color: srcBrokerColor(r.broker) }} title={b?.rep_name ? `${b.rep_name}${b.rep_email ? " · " + b.rep_email : ""}` : ""}>{r.broker}</span>
                      <button onClick={() => contactBroker(r)} title={`Email ${b?.rep_name || r.broker} about ${r.item_name || r.variety?.variety || "this item"} — shortage, issue, or re-order`}
                        style={{ border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 6, padding: "0 6px", fontSize: 11, cursor: "pointer", lineHeight: 1.6 }}>✉</button>
                    </span>
                  ) : <span style={{ color: COLORS.muted }}>—</span>}
                </td>
                <td style={td}>{r.status}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Materials tab — full BOM for the plan ──────────────────────────────────
// Aggregates everything we need to order/stage for this plan:
//   • Liners (by variety + breeder)
//   • Pots (by SKU, with pallet/case roll-up)
//   • Soil (total fluffed cf → bags needed)
//   • Rings (per pinched container, via default_ring_id)
//   • Inputs (program_inputs allocated share)
// ── Plug Orders tab — live what-if calculator ────────────────────────────────
// Enter flat/pot counts → see plug trays (sized by destination), extras, $ cost.
// 1801 → count 288 (a full tray = 16 flats); 4.5"/basket/combo → count 280.
// Billing is always 280/tray. Flag when extras > ½ tray. Nudge the mix live.
const PLUG_SIZES = {
  "288": { cells: 288, billed: 280, price: 0.12 },
  "285": { cells: 285, billed: 280, price: 0.12 },
  "160": { cells: 160, billed: 160, price: 0.26 },
  "144": { cells: 144, billed: 140, price: 0.12 },
};
function plugDest(c, item) {
  const s = `${c?.sku || ""} ${c?.name || ""} ${item || ""}`.toLowerCase();
  if (s.includes("1801")) return "1801";
  if (s.includes("4.5") || s.includes("4in") || s.includes("azalea")) return '4.5"';
  return "basket/combo";
}
function plugUsable(size, dest) {
  if (size === "288" && dest === "1801") return 288; // full tray = 16 1801 flats, plant it all
  return PLUG_SIZES[size]?.billed || 280;            // else plan on the billed count (8 = buffer)
}

function PlugOrdersTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [flats, setFlats] = useState({}); // id -> flat-count override
  const [sizes, setSizes] = useState({}); // id -> plug-size override
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const sc = await srcPageAll(sb, "scheduled_crops", "id,variety_id,container_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,item_name,prop_method,is_combo_component", q => q.eq("plan_id", plan.id)); // paginate + include combo components
      const plugs = (sc || []).filter(r => (r.prop_method || "").toUpperCase().startsWith("PLUG"));
      const vids = [...new Set(plugs.map(r => r.variety_id).filter(Boolean))];
      const cids = [...new Set(plugs.map(r => r.container_id).filter(Boolean))];
      const { data: vars } = vids.length ? await sb.from("variety_library").select("id,crop_name,variety").in("id", vids) : { data: [] };
      const { data: cons } = cids.length ? await sb.from("containers").select("id,sku,name").in("id", cids) : { data: [] };
      const vmap = Object.fromEntries((vars || []).map(v => [v.id, v]));
      const cmap = Object.fromEntries((cons || []).map(c => [c.id, c]));
      // CONSOLIDATE like the Propagation page: one row per variety + plant-week + destination, summing the order across every bench/record it appears on.
      const agg = {};
      for (const r of plugs) {
        const v = vmap[r.variety_id]; const c = cmap[r.container_id];
        const ppp = +r.ppp || 1;
        const base = (+r.qty_pots || 0) > 0 ? +r.qty_pots : Math.round((+r.qty_plants_ordered || 0) / ppp);  // combo components carry the count in qty_plants_ordered (qty_pots=0)
        const dest = plugDest(c, r.item_name);
        const key = `${r.variety_id}|${r.plant_year}|${r.plant_week}|${dest}`;
        if (!agg[key]) agg[key] = { key, v, c, dest, ppp, item_name: r.item_name, plant_week: r.plant_week, plant_year: r.plant_year, base: 0, recs: [] };
        agg[key].base += base;
        agg[key].recs.push({ id: r.id, base, ppp, isCombo: !!r.is_combo_component });
      }
      setRows(Object.values(agg));
    })();
  }, [sb, plan.id]);

  if (!rows) return <div style={{ padding: 20, color: COLORS.muted }}>Loading…</div>;
  if (!rows.length) return <div style={{ padding: 20, color: COLORS.muted }}>No plug-grown items in this plan yet (pansies, violas, etc.).</div>;

  const compute = (g) => {
    const ppp = g.ppp || 1;
    const f = flats[g.key] != null ? +flats[g.key] : g.base;
    const need = Math.round(f * ppp);
    const dest = g.dest;
    const defSize = /cool wave/i.test(g.item_name || "") ? "285" : "288";
    const size = sizes[g.key] || defSize;
    const cfg = PLUG_SIZES[size] || PLUG_SIZES["288"];
    const cnt = plugUsable(size, dest);
    const trays = cnt ? Math.ceil(need / cnt) : 0;
    const received = trays * cfg.cells;
    const extras = received - need;
    const cost = trays * cfg.billed * cfg.price;
    const flag = extras > cnt / 2;
    return { f, ppp, need, dest, size, cnt, trays, received, extras, cost, flag };
  };

  const computed = rows.map(g => ({ g, ...compute(g) }))
    .sort((a, b) => `${a.g.v?.crop_name} ${a.g.v?.variety}`.localeCompare(`${b.g.v?.crop_name} ${b.g.v?.variety}`));
  const byWeek = {};
  computed.forEach(x => { const k = `${x.g.plant_year}·wk${x.g.plant_week}`; (byWeek[k] = byWeek[k] || []).push(x); });
  const weeks = Object.keys(byWeek).sort();
  const grand = computed.reduce((a, x) => ({ trays: a.trays + x.trays, extras: a.extras + x.extras, cost: a.cost + x.cost }), { trays: 0, extras: 0, cost: 0 });
  const flagged = computed.filter(x => x.flag).length;
  const dirty = Object.keys(flats).length > 0;

  async function save() {
    setSaving(true);
    const updates = computed.filter(x => flats[x.g.key] != null);
    for (const x of updates) {
      // distribute the consolidated flats back across the underlying bench records ∝ their original share (largest-remainder → exact sum)
      const recs = x.g.recs; const totalBase = recs.reduce((a, r) => a + r.base, 0) || recs.length;
      const floored = recs.map(r => Math.floor(x.f * ((r.base || 1) / totalBase)));
      let rem = x.f - floored.reduce((a, b) => a + b, 0);
      const order = recs.map((r, i) => [i, x.f * ((r.base || 1) / totalBase) - floored[i]]).sort((a, b) => b[1] - a[1]);
      for (let j = 0; j < rem && order.length; j++) floored[order[j % order.length][0]]++;
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i]; const fl = floored[i]; const need = Math.round(fl * (rec.ppp || 1));
        await sb.from("scheduled_crops").update(rec.isCombo ? { qty_plants_ordered: need } : { qty_pots: fl, qty_plants_ordered: need }).eq("id", rec.id);
        rec.base = fl;
      }
      x.g.base = x.f;
    }
    setRows(rs => [...rs]); setFlats({}); setSaving(false);
  }

  const numIn = { width: 56, padding: "3px 5px", border: `1px solid ${COLORS.border}`, borderRadius: 5, fontSize: 13, textAlign: "right" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
        Enter <strong>flats / pots</strong> per item — it sizes the plug order live (never short): <strong>1801 → 288/tray</strong> (a full tray = 16 flats), <strong>4.5"/basket/combo → 280/tray</strong>; you're billed 280/tray either way. <span style={{ color: COLORS.red, fontWeight: 700 }}>Extras over ½ tray flag red</span> — nudge the mix (−one variety, +another) to absorb them so nothing's left as orphan partial trays.
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <RevStat label="Plug trays" value={grand.trays.toLocaleString()} accent={COLORS.dark} />
        <RevStat label="Total extras" value={grand.extras.toLocaleString()} accent={flagged ? COLORS.red : COLORS.light} />
        <RevStat label="Plug cost" value={fmtMoney(grand.cost)} accent={COLORS.dark} />
        <RevStat label="Flagged (>½ tray)" value={flagged} accent={flagged ? COLORS.red : COLORS.muted} />
        {dirty && <button onClick={save} disabled={saving} style={{ marginLeft: "auto", padding: "8px 16px", background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving…" : "💾 Save quantities"}</button>}
      </div>

      {weeks.map(wk => {
        const ws = byWeek[wk];
        const wt = ws.reduce((a, x) => ({ trays: a.trays + x.trays, extras: a.extras + x.extras, cost: a.cost + x.cost }), { trays: 0, extras: 0, cost: 0 });
        return (
          <div key={wk} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", background: "#eaf3df", fontWeight: 800, color: COLORS.dark, fontSize: 13 }}>📅 {wk} · {ws.length} varieties · {wt.trays} trays · {wt.extras} extra · {fmtMoney(wt.cost)}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <th style={th}>Variety</th><th style={th}>Dest</th><th style={th}>Plug</th>
                <th style={{ ...th, textAlign: "right" }}>Flats/Pots</th><th style={{ ...th, textAlign: "right" }}>Need</th>
                <th style={{ ...th, textAlign: "right" }}>Trays</th><th style={{ ...th, textAlign: "right" }}>Recv</th>
                <th style={{ ...th, textAlign: "right" }}>Extra</th><th style={{ ...th, textAlign: "right" }}>$ Cost</th>
              </tr></thead>
              <tbody>
                {ws.map(x => (
                  <tr key={x.g.key} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <td style={td}><span style={{ fontWeight: 600 }} title={x.g.recs.length > 1 ? `${x.g.recs.length} bench records consolidated into this plug order` : undefined}>{x.g.v?.crop_name} {x.g.v?.variety}</span>{x.g.recs.length > 1 ? <span style={{ color: COLORS.muted, fontWeight: 400, fontSize: 11 }}> ·{x.g.recs.length}×</span> : null}</td>
                    <td style={{ ...td, fontSize: 11, color: COLORS.muted }}>{x.dest}</td>
                    <td style={td}>
                      <select value={x.size} onChange={e => setSizes(s => ({ ...s, [x.g.key]: e.target.value }))} style={{ fontSize: 12, padding: "2px 4px", border: `1px solid ${COLORS.border}`, borderRadius: 5 }}>
                        {Object.keys(PLUG_SIZES).map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <input type="number" min="0" value={x.f} onChange={e => setFlats(s => ({ ...s, [x.g.key]: e.target.value === "" ? 0 : Math.max(0, +e.target.value) }))} style={numIn} />
                    </td>
                    <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{x.need.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{x.trays}</td>
                    <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{x.received.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: x.flag ? "#fff" : COLORS.text, background: x.flag ? COLORS.red : "transparent", borderRadius: x.flag ? 5 : 0 }}>{x.extras.toLocaleString()}</td>
                    <td style={{ ...td, textAlign: "right" }}>{fmtMoney(x.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Sales vs Plan tab ─────────────────────────────────────────────────────────
// 2026 actual sales (sales_totals + sales_weekly) matched to this plan's finished
// items via the sales_sku_map crosswalk → sell-through, lost sales, demand timing.
// Pots can sell in multi-packs, and plan vs sales aren't always in the same unit:
//  • 4.5" → flat of 10; plan qty is ALSO in flats (both sides ×10 → finished pots)
//  • 6.5" → case of 6 when case-priced (>$20); plan qty is in individual POTS (mismatch!)
//  • everything else → individual on both sides
// Sales compares ITEM QUANTITY (sellable units) to sold units — ppp is irrelevant here (ppp only
// drives plant/order counts: order qty = qty_pots × ppp). qty_pots IS the item quantity. The one
// wrinkle: a few 4.5"/6.5" are entered in individual pots while their sales are recorded in the
// sold pack (flat / case) — detectable as ppp < plants_per_unit — so divide those by the pack size
// (plants_per_unit) to land in the same sellable unit the sales use. Never multiply by ppp.
function plannedItems(qtyPots, ppp, ppu) {
  ppp = +ppp || 1; ppu = +ppu || 1;
  return ppp >= ppu ? qtyPots : Math.max(1, Math.round(qtyPots / ppu));
}
const sizeTokenForItem = n => sizeLabelForItem(n);
// Selling out before peak demand = a real lost sale; selling out as the season ends isn't.
// Main-season items: cutoff at Mother's Day (wk 19). Early-spring items (pansy etc., which peak
// by end of March) cut off ~2nd-to-last week of March (wk 13). (2026 sales data runs wk 9–24.)
const MD_CUTOFF_WK = 19, EARLY_CUTOFF_WK = 13, EARLY_PEAK_WK = 13;
// first-sale week -> the Monday's date, since "first date sold" reads better than "wk15"
function wkStartLabel(wk) {
  const jan4 = new Date(Date.UTC(2026, 0, 4));
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (wk - 1) * 7);
  return mon.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function SalesVsPlanTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState(null);
  const [sortCol, setSortCol] = useState("lostEst");
  const [sortDir, setSortDir] = useState("desc");
  const [filt, setFilt] = useState("all");
  const [query, setQuery] = useState("");
  const [sizeFilt, setSizeFilt] = useState("all");
  const [basis, setBasis] = useState("pots"); // "pots" = normalized finished pots · "raw" = as-entered units
  // Projection session: agreed 2027 targets live in plan_targets, keyed by item
  // name, so the sales conversation never has to answer bench questions.
  const [targets, setTargets] = useState({});   // item_name → row
  const [missing, setMissing] = useState([]);   // sold in 2026, absent from this plan
  const [bulkBusy, setBulkBusy] = useState(false);
  const [drill, setDrill] = useState(null);          // item row opened in the drawer
  const [selSet, setSelSet] = useState(() => new Set());  // checkbox multi-select
  const [draft, setDraft] = useState({});       // item_name → in-flight input text
  const [savingT, setSavingT] = useState({});
  const { displayName } = useAuth();
  useEffect(() => {
    if (!sb) return;
    const COMPONENT = /\bVINE\b|\bIVY\b|HEDERA|MU[EH]+LENBECKIA|CAREX/i;
    (async () => {
      const xw = await srcPageAll(sb, "sales_sku_map", "sku,plan_item_name");
      const skuToItem = {}; xw.forEach(x => { if (x.plan_item_name) skuToItem[x.sku] = x.plan_item_name; });
      const tot = await srcPageAll(sb, "sales_totals", "sku,units,revenue,avg_price");
      const wk = await srcPageAll(sb, "sales_weekly", "sku,wk,units,revenue");
      const sc = await srcPageAll(sb, "scheduled_crops", "id,item_name,qty_pots,ppp,plants_per_unit,ship_week,ready_week,combo_parent_id,is_combo_component", q => q.eq("plan_id", plan.id));
      const weeks = [...new Set(wk.map(w => +w.wk))].sort((a, b) => a - b);
      const wIdx = Object.fromEntries(weeks.map((w, i) => [w, i]));
      // A combo basket = one finished unit (multiple plants on a row are for ONE basket, not many).
      // Count finished baskets, not plants. When an item has true combo-parent rows (rows that own
      // components), only those count — any sibling non-parent "basket" rows are duplicate phantoms
      // (e.g. mix baskets entered once per color bench) and would over-count the finished total.
      const parentIds = new Set(sc.map(r => r.combo_parent_id).filter(Boolean));
      const itemsWithParents = new Set(sc.filter(r => parentIds.has(r.id)).map(r => r.item_name));
      const planByItem = {}, shipByItem = {}, readyByItem = {}, pppByItem = {}, ppuByItem = {};
      // Ivy / vinca vine / muehlenbeckia / carex are grown mostly as combo inputs
      // but ALSO sold retail as 4.5" packs. Counting their full planned volume as
      // finished items would show ~12% sell-through and read as a disaster, so
      // they stay out of the totals — but they're carried through as dualUse so
      // they're visible for target-setting instead of silently disappearing.
      const dualUse = {};
      for (const r of sc) {
        if (!(+r.qty_pots > 0) || r.is_combo_component) continue;
        if (COMPONENT.test(r.item_name)) { dualUse[r.item_name] = (dualUse[r.item_name] || 0) + +r.qty_pots; continue; }
        if (itemsWithParents.has(r.item_name) && !parentIds.has(r.id)) continue; // drop phantom duplicate basket rows
        planByItem[r.item_name] = (planByItem[r.item_name] || 0) + +r.qty_pots;
        pppByItem[r.item_name] = Math.max(pppByItem[r.item_name] || 0, +r.ppp || 1);
        ppuByItem[r.item_name] = Math.max(ppuByItem[r.item_name] || 0, +r.plants_per_unit || 1);
        if (r.ship_week != null) shipByItem[r.item_name] = Math.min(shipByItem[r.item_name] ?? 999, +r.ship_week);
        if (r.ready_week != null) readyByItem[r.item_name] = Math.min(readyByItem[r.item_name] ?? 999, +r.ready_week);
      }
      const sold = {}, rev = {}, prc = {}, prn = {}, wkly = {};
      for (const t of tot) { const it = skuToItem[t.sku]; if (!it) continue; sold[it] = (sold[it] || 0) + +t.units; rev[it] = (rev[it] || 0) + +t.revenue; prc[it] = (prc[it] || 0) + +t.avg_price; prn[it] = (prn[it] || 0) + 1; }
      for (const w of wk) { const it = skuToItem[w.sku]; if (!it) continue; (wkly[it] = wkly[it] || Array(weeks.length).fill(0))[wIdx[+w.wk]] += +w.units; }
      const seasonRev = Array(weeks.length).fill(0); for (const w of wk) seasonRev[wIdx[+w.wk]] += +w.revenue;
      const out = [];
      for (const it of Object.keys(planByItem)) {
        const planned = planByItem[it], s = sold[it] || 0, price = prn[it] ? prc[it] / prn[it] : 0;
        const wkA = wkly[it] || Array(weeks.length).fill(0);
        const peak = wkA.some(x => x > 0) ? weeks[wkA.indexOf(Math.max(...wkA))] : null;
        const pItems = plannedItems(planned, pppByItem[it], ppuByItem[it]);
        // overplanned $ = grew more than sold (cut-back candidates)
        const over = s < pItems ? Math.round((pItems - s) * price) : 0;
        // sold-out-early = a real lost sale: sold everything AND ran out before the season's cutoff.
        const saleIdx = wkA.map((u, i) => u > 0 ? i : -1).filter(i => i >= 0);
        const firstWk = saleIdx.length ? weeks[saleIdx[0]] : null;
        const lastWk = saleIdx.length ? weeks[saleIdx[saleIdx.length - 1]] : null;
        const cutoff = (peak != null && peak <= EARLY_PEAK_WK) ? EARLY_CUTOFF_WK : MD_CUTOFF_WK;
        const soldOut = s >= pItems && pItems > 0 && lastWk != null && lastWk < cutoff;
        const lostEst = soldOut ? Math.round((s / Math.max(1, lastWk - firstWk + 1)) * (cutoff - lastWk) * price) : 0;
        out.push({ item: it, size: sizeTokenForItem(it), converted: pItems !== planned, planRaw: planned, planned: pItems, sold: s, st: pItems ? s / pItems : 0, over, lostEst, soldOut, cutoff, lastWk, firstWk, price: s > 0 ? (rev[it] || 0) / s : (price || null), rev: Math.round(rev[it] || 0), wk: wkA, peak, ship: readyByItem[it] ?? shipByItem[it] ?? null, status: soldOut ? "SOLDOUT" : s >= pItems ? "HIT" : (s === 0 ? "NOSALE" : "SHORT") });
      }
      // Dual-use rows: real retail sales, but planned volume mostly feeds combos,
      // so sell-through / over / lost are meaningless and deliberately left null.
      for (const it of Object.keys(dualUse)) {
        const s = sold[it] || 0;
        if (!s) continue; // only surface the ones that actually sold retail
        const wkA = wkly[it] || Array(weeks.length).fill(0);
        const peak = wkA.some(x => x > 0) ? weeks[wkA.indexOf(Math.max(...wkA))] : null;
        const dIdx = wkA.map((u, i) => u > 0 ? i : -1).filter(i => i >= 0);
        out.push({ item: it, size: sizeTokenForItem(it), dualUse: true, converted: false, firstWk: dIdx.length ? weeks[dIdx[0]] : null, price: s > 0 ? (rev[it] || 0) / s : null,
          planRaw: dualUse[it], planned: dualUse[it], sold: s, st: null, over: 0, lostEst: 0,
          soldOut: false, cutoff: null, lastWk: null, rev: Math.round(rev[it] || 0),
          wk: wkA, peak, ship: readyByItem[it] ?? shipByItem[it] ?? null, status: "DUAL" });
      }
      // Sold last season but absent from this plan — invisible in a plan-driven
      // table, and exactly what gets dropped by accident when a plan is built by
      // replaying last year's master list.
      const inPlan = new Set(Object.keys(planByItem));
      const gaps = {};
      for (const t of tot) {
        const it = skuToItem[t.sku];
        if (it && inPlan.has(it)) continue;
        const key = it || `${t.sku}`;
        const g = gaps[key] = gaps[key] || { key, desc: null, units: 0, rev: 0, mapped: !!it };
        g.units += +t.units; g.rev += +t.revenue;
      }
      const totBySku = Object.fromEntries(tot.map(t => [t.sku, t]));
      for (const g of Object.values(gaps)) if (!g.desc) g.desc = totBySku[g.key]?.description || g.key;
      setMissing(Object.values(gaps).filter(g => g.rev > 250).sort((a, b) => b.rev - a.rev));

      setRows(out); setSeason({ weeks, seasonRev });
      const { data: tg } = await sb.from("plan_targets").select("*").eq("plan_id", plan.id);
      setTargets(Object.fromEntries((tg || []).map(t => [t.item_name, t])));
    })();
  }, [sb, plan.id]);

  // Save a decision. Snapshots what it sold and what the plan held, so the
  // production session can see the reasoning later without recomputing it.
  async function saveTarget(r, patch) {
    // PARTIAL writes only. The old version rebuilt the WHOLE row from browser
    // state, so a timing-arrow click or blur before targets finished loading
    // overwrote saved values with null (wiped two real decisions). On-conflict
    // updates only the columns sent; unsent fields keep their DB values.
    const next = {
      plan_id: plan.id, item_name: r.item, ...patch,
      prior_units: r.sold, current_units: r.planned,
      decided_by: displayName || "planner", decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setTargets(t => ({ ...t, [r.item]: { ...(t[r.item] || {}), ...next } }));
    setSavingT(s => ({ ...s, [r.item]: true }));
    const { error } = await sb.from("plan_targets").upsert(next, { onConflict: "plan_id,item_name" });
    if (error) window.alert("Decision did NOT save: " + error.message);
    setSavingT(s => { const n = { ...s }; delete n[r.item]; return n; });
  }
  if (!rows) return <div style={{ padding: 20, color: COLORS.muted }}>Loading sales vs plan…</div>;
  if (!rows.length) return <div style={{ padding: 20, color: COLORS.muted }}>No matched sales yet — the SKU crosswalk (sales_sku_map) is empty for this plan's items.</div>;
  const spark = a => { const m = Math.max(...a) || 1; return a.map(v => " ▁▂▃▄▅▆▇█"[Math.round(v / m * 8)]).join(""); };
  // sell-through compares item quantity to sold units; "raw" shows the as-entered qty_pots
  const dPlanned = r => basis === "raw" ? r.planRaw : r.planned;
  const dSold = r => r.sold;
  const core = rows.filter(r => !r.dualUse); // dual-use rows would distort every ratio
  const tPlanned = core.reduce((a, r) => a + dPlanned(r), 0), tSold = core.reduce((a, r) => a + dSold(r), 0);
  const tOver = core.reduce((a, r) => a + r.over, 0), tLostEst = core.reduce((a, r) => a + r.lostEst, 0), tRev = core.reduce((a, r) => a + r.rev, 0);
  const soldOutCount = rows.filter(r => r.soldOut).length;
  const maxR = Math.max(...season.seasonRev, 1); const pkWk = season.weeks[season.seasonRev.indexOf(maxR)];
  const sizes = ["all", ...Array.from(new Set(rows.map(r => r.size))).sort()];
  const q = query.trim().toLowerCase();
  const sortVal = { item: r => r.item, st: r => r.st ?? -1, price: r => r.price ?? -1, firstWk: r => r.firstWk ?? 99, planned: r => dPlanned(r), sold: r => r.sold, status: r => r.status, over: r => r.over, lostEst: r => r.lostEst, rev: r => r.rev, peak: r => r.peak ?? 99 };
  const clickSort = c => { if (c === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(c); setSortDir(c === "item" ? "asc" : "desc"); } };
  // sticky + clickable column header (table lives in its own scroll viewport so it pins at top:0)
  const stickyTh = { ...th, position: "sticky", top: 0, zIndex: 11, background: "#eef3e8" };
  const SortHdr = ({ col, label, align }) => (
    <th onClick={() => clickSort(col)} style={{ ...stickyTh, textAlign: align || "left", cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
      {label}{sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );
  // ── Projection impact ──────────────────────────────────────────────────────
  // Space is zero-sum: the plan is already 100% bench-assigned, so every unit
  // added has to displace something. Show the net footprint change live, and
  // per size, because a 4.5" flat and a 10" basket are not interchangeable.
  const decided = rows.filter(r => targets[r.item]?.target_units != null || targets[r.item]?.decision === "drop");
  const timingMoves = rows.filter(r => (targets[r.item]?.ready_shift || 0) !== 0);
  const targetOf = r => {
    const t = targets[r.item];
    if (!t) return null;
    if (t.decision === "drop") return 0;
    return t.target_units == null ? null : +t.target_units;
  };
  const impact = rows.reduce((acc, r) => {
    const t = targetOf(r);
    if (t == null) return acc;
    const d = t - r.planned;
    acc.units += d;
    acc.rev += d * (r.sold && r.rev ? r.rev / r.sold : 0);
    acc.bySize[r.size] = (acc.bySize[r.size] || 0) + d;
    return acc;
  }, { units: 0, rev: 0, bySize: {} });
  const sizeDeltas = Object.entries(impact.bySize).filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

  // Projection sessions run on groups, not varieties — "drop bacopa 20% in 4.5\"".
  // Applying a % to the filtered set records a per-item target (so nothing is
  // lost) while the decision itself is one action.
  async function applyPct(pct) {
    const targetRows = selSet.size ? shown.filter(r => selSet.has(r.item)) : shown;
    if (!targetRows.length || bulkBusy) return;
    const verb = pct === 0 ? "hold at current plan" : `${pct > 0 ? "increase" : "reduce"} by ${Math.abs(pct)}%`;
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} — ${targetRows.length} ${selSet.size ? "selected" : "shown"} item${targetRows.length !== 1 ? "s" : ""}.\n\nThis records a 2027 target on each one. You can still change any of them individually.`)) return;
    setBulkBusy(true);
    const stamp = new Date().toISOString();
    const payload = targetRows.map(r => {
      const t = Math.max(0, Math.round(r.planned * (1 + pct / 100)));
      return { plan_id: plan.id, item_name: r.item, target_units: t,
        decision: t === 0 ? "drop" : t > r.planned ? "grow" : t < r.planned ? "cut" : "hold",
        note: pct === 0 ? "bulk: hold" : `bulk ${pct > 0 ? "+" : ""}${pct}%`,
        prior_units: r.sold, current_units: r.planned,
        decided_by: displayName || "planner", decided_at: stamp, updated_at: stamp };
    });
    try {
      for (let i = 0; i < payload.length; i += 200) {
        await sb.from("plan_targets").upsert(payload.slice(i, i + 200), { onConflict: "plan_id,item_name" });
      }
      setTargets(t => { const n = { ...t }; payload.forEach(p => { n[p.item_name] = { ...(n[p.item_name] || {}), ...p }; }); return n; });
    } catch (e) { window.alert("Couldn't apply: " + (e.message || e)); }
    setBulkBusy(false);
  }

  const shown = rows.filter(r => (filt === "all" ? true
      : filt === "over" ? r.status === "SHORT"
      : filt === "soldout" ? r.soldOut
      : filt === "todo" ? targetOf(r) == null
      : filt === "done" ? targetOf(r) != null
      : r.status === "HIT")
      && (sizeFilt === "all" || r.size === sizeFilt)
      && (!q || r.item.toLowerCase().includes(q)))
    .sort((a, b) => { const va = (sortVal[sortCol] || sortVal.lostEst)(a), vb = (sortVal[sortCol] || sortVal.lostEst)(b); const c = typeof va === "string" ? va.localeCompare(vb) : (va - vb); return sortDir === "asc" ? c : -c; });
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: COLORS.muted }}>
        2026 actual sales vs this plan (item quantity = qty_pots, matched by SKU crosswalk). <strong style={{ color: COLORS.amber }}>Overplanned&nbsp;$</strong> = (planned − sold) × price where you grew more than sold (cut-back candidates). <strong style={{ color: COLORS.red }}>Lost sales&nbsp;$</strong> = est. missed revenue on items that <em>sold out before their season's cutoff</em> (main season wk&nbsp;{MD_CUTOFF_WK} / Mother's Day; early-spring &amp; pansies wk&nbsp;{EARLY_CUTOFF_WK}, ~end of March) — grow-more candidates. <strong>2026 sales</strong> = these items' real revenue. Items entered in pots (marked <span style={{ fontWeight: 700, color: COLORS.muted }}>⤵</span>) shown in their sold pack.
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <RevStat label="Sell-through" value={tPlanned ? Math.round(tSold / tPlanned * 100) + "%" : "—"} accent={COLORS.dark} />
        <RevStat label="Overplanned $" value={fmtMoney(tOver)} accent={COLORS.amber} />
        <RevStat label={`Lost sales · ${soldOutCount} sold out`} value={fmtMoney(tLostEst)} accent={COLORS.red} />
        <RevStat label="2026 sales · these items" value={fmtMoney(tRev)} accent={COLORS.light} />
        <RevStat label="Demand peak" value={"wk" + pkWk} accent={COLORS.dark} />
      </div>

      {/* ── Projection session: running impact of the decisions made so far ── */}
      <div style={{ background: COLORS.card, border: `1px solid ${decided.length ? COLORS.dark : COLORS.border}`, borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Decisions made</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.dark }}>{decided.length} <span style={{ fontSize: 13, color: COLORS.muted, fontWeight: 600 }}>of {rows.length}</span></div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Net footprint change</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: impact.units > 0 ? COLORS.red : impact.units < 0 ? "#2e7d32" : COLORS.muted }}>
              {impact.units > 0 ? "+" : ""}{impact.units.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.muted }}>units</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Timing moves</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: timingMoves.length ? COLORS.dark : COLORS.muted }}>
              {timingMoves.length}
              {timingMoves.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.muted }}> · {timingMoves.filter(r => (targets[r.item].ready_shift || 0) < 0).length} earlier / {timingMoves.filter(r => (targets[r.item].ready_shift || 0) > 0).length} later</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Projected revenue change</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: impact.rev >= 0 ? "#2e7d32" : COLORS.red }}>
              {impact.rev >= 0 ? "+" : "−"}{fmtMoney(Math.abs(Math.round(impact.rev)))}
            </div>
          </div>
          {sizeDeltas.length > 0 && (
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>By size — what has to give</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {sizeDeltas.slice(0, 10).map(([s, v]) => (
                  <span key={s} style={{ fontSize: 11.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: v > 0 ? "#fdecea" : "#eaf5e9", color: v > 0 ? COLORS.red : "#2e7d32", border: `1px solid ${v > 0 ? "#f3c6c0" : "#c2e0be"}` }}>
                    {s} {v > 0 ? "+" : ""}{v.toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        {impact.units > 0 && (
          <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 8 }}>
            The plan is already fully bench-assigned — a positive number means something else has to come out before production can absorb this.
          </div>
        )}
      </div>
      <ProgramsPanel plan={plan} />

      {missing.length > 0 && (
        <details style={{ background: COLORS.card, border: `1px solid ${COLORS.amber}`, borderRadius: 10 }}>
          <summary style={{ cursor: "pointer", padding: "11px 14px", fontWeight: 800, color: COLORS.dark }}>
            ⚠ Sold in 2026 but not in this plan — {missing.length} items · {fmtMoney(missing.reduce((a, m) => a + m.rev, 0))}
            <span style={{ fontWeight: 500, color: COLORS.muted, fontSize: 12 }}> · decide whether each was dropped on purpose</span>
          </summary>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>2026 units</th><th style={{ ...th, textAlign: "right" }}>2026 $</th><th style={th}>Match</th></tr></thead>
            <tbody>
              {missing.map((m, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.desc}</td>
                  <td style={{ ...td, textAlign: "right" }}>{Math.round(m.units).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(m.rev)}</td>
                  <td style={{ ...td, fontSize: 11, color: COLORS.muted }}>{m.mapped ? "maps to an item not in this plan" : "no SKU match"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontWeight: 800, color: COLORS.dark, marginBottom: 10 }}>📈 Season revenue by week (2026)</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 150, borderBottom: `2px solid ${COLORS.border}` }}>
          {season.seasonRev.map((v, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }} title={`wk${season.weeks[i]}: ${fmtMoney(v)}`}>
              <div style={{ width: "76%", height: Math.max(2, v / maxR * 132), background: season.weeks[i] === pkWk ? COLORS.dark : COLORS.light, borderRadius: "3px 3px 0 0" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 3 }}>{season.weeks.map(w => <div key={w} style={{ flex: 1, fontSize: 9, color: COLORS.muted, textAlign: "center" }}>{w}</div>)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 Search item…"
          style={{ padding: "7px 11px", borderRadius: 16, border: `1px solid ${COLORS.border}`, fontSize: 12.5, fontFamily: "inherit", width: 200, boxSizing: "border-box" }} />
        <select value={sizeFilt} onChange={e => setSizeFilt(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 16, border: `1px solid ${sizeFilt !== "all" ? COLORS.light : COLORS.border}`, fontSize: 12, fontFamily: "inherit", background: "#fff", color: COLORS.text, cursor: "pointer" }}>
          {sizes.map(s => <option key={s} value={s}>{s === "all" ? "All sizes" : s}</option>)}
        </select>
        {[["all", "All"], ["over", "🟠 Overplanned"], ["soldout", "🔴 Sold out early"], ["hit", "🟢 Hit"], ["todo", "◻ Undecided"], ["done", "✓ Decided"]].map(([f, l]) => <button key={f} onClick={() => setFilt(f)} style={{ padding: "6px 12px", borderRadius: 16, fontWeight: 700, cursor: "pointer", border: `1px solid ${filt === f ? COLORS.light : COLORS.border}`, background: filt === f ? COLORS.light : "#fff", color: filt === f ? "#fff" : COLORS.text }}>{l}</button>)}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: COLORS.muted }} title="Item quantity = qty_pots (what sells). As-entered shows the raw plan number before pot→pack conversion.">units:</span>
          {[["pots", "Item qty"], ["raw", "As entered"]].map(([k, l]) => <button key={k} onClick={() => setBasis(k)} style={{ padding: "6px 10px", borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${basis === k ? COLORS.dark : COLORS.border}`, background: basis === k ? COLORS.dark : "#fff", color: basis === k ? "#fff" : COLORS.text }}>{l}</button>)}
          <span style={{ color: COLORS.muted, marginLeft: 4 }}>{shown.length} items</span>
        </span>
      </div>
      {/* Group action bar — what the filter currently selects, and one move on all of it */}
      {shown.length > 0 && (selSet.size > 0 || query.trim() || sizeFilt !== "all" || filt !== "all") && (() => {
        const barRows = selSet.size ? shown.filter(r => selSet.has(r.item)) : shown;
        const gPlanned = barRows.reduce((a, r) => a + (r.planned || 0), 0);
        const gSold = barRows.reduce((a, r) => a + (r.sold || 0), 0);
        const gRev = barRows.reduce((a, r) => a + (r.rev || 0), 0);
        const gSt = gPlanned ? Math.round(gSold / gPlanned * 100) : null;
        return (
          <div style={{ background: "#eef4e9", border: `1.5px solid ${COLORS.light}`, borderRadius: 10, padding: "11px 14px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: COLORS.text }}>
              <b style={{ color: COLORS.dark }}>{barRows.length} items{selSet.size ? " ✓ selected" : ""}</b>
              {!selSet.size && query.trim() ? <> matching “{query.trim()}”</> : null}
              {!selSet.size && sizeFilt !== "all" ? <> in {sizeFilt}</> : null}
              {" — "}{gPlanned.toLocaleString()} planned · {gSold.toLocaleString()} sold
              {gSt != null ? <> · <b style={{ color: gSt >= 95 ? "#2e7d32" : gSt < 60 ? COLORS.red : COLORS.text }}>{gSt}% sell-through</b></> : null}
              {" · "}{fmtMoney(gRev)}
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase" }}>Apply to {selSet.size ? `${selSet.size} selected` : `all ${shown.length}`}:</span>
              {[-30, -20, -10, 0, 10, 20].map(p => (
                <button key={p} disabled={bulkBusy} onClick={() => applyPct(p)}
                  style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: bulkBusy ? "default" : "pointer",
                    border: `1px solid ${p === 0 ? COLORS.border : p < 0 ? "#e0b4ab" : "#b4d3ab"}`,
                    background: p === 0 ? "#fff" : p < 0 ? "#fdecea" : "#eaf5e9",
                    color: p === 0 ? COLORS.muted : p < 0 ? COLORS.red : "#2e7d32", opacity: bulkBusy ? 0.5 : 1 }}>
                  {p === 0 ? "same" : `${p > 0 ? "+" : ""}${p}%`}
                </button>
              ))}
              <button disabled={bulkBusy} onClick={() => { const v = window.prompt("Percent change (e.g. -20 or 15):"); if (v != null && v.trim() !== "" && !isNaN(+v)) applyPct(+v); }}
                style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.text }}>
                custom…
              </button>
              {selSet.size > 0 && (
                <button onClick={() => setSelSet(new Set())}
                  style={{ padding: "5px 11px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.muted }}>
                  clear ✓
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {drill && (
        <ItemDrill plan={plan} row={drill} tgt={targets[drill.item]} weeks={season.weeks}
          onSaveTarget={patch => saveTarget(drill, patch)} onClose={() => setDrill(null)} />
      )}

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "auto", maxHeight: "72vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={{ ...stickyTh, width: 28 }} title="Select shown items">
              <input type="checkbox" checked={shown.length > 0 && shown.every(r => selSet.has(r.item))}
                onChange={e => setSelSet(e.target.checked ? new Set([...selSet, ...shown.map(r => r.item)]) : new Set([...selSet].filter(x => !shown.some(r => r.item === x))))} />
            </th>
            <SortHdr col="item" label="Item" />
            <SortHdr col="planned" label="Planned" align="right" />
            <SortHdr col="sold" label="Sold" align="right" />
            <SortHdr col="st" label="Sell-thru" align="right" />
            <SortHdr col="status" label="Status" />
            <SortHdr col="over" label="Over $" align="right" />
            <SortHdr col="lostEst" label="Lost $" align="right" />
            <SortHdr col="rev" label="2026 $" align="right" />
            <SortHdr col="price" label="Avg $" align="right" />
            <SortHdr col="firstWk" label="1st sold" align="right" />
            <th style={stickyTh} title="Finish (ready) week vs demand peak. ◀ ▶ record a decision to bring it in earlier or later — production applies it by moving the plant week; the finish follows automatically.">Timing</th>
            <th style={{ ...stickyTh, textAlign: "right", background: "#e4eedd", borderLeft: `2px solid ${COLORS.light}` }} title="Agreed 2027 target in sellable units. Saved to plan_targets — production distributes it across benches later.">2027 target</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, 500).map((r, i) => {
              const badge = r.status === "SOLDOUT" ? { bg: COLORS.red, t: "SOLD OUT" } : r.status === "HIT" ? { bg: "#5e9c4a", t: "HIT" } : r.status === "NOSALE" ? { bg: "#c8d0c0", t: "NOSALE" } : r.status === "DUAL" ? { bg: "#4a7ba8", t: "DUAL USE" } : { bg: COLORS.amber, t: "OVER" };
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, background: selSet.has(r.item) ? "#f2f8ec" : undefined }}>
                  <td style={td}>
                    <input type="checkbox" checked={selSet.has(r.item)}
                      onChange={() => setSelSet(prev => { const n = new Set(prev); n.has(r.item) ? n.delete(r.item) : n.add(r.item); return n; })} />
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <span onClick={() => setDrill(r)} title="Open full detail — sales story, timing, components"
                      style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "#c9d8c0", textUnderlineOffset: 3 }}>
                      {r.item}
                    </span>
                    {r.converted && <span title="entered in individual pots — shown in the sold pack (flat/case) to match sales" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: COLORS.muted }}>⤵</span>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{dPlanned(r).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>{dSold(r).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.st == null ? COLORS.muted : r.st >= 1 ? "#2e7d32" : r.st < 0.6 ? COLORS.red : COLORS.text }} title={r.st == null ? "Most of the planned volume goes into combos — a retail sell-through % would be misleading" : ""}>{r.st == null ? "—" : Math.round(r.st * 100) + "%"}</td>
                  <td style={td}><span title={r.status === "SOLDOUT" ? `sold out wk${r.lastWk} (before wk${r.cutoff} cutoff) — grow more` : ""} style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 8, color: "#fff", background: badge.bg }}>{badge.t}</span></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.over > 0 ? COLORS.amber : COLORS.muted }}>{r.over ? fmtMoney(r.over) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.lostEst > 0 ? COLORS.red : COLORS.muted }}>{r.lostEst ? fmtMoney(r.lostEst) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{fmtMoney(r.rev)}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.price != null && r.price > 0 ? "$" + (+r.price).toFixed(2) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }} title={r.peak ? `first sale — demand peaked wk${r.peak}` : ""}>{r.firstWk != null ? wkStartLabel(r.firstWk) : <span style={{ color: "#c8d0c0" }}>—</span>}</td>
                  <TimingCell r={r} tgt={targets[r.item]} onShift={n => saveTarget(r, { ready_shift: n === 0 ? null : n })} />
                  <TargetCell r={r} tgt={targets[r.item]} draft={draft[r.item]} saving={savingT[r.item]}
                    onDraft={v => setDraft(d => ({ ...d, [r.item]: v }))}
                    onSave={patch => saveTarget(r, patch)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One row's 2027 decision: a number plus the quick calls that cover most items.
// "Same" and "Drop" are one click because in a real session most items are one
// of those two — typing only happens where the number is actually changing.
function TargetCell({ r, tgt, draft, saving, onDraft, onSave }) {
  const val = draft !== undefined ? draft : (tgt?.decision === "drop" ? "0" : (tgt?.target_units ?? ""));
  const committed = tgt?.target_units != null || tgt?.decision === "drop";
  const t = tgt?.decision === "drop" ? 0 : (tgt?.target_units != null ? +tgt.target_units : null);
  const delta = t == null ? null : t - r.planned;
  const commit = raw => {
    const s = String(raw).trim();
    if (s === "") { onSave({ target_units: null, decision: null }); return; }
    const n = Math.max(0, Math.round(+s.replace(/[^0-9.]/g, "")));
    if (isNaN(n)) return;
    onSave({ target_units: n, decision: n === 0 ? "drop" : n > r.planned ? "grow" : n < r.planned ? "cut" : "hold" });
  };
  const quick = (label, value, title) => (
    <button title={title} onClick={() => { onDraft(undefined); commit(value); }}
      style={{ padding: "1px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.muted }}>{label}</button>
  );
  return (
    <td style={{ ...td, textAlign: "right", background: committed ? "#f2f8ee" : "#fbfdfa", borderLeft: `2px solid ${COLORS.light}`, whiteSpace: "nowrap" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center", justifyContent: "flex-end" }}>
        {delta != null && delta !== 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, color: delta > 0 ? COLORS.red : "#2e7d32" }}>
            {delta > 0 ? "+" : ""}{delta.toLocaleString()}
          </span>
        )}
        <input
          value={val}
          onChange={e => onDraft(e.target.value)}
          onBlur={e => {
            const touched = draft !== undefined;       // only write if the user actually edited
            onDraft(undefined);
            if (!touched) return;
            if (e.target.value.trim() === "" && tgt?.target_units == null) return;  // empty-over-empty no-op
            commit(e.target.value);
          }}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          placeholder={String(r.planned)}
          style={{ width: 62, padding: "3px 6px", textAlign: "right", borderRadius: 6, fontSize: 12.5,
            fontFamily: "inherit", border: `1px solid ${committed ? COLORS.light : COLORS.border}`,
            background: saving ? "#f0f0e8" : "#fff", fontWeight: committed ? 700 : 400 }} />
      </div>
      <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", marginTop: 3 }}>
        {quick("same", r.planned, "Keep the current plan quantity")}
        {r.sold > 0 && quick("=sold", r.sold, `Match 2026 sales (${r.sold.toLocaleString()})`)}
        {quick("drop", 0, "Do not grow this in 2027")}
      </div>
    </td>
  );
}

// Finish week vs demand peak, adjustable. The shift is a DECISION (plan_targets.
// ready_shift), not a plan edit — production applies it by moving the plant week;
// the ready date follows via crop_weeks, so it can never go stale.
function TimingCell({ r, tgt, onShift }) {
  const shift = tgt?.ready_shift || 0;
  const base = r.ship;                    // min ready week for the item
  if (base == null) return <td style={td}><span style={{ color: "#c8d0c0" }}>—</span></td>;
  const eff = base + shift;
  const late = r.peak != null && eff > r.peak;
  const arrow = { border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 6, cursor: "pointer",
    fontSize: 11, fontWeight: 800, color: COLORS.muted, padding: "1px 6px", lineHeight: 1.4 };
  return (
    <td style={{ ...td, whiteSpace: "nowrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <button title="one week earlier" style={arrow} onClick={() => onShift(shift - 1)}>◀</button>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: late ? COLORS.red : "#2e7d32" }}
          title={`finishes wk${base}${shift ? ` → wk${eff} after the agreed move` : ""}${r.peak != null ? `, demand peaks wk${r.peak}` : ""}`}>
          {late ? "⚠ " : "✓ "}wk{eff}
          {shift !== 0 && <b style={{ color: shift < 0 ? "#2e7d32" : COLORS.amber }}> ({shift > 0 ? "+" : ""}{shift})</b>}
        </span>
        <button title="one week later" style={arrow} onClick={() => onShift(shift + 1)}>▶</button>
        {shift !== 0 && <button title="clear the move" onClick={() => onShift(0)}
          style={{ ...arrow, color: COLORS.red, border: "none", background: "none" }}>×</button>}
      </span>
    </td>
  );
}

// Group liner/cutting rows by week → variety (for the Materials dropdowns).
function groupLinersByWeek(rows) {
  const byWeek = {};
  for (const r of rows) {
    const w = byWeek[r.weekKey] = byWeek[r.weekKey] || {};
    if (!w[r.vid]) w[r.vid] = { name: r.name, breeder: r.breeder, qty: 0, cost: 0 };
    w[r.vid].qty += r.qty; w[r.vid].cost += r.cost;
  }
  return Object.entries(byWeek).map(([week, vmap]) => {
    const items = Object.values(vmap).sort((a, b) => a.name.localeCompare(b.name));
    return { week, items, qty: items.reduce((s, i) => s + i.qty, 0), cost: items.reduce((s, i) => s + i.cost, 0) };
  }).sort((a, b) => a.week.localeCompare(b.week));
}

// Collapsible per-week dropdowns of liner/cutting varieties.
function LinerWeekGroups({ groups }) {
  if (!groups || !groups.length) return <div style={{ color: COLORS.muted, padding: 12 }}>None in this plan.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {groups.map(g => (
        <details key={g.week} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
          <summary style={{ cursor: "pointer", padding: "8px 12px", fontWeight: 700, color: COLORS.dark, background: "#f3f8ee", borderRadius: 8 }}>
            📅 {g.week} · {g.items.length} varieties · {g.qty.toLocaleString()} plants · {fmtMoney(g.cost)}
          </summary>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={th}>Variety</th><th style={th}>Breeder</th>
              <th style={{ ...th, textAlign: "right" }}>Qty</th><th style={{ ...th, textAlign: "right" }}>$/each</th>
              <th style={{ ...th, textAlign: "right" }}>Total</th><th style={th}>Conf #</th>
            </tr></thead>
            <tbody>
              {g.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...td, fontWeight: 600 }}>{it.name}</td>
                  <td style={{ ...td, color: COLORS.muted }}>{it.breeder || "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{it.qty.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>{it.qty ? "$" + (it.cost / it.qty).toFixed(3) : "—"}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtMoney(it.cost)}</td>
                  <td style={{ ...td, color: COLORS.muted, fontSize: 11 }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}

// Misting need from a culture days_in_mist / days_with_mist value (number, range, "yes"/"no", text).
function mistNeed(md) {
  if (md == null || md === "") return null;
  const s = String(md).toLowerCase().trim();
  if (/^(no|none|0|dry|n\/?a)$/.test(s)) return false;
  if (/yes|mist|fog/.test(s)) return true;
  const n = parseFloat(s); if (!isNaN(n)) return n > 0;
  return true; // any other non-empty value in the mist field → treat as needs mist
}
function mistLabel(md) { const s = String(md); return /^\s*\d/.test(s) ? `${s}d` : s; }
// Real rooting hormone reads like "500 ppm IBA" / "Optional" / "No"; a bare number range
// ("12 to 16") is a harvester mis-parse (days, wrong field) — drop it so it isn't shown as a rate.
function realHormone(v) {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  if (/^\d+(\s*(to|-|–)\s*\d+)?$/.test(s)) return "";
  return s;
}

// Sticking priority by crop (Ball/Selecta URC 2024-25 list): 1 = stick first … 4 = last.
const STICKING_PRIORITY = {
  Geranium: 1, Lantana: 1, Euphorbia: 1, Portulaca: 1, Purslane: 1, Thunbergia: 1, Heliotrope: 1, Lobelia: 1, Ipomoea: 1, Dahlia: 1, Lavender: 1, Lavandula: 1, Lobularia: 1, Alyssum: 1, Fuchsia: 1, Plectranthus: 1, Dianthus: 1, Cleome: 1, Ageratum: 1, Mandevilla: 1, Dipladenia: 1,
  Verbena: 2, Erysimum: 2, Arctotis: 2, Phlox: 2, Salvia: 2, Strobilanthes: 2, Evolvulus: 2, Diascia: 2, Calceolaria: 2, Pericallis: 2, Begonia: 2, Bacopa: 2, Sutera: 2, Calibrachoa: 2, Coleus: 2, Gomphrena: 2, Impatiens: 2, Nemesia: 2, Muehlenbeckia: 2, Osteospermum: 2, Perilla: 2, Petunia: 2, Petchoa: 2,
  Alternanthera: 3, Angelonia: 3, Bidens: 3, Brachyscome: 3, Bracteantha: 3, Cuphea: 3, Helichrysum: 3, Iresine: 3, Lamium: 3, Nierembergia: 3, Scaevola: 3, Torenia: 3, Celosia: 3, Gaura: 3, Hebe: 3,
  Mecardonia: 4, Glechoma: 4, Lysimachia: 4, Vinca: 4, Ajuga: 4, Sanvitalia: 4, Sedum: 4,
  Cyperus: 1, Juncus: 1, Aptenia: 1, Dorotheanthus: 1, Dracaena: 1,
  Sunpatiens: 2, "New Guinea Impatiens": 2, Supercal: 2, Argyranthemum: 2, Felicia: 2, Gerbera: 2,
  Acalypha: 3, Didelta: 3, Artemesia: 3, Pentas: 3,
  Setcreasea: 4, Tradescantia: 4, Ivy: 4, Peperomia: 4, Heuchera: 4, Oxalis: 4, Caladium: 4, Calla: 4, Callas: 4, Canna: 4, Fern: 4,
};
const PRIO_COLOR = { 1: "#d94f3d", 2: "#e89a3a", 3: "#7fb069", 4: "#7a8c74", 9: "#c8d0c0" };

// Cutting DIFFICULTY by crop — 1 = easy/fast, 2 = average, 3 = hard/slow. Weights the prop-load
// chart so harder crops count for more labor. (Caleb-ranked; default = average until set.)
const STICKING_DIFFICULTY = {
  // 1 = easy / fast (Caleb-ranked 2026-06-18)
  Geranium: 1, Sunpatiens: 1, Dahlia: 1, Ipomoea: 1, "New Guinea Impatiens": 1, Osteospermum: 1, Scaevola: 1, Cyperus: 1, Tradescantia: 1, Peperomia: 1, Dorotheanthus: 1, Setcreasea: 1, Bracteantha: 1, Aptenia: 1, Argyranthemum: 1, Didelta: 1,
  // 3 = hard / slow
  Calibrachoa: 3, Zinnia: 3, Muehlenbeckia: 3, Cuphea: 3, Bidens: 3, Bacopa: 3, Diascia: 3, Acalypha: 3, Lobelia: 3, Lobularia: 3, Marigold: 3, Nemesia: 3, Oxalis: 3,
  // everything else (Ivy, Begonia, Petunia, Verbena, Coleus, Lantana, Lysimachia, Vinca, Angelonia, Salvia, Fuchsia, Portulaca, Torenia, Plectranthus, Ageratum, Petchoa, Ajuga, Alternanthera, Artemesia, Calendula, Felicia, Gaura, Heliotrope, Heuchera, Phlox, Sanvitalia, Double Impatiens, …) defaults to 2 = average
};
const DIFF_DEFAULT = 2;

// Propagation schedule — prop-stage items sorted date → cell size → sticking priority,
// split by misting need (culture days_in_mist), with treatment recs + task creation.
function PropagationTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [mist, setMist] = useState("all"); // all | mist | dry
  const [sel, setSel] = useState(() => new Set());
  const [taskItems, setTaskItems] = useState(null);
  const [detail, setDetail] = useState(null);
  const [labor, setLabor] = useState({ rate: "", crew: "", hrs: "40", lead: "2" }); // sticks/person-hr, crew size, hrs/person/wk, onboarding-lead wks — fill in once known
  const [weightByDiff, setWeightByDiff] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const sc = await srcPageAll(sb, "scheduled_crops", "id,variety_id,prop_method,prop_tray_size,ship_week,ship_year,plant_week,plant_year,qty_pots,qty_plants_ordered,ppp,container_id,item_name,is_combo_component,bench_id", q => q.eq("plan_id", plan.id));
      const prop = (sc || []).filter(r => r.prop_tray_size && String(r.prop_tray_size).trim() && /^(URC|CALL|SEED)/i.test(r.prop_method || ""));
      const vids = [...new Set(prop.map(r => r.variety_id).filter(Boolean))];
      let vars = [];   // chunk the .in() — a single lookup of hundreds of UUIDs overflows the URL and returns nothing
      for (let i = 0; i < vids.length; i += 150) { const { data } = await sb.from("variety_library").select("id,crop_name,variety,breeder,culture_source_id,culture_guide_url,care_profile").in("id", vids.slice(i, i + 150)); if (data) vars = vars.concat(data); }
      const vmap = Object.fromEntries(vars.map(v => [v.id, v]));
      const cids = [...new Set(prop.map(r => r.container_id).filter(Boolean))];
      const { data: conts } = cids.length ? await sb.from("containers").select("id,name,diameter_in").in("id", cids) : { data: [] };
      const contMap = Object.fromEntries((conts || []).map(c => [c.id, c]));
      const potLabel = cid => { const c = contMap[cid]; if (!c) return "?"; const d = c.diameter_in ? `${+c.diameter_in}"` : (c.name || "?"); return /basket|hanging|coco|\bhb\b/i.test(c.name || "") ? `${d} HB` : d; };
      const csids = [...new Set((vars || []).map(v => v.culture_source_id).filter(Boolean))];
      const cmap = {}; const cc = getCultureClient();
      if (cc && csids.length) for (let i = 0; i < csids.length; i += 100) { const { data: cg } = await cc.from("culture_guides_public").select("id,propagation_details,culture_details").in("id", csids.slice(i, i + 100)); (cg || []).forEach(g => { const cdt = g.culture_details || {}; cmap[g.id] = { pd: g.propagation_details || {}, pdf: cdt["Culture Guide PDF"] || cdt["Culture Guide PDF (Origin)"] || null }; }); }
      // Aggregate by VARIETY + ship-week + cell → one clickable variety row carrying every destination it feeds.
      const agg = {};
      for (const r of prop) {
        const v = vmap[r.variety_id] || {};
        const size = +r.prop_tray_size || 0;
        const ppp = +r.ppp || 1;
        // Plants = the ORDER QUANTITY (cuttings/seeds to stick). qty_plants_ordered is the
        // authoritative figure from the sheet; where it isn't filled in, compute it as
        // pots/flats × ppp — the same need calc the Plug Orders tab uses (qty_pots holds
        // the flat/pot count; combo components carry their count in qty_plants_ordered).
        const plants = (+r.qty_plants_ordered || 0) > 0 ? +r.qty_plants_ordered : (+r.qty_pots || 0) * ppp;
        const pots = (+r.qty_pots || 0) > 0 ? +r.qty_pots : Math.round((+r.qty_plants_ordered || 0) / ppp);
        const weekKey = r.ship_week != null ? `${r.ship_year}·wk${String(r.ship_week).padStart(2, "0")}` : "—";
        const key = `${r.variety_id}|${weekKey}|${size}`;
        if (!agg[key]) {
          const ce = v.culture_source_id ? (cmap[v.culture_source_id] || {}) : {}; const pd = ce.pd || {};
          const md = pd.days_in_mist ?? pd.days_with_mist ?? null;
          agg[key] = {
            id: key, crop: v.crop_name || "", variety: v.variety || "", breeder: v.breeder || "",
            week: r.ship_week, year: r.ship_year, weekKey, cell: size, plants: 0, dests: [],
            prio: STICKING_PRIORITY[v.crop_name] || 9,
            mistDays: /^geranium/i.test(v.crop_name || "") ? "no (in-house)" : md, needsMist: /^geranium/i.test(v.crop_name || "") ? false : mistNeed(md),
            hormone: realHormone(pd.rooting_hormone || pd.hormone), fungicide: pd.fungicide || "", pinch: pd.propagation_pinch || pd.pinch || "", tips: pd.key_tips || "",
            pgr: pd.plug_pgr || "", pd, pdf: ce.pdf || v.culture_guide_url || ((v.care_profile || {})["Culture Guide PDF"]) || null, callused: false, method: r.prop_method,
          };
        }
        const a = agg[key]; a.plants += plants;
        a.dests.push({ item: r.item_name, pot: potLabel(r.container_id), isCombo: !!r.is_combo_component, ppp, pots, plants, plantWk: r.plant_week, plantYr: r.plant_year });
        if (/^call/i.test(r.prop_method || "")) a.callused = true;
      }
      setRows(Object.values(agg).map(a => {
        const usable = a.cell === 105 ? 100 : (a.cell || 1);
        a.trays = Math.ceil(a.plants / usable); a.plugs = a.plants;
        const pots = [...new Set(a.dests.map(d => (d.isCombo ? `${d.pot} combo` : d.pot)))];
        a.forLabel = pots.slice(0, 3).join(" · ") + (pots.length > 3 ? ` +${pots.length - 3}` : "");
        a.dests.sort((x, y) => y.plants - x.plants);
        return a;
      }));
    })();
  }, [sb, plan.id]);

  if (!rows) return <div style={{ padding: 20, color: COLORS.muted }}>Loading propagation schedule…</div>;
  if (!rows.length) return <div style={{ padding: 20, color: COLORS.muted }}>No prop-stage items (URC / callused / seed with a prop tray) in this plan yet.</div>;

  const ql = q.trim().toLowerCase();
  const shown = rows.filter(r => {
    if (mist === "mist" && r.needsMist !== true) return false;
    if (mist === "dry" && r.needsMist === true) return false;
    if (ql && !`${r.crop} ${r.variety} ${r.item}`.toLowerCase().includes(ql)) return false;
    return true;
  });
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selRows = shown.filter(r => sel.has(r.id));

  // top totals by cell size (across the filtered set)
  const sizeTotals = {}; shown.forEach(r => { sizeTotals[r.cell] = (sizeTotals[r.cell] || 0) + r.trays; });
  const sizes = Object.keys(sizeTotals).map(Number).sort((a, b) => a - b);
  // group: week → size → items
  const byWeek = {}; shown.forEach(r => { const w = byWeek[r.weekKey] = byWeek[r.weekKey] || {}; (w[r.cell] = w[r.cell] || []).push(r); });
  const weekKeys = Object.keys(byWeek).sort();
  const sumTrays = arr => arr.reduce((a, r) => a + r.trays, 0);

  // Weekly sticking load (labor-planning chart). units = difficulty-weighted (Σ plants × crop 1–3 rank).
  const weekLoad = weekKeys.map(wk => {
    const items = Object.values(byWeek[wk]).flat();
    const plants = items.reduce((a, r) => a + (r.plugs || 0), 0);
    const trays = items.reduce((a, r) => a + r.trays, 0);
    const units = items.reduce((a, r) => a + (r.plugs || 0) * (STICKING_DIFFICULTY[r.crop] || DIFF_DEFAULT), 0);
    return { wk, plants, trays, units, vars: items.length };
  });
  const rate = +labor.rate || 0, crew = +labor.crew || 0, hrs = +labor.hrs || 0, lead = +labor.lead || 0;
  const laborOn = rate > 0 && hrs > 0;
  const capacity = laborOn && crew > 0 ? crew * hrs * rate : 0;   // cuttings/wk a base crew can stick
  weekLoad.forEach(w => { w.people = laborOn ? Math.ceil(w.plants / (rate * hrs)) : null; w.over = capacity > 0 && w.plants > capacity; });
  const loadMax = Math.max(1, ...weekLoad.map(w => (weightByDiff ? w.units : w.plants)));
  const firstOver = capacity > 0 ? weekLoad.find(w => w.over) : null;
  const miniIn = { width: 64, padding: "3px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 5, fontSize: 12 };

  const ItemRow = ({ r }) => (
    <tr style={{ borderBottom: `1px solid ${COLORS.border}`, background: sel.has(r.id) ? "#eef5e7" : "transparent" }}>
      <td style={td}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
      <td style={td}>
        <span title="Propagation form" style={{ background: /^SEED/i.test(r.method || "") ? "#5e9c4a" : (/^CALL/i.test(r.method || "") ? "#e89a3a" : "#3a7ab0"), color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 8, marginRight: 7 }}>{/^CALL/i.test(r.method || "") ? "CALLUSED" : (/^SEED/i.test(r.method || "") ? "SEED" : "URC")}</span>
        <span onClick={() => setDetail(r)} title="Open propagation card" style={{ fontWeight: 600, color: COLORS.dark, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}>{r.crop} <span style={{ color: COLORS.muted, fontWeight: 400 }}>{r.variety}</span></span>
        {r.pdf && <span onClick={() => window.open(r.pdf, "_blank")} title="Grower guide PDF — click to open" style={{ marginLeft: 6, cursor: "pointer" }}>📄</span>}
        {r.forLabel && <span onClick={() => setDetail(r)} title={"Finishes in (plant week):\n" + [...new Set((r.dests || []).map(d => `${d.item}${d.plantWk != null ? ` — plant wk${String(d.plantWk).padStart(2, "0")}` : ""}`))].join("\n")} style={{ marginLeft: 8, background: "#eef3e9", color: "#4a6b3a", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 8, cursor: "pointer" }}>▸ {r.forLabel}</span>}
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#2e5c1e" }} title={(r.dests || []).map(d => `${d.pot}${d.isCombo ? " combo" : " finished"} — ${d.plants.toLocaleString()} to order · ${d.pots.toLocaleString()} pots${d.plantWk != null ? ` · plant wk${String(d.plantWk).padStart(2, "0")}${d.plantYr ? " '" + String(d.plantYr).slice(2) : ""}` : ""}`).join("\n")}>{(r.plugs || 0).toLocaleString()}</td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{r.trays}</td>
      <td style={td}>{r.needsMist === true ? <span style={{ color: "#2e7d9e" }}>💦 {mistLabel(r.mistDays)}</span> : r.needsMist === false ? <span style={{ color: COLORS.muted }}>🌵 dry</span> : <span style={{ color: "#c8d0c0" }}>—</span>}</td>
      <td style={{ ...td, textAlign: "right" }}><span style={{ background: PRIO_COLOR[r.prio], color: "#fff", fontWeight: 800, fontSize: 11, padding: "1px 7px", borderRadius: 8 }}>{r.prio === 9 ? "?" : "P" + r.prio}</span></td>
      <td style={{ ...td, fontSize: 11, color: COLORS.muted }} title={r.tips || ""}>{r.hormone ? `🧴 ${r.hormone}  ` : ""}{r.fungicide ? `🛡 ${r.fungicide}  ` : ""}{r.pgr ? `📏 ${r.pgr}  ` : ""}{r.pinch ? `✂️ ${r.pinch}` : ""}{!r.hormone && !r.fungicide && !r.pgr && !r.pinch ? "—" : ""}</td>
    </tr>
  );
  const itemTable = items => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead><tr><th style={th}></th><th style={th}>Form · Variety · Finishes in</th><th style={{ ...th, textAlign: "right" }}>Plants</th><th style={{ ...th, textAlign: "right" }}>Trays</th><th style={th}>Mist</th><th style={{ ...th, textAlign: "right" }}>Prio</th><th style={th}>Treatments (prop)</th></tr></thead>
      <tbody>{[...items].sort((a, b) => (a.prio - b.prio) || `${a.crop} ${a.variety}`.localeCompare(`${b.crop} ${b.variety}`)).map(r => <ItemRow key={r.id} r={r} />)}</tbody>
    </table>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: COLORS.muted }}>
        Sticking schedule — <strong>week ▸ cell size</strong> dropdowns, items in priority order (P1 = stick first, Ball/Selecta URC list). Callused (CALL) sticks like URC, just a shorter rooting window. Mist need + treatment recs come from the culture DB.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search crop / variety…" style={{ padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, minWidth: 200 }} />
        {["all", "mist", "dry"].map(m => <button key={m} onClick={() => setMist(m)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${mist === m ? COLORS.light : COLORS.border}`, background: mist === m ? COLORS.light : "#fff", color: mist === m ? "#fff" : COLORS.text }}>{m === "all" ? "All" : m === "mist" ? "💦 Needs mist" : "🌵 Dry / no mist"}</button>)}
        {sel.size > 0 && <button onClick={() => setTaskItems(selRows.map(r => ({ item: `Stick ${r.crop} ${r.variety} — ${r.trays}× ${r.cell}-cell`, bench: r.weekKey })))} style={{ marginLeft: "auto", padding: "8px 16px", background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>＋ Stick task ({sel.size})</button>}
      </div>

      {/* TOP TOTALS by cell size */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {sizes.map(s => <BigSoilStat key={s} icon="🌱" value={sizeTotals[s].toLocaleString()} label={`${s}-cell trays (total)`} />)}
        <BigSoilStat icon="📋" value={shown.reduce((a, r) => a + r.trays, 0).toLocaleString()} label="total prop trays" />
        <BigSoilStat icon="🌿" value={shown.reduce((a, r) => a + (r.plugs || 0), 0).toLocaleString()} label="total plants" />
      </div>

      {/* WEEKLY STICKING LOAD — labor-planning chart (bones; fill labor inputs once known) */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 800, color: COLORS.dark }}>🌱 Sticking load by week {weightByDiff ? <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 400 }}>(difficulty-weighted)</span> : null}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: COLORS.muted }}>
            <label style={{ display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={weightByDiff} onChange={e => setWeightByDiff(e.target.checked)} /> weight by difficulty</label>
            <span>· labor (optional):</span>
            <input placeholder="sticks/hr" value={labor.rate} onChange={e => setLabor(l => ({ ...l, rate: e.target.value }))} style={miniIn} />
            <input placeholder="crew" value={labor.crew} onChange={e => setLabor(l => ({ ...l, crew: e.target.value }))} style={miniIn} />
            <input placeholder="hrs/wk" value={labor.hrs} onChange={e => setLabor(l => ({ ...l, hrs: e.target.value }))} style={miniIn} />
          </div>
        </div>
        {laborOn && firstOver ? <div style={{ fontSize: 12, color: COLORS.red, fontWeight: 700, marginBottom: 8 }}>⚠ Load passes your {crew}-person crew at {firstOver.wk.replace("·", " ")} — staff up by then{lead ? ` (start onboarding ~${lead} wk earlier)` : ""}.</div> : null}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 170, borderBottom: `2px solid ${COLORS.border}`, position: "relative" }}>
          {capacity > 0 && !weightByDiff ? <div title={`base-crew capacity ≈ ${Math.round(capacity).toLocaleString()} / wk`} style={{ position: "absolute", left: 0, right: 0, bottom: Math.min(capacity / loadMax, 1) * 150, borderTop: `2px dashed ${COLORS.red}`, zIndex: 1, pointerEvents: "none" }} /> : null}
          {weekLoad.map(w => {
            const val = weightByDiff ? w.units : w.plants;
            const h = Math.max(2, (val / loadMax) * 150);
            const col = capacity > 0 ? (w.over ? COLORS.red : COLORS.light) : COLORS.light;
            return (
              <div key={w.wk} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }} title={`${w.wk}\n${w.plants.toLocaleString()} cuttings · ${w.trays} trays · ${w.vars} varieties${w.people != null ? `\n≈ ${w.people} people` : ""}`}>
                {w.people != null ? <div style={{ fontSize: 9, fontWeight: 700, color: COLORS.muted }}>{w.people}</div> : null}
                <div style={{ width: "76%", height: h, background: col, borderRadius: "3px 3px 0 0" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
          {weekLoad.map(w => <div key={w.wk} style={{ flex: 1, minWidth: 18, fontSize: 9, color: COLORS.muted, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden" }}>{w.wk.replace(/^\d+·wk/, "w").replace("—", "?")}</div>)}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8 }}>Bars = cuttings/seeds stuck per week. Add <strong>sticks/hr</strong> + <strong>crew</strong> and each bar shows <strong>people needed</strong>, a capacity line appears, and the first over-capacity week is flagged as your staff-up point. "Weight by difficulty" scales each crop by its 1–3 rank.</div>
      </div>

      {/* WEEK ▸ SIZE dropdowns */}
      {weekKeys.map(wk => {
        const w = byWeek[wk]; const wSizes = Object.keys(w).map(Number).sort((a, b) => a - b);
        const wItems = wSizes.reduce((a, s) => a + w[s].length, 0);
        const wPlants = wSizes.reduce((a, s) => a + w[s].reduce((x, r) => x + (r.plugs || 0), 0), 0);
        const wTrays = wSizes.reduce((a, s) => a + sumTrays(w[s]), 0);
        return (
          <details key={wk} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.card }}>
            <summary style={{ cursor: "pointer", padding: "10px 14px", fontWeight: 800, color: COLORS.dark }}>
              📅 {wk} · {wItems} items · <strong style={{ color: "#2e5c1e" }}>{wPlants.toLocaleString()} plants</strong> · {wTrays} trays · <span style={{ fontWeight: 400, color: COLORS.muted, fontSize: 12 }}>{wSizes.map(s => `${s}-cell: ${sumTrays(w[s])}`).join("  ·  ")}</span>
            </summary>
            <div style={{ padding: "0 10px 10px" }}>
              {wSizes.map(s => (
                <details key={s} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                  <summary style={{ cursor: "pointer", padding: "8px 8px", fontWeight: 700, color: COLORS.text, fontSize: 13 }}>🔲 {s}-cell · {w[s].reduce((x, r) => x + (r.plugs || 0), 0).toLocaleString()} plants · {sumTrays(w[s])} trays · {w[s].length} items</summary>
                  {itemTable(w[s])}
                </details>
              ))}
            </div>
          </details>
        );
      })}
      {taskItems && <Modal onClose={() => { setTaskItems(null); setSel(new Set()); }}><TaskComposer items={taskItems} planId={plan.id} houseId={null} onClose={() => { setTaskItems(null); setSel(new Set()); }} /></Modal>}
      {detail && <Modal onClose={() => setDetail(null)}><PropCard row={detail} onClose={() => setDetail(null)} /></Modal>}
    </div>
  );
}

// Click-a-variety propagation card — transcribes the guide's propagation section + treatments/PGR.
function PropCard({ row, onClose }) {
  const pd = row.pd || {};
  const det = [["form", "Form"], ["tray_size", "Tray size"], ["tray_sizes", "Tray sizes"], ["plants_per_cell", "Plants per cell"], ["days_in_mist", "Days in mist"], ["days_with_mist", "Days with mist"], ["avg_soil_temp", "Soil temp"], ["avg_air_temp_day", "Air temp · day"], ["avg_air_temp_night", "Air temp · night"], ["temp", "Temp"], ["ph_range", "pH"], ["ec_range", "EC"], ["fertility_rate", "Fertility"], ["fertilization", "Fertilization"], ["plug_fertilizer", "Plug fertilizer"], ["propagation_weeks", "Prop weeks"], ["weeks_to_pinch", "Weeks to pinch"], ["wks_stick_to_transplant", "Stick→transplant wks"]].filter(([k]) => pd[k] != null && String(pd[k]).trim());
  const treat = [["🧴 Rooting hormone", realHormone(pd.rooting_hormone || pd.hormone)], ["🛡 Fungicide", pd.fungicide], ["📏 PGR", pd.plug_pgr], ["✂️ Pinch", pd.propagation_pinch || pd.pinch]].filter(t => t[1] && String(t[1]).trim());
  const sec = { fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" };
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, color: COLORS.dark, fontSize: 15 }}>🌱 {row.crop} {row.variety}</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>Propagation card · stick wk {row.weekKey} · {row.cell}-cell · {row.trays} trays{row.callused ? " · callused" : ""}</div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: COLORS.muted }}>✕</button>
      </div>
      {row.pdf
        ? <a href={row.pdf} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, padding: "8px 14px", background: COLORS.dark, color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>📄 View / download grower guide (PDF) ↗</a>
        : <div style={{ marginTop: 10, fontSize: 12, color: COLORS.muted }}>No grower-guide PDF linked for this variety.</div>}
      {row.dests && row.dests.length > 0 && (<><div style={sec}>Where it goes · {row.plugs} plants ({row.trays} trays of {row.cell}-cell)</div>
        <div style={{ display: "grid", gap: 4 }}>
          {row.dests.map((d, i) => (
            <div key={i} style={{ fontSize: 12, background: "#f7faf4", borderRadius: 7, padding: "6px 9px", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <span><strong>{d.pot}</strong>{d.isCombo ? " combo" : " finished"} <span style={{ color: COLORS.muted }}>{d.item}</span></span>
              <span style={{ color: COLORS.muted, whiteSpace: "nowrap" }}>{d.ppp}/pot × {d.pots} = <strong>{d.plants}</strong></span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>Ordering: {row.plugs} plants across {row.dests.length} destination{row.dests.length > 1 ? "s" : ""}. If a combo calls for {Math.max(...row.dests.map(d => d.ppp))}/pot, dropping to fewer cuts the order — judge viability per combo.</div></>)}
      {treat.length > 0 && (<><div style={sec}>Treatments</div>
        <div style={{ display: "grid", gap: 6 }}>{treat.map(([l, v], i) => <div key={i} style={{ fontSize: 13, background: "#f3f8ee", borderRadius: 8, padding: "7px 10px" }}><strong>{l}:</strong> {String(v)}</div>)}</div></>)}
      {det.length > 0 && (<><div style={sec}>Propagation</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>{det.map(([k, l]) => <div key={k} style={{ fontSize: 13 }}><span style={{ color: COLORS.muted }}>{l}:</span> <strong>{String(pd[k])}</strong></div>)}</div></>)}
      {pd.key_tips && (<><div style={sec}>Key tips</div><div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.text }}>{String(pd.key_tips)}</div></>)}
      {pd.comments && (<><div style={sec}>Propagation notes (full section)</div><div style={{ fontSize: 13, lineHeight: 1.5, color: COLORS.text, whiteSpace: "pre-wrap" }}>{String(pd.comments)}</div></>)}
      {!det.length && !treat.length && !pd.comments && !pd.key_tips && <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 12 }}>No propagation detail on the linked guide yet.</div>}
    </div>
  );
}

// Big icon + number stat for the soil summary (bags / pallets / trucks).
function BigSoilStat({ icon, value, label }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 120, background: "#f3f8ee", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 30, lineHeight: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.dark, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function MaterialsTab({ plan }) {
  const sb = getSupabase();
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const sc = await srcPageAll(sb, "scheduled_crops", "id,variety_id,container_id,qty_pots,ppp,qty_plants_ordered,liner_unit_cost,soil_mix_id,is_combo_component,combo_parent_id,prop_method,prop_tray_size,ship_week,ship_year,plant_week,plant_year", q => q.eq("plan_id", plan.id));
      const parentIds = new Set((sc || []).filter(r => r.is_combo_component && r.combo_parent_id).map(r => r.combo_parent_id));
      const vars = await srcPageAll(sb, "variety_library", "id,crop_name,variety,breeder"); // paginate — >1000 rows
      const { data: containers } = await sb.from("containers").select("id,sku,name,cost_per_unit,units_per_case,qty_per_pallet,fill_volume_cu_ft,default_ring_id,primary_supplier");
      const { data: soils } = await sb.from("soil_mixes").select("id,name,vendor,cost_per_bag,fluffed_volume,bag_size,bags_per_pallet,cost_per_cf,cf_per_truck,cost_per_truck,origin");
      const { data: inputs } = await sb.from("program_inputs").select("*").eq("year", plan.year);
      const yearRows = await srcPageAll(sb, "scheduled_crops", "qty_pots,is_combo_component,combo_parent_id,container_id,plant_year");

      const linerRows = []; const byPot = {}, byRing = {};
      let totalSoilCuFt = 0;
      const soilByWeek = {};
      const propByTray = {};
      let soilMix = null;

      for (const r of (sc || [])) {
        const isChild = r.is_combo_component && r.combo_parent_id;
        const v = vars.find(x => x.id === r.variety_id);
        const c = containers.find(x => x.id === r.container_id);
        const ring = c?.default_ring_id ? containers.find(x => x.id === c.default_ring_id) : null;

        const isParent = !r.is_combo_component && parentIds.has(r.id);
        const orderQty = (+r.qty_plants_ordered || 0) > 0 ? (+r.qty_plants_ordered || 0) : (isParent ? 0 : (+r.qty_pots || 0) * (+r.ppp || 1));
        if (v && v.crop_name !== "Combo" && orderQty > 0) {
          const isCutting = /^(URC|CALL)/i.test(r.prop_method || "");
          linerRows.push({
            section: isCutting ? "cuttings" : "liners",
            vid: v.id, name: `${v.crop_name || ""} ${v.variety || ""}`.trim(), breeder: v.breeder,
            qty: orderQty,
            cost: orderQty * (+r.liner_unit_cost || 0),
            weekKey: r.ship_week != null ? `${r.ship_year}·wk${String(r.ship_week).padStart(2, "0")}` : "Unscheduled",
          });
        }

        if (isChild) continue;
        const qtyPots = +r.qty_pots || 0;
        if (r.prop_tray_size && String(r.prop_tray_size).trim()) propByTray[r.prop_tray_size] = (propByTray[r.prop_tray_size] || 0) + qtyPots;
        if (c) {
          if (!byPot[c.sku]) byPot[c.sku] = { ...c, qty: 0, cost: 0 };
          byPot[c.sku].qty  += qtyPots;
          byPot[c.sku].cost += qtyPots * (+c.cost_per_unit || 0);
          const cf = qtyPots * (+c.fill_volume_cu_ft || 0);
          totalSoilCuFt += cf;
          const swk = r.plant_week != null ? `${r.plant_year}·wk${String(r.plant_week).padStart(2, "0")}` : "Unscheduled";
          soilByWeek[swk] = (soilByWeek[swk] || 0) + cf;
          if (ring) {
            if (!byRing[ring.sku]) byRing[ring.sku] = { ...ring, qty: 0, cost: 0 };
            byRing[ring.sku].qty  += qtyPots;
            byRing[ring.sku].cost += qtyPots * (+ring.cost_per_unit || 0);
          }
        }
        if (!soilMix && r.soil_mix_id) soilMix = soils.find(s => s.id === r.soil_mix_id);
      }

      const fluffed = +soilMix?.fluffed_volume || 8;
      const bagsNeeded = soilMix ? Math.ceil(totalSoilCuFt / fluffed) : 0;
      const soilCost   = bagsNeeded * (+soilMix?.cost_per_bag || 0);
      const palletsNeeded = soilMix?.bags_per_pallet ? Math.ceil(bagsNeeded / +soilMix.bags_per_pallet) : null;
      const trucksNeeded  = soilMix?.cf_per_truck ? Math.ceil(totalSoilCuFt / +soilMix.cf_per_truck) : null;
      // Running (cumulative) soil total by plant week — watch it climb as product is added.
      const soilWeeks = Object.keys(soilByWeek).sort().reduce((acc, wk) => {
        const cuft = soilByWeek[wk];
        const cum = (acc.length ? acc[acc.length - 1].cumCuft : 0) + cuft;
        const cumBags = Math.ceil(cum / fluffed);
        acc.push({
          week: wk, cuft, bags: Math.ceil(cuft / fluffed), cumCuft: cum, cumBags,
          cumPallets: soilMix?.bags_per_pallet ? Math.ceil(cumBags / +soilMix.bags_per_pallet) : null,
          cumTrucks: soilMix?.cf_per_truck ? Math.ceil(cum / +soilMix.cf_per_truck) : null,
        });
        return acc;
      }, []);
      const propTrays = Object.entries(propByTray).map(([size, plugs]) => {
        const usable = (+size === 105) ? 100 : (+size || 1);
        return { size, plugs, trays: Math.ceil(plugs / usable) };
      }).sort((a, b) => (+a.size) - (+b.size));

      // Year totals for input allocation
      let yearPots = 0, yearSoilCf = 0;
      let planPots = 0;
      for (const r of (yearRows || [])) {
        if (r.plant_year !== plan.year) continue;
        if (r.is_combo_component && r.combo_parent_id) continue;
        const c = containers.find(x => x.id === r.container_id);
        yearPots   += +r.qty_pots || 0;
        yearSoilCf += (+r.qty_pots || 0) * (+c?.fill_volume_cu_ft || 0);
      }
      Object.values(byPot).forEach(p => { planPots += p.qty; });

      // Round up to pallet/case
      Object.values(byPot).forEach(p => {
        p.pallets = p.qty_per_pallet ? Math.ceil(p.qty / p.qty_per_pallet) : null;
        p.cases   = p.units_per_case ? Math.ceil(p.qty / p.units_per_case) : null;
      });
      Object.values(byRing).forEach(r => {
        r.cases = r.units_per_case ? Math.ceil(r.qty / r.units_per_case) : null;
      });

      // Allocate inputs to this plan
      const allocatedInputs = (inputs || []).map(i => {
        const total = +i.total_cost || 0;
        let share = 0;
        if (i.allocation_method === "per_pot") {
          share = yearPots ? (planPots / yearPots) * total : 0;
        } else {
          share = yearSoilCf ? (totalSoilCuFt / yearSoilCf) * total : 0;
        }
        return { ...i, share };
      });

      setData({
        liners:   groupLinersByWeek(linerRows.filter(r => r.section === "liners")),
        cuttings: groupLinersByWeek(linerRows.filter(r => r.section === "cuttings")),
        linerCost:   linerRows.filter(r => r.section === "liners").reduce((s, r) => s + r.cost, 0),
        cuttingCost: linerRows.filter(r => r.section === "cuttings").reduce((s, r) => s + r.cost, 0),
        pots:   Object.values(byPot).sort((a,b) => b.cost - a.cost),
        rings:  Object.values(byRing).sort((a,b) => b.cost - a.cost),
        soil:   { mix: soilMix, cuft: totalSoilCuFt, bags: bagsNeeded, cost: soilCost, pallets: palletsNeeded, trucks: trucksNeeded, weeks: soilWeeks },
        propTrays,
        inputs: allocatedInputs,
        totalPots: planPots,
      });
    })();
  }, [sb, plan.id, plan.year, tick]);

  if (!data) return <div style={{ padding: 20, color: COLORS.muted }}>Loading materials…</div>;

  const linerTotal = (data.linerCost || 0) + (data.cuttingCost || 0);
  const potTotal   = data.pots.reduce((s, r) => s + r.cost, 0);
  const ringTotal  = data.rings.reduce((s, r) => s + r.cost, 0);
  const inputTotal = data.inputs.reduce((s, r) => s + r.share, 0);
  const grandTotal = linerTotal + potTotal + data.soil.cost + ringTotal + inputTotal;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={() => { setData(null); setTick(t => t + 1); }} style={{ padding: "6px 14px", background: "#fff", color: COLORS.dark, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>↻ Refresh totals</button>
      </div>
      {/* Grand total banner */}
      <div style={{ background: COLORS.dark, color: "#fff", borderRadius: 10, padding: 16, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <Stat label="Liners + URC" value={fmtMoney(linerTotal)} />
        <Stat label="Pots"    value={fmtMoney(potTotal)} />
        <Stat label="Soil"    value={fmtMoney(data.soil.cost)} />
        <Stat label="Rings"   value={fmtMoney(ringTotal)} />
        <Stat label="Inputs"  value={fmtMoney(inputTotal)} />
        <Stat label="TOTAL"   value={fmtMoney(grandTotal)} big />
      </div>

      {/* LINERS */}
      <MaterialSection title="🌱 Liners (rooted plugs)" subtitle="By week → variety · broker order">
        <LinerWeekGroups groups={data.liners} />
      </MaterialSection>

      {/* UNROOTED CUTTINGS */}
      <MaterialSection title="✂️ Unrooted Cuttings (URC)" subtitle="By week → variety · stuck in prop (105 trays)">
        <LinerWeekGroups groups={data.cuttings} />
      </MaterialSection>

      {/* POTS */}
      <MaterialSection title="🪴 Pots" subtitle="By SKU — pallet/case rollup for ordering">
        <SimpleTable
          cols={["SKU", "Name", "Supplier", "Qty", "$/each", "Pallets", "Cases", "Total"]}
          aligns={["L","L","L","R","R","R","R","R"]}
          rows={data.pots.map(r => [
            r.sku, r.name, r.primary_supplier || "—",
            r.qty.toLocaleString(),
            r.cost_per_unit != null ? "$" + (+r.cost_per_unit).toFixed(4) : "TBD",
            r.pallets != null ? r.pallets + " × " + r.qty_per_pallet : "—",
            r.cases != null ? r.cases + " × " + r.units_per_case : "—",
            r.cost > 0 ? fmtMoney(r.cost) : "TBD",
          ])}
          totalRow={["", `${data.pots.length} SKUs`, "", data.pots.reduce((s,r)=>s+r.qty,0).toLocaleString(), "", "", "", fmtMoney(potTotal)]}
        />
      </MaterialSection>

      {/* SOIL */}
      <MaterialSection title="💧 Soil" subtitle={data.soil.mix ? `${data.soil.mix.name} (${data.soil.mix.vendor})` : "No soil mix set"}>
        {data.soil.mix ? (
          <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <BigSoilStat icon="🛍" value={data.soil.bags.toLocaleString()} label="bags" />
            <BigSoilStat icon="📦" value={data.soil.mix.bags_per_pallet ? (data.soil.bags / +data.soil.mix.bags_per_pallet).toFixed(1) : "—"} label={data.soil.mix.bags_per_pallet ? `pallets · ${data.soil.mix.bags_per_pallet}/pallet` : "pallets"} />
            <BigSoilStat icon="🚛" value={data.soil.mix.cf_per_truck ? (data.soil.cuft / +data.soil.mix.cf_per_truck).toFixed(1) : "—"} label="trucks" />
            <BigSoilStat icon="💧" value={data.soil.cuft.toLocaleString(undefined, { maximumFractionDigits: 0 })} label="cu ft (fluffed)" />
            <BigSoilStat icon="💰" value={fmtMoney(data.soil.cost)} label={`total · $${(+data.soil.mix.cost_per_bag).toFixed(2)}/bag`} />
          </div>
          {data.soil.mix.cf_per_truck && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#f3f8ee", borderRadius: 8, fontSize: 12, color: COLORS.muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
              <span>🚛 Origin <strong>{data.soil.mix.origin || "—"}</strong> · ${(+data.soil.mix.cost_per_cf).toFixed(2)}/cf · {(+data.soil.mix.cf_per_truck).toLocaleString()} cf/truck @ {fmtMoney(+data.soil.mix.cost_per_truck)} · {data.soil.mix.bag_size} cf bale → {(+data.soil.mix.fluffed_volume || 8)} fluffed</span>
            </div>
          )}
          </>
        ) : (
          <div style={{ color: COLORS.muted, padding: 12 }}>No soil mix assigned to scheduled crops.</div>
        )}
      </MaterialSection>

      {/* PROP TRAYS */}
      {data.propTrays && data.propTrays.length > 0 && (
        <MaterialSection title="🌱 Prop Trays" subtitle="Trays to stick — by cell size (105 counted as 100 usable)">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {data.propTrays.map(p => <BigSoilStat key={p.size} icon="🌱" value={p.trays.toLocaleString()} label={`${p.size}-cell trays · ${p.plugs.toLocaleString()} plugs`} />)}
            <BigSoilStat icon="📋" value={data.propTrays.reduce((s, p) => s + p.trays, 0).toLocaleString()} label="total prop trays" />
          </div>
        </MaterialSection>
      )}

      {/* RINGS */}
      <MaterialSection title="⭕ Rings" subtitle="For pinched containers — one ring per pot">
        {data.rings.length > 0 ? (
          <SimpleTable
            cols={["SKU", "Name", "Qty", "$/each", "Cases", "Total"]}
            aligns={["L","L","R","R","R","R"]}
            rows={data.rings.map(r => [
              r.sku, r.name, r.qty.toLocaleString(),
              "$" + (+r.cost_per_unit).toFixed(4),
              r.cases != null ? r.cases + " × " + r.units_per_case : "—",
              fmtMoney(r.cost),
            ])}
            totalRow={["", `${data.rings.length} ring SKU(s)`, data.rings.reduce((s,r)=>s+r.qty,0).toLocaleString(), "", "", fmtMoney(ringTotal)]}
          />
        ) : (
          <div style={{ color: COLORS.muted, padding: 12 }}>No rings — no pinched containers in this plan with a default_ring_id set.</div>
        )}
      </MaterialSection>

      {/* INPUTS */}
      <MaterialSection title="⚙ Inputs (overhead)" subtitle="Allocated share of year overhead from program_inputs">
        {data.inputs.length > 0 ? (
          <SimpleTable
            cols={["Input", "Category", "Year total", "Allocation", "This plan"]}
            aligns={["L","L","R","L","R"]}
            rows={data.inputs.map(i => [
              i.name, i.category || "—",
              fmtMoney(+i.total_cost),
              i.allocation_method,
              fmtMoney(i.share),
            ])}
            totalRow={["", `${data.inputs.length} input(s)`, fmtMoney(data.inputs.reduce((s,i)=>s+(+i.total_cost||0), 0)), "", fmtMoney(inputTotal)]}
          />
        ) : (
          <div style={{ color: COLORS.muted, padding: 12 }}>No program_inputs for {plan.year} yet. Add fertilizer / Molybdenum / Piccolo / sleeves / shipping as you capture them.</div>
        )}
      </MaterialSection>

      <div style={{ padding: 12, background: "#fef9ec", borderRadius: 6, fontSize: 12, color: COLORS.text, border: `1px solid ${COLORS.amber}` }}>
        💡 <strong>How to use this page:</strong> Hand this list (or export) to your broker / suppliers in February for EOD ordering. Pallet/case rollups show the natural ordering increments — actual order quantities should round up to those. Inputs allocations are estimates based on current plans for {plan.year}; they update as more plans get added.
      </div>
    </div>
  );
}

function MaterialSection({ title, subtitle, children }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: COLORS.dark, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 10 }}>{subtitle}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, big, dark }) {
  return (
    <div style={{ background: dark ? "transparent" : "#f3f5ef", borderRadius: 6, padding: dark ? 0 : 10 }}>
      <div style={{ fontSize: 10, color: dark ? "rgba(255,255,255,0.7)" : COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 16, fontWeight: 800, color: dark ? "#fff" : COLORS.dark, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SimpleTable({ cols, aligns, rows, totalRow }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f3f5ef" }}>
            {cols.map((c, i) => <th key={i} style={{...th, textAlign: aligns[i] === "R" ? "right" : "left"}}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              {r.map((cell, j) => <td key={j} style={{...td, textAlign: aligns[j] === "R" ? "right" : "left"}}>{cell}</td>)}
            </tr>
          ))}
          {totalRow && (
            <tr style={{ background: "#f3f5ef", fontWeight: 800 }}>
              {totalRow.map((cell, j) => <td key={j} style={{...td, textAlign: aligns[j] === "R" ? "right" : "left", fontWeight: 800, color: COLORS.dark}}>{cell}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Auto-create receive + quarantine tasks for a finished-buy item.
// Idempotent: skips creating tasks that already exist for that variety + date.
async function ensureFinishedReceivingTasks(sb, plan, catalogRow) {
  if (!catalogRow.arrival_date_target) return;
  const variety = `${catalogRow.pot_size} ${catalogRow.description}`;
  const arrival = catalogRow.arrival_date_target;
  const addDays = (n) => {
    const d = new Date(arrival);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const wkOf = (d) => { const t = new Date(d); t.setHours(0,0,0,0); const dn = (t.getDay()+6)%7; t.setDate(t.getDate()-dn+3); const f = new Date(t.getFullYear(),0,4); return 1 + Math.round(((t-f)/86400000 - 3 + (f.getDay()+6)%7)/7); };

  // Thu (arrival) → Fri (treat) → Mon (move to retail)  → 4 days total
  const tasks = [
    {
      target_date: arrival,
      title: `Receive + unload ${variety}`,
      description: `Finished material arriving (Thursday) for ${plan.name}. Qty target: ${catalogRow.target_qty || "TBD"}. Unload and stage in quarantine zone — keep separate from in-house grown crops.`,
    },
    {
      target_date: addDays(1),
      title: `Quarantine + treat ${variety}`,
      description: `Day 2 (Friday) of receiving. Inspect for whitefly / thrips / scale / mites / fungus gnats. Apply preventative treatment. Hold over weekend.`,
    },
    {
      target_date: addDays(4),
      title: `Move ${variety} to retail`,
      description: `Day 5 (Monday) — quarantine clear. Move to retail benches and begin selling. Final visual pest check before placement.`,
    },
  ];

  for (const t of tasks) {
    const { data: existing } = await sb.from("manager_tasks")
      .select("id").eq("plan_id", plan.id).eq("target_date", t.target_date).eq("title", t.title).limit(1);
    if (existing && existing.length > 0) continue;
    await sb.from("manager_tasks").insert({
      plan_id: plan.id,
      category: "production",
      title: t.title,
      description: t.description,
      target_date: t.target_date,
      priority: 3,
      status: "pending",
      week_number: wkOf(t.target_date),
      year: new Date(t.target_date).getFullYear(),
      created_by: "auto:finished-receiving",
    });
  }
}

// ── Houseplants — Catalog tab ───────────────────────────────────────────────
// Browse historical Q1 sales (or whatever quarter the plan covers), set targets,
// pick source (buy/grow/partner), lock the catalog.
function CatalogTab({ plan }) {
  const sb = getSupabase();
  const cc = getCultureClient();
  const [rows, setRows] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [cultureByGenus, setCultureByGenus] = useState({});
  const [sortCol, setSortCol] = useState("y_curr_rev");
  const [sortDir, setSortDir] = useState("desc");
  const [filterSize, setFilterSize] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("all");
  const [mergeModal, setMergeModal] = useState(null);  // { sourceRow: ... }
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  // Projection + avgBase live on the plan record so they're shared across
  // devices/users. Only the owner (Caleb) can edit. Once locked, requires
  // explicit unlock by the owner before any further changes.
  const { user, isOwner } = useAuth();
  const [projection, setProjectionState] = useState(plan.projection_pct ?? 5);
  const [avgBase, setAvgBaseState]       = useState(plan.avg_base_years ?? 2);
  const [projectionLockedAt, setProjLockedAt] = useState(plan.projection_locked_at || null);
  const [projectionLockedBy, setProjLockedBy] = useState(plan.projection_locked_by || null);
  const isProjectionLocked = !!projectionLockedAt;
  const canEditProjection = isOwner && !isProjectionLocked;

  async function persistProjection(updates) {
    await sb.from("production_plans").update(updates).eq("id", plan.id);
  }
  const setProjection = (v) => {
    if (!canEditProjection) return;
    setProjectionState(v);
    persistProjection({ projection_pct: v });
  };
  const setAvgBase = (v) => {
    if (!canEditProjection) return;
    setAvgBaseState(v);
    persistProjection({ avg_base_years: v });
  };
  async function lockProjection() {
    if (!isOwner || isProjectionLocked) return;
    if (!confirm(`Lock projection at +${projection}% (${avgBase}-yr avg base)? Only you (Caleb) can unlock it after this.`)) return;
    const ts = new Date().toISOString();
    setProjLockedAt(ts);
    setProjLockedBy(user.email);
    await persistProjection({ projection_locked_at: ts, projection_locked_by: user.email });
  }
  async function unlockProjection() {
    if (!isOwner) return;
    if (!confirm("Unlock projection? Allows further changes until you lock it again.")) return;
    setProjLockedAt(null);
    setProjLockedBy(null);
    await persistProjection({ projection_locked_at: null, projection_locked_by: null });
  }
  const [detailItem, setDetailItem] = useState(null); // { catalogRow, fallback, history } for the item detail modal
  const [showHelp, setShowHelp] = useState(false);     // collapsible "how this works" panel
  const [yearDisplay, setYearDisplay] = useState("qty"); // "qty" | "revenue"
  const [hoverRow, setHoverRow] = useState(null);
  const [showRollup, setShowRollup] = useState(false);

  // For "Houseplants H1 2027": current_year = 2026, prior_year = 2025
  // Plus older years for historical context: 2024 (3yr), 2023 (4yr)
  const planYear = plan.year;
  const currYr = planYear - 1;
  const priorYr = planYear - 2;
  const priorYr2 = planYear - 3; // 3-yr base
  const priorYr3 = planYear - 4; // 4-yr base
  const allYears = [priorYr3, priorYr2, priorYr, currYr]; // chronological
  const [startMonth, endMonth] = planMonthRange(plan);
  const rangeLabel = planRangeLabel(plan);

  function quarterRange(year) {
    // Period values in houseplant_sales_history are stored as YYYY-MM-01, so
    // using -01 of the month AFTER end gives us an exclusive upper bound.
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear  = endMonth === 12 ? year + 1 : year;
    return {
      start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      end:   `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
    };
  }

  // Aggressive normalization to catch the "system changeover" duplicates
  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      // Pull all history (paginated)
      const all = await srcPageAll(sb, "houseplant_sales_history", "period,product_code,description,pot_size,qty_sold,sold_value");

      // Pull saved catalog targets for this plan
      const { data: cat } = await sb.from("houseplant_catalog").select("*").eq("plan_id", plan.id);
      setCatalog(cat || []);

      // Pull manual merge aliases — these override normalization for known dupes
      const { data: aliasData } = await sb.from("houseplant_merge_aliases").select("*");
      setAliases(aliasData || []);
      const aliasMap = {};
      for (const a of (aliasData || [])) {
        const aliasKey = `${a.alias_pot_size}|${normalizeDesc(a.alias_desc)}`;
        const canKey   = `${a.canonical_pot_size}|${normalizeDesc(a.canonical_desc)}`;
        aliasMap[aliasKey] = { key: canKey, desc: a.canonical_desc, pot_size: a.canonical_pot_size };
      }

      // Aggregate by (normalized desc, pot_size) — apply aliases first.
      // Capture qty + rev per year for ALL available years (2023, 2024, 2025, 2026).
      const ranges = {};
      for (const yr of allYears) ranges[yr] = quarterRange(yr);
      const byKey = {};
      for (const r of all) {
        let rawKey = `${r.pot_size || "?"}|${normalizeDesc(r.description)}`;
        let useDesc = r.description, usePot = r.pot_size;
        if (aliasMap[rawKey]) {
          rawKey = aliasMap[rawKey].key;
          useDesc = aliasMap[rawKey] ? aliasMap[rawKey].desc : aliasMap[rawKey]?.desc || useDesc;
          usePot  = aliasMap[`${r.pot_size || "?"}|${normalizeDesc(r.description)}`]?.pot_size || usePot;
          const a = (aliasData || []).find(x => normalizeDesc(x.alias_desc) === normalizeDesc(r.description) && x.alias_pot_size === r.pot_size);
          if (a) { useDesc = a.canonical_desc; usePot = a.canonical_pot_size; }
        }
        if (!byKey[rawKey]) {
          const yq = {}, yr_ = {};
          for (const yr of allYears) { yq[yr] = 0; yr_[yr] = 0; }
          byKey[rawKey] = { desc: useDesc, pot_size: usePot, yearQty: yq, yearRev: yr_ };
        }
        const qty = +r.qty_sold || 0, rev = +r.sold_value || 0;
        for (const yr of allYears) {
          const rng = ranges[yr];
          if (r.period >= rng.start && r.period < rng.end) {
            byKey[rawKey].yearQty[yr] += qty;
            byKey[rawKey].yearRev[yr] += rev;
            break;
          }
        }
      }
      const arr = Object.values(byKey).map(r => {
        // Back-compat: keep y_curr_/y_prior_ for existing UI
        const y_curr_qty   = r.yearQty[currYr]  || 0;
        const y_curr_rev   = r.yearRev[currYr]  || 0;
        const y_prior_qty  = r.yearQty[priorYr] || 0;
        const y_prior_rev  = r.yearRev[priorYr] || 0;
        const priorPrice = y_prior_qty > 0 ? y_prior_rev / y_prior_qty : null;
        const currPrice  = y_curr_qty  > 0 ? y_curr_rev  / y_curr_qty  : null;
        return {
          ...r,
          y_curr_qty, y_curr_rev, y_prior_qty, y_prior_rev,
          normalized: normalizeDesc(r.desc),
          genus: (normalizeDesc(r.desc).split(/\s+/)[0] || "").toUpperCase(),
          prior_price: priorPrice,
          curr_price:  currPrice,
          yoy_qty: y_prior_qty > 0 && y_curr_qty > 0 ? ((y_curr_qty - y_prior_qty) / y_prior_qty * 100) : null,
          yoy_price: priorPrice && currPrice ? ((currPrice - priorPrice) / priorPrice * 100) : null,
          two_yr_avg: Math.round((y_curr_qty + y_prior_qty) / 2),
        };
      }).filter(r => Object.values(r.yearQty).reduce((a, b) => a + b, 0) > 0);

      // Inject "new trial" catalog rows (items that have no sales history but were
      // added manually via Add Variety). Identified by notes starting with [NEW TRIAL]
      // OR by the absence of any matching row in arr.
      const seenKeys = new Set(arr.map(r => `${r.pot_size}|${normalizeDesc(r.desc)}`));
      for (const c of (cat || [])) {
        const key = `${c.pot_size}|${normalizeDesc(c.description)}`;
        if (seenKeys.has(key)) continue;
        arr.push({
          desc: c.description,
          pot_size: c.pot_size,
          normalized: normalizeDesc(c.description),
          genus: (normalizeDesc(c.description).split(/\s+/)[0] || "").toUpperCase(),
          y_curr_qty: 0, y_curr_rev: 0, y_prior_qty: 0, y_prior_rev: 0,
          prior_price: null, curr_price: null, yoy_qty: null, yoy_price: null, two_yr_avg: 0,
          isNew: true,
        });
      }
      setRows(arr);

      // Look up culture data by genus (lightweight, lazy)
      if (cc) {
        const HP_GENERA = ["MONSTERA","PHILODENDRON","POTHOS","EPIPREMNUM","CALATHEA","PILEA","FICUS","TRADESCANTIA","HOYA","BEGONIA","PEPEROMIA","CHLOROPHYTUM","SANSEVIERIA","DRACAENA","AGLAONEMA","SCINDAPSUS","SYNGONIUM","FITTONIA","ALOCASIA","ANTHURIUM","RHAPHIDOPHORA","CEROPEGIA","SENECIO"];
        const { data: cult } = await cc.from("culture_guides_public").select("breeder_name,crop_name");
        const map = {};
        for (const c of (cult || [])) {
          const cn = (c.crop_name || "").toUpperCase();
          for (const g of HP_GENERA) {
            if (cn.includes(g)) {
              if (!map[g]) map[g] = {};
              map[g][c.breeder_name] = (map[g][c.breeder_name] || 0) + 1;
            }
          }
        }
        setCultureByGenus(map);
      }
      setLoading(false);
    })();
  }, [sb, cc, plan.id, plan.year, plan.season, reloadTick]);

  async function saveMerge(sourceRow, targetRow) {
    if (!sourceRow || !targetRow) return;
    await sb.from("houseplant_merge_aliases").upsert({
      canonical_desc: targetRow.desc,
      canonical_pot_size: targetRow.pot_size,
      alias_desc: sourceRow.desc,
      alias_pot_size: sourceRow.pot_size,
      notes: "Manual merge from Catalog UI",
    }, { onConflict: "alias_desc,alias_pot_size" });
    // Delete the source's own catalog row(s) so the merged item disappears
    // entirely instead of lingering as a phantom 0-inventory row.
    const victims = catalog.filter(c =>
      normalizeDesc(c.description) === normalizeDesc(sourceRow.desc) && c.pot_size === sourceRow.pot_size);
    if (victims.length) await sb.from("houseplant_catalog").delete().in("id", victims.map(c => c.id));
    setMergeModal(null);
    setReloadTick(t => t + 1);
  }

  // Purge catalog rows that have no sales history, no target qty, and aren't
  // locked — i.e. items with no inventory and no plan. Confirms with a count
  // first; never touches locked or targeted rows.
  async function removeEmptyItems() {
    const salesKeys = new Set(rows.filter(r => !r.isNew).map(r => `${r.pot_size}|${r.normalized}`));
    const empties = catalog.filter(c =>
      c.status !== "locked" &&
      c.target_qty == null &&
      !salesKeys.has(`${c.pot_size}|${normalizeDesc(c.description)}`));
    if (!empties.length) { alert("No empty items to remove — every catalog item has sales, a target, or is locked."); return; }
    if (!confirm(`Remove ${empties.length} item(s) with no inventory, no target qty, and not locked? This permanently deletes them from the catalog.`)) return;
    const ids = empties.map(c => c.id);
    await sb.from("houseplant_catalog").delete().in("id", ids);
    setCatalog(catalog.filter(c => !ids.includes(c.id)));
    setReloadTick(t => t + 1);
  }
  async function unmergeAll() {
    if (!confirm("Remove all manual merges? Sales rows go back to their original (potentially duplicated) keys.")) return;
    await sb.from("houseplant_merge_aliases").delete().gte("created_at", "1900-01-01");
    setReloadTick(t => t + 1);
  }

  // Get the most-recent N years for the avg base
  function baseYears() {
    return allYears.slice(-avgBase); // last N years (chronological → most recent N)
  }

  // Compute the projection-base avg qty for a row
  function avgQtyFor(r) {
    const yrs = baseYears();
    let total = 0, hadAny = 0;
    for (const y of yrs) {
      const q = (r.yearQty?.[y] || 0);
      total += q;
      if (q > 0) hadAny++;
    }
    return hadAny > 0 ? total / yrs.length : 0;
  }
  function avgRevFor(r) {
    const yrs = baseYears();
    let total = 0;
    for (const y of yrs) total += (r.yearRev?.[y] || 0);
    return total / yrs.length;
  }

  // Apply current projection to every historical row that doesn't have a saved target_qty.
  // Rule: target_qty = round(N-yr avg × (1 + projection/100))
  //       target_price = curr_price (fallback prior_price)
  async function applyProjection() {
    const ops = [];
    for (const r of rows) {
      // Skip Misc — these revenue still counts in totals but we don't auto-project per-item
      if (r.pot_size === "Misc") continue;
      const existing = catalog.find(c => normalizeDesc(c.description) === r.normalized && c.pot_size === r.pot_size);
      if (existing && (existing.target_qty != null || existing.status === "locked")) continue;
      const avgQty = avgQtyFor(r);
      if (avgQty <= 0) continue;
      const targetQty = Math.round(avgQty * (1 + projection / 100));
      const targetPrice = r.curr_price || r.prior_price || null;
      ops.push({ row: r, updates: { target_qty: targetQty, target_price: targetPrice } });
    }
    if (ops.length === 0) {
      alert("No items to apply — all historical items already have a target or are locked.");
      return;
    }
    if (!confirm(`Apply +${projection}% projection (${avgBase}-yr avg base) to ${ops.length} historical items?`)) return;
    for (const op of ops) await updateCatalogRow(op.row, op.updates);
  }

  async function clearProjections() {
    const ops = catalog.filter(c => c.status !== "locked" && c.target_qty != null);
    if (ops.length === 0) return;
    if (!confirm(`Clear target qty/price from ${ops.length} unlocked items?`)) return;
    for (const c of ops) {
      await sb.from("houseplant_catalog").update({ target_qty: null, target_price: null, updated_at: new Date().toISOString() }).eq("id", c.id);
    }
    setCatalog(catalog.map(c => c.status === "locked" ? c : { ...c, target_qty: null, target_price: null }));
  }

  async function updateCatalogRow(row, updates) {
    const existing = catalog.find(c => normalizeDesc(c.description) === row.normalized && c.pot_size === row.pot_size);

    // Smart default: when switching to 'finished' for the first time, suggest
    // the THURSDAY before the first Monday of the quarter (Thu→Mon receiving cycle).
    if (updates.acquisition_type === "finished" && !existing?.arrival_date_target && !updates.arrival_date_target) {
      const qStart = new Date(`${planYear}-${String(startMonth).padStart(2, "0")}-01`);
      // Find the Monday on/after the quarter start
      const dow = qStart.getDay(); // 0=Sun..6=Sat
      const daysToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
      qStart.setDate(qStart.getDate() + daysToMon);
      // Back up 4 days → previous Thursday
      qStart.setDate(qStart.getDate() - 4);
      updates.arrival_date_target = qStart.toISOString().slice(0, 10);
    }

    let saved;
    if (existing) {
      const { data: upd } = await sb.from("houseplant_catalog")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id).select("*").single();
      saved = upd || { ...existing, ...updates };
      setCatalog(catalog.map(c => c.id === existing.id ? saved : c));
    } else {
      const { data: ins } = await sb.from("houseplant_catalog").insert({
        plan_id: plan.id, description: row.desc, pot_size: row.pot_size,
        prior_yr_qty: row.y_prior_qty, prior_yr_revenue: row.y_prior_rev,
        two_yr_avg_qty: row.two_yr_avg, ...updates,
      }).select("*").single();
      if (ins) { saved = ins; setCatalog([...catalog, ins]); }
    }

    // Auto-generate quarantine + receive tasks when finished + arrival is set
    if (saved?.acquisition_type === "finished" && saved.arrival_date_target) {
      await ensureFinishedReceivingTasks(sb, plan, saved);
    }
  }

  if (loading) return <div style={{ padding: 20, color: COLORS.muted }}>Loading catalog…</div>;

  const sizes = Array.from(new Set(rows.map(r => r.pot_size).filter(Boolean))).sort((a, b) => sizeRank(a) - sizeRank(b));

  // Score each row for the "Recommendations" view mode
  function scoreItem(r) {
    const total = (r.y_prior_qty || 0) + (r.y_curr_qty || 0);
    const stability = (r.y_prior_qty > 50 && r.y_curr_qty > 50) ? 1.5 :
                      (r.y_prior_qty > 0 && r.y_curr_qty > 0) ? 1.2 :
                      0.85;  // single-year items get penalized
    const growth = r.yoy_qty != null ? Math.max(0.5, Math.min(2.0, 1 + r.yoy_qty / 200)) : 1.0;
    return total * stability * growth;
  }

  // "Skipped" filter: sold in older years (2023 + 2024) but ZERO in most recent 2 (2025 + 2026).
  // These are items we used to grow but have dropped — worth investigating.
  function isSkipped(r) {
    const older = (r.yearQty?.[priorYr3] || 0) + (r.yearQty?.[priorYr2] || 0);
    const recent = (r.yearQty?.[priorYr] || 0) + (r.yearQty?.[currYr] || 0);
    return older > 25 && recent === 0;
  }

  // Apply view mode filtering / sorting
  let viewRows = [...rows];
  if (viewMode === "top26")        viewRows.sort((a, b) => b.y_curr_qty - a.y_curr_qty);
  else if (viewMode === "top25")   viewRows.sort((a, b) => b.y_prior_qty - a.y_prior_qty);
  else if (viewMode === "new")     viewRows = viewRows.filter(r => !r.y_prior_qty && r.y_curr_qty > 0).sort((a,b) => b.y_curr_qty - a.y_curr_qty);
  else if (viewMode === "missing") viewRows = viewRows.filter(r => r.y_prior_qty > 0 && !r.y_curr_qty).sort((a,b) => b.y_prior_qty - a.y_prior_qty);
  else if (viewMode === "skipped") viewRows = viewRows.filter(isSkipped).sort((a,b) => ((b.yearQty?.[priorYr3]||0)+(b.yearQty?.[priorYr2]||0)) - ((a.yearQty?.[priorYr3]||0)+(a.yearQty?.[priorYr2]||0)));
  else if (viewMode === "growers") viewRows = viewRows.filter(r => r.yoy_qty != null && r.yoy_qty > 25 && r.y_prior_qty > 50).sort((a,b) => b.yoy_qty - a.yoy_qty);
  else if (viewMode === "decliners") viewRows = viewRows.filter(r => r.yoy_qty != null && r.yoy_qty < -25 && r.y_prior_qty > 100).sort((a,b) => a.yoy_qty - b.yoy_qty);
  else if (viewMode === "recommended") viewRows.sort((a, b) => scoreItem(b) - scoreItem(a));

  const filtered = viewRows.filter(r => {
    if (filterSize !== "all" && r.pot_size !== filterSize) return false;
    if (search && !r.desc.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Custom sort overrides view-mode default when user clicks a column header
  const sorted = sortCol === "_viewmode" ? filtered : [...filtered].sort((a, b) => {
    // Pot column sorts by physical size order (2" < 10"), not string order
    if (sortCol === "pot_size") {
      const d = sizeRank(a.pot_size) - sizeRank(b.pot_size);
      return sortDir === "asc" ? d : -d;
    }
    const av = a[sortCol] || 0, bv = b[sortCol] || 0;
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av - bv) : (bv - av);
  });

  function clickSort(c) {
    if (c === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(c); setSortDir("desc"); }
  }
  function pickView(v) {
    setViewMode(v);
    setSortCol("_viewmode");  // let view mode drive the order
  }

  const SortHdr = ({ col, label, align, sticky }) => (
    <th style={{...th, textAlign: align || "left", cursor: "pointer",
        ...(sticky ? { position: "sticky", top: sticky === 2 ? 34 : 0, zIndex: 11, background: "#eef3e8" } : {})
    }} onClick={() => clickSort(col)}>
      {label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  // Sticky style helpers for the two-row catalog header. The table lives in its
  // own scroll viewport (maxHeight + overflow:auto), so the header sticks relative
  // to that container at top:0 — independent of the app nav / plan-tab bars stacked
  // above. Row 1 is ~34px tall (the "show $" toggle drives the height), so row 2
  // pins just below it. boxShadow on row 2 separates the frozen header from rows.
  const stickyRow1 = { position: "sticky", top: 0, zIndex: 11, background: "#eef3e8" };
  const stickyRow2 = { position: "sticky", top: 34, zIndex: 11, background: "#eef3e8", boxShadow: "0 2px 4px rgba(30,45,26,0.12)" };

  // Price-band row shading: 5 green tiers keyed to the houseplant $/ea distribution
  // (p25≈$4, median≈$7, p75≈$12, p90≈$21). Darker green = pricier item, so rows
  // group visually by value and are harder to mix up when scanning.
  function priceShade(price) {
    if (price == null || !(price > 0)) return undefined;
    if (price < 4)  return "#f6faf2";
    if (price < 7)  return "#eaf3df";
    if (price < 12) return "#dcebcb";
    if (price < 21) return "#cbe0b4";
    return "#b7d49a";
  }

  // Catalog summary stats — per pot size, capture qty + rev for EVERY available year
  const sizeStats = {};
  for (const r of rows) {
    const k = r.pot_size || "(unknown)";
    if (!sizeStats[k]) {
      const yQ = {}, yR = {};
      for (const y of allYears) { yQ[y] = 0; yR[y] = 0; }
      sizeStats[k] = { size: k, items: 0, yearQty: yQ, yearRev: yR, prices: [] };
    }
    sizeStats[k].items += 1;
    for (const y of allYears) {
      sizeStats[k].yearQty[y] += (r.yearQty?.[y] || 0);
      sizeStats[k].yearRev[y] += (r.yearRev?.[y] || 0);
    }
    if (r.curr_price) sizeStats[k].prices.push(r.curr_price);
  }
  // Roll up saved catalog target qty/rev per size
  const targetBySize = {};
  for (const c of catalog) {
    const k = c.pot_size || "(unknown)";
    if (!targetBySize[k]) targetBySize[k] = { qty: 0, rev: 0 };
    targetBySize[k].qty += (+c.target_qty || 0);
    targetBySize[k].rev += (+c.target_qty || 0) * (+c.target_price || 0);
  }
  const baseYrs = allYears.slice(-avgBase);
  const sizeStatsArr = Object.values(sizeStats).map(s => {
    // back-compat fields for any remaining references
    const qty_25 = s.yearQty[priorYr] || 0;
    const qty_26 = s.yearQty[currYr]  || 0;
    const rev_25 = s.yearRev[priorYr] || 0;
    const rev_26 = s.yearRev[currYr]  || 0;
    // avg uses chosen base
    const avg_qty = baseYrs.reduce((sum, y) => sum + (s.yearQty[y] || 0), 0) / baseYrs.length;
    const avg_rev = baseYrs.reduce((sum, y) => sum + (s.yearRev[y] || 0), 0) / baseYrs.length;
    const target_qty = targetBySize[s.size]?.qty || 0;
    const target_rev = targetBySize[s.size]?.rev || 0;
    const projected_qty = Math.round(avg_qty * (1 + projection / 100));
    const projected_rev = avg_rev * (1 + projection / 100);
    const delta_pct = avg_qty > 0 && target_qty > 0 ? ((target_qty - avg_qty) / avg_qty * 100) : null;
    return {
      ...s,
      qty_25, qty_26, rev_25, rev_26,
      avg_price: s.prices.length ? s.prices.reduce((a,b) => a+b, 0) / s.prices.length : 0,
      min_price: s.prices.length ? Math.min(...s.prices) : 0,
      max_price: s.prices.length ? Math.max(...s.prices) : 0,
      avg_qty, avg_rev, target_qty, target_rev, projected_qty, projected_rev, delta_pct,
    };
  }).sort((a, b) => sizeRank(a.size) - sizeRank(b.size));

  const grandAvgQty   = sizeStatsArr.reduce((s, x) => s + x.avg_qty,       0);
  const grandTgtQty   = sizeStatsArr.reduce((s, x) => s + x.target_qty,    0);
  const grandProjQty  = sizeStatsArr.reduce((s, x) => s + x.projected_qty, 0);
  const grandRev25    = sizeStatsArr.reduce((s, x) => s + (x.rev_25 || 0), 0);
  const grandRev26    = sizeStatsArr.reduce((s, x) => s + (x.rev_26 || 0), 0);
  // avg revenue rolled up across the chosen avg base
  const grandAvgRev   = sizeStatsArr.reduce((s, x) => s + (x.avg_rev || 0), 0);
  // per-year totals across all years
  const grandRevByYear = {};
  for (const y of allYears) grandRevByYear[y] = sizeStatsArr.reduce((s, x) => s + (x.yearRev?.[y] || 0), 0);
  const grandQtyByYear = {};
  for (const y of allYears) grandQtyByYear[y] = sizeStatsArr.reduce((s, x) => s + (x.yearQty?.[y] || 0), 0);
  const grandTgtRev   = sizeStatsArr.reduce((s, x) => s + x.target_rev,    0);
  const grandProjRev  = sizeStatsArr.reduce((s, x) => s + x.projected_rev, 0);
  const grandPctOfProj = grandProjQty > 0 ? (grandTgtQty / grandProjQty * 100) : 0;

  // Counts for view-mode chips
  const counts = {
    all:         rows.length,
    top26:       rows.filter(r => r.y_curr_qty > 0).length,
    top25:       rows.filter(r => r.y_prior_qty > 0).length,
    new:         rows.filter(r => !r.y_prior_qty && r.y_curr_qty > 0).length,
    missing:     rows.filter(r => r.y_prior_qty > 0 && !r.y_curr_qty).length,
    skipped:     rows.filter(isSkipped).length,
    growers:     rows.filter(r => r.yoy_qty != null && r.yoy_qty > 25 && r.y_prior_qty > 50).length,
    decliners:   rows.filter(r => r.yoy_qty != null && r.yoy_qty < -25 && r.y_prior_qty > 100).length,
    recommended: rows.length,
  };

  // Rollups
  const lockedCount = catalog.filter(c => c.status === "locked").length;
  const totalTargetQty = catalog.reduce((s, c) => s + (+c.target_qty || 0), 0);
  const totalTargetRev = catalog.reduce((s, c) => s + (+c.target_revenue || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header */}
      <div style={{ background: COLORS.dark, color: "#fff", borderRadius: 10, padding: 16, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <Stat label="Plan"          value={plan.name} dark />
        <Stat label="Historical window"  value={`${rangeLabel} ${priorYr} + ${rangeLabel} ${currYr}`} dark />
        <Stat label="Catalog items" value={catalog.length} dark />
        <Stat label="Locked"        value={lockedCount} dark />
        <Stat label="Target rev"    value={fmtMoney(totalTargetRev)} dark big />
      </div>

      {/* How-this-works help (collapsible) */}
      <div style={{ background: "#eef3e8", border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "10px 14px" }}>
        <div onClick={() => setShowHelp(h => !h)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: COLORS.dark }}>
          <span style={{ color: COLORS.muted }}>{showHelp ? "▾" : "▸"}</span>❓ How this works
        </div>
        {showHelp && (
          <div style={{ fontSize: 12, color: COLORS.text, marginTop: 8, lineHeight: 1.55 }}>
            <strong>Purpose:</strong> decide which houseplants to grow/buy this season — and how many, at what price — using past sales, then turn that into broker orders.<br />
            <strong>1. Catalog (here):</strong> each row is a variety + pot size with its sales history, an average, and a suggested projection. Type a <strong>🎯 target qty</strong> &amp; price, or <em>Apply to unset items</em> to pre-fill from the average. Set <strong>Status → locked</strong> on what you're committing to; mark losers <em>cancelled</em>. Click a variety name for notes, broker, and duplicate.<br />
            <strong>2. Sourcing tab:</strong> your <strong>locked</strong> items show up grouped by how they come in — tag each one's broker + acquisition type and generate a copy-paste broker request.<br />
            <span style={{ color: COLORS.muted }}>Status meanings — <strong>considered</strong>: still deciding · <strong>locked</strong>: committed (this is what flows to Sourcing) · <strong>cancelled</strong>: excluded.</span>
          </div>
        )}
      </div>

      {/* Projection control + size rollup (always visible) */}
      <div style={{ background: COLORS.card, border: `2px solid ${COLORS.light}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div onClick={() => setShowRollup(!showRollup)} style={{ cursor: "pointer" }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: COLORS.dark, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: COLORS.muted, fontSize: 16 }}>{showRollup ? "▾" : "▸"}</span>
              📊 Projection &amp; size rollup
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
              {showRollup
                ? "Pick the avg base (last 2 / 3 / 4 years), set growth target, then Apply to pre-fill targets. Click ▾ to collapse."
                : "Click ▸ to expand the size rollup table."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {isProjectionLocked && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#f0f7ec", border: `1px solid ${COLORS.light}`, borderRadius: 14, fontSize: 11, fontWeight: 700, color: COLORS.dark }}>
                🔒 Locked by {projectionLockedBy?.split("@")[0] || "owner"} · {new Date(projectionLockedAt).toLocaleDateString()}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: canEditProjection ? 1 : 0.6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.3 }}>Avg base:</span>
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => setAvgBase(n)} disabled={!canEditProjection}
                  style={{
                    padding: "5px 10px", fontSize: 12, fontWeight: 700,
                    background: avgBase === n ? COLORS.dark : "#f3f5ef",
                    color:      avgBase === n ? "#fff" : COLORS.text,
                    border: `1px solid ${avgBase === n ? COLORS.dark : COLORS.border}`,
                    borderRadius: 14, cursor: canEditProjection ? "pointer" : "not-allowed",
                  }}>{n}yr</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: canEditProjection ? 1 : 0.6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>Projection</span>
              <input type="number" value={projection} step="1" disabled={!canEditProjection}
                onChange={e => setProjection(parseFloat(e.target.value) || 0)}
                style={{ width: 60, padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 14, fontWeight: 700, textAlign: "right", background: canEditProjection ? "#fff" : "#f3f5ef", cursor: canEditProjection ? "text" : "not-allowed" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>%</span>
            </div>
            {isOwner && !isProjectionLocked && (
              <button onClick={lockProjection}
                style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: COLORS.dark, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                🔒 Lock projection
              </button>
            )}
            {isOwner && isProjectionLocked && (
              <button onClick={unlockProjection}
                style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${COLORS.amber}`, background: "#fff", color: COLORS.amber, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                🔓 Unlock
              </button>
            )}
            <button onClick={applyProjection}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: COLORS.light, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                Apply to unset items
            </button>
            <button onClick={clearProjections}
              style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.text, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              Clear targets
            </button>
            <button onClick={() => setDetailItem({ catalogRow: null, fallback: { description: "", pot_size: "" }, history: null })}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: COLORS.dark, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              + Create new item
            </button>
            <button onClick={removeEmptyItems} title="Delete catalog items with no sales history, no target qty, and not locked"
              style={{ padding: "8px 14px", borderRadius: 6, border: `1px solid ${COLORS.red}`, background: "#fff", color: COLORS.red, fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              🗑 Remove empty
            </button>
          </div>
        </div>

        {/* Only show years that have data (so we don't waste columns on years not loaded yet) */}
        {(() => {
          const displayYears = allYears.filter(y => grandRevByYear[y] > 0 || grandQtyByYear[y] > 0);
          return (
            <>
              {/* Revenue projection summary — ALWAYS visible (not part of the collapsible) */}
              <div style={{ background: "#f3f5ef", borderRadius: 8, padding: 12, marginBottom: 12, display: "grid", gridTemplateColumns: `repeat(${displayYears.length + 3}, 1fr)`, gap: 12 }}>
                {displayYears.map(y => (
                  <RevStat key={y} label={`${rangeLabel} '${String(y).slice(-2)}`} value={fmtMoney(grandRevByYear[y])} muted />
                ))}
                <RevStat label={`${avgBase}-yr avg`} value={fmtMoney(grandAvgRev)} />
                <RevStat label={`${projection >= 0 ? "+" : ""}${projection}% projected ${planYear}`} value={fmtMoney(grandProjRev)} accent={COLORS.light} />
                <RevStat label="🎯 Your target" value={fmtMoney(grandTgtRev)} accent={COLORS.dark} big />
              </div>

              {showRollup && <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f3f5ef" }}>
                      <th style={th}>Pot</th>
                      <th style={{...th, textAlign:"right"}}>#</th>
                      {displayYears.map(y => (
                        <th key={y} style={{...th, textAlign:"right"}}>'{String(y).slice(-2)} qty</th>
                      ))}
                      <th style={{...th, textAlign:"right"}}>{avgBase}yr avg qty</th>
                      <th style={{...th, textAlign:"right", background: "#eaf3df"}}>Proj qty ({projection >= 0 ? "+" : ""}{projection}%)</th>
                      <th style={{...th, textAlign:"right", background: "#fafdf7"}}>🎯 Target qty</th>
                      <th style={{...th, textAlign:"right"}}>Δ vs avg</th>
                      <th style={{...th, textAlign:"right"}}>{avgBase}yr avg $</th>
                      <th style={{...th, textAlign:"right", background: "#eaf3df"}}>Proj $</th>
                      <th style={{...th, textAlign:"right", background: "#fafdf7"}}>🎯 Target $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeStatsArr.map(s => (
                      <tr key={s.size} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                        <td style={td}><strong>{s.size}</strong></td>
                        <td style={{...td, textAlign:"right"}}>{s.items}</td>
                        {displayYears.map(y => (
                          <td key={y} style={{...td, textAlign:"right", color: COLORS.muted}}>{(s.yearQty[y] || 0).toLocaleString()}</td>
                        ))}
                        <td style={{...td, textAlign:"right"}}>{Math.round(s.avg_qty).toLocaleString()}</td>
                        <td style={{...td, textAlign:"right", background: "#eaf3df", fontWeight: 700, color: COLORS.dark}}>{s.projected_qty.toLocaleString()}</td>
                        <td style={{...td, textAlign:"right", background: "#fafdf7", fontWeight: 800, color: COLORS.light}}>{s.target_qty.toLocaleString() || "—"}</td>
                        <td style={{...td, textAlign:"right", color: s.delta_pct == null ? COLORS.muted : s.delta_pct > 0 ? COLORS.light : s.delta_pct < -5 ? COLORS.red : COLORS.text, fontWeight: 700}}>
                          {s.delta_pct != null ? (s.delta_pct >= 0 ? "+" : "") + s.delta_pct.toFixed(0) + "%" : "—"}
                        </td>
                        <td style={{...td, textAlign:"right", color: COLORS.muted}}>{fmtMoney(s.avg_rev)}</td>
                        <td style={{...td, textAlign:"right", background: "#eaf3df", fontWeight: 700, color: COLORS.dark}}>{fmtMoney(s.projected_rev)}</td>
                        <td style={{...td, textAlign:"right", background: "#fafdf7", fontWeight: 800, color: COLORS.light}}>{fmtMoney(s.target_rev)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: COLORS.dark, color: "#fff" }}>
                      <td style={{...td, color: "#fff", fontWeight: 800}}>TOTAL</td>
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800}}>{sizeStatsArr.reduce((s,x)=>s+x.items,0)}</td>
                      {displayYears.map(y => (
                        <td key={y} style={{...td, color: "#c8e6b8", textAlign:"right"}}>{grandQtyByYear[y].toLocaleString()}</td>
                      ))}
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800}}>{Math.round(grandAvgQty).toLocaleString()}</td>
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800, background: "rgba(127,176,105,0.3)"}}>{grandProjQty.toLocaleString()}</td>
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800}}>{grandTgtQty.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 600, color: "#c8e6b8" }}>({grandPctOfProj.toFixed(0)}%)</span></td>
                      <td style={td}></td>
                      <td style={{...td, color: "#c8e6b8", textAlign:"right"}}>{fmtMoney(grandAvgRev)}</td>
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800, background: "rgba(127,176,105,0.3)"}}>{fmtMoney(grandProjRev)}</td>
                      <td style={{...td, color: "#fff", textAlign:"right", fontWeight: 800}}>{fmtMoney(grandTgtRev)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>}
            </>
          );
        })()}
      </div>

      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
        {/* View mode chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { id: "all",         label: "All" },
            { id: "recommended", label: "💡 Recommended" },
            { id: "top26",       label: `🔥 Top ${currYr}` },
            { id: "top25",       label: `📜 Top ${priorYr}` },
            { id: "growers",     label: "📈 Growers" },
            { id: "decliners",   label: "📉 Decliners" },
            { id: "new",         label: `🆕 New in ${currYr}` },
            { id: "missing",     label: `❌ Missing in ${currYr}` },
            { id: "skipped",     label: `🕳️ Skipped (sold '${String(priorYr3).slice(-2)}/'${String(priorYr2).slice(-2)}, dropped '${String(priorYr).slice(-2)}/'${String(currYr).slice(-2)})` },
          ].map(v => (
            <button key={v.id} onClick={() => pickView(v.id)}
              style={{
                padding: "5px 11px", fontSize: 12, fontWeight: 700,
                background: viewMode === v.id ? COLORS.dark : "#f3f5ef",
                color: viewMode === v.id ? "#fff" : COLORS.text,
                border: `1px solid ${viewMode === v.id ? COLORS.dark : COLORS.border}`,
                borderRadius: 14, cursor: "pointer",
              }}>
              {v.label} <span style={{ opacity: 0.6, fontSize: 10 }}>({counts[v.id]})</span>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>
              Catalog · {filtered.length} of {rows.length} items {viewMode !== "all" ? `(${viewMode} view)` : ""}
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
              {viewMode === "recommended" && `Scored by 2-yr volume × stability × YoY growth. Top picks for ${rangeLabel} ${planYear} planning.`}
              {viewMode === "top26" && `Best sellers in ${rangeLabel} ${currYr} — most-recent year.`}
              {viewMode === "top25" && `Best sellers in ${rangeLabel} ${priorYr} — baseline year.`}
              {viewMode === "growers" && `Items with >25% YoY growth (had >50 units in ${priorYr}).`}
              {viewMode === "decliners" && `Items with >25% YoY decline (had >100 units in ${priorYr}) — investigate supply or relevance.`}
              {viewMode === "new" && `Sold in ${currYr} but no ${priorYr} sales — recent additions.`}
              {viewMode === "missing" && `Sold in ${priorYr} but no ${currYr} sales — gaps to investigate.`}
              {viewMode === "skipped" && `Sold >25 units in ${priorYr3} or ${priorYr2} but ZERO in ${priorYr} + ${currYr}. Items we used to grow and dropped — worth knowing why before re-introducing.`}
              {viewMode === "all" && "Type targets and they save automatically. Lock when ready."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterSize} onChange={e => setFilterSize(e.target.value)}
              style={{ padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }}>
              <option value="all">All sizes</option>
              {sizes.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search variety…"
              style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, minWidth: 220 }} />
          </div>
        </div>

        {/* Price-band shading legend — rows tint green by $/ea so price tiers are scannable */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 10, color: COLORS.muted, fontWeight: 600 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: 0.3 }}>Row shade = $/ea:</span>
          {[
            { c: "#f6faf2", l: "<$4" },
            { c: "#eaf3df", l: "$4–7" },
            { c: "#dcebcb", l: "$7–12" },
            { c: "#cbe0b4", l: "$12–21" },
            { c: "#b7d49a", l: "$21+" },
          ].map(b => (
            <span key={b.l} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 14, height: 14, background: b.c, border: `1px solid ${COLORS.border}`, borderRadius: 3, display: "inline-block" }} />
              {b.l}
            </span>
          ))}
          <span style={{ marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 4, height: 14, background: COLORS.light, display: "inline-block", borderRadius: 2 }} />
            locked
          </span>
        </div>

        <div style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 8, WebkitOverflowScrolling: "touch" }}>
          {(() => {
            const displayYears = allYears.filter(y =>
              rows.some(r => (r.yearQty?.[y] || 0) > 0)
            );
            const baseYrsForRow = allYears.slice(-avgBase);
            return (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f3f5ef" }}>
                <SortHdr col="pot_size" label="Pot" sticky={1} />
                <SortHdr col="desc"     label="Variety" sticky={1} />
                <th colSpan={displayYears.length} style={{...th, ...stickyRow1, textAlign: "center", borderBottom: `1px solid ${COLORS.border}`}}>
                  <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    Year totals
                    <button onClick={() => setYearDisplay(yearDisplay === "qty" ? "revenue" : "qty")}
                      style={{
                        padding: "2px 8px", fontSize: 10, fontWeight: 800,
                        background: yearDisplay === "qty" ? "#fff" : COLORS.light,
                        color: yearDisplay === "qty" ? COLORS.text : "#fff",
                        border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer",
                      }} title="Toggle between unit qty and revenue $">
                      {yearDisplay === "qty" ? "show $" : "show qty"}
                    </button>
                  </span>
                </th>
                <th style={{...th, ...stickyRow1, textAlign: "right"}}>{avgBase}yr avg</th>
                <SortHdr col="yoy_qty"   label="Δ vs avg" align="right" sticky={1} />
                <th style={{...th, ...stickyRow1, textAlign:"center"}}>signal</th>
                <th style={{...th, ...stickyRow1, textAlign: "right"}}>'{String(currYr).slice(-2)} $/ea</th>
                <th style={{...th, ...stickyRow1, textAlign: "right", background: "#e8f0e2"}}>🎯 qty {planYear}</th>
                <th style={{...th, ...stickyRow1, textAlign: "right", background: "#e8f0e2"}}>🎯 $/ea {planYear}</th>
                <th style={{...th, ...stickyRow1, textAlign: "right", background: "#e8f0e2"}}>Δ $/ea</th>
                <th style={{...th, ...stickyRow1, background: "#e8f0e2"}}>Status</th>
                <th style={{...th, ...stickyRow1}}></th>
              </tr>
              <tr style={{ background: "#f3f5ef" }}>
                <th style={{...th, ...stickyRow2}}></th>
                <th style={{...th, ...stickyRow2}}></th>
                {displayYears.map(y => (
                  <th key={y} style={{...th, ...stickyRow2, textAlign: "right", fontSize: 10}}>'{String(y).slice(-2)}</th>
                ))}
                <th colSpan={7} style={{...th, ...stickyRow2}}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 200).map((r, i) => {
                // Stable identity per item — used for the row key AND the input keys.
                // Using the array index here was the bug behind "numbers staying on
                // the wrong row": uncontrolled inputs kept their DOM value at a fixed
                // index while sorting/filtering shifted which item sat there.
                const rowKey = `${r.pot_size}|${r.normalized}`;
                const c = catalog.find(x => normalizeDesc(x.description) === r.normalized && x.pot_size === r.pot_size);
                // Pricing signal: combine qty + price moves (still uses prior/curr)
                let signal = null, signalColor = COLORS.muted;
                if (r.yoy_qty != null && r.yoy_price != null) {
                  if (r.yoy_qty > 10 && Math.abs(r.yoy_price) < 5) { signal = "↑ RAISE"; signalColor = COLORS.light; }
                  else if (r.yoy_qty < -10 && r.yoy_price > 5)     { signal = "✗ PRICED OUT"; signalColor = COLORS.red; }
                  else if (r.yoy_qty > 10 && r.yoy_price > 10)     { signal = "✓ HEALTHY"; signalColor = COLORS.light; }
                  else if (r.yoy_qty < -10 && r.yoy_price < -5)    { signal = "⚠ FALLING"; signalColor = COLORS.amber; }
                  else if (Math.abs(r.yoy_qty) < 10 && Math.abs(r.yoy_price) < 5) { signal = "= STABLE"; signalColor = COLORS.muted; }
                }
                // Compute the avg-base value + delta for this row
                const rowAvgQty = baseYrsForRow.reduce((s, y) => s + (r.yearQty?.[y] || 0), 0) / baseYrsForRow.length;
                const recentQty = r.yearQty?.[currYr] || 0;
                const rowDelta = rowAvgQty > 0 ? ((recentQty - rowAvgQty) / rowAvgQty * 100) : null;
                const targetPrice = c?.target_price ? +c.target_price : null;
                const currPrice = r.curr_price;
                const priceDiff = currPrice && targetPrice ? (targetPrice - currPrice) : null;
                const priceDiffPct = currPrice && targetPrice && currPrice > 0 ? ((targetPrice - currPrice) / currPrice * 100) : null;
                return (
                  <tr key={rowKey}
                    style={{ borderBottom: `1px solid ${COLORS.border}`, background: c?.status === "locked" ? "#e3f0d8" : c?.status === "cancelled" ? "#fbeae7" : r.isNew ? "#fff7e6" : priceShade(currPrice ?? targetPrice), borderLeft: c?.status === "locked" ? `4px solid ${COLORS.light}` : c?.status === "cancelled" ? `4px solid ${COLORS.red}` : "4px solid transparent", position: "relative" }}>
                    <td style={td}>{r.pot_size}</td>
                    <td style={{...td, position: "relative"}}>
                      {r.isNew && (
                        <span style={{ marginRight: 6, background: COLORS.amber, color: "#fff", padding: "1px 6px", borderRadius: 8, fontSize: 9, fontWeight: 800, letterSpacing: 0.5 }}>
                          🧪 NEW
                        </span>
                      )}
                      <span onClick={() => setDetailItem({ catalogRow: c || null, fallback: { description: r.desc, pot_size: r.pot_size }, history: r })}
                        title="Open item details + notes"
                        style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>
                        {r.desc}
                      </span>
                      {cultureByGenus[r.genus] && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.light, fontWeight: 700 }} title={`Culture data: ${Object.entries(cultureByGenus[r.genus]).map(([b,n]) => `${b} (${n})`).join(", ")}`}>
                          📖 {Object.keys(cultureByGenus[r.genus]).join("+")}
                        </span>
                      )}
                    </td>
                    {displayYears.map(y => {
                      const q = r.yearQty?.[y] || 0;
                      const rev = r.yearRev?.[y] || 0;
                      const isRecent = y === currYr;
                      const showVal = yearDisplay === "qty" ? (q ? q.toLocaleString() : "—") : (rev ? fmtMoney(rev) : "—");
                      const hasData = yearDisplay === "qty" ? q > 0 : rev > 0;
                      return (
                        <td key={y} style={{...td, textAlign: "right", color: !hasData ? COLORS.muted : isRecent ? COLORS.text : COLORS.muted, fontWeight: isRecent ? 700 : 400}}>
                          {showVal}
                        </td>
                      );
                    })}
                    <td style={{...td, textAlign: "right", fontWeight: 700, color: rowAvgQty > 0 ? COLORS.dark : COLORS.muted}}>
                      {yearDisplay === "qty"
                        ? (rowAvgQty > 0 ? Math.round(rowAvgQty).toLocaleString() : "—")
                        : (() => {
                            const avgRev = baseYrsForRow.reduce((s, y) => s + (r.yearRev?.[y] || 0), 0) / baseYrsForRow.length;
                            return avgRev > 0 ? fmtMoney(avgRev) : "—";
                          })()
                      }
                    </td>
                    <td style={{...td, textAlign:"right", color: rowDelta == null ? COLORS.muted : rowDelta > 0 ? COLORS.light : rowDelta < -25 ? COLORS.red : rowDelta < 0 ? COLORS.amber : COLORS.text, fontWeight: rowDelta != null ? 700 : 400}}>
                      {rowDelta != null ? (rowDelta >= 0 ? "+" : "") + rowDelta.toFixed(0) + "%" : "—"}
                    </td>
                    <td style={{...td, textAlign:"center", cursor: "help"}}
                      onMouseEnter={e => setHoverRow({ key: rowKey, x: e.clientX, y: e.clientY })}
                      onMouseMove={e => setHoverRow(h => h && h.key === rowKey ? { key: rowKey, x: e.clientX, y: e.clientY } : h)}
                      onMouseLeave={() => setHoverRow(null)}>
                      {signal && <span style={{ background: signalColor + "22", color: signalColor, border: `1px solid ${signalColor}`, padding: "2px 6px", borderRadius: 8, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>{signal}</span>}
                      {hoverRow?.key === rowKey && (
                        <RowHoverCard row={r} years={displayYears} anchorX={hoverRow.x} anchorY={hoverRow.y} />
                      )}
                    </td>
                    <td style={{...td, textAlign:"right", color: COLORS.muted, fontWeight: 600}}>
                      {currPrice ? "$" + currPrice.toFixed(2) : "—"}
                    </td>
                    <td style={{...td, textAlign:"right", background: "#fafdf7"}}>
                      <input key={`tq-${rowKey}`} type="number" defaultValue={c?.target_qty || ""}
                        onBlur={e => updateCatalogRow(r, { target_qty: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ width: 60, padding: "3px 6px", textAlign: "right", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }}
                        placeholder="—" />
                    </td>
                    <td style={{...td, textAlign:"right", background: "#fafdf7"}}>
                      <input key={`tp-${rowKey}`} type="number" step="0.01" defaultValue={c?.target_price || ""}
                        onBlur={e => updateCatalogRow(r, { target_price: e.target.value ? parseFloat(e.target.value) : null })}
                        style={{ width: 60, padding: "3px 6px", textAlign: "right", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }}
                        placeholder={r.curr_price ? r.curr_price.toFixed(2) : "—"} />
                    </td>
                    <td style={{...td, textAlign: "right", background: "#fafdf7", color: priceDiff == null ? COLORS.muted : priceDiff > 0 ? COLORS.light : priceDiff < 0 ? COLORS.red : COLORS.text, fontWeight: priceDiff != null ? 700 : 400, whiteSpace: "nowrap"}}>
                      {priceDiff != null ? (priceDiff >= 0 ? "+" : "") + "$" + priceDiff.toFixed(2) : "—"}
                      {priceDiffPct != null && Math.abs(priceDiffPct) >= 0.5 && (
                        <div style={{ fontSize: 9, color: COLORS.muted, fontWeight: 600 }}>
                          {priceDiffPct >= 0 ? "+" : ""}{priceDiffPct.toFixed(0)}%
                        </div>
                      )}
                    </td>
                    <td style={{...td, background: "#fafdf7"}}>
                      <select key={`st-${rowKey}`} defaultValue={c?.status || "considered"}
                        onChange={e => updateCatalogRow(r, { status: e.target.value })}
                        style={{ padding: "3px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11 }}>
                        <option value="considered">considered</option>
                        <option value="locked">locked</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </td>
                    <td style={td}>
                      <button title="Merge this item into another"
                        onClick={() => setMergeModal({ source: r })}
                        style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, color: COLORS.muted }}>
                        🔗
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            );
          })()}
        </div>
        {sorted.length > 200 && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.muted, textAlign: "center" }}>
            Showing top 200 of {sorted.length} matches. Use filter/search to narrow.
          </div>
        )}

        {aliases.length > 0 && (
          <div style={{ marginTop: 14, fontSize: 11, color: COLORS.muted, padding: 8, background: "#f3f5ef", borderRadius: 4 }}>
            🔗 <strong>{aliases.length} manual merge(s) active.</strong>{" "}
            <button onClick={unmergeAll} style={{ background: "transparent", border: "none", color: COLORS.red, cursor: "pointer", textDecoration: "underline", fontSize: 11 }}>
              clear all
            </button>
          </div>
        )}
      </div>

      {/* Merge modal */}
      {mergeModal && (
        <MergeModal sourceRow={mergeModal.source} allRows={rows}
          onCancel={() => setMergeModal(null)}
          onConfirm={target => saveMerge(mergeModal.source, target)} />
      )}

      {/* Item detail / create / duplicate modal */}
      {detailItem && (
        <ItemDetailModal sb={sb} plan={plan} sizes={sizes}
          catalogRow={detailItem.catalogRow} fallback={detailItem.fallback}
          history={detailItem.history} years={allYears}
          onClose={() => setDetailItem(null)}
          onChange={() => setReloadTick(t => t + 1)} />
      )}
    </div>
  );
}

// Modal for selecting merge target
// Hover card shown over a catalog row — 4-yr pricing + sparkline + revenue trend.
function RowHoverCard({ row, years, anchorX = 0, anchorY = 0 }) {
  const W = 320, H = 80, PADX = 8, PADY = 8;
  // Fixed-position near the cursor so the card escapes the table's scroll
  // viewport (overflow:auto would otherwise clip it). Flip left/up near edges.
  const CARD_W = 360, CARD_H = 210;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = anchorX + CARD_W + 16 > vw ? Math.max(8, anchorX - CARD_W - 12) : anchorX + 12;
  const top  = anchorY + CARD_H + 16 > vh ? Math.max(8, anchorY - CARD_H - 12) : anchorY + 16;
  const qtys = years.map(y => row.yearQty?.[y] || 0);
  const revs = years.map(y => row.yearRev?.[y] || 0);
  const prices = years.map(y => {
    const q = row.yearQty?.[y] || 0;
    const r = row.yearRev?.[y] || 0;
    return q > 0 ? r / q : 0;
  });
  const maxQ = Math.max(1, ...qtys);
  const maxR = Math.max(1, ...revs);
  const dx = (W - PADX * 2) / Math.max(1, years.length - 1);
  const xy = (i, vals, max) => [PADX + i * dx, H - PADY - ((vals[i] || 0) / max) * (H - PADY * 2)];

  return (
    <div style={{
      position: "fixed", left, top, zIndex: 1000,
      background: "#fff", border: `1px solid ${COLORS.dark}`, borderRadius: 8,
      padding: 10, width: CARD_W, fontSize: 11,
      boxShadow: "0 4px 12px rgba(0,0,0,0.18)", pointerEvents: "none",
    }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 13, color: COLORS.dark, marginBottom: 6 }}>
        {row.pot_size} · {row.desc}
      </div>

      {/* Per-year price table */}
      <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse", marginBottom: 8 }}>
        <thead>
          <tr style={{ color: COLORS.muted }}>
            <th style={{textAlign:"left", fontWeight: 700, padding: "2px 0"}}>Year</th>
            {years.map(y => <th key={y} style={{textAlign:"right", fontWeight: 700, padding: "2px 0"}}>'{String(y).slice(-2)}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{color: COLORS.muted}}>Qty</td>
            {years.map((y, i) => <td key={y} style={{textAlign:"right"}}>{qtys[i] || "—"}</td>)}
          </tr>
          <tr>
            <td style={{color: COLORS.muted}}>$/ea</td>
            {years.map((y, i) => <td key={y} style={{textAlign:"right", fontWeight: 700}}>{prices[i] > 0 ? "$" + prices[i].toFixed(2) : "—"}</td>)}
          </tr>
          <tr>
            <td style={{color: COLORS.muted}}>Rev</td>
            {years.map((y, i) => <td key={y} style={{textAlign:"right", color: COLORS.muted}}>{revs[i] > 0 ? fmtMoney(revs[i]) : "—"}</td>)}
          </tr>
        </tbody>
      </table>

      {/* Sparkline: qty in green, revenue in dark line */}
      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>Sales trend (qty)</div>
      <svg width={W} height={H} style={{ display: "block", background: "#fafdf7", borderRadius: 4 }}>
        <polyline
          fill="none" stroke={COLORS.light} strokeWidth="2"
          points={years.map((_, i) => xy(i, qtys, maxQ).join(",")).join(" ")} />
        {years.map((y, i) => {
          const [x, ypos] = xy(i, qtys, maxQ);
          return (
            <g key={y}>
              <circle cx={x} cy={ypos} r="3" fill={COLORS.light} />
              <text x={x} y={H - 1} fontSize="9" textAnchor="middle" fill={COLORS.muted}>
                '{String(y).slice(-2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MergeModal({ sourceRow, allRows, onCancel, onConfirm }) {
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);
  // Suggest matches: same pot size first + similar genus
  const srcGenus = (sourceRow.normalized.split(/\s+/)[0] || "").toUpperCase();
  const candidates = allRows
    .filter(r => r.normalized !== sourceRow.normalized || r.pot_size !== sourceRow.pot_size)
    .map(r => ({ ...r, _score: ((r.normalized.toUpperCase().split(/\s+/)[0] || "") === srcGenus ? 100 : 0) + (r.pot_size === sourceRow.pot_size ? 50 : 0) }))
    .sort((a, b) => b._score - a._score);
  const filtered = q ? candidates.filter(r => r.desc.toLowerCase().includes(q.toLowerCase())) : candidates;
  const selected = filtered.find(r => `${r.pot_size}|${r.normalized}` === selectedKey);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: 20, maxWidth: 700, width: "92%", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: COLORS.dark, marginBottom: 6 }}>
          Merge this item into another
        </div>
        <div style={{ background: "#fff3e0", border: `1px solid ${COLORS.amber}`, padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
          Combining: <strong>{sourceRow.pot_size}</strong> · {sourceRow.desc}<br />
          The sales from this item will roll up under the canonical item you pick. The original sales rows stay intact — this is a display-only alias.
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search target item…" autoFocus
          style={{ width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13, marginBottom: 10 }} />

        <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
          {filtered.slice(0, 50).map((r, i) => {
            const key = `${r.pot_size}|${r.normalized}`;
            const isSel = selectedKey === key;
            return (
              <div key={i} onClick={() => setSelectedKey(key)}
                style={{
                  padding: 10, borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer",
                  background: isSel ? "#dcedc8" : i % 2 ? "#fafafa" : "#fff",
                }}>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{r.pot_size}</div>
                <div style={{ fontWeight: 600 }}>{r.desc}</div>
                <div style={{ fontSize: 11, color: COLORS.muted }}>
                  '25: {r.y_prior_qty || 0} · '26: {r.y_curr_qty || 0}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel}
            style={{ padding: "8px 16px", border: `1px solid ${COLORS.border}`, borderRadius: 6, background: "#fff", cursor: "pointer" }}>
            Cancel
          </button>
          <button disabled={!selected} onClick={() => onConfirm(selected)}
            style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: selected ? COLORS.dark : "#ccc", color: "#fff", fontWeight: 700, cursor: selected ? "pointer" : "not-allowed" }}>
            Merge into selected
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const modalInp = { width: "100%", padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 14, boxSizing: "border-box" };

// Shared item detail / editor modal — opened by clicking an item in Catalog or
// Sourcing. Edits the underlying houseplant_catalog row (creating one on save if
// the item only exists in sales history). Holds free-form notes + supplier
// preferences, and can duplicate the item: every planning field copies to a new
// "(copy)" item you then rename — nothing plant-specific (sales history) carries
// over because history is keyed by name. All writes call onChange() so the parent
// reloads. See sizeRank()/bySizeThenDesc for the ordering these items sort into.
function ItemDetailModal({ sb, plan, sizes = [], catalogRow, fallback, history, years = [], onClose, onChange }) {
  const seed = catalogRow || {};
  const [curId, setCurId] = useState(catalogRow?.id || null);
  const [showHistory, setShowHistory] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: seed.description ?? fallback?.description ?? "",
    pot_size: seed.pot_size ?? fallback?.pot_size ?? "",
    acquisition_type: seed.acquisition_type ?? "",
    supplier: seed.supplier ?? "",
    target_qty: seed.target_qty ?? "",
    target_price: seed.target_price ?? "",
    status: seed.status ?? "considered",
    arrival_date_target: seed.arrival_date_target ?? "",
    notes: seed.notes ?? "",
    source_notes: seed.source_notes ?? "",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.description.trim() && form.pot_size.trim();

  // Brokers come from the canonical broker_profiles table (same source the
  // receiving-claim emailer uses) — no hardcoded list to drift out of sync.
  const [brokers, setBrokers] = useState([]);
  useEffect(() => {
    if (!sb) return;
    sb.from("broker_profiles").select("name,rep_name,rep_email,rep_phone").order("name")
      .then(({ data }) => setBrokers(data || []));
  }, [sb]);

  function payload() {
    return {
      description: form.description.trim(),
      pot_size: form.pot_size.trim(),
      acquisition_type: form.acquisition_type || null,
      supplier: form.supplier || null,
      target_qty: form.target_qty === "" || form.target_qty == null ? null : parseInt(form.target_qty),
      target_price: form.target_price === "" || form.target_price == null ? null : parseFloat(form.target_price),
      status: form.status,
      arrival_date_target: form.arrival_date_target || null,
      notes: form.notes || null,
      source_notes: form.source_notes || null,
    };
  }

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    if (curId) {
      await sb.from("houseplant_catalog").update({ ...payload(), updated_at: new Date().toISOString() }).eq("id", curId);
    } else {
      await sb.from("houseplant_catalog").insert({ plan_id: plan.id, ...payload() });
    }
    setBusy(false);
    onChange?.();
    onClose();
  }

  // Duplicate = re-enter create mode with every field copied and the name
  // suffixed " (copy)". Nothing is written until Save, so the original is
  // untouched and a cancelled duplicate leaves no orphan row.
  function duplicate() {
    setCurId(null);
    setShowHistory(false);
    // Copy keeps pricing/qty/supplier/notes but resets to "considered" so a
    // duplicate of a locked item never silently flows into sourcing unreviewed.
    setForm(f => ({ ...f, description: `${f.description.trim()} (copy)`, status: "considered" }));
  }

  async function del() {
    if (!curId || busy) return;
    if (!window.confirm(`Delete "${form.description}" from the catalog? This removes its target, notes, and sourcing settings.`)) return;
    setBusy(true);
    await sb.from("houseplant_catalog").delete().eq("id", curId);
    setBusy(false);
    onChange?.();
    onClose();
  }

  const targetRev = (parseFloat(form.target_qty) || 0) * (parseFloat(form.target_price) || 0);
  const creating = !curId;
  // Title is the live variety name — updates as you type the description below.
  const title = form.description.trim() || "New item";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 10, padding: 20, maxWidth: 620, width: "94%", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: COLORS.dark, marginBottom: 2 }}>
          {form.pot_size ? <span style={{ color: COLORS.muted, fontSize: 16 }}>{form.pot_size} · </span> : null}{title}
        </div>
        <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 16 }}>
          {creating
            ? "Set a target qty and lock it to flow this item into projections + sourcing."
            : "Edit plant info, notes, and supplier preferences. Duplicate to spin up a similar item with the same settings."}
        </div>

        {/* Sales-history strip (existing items only) */}
        {showHistory && history && years.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {years.map(y => {
              const q = history.yearQty?.[y] || 0;
              const rev = history.yearRev?.[y] || 0;
              return (
                <div key={y} style={{ flex: "1 1 60px", background: "#f3f5ef", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: COLORS.muted, fontWeight: 700 }}>'{String(y).slice(-2)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: q ? COLORS.dark : COLORS.muted }}>{q ? q.toLocaleString() : "—"}</div>
                  <div style={{ fontSize: 9, color: COLORS.muted }}>{rev ? fmtMoney(rev) : ""}</div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="Variety description">
            <input value={form.description} onChange={e => set("description", e.target.value)} autoFocus style={modalInp} />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Pot size">
              <input value={form.pot_size} onChange={e => set("pot_size", e.target.value)} list="item-size-list" style={modalInp} />
              <datalist id="item-size-list">{sizes.map(s => <option key={s} value={s} />)}</datalist>
            </FormField>
            <FormField label="Acquisition">
              <select value={form.acquisition_type} onChange={e => set("acquisition_type", e.target.value)} style={modalInp}>
                <option value="">— pick —</option>
                <option value="finished">🛒 Finished</option>
                <option value="liner">🌱 Liner</option>
                <option value="propagate">🌿 Propagate</option>
                <option value="partner">🤝 Partner</option>
              </select>
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <FormField label="Target qty">
              <input type="number" value={form.target_qty} onChange={e => set("target_qty", e.target.value)} style={modalInp} />
            </FormField>
            <FormField label="Target $/ea">
              <input type="number" step="0.01" value={form.target_price} onChange={e => set("target_price", e.target.value)} style={modalInp} />
            </FormField>
            <FormField label="Target rev">
              <div style={{ ...modalInp, background: "#f3f5ef", fontWeight: 800, color: COLORS.dark }}>{targetRev ? fmtMoney(targetRev) : "—"}</div>
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Status">
              <select value={form.status} onChange={e => set("status", e.target.value)} style={modalInp}>
                <option value="considered">considered</option>
                <option value="locked">locked</option>
                <option value="cancelled">cancelled</option>
              </select>
            </FormField>
            <FormField label="Broker">
              <select value={form.supplier || ""} onChange={e => set("supplier", e.target.value)} style={modalInp}>
                <option value="">— none —</option>
                {brokers.map(b => <option key={b.name} value={b.name}>{b.name}{b.rep_name ? ` — ${b.rep_name}` : ""}</option>)}
                {/* Preserve any legacy free-text supplier not in the broker list */}
                {form.supplier && !brokers.some(b => b.name === form.supplier) && (
                  <option value={form.supplier}>{form.supplier}</option>
                )}
              </select>
              {(() => {
                const b = brokers.find(x => x.name === form.supplier);
                if (!b) return null;
                const bits = [b.rep_email, fmtPhone(b.rep_phone)].filter(Boolean).join(" · ");
                return bits ? <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>{bits}</div> : null;
              })()}
            </FormField>
          </div>
          {form.acquisition_type === "finished" && (
            <FormField label="Target arrival (Thursday)">
              <input type="date" value={form.arrival_date_target} onChange={e => set("arrival_date_target", e.target.value)} style={modalInp} />
            </FormField>
          )}
          <FormField label="Notes">
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={3}
              placeholder="Care notes, sales rationale, customer requests…"
              style={{ ...modalInp, resize: "vertical", fontFamily: "inherit" }} />
          </FormField>
          <FormField label="Sourcing / supplier notes">
            <textarea value={form.source_notes} onChange={e => set("source_notes", e.target.value)} rows={2}
              placeholder="Preferred broker, substitution rules, lead times…"
              style={{ ...modalInp, resize: "vertical", fontFamily: "inherit" }} />
          </FormField>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8 }}>
            {!creating && (
              <button onClick={duplicate} disabled={busy}
                style={{ padding: "8px 16px", border: `1px solid ${COLORS.light}`, borderRadius: 6, background: "#fff", color: COLORS.light, fontWeight: 700, cursor: "pointer" }}>
                ⧉ Duplicate
              </button>
            )}
            {!creating && (
              <button onClick={del} disabled={busy}
                style={{ padding: "8px 16px", border: `1px solid ${COLORS.red}`, borderRadius: 6, background: "#fff", color: COLORS.red, fontWeight: 700, cursor: "pointer" }}>
                🗑 Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={busy}
              style={{ padding: "8px 16px", border: `1px solid ${COLORS.border}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 600 }}>
              Cancel
            </button>
            <button onClick={save} disabled={!valid || busy}
              style={{ padding: "8px 16px", border: "none", borderRadius: 6, background: valid && !busy ? COLORS.dark : "#ccc", color: "#fff", fontWeight: 700, cursor: valid && !busy ? "pointer" : "not-allowed" }}>
              {busy ? "Saving…" : creating ? "Create item" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RevStat({ label, value, muted, accent, big }) {
  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 18, fontWeight: 800, color: accent || (muted ? COLORS.muted : COLORS.text), fontFamily: "'DM Serif Display', serif" }}>{value}</div>
    </div>
  );
}

// ── Houseplants — Sales History tab ─────────────────────────────────────────
function HpHistoryTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const all = await srcPageAll(sb, "houseplant_sales_history", "period,qty_sold,sold_value,pot_size");
      // Group by month
      const byMonth = {};
      for (const r of all) {
        if (!byMonth[r.period]) byMonth[r.period] = { period: r.period, qty: 0, rev: 0, products: 0 };
        byMonth[r.period].qty += +r.qty_sold || 0;
        byMonth[r.period].rev += +r.sold_value || 0;
        byMonth[r.period].products += 1;
      }
      setRows(Object.values(byMonth).sort((a, b) => a.period.localeCompare(b.period)));
    })();
  }, [sb]);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 12 }}>
        Sales history · 17 months Jan 2025 – May 2026
      </div>
      <SimpleTable
        cols={["Month", "Products sold", "Units", "Revenue"]}
        aligns={["L", "R", "R", "R"]}
        rows={rows.map(r => [r.period, r.products, r.qty.toLocaleString(), fmtMoney(r.rev)])}
        totalRow={["TOTAL", rows.reduce((s,r)=>s+r.products,0), rows.reduce((s,r)=>s+r.qty,0).toLocaleString(), fmtMoney(rows.reduce((s,r)=>s+r.rev,0))]}
      />
    </div>
  );
}

// ── Houseplants — Sourcing tab ──────────────────────────────────────────────
// Groups catalog by acquisition_type: finished (sale-ready, arrives ~1 wk before
// sale) / liner (we grow it out) / propagate (in-house from cuttings/seed) / partner.
function HpSourcingTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows]   = useState([]);
  const [request, setReq] = useState(null);
  const [reqMode, setReqMode] = useState("liner"); // "liner" or "finished"
  const [editMode, setEditMode] = useState(false);
  const [detailItem, setDetailItem] = useState(null); // houseplant_catalog row opened in the detail modal
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [filterSize, setFilterSize] = useState("");
  const [sortKey, setSortKey] = useState("size"); // size | variety | qty | rev | broker

  useEffect(() => {
    if (!sb) return;
    sb.from("houseplant_catalog").select("*").eq("plan_id", plan.id).then(({ data }) => setRows(data || []));
  }, [sb, plan.id, tick]);

  // Search + size filter + sort, applied to each sourcing panel.
  function prep(items) {
    const q = search.trim().toLowerCase();
    const SORTS = {
      size:    bySizeThenDesc,
      variety: (a, b) => (a.description || "").localeCompare(b.description || ""),
      qty:     (a, b) => (+b.target_qty || 0) - (+a.target_qty || 0),
      rev:     (a, b) => ((+b.target_qty || 0) * (+b.target_price || 0)) - ((+a.target_qty || 0) * (+a.target_price || 0)),
      broker:  (a, b) => (a.supplier || "").localeCompare(b.supplier || "") || bySizeThenDesc(a, b),
    };
    return items
      .filter(i => (!q || (i.description || "").toLowerCase().includes(q)) && (!filterSize || i.pot_size === filterSize))
      .slice()
      .sort(SORTS[sortKey] || bySizeThenDesc);
  }

  // Sizes present, ordered for the detail modal's size picker
  const sizes = Array.from(new Set(rows.map(r => r.pot_size).filter(Boolean))).sort((a, b) => sizeRank(a) - sizeRank(b));

  // Persist a field change and update local state
  async function updateRow(id, updates) {
    // Smart default: if setting acquisition to finished and no arrival yet, suggest a Thursday
    const row = rows.find(r => r.id === id);
    if (updates.acquisition_type === "finished" && row && !row.arrival_date_target && !updates.arrival_date_target) {
      const [startMonth] = planMonthRange(plan);
      const qStart = new Date(`${plan.year}-${String(startMonth).padStart(2, "0")}-01`);
      const dow = qStart.getDay();
      const daysToMon = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
      qStart.setDate(qStart.getDate() + daysToMon - 4);
      updates.arrival_date_target = qStart.toISOString().slice(0, 10);
    }
    await sb.from("houseplant_catalog").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    // Auto-task generation when finished + arrival both set
    const updated = { ...(row || {}), ...updates };
    if (updated.acquisition_type === "finished" && updated.arrival_date_target) {
      await ensureFinishedReceivingTasks(sb, plan, updated);
    }
  }

  // Bucket by acquisition_type with fallback for un-tagged items
  // Sourcing only shows items the user has explicitly committed to (locked).
  // 'considered' and 'cancelled' items don't flow into the sourcing pipeline.
  const lockedRows     = rows.filter(r => r.status === "locked");
  const finishedItems  = lockedRows.filter(r => r.acquisition_type === "finished");
  const linerItems     = lockedRows.filter(r => r.acquisition_type === "liner");
  const propagateItems = lockedRows.filter(r => r.acquisition_type === "propagate");
  const partnerItems   = lockedRows.filter(r => r.acquisition_type === "partner");
  const untagged       = lockedRows.filter(r => !r.acquisition_type);

  function makeBrokerRequest(mode) {
    const planYear = plan.year;
    const [startMo, endMo] = planMonthRange(plan);
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const startMonth = MONTHS[startMo - 1];
    const endMonth   = MONTHS[endMo - 1];
    const rangeStr   = `${startMonth}–${endMonth}`;

    const isFinished = mode === "finished";
    const items = (isFinished ? finishedItems : linerItems).filter(r => r.target_qty > 0 && r.status !== "cancelled");
    const bySize = {};
    for (const i of items) {
      const k = i.pot_size || "—";
      if (!bySize[k]) bySize[k] = [];
      bySize[k].push(i);
    }

    let body = `INQUIRY · ${plan.name} · ${isFinished ? "FINISHED MATERIAL" : "LINERS (young plants for finishing)"}\n`;
    body += `From: Schlegel Greenhouse · 705 Sprague Rd, Indianapolis IN 46217\n`;
    body += `Contact: Paul Schlegel — (317) 784-6038 — pgs@schlegelgreenhouse.com\n\n`;
    body += `Sale window: ${startMonth} 1 – ${endMonth} 30, ${planYear}\n`;
    if (isFinished) {
      body += `Requested arrival: THURSDAY 4 days before each sale week (we quarantine + treat Thu–Sun, sell Monday).\n`;
      body += `(Per-variety arrival Thursdays listed inline below.)\n\n`;
      body += `Schlegel houseplant program: ~$210K ${rangeStr} revenue base, growing. Looking for sale-ready FINISHED material on a tight Thursday delivery window.\n\n`;
      body += `Substitution flexibility on cultivars, pot size ±1 step, arrival date ±5 days. Hard requirement on Thursday delivery (or earlier in the week).\n\n`;
    } else {
      // Liner arrival ~8-10 weeks before sale start
      const linerStartMo = ((startMo - 3 + 12) % 12) || 12;
      const linerArrivalStart = MONTHS[linerStartMo - 1] + " " + (linerStartMo > startMo ? planYear - 1 : planYear);
      const linerArrivalEnd = MONTHS[startMo - 1] + " " + planYear;
      body += `Requested liner arrival window: ${linerArrivalStart} – ${linerArrivalEnd} (8–10 weeks before sale start for finishing)\n\n`;
      body += `Schlegel houseplant program: ~$210K ${rangeStr} revenue base, growing. We commit early on liners, prefer reliable supply over best price, value advance notice on substitutions.\n\n`;
      body += `Substitution flexibility on cultivars, pot size ±1 step, arrival date ±2 weeks.\n\n`;
    }
    body += `═══════════════════════════════════════════════════════════\nREQUEST LIST\n═══════════════════════════════════════════════════════════\n`;
    for (const [size, list] of Object.entries(bySize).sort((a, b) => sizeRank(a[0]) - sizeRank(b[0]))) {
      body += `\n── ${size} POT ──\n`;
      const sorted = isFinished
        ? list.sort((a, b) => (a.arrival_date_target || "9999").localeCompare(b.arrival_date_target || "9999"))
        : list.sort((a, b) => (b.target_qty || 0) - (a.target_qty || 0));
      for (const i of sorted) {
        body += `  ${String(i.target_qty || "?").padStart(5)} · ${i.description}`;
        if (i.target_price) body += ` · target $${(+i.target_price).toFixed(2)}/ea`;
        if (isFinished && i.arrival_date_target) body += `  [arrive by ${i.arrival_date_target}]`;
        if (i.supplier) body += `  [preferred: ${i.supplier}]`;
        body += `\n`;
      }
    }
    body += `\n═══════════════════════════════════════════════════════════\n`;
    body += `Please confirm: availability + pricing + earliest ship date by variety.\n`;
    body += `Flag anything you can't supply so we can re-source.\n\nThanks,\nPaul\n`;
    setReq(body);
  }

  if (lockedRows.length === 0) {
    return (
      <div style={{ background: COLORS.card, border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: 40, textAlign: "center", color: COLORS.muted }}>
        No locked items yet. Lock items in the 🛒 Catalog tab first.<br />
        Sourcing only shows items you've committed to (status = locked) — splits by Finished / Liner / Propagate / Partner once you tag each with an acquisition type.
      </div>
    );
  }

  const finishedTotalRev = finishedItems.reduce((s, i) => s + (+i.target_qty || 0) * (+i.target_price || 0), 0);
  const linerTotalRev    = linerItems.reduce((s, i) => s + (+i.target_qty || 0) * (+i.target_price || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Banner + edit-mode toggle */}
      <div style={{ background: COLORS.dark, color: "#fff", borderRadius: 10, padding: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr) auto", gap: 12, alignItems: "center" }}>
        <Stat label="🛒 Finished items"  value={`${finishedItems.length} · ${fmtMoney(finishedTotalRev)}`} dark />
        <Stat label="🌱 Liner items"     value={`${linerItems.length} · ${fmtMoney(linerTotalRev)}`}      dark />
        <Stat label="🌿 Propagate items" value={propagateItems.length}                                    dark />
        <Stat label="Untagged"            value={untagged.length}                                          dark />
        <button onClick={() => setEditMode(!editMode)}
          style={{
            padding: "10px 16px", borderRadius: 6, border: "none", fontWeight: 800, fontSize: 12, cursor: "pointer",
            background: editMode ? COLORS.amber : COLORS.light, color: "#fff", whiteSpace: "nowrap",
          }}>
          {editMode ? "🔒 Lock edits" : "✏️ Edit mode"}
        </button>
      </div>

      {/* Search / filter / sort — applies to every panel below */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search variety…"
          style={{ flex: 2, minWidth: 200, padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }} />
        <select value={filterSize} onChange={e => setFilterSize(e.target.value)}
          style={{ padding: "8px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }}>
          <option value="">All sizes</option>
          {Array.from(new Set(lockedRows.map(r => r.pot_size).filter(Boolean))).sort((a, b) => sizeRank(a) - sizeRank(b)).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)}
          style={{ padding: "8px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 13 }}>
          <option value="size">Sort: Size</option>
          <option value="variety">Sort: Variety A–Z</option>
          <option value="qty">Sort: Target qty ↓</option>
          <option value="rev">Sort: Target rev ↓</option>
          <option value="broker">Sort: Broker</option>
        </select>
        {(search || filterSize) && (
          <button onClick={() => { setSearch(""); setFilterSize(""); }}
            style={{ padding: "8px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 6, background: "#fff", color: COLORS.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clear</button>
        )}
      </div>

      {/* Generate broker request */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: COLORS.dark }}>📤 Broker request generator</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
              Generate copy/paste-ready inquiries. Finished + Liner requests are written differently (timing + framing).
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setReqMode("finished"); makeBrokerRequest("finished"); }}
              style={{ padding: "10px 14px", borderRadius: 6, border: "none", background: ACQ_COLOR.finished, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              🛒 Finished ({finishedItems.length})
            </button>
            <button onClick={() => { setReqMode("liner"); makeBrokerRequest("liner"); }}
              style={{ padding: "10px 14px", borderRadius: 6, border: "none", background: ACQ_COLOR.liner, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
              🌱 Liner ({linerItems.length})
            </button>
          </div>
        </div>
        {request && (
          <>
            <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>
              Showing: <strong>{reqMode === "finished" ? "🛒 Finished" : "🌱 Liner"}</strong> request
            </div>
            <textarea readOnly value={request}
              style={{ width: "100%", minHeight: 320, padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontFamily: "monospace", fontSize: 12, lineHeight: 1.5, background: "#fafafa" }} />
          </>
        )}
      </div>

      {/* 🏷️ Untagged — must be classified first */}
      {untagged.length > 0 && (
        <div style={{ background: "#fff7e6", border: `2px solid ${COLORS.amber}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: COLORS.amber, marginBottom: 4 }}>
            🏷️ Classify these · {untagged.length} item(s) need an acquisition type
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
            Pick how each item comes in. Once tagged, they move to the matching panel below.
          </div>
          <SourcingTable
            items={prep(untagged)}
            updateRow={updateRow}
            showArrives={false}
            showSupplier={true}
            editMode={editMode}
            onOpen={setDetailItem}
          />
        </div>
      )}

      {/* 🛒 Finished Buy List — sorted by arrival */}
      {finishedItems.length > 0 && (
        <div style={{ background: COLORS.card, border: `2px solid ${ACQ_COLOR.finished}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: ACQ_COLOR.finished, marginBottom: 4 }}>
            🛒 Finished Buy List · {finishedItems.length} item(s)
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
            Sale-ready material. Arrives Thursday, quarantined + treated through weekend, on retail benches Monday. Receive / Treat / Move-to-retail tasks auto-generate.
          </div>
          <SourcingTable
            items={prep(finishedItems)}
            updateRow={updateRow}
            showArrives={true}
            showSupplier={true}
            editMode={editMode}
            onOpen={setDetailItem}
          />
        </div>
      )}

      {/* 🌱 Liner Buy List */}
      {linerItems.length > 0 && (
        <div style={{ background: COLORS.card, border: `2px solid ${ACQ_COLOR.liner}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: ACQ_COLOR.liner, marginBottom: 4 }}>
            🌱 Liner Buy List · {linerItems.length} item(s)
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
            Young plants we'll finish in-house. Order 8–10 weeks before sale start.
          </div>
          <SourcingTable items={prep(linerItems)} updateRow={updateRow} showArrives={false} showSupplier={true} editMode={editMode} onOpen={setDetailItem} />
        </div>
      )}

      {/* 🌿 Propagate (in-house) */}
      {propagateItems.length > 0 && (
        <div style={{ background: COLORS.card, border: `2px solid ${ACQ_COLOR.propagate}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: ACQ_COLOR.propagate, marginBottom: 4 }}>
            🌿 Propagate In-House · {propagateItems.length} item(s)
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
            Items we propagate from cuttings/seed. No broker required.
          </div>
          <SourcingTable items={prep(propagateItems)} updateRow={updateRow} showArrives={false} showSupplier={false} editMode={editMode} onOpen={setDetailItem} />
        </div>
      )}

      {/* 🤝 Partner */}
      {partnerItems.length > 0 && (
        <div style={{ background: COLORS.card, border: `2px solid ${ACQ_COLOR.partner}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: ACQ_COLOR.partner, marginBottom: 12 }}>
            🤝 Partner · {partnerItems.length} item(s)
          </div>
          <SourcingTable items={prep(partnerItems)} updateRow={updateRow} showArrives={false} showSupplier={true} editMode={editMode} onOpen={setDetailItem} />
        </div>
      )}

      {/* Item detail / edit / duplicate modal — same one used in the Catalog */}
      {detailItem && (
        <ItemDetailModal sb={sb} plan={plan} sizes={sizes}
          catalogRow={detailItem} fallback={{ description: detailItem.description, pot_size: detailItem.pot_size }}
          onClose={() => setDetailItem(null)}
          onChange={() => setTick(t => t + 1)} />
      )}
    </div>
  );
}

// Editable sourcing table — acquisition / arrival / supplier inline
function SourcingTable({ items, updateRow, showArrives, showSupplier, editMode, onOpen }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f3f5ef" }}>
            <th style={th}>Pot</th>
            <th style={th}>Variety</th>
            <th style={{...th, textAlign: "right"}}>Target qty</th>
            <th style={{...th, textAlign: "right"}}>Target $/ea</th>
            <th style={{...th, textAlign: "right"}}>Target rev</th>
            <th style={th}>Acquisition</th>
            {showArrives && <th style={th}>Arrives</th>}
            {showSupplier && <th style={th}>Supplier</th>}
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <td style={td}>{i.pot_size}</td>
              <td style={{...td, cursor: onOpen ? "pointer" : "default", textDecoration: onOpen ? "underline" : "none", textDecorationStyle: "dotted", textUnderlineOffset: 2}}
                onClick={() => onOpen?.(i)} title={onOpen ? "Open item details + notes" : undefined}>
                {i.description}
              </td>
              <td style={{...td, textAlign: "right", background: editMode ? "#fafdf7" : undefined}}>
                {editMode ? (
                  <input type="number" defaultValue={i.target_qty || ""}
                    onBlur={e => updateRow(i.id, { target_qty: e.target.value ? parseInt(e.target.value) : null })}
                    style={{ width: 70, padding: "3px 6px", textAlign: "right", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }} />
                ) : ((+i.target_qty || 0).toLocaleString() || "—")}
              </td>
              <td style={{...td, textAlign: "right", background: editMode ? "#fafdf7" : undefined}}>
                {editMode ? (
                  <input type="number" step="0.01" defaultValue={i.target_price || ""}
                    onBlur={e => updateRow(i.id, { target_price: e.target.value ? parseFloat(e.target.value) : null })}
                    style={{ width: 70, padding: "3px 6px", textAlign: "right", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 12 }} />
                ) : (i.target_price ? "$" + (+i.target_price).toFixed(2) : "—")}
              </td>
              <td style={{...td, textAlign: "right", fontWeight: 700}}>{i.target_qty && i.target_price ? fmtMoney(i.target_qty * i.target_price) : "—"}</td>
              <td style={{...td, background: editMode ? "#fafdf7" : undefined}}>
                {editMode ? (
                  <select value={i.acquisition_type || ""}
                    onChange={e => updateRow(i.id, { acquisition_type: e.target.value || null })}
                    style={{ padding: "4px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11,
                      background: ACQ_COLOR[i.acquisition_type] ? ACQ_COLOR[i.acquisition_type] + "22" : "#fff",
                      color: ACQ_COLOR[i.acquisition_type] || COLORS.text,
                      fontWeight: i.acquisition_type ? 700 : 400,
                    }}>
                    <option value="">— pick —</option>
                    <option value="finished">🛒 Finished</option>
                    <option value="liner">🌱 Liner</option>
                    <option value="propagate">🌿 Propagate</option>
                    <option value="partner">🤝 Partner</option>
                  </select>
                ) : (i.acquisition_type ? (
                  <span style={{ color: ACQ_COLOR[i.acquisition_type], fontWeight: 700, fontSize: 11 }}>{ACQ_LABEL[i.acquisition_type]}</span>
                ) : <span style={{ color: COLORS.muted }}>—</span>)}
              </td>
              {showArrives && (
                <td style={{...td, background: editMode ? "#fafdf7" : undefined}}>
                  {editMode && i.acquisition_type === "finished" ? (
                    <input type="date" value={i.arrival_date_target || ""}
                      onChange={e => updateRow(i.id, { arrival_date_target: e.target.value || null })}
                      style={{ width: 130, padding: "3px 4px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11 }} />
                  ) : (i.arrival_date_target ? <span style={{ fontWeight: 600 }}>{i.arrival_date_target}</span> : <span style={{ color: COLORS.muted }}>—</span>)}
                </td>
              )}
              {showSupplier && (
                <td style={{...td, background: editMode ? "#fafdf7" : undefined}}>
                  {editMode ? (
                    <input type="text" defaultValue={i.supplier || ""}
                      onBlur={e => updateRow(i.id, { supplier: e.target.value || null })}
                      placeholder="—"
                      style={{ width: 120, padding: "3px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11 }} />
                  ) : (i.supplier || <span style={{ color: COLORS.muted }}>—</span>)}
                </td>
              )}
              <td style={td}>{i.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Houseplants — Insights tab (YoY visualizations) ────────────────────────
// ── Houseplants — Presentation tab ──────────────────────────────────────────
// Slide-by-slide meeting kickoff. Walk through each year's sales:
//   Slide 1: Year overview (totals, growth vs prior)
//   Slide 2: Top 10 items that year
//   Slide 3: Top sizes that year
//   Slide 4: Q1 only (the quarter we're planning)
//   Slide 5: Items grown that year NOT in 2026 — the "should we bring back?" list
// Repeat for each year. Then closing trends slide.
function HpPresentationTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slideIdx, setSlideIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      const all = await srcPageAll(sb, "houseplant_sales_history", "period,description,pot_size,qty_sold,sold_value");
      setRows(all);
      setLoading(false);
    })();
  }, [sb]);

  // Build slides once data is loaded
  const slides = useMemo(() => {
    if (rows.length === 0) return [];
    // Group by year
    const years = Array.from(new Set(rows.map(r => (r.period || "").slice(0, 4)).filter(Boolean))).sort();
    const [winStart, winEnd] = planMonthRange(plan);
    const winLabel = planRangeLabel(plan);
    const moStart = String(winStart).padStart(2, "0");
    const moEnd   = String(winEnd).padStart(2, "0");

    // Build set of (pot, normDesc) sold in plan-window of the planYear-1 (i.e., 2026)
    const recentYear = String(plan.year - 1); // 2026 if plan year=2027
    const recentKeys = new Set();
    for (const r of rows) {
      if ((r.period || "").startsWith(recentYear)) {
        recentKeys.add(`${r.pot_size}|${normalizeDesc(r.description)}`);
      }
    }

    const out = [];
    out.push({ kind: "intro", title: `${plan.name} — Sales Recap`, sub: `${years.length} years of history · ${years[0]} → ${years[years.length - 1]}` });

    // Trends slide first (so it's the lead-in)
    const yearTotals = years.map(y => {
      const rs = rows.filter(r => (r.period || "").startsWith(y));
      const qty = rs.reduce((s, r) => s + (+r.qty_sold || 0), 0);
      const rev = rs.reduce((s, r) => s + (+r.sold_value || 0), 0);
      return { year: y, qty, rev };
    });
    out.push({ kind: "trend", title: "Revenue + units by year", data: yearTotals });

    // Per-year set
    for (const yr of years) {
      const yrRows = rows.filter(r => (r.period || "").startsWith(yr));
      const yrQty = yrRows.reduce((s, r) => s + (+r.qty_sold || 0), 0);
      const yrRev = yrRows.reduce((s, r) => s + (+r.sold_value || 0), 0);
      const prevTotals = yearTotals.find(t => t.year === String(parseInt(yr) - 1));
      const growth = prevTotals && prevTotals.rev > 0 ? ((yrRev - prevTotals.rev) / prevTotals.rev * 100) : null;
      out.push({ kind: "year_overview", year: yr, qty: yrQty, rev: yrRev, growthVsPrior: growth });

      // Top 10 items by revenue (full year)
      const byItem = {};
      for (const r of yrRows) {
        const k = `${r.pot_size}|${normalizeDesc(r.description)}`;
        if (!byItem[k]) byItem[k] = { desc: r.description, pot_size: r.pot_size, qty: 0, rev: 0 };
        byItem[k].qty += +r.qty_sold || 0;
        byItem[k].rev += +r.sold_value || 0;
      }
      const top10 = Object.values(byItem).sort((a, b) => b.rev - a.rev).slice(0, 10);
      out.push({ kind: "top_items", year: yr, scope: "Full year", items: top10 });

      // Top sizes (full year)
      const bySize = {};
      for (const r of yrRows) {
        const k = r.pot_size || "(unknown)";
        if (!bySize[k]) bySize[k] = { size: k, qty: 0, rev: 0, items: new Set() };
        bySize[k].qty += +r.qty_sold || 0;
        bySize[k].rev += +r.sold_value || 0;
        bySize[k].items.add(`${r.pot_size}|${normalizeDesc(r.description)}`);
      }
      const topSizes = Object.values(bySize)
        .map(s => ({ ...s, items: s.items.size }))
        .sort((a, b) => b.rev - a.rev)
        .slice(0, 8);
      out.push({ kind: "top_sizes", year: yr, sizes: topSizes });

      // Q1 (or whatever quarter the plan covers) for that year
      const q1Rows = yrRows.filter(r => {
        const mo = (r.period || "").slice(5, 7);
        return mo >= moStart && mo <= moEnd;
      });
      const q1Qty = q1Rows.reduce((s, r) => s + (+r.qty_sold || 0), 0);
      const q1Rev = q1Rows.reduce((s, r) => s + (+r.sold_value || 0), 0);
      const byItemQ1 = {};
      for (const r of q1Rows) {
        const k = `${r.pot_size}|${normalizeDesc(r.description)}`;
        if (!byItemQ1[k]) byItemQ1[k] = { desc: r.description, pot_size: r.pot_size, qty: 0, rev: 0 };
        byItemQ1[k].qty += +r.qty_sold || 0;
        byItemQ1[k].rev += +r.sold_value || 0;
      }
      const top10Q1 = Object.values(byItemQ1).sort((a, b) => b.rev - a.rev).slice(0, 10);
      out.push({ kind: "quarter_view", year: yr, windowLabel: winLabel, qty: q1Qty, rev: q1Rev, items: top10Q1 });

      // "Sold that year, NOT in recent year (2026)" — the bring-back candidates
      // Skip this slide for the recentYear itself (would always be empty)
      if (yr !== recentYear) {
        const droppedFromYear = Object.values(byItem)
          .filter(it => {
            const key = `${it.pot_size}|${normalizeDesc(it.desc)}`;
            return !recentKeys.has(key);
          })
          .sort((a, b) => b.rev - a.rev)
          .slice(0, 12);
        if (droppedFromYear.length > 0) {
          out.push({ kind: "dropped", year: yr, recentYear, items: droppedFromYear });
        }
      }
    }
    out.push({ kind: "closing", title: "Discussion", subtitle: "What stays, what comes back, what's new?" });
    return out;
  }, [rows, plan]);

  // Auto-play timer
  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(() => setSlideIdx(i => Math.min(slides.length - 1, i + 1)), 8000);
    return () => clearTimeout(t);
  }, [autoPlay, slideIdx, slides.length]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowRight" || e.key === " ") setSlideIdx(i => Math.min(slides.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setSlideIdx(i => Math.max(0, i - 1));
      else if (e.key === "Escape" && fullscreen) setFullscreen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, fullscreen]);

  if (loading) return <div style={{ padding: 20, color: COLORS.muted }}>Loading presentation…</div>;
  if (slides.length === 0) return <div style={{ padding: 20, color: COLORS.muted }}>No sales data available.</div>;

  const slide = slides[slideIdx];
  const containerStyle = fullscreen
    ? { position: "fixed", inset: 0, zIndex: 200, background: COLORS.dark, display: "flex", flexDirection: "column" }
    : { background: COLORS.dark, borderRadius: 10, padding: 0, display: "flex", flexDirection: "column", minHeight: 600 };

  return (
    <div style={containerStyle}>
      {/* Header bar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.15)", color: "#c8e6b8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7 }}>
          Slide {slideIdx + 1} / {slides.length} · {plan.name}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setAutoPlay(!autoPlay)}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: autoPlay ? COLORS.light : "transparent", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
            {autoPlay ? "⏸ Pause auto" : "▶ Auto-play"}
          </button>
          <button onClick={() => setFullscreen(!fullscreen)}
            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 11 }}>
            {fullscreen ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
          </button>
        </div>
      </div>

      {/* Slide body */}
      <div style={{ flex: 1, padding: fullscreen ? "60px 80px" : "40px 40px", overflowY: "auto" }}>
        <SlideContent slide={slide} />
      </div>

      {/* Navigation footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#c8e6b8" }}>
        <button onClick={() => setSlideIdx(i => Math.max(0, i - 1))} disabled={slideIdx === 0}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: slideIdx === 0 ? "rgba(255,255,255,0.3)" : "#fff", cursor: slideIdx === 0 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>
          ← Previous
        </button>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => setSlideIdx(i)}
              style={{ width: i === slideIdx ? 24 : 8, height: 6, borderRadius: 3, background: i === slideIdx ? "#7fb069" : "rgba(255,255,255,0.3)", cursor: "pointer", transition: "width 0.2s" }} />
          ))}
        </div>
        <button onClick={() => setSlideIdx(i => Math.min(slides.length - 1, i + 1))} disabled={slideIdx === slides.length - 1}
          style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: slideIdx === slides.length - 1 ? "rgba(255,255,255,0.3)" : "#fff", cursor: slideIdx === slides.length - 1 ? "default" : "pointer", fontWeight: 700, fontSize: 13 }}>
          Next →
        </button>
      </div>
    </div>
  );
}

function SlideContent({ slide }) {
  if (slide.kind === "intro") {
    return (
      <div style={{ color: "#fff", textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 60, marginBottom: 24 }}>🪴</div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 64, color: "#c8e6b8", marginBottom: 12, lineHeight: 1.1 }}>{slide.title}</div>
        <div style={{ fontSize: 22, color: "#7fb069", marginTop: 20 }}>{slide.sub}</div>
        <div style={{ fontSize: 15, color: "rgba(200, 230, 184, 0.6)", marginTop: 50 }}>Press → or Space to advance · ← to go back · F for fullscreen</div>
      </div>
    );
  }
  if (slide.kind === "closing") {
    return (
      <div style={{ color: "#fff", textAlign: "center", paddingTop: 100 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 72, color: "#c8e6b8", marginBottom: 24 }}>{slide.title}</div>
        <div style={{ fontSize: 28, color: "#7fb069" }}>{slide.subtitle}</div>
      </div>
    );
  }
  if (slide.kind === "trend") {
    const max = Math.max(...slide.data.map(d => d.rev));
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#c8e6b8", marginBottom: 30 }}>{slide.title}</div>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-end", justifyContent: "center", minHeight: 260 }}>
          {slide.data.map(d => (
            <div key={d.year} style={{ flex: 1, maxWidth: 140, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#7fb069", marginBottom: 4 }}>{fmtMoney(d.rev)}</div>
              <div style={{ background: "#7fb069", height: (d.rev / max) * 220, borderRadius: "6px 6px 0 0", margin: "0 auto", maxWidth: 90 }} />
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 8 }}>{d.year}</div>
              <div style={{ fontSize: 12, color: "rgba(200, 230, 184, 0.7)", marginTop: 2 }}>{d.qty.toLocaleString()} units</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === "year_overview") {
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 88, color: "#c8e6b8", marginBottom: 20, textAlign: "center" }}>{slide.year}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30, marginTop: 60 }}>
          <BigStat label="Revenue" value={fmtMoney(slide.rev)} />
          <BigStat label="Units sold" value={slide.qty.toLocaleString()} />
          <BigStat label="Vs prior year" value={slide.growthVsPrior != null ? `${slide.growthVsPrior >= 0 ? "+" : ""}${slide.growthVsPrior.toFixed(1)}%` : "—"}
            color={slide.growthVsPrior == null ? "#7fb069" : slide.growthVsPrior > 0 ? "#7fb069" : "#e89a3a"} />
        </div>
      </div>
    );
  }
  if (slide.kind === "top_items") {
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#c8e6b8", marginBottom: 6 }}>{slide.year} — Top 10 by revenue</div>
        <div style={{ fontSize: 15, color: "rgba(200, 230, 184, 0.7)", marginBottom: 20 }}>{slide.scope}</div>
        <table style={{ width: "100%", fontSize: 15, color: "#fff" }}>
          <tbody>
            {slide.items.map((i, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <td style={{ padding: "8px 0", width: 30, color: "#7fb069", fontWeight: 800 }}>{idx + 1}.</td>
                <td style={{ padding: "8px 0", width: 60, color: "rgba(200, 230, 184, 0.7)" }}>{i.pot_size}</td>
                <td style={{ padding: "8px 0" }}>{i.desc}</td>
                <td style={{ padding: "8px 0", textAlign: "right", color: "#c8e6b8" }}>{i.qty.toLocaleString()}</td>
                <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 800, color: "#fff" }}>{fmtMoney(i.rev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (slide.kind === "top_sizes") {
    const max = Math.max(...slide.sizes.map(s => s.rev));
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#c8e6b8", marginBottom: 24 }}>{slide.year} — Top sizes</div>
        <div style={{ display: "grid", gap: 10 }}>
          {slide.sizes.map(s => (
            <div key={s.size} style={{ display: "grid", gridTemplateColumns: "80px 1fr 130px 100px", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#c8e6b8" }}>{s.size}</div>
              <div style={{ height: 28, background: "rgba(127, 176, 105, 0.2)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(s.rev / max) * 100}%`, background: "#7fb069" }} />
              </div>
              <div style={{ textAlign: "right", fontWeight: 800, fontSize: 16 }}>{fmtMoney(s.rev)}</div>
              <div style={{ textAlign: "right", color: "rgba(200, 230, 184, 0.7)", fontSize: 13 }}>{s.qty.toLocaleString()} units · {s.items} SKUs</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === "quarter_view") {
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, color: "#c8e6b8", marginBottom: 6 }}>{slide.year} — {slide.windowLabel || `Q${slide.quarter}`} only</div>
        <div style={{ fontSize: 16, color: "rgba(200, 230, 184, 0.7)", marginBottom: 20 }}>
          {fmtMoney(slide.rev)} · {slide.qty.toLocaleString()} units
        </div>
        <table style={{ width: "100%", fontSize: 14, color: "#fff" }}>
          <tbody>
            {slide.items.map((i, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <td style={{ padding: "6px 0", width: 28, color: "#7fb069", fontWeight: 800 }}>{idx + 1}.</td>
                <td style={{ padding: "6px 0", width: 60, color: "rgba(200, 230, 184, 0.7)" }}>{i.pot_size}</td>
                <td style={{ padding: "6px 0" }}>{i.desc}</td>
                <td style={{ padding: "6px 0", textAlign: "right", color: "#c8e6b8" }}>{i.qty.toLocaleString()}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800 }}>{fmtMoney(i.rev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (slide.kind === "dropped") {
    return (
      <div style={{ color: "#fff" }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: "#e89a3a", marginBottom: 6 }}>
          ⚠ {slide.year} → dropped before {slide.recentYear}
        </div>
        <div style={{ fontSize: 15, color: "rgba(200, 230, 184, 0.8)", marginBottom: 20 }}>
          Items sold in {slide.year} we didn't carry in {slide.recentYear}. Worth re-evaluating.
        </div>
        <table style={{ width: "100%", fontSize: 14, color: "#fff" }}>
          <tbody>
            {slide.items.map((i, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <td style={{ padding: "6px 0", width: 60, color: "rgba(200, 230, 184, 0.7)" }}>{i.pot_size}</td>
                <td style={{ padding: "6px 0" }}>{i.desc}</td>
                <td style={{ padding: "6px 0", textAlign: "right", color: "#c8e6b8" }}>{i.qty.toLocaleString()}</td>
                <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 800 }}>{fmtMoney(i.rev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

function BigStat({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 14, color: "rgba(200, 230, 184, 0.7)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 56, color: color || "#c8e6b8", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function HpInsightsTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [chart, setChart]     = useState("size");     // "size" | "variety" | "monthly" | "genus"
  const [metric, setMetric]   = useState("revenue");  // "revenue" | "qty"
  const [filterSize, setFilterSize]   = useState("all");
  const [filterGenus, setFilterGenus] = useState("all");
  const [topN, setTopN]       = useState(20);
  const [aliases, setAliases] = useState([]);

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      const all = await srcPageAll(sb, "houseplant_sales_history", "period,description,pot_size,qty_sold,sold_value");
      const { data: aliasData } = await sb.from("houseplant_merge_aliases").select("*");
      setAliases(aliasData || []);
      setRows(all);
      setLoading(false);
    })();
  }, [sb, plan.id]);

  if (loading) return <div style={{ padding: 20, color: COLORS.muted }}>Loading insights…</div>;
  if (rows.length === 0) return <div style={{ padding: 20, color: COLORS.muted }}>No sales history.</div>;

  // Build alias map
  const aliasMap = {};
  for (const a of aliases) {
    aliasMap[`${a.alias_pot_size}|${normalizeDesc(a.alias_desc)}`] = { desc: a.canonical_desc, pot_size: a.canonical_pot_size };
  }

  // Resolve each row through alias + normalize, and tag year
  const resolved = rows.map(r => {
    const key = `${r.pot_size}|${normalizeDesc(r.description)}`;
    const al = aliasMap[key];
    const desc = al?.desc || r.description;
    const pot_size = al?.pot_size || r.pot_size;
    const year = (r.period || "").slice(0, 4);
    return {
      year, desc, pot_size,
      norm: normalizeDesc(desc),
      genus: (normalizeDesc(desc).split(/\s+/)[0] || "").toUpperCase(),
      qty: +r.qty_sold || 0, rev: +r.sold_value || 0,
      period: r.period,
    };
  });

  // Apply filters
  const filtered = resolved.filter(r => {
    if (filterSize !== "all" && r.pot_size !== filterSize) return false;
    if (filterGenus !== "all" && r.genus !== filterGenus) return false;
    return true;
  });

  const sizes = Array.from(new Set(resolved.map(r => r.pot_size).filter(Boolean))).sort();
  const generaList = Array.from(new Set(resolved.map(r => r.genus).filter(Boolean))).sort();

  // Year list (for x-axis comparisons)
  const years = Array.from(new Set(filtered.map(r => r.year).filter(Boolean))).sort();

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Toolbar */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>Chart</div>
        {[
          { id: "size",    label: "📦 By pot size" },
          { id: "variety", label: "🪴 By variety (top N)" },
          { id: "genus",   label: "🌿 By genus" },
          { id: "monthly", label: "📅 Monthly trend" },
        ].map(c => (
          <button key={c.id} onClick={() => setChart(c.id)}
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 700,
              background: chart === c.id ? COLORS.dark : "#f3f5ef",
              color: chart === c.id ? "#fff" : COLORS.text,
              border: `1px solid ${chart === c.id ? COLORS.dark : COLORS.border}`,
              borderRadius: 14, cursor: "pointer",
            }}>{c.label}</button>
        ))}

        <div style={{ width: 1, height: 24, background: COLORS.border }} />

        <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>Metric</div>
        {[
          { id: "revenue", label: "$ Revenue" },
          { id: "qty",     label: "# Units" },
        ].map(m => (
          <button key={m.id} onClick={() => setMetric(m.id)}
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 700,
              background: metric === m.id ? COLORS.light : "#f3f5ef",
              color: metric === m.id ? "#fff" : COLORS.text,
              border: `1px solid ${metric === m.id ? COLORS.light : COLORS.border}`,
              borderRadius: 14, cursor: "pointer",
            }}>{m.label}</button>
        ))}

        <div style={{ width: 1, height: 24, background: COLORS.border }} />

        <select value={filterSize} onChange={e => setFilterSize(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12 }}>
          <option value="all">All sizes</option>
          {sizes.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select value={filterGenus} onChange={e => setFilterGenus(e.target.value)}
          style={{ padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12 }}>
          <option value="all">All genera</option>
          {generaList.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {chart === "variety" && (
          <select value={topN} onChange={e => setTopN(parseInt(e.target.value))}
            style={{ padding: "6px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12 }}>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={30}>Top 30</option>
            <option value={50}>Top 50</option>
          </select>
        )}
      </div>

      {/* Render chart */}
      {chart === "size" && (
        <SizeYoyChart filtered={filtered} years={years} metric={metric} />
      )}
      {chart === "variety" && (
        <VarietyYoyChart filtered={filtered} years={years} metric={metric} topN={topN} />
      )}
      {chart === "genus" && (
        <GenusYoyChart filtered={filtered} years={years} metric={metric} />
      )}
      {chart === "monthly" && (
        <MonthlyTrendChart filtered={filtered} metric={metric} />
      )}
    </div>
  );
}

// Color per year — cycles through these
const YEAR_COLORS = ["#7fb069", "#1e2d1a", "#e89a3a", "#1976d2", "#5e35b1", "#d94f3d"];

function SizeYoyChart({ filtered, years, metric }) {
  // Aggregate by (pot_size, year)
  const agg = {};
  for (const r of filtered) {
    if (!agg[r.pot_size]) agg[r.pot_size] = {};
    if (!agg[r.pot_size][r.year]) agg[r.pot_size][r.year] = { qty: 0, rev: 0 };
    agg[r.pot_size][r.year].qty += r.qty;
    agg[r.pot_size][r.year].rev += r.rev;
  }
  // Sort sizes by total of most recent year metric desc
  const latestYr = years[years.length - 1];
  const sizes = Object.keys(agg).filter(Boolean).sort((a, b) => (agg[b][latestYr]?.[metric === "revenue" ? "rev" : "qty"] || 0) - (agg[a][latestYr]?.[metric === "revenue" ? "rev" : "qty"] || 0));

  return (
    <ChartCard title={`Pot size — ${metric === "revenue" ? "revenue" : "units"} by year`} subtitle={`Compare across ${years.join(" / ")}. Click metric or filter above to slice.`}>
      <GroupedBarChart
        categories={sizes}
        series={years.map((y, i) => ({
          name: y,
          color: YEAR_COLORS[i % YEAR_COLORS.length],
          data: sizes.map(s => agg[s][y]?.[metric === "revenue" ? "rev" : "qty"] || 0),
        }))}
        metric={metric}
      />
    </ChartCard>
  );
}

function GenusYoyChart({ filtered, years, metric }) {
  const agg = {};
  for (const r of filtered) {
    if (!agg[r.genus]) agg[r.genus] = {};
    if (!agg[r.genus][r.year]) agg[r.genus][r.year] = { qty: 0, rev: 0 };
    agg[r.genus][r.year].qty += r.qty;
    agg[r.genus][r.year].rev += r.rev;
  }
  const latestYr = years[years.length - 1];
  const genera = Object.keys(agg).filter(Boolean)
    .sort((a, b) => (agg[b][latestYr]?.[metric === "revenue" ? "rev" : "qty"] || 0) - (agg[a][latestYr]?.[metric === "revenue" ? "rev" : "qty"] || 0))
    .slice(0, 20);
  return (
    <ChartCard title={`Genus — ${metric === "revenue" ? "revenue" : "units"} by year`} subtitle={`Top 20 genera. Filter to a single size above to see size-specific.`}>
      <GroupedBarChart
        categories={genera}
        series={years.map((y, i) => ({
          name: y,
          color: YEAR_COLORS[i % YEAR_COLORS.length],
          data: genera.map(g => agg[g][y]?.[metric === "revenue" ? "rev" : "qty"] || 0),
        }))}
        metric={metric}
      />
    </ChartCard>
  );
}

function VarietyYoyChart({ filtered, years, metric, topN }) {
  // Aggregate by (norm desc, pot_size, year)
  const agg = {};
  const labelMap = {};
  for (const r of filtered) {
    const key = `${r.pot_size}|${r.norm}`;
    if (!agg[key]) agg[key] = {};
    if (!labelMap[key]) labelMap[key] = `${r.pot_size} · ${r.desc.length > 32 ? r.desc.slice(0, 30) + "…" : r.desc}`;
    if (!agg[key][r.year]) agg[key][r.year] = { qty: 0, rev: 0 };
    agg[key][r.year].qty += r.qty;
    agg[key][r.year].rev += r.rev;
  }
  const latestYr = years[years.length - 1];
  const sortKey = metric === "revenue" ? "rev" : "qty";
  const ordered = Object.keys(agg).sort((a, b) => (agg[b][latestYr]?.[sortKey] || 0) - (agg[a][latestYr]?.[sortKey] || 0)).slice(0, topN);
  const labels = ordered.map(k => labelMap[k]);

  return (
    <ChartCard title={`Top ${topN} varieties — ${metric === "revenue" ? "revenue" : "units"} by year`} subtitle="Sorted by most recent year. Negative YoY items show smaller right bar.">
      <GroupedBarChart
        categories={labels}
        series={years.map((y, i) => ({
          name: y, color: YEAR_COLORS[i % YEAR_COLORS.length],
          data: ordered.map(k => agg[k][y]?.[sortKey] || 0),
        }))}
        metric={metric}
        horizontal
      />
    </ChartCard>
  );
}

function MonthlyTrendChart({ filtered, metric }) {
  // x = month-of-year (1-12), series = year
  const agg = {};
  for (const r of filtered) {
    if (!r.period) continue;
    const yr = r.period.slice(0, 4);
    const mo = parseInt(r.period.slice(5, 7));
    if (!agg[yr]) agg[yr] = {};
    if (!agg[yr][mo]) agg[yr][mo] = { qty: 0, rev: 0 };
    agg[yr][mo].qty += r.qty;
    agg[yr][mo].rev += r.rev;
  }
  const years = Object.keys(agg).sort();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const series = years.map((y, i) => ({
    name: y, color: YEAR_COLORS[i % YEAR_COLORS.length],
    data: months.map(m => agg[y][m]?.[metric === "revenue" ? "rev" : "qty"] || 0),
  }));
  return (
    <ChartCard title={`Monthly trend — ${metric === "revenue" ? "revenue" : "units"} by year`} subtitle="Same months overlaid across years to spot seasonal patterns.">
      <LineChart categories={monthLabels} series={series} metric={metric} />
    </ChartCard>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: COLORS.dark }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function fmtAxisVal(v, metric) {
  if (metric === "revenue") {
    if (v >= 1000000) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1000) return "$" + (v / 1000).toFixed(0) + "k";
    return "$" + Math.round(v);
  }
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return Math.round(v).toLocaleString();
}

function GroupedBarChart({ categories, series, metric, horizontal }) {
  if (categories.length === 0) return <div style={{ color: COLORS.muted, fontSize: 12 }}>No data for these filters.</div>;
  // Compute max across all series
  let max = 0;
  for (const s of series) for (const v of s.data) if (v > max) max = v;
  if (max === 0) max = 1;

  const barHeight = horizontal ? Math.max(18, Math.min(28, 320 / Math.max(categories.length, 1))) : 0;
  const seriesCount = series.length;

  if (horizontal) {
    // Horizontal: label column + bars to the right
    const chartWidth = 600;
    const labelWidth = 220;
    const barAreaWidth = chartWidth - labelWidth - 80;
    const height = categories.length * (barHeight * seriesCount + 8) + 30;
    return (
      <div style={{ overflowX: "auto" }}>
        <svg width={chartWidth} height={height} style={{ display: "block" }}>
          {categories.map((cat, i) => {
            const groupY = 10 + i * (barHeight * seriesCount + 8);
            return (
              <g key={i}>
                <text x={labelWidth - 6} y={groupY + (barHeight * seriesCount) / 2 + 4} fontSize="11" textAnchor="end" fill={COLORS.text}>
                  {cat}
                </text>
                {series.map((s, si) => {
                  const v = s.data[i] || 0;
                  const w = (v / max) * barAreaWidth;
                  return (
                    <g key={si}>
                      <rect x={labelWidth} y={groupY + si * barHeight} width={Math.max(0, w)} height={barHeight - 2} fill={s.color} />
                      <text x={labelWidth + w + 4} y={groupY + si * barHeight + barHeight - 5} fontSize="10" fill={COLORS.muted}>
                        {fmtAxisVal(v, metric)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <ChartLegend series={series} />
      </div>
    );
  }

  // Vertical bars: groups across X
  const chartWidth = Math.max(600, categories.length * (seriesCount * 18 + 24));
  const chartHeight = 300;
  const padL = 60, padR = 20, padT = 20, padB = 60;
  const plotW = chartWidth - padL - padR;
  const plotH = chartHeight - padT - padB;
  const groupWidth = plotW / categories.length;
  const barWidth = (groupWidth * 0.7) / seriesCount;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={chartWidth} height={chartHeight} style={{ display: "block" }}>
        {/* Y axis grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const y = padT + plotH * (1 - p);
          return (
            <g key={p}>
              <line x1={padL} y1={y} x2={chartWidth - padR} y2={y} stroke="#eee" />
              <text x={padL - 6} y={y + 4} fontSize="10" textAnchor="end" fill={COLORS.muted}>
                {fmtAxisVal(max * p, metric)}
              </text>
            </g>
          );
        })}
        {categories.map((cat, i) => {
          const groupX = padL + i * groupWidth + groupWidth * 0.15;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = s.data[i] || 0;
                const h = (v / max) * plotH;
                const x = groupX + si * barWidth;
                const y = padT + plotH - h;
                return <rect key={si} x={x} y={y} width={barWidth - 2} height={Math.max(0, h)} fill={s.color} />;
              })}
              <text x={padL + i * groupWidth + groupWidth / 2} y={chartHeight - padB + 16} fontSize="10" textAnchor="middle" fill={COLORS.text} transform={`rotate(-25, ${padL + i * groupWidth + groupWidth / 2}, ${chartHeight - padB + 16})`}>
                {cat}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartLegend series={series} />
    </div>
  );
}

function LineChart({ categories, series, metric }) {
  if (categories.length === 0) return <div style={{ color: COLORS.muted, fontSize: 12 }}>No data.</div>;
  let max = 0;
  for (const s of series) for (const v of s.data) if (v > max) max = v;
  if (max === 0) max = 1;
  const chartWidth = 720, chartHeight = 320;
  const padL = 60, padR = 20, padT = 20, padB = 40;
  const plotW = chartWidth - padL - padR;
  const plotH = chartHeight - padT - padB;
  const stepX = plotW / (categories.length - 1 || 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={chartWidth} height={chartHeight} style={{ display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const y = padT + plotH * (1 - p);
          return (
            <g key={p}>
              <line x1={padL} y1={y} x2={chartWidth - padR} y2={y} stroke="#eee" />
              <text x={padL - 6} y={y + 4} fontSize="10" textAnchor="end" fill={COLORS.muted}>{fmtAxisVal(max * p, metric)}</text>
            </g>
          );
        })}
        {categories.map((c, i) => (
          <text key={i} x={padL + i * stepX} y={chartHeight - padB + 16} fontSize="10" textAnchor="middle" fill={COLORS.text}>{c}</text>
        ))}
        {series.map((s, si) => {
          const points = s.data.map((v, i) => {
            const x = padL + i * stepX;
            const y = padT + plotH - (v / max) * plotH;
            return `${x},${y}`;
          }).join(" ");
          return (
            <g key={si}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" points={points} />
              {s.data.map((v, i) => {
                const x = padL + i * stepX;
                const y = padT + plotH - (v / max) * plotH;
                return <circle key={i} cx={x} cy={y} r="3" fill={s.color} />;
              })}
            </g>
          );
        })}
      </svg>
      <ChartLegend series={series} />
    </div>
  );
}

function ChartLegend({ series }) {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, justifyContent: "center" }}>
      {series.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span style={{ width: 12, height: 12, background: s.color, display: "inline-block", borderRadius: 2 }} />
          <span style={{ color: COLORS.text, fontWeight: 600 }}>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sourcing tab — cross-broker price comparison + per-supplier broker choice ─
// Data comes from broker_prices (parsed from Ball/EHR/Express quote workbooks via
// scripts/parse_broker_quotes.js). Landed cost = plant + royalty + freight (no tag),
// with EHR's negotiated volume-tier + discount baked in. Match grain: supplier → form → variety.
const SRC_SEASON = "2026-2027";
const SRC_BROKERS = ["Ball", "EHR", "Express"];
const SRC_SUPPLIER_LABEL = {
  Dummen: "Dümmen Orange", Danziger: "Danziger", Darwin: "Darwin Perennials",
  Syngenta: "Syngenta", Beekenkamp: "Beekenkamp", PlantSource: "Plant Source Int'l",
  QualityCuttings: "Quality Cuttings", GreenCircle: "Green Circle Growers",
  Raker: "Raker-Roberta's", Pell: "Pell", Walters: "Walters Gardens",
  CreekHill: "Creek Hill", EmeraldCoast: "Emerald Coast", GardenSolutions: "Garden Solutions",
  Hishtil: "Hishtil",
};
const SRC_FORM_LABEL = {
  urc: "URC · unrooted", callused: "Callused", liner: "Liner", plug: "Plug",
  rooted: "Rooted cutting", bareroot: "Bareroot", prefinished: "Prefinished",
  urc_autostix: "URC · AutoStix", other: "Other",
};
const SRC_BROKER_NOTE = {
  Ball: "Best online ordering · exclusive Ball & Selecta genetics · no interest until June · rep less responsive",
  EHR: "Very responsive local rep · best for precision crops (mums, poinsettias) · calls early on shortages",
  Express: "Strong on foliage · exclusives via the Van Wingerden network · newer relationship",
};
const srcSup = s => SRC_SUPPLIER_LABEL[s] || s;
const srcFormLabel = f => SRC_FORM_LABEL[f] || f || "—";
function srcBrokerColor(b) { const x = String(b || "").toLowerCase(); return x.startsWith("ball") ? "#1976d2" : x.startsWith("ehr") ? "#3d7a2f" : "#c8791a"; }
// Resolve a plan row's broker (e.g. 'Ball'/'BALL'/'Express') to its broker_profiles record,
// whose names are longer/cased differently ('BALL SEED'/'Express Seed'). Case-insensitive prefix.
function resolveBrokerProfile(bmap, broker) {
  if (!broker || !bmap) return null;
  if (bmap[broker]) return bmap[broker];
  const k = String(broker).toLowerCase().trim();
  const hit = Object.keys(bmap).find(n => { const nl = n.toLowerCase(); return nl === k || nl.startsWith(k) || k.startsWith(nl.split(" ")[0]); });
  return hit ? bmap[hit] : null;
}
function srcGradeFor(broker, profiles) {
  const re = broker === "Ball" ? /ball/i : broker === "EHR" ? /ehr/i : /express/i;
  const p = (profiles || []).find(x => re.test(x.name || ""));
  const g = p && p.grade_overall != null ? parseFloat(p.grade_overall) : null;
  return g && g > 0 ? g : null;
}
const money = v => (v == null ? "—" : "$" + Number(v).toFixed(4));

// Paginated fetch (PostgREST caps at 1000/req) — used by the Pricing tab.
async function srcPageAll(sb, table, select, filter) {
  let out = [];
  for (let f = 0; ; f += 1000) {
    let q = sb.from(table).select(select).range(f, f + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error || !data || !data.length) break;
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

// Standalone Sourcing page (Production nav → 🧭 Sourcing) — same workspace, full width.
export function SourcingPage() {
  return (
    <div style={{ padding: "16px 22px", maxWidth: 1280, margin: "0 auto" }}>
      <SourcingWorkspace fullscreen />
    </div>
  );
}

// In-plan tab: the workspace + a button to pop it open full screen. (Applying broker picks to
// the plan's costs runs via scripts/apply_sourcing_to_plan.js — the single source of truth,
// since it depends on the desktop quote files + the URC/callused & per-supplier rules.)
function SourcingTab({ plan }) {
  const [fs, setFs] = useState(false);
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <button onClick={() => setFs(true)}
          style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↗ Open full screen
        </button>
      </div>
      <SourcingWorkspace plan={plan} />
      {fs && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#f4f7f1", overflow: "auto" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: "#fff", borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: 800, color: COLORS.dark, fontSize: 16 }}>🧭 Sourcing — full screen</div>
            <button onClick={() => setFs(false)}
              style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.text, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Close</button>
          </div>
          <div style={{ padding: "16px 22px", maxWidth: 1280, margin: "0 auto" }}><SourcingWorkspace fullscreen plan={plan} /></div>
        </div>
      )}
    </div>
  );
}

function SourcingWorkspace({ fullscreen, plan }) {
  const sb = getSupabase();
  const [suppliers, setSuppliers]   = useState(null);
  const [profiles, setProfiles]     = useState([]);
  const [selections, setSelections] = useState({}); // supplier -> selected_broker
  const [expanded, setExpanded]     = useState(null);
  const [detail, setDetail]         = useState({}); // supplier -> rows
  const [detailBusy, setDetailBusy] = useState(false);
  const [search, setSearch]         = useState("");
  const [matchOpen, setMatchOpen]   = useState(false); // global match/cleanup workspace
  const [compareOpen, setCompareOpen] = useState(false); // cross-variety cost comparison
  const [originsOpen, setOriginsOpen] = useState(false);  // farm-origin map + order minimums
  const [locksOpen, setLocksOpen] = useState(false);      // series locks master panel
  const [showChecklist, setShowChecklist] = useState(false);

  function loadSuppliers() {
    sb.from("v_sourcing_suppliers").select("*").then(({ data }) =>
      setSuppliers((data || []).slice().sort((a, b) => (b.comparable_count || 0) - (a.comparable_count || 0) || (b.variety_count || 0) - (a.variety_count || 0))));
  }
  useEffect(() => {
    if (!sb) return;
    sb.from("v_sourcing_suppliers").select("*").then(({ data }) =>
      setSuppliers((data || []).slice().sort((a, b) => (b.comparable_count || 0) - (a.comparable_count || 0) || (b.variety_count || 0) - (a.variety_count || 0))));
    sb.from("broker_profiles").select("name,grade_overall,rep_name").then(({ data }) => setProfiles(data || []));
    sb.from("sourcing_selections").select("*").eq("season", SRC_SEASON).then(({ data }) => {
      const m = {}; (data || []).forEach(s => { if (s.form_class === "*") m[s.supplier] = s.selected_broker; });
      setSelections(m);
    });
  }, [sb]);

  async function pick(supplier, broker) {
    setSelections(prev => ({ ...prev, [supplier]: prev[supplier] === broker ? null : broker }));
    const chosen = selections[supplier] === broker ? null : broker;
    await sb.from("sourcing_selections").upsert(
      { supplier, form_class: "*", season: SRC_SEASON, selected_broker: chosen, updated_at: new Date().toISOString() },
      { onConflict: "supplier,form_class,season" });
  }

  async function loadDetail(supplier, force) {
    if (detail[supplier] && !force) return;
    setDetailBusy(true);
    const out = await srcPageAll(sb, "v_sourcing_prices", "form_class,variety_key,variety,crop,broker,landed,has_excl", q => q.eq("supplier", supplier));
    setDetail(prev => ({ ...prev, [supplier]: out }));
    setDetailBusy(false);
  }
  function toggle(supplier) {
    setSearch("");
    if (expanded === supplier) setExpanded(null);
    else { setExpanded(supplier); loadDetail(supplier); }
  }

  if (suppliers == null) return <div style={{ padding: 40, color: COLORS.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading broker pricing…</div>;

  const competitive = suppliers.filter(s => (s.comparable_count || 0) > 0);
  const single = suppliers.filter(s => (s.comparable_count || 0) === 0);
  const totalComparable = competitive.reduce((n, s) => n + (s.comparable_count || 0), 0);

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", color: COLORS.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.dark }}>🧭 Sourcing — broker price comparison</div>
          <div style={{ fontSize: 13, color: COLORS.muted, maxWidth: 680, marginTop: 4 }}>
            Same genetics, different brokers. Landed cost = plant + royalty + freight (EHR volume-tier &amp; your negotiated discounts applied).
            Pick the broker for each <strong>supplier program</strong> — that choice is what should drive your plan pricing.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SrcStat label="Suppliers" value={suppliers.length} />
          <SrcStat label="Comparable lanes" value={totalComparable} color={COLORS.light} />
          <SrcStat label="Exclusives" value={single.length} color={COLORS.amber} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <button onClick={() => { setMatchOpen(o => !o); setCompareOpen(false); setOriginsOpen(false); setLocksOpen(false); }}
          style={{ border: `1.5px solid ${matchOpen ? COLORS.light : COLORS.border}`, background: matchOpen ? COLORS.light : "#fff", color: matchOpen ? "#fff" : COLORS.dark, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          🔗 {matchOpen ? "← Back to suppliers" : "Match & clean up"}
        </button>
        <button onClick={() => { setCompareOpen(o => !o); setMatchOpen(false); setOriginsOpen(false); setLocksOpen(false); }}
          style={{ border: `1.5px solid ${compareOpen ? COLORS.light : COLORS.border}`, background: compareOpen ? COLORS.light : "#fff", color: compareOpen ? "#fff" : COLORS.dark, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          💡 {compareOpen ? "← Back to suppliers" : "Compare varieties"}
        </button>
        <button onClick={() => { setOriginsOpen(o => !o); setMatchOpen(false); setCompareOpen(false); setLocksOpen(false); }}
          style={{ border: `1.5px solid ${originsOpen ? COLORS.light : COLORS.border}`, background: originsOpen ? COLORS.light : "#fff", color: originsOpen ? "#fff" : COLORS.dark, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          🗺 {originsOpen ? "← Back to suppliers" : "Origins & minimums"}
        </button>
        <button onClick={() => { setLocksOpen(o => !o); setMatchOpen(false); setCompareOpen(false); setOriginsOpen(false); }}
          style={{ border: `1.5px solid ${locksOpen ? COLORS.light : COLORS.border}`, background: locksOpen ? COLORS.light : "#fff", color: locksOpen ? "#fff" : COLORS.dark, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          🔒 {locksOpen ? "← Back to suppliers" : "Series locks"}
        </button>
        {!matchOpen && !compareOpen && !originsOpen && !locksOpen && (
          <button onClick={() => setShowChecklist(c => !c)}
            style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 8, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            📋 Order checklist
          </button>
        )}
      </div>

      {matchOpen ? <SrcMatcher sb={sb} onChanged={loadSuppliers} /> : compareOpen ? <SrcCompare sb={sb} plan={plan} /> : originsOpen ? <SrcOrigins sb={sb} plan={plan} /> : locksOpen ? <SrcLocks sb={sb} plan={plan} /> : (<>

      {showChecklist && <SrcOrderChecklist suppliers={competitive} selections={selections} />}

      <SrcSectionTitle>Where you can shop brokers</SrcSectionTitle>
      {competitive.map(s => (
        <SrcSupplierCard key={s.supplier} s={s} profiles={profiles}
          selected={selections[s.supplier]} onPick={pick}
          expanded={expanded === s.supplier} onToggle={() => toggle(s.supplier)}
          detail={detail[s.supplier]} detailBusy={detailBusy && expanded === s.supplier}
          search={search} setSearch={setSearch} />
      ))}

      <SrcSectionTitle>Single-source (exclusive — only one broker quotes these)</SrcSectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
        {single.map(s => {
          const only = (s.brokers || [])[0];
          return (
            <div key={s.supplier} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${srcBrokerColor(only)}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, color: COLORS.dark }}>{srcSup(s.supplier)}</div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{s.variety_count} varieties · only via <span style={{ color: srcBrokerColor(only), fontWeight: 700 }}>{only}</span></div>
            </div>
          );
        })}
      </div>
      </>)}
    </div>
  );
}

// Order checklist — every shoppable supplier with the broker you chose to buy through,
// flagged where that differs from the broker that's cheapest most often. Copyable.
function SrcOrderChecklist({ suppliers, selections }) {
  const rows = suppliers.map(s => ({
    supplier: s.supplier, chosen: selections[s.supplier] || null, rec: s.rec_broker || null,
    comparable: s.comparable_count || 0, spread: s.avg_spread_pct,
  }));
  const decided = rows.filter(r => r.chosen).length;
  function copy() {
    const lines = rows.map(r => `${srcSup(r.supplier)}: ${r.chosen ? "buy through " + r.chosen : "— not chosen"}` +
      (r.rec && r.chosen && r.chosen !== r.rec ? `  (cheapest most often: ${r.rec})` : "") +
      (r.rec && !r.chosen ? `  (suggest ${r.rec})` : ""));
    const text = `Sourcing order plan — ${SRC_SEASON}\n` + lines.join("\n");
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => alert("Order checklist copied to clipboard"));
  }
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px", margin: "4px 0 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 800, color: COLORS.dark }}>📋 Order checklist <span style={{ fontWeight: 400, color: COLORS.muted, fontSize: 12 }}>· {decided}/{rows.length} suppliers assigned</span></div>
        <button onClick={copy} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>⧉ Copy</button>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: "left", color: COLORS.muted }}>
          <th style={{ padding: "4px 8px", fontWeight: 700 }}>Supplier</th>
          <th style={{ padding: "4px 8px", fontWeight: 700 }}>Buy through</th>
          <th style={{ padding: "4px 8px", fontWeight: 700 }}>Cheapest most often</th>
          <th style={{ padding: "4px 8px", fontWeight: 700, textAlign: "right" }}>Comparable</th>
          <th style={{ padding: "4px 8px", fontWeight: 700, textAlign: "right" }}>Avg spread</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.supplier} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: COLORS.dark }}>{srcSup(r.supplier)}</td>
              <td style={{ padding: "4px 8px" }}>{r.chosen
                ? <span style={{ color: srcBrokerColor(r.chosen), fontWeight: 800 }}>{r.chosen}</span>
                : <span style={{ color: COLORS.amber }}>— not chosen</span>}
                {r.chosen && r.rec && r.chosen !== r.rec && <span title="paying a relationship premium vs cheapest" style={{ marginLeft: 6, fontSize: 11, color: COLORS.amber }}>⚠ not cheapest</span>}
              </td>
              <td style={{ padding: "4px 8px", color: r.rec ? srcBrokerColor(r.rec) : COLORS.muted, fontWeight: r.rec ? 700 : 400 }}>{r.rec || "—"}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.comparable}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.spread != null ? r.spread + "%" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SrcStat({ label, value, color }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 74 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || COLORS.dark }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: .5 }}>{label}</div>
    </div>
  );
}
function SrcSectionTitle({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase", letterSpacing: .8, margin: "20px 0 8px" }}>{children}</div>;
}

function SrcSupplierCard({ s, profiles, selected, onPick, expanded, onToggle, detail, detailBusy, search, setSearch }) {
  const brokers = (s.brokers || []).filter(b => SRC_BROKERS.includes(b));
  const rec = s.rec_broker;
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: COLORS.muted, width: 14 }}>{expanded ? "▾" : "▸"}</div>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontWeight: 800, color: COLORS.dark, fontSize: 16 }}>{srcSup(s.supplier)}</div>
          <div style={{ fontSize: 11.5, color: COLORS.muted }}>{s.variety_count} varieties · {s.comparable_count} comparable</div>
        </div>
        {rec && (
          <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 20, padding: "3px 10px", fontSize: 12, color: COLORS.dark }}>
            ⭐ Cheapest most often: <strong style={{ color: srcBrokerColor(rec) }}>{rec}</strong>
            {s.avg_spread_pct != null && <span style={{ color: COLORS.muted }}> · avg {s.avg_spread_pct}% spread</span>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
          <span style={{ fontSize: 11, color: COLORS.muted }}>Buy through:</span>
          {brokers.map(b => {
            const on = selected === b;
            const grade = srcGradeFor(b, profiles);
            return (
              <button key={b} onClick={() => onPick(s.supplier, b)} title={SRC_BROKER_NOTE[b]}
                style={{
                  border: `1.5px solid ${on ? srcBrokerColor(b) : COLORS.border}`,
                  background: on ? srcBrokerColor(b) : "#fff", color: on ? "#fff" : COLORS.text,
                  borderRadius: 8, padding: "5px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>
                {on ? "✓ " : ""}{b}{grade ? <span style={{ opacity: .7, fontWeight: 400 }}> ★{grade}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {expanded && <SrcDetail detail={detail} detailBusy={detailBusy} selected={selected} search={search} setSearch={setSearch} />}
    </div>
  );
}

function SrcDetail({ detail, detailBusy, selected, search, setSearch }) {
  if (detailBusy || !detail) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>Loading varieties…</div>;
  // group to one row per form|variety with each broker's landed price
  const groups = {};
  for (const r of detail) {
    const k = r.form_class + "|" + r.variety_key;
    if (!groups[k]) groups[k] = { form: r.form_class, key: r.variety_key, variety: r.variety, crop: r.crop, excl: false, prices: {} };
    if (groups[k].prices[r.broker] == null || r.landed < groups[k].prices[r.broker]) groups[k].prices[r.broker] = r.landed;
    if (r.has_excl) groups[k].excl = true;
  }
  let rows = Object.values(groups);
  const q = search.trim().toLowerCase();
  if (q) rows = rows.filter(r => (r.variety || "").toLowerCase().includes(q) || (r.crop || "").toLowerCase().includes(q));
  // multi-broker (comparable) first, then alpha
  rows.sort((a, b) => Object.keys(b.prices).length - Object.keys(a.prices).length || (a.variety || "").localeCompare(b.variety || ""));
  const total = rows.length;
  const CAP = 400;
  const shown = rows.slice(0, CAP);
  const byForm = {};
  for (const r of shown) (byForm[r.form] = byForm[r.form] || []).push(r);

  return (
    <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "10px 14px 16px", background: "#fcfdfb" }}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter varieties…"
        style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, fontFamily: "inherit", marginBottom: 10, width: 240, boxSizing: "border-box" }} />
      {Object.entries(byForm).map(([form, list]) => (
        <div key={form} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted, margin: "6px 0 4px" }}>{srcFormLabel(form)} <span style={{ fontWeight: 400 }}>({list.length})</span></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: COLORS.muted }}>
                <th style={{ padding: "4px 8px", fontWeight: 700 }}>Variety</th>
                {SRC_BROKERS.map(b => (
                  <th key={b} style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: srcBrokerColor(b), background: selected === b ? "#eef6e7" : "transparent" }}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const present = SRC_BROKERS.filter(b => r.prices[b] != null);
                const lo = Math.min(...present.map(b => r.prices[b]));
                return (
                  <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={{ padding: "4px 8px", color: COLORS.text }}>{r.variety}{r.excl && <span title="exclusive" style={{ marginLeft: 6, fontSize: 10, color: COLORS.amber }}>◆</span>}</td>
                    {SRC_BROKERS.map(b => {
                      const v = r.prices[b];
                      const cheapest = v != null && v === lo && present.length > 1;
                      return (
                        <td key={b} style={{
                          padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums",
                          background: selected === b ? "#eef6e7" : cheapest ? "#dcedc8" : "transparent",
                          fontWeight: cheapest ? 800 : 400, color: v == null ? "#cbd5c0" : COLORS.text,
                        }}>{v == null ? "—" : money(v)}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {total > CAP && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>Showing first {CAP} of {total} — use the filter to narrow.</div>}
    </div>
  );
}

// Farm-origin map + order minimums for the plan. Pins sized by this plan's planned plants
// per growing country, arced to Indianapolis; closer farms = fresher cuttings. Plus per-supplier
// order rollups vs the 2000-plant order minimum and 100-plant per-variety minimum.
const ORIGIN_COORDS = { // [lat, lon]
  Mexico: [21.0, -100.0], "El Salvador": [13.7, -89.2], Guatemala: [15.5, -90.3], "Costa Rica": [9.7, -83.8],
  Colombia: [4.6, -74.1], Ethiopia: [9.1, 40.5], Uganda: [1.4, 32.3], Kenya: [-1.3, 36.8], Tanzania: [-6.4, 34.9],
  Portugal: [39.4, -8.2], Spain: [40.0, -3.7], Israel: [31.5, 34.8],
};
const INDY = [39.77, -86.16];
const haversine = (a, b) => { const R = 3959, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180, la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); };
// mode() helper — most-common non-null value, to smooth free-text parse glitches across a supplier's quotes
const srcMode = arr => { const c = {}; arr.filter(x => x != null).forEach(x => { c[x] = (c[x] || 0) + 1; }); let best = null, n = 0; for (const k in c) if (c[k] > n) { n = c[k]; best = +k; } return best; };
function SrcOrigins({ sb, plan }) {
  const [rows, setRows] = useState(null);
  const [terms, setTerms] = useState({}); // supplier -> { urc, pv, stmt }
  useEffect(() => {
    if (!sb || !plan?.id) { setRows([]); return; }
    (async () => {
      const sc = await srcPageAll(sb, "scheduled_crops", "item_name,supplier,origin,qty_pots,ppp,plants_per_unit,liner_unit_cost", q => q.eq("plan_id", plan.id).eq("is_combo_component", false).gt("qty_pots", 0));
      setRows(sc.map(r => ({ ...r, plants: (+r.qty_pots || 0) * (+r.plants_per_unit || 1) })));
      // real per-quote order minimums parsed from the quote sheets (broker_quote_terms)
      const bt = await srcPageAll(sb, "broker_quote_terms", "supplier,urc_order_min,per_variety_min,min_statement", q => q.eq("season", "2026-2027"));
      const bySupT = {}; bt.forEach(t => { (bySupT[t.supplier] = bySupT[t.supplier] || { urc: [], pv: [], stmt: "" }); bySupT[t.supplier].urc.push(t.urc_order_min); bySupT[t.supplier].pv.push(t.per_variety_min); if ((t.min_statement || "").length > bySupT[t.supplier].stmt.length) bySupT[t.supplier].stmt = t.min_statement; });
      const tmap = {}; Object.entries(bySupT).forEach(([s, v]) => { tmap[s] = { urc: srcMode(v.urc), pv: srcMode(v.pv), stmt: v.stmt }; });
      setTerms(tmap);
    })();
  }, [sb, plan]);
  if (rows == null) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>Loading…</div>;
  if (!plan?.id) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>Open from a plan to see its origins.</div>;

  // by origin (sourced rows only)
  const byOrigin = {};
  rows.forEach(r => { if (!r.supplier) return; const k = r.origin || "(unknown farm)"; (byOrigin[k] = byOrigin[k] || { plants: 0, items: 0, supes: new Set() }); byOrigin[k].plants += r.plants; byOrigin[k].items += 1; byOrigin[k].supes.add(r.supplier); });
  const origins = Object.entries(byOrigin).map(([name, v]) => ({ name, ...v, coord: ORIGIN_COORDS[name], dist: ORIGIN_COORDS[name] ? haversine(ORIGIN_COORDS[name], INDY) : null })).sort((a, b) => b.plants - a.plants);
  const maxP = Math.max(1, ...origins.map(o => o.plants));
  // by supplier (order minimums)
  const bySup = {};
  rows.forEach(r => { if (!r.supplier) return; (bySup[r.supplier] = bySup[r.supplier] || { plants: 0, vars: new Set(), under100: new Set() }); bySup[r.supplier].plants += r.plants; bySup[r.supplier].vars.add(r.item_name); });
  // per-variety under 100 (sum plants per item within supplier)
  const itemPlants = {}; rows.forEach(r => { if (!r.supplier) return; const k = r.supplier + "||" + r.item_name; itemPlants[k] = (itemPlants[k] || 0) + r.plants; });
  // per-variety minimum is the supplier's real quoted value (usually 100), fall back to 100
  Object.entries(itemPlants).forEach(([k, p]) => { const sup = k.split("||")[0]; const vmin = terms[sup]?.pv || 100; if (p < vmin) bySup[sup] && bySup[sup].under100.add(k); });
  const sups = Object.entries(bySup).map(([s, v]) => {
    const orderMin = terms[s]?.urc || 2000; // real quoted URC order minimum; 2,000 industry default if not quoted
    return { supplier: s, plants: Math.round(v.plants), varieties: v.vars.size, under: v.under100.size, orderMin, varMin: terms[s]?.pv || 100, stmt: terms[s]?.stmt || "", quoted: terms[s]?.urc != null };
  }).sort((a, b) => b.plants - a.plants);

  // equirectangular projection over the relevant window
  const W = 720, H = 360, lonMin = -120, lonMax = 55, latMin = -18, latMax = 52;
  const px = lon => (lon - lonMin) / (lonMax - lonMin) * W;
  const py = lat => (latMax - lat) / (latMax - latMin) * H;
  const regions = [["North America", 38, -100], ["Central America", 14, -86], ["South America", -8, -60], ["Africa", 2, 22], ["Europe", 47, 10]];
  const indy = [px(INDY[1]), py(INDY[0])];

  return (
    <div>
      <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: COLORS.text, margin: "4px 0 10px" }}>
        🗺 <strong>Where your cuttings come from.</strong> Pins sized by this plan's planned plants per farm country, arced to Indianapolis. Shorter transit = fresher, more viable cuttings — a Mexico/Central-America farm can beat East Africa on arrival quality. Below: order rollups vs each supplier's <strong>real order minimum</strong> (parsed from the quote sheets — e.g. Dümmen 3,000 URC, Beekenkamp 1,500) and per-variety minimum.
      </div>
      <div style={{ background: "#eaf1f7", border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
          {[-90, -45, 0, 45, 90].map(l => px(l) >= 0 && px(l) <= W && <line key={"v" + l} x1={px(l)} y1={0} x2={px(l)} y2={H} stroke="#d6e0ea" strokeWidth="1" />)}
          {[-15, 0, 23, 45].map(l => <line key={"h" + l} x1={0} y1={py(l)} x2={W} y2={py(l)} stroke="#d6e0ea" strokeWidth="1" />)}
          {regions.map(([nm, la, lo]) => <text key={nm} x={px(lo)} y={py(la)} fontSize="11" fill="#9fb3c4" fontWeight="700" textAnchor="middle">{nm}</text>)}
          {origins.filter(o => o.coord).map(o => { const x = px(o.coord[1]), y = py(o.coord[0]); return <line key={"a" + o.name} x1={x} y1={y} x2={indy[0]} y2={indy[1]} stroke={o.dist > 5000 ? "#d94f3d" : o.dist > 2500 ? "#e89a3a" : "#7fb069"} strokeWidth="1.5" strokeOpacity="0.6" />; })}
          <g><circle cx={indy[0]} cy={indy[1]} r="6" fill="#1e2d1a" /><text x={indy[0]} y={indy[1] - 9} fontSize="11" fontWeight="800" fill="#1e2d1a" textAnchor="middle">Indianapolis</text></g>
          {origins.filter(o => o.coord).map(o => { const x = px(o.coord[1]), y = py(o.coord[0]); const r = 5 + 22 * Math.sqrt(o.plants / maxP); const c = o.dist > 5000 ? "#d94f3d" : o.dist > 2500 ? "#e89a3a" : "#7fb069"; return (<g key={o.name}><circle cx={x} cy={y} r={r} fill={c} fillOpacity="0.55" stroke={c} strokeWidth="1.5" /><text x={x} y={y + r + 11} fontSize="10.5" fontWeight="700" fill={COLORS.dark} textAnchor="middle">{o.name} · {o.plants.toLocaleString()}</text></g>); })}
        </svg>
      </div>

      <SrcSectionTitle>Origins (this plan)</SrcSectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginBottom: 16 }}>
        <thead><tr style={{ textAlign: "left", color: COLORS.muted }}><th style={{ padding: "4px 8px" }}>Farm country</th><th style={{ padding: "4px 8px" }}>Suppliers</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Plants</th><th style={{ padding: "4px 8px", textAlign: "right" }}>~Miles to Indy</th><th style={{ padding: "4px 8px" }}>Transit</th></tr></thead>
        <tbody>
          {origins.map(o => (
            <tr key={o.name} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: COLORS.dark }}>{o.name}</td>
              <td style={{ padding: "4px 8px", color: COLORS.muted }}>{[...o.supes].map(srcSup).join(", ")}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{o.plants.toLocaleString()}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: COLORS.muted }}>{o.dist ? o.dist.toLocaleString() : "—"}</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: o.dist == null ? COLORS.muted : o.dist > 5000 ? COLORS.red : o.dist > 2500 ? COLORS.amber : COLORS.light }}>{o.dist == null ? "—" : o.dist > 5000 ? "long haul" : o.dist > 2500 ? "moderate" : "short / fresh"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SrcSectionTitle>Order minimums — per-quote (parsed from the sheets)</SrcSectionTitle>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 6 }}>Order min is each supplier's real quoted URC minimum (hover for the full term); ✳ = not quoted, using the 2,000 industry default. Per-variety min from the quote (usually 100).</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ textAlign: "left", color: COLORS.muted }}><th style={{ padding: "4px 8px" }}>Supplier</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Planned plants</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Varieties</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Order min</th><th style={{ padding: "4px 8px" }}>vs min</th><th style={{ padding: "4px 8px", textAlign: "right" }}>Under {"<"}/variety</th></tr></thead>
        <tbody>
          {sups.map(s => (
            <tr key={s.supplier} style={{ borderTop: `1px solid ${COLORS.border}` }}>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: COLORS.dark }} title={s.stmt || ""}>{srcSup(s.supplier)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.plants.toLocaleString()}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: COLORS.muted }}>{s.varieties}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }} title={s.stmt || ""}>{s.orderMin.toLocaleString()}{!s.quoted && <span style={{ color: COLORS.muted }}> ✳</span>}</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: s.plants < s.orderMin ? COLORS.red : COLORS.light }}>{s.plants < s.orderMin ? `⚠ ${(s.orderMin - s.plants).toLocaleString()} short` : "✓ met"}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: s.under > 0 ? COLORS.amber : COLORS.muted, fontWeight: s.under > 0 ? 700 : 400 }} title={`under ${s.varMin}/variety`}>{s.under || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Cross-variety cost comparison — within a crop, see every variety across all suppliers
// sorted by landed cost (cheaper equivalents = savings). Shows crops you already grow first;
// toggle to reveal crops you don't grow. Grouped by form (URC/callused).
const SRC_COLORS_RX = /\b(red|white|pink|yellow|orange|purple|blue|salmon|coral|rose|lavender|burgundy|bronze|lime|green|peach|gold|scarlet|magenta|violet|cream|apricot|cherry|plum)\b/i;
// genus-aware series word: drop a leading genus token, take the next word (works whether or not the
// variety name is genus-prefixed) — used for plan-drift matching against a locked series.
const srcSeriesOf = (name, genus) => { const w = String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean); if (w[0] === genus) w.shift(); return w[0] || ""; };

// Master panel — every crop→series lock in one place, with plan-drift flagging (which planned
// varieties are off the locked series). Locks are created inline from the Compare-varieties view.
function SrcLocks({ sb, plan }) {
  const [locks, setLocks] = useState(null);
  const [sels, setSels] = useState({});
  const [drift, setDrift] = useState({}); // genus -> [{variety, series}]
  const season = `${(plan?.year || 2027) - 1}-${plan?.year || 2027}`;
  const load = async () => setLocks(await srcPageAll(sb, "sourcing_series_locks", "id,genus,series,variety,supplier,grown_before,note", q => q.eq("season", season)));
  useEffect(() => {
    if (!sb) return;
    (async () => {
      await load();
      const sel = await srcPageAll(sb, "sourcing_selections", "supplier,selected_broker", q => q.eq("season", season).eq("form_class", "*"));
      const sm = {}; sel.forEach(s => { if (s.selected_broker) sm[s.supplier] = s.selected_broker; }); setSels(sm);
      if (plan?.id) {
        const sc = await srcPageAll(sb, "scheduled_crops", "variety_id,item_name", q => q.eq("plan_id", plan.id).eq("is_combo_component", false).gt("qty_pots", 0));
        const vars = await srcPageAll(sb, "variety_library", "id,crop_name,variety");
        const vById = {}; vars.forEach(v => { vById[v.id] = v; });
        const byGenus = {};
        sc.forEach(r => { const v = vById[r.variety_id]; const name = v?.variety || r.item_name; if (!name) return; const genus = String(v?.crop_name || name).trim().toLowerCase().split(/\s+/)[0]; (byGenus[genus] = byGenus[genus] || []).push({ variety: name, series: srcSeriesOf(name, genus) }); });
        setDrift(byGenus);
      }
    })();
  }, [sb, plan]);
  async function del(id) { await sb.from("sourcing_series_locks").delete().eq("id", id); await load(); }
  if (locks == null) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>Loading…</div>;

  // group locks by genus so drift is computed against the full locked-series set for that crop
  const byGenusLock = {}; locks.forEach(l => { (byGenusLock[l.genus] = byGenusLock[l.genus] || []).push(l); });
  const rowsUI = Object.entries(byGenusLock).map(([genus, ls]) => {
    const lockedSeries = new Set(ls.map(l => (l.series || "").toLowerCase()).filter(Boolean));
    const planItems = drift[genus] || [];
    const off = lockedSeries.size ? planItems.filter(p => p.series && !lockedSeries.has(p.series)) : [];
    return { genus, ls, off: [...new Set(off.map(o => o.variety))], planCount: planItems.length };
  }).sort((a, b) => a.genus.localeCompare(b.genus));

  return (
    <div>
      <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: COLORS.text, margin: "4px 0 12px" }}>
        🔒 <strong>Series locks.</strong> The series (or specific variety) you've standardized on per crop, so genetics don't drift year to year. Broker is inherited from your supplier selection. Add locks from <strong>💡 Compare varieties</strong> (click 🔒 on a row). Below, <strong>off-series</strong> = varieties in this plan that don't match the locked series.
      </div>
      {rowsUI.length === 0 ? <div style={{ color: COLORS.muted, fontSize: 13, padding: "10px 0" }}>No series locked yet — open <strong>Compare varieties</strong>, expand a crop, and click 🔒 on the series you want to standardize on.</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: "left", color: COLORS.muted }}><th style={{ padding: "5px 8px" }}>Crop</th><th style={{ padding: "5px 8px" }}>Locked series / variety</th><th style={{ padding: "5px 8px" }}>Supplier · broker</th><th style={{ padding: "5px 8px" }}>Plan drift</th><th></th></tr></thead>
          <tbody>
            {rowsUI.map(r => (
              <tr key={r.genus} style={{ borderTop: `1px solid ${COLORS.border}`, verticalAlign: "top" }}>
                <td style={{ padding: "6px 8px", fontWeight: 700, color: COLORS.dark, textTransform: "capitalize" }}>{r.genus}</td>
                <td style={{ padding: "6px 8px" }}>{r.ls.map(l => (
                  <div key={l.id} style={{ marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, textTransform: "capitalize", color: COLORS.dark }}>{l.series || l.variety}</span>
                    {l.grown_before && <span title="we've grown this before" style={{ marginLeft: 6, fontSize: 9.5, color: COLORS.light, fontWeight: 800 }}>✓ grown</span>}
                    {l.note && <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.muted }}>{l.note}</span>}
                    <button onClick={() => del(l.id)} title="Remove lock" style={{ marginLeft: 8, border: "none", background: "transparent", color: COLORS.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                ))}</td>
                <td style={{ padding: "6px 8px", color: COLORS.muted }}>{[...new Set(r.ls.map(l => l.supplier).filter(Boolean))].map(s => `${srcSup(s)}${sels[s] ? ` · ${sels[s]}` : ""}`).join(", ") || "—"}</td>
                <td style={{ padding: "6px 8px" }}>{r.off.length ? <span style={{ color: COLORS.amber, fontWeight: 700 }} title={r.off.join("\n")}>⚠ {r.off.length} off-series</span> : <span style={{ color: COLORS.light, fontWeight: 700 }}>✓ on-series ({r.planCount})</span>}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rowsUI.some(r => r.off.length > 0) && (
        <div style={{ marginTop: 14 }}>
          <SrcSectionTitle>Off-series in this plan (drift)</SrcSectionTitle>
          {rowsUI.filter(r => r.off.length).map(r => (
            <div key={r.genus} style={{ fontSize: 12.5, marginBottom: 6 }}>
              <strong style={{ textTransform: "capitalize", color: COLORS.dark }}>{r.genus}</strong> <span style={{ color: COLORS.muted }}>— not in {r.ls.map(l => l.series || l.variety).join("/")}: </span>
              {r.off.map((v, i) => <span key={i} style={{ color: COLORS.amber }}>{i ? ", " : ""}{v}</span>)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// loose normalize for "have we grown this variety before" matching (no genus-synonyms — a hint, not a hard key)
const srcNorm = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
// series word = the token right after the genus (e.g. "Bidens Blazing Ring" → "blazing"); noisy but a starting point
const srcSeriesWord = variety => { const w = String(variety || "").trim().split(/\s+/); return (w[1] || "").toLowerCase().replace(/[^a-z0-9]/g, ""); };
function SrcCompare({ sb, plan }) {
  const [grown, setGrown] = useState(null);   // [{genus,label}] crops in the plan
  const [allGenera, setAllGenera] = useState(null);
  const [showAll, setShowAll] = useState(!plan);
  const [open, setOpen] = useState(null);      // expanded genus
  const [rows, setRows] = useState({});        // genus -> variety rows
  const [busy, setBusy] = useState(false);
  const [locks, setLocks] = useState([]);      // sourcing_series_locks rows
  const [grownVars, setGrownVars] = useState(new Set()); // normalized names we've grown before
  const [sels, setSels] = useState({});        // supplier -> selected broker (inherited)
  const season = `${(plan?.year || 2027) - 1}-${plan?.year || 2027}`;

  const loadLocks = async () => { const l = await srcPageAll(sb, "sourcing_series_locks", "id,genus,series,variety,supplier,grown_before,note", q => q.eq("season", season)); setLocks(l || []); };
  useEffect(() => {
    if (!sb) return;
    (async () => {
      await loadLocks();
      const sel = await srcPageAll(sb, "sourcing_selections", "supplier,selected_broker", q => q.eq("season", season).eq("form_class", "*"));
      const sm = {}; sel.forEach(s => { if (s.selected_broker) sm[s.supplier] = s.selected_broker; }); setSels(sm);
      if (plan?.id) {
        const sc = await srcPageAll(sb, "scheduled_crops", "variety_id", q => q.eq("plan_id", plan.id).eq("is_combo_component", false));
        const vids = [...new Set(sc.map(r => r.variety_id).filter(Boolean))];
        const vars = await srcPageAll(sb, "variety_library", "id,crop_name,variety");
        const cropById = {}; vars.forEach(v => { cropById[v.id] = v.crop_name; });
        const g = {};
        vids.forEach(id => { const cn = cropById[id]; if (!cn) return; const genus = String(cn).trim().toLowerCase().split(/\s+/)[0]; if (genus) g[genus] = cn; });
        setGrown(Object.entries(g).map(([genus, label]) => ({ genus, label })).sort((a, b) => a.label.localeCompare(b.label)));
        // "grown before" = varieties on ANY plan (track record) — normalized, genus dropped for matching
        const allSc = await srcPageAll(sb, "scheduled_crops", "variety_id", q => q.eq("is_combo_component", false).gt("qty_pots", 0));
        const usedVids = new Set(allSc.map(r => r.variety_id).filter(Boolean));
        const gv = new Set();
        vars.forEach(v => { if (usedVids.has(v.id) && v.variety) gv.add(srcNorm(String(v.variety).split(/\s+/).slice(1).join(" ") || v.variety)); });
        setGrownVars(gv);
      } else setGrown([]);
    })();
  }, [sb, plan]); // eslint wants season but it's derived from plan

  async function loadAllGenera() {
    if (allGenera) return;
    const data = await srcPageAll(sb, "v_sourcing_prices", "variety_key", q => q.in("form_class", ["urc", "callused"]));
    setAllGenera([...new Set(data.map(r => String(r.variety_key || "").split(" ")[0]).filter(Boolean))].sort());
  }
  async function expand(genus) {
    if (open === genus) { setOpen(null); return; }
    setOpen(genus);
    if (!rows[genus]) {
      setBusy(true);
      const data = await srcPageAll(sb, "v_sourcing_prices", "supplier,broker,form_class,variety_key,variety,landed,item_min",
        q => q.like("variety_key", genus + "%").in("form_class", ["urc", "callused"]));
      // one row per variety_key → cheapest source (keep the largest item_min seen for that variety)
      const byKey = {};
      (data || []).forEach(r => {
        if (String(r.variety_key || "").split(" ")[0] !== genus) return;
        const k = r.form_class + "|" + r.variety_key;
        const min = r.item_min || null;
        if (!byKey[k] || r.landed < byKey[k].landed) byKey[k] = { form: r.form_class, variety: r.variety, supplier: r.supplier, broker: r.broker, landed: +r.landed, itemMin: min ?? byKey[k]?.itemMin ?? null };
        else if (min && (!byKey[k].itemMin || min > byKey[k].itemMin)) byKey[k].itemMin = min;
      });
      setRows(prev => ({ ...prev, [genus]: Object.values(byKey) }));
      setBusy(false);
    }
  }
  // lock / unlock a series for a crop (broker is inherited from the supplier's sourcing_selection)
  async function toggleLock(genus, seriesWord, supplier, variety, grownBefore) {
    const existing = locks.find(l => l.genus === genus && (l.series || "").toLowerCase() === seriesWord);
    if (existing) await sb.from("sourcing_series_locks").delete().eq("id", existing.id);
    else await sb.from("sourcing_series_locks").insert({ season, genus, series: seriesWord, supplier: supplier || null, grown_before: !!grownBefore, note: variety ? `e.g. ${variety}` : null });
    await loadLocks();
  }

  if (grown == null) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>Loading…</div>;
  const grownGenera = new Set(grown.map(g => g.genus));
  const notGrown = showAll && allGenera ? allGenera.filter(g => !grownGenera.has(g)).map(g => ({ genus: g, label: g.charAt(0).toUpperCase() + g.slice(1) })) : [];

  const CropRow = ({ c, isGrown }) => {
    const list = (rows[c.genus] || []).slice().sort((a, b) => a.landed - b.landed);
    const byForm = {}; list.forEach(r => (byForm[r.form] = byForm[r.form] || []).push(r));
    const lo = list.length ? Math.min(...list.map(r => r.landed)) : null;
    const genusLocks = locks.filter(l => l.genus === c.genus);
    const lockedSeries = new Set(genusLocks.map(l => (l.series || "").toLowerCase()).filter(Boolean));
    return (
      <div style={{ border: `1px solid ${lockedSeries.size ? COLORS.light : COLORS.border}`, borderRadius: 10, marginBottom: 6, overflow: "hidden", background: COLORS.card }}>
        <div onClick={() => expand(c.genus)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", cursor: "pointer" }}>
          <span style={{ color: COLORS.muted, width: 12 }}>{open === c.genus ? "▾" : "▸"}</span>
          <strong style={{ color: COLORS.dark }}>{c.label}</strong>
          {genusLocks.map(l => <span key={l.id} style={{ fontSize: 10, color: "#fff", background: COLORS.light, borderRadius: 10, padding: "1px 8px", fontWeight: 700, textTransform: "capitalize" }}>🔒 {l.series || l.variety}{l.supplier ? ` · ${srcSup(l.supplier)}` : ""}{sels[l.supplier] ? ` (${sels[l.supplier]})` : ""}</span>)}
          {!isGrown && <span style={{ fontSize: 10, color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "1px 7px" }}>don't grow</span>}
        </div>
        {open === c.genus && (
          busy && !rows[c.genus] ? <div style={{ padding: "4px 14px 12px", color: COLORS.muted, fontSize: 12 }}>Loading varieties…</div> :
          !list.length ? <div style={{ padding: "4px 14px 12px", color: COLORS.muted, fontSize: 12 }}>No URC/callused quotes.</div> :
          <div style={{ padding: "0 12px 10px" }}>
            {lockedSeries.size > 0 && <div style={{ fontSize: 11, color: COLORS.muted, margin: "2px 0 6px" }}>🔒 Locked to <strong style={{ textTransform: "capitalize" }}>{[...lockedSeries].join(", ")}</strong> — off-series varieties are dimmed. 🔒 to lock a series · ✓ = grown before.</div>}
            {Object.entries(byForm).map(([form, fl]) => (
              <div key={form} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, margin: "4px 0" }}>{srcFormLabel(form)} <span style={{ fontWeight: 400 }}>({fl.length})</span></div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <tbody>
                    {fl.sort((a, b) => a.landed - b.landed).map((r, i) => {
                      const col = (r.variety.match(SRC_COLORS_RX) || [])[0];
                      const cheap = r.landed === lo;
                      const sw = srcSeriesWord(r.variety);
                      const isLocked = lockedSeries.has(sw);
                      const offSeries = lockedSeries.size > 0 && !isLocked;
                      const grownB = grownVars.has(srcNorm(String(r.variety).split(/\s+/).slice(1).join(" ")));
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${COLORS.border}`, opacity: offSeries ? 0.45 : 1, background: isLocked ? "#f2f8ec" : "transparent" }}>
                          <td style={{ padding: "3px 8px" }}>{r.variety}{col && <span style={{ marginLeft: 6, fontSize: 9.5, color: COLORS.muted, textTransform: "capitalize" }}>{col}</span>}{grownB && <span title="we've grown this before" style={{ marginLeft: 6, fontSize: 9.5, color: COLORS.light, fontWeight: 800 }}>✓ grown</span>}</td>
                          <td style={{ padding: "3px 8px", color: COLORS.muted }}>{srcSup(r.supplier)}</td>
                          <td style={{ padding: "3px 8px", color: srcBrokerColor(r.broker), fontWeight: 700 }}>{r.broker}</td>
                          <td style={{ padding: "3px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.itemMin > 100 ? COLORS.red : COLORS.muted, fontWeight: r.itemMin > 100 ? 700 : 400 }} title="minimum per variety (from the quote)">{r.itemMin ? `min ${r.itemMin.toLocaleString()}` : ""}</td>
                          <td style={{ padding: "3px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", background: cheap ? "#dcedc8" : "transparent", fontWeight: cheap ? 800 : 400 }}>{money(r.landed)}</td>
                          <td style={{ padding: "3px 4px", textAlign: "center" }}><button onClick={() => sw && toggleLock(c.genus, sw, r.supplier, r.variety, grownB)} title={isLocked ? "Unlock this series" : `Lock ${c.label} to the ${sw} series`} style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, opacity: isLocked ? 1 : 0.35 }}>🔒</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: COLORS.text, margin: "4px 0 10px" }}>
        💡 <strong>Compare varieties by cost.</strong> Within each crop, every variety across all suppliers, cheapest first (URC/callused). Use it to swap a pricey variety for an equally-good cheaper one. Showing crops you grow{plan ? "" : " — open from a plan to filter to yours"}.
      </div>
      <label style={{ fontSize: 12, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginBottom: 10 }}>
        <input type="checkbox" checked={showAll} onChange={e => { setShowAll(e.target.checked); if (e.target.checked) loadAllGenera(); }} /> Show crops we don't grow
      </label>
      {grown.length === 0 && !showAll && <div style={{ color: COLORS.muted, fontSize: 13 }}>No crops detected for this plan.</div>}
      {grown.map(c => <CropRow key={c.genus} c={c} isGrown />)}
      {showAll && !allGenera && <div style={{ color: COLORS.muted, fontSize: 12, padding: "6px 0" }}>Loading other crops…</div>}
      {notGrown.length > 0 && <SrcSectionTitle>Crops we don't grow</SrcSectionTitle>}
      {notGrown.map(c => <CropRow key={c.genus} c={c} isGrown={false} />)}
    </div>
  );
}

// Global match/cleanup workspace — search any genus/series/cultivar across ALL brokers &
// suppliers, then consolidate same-genetics listings (checkbox or drag-onto) and archive
// the ones you'll never use. Match groups = supplier|form_class|variety_key.
function SrcMatcher({ sb, onChanged }) {
  const [query, setQuery]       = useState("");
  const [groups, setGroups]     = useState(null);   // current search result groups
  const [busy, setBusy]         = useState(false);
  const [sel, setSel]           = useState(() => new Set()); // selected group ids
  const [drag, setDrag]         = useState(null);   // dragged group id
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);     // archived rows when viewing
  const [msg, setMsg]           = useState("");

  const groupId = g => g.supplier + "|" + g.form + "|" + g.key;

  async function runSearch(qRaw) {
    const q = (qRaw == null ? query : qRaw).trim();
    if (q.length < 2) { setGroups(null); setMsg("Type at least 2 letters — e.g. geranium, calliope, calibrachoa."); return; }
    setBusy(true); setMsg(""); setSel(new Set());
    // pull matching priced listings across all suppliers/brokers (override + archive aware)
    const like = "%" + q + "%";
    const { data } = await sb.from("v_sourcing_prices")
      .select("supplier,form_class,variety_key,variety,crop,broker,landed,has_excl")
      .or(`variety.ilike.${like},crop.ilike.${like}`).limit(2000);
    const gm = {};
    for (const r of (data || [])) {
      const id = r.supplier + "|" + r.form_class + "|" + r.variety_key;
      if (!gm[id]) gm[id] = { supplier: r.supplier, form: r.form_class, key: r.variety_key, variety: r.variety, crop: r.crop, excl: false, prices: {} };
      if (gm[id].prices[r.broker] == null || r.landed < gm[id].prices[r.broker]) gm[id].prices[r.broker] = r.landed;
      if (r.has_excl) gm[id].excl = true;
    }
    // which groups are manual-link targets (so we can offer unlink)
    const { data: ov } = await sb.from("sourcing_overrides").select("supplier,form_class,to_variety_key").eq("season", SRC_SEASON);
    const linked = new Set((ov || []).map(o => o.supplier + "|" + o.form_class + "|" + o.to_variety_key));
    let list = Object.values(gm).map(g => ({ ...g, linked: linked.has(groupId(g)) }));
    list.sort((a, b) => Object.keys(b.prices).length - Object.keys(a.prices).length || (a.variety || "").localeCompare(b.variety || ""));
    setGroups(list); setBusy(false);
    if (showArchived) loadArchived(q);
  }

  async function loadArchived(qRaw) {
    const q = (qRaw == null ? query : qRaw).trim();
    const { data } = await sb.from("sourcing_archived").select("*").eq("season", SRC_SEASON).ilike("variety", "%" + q + "%").limit(500);
    setArchived(data || []);
  }

  function toggle(id) { setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  // Consolidate a set of groups under one canonical key. Must share supplier + form.
  async function consolidate(gs) {
    if (!gs || gs.length < 2) return;
    const sup = gs[0].supplier, form = gs[0].form;
    if (!gs.every(g => g.supplier === sup && g.form === form)) {
      setMsg("Can only merge listings from the same supplier + form. Selected: " +
        [...new Set(gs.map(g => srcSup(g.supplier) + "·" + srcFormLabel(g.form)))].join(", "));
      return;
    }
    const canon = gs.slice().sort((a, b) => (a.variety || "").length - (b.variety || "").length)[0];
    const recs = gs.filter(g => g.key !== canon.key).map(g => ({
      season: SRC_SEASON, supplier: sup, form_class: form, broker: null,
      from_variety_key: g.key, to_variety_key: canon.key, to_variety: canon.variety,
    }));
    if (!recs.length) return;
    setBusy(true);
    const { error } = await sb.from("sourcing_overrides").upsert(recs, { onConflict: "season,supplier,form_class,broker,from_variety_key" });
    setBusy(false);
    if (error) { setMsg("Could not merge: " + error.message); return; }
    setMsg(`Merged ${gs.length} listings under “${canon.variety}”.`);
    onChanged && onChanged();
    runSearch();
  }

  async function unlinkGroup(g) {
    setBusy(true);
    const { error } = await sb.from("sourcing_overrides").delete()
      .eq("season", SRC_SEASON).eq("supplier", g.supplier).eq("form_class", g.form).eq("to_variety_key", g.key);
    setBusy(false);
    if (error) { setMsg("Could not unlink: " + error.message); return; }
    onChanged && onChanged(); runSearch();
  }

  async function archiveGroups(gs) {
    if (!gs.length) return;
    if (!window.confirm(`Archive ${gs.length} listing${gs.length > 1 ? "s" : ""}? They'll be hidden from comparison and matching (restorable from “Show archived”).`)) return;
    const recs = gs.map(g => ({ season: SRC_SEASON, supplier: g.supplier, form_class: g.form, variety_key: g.key, variety: g.variety }));
    setBusy(true);
    const { error } = await sb.from("sourcing_archived").upsert(recs, { onConflict: "season,supplier,form_class,variety_key" });
    setBusy(false);
    if (error) { setMsg("Could not archive: " + error.message); return; }
    setMsg(`Archived ${gs.length} listing${gs.length > 1 ? "s" : ""}.`);
    onChanged && onChanged(); runSearch();
  }

  async function restore(a) {
    setBusy(true);
    await sb.from("sourcing_archived").delete().eq("id", a.id);
    setBusy(false);
    onChanged && onChanged();
    loadArchived(); runSearch();
  }

  const selGroups = (groups || []).filter(g => sel.has(groupId(g)));

  return (
    <div>
      <div style={{ background: "#fff8e8", border: `1px solid ${COLORS.amber}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: COLORS.text, margin: "4px 0 10px" }}>
        🔗 <strong>Match &amp; clean up.</strong> Search a genus, series or cultivar, then merge the same genetics that brokers named differently — <strong>tick two+ and “Consolidate”, or drag one row onto another</strong>. Merges apply instantly and survive every re-parse. Tick listings you'll never use and <strong>Archive</strong> them to hide the clutter.
      </div>

      <form onSubmit={e => { e.preventDefault(); runSearch(); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search geranium, calliope, calibrachoa…"
          style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, fontFamily: "inherit", width: 340, maxWidth: "100%", boxSizing: "border-box" }} />
        <button type="submit" style={{ border: "none", background: COLORS.dark, color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Search</button>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={showArchived} onChange={e => { setShowArchived(e.target.checked); if (e.target.checked) loadArchived(); }} /> Show archived
        </label>
      </form>

      {msg && <div style={{ fontSize: 12.5, color: COLORS.dark, background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>{msg}</div>}

      {sel.size > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 3, display: "flex", gap: 8, alignItems: "center", background: COLORS.dark, color: "#fff", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>{sel.size} selected</strong>
          <button onClick={() => consolidate(selGroups)} disabled={sel.size < 2}
            style={{ border: "none", background: sel.size < 2 ? "#5d6b54" : COLORS.light, color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, fontWeight: 800, cursor: sel.size < 2 ? "default" : "pointer", fontFamily: "inherit" }}>🔗 Consolidate</button>
          <button onClick={() => archiveGroups(selGroups)}
            style={{ border: "none", background: COLORS.amber, color: "#fff", borderRadius: 7, padding: "5px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🗄 Archive</button>
          <button onClick={() => setSel(new Set())} style={{ border: "1px solid #ffffff55", background: "transparent", color: "#fff", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>
        </div>
      )}

      {busy && <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>Working…</div>}
      {groups == null && !busy && <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>Search above to start matching.</div>}
      {groups && groups.length === 0 && !busy && <div style={{ padding: 14, color: COLORS.muted, fontSize: 13 }}>No priced listings match “{query}”.</div>}

      {groups && groups.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: COLORS.muted }}>
              <th style={{ width: 26 }} />
              <th style={{ padding: "4px 8px", fontWeight: 700 }}>Variety</th>
              <th style={{ padding: "4px 8px", fontWeight: 700 }}>Supplier</th>
              <th style={{ padding: "4px 8px", fontWeight: 700 }}>Form</th>
              {SRC_BROKERS.map(b => <th key={b} style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: srcBrokerColor(b) }}>{b}</th>)}
              <th style={{ width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const id = groupId(g);
              const present = SRC_BROKERS.filter(b => g.prices[b] != null);
              const lo = Math.min(...present.map(b => g.prices[b]));
              const checked = sel.has(id);
              const comparable = present.length > 1;
              return (
                <tr key={id} draggable
                  onDragStart={() => setDrag(id)}
                  onDragOver={e => { if (drag && drag !== id) e.preventDefault(); }}
                  onDrop={() => { if (drag && drag !== id) { const a = groups.find(x => groupId(x) === drag); if (a) consolidate([a, g]); } setDrag(null); }}
                  style={{ borderTop: `1px solid ${COLORS.border}`, background: checked ? "#eef6e7" : drag === id ? "#f0f6ea" : comparable ? "#fbfdf9" : "transparent", cursor: "grab" }}>
                  <td style={{ textAlign: "center" }}><input type="checkbox" checked={checked} onChange={() => toggle(id)} /></td>
                  <td style={{ padding: "4px 8px", color: COLORS.text }}>
                    <span title="drag onto another row to merge" style={{ color: COLORS.muted, marginRight: 5 }}>⠿</span>
                    {g.variety}{g.excl && <span title="exclusive" style={{ marginLeft: 6, fontSize: 10, color: COLORS.amber }}>◆</span>}
                    {comparable && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.light, fontWeight: 800 }}>✓{present.length}</span>}
                    {g.linked && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.muted }}>🔗 linked</span>}
                  </td>
                  <td style={{ padding: "4px 8px", color: COLORS.muted }}>{srcSup(g.supplier)}</td>
                  <td style={{ padding: "4px 8px", color: COLORS.muted }}>{srcFormLabel(g.form)}</td>
                  {SRC_BROKERS.map(b => {
                    const v = g.prices[b];
                    const cheapest = v != null && v === lo && comparable;
                    return <td key={b} style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", background: cheapest ? "#dcedc8" : "transparent", fontWeight: cheapest ? 800 : 400, color: v == null ? "#cbd5c0" : COLORS.text }}>{v == null ? "—" : money(v)}</td>;
                  })}
                  <td style={{ padding: "4px 6px", textAlign: "right" }}>
                    {g.linked && <button onClick={() => unlinkGroup(g)} title="break this manual match apart"
                      style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.muted, borderRadius: 6, padding: "1px 7px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>unlink</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showArchived && (
        <div style={{ marginTop: 18 }}>
          <SrcSectionTitle>Archived {archived.length ? `(${archived.length})` : ""}</SrcSectionTitle>
          {archived.length === 0 ? <div style={{ fontSize: 12.5, color: COLORS.muted }}>Nothing archived matches “{query}”.</div> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {archived.map(a => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${COLORS.border}`, color: COLORS.muted }}>
                    <td style={{ padding: "4px 8px" }}>{a.variety || a.variety_key}</td>
                    <td style={{ padding: "4px 8px" }}>{srcSup(a.supplier)}</td>
                    <td style={{ padding: "4px 8px" }}>{srcFormLabel(a.form_class)}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right" }}>
                      <button onClick={() => restore(a)} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 6, padding: "2px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>↩ Restore</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Orders tab — broker order acks ──────────────────────────────────────────
function OrdersTab({ plan }) {
  const sb = getSupabase();
  const [orders, setOrders] = useState([]);
  const [lines,  setLines]  = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: po } = await sb.from("purchase_orders")
        .select("*").eq("plan_id", plan.id).order("ship_date", { ascending: true });
      setOrders(po || []);
      if (po?.length) {
        const ids = po.map(o => o.id);
        const { data: pol } = await sb.from("purchase_order_lines")
          .select("*").in("purchase_order_id", ids).order("line_no");
        setLines(pol || []);
      }
    })();
  }, [sb, plan.id]);

  if (orders.length === 0) {
    return (
      <div style={{ background: COLORS.card, border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: 40, textAlign: "center", color: COLORS.muted }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div>No orders for <strong>{plan.name}</strong> yet.</div>
      </div>
    );
  }

  const grandTotal = orders.reduce((s, o) => s + (+o.total_cost || 0), 0);
  const grandQty   = orders.reduce((s, o) => s + (+o.total_qty || 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Banner */}
      <div style={{ background: COLORS.dark, color: "#fff", borderRadius: 10, padding: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Orders"        value={orders.length}                                              dark />
        <Stat label="Total liners"  value={grandQty.toLocaleString()}                                  dark />
        <Stat label="Total $"       value={fmtMoney(grandTotal)}                                       dark big />
        <Stat label="Amendments"    value={orders.reduce((s, o) => s + (+o.amendment_count || 0), 0)} dark />
      </div>

      {/* Order cards */}
      {orders.map(o => {
        const oLines = lines.filter(l => l.purchase_order_id === o.id);
        const active = oLines.filter(l => l.status === "active");
        const cancelled = oLines.filter(l => l.status === "cancelled");
        const isOpen = expanded === o.id;
        return (
          <div key={o.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
            <div onClick={() => setExpanded(isOpen ? null : o.id)} style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: COLORS.dark }}>
                  Order #{o.order_number} <span style={{ fontSize: 13, color: COLORS.muted, fontWeight: 400 }}>· wk{o.ship_week} · {o.ship_date}</span>
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
                  {o.broker} → {o.supplier} · contact {o.contact} · ordered {o.date_ordered} · {o.terms}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.dark }}>{(+o.total_qty || 0).toLocaleString()} liners</div>
                  <div style={{ fontSize: 12, color: COLORS.light, fontWeight: 700 }}>{fmtMoney(+o.total_cost)}</div>
                </div>
                {o.amendment_count > 0 && (
                  <span style={{ background: COLORS.amber + "22", color: COLORS.amber, border: `1px solid ${COLORS.amber}`, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                    {o.amendment_count} amendment{o.amendment_count > 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: COLORS.muted, fontSize: 16 }}>{isOpen ? "▾" : "▸"}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                {/* Amendment history */}
                {Array.isArray(o.amendment_history) && o.amendment_history.length > 0 && (
                  <div style={{ marginBottom: 14, padding: 10, background: "#fef9ec", borderRadius: 6, border: `1px solid ${COLORS.amber}` }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.amber, marginBottom: 6 }}>AMENDMENT HISTORY</div>
                    {o.amendment_history.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: COLORS.text, marginBottom: 4 }}>
                        <strong>{a.date}:</strong> {a.summary}
                      </div>
                    ))}
                  </div>
                )}

                {/* Active lines */}
                <SimpleTable
                  cols={["#", "Variety", "Qty Ordered", "$/each", "Ext. Price", "Notes"]}
                  aligns={["L", "L", "R", "R", "R", "L"]}
                  rows={active.map(l => [
                    l.line_no, l.variety_name, (+l.qty_ordered).toLocaleString(),
                    "$" + (+l.unit_price).toFixed(3), fmtMoney(+l.ext_price), l.notes || "—",
                  ])}
                  totalRow={["", `${active.length} active`, active.reduce((s,l)=>s+(+l.qty_ordered),0).toLocaleString(), "", fmtMoney(+o.total_cost), ""]}
                />

                {cancelled.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 6, textTransform: "uppercase" }}>
                      Cancelled / dropped from this order
                    </div>
                    <SimpleTable
                      cols={["Variety", "Original price", "Status", "Notes"]}
                      aligns={["L", "R", "L", "L"]}
                      rows={cancelled.map(l => [
                        <span style={{ textDecoration: "line-through", color: COLORS.muted }}>{l.variety_name}</span>,
                        "$" + (+l.unit_price).toFixed(3),
                        <span style={{ color: COLORS.red, fontWeight: 700 }}>CANCELLED</span>,
                        l.notes || "—",
                      ])}
                    />
                  </div>
                )}

                {o.ack_pdf_path && (
                  <div style={{ marginTop: 12, fontSize: 11, color: COLORS.muted, fontFamily: "monospace" }}>
                    Latest ack: <code>{o.ack_pdf_path}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inputs tab — overhead allocations from program_inputs ──────────────────
function InputsTab({ plan }) {
  const sb = getSupabase();
  const [inputs, setInputs] = useState([]);
  const [planTotals, setPlanTotals] = useState({ pots: 0, soilCuFt: 0 });
  const [yearTotals, setYearTotals] = useState({ pots: 0, soilCuFt: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      // Program inputs for this plan's year
      const { data: pi } = await sb.from("program_inputs")
        .select("*").eq("year", plan.year).order("total_cost", { ascending: false, nullsFirst: false });
      setInputs(pi || []);

      // This plan's totals (for allocation math)
      const { data: planRows } = await sb.from("scheduled_crops")
        .select("qty_pots,is_combo_component,combo_parent_id,container_id")
        .eq("plan_id", plan.id);
      const { data: containers } = await sb.from("containers").select("id,fill_volume_cu_ft");

      let planPots = 0, planSoilCuFt = 0;
      for (const r of (planRows || [])) {
        if (r.is_combo_component && r.combo_parent_id) continue;
        const c = containers?.find(x => x.id === r.container_id);
        planPots     += +r.qty_pots || 0;
        planSoilCuFt += (+r.qty_pots || 0) * (+c?.fill_volume_cu_ft || 0);
      }
      setPlanTotals({ pots: planPots, soilCuFt: planSoilCuFt });

      // Year totals (all scheduled_crops for this year) — for proportional allocation
      const { data: yearRows } = await sb.from("scheduled_crops")
        .select("qty_pots,is_combo_component,combo_parent_id,container_id,plant_year");
      let yearPots = 0, yearSoilCuFt = 0;
      for (const r of (yearRows || [])) {
        if (r.plant_year !== plan.year) continue;
        if (r.is_combo_component && r.combo_parent_id) continue;
        const c = containers?.find(x => x.id === r.container_id);
        yearPots     += +r.qty_pots || 0;
        yearSoilCuFt += (+r.qty_pots || 0) * (+c?.fill_volume_cu_ft || 0);
      }
      setYearTotals({ pots: yearPots, soilCuFt: yearSoilCuFt });
      setLoading(false);
    })();
  }, [sb, plan.id, plan.year]);

  if (loading) return <div style={{ padding: 20, color: COLORS.muted }}>Loading inputs…</div>;

  // Allocate each input to this plan
  const allocated = inputs.map(i => {
    const total = +i.total_cost || 0;
    let share = 0, basis = "";
    if (i.allocation_method === "per_pot") {
      share = yearTotals.pots ? (planTotals.pots / yearTotals.pots) * total : 0;
      basis = `${planTotals.pots.toLocaleString()} of ${yearTotals.pots.toLocaleString()} pots`;
    } else {
      share = yearTotals.soilCuFt ? (planTotals.soilCuFt / yearTotals.soilCuFt) * total : 0;
      basis = `${planTotals.soilCuFt.toFixed(0)} of ${yearTotals.soilCuFt.toFixed(0)} cf soil`;
    }
    return { ...i, allocatedShare: share, allocationBasis: basis };
  });
  const totalAllocated = allocated.reduce((s, i) => s + i.allocatedShare, 0);
  const perPot = planTotals.pots ? totalAllocated / planTotals.pots : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 4 }}>
          Inputs · {plan.year} overhead pool · {inputs.length} input(s)
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
          Overhead costs allocated proportionally across all {plan.year} plans (Poinsettia, Mum, future) by either <code>soil_volume</code> or <code>per_pot</code> method.
          This plan's share is computed below.
        </div>

        {/* Mini KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          <MiniKPI label="Year overhead total" value={fmtMoney(inputs.reduce((s, i) => s + (+i.total_cost || 0), 0))} color={COLORS.dark} />
          <MiniKPI label="This plan's share"   value={fmtMoney(totalAllocated)} color={COLORS.light} sub={`${((planTotals.pots / Math.max(1, yearTotals.pots)) * 100).toFixed(1)}% of pots`} />
          <MiniKPI label="Overhead / pot"      value={"$" + perPot.toFixed(3)} color={COLORS.muted} />
          <MiniKPI label="Plan size"           value={planTotals.pots.toLocaleString() + " pots"} color={COLORS.muted} sub={planTotals.soilCuFt.toFixed(0) + " cf soil"} />
        </div>

        {inputs.length === 0 ? (
          <div style={{ color: COLORS.muted, padding: "20px 0" }}>No program_inputs for {plan.year} yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f3f5ef" }}>
                <th style={th}>Input</th>
                <th style={th}>Category</th>
                <th style={th}>Supplier</th>
                <th style={{...th, textAlign:"right"}}>Quantity</th>
                <th style={{...th, textAlign:"right"}}>Total Cost</th>
                <th style={th}>Allocation</th>
                <th style={{...th, textAlign:"right"}}>This plan's share</th>
              </tr>
            </thead>
            <tbody>
              {allocated.map(i => (
                <tr key={i.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={td}><strong>{i.name}</strong></td>
                  <td style={td}>{i.category}</td>
                  <td style={{...td, color: COLORS.muted}}>{i.supplier || "—"}</td>
                  <td style={{...td, textAlign:"right"}}>{i.quantity} {i.unit}</td>
                  <td style={{...td, textAlign:"right", fontWeight: 700, color: COLORS.dark}}>{fmtMoney(+i.total_cost)}</td>
                  <td style={{...td, fontSize: 11}}>
                    <strong>{i.allocation_method}</strong>
                    <div style={{ color: COLORS.muted }}>{i.allocationBasis}</div>
                  </td>
                  <td style={{...td, textAlign:"right", fontWeight: 700, color: COLORS.light}}>{fmtMoney(i.allocatedShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14, padding: 10, background: "#fef9ec", borderRadius: 6, fontSize: 12, color: COLORS.text, border: `1px solid ${COLORS.amber}` }}>
          ⚠️ <strong>Per-pot overhead is NOT yet added to the Dashboard cost rollup.</strong> The Cost Breakdown panel shows direct costs only (liner + pot + soil + ring). Add <code>${perPot.toFixed(2)}/pot</code> mentally for total cost-of-goods including this overhead.
        </div>
        <div style={{ marginTop: 10, padding: 10, background: "#f3f5ef", borderRadius: 6, fontSize: 12, color: COLORS.text }}>
          💡 <strong>Still missing</strong> for full Poinsettia 2026 picture: Molybdenum, Piccolo, labor (pinch/ring install), shipping, sleeves. Add these to <code>program_inputs</code> as you capture the costs and they'll appear here automatically.
        </div>
      </div>
    </div>
  );
}

// ── Profit by Pot Size — strategic decision panel ──────────────────────────
// Key insight: "you sell space, not flowers" — so the right metric is
// profit per sq ft of bench area, NOT profit per pot. A big pot can earn
// a lot but take 3x the space; the comparison must account for footprint.
function ProfitBySize({ planId }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: pl } = await sb.from("v_scheduled_crops_pl")
        .select("container_id,qty_pots,direct_cost_total,revenue,gross_profit,is_combo_component,combo_parent_id")
        .eq("plan_id", planId);
      const { data: containers } = await sb.from("containers").select("id,sku,name,diameter_in,width_in,length_in");

      const bySize = {};
      for (const r of (pl || [])) {
        const c = (containers || []).find(x => x.id === r.container_id);
        const key = c?.sku || "unknown";
        if (!bySize[key]) bySize[key] = {
          sku: key, name: c?.name, diameter: +c?.diameter_in || 0,
          width: +c?.width_in || 0, length: +c?.length_in || 0,
          pots: 0, cost: 0, revenue: 0, profit: 0,
        };
        const isChild = r.is_combo_component && r.combo_parent_id;
        bySize[key].pots    += isChild ? 0 : (+r.qty_pots || 0);
        bySize[key].cost    += (+r.direct_cost_total || 0);
        bySize[key].revenue += (+r.revenue || 0);
        bySize[key].profit  += (+r.gross_profit || 0);
      }

      // Square footprint: round pots → (diameter/12)²; flats/inserts/baskets without a
      // diameter → width × length / 144. Else 0 (truly no dims = "incomplete").
      const arr = Object.values(bySize).map(r => {
        const potFootprint = r.diameter ? Math.pow(r.diameter / 12, 2)
          : (r.width && r.length ? (r.width * r.length) / 144 : 0);
        const benchSqFt    = r.pots * potFootprint;
        return {
          ...r,
          potFootprint,
          benchSqFt,
          costPerPot:     r.pots ? r.cost / r.pots : 0,
          profitPerPot:   r.pots ? r.profit / r.pots : 0,
          profitPerSqFt:  benchSqFt ? r.profit / benchSqFt : 0,
          revenuePerSqFt: benchSqFt ? r.revenue / benchSqFt : 0,
          margin: r.revenue ? r.profit / r.revenue * 100 : 0,
        };
      }).sort((a,b) => b.profitPerSqFt - a.profitPerSqFt);

      // Tag each row with a recommendation based on $/sqft percentile.
      // Top third: EXPAND, middle: HOLD, bottom third: REDUCE.
      // Special-case "data incomplete" — when profit is 0 or near-0 due to missing costs.
      const validRows = arr.filter(r => r.profitPerSqFt > 0);
      const maxSqFt   = validRows.length ? Math.max(...validRows.map(r => r.profitPerSqFt)) : 0;
      const sortedSqFt = [...validRows].map(r => r.profitPerSqFt).sort((a,b) => b - a);
      const topThreshold = sortedSqFt[Math.floor(sortedSqFt.length / 3)] || 0;
      const botThreshold = sortedSqFt[Math.floor(sortedSqFt.length * 2 / 3)] || 0;
      for (const r of arr) {
        if (r.profitPerSqFt === 0 || !r.revenue) { r.rec = "incomplete"; r.recColor = COLORS.muted; }
        else if (r.profitPerSqFt >= topThreshold) { r.rec = "EXPAND"; r.recColor = COLORS.light; }
        else if (r.profitPerSqFt >= botThreshold) { r.rec = "HOLD"; r.recColor = COLORS.amber; }
        else { r.rec = "REDUCE"; r.recColor = COLORS.red; }
      }
      setRows(arr);
      setLoading(false);
    })();
  }, [sb, planId]);

  if (loading) return null;
  if (!rows.length) return null;

  const maxSqFt = Math.max(...rows.map(r => r.profitPerSqFt));

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 4 }}>
        Profit by pot size · expand vs reduce decisions
      </div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
        Sorted by <strong>profit per sq ft of bench area</strong> — the true measure of greenhouse-space ROI. "You sell space, not flowers."
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f3f5ef" }}>
            <th style={th}>Container</th>
            <th style={{...th, textAlign:"right"}}>Pots</th>
            <th style={{...th, textAlign:"right"}}>Bench Sq Ft</th>
            <th style={{...th, textAlign:"right"}}>Profit</th>
            <th style={{...th, textAlign:"right"}}>Cost / Pot</th>
            <th style={{...th, textAlign:"right"}}>Profit / Pot</th>
            <th style={{...th, textAlign:"right", color: COLORS.dark}}>$ / Sq Ft 📊</th>
            <th style={{...th, textAlign:"right"}}>Margin</th>
            <th style={{...th, textAlign:"center"}}>Recommendation</th>
            <th style={th}>$ / sq ft (relative)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.sku} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <td style={td}><strong>{r.sku}</strong> <span style={{ color: COLORS.muted, fontSize: 11 }}>{r.name}</span></td>
              <td style={{...td, textAlign:"right"}}>{r.pots.toLocaleString()}</td>
              <td style={{...td, textAlign:"right"}}>{r.benchSqFt.toFixed(0)}</td>
              <td style={{...td, textAlign:"right", fontWeight: 700, color: COLORS.dark}}>{fmtMoney(r.profit)}</td>
              <td style={{...td, textAlign:"right", color: COLORS.muted}}>${r.costPerPot.toFixed(2)}</td>
              <td style={{...td, textAlign:"right", fontWeight: 700}}>${r.profitPerPot.toFixed(2)}</td>
              <td style={{...td, textAlign:"right", fontWeight: 800, color: COLORS.dark, fontSize: 14}}>${r.profitPerSqFt.toFixed(2)}</td>
              <td style={{...td, textAlign:"right"}}>{fmtPct(r.margin)}</td>
              <td style={{...td, textAlign:"center"}}>
                <span style={{
                  background: r.recColor + "22", border: `1.5px solid ${r.recColor}`, color: r.recColor,
                  padding: "3px 10px", borderRadius: 10, fontWeight: 800, fontSize: 11, letterSpacing: 0.3,
                }}>{r.rec}</span>
              </td>
              <td style={td}>
                <div style={{ width: "100%", background: "#f0ede2", height: 10, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${maxSqFt ? (r.profitPerSqFt / maxSqFt * 100) : 0}%`, height: "100%", background: r.recColor }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 12, padding: 12, background: "#f3f5ef", borderRadius: 6, fontSize: 12, color: COLORS.text, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 800, color: COLORS.light, fontSize: 13, marginBottom: 4 }}>🟢 EXPAND</div>
          <div>Top third of $/sq-ft earners. These sizes return the most money per inch of bench area — fill more space with these where possible.</div>
        </div>
        <div>
          <div style={{ fontWeight: 800, color: COLORS.amber, fontSize: 13, marginBottom: 4 }}>🟡 HOLD</div>
          <div>Middle performance. Solid earners — maintain current allocation but don't expand at the expense of higher-tier sizes.</div>
        </div>
        <div>
          <div style={{ fontWeight: 800, color: COLORS.red, fontSize: 13, marginBottom: 4 }}>🔴 REDUCE</div>
          <div>Bottom third. Each sq ft devoted to these earns less than alternatives. Consider reducing volume to free space for EXPAND-tier sizes.</div>
        </div>
      </div>
      <div style={{ marginTop: 10, padding: 10, background: "#fef9ec", borderRadius: 6, fontSize: 12, color: COLORS.text, border: `1px solid ${COLORS.amber}` }}>
        ⚠️ Footprint estimate: (diameter ÷ 12)² square ft, square-packing assumption. Actual bench utilization (aisles, walking room, ring overhang) means real footprint is ~30% larger — relative rankings are still valid but absolute $/sqft will be a bit lower in practice.
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KPI({ label, value, color, sub }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, marginTop: 4, fontFamily: "'DM Serif Display', serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Cost Breakdown panel ────────────────────────────────────────────────────
// Only shows line items that exist for THIS plan. No hardcoded poinsettia-only TODOs.
function CostBreakdown({ pl }) {
  const lines = [
    { label: "Liner cost", value: pl.liner },
    { label: "Pot cost",   value: pl.pot },
    { label: "Soil cost",  value: pl.soil },
    { label: "Ring cost",  value: pl.ring },
  ].filter(r => r.value > 0);
  const total = lines.reduce((s, r) => s + r.value, 0);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 10 }}>
        Direct cost breakdown · this plan only
      </div>
      {lines.length === 0 ? (
        <div style={{ color: COLORS.muted, padding: "12px 0" }}>No direct cost data yet for this plan.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div>
            {lines.map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <span style={{ color: COLORS.text }}>{r.label}</span>
                <span style={{ fontWeight: 700, color: COLORS.dark }}>{fmtMoney(r.value)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 4 }}>
              <span style={{ fontWeight: 800, color: COLORS.dark }}>Subtotal direct</span>
              <span style={{ fontWeight: 800, color: COLORS.dark }}>{fmtMoney(total)}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.5 }}>
            <strong style={{ color: COLORS.text }}>Overhead allocation</strong> (fertilizer, PGRs, labor, freight, sleeves, etc.) lives in the ⚙ Inputs tab. Allocated share for this plan + per-pot estimate are computed there.
            <br /><br />
            <strong style={{ color: COLORS.text }}>Materials totals + ordering quantities</strong> are in the 📦 Materials tab.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Property Map (SVG) ──────────────────────────────────────────────────────
// Two side-by-side SVG diagrams: Bluff (west) and Sprague (east).
// Each house = a rectangle positioned by layout_x/y, sized by width_ft/length_ft.
// Color = profit density (gross_profit / sq_ft).
const SCALE = 0.6;  // px per ft — controls overall diagram size
function PropertyMap({ houses, housesProfit, onHouseClick, highlight, flaggedHouses }) {
  if (!houses?.length) return null;
  const bluff   = houses.filter(h => h.location === "Bluff Road");
  const sprague = houses.filter(h => h.location === "Sprague Road");

  function profitForHouse(h) {
    const rec = housesProfit.find(r => r.house === h.name);
    if (!rec) return null;
    const sqft = (h.width_ft || 0) * (h.length_ft || 0);
    return sqft ? rec.profit / sqft : null;
  }

  function bounds(buildings) {
    if (!buildings.length) return { w: 100, h: 100 };
    const maxX = Math.max(...buildings.map(b => (+b.layout_x || 0) + (+b.width_ft || 0)));
    const maxY = Math.max(...buildings.map(b => (+b.layout_y || 0) + (+b.length_ft || 0)));
    return { w: maxX + 40, h: maxY + 40 };
  }

  const bb = bounds(bluff);
  const sb = bounds(sprague);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 10 }}>
        Property map · profit density (color)
      </div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
        Darker green = higher profit per sq-ft. Hover for details · click a house to drill in.
        Dimensions are <strong>estimates</strong> — corrections welcome.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `${bb.w*SCALE+20}px ${sb.w*SCALE+20}px`, gap: 24, overflowX: "auto" }}>
        <PropertySVG label="Bluff Road"   buildings={bluff}   bounds={bb} profitFor={profitForHouse} onHouseClick={onHouseClick} highlight={highlight} flaggedHouses={flaggedHouses} />
        <PropertySVG label="Sprague Road" buildings={sprague} bounds={sb} profitFor={profitForHouse} onHouseClick={onHouseClick} highlight={highlight} flaggedHouses={flaggedHouses} />
      </div>

      {/* Color legend */}
      <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted }}>Profit / sq-ft:</span>
        {[
          ["≤ $0", "#e8c4c4"], ["< $1", "#fff3e0"], ["$1-3", "#dcedc8"],
          ["$3-6", "#a5d6a7"], ["$6-10", "#66bb6a"], ["$10-20", "#388e3c"], ["$20+", "#1b5e20"],
        ].map(([k, c]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 16, height: 16, background: c, border: "1px solid #888" }} />
            <span style={{ fontSize: 11, color: COLORS.text }}>{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PropertySVG({ label, buildings, bounds, profitFor, onHouseClick, highlight, flaggedHouses }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: COLORS.dark }}>{label}</div>
      <svg width={bounds.w * SCALE} height={bounds.h * SCALE} style={{ background: "#f3f5ef", border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
        {buildings.map(b => {
          const profitDensity = profitFor(b);
          const fill = profitColor(profitDensity);
          const x = (+b.layout_x || 0) * SCALE;
          const y = (+b.layout_y || 0) * SCALE;
          const w = (+b.width_ft || 0) * SCALE;
          const h = (+b.length_ft || 0) * SCALE;
          const isPad = b.type === "pad";
          const hl = highlight ? (highlight[b.name] || 0) : 0;
          return (
            <g key={b.id} onClick={() => onHouseClick?.(b.name)} style={{ cursor: "pointer" }}>
              <rect x={x} y={y} width={w} height={h}
                fill={fill}
                opacity={highlight && !hl ? 0.35 : 1}
                stroke={hl ? "#e89a3a" : (isPad ? "#a8a8a8" : "#3a4a32")}
                strokeWidth={hl ? 3 : (isPad ? 1 : 1.5)}
                strokeDasharray={isPad && !hl ? "4 3" : "none"}
              />
              {w > 30 && h > 20 && (
                <text x={x + w/2} y={y + h/2} textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: Math.min(10, w/8), fontWeight: 600, fill: "#1e2d1a", pointerEvents: "none" }}>
                  {shortName(b.name)}
                </text>
              )}
              {hl ? (<>
                <circle cx={x + w - 7} cy={y + 7} r={7.5} fill="#e89a3a" stroke="#fff" strokeWidth={1} style={{ pointerEvents: "none" }} />
                <text x={x + w - 7} y={y + 7} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fontWeight: 800, fill: "#fff", pointerEvents: "none" }}>{hl}</text>
              </>) : null}
              {flaggedHouses?.has(b.name) && <text x={x + 8} y={y + 9} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, pointerEvents: "none" }}>🚩</text>}
              <title>{b.name} · {b.width_ft}×{b.length_ft} ft{profitDensity != null ? ` · $${profitDensity.toFixed(2)}/sqft` : ""}{hl ? ` · ${hl} match(es)` : ""}{flaggedHouses?.has(b.name) ? " · 🚩 has fix-next-year notes" : ""}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function shortName(name) {
  return name.replace("Bluff Quonset ", "Q")
             .replace("Bluff Main Range", "Main")
             .replace("Sprague Main Range", "Main")
             .replace("Sprague West Side", "West")
             .replace("Sprague North Quonset", "N.Q")
             .replace("Sprague South Quonset", "S.Q")
             .replace("Bluff North Pad", "N. Pad")
             .replace("Bluff North East Back Pad", "NE Back")
             .replace("Bluff South East Pad", "SE Pad")
             .replace("Bluff South East Back Pad", "SE Back")
             .replace("Bluff South Middle Pad", "S. Mid")
             .replace("Bluff South West Outdoor Pad", "SW Out")
             .replace("Bluff West Pad (Outdoor)", "W. Pad");
}

// ── House Drilldown panel ───────────────────────────────────────────────────
// Top-down combo planting diagram: center plant + alternating ring.
// Color a basket position by the plant/color name in its label.
function plantColor(name) {
  const s = String(name || "").toLowerCase();
  if (/pink|rose|blush/.test(s)) return "#e87fa8";
  if (/purple|violet|lavender|plum/.test(s)) return "#8e5fb0";
  if (/white|amethyst|cream|frost/.test(s)) return "#e8ede2";
  if (/yellow|gold|lemon/.test(s)) return "#e6c84a";
  if (/red|crimson|scarlet|wine/.test(s)) return "#d94f3d";
  if (/blue|denim/.test(s)) return "#4a7fc0";
  if (/orange|apricot|sunburst|coral/.test(s)) return "#e8943a";
  return null;
}
const PALE = new Set(["#e8ede2", "#e6c84a"]); // light fills → dark number text
const PALETTE = ["#7fb069", "#8e5fb0", "#e89a3a", "#4a7fc0", "#d94f3d", "#2e8b8b", "#b06fa0"]; // per-plant fallback
const LET = i => String.fromCharCode(65 + (i % 26)); // plant reference letter A,B,C…
// Round hanging-basket planting diagram. Schema:
//   { plants:["Pink","Purple",...], center:<idx|null>, rings:[[idx...],...] (outer→in),
//     edge:{plant:<idx>,count:N} (rim, evenly spread — e.g. dichondra), howto }
// Dots are numbered (legend below maps number→plant); colored by color-word in the
// name, else a distinct palette color per plant so every plant reads differently.
export function ComboDiagram({ layout }) {
  const plants = layout.plants;
  if (!plants) return null; // old-format layouts are migrated to this schema
  const COLS = plants.map((p, i) => plantColor(p) || PALETTE[i % PALETTE.length]);
  const counts = plants.map(() => 0);
  if (layout.dots) layout.dots.forEach(d => { counts[d.plant]++; });
  else { if (layout.center != null) counts[layout.center]++; (layout.rings || []).forEach(r => r.forEach(pi => counts[pi]++)); if (layout.edge && layout.edge.count) counts[layout.edge.plant] += layout.edge.count; }
  const cx = 110, cy = 110, RB = 96;
  const dot = (x, y, r, n, fill, key) => (
    <g key={key}>
      <circle cx={x} cy={y} r={r} fill={fill} stroke="#fff" strokeWidth="2" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: r * 0.95, fontWeight: 800, fill: PALE.has(fill) ? "#5a6a54" : "#fff" }}>{n}</text>
    </g>
  );
  const els = [
    <circle key="rim" cx={cx} cy={cy} r={RB} fill="#f7faf3" stroke="#b9c9ad" strokeWidth="2" />,
    <circle key="rim2" cx={cx} cy={cy} r={RB - 5} fill="none" stroke="#dde7d3" strokeWidth="1" />,
  ];
  if (layout.dots) {
    // hand-placed positions (from the basket designer): normalized 0..1 → basket circle
    layout.dots.forEach((d, i) => els.push(dot(cx + (d.x - 0.5) * 2 * RB, cy + (d.y - 0.5) * 2 * RB, 15, LET(d.plant), COLS[d.plant], "d" + i)));
  } else {
    // edge plants on the rim (evenly spread)
    if (layout.edge && layout.edge.count) { const { plant, count } = layout.edge; for (let i = 0; i < count; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / count; els.push(dot(cx + (RB - 13) * Math.cos(a), cy + (RB - 13) * Math.sin(a), 13, LET(plant), COLS[plant], "e" + i)); } }
    // concentric rings — spread out: outer pushed further, inner given more room
    (layout.rings || []).forEach((ring, ri) => { const R = RB * (0.64 - ri * 0.30); const off = ri % 2 ? Math.PI / (ring.length || 1) : 0; ring.forEach((pi, i) => { const a = -Math.PI / 2 + off + i * 2 * Math.PI / (ring.length || 1); els.push(dot(cx + R * Math.cos(a), cy + R * Math.sin(a), 16, LET(pi), COLS[pi], `r${ri}_${i}`)); }); });
    if (layout.center != null) els.push(dot(cx, cy, 18, LET(layout.center), COLS[layout.center], "c"));
  }
  return (
    <div>
      <svg width="220" height="220" viewBox="0 0 220 220" style={{ flexShrink: 0 }}>{els}</svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 6 }}>
        {plants.map((p, i) => (
          <span key={i} style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ display: "inline-flex", width: 17, height: 17, borderRadius: 9, background: COLS[i], color: PALE.has(COLS[i]) ? "#5a6a54" : "#fff", fontSize: 10, fontWeight: 800, alignItems: "center", justifyContent: "center" }}>{LET(i)}</span>
            {p} <span style={{ color: COLORS.muted, fontWeight: 700 }}>×{counts[i]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Item detail + LIVE culture (reads the linked guide from the Culture DB each time,
// so parser updates flow through automatically) + combo planting diagram.
// ── Culture/crop-protection helpers (shared) ─────────────────────────────────
const FINISH_LABELS = {
  size_4_inch: '4"', size_5_inch: '5"', size_6_inch: '6"', size_6_5_inch: '6.5"', size_8_inch: '8"',
  size_10_inch: '10"', size_11_inch: '11"', size_12_inch: '12"', size_1_gallon: "1 gal", size_2_gallon: "2 gal",
  basket_10_inch: '10" basket', basket_12_inch: '12" basket',
};
function finishWeeks(v) {
  if (!v || typeof v !== "object") return null;
  const lo = v.lower ?? v.weeks_lower, hi = v.upper ?? v.weeks_upper;
  if (lo == null && hi == null) return null;
  return (lo != null && hi != null && lo !== hi) ? `${lo}–${hi} wk` : `${lo ?? hi} wk`;
}
function cpNorm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function cpMatch(term, control) {
  const a = cpNorm(term), b = cpNorm(control);
  if (a.length < 3 || b.length < 3) return false;
  const as = a.replace(/s$/, ""), bs = b.replace(/s$/, "");
  return a.includes(b) || b.includes(a) || as.includes(bs) || bs.includes(as);
}
function splitTerms(val) {
  if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(s => s.length > 2);
  return String(val || "").split(/[,;\n•·]| and /i).map(s => s.trim()).filter(s => s.length > 2);
}

// Self-contained SVG of a basket diagram (Supabase serves .svg as image/svg+xml, so it
// renders on any phone with no login — unlike .html which it serves as text/plain).
const escXml = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const comboSlug = s => String(s || "combo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "combo";
function comboShareSVG(layout, title, recipe) {
  const plants = layout.plants || [];
  const COLS = plants.map((p, i) => plantColor(p) || PALETTE[i % PALETTE.length]);
  const counts = plants.map(() => 0);
  if (layout.dots) layout.dots.forEach(d => { counts[d.plant]++; });
  else { if (layout.center != null) counts[layout.center]++; (layout.rings || []).forEach(r => r.forEach(pi => counts[pi]++)); if (layout.edge && layout.edge.count) counts[layout.edge.plant] += layout.edge.count; }
  const W = 360, cx = 180, cy = 158, RB = 96; const dots = [];
  const push = (x, y, r, pi) => dots.push({ x, y, r, pi });
  if (layout.dots) layout.dots.forEach(d => push(cx + (d.x - 0.5) * 2 * RB, cy + (d.y - 0.5) * 2 * RB, 15, d.plant));
  else {
    if (layout.edge && layout.edge.count) { const { plant, count } = layout.edge; for (let i = 0; i < count; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / count; push(cx + (RB - 13) * Math.cos(a), cy + (RB - 13) * Math.sin(a), 13, plant); } }
    (layout.rings || []).forEach((ring, ri) => { const R = RB * (0.64 - ri * 0.30); const off = ri % 2 ? Math.PI / (ring.length || 1) : 0; ring.forEach((pi, i) => { const a = -Math.PI / 2 + off + i * 2 * Math.PI / (ring.length || 1); push(cx + R * Math.cos(a), cy + R * Math.sin(a), 16, pi); }); });
    if (layout.center != null) push(cx, cy, 18, layout.center);
  }
  const dotSvg = dots.map(d => `<circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="${d.r}" fill="${COLS[d.pi]}" stroke="#fff" stroke-width="2"/><text x="${d.x.toFixed(1)}" y="${d.y.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(d.r * 0.95)}" font-weight="800" fill="${PALE.has(COLS[d.pi]) ? "#5a6a54" : "#fff"}">${LET(d.pi)}</text>`).join("");
  let y = 280;
  const legend = plants.map((p, i) => { const ly = y + i * 28; return `<circle cx="26" cy="${ly}" r="12" fill="${COLS[i]}"/><text x="26" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="${PALE.has(COLS[i]) ? "#5a6a54" : "#fff"}">${LET(i)}</text><text x="46" y="${ly}" dominant-baseline="central" font-size="15" fill="#1e2d1a">${escXml(p)}  &#215;${counts[i]}</text>`; }).join("");
  y += plants.length * 28 + 6;
  const words = String(layout.howto || "").split(/\s+/).filter(Boolean); const lines = []; let cur = "";
  words.forEach(w => { if ((cur + " " + w).length > 52) { if (cur) lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }); if (cur) lines.push(cur);
  const howSvg = lines.map((ln, i) => `<text x="16" y="${y + 12 + i * 19}" font-size="13" fill="#3a4a32">${escXml(ln)}</text>`).join("");
  const H = y + 12 + lines.length * 19 + 26;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,sans-serif"><rect width="${W}" height="${H}" fill="#f2f5ef"/><text x="16" y="30" font-size="19" font-weight="800" fill="#1e2d1a">${escXml(title)}</text><text x="16" y="50" font-size="12" fill="#7a8c74">${escXml(recipe || "")}</text><circle cx="${cx}" cy="${cy}" r="${RB}" fill="#f7faf3" stroke="#b9c9ad" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${RB - 5}" fill="none" stroke="#dde7d3"/>${dotSvg}${legend}${howSvg}<text x="16" y="${H - 10}" font-size="11" fill="#aab39f">Schlegel Greenhouse · planting diagram</text></svg>`;
}
async function shareComboDiagram(row, planId, recipe) {
  const sb = getSupabase();
  if (!sb || !row?.planting_layout) { window.alert("Nothing to share yet."); return null; }
  const svg = comboShareSVG(row.planting_layout, row.item_name || "Combo", recipe || "");
  const path = `${planId || "x"}/${comboSlug(row.item_name)}.svg`;
  const { error } = await sb.storage.from("combo-diagrams").upload(path, new Blob([svg], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: true });
  if (error) { window.alert("Share failed: " + error.message); return null; }
  return sb.storage.from("combo-diagrams").getPublicUrl(path).data.publicUrl;
}

// Drag-to-place basket designer — move plant dots anywhere in the basket, add/remove, lock & save.
function BasketDesigner({ layout, plantNames, onSave, onClose }) {
  const plants = (layout.plants && layout.plants.length) ? layout.plants : (plantNames || []);
  const COLS = plants.map((p, i) => plantColor(p) || PALETTE[i % PALETTE.length]);
  const cx = 130, cy = 130, RB = 118, dotR = 15, VB = 260;
  const seed = () => {
    if (layout.dots) return layout.dots.map(d => ({ ...d }));
    const ds = [];
    if (layout.center != null) ds.push({ plant: layout.center, x: 0.5, y: 0.5 });
    (layout.rings || []).forEach((ring, ri) => { const R = 0.34 - ri * 0.15; const off = ri % 2 ? Math.PI / (ring.length || 1) : 0; ring.forEach((pi, i) => { const a = -Math.PI / 2 + off + i * 2 * Math.PI / (ring.length || 1); ds.push({ plant: pi, x: 0.5 + R * Math.cos(a), y: 0.5 + R * Math.sin(a) }); }); });
    if (layout.edge && layout.edge.count) { const { plant, count } = layout.edge; for (let i = 0; i < count; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / count; ds.push({ plant, x: 0.5 + 0.45 * Math.cos(a), y: 0.5 + 0.45 * Math.sin(a) }); } }
    return ds;
  };
  const [dots, setDots] = useState(seed);
  const [drag, setDrag] = useState(null);
  const [sel, setSel] = useState(null);
  const svgRef = useRef(null);
  const toNorm = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    const sx = (clientX - r.left) * (VB / r.width), sy = (clientY - r.top) * (VB / r.height);
    let dx = sx - cx, dy = sy - cy; const dist = Math.hypot(dx, dy) || 1; const max = RB - dotR;
    if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
    return { x: dx / (2 * RB) + 0.5, y: dy / (2 * RB) + 0.5 };
  };
  const move = e => { if (drag == null) return; const n = toNorm(e.clientX, e.clientY); setDots(ds => ds.map((d, i) => i === drag ? { ...d, ...n } : d)); };
  // Alignment helpers: place dots on a ring at normalized radius R (0=center, ~0.5=rim), evenly spaced.
  const ringPlace = (arr, R, off = 0) => arr.map((d, i) => { const a = -Math.PI / 2 + off + i * 2 * Math.PI / (arr.length || 1); return { ...d, x: 0.5 + R * Math.cos(a), y: 0.5 + R * Math.sin(a) }; });
  const spaceEvenly = () => { // one ring, interleaved by plant so colors sit across from each other
    const byPlant = {}; dots.forEach(d => { (byPlant[d.plant] = byPlant[d.plant] || []).push(d); });
    const order = []; let added = true; while (added) { added = false; Object.keys(byPlant).sort((a, b) => a - b).forEach(k => { if (byPlant[k].length) { order.push(byPlant[k].shift()); added = true; } }); }
    setDots(ringPlace(order, 0.34));
  };
  const concentric = () => { // each plant on its own ring, inner→outer (last plant, e.g. dichondra, to the rim)
    const present = [...new Set(dots.map(d => d.plant))].sort((a, b) => a - b); const out = [];
    present.forEach((pi, idx) => { const grp = dots.filter(d => d.plant === pi); const R = present.length <= 1 ? 0.34 : (0.13 + idx * (0.38 / (present.length - 1))); out.push(...ringPlace(grp, R, idx % 2 ? Math.PI / (grp.length || 1) : 0)); });
    setDots(out);
  };
  return (
    <div style={{ padding: 4 }}>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>Drag a plant to position · tap a plant below to add one · double-click a dot to remove · then Lock & save.</div>
      <svg ref={svgRef} width="260" height="260" viewBox="0 0 260 260" style={{ touchAction: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10, background: "#fff" }}
        onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
        <circle cx={cx} cy={cy} r={RB} fill="#f7faf3" stroke="#b9c9ad" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={RB - 6} fill="none" stroke="#dde7d3" strokeWidth="1" />
        {dots.map((d, i) => { const x = cx + (d.x - 0.5) * 2 * RB, y = cy + (d.y - 0.5) * 2 * RB; return (
          <g key={i} style={{ cursor: "grab" }} onPointerDown={e => { e.preventDefault(); setDrag(i); setSel(i); }} onDoubleClick={() => { setDots(ds => ds.filter((_, j) => j !== i)); setSel(null); }}>
            <circle cx={x} cy={y} r={dotR} fill={COLS[d.plant]} stroke={sel === i ? COLORS.dark : "#fff"} strokeWidth={sel === i ? 3 : 2} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 13, fontWeight: 800, fill: PALE.has(COLS[d.plant]) ? "#5a6a54" : "#fff", pointerEvents: "none" }}>{LET(d.plant)}</text>
          </g>
        ); })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
        <button onClick={spaceEvenly} style={{ padding: "5px 10px", border: `1px solid ${COLORS.dark}`, borderRadius: 8, background: "#f3f8ee", color: COLORS.dark, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>⊙ Space evenly in a circle</button>
        <button onClick={concentric} style={{ padding: "5px 10px", border: `1px solid ${COLORS.dark}`, borderRadius: 8, background: "#f3f8ee", color: COLORS.dark, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>◎ Rings by plant</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
        {plants.map((p, i) => (
          <button key={i} onClick={() => setDots(ds => [...ds, { plant: i, x: 0.5, y: 0.5 }])} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 16, background: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: COLS[i], color: PALE.has(COLS[i]) ? "#5a6a54" : "#fff", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{LET(i)}</span>
            + {p} <span style={{ color: COLORS.muted }}>×{dots.filter(d => d.plant === i).length}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave({ plants, dots, howto: layout.howto || "" })} style={{ padding: "8px 16px", background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>🔒 Lock &amp; save</button>
        <button onClick={onClose} style={{ padding: "8px 16px", background: "#fff", color: COLORS.text, border: `1px solid ${COLORS.border}`, borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

// ---------- Bench Prep — spacing + irrigation-tube setup per crop, with a to-scale diagram ----------
// Poinsettias entered by hand; other crops auto-compute pots/bench from spacing + bench size. Tubes are
// doubled/tripled and kept uniform (not repositioned). Staged: start tight, space out later.
const BP_MODES = [["centers", "Center-to-center (in)"], ["count", "Pots per bench (manual)"], ["density", "Pots per sq ft"]];
const bpArea = (bw, bl) => (bw * bl) / 144; // sq ft
function bpCount(mode, st, bw, bl) {
  if (mode === "count") return +st.count || 0;
  if (mode === "density") return Math.round((+st.density || 0) * bpArea(bw, bl));
  const w = +st.w_in || 0, l = +st.l_in || 0;
  if (!w || !l || !bw || !bl) return 0;
  return Math.max(0, Math.floor(bw / w) * Math.floor(bl / l));
}
function BenchDiagram({ bw, bl, mode, st, tubes, potIn }) {
  if (!bw || !bl) return <div style={{ color: COLORS.muted, fontSize: 12, padding: "18px 0" }}>Enter bench size to see the layout.</div>;
  const MAXW = 440, scale = MAXW / bw, W = bw * scale, H = bl * scale;
  const pots = [];
  if (mode === "centers" && +st.w_in && +st.l_in) {
    const dw = +st.w_in, dl = +st.l_in, cols = Math.floor(bw / dw), rows = Math.floor(bl / dl);
    const offX = (bw - (cols - 1) * dw) / 2, offY = (bl - (rows - 1) * dl) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let x = offX + c * dw; const y = offY + r * dl;
      if (st.staggered && r % 2) { x += dw / 2; if (x > bw - offX / 2) continue; }
      pots.push([x * scale, y * scale]);
    }
  } else {
    const n = bpCount(mode, st, bw, bl);
    if (n > 0) { const cols = Math.max(1, Math.round(Math.sqrt(n * bw / bl))), rows = Math.ceil(n / cols), dw = bw / cols, dl = bl / rows; let k = 0; for (let r = 0; r < rows && k < n; r++) for (let c = 0; c < cols && k < n; c++, k++) pots.push([dw * (c + 0.5) * scale, dl * (r + 0.5) * scale]); }
  }
  const pr = Math.max(1.5, (potIn ? potIn / 2 : Math.min(+st.w_in || 4, +st.l_in || 4) * 0.42) * scale);
  const tubeXs = Array.from({ length: tubes || 1 }, (_, t) => ((t + 1) / ((tubes || 1) + 1)) * W);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: MAXW, border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "#fafcf8", display: "block" }}>
      {tubeXs.map((x, i) => <line key={"t" + i} x1={x} y1={0} x2={x} y2={H} stroke="#4a90d9" strokeWidth="2" strokeDasharray="6 4" />)}
      {pots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={pr} fill="#7fb069" fillOpacity="0.5" stroke="#5a8048" strokeWidth="0.7" />)}
    </svg>
  );
}
function BpProfileCard({ p, onChange }) {
  const sb = getSupabase();
  const [d, setD] = useState(() => ({ ...p, stages: (p.stages && p.stages.length) ? p.stages : [{ label: "Final", w_in: "", l_in: "", staggered: false, count: "", density: "", week: "", note: "" }] }));
  const [status, setStatus] = useState("");
  const set = (k, v) => { setD(x => ({ ...x, [k]: v })); setStatus(""); };
  const setStage = (i, k, v) => { setD(x => ({ ...x, stages: x.stages.map((s, j) => j === i ? { ...s, [k]: v } : s) })); setStatus(""); };
  const addStage = () => setD(x => ({ ...x, stages: [{ label: "Tight (pot-to-pot)", w_in: "", l_in: "", staggered: false, count: "", density: "", week: "", note: "" }, ...x.stages] }));
  const delStage = i => setD(x => ({ ...x, stages: x.stages.filter((_, j) => j !== i) }));
  const potIn = parseFloat(String(d.container_ref || "").replace(/[^\d.]/g, "")) || null;
  const bw = +d.bench_w_in || 0, bl = +d.bench_l_in || 0;
  async function save() {
    setStatus("saving…");
    const { error } = await sb.from("spacing_profiles").update({ name: d.name || `${d.crop_ref} ${d.container_ref}`.trim(), crop_ref: d.crop_ref, container_ref: d.container_ref, input_mode: d.input_mode, tubes_per_bench: +d.tubes_per_bench || 1, bench_w_in: +d.bench_w_in || null, bench_l_in: +d.bench_l_in || null, stages: d.stages, notes: d.notes, updated_at: new Date().toISOString() }).eq("id", d.id);
    setStatus(error ? "save failed" : "Saved ✓"); if (!error) onChange();
  }
  async function del() { if (!window.confirm("Delete this spacing profile?")) return; await sb.from("spacing_profiles").delete().eq("id", d.id); onChange(); }
  const inp = { padding: "5px 8px", border: `1px solid ${COLORS.border}`, borderRadius: 7, fontSize: 12.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 10, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: 2 };
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 14, marginBottom: 12, background: COLORS.card }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.9fr 0.9fr 0.9fr", gap: 8, marginBottom: 10 }}>
        <div><div style={lbl}>Crop type</div><input value={d.crop_ref || ""} onChange={e => set("crop_ref", e.target.value)} placeholder="Poinsettia / Annual / Mum" style={inp} /></div>
        <div><div style={lbl}>Pot size</div><input value={d.container_ref || ""} onChange={e => set("container_ref", e.target.value)} placeholder={'6.5"'} style={inp} /></div>
        <div><div style={lbl}>Bench W (in)</div><input value={d.bench_w_in || ""} onChange={e => set("bench_w_in", e.target.value)} inputMode="decimal" style={inp} /></div>
        <div><div style={lbl}>Bench L (in)</div><input value={d.bench_l_in || ""} onChange={e => set("bench_l_in", e.target.value)} inputMode="decimal" style={inp} /></div>
        <div><div style={lbl}>Tubes / bench</div><input value={d.tubes_per_bench || ""} onChange={e => set("tubes_per_bench", e.target.value)} inputMode="numeric" style={inp} /></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <div style={lbl}>Spacing by</div>
        {BP_MODES.map(([m, label]) => <button key={m} onClick={() => set("input_mode", m)} style={{ border: `1.5px solid ${d.input_mode === m ? COLORS.light : COLORS.border}`, background: d.input_mode === m ? COLORS.light : "#fff", color: d.input_mode === m ? "#fff" : COLORS.dark, borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>)}
        {bw > 0 && bl > 0 && <span style={{ fontSize: 11.5, color: COLORS.muted, marginLeft: "auto" }}>bench ≈ {bpArea(bw, bl).toFixed(1)} sq ft</span>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.muted, textTransform: "uppercase" }}>Stages (start tight → space out)</div>
        <button onClick={addStage} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", borderRadius: 7, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: COLORS.dark }}>+ earlier stage</button>
      </div>
      {d.stages.map((st, i) => {
        const cnt = bpCount(d.input_mode, st, bw, bl);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, borderTop: `1px solid ${COLORS.border}`, padding: "10px 0", alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <input value={st.label || ""} onChange={e => setStage(i, "label", e.target.value)} placeholder="Stage" style={{ ...inp, width: 150, fontWeight: 700 }} />
                <input value={st.week || ""} onChange={e => setStage(i, "week", e.target.value)} placeholder="wk" style={{ ...inp, width: 60 }} title="week this spacing starts" />
                {d.stages.length > 1 && <button onClick={() => delStage(i)} style={{ border: "none", background: "transparent", color: COLORS.red, cursor: "pointer", fontSize: 13 }}>✕</button>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {d.input_mode === "centers" && <>
                  <input value={st.w_in || ""} onChange={e => setStage(i, "w_in", e.target.value)} placeholder="across in" inputMode="decimal" style={{ ...inp, width: 80 }} />
                  <span style={{ color: COLORS.muted }}>×</span>
                  <input value={st.l_in || ""} onChange={e => setStage(i, "l_in", e.target.value)} placeholder="along in" inputMode="decimal" style={{ ...inp, width: 80 }} />
                  <label style={{ fontSize: 11.5, color: COLORS.muted, display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!st.staggered} onChange={e => setStage(i, "staggered", e.target.checked)} /> staggered</label>
                </>}
                {d.input_mode === "count" && <input value={st.count || ""} onChange={e => setStage(i, "count", e.target.value)} placeholder="pots per bench" inputMode="numeric" style={{ ...inp, width: 130 }} />}
                {d.input_mode === "density" && <input value={st.density || ""} onChange={e => setStage(i, "density", e.target.value)} placeholder="pots / sq ft" inputMode="decimal" style={{ ...inp, width: 110 }} />}
                <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.dark, marginLeft: 6 }}>= {cnt.toLocaleString()} pots/bench</span>
              </div>
              <input value={st.note || ""} onChange={e => setStage(i, "note", e.target.value)} placeholder="note (optional)" style={{ ...inp, marginTop: 6 }} />
            </div>
            <BenchDiagram bw={bw} bl={bl} mode={d.input_mode} st={st} tubes={+d.tubes_per_bench || 1} potIn={potIn} />
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <input value={d.notes || ""} onChange={e => set("notes", e.target.value)} placeholder="Prep notes for growers…" style={{ ...inp, flex: 1 }} />
        <button onClick={save} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "6px 16px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>💾 Save</button>
        <button onClick={del} style={{ background: "#fff", color: COLORS.red, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
        {status && <span style={{ fontSize: 12, color: status === "Saved ✓" ? COLORS.light : COLORS.muted, fontWeight: 700 }}>{status}</span>}
      </div>
    </div>
  );
}
function BenchPrepTab({ plan }) {
  const [mode, setMode] = useState("bench"); // bench-by-bench walk (default) | crop profiles
  const tabBtn = (m, label) => <button onClick={() => setMode(m)} style={{ border: `1.5px solid ${mode === m ? COLORS.light : COLORS.border}`, background: mode === m ? COLORS.light : "#fff", color: mode === m ? "#fff" : COLORS.dark, borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{tabBtn("bench", "🪑 By bench")}{tabBtn("crop", "📐 By crop profile")}</div>
      {mode === "bench" ? <BenchByBench plan={plan} /> : <BpProfilesView plan={plan} />}
    </div>
  );
}
function BpProfilesView({ plan }) {
  const sb = getSupabase();
  const [profiles, setProfiles] = useState(null);
  const load = async () => { if (!sb) return; const { data } = await sb.from("spacing_profiles").select("*").eq("plan_id", plan.id).order("created_at"); setProfiles(data || []); };
  useEffect(() => { load(); }, [sb, plan.id]); // reload when the plan changes
  async function add() { await sb.from("spacing_profiles").insert({ plan_id: plan.id, name: "New spacing", crop_ref: "", container_ref: "", input_mode: "centers", tubes_per_bench: 1, stages: [{ label: "Final", w_in: "", l_in: "", staggered: false, count: "", density: "", week: "", note: "" }] }); await load(); }
  if (profiles == null) return <div style={{ padding: 30, color: COLORS.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading…</div>;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: COLORS.text, margin: "2px 0 12px" }}>
        📐 <strong>Bench prep — spacing & irrigation tubes for this season.</strong> One profile per crop type + pot size (a 6.5" poinsettia spaces differently than a 6.5" annual). Enter the bench size and spacing; pots-per-bench and the layout diagram fill in automatically (poinsettias you can enter counts by hand). <strong>Tubes/bench</strong> = how many tubes you run (double/triple), kept uniform. Add an earlier <strong>stage</strong> for crops you start tight and space out later. The <span style={{ color: "#4a90d9", fontWeight: 700 }}>blue dashed lines</span> are tubes; green circles are pots.
      </div>
      <button onClick={add} style={{ background: COLORS.light, color: "#fff", border: "none", borderRadius: 8, padding: "7px 15px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>+ Add spacing profile</button>
      {profiles.length === 0 ? <div style={{ color: COLORS.muted, fontSize: 13, padding: "10px 0" }}>No spacing profiles yet — add one per crop type + pot size.</div>
        : profiles.map(p => <BpProfileCard key={p.id} p={p} onChange={load} />)}
    </div>
  );
}

// Top-down picture of the bench. Pots are drawn TO SCALE across the real bench width (a 10" pot reads
// bigger than a 6.5"), so you see how many fit across and how much gap. Pattern "N×M" = N pots on one
// board, M on the next — alternating rows (staggered when equal). Tan bands = boards (for "every board"
// layouts); blue dashed line(s) = irrigation tube(s). Vertical spacing is schematic; caption has the real numbers.
const BENCH_BOARD_PITCH_IN = 13; // far-end to far-end of consecutive boards
const poinChipBg = c => { const x = String(c || "").toUpperCase(); return x === "RED" ? "#fdecea" : x === "WHITE" ? "#f3f3f3" : x === "PINK" ? "#fce4ec" : x.includes("MARBLE") ? "#fff3e0" : (x.includes("CRYSTAL") || x.includes("ICE")) ? "#e8f4fb" : x.includes("GLITTER") ? "#f3e5f5" : "#eef3e9"; };
// optional print columns (bench / plant / item are always included)
const BP_PRINT_COLS = [["pots", "Pots/bench"], ["potsize", "Pot size"], ["pattern", "Pattern"], ["across", "Across"], ["along", "Along"], ["tubes", "Tubes"], ["tubepos", "Tube @"], ["note", "Note"]];
const bpWeekDate = (year, week) => { if (!year || !week) return ""; const s = new Date(Date.UTC(+year, 0, 1 + (+week - 1) * 7)); const dow = s.getUTCDay(); const m = new Date(s); m.setUTCDate(s.getUTCDate() + (dow <= 4 ? 1 - dow : 8 - dow)); return `${m.getUTCMonth() + 1}/${m.getUTCDate()}`; };
function benchSpacingCaption({ pattern, spacingIn, touching, potIn }) {
  const pot = potIn ? `${potIn}" pots · ` : "";
  const along = touching ? "pot-to-pot" : (+spacingIn ? `every ${spacingIn}" (edge)` : `every board (~13")`);
  return `${pattern || "—"} · ${pot}${along}`;
}
function BenchTopDiagram({ widthFt, pattern, across, spacingIn, touching, tubes, tubePosIn, potIn }) {
  const wIn = (+widthFt || 4) * 12;
  const pot = +potIn || 6.5;
  let N = +across || 1, M = N;
  if (pattern && /x/i.test(String(pattern))) { const p = String(pattern).toLowerCase().split("x"); const a = parseInt(p[0], 10), b = parseInt(p[1], 10); if (a) N = a; M = b || a; }
  const board = !(+spacingIn) && !touching; // "every board" layout → draw the boards
  const scale = 3.2, W = wIn * scale;              // FIXED px/inch so 4/6/8 ft benches are comparable
  const pr = Math.max(3, (pot / 2) * scale);       // pots to scale across the width
  const rowGap = Math.max(pr * 2.4, 30);           // schematic vertical spacing (readable)
  const rows = 4, H = rows * rowGap;
  // wide benches are built from 4' sections — lay each section out on its own so the bench center
  // stays clear and an odd count splits across halves (e.g. 8' "3" = 2 on one half + 1 on the other).
  const sections = (+widthFt && +widthFt % 4 === 0 && +widthFt > 4) ? Math.round(+widthFt / 4) : 1;
  const secW = wIn / sections;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const k = r % 2 === 0 ? N : M; if (k < 1) continue;
    const base = Math.floor(k / sections), extra = k % sections;
    for (let si = 0; si < sections; si++) {
      const cnt = base + (si < extra ? 1 : 0); if (cnt < 1) continue;
      const pitch = secW / cnt;
      const ph = (r % 2 ? 1 : -1) * pitch / 4; // stagger: alternate boards offset half a pitch
      for (let c = 0; c < cnt; c++) cells.push([(si * secW + pitch * (c + 0.5) + ph) * scale, (r + 0.5) * rowGap]);
    }
  }
  // one tube per 4' section at the pot-size's tube offset (so an 8' bench = 2 tubes); else evenly spaced
  const tubeXs = (+tubePosIn) ? Array.from({ length: sections }, (_, si) => (si * secW + +tubePosIn) * scale)
    : Array.from({ length: +tubes || 1 }, (_, t) => ((t + 1) / ((+tubes || 1) + 1)) * W);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} style={{ maxWidth: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 8, background: "#f7faf3", display: "block" }}>
      {board && Array.from({ length: rows }).map((_, r) => <rect key={"bd" + r} x={0} y={(r + 0.5) * rowGap - Math.min(rowGap * 0.42, 11)} width={W} height={Math.min(rowGap * 0.84, 22)} fill="#e7dcc8" fillOpacity="0.55" />)}
      {Array.from({ length: sections - 1 }).map((_, i) => <line key={"sec" + i} x1={secW * (i + 1) * scale} y1={0} x2={secW * (i + 1) * scale} y2={H} stroke={COLORS.border} strokeWidth="1" />)}
      {tubeXs.map((x, i) => <line key={"t" + i} x1={x} y1={0} x2={x} y2={H} stroke="#4a90d9" strokeWidth="2.5" strokeDasharray="7 4" />)}
      {cells.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={pr} fill="#7fb069" fillOpacity="0.6" stroke="#4e7038" strokeWidth="1" />)}
    </svg>
  );
}
// Bench-by-bench walk — every bench in the plan (sorted by zone + code), each with its pot pattern /
// spacing / tube setup. Upserts on blur; "apply to zone" copies one bench's setup to the whole range.
function BenchByBench({ plan }) {
  const sb = getSupabase();
  const [benches, setBenches] = useState(null);
  const [pots, setPots] = useState({});   // bench_id -> "6.5\"/8\""
  const [items, setItems] = useState({}); // bench_id -> [{pot,dia,label,qty,color}]
  const [spec, setSpec] = useState({});   // bench_id -> editable spec
  const [guides, setGuides] = useState([]);
  const [showGuides, setShowGuides] = useState(false);
  const [printCols, setPrintCols] = useState({ pots: true, potsize: true });
  const load = async () => {
    if (!sb) return;
    const sc = await srcPageAll(sb, "scheduled_crops", "bench_id,container_id,variety_id,color,item_name,qty_pots,plant_week,plant_year", q => q.eq("plan_id", plan.id).eq("is_combo_component", false).not("bench_id", "is", null));
    const bids = [...new Set(sc.map(r => r.bench_id))];
    const { data: gd } = await sb.from("spacing_guidelines").select("*"); setGuides(gd || []);
    if (!bids.length) { setBenches([]); return; }
    const { data: bd } = await sb.from("benches").select("id,code,zone_label,position,width_ft,length_ft").in("id", bids);
    const { data: cs } = await sb.from("containers").select("id,diameter_in,name");
    const dia = {}, cname = {}; (cs || []).forEach(c => { dia[c.id] = c.diameter_in; cname[c.id] = c.name; });
    const vids = [...new Set(sc.map(r => r.variety_id).filter(Boolean))];
    const vl = vids.length ? await srcPageAll(sb, "variety_library", "id,variety,crop_name", q => q.in("id", vids)) : [];
    const vById = {}; vl.forEach(v => { vById[v.id] = v; });
    const potBy = {}, itemBy = {};
    sc.forEach(r => {
      const d = dia[r.container_id]; if (d) (potBy[r.bench_id] = potBy[r.bench_id] || new Set()).add(d);
      const v = vById[r.variety_id];
      const label = [v?.variety || v?.crop_name || r.item_name, r.color && !/novelty/i.test(r.color) ? r.color : null].filter(Boolean).join(" · ");
      const potLbl = d ? `${d}"` : (cname[r.container_id] || "");
      (itemBy[r.bench_id] = itemBy[r.bench_id] || []).push({ pot: potLbl, dia: d, label: label || "—", qty: +r.qty_pots || 0, color: r.color || null, week: r.plant_week, year: r.plant_year });
    });
    const pm = {}; Object.entries(potBy).forEach(([b, s]) => { pm[b] = [...s].sort((a, x) => a - x).map(d => `${d}"`).join("/"); }); setPots(pm);
    setItems(itemBy);
    setBenches((bd || []).sort((a, b) => (a.zone_label || "").localeCompare(b.zone_label || "") || (a.code || "").localeCompare(b.code || "")));
    const { data: sp } = await sb.from("bench_spacing").select("*").eq("plan_id", plan.id);
    const m = {}; (sp || []).forEach(r => { m[r.bench_id] = r; }); setSpec(m);
  };
  useEffect(() => { load(); }, [sb, plan.id]);
  async function prefill() {
    if (!window.confirm("Auto-fill benches from the spacing guidelines (by pot size + bench width)? Skips benches you've already set.")) return;
    const rows = [];
    benches.forEach(b => {
      const s = spec[b.id]; if (s && (s.across || s.pattern || s.spacing_in)) return;
      const dia = parseFloat(String(pots[b.id] || "").replace(/[^\d.]/g, "")) || null;
      const g = guides.find(x => x.pot_dia != null && Number(x.bench_ft) === Number(b.width_ft) && Math.abs(Number(x.pot_dia) - dia) < 0.01);
      if (!g) return;
      const sections = (b.width_ft && b.width_ft % 4 === 0 && b.width_ft > 4) ? Math.round(b.width_ft / 4) : 1;
      rows.push({ plan_id: plan.id, bench_id: b.id, pattern: g.pattern, across: g.across, spacing_in: g.along_in, touching: false, tubes: sections, tube_pos_in: g.tube_pos, note: g.every_board ? "every board" : (g.edge_measure ? "from edge of pot" : null), updated_at: new Date().toISOString() });
    });
    if (!rows.length) { window.alert("No guideline matches for these benches' pot size + width (bloom pots need their diameter confirmed)."); return; }
    await sb.from("bench_spacing").upsert(rows, { onConflict: "plan_id,bench_id" });
    await load();
    window.alert(`Prefilled ${rows.length} benches from guidelines.`);
  }
  const rowOf = r => ({ plan_id: plan.id, bench_id: r.bench_id, pattern: r.pattern || null, across: r.across ? +r.across : null, spacing_in: r.spacing_in ? +r.spacing_in : null, touching: !!r.touching, tubes: r.tubes ? +r.tubes : 1, tube_pos_in: r.tube_pos_in ? +r.tube_pos_in : null, note: r.note || null, updated_at: new Date().toISOString() });
  const upd = (id, patch) => setSpec(s => ({ ...s, [id]: { ...s[id], bench_id: id, ...patch } }));
  const save = async id => { await sb.from("bench_spacing").upsert(rowOf(spec[id] || { bench_id: id }), { onConflict: "plan_id,bench_id" }); };
  async function applyToZone(b) {
    const src = spec[b.id]; if (!src) return;
    if (!window.confirm(`Copy ${b.code}'s setup to every bench in ${b.zone_label}?`)) return;
    const zone = benches.filter(x => x.zone_label === b.zone_label);
    await sb.from("bench_spacing").upsert(zone.map(x => ({ ...rowOf(src), bench_id: x.id })), { onConflict: "plan_id,bench_id" });
    await load();
  }
  // production handoff sheet — always Bench / Plant / Item, plus the chosen optional columns
  function printSheet() {
    const optCols = BP_PRINT_COLS.filter(([k]) => printCols[k]);
    const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const rowCells = b => {
      const s = spec[b.id] || {};
      const its = Object.values((items[b.id] || []).reduce((a, it) => { const k = it.pot + "|" + it.label; (a[k] = a[k] || { ...it, qty: 0 }).qty += it.qty; return a; }, {}));
      const totalPots = (items[b.id] || []).reduce((n, it) => n + it.qty, 0);
      const weeks = [...new Set((items[b.id] || []).map(it => it.week ? bpWeekDate(it.year, it.week) : null).filter(Boolean))].join(", ");
      const itemStr = its.map(it => `${it.pot ? it.pot + " " : ""}${it.label}`).join("; ");
      const map = { pots: totalPots || "", potsize: pots[b.id] || "", pattern: s.pattern || "", across: s.across ?? "", along: s.touching ? "touch" : (s.spacing_in ? s.spacing_in + '"' : (s.pattern ? "board" : "")), tubes: s.tubes ?? "", tubepos: s.tube_pos_in ? s.tube_pos_in + '"' : "", note: s.note || "" };
      return `<td><b>${esc(b.code)}</b></td><td>${esc(weeks)}</td><td>${esc(itemStr)}</td>` + optCols.map(([k]) => `<td>${esc(map[k])}</td>`).join("");
    };
    let body = "";
    zones.forEach(z => { body += `<tr class="z"><td colspan="${3 + optCols.length}">${esc(z)}</td></tr>`; benches.filter(b => (b.zone_label || "—") === z).forEach(b => { body += `<tr>${rowCells(b)}</tr>`; }); });
    const head = `<th>Bench</th><th>Plant</th><th>Item</th>` + optCols.map(([, l]) => `<th>${esc(l)}</th>`).join("");
    const html = `<html><head><title>${esc(plan.name)} — Bench Prep</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:18px;color:#000}h2{margin:0}.sub{color:#555;font-size:12px;margin:2px 0 12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 8px;text-align:left}th{background:#eee}tr.z td{background:#333;color:#fff;font-weight:bold}@media print{body{margin:8mm}}</style></head><body><h2>${esc(plan.name)} — Bench Prep</h2><div class="sub">Production handoff · ${benches.length} benches</div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { window.alert("Allow pop-ups to print the handoff sheet."); return; }
    w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }
  if (benches == null) return <div style={{ padding: 30, color: COLORS.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading benches…</div>;
  if (!benches.length) return <div style={{ padding: 16, color: COLORS.muted, fontSize: 13 }}>No benches assigned in this plan yet.</div>;
  const zones = [...new Set(benches.map(b => b.zone_label || "—"))];
  const configured = benches.filter(b => { const s = spec[b.id]; return s && (s.across || s.spacing_in || s.touching || s.pattern); }).length;
  const inp = { padding: "5px 7px", border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", boxSizing: "border-box" };
  const lbl = { fontSize: 9.5, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: .3 };
  return (
    <div>
      <div style={{ background: "#eef6e7", border: `1px solid ${COLORS.light}`, borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: COLORS.text, margin: "0 0 10px" }}>
        🪑 <strong>Bench-by-bench spacing — {plan.name}.</strong> Every bench, sorted by location + number. For each: <strong>pattern</strong> (e.g. "2×1"), <strong>across</strong> (pots across the width), <strong>along</strong> (inches between rows down the length, or ✓ touching), and <strong>tubes</strong> + where the tube sits. Diagram updates live — growers move the tube to the blue line and fill at that spacing. Set one bench then <strong>Apply to zone</strong> to copy down a range. <strong>{configured}/{benches.length}</strong> set.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <button onClick={prefill} style={{ background: COLORS.light, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>✨ Prefill from guidelines</button>
        <button onClick={() => setShowGuides(s => !s)} style={{ background: "#fff", color: COLORS.dark, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>📋 {showGuides ? "Hide" : "Show"} guidelines</button>
        <button onClick={printSheet} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>🖨 Print handoff</button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12, fontSize: 12, color: COLORS.muted }}>
        <span style={{ fontWeight: 700 }}>Print columns:</span>
        <span>Bench · Plant · Item</span>
        <span style={{ color: COLORS.border }}>|</span>
        {BP_PRINT_COLS.map(([k, l]) => <label key={k} style={{ display: "flex", gap: 3, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={!!printCols[k]} onChange={e => setPrintCols(p => ({ ...p, [k]: e.target.checked }))} /> {l}</label>)}
      </div>
      {showGuides && (
        <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, background: COLORS.card }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ textAlign: "left", color: COLORS.muted }}><th style={{ padding: "3px 8px" }}>Pot</th><th style={{ padding: "3px 8px" }}>Bench width</th><th style={{ padding: "3px 8px" }}>Pattern</th><th style={{ padding: "3px 8px" }}>Across</th><th style={{ padding: "3px 8px" }}>Along</th><th style={{ padding: "3px 8px" }}>Tube @</th></tr></thead>
            <tbody>{guides.slice().sort((a, b) => (a.pot_dia ?? 99) - (b.pot_dia ?? 99) || a.bench_ft - b.bench_ft).map(g => (
              <tr key={g.id} style={{ borderTop: `1px solid ${COLORS.border}` }}><td style={{ padding: "3px 8px", fontWeight: 700 }}>{g.pot_key}</td><td style={{ padding: "3px 8px" }}>{g.bench_ft} ft</td><td style={{ padding: "3px 8px" }}>{g.pattern}</td><td style={{ padding: "3px 8px" }}>{g.across}</td><td style={{ padding: "3px 8px" }}>{g.every_board ? "every board" : `${g.along_in}"${g.edge_measure ? " (edge)" : ""}`}</td><td style={{ padding: "3px 8px" }}>{g.tube_pos ? `${g.tube_pos}"${g.bench_ft >= 8 ? " ×2" : ""}` : "?"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {zones.map(z => (
        <div key={z} style={{ marginBottom: 16 }}>
          <SrcSectionTitle>{z} <span style={{ color: COLORS.muted, fontWeight: 400 }}>({benches.filter(b => (b.zone_label || "—") === z).length})</span></SrcSectionTitle>
          {benches.filter(b => (b.zone_label || "—") === z).map(b => {
            const s = spec[b.id] || {};
            const potIn = parseFloat(String(pots[b.id] || "").replace(/[^\d.]/g, "")) || null;
            const dedup = Object.values((items[b.id] || []).reduce((a, it) => { const k = it.label + "|" + it.pot; (a[k] = a[k] || { ...it, qty: 0 }).qty += it.qty; return a; }, {}));
            return (
              <div key={b.id} style={{ borderTop: `1px solid ${COLORS.border}`, padding: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, color: COLORS.dark, fontSize: 14, minWidth: 74 }}>{b.code}</span>
                  <span style={{ fontSize: 11, color: COLORS.muted }}>{b.width_ft ? `${b.width_ft} ft wide` : "— ft"}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {dedup.length ? dedup.map((it, i) => <span key={i} style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.dark, background: poinChipBg(it.color), border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "2px 10px", display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", background: COLORS.dark, borderRadius: 6, padding: "1px 8px" }}>{it.pot || "?"}</span>
                      {it.label}{it.qty ? ` · ${it.qty.toLocaleString()}` : ""}</span>)
                      : <span style={{ fontSize: 12, color: COLORS.muted }}>no item scheduled</span>}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr)) auto", gap: 6, alignItems: "end" }}>
                  <div><div style={lbl}>Pattern</div><input value={s.pattern || ""} onChange={e => upd(b.id, { pattern: e.target.value })} onBlur={() => save(b.id)} placeholder="2×1" style={{ ...inp, width: "100%" }} /></div>
                  <div><div style={lbl}>Across</div><input value={s.across ?? ""} onChange={e => upd(b.id, { across: e.target.value })} onBlur={() => save(b.id)} inputMode="numeric" style={{ ...inp, width: "100%" }} /></div>
                  <div><div style={lbl}>Along (in)</div><input value={s.spacing_in ?? ""} onChange={e => upd(b.id, { spacing_in: e.target.value })} onBlur={() => save(b.id)} inputMode="decimal" disabled={!!s.touching} placeholder={s.touching ? "touch" : "or board"} style={{ ...inp, width: "100%", background: s.touching ? "#f0f0f0" : "#fff" }} /></div>
                  <div><div style={lbl}>Tubes</div><input value={s.tubes ?? ""} onChange={e => upd(b.id, { tubes: e.target.value })} onBlur={() => save(b.id)} inputMode="numeric" placeholder="1" style={{ ...inp, width: "100%" }} /></div>
                  <div><div style={lbl}>Tube @ in</div><input value={s.tube_pos_in ?? ""} onChange={e => upd(b.id, { tube_pos_in: e.target.value })} onBlur={() => save(b.id)} inputMode="decimal" placeholder="even" style={{ ...inp, width: "100%" }} title="inches from left edge; blank = evenly spaced" /></div>
                  <label style={{ fontSize: 11, color: COLORS.muted, display: "flex", gap: 3, alignItems: "center", cursor: "pointer", paddingBottom: 6 }}><input type="checkbox" checked={!!s.touching} onChange={e => { upd(b.id, { touching: e.target.checked }); setTimeout(() => save(b.id), 0); }} /> touch</label>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                    <input value={s.note || ""} onChange={e => upd(b.id, { note: e.target.value })} onBlur={() => save(b.id)} placeholder="note (e.g. tube on north side)" style={{ ...inp, flex: 1 }} />
                    <button onClick={() => applyToZone(b)} title={`Copy to all of ${z}`} style={{ border: `1px solid ${COLORS.border}`, background: "#fff", color: COLORS.dark, borderRadius: 6, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>↓ Apply to zone</button>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>What the bench looks like — <span style={{ color: COLORS.dark }}>{benchSpacingCaption({ pattern: s.pattern, spacingIn: s.spacing_in, touching: s.touching, potIn })}</span></div>
                  <BenchTopDiagram widthFt={b.width_ft} pattern={s.pattern} across={s.across} spacingIn={s.spacing_in} touching={s.touching} tubes={s.tubes} tubePosIn={s.tube_pos_in} potIn={potIn} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Combos gallery — every combo in the plan as a card (diagram where arranged, recipe otherwise).
// Click a card to open the item detail → ✏️ Arrange (drag plants) + 🔗 Share.
function CombosTab({ plan }) {
  const sb = getSupabase();
  const [combos, setCombos] = useState(null);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!sb) return;
    (async () => {
      const sc = await srcPageAll(sb, "scheduled_crops", "id,item_name,planting_layout,variety_id,bench_id,plant_week,qty_pots,qty_plants_ordered,combo_parent_id,is_combo_component,improvement_note,kept_note", f => f.eq("plan_id", plan.id));
      const parentIds = new Set(sc.map(r => r.combo_parent_id).filter(Boolean));
      const parents = sc.filter(r => parentIds.has(r.id));
      const vars = await srcPageAll(sb, "variety_library", "id,crop_name,variety,breeder,culture_source_id,culture_guide_url,care_profile");
      const vById = {}; vars.forEach(v => { vById[v.id] = v; });
      const benches = await srcPageAll(sb, "benches", "id,code,zone_label");
      const bById = {}; benches.forEach(b => { bById[b.id] = b; });
      const recipeByParent = {};
      sc.filter(r => r.is_combo_component && r.combo_parent_id).forEach(c => { (recipeByParent[c.combo_parent_id] = recipeByParent[c.combo_parent_id] || []).push(c); });
      // group parents by name; prefer a representative that has a saved layout
      const byName = {};
      parents.forEach(p => {
        const nm = p.item_name || "(combo)";
        if (!byName[nm] || (!byName[nm].planting_layout && p.planting_layout)) byName[nm] = { ...p, variety: vById[p.variety_id], bench: bById[p.bench_id] };
      });
      const list = Object.values(byName).map(p => ({
        ...p,
        recipe: (recipeByParent[p.id] || []).map(c => ({ v: vById[c.variety_id], qty: c.qty_plants_ordered })),
      })).sort((a, b) => (b.planting_layout ? 1 : 0) - (a.planting_layout ? 1 : 0) || (a.item_name || "").localeCompare(b.item_name || ""));
      setCombos(list);
    })();
  }, [sb, plan.id]);
  if (combos == null) return <div style={{ padding: 30, color: COLORS.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading combos…</div>;
  const ql = q.trim().toLowerCase();
  const shown = ql ? combos.filter(c => (c.item_name || "").toLowerCase().includes(ql) || c.recipe.some(r => `${r.v?.crop_name || ""} ${r.v?.variety || ""}`.toLowerCase().includes(ql))) : combos;
  const arranged = combos.filter(c => c.planting_layout).length;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.dark }}>🪴 Combos — {combos.length}</div>
          <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>{arranged} arranged · click a combo to view, <strong>✏️ Arrange</strong> the plants, or <strong>🔗 Share</strong> a grower diagram.</div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter combos / plants…" style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", minWidth: 220 }} />
      </div>
      {shown.length === 0 ? <div style={{ color: COLORS.muted, padding: "20px 0" }}>No combos{ql ? " match" : " in this plan"}.</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
          {shown.map(c => (
            <div key={c.id} onClick={() => setDetail(c)} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 12, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 150, background: "#fafcf8", borderRadius: 8, overflow: "hidden" }}>
                {c.planting_layout?.plants ? <div style={{ width: 150 }}><ComboDiagram layout={c.planting_layout} /></div>
                  : <div style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", padding: 10 }}>▦ not arranged yet<br /><span style={{ fontSize: 10 }}>open to lay it out</span></div>}
              </div>
              <div style={{ fontWeight: 700, color: COLORS.dark, fontSize: 13 }}>{c.item_name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.muted, lineHeight: 1.4 }}>
                {c.recipe.length ? c.recipe.map((r, i) => <span key={i}>{i ? " · " : ""}{`${r.v?.crop_name || ""} ${r.v?.variety || ""}`.trim()}{r.qty ? ` ×${r.qty}` : ""}</span>) : <em>no components</em>}
              </div>
              {c.planting_layout ? <span style={{ fontSize: 10, color: COLORS.light, fontWeight: 800 }}>✓ arranged</span> : <span style={{ fontSize: 10, color: COLORS.amber, fontWeight: 700 }}>needs layout</span>}
            </div>
          ))}
        </div>
      )}
      {detail && <Modal onClose={() => setDetail(null)}><ItemDetail row={detail} planId={plan.id} onClose={() => setDetail(null)} onTask={() => window.alert("Create tasks from the ✓ Tasks tab or the By-Bench drilldown.")} /></Modal>}
    </div>
  );
}

function ItemDetail({ row, onClose, onTask, planId }) {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [combo, setCombo] = useState([]);
  const [cp, setCp] = useState([]);
  const [layout, setLayout] = useState(row?.planting_layout || null);
  const [editLayout, setEditLayout] = useState(false);
  const [impNote, setImpNote] = useState(row?.improvement_note || "");
  const [keptNote, setKeptNote] = useState(row?.kept_note || "");
  const [noteStatus, setNoteStatus] = useState("");
  const [keptStatus, setKeptStatus] = useState("");
  useEffect(() => { setLayout(row?.planting_layout || null); setEditLayout(false); setImpNote(row?.improvement_note || ""); setKeptNote(row?.kept_note || ""); setNoteStatus(""); setKeptStatus(""); }, [row?.id, row?.planting_layout, row?.improvement_note, row?.kept_note]);
  async function saveReviewNote(field, val, setStatus) {
    const sb = getSupabase(); if (!sb || !row?.id) return;
    const v = (val || "").trim() || null;
    setStatus("saving…");
    // Always write this exact row by id (can't miss), then sync the rest of the recipe.
    const { error } = await sb.from("scheduled_crops").update({ [field]: v }).eq("id", row.id);
    if (error) { setStatus(""); window.alert("Note save failed: " + error.message); return; }
    if (row.item_name && planId) await sb.from("scheduled_crops").update({ [field]: v }).eq("item_name", row.item_name).eq("plan_id", planId);
    row[field] = v; setStatus("Saved ✓");
  }
  const saveImpNote = (val) => saveReviewNote("improvement_note", val, setNoteStatus);
  const saveKeptNote = (val) => saveReviewNote("kept_note", val, setKeptStatus);
  const srcId = row?.variety?.culture_source_id;
  useEffect(() => {
    const cc = getCultureClient(); if (!cc) return;
    cc.from("crop_protection_inputs_public")
      .select("name,manufacturer,input_class,product_type,active_ingredient,moa_group,rei_hours,controls,target_pests,labeled_crops,phytotox_cautions,use_rates")
      .then(({ data }) => setCp(data || []));
  }, []);
  useEffect(() => {
    if (!srcId) { setGuide(null); return; }
    const cc = getCultureClient();
    if (!cc) { setGuide(null); return; }
    setLoading(true);
    cc.from("culture_guides_public").select("*").eq("id", srcId).single().then(({ data }) => { setGuide(data || null); setLoading(false); });
  }, [srcId]);
  // Load combo components whenever this item owns any (regardless of whether a layout exists yet),
  // so multi-plant combos can always be arranged.
  useEffect(() => {
    const sb = getSupabase(); if (!sb || !row?.id) { setCombo([]); return; }
    sb.from("scheduled_crops").select("variety_id,qty_plants_ordered").eq("combo_parent_id", row.id).then(async ({ data }) => {
      const vids = [...new Set((data || []).map(d => d.variety_id).filter(Boolean))];
      const { data: vs } = vids.length ? await sb.from("variety_library").select("id,crop_name,variety").in("id", vids) : { data: [] };
      setCombo((data || []).map(d => ({ qty: d.qty_plants_ordered, v: (vs || []).find(x => x.id === d.variety_id) })));
    });
  }, [row?.id]);
  // full plant set for arranging = parent variety + component varieties (children)
  const comboPlants = combo.length ? [...(row?.variety ? [{ v: row.variety, qty: row.qty_plants_ordered }] : []), ...combo] : [];
  const comboNames = comboPlants.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}`.trim()).filter(Boolean);
  const cd = guide?.culture_details || {};
  const DEDICATED = /potential pest|potential disease|growth regulator/i;
  const entries = Object.keys(cd).filter(k => /pgr|warning|water|temp|finish|pinch|exposure|bloom|media|habit|propagation|ph|ec|fertil/i.test(k) && !DEDICATED.test(k) && cd[k] && String(cd[k]).trim());
  const pdf = cd["Culture Guide PDF"] || cd["Culture Guide PDF (Origin)"] || guide?.pdf_url || row?.variety?.culture_guide_url || ((row?.variety?.care_profile || {})["Culture Guide PDF"]);
  const pests = splitTerms(cd["Potential Pests"]);
  const diseases = splitTerms(cd["Potential Diseases"]);
  const pgr = cd["Growth Regulators"] || cd["Growth Regulator"] || cd["PGR"] || cd["PGRs"];
  const matrix = guide?.finish_time_matrix && typeof guide.finish_time_matrix === "object" ? guide.finish_time_matrix : null;
  const cropName = guide?.crop_name || row?.variety?.crop_name || "";
  // C — interlink: match this crop's pests/diseases against crop_protection controls
  const treatments = [...pests.map(t => ({ t, kind: "pest" })), ...diseases.map(t => ({ t, kind: "disease" }))]
    .map(({ t, kind }) => {
      const prods = cp.filter(p => (p.controls || []).some(c => cpMatch(t, c)) || (p.target_pests || []).some(x => cpMatch(t, x)))
        .map(p => ({ ...p, safe: (p.labeled_crops || []).some(lc => cpMatch(cropName, lc)) }));
      return { t, kind, prods };
    }).filter(x => x.prods.length);
  const secLabel = { fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
  const secWrap = { borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginTop: 10 };
  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 800, color: COLORS.dark, fontSize: 15 }}>{row.item_name || row.variety?.variety || "Item"}</div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{row.bench?.code} · {row.variety?.variety}{row.variety?.breeder ? ` · ${row.variety.breeder}` : ""} · plant wk {row.plant_week} · {row.qty_pots} pots</div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: COLORS.muted }}>✕</button>
      </div>
      <div style={{ margin: "10px 0", display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={onTask} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>＋ Create task</button>
        {pdf && <a href={pdf} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: COLORS.light, padding: "7px 12px", borderRadius: 8, textDecoration: "none" }}>📄 Grower guide ↗</a>}
      </div>
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#c0392b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>🚩 Fix-next-year note</div>
        <textarea value={impNote} onChange={e => { setImpNote(e.target.value); setNoteStatus(""); }} onBlur={e => { if ((e.target.value || "") !== (row.improvement_note || "")) saveImpNote(e.target.value); }} rows={2} placeholder="What would you change next year?" style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${impNote ? "#d94f3d" : COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical", background: impNote ? "#fdf1ef" : "#fff" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <button onClick={() => saveImpNote(impNote)} style={{ background: "#d94f3d", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>💾 Save note</button>
          {impNote && <button onClick={() => { setImpNote(""); saveImpNote(""); }} style={{ background: "#fff", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>}
          {noteStatus && <span style={{ fontSize: 12, color: noteStatus === "Saved ✓" ? COLORS.light : COLORS.muted, fontWeight: 700 }}>{noteStatus}</span>}
          {row.item_name && <span style={{ fontSize: 10, color: COLORS.muted, marginLeft: "auto" }}>Applies to all "{row.item_name}" facility-wide</span>}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#2e7d32", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>✅ Worked well — keep</div>
        <textarea value={keptNote} onChange={e => { setKeptNote(e.target.value); setKeptStatus(""); }} onBlur={e => { if ((e.target.value || "") !== (row.kept_note || "")) saveKeptNote(e.target.value); }} rows={2} placeholder="What worked well this year?" style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${keptNote ? "#7fb069" : COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, resize: "vertical", background: keptNote ? "#f0f7ec" : "#fff" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <button onClick={() => saveKeptNote(keptNote)} style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>💾 Save note</button>
          {keptNote && <button onClick={() => { setKeptNote(""); saveKeptNote(""); }} style={{ background: "#fff", color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Clear</button>}
          {keptStatus && <span style={{ fontSize: 12, color: keptStatus === "Saved ✓" ? COLORS.light : COLORS.muted, fontWeight: 700 }}>{keptStatus}</span>}
          {row.item_name && <span style={{ fontSize: 10, color: COLORS.muted, marginLeft: "auto" }}>Applies to all "{row.item_name}" facility-wide</span>}
        </div>
      </div>
      {(layout || comboPlants.length > 1) && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Combo planting <span style={{ fontWeight: 400, textTransform: "none" }}>· {comboNames.length} plants</span></div>
            {!editLayout && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditLayout(true)} style={{ fontSize: 12, fontWeight: 700, color: COLORS.dark, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>✏️ {layout ? "Arrange" : "Lay it out"}</button>
                {layout && <button onClick={async () => {
                  const recipe = comboPlants.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}${c.qty ? ` ×${c.qty}` : ""}`.trim()).filter(Boolean).join(" · ");
                  const url = await shareComboDiagram(row, planId, recipe);
                  if (url) { try { await navigator.clipboard.writeText(url); } catch {} window.prompt("Shareable link (copied) — anyone can open this on their phone, no login needed:", url); }
                }} style={{ fontSize: 12, fontWeight: 700, color: COLORS.dark, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>🔗 Share</button>}
              </div>
            )}
          </div>
          {editLayout ? (
            <BasketDesigner layout={layout || { plants: comboNames }} plantNames={comboNames}
              onSave={async (l) => {
                const sb = getSupabase();
                if (!sb || !row?.id) { window.alert("Not saved — no connection."); return; }
                // Always write THIS row by id (can't miss), then sync the whole recipe by name.
                const { error } = await sb.from("scheduled_crops").update({ planting_layout: l }).eq("id", row.id);
                if (error) { window.alert("Save failed: " + error.message); return; }
                let n = 1;
                if (row.item_name && planId) { const { data } = await sb.from("scheduled_crops").update({ planting_layout: l }).eq("item_name", row.item_name).eq("plan_id", planId).eq("is_combo_component", false).select("id"); n = data?.length || 1; }
                row.planting_layout = l; setLayout(l); setEditLayout(false); // mutate cached row so it shows on reopen
                window.alert(`Saved ✓  (${n} basket${n === 1 ? "" : "s"})`);
              }}
              onClose={() => setEditLayout(false)} />
          ) : (
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              {layout ? <ComboDiagram layout={layout} /> : <div style={{ width: 150, height: 120, borderRadius: 8, border: `1px dashed ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.muted, fontSize: 12, textAlign: "center" }}>Not arranged yet —<br />click "Lay it out"</div>}
              <div style={{ flex: "1 1 200px" }}>
                {layout?.howto && <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 8 }}>{layout.howto}</div>}
                <div style={{ fontSize: 12, color: COLORS.muted }}>{comboPlants.length ? comboPlants.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}${c.qty ? ` (${c.qty})` : ""}`).join(" · ") : "—"}</div>
              </div>
            </div>
          )}
        </div>
      )}
      {matrix && Object.values(matrix).some(finishWeeks) && (
        <div style={secWrap}>
          <div style={secLabel}>Finish time (by container)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(matrix).map(([k, v]) => { const w = finishWeeks(v); if (!w) return null; return (
              <span key={k} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 8, background: "#f3f8ee", border: `1px solid ${COLORS.border}` }}>{FINISH_LABELS[k] || k}: <strong>{w}</strong>{(v.ppp_lower || v.ppp_upper) ? <span style={{ color: COLORS.muted }}> · {v.ppp_lower === v.ppp_upper || !v.ppp_upper ? (v.ppp_lower || v.ppp_upper) : `${v.ppp_lower}–${v.ppp_upper}`} ppp</span> : null}</span>
            ); })}
          </div>
        </div>
      )}
      {(pests.length > 0 || diseases.length > 0 || pgr) && (
        <div style={secWrap}>
          {pests.length > 0 && <div style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.5 }}><strong style={{ color: COLORS.dark }}>🐛 Potential pests:</strong> {pests.join(", ")}</div>}
          {diseases.length > 0 && <div style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.5 }}><strong style={{ color: COLORS.dark }}>🦠 Potential diseases:</strong> {diseases.join(", ")}</div>}
          {pgr && <div style={{ fontSize: 13, lineHeight: 1.5 }}><strong style={{ color: COLORS.dark }}>📏 Growth regulators:</strong> {String(pgr)}</div>}
        </div>
      )}
      {treatments.length > 0 && (
        <div style={secWrap}>
          <div style={secLabel}>🛡 Treatments {cropName ? <span style={{ textTransform: "none", fontWeight: 400 }}>· ✓ = labeled safe on {cropName}</span> : null}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {treatments.map(({ t, kind, prods }) => (
              <div key={kind + t}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.dark }}>{kind === "pest" ? "🐛" : "🦠"} {t}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {prods.map((p, i) => (
                    <span key={i} title={`${p.product_type || ""} · ${p.active_ingredient || "?"} · MOA ${p.moa_group || "?"} · REI ${p.rei_hours ?? "?"}h${p.use_rates ? " · " + p.use_rates : ""}`}
                      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 8, background: p.input_class === "biological" ? "#e6f2e0" : "#eef3f8", border: `1px solid ${p.safe ? COLORS.light : COLORS.border}` }}>
                      {p.safe ? "✓ " : ""}{p.name} <span style={{ color: COLORS.muted }}>· {p.manufacturer || ""} · {p.input_class === "biological" ? "bio" : "chem"}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Culture{guide ? ` · ${guide.breeder_name || ""} ${guide.crop_name || ""} ${guide.series_name || ""}` : ""}</div>
        {!srcId ? <div style={{ color: COLORS.muted, fontSize: 13 }}>No culture guide linked yet — add it in the parser, then re-link.</div>
          : loading ? <div style={{ color: COLORS.muted, fontSize: 13 }}>Loading culture…</div>
          : !guide ? <div style={{ color: COLORS.muted, fontSize: 13 }}>Linked guide not found.</div>
          : entries.length === 0 ? <div style={{ color: COLORS.muted, fontSize: 13 }}>Guide linked — no culture detail fields filled in yet.</div>
          : <div style={{ display: "grid", gap: 6 }}>{entries.map(k => (
              <div key={k} style={{ fontSize: 13, lineHeight: 1.5 }}><strong style={{ color: COLORS.dark }}>{k}:</strong> <span style={{ color: COLORS.text }}>{String(cd[k])}</span></div>
            ))}</div>}
      </div>
    </div>
  );
}

function HouseDrilldown({ houseName, houses, planId, onClose }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);

  // Look up building info from the houses table
  const house = (houses || []).find(h => h.name === houseName) || {};
  const houseArea = (+house.width_ft || 0) * (+house.length_ft || 0);
  const [sel, setSel] = useState(() => new Set());
  const [taskItems, setTaskItems] = useState(null);
  const [detail, setDetail] = useState(null);
  const [fq, setFq] = useState("");
  const [fwk, setFwk] = useState("");
  function toggleSel(id) { setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const toItems = list => list.map(r => ({ item: r.item_name || [r.variety?.variety, r.container && `(${r.container})`].filter(Boolean).join(" ") || "item", bench: r.bench?.code, planting_layout: r.planting_layout || null, item_name: r.item_name || null }));

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: bench } = await sb.from("benches").select("id,code,position,width_ft").eq("zone_label", houseName);
      const benchIds = (bench || []).map(b => b.id);
      if (!benchIds.length) { setRows([]); return; }
      const { data: pl } = await sb.from("v_scheduled_crops_pl")
        .select("id,bench_id,variety_id,qty_pots,qty_plants_ordered,direct_cost_total,revenue,gross_profit,plant_week")
        .eq("plan_id", planId).in("bench_id", benchIds);
      const ids = (pl || []).map(r => r.id);
      const { data: sc } = ids.length ? await sb.from("scheduled_crops").select("id,item_name,is_combo_component,combo_parent_id,planting_layout,notes,improvement_note,kept_note,container_id").in("id", ids) : { data: [] };
      const { data: vars } = await sb.from("variety_library").select("id,variety,breeder,culture_source_id");
      const { data: conts } = await sb.from("containers").select("id,name");

      setRows((pl || []).map(r => {
        const scr = (sc || []).find(x => x.id === r.id);
        return {
          ...r,
          bench: (bench || []).find(b => b.id === r.bench_id),
          variety: (vars || []).find(v => v.id === r.variety_id),
          item_name: scr?.item_name,
          container: (conts || []).find(c => c.id === scr?.container_id)?.name || null,
          is_combo_component: scr?.is_combo_component,
          planting_layout: scr?.planting_layout,
          notes: scr?.notes,
          improvement_note: scr?.improvement_note,
          kept_note: scr?.kept_note,
        };
      }).sort((a,b) => (a.bench?.position || 0) - (b.bench?.position || 0)));
    })();
  }, [sb, houseName, planId]);

  // Sort — default bench then item; all columns sortable
  const [sortCol, setSortCol] = useState("bench");
  const [sortDir, setSortDir] = useState("asc");
  function clickSort(c) { if (c === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(c); setSortDir("asc"); } }
  const sortVal = (r, c) =>
    c === "bench" ? (r.bench?.code || "") :
    c === "item" ? (r.item_name || r.variety?.variety || "") :
    c === "plant_week" ? (+r.plant_week || 0) :
    c === "pots" ? (+r.qty_pots || 0) :
    c === "liners" ? (+r.qty_plants_ordered || 0) :
    c === "cost" ? (+r.direct_cost_total || 0) :
    c === "revenue" ? (+r.revenue || 0) :
    c === "profit" ? (+r.gross_profit || 0) : "";
  const sorted = [...rows].sort((a, b) => {
    const pa = sortVal(a, sortCol), pb = sortVal(b, sortCol);
    let cmp = typeof pa === "string" ? pa.localeCompare(pb) : pa - pb;
    if (sortDir === "desc") cmp = -cmp;
    if (cmp !== 0) return cmp;
    const ba = a.bench?.code || "", bb = b.bench?.code || "";
    if (ba !== bb) return ba.localeCompare(bb);
    return (a.item_name || "").localeCompare(b.item_name || "");
  });
  const SortHdr = ({ col, label, align }) => (
    <th style={{ ...th, textAlign: align || "left", cursor: "pointer" }} onClick={() => clickSort(col)}>{label} {sortCol === col ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
  );
  const fwks = fwk.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  const shown = sorted.filter(r => {
    if (r.is_combo_component) return false; // components fold into their combo parent
    const okT = !fq.trim() || `${r.item_name || ""} ${r.variety?.variety || ""}`.toLowerCase().includes(fq.trim().toLowerCase());
    const ww = r.plant_week != null ? (r.plant_week % 100) : null;
    const okW = !fwks.length || fwks.some(w => w.length >= 3 ? String(r.plant_week) === w : ww === +w);
    return okT && okW;
  });

  // Roll up totals for the house
  const totalCost    = rows.reduce((s, r) => s + (+r.direct_cost_total || 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + (+r.revenue || 0), 0);
  const totalProfit  = rows.reduce((s, r) => s + (+r.gross_profit || 0), 0);
  const profitPerSqFt = houseArea ? totalProfit / houseArea : null;

  return (
    <div style={{ background: COLORS.card, border: `2px solid ${COLORS.dark}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: COLORS.dark }}>
            {houseName}
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
            {house.type || "—"}
            {house.width_ft && house.length_ft && (
              <> · <strong>{house.width_ft} ft × {house.length_ft} ft</strong> ({houseArea.toLocaleString()} sq ft)</>
            )}
            {house.dimension_source && (
              <> · <span style={{ color: house.dimension_source === "measured" ? COLORS.light : COLORS.amber }}>
                {house.dimension_source}
              </span></>
            )}
            {house.location && <> · {house.location}</>}
          </div>
          {house.notes && (
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4, fontStyle: "italic" }}>{house.notes}</div>
          )}
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, cursor: "pointer", color: COLORS.muted }}>✕</button>
      </div>

      {/* Building-level P&L summary cards */}
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          <MiniKPI label="Cost"        value={fmtMoney(totalCost)}    color={COLORS.dark} />
          <MiniKPI label="Revenue"     value={fmtMoney(totalRevenue)} color={COLORS.light} />
          <MiniKPI label="Gross Profit" value={fmtMoney(totalProfit)} color={COLORS.dark} />
          <MiniKPI label="$ / sq ft" value={profitPerSqFt != null ? "$" + profitPerSqFt.toFixed(2) : "—"} color={COLORS.muted} sub={houseArea ? `over ${houseArea.toLocaleString()} sq ft` : null} />
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <input placeholder="filter items…" value={fq} onChange={e => setFq(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, flex: "1 1 160px" }} />
          <input placeholder="plant wk(s)" value={fwk} onChange={e => setFwk(e.target.value)} style={{ padding: "6px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontFamily: "inherit", fontSize: 13, width: 110 }} />
          <button onClick={() => setSel(new Set(shown.map(r => r.id)))} style={{ background: "transparent", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Select all shown ({shown.length})</button>
          {sel.size > 0 && <button onClick={() => setTaskItems(toItems(rows.filter(r => sel.has(r.id))))} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>＋ Create one task ({sel.size})</button>}
          {sel.size > 0 && <button onClick={() => setSel(new Set())} style={{ background: "transparent", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 13 }}>clear</button>}
        </div>
      )}
      {taskItems && <Modal onClose={() => { setTaskItems(null); setSel(new Set()); }}><TaskComposer items={taskItems} planId={planId} houseId={house.id} onClose={() => { setTaskItems(null); setSel(new Set()); }} /></Modal>}
      {detail && <Modal onClose={() => setDetail(null)}><ItemDetail row={detail} planId={planId} onClose={() => setDetail(null)} onTask={() => { setTaskItems(toItems([detail])); setDetail(null); }} /></Modal>}
      {rows.length === 0 ? (
        <div style={{ color: COLORS.muted, padding: "20px 0" }}>No crops planned on this building for this plan.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f3f5ef" }}>
              <th style={{ ...th, width: 28 }}></th>
              <SortHdr col="bench" label="Bench" />
              <SortHdr col="plant_week" label="Plant Wk" />
              <SortHdr col="item" label="Item" />
              <SortHdr col="pots" label="Pots" align="right" />
              <SortHdr col="liners" label="Liners" align="right" />
              <SortHdr col="cost" label="Cost" align="right" />
              <SortHdr col="revenue" label="Revenue" align="right" />
              <SortHdr col="profit" label="Profit" align="right" />
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}`, background: sel.has(r.id) ? "#eef6e6" : "transparent" }}>
                <td style={{ ...td, textAlign: "center" }}><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleSel(r.id)} style={{ cursor: "pointer", accentColor: COLORS.light }} /></td>
                <td style={td}>{r.bench?.code}</td>
                <td style={td}>{r.plant_week}</td>
                <td style={td}>
                  <div style={{ fontWeight: 600, cursor: "pointer", color: COLORS.dark, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setDetail(r)} title="Open item details + culture">
                    {r.planting_layout && <span style={{ background: "#6a4fb0", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 8, letterSpacing: 0.5, flexShrink: 0 }}>COMBO</span>}
                    {/flagged to drop/i.test(r.notes || "") && <span style={{ background: "#d94f3d", color: "#fff", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 8, letterSpacing: 0.5, flexShrink: 0 }}>⚠ DROP</span>}
                    {r.improvement_note && <span title={r.improvement_note} style={{ flexShrink: 0 }}>🚩</span>}
                    {r.kept_note && <span title={r.kept_note} style={{ flexShrink: 0 }}>✅</span>}
                    <span>{r.item_name || [r.variety?.variety, r.container && `(${r.container})`].filter(Boolean).join(" ") || "—"}</span>
                  </div>
                  {r.variety?.variety && <div style={{ color: COLORS.muted, fontSize: 11 }}>{r.variety.variety}{r.variety.breeder ? ` · ${r.variety.breeder}` : ""}</div>}
                  {r.improvement_note && <div style={{ color: "#c0392b", fontSize: 11, marginTop: 2, fontWeight: 600 }}>🚩 {r.improvement_note}</div>}
                  {r.kept_note && <div style={{ color: "#2e7d32", fontSize: 11, marginTop: 2, fontWeight: 600 }}>✅ {r.kept_note}</div>}
                </td>
                <td style={{...td, textAlign:"right"}}>{r.qty_pots}</td>
                <td style={{...td, textAlign:"right"}}>{r.qty_plants_ordered}</td>
                <td style={{...td, textAlign:"right"}}>{fmtMoney(r.direct_cost_total)}</td>
                <td style={{...td, textAlign:"right"}}>{fmtMoney(r.revenue)}</td>
                <td style={{...td, textAlign:"right", fontWeight:700, color:COLORS.dark}}>{fmtMoney(r.gross_profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 11, textTransform: "uppercase", color: COLORS.muted, borderBottom: `2px solid ${COLORS.border}` };
const td = { padding: "8px 10px", color: COLORS.text };

// ── Plan Tasks panel ────────────────────────────────────────────────────────
// Lists all manager_tasks for this plan grouped by status + sorted by target_date.
// Filter chips for category. Click to expand task details.
function PlanTasks({ planId }) {
  const sb = getSupabase();
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");      // all | growing | sales | maintenance
  const [statusFilter, setStat] = useState("upcoming"); // upcoming | all | done
  const [groupBy, setGroupBy]   = useState("location_week"); // none | location | week | location_week

  useEffect(() => {
    if (!sb) return;
    setLoading(true);
    (async () => {
      const { data } = await sb.from("manager_tasks")
        .select("*").eq("plan_id", planId).order("target_date", { ascending: true });
      setTasks(data || []);
      setLoading(false);
    })();
  }, [sb, planId]);

  if (loading) return null;

  const today = new Date().toISOString().slice(0, 10);
  const filtered = tasks.filter(t => {
    if (filter !== "all" && t.category !== filter) return false;
    if (statusFilter === "upcoming") return (t.target_date >= today) && t.status !== "completed";
    if (statusFilter === "done")     return t.status === "completed";
    return true;
  });

  // Extract a plant-week from the title (e.g., "(wk30)" or "(wk30 planting)")
  function extractPlantWeek(t) {
    const m = (t.title || "").match(/\(wk(\d+)/);
    if (m) return parseInt(m[1]);
    return t.week_number || null;
  }

  // Group tasks based on groupBy
  function groupTasks(list) {
    if (groupBy === "none") return [{ key: "all", label: null, tasks: list }];
    const groups = {};
    for (const t of list) {
      let key, label;
      if (groupBy === "location") {
        key = t.location || "(no location)";
        label = `📍 ${key}`;
      } else if (groupBy === "week") {
        const wk = extractPlantWeek(t);
        key = wk != null ? `wk${wk}` : "(no plant week)";
        label = wk != null ? `📅 Plant week ${wk}` : "(no plant week)";
      } else { // location_week
        const wk = extractPlantWeek(t);
        const loc = t.location || "(no location)";
        key = `${loc}__${wk || "?"}`;
        label = wk != null ? `📍 ${loc} · 📅 wk${wk}` : `📍 ${loc}`;
      }
      if (!groups[key]) groups[key] = { key, label, tasks: [], firstDate: t.target_date };
      groups[key].tasks.push(t);
      if (t.target_date < groups[key].firstDate) groups[key].firstDate = t.target_date;
    }
    return Object.values(groups).sort((a, b) => (a.firstDate || "").localeCompare(b.firstDate || ""));
  }
  const grouped = groupTasks(filtered);

  // Stats
  const totalThisPlan  = tasks.length;
  const upcomingCount  = tasks.filter(t => t.target_date >= today && t.status !== "completed").length;
  const overdueCount   = tasks.filter(t => t.target_date < today && t.status !== "completed").length;
  const doneCount      = tasks.filter(t => t.status === "completed").length;

  const categories = Array.from(new Set(tasks.map(t => t.category))).filter(Boolean);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>
          Tasks · {totalThisPlan} total · {upcomingCount} upcoming · {overdueCount} overdue · {doneCount} done
        </div>
      </div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 12 }}>
        Tasks tagged to this plan. Same data that lands on workers' phones via the mobile task view.
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <FilterChip active={statusFilter==="upcoming"} onClick={() => setStat("upcoming")}>Upcoming</FilterChip>
        <FilterChip active={statusFilter==="all"}      onClick={() => setStat("all")}>All</FilterChip>
        <FilterChip active={statusFilter==="done"}     onClick={() => setStat("done")}>Done</FilterChip>
        <span style={{ borderLeft: `1px solid ${COLORS.border}`, margin: "0 6px" }} />
        <FilterChip active={filter==="all"} onClick={() => setFilter("all")}>All categories</FilterChip>
        {categories.map(c => (
          <FilterChip key={c} active={filter===c} onClick={() => setFilter(c)}>{c}</FilterChip>
        ))}
        <span style={{ borderLeft: `1px solid ${COLORS.border}`, margin: "0 6px" }} />
        <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 700, textTransform: "uppercase" }}>Group:</span>
        <FilterChip active={groupBy==="location_week"} onClick={() => setGroupBy("location_week")}>📍+📅</FilterChip>
        <FilterChip active={groupBy==="location"}      onClick={() => setGroupBy("location")}>📍 Location</FilterChip>
        <FilterChip active={groupBy==="week"}          onClick={() => setGroupBy("week")}>📅 Week</FilterChip>
        <FilterChip active={groupBy==="none"}          onClick={() => setGroupBy("none")}>None</FilterChip>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: COLORS.muted, padding: "20px 0", textAlign: "center" }}>
          No tasks match the current filter.
        </div>
      ) : (
        <div style={{ maxHeight: 640, overflowY: "auto" }}>
          {grouped.map(g => <TaskGroup key={g.key} group={g} />)}
        </div>
      )}
    </div>
  );
}

// Collapsible group of tasks. Header shows location + plant-week summary + bench codes from all tasks in group.
function TaskGroup({ group }) {
  const [open, setOpen] = useState(true);
  if (!group.label) {
    return group.tasks.map(t => <TaskRow key={t.id} task={t} />);
  }
  // Aggregate bench codes across all tasks in the group (de-duplicated)
  const benchSet = new Set();
  for (const t of group.tasks) {
    if (Array.isArray(t.bench_numbers)) for (const b of t.bench_numbers) benchSet.add(b);
  }
  const benches = Array.from(benchSet).sort();
  const dates = group.tasks.map(t => t.target_date).sort();
  const dateRange = dates.length > 0 ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`) : "";

  return (
    <div style={{ borderBottom: `2px solid ${COLORS.border}`, marginBottom: 12 }}>
      <div onClick={() => setOpen(!open)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#eaf3df", padding: "8px 12px", borderRadius: 6 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.dark }}>
            {group.label} <span style={{ color: COLORS.muted, fontWeight: 600, fontSize: 12 }}>· {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}</span>
          </div>
          {benches.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 10, color: COLORS.dark, fontFamily: "monospace" }}>
              <strong>{benches.length} bench{benches.length === 1 ? "" : "es"}:</strong> {benches.slice(0, 12).join(", ")}{benches.length > 12 ? `, +${benches.length - 12} more` : ""}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted, textAlign: "right" }}>
          {dateRange}
          <div style={{ fontSize: 14, color: COLORS.muted }}>{open ? "▾" : "▸"}</div>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 4 }}>
          {group.tasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "5px 11px", fontSize: 12, fontWeight: 700,
        background: active ? COLORS.dark : "#f3f5ef",
        color: active ? "#fff" : COLORS.text,
        border: `1px solid ${active ? COLORS.dark : COLORS.border}`,
        borderRadius: 14, cursor: "pointer",
      }}>{children}</button>
  );
}

function TaskRow({ task }) {
  const [expanded, setExpanded] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.target_date < today && task.status !== "completed";
  const isToday   = task.target_date === today;
  const dateColor = task.status === "completed" ? COLORS.muted
                   : isOverdue ? COLORS.red
                   : isToday   ? COLORS.amber
                   : COLORS.text;
  const catColor = {
    growing:     COLORS.light,
    sales:       "#7d6cb3",
    maintenance: "#c79a3a",
    production:  "#4a7a35",
  }[task.category] || COLORS.muted;

  return (
    <div style={{
      borderBottom: `1px solid ${COLORS.border}`,
      padding: "10px 4px",
      opacity: task.status === "completed" ? 0.6 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <span style={{
          background: catColor + "22", border: `1px solid ${catColor}`, color: catColor,
          padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800, textTransform: "uppercase",
          minWidth: 70, textAlign: "center",
        }}>{task.category || "—"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 14 }}>
            {task.status === "completed" && "✓ "}{task.title}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {task.location && <>📍 {task.location} · </>}
            {task.assigned_to && <>👤 {task.assigned_to} · </>}
            {task.bench_numbers && Array.isArray(task.bench_numbers) && task.bench_numbers.length > 0 && (
              <>{task.bench_numbers.length} bench{task.bench_numbers.length === 1 ? "" : "es"}</>
            )}
          </div>
          {task.bench_numbers && Array.isArray(task.bench_numbers) && task.bench_numbers.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
              {task.bench_numbers.slice(0, 16).map(b => (
                <span key={b} style={{ background: "#fff", border: `1px solid ${COLORS.border}`, color: COLORS.dark, fontSize: 10, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                  {b}
                </span>
              ))}
              {task.bench_numbers.length > 16 && (
                <span style={{ fontSize: 10, color: COLORS.muted, alignSelf: "center" }}>+{task.bench_numbers.length - 16} more</span>
              )}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: dateColor, fontWeight: 600, textAlign: "right", minWidth: 100 }}>
          {task.target_date}
          {isOverdue && <div style={{ fontSize: 9, fontWeight: 800 }}>OVERDUE</div>}
          {isToday   && <div style={{ fontSize: 9, fontWeight: 800 }}>TODAY</div>}
        </div>
        <span style={{ color: COLORS.muted, fontSize: 14 }}>{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#f3f5ef", borderRadius: 6, fontSize: 12, color: COLORS.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {task.description || <em style={{ color: COLORS.muted }}>(no description)</em>}
          {task.bench_numbers && Array.isArray(task.bench_numbers) && task.bench_numbers.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.muted }}>
              Benches: {task.bench_numbers.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniKPI({ label, value, color, sub }) {
  return (
    <div style={{ background: "#f3f5ef", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 10, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}
