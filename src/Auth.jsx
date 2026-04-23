import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { getSupabase, sendPasswordReset, updatePassword } from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
// Floor access codes — change these to whatever you want
// These are stored in localStorage and checked against the floor_codes table
export const FLOOR_CODES = {
  operator:    "1111111",   // All floor operators / growers
  maintenance: "1111111",   // Maintenance person
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
  const [user,          setUser]          = useState(null);   // Supabase user object
  const [role,          setRole]          = useState(null);   // admin | operator | maintenance
  const [floorMode,     setFloorMode]     = useState(null);   // operator | maintenance | null
  const [loading,       setLoading]       = useState(true);
  const [initialized,   setInitialized]   = useState(false);
  const [growerProfile, setGrowerProfile] = useState(null);
  const [team, setTeam] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(
    () => sessionStorage.getItem("gh_recovery_mode") === "true"
  );
  const [showChangePassword, setShowChangePassword] = useState(false);

  const sb = getSupabase();

  // Check for existing floor session
  const checkFloorSession = useCallback(() => {
    try {
      const stored = localStorage.getItem(FLOOR_SESSION_KEY);
      if (stored) {
        const s = JSON.parse(stored);
        const { mode, expires } = s;
        if (expires > Date.now()) {
          setFloorMode(mode);
          setRole(mode);
          if (s.growerProfile) setGrowerProfile(s.growerProfile);
          if (s.team) setTeam(s.team);
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
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        sessionStorage.setItem("gh_recovery_mode", "true");
        return;
      }
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
      setGrowerProfile(null);
      setTeam(null);
    } else {
      if (sb) await sb.auth.signOut();
      setUser(null);
      setRole(null);
      setGrowerProfile(null);
      setTeam(null);
    }
  }, [sb, floorMode]);

  // Floor code sign in
  const signInWithCode = useCallback(async (raw) => {
    const code = (raw || "").trim().toUpperCase();

    // 1. Try database floor_codes table first (preferred)
    try {
      const { data: fc } = await sb.from("floor_codes")
        .select("*")
        .eq("code", code)
        .eq("active", true)
        .single();
      if (fc) {
        const workerName = fc.worker_name || fc.workerName;
        const fcTeam = fc.team || null;
        const profile = workerName ? { id: null, name: workerName, role: fc.role, code, team: fcTeam } : null;
        const session = { mode: fc.role, growerProfile: profile, team: fcTeam, expires: Date.now() + 12 * 60 * 60 * 1000 };
        localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
        setFloorMode(fc.role);
        setRole(fc.role);
        setGrowerProfile(profile);
        setTeam(fcTeam);
        return true;
      }
    } catch (e) { /* offline or no match — fall through */ }

    // 2. Fall back to hardcoded codes (for offline mode)
    const matchedRole = Object.entries(FLOOR_CODES).find(([, v]) => v === code)?.[0];
    if (matchedRole) {
      const session = { mode: matchedRole, expires: Date.now() + 12 * 60 * 60 * 1000 };
      localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
      setFloorMode(matchedRole);
      setRole(matchedRole);
      setGrowerProfile(null);
      return true;
    }

    // 2b. Try drivers table (shipping driver login)
    try {
      const { data: dr } = await sb.from("drivers")
        .select("*")
        .eq("login_code", code)
        .eq("active", true)
        .single();
      if (dr) {
        const profile = { id: dr.id, name: dr.name, role: "driver", code };
        const session = { mode: "driver", growerProfile: profile, expires: Date.now() + 12 * 60 * 60 * 1000 };
        localStorage.setItem(FLOOR_SESSION_KEY, JSON.stringify(session));
        setFloorMode("driver");
        setRole("driver");
        setGrowerProfile(profile);
        return true;
      }
    } catch (e) { /* fall through */ }

    // 3. Try grower profile lookup
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
  }, [sb]);

  const clearRecovery = useCallback(() => {
    setRecoveryMode(false);
    sessionStorage.removeItem("gh_recovery_mode");
  }, []);

  // Owner is hardcoded to Caleb's email — only he can access the owner dashboard
  const OWNER_EMAIL = "caleb@schlegelgreenhouse.com";
  const isOwner       = !!user && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase();
  const isOperationsManager = role === "operations_manager";
  const isAdmin       = role === "admin" || isOperationsManager;
  const isOperator    = role === "operator" || role === "maintenance" || role === "manager" || isOperationsManager;
  const isManager     = role === "manager" || isOperationsManager;
  const isGrower      = role === "grower";
  const isShippingManager = role === "shipping_manager" || isOperationsManager;
  const isShippingTeam    = role === "shipping";
  const isShippingOffice  = role === "shipping_office";
  const isAuthenticated = !!role;

  const value = {
    user, role, floorMode, loading, initialized, team,
    isAdmin, isOperator, isGrower, isOwner, isManager, isShippingManager, isShippingTeam, isShippingOffice, isOperationsManager, isAuthenticated,
    growerProfile,
    signIn, signOut, signInWithCode,
    recoveryMode, clearRecovery,
    openChangePassword: () => setShowChangePassword(true),
    displayName: growerProfile?.name || user?.email?.split("@")[0] || (floorMode ? floorMode.charAt(0).toUpperCase() + floorMode.slice(1) : ""),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </AuthContext.Provider>
  );
}

// ── LOGIN SCREEN ──────────────────────────────────────────────────────────────
function EmailLogin({ onSuccess }) {
  const { signIn } = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [focus,    setFocus]    = useState(null);
  const [view,     setView]     = useState("login"); // login | forgot | resetSent
  const [cooldown, setCooldown] = useState(0);

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

  async function handleForgotSubmit(e) {
    e?.preventDefault();
    if (!email.trim() || cooldown > 0) return;
    setLoading(true);
    setError("");
    const { error: err } = await sendPasswordReset(email.trim());
    setLoading(false);
    if (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } else {
      setView("resetSent");
      setCooldown(60);
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (view === "resetSent") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>
          Check your email
        </div>
        <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 24, lineHeight: 1.5 }}>
          If an account exists for <strong>{email}</strong>, you'll receive a password reset link shortly.
        </div>
        <button onClick={() => { setView("login"); setError(""); }}
          style={{ background: "none", border: "none", color: "#7fb069", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ← Back to Sign In
        </button>
      </div>
    );
  }

  if (view === "forgot") {
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#7a8c74", marginBottom: 20, textAlign: "center" }}>
          Enter your email to receive a reset link
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Email</div>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            onFocus={() => setFocus("email")} onBlur={() => setFocus(null)}
            onKeyDown={e => e.key === "Enter" && handleForgotSubmit()}
            style={IS("email")} placeholder="you@hoosierboy.com" autoComplete="email"
          />
        </div>

        {error && (
          <div style={{ background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c03030", fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button onClick={handleForgotSubmit} disabled={loading || !email || cooldown > 0}
          style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: loading ? "#7a8c74" : "#1e2d1a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "background .15s", marginBottom: 12 }}>
          {loading ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Send Reset Link"}
        </button>

        <div style={{ textAlign: "center" }}>
          <button onClick={() => { setView("login"); setError(""); }}
            style={{ background: "none", border: "none", color: "#7fb069", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
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

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <button onClick={() => { setView("forgot"); setError(""); }}
          style={{ background: "none", border: "none", color: "#7fb069", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          Forgot Password?
        </button>
      </div>
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
    if (next.length >= 7) {
      setTimeout(async () => {
        const ok = await signInWithCode(next);
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
    ["","0","DEL"],
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
          <button key={k} onClick={() => k && handleKeypad(k)}
            style={{
              padding: "14px 0", borderRadius: 10,
              border: k === "" ? "none" : "1.5px solid #c8d8c0",
              background: k === "DEL" ? "#f8faf6" : k === "" ? "transparent" : "#fff",
              color: k === "DEL" ? "#7a8c74" : "#1e2d1a",
              fontWeight: 800, fontSize: k === "DEL" ? 12 : 18,
              cursor: k === "" ? "default" : "pointer", fontFamily: "inherit", transition: "all .1s",
              pointerEvents: k === "" ? "none" : "auto",
            }}
            onMouseDown={e => { if (k) { e.currentTarget.style.background = "#f0f8eb"; e.currentTarget.style.borderColor = "#7fb069"; }}}
            onMouseUp={e => { if (k) { e.currentTarget.style.background = k === "DEL" ? "#f8faf6" : "#fff"; e.currentTarget.style.borderColor = "#c8d8c0"; }}}
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

// ── RECOVERY PASSWORD FORM (shown when reset link is clicked) ────────────────
export function RecoveryPasswordForm() {
  const { clearRecovery } = useAuth();
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [focus, setFocus] = useState(null);

  const IS = (f) => ({
    width: "100%", padding: "13px 14px", borderRadius: 10,
    border: `1.5px solid ${focus === f ? "#7fb069" : "#c8d8c0"}`,
    fontSize: 15, fontFamily: "inherit", background: "#fff",
    color: "#1e2d1a", outline: "none", boxSizing: "border-box",
    transition: "border-color .15s",
  });

  function validate() {
    if (newPw.length < 8) return "Password must be at least 8 characters";
    if (newPw.length > 128) return "Password must be 128 characters or less";
    if (newPw !== confirmPw) return "Passwords do not match";
    return null;
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");
    const { error: apiErr } = await updatePassword(newPw);
    setLoading(false);
    if (apiErr) {
      if (apiErr.message?.includes("expired") || apiErr.message?.includes("invalid")) {
        setError("This reset link has expired. Please request a new one.");
      } else {
        setError(apiErr.message || "Something went wrong. Please try again.");
      }
    } else {
      setSuccess(true);
      setTimeout(() => clearRecovery(), 2000);
    }
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: "#f2f5ef", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ background: "#1e2d1a", borderRadius: 20, padding: "28px 32px", marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#c8e6b8" }}>Password Updated</div>
            <div style={{ fontSize: 13, color: "#6a8a5a", marginTop: 8 }}>Signing you in...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f2f5ef", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ background: "#1e2d1a", borderRadius: 20, padding: "28px 32px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#c8e6b8" }}>Set New Password</div>
          <div style={{ fontSize: 12, color: "#6a8a5a", marginTop: 6 }}>Choose a new password for your account</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "28px 28px" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>New Password</div>
            <input
              type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              onFocus={() => setFocus("new")} onBlur={() => setFocus(null)}
              style={IS("new")} placeholder="At least 8 characters" autoComplete="new-password"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Confirm Password</div>
            <input
              type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              onFocus={() => setFocus("confirm")} onBlur={() => setFocus(null)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={IS("confirm")} placeholder="Re-enter password" autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{ background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c03030", fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading || !newPw || !confirmPw}
            style={{ width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: loading ? "#7a8c74" : "#1e2d1a", color: "#fff", fontWeight: 800, fontSize: 15, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "background .15s" }}>
            {loading ? "Updating..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CHANGE PASSWORD MODAL ────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [focus, setFocus] = useState(null);

  const IS = (f) => ({
    width: "100%", padding: "13px 14px", borderRadius: 10,
    border: `1.5px solid ${focus === f ? "#7fb069" : "#c8d8c0"}`,
    fontSize: 15, fontFamily: "inherit", background: "#fff",
    color: "#1e2d1a", outline: "none", boxSizing: "border-box",
    transition: "border-color .15s",
  });

  function validate() {
    if (newPw.length < 8) return "Password must be at least 8 characters";
    if (newPw.length > 128) return "Password must be 128 characters or less";
    if (newPw !== confirmPw) return "Passwords do not match";
    return null;
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");
    const { error: apiErr } = await updatePassword(newPw);
    setLoading(false);
    if (apiErr) {
      setError(apiErr.message || "Something went wrong. Please try again.");
    } else {
      setSuccess(true);
      setTimeout(() => onClose(), 2000);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, fontFamily: "'DM Sans','Segoe UI',sans-serif" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "28px 28px", width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#1e2d1a", marginBottom: 4 }}>Change Password</div>
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>Enter a new password for your account</div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#3a7a2a" }}>Password updated successfully</div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>New Password</div>
              <input
                type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                onFocus={() => setFocus("new")} onBlur={() => setFocus(null)}
                style={IS("new")} placeholder="At least 8 characters" autoComplete="new-password"
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .7, marginBottom: 6 }}>Confirm Password</div>
              <input
                type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                onFocus={() => setFocus("confirm")} onBlur={() => setFocus(null)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                style={IS("confirm")} placeholder="Re-enter password" autoComplete="new-password"
              />
            </div>

            {error && (
              <div style={{ background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#c03030", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1.5px solid #e0ead8", background: "#fff", color: "#7a8c74", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={loading || !newPw || !confirmPw}
                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: loading ? "#7a8c74" : "#1e2d1a", color: "#fff", fontWeight: 800, fontSize: 14, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "background .15s" }}>
                {loading ? "Updating..." : "Update"}
              </button>
            </div>
          </>
        )}
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
  const { displayName, signOut, floorMode, user, isAdmin, openChangePassword } = useAuth();
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
            {isAdmin && (
              <button onClick={() => { openChangePassword(); setOpen(false); }}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "none", color: "#1e2d1a", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                Change Password
              </button>
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
