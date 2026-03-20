# Password Reset & Change Password Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service password reset from the login screen and in-app password change for managers.

**Architecture:** All changes in two files — `src/Auth.jsx` (new UI components + auth state) and `src/App.jsx` (recovery mode rendering check). Uses existing `sendPasswordReset` and `updatePassword` helpers from `src/supabase.js`.

**Tech Stack:** React 18, Supabase JS v2, inline styles (existing pattern)

---

## Chunk 1: Forgot Password Flow

### Task 1: Add forgot-password view state to EmailLogin

**Files:**
- Modify: `src/Auth.jsx:166-233` (EmailLogin component)

- [ ] **Step 1: Add view state and import sendPasswordReset**

At `src/Auth.jsx:2`, add `sendPasswordReset` to the import:

```javascript
import { getSupabase, sendPasswordReset } from "./supabase";
```

Inside `EmailLogin` (line 168), add a `view` state:

```javascript
const [view, setView] = useState("login"); // login | forgot | resetSent
```

- [ ] **Step 2: Add the ForgotPassword sub-view**

After the `handleSubmit` function (after line 196), add:

```javascript
const [cooldown, setCooldown] = useState(0);

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
```

- [ ] **Step 3: Add cooldown timer effect**

Below the `handleForgotSubmit` function, add:

```javascript
useEffect(() => {
  if (cooldown <= 0) return;
  const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
  return () => clearTimeout(timer);
}, [cooldown]);
```

Also add `useEffect` to the React import at line 1 if not already present (it IS already imported).

- [ ] **Step 4: Replace EmailLogin return with view-aware rendering**

Replace the existing `return (` block (lines 198-233) with:

```javascript
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
```

- [ ] **Step 5: Verify the app builds**

Run: `cd C:/Users/Mario/hoosierboy-greenhouse-ops && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/Auth.jsx
git commit -m "feat: add forgot-password flow to login screen"
```

---

## Chunk 2: Recovery Token Handler

### Task 2: Add recoveryMode state and onAuthStateChange handler

**Files:**
- Modify: `src/Auth.jsx:25-162` (AuthProvider)
- Modify: `src/App.jsx:195-220` (AppInner)

- [ ] **Step 1: Add recoveryMode state to AuthProvider**

In `AuthProvider` (after line 31), add:

```javascript
const [recoveryMode, setRecoveryMode] = useState(
  () => sessionStorage.getItem("gh_recovery_mode") === "true"
);
```

- [ ] **Step 2: Modify onAuthStateChange to detect PASSWORD_RECOVERY**

Replace lines 76-86 (the `onAuthStateChange` callback):

```javascript
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
```

- [ ] **Step 3: Add clearRecovery helper and export via context**

After the `signInWithCode` callback (after line 147), add:

```javascript
const clearRecovery = useCallback(() => {
  setRecoveryMode(false);
  sessionStorage.removeItem("gh_recovery_mode");
}, []);
```

Update the context `value` object (line 154-160) to include `recoveryMode`, `clearRecovery`, and `openChangePassword`:

```javascript
const [showChangePassword, setShowChangePassword] = useState(false);

const value = {
  user, role, floorMode, loading, initialized,
  isAdmin, isOperator, isGrower, isAuthenticated,
  growerProfile,
  signIn, signOut, signInWithCode,
  recoveryMode, clearRecovery,
  openChangePassword: () => setShowChangePassword(true),
  displayName: growerProfile?.name || user?.email?.split("@")[0] || (floorMode ? floorMode.charAt(0).toUpperCase() + floorMode.slice(1) : ""),
};
```

Note: `showChangePassword` state and rendering will be used in Task 3.

- [ ] **Step 4: Add RecoveryPasswordForm component**

Before the `LoginScreen` component (before line 324), add a new component. Also add `updatePassword` to the import at line 2:

```javascript
import { getSupabase, sendPasswordReset, updatePassword } from "./supabase";
```

Then the component:

```javascript
function RecoveryPasswordForm() {
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
```

- [ ] **Step 5: Export RecoveryPasswordForm**

Add to the exports. After the `LoginScreen` component's closing brace (after line 361), the `RecoveryPasswordForm` is already defined above it — just make sure `LoginScreen` export stays, and add the export for `RecoveryPasswordForm`:

