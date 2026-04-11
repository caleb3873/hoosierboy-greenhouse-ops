# Hoosier Boy Greenhouse Ops

Production planning + shipping + task management app for Schlegel Greenhouse (Indianapolis). React CRA + Supabase + Vercel. Deployed at `ops.hoosierboy.com`.

## Commands

- `npm start` — dev server
- `npm run build` — production build (run after every change to verify)
- `npm test` — test runner

## Tech Stack

- React 18 (CRA via react-scripts 5.0.1)
- Supabase JS v2 (`@supabase/supabase-js`)
- Vercel (hosting + serverless functions)
- Resend (email for order confirmations, delivery departures, password reset)
- Google Routes API (distance/directions for shipping)
- Anthropic Claude (PDF catalog extraction + Spanish task translation)
- web-push (PWA push notifications via VAPID)
- xlsx (XLS/XLSX delivery schedule import)
- No router — state-based SPA with role-based views in `src/App.jsx`

## Environment Variables

Required in `.env.local`:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_GOOGLE_CSE_KEY` / `REACT_APP_GOOGLE_CSE_CX` (optional — image search)
- `REACT_APP_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY` (shipping distance/directions via Routes API)
- `REACT_APP_ANTHROPIC_API_KEY` (PDF extraction + translation)
- `RESEND_API_KEY` (departure emails, order emails)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` (push notifications — server side)
- `REACT_APP_VAPID_PUBLIC_KEY` (push notifications — client side, same value as VAPID_PUBLIC_KEY)

## Project Structure

- `src/App.jsx` — root component, nav shell, role-based routing
- `src/Auth.jsx` — auth context, login screen, floor-code login, password reset, user menu
- `src/supabase.js` — Supabase client, `useTable()` generic CRUD hook with real-time subscriptions
- `src/PushNotifications.jsx` — `usePushSubscription()` hook + `NotificationBanner` component for PWA push
- `src/*.jsx` — one file per page/feature (CropPlanning, Libraries, FallProgram, etc.)
- `src/combo/` — combo designer sub-module
- `src/shipping/` — shipping module (see below)
- `src/ManagerTasksView.jsx` — grower/production task manager (voice input, claim/release, Spanish toggle)
- `src/WorkerChecklistView.jsx` — grower daily task list (tap to claim → mark done / release)
- `public/sw.js` — service worker for push notifications
- `api/` — Vercel serverless functions
  - `extract-catalog.js` (Claude Vision PDF extraction)
  - `send-order.js`, `send-lockout-code.js` (Resend emails)
  - `shipping-distance.js` (Google Routes API)
  - `shipping-email.js` (departure emails via Resend)
  - `translate.js` (Claude-based Spanish translation for worker tasks)
  - `send-push.js` (web push notification sender)
  - `notify-task.js` (maps task/delivery events → push notifications, quiet hours 7am-4:30pm ET)
- `scripts/import_catalog.py` — local Python PDF import script
- `supabase-schema.sql` — full database schema
- `docs/superpowers/specs/` — design specs (includes `2026-04-09-shipping-command.md`)
- `docs/superpowers/plans/` — implementation plans

## Code Conventions

- **Inline styles** — no CSS files, all styling via `style={{}}` objects
- **Design palette**: dark green `#1e2d1a`, light green `#7fb069`, cream `#c8e6b8`, muted `#7a8c74`, red `#d94f3d`, amber `#e89a3a`
- **Fonts**: DM Sans (body), DM Serif Display (headings) — loaded via Google Fonts link in components
- **No linter/formatter config** — uses CRA defaults
- **camelCase in JS, snake_case in DB** — `useTable()` auto-converts via `toCamel()`/`toSnake()` in `supabase.js`
  - **JSONB payloads** (e.g. `customer_snapshot`, `photos`, `order_numbers`, `members`, `available_days`, `bench_numbers`, `pick_sheet_photos`, `signed_invoice_photos`, `alerts`, etc.) are preserved with their original key case via a `JSONB_KEYS` exclusion list in `toCamel`. When reading these, use snake_case keys (e.g. `cust.company_name`, `cust.allow_carts`). Add new JSONB columns to that list whenever you introduce them.
