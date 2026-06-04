# Spring Plan — Mobile Prompt (replay last year)

Build the Spring production plan by **talking it through in the Claude app** (desktop or
phone — same account syncs the conversation across both). You replay last year crop-by-crop
and adjust; Claude captures decisions as JSON you copy into a note.

## How to use it

1. Export last year's plan: from the `xlsx`, the **MASTER LIST** tab as CSV
   (a clean copy lives on the Mac at `~/Desktop/MASTER LIST 2026 SPRING.csv`).
   Get that CSV onto the device you're using (AirDrop to phone, or it's already on the Mac).
2. In the Claude app, start a chat → **attach the CSV** → paste the prompt block below.
3. Say a crop ("pansies"). Claude shows last year's lineup for it (grouped by house, with
   the round it's in), you adjust, it logs the result into the plan JSON.
4. **Save points:** each time it prints the JSON, copy that block into a phone note — backup
   in case the conversation trails off. (Within one synced conversation you don't need to
   re-paste the prompt; only a brand-new chat needs it pasted again, plus the CSV re-attached.)
5. Back on the Mac, paste the final JSON to Claude Code and say **"apply the spring plan JSON"** —
   it maps to Supabase with a dry-run + confirmation first.

## The prompt (copy everything in this block)

```
You're helping me build Schlegel Greenhouse's SPRING 2027 production plan on my phone by replaying last year and adjusting. I've attached last year's plan as a CSV (the MASTER LIST). Keep replies SHORT — ONE focused question at a time, no long dumps. You can't access a repo; hold the plan JSON in this chat.

Read the attached CSV first. It's one row per BENCH × COMPONENT (a combo pot = several component rows under one ITEM NAME). Columns:
- BENCH NO, HOUSE = location (houses: WS, BM, SM, Q03, Q05…).
- SHIP = week material ARRIVES; PLANT WEEK = week it's PLANTED. Both YYWW (2607 = 2026 wk7; 2551 = 2025 wk51).
- POT SIZE = container/pack code (1801L, 4IN, 6IN, 10HB, 13FANCY…).
- TYPE = crop, BUT it's blank on pansy rows — so to find a crop, match across TYPE, ITEM NAME, and COMPONENT NAME (case-insensitive contains).
- ITEM NAME = sellable item; COMPONENT NAME = the variety/plug going in; FORM = input (PLUG 288, URC, BULB, SEED).
- ORDER QTY = total PLANTS for that variety. ITEM QUANTITY = what we SELL (units/flats). ORDER QTY = ITEM QUANTITY × PLANTS PER POT.
- TOTAL POTS TO FILL = pots to fill; on a combo it's only on ONE component row (don't double-count).
- SUPPLIER = grower/source; BROKER = one of: Ball Seed (Jason Adams), EHR (David Jones), Express Seed (Sarah Gibbs), Foremost (Alice Tomasello), Messick, Stock, Yecaflora, Schlegel, Garden World, Eason.

TWO HARD RULES:
1. HOUSE CAPACITY IS FIXED. Each house's total pots last year = its capacity; the new plan can't go over OR under that per house. Adjustments are ZERO-SUM within a house — if I grow more of one thing, something else in that house must come down. Keep a running pots total per house and warn me if a change pushes a house off its last-year total.
2. SPACE TURNS OVER TWICE (succession). Round 1 = cool/early material incl. PANSIES, planted late (PLANT WEEK in the 25xx range up to ~wk12), sells/moves outside by end of March (~wk 12–13). Round 2 = warm material planted wk 13+ reusing that freed space. Infer round from PLANT WEEK: before ~wk13 (incl. late prior-year weeks) = round 1; wk13+ = round 2. Remind me that pansy/round-1 space flips to round-2 after March.

HOW WE WORK, crop by crop:
- When I name a crop (e.g. "pansies"), pull last year's lineup: per line show COMPONENT NAME (variety) · POT SIZE · ORDER QTY (plants) · ITEM QUANTITY (units) · SALES PRICE · SUPPLIER/BROKER · HOUSE · PLANT/SHIP week. Group by house. Show the crop's total plants + units and which round it's in.
- Then ask what to change. Default = same as last year. I'll say keep/adjust per variety.
- Capture confirmed decisions into the plan JSON.

PLAN JSON — EMERGENT SCHEMA, build as we go:
- Seed: { "plan": {"name":"Spring 2027","season":"spring","year":2027,"notes":""}, "field_log": [], "house_capacity": {}, "items": [] }
- Each item: { "crop":"", "variety":"", "pot_size":"", "house":"", "round":1, "order_qty":0, "item_qty":0, "sales_price":null, "supplier":"", "broker":"", "plant_week":"", "ship_week":"" }. Add a new field ONLY when a decision needs it; when you do, log it once in field_log, backfill earlier items as null, and tell me in one line.
- Track running pots per house in house_capacity (last-year total = the cap).

SAVE POINTS (this chat has no memory of its own):
- After each crop (or ~10 items): print the COMPLETE updated JSON in a code block, tell me "copy this into your note," and show a running total (plants + units, and pots vs cap for each house touched).
- When I say done, print the final complete JSON.

Start by reading the CSV, then ask which crop to begin with (I'll say pansies).
```

## Column reference (from the MASTER LIST)

| Column | Meaning |
|---|---|
| BENCH NO / HOUSE | physical location |
| SHIP / PLANT WEEK | arrival week / planting week, both YYWW |
| POT SIZE | container/pack code |
| TYPE | crop (blank on pansy rows — match name columns too) |
| ITEM NAME / COMPONENT NAME | sellable item / variety going in |
| FORM | PLUG/URC/BULB/SEED |
| ORDER QTY | total plants for the variety (= ITEM QTY × PLANTS PER POT) |
| ITEM QUANTITY | what we sell — units/flats |
| TOTAL POTS TO FILL | pots to fill (one component row per combo) |
| SUPPLIER / BROKER | grower source / broker |

## Back at the Mac
Paste the final JSON to Claude Code and say **"apply the spring plan JSON."** It reads `field_log`,
maps fields to `production_plans` / scheduled crops, shows a dry-run, and writes only after you confirm.
Remember the capacity rule (per-house totals are fixed) and round-1→round-2 succession when applying.
