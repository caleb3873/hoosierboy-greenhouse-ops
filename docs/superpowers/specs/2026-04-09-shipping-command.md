# Shipping Command Center Redesign

**Status:** DRAFT — pending review and buy-in from Tyler (Shipping Manager)
**Author:** Mario + Claude (brainstormed 2026-04-09)
**Target:** Replace Tyler's physical whiteboard with a shared, interactive command center used by Tyler, sales reps (Mario, Trish), and the four pull teams.

---

## Problem

Tyler runs shipping from a physical whiteboard at the Bluff location. It works for him locally, but:

1. **Two locations, no shared visibility.** Sprague and the sales office can't see the board. Every question becomes a phone call.
2. **Sales reps can't self-serve.** Mario and Trish want to add deliveries to the week but have to call Tyler for every slot.
3. **Multi-team pull state is invisible.** Most orders pull from 2+ teams (Bluff1, Bluff2, Sprague, Houseplants). No one except the team doing it knows if their portion is done.
4. **"Too late to add to this order?" is unanswerable** without calling Tyler and interrupting him.
5. **Customer advance confirmations get stale.** Orders booked months ahead aren't reconfirmed before pull day.
6. **COD, unconfirmed receiving, claims, signed invoices** — all tracked on paper, all lost eventually.
7. **Tyler is chained to his desk.** When he's not physically at Bluff, decisions stall.

The current `ShippingDashboard` is analytics-first (fuel, cost-per-mile, attendance). It's useful but it's not where Tyler lives. The calendar is where shipping actually happens.

## Goals

- **Make the calendar the command center.** Open = calendar. Everything else is secondary.
- **Tighten communication** between sales (Mario/Trish), shipping (Tyler), pull teams (Sam/Ryan/Evie/Rachel), and customers.
- **Let sales reps propose deliveries;** let Tyler confirm/move them.
- **Let teams pull independently** and check off their portion, with forced photo verification.
- **Surface customer-level flags** (COD, confirmation-required, notes) on every chip.
- **Work on Tyler's phone** with full parity — not a read-only view.
- **Give Tyler the "what's safe to pull?" answer at a glance** via confirmation dots and per-team pull state.

## Non-goals (this phase)

- Automated customer confirmation via email/SMS (Phase 2)
- Auto-import of fundraiser orders (Phase 2 — manual this year)
- AI analysis of pick sheet photos (Phase 2)
- Analytics redesign (fuel, cost-per-mile, attendance remain on a secondary tab)

---

## Personas & roles

| Person | Role | Primary surface |
|---|---|---|
| **Tyler** | Shipping Manager — owns the schedule | Desktop PlannerShell shipping tab + mobile via floor code `7846038` (same view, responsive) |
| **Mario, Trish** | Sales reps — propose deliveries, reconfirm customers | Desktop PlannerShell shipping tab (proposal form + calendar read) |
| **Sam** | Bluff Team 1 manager/shipper | Mobile floor code — "next up" kiosk, Bluff1 queue |
| **Ryan** | Bluff Team 2 manager/shipper | Mobile floor code — "next up" kiosk, Bluff2 queue |
| **Evie** | Sprague Team manager | Mobile floor code — "next up" kiosk, Sprague queue |
| **Rachel** | Houseplants Team manager | Mobile floor code — "next up" kiosk, Houseplants queue |
| **Drivers** | Existing DriverView — adds signed invoice photo on delivery | Mobile (existing) |

**Role migration:** split the current `shipping` floor-code role into:
- `shipping_manager` — routes to ShippingCommand (Tyler)
- `shipping_team` — routes to TeamPullView with a team discriminator (Sam/Ryan/Evie/Rachel)

Existing shipping floor codes get re-tagged. Tyler's code `7846038` becomes `shipping_manager`.

---

## Data model

### `deliveries` table additions

```sql
-- Lifecycle
status                    text not null default 'proposed'   -- 'proposed' | 'confirmed'
priority_order            int                                  -- per-day ordering override; nulls sort last
too_late_reason           text                                 -- set when Tyler skips a late change
date_locked               boolean not null default false       -- fundraisers etc.; Tyler cannot move

-- Three-confirmation model
sales_confirmed_at        timestamptz
sales_confirmed_by        text
customer_confirmed_at     timestamptz
customer_confirmed_by     text   -- sales rep who ticked the box
shipping_confirmed_at     timestamptz
shipping_confirmed_by     text   -- Tyler

-- Fan-out per-team pull flags
needs_bluff1              boolean not null default false
bluff1_pulled_at          timestamptz
bluff1_pulled_by          text

needs_bluff2              boolean not null default false
bluff2_pulled_at          timestamptz
bluff2_pulled_by          text

needs_sprague             boolean not null default false
sprague_pulled_at         timestamptz
sprague_pulled_by         text

needs_houseplants         boolean not null default false
houseplants_pulled_at     timestamptz
houseplants_pulled_by     text

-- Photo evidence (JSONB arrays of {team, page, storage_path, uploaded_at, uploaded_by})
pick_sheet_photos         jsonb not null default '[]'::jsonb
signed_invoice_photos     jsonb not null default '[]'::jsonb   -- driver uploads

-- Alerts / notes stream (JSONB array of {text, author, created_at, severity})
alerts                    jsonb not null default '[]'::jsonb
```

