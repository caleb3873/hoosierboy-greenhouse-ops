# Grower Operations Platform — Tier 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the Grower Operations wing — grower authentication with per-person codes, spray/treatment records with mobile-first compliance forms, and weekend watering plans.

**Architecture:** Extends the existing React + Supabase app with a new "Operations" nav group. New Supabase tables for grower profiles, spray records, and watering plans. Grower auth extends the existing floor code system with per-person codes tied to a `grower_profiles` table. All modules include cost fields for 360° business visibility.

**Tech Stack:** React 18 (CRA), Supabase (PostgreSQL + Auth + Realtime), inline CSS (existing pattern), localStorage fallback (existing pattern)

---

## Chunk 1: Grower Auth System

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/GrowerView.jsx` | Mobile-first grower shell (like OperatorView but for growers) |
| Modify | `src/Auth.jsx` | Expand floor code auth to support per-grower codes from Supabase |
| Modify | `src/supabase.js` | Add `useGrowerProfiles()` hook |
| Modify | `src/App.jsx` | Add grower role routing + Operations nav group |
| Modify | `src/shared.js` | Add grower role constants |
| Modify | `supabase-schema.sql` | Add `grower_profiles` table |

---

### Task 1: Database — grower_profiles table

**Files:**
- Modify: `supabase-schema.sql` (append new table)

- [ ] **Step 1: Add grower_profiles table to schema file**

Append to `supabase-schema.sql`:

```sql
-- ============================================================
-- GROWER PROFILES
-- ============================================================
CREATE TABLE grower_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                           -- Full name: "Caleb Schlegel"
  role TEXT NOT NULL DEFAULT 'assistant',        -- 'head_grower' | 'grower' | 'assistant'
  code TEXT NOT NULL UNIQUE,                     -- 6-7 digit floor code, unique per grower
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE grower_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to grower_profiles" ON grower_profiles FOR ALL USING (true);

-- Trigger for updated_at
CREATE TRIGGER grower_profiles_updated_at
  BEFORE UPDATE ON grower_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Create the table in Supabase**

Run the SQL above in the Supabase SQL editor (dashboard). Then seed the initial grower data:

```sql
INSERT INTO grower_profiles (name, role, code) VALUES
  ('Caleb Schlegel',   'head_grower', '2026301'),
  ('Reese Morris',     'grower',      '2026302'),
  ('Markus Baker',     'grower',      '2026303'),
  ('Amanda Kirsop',    'assistant',   '2026304'),
  ('Michael Papineau', 'assistant',   '2026305'),
  ('Zack Stenz',       'assistant',   '2026306');
```

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add grower_profiles table to schema"
```

---

### Task 2: Supabase hook — useGrowerProfiles

**Files:**
- Modify: `src/supabase.js` (add hook, ~2 lines)

- [ ] **Step 1: Add useGrowerProfiles hook**

In `supabase.js`, after the existing hook exports (around line 240), add:

```javascript
export const useGrowerProfiles = () => useTable("grower_profiles", { orderBy: "name", localKey: "gh_grower_profiles_v1" });
```

- [ ] **Step 2: Commit**

```bash
git add src/supabase.js
git commit -m "feat: add useGrowerProfiles hook"
```

---

### Task 3: Expand Auth to support per-grower codes

**Files:**
- Modify: `src/Auth.jsx` (lines 7-10 floor codes, lines 114-125 signInWithCode)

The current system uses hardcoded `FLOOR_CODES` with shared codes. We need to:
1. Keep existing operator/maintenance codes working
2. Add dynamic grower code lookup against Supabase
3. Store grower identity (name, role, id) in the session

- [ ] **Step 1: Add grower session fields to AuthContext**

In `Auth.jsx`, add new state variables after the existing ones (around line 30):

```javascript
const [growerProfile, setGrowerProfile] = useState(null); // { id, name, role, code }
```

Add `growerProfile` to the context value object (around line 131):

```javascript
const value = {
  user,
  role,
  floorMode,
  loading,
  initialized,
  isAdmin,
  isOperator,
  isAuthenticated,
  isGrower: role === "grower",        // NEW
  growerProfile,                       // NEW — { id, name, role, code } or null
  signIn,
  signOut,
  signInWithCode,
  displayName: growerProfile?.name || user?.email?.split("@")[0] || (floorMode ? floorMode.charAt(0).toUpperCase() + floorMode.slice(1) : ""),
};
```

- [ ] **Step 2: Modify signInWithCode to check grower codes**

Replace the `signInWithCode` function (around lines 114-125) with:

```javascript
const signInWithCode = useCallback(async (raw) => {
  const code = (raw || "").trim().toUpperCase();
  // 1. Check legacy floor codes first
  const matchedRole = Object.entries(FLOOR_CODES).find(([, v]) => v === code)?.[0];
  if (matchedRole) {
    const session = { mode: matchedRole, expires: Date.now() + 12 * 60 * 60 * 1000 };
    localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
    setFloorMode(matchedRole);
    setRole(matchedRole);
    setGrowerProfile(null);
    return true;
  }
  // 2. Check grower codes from Supabase
  try {
    const { data, error } = await sb.from("grower_profiles")
      .select("*")
      .eq("code", code)
      .eq("active", true)
      .single();
    if (data && !error) {
      const profile = { id: data.id, name: data.name, role: data.role, code: data.code };
      const session = { mode: "grower", growerProfile: profile, expires: Date.now() + 12 * 60 * 60 * 1000 };
      localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
      setFloorMode("grower");
      setRole("grower");
      setGrowerProfile(profile);
      return true;
    }
  } catch (e) { /* offline — fall through */ }
  return false;
}, []);
```

- [ ] **Step 3: Restore grower session on reload**

In the useEffect that checks floor sessions on mount (around lines 35-55), update the floor session restoration to handle grower profiles:

Find the block that reads `FLOOR_SESSION_KEY` from localStorage and update it to also restore growerProfile:

```javascript
// Inside the existing useEffect, where it reads the floor session:
const raw = localStorage.getItem(FLOOR_SESSION_KEY);
if (raw) {
  try {
    const s = JSON.parse(raw);
    if (s.expires > Date.now()) {
      setFloorMode(s.mode);
      setRole(s.mode);
      if (s.growerProfile) setGrowerProfile(s.growerProfile);
      setLoading(false);
      setInitialized(true);
      return;
    } else {
      localStorage.removeItem(FLOOR_SESSION_KEY);
    }
  } catch { localStorage.removeItem(FLOOR_SESSION_KEY); }
}
```

- [ ] **Step 4: Clear growerProfile on signOut**

In the `signOut` function, add `setGrowerProfile(null)` alongside the existing cleanup.

- [ ] **Step 5: Commit**

```bash
git add src/Auth.jsx
git commit -m "feat: expand floor code auth to support per-grower codes from Supabase"
```

---

### Task 4: Grower role constants

**Files:**
- Modify: `src/shared.js` (add constants)

- [ ] **Step 1: Add grower role constants**

In `shared.js`, after the existing constants (around line 52), add:

```javascript
export const GROWER_ROLES = [
  { id: "head_grower", label: "Head Grower", color: "#1e5a8e", bg: "#e0ecf8" },
  { id: "grower",      label: "Grower",      color: "#2e7a2e", bg: "#e0f0e0" },
  { id: "assistant",   label: "Assistant",    color: "#7a8c74", bg: "#f0f5ee" },
];