- **One component per file** — large self-contained pages, no shared component library
- **No TypeScript** — plain JSX
- **Team pull icons** use letters: **B** (Bluff), **S** (Sprague), **H** (Houseplants) — not plant emojis

## Data Layer

All CRUD goes through `useTable(tableName, { orderBy, ascending, localKey })` from `src/supabase.js`:
```js
const { rows, loading, insert, update, remove, upsert, refresh } = useTable("crop_runs");
```
- Auto-subscribes to Supabase realtime
- Falls back to localStorage when offline
- Returns camelCase objects (with JSONB fields preserved as-is)

## Auth & Roles

Hybrid system in `src/Auth.jsx`:
- **Admin (sales reps, owner)**: Supabase email/password → `role: "admin"` → PlannerShell
- **Floor codes** are checked in this order:
  1. `floor_codes` table (manager/shipping/operator roles)
  2. `drivers.login_code` → `role: "driver"` → DriverView (mobile stop list)
  3. `grower_profiles` table → `role: "grower"`
- Floor sessions stored in localStorage with 12-hour expiry
- `AuthContext` provides: `user, role, isAdmin, isOperator, isManager, isGrower, isOwner, isShippingManager, isShippingTeam, isShippingOffice, signIn, signOut, signInWithCode, growerProfile, displayName, team`

### Active floor codes

**Shipping — Managers:**
- `7846038` — Shipping Manager → `shipping_manager` → ShippingManagerMobile
- `3228259` — Tyler → `shipping_manager` → ShippingManagerMobile

**Shipping — Office (can add/upload, pending Tyler approval):**
- `6792980` — Mario Mirelez → `shipping_office` → ShippingOfficeView
- `2533345` — Trish → `shipping_office` → ShippingOfficeView
- `2016869` — Rachel Garcia → `shipping_office` + team=houseplants → TeamPullView (hybrid: pull + add orders)

**Shipping — Team Leads (claim → pull → photo → done):**
- `7212836` — Sam Schroder → `shipping_team` / bluff1 → TeamPullView
- `5908543` — Ryan Griffith → `shipping_team` / bluff2 → TeamPullView
- `7654321` — Evie Seaman → `shipping_team` / sprague → TeamPullView
- `8690078` — Zack Stenz → `shipping_team` / loader → TeamPullView (sees bluff1 queue)

**Grower — Managers:**
- `9999999` — Paul Schlegel → `manager` → ManagerTasksView
- `8888888` — Amanda Kirsop → `manager` → ManagerTasksView

**Grower — Workers:**
- `4444444` — Reese Morris → `operator` (task creator access via name match)
- `1111111` — Michael Papineau, `2222222` — Zach Stenz, `3333333` — Colin O'Dell, `6666666` — Eulogio Martinez (Spanish), `1111222` — Kurt Schlegel → `grower` → WorkerChecklistView

**Deactivated:** `1234567` (old Sam), `9876543` (old Ryan), `8765432` (old Zach shipping)

**Drivers:** created dynamically in Drivers admin with `login_code` field → DriverView

## Routing (src/App.jsx AppInner)

1. Admin → PlannerShell (desktop nav with Production/Operations/Shipping/etc. tabs)
2. Manager or named operator → FloorAppRouter (ManagerTasksView / WorkerChecklistView / OperatorView overlay)
3. `role === "driver"` → DriverView
4. `role === "shipping_manager"` → ShippingManagerMobile (mobile-first sortable list, approval inbox, quick-add with customer search)
5. `role === "shipping_office"` + team → TeamPullView with `canAddOrders` (Rachel hybrid)
6. `role === "shipping_office"` → ShippingOfficeView (Mario, Trish — day view, add delivery, import XLS)
7. `role === "shipping"` or `role === "shipping_team"` → TeamPullView (team from `floor_codes.team`)
8. `role === "operator"` → OperatorView

## Key Feature Modules

### Shipping module (`src/shipping/`)

