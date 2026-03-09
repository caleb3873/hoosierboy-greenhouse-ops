# Hoosier Boy Greenhouse Ops

Production planning and floor operations tool for Schlegel Greenhouse.

---

## Setup (one-time)

### 1. GitHub
1. Create account at github.com
2. Create a new repository called `hoosierboy-greenhouse-ops`
3. Upload all files from this folder into the repo

### 2. Supabase (database)
1. Create account at supabase.com (sign in with GitHub)
2. Click "New Project" — name it `hoosierboy-ops`
3. Go to SQL Editor → New Query
4. Paste the contents of `supabase-schema.sql` and click Run
5. Go to Settings → API
6. Copy "Project URL" and "anon public" key

### 3. Vercel (hosting)
1. Create account at vercel.com (sign in with GitHub)
2. Click "Add New Project" → Import your GitHub repo
3. Add Environment Variables:
   - `REACT_APP_SUPABASE_URL` = your Supabase Project URL
   - `REACT_APP_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click Deploy
5. Your app will be live at `hoosierboy-greenhouse-ops.vercel.app`

### 4. Custom domain (optional, ~$12/yr)
- Buy `ops.hoosierboy.com` at namecheap.com or Google Domains
- Add it in Vercel under your project → Settings → Domains

---

## Updating the app

1. Describe the change to Claude
2. Claude provides updated file(s)
3. Go to your GitHub repo → find the file → click the pencil icon to edit
4. Paste the new content → click "Commit changes"
5. Vercel auto-deploys within ~60 seconds

---

## App structure

```
src/
  App.jsx                 — Mode picker + navigation shell
  lib/
    shared.js             — Constants, helpers, Supabase client, Google Calendar
  components/
    PlannerHome.jsx       — Dashboard with alerts + upcoming milestones
    CropPlanning.jsx      — Crop run management (full planner module)
    YoungPlantOrders.jsx  — Order generation by broker
    SpaceManagement.jsx   — House and bench assignment
    Libraries.jsx         — Variety, container, spacing libraries
    OperatorView.jsx      — Mobile floor view (tasks, ready, crops, flags)
```

---

## Google Calendar integration

The app generates Google Calendar links for every crop run milestone
(propagation, transplant, move outside, ready to ship). Clicking "+ Cal"
on any milestone opens Google Calendar pre-filled with the event details.

No API key or Google account setup required — it uses the standard
`calendar.google.com/render` URL format.

Full Google Calendar API integration (for push notifications and shared
team calendars) can be added later through Google Cloud Console.

---

## Modules built

- [x] Crop Planning — full production scheduling with sourcing tab
- [x] Young Plant Orders — PO generation by broker, CSV export
- [x] Space Management — greenhouse and pad layout
- [x] Variety Library — cultural data, breeder links
- [x] Container Library — sizes, costs, suppliers
- [x] Spacing Library — stage-based spacing profiles
- [x] Operator View — mobile floor interface
- [x] Planner Home — dashboard with Google Calendar integration
- [ ] Supabase data layer — connect all modules to shared database
- [ ] Google Calendar API — push notifications to team calendars
- [ ] User roles — planner vs operator permissions
