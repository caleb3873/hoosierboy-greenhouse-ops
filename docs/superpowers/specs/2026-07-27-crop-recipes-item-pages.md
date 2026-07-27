# Crop Recipes + Item Pages — the locked spec (2026-07-27)

Locked with Caleb after a full design week. The interactive mock is the visual spec
(artifact `634ecf52`, source `add-a-plant.html` in the session scratchpad); this doc is
the written contract. **Do not re-litigate these decisions — extend them.**

## North star

> "If I say I want a 4.5" petunia ready April 16th, all I want to decide is the variety.
> Sourcing, pricing, propagation timing, trays, tasks, where it's planted — all populate."

One door in (Sales vs Plan), one source of truth per fact, ripples captured everywhere
when decisions or conditions change (cancellations, weather, shorts).

## The layer model — every fact has exactly ONE owner

| Layer | Owns | Lives in |
|---|---|---|
| **Family recipe** (crop × size) | crop_weeks, pots_per_unit, ppp, overage_pct, finished container, bench rule, hold tolerance | `crop_recipes` |
| **Series spec** (within family) | form (URC/CALL/PLUG/SEED), rooting_weeks default, prop tray, **broker pin** | `crop_recipe_series` |
| **Variety override** | any spec field, only when it genuinely differs | `crop_recipe_overrides` (by variety_key) |
| **Season instance** (plan) | planned qty, groups, ready weeks, benches, tasks, PO refs, photos, season notes | `scheduled_crops` + `plan_targets` (plan_id = the season) |
| **Reference** (read-only) | culture facts, dims, broker quotes | culture DB, `broker_prices` |

Derivation chain (never stored twice): `ready − crop_weeks = plant` · `plant − rooting = ship/arrive`
(ship = arrival = stick week for URC/CALL — ONE concept; order date is a stamped date, not a scheduled week).

## Locked rules (each learned/confirmed against real data this session)

1. **Recipe hierarchy is family → series → variety.** Series differ materially
   (Lantana: EHR lines come callused, Ball lines URC-only).
2. **One material, one broker** — first order of a material in a season pins its broker
   (`sourcing_pins`, series grain); later orders default/warn; override allowed but logged.
3. **Group numbers = finish order.** Auto-renumber on ready-date edits (like waves, W1 earliest).
4. **A color can run in multiple groups** — row in EVERY group it runs; production numbers
   per round; sales history is a VARIETY fact, allocated **FIFO** across rounds
   (grew 100+100, sold 183 ⇒ round1 100% sold-out, round2 83%).
5. **Consolidation is a decision layer, not data loss**: physiology (ideal stagger from
   rooting) / logistics (snap arrivals, e.g. all-in-week-49 = slowest rooter's week) /
   hold tolerance (seasonal ±wks referee) — stored separately, auditable.
6. **Plan is exact; orders round.** Plan never limited by 100-increments. A separate
   reconciliation page (later phase) resolves plan-vs-order diffs once per ordering
   window: dispositions = borrow-from-shoulder-week (judged by hold tolerance) /
   accept-short / bump (+cost shown). It becomes the SINGLE order-qty writer.
7. **Order referencing is early** (item-page phase): per-line PO chip
   ○ plan → ● sent → ✓ conf → ⚠ short, hover = PO#, ordered vs confirmed, ack PDF
   (order-confirmations bucket; reuse Fall Program Orders machinery).
8. **Recipe edits are heavyweight**: locked by default → unlock (visible editing state,
   live preview) → save with diff summary (+ "this family only, or everywhere?") → or
   full revert. Cascades to every color/group/task.
9. **Photos per item**: camera-first capture, auto-stamped date·time·who, own bucket
   (`item-photos`), per-photo **→B2B tag** gates flow into the sales catalog (marketing
   library keeps excluding untagged operational shots).
10. **Item page = a VIEW over the spine** — recipe + plan rows + targets + tasks. Never a
    second place to enter a fact. Opens from anywhere the item shows. Mono family page
    and combo page are the same engine (roster rows = colors vs components); a single-
    variety item is a family of one. Unit math is recipe-driven
    (flat-of-10: ppu 10 × ppp 1 · fiber planter: ppu 1 × ppp 3 · combo: BOM).
11. **Seasons**: item is durable, season is a lens (plan_id). Past = read-only actuals;
    next = "instantiate from recipe + last year" (the replay, formalized). Notes have two
    scopes: durable item notes vs season observations (🚩 surfaces once at instantiate).
12. **UI details locked**: collapse only via arrow+name; deletes always confirm (in-page
    box); duplicate group/combo inherits everything; roster sorted series→color, series
    small in parens; sell-through as color-coded bar/badge with history in hover;
    week inputs accept shorthand ("15" → 2715); Ship (arrive) is the column name.

## Build phases

0. Spec (this doc) + data fixes (phantom `Shamrock Passionfruit` merge; stale liner costs:
   $1.00 Dynamos, $0.342 Lysimachia vs live $0.104–0.122 quotes).
1. Recipe spine: series table + new columns; seed from observed Spring 2027 (dry-run →
   apply on Caleb's go). Spring only.
2. Item pages for real: ItemDrill → combo page; family page sibling; order chips; photos;
   recipe lock/save.
3. "Add a plant" door in Sales vs Plan (forward resolver) + demote/kill the other 13
   entry points (audit board in memory).
4. Ripple engine (recipe edits → recompute+flag; ack shorts → swap flow; date shifts).
5. Order reconciliation page.
Later: fall/winter recipes in their seasons; plug/seed chain shapes; Jamesbrittenia = the
first "new crop → create recipe once" walkthrough.

## Data bugs found by the mock (fix list)

- `Shamrock Passionfruit` phantom variety (fa21660d…) → merge into `Passionfruit` (6f83e2e6…).
- Stale liner costs: 5 Dynamo geraniums at $1.00 placeholder; Lysimachia Goldii at $0.342
  (live quotes $0.104–0.122).
- Bandana Black Cherry sold out wk19 in '26, absent from the '27 plan.
- Shamrock Rose Gold planned 2.6× what sold.
- Fiber-planter plan rows mix unit bases (some qty_pots = plants, some = pots) — reconcile
  before ordering (plan_quantity_columns hazard).
- Combo component ship-week stagger was flattened by the June apply (deliberate
  consolidation — but the physiology layer must be restored via recipes).
