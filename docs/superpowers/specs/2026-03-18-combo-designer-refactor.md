# ComboDesigner Refactor — Design Spec

## Goal

Refactor the 1,675-line ComboDesigner monolith into focused, stable components. Deduplicate cost calculations, add combo library with template reuse and production history, improve plant management UX. No data model migration — extend existing JSONB approach.

## Current State

- Single file: `src/ComboDesigner.jsx` (1,675 lines, ~15 components)
- Cost calculations duplicated 3x (CostRollup, OrderSummary, LotCard)
- No combo library or template system
- No production tracking (planned vs actual qty)
- No plant reordering or duplication
- Bugs fixed: missing `useEffect` import, `save` → `saveLot`, missing route in App.jsx

## Data Model Changes

### combo_lots table — add columns

```sql
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS template_id UUID;
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS production_qty INTEGER;
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS finished_photos JSONB DEFAULT '[]';
ALTER TABLE combo_lots ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;
```

- `template_id` — links a lot to the library template it was forked from
- `version` — auto-increments when a template is updated directly
- `production_qty` — actual units produced (vs planned `total_qty`)
- `completed_at` — when the lot was marked complete
- `finished_photos` — array of `{ id, imgData, caption, capturedAt }`
- `is_template` — TRUE for completed combos promoted to library

No new tables. Templates are combo_lots with `is_template = true`. Production history is derived by querying lots that share a `template_id`.

## File Structure

| File | Est. Lines | Responsibility |
|------|-----------|----------------|
| `src/ComboDesigner.jsx` | ~200 | Shell — top tabs (Active Lots / Library), status filters, design queue |
| `src/combo/LotDesigner.jsx` | ~250 | Single lot editor — header bar, combo tabs, save/submit/complete workflow |
| `src/combo/ComboEditor.jsx` | ~200 | Single combo — plant list, materials panel (container/soil/tag), preview |
| `src/combo/PlantRow.jsx` | ~180 | One plant — photo, catalog/manual toggle, expandable detail fields, drag handle |
| `src/combo/CatalogPicker.jsx` | ~200 | Slide-out panel — broker → supplier → species → series → color flow |
| `src/combo/CostEngine.js` | ~80 | Pure functions — ALL cost calculations, no JSX, no React |
| `src/combo/ComboVisual.jsx` | ~60 | Basket/planter ring layout preview |
| `src/combo/ComboNameGen.jsx` | ~100 | AI name generator modal (Claude API) |
| `src/combo/OrderSummary.jsx` | ~200 | Order modal — material cost table, broker breakdown, email draft copy |
| `src/combo/ComboLibrary.jsx` | ~200 | Library tab — searchable templates, production history, fork/version actions |

**Total: ~1,670 lines across 10 files** (same code, properly organized)

## Combo Lifecycle

```
Design → Approve → Order → Produce → Complete → Library
                                         ↓
                                    [Template]
                                     ↙     ↘
               [Fork: new lot]    [Update: bump version]
```

### States (existing STATUSES, plus "completed")

1. `draft` — being designed
2. `submitted` — submitted for review
3. `approved` — approved, ready to order
4. `revised` — revised after feedback
5. `revision` — needs revision (sent back)
6. `ordered` — plants ordered from brokers
7. `completed` — **NEW** — production done, enters library

### Completing a lot

When a lot is marked "completed":
1. User prompted to add finished photos (camera or upload)
2. User confirms actual production qty (`production_qty`)
3. Lot gets `is_template = true`, `completed_at = now()`
4. If lot was forked from a template (`template_id` set), production record links back
5. Lot appears in Library tab

## Component Specifications

### ComboDesigner.jsx (Shell)

**Two tabs:**
- **Active Lots** — design queue + lot cards with status filters (existing behavior, cleaned up)
- **Library** — searchable template list with production history

**Renders:**
- Tab bar (Active Lots | Library)
- Active: DesignQueue + status filter pills + LotCard grid
- Library: ComboLibrary component

**"+ New Combo Lot" button** dropdown:
- "Blank" — empty lot
- "From Template" — opens library picker, forks selected template

### LotDesigner.jsx

**Props:** `initial`, `onSave`, `onCancel`, `containers`, `soilMixes`, `tags`

**Header bar** (dark gradient, existing style):
- Lot name input
- Season + total qty fields
- Status badge
- Action buttons: Save, Submit, View Order, Complete (contextual by status)

**Combo tabs** (existing behavior):
- Tab per combo with name, qty badge, plant count
- Add Combo button (max 8)
- Remove combo (if > 1)

**Complete flow** (new, shown when status is "ordered"):
- "Mark Complete" button
- Modal: upload finished photos, confirm production qty
- Saves with `status: "completed"`, `is_template: true`

### ComboEditor.jsx

**Props:** `combo`, `onChange`, `lotQty`, `containers`, `soilMixes`, `tags`

**Layout:** Preview (left) + Plants (right) — existing grid, cleaned up

**Plant list improvements:**
- Drag-to-reorder (drag handle on left of each PlantRow)
- "Duplicate" button on each plant (copies all fields, generates new id)
- Plant count display: "Plants (3/10)"

