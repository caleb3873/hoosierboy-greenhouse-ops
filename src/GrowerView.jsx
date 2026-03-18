import React, { useState } from "react";
import { useAuth } from "./Auth";
import { GROWER_ROLES } from "./shared";
import SprayLog from "./SprayLog";
import WateringPlan from "./WateringPlan";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";
const BG = "#f2f5ef";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "spray",     label: "Spray Log",  icon: "💨" },
  { id: "watering",  label: "Watering",   icon: "💧" },
  { id: "scouting",  label: "Scouting",   icon: "🔍" },
  { id: "meetings",  label: "Meetings",   icon: "📸" },
  { id: "flags",     label: "Flags",      icon: "🚩" },
];

export default function GrowerView({ onSwitchMode }) {
  const { growerProfile, displayName, signOut } = useAuth();
  const [tab, setTab] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const roleMeta = GROWER_ROLES.find(r => r.id === growerProfile?.role) || GROWER_ROLES[2];

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
      {/* Top bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: DARK, color: "#fff", padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={() => setDrawerOpen(!drawerOpen)} style={{
          background: "none", border: "none", color: "#fff", fontSize: 22, cursor: "pointer", padding: 0,
        }}>☰</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{displayName}</div>
          <div style={{
            fontSize: 11, padding: "1px 8px", borderRadius: 8,
            background: roleMeta.bg, color: roleMeta.color, display: "inline-block",
          }}>{roleMeta.label}</div>
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200,
          }} />
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 300,
            background: "#fff", boxShadow: "2px 0 12px rgba(0,0,0,0.15)", padding: "20px 0",
          }}>
            <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #e8e8e0" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: DARK }}>{displayName}</div>
              <div style={{ fontSize: 12, color: "#7a8c74" }}>{roleMeta.label}</div>
            </div>
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setDrawerOpen(false); }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 20px", border: "none", cursor: "pointer",
                background: tab === t.id ? "#f0f5ee" : "transparent",
                color: tab === t.id ? ACCENT : DARK,
                fontWeight: tab === t.id ? 700 : 400,
                fontSize: 14, fontFamily: FONT,
              }}>
                {t.icon} {t.label}
              </button>
            ))}
            <div style={{ borderTop: "1px solid #e8e8e0", marginTop: 16, paddingTop: 16 }}>
              <button onClick={() => { signOut(); if (onSwitchMode) onSwitchMode(); }} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "12px 20px", border: "none", cursor: "pointer",
                background: "transparent", color: "#c03030", fontSize: 14, fontFamily: FONT,
              }}>
                ↩ Sign Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      <div style={{ padding: 16 }}>
        {tab === "dashboard" && <GrowerDashboard growerProfile={growerProfile} />}
        {tab === "spray"     && <SprayLog embedded />}
        {tab === "watering"  && <WateringPlan embedded />}
        {tab === "scouting"  && <div style={{ color: "#7a8c74", textAlign: "center", padding: 40 }}>Scouting — coming soon</div>}
        {tab === "meetings"  && <div style={{ color: "#7a8c74", textAlign: "center", padding: 40 }}>Meetings — coming soon</div>}
        {tab === "flags"     && <div style={{ color: "#7a8c74", textAlign: "center", padding: 40 }}>Flags — coming soon</div>}
      </div>
    </div>
  );
}

function GrowerDashboard({ growerProfile }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, color: "#1e2d1a", margin: "0 0 16px" }}>
        Welcome, {growerProfile?.name?.split(" ")[0] || "Grower"}
      </h2>
      <div style={{
        background: "#fff", borderRadius: 12, border: "1.5px solid #e0e8d8",
        padding: 20, textAlign: "center", color: "#7a8c74",
      }}>
        Dashboard widgets coming soon — overdue sprays, today's tasks, weekend plan status
      </div>
    </div>
  );
}