**Note on Bluff assignment:** no separate `bluff_team` field. Instead, setting `needs_bluff1 = true` routes it to Sam's queue, `needs_bluff2 = true` routes it to Ryan's. Tyler can set one, the other, or both (rare — a split pull). Default behavior when a sales rep adds a delivery: set `needs_bluff1 = true` as the fallback; Tyler reassigns to Bluff2 if needed.

### `customers` table additions (shipping customer record)

```sql
payment_terms                   text    -- 'COD' | 'Net 15' | 'Net 30' | 'Prepaid'
delivery_confirmation_required  boolean not null default false
shipping_notes                  text    -- free text, renders on every chip
```

### Customer reconfirmation auto-expiry

Not a schema change — a derived state. A helper in the UI:

```js
function customerConfirmationValid(delivery) {
  if (!delivery.customer_confirmed_at) return false;
  const deliveryDate = new Date(delivery.date);
  const confirmedAt = new Date(delivery.customer_confirmed_at);
  const daysUntilDelivery = (deliveryDate - Date.now()) / 86400000;
  const daysSinceConfirm = (Date.now() - confirmedAt) / 86400000;
  // If delivery is more than 14 days out, confirmation is valid.
  // If within 14 days, confirmation must be younger than 14 days.
  if (daysUntilDelivery > 14) return true;
  return daysSinceConfirm <= 14;
}
```

The "reconfirmation queue" for sales is just: `deliveries where status='confirmed' AND !customerConfirmationValid(d) AND date >= today`.

### Derived state: "too late"

```js
function tooLateToAdd(delivery) {
  if (delivery.too_late_reason) return true;              // Tyler said so
  if (delivery.loaded_at) return true;                    // on the truck
  // truck full check (optional v1)
  // if (truckCapacityUsed(delivery.truckId, delivery.date) >= 1) return true;
  return false;
}
```

### Derived state: "safe to pull" (what teams see in their queue)

A delivery is pullable for a team iff:
1. `status = 'confirmed'`
2. All three confirmation dots green (sales, customer-valid, shipping)
3. `needs_<team> = true`
4. `<team>_pulled_at IS NULL`
5. `date_locked` does not matter for pulling (locked dates still pull normally)

---

## Views

### 1. ShippingCommand (new) — Tyler's desktop + mobile

Replaces the current `ShippingDashboard` as the landing page for the shipping tab in PlannerShell, and is also what Tyler's `7846038` floor code routes to.

**Layout (desktop):**

```
┌─────────────────────────────────────────────────────────────┐
│ Shipping Command      Week of Apr 6-12   [Today] [<][>]    │
│ [⚠ 3 late changes]   [🟡 5 need reconfirmation]            │
├─────────────────────────────────────────────────────────────┤
│         Mon    Tue    Wed    Thu    Fri    Sat              │
│  AM   [chip] [chip] [chip] [chip]                           │
│       [chip]        [chip]                                  │
│  PM   [chip] [chip]        [chip]                           │
│                                                             │
│  (clicking a chip opens a detail drawer)                    │
└─────────────────────────────────────────────────────────────┘
```

**Chip anatomy:**

```
┌──────────────────────────────┐
│ Frank's Nursery       $4,240 │  ← name + value
│ 9:00 AM · 18 carts           │  ← time + capacity
│ 🟢 S  🟡 C  🟢 T              │  ← sales / customer / tyler confirmation dots
│ 🌱S✅ 🌱R — 🌿⬜ 🪴⬜          │  ← per-team pull icons
│ 💰 COD  ⚠ Unconfirmed        │  ← customer flags (conditional)
│ 🔔 Running behind (Tyler)    │  ← latest alert, if any
└──────────────────────────────┘
```

- **Proposed chips** have a dashed border and reduced opacity
- **Confirmed chips** have a solid border
- **date_locked** chips (fundraisers) show a 🔒 icon
- Drag chips between days (unless date_locked)
- Drag chips up/down within a day to set `priority_order`
- Right-click / long-press → "Bump to next" button that sets `priority_order = min - 1`

**Late-change review strip** (top of dashboard):
- Lists additions/changes made to deliveries after a team has started pulling, or after the truck is loaded
- Each row: delivery name, what changed, who requested it, [Approve] [Not worth it (reason)] buttons
- Small — this is the exception, not the norm

