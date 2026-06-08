# Houseplant Planning — How It Works

## Purpose
For each season, decide **which houseplants to grow/buy, how many, and at what price** — backed by
years of real sales data — then turn those decisions into **ready-to-send buy requests** to brokers.
Two jobs in one tool: **decide the plan → order against it.**

Find it under **Production → 📊 Plans → (a "Houseplants …" plan)**. Houseplant planners
(Amanda / Kim / Rachel) land here on login.

## The data behind it
- **Sales History** (`houseplant_sales_history`, ~10k records) — every houseplant sold: variety, pot
  size, month, quantity, dollars. The evidence.
- **The Catalog** (`houseplant_catalog`) — your *plan*: per variety + pot size, a **target quantity**,
  **target price**, a **status**, plus sourcing info (broker, acquisition type, notes). The decision.

## The 6 tabs

### 🛒 Catalog — build the plan (the heart of it)
One row per variety + pot size. Each row shows per-year sales, a multi-year **average**, a
**projected** number (average × projection %), and two editable boxes: **🎯 target qty** and
**🎯 target $/ea** for the planning year.
- Type targets yourself, or click **"Apply to unset items"** to auto-fill from each item's average,
  then adjust.
- Set **status → "locked"** on the varieties you're committing to. Mark losers **"cancelled."**
- **Views:** All · Recommended · Top sellers · Growers · Decliners · New · Missing · Skipped.
- **Search** + **size filter**; rows are **shaded green by price** so tiers are scannable; sizes sort
  smallest→largest.
- Click a **variety name** → detail card: notes, **Broker** (dropdown from the shared broker list),
  supplier prefs, **Duplicate** (copies pricing/qty into a renamed "(copy)" item — starts as
  *considered*), and Delete.
- **+ Create new item** for trial varieties with no sales history.
- **🔗 merge** combines duplicate entries; **🗑 Remove empty** purges items with no sales/target.
- The pot-size **roll-up** at the top totals qty + revenue + projection by size.

### 📊 Insights
Year-over-year charts from the same sales data.

### 🎬 Presentation
A slide-by-slide walkthrough of each year (top items, top sizes) for planning meetings.

### 📈 Sales History
The raw monthly sales numbers.

### ✓ Tasks
Planning to-dos for this plan.

### 🚚 Sourcing — turn the plan into orders
Shows **only locked items**, grouped by how they come in (**Finished / Liner / Propagate / Partner**),
and generates **copy-paste broker request emails**. Tag each item's broker + acquisition type, then
generate the request. (Items that aren't locked don't appear here.)

## The core workflow
1. **Open the Catalog** and look at what sold the last few years.
2. **Set targets** — type a qty/price, or "Apply to unset items" to fill from averages, then adjust.
3. **Lock** the varieties you're committing to (status → locked); mark losers "cancelled."
4. **Go to Sourcing** — locked items are waiting; tag each one's broker + acquisition type.
5. **Generate the broker request** and send it.

## Key terms
- **Projection %** — one global knob. `projected qty = N-year average × (1 + projection %)`. A
  suggestion only; whatever you type as a target wins.
- **considered / locked / cancelled** — *considered* = still deciding; *locked* = committed (the gate
  that sends an item to Sourcing); *cancelled* = excluded from totals.
- **Avg base (N years)** — how many recent years the average uses.
- **Acquisition type** — *Finished* (buy sale-ready), *Liner* (grow from a young plant we receive),
  *Propagate* (in-house), *Partner* (outsourced). Drives how the Sourcing request is written.

## Tips
- The **projected** number appears for every item with sales history, even ones you haven't set a
  target for — it's a suggestion, not a commitment. Only **locked** items reach Sourcing.
- Searching/filtering reorders the table; your typed targets stay attached to their own variety.
- Brokers come from the shared **broker list** (same one Receiving uses), so contacts stay in sync.