export const APPLICATION_METHODS = [
  { id: "spray",   label: "Spray",   icon: "💨" },
  { id: "drench",  label: "Drench",  icon: "💧" },
  { id: "fog",     label: "Fog",     icon: "🌫" },
  { id: "granular", label: "Granular", icon: "🟤" },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/shared.js
git commit -m "feat: add grower role and application method constants"
```

---

### Task 5: GrowerView shell — mobile-first grower interface

**Files:**
- Create: `src/GrowerView.jsx`

This is the entry point for growers logging in with their personal codes. Similar to OperatorView but tailored for grower operations. Initially just a shell with navigation — individual tabs get built in later tasks.

- [ ] **Step 1: Create GrowerView.jsx**

```javascript
import React, { useState } from "react";
import { useAuth } from "./Auth";
import { GROWER_ROLES } from "./shared";

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
        {tab === "spray"     && <div style={{ color: "#7a8c74", textAlign: "center", padding: 40 }}>Spray Log — coming soon</div>}
        {tab === "watering"  && <div style={{ color: "#7a8c74", textAlign: "center", padding: 40 }}>Watering Plans — coming soon</div>}
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
```

- [ ] **Step 2: Commit**

```bash
git add src/GrowerView.jsx
git commit -m "feat: add GrowerView shell with mobile-first drawer nav"
```

---

### Task 6: Wire GrowerView into App routing

**Files:**
- Modify: `src/App.jsx` (import + routing)

- [ ] **Step 1: Add import**

At the top of `App.jsx`, add:

```javascript
import GrowerView from "./GrowerView";
```

- [ ] **Step 2: Add grower routing in AppInner**

In the `AppInner` component (around lines 168-189), add grower routing between the admin and operator checks:

```javascript
// After: if (isAdmin) return <PlannerShell />;
// Before: if (isOperator) return <OperatorView onSwitchMode={signOut} />;

if (role === "grower") return <GrowerView onSwitchMode={signOut} />;
```

- [ ] **Step 3: Add Operations nav group for admin view**

In the `NAV_GROUPS` array, add a new group after "production" (around line 35):

```javascript
{
  id: "operations",
  label: "Operations",
  icon: "⚙",
  items: [
    { id: "spraylog",  label: "Spray Log" },
    { id: "watering",  label: "Watering" },
    { id: "scouting",  label: "Scouting" },
    { id: "growers",   label: "Growers" },
  ],
},
```

- [ ] **Step 4: Add placeholder page renders**

In the PlannerShell page rendering section (around lines 152-162), add:

```javascript
{page === "spraylog"  && <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>Spray Log — coming soon</div>}
{page === "watering"  && <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>Watering Plans — coming soon</div>}
{page === "scouting"  && <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>Scouting — coming soon</div>}
{page === "growers"   && <div style={{ padding: 40, textAlign: "center", color: "#7a8c74" }}>Grower Management — coming soon</div>}
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire GrowerView into app routing, add Operations nav group"
```

---

### Task 7: Grower Management page (admin-side)

**Files:**
- Create: `src/GrowerManagement.jsx`
- Modify: `src/App.jsx` (swap placeholder for component)

This lets Mario and Caleb (admin/head grower) manage grower profiles — add, edit, deactivate growers and their codes.

- [ ] **Step 1: Create GrowerManagement.jsx**

```javascript
import React, { useState } from "react";
import { useGrowerProfiles } from "./supabase";
import { GROWER_ROLES, uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

export default function GrowerManagement() {
  const { rows: growers, insert, update, remove } = useGrowerProfiles();
  const [editing, setEditing] = useState(null); // grower id or "new"
  const [form, setForm] = useState({ name: "", role: "assistant", code: "" });

  const startNew = () => {
    setForm({ name: "", role: "assistant", code: "" });
    setEditing("new");
  };

  const startEdit = (g) => {
    setForm({ name: g.name, role: g.role, code: g.code });
    setEditing(g.id);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    if (editing === "new") {
      await insert({ id: uid(), ...form, active: true });
    } else {
      await update(editing, form);
    }
    setEditing(null);
  };

  const toggleActive = async (g) => {
    await update(g.id, { active: !g.active });
  };

  const active = growers.filter(g => g.active !== false);
  const inactive = growers.filter(g => g.active === false);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, color: DARK, margin: 0 }}>Grower Management</h2>
        <button onClick={startNew} style={{
          background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
          padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
        }}>+ Add Grower</button>
      </div>

      {/* Edit / New form */}
      {editing && (
        <div style={{
          background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 12 }}>
            {editing === "new" ? "New Grower" : "Edit Grower"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }}>
                {GROWER_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase" }}>Access Code</label>
              <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 2026301"
                style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT, fontSize: 14 }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{
              background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            }}>Save</button>
            <button onClick={() => setEditing(null)} style={{
              background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8,
              padding: "8px 16px", cursor: "pointer", fontFamily: FONT,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Active growers */}
      <div style={{ display: "grid", gap: 8 }}>
        {active.map(g => {
          const roleMeta = GROWER_ROLES.find(r => r.id === g.role) || GROWER_ROLES[2];
          return (
            <div key={g.id} style={{
              background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 10,
              padding: "14px 18px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: DARK }}>{g.name}</div>
                <span style={{
                  fontSize: 11, padding: "1px 8px", borderRadius: 8,
                  background: roleMeta.bg, color: roleMeta.color,
                }}>{roleMeta.label}</span>
                <span style={{ fontSize: 12, color: "#aaa", marginLeft: 8 }}>Code: {g.code}</span>
              </div>
              <button onClick={() => startEdit(g)} style={{
                background: "transparent", border: "1px solid #d0d8c8", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: DARK, fontFamily: FONT,
              }}>Edit</button>
              <button onClick={() => toggleActive(g)} style={{
                background: "transparent", border: "1px solid #e8c0c0", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "#c03030", fontFamily: FONT,
              }}>Deactivate</button>
            </div>
          );
        })}
      </div>

      {/* Inactive growers */}
      {inactive.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74", marginBottom: 8 }}>Inactive</div>
          {inactive.map(g => (
            <div key={g.id} style={{
              background: "#fafaf8", border: "1px solid #e8e8e0", borderRadius: 10,
              padding: "10px 18px", display: "flex", alignItems: "center", gap: 12,
              opacity: 0.6, marginBottom: 6,
            }}>
              <div style={{ flex: 1, fontSize: 14, color: DARK }}>{g.name}</div>
              <button onClick={() => toggleActive(g)} style={{
                background: "transparent", border: "1px solid #c8d8c0", borderRadius: 6,
                padding: "4px 10px", cursor: "pointer", fontSize: 12, color: ACCENT, fontFamily: FONT,
              }}>Reactivate</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into App.jsx**

Import at top of App.jsx:
```javascript
import GrowerManagement from "./GrowerManagement";
```

Replace the growers placeholder in page rendering:
```javascript
{page === "growers" && <GrowerManagement />}
```

- [ ] **Step 3: Commit**

```bash
git add src/GrowerManagement.jsx src/App.jsx
git commit -m "feat: add Grower Management page for admin to manage grower profiles"
```

---

## Chunk 2: Spray Records & State Chemist Compliance

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/SprayLog.jsx` | Spray record entry form + log view (shared between admin and grower views) |
| Modify | `src/supabase.js` | Add `useSprayRecords()` hook |
| Modify | `supabase-schema.sql` | Add `spray_records` table |
| Modify | `src/App.jsx` | Wire SprayLog into admin Operations nav |
| Modify | `src/GrowerView.jsx` | Wire SprayLog into grower spray tab |
| Modify | `src/shared.js` | Add spray-related constants |

---

### Task 8: Database — spray_records table

**Files:**
- Modify: `supabase-schema.sql` (append)

- [ ] **Step 1: Add spray_records table**

Append to `supabase-schema.sql`:

```sql
-- ============================================================
-- SPRAY RECORDS (State Chemist Compliance)
-- ============================================================
CREATE TABLE spray_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- WHO
  grower_id UUID REFERENCES grower_profiles(id),
  grower_name TEXT NOT NULL,                        -- Denormalized for quick display
  -- WHAT
  product_name TEXT NOT NULL,                       -- Chemical / input name
  input_id UUID,                                    -- FK to inputs table (optional until inputs populated)
  epa_reg_number TEXT,                              -- EPA registration number from label
  active_ingredient TEXT,
  -- HOW
  application_method TEXT NOT NULL,                 -- 'spray' | 'drench' | 'fog' | 'granular'
  rate TEXT,                                        -- Rate as applied (e.g., "2 oz/100 gal")
  total_volume TEXT,                                -- Total mix volume
  -- WHERE
  house_id UUID REFERENCES houses(id),
  house_name TEXT NOT NULL,                         -- Denormalized
  target_pest TEXT,                                 -- What pest/disease targeted
  -- WHEN
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rei_hours INTEGER,                                -- Restricted Entry Interval (from label)
  rei_expires_at TIMESTAMPTZ,                       -- Calculated: applied_at + rei_hours
  -- COMPLIANCE
  wind_speed TEXT,
  temperature TEXT,
  ppe_worn TEXT,                                    -- PPE used during application
  applicator_license TEXT,                          -- License number if required
  -- COST
  product_cost NUMERIC,                             -- Cost of chemical used this application
  labor_minutes INTEGER,                            -- Time spent on application
  -- META
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE spray_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to spray_records" ON spray_records FOR ALL USING (true);

CREATE TRIGGER spray_records_updated_at
  BEFORE UPDATE ON spray_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for quick date-range queries (state chemist inspections)
CREATE INDEX idx_spray_records_applied_at ON spray_records (applied_at DESC);
CREATE INDEX idx_spray_records_grower ON spray_records (grower_id);
CREATE INDEX idx_spray_records_house ON spray_records (house_id);
```

- [ ] **Step 2: Create the table in Supabase**

Run the SQL above in the Supabase SQL editor.

- [ ] **Step 3: Add useSprayRecords hook**

In `src/supabase.js`, add:

```javascript
export const useSprayRecords = () => useTable("spray_records", { orderBy: "applied_at", localKey: "gh_spray_records_v1" });
```

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql src/supabase.js
git commit -m "feat: add spray_records table and hook for state chemist compliance"
```

---

### Task 9: Spray-related constants

**Files:**
- Modify: `src/shared.js`

- [ ] **Step 1: Add spray constants**

After the `APPLICATION_METHODS` constant added in Task 4, add:

```javascript
export const REI_PRESETS = [
  { label: "4 hours",  hours: 4 },
  { label: "12 hours", hours: 12 },
  { label: "24 hours", hours: 24 },
  { label: "48 hours", hours: 48 },
  { label: "Custom",   hours: null },
];

export const PPE_OPTIONS = [
  "Chemical-resistant gloves",
  "Long-sleeve shirt & pants",
  "Chemical-resistant apron",
  "Shoes + socks",
  "Protective eyewear",
  "Respirator (NIOSH approved)",
  "Chemical-resistant headgear",
  "Full-body chemical-resistant suit",
];
```

- [ ] **Step 2: Commit**

```bash
git add src/shared.js
git commit -m "feat: add REI presets and PPE option constants for spray records"
```

---

### Task 10: SprayLog component — mobile-first spray record form

**Files:**
- Create: `src/SprayLog.jsx`

This is the core compliance form. Must be dead simple on mobile — growers in the greenhouse filling it out on their phone. No excuses for not logging a treatment.

- [ ] **Step 1: Create SprayLog.jsx**

```javascript
import React, { useState, useMemo } from "react";
import { useSprayRecords } from "./supabase";
import { useHouses } from "./supabase";
import { useGrowerProfiles } from "./supabase";
import { useAuth } from "./Auth";
import { APPLICATION_METHODS, REI_PRESETS, PPE_OPTIONS, uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

function FL({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{children}</label>;
}

function Field({ children, style }) {
  return <div style={{ marginBottom: 14, ...style }}>{children}</div>;
}

function inputStyle() {
  return {
    width: "100%", padding: "10px 12px", border: "1.5px solid #d0d8c8",
    borderRadius: 10, fontFamily: FONT, fontSize: 14, boxSizing: "border-box",
  };
}

export default function SprayLog({ embedded }) {
  const { growerProfile, isAdmin } = useAuth();
  const { rows: records, insert } = useSprayRecords();
  const { rows: houses } = useHouses();
  const { rows: growers } = useGrowerProfiles();
  const [view, setView] = useState("log"); // "log" | "new" | "report"
  const [form, setForm] = useState(emptyForm(growerProfile));
  const [saving, setSaving] = useState(false);

  function emptyForm(profile) {
    return {
      productName: "", epaRegNumber: "", activeIngredient: "",
      applicationMethod: "spray", rate: "", totalVolume: "",
      houseId: "", houseName: "", targetPest: "",
      appliedAt: new Date().toISOString().slice(0, 16),
      reiHours: 12, ppeWorn: [],
      windSpeed: "", temperature: "",
      applicatorLicense: "", productCost: "", laborMinutes: "",
      notes: "",
      growerId: profile?.id || "", growerName: profile?.name || "",
    };
  }

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const togglePPE = (item) => {
    setForm(f => ({
      ...f,
      ppeWorn: f.ppeWorn.includes(item)
        ? f.ppeWorn.filter(p => p !== item)
        : [...f.ppeWorn, item],
    }));
  };

  const selectHouse = (houseId) => {
    const h = houses.find(x => x.id === houseId);
    setForm(f => ({ ...f, houseId, houseName: h?.name || "" }));
  };

  const save = async () => {
    if (!form.productName.trim() || !form.houseName.trim()) return;
    setSaving(true);
    const appliedAt = new Date(form.appliedAt);
    const reiExpires = form.reiHours ? new Date(appliedAt.getTime() + form.reiHours * 3600000) : null;
    await insert({
      id: uid(),
      grower_id: form.growerId || null,
      grower_name: form.growerName,
      product_name: form.productName,
      epa_reg_number: form.epaRegNumber || null,
      active_ingredient: form.activeIngredient || null,
      application_method: form.applicationMethod,
      rate: form.rate || null,
      total_volume: form.totalVolume || null,
      house_id: form.houseId || null,
      house_name: form.houseName,
      target_pest: form.targetPest || null,
      applied_at: appliedAt.toISOString(),
      rei_hours: form.reiHours || null,
      rei_expires_at: reiExpires?.toISOString() || null,
      wind_speed: form.windSpeed || null,
      temperature: form.temperature || null,
      ppe_worn: form.ppeWorn.join(", ") || null,
      applicator_license: form.applicatorLicense || null,
      product_cost: form.productCost ? parseFloat(form.productCost) : null,
      labor_minutes: form.laborMinutes ? parseInt(form.laborMinutes) : null,
      notes: form.notes || null,
    });
    setForm(emptyForm(growerProfile));
    setSaving(false);
    setView("log");
  };

  const sorted = useMemo(() =>
    [...records].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt)),
    [records]
  );

  const containerStyle = embedded ? {} : { maxWidth: 720, margin: "0 auto", padding: 24 };

  return (
    <div style={{ fontFamily: FONT, ...containerStyle }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, color: DARK, margin: 0 }}>Spray Log</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {view !== "new" && (
            <button onClick={() => { setForm(emptyForm(growerProfile)); setView("new"); }} style={{
              background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
            }}>+ Log Treatment</button>
          )}
          {isAdmin && view !== "report" && (
            <button onClick={() => setView("report")} style={{
              background: "transparent", color: DARK, border: "1.5px solid #d0d8c8", borderRadius: 8,
              padding: "8px 14px", cursor: "pointer", fontFamily: FONT, fontSize: 13,
            }}>📋 Report</button>
          )}
        </div>
      </div>

      {/* New record form */}
      {view === "new" && (
        <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 16 }}>Log Treatment</div>

          {/* Grower select (admin only — growers auto-fill) */}
          {isAdmin && (
            <Field>
              <FL>Applicator</FL>
              <select value={form.growerId} onChange={e => {
                const g = growers.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, growerId: e.target.value, growerName: g?.name || "" }));
              }} style={inputStyle()}>
                <option value="">Select grower...</option>
                {growers.filter(g => g.active !== false).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>Product Name *</FL>
              <input value={form.productName} onChange={e => setF("productName", e.target.value)}
                placeholder="e.g. Citation" style={inputStyle()} />
            </Field>
            <Field>
              <FL>EPA Reg. Number</FL>
              <input value={form.epaRegNumber} onChange={e => setF("epaRegNumber", e.target.value)}
                placeholder="e.g. 100-1498" style={inputStyle()} />
            </Field>
          </div>

          <Field>
            <FL>Active Ingredient</FL>
            <input value={form.activeIngredient} onChange={e => setF("activeIngredient", e.target.value)}
              placeholder="e.g. Cyromazine" style={inputStyle()} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>House *</FL>
              <select value={form.houseId} onChange={e => selectHouse(e.target.value)} style={inputStyle()}>
                <option value="">Select house...</option>
                {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Field>
            <Field>
              <FL>Application Method</FL>
              <select value={form.applicationMethod} onChange={e => setF("applicationMethod", e.target.value)} style={inputStyle()}>
                {APPLICATION_METHODS.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>Rate</FL>
              <input value={form.rate} onChange={e => setF("rate", e.target.value)}
                placeholder="e.g. 2 oz / 100 gal" style={inputStyle()} />
            </Field>
            <Field>
              <FL>Total Volume Mixed</FL>
              <input value={form.totalVolume} onChange={e => setF("totalVolume", e.target.value)}
                placeholder="e.g. 50 gal" style={inputStyle()} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>Target Pest / Disease</FL>
              <input value={form.targetPest} onChange={e => setF("targetPest", e.target.value)}
                placeholder="e.g. Fungus gnats" style={inputStyle()} />
            </Field>
            <Field>
              <FL>Date & Time Applied</FL>
              <input type="datetime-local" value={form.appliedAt} onChange={e => setF("appliedAt", e.target.value)}
                style={inputStyle()} />
            </Field>
          </div>

          <Field>
            <FL>REI (Restricted Entry Interval)</FL>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {REI_PRESETS.map(p => (
                <button key={p.label} onClick={() => p.hours !== null && setF("reiHours", p.hours)} style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontSize: 13,
                  background: form.reiHours === p.hours ? ACCENT : "#f2f5ef",
                  color: form.reiHours === p.hours ? "#fff" : DARK,
                  border: form.reiHours === p.hours ? `1.5px solid ${ACCENT}` : "1.5px solid #d0d8c8",
                }}>{p.label}</button>
              ))}
              {!REI_PRESETS.find(p => p.hours === form.reiHours) && (
                <input type="number" value={form.reiHours} onChange={e => setF("reiHours", parseInt(e.target.value) || 0)}
                  placeholder="Hours" style={{ ...inputStyle(), width: 80 }} />
              )}
            </div>
          </Field>

          <Field>
            <FL>PPE Worn</FL>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PPE_OPTIONS.map(p => (
                <button key={p} onClick={() => togglePPE(p)} style={{
                  padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontSize: 12,
                  background: form.ppeWorn.includes(p) ? "#e0f0e0" : "#f8f8f5",
                  color: form.ppeWorn.includes(p) ? "#2e7a2e" : "#7a8c74",
                  border: form.ppeWorn.includes(p) ? "1.5px solid #7fb069" : "1.5px solid #e0e8d8",
                }}>{p}</button>
              ))}
            </div>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>Wind Speed</FL>
              <input value={form.windSpeed} onChange={e => setF("windSpeed", e.target.value)}
                placeholder="e.g. 5 mph" style={inputStyle()} />
            </Field>
            <Field>
              <FL>Temperature</FL>
              <input value={form.temperature} onChange={e => setF("temperature", e.target.value)}
                placeholder="e.g. 72°F" style={inputStyle()} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field>
              <FL>Product Cost ($)</FL>
              <input type="number" step="0.01" value={form.productCost} onChange={e => setF("productCost", e.target.value)}
                placeholder="0.00" style={inputStyle()} />
            </Field>
            <Field>
              <FL>Labor (minutes)</FL>
              <input type="number" value={form.laborMinutes} onChange={e => setF("laborMinutes", e.target.value)}
                placeholder="e.g. 30" style={inputStyle()} />
            </Field>
          </div>

          <Field>
            <FL>Notes</FL>
            <textarea value={form.notes} onChange={e => setF("notes", e.target.value)}
              rows={2} placeholder="Any additional notes..."
              style={{ ...inputStyle(), resize: "vertical" }} />
          </Field>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={save} disabled={saving || !form.productName.trim() || !form.houseName.trim()} style={{
              background: saving ? "#c8d8c0" : ACCENT, color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: FONT, fontSize: 14,
            }}>{saving ? "Saving..." : "Save Record"}</button>
            <button onClick={() => setView("log")} style={{
              background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8,
              padding: "10px 20px", cursor: "pointer", fontFamily: FONT, fontSize: 14,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Report view — filterable export for state chemist */}
      {view === "report" && (
        <SprayReport records={sorted} onBack={() => setView("log")} />
      )}

      {/* Log view — recent records */}
      {view === "log" && (
        <div style={{ display: "grid", gap: 8 }}>
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", color: "#7a8c74", padding: 40 }}>
              No spray records yet. Tap "+ Log Treatment" to add one.
            </div>
          )}
          {sorted.map(r => (
            <div key={r.id} style={{
              background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 10, padding: "12px 16px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: DARK }}>{r.productName}</div>
                  <div style={{ fontSize: 12, color: "#7a8c74" }}>
                    {r.houseName} · {r.applicationMethod} · {r.growerName}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: DARK }}>
                    {new Date(r.appliedAt).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a8c74" }}>
                    {new Date(r.appliedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
              {r.reiExpiresAt && new Date(r.reiExpiresAt) > new Date() && (
                <div style={{
                  marginTop: 6, padding: "3px 8px", borderRadius: 6,
                  background: "#fff0e0", color: "#c8791a", fontSize: 11, fontWeight: 600, display: "inline-block",
                }}>
                  REI active until {new Date(r.reiExpiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
              {r.productCost && (
                <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>
                  Cost: ${parseFloat(r.productCost).toFixed(2)}
                  {r.laborMinutes ? ` · ${r.laborMinutes} min labor` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SprayReport({ records, onBack }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    let r = records;
    if (dateFrom) r = r.filter(x => new Date(x.appliedAt) >= new Date(dateFrom));
    if (dateTo) r = r.filter(x => new Date(x.appliedAt) <= new Date(dateTo + "T23:59:59"));
    return r;
  }, [records, dateFrom, dateTo]);

  const totalCost = filtered.reduce((s, r) => s + (parseFloat(r.productCost) || 0), 0);
  const totalLabor = filtered.reduce((s, r) => s + (parseInt(r.laborMinutes) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{
          background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: DARK,
        }}>← Back</button>
        <h3 style={{ fontSize: 16, color: DARK, margin: 0 }}>State Chemist Report</h3>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <FL>From</FL>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT }} />
        </div>
        <div>
          <FL>To</FL>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: "8px 10px", border: "1.5px solid #d0d8c8", borderRadius: 8, fontFamily: FONT }} />
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <div style={{ fontSize: 13, color: DARK, fontWeight: 600 }}>{filtered.length} records</div>
          <div style={{ fontSize: 11, color: "#7a8c74" }}>
            ${totalCost.toFixed(2)} chemical · {totalLabor} min labor
          </div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e0e8d8", textAlign: "left" }}>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>Date</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>Product</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>EPA #</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>House</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>Method</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>Rate</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>REI</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>Applicator</th>
            <th style={{ padding: "8px 6px", color: "#7a8c74" }}>PPE</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id} style={{ borderBottom: "1px solid #f0f0e8" }}>
              <td style={{ padding: "6px" }}>{new Date(r.appliedAt).toLocaleDateString()}</td>
              <td style={{ padding: "6px", fontWeight: 600 }}>{r.productName}</td>
              <td style={{ padding: "6px" }}>{r.epaRegNumber || "—"}</td>
              <td style={{ padding: "6px" }}>{r.houseName}</td>
              <td style={{ padding: "6px" }}>{r.applicationMethod}</td>
              <td style={{ padding: "6px" }}>{r.rate || "—"}</td>
              <td style={{ padding: "6px" }}>{r.reiHours ? `${r.reiHours}h` : "—"}</td>
              <td style={{ padding: "6px" }}>{r.growerName}</td>
              <td style={{ padding: "6px", fontSize: 11 }}>{r.ppeWorn || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/SprayLog.jsx
git commit -m "feat: add SprayLog component with mobile-first treatment form and compliance report"
```

---

### Task 11: Wire SprayLog into both views

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/GrowerView.jsx`

- [ ] **Step 1: Wire into admin view (App.jsx)**

Import at top:
```javascript
import SprayLog from "./SprayLog";
```

Replace the spraylog placeholder:
```javascript
{page === "spraylog" && <SprayLog />}
```

- [ ] **Step 2: Wire into grower view (GrowerView.jsx)**

Import at top of GrowerView.jsx:
```javascript
import SprayLog from "./SprayLog";
```

Replace the spray tab placeholder:
```javascript
{tab === "spray" && <SprayLog embedded />}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/GrowerView.jsx
git commit -m "feat: wire SprayLog into admin Operations nav and grower mobile view"
```

---

## Chunk 3: Weekend Watering Plans

### File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/WateringPlan.jsx` | Watering plan creation, checklist, priority ordering |
| Modify | `src/supabase.js` | Add `useWateringPlans()` hook |
| Modify | `supabase-schema.sql` | Add `watering_plans` and `watering_tasks` tables |
| Modify | `src/App.jsx` | Wire into admin Operations nav |
| Modify | `src/GrowerView.jsx` | Wire into grower watering tab |
| Modify | `src/shared.js` | Add fertilizer type constants |

---

### Task 12: Database — watering tables

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Add watering tables**

Append to `supabase-schema.sql`:

```sql
-- ============================================================
-- WATERING PLANS
-- ============================================================
CREATE TABLE watering_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                              -- "Weekend 3/21-3/22" or "Saturday 3/21"
  plan_date DATE NOT NULL,                          -- Date the plan is for
  created_by_id UUID REFERENCES grower_profiles(id),
  created_by_name TEXT NOT NULL,
  weather_notes TEXT,                               -- "High 78°F, sunny, low wind"
  status TEXT DEFAULT 'draft',                      -- 'draft' | 'active' | 'completed'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watering_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES watering_plans(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,            -- Priority ordering
  house_id UUID REFERENCES houses(id),
  house_name TEXT NOT NULL,
  zone_label TEXT,                                  -- Optional: specific zone/bench
  instructions TEXT NOT NULL,                       -- "Water overhead 10 min" or "Hand water hanging baskets"
  fertilizer_type TEXT DEFAULT 'none',              -- 'none' | 'standard' | 'geranium' | 'custom'
  fertilizer_detail TEXT,                           -- Custom fertilizer notes if needed
  urgency TEXT DEFAULT 'normal',                    -- 'low' | 'normal' | 'high' | 'critical'
  estimated_minutes INTEGER,                        -- How long this task should take
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES grower_profiles(id),
  completed_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE watering_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE watering_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to watering_plans" ON watering_plans FOR ALL USING (true);
CREATE POLICY "Allow all access to watering_tasks" ON watering_tasks FOR ALL USING (true);

CREATE TRIGGER watering_plans_updated_at
  BEFORE UPDATE ON watering_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

- [ ] **Step 2: Create tables in Supabase**

Run the SQL above in the Supabase SQL editor.

- [ ] **Step 3: Add hooks in supabase.js**

```javascript
export const useWateringPlans = () => useTable("watering_plans", { orderBy: "plan_date", localKey: "gh_watering_plans_v1" });
export const useWateringTasks = () => useTable("watering_tasks", { orderBy: "sort_order", localKey: "gh_watering_tasks_v1" });
```

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql src/supabase.js
git commit -m "feat: add watering_plans and watering_tasks tables and hooks"
```

---

### Task 13: Fertilizer and urgency constants

**Files:**
- Modify: `src/shared.js`

- [ ] **Step 1: Add watering constants**

```javascript
export const FERTILIZER_TYPES = [
  { id: "none",     label: "Water Only",   color: "#4a90d9", bg: "#e0ecf8" },
  { id: "standard", label: "Standard Feed", color: "#2e7a2e", bg: "#e0f0e0" },
  { id: "geranium", label: "Geranium Feed", color: "#c03030", bg: "#fce8e8" },
  { id: "custom",   label: "Custom",        color: "#8e44ad", bg: "#f5f0ff" },
];

export const URGENCY_LEVELS = [
  { id: "low",      label: "Low",      color: "#7a8c74", bg: "#f0f5ee" },
  { id: "normal",   label: "Normal",   color: "#4a90d9", bg: "#e0ecf8" },
  { id: "high",     label: "High",     color: "#c8791a", bg: "#fff4e8" },
  { id: "critical", label: "Critical", color: "#c03030", bg: "#fce8e8" },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/shared.js
git commit -m "feat: add fertilizer type and urgency level constants"
```

---

### Task 14: WateringPlan component

**Files:**
- Create: `src/WateringPlan.jsx`

Growers create a plan for the weekend, add tasks per house/zone with priority ordering, fertilizer type, urgency, and time estimates. Weekend growers check off tasks as they complete them.

- [ ] **Step 1: Create WateringPlan.jsx**

```javascript
import React, { useState, useMemo } from "react";
import { useWateringPlans, useWateringTasks, useHouses } from "./supabase";
import { useAuth } from "./Auth";
import { FERTILIZER_TYPES, URGENCY_LEVELS, uid } from "./shared";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

function FL({ children }) {
  return <label style={{ fontSize: 11, fontWeight: 600, color: "#7a8c74", textTransform: "uppercase", display: "block", marginBottom: 4 }}>{children}</label>;
}

function inputStyle() {
  return {
    width: "100%", padding: "10px 12px", border: "1.5px solid #d0d8c8",
    borderRadius: 10, fontFamily: FONT, fontSize: 14, boxSizing: "border-box",
  };
}

export default function WateringPlan({ embedded }) {
  const { growerProfile, isAdmin } = useAuth();
  const { rows: plans, insert: insertPlan, update: updatePlan } = useWateringPlans();
  const { rows: allTasks, insert: insertTask, update: updateTask, remove: removeTask } = useWateringTasks();
  const { rows: houses } = useHouses();

  const [view, setView] = useState("list"); // "list" | "plan" | "new"
  const [activePlanId, setActivePlanId] = useState(null);
  const [newPlan, setNewPlan] = useState({ title: "", planDate: "", weatherNotes: "", notes: "" });
  const [newTask, setNewTask] = useState(null);

  const sorted = useMemo(() =>
    [...plans].sort((a, b) => new Date(b.planDate) - new Date(a.planDate)),
    [plans]
  );

  const activePlan = plans.find(p => p.id === activePlanId);
  const planTasks = useMemo(() =>
    allTasks.filter(t => t.planId === activePlanId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [allTasks, activePlanId]
  );

  const totalMinutes = planTasks.reduce((s, t) => s + (parseInt(t.estimatedMinutes) || 0), 0);
  const completedCount = planTasks.filter(t => t.completed).length;

  const createPlan = async () => {
    if (!newPlan.title.trim() || !newPlan.planDate) return;
    const plan = {
      id: uid(),
      title: newPlan.title,
      plan_date: newPlan.planDate,
      created_by_id: growerProfile?.id || null,
      created_by_name: growerProfile?.name || "Admin",
      weather_notes: newPlan.weatherNotes || null,
      status: "draft",
      notes: newPlan.notes || null,
    };
    await insertPlan(plan);
    setActivePlanId(plan.id);
    setNewPlan({ title: "", planDate: "", weatherNotes: "", notes: "" });
    setView("plan");
  };

  const addTask = async () => {
    if (!newTask || !newTask.houseName || !newTask.instructions) return;
    await insertTask({
      id: uid(),
      plan_id: activePlanId,
      sort_order: planTasks.length,
      house_id: newTask.houseId || null,
      house_name: newTask.houseName,
      zone_label: newTask.zoneLabel || null,
      instructions: newTask.instructions,
      fertilizer_type: newTask.fertilizerType || "none",
      fertilizer_detail: newTask.fertilizerDetail || null,
      urgency: newTask.urgency || "normal",
      estimated_minutes: newTask.estimatedMinutes ? parseInt(newTask.estimatedMinutes) : null,
      notes: newTask.notes || null,
    });
    setNewTask(null);
  };

  const toggleComplete = async (task) => {
    await updateTask(task.id, {
      completed: !task.completed,
      completedAt: task.completed ? null : new Date().toISOString(),
      completedById: task.completed ? null : growerProfile?.id,
      completedByName: task.completed ? null : growerProfile?.name,
    });
  };

  const containerStyle = embedded ? {} : { maxWidth: 720, margin: "0 auto", padding: 24 };

  return (
    <div style={{ fontFamily: FONT, ...containerStyle }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, color: DARK, margin: 0 }}>
          {view === "plan" && activePlan ? activePlan.title : "Watering Plans"}
        </h2>
        {view === "list" && (
          <button onClick={() => setView("new")} style={{
            background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>+ New Plan</button>
        )}
        {view === "plan" && (
          <button onClick={() => { setView("list"); setActivePlanId(null); }} style={{
            background: "transparent", color: DARK, border: "1.5px solid #d0d8c8", borderRadius: 8,
            padding: "8px 14px", cursor: "pointer", fontFamily: FONT, fontSize: 13,
          }}>← All Plans</button>
        )}
      </div>

      {/* New plan form */}
      {view === "new" && (
        <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: DARK, marginBottom: 16 }}>New Watering Plan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <FL>Title</FL>
              <input value={newPlan.title} onChange={e => setNewPlan(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Weekend 3/21-3/22" style={inputStyle()} />
            </div>
            <div>
              <FL>Date</FL>
              <input type="date" value={newPlan.planDate} onChange={e => setNewPlan(p => ({ ...p, planDate: e.target.value }))}
                style={inputStyle()} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <FL>Weather Conditions</FL>
            <input value={newPlan.weatherNotes} onChange={e => setNewPlan(p => ({ ...p, weatherNotes: e.target.value }))}
              placeholder="e.g. High 78°F, sunny, low wind" style={inputStyle()} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <FL>Notes</FL>
            <textarea value={newPlan.notes} onChange={e => setNewPlan(p => ({ ...p, notes: e.target.value }))}
              rows={2} placeholder="Any special instructions..." style={{ ...inputStyle(), resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={createPlan} disabled={!newPlan.title.trim() || !newPlan.planDate} style={{
              background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontWeight: 600, cursor: "pointer", fontFamily: FONT,
            }}>Create Plan</button>
            <button onClick={() => setView("list")} style={{
              background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8,
              padding: "10px 20px", cursor: "pointer", fontFamily: FONT,
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Plan detail — task list */}
      {view === "plan" && activePlan && (
        <div>
          {/* Weather & summary bar */}
          <div style={{
            background: "#e0ecf8", border: "1.5px solid #b0c8e8", borderRadius: 10,
            padding: "10px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          }}>
            <div>
              <span style={{ fontSize: 12, color: "#1e5a8e", fontWeight: 600 }}>🌤 {activePlan.weatherNotes || "No weather info"}</span>
            </div>
            <div style={{ fontSize: 12, color: "#1e5a8e" }}>
              {completedCount}/{planTasks.length} done · ~{totalMinutes} min total
            </div>
          </div>

          {/* Progress bar */}
          {planTasks.length > 0 && (
            <div style={{ background: "#e0e8d8", borderRadius: 6, height: 8, marginBottom: 16, overflow: "hidden" }}>
              <div style={{
                background: ACCENT, height: "100%", borderRadius: 6,
                width: `${(completedCount / planTasks.length) * 100}%`,
                transition: "width 0.3s ease",
              }} />
            </div>
          )}

          {/* Tasks */}
          <div style={{ display: "grid", gap: 8 }}>
            {planTasks.map(task => {
              const urg = URGENCY_LEVELS.find(u => u.id === task.urgency) || URGENCY_LEVELS[1];
              const fert = FERTILIZER_TYPES.find(f => f.id === task.fertilizerType) || FERTILIZER_TYPES[0];
              return (
                <div key={task.id} onClick={() => toggleComplete(task)} style={{
                  background: task.completed ? "#f8faf5" : "#fff",
                  border: `1.5px solid ${task.completed ? "#c8d8c0" : urg.color}`,
                  borderLeft: `4px solid ${urg.color}`,
                  borderRadius: 10, padding: "12px 16px", cursor: "pointer",
                  opacity: task.completed ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                      border: `2px solid ${task.completed ? ACCENT : "#d0d8c8"}`,
                      background: task.completed ? ACCENT : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 14,
                    }}>{task.completed ? "✓" : ""}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: DARK,
                        textDecoration: task.completed ? "line-through" : "none",
                      }}>
                        {task.houseName}{task.zoneLabel ? ` — ${task.zoneLabel}` : ""}
                      </div>
                      <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>{task.instructions}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 11, padding: "1px 8px", borderRadius: 6,
                          background: fert.bg, color: fert.color,
                        }}>{fert.label}</span>
                        <span style={{
                          fontSize: 11, padding: "1px 8px", borderRadius: 6,
                          background: urg.bg, color: urg.color,
                        }}>{urg.label}</span>
                        {task.estimatedMinutes && (
                          <span style={{ fontSize: 11, color: "#7a8c74" }}>~{task.estimatedMinutes} min</span>
                        )}
                      </div>
                      {task.completed && task.completedByName && (
                        <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 4 }}>
                          ✓ {task.completedByName} · {new Date(task.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add task form */}
          {newTask ? (
            <div style={{
              background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12,
              padding: 16, marginTop: 12,
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <FL>House</FL>
                  <select value={newTask.houseId || ""} onChange={e => {
                    const h = houses.find(x => x.id === e.target.value);
                    setNewTask(t => ({ ...t, houseId: e.target.value, houseName: h?.name || "" }));
                  }} style={inputStyle()}>
                    <option value="">Select...</option>
                    {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </div>
                <div>
                  <FL>Zone / Bench (optional)</FL>
                  <input value={newTask.zoneLabel || ""} onChange={e => setNewTask(t => ({ ...t, zoneLabel: e.target.value }))}
                    placeholder="e.g. Zone A, Bench 1-4" style={inputStyle()} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <FL>Instructions</FL>
                <input value={newTask.instructions || ""} onChange={e => setNewTask(t => ({ ...t, instructions: e.target.value }))}
                  placeholder="e.g. Water overhead 10 min, check baskets" style={inputStyle()} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <FL>Fertilizer</FL>
                  <select value={newTask.fertilizerType || "none"} onChange={e => setNewTask(t => ({ ...t, fertilizerType: e.target.value }))}
                    style={inputStyle()}>
                    {FERTILIZER_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <FL>Urgency</FL>
                  <select value={newTask.urgency || "normal"} onChange={e => setNewTask(t => ({ ...t, urgency: e.target.value }))}
                    style={inputStyle()}>
                    {URGENCY_LEVELS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <FL>Est. Minutes</FL>
                  <input type="number" value={newTask.estimatedMinutes || ""} onChange={e => setNewTask(t => ({ ...t, estimatedMinutes: e.target.value }))}
                    placeholder="e.g. 15" style={inputStyle()} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addTask} disabled={!newTask.houseName || !newTask.instructions} style={{
                  background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
                  padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontFamily: FONT, fontSize: 13,
                }}>Add Task</button>
                <button onClick={() => setNewTask(null)} style={{
                  background: "transparent", color: "#7a8c74", border: "1.5px solid #d0d8c8", borderRadius: 8,
                  padding: "8px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 13,
                }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setNewTask({ houseId: "", houseName: "", zoneLabel: "", instructions: "", fertilizerType: "none", urgency: "normal", estimatedMinutes: "" })} style={{
              width: "100%", marginTop: 12, padding: "12px", borderRadius: 10,
              border: "1.5px dashed #c8d8c0", background: "transparent",
              color: "#7a8c74", cursor: "pointer", fontFamily: FONT, fontSize: 13,
            }}>+ Add Watering Task</button>
          )}
        </div>
      )}

      {/* Plan list */}
      {view === "list" && (
        <div style={{ display: "grid", gap: 8 }}>
          {sorted.length === 0 && (
            <div style={{ textAlign: "center", color: "#7a8c74", padding: 40 }}>
              No watering plans yet. Create one for the weekend.
            </div>
          )}
          {sorted.map(p => {
            const tasks = allTasks.filter(t => t.planId === p.id);
            const done = tasks.filter(t => t.completed).length;
            const mins = tasks.reduce((s, t) => s + (parseInt(t.estimatedMinutes) || 0), 0);
            return (
              <div key={p.id} onClick={() => { setActivePlanId(p.id); setView("plan"); }} style={{
                background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 10,
                padding: "14px 18px", cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: DARK }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "#7a8c74" }}>
                      {new Date(p.planDate).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {p.weatherNotes ? ` · 🌤 ${p.weatherNotes}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: done === tasks.length && tasks.length > 0 ? ACCENT : DARK }}>
                      {done}/{tasks.length}
                    </div>
                    <div style={{ fontSize: 11, color: "#7a8c74" }}>~{mins} min</div>
                  </div>
                </div>
                {tasks.length > 0 && (
                  <div style={{ background: "#e0e8d8", borderRadius: 4, height: 4, marginTop: 8, overflow: "hidden" }}>
                    <div style={{
                      background: ACCENT, height: "100%", borderRadius: 4,
                      width: `${(done / tasks.length) * 100}%`,
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/WateringPlan.jsx
git commit -m "feat: add WateringPlan component with checklist, priority, fertilizer, weather"
```

---

### Task 15: Wire WateringPlan into both views

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/GrowerView.jsx`

- [ ] **Step 1: Wire into admin view (App.jsx)**

Import at top:
```javascript
import WateringPlan from "./WateringPlan";
```

Replace the watering placeholder:
```javascript
{page === "watering" && <WateringPlan />}
```

- [ ] **Step 2: Wire into grower view (GrowerView.jsx)**

Import at top:
```javascript
import WateringPlan from "./WateringPlan";
```

Replace the watering tab placeholder:
```javascript
{tab === "watering" && <WateringPlan embedded />}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/GrowerView.jsx
git commit -m "feat: wire WateringPlan into admin Operations nav and grower mobile view"
```

---

## Summary

### What This Plan Delivers

| Module | Status | Key Features |
|--------|--------|-------------|
| **Grower Auth** | Full | Per-person codes, 3-tier roles, session management, admin management page |
| **Spray Records** | Full | Mobile form, state chemist compliance report, cost tracking, REI alerts |
| **Weekend Watering** | Full | Checklist with priority, fertilizer types, weather, time estimates, progress tracking |
| **GrowerView Shell** | Foundation | Mobile-first drawer nav, dashboard placeholder, all tab slots |
| **Operations Nav** | Foundation | Admin-side nav group with all Tier 1 pages |

### New Files Created
- `src/GrowerView.jsx` — Mobile grower shell
- `src/GrowerManagement.jsx` — Admin grower profile management
- `src/SprayLog.jsx` — Spray records + compliance report
- `src/WateringPlan.jsx` — Weekend watering plans

### Files Modified
- `src/Auth.jsx` — Per-grower code auth
- `src/App.jsx` — Operations nav group + routing
- `src/supabase.js` — 4 new hooks
- `src/shared.js` — New constants
- `supabase-schema.sql` — 3 new tables

### New Supabase Tables
- `grower_profiles` — Team roster with codes and roles
- `spray_records` — Every chemical application (state chemist compliant)
- `watering_plans` + `watering_tasks` — Weekend handoff plans

### Next Plans (Tier 2)
- **2026-03-XX-grower-meetings.md** — Fork TradeShow for grower meetings
- **2026-03-XX-scouting-sticky-cards.md** — Sticky card program + heat map
- **2026-03-XX-beneficial-insects.md** — Ordering calculator + chemical conflict warnings
- **2026-03-XX-spray-efficiency.md** — Consolidation engine + schedule sync