**Reconfirmation queue chip** (top of dashboard):
- Counts deliveries whose customer confirmation has expired
- Clicks open a list for sales reps to work through

**Detail drawer** (opens on chip click):
- Customer info + flags
- Confirmation dots with one-tap toggle buttons (Tyler can confirm shipping; sales can confirm customer; Mario/Trish initial-save confirms sales)
- Per-team pull checklist with timestamps + who pulled + photo gallery for each team
- Alerts timeline with "add alert" box
- Signed invoice photo gallery (from driver, when delivered)
- Claims history for this customer (link out)
- Order numbers, notes
- Buttons: [Move to another day] [Mark date_locked] [Cancel delivery]

**Mobile layout:**
- Calendar collapses to a single-day scrollable column
- Day picker pill at top
- Chips become full-width rows
- Reorder via long-press + ⬆⬇ buttons (not drag — too janky on touch)
- All actions available; the detail drawer becomes a full-screen sheet

### 2. Team "Next Up" view — Sam, Ryan, Evie, Rachel

Single-focus kiosk, no list:

```
┌─────────────────────────────────────┐
│ Bluff Team 1 — Sam      🚪 Sign out│
├─────────────────────────────────────┤
│                                     │
│  NEXT UP                            │
│  Frank's Nursery                    │
│  Thu 9:00 AM · 18 carts · $4,240    │
│                                     │
│  💰 COD — collect $4,240            │
│  📝 Loading dock in back            │
│                                     │
│  [✓ Mark Bluff1 done]               │
│  [⚠ Report problem]                 │
│                                     │
├─────────────────────────────────────┤
│  Today's Bluff 1 progress           │
│  ████████░░░░░░  8 of 14 pulled     │
│  $12,400 of $22,200 pulled          │
│  $9,800 remaining                   │
└─────────────────────────────────────┘
```

**Rules:**
- Shows only one delivery at a time — whichever is at the top of the team's queue
- Queue order: `priority_order ASC NULLS LAST, time ASC, created_at ASC`
- Teams cannot skip, reorder, or browse other teams' queues
- `[✓ Mark done]` opens a **pick sheet photo modal** (see below) — cannot complete without photos
- `[⚠ Report problem]` opens a small form (text + optional photo) → flags delivery for Tyler, advances to next order in queue. The flagged one returns to the top of the queue when Tyler resolves it.
- Once all deliveries are done: "All caught up ☀️ Waiting for Tyler to release the next batch."

**Pick sheet photo modal:**

```
┌──────────────────────────────┐
│ Upload pick sheet pages      │
│                              │
│ [ + Take photo ]             │
│ [page 1 thumbnail] [×]       │
│ [page 2 thumbnail] [×]       │
│                              │
│ At least 1 page required     │
│ [Cancel] [Submit & mark done]│
└──────────────────────────────┘
```

Photos upload to Supabase storage bucket `pick-sheet-photos`, path `{delivery_id}/{team}/{timestamp}-{n}.jpg`. Entries push into `deliveries.pick_sheet_photos` JSONB.

### 3. Sales rep delivery proposal form

Lives in PlannerShell shipping tab for admin users (Mario, Trish are admins, not floor codes).

- Form mirrors current `ShippingSchedule` form
- New field: "Which teams pull?" — multi-checkbox (Bluff1 / Bluff2 / Sprague / Houseplants)
- Creates deliveries with `status = 'proposed'` and `sales_confirmed_at = now()` (sales confirming their own input)
- Shows a mini-calendar preview of the target week so they can see density before submitting
- After save: chip appears on Tyler's calendar with a dashed border until Tyler taps "Confirm"

### 4. Reconfirmation queue view

A tab/panel accessible to sales reps from the shipping area.
- Lists all `status='confirmed'` deliveries where `customerConfirmationValid()` is false and `date >= today`
- Each row has a "📞 Called — reconfirmed" button that sets `customer_confirmed_at = now()` and stamps the caller's name
- Bulk filter: "next 14 days", "this week"

---

## Flows

### Flow A: Routine delivery scheduled 3 weeks out

1. Mario adds delivery via proposal form → `proposed`, sales ✅, customer 🟡, shipping 🟡
2. Tyler reviews on dashboard, taps Confirm → `confirmed`, shipping ✅
3. Mario calls customer, reconfirms receiving → customer ✅
4. 12 days before delivery: customer dot auto-flips to 🟡 (2-week window kicks in)
5. Delivery appears in the reconfirmation queue
6. Mario calls again, ticks "reconfirmed" → customer ✅
7. Pull day: delivery shows up in Sam's queue (Bluff1) and Evie's queue (Sprague)
8. Evie finishes first, taps done, uploads 2 photos of her pick sheet
9. Sam finishes, taps done, uploads 3 photos
10. Tyler sees both green on the chip → assigns truck/driver → driver takes it

