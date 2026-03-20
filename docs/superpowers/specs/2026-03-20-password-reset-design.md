# Password Reset & Change Password

## Problem

Managers who forget their password have no self-service way to reset it. Someone with Supabase dashboard access must manually reset it for them. Logged-in users also can't change their own password.

## Solution

Two features, both using the existing Supabase auth helpers (`sendPasswordReset`, `updatePassword` in `supabase.js`):

1. **Forgot Password** — self-service reset from the login screen
2. **Change Password** — in-app password change for logged-in managers

## Scope

- Only affects email/password (manager) accounts — floor code users are unaffected
- All changes contained in `src/Auth.jsx` (login UI, recovery handler, change password modal)
- No new files, no routing changes, no new dependencies

---

## 1. Forgot Password (Login Screen)

### Flow

1. User clicks "Forgot Password?" link below the Sign In button on the Manager Login tab
2. Login form is replaced with a reset-request form:
   - Email input (pre-filled if they already typed it)
   - "Send Reset Link" button
   - "Back to Sign In" link
3. On submit, calls `sendPasswordReset(email)` from `supabase.js`
4. Disable the button for 60 seconds after submit to prevent spam (Supabase also rate-limits server-side)
5. Shows success message: "Check your email for a reset link" (regardless of whether the email exists, to prevent enumeration)
6. User receives Supabase reset email with a link back to the app

### State

Add a `view` state to `LoginScreen` (or the email login sub-component):
- `"login"` — default email/password form
- `"forgot"` — reset request form
- `"resetSent"` — confirmation message

### UI

- Same dark green (#1e2d1a) background, same Hoosier Boy branding
- Reset form uses the same input styling as the login form
- "Forgot Password?" link is subtle (small text, light green #7fb069) below the sign-in button
- Success state shows a mail icon and message, with a "Back to Sign In" link

---

## 2. Recovery Token Handler

### Flow

1. User clicks the reset link in their email
2. Supabase redirects to `window.location.origin` with a recovery token in the URL hash
3. Supabase JS client detects the token and fires an `onAuthStateChange` event with `PASSWORD_RECOVERY`
4. App detects this event, sets `recoveryMode: true` in AuthProvider state
5. Instead of the normal login screen, a "Set New Password" form is shown:
   - New password input
   - Confirm password input
   - "Update Password" button
6. On submit, calls `updatePassword(newPassword)`
7. On success, clears `recoveryMode`, user is now signed in

### State

Add to `AuthProvider`:
- `recoveryMode` (boolean) — true when a PASSWORD_RECOVERY event is detected
- Persist `recoveryMode` in `sessionStorage` so it survives page refresh (the `PASSWORD_RECOVERY` event only fires once when the token is consumed from the URL hash)

### onAuthStateChange Modification

The existing handler (Auth.jsx ~line 76) ignores the `_event` parameter. Rename to `event` and add a branch:

```javascript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    setRecoveryMode(true);
    sessionStorage.setItem('recoveryMode', 'true');
    // Do NOT set user/role yet — let the recovery form handle it
    return;
  }
  // ...existing session handling...
});
```

### Rendering Priority

When `recoveryMode` is true, the recovery form must render **instead of** the normal app — even though Supabase sets a valid session (making `isAuthenticated` and `isAdmin` true). In `AppInner` (App.jsx), check `recoveryMode` before the role-based rendering:

```javascript
if (recoveryMode) return <RecoveryPasswordForm />;
if (!isAuthenticated) return <LoginScreen />;
if (isAdmin) return <PlannerShell />;
// ...
```

This means `App.jsx` does need a minor change to check the `recoveryMode` flag from AuthContext.

### Validation

- Minimum 8 characters, maximum 128 characters
- Passwords must match
- Show inline error messages below inputs
- Disable submit button during API call, show spinner

### Error Handling

- Network errors or unexpected Supabase errors: show "Something went wrong. Please try again."
- Token expired: show "This reset link has expired. Please request a new one." with a link to Forgot Password

### Edge Cases

- If the token is expired, Supabase returns an error — show the expiry message above
- Page refresh during recovery: `sessionStorage` preserves `recoveryMode`, user sees the form again
- User already logged in when clicking reset link: `PASSWORD_RECOVERY` event takes precedence, recovery form is shown
- Floor code user with a recovery token URL (unlikely): `PASSWORD_RECOVERY` only applies to Supabase auth sessions, floor code auth is separate and unaffected

---

## 3. Change Password (In-App)

### Flow

1. Logged-in manager clicks their name/avatar in the PlannerShell header
2. Dropdown includes a "Change Password" option (only for email-authenticated users, not floor code users)
3. Clicking it opens a modal:
   - New password input
   - Confirm password input
   - "Update Password" button + "Cancel" button
4. On submit, calls `updatePassword(newPassword)`
5. On success, shows a brief success message and closes the modal

### Why No "Current Password" Field

Supabase's `updateUser({ password })` doesn't require the current password — the user is already authenticated via their session token. Adding a current-password field would require a re-authentication call that Supabase JS doesn't directly support. Since the user is already logged in, the session token is sufficient proof of identity.

### State

Add to `Auth.jsx` or `PlannerShell`:
- `showChangePassword` (boolean) — controls modal visibility

### UI

- Standard modal overlay with dark backdrop
- Same input styling as login form
- Same validation as recovery form (8+ chars, max 128, must match)
- Shown only when `role === "admin"` (email-authenticated managers)
- Disable submit button during API call, show spinner
- On error: show "Something went wrong. Please try again."
- On success: show brief green success message, auto-close modal after 2 seconds

### Placement

Add a "Change Password" button to the `UserMenu` component (Auth.jsx ~line 364-399), between the email display and the sign-out button. Only render when `role === "admin"`.

### Context API Addition

Export `showChangePassword` setter from AuthContext so PlannerShell can trigger the modal. Render `ChangePasswordModal` inside `AuthProvider` so it's available app-wide:

```javascript
// In AuthContext value:
{ ...existing, openChangePassword: () => setShowChangePassword(true) }

// In AuthProvider render:
<AuthContext.Provider value={...}>
  {children}
  {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
</AuthContext.Provider>
```

---

## Files Modified

| File | Changes |
|------|---------|
| `src/Auth.jsx` | Add forgot-password view to EmailLogin, add recovery mode detection in onAuthStateChange, add ChangePasswordModal component, export openChangePassword from context |
| `src/App.jsx` | Add `recoveryMode` check in AppInner before role-based rendering |
| `src/supabase.js` | No changes needed — helpers already exist |

---

## Supabase Dashboard Configuration

The Supabase project needs the password reset email template configured. Check:
- **Authentication > Email Templates > Reset Password** — ensure it's enabled with the default or custom template
- **Authentication > URL Configuration > Redirect URLs** — ensure `https://hoosierboy-greenhouse-ops.vercel.app` is listed (and `http://localhost:3000` for dev)

This is a one-time dashboard config, not a code change.

---

## Testing

- Forgot Password: enter a valid manager email, verify reset email arrives, click link, set new password, verify sign-in works
- Recovery token expiry: wait for token to expire, verify error message and redirect to forgot-password
- Change Password: sign in, open modal, change password, sign out, sign in with new password
- Floor code users: verify "Change Password" does not appear in their UI
- Validation: test mismatched passwords, too-short passwords, empty fields