**Materials panel:** LotMaterials (existing, extracted as-is)

**Cost rollup:** Uses CostEngine, no inline math

### PlantRow.jsx

**Props:** `plant`, `index`, `onChange`, `onRemove`, `onDuplicate`, `onMoveUp`, `onMoveDown`, `isFirst`, `isLast`

**Collapsed state (default):** One line showing:
- Drag handle (⋮⋮)
- Photo thumbnail (72px)
- Plant number badge
- Name + color (bold)
- Role badge (Thriller/Filler/Spiller/Accent)
- Qty stepper
- Cost per plant
- Expand chevron ▼
- Duplicate + Remove buttons

**Expanded state:** Shows all fields:
- Catalog/Manual toggle
- Broker, Form Type, Need By, $/plant (manual mode)
- Catalog browser button (catalog mode)
- Role selector
- Image URL input
- Item number

### CatalogPicker.jsx

Extracted from existing CatalogSlideOut — no behavior changes, just isolated into its own file.

**Props:** `plant`, `onChange`, `onClose`

### CostEngine.js

Pure JavaScript, no React. Single source of truth for all cost math.

```javascript
// Soil cost helpers
export function soilCostPerCuFt(mix) { ... }
export function substrateVolumeCuFt(container) { ... }

// Per-unit cost breakdown
export function calcPlantCost(plants) { ... }
export function calcContainerCost(container) { ... }
export function calcSoilCostPerUnit(soil, container) { ... }
export function calcAccessoryCost(container) { ... }
export function calcTagCost(tag) { ... }

// Rollup
export function calcUnitBreakdown(plants, container, soil, tag) {
  // Returns: { plantCost, containerCost, soilCost, tagCost, accessoryCost, totalPerUnit }
}

export function calcLotTotal(combos, qty, containers, soilMixes, tags) {
  // Returns: { perCombo: [...breakdowns], grandTotal }
}
```

Every component that shows costs imports from CostEngine. CostRollup, OrderSummary, and LotCard all use the same functions.

### ComboVisual.jsx

Extracted from existing ComboVisual — no behavior changes.

**Props:** `plants`, `isBasket`

### ComboNameGen.jsx

Extracted from existing ComboNameGenerator — no behavior changes.

**Props:** `plants`, `containerType`, `onSelect`, `onClose`

### OrderSummary.jsx

Extracted from existing OrderSummary. Uses CostEngine for all calculations.

**Props:** `lot`, `onClose`, `onMarkOrdered`, `containers`, `soilMixes`, `tags`

### ComboLibrary.jsx

**New component.** The Library tab.

**Props:** `lots`, `containers`, `soilMixes`, `tags`, `onFork`, `onUpdateTemplate`

**Search/filter:**
- Text search: name, plant names, broker names
- Season filter dropdown
- Sort: name, date created, times produced

**Template card:**
- Finished photo (first from `finished_photos`, or plant photo mosaic)
- Combo name
- Seasons grown + total units ever produced (aggregated from all lots with this `template_id`)
- Cost per unit (from most recent production)
- Plant summary (e.g., "4 plants: 1 Thriller, 2 Filler, 1 Spiller")

**Actions per template:**
- **"Use as Template"** → creates new lot with `template_id` set, copies all combo data, status = "draft"
- **"Update Template"** → opens LotDesigner in edit mode, saves with `version + 1`
- **"View History"** → expands to show all lots produced from this template (season, qty, cost, date)

## UX Patterns

### Consistent with existing app

- Same color palette: DARK (#1e2d1a), ACCENT (#7fb069), BG (#f2f5ef)
- Same fonts: DM Sans body, DM Serif Display / Georgia headings
- Same card patterns: white bg, #e0e8d8 borders, 10-14px border radius
- Same inline styles (no CSS files)

### Plant row expand/collapse

Default: collapsed (one-line summary)
Click expand chevron: shows all fields
This reduces visual clutter from the current layout where every field is always visible

### Drag to reorder

- Drag handle (⋮⋮) on left side of each plant row
- Uses HTML5 drag and drop (no library needed)
- Visual feedback: dragged row gets opacity 0.5, drop target gets highlighted border
- Fallback: up/down arrow buttons for mobile/accessibility

## Migration Path

1. Create `src/combo/` directory
2. Extract CostEngine.js first (pure functions, no dependencies)
3. Extract leaf components (ComboVisual, ComboNameGen, CatalogPicker)
4. Extract PlantRow, ComboEditor, LotDesigner, OrderSummary
5. Build ComboLibrary (new)
6. Rewrite ComboDesigner.jsx as thin shell
7. Add new DB columns
8. Add Complete flow + library promotion
9. Delete nothing from combo_lots — additive changes only

## What This Does NOT Include

- Retail/fundraising site integration (future)
- Cross-lot cost reporting dashboard (future)
- Image hosting / CDN (photos stay as base64/URLs in JSONB)
- Normalized plant tables (JSONB approach is sufficient)
- Other seasons (Spring first, duplicate later)