### Flow B: Last-second addition day-of

1. Trish gets a call — customer wants to add 4 trays of geraniums to today's delivery
2. Trish opens the delivery detail drawer, clicks "Add to order" → adds line items
3. System checks: Sprague already pulled (timestamp set) → flags as late change
4. Late change appears in Tyler's review strip: "Frank's Nursery — +4 trays geraniums — Trish"
5. Tyler decides:
   - **Approve** → delivery flips Sprague back to un-pulled, lands at top of Evie's queue with 🆕 badge, alert posted on the chip
   - **Not worth it** → Tyler enters reason ("loaded already, catch Friday"), system logs reason on delivery, Trish sees notification

### Flow C: Fundraiser delivery running behind

1. Manually entered fundraiser delivery exists on Saturday, `date_locked = true`
2. Tyler realizes Saturday is overloaded; it'll run ~2 hours behind
3. Tyler opens detail drawer, types into alerts box: "Running ~2 hours behind — weather + volume"
4. Alert renders as a red banner on the chip
5. Mario sees the banner from the sales office, calls the fundraiser contact to warn them
6. No one had to phone Tyler

### Flow D: Shipper reports a problem

1. Sam's "next up" is Frank's Nursery. He can't find 3 flats of petunias.
2. Sam taps "⚠ Report problem", types "Missing 3 flats pink petunias", optional photo
3. System flags the delivery for Tyler, advances Sam to the next order
4. Tyler sees the flag, investigates, finds the petunias on another table, taps "Resolved"
5. Frank's returns to the top of Sam's queue with a 🆕 badge

---

## Phases

### Phase 1 (this season) — scope of this spec

- Data model changes (migrations)
- Role split: `shipping_manager` vs `shipping_team`
- **ShippingCommand** view (desktop + responsive mobile)
  - Calendar-first layout
  - Chip anatomy with confirmation dots, team icons, customer flags, alerts
  - Proposed vs confirmed styling
  - Drag-to-reorder priority, drag between days
  - Detail drawer with all fields
  - Late-change review strip
  - Reconfirmation queue chip
- **Team "Next Up" view** × 4 with:
  - Single-focus layout
  - Progress bar (count + dollars)
  - Pick sheet photo modal (required to mark done)
  - Report problem flow
- **Sales rep proposal form** updates (multi-team checkbox, creates proposed deliveries)
- **Reconfirmation queue** list
- **Customer flag fields** (payment_terms, delivery_confirmation_required, shipping_notes)
- **Pick sheet photo storage** bucket + upload wiring
- **Signed invoice photo** — add to existing DriverView on "Delivered" button
- **Claims surfacing** — show a "history: 2 claims in 6mo" badge on the chip for repeat claim customers
- Manual fundraiser entry with `date_locked` toggle

### Phase 2 (later, post-season)

- Automated customer reconfirmation via email/SMS (click-to-confirm link, webhook flips flag)
- Fundraiser app auto-import → creates deliveries with `date_locked = true`
- Optional: AI photo analysis of pick sheets (OCR, cross-check against order lines)
- Truck capacity warnings (visual fill meter on day cells)
- Analytics redesign for fuel/cost-per-mile/attendance

---

## Open questions / Tyler review points

These are the things to walk Tyler through and get feedback on before building:

1. **Does the calendar-first layout match how he thinks about the board?** (Week grid with AM/PM rows, or something else?)
2. **Proposed vs confirmed split** — is this the right control point, or does he want finer granularity?
3. **"Late change review strip"** — does he want those as interruptions in a strip, or a separate inbox page?
4. **Team queue default ordering** — earliest delivery time first, right? Or some other default he uses on the whiteboard today?
5. **Pick sheet photos** — does he actually want to review these regularly, or is it just insurance? Affects how prominent the gallery is.
6. **"Not worth it" button** — what reasons does he typically give? Should those be a dropdown + free text, or free text only?
7. **Customer confirmation window** — is 14 days the right default or different?
8. **Bluff1 vs Bluff2 assignment** — does he want Tyler to assign upfront, or let the two teams self-balance by claiming from a shared pool? (Current spec: explicit assignment via `needs_bluff1` / `needs_bluff2`.)
9. **Alerts** — who else can post alerts? Drivers (from the road)? Shippers (if they break something)?
10. **Does he want any read-only view of the whiteboard itself** (a wall display mode for monitors in the office)?

---

## Success criteria

- Sales reps stop phoning Tyler for routine scheduling
- Every team member knows what they're pulling next without asking
- Tyler can run the schedule from his phone during lunch, from home, from the other location
- Claims can be resolved in 30 seconds by pulling up the pick sheet photo
- Customer no-shows drop because reconfirmations are tracked automatically
- Tyler uses the system every day instead of the whiteboard (biggest tell)
