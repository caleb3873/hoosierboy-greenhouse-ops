import { useState } from "react";
import { AuthProvider, LoginScreen, UserMenu, useAuth } from "./Auth";
import { ExtractionProvider, useExtraction } from "./ExtractionContext";
import { CROP_STATUS } from "./shared";

// Module imports — each is a self-contained page
import PlannerHome      from "./PlannerHome";
import CropPlanning     from "./CropPlanning";
import YoungPlantOrders from "./YoungPlantOrders";
import SpaceManagement  from "./SpaceManagement";
import Libraries        from "./Libraries";
import OperatorView     from "./OperatorView";
import Preseason        from "./Preseason";
import { PlannerReceiving } from "./Receiving";
import Meetings            from "./Meetings";
import TradeShow           from "./TradeShow";
import Export              from "./Export";

// ── PLANNER SHELL ─────────────────────────────────────────────────────────────
// Nav grouped by category
const NAV_GROUPS = [
  {
    id: "home", label: "Home", icon: "🏠", solo: true,
  },
  {
    id: "production", label: "Production", icon: "🌱",
    items: [
      { id: "preseason", label: "Preseason" },
      { id: "crops",     label: "Crop Planning" },
      { id: "orders",    label: "Orders" },
      { id: "receiving", label: "Receiving" },
    ],
  },
  {
    id: "space", label: "Space", icon: "🏠", solo: true,
  },
  {
    id: "library", label: "Library", icon: "📚", solo: true,
  },
  {
    id: "tools", label: "Tools", icon: "🛠",
    items: [
      { id: "meetings",  label: "Meetings" },
      { id: "tradeshow", label: "Trade Show" },
      { id: "export",    label: "Export" },
    ],
  },
  {
    id: "combos", label: "Combos", icon: "🎨", solo: true,
  },
];

// All pages flat for easy lookup
const ALL_PAGES = NAV_GROUPS.flatMap(g => g.solo ? [g.id] : (g.items||[]).map(i => i.id));

// Which group a page belongs to
function pageGroup(pageId) {
  for (const g of NAV_GROUPS) {
    if (g.solo && g.id === pageId) return g.id;
    if (g.items?.some(i => i.id === pageId)) return g.id;
  }
  return null;
}

const LOGO_WHITE = "https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png";

function PlannerShell() {
  const [page, setPage] = useState("home");
  const { signOut, displayName, floorMode } = useAuth();
  const { extractionState } = useExtraction();

  const activeGroup = pageGroup(page) || page;

  // Sub-items for current group
  const currentGroup = NAV_GROUPS.find(g => g.id === activeGroup);
  const subItems = currentGroup?.items || null;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── TOP NAV — primary group bar ── */}
      <div style={{ background: "#1a2a1a", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ padding: "0 20px", display: "flex", alignItems: "center", gap: 0 }}>
          <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 40, objectFit: "contain", marginRight: 20, flexShrink: 0 }} />
          <div style={{ display: "flex", flex: 1, overflowX: "auto", scrollbarWidth: "none" }}>
            {NAV_GROUPS.map(g => {
              const isActive = activeGroup === g.id;
              const firstPage = g.solo ? g.id : (g.items?.[0]?.id || g.id);
              return (
                <button key={g.id}
                  onClick={() => setPage(firstPage)}
                  style={{ padding: "12px 16px", background: "none", border: "none", borderBottom: `3px solid ${isActive ? "#7fb069" : "transparent"}`, color: isActive ? "#c8e6b8" : "#6a8a5a", fontWeight: isActive ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "color .15s" }}>
                  {g.label}
                </button>
              );
            })}
          </div>
          <UserMenu />
        </div>

        {/* ── SUB-NAV — shown when group has children ── */}
        {subItems && (
          <div style={{ background: "#162212", padding: "0 20px", display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
            {subItems.map(item => (
              <button key={item.id}
                onClick={() => setPage(item.id)}
                style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: `2px solid ${page === item.id ? "#7fb069" : "transparent"}`, color: page === item.id ? "#7fb069" : "#4a6a3a", fontWeight: page === item.id ? 700 : 500, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Extraction progress banner — visible from any page */}
      {extractionState?.extracting && (
        <div
          onClick={() => setPage("library")}
          style={{
            background: "linear-gradient(90deg, #1e3a1a, #2a4a25)",
            padding: "8px 20px",
            display: "flex", alignItems: "center", gap: 12,
            cursor: "pointer",
            borderBottom: "1px solid #3a5a35",
          }}>
          <div style={{
            width: 16, height: 16, border: "2px solid #7fb069", borderTopColor: "transparent",
            borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0
          }} />
          <div style={{ fontSize: 12, color: "#c8e6b8", fontWeight: 600, flex: 1 }}>
            Importing {extractionState.breeder} catalog — {extractionState.processedPages}/{extractionState.totalToProcess} pages
          </div>
          <div style={{ fontSize: 11, color: "#7a9a6a" }}>
            {extractionState.extractedItems?.length || 0} varieties found
          </div>
          <div style={{
            background: "#3a5a35", borderRadius: 10, height: 6, width: 120, overflow: "hidden", flexShrink: 0
          }}>
            <div style={{
              background: "#7fb069", height: "100%", borderRadius: 10,
              width: `${extractionState.totalToProcess > 0 ? Math.round((extractionState.processedPages / extractionState.totalToProcess) * 100) : 0}%`,
              transition: "width 300ms ease-out",
            }} />
          </div>
        </div>
      )}

      {/* Page content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {page === "home"       && <PlannerHome    onNavigate={setPage} />}
        {page === "preseason"  && <Preseason      onNavigate={setPage} onCreateCropRun={() => setPage("crops")} />}
        {page === "crops"      && <CropPlanning   />}
        {page === "orders"     && <YoungPlantOrders />}
        {page === "receiving"  && <PlannerReceiving />}
        {page === "space"      && <SpaceManagement />}
        {page === "library"    && <Libraries      />}
        {page === "meetings"   && <Meetings        />}
        {page === "tradeshow"  && <TradeShow       />}
        {page === "export"     && <Export          />}
      </div>
    </div>
  );
}

// ── ROOT (auth-aware) ─────────────────────────────────────────────────────────
function AppInner() {
  const { isAuthenticated, isAdmin, isOperator, role, loading, signOut } = useAuth();

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#1e2d1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 56, marginBottom: 20, opacity: .8 }} />
        <div style={{ color: "#6a8a5a", fontSize: 14 }}>Loading...</div>
      </div>
    </div>
  );

  if (!isAuthenticated) return <LoginScreen />;

  // Admin → full planner
  if (isAdmin) return <PlannerShell />;

  // Operator / maintenance → operator view
  if (isOperator) return <OperatorView onSwitchMode={signOut} />;

  // Fallback
  return <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <ExtractionProvider>
        <AppInner />
      </ExtractionProvider>
    </AuthProvider>
  );
}
