# B2B System — Operator's Guide

*Written for Caleb + Mario. Plain language. The technical blueprint lives in
`docs/b2b-data-core.md`; this is how you actually run it and what changes day to day.*

---

## 1. The big picture — one sentence

**The spring plan you already build IS the sales catalog** — the system turns every
variety × pot in the plan into a sellable item automatically, computes what's available
from the plan + real events (never typed by hand), and everything customer-facing
(hot lists, campaigns, reservations, the future portal) hangs off that.

```
YOU PLAN (Plans / Sourcing — same as always)
   │  automatic, every 15 minutes
   ▼
CATALOG (Sales → 📦 Catalog: 1 item per variety×pot, with a SKU forever)
   │  draft profiles track the plan · YOU publish when customer-ready
   ▼
AVAILABILITY (computed: released rounds + counts/losses − orders − reservations)
   │
   ├─ RESERVATIONS (volume customers hold stock; auto-reminded; auto-lapses back)
   ├─ HOT LISTS + CAMPAIGNS (push marketing to customers)
   └─ SUMMER: customer portal + pick sheet render this same data
```

---

## 2. What you do DIFFERENTLY (short list — most things: nothing)

**While spring planning — plan exactly as you always have.** Only two habits matter:

1. **Fill in `sale price` on plan items when you know it.** Draft profiles inherit it
   automatically. No price = the item can't be published or fill an assortment.
2. **Keep ship weeks honest.** Ship week = when a round becomes available to sell.
   If a round will really be ready week 17, say week 17 — availability timing,
   reservation take-by dates, and "coming soon" messaging all derive from it.

**New occasional habit:** glance at **Sales → 📦 Catalog**. It's the mirror — anything
you planned appears there within ~15 minutes with a SKU and a draft profile. If
something's missing or wrong there, the plan data needs a look (or tell Claude).

**What you should STOP doing:** building separate availability lists, sales
spreadsheets, or "what can we offer" documents. That's now a query, not a chore —
and hand-maintained copies will only drift from the truth.

---

## 3. How it affects the spring plan

- **The plan is the boss.** Nothing in the B2B layer ever writes back into your
  planning data. Quantities, weeks, benches — the plan owns them.
- **Every planning edit flows forward automatically:** new variety → new catalog item
  (SKU assigned, category/size guessed). New ship week → a new "round." Quantity or
  bench change → availability just reflects it. Deleted rows → quantities derive to zero.
- **Nothing is customer-visible until YOU publish it.** While a profile is a *draft*,
  its name/pack/price keep tracking the plan (safe to keep planning). The moment you
  **Publish** (in the Catalog), that profile *freezes* — plan tweaks stop touching what
  the customer sees, and changes become deliberate merchandising edits.
- **Availability is never typed.** It's computed from: released rounds + inventory
  events (counts, losses, receiving) − orders − active reservations. The only manual
  inputs are *facts*: a count, a loss with a reason, a ready-week correction.

---

## 4. The season, start to finish

| Phase | What happens | Who does what |
|---|---|---|
| **Now: planning** | Plan absorbs into the catalog automatically | Plan as usual; add prices as known |
| **Late planning** | Worksheet pass: tiers, popular pools, templates | You + Mario fill the 2 CSVs in `docs/`; one command imports them |
| **Pre-season** | Publish profiles (needs price; images/culture as available) | Publish from the Catalog, item by item or in batches |
| **Reservations open** | Volume customers place blanket orders | Sales → Reservations: create, add items. The system does the rest: reminds them near ready+grace, releases untaken stock automatically |
| **Season** | Orders draw down; counts/losses keep availability honest | Crew events (counts/losses) once the inventory flow starts; hot lists + campaigns push what's moving |
| **Season end** | Archive the plan | Its items read "ended" everywhere automatically |

---

## 5. "I want to…" quick reference

| I want to… | Go to |
|---|---|
| See everything sellable + the availability math | **Sales → 📦 Catalog** (click a row for the full ledger) |
| Publish/unpublish an item, set its tier | Catalog → expand the row |
| Set up a blanket order for a big customer | **Sales → Reservations → ＋ New** |
| Release / extend / reassign / hand-nudge reserved stock | Reservations → expand the order |
| See everything about one customer, leave notes, recommend items | **Sales → Customer Profiles** |
| Email a blast or schedule one | **Sales → 📣 Campaigns** (Contacts tab = Mailchimp import) |
| Text customers a photo lookbook / weekly picks | Trade Show / 🔥 Hot List (unchanged — and you see opens + ♥ picks) |
| Fix a wrong category/tier in bulk | The worksheets in `docs/` → `import_b2b_worksheets.js` |
| Check what's still missing (images, prices, tiers…) | `docs/b2b-gap-punch-list.csv` (regenerable) or the Catalog tiles |

---

## 6. Things that happen with NO ONE doing anything

- Plan changes absorbed into the catalog (every 15 min)
- Rounds release into availability when their week arrives
- Reservation customers auto-emailed as take-by approaches (once, business hours)
- Untaken reserved stock returns to open availability at take-by (silent, derived)
- Scheduled campaigns send within 15 min of their time
- Opens/clicks/bounces flow back per email; unsubscribes suppress themselves forever
- Customer ♥ picks and link-opens land in the Hot List hub and customer profiles

---

## 7. One-time setup still parked (10 minutes total, all on Caleb)

1. **Resend webhook** — resend.com/webhooks → endpoint `https://ops.hoosierboy.com/api/resend-webhook`
   → events: delivered, bounced, complained, opened, clicked → paste the `whsec_` secret
   into Vercel as `RESEND_WEBHOOK_SECRET`.
2. **Tracking toggles** — Resend → schlegelgreenhouse.com domain → Open tracking ON +
   Click tracking ON (until then, open/click % correctly read 0).
3. **Test send** — Campaigns → New → any template → *"Send a test to myself."*
4. **Worksheet session with Mario** — when planning settles, not before.

## 8. Rules the system enforces (so you don't have to remember them)

- One SKU per item, forever — rounds/groupings never split SKUs
- Speculation/grow-ahead records don't reduce availability until a customer is attached
- Order lines snapshot their price + which pricing rule fired (permanent audit)
- Trend signals only surface at ≥4 distinct customers — never traceable to one buyer
- Floor-code logins cannot see campaigns, contacts, or customer pricing
- A published profile can't be deleted out from under its item