At the top of `LoginScreen` (line 324), change to:
```javascript
export function LoginScreen() {
```
(It's already exported.)

Similarly, export `RecoveryPasswordForm` by adding `export` before `function RecoveryPasswordForm`.

- [ ] **Step 6: Update AppInner to check recoveryMode**

In `src/App.jsx`, update the import (line 2):

```javascript
import { AuthProvider, LoginScreen, UserMenu, useAuth, RecoveryPasswordForm } from "./Auth";
```

In `AppInner` (line 196), add `recoveryMode` to the destructured values:

```javascript
const { isAuthenticated, isAdmin, isOperator, role, loading, signOut, recoveryMode } = useAuth();
```

After the loading check (after line 205), add before line 207:

```javascript
if (recoveryMode) return <RecoveryPasswordForm />;
```

- [ ] **Step 7: Verify the app builds**

Run: `cd C:/Users/Mario/hoosierboy-greenhouse-ops && npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/Auth.jsx src/App.jsx
git commit -m "feat: add recovery token handler for password reset links"
```

---

## Chunk 3: Change Password Modal

### Task 3: Add ChangePasswordModal and wire into UserMenu

**Files:**
- Modify: `src/Auth.jsx:25-162` (AuthProvider — add showChangePassword state + modal render)
- Modify: `src/Auth.jsx:363-399` (UserMenu — add Change Password button)

- [ ] **Step 1: Add ChangePasswordModal component**

Before the `UserMenu` component (before line 363), add:

```javascript
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
```

- [ ] **Step 2: Render ChangePasswordModal in AuthProvider**

Update the `AuthProvider` return (line 162). Replace:

```javascript
return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
```

With:

```javascript
return (
  <AuthContext.Provider value={value}>
    {children}
    {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
  </AuthContext.Provider>
);
```

- [ ] **Step 3: Add Change Password button to UserMenu**

In the `UserMenu` component (line 364), add `openChangePassword` and `isAdmin` to the destructured auth values:

```javascript
const { displayName, signOut, floorMode, user, isAdmin, openChangePassword } = useAuth();
```

After the email display block (after line 385), add a Change Password button (only for admins):

```javascript
{isAdmin && (
  <button onClick={() => { openChangePassword(); setOpen(false); }}
    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "none", color: "#1e2d1a", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
    Change Password
  </button>
)}
```

- [ ] **Step 4: Verify the app builds**

Run: `cd C:/Users/Mario/hoosierboy-greenhouse-ops && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/Auth.jsx
git commit -m "feat: add change password modal for logged-in managers"
```

---

## Chunk 4: Manual Testing

### Task 4: Test all flows

- [ ] **Step 1: Start dev server**

Run: `cd C:/Users/Mario/hoosierboy-greenhouse-ops && npm start`

- [ ] **Step 2: Test forgot-password flow**

1. Open login screen
2. Click "Forgot Password?"
3. Enter a manager email, click "Send Reset Link"
4. Verify button disables with 60s cooldown
5. Verify success screen shows
6. Click "Back to Sign In" — verify return to login form

- [ ] **Step 3: Test recovery token flow**

1. Check email for reset link
2. Click it — verify "Set New Password" form appears (not the normal app)
3. Test validation: submit with <8 chars, submit with mismatched passwords
4. Enter valid password, submit
5. Verify success message, then auto-redirect to the app
6. Sign out and sign back in with the new password

- [ ] **Step 4: Test change password flow**

1. Sign in as a manager
2. Click your name in the top-right nav
3. Verify "Change Password" button appears in dropdown
4. Click it — verify modal opens
5. Test validation: submit with mismatched passwords
6. Enter valid new password, submit
7. Verify success message, modal auto-closes
8. Sign out and sign back in with the new password

- [ ] **Step 5: Test floor code users**

1. Sign in with a floor code
2. Click user menu — verify "Change Password" does NOT appear

- [ ] **Step 6: Final commit (if any tweaks needed)**

```bash
git add src/Auth.jsx src/App.jsx
git commit -m "fix: polish password reset flows after manual testing"
```

---

## Supabase Dashboard Checklist

These are manual config steps (not code):

- [ ] **Check 1:** Go to Supabase dashboard > Authentication > Email Templates > Reset Password — verify template is enabled
- [ ] **Check 2:** Go to Authentication > URL Configuration > Redirect URLs — verify `https://hoosierboy-greenhouse-ops.vercel.app` and `http://localhost:3000` are listed