**Desktop admin views (PlannerShell → Shipping nav):**
- **Command** — calendar-first week grid with AM/PM buckets; delivery chips show confirmation dots (sales/customer/shipping), per-team pull icons (B/S/H), COD badge, alerts. Proposed deliveries show dashed borders. Detail drawer for confirmations, team assignment, driver/truck, address editing with auto-distance, alerts, pick sheet gallery. Route builder side panel with truck diagram, cost estimates, drag-to-reorder, filters (route/city/state/$/customer search). Import XLS button. Approval inbox for proposed deliveries.
- **Routes** — saved route cards with status (planned/active/completed), stop list, truck diagram, delete
- **Pick Sheets** — desktop viewer for pick sheet photos by date, grouped by team, with full-screen lightbox + scroll zoom + click-to-zoom + drag-to-pan for reading handwritten notes
- **Dashboard** (legacy) — today's board with driver lanes, fuel tracking
- **Calendar** — week/day grid with drag-and-drop
- **Schedule** — delivery creation form with team checkboxes, creates `lifecycle='proposed'`
- **Drivers / Trucks / Teams / Carts / Customers / Claims** — CRUD admin pages
- **Trucks** — includes rental checkbox (received date, cost/day, mileage cost) and RiverLink checkbox (can go to Louisville)

**Mobile floor-code views:**
- **ShippingManagerMobile** (`shipping_manager` floor codes) — modeled after ManagerTasksView. Week navigation (← →) with Mon–Sat day pills. Sortable delivery list with ▲▼ reorder. Approval inbox scoped to viewed day/week. Quick-add FAB with customer search autocomplete + dollar amount. Import XLS. Mark shipped checkbox (quick button on collapsed card + expanded). Driver assignment with Call/Text buttons. Move to date with AM/PM. Delete. Timing chain (claimed → pulled → shipped). 🔑 Codes lookup. Push notification banner.
- **ShippingOfficeView** (`shipping_office` floor codes without team — Mario, Trish) — day-by-day mobile view, add delivery form (proposed), import XLS, reconfirmation queue, schedule changes banner, 🔑 codes lookup
- **TeamPullView** (`shipping_team` / `shipping` floor codes) — single-focus "Next Up" kiosk. Bluff teams claim orders (Sam claims → Ryan sees next unclaimed). Either Bluff team completing marks ALL of Bluff done. Pick sheet photo modal (mandatory) or "Complete — lost/incomplete pick sheet" option (flags but allows). Progress bar (count + dollars). Rachel's hybrid view (`canAddOrders`) adds + Add Order and 📋 All Orders buttons.
- **DriverView** — mobile stop list with signed invoice photo upload on Delivered
- **DeliveryImporter** — XLS parser, groups by customer+date, preview table, upsert sync (add new, update existing, flag late changes, auto-create customers)

#### Shipping data model
`deliveries` table key columns: `lifecycle` ('proposed'|'confirmed'|'cancelled'), `priority_order`, `date_locked`, `ship_via`, `original_date`, `date_changed_at/by`, `shipped_at/by`, `loaded_at`, `too_late_reason`, three-confirmation fields (`sales_confirmed_at/by`, `customer_confirmed_at/by`, `shipping_confirmed_at/by`), per-team fan-out fields (`needs_bluff1/2/sprague/houseplants`, `*_pulled_at`, `*_pulled_by`), claim fields (`bluff_claimed_by/at`), `route_id`, JSONB arrays (`pick_sheet_photos`, `signed_invoice_photos`, `alerts`).

`shipping_routes` table: `name`, `driver_id`, `truck_id`, `delivery_date`, `status` ('planned'|'active'|'completed'), `fuel_cost_per_gal`, `total_miles`, `total_minutes`, `estimated_cost`.

`shipping_customers` adds `delivery_confirmation_required`, `shipping_notes`, existing `terms` used as payment terms / COD flag.

`trucks` adds `is_rental`, `rental_received_date`, `rental_cost_per_day`, `rental_mileage_cost`, `has_riverlink`.

`push_subscriptions` table: `endpoint`, `keys` (jsonb), `worker_name`, `role`.

