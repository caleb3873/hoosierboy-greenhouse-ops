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
- Google Maps (Distance Matrix + Geocoding for shipping)
- Anthropic Claude (PDF catalog extraction + Spanish task translation)
- No router — state-based SPA with role-based views in `src/App.jsx`

## Environment Variables

Required in `.env.local`:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_GOOGLE_CSE_KEY` / `REACT_APP_GOOGLE_CSE_CX` (optional — image search)
- `REACT_APP_GOOGLE_MAPS_API_KEY` / `GOOGLE_MAPS_API_KEY` (shipping distance/directions)
- `REACT_APP_ANTHROPIC_API_KEY` (PDF extraction + translation)
- `RESEND_API_KEY` (departure emails, order emails)

## Project Structure

- `src/App.jsx` — root component, nav shell, role-based routing
- `src/Auth.jsx` — auth context, login screen, floor-code login, password reset, user menu
- `src/supabase.js` — Supabase client, `useTable()` generic CRUD hook with real-time subscriptions
- `src/*.jsx` — one file per page/feature (CropPlanning, Libraries, FallProgram, etc.)
- `src/combo/` — combo designer sub-module
- `src/shipping/` — shipping module (Command, Dashboard, Calendar, Schedule, Drivers, Teams, Trucks, Carts, Customers, Claims, DriverView, ShipperTasksView, TeamPullView)
- `src/ManagerTasksView.jsx` — grower/production task manager (voice input, claim/release, Spanish toggle)
- `src/WorkerChecklistView.jsx` — grower daily task list (tap to claim → mark done / release)
- `api/` — Vercel serverless functions
  - `extract-catalog.js` (Claude Vision PDF extraction)
  - `send-order.js`, `send-lockout-code.js` (Resend emails)
  - `shipping-distance.js` (Google Distance Matrix)
  - `shipping-email.js` (departure emails via Resend)
  - `translate.js` (Claude-based Spanish translation for worker tasks)
- `scripts/import_catalog.py` — local Python PDF import script
- `supabase-schema.sql` — full database schema
- `docs/superpowers/specs/` — design specs (includes `2026-04-08-shipping-manager.md`)
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
- `AuthContext` provides: `user, role, isAdmin, isOperator, isManager, isGrower, isOwner, signIn, signOut, signInWithCode, growerProfile, displayName`

### Active floor codes (non-exhaustive — use the Codes button in ManagerTasksView for current list)
- **Manager (Paul Schlegel)**: `9999999`
- **Amanda Kirsop** (manager — full task creator): `8888888`
- **Reese Morris** (head grower + task creator access via name match): `4444444`
- **Growers**: Michael Papineau `1111111`, Zach Stenz `2222222`, Colin O'Dell `3333333`, Eulogio Martinez `6666666`, Kurt Schlegel `1111222`
- **Shipping Manager (Tyler)**: `7846038` → `role: "shipping_manager"` → ShippingCommand
- **Shipping team members** (role `shipping`, tagged by `team` column → TeamPullView): Sam Schroder `1234567` (bluff1), Ryan Griffith `9876543` (bluff2), Evie Seaman `7654321` (sprague), Rachel `2016869` (houseplants), Zach Stenz shipping `8765432` (untagged)
- **Drivers**: created dynamically in Drivers admin with `login_code` field — routed to DriverView

## Routing (src/App.jsx AppInner)

1. Admin → PlannerShell (desktop nav with Production/Operations/Shipping/etc. tabs)
2. Manager or named operator → FloorAppRouter (ManagerTasksView / WorkerChecklistView / OperatorView overlay)
3. `role === "driver"` → DriverView
4. `role === "shipping_manager"` → ShippingCommand (Tyler, wrapped in a minimal header shell)
5. `role === "shipping"` → TeamPullView (team from `floor_codes.team`: bluff1/bluff2/sprague/houseplants)
6. `role === "operator"` → OperatorView

## Key Feature Modules

### Shipping module (`src/shipping/`)
- **Command** (Tyler — NEW, Phase 1 of whiteboard replacement) — calendar-first week grid with AM/PM buckets; chips render confirmation dots (sales/customer/shipping), per-team pull icons (Bluff unified / Sprague / Houseplants), COD badge, unconfirmed badge, claims history badge, and latest alert. Proposed deliveries show dashed borders until Tyler confirms them. Detail drawer handles confirmation toggles, per-team pull status + pick sheet photo gallery, alerts timeline, team assignment (Bluff 1 vs Bluff 2), move date, date_locked toggle. Top strip shows reconfirmation queue + late-change counters. Spec: `docs/superpowers/specs/2026-04-09-shipping-command.md`.
- **TeamPullView** (Sam/Ryan/Evie/Rachel — NEW) — single-focus "Next Up" kiosk for team members. Shows only the top delivery in their queue (filtered by `needs_<team>=true AND lifecycle='confirmed' AND pulled_at IS NULL`), with progress bar (count + dollars for today). "Mark done" opens a mandatory pick sheet photo modal uploading to `pick-sheet-photos` Supabase storage bucket before flipping `<team>_pulled_at`. "Report problem" appends to `alerts`.
- **Dashboard** (legacy) — today's board with unassigned + per-driver lanes, driver attendance, team roster, overdue + upcoming days, fuel tracking with running cost-per-mile, drag-assignment of driver/team/truck, date picker to move deliveries
- **Calendar** — week/day grid with drag-and-drop, AM/PM buckets, hour drill-down, capacity warnings, truck-conflict detection, expandable chips, unscheduled drawer
- **Schedule** — sales rep delivery creation form (customer autocomplete, priority, order numbers, value, carts, time, **"Which teams pull?" checkboxes** that set `needs_bluff1/2/sprague/houseplants`, creates deliveries with `lifecycle='proposed'`)
- **Drivers / Trucks / Teams / Carts / Customers / Claims** — CRUD admin pages
- **DriverView** — mobile stop list with Leave/Arrive/Delivered timestamps, Google Maps deeplink, departure email trigger, claim reporting, **optional signed invoice photo upload** on Delivered (to `signed-invoices` bucket)
- **ShipperTasksView** — weekly shipping task view (Mon–Sat) — legacy, no longer routed to by default
- **Departure emails** fired from driver's Leave button via `/api/shipping-email` (Resend)
- **Distance** computed via `/api/shipping-distance` (Google Distance Matrix from greenhouse at 4425 Bluff Road)

#### Shipping data model (Phase 1 additions)
`deliveries` table new columns: `lifecycle` ('proposed'|'confirmed'|'cancelled'), `priority_order`, `too_late_reason`, `date_locked`, `loaded_at`, three-confirmation fields (`sales_confirmed_at/by`, `customer_confirmed_at/by`, `shipping_confirmed_at/by`), per-team fan-out fields (`needs_bluff1`, `bluff1_pulled_at`, `bluff1_pulled_by`, and same for `bluff2`, `sprague`, `houseplants`), and JSONB arrays `pick_sheet_photos`, `signed_invoice_photos`, `alerts`. `shipping_customers` adds `delivery_confirmation_required`, `shipping_notes` (the existing `terms` column doubles as payment terms / COD flag). `floor_codes` adds a `team` column for routing shipping-role codes to the correct TeamPullView.

**Teams** (4 pull teams across 2 physical locations):
- Bluff Team 1 (Sam), Bluff Team 2 (Ryan) — Bluff location; on the Command chip these are rendered as a single unified 🌱 Bluff icon, but detail drawer / TeamPullView distinguishes them
- Sprague Team (Evie) — Sprague location
- Houseplants Team (Rachel) — Houseplants

Most orders fan out across multiple teams; an order is only "ready to load" when all `needs_<team>=true` flags have corresponding `<team>_pulled_at` timestamps. Pick sheet photos are mandatory when marking a team's portion done.

**Customer confirmation auto-expiry**: if a delivery is within 14 days of its date, `customer_confirmed_at` must also be within 14 days; otherwise the chip goes yellow and lands in the reconfirmation queue for sales. Helper: `customerConfirmationValid()` exported from `ShippingCommand.jsx`.

### Grower tasks (`ManagerTasksView.jsx` + `WorkerChecklistView.jsx`)
- Voice dictation with iOS keyboard fallback
- Production / Growing tab split
- Today / Tomorrow / Day After / This Week buckets with computed `target_date` per task
- Claim / Mark Done / Release workflow (grower must claim before completing; released tasks return to pending with notes for next person)
- Task requests: growers tap **➕ Suggest Task** → auto-opens for the manager on next login; approve with date picker → task flows into the scheduled week
- Spanish translation via `/api/translate` (Claude Haiku 4.5) — **Eulogio Martinez auto-defaults to Spanish**, anyone can flip EN/ES toggle
- Carryover: stale pending tasks auto-roll to today with red "OVERDUE" badge

### Fall Program, Crop Planning, Combo Designer, Houseplant Availability, Fundraiser tools
All under PlannerShell's nav groups. See individual files for details.

## Git

- **Active branch**: `feature/grower-ops-tier1` (but main is the deploy target)
- **Git config**: user.name "Caleb Schlegel", user.email "caleb@schlegelgreenhouse.com"
- Always commit with descriptive messages, never amend shared commits
- Commit with `🤖 Generated with Claude Code` footer only when requested

## Supabase CLI

Not installable via npm on Windows. Use `npx supabase` instead.
- `npx supabase db query --linked "<SQL>"` — execute SQL against the linked project
- Linked to project `gganxbvtbqheyxvedjko` (hoosierboy-ops)

## Vercel CLI

- `vercel env ls` — list env vars
- `vercel env add NAME production` — add env var (pipe value via stdin)
- `vercel --prod` — manual prod deploy (normally auto on push to main)

## CLI Harness

`agent-harness/` contains a CLI-Anything harness (`cli-anything-greenhouse-ops`):
- Installed via `pip install -e .` in `agent-harness/`
- Commands: `greenhouse-ops variety|crop-run|catalog|space|session`
- Wraps Supabase via Python client, reads creds from env or `.env.local`
