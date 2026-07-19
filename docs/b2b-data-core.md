# B2B Data Core

The schema spine for the wholesale platform: production ties into a B2B sales system, with
ops.hoosierboy.com writing production facts and every customer surface (hoosierboy.com retail,
the future B2B portal) reading **views only**. One database, role-separated reads. No customer
surface ever writes production data; no production field is ever polluted with merchandising.

## Entities

```
production_plans ──< scheduled_crops (bench rows — operational detail, untouched grain)
        │                  │ production_item_id
        │                  ▼
        └────────< production_items  (the sellable grain: variety × container per plan; 1 SKU forever)
                        │ 1:1              │──< production_item_groups   (rounds, keyed by ship week)
                        ▼                  │──< production_item_adjustments (shrink/dump/recount FACTS)
                  product_profiles         └──— v_item_availability / v_item_locations (derived)
                  (customer-facing)
                        │──< product_price_breaks
                        │──< hot_list_items >── hot_lists (draft → pushed; broadcast v1)
                        └──< customer_order_lines >── customer_orders >── customer_order_events
                                                            │
shipping_customers (the customer entity) ───────────────────┘
   │ price_level_id → price_levels
   └──< customer_item_prices
```

Spring 2027 backfilled: **1,010 items** (179 combos), **1,249 groups**, 1,010 draft profiles,
all 3,320 bench rows linked, 818 SKUs adopted from `sales_sku_map` (rest generated `S27-nnnn`).

## The availability rule (derived, never typed)

`v_item_availability`, per production item:

```
released     = Σ group qty where the group's ready date ≤ today
               (group ready = its ship week, or ready_week_override — the "release" lever,
                a floor-corrected production fact)
adjustments  = Σ production_item_adjustments.qty_delta   (reason required)
committed    = Σ line qty on orders in placed | confirmed | picking   (type='customer' only —
               speculation orders do NOT reserve until converted)
shipped      = Σ coalesce(qty_pulled, qty) on orders in shipped | invoiced | closed
               (actual pulled quantities feed back)

sellable_now = released + adjustments − committed − shipped

status: hidden       profile not published (or missing)
        ended        plan archived
        coming_soon  nothing released yet, a round is ahead (its week is shown)
        more_coming  sold through what's released, another round is growing
        sold_out     nothing left, nothing coming
        low          sellable ≤ max(low_floor_abs, low_floor_pct × planned)
        available    otherwise
```

Floors and windows live in `b2b_settings` (`low_floor_abs`=10, `low_floor_pct`=0.15).
**There is no availability column anywhere.** The only manual inputs are production facts:
an adjustment with a reason, or a group's ready-week correction from the floor.

## Pricing resolution (`resolve_unit_price(customer, profile, qty)`)

Most specific wins; the result (+ which rule fired) is snapshotted onto the order line:

1. `customer_item_prices` — contract price, net. Primary vehicle for high-volume customers;
   seed from their last season's actual prices (`source_season` records provenance).
2. `level_item_prices` — the customer's level, per item, net.
3. `product_price_breaks` — per-item quantity breaks (absolute $).
4. `global_price_breaks` — catalog-wide quantity breaks (% off the level-adjusted list).
5. List: `product_profiles.price`, minus the level's `default_pct_off` when set.

## Order state machine

`draft → placed → confirmed → picking → shipped → invoiced → closed`; `cancelled` from any
pre-shipped state. Every transition appends to `customer_order_events` — customer-facing
tracking later is just a read of events. `type='speculation'` = grow-ahead order with no
customer; converts by attaching a customer and placing. `hot_list_id` on the order records
ordered-from-list provenance.

## Trend signal (confidentiality constraint, not style)

`v_item_trends`: rolling-window aggregates per item. No customer identifier is selected into
the view; rows surface only when `distinct_customers ≥ trend_min_customers` (`b2b_settings`,
default 4). Buyers may be competitors — a signal must never be reverse-engineerable to one buyer.

## Pick-sheet hooks (schema only)

`v_item_locations` (item → bench codes; bench codes already encode walking order, so route
sequencing is an ORDER BY later). Lines carry `picked_state`, `qty_pulled`, `picked_at/by` —
confirm-per-line doubles as free pull-rate labor data.

## Deliberately deferred

Portal/retail UI, auth and the restricted read-only role for customer surfaces, personalization
(`hot_lists.audience` is the hook), order-total discounts, activity/material requirements
cascade, EDI. The 11 items mixing combo-parent and standalone rows are flagged in the gap
punch list for human classification.
