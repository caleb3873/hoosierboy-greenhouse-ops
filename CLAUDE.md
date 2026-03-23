# Hoosier Boy Greenhouse Ops

Production planning app for Schlegel Greenhouse (Indianapolis). React CRA + Supabase + Vercel.

## Commands

- `npm start` — dev server
- `npm run build` — production build (run after every change to verify)
- `npm test` — test runner

## Tech Stack

- React 18 (CRA via react-scripts 5.0.1)
- Supabase JS v2 (`@supabase/supabase-js`)
- Vercel (hosting + serverless functions)
- No router — state-based SPA with role-based views in `src/App.jsx`

## Environment Variables

Required in `.env.local`:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `REACT_APP_GOOGLE_CSE_KEY` (optional — image search)
- `REACT_APP_GOOGLE_CSE_CX` (optional — image search)

## Project Structure

- `src/App.jsx` — root component, nav shell, role-based rendering (admin/operator/grower)
- `src/Auth.jsx` — auth context, login screen, password reset, user menu
- `src/supabase.js` — Supabase client, `useTable()` generic CRUD hook, auth helpers
- `src/*.jsx` — one file per page/feature (CropPlanning, Libraries, SpaceManagement, etc.)
- `src/combo/` — combo designer sub-module
- `api/extract-catalog.js` — Vercel serverless function (Claude Vision PDF extraction)
- `scripts/import_catalog.py` — local Python PDF import script
- `supabase-schema.sql` — full database schema
- `docs/superpowers/specs/` — design specs
- `docs/superpowers/plans/` — implementation plans

## Code Conventions

- **Inline styles** — no CSS files, all styling via `style={{}}` objects
- **Design palette**: dark green `#1e2d1a`, light green `#7fb069`, cream `#c8e6b8`, muted `#7a8c74`
- **Fonts**: DM Sans (body), DM Serif Display (headings) — loaded via Google Fonts link in components
- **No linter/formatter config** — uses CRA defaults
- **camelCase in JS, snake_case in DB** — `useTable()` hook auto-converts via `toCamel()`/`toSnake()` in supabase.js
- **One component per file** — large self-contained pages, no shared component library
- **No TypeScript** — plain JSX

## Data Layer

All CRUD goes through `useTable(tableName)` from `src/supabase.js`:
```js
const { rows, loading, insert, update, remove, upsert, refresh } = useTable("crop_runs");
```
- Auto-subscribes to Supabase realtime
- Falls back to localStorage when offline
- Returns camelCase objects

## Auth

Hybrid system in `src/Auth.jsx`:
- **Managers**: Supabase email/password → `role: "admin"`
- **Floor operators**: hardcoded codes or `grower_profiles` table → `role: "operator" | "grower"`
- Floor sessions stored in localStorage with 12-hour expiry
- `AuthContext` provides: `user, role, isAdmin, isOperator, isGrower, signIn, signOut, signInWithCode`

## Git

- **Active branch**: `feature/grower-ops-tier1`
- **Git config**: user.name "Caleb Schlegel", user.email "caleb@schlegelgreenhouse.com"
- Always commit with descriptive messages, never amend shared commits

## CLI Harness

`agent-harness/` contains a CLI-Anything harness (`cli-anything-greenhouse-ops`):
- Installed via `pip install -e .` in `agent-harness/`
- Commands: `greenhouse-ops variety|crop-run|catalog|space|session`
- Wraps Supabase via Python client, reads creds from env or `.env.local`
