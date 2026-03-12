import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { getSupabase } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
// Floor access codes — change these to whatever you want
// These are stored in localStorage and checked against the floor_codes table
export const FLOOR_CODES = {
  operator:    "GRW2026",   // All floor operators / growers
  maintenance: "MNT2026",   // Maintenance person
};

const LOGO_WHITE = "https://cdn.prod.website-files.com/63b5c78a53ecb12c888ba09a/63b5d5e281aa6766b5cb8ace_HOO-Boy%20Logo%20Reversed-White.png";

// ── AUTH CONTEXT ──────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// ── SESSION STORAGE KEYS ──────────────────────────────────────────────────────
const FLOOR_SESSION_KEY = "gh_floor_session_v1";

// ── AUTH PROVIDER ─────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);   // Supabase user object
  const [role,        setRole]        = useState(null);   // admin | operator | maintenance
  const [floorMode,   setFloorMode]   = useState(null);   // operator | maintenance | null
  const [loading,     setLoading]     = useState(true);
  const [initialized, setInitialized] = useState(false);

  const sb = getSupabase();

  // Check for existing floor session
  const checkFloorSession = useCallback(() => {
    try {
      const stored = localStorage.getItem(FLOOR_SESSION_KEY);
      if (stored) {
        const { mode, expires } = JSON.parse(stored);
        if (expires > Date.now()) {
          setFloorMode(mode);
          setRole(mode);
          return true;
        } else {
          localStorage.removeItem(FLOOR_SESSION_KEY);
        }
      }
    } catch {}
    return false;
  }, []);

  // Initialize — check Supabase session + floor session
  useEffect(() => {
    if (!sb) { setLoading(false); setInitialized(true); return; }

    const init = async () => {
      // Check floor session first (works offline)
      if (checkFloorSession()) { setLoading(false); setInitialized(true); return; }

      // Check Supabase session
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setRole("admin"); // All email-authenticated users are admin
      }
      setLoading(false);
      setInitialized(true);
    };

    init();

    // Listen for auth changes
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setRole("admin");
        setFloorMode(null);
      } else if (!checkFloorSession()) {
        setUser(null);
        setRole(null);
        setFloorMode(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [sb, checkFloorSession]);

  // Email/password sign in
  const signIn = useCallback(async (email, password) => {
    if (!sb) return { error: { message: "No database connection" } };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      setUser(data.user);
      setRole("admin");
      setFloorMode(null);
    }
    return { error };
  }, [sb]);

  // Sign out
  const signOut = useCallback(async () => {
    if (floorMode) {
      localStorage.removeItem(FLOOR_SESSION_KEY);
      setFloorMode(null);
      setRole(null);
    } else {
      if (sb) await sb.auth.signOut();
      setUser(null);
      setRole(null);
    }
  }, [sb, floorMode]);

  // Floor code sign in
  const signInWithCode = useCallback((code) => {
    const trimmed = code.trim().toUpperCase();
    const matchedRole = Object.entries(FLOOR_CODES).find(([, c]) => c === trimmed)?.[0];
    if (!matchedRole) return false;

    // Store floor session for 12 hours
    const session = { mode: matchedRole, expires: Date.now() + 12 * 60 * 60 * 1000 };
    localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
    setFloorMode(matchedRole);
    setRole(matchedRole);
    return true;
  }, []);

  const isAdmin       = role === "admin";
  const isOperator    = role === "operator" || role === "maintenance";
  const isAuthenticated = !!role;

  const value = {
    user, role, floorMode, loading, initialized,
    isAdmin, isOperator, isAuthenticated,
    signIn, signOut, signInWithCode,
    displayName: user?.email?.split("@")[0] || (floorMode ? floorMode.charAt(0).toUpperCase() + floorMode.slice(1) : null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── LOGIN SCREEN ──────────────────────────────────────────────────────────────
function EmailLogin({ onSuccess }) {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [focus,    setFocus]    = useState(null);

  const IS = (f) => ({
    width: "100%", padding: "13px 14px", borderRadius: 10,
    border: `1.5px solid ${focus === f ? "#7fb069" : "#c8d8c0"}`,
    fontSize: 15, fontFamily: "inherit", background: "#fff",
    color: "#1e2d1a", outline: "none", boxSizing: "border-box",
    transition: "border-color .15s",
  });

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    const { error: err } = await signIn(email.trim(), password);
    if (err) {
      setError(err.message === "Invalid login credentials"
        ? "Incorrect email or password"
        : err.message);
      setLoading(false);
    } else {
      onSuccess?.();
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74", marginBottom: 20, textAlign: "center" }}>
        Sign in with your Hoosier Boy account
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Email</div>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          onFocus={() => setFocus("email")} onBlur={() => setFocus(null)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={IS("email")} placeholder="you@hoosierboy.com" autoComplete="email"
        />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Password</div>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          onFocus={() => setFocus("pw")} onBlur={() => setFocus(null)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={IS("pw")} placeholder="••••••••" autoComplete="current-password"
        />
      </div>

      {error && (
        <div style={{ background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c03030", fontWeight: 600 }}>
          {error}
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading || !email || !password}
        style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: loading ? "#7a8c74" : "#1e2d1a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "background .15s" }}>
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </div>
  );
}

function FloorCodeLogin({ onSuccess }) {
  const { signInWithCode } = useAuth();
  const [code,  setCode]  = useState("");
  const [error, setError] = useState(false);

  function handleCode(digit) {
    const next = (code + digit).slice(0, 7).toUpperCase();
    setCode(next);
    setError(false);
    if (next.length >= 6) {
      setTimeout(() => {
        const ok = signInWithCode(next);
        if (!ok) { setError(true); setCode(""); setTimeout(() => setError(false), 1500); }
        else onSuccess?.();
      }, 100);
    }
  }

  function handleKeypad(key) {
    if (key === "DEL") { setCode(c => c.slice(0, -1)); setError(false); return; }
    handleCode(key);
  }

  // Also allow keyboard input
  const handleKeyDown = (e) => {
    if (e.key === "Backspace") { setCode(c => c.slice(0, -1)); setError(false); }
    else if (/^[A-Za-z0-9]$/.test(e.key)) handleCode(e.key.toUpperCase());
  };

  const KEYS = [
    ["1","2","3"],
    ["4","5","6"],
    ["7","8","9"],
    ["A","0","DEL"],
  ];

  return (
    <div onKeyDown={handleKeyDown} tabIndex={0} style={{ outline: "none" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74", marginBottom: 20, textAlign: "center" }}>
        Enter your floor access code
      </div>

      {/* Code display */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{
            width: 36, height: 44, borderRadius: 8,
            border: `2px solid ${error ? "#d94f3d" : i < code.length ? "#7fb069" : "#c8d8c0"}`,
            background: error ? "#fde8e8" : i < code.length ? "#f0f8eb" : "#f8faf6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: error ? "#d94f3d" : "#1e2d1a",
            transition: "all .1s",
          }}>
            {code[i] || ""}
          </div>
        ))}
      </div>

      {error && <div style={{ textAlign: "center", fontSize: 13, color: "#d94f3d", fontWeight: 700, marginBottom: 12 }}>Invalid code — try again</div>}

      {/* Keypad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
        {KEYS.flat().map(k => (
          <button key={k} onClick={() => handleKeypad(k)}
            style={{
              padding: "14px 0", borderRadius: 10, border: "1.5px solid #c8d8c0",
              background: k === "DEL" ? "#f8faf6" : "#fff",
              color: k === "DEL" ? "#7a8c74" : "#1e2d1a",
              fontWeight: 800, fontSize: k === "DEL" ? 12 : 18,
              cursor: "pointer", fontFamily: "inherit", transition: "all .1s",
            }}
            onMouseDown={e => { e.currentTarget.style.background = "#f0f8eb"; e.currentTarget.style.borderColor = "#7fb069"; }}
            onMouseUp={e => { e.currentTarget.style.background = k === "DEL" ? "#f8faf6" : "#fff"; e.currentTarget.style.borderColor = "#c8d8c0"; }}
          >
            {k === "DEL" ? "⌫" : k}
          </button>
        ))}
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#aabba0" }}>
        Ask your manager for the floor access code
      </div>
    </div>
  );
}

export function LoginScreen() {
  const [tab, setTab] = useState("email"); // email | floor

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5ef", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ background: "#1e2d1a", borderRadius: 20, padding: "28px 32px", marginBottom: 16, textAlign: "center" }}>
          <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 52, objectFit: "contain", marginBottom: 12 }} />
          <div style={{ fontSize: 13, color: "#6a8a5a", letterSpacing: .5 }}>Production Management</div>
        </div>

        {/* Tab selector */}
        <div style={{ display: "flex", background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 4, marginBottom: 16 }}>
          <button onClick={() => setTab("email")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: tab === "email" ? "#1e2d1a" : "transparent", color: tab === "email" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
            👤 Manager Login
          </button>
          <button onClick={() => setTab("floor")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: tab === "floor" ? "#1e2d1a" : "transparent", color: tab === "floor" ? "#fff" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
            🏭 Floor Access
          </button>
        </div>

        {/* Login form */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "28px 28px" }}>
          {tab === "email" ? <EmailLogin /> : <FloorCodeLogin />}
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#aabba0" }}>
          Hoosier Boy Greenhouse · Indianapolis, IN
        </div>
      </div>
    </div>
  );
}

// ── USER MENU (shown in planner nav) ─────────────────────────────────────────
export function UserMenu() {
  const { displayName, signOut, floorMode, user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: "none", border: "1px solid #4a6a3a", borderRadius: 8, padding: "6px 12px", color: "#c8e6b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
        <span>{floorMode ? "🏭" : "👤"}</span>
        <span>{displayName || "User"}</span>
        <span style={{ fontSize: 9, color: "#6a8a5a" }}>▼</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: 8, minWidth: 180, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
            {user?.email && (
              <div style={{ padding: "6px 10px", fontSize: 12, color: "#7a8c74", borderBottom: "1px solid #f0f5ee", marginBottom: 6 }}>
                {user.email}
              </div>
            )}
            {floorMode && (
              <div style={{ padding: "6px 10px", fontSize: 12, color: "#7a8c74", borderBottom: "1px solid #f0f5ee", marginBottom: 6 }}>
                Floor access: {floorMode}
              </div>
            )}
            <button onClick={() => { signOut(); setOpen(false); }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "none", color: "#d94f3d", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
