// Production Plans — top-level planning + profitability view.
// Phase 1: plan list + dashboard + property map (SVG) colored by per-house profit.
// Future phases: per-bench drilldown, inline crop edit, satellite-photo overlays.

import { useState, useEffect, useMemo, useRef } from "react";
import { getSupabase, getCultureClient } from "./supabase";
import { useAuth } from "./Auth";

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
  { id: "orders",    label: "📋 Orders" },
  { id: "inputs",    label: "⚙ Inputs" },
  { id: "pricing",   label: "💰 Pricing" },
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
      let rows = [];
      for (let from = 0; ; from += 1000) {   // paginate — PostgREST caps at 1000/req; plan P&L exceeds it
        const { data } = await sb.from("v_scheduled_crops_pl")
          .select("liner_cost,pot_cost,soil_cost,ring_cost,direct_cost_total,revenue,gross_profit,bench_id,qty_pots,is_combo_component,combo_parent_id")
          .eq("plan_id", plan.id).range(from, from + 999);
        if (!data || !data.length) break;
        rows = rows.concat(data);
        if (data.length < 1000) break;
      }

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
          {!hasData && tab !== "tasks" && (
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
          {hasData && tab === "orders"    && <OrdersTab plan={plan} />}
          {hasData && tab === "inputs"    && <InputsTab plan={plan} />}
          {hasData && tab === "pricing"   && <PricingTab plan={plan} />}
          {hasData && tab === "items"     && <ItemsTab plan={plan} />}
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
    const { data: it } = await sb.from("scheduled_crops").select("item_name").eq("plan_id", plan.id).not("item_name", "is", null);
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
      const { data: scd } = await sb.from("scheduled_crops").select("id,item_name,plant_week,bench_id,variety_id,qty_pots,is_combo_component,improvement_note").eq("plan_id", plan.id);
      const benchIds = [...new Set((scd || []).map(r => r.bench_id).filter(Boolean))];
      const varIds = [...new Set((scd || []).map(r => r.variety_id).filter(Boolean))];
      const { data: bdata } = benchIds.length ? await sb.from("benches").select("id,code,zone_label").in("id", benchIds) : { data: [] };
      const { data: vdata } = varIds.length ? await sb.from("variety_library").select("id,variety,crop_name").in("id", varIds) : { data: [] };
      setAll((scd || []).map(r => {
        const b = (bdata || []).find(x => x.id === r.bench_id);
        const v = (vdata || []).find(x => x.id === r.variety_id);
        return { id: r.id, item: r.item_name, plant_week: r.plant_week, bench: b?.code, house: b?.zone_label, variety: v?.variety, crop: v?.crop_name, is_combo_component: r.is_combo_component, improvement_note: r.improvement_note };
      }));
    })();
  }, [sb, plan?.id]);
  // Houses (zone_labels) that have at least one item flagged with a fix-next-year note.
  const flaggedHouses = useMemo(() => new Set(all.filter(r => r.improvement_note && r.house).map(r => r.house)), [all]);

  const weeks = wk.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  const active = !!(q.trim() || weeks.length);
  const matches = !active ? [] : all.filter(r => {
    const txt = `${r.item || ""} ${r.variety || ""} ${r.crop || ""}`.toLowerCase();
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
            {sel.size > 0 && <button onClick={() => setTaskItems(matches.filter(m => sel.has(m.id)).map(m => ({ item: m.item || m.variety || "item", bench: m.bench })))} style={{ background: COLORS.dark, color: "#fff", border: "none", borderRadius: 8, padding: "5px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>＋ Create one task ({sel.size})</button>}
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
                  <span>{m.item || m.variety} <span style={{ color: COLORS.muted, fontSize: 11 }}>· wk {m.plant_week}</span></span>
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
      const { data: pl } = await sb.from("v_scheduled_crops_pl")
        .select("variety_id,container_id,qty_pots,qty_plants_ordered,direct_cost_total,revenue,gross_profit,is_combo_component,combo_parent_id")
        .eq("plan_id", planId);
      const { data: vars } = await sb.from("variety_library").select("id,variety,breeder,series,typical_color");
      const { data: containers } = await sb.from("containers").select("id,sku");

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
function WeekTab({ planId }) {
  const sb = getSupabase();
  const [byWeek, setByWeek] = useState([]);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: pl } = await sb.from("v_scheduled_crops_pl")
        .select("plant_week,variety_id,qty_pots,qty_plants_ordered,direct_cost_total,revenue,gross_profit,bench_id,is_combo_component,combo_parent_id")
        .eq("plan_id", planId);
      const { data: vars } = await sb.from("variety_library").select("id,variety");
      const { data: bench } = await sb.from("benches").select("id,zone_label").limit(2000);

      const byW = {};
      for (const r of (pl || [])) {
        const wk = r.plant_week;
        if (!byW[wk]) byW[wk] = {
          week: wk, varieties: new Set(), zones: new Set(),
          liners: 0, pots: 0, cost: 0, revenue: 0, profit: 0, rows: 0,
        };
        const v = (vars || []).find(x => x.id === r.variety_id);
        const b = (bench || []).find(x => x.id === r.bench_id);
        if (v) byW[wk].varieties.add(v.variety);
        if (b) byW[wk].zones.add(b.zone_label);
        byW[wk].rows += 1;
        byW[wk].liners  += +r.qty_plants_ordered || 0;
        byW[wk].pots    += (r.is_combo_component && r.combo_parent_id ? 0 : (+r.qty_pots || 0));
        byW[wk].cost    += +r.direct_cost_total || 0;
        byW[wk].revenue += +r.revenue || 0;
        byW[wk].profit  += +r.gross_profit || 0;
      }
      setByWeek(Object.values(byW).sort((a, b) => a.week - b.week));
    })();
  }, [sb, planId]);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 12 }}>
        By Plant Week · {byWeek.length} weeks
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {byWeek.map(w => (
          <div key={w.week} style={{ background: "#f3f5ef", borderLeft: `4px solid ${COLORS.light}`, padding: 14, borderRadius: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: COLORS.dark }}>Week {w.week}</div>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: COLORS.muted }}>
                <span>{w.rows} crop block(s)</span>
                <span>{w.varieties.size} varieties</span>
                <span>{w.zones.size} zone(s)</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              <MiniKPI label="Liners"  value={w.liners.toLocaleString()} color={COLORS.text} />
              <MiniKPI label="Pots"    value={w.pots.toLocaleString()}   color={COLORS.text} />
              <MiniKPI label="Cost"    value={fmtMoney(w.cost)}          color={COLORS.text} />
              <MiniKPI label="Revenue" value={fmtMoney(w.revenue)}       color={COLORS.light} />
              <MiniKPI label="Profit"  value={fmtMoney(w.profit)}        color={COLORS.dark} />
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: COLORS.muted }}>
              <strong>Varieties:</strong> {Array.from(w.varieties).slice(0, 8).join(", ")}{w.varieties.size > 8 ? `, +${w.varieties.size - 8} more` : ""}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: COLORS.muted }}>
              <strong>Zones:</strong> {Array.from(w.zones).join(" · ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pricing tab ─────────────────────────────────────────────────────────────
function PricingTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: prices } = await sb.from("crop_pricing")
        .select("id,container_id,crop_name,effective_year,price,price_tier,source_doc,notes")
        .eq("effective_year", plan.year)
        .order("price", { ascending: false });
      const { data: containers } = await sb.from("containers").select("id,sku,name,diameter_in");
      setRows((prices || []).map(p => ({
        ...p,
        container: (containers || []).find(c => c.id === p.container_id),
      })));
    })();
  }, [sb, plan.year]);

  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700, marginBottom: 12 }}>
        Pricing · {plan.year} sale prices
      </div>
      {rows.length === 0 ? (
        <div style={{ color: COLORS.muted, padding: "20px 0" }}>No pricing for {plan.year} yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f3f5ef" }}>
              <th style={th}>Container</th>
              <th style={th}>Crop</th>
              <th style={{...th, textAlign:"right"}}>Price</th>
              <th style={th}>Tier</th>
              <th style={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={td}><strong>{r.container?.sku || "—"}</strong> <span style={{ color: COLORS.muted, fontSize: 11 }}>{r.container?.name}</span></td>
                <td style={td}>{r.crop_name}</td>
                <td style={{...td, textAlign:"right", fontWeight: 800, color: COLORS.dark, fontSize: 15}}>${(+r.price).toFixed(2)}</td>
                <td style={td}>{r.price_tier}</td>
                <td style={{...td, fontSize: 11, color: COLORS.muted}}>{r.source_doc}</td>
              </tr>
            ))}
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
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: sc } = await sb.from("scheduled_crops")
        .select("id,variety_id,container_id,bench_id,color,qty_pots,ppp,qty_plants_ordered,liner_unit_cost,plant_week,ship_week,status")
        .eq("plan_id", plan.id);
      const { data: vars } = await sb.from("variety_library").select("id,variety,breeder");
      const { data: containers } = await sb.from("containers").select("id,sku");
      const { data: bench } = await sb.from("benches").select("id,code,zone_label").limit(2000);

      setRows((sc || []).map(r => ({
        ...r,
        variety: (vars || []).find(v => v.id === r.variety_id),
        container: (containers || []).find(c => c.id === r.container_id),
        bench: (bench || []).find(b => b.id === r.bench_id),
      })).sort((a, b) => a.plant_week - b.plant_week || (a.bench?.code || "").localeCompare(b.bench?.code || "")));
    })();
  }, [sb, plan.id]);

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
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
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
                <td style={td}>{r.status}</td>
              </tr>
            ))}
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
      let sc = [];
      for (let from = 0; ; from += 1000) {   // paginate (PostgREST 1000-row cap) + include combo components
        const { data } = await sb.from("scheduled_crops")
          .select("id,variety_id,container_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,item_name,prop_method,is_combo_component")
          .eq("plan_id", plan.id).range(from, from + 999);
        if (!data || !data.length) break;
        sc = sc.concat(data);
        if (data.length < 1000) break;
      }
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
function SalesVsPlanTab({ plan }) {
  const sb = getSupabase();
  const [rows, setRows] = useState(null);
  const [season, setSeason] = useState(null);
  const [sortBy, setSortBy] = useState("lost");
  const [filt, setFilt] = useState("all");
  useEffect(() => {
    if (!sb) return;
    const COMPONENT = /\bVINE\b|\bIVY\b|HEDERA|MU[EH]+LENBECKIA|CAREX/i;
    (async () => {
      const page = async (tbl, sel, eq) => { let out = []; for (let f = 0; ; f += 1000) { let q = sb.from(tbl).select(sel).range(f, f + 999); if (eq) q = q.eq(eq[0], eq[1]); const { data } = await q; if (!data || !data.length) break; out = out.concat(data); if (data.length < 1000) break; } return out; };
      const xw = await page("sales_sku_map", "sku,plan_item_name");
      const skuToItem = {}; xw.forEach(x => { if (x.plan_item_name) skuToItem[x.sku] = x.plan_item_name; });
      const tot = await page("sales_totals", "sku,units,revenue,avg_price");
      const wk = await page("sales_weekly", "sku,wk,units,revenue");
      const sc = await page("scheduled_crops", "item_name,qty_pots,ship_week", ["plan_id", plan.id]);
      const weeks = [...new Set(wk.map(w => +w.wk))].sort((a, b) => a - b);
      const wIdx = Object.fromEntries(weeks.map((w, i) => [w, i]));
      const planByItem = {}, shipByItem = {};
      for (const r of sc) { if (!(+r.qty_pots > 0) || COMPONENT.test(r.item_name)) continue; planByItem[r.item_name] = (planByItem[r.item_name] || 0) + +r.qty_pots; if (r.ship_week != null) shipByItem[r.item_name] = Math.min(shipByItem[r.item_name] ?? 999, +r.ship_week); }
      const sold = {}, rev = {}, prc = {}, prn = {}, wkly = {};
      for (const t of tot) { const it = skuToItem[t.sku]; if (!it) continue; sold[it] = (sold[it] || 0) + +t.units; rev[it] = (rev[it] || 0) + +t.revenue; prc[it] = (prc[it] || 0) + +t.avg_price; prn[it] = (prn[it] || 0) + 1; }
      for (const w of wk) { const it = skuToItem[w.sku]; if (!it) continue; (wkly[it] = wkly[it] || Array(weeks.length).fill(0))[wIdx[+w.wk]] += +w.units; }
      const seasonRev = Array(weeks.length).fill(0); for (const w of wk) seasonRev[wIdx[+w.wk]] += +w.revenue;
      const out = [];
      for (const it of Object.keys(planByItem)) {
        const planned = planByItem[it], s = sold[it] || 0, price = prn[it] ? prc[it] / prn[it] : 0;
        const wkA = wkly[it] || Array(weeks.length).fill(0);
        const peak = wkA.some(x => x > 0) ? weeks[wkA.indexOf(Math.max(...wkA))] : null;
        out.push({ item: it, planned, sold: s, st: planned ? s / planned : 0, lost: s < planned ? Math.round((planned - s) * price) : 0, rev: Math.round(rev[it] || 0), wk: wkA, peak, ship: shipByItem[it] ?? null, status: s >= planned ? "HIT" : (s === 0 ? "NOSALE" : "SHORT") });
      }
      setRows(out); setSeason({ weeks, seasonRev });
    })();
  }, [sb, plan.id]);
  if (!rows) return <div style={{ padding: 20, color: COLORS.muted }}>Loading sales vs plan…</div>;
  if (!rows.length) return <div style={{ padding: 20, color: COLORS.muted }}>No matched sales yet — the SKU crosswalk (sales_sku_map) is empty for this plan's items.</div>;
  const spark = a => { const m = Math.max(...a) || 1; return a.map(v => " ▁▂▃▄▅▆▇█"[Math.round(v / m * 8)]).join(""); };
  const tPlanned = rows.reduce((a, r) => a + r.planned, 0), tSold = rows.reduce((a, r) => a + r.sold, 0);
  const tLost = rows.reduce((a, r) => a + r.lost, 0), tRev = rows.reduce((a, r) => a + r.rev, 0);
  const maxR = Math.max(...season.seasonRev, 1); const pkWk = season.weeks[season.seasonRev.indexOf(maxR)];
  const shown = rows.filter(r => filt === "all" ? true : filt === "short" ? r.status === "SHORT" : r.status === "HIT")
    .sort((a, b) => sortBy === "lost" ? b.lost - a.lost : sortBy === "st" ? a.st - b.st : sortBy === "rev" ? b.rev - a.rev : b.sold - a.sold);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: COLORS.muted }}>
        2026 actual sales vs this plan, matched by SKU crosswalk. <strong>Sell-through</strong> = sold ÷ planned · <strong>Lost $</strong> = (planned − sold) × price on short items · demand sparkline = weekly units (wk{season.weeks[0]}–wk{season.weeks[season.weeks.length - 1]}).
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <RevStat label="Sell-through" value={tPlanned ? Math.round(tSold / tPlanned * 100) + "%" : "—"} accent={COLORS.dark} />
        <RevStat label="Lost sales" value={fmtMoney(tLost)} accent={COLORS.red} />
        <RevStat label="2026 revenue (matched)" value={fmtMoney(tRev)} accent={COLORS.light} />
        <RevStat label="Demand peak" value={"wk" + pkWk} accent={COLORS.dark} />
      </div>
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
        {["all", "short", "hit"].map(f => <button key={f} onClick={() => setFilt(f)} style={{ padding: "6px 12px", borderRadius: 16, fontWeight: 700, cursor: "pointer", border: `1px solid ${filt === f ? COLORS.light : COLORS.border}`, background: filt === f ? COLORS.light : "#fff", color: filt === f ? "#fff" : COLORS.text }}>{f === "all" ? "All" : f === "short" ? "🔴 Short" : "🟢 Sold out"}</button>)}
        <span style={{ marginLeft: 8, color: COLORS.muted }}>sort:</span>
        {[["lost", "Lost $"], ["st", "Sell-through"], ["rev", "Revenue"], ["sold", "Units"]].map(([k, l]) => <button key={k} onClick={() => setSortBy(k)} style={{ padding: "6px 10px", borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1px solid ${sortBy === k ? COLORS.dark : COLORS.border}`, background: sortBy === k ? COLORS.dark : "#fff", color: sortBy === k ? "#fff" : COLORS.text }}>{l}</button>)}
        <span style={{ marginLeft: "auto", color: COLORS.muted }}>{shown.length} items</span>
      </div>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>
            <th style={th}>Item</th><th style={{ ...th, textAlign: "right" }}>Planned</th><th style={{ ...th, textAlign: "right" }}>Sold</th>
            <th style={{ ...th, textAlign: "right" }}>Sell-thru</th><th style={th}>Status</th><th style={{ ...th, textAlign: "right" }}>Lost $</th>
            <th style={{ ...th, textAlign: "right" }}>2026 $</th><th style={th}>Demand (wk{season.weeks[0]}–{season.weeks[season.weeks.length - 1]})</th><th style={th}>Timing</th>
          </tr></thead>
          <tbody>
            {shown.slice(0, 500).map((r, i) => {
              const late = r.ship != null && r.peak != null && r.ship > r.peak;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.item}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.planned.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.sold.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.st >= 1 ? "#2e7d32" : r.st < 0.6 ? COLORS.red : COLORS.text }}>{Math.round(r.st * 100)}%</td>
                  <td style={td}><span style={{ fontSize: 10, fontWeight: 800, padding: "1px 6px", borderRadius: 8, color: "#fff", background: r.status === "HIT" ? "#5e9c4a" : r.status === "NOSALE" ? "#c8d0c0" : "#e89a3a" }}>{r.status}</span></td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: r.lost > 0 ? COLORS.red : COLORS.muted }}>{r.lost ? fmtMoney(r.lost) : "—"}</td>
                  <td style={{ ...td, textAlign: "right", color: COLORS.muted }}>{fmtMoney(r.rev)}</td>
                  <td style={{ ...td, fontFamily: "monospace", color: "#4a6b3a", letterSpacing: 1 }} title={r.peak ? `peak wk${r.peak}` : "no weekly sales"}>{spark(r.wk)}{r.peak ? <span style={{ color: COLORS.muted, fontSize: 10, letterSpacing: 0 }}> wk{r.peak}</span> : null}</td>
                  <td style={td}>{r.ship != null && r.peak != null ? <span style={{ fontSize: 11, fontWeight: 700, color: late ? COLORS.red : "#2e7d32" }} title={`finishes ~wk${r.ship}, demand peaks wk${r.peak}`}>{late ? `⚠ wk${r.ship}→${r.peak}` : `✓ wk${r.ship}`}</span> : <span style={{ color: "#c8d0c0" }}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
const DIFF_COLOR = { 1: "#7fb069", 2: "#e89a3a", 3: "#d94f3d" };

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
      let sc = [];
      for (let from = 0; ; from += 1000) {   // paginate — PostgREST caps at 1000/req; plan has more rows
        const { data } = await sb.from("scheduled_crops")
          .select("id,variety_id,prop_method,prop_tray_size,ship_week,ship_year,plant_week,plant_year,qty_pots,qty_plants_ordered,ppp,container_id,item_name,is_combo_component,bench_id")
          .eq("plan_id", plan.id).range(from, from + 999);
        if (!data || !data.length) break;
        sc = sc.concat(data);
        if (data.length < 1000) break;
      }
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
        const plants = (+r.qty_pots || +r.qty_plants_ordered || 0);
        const ppp = +r.ppp || 1; const pots = ppp ? Math.round(plants / ppp) : plants;
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
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#2e5c1e" }} title={(r.dests || []).map(d => `${d.pot}${d.isCombo ? " combo" : " finished"} — ${d.ppp}/pot × ${d.pots} pots = ${d.plants}${d.plantWk != null ? ` · plant wk${String(d.plantWk).padStart(2, "0")}${d.plantYr ? " '" + String(d.plantYr).slice(2) : ""}` : ""}`).join("\n")}>{(r.plugs || 0).toLocaleString()}</td>
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
      let sc = [];
      for (let from = 0; ; from += 1000) {   // paginate — PostgREST 1000-row cap
        const { data } = await sb.from("scheduled_crops")
          .select("id,variety_id,container_id,qty_pots,ppp,qty_plants_ordered,liner_unit_cost,soil_mix_id,is_combo_component,combo_parent_id,prop_method,prop_tray_size,ship_week,ship_year,plant_week,plant_year")
          .eq("plan_id", plan.id).range(from, from + 999);
        if (!data || !data.length) break;
        sc = sc.concat(data);
        if (data.length < 1000) break;
      }
      const parentIds = new Set((sc || []).filter(r => r.is_combo_component && r.combo_parent_id).map(r => r.combo_parent_id));
      const { data: vars } = await sb.from("variety_library").select("id,crop_name,variety,breeder");
      const { data: containers } = await sb.from("containers").select("id,sku,name,cost_per_unit,units_per_case,qty_per_pallet,fill_volume_cu_ft,default_ring_id,primary_supplier");
      const { data: soils } = await sb.from("soil_mixes").select("id,name,vendor,cost_per_bag,fluffed_volume,bag_size,bags_per_pallet,cost_per_cf,cf_per_truck,cost_per_truck,origin");
      const { data: inputs } = await sb.from("program_inputs").select("*").eq("year", plan.year);
      let yearRows = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from("scheduled_crops")
          .select("qty_pots,is_combo_component,combo_parent_id,container_id,plant_year").range(from, from + 999);
        if (!data || !data.length) break;
        yearRows = yearRows.concat(data);
        if (data.length < 1000) break;
      }

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
      const all = [];
      let offset = 0;
      while (true) {
        const { data } = await sb.from("houseplant_sales_history")
          .select("period,product_code,description,pot_size,qty_sold,sold_value").range(offset, offset + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }

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
      const all = [];
      let offset = 0;
      while (true) {
        const { data } = await sb.from("houseplant_sales_history")
          .select("period,qty_sold,sold_value,pot_size").range(offset, offset + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
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
      const all = [];
      let offset = 0;
      while (true) {
        const { data } = await sb.from("houseplant_sales_history")
          .select("period,description,pot_size,qty_sold,sold_value").range(offset, offset + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
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
      const all = [];
      let offset = 0;
      while (true) {
        const { data } = await sb.from("houseplant_sales_history")
          .select("period,description,pot_size,qty_sold,sold_value").range(offset, offset + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        offset += 1000;
      }
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
  useEffect(() => {
    if (!row?.planting_layout) { setCombo([]); return; }
    const sb = getSupabase(); if (!sb) return;
    sb.from("scheduled_crops").select("variety_id,qty_plants_ordered").eq("combo_parent_id", row.id).then(async ({ data }) => {
      const vids = [...new Set((data || []).map(d => d.variety_id).filter(Boolean))];
      const { data: vs } = vids.length ? await sb.from("variety_library").select("id,crop_name,variety").in("id", vids) : { data: [] };
      setCombo((data || []).map(d => ({ qty: d.qty_plants_ordered, v: (vs || []).find(x => x.id === d.variety_id) })));
    });
  }, [row?.id, row?.planting_layout]);
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
      {layout && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Combo planting</div>
            {!editLayout && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditLayout(true)} style={{ fontSize: 12, fontWeight: 700, color: COLORS.dark, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>✏️ Arrange</button>
                <button onClick={async () => {
                  const recipe = combo.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}${c.qty ? ` ×${c.qty}` : ""}`.trim()).filter(Boolean).join(" · ");
                  const url = await shareComboDiagram(row, planId, recipe);
                  if (url) { try { await navigator.clipboard.writeText(url); } catch {} window.prompt("Shareable link (copied) — anyone can open this on their phone, no login needed:", url); }
                }} style={{ fontSize: 12, fontWeight: 700, color: COLORS.dark, background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>🔗 Share</button>
              </div>
            )}
          </div>
          {editLayout ? (
            <BasketDesigner layout={layout} plantNames={combo.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}`.trim()).filter(Boolean)}
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
              <ComboDiagram layout={layout} />
              <div style={{ flex: "1 1 200px" }}>
                <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 8 }}>{layout.howto}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>{combo.length ? combo.map(c => `${c.v?.crop_name || ""} ${c.v?.variety || ""}${c.qty ? ` (${c.qty})` : ""}`).join(" · ") : "—"}</div>
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
  const toItems = list => list.map(r => ({ item: r.item_name || r.variety?.variety || "item", bench: r.bench?.code, planting_layout: r.planting_layout || null, item_name: r.item_name || null }));

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
      const { data: sc } = ids.length ? await sb.from("scheduled_crops").select("id,item_name,is_combo_component,combo_parent_id,planting_layout,notes,improvement_note,kept_note").in("id", ids) : { data: [] };
      const { data: vars } = await sb.from("variety_library").select("id,variety,breeder,culture_source_id");

      setRows((pl || []).map(r => {
        const scr = (sc || []).find(x => x.id === r.id);
        return {
          ...r,
          bench: (bench || []).find(b => b.id === r.bench_id),
          variety: (vars || []).find(v => v.id === r.variety_id),
          item_name: scr?.item_name,
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
                    <span>{r.item_name || r.variety?.variety || "—"}</span>
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
