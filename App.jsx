import { useState } from "react";
import { CROP_STATUS } from "./shared";

// Module imports — each is a self-contained page
import PlannerHome      from "./PlannerHome";
import CropPlanning     from "./CropPlanning";
import YoungPlantOrders from "./YoungPlantOrders";
import SpaceManagement  from "./SpaceManagement";
import Libraries        from "./Libraries";
import OperatorView     from "./OperatorView";

const LOGO_WHITE = "https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png";

// ── MODE PICKER ───────────────────────────────────────────────────────────────
function ModePicker({ onSelect }) {
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#1a2a1a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 70, objectFit: "contain", marginBottom: 40 }} />
      <div style={{ fontSize: 13, color: "#6a8a5a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>Greenhouse Ops</div>
      <div style={{ fontSize: 28, color: "#e8f4d8", fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 48, textAlign: "center" }}>How are you using this today?</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 360 }}>
        <button onClick={() => onSelect("planner")}
          style={{ padding: "22px 24px", borderRadius: 18, border: "2px solid #4a6a3a", background: "rgba(255,255,255,.05)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.05)"}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#c8e6b8", marginBottom: 4 }}>Planner</div>
          <div style={{ fontSize: 13, color: "#6a8a5a", lineHeight: 1.5 }}>Set up crop runs, manage orders, assign space, review the full season</div>
        </button>

        <button onClick={() => onSelect("operator")}
          style={{ padding: "22px 24px", borderRadius: 18, border: "2px solid #4a6a3a", background: "rgba(255,255,255,.05)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.05)"}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#c8e6b8", marginBottom: 4 }}>Floor Operator</div>
          <div style={{ fontSize: 13, color: "#6a8a5a", lineHeight: 1.5 }}>Today's tasks, what's ready to ship, crop status, flag a problem</div>
        </button>
      </div>
    </div>
  );
}

// ── PLANNER SHELL ─────────────────────────────────────────────────────────────
const PLANNER_TABS = [
  { id: "home",    label: "Home"    },
  { id: "crops",   label: "Crops"   },
  { id: "orders",  label: "Orders"  },
  { id: "space",   label: "Space"   },
  { id: "library", label: "Library" },
];

function PlannerShell({ onSwitchMode }) {
  const [page, setPage] = useState("home");

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Top nav */}
      <div style={{ background: "#1a2a1a", padding: "0 24px", display: "flex", alignItems: "center", gap: 0, position: "sticky", top: 0, zIndex: 100 }}>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 44, objectFit: "contain", marginRight: 24, flexShrink: 0 }} />

        <div style={{ display: "flex", flex: 1 }}>
          {PLANNER_TABS.map(t => (
            <button key={t.id} onClick={() => setPage(t.id)}
              style={{ padding: "14px 18px", background: "none", border: "none", borderBottom: `3px solid ${page === t.id ? "#7fb069" : "transparent"}`, color: page === t.id ? "#c8e6b8" : "#6a8a5a", fontWeight: page === t.id ? 800 : 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>

        <button onClick={onSwitchMode}
          style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, padding: "6px 14px", color: "#6a8a5a", fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          Switch Mode
        </button>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
        {page === "home"    && <PlannerHome    onNavigate={setPage} />}
        {page === "crops"   && <CropPlanning   />}
        {page === "orders"  && <YoungPlantOrders />}
        {page === "space"   && <SpaceManagement />}
        {page === "library" && <Libraries      />}
      </div>
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState(null); // null | 'planner' | 'operator'

  if (!mode) return <ModePicker onSelect={setMode} />;
  if (mode === "operator") return <OperatorView onSwitchMode={() => setMode(null)} />;
  return <PlannerShell onSwitchMode={() => setMode(null)} />;
}
