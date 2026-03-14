import { useState } from "react";
import { AuthProvider, LoginScreen, UserMenu, useAuth } from "./Auth";
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
const PLANNER_TABS = [
  { id: "home",       label: "Home"      },
  { id: "preseason",  label: "Preseason" },
  { id: "crops",      label: "Crops"     },
  { id: "orders",     label: "Orders"    },
  { id: "receiving",  label: "Receiving" },
  { id: "space",      label: "Space"     },
  { id: "library",    label: "Library"   },
  { id: "meetings",   label: "Meetings"  },
  { id: "tradeshow",  label: "📸 Trade Show" },
  { id: "export",     label: "Export"    },
];

const LOGO_WHITE = "https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png";

function PlannerShell() {
  const [page, setPage] = useState("home");
  const { signOut, displayName, floorMode } = useAuth();

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Top nav */}
      <div style={{ background: "#1a2a1a", padding: "0 24px", display: "flex", alignItems: "center", gap: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 44, objectFit: "contain", marginRight: 24, flexShrink: 0 }} />

        <div style={{ display: "flex", flex: 1, overflowX: "auto" }}>
          {PLANNER_TABS.map(t => (
            <button key={t.id} onClick={() => setPage(t.id)}
              style={{ padding: "14px 18px", background: "none", border: "none", borderBottom: `3px solid ${page === t.id ? "#7fb069" : "transparent"}`, color: page === t.id ? "#c8e6b8" : "#6a8a5a", fontWeight: page === t.id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>

        <UserMenu />
      </div>

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
  const { isAuthenticated, isAdmin, isOperator, role, loading } = useAuth();

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
  if (isOperator) return <OperatorView onSwitchMode={null} />;

  // Fallback
  return <LoginScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
