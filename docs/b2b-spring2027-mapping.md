# Spring 2027 → B2B Data Core: Field-by-Field Mapping

How every field of the existing Spring 2027 production data maps into the new schema.
Companion artifacts: `docs/b2b-data-core.md` (design + derivation rules) and
`docs/b2b-gap-punch-list.csv` (item-by-item gaps — regenerate anytime; it is derived, not maintained).

## Grain

| Source | Rows | Target | Rows |
|---|---|---|---|
| `production_plans` (Spring 2027) | 1 | unchanged — plan container | 1 |
| `scheduled_crops` (bench rows) | 3,320 | unchanged grain + `production_item_id` link | 3,320 (0 unlinked) |
| — non-component rows grouped by variety × container | 1,647 | **`production_items`** | **1,010** (831 straight, 179 combo) |
| — distinct (item, ship_week) | | **`production_item_groups`** ("rounds") | 1,249 |
| — 1:1 per item | | **`product_profiles`** (all `draft`) | 1,010 |

## `scheduled_crops` → new schema

| Source field | Maps to | Notes |
|---|---|---|
| `plan_id` | `production_items.plan_id` | grouping key |
| `variety_id` | `production_items.variety_id` | grouping key; culture reachable via `variety_library` |
| `container_id` | `production_items.container_id` | grouping key; `size_category` via `size_category_map` |
| `color` | *(not mapped)* | adds nothing to the grain (1,269 groups with or without it) |
| `qty_pots` | **derived** `planned`/`released` in `v_item_availability` | the sellable unit (pot OR flat — see `pack_size`) |
| `ship_week`/`ship_year` | `production_item_groups` key → ready date | the release schedule; overridable per group |
| `plant_week`/`plant_year` | stays production-side | not customer-facing |
| `is_combo_component` / `combo_parent_id` | component rows link to the **parent's** item | components are not sellable |
| `item_name` | seeded `product_profiles.display_name` (mode per item) | 100% coverage |
| `pack_size` | seeded `product_profiles.pack_size` → **`price_unit`** | numeric: 1 → `pot`; 10 → `flat of 10` (563 items); 6 → `flat of 6` (63) |
| `sale_price_per_pot` | seeded `product_profiles.price` (mode per item) | price of the PACK unit, not the plant; 101 items missing |
| `bench_id` | `v_item_locations` / `v_item_location_qty` | one item → many benches; bench codes encode walk order |
| `group_number` | *(empty on S27)* | when used intentionally, becomes the group key — no schema change |
| `ppp`, `plants_per_unit` | stays production-side | unit conversions for sales-vs-plan analysis |
| `qty_plants_ordered/confirmed`, `broker`, `supplier`, `liner_unit_cost`, `prop_method`, `prop_tray_size`, `soil_mix_id`, `watering_method`, `planting_layout`, `origin`, notes fields | stay production-side | internal; never surface on profiles |

## Other sources

| Source | Maps to | Notes |
|---|---|---|
| `sales_sku_map.sku` | `production_items.legacy_sku` + adopted as `sku` | **818 of 1,010 adopted**; 192 generated `S27-nnnn` |
| `variety_library` culture fields (`care_profile`, `culture_guide_url`, …) | read via item → variety join; `product_profiles.culture_override` for voice only | only 16 straight items covered — see punch list; `culture_guides_public` (cross-project, ~3.2k rows) is the designated backfill source |
| `variety_library.crop_name` | `category_map` → `product_profiles.category` | 786 seeded; combos = `combos`; 224 unmapped |
| `containers` | `size_category_map` → `product_profiles.size_category` | 883 seeded; 127 unmapped |
| `shipping_customers` | THE customer entity (`customer_orders.customer_id`, `price_level_id`) | 718 rows reused |
| `receiving_lines` | `inventory_events` kind `receiving` via `receiving_line_id` | expected/received/claims already captured there; events add survival + item link |
| `crop_pricing` / Pricing-tab price sets | seed source only | profile owns customer price (approved decision) |

## Known nuances (decided or flagged)

- **Price is per pack unit**: a "4.5″ Marigold" price is a flat-of-10 price. `price_unit` now says so explicitly.
- **11 mixed combo groups** (same variety × container both standalone and combo parent) are classified `combo`; flagged `mixed_combo_review` in the punch list for human classification.
- **Tier** (value/standard/premium) has no source anywhere in existing data — 100% on the punch list; it is required for tier posture, so it's part of the Caleb+Mario worksheet pass along with templates and pools.
- **Images** have no source field anywhere in the schema — a content campaign, not a data cleanup.

## Gap punch list — headline (item detail in `docs/b2b-gap-punch-list.csv`)

| Gap | Items affected (of 1,010) | Fix path |
|---|---|---|
| Image | **1,010** | photo campaign (trade-show/variety photos are partial raw material) |
| Tier | **1,010** | worksheet pass (with templates/pools) |
| Culture | **815** straights | backfill from `culture_guides_public`, then variety_library editing |
| Category unmapped | 224 | extend `category_map` (editable data) |
| Size unmapped | 127 | extend `size_category_map` (editable data) |
| Price | 101 | pricing pass on profiles |
| Mixed combo review | 11 | human classification |

CSV is sorted worst-first (gap count, then planned quantity) so the highest-impact items are on top.
Regeneration: the list is fully derived from live data — rerun the generator after any backfill to
watch the counts drop.