**Teams** (4 pull teams across 2 physical locations):
- Bluff Team 1 (Sam) + Bluff Team 2 (Ryan) — shared Bluff queue with claim system. Either team completing marks ALL Bluff done. On chips/icons rendered as unified **B**.
- Sprague Team (Evie) — **S**
- Houseplants Team (Rachel) — **H**

**Approval flow**: Mario/Trish/Rachel add deliveries as `lifecycle='proposed'` → shows in Tyler's approval inbox (scoped to viewed day/week) → Tyler approves (→ confirmed) or declines (→ cancelled). Tyler's own quick-add auto-approves.

**Route builder**: side panel on Command view. Click chips to add stops, assign driver/truck, truck loading diagram (top-down: cab left, doors right), $22k capacity warning, time + cost estimates ($22/hr driver + configurable fuel $/gal at 8 MPG). Routes persist as `shipping_routes` records. Double-click bundled route chip to edit. Deliveries on saved routes bundle into expandable route chips on the calendar.

**Customer confirmation auto-expiry**: if within 14 days of delivery, `customer_confirmed_at` must be recent. Helper: `customerConfirmationValid()` from `ShippingCommand.jsx`.

**Schedule change notifications**: when Tyler moves a delivery to a different date, `original_date`, `date_changed_at/by` are set + alert logged. Mario/Trish/Rachel see "📅 N schedule changes" banner on login with dismiss per change. Cards show amber MOVED badge.

### Push Notifications
- PWA web push via service worker (`public/sw.js`) + VAPID
- `NotificationBanner` component shown on all mobile views (auto-hides when subscribed)
- iOS requires Add to Home Screen for push support
- Triggers: task_created → growers, task_approved → requester, delivery_proposed → managers, delivery_approved → proposer
- **Quiet hours**: 7:00am–4:30pm ET (America/Indiana/Indianapolis). Notifications outside this window are silently skipped.
- `api/send-push.js` sends to targeted subscriptions; `api/notify-task.js` maps events to push payloads

### Grower tasks (`ManagerTasksView.jsx` + `WorkerChecklistView.jsx`)
- Voice dictation with iOS keyboard fallback
- Production / Growing tab split
- Today / Tomorrow / Day After / This Week buckets with computed `target_date` per task
- Claim / Mark Done / Release workflow (grower must claim before completing; released tasks return to pending with notes for next person)
- Task requests: growers tap **➕ Suggest Task** → auto-opens for the manager on next login; approve with date picker → task flows into the scheduled week
- Spanish translation via `/api/translate` (Claude Haiku 4.5) — **Eulogio Martinez auto-defaults to Spanish**, anyone can flip EN/ES toggle
- Carryover: stale pending tasks auto-roll to today with red "OVERDUE" badge
- Push notification triggers on task create + approve

### Fall Program, Crop Planning, Combo Designer, Houseplant Availability, Fundraiser tools
All under PlannerShell's nav groups. See individual files for details.

## Git

- **Git config**: user.name "Caleb Schlegel", user.email "caleb@schlegelgreenhouse.com"
- Always commit with descriptive messages, never amend shared commits
- Commit with `🤖 Generated with Claude Code` footer only when requested

## Supabase

- CLI: `npx supabase db query --linked "<SQL>"` — execute SQL against the linked project
- Linked to project `gganxbvtbqheyxvedjko` (hoosierboy-ops)
- Storage buckets: `pick-sheet-photos` (private), `signed-invoices` (private) — RLS policies allow anon+authenticated insert+select

## Vercel CLI

- `vercel env ls` — list env vars
- `vercel env add NAME production` — add env var (pipe value via stdin)
- `vercel --prod` — manual prod deploy (normally auto on push to main)

## CLI Harness

`agent-harness/` contains a CLI-Anything harness (`cli-anything-greenhouse-ops`):
- Installed via `pip install -e .` in `agent-harness/`
- Commands: `greenhouse-ops variety|crop-run|catalog|space|session`
- Wraps Supabase via Python client, reads creds from env or `.env.local`
