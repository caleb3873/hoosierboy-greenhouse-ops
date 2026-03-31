# Houseplant Availability Search — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload Express Seed Excel availability files and search across all 18 supplier tabs in a unified, normalized view.

**Architecture:** New `src/HouseplantAvailability.jsx` page with Excel upload + per-supplier format mapping + normalized search table. Data stored in two Supabase tables: `hp_suppliers` (supplier metadata + column mapping config) and `hp_availability` (normalized plant rows). Upload replaces all availability for a broker. Uses existing `window.XLSX` CDN library already in codebase.

**Tech Stack:** React 18, Supabase (useTable hook), SheetJS (XLSX) for Excel parsing, existing design system (DM Sans, greenhouse palette).

---

## File Structure

| File | Responsibility |
|------|---------------|
| **Create:** `src/HouseplantAvailability.jsx` | Main page: upload, supplier mapping, search UI |
| **Create:** `src/hpParsers.js` | Excel parsing logic: read workbook, apply supplier mappings, normalize rows |
| **Create:** `src/hpDefaultConfigs.js` | Default format configs for 18 Express Seed supplier tabs |
| **Modify:** `src/supabase.js` | Add hooks + whitelist JSONB fields for `toSnake()` |
| **Modify:** `src/App.jsx` | Add "Houseplants" nav group + route to new page |
| **Modify:** `supabase-schema.sql` | Add `hp_suppliers` and `hp_availability` table definitions |

---

## Chunk 1: Data Layer & Parsing Engine

### Task 1: Database Schema

**Files:**
- Modify: `supabase-schema.sql` (append to end)

- [ ] **Step 1: Add hp_suppliers table to schema file**

Append to `supabase-schema.sql`:

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- HOUSEPLANT AVAILABILITY
-- ══════════════════════════════════════════════════════════════════════════════

-- Suppliers within a broker (e.g. "AgriStarts" under Express Seed)
CREATE TABLE hp_suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broker TEXT NOT NULL,               -- "Express Seed", "Foremost Co", "EHR"
  name TEXT NOT NULL,                 -- supplier name (tab name cleaned up)
  tab_name TEXT,                      -- exact Excel tab name for matching
  format_config JSONB DEFAULT '{}',   -- column mapping: { headerRow, plantCol, varietyCol, sizeCol, formCol, weekCols, availabilityType }
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (broker, name)
);

-- Normalized availability rows (replaced on each upload)
CREATE TABLE hp_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES hp_suppliers(id) ON DELETE CASCADE,
  broker TEXT NOT NULL,
  supplier_name TEXT NOT NULL,        -- denormalized for fast search
  plant_name TEXT NOT NULL,           -- genus or full name
  variety TEXT,                       -- cultivar/variety
  common_name TEXT,
  size TEXT,                          -- "72 Cell", "URC", etc.
  form TEXT,                          -- "rc", "URC", "liner", "cutting"
  product_id TEXT,                    -- supplier's item code
  location TEXT,                      -- "FL", "TX", farm code, etc.
  availability JSONB DEFAULT '{}',    -- { "wk15": 500, "wk16": 300 } or { "ready": 1000, "1month": 500 }
  availability_text TEXT,             -- for non-numeric: "THREE MONTH LEAD", "Call"
  comments TEXT,
  upload_batch TEXT,                  -- UUID grouping rows from same upload
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hp_avail_search ON hp_availability USING gin (to_tsvector('english', plant_name || ' ' || COALESCE(variety, '') || ' ' || COALESCE(common_name, '')));
CREATE INDEX idx_hp_avail_broker ON hp_availability (broker);
CREATE INDEX idx_hp_avail_supplier ON hp_availability (supplier_id);
```

- [ ] **Step 2: Create these tables in Supabase**

Run the SQL above in the Supabase SQL editor at the project dashboard. Verify both tables exist.

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(houseplants): add hp_suppliers and hp_availability schema"
```

---

### Task 2: Supabase Hooks

**Files:**
- Modify: `src/supabase.js` (add 2 lines near other hook exports, ~line 240)

- [ ] **Step 1: Add JSONB field names to `toSnake()` whitelist**

In `src/supabase.js` around line 44, find the array of JSONB field names that should NOT be recursed into:
```javascript
!["varieties","indoorAssignments","outsideAssignments","zones","sections","stages","items","spacing","details","priceHistory","inventoryHistory"].includes(k)
```

Add `"formatConfig"` and `"availability"` to this array so they become:
```javascript
!["varieties","indoorAssignments","outsideAssignments","zones","sections","stages","items","spacing","details","priceHistory","inventoryHistory","formatConfig","availability"].includes(k)
```

This prevents `toSnake()` from recursing into the JSONB content of `format_config` (which has keys like `headerRow`, `plantCol`) and `availability` (which has keys like `wk14`, `ready`).

- [ ] **Step 2: Add useHpSuppliers and useHpAvailability hooks**

Add after the existing `useBreederProfiles` line (~line 240):

```javascript
export const useHpSuppliers    = () => useTable("hp_suppliers",    { orderBy: "name",        localKey: "gh_hp_suppliers_v1" });
export const useHpAvailability = () => useTable("hp_availability", { orderBy: "plant_name",   localKey: "gh_hp_availability_v1" });
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/supabase.js
git commit -m "feat(houseplants): add useHpSuppliers and useHpAvailability hooks"
```

---

### Task 3: Excel Parsing Engine

**Files:**
- Create: `src/hpParsers.js`

This is the core logic that reads an Excel workbook and normalizes each supplier tab into a flat array of availability rows. Each supplier has a `formatConfig` that tells the parser where to find plant names, weeks, etc.

- [ ] **Step 1: Create the parser module**

Create `src/hpParsers.js`:

```javascript
/**
 * Houseplant Availability — Excel Parsing Engine
 *
 * Reads a multi-tab Excel workbook (Express Seed style) and normalizes
 * each supplier tab into flat availability rows using per-supplier
 * format configs.
 *
 * Format configs are stored in hp_suppliers.format_config and look like:
 * {
 *   headerRow: 1,          // 0-indexed row where headers live
 *   dataStartRow: 2,       // 0-indexed row where data begins
 *   plantCol: 0,           // column index for plant/genus name
 *   varietyCol: 1,         // column index for variety/cultivar (optional)
 *   commonNameCol: null,   // column index for common name (optional)
 *   sizeCol: null,         // column index for size/form (optional)
 *   formCol: null,         // column index for form type (optional)
 *   productIdCol: null,    // column index for product/item code (optional)
 *   locationCol: null,     // column index for location (optional)
 *   commentsCol: null,     // column index for comments (optional)
 *   weekType: "weekly",    // "weekly" | "monthly" | "buckets" | "text" | "simple_qty"
 *   weekStartCol: 2,       // first availability column
 *   weekEndCol: null,      // last availability column (null = until end of row)
 *   twoColumnLayout: false,// AG 2 style: two plant+qty pairs side by side
 *   rightPlantCol: null,   // for twoColumnLayout: right-side plant column
 *   rightQtyCol: null,     // for twoColumnLayout: right-side qty column
 * }
 */

/**
 * Parse week labels from header row into normalized week keys.
 * Handles: "wk14", "WK15", "15-2026", "202614", "MAR", "April", "READY", "1 MONTH", dates, etc.
 */
export function parseWeekLabel(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // "wk14", "wk 15", "WK14"
  const wkMatch = s.match(/^wk\s*(\d+)$/i);
  if (wkMatch) return `wk${wkMatch[1]}`;

  // "14-2026", "15-26"
  const dashMatch = s.match(/^(\d{1,2})-(?:20)?(\d{2,4})$/);
  if (dashMatch) return `wk${dashMatch[1]}`;

  // "202614" (YYYYWW)
  const yyyyww = s.match(/^(2026|2027)(\d{2})$/);
  if (yyyyww) return `wk${parseInt(yyyyww[2])}`;

  // Month names → "month_mar", "month_apr", etc.
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const monthKey = s.toLowerCase().replace(/\s+\d{4}$/, ""); // "January 2027" → "january"
  if (months[monthKey]) return `month_${monthKey.slice(0, 3)}`;

  // Date objects (from Excel) — convert to week
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
    const d = new Date(s);
    if (!isNaN(d)) {
      const start = new Date(d.getFullYear(), 0, 1);
      const wk = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
      return `wk${wk}`;
    }
  }

  // Bucket labels: "READY", "1 MONTH", "FUTURE", "Available Now"
  const lower = s.toLowerCase();
  if (lower.includes("ready") || lower.includes("available now")) return "ready";
  if (lower.includes("1 month") || lower.includes("one month")) return "1month";
  if (lower.includes("future") || lower.includes("prebook")) return "future";

  // "14-15" (week ranges)
  const rangeMatch = s.match(/^(\d{1,2})-(\d{1,2})$/);
  if (rangeMatch) return `wk${rangeMatch[1]}-${rangeMatch[2]}`;

  return null;
}

/**
 * Parse a single sheet using the supplier's format config.
 * Returns an array of normalized availability row objects.
 */
export function parseSheet(sheetData, formatConfig) {
  const cfg = formatConfig || {};
  const rows = [];

  if (!sheetData || sheetData.length === 0) return rows;

  const dataStart = cfg.dataStartRow ?? ((cfg.headerRow ?? 0) + 1);

  // Handle two-column layout (AG 2 style)
  if (cfg.twoColumnLayout) {
    for (let i = dataStart; i < sheetData.length; i++) {
      const row = sheetData[i];
      // Left pair
      const leftPlant = cellStr(row[cfg.plantCol ?? 0]);
      const leftQty = cellStr(row[(cfg.plantCol ?? 0) + 1]);
      if (leftPlant && !isCategoryHeader(leftPlant)) {
        rows.push(makeRow(leftPlant, null, leftQty));
      }
      // Right pair
      if (cfg.rightPlantCol != null) {
        const rightPlant = cellStr(row[cfg.rightPlantCol]);
        const rightQty = cellStr(row[cfg.rightQtyCol ?? (cfg.rightPlantCol + 1)]);
        if (rightPlant && !isCategoryHeader(rightPlant)) {
          rows.push(makeRow(rightPlant, null, rightQty));
        }
      }
    }
    return rows;
  }

  // Parse week headers
  const headerRow = sheetData[cfg.headerRow ?? 0] || [];
  const weekStart = cfg.weekStartCol ?? 2;
  const weekEnd = cfg.weekEndCol ?? (headerRow.length - 1);
  const weekKeys = [];
  for (let c = weekStart; c <= weekEnd; c++) {
    weekKeys.push({ col: c, key: parseWeekLabel(headerRow[c]) });
  }

  // Parse data rows
  for (let i = dataStart; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row) continue;

    const plantName = cellStr(row[cfg.plantCol ?? 0]);
    if (!plantName) continue;
    if (isCategoryHeader(plantName)) continue;

    const variety = cfg.varietyCol != null ? cellStr(row[cfg.varietyCol]) : null;
    const commonName = cfg.commonNameCol != null ? cellStr(row[cfg.commonNameCol]) : null;
    const size = cfg.sizeCol != null ? cellStr(row[cfg.sizeCol]) : null;
    const form = cfg.formCol != null ? cellStr(row[cfg.formCol]) : null;
    const productId = cfg.productIdCol != null ? cellStr(row[cfg.productIdCol]) : null;
    const location = cfg.locationCol != null ? cellStr(row[cfg.locationCol]) : null;
    const comments = cfg.commentsCol != null ? cellStr(row[cfg.commentsCol]) : null;

    // Simple quantity (no weekly breakdown)
    if (cfg.weekType === "simple_qty") {
      const qty = cellStr(row[cfg.weekStartCol ?? 1]);
      rows.push({
        plantName: plantName,
        variety,
        commonName,
        size,
        form,
        productId,
        location,
        availability: qty && isNumeric(qty) ? { total: parseInt(qty) } : {},
        availabilityText: qty && !isNumeric(qty) ? qty : null,
        comments,
      });
      continue;
    }

    // Text-based availability (AgriStarts style: "THREE MONTH LEAD")
    if (cfg.weekType === "text") {
      const text = cellStr(row[cfg.weekStartCol ?? 2]);
      rows.push({
        plantName,
        variety,
        commonName,
        size,
        form,
        productId,
        location,
        availability: {},
        availabilityText: text,
        comments,
      });
      continue;
    }

    // Weekly/monthly/bucket availability
    const availability = {};
    let hasAny = false;
    let textVal = null;
    for (const wk of weekKeys) {
      const val = cellStr(row[wk.col]);
      if (!val) continue;
      if (wk.key && isNumeric(val)) {
        availability[wk.key] = parseInt(val);
        hasAny = true;
      } else if (val && !isNumeric(val)) {
        textVal = textVal ? textVal + "; " + val : val;
      }
    }

    if (hasAny || textVal || comments) {
      rows.push({
        plantName,
        variety,
        commonName,
        size,
        form,
        productId,
        location,
        availability: hasAny ? availability : {},
        availabilityText: textVal,
        comments,
      });
    }
  }

  return rows;
}

/**
 * Read an entire workbook and return { tabName: [[row], [row], ...] }
 * Requires window.XLSX to be loaded.
 */
export function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const XLSX = window.XLSX;
        if (!XLSX) { reject(new Error("XLSX library not loaded")); return; }
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const sheets = {};
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          sheets[name] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
        }
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cellStr(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function isNumeric(s) {
  return /^\d+$/.test(s);
}

function isCategoryHeader(s) {
  // Detect section headers like "CARNIVOROUS", "FERNS", blank-ish labels
  const upper = s.toUpperCase();
  const categoryWords = ["FOLIAGE", "TROPICALS", "CARNIVOROUS", "FERNS", "SUCCULENTS",
    "CACTI", "AVAILABILITY", "CONT'D", "Cont'd"];
  return categoryWords.some(w => upper.includes(w)) && !s.includes("'") && s.split(" ").length <= 4;
}

/**
 * Make a row for two-column layout suppliers.
 */
function makeRow(plantName, variety, qtyStr) {
  const isNum = qtyStr && isNumeric(qtyStr);
  return {
    plantName,
    variety,
    commonName: null,
    size: null,
    form: null,
    productId: null,
    location: null,
    availability: isNum ? { total: parseInt(qtyStr) } : {},
    availabilityText: qtyStr && !isNum ? qtyStr : null,
    comments: null,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (file is pure JS, no JSX needed).

- [ ] **Step 3: Commit**

```bash
git add src/hpParsers.js
git commit -m "feat(houseplants): add Excel parsing engine with per-supplier format configs"
```

---

### Task 4: Default Format Configs for All 18 Express Seed Suppliers

**Files:**
- Create: `src/hpDefaultConfigs.js`

These configs are derived from analyzing the actual Excel file. They'll be used as defaults when creating supplier records and can be edited by the user later.

- [ ] **Step 1: Create default configs file**

Create `src/hpDefaultConfigs.js`:

```javascript
/**
 * Default format configs for Express Seed supplier tabs.
 * Derived from analyzing Foliage Availability_3_30_26.xlsm.
 *
 * Each key = exact tab name (without date suffix).
 * These are applied as defaults when a new supplier is created.
 */

export const EXPRESS_SEED_DEFAULTS = {
  "AG 2": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "simple_qty",
    weekStartCol: 1,
    twoColumnLayout: true,
    rightPlantCol: 2,
    rightQtyCol: 3,
  },
  "AgriStarts": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    varietyCol: 1,
    weekType: "text",
    weekStartCol: 2,
  },
  "ARC": {
    headerRow: 3,
    dataStartRow: 4,
    plantCol: 0,       // common name
    varietyCol: 1,      // latin name
    weekType: "weekly",
    weekStartCol: 3,
    weekEndCol: 9,
  },
  "Brighten": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    productIdCol: 1,
    weekType: "weekly",
    weekStartCol: 2,
  },
  "Cacti Young Plants": {
    headerRow: 2,
    dataStartRow: 3,
    locationCol: 0,     // farm location
    plantCol: 1,        // variety name
    weekType: "monthly",
    weekStartCol: 2,
  },
  "Casa Flora": {
    headerRow: 4,
    dataStartRow: 5,
    plantCol: 0,        // Latin Name
    commonNameCol: 1,   // Common Name
    sizeCol: 2,         // Size
    weekType: "weekly",
    weekStartCol: 3,    // alternating FL/TX columns
  },
  "Danziger": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,        // Crop Name
    varietyCol: 1,       // Variety Name
    formCol: 2,         // Product (URC, etc.)
    weekType: "weekly",
    weekStartCol: 3,
  },
  "Harold Walters": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,        // VARIETY
    sizeCol: 1,         // SIZE
    weekType: "buckets",
    weekStartCol: 2,    // READY, 1 MONTH, FUTURE
  },
  "Inversiones": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,        // Item
    varietyCol: 1,       // Variety
    sizeCol: 2,         // Size
    formCol: 3,         // Form
    weekType: "weekly",
    weekStartCol: 4,
  },
  "Knox": {
    headerRow: 1,
    dataStartRow: 3,
    plantCol: 0,        // ITEM (full description)
    weekType: "weekly",
    weekStartCol: 1,
  },
  "LinersUnlimited": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    sizeCol: 1,
    weekType: "weekly",
    weekStartCol: 2,
  },
  "Moss Hill": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,        // Latin Name
    commonNameCol: 1,   // Common Name
    sizeCol: 2,
    weekType: "weekly",
    weekStartCol: 4,    // skip Count column
    weekEndCol: 12,
    commentsCol: 12,    // Comments column
  },
  "Pinnacle": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "monthly",
    weekStartCol: 1,
  },
  "Pinnacle Mexico": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    weekType: "weekly",
    weekStartCol: 1,
  },
  "Pinnacle Shanghai": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "monthly",
    weekStartCol: 1,
  },
  "Plant Investment": {
    headerRow: 1,
    dataStartRow: 2,
    plantCol: 0,
    weekType: "simple_qty",
    weekStartCol: 1,
  },
  "Succulents Unlimited": {
    headerRow: 2,
    dataStartRow: 3,
    plantCol: 0,
    weekType: "weekly",
    weekStartCol: 1,
  },
  "Van Wingerden": {
    headerRow: 1,
    dataStartRow: 2,
    sizeCol: 0,         // Size category
    plantCol: 1,        // Item Name
    weekType: "simple_qty",
    weekStartCol: 4,    // Liners total
  },
};

/**
 * Match a tab name from an uploaded file to a known supplier config.
 * Tab names include date suffixes like "AgriStarts Mar 30" — we strip those.
 */
export function matchSupplierConfig(tabName) {
  // Strip date suffix: "AgriStarts Mar 30" → "AgriStarts"
  const cleaned = tabName
    .replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}$/i, "")
    .replace(/\s+March\s+\d{1,2}$/i, "")
    .trim();

  // Direct match
  if (EXPRESS_SEED_DEFAULTS[cleaned]) {
    return { key: cleaned, config: EXPRESS_SEED_DEFAULTS[cleaned] };
  }

  // Fuzzy: check if cleaned starts with or contains a known key
  for (const [key, config] of Object.entries(EXPRESS_SEED_DEFAULTS)) {
    if (cleaned.toLowerCase().startsWith(key.toLowerCase())) {
      return { key, config };
    }
  }

  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hpDefaultConfigs.js
git commit -m "feat(houseplants): add default format configs for 18 Express Seed suppliers"
```

---

## Chunk 2: Upload & Search UI

### Task 5: Main Houseplant Availability Page — Upload Flow

**Files:**
- Create: `src/HouseplantAvailability.jsx`

This is a large file but follows the existing single-component-per-file pattern. It has three main views: (1) upload/manage suppliers, (2) search availability, (3) supplier mapping editor.

- [ ] **Step 1: Create the page with upload and supplier management**

Create `src/HouseplantAvailability.jsx`:

```jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useHpSuppliers, useHpAvailability, getSupabase } from "./supabase";
import { readWorkbook, parseSheet, parseWeekLabel } from "./hpParsers";
import { matchSupplierConfig, EXPRESS_SEED_DEFAULTS } from "./hpDefaultConfigs";

// ── Design tokens (matches app palette) ──────────────────────────────────────
const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const card = { background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 20px", marginBottom: 12 };
const IS = (f) => ({
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: `1.5px solid ${f ? "#7fb069" : "#c8d8c0"}`,
  background: "#fff", fontSize: 14, color: "#1e2d1a",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
});
const SH = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 800, color: "#7fb069", letterSpacing: 1.2,
    textTransform: "uppercase", borderBottom: "1.5px solid #e0ead8",
    paddingBottom: 8, marginBottom: 16, marginTop: 24 }}>{children}</div>
);
const FL = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase",
    letterSpacing: .7, marginBottom: 5 }}>{children}</div>
);
const BTN = { background: "#7fb069", color: "#fff", border: "none", borderRadius: 10,
  padding: "10px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
const BTN_SEC = { background: "#fff", color: "#7a8c74", border: "1.5px solid #c8d8c0",
  borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" };

// ── XLSX CDN loader ──────────────────────────────────────────────────────────
function useXLSX() {
  const [ready, setReady] = useState(!!window.XLSX);
  useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function HouseplantAvailability() {
  const xlsxReady = useXLSX();
  const { rows: suppliers, upsert: upsertSupplier, refresh: refreshSuppliers } = useHpSuppliers();
  const { rows: availability, insert: insertAvail, remove: removeAvail, refresh: refreshAvail } = useHpAvailability();

  const [view, setView] = useState("search"); // "search" | "upload" | "mapping"
  const [searchQ, setSearchQ] = useState("");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("any");
  const [uploadState, setUploadState] = useState(null); // { broker, sheets, parsed, status }
  const [mappingSupplier, setMappingSupplier] = useState(null);

  // ── Search logic ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = availability;
    if (brokerFilter !== "all") {
      items = items.filter(r => r.broker === brokerFilter);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      items = items.filter(r =>
        (r.plantName || "").toLowerCase().includes(q) ||
        (r.variety || "").toLowerCase().includes(q) ||
        (r.commonName || "").toLowerCase().includes(q) ||
        (r.supplierName || "").toLowerCase().includes(q)
      );
    }
    if (weekFilter !== "any") {
      items = items.filter(r => {
        const avail = r.availability || {};
        return avail[weekFilter] && avail[weekFilter] > 0;
      });
    }
    return items;
  }, [availability, searchQ, brokerFilter, weekFilter]);

  // Get all unique week keys across all availability for the filter dropdown
  const allWeekKeys = useMemo(() => {
    const keys = new Set();
    availability.forEach(r => {
      Object.keys(r.availability || {}).forEach(k => keys.add(k));
    });
    return Array.from(keys).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
  }, [availability]);

  const brokers = useMemo(() => {
    const set = new Set(availability.map(r => r.broker));
    return Array.from(set).sort();
  }, [availability]);

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadState({ broker: "Express Seed", status: "reading", sheets: null, parsed: null });
    try {
      const sheets = await readWorkbook(file);
      const tabNames = Object.keys(sheets).filter(n => n !== "Directory");

      // Auto-match each tab to a supplier config
      const parsed = tabNames.map(tabName => {
        const match = matchSupplierConfig(tabName);
        const existing = suppliers.find(s => s.tabName === tabName || s.name === (match?.key || tabName));
        const config = existing?.formatConfig || match?.config || {};
        const rows = parseSheet(sheets[tabName], config);
        return {
          tabName,
          supplierKey: match?.key || tabName,
          config,
          rows,
          matched: !!match,
          existing,
          rowCount: rows.length,
        };
      });

      setUploadState({ broker: "Express Seed", status: "preview", sheets, parsed });
    } catch (err) {
      setUploadState({ broker: "Express Seed", status: "error", error: err.message });
    }
  }, [suppliers]);

  // ── Import confirmed ─────────────────────────────────────────────────────
  const handleImportConfirm = useCallback(async () => {
    if (!uploadState?.parsed) return;
    setUploadState(prev => ({ ...prev, status: "importing" }));

    const batchId = crypto.randomUUID();
    const broker = uploadState.broker;

    try {
      // 1. Bulk delete all existing availability for this broker (one call, not row-by-row)
      const sb = getSupabase();
      if (sb) {
        await sb.from("hp_availability").delete().eq("broker", broker);
      }

      // 2. Upsert supplier records (18 max, fine to do individually)
      for (const tab of uploadState.parsed) {
        const supplierId = tab.existing?.id || crypto.randomUUID();
        await upsertSupplier({
          id: supplierId,
          broker,
          name: tab.supplierKey,
          tabName: tab.tabName,
          formatConfig: tab.config,
        });
      }

      // 3. Batch insert all availability rows (chunks of 500)
      const allRows = [];
      for (const tab of uploadState.parsed) {
        const supplierId = suppliers.find(s => s.name === tab.supplierKey)?.id
          || tab.existing?.id || crypto.randomUUID();
        for (const row of tab.rows) {
          allRows.push({
            id: crypto.randomUUID(),
            supplier_id: supplierId,
            broker,
            supplier_name: tab.supplierKey,
            plant_name: row.plantName,
            variety: row.variety,
            common_name: row.commonName,
            size: row.size,
            form: row.form,
            product_id: row.productId,
            location: row.location,
            availability: row.availability,
            availability_text: row.availabilityText,
            comments: row.comments,
            upload_batch: batchId,
          });
        }
      }

      // Insert in batches of 500 (direct Supabase call — snake_case keys since we bypass useTable)
      if (sb) {
        for (let i = 0; i < allRows.length; i += 500) {
          const chunk = allRows.slice(i, i + 500);
          const { error } = await sb.from("hp_availability").insert(chunk);
          if (error) throw error;
        }
      } else {
        // Offline fallback: use useTable insert (slower but works with localStorage)
        for (const row of allRows) {
          await insertAvail(row);
        }
      }

      refreshSuppliers();
      refreshAvail();
      setUploadState(null);
      setView("search");
    } catch (err) {
      setUploadState(prev => ({ ...prev, status: "error", error: err.message }));
    }
  }, [uploadState, suppliers, upsertSupplier, insertAvail, refreshSuppliers, refreshAvail]);

  // ── Week label display ───────────────────────────────────────────────────
  function weekLabel(key) {
    if (!key) return "";
    if (key === "ready") return "Ready";
    if (key === "1month") return "1 Month";
    if (key === "future") return "Future";
    if (key === "total") return "Total";
    if (key.startsWith("wk")) return "Wk " + key.replace("wk", "");
    if (key.startsWith("month_")) return key.replace("month_", "").charAt(0).toUpperCase() + key.replace("month_", "").slice(1);
    return key;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ── RENDER ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 26, fontWeight: 400, color: "#1a2a1a" }}>
            Houseplant Availability
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            {availability.length} items from {brokers.length} broker{brokers.length !== 1 ? "s" : ""}
            {suppliers.length > 0 && ` / ${suppliers.length} suppliers`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ ...BTN, display: "flex", alignItems: "center", gap: 8, opacity: xlsxReady ? 1 : 0.5, cursor: xlsxReady ? "pointer" : "wait" }}>
            Upload Availability
            <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={handleFileUpload}
              disabled={!xlsxReady} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Upload preview overlay */}
      {uploadState && uploadState.status === "preview" && (
        <UploadPreview
          state={uploadState}
          onConfirm={handleImportConfirm}
          onCancel={() => setUploadState(null)}
          onEditMapping={(tab) => { setMappingSupplier(tab); setView("mapping"); }}
          weekLabel={weekLabel}
        />
      )}

      {uploadState && uploadState.status === "importing" && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a", marginBottom: 8 }}>Importing availability...</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>This may take a moment for large files.</div>
        </div>
      )}

      {uploadState && uploadState.status === "reading" && (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e2d1a" }}>Reading Excel file...</div>
        </div>
      )}

      {uploadState && uploadState.status === "error" && (
        <div style={{ ...card, borderColor: "#f0c8c0", padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#d94f3d", marginBottom: 6 }}>Upload Error</div>
          <div style={{ fontSize: 13, color: "#7a5a5a" }}>{uploadState.error}</div>
          <button onClick={() => setUploadState(null)} style={{ ...BTN_SEC, marginTop: 12 }}>Dismiss</button>
        </div>
      )}

      {/* Mapping editor */}
      {view === "mapping" && mappingSupplier && (
        <MappingEditor
          tab={mappingSupplier}
          sheets={uploadState?.sheets}
          onSave={(updatedTab) => {
            setUploadState(prev => ({
              ...prev,
              parsed: prev.parsed.map(t => t.tabName === updatedTab.tabName ? updatedTab : t),
            }));
            setView("search");
          }}
          onCancel={() => setView("search")}
        />
      )}

      {/* Search view */}
      {view === "search" && !uploadState && (
        <>
          {/* Search bar + filters */}
          <div style={{ ...card, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search plants, varieties, suppliers..."
                style={{ ...IS(!!searchQ), fontSize: 15 }}
              />
            </div>
            <select value={brokerFilter} onChange={e => setBrokerFilter(e.target.value)}
              style={{ ...IS(false), width: "auto", minWidth: 140 }}>
              <option value="all">All Brokers</option>
              {brokers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
              style={{ ...IS(false), width: "auto", minWidth: 120 }}>
              <option value="any">Any Week</option>
              {allWeekKeys.map(k => <option key={k} value={k}>{weekLabel(k)}</option>)}
            </select>
            <div style={{ fontSize: 13, color: "#7a8c74", fontWeight: 600 }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Results */}
          {availability.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: "60px 40px", border: "1.5px dashed #c8d8c0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a1a", marginBottom: 6 }}>No availability loaded</div>
              <div style={{ fontSize: 13, color: "#7a8c74", marginBottom: 20, maxWidth: 400, margin: "0 auto 20px" }}>
                Upload an Express Seed availability spreadsheet to get started. All tabs will be parsed and searchable.
              </div>
              <label style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 8, cursor: xlsxReady ? "pointer" : "wait" }}>
                Upload Availability File
                <input type="file" accept=".xlsx,.xlsm,.xls" onChange={handleFileUpload}
                  disabled={!xlsxReady} style={{ display: "none" }} />
              </label>
            </div>
          ) : (
            <AvailabilityTable rows={filtered} weekLabel={weekLabel} />
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── UPLOAD PREVIEW ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function UploadPreview({ state, onConfirm, onCancel, onEditMapping, weekLabel }) {
  const totalRows = state.parsed.reduce((sum, t) => sum + t.rowCount, 0);

  return (
    <div style={{ ...card, borderColor: "#7fb069", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>Upload Preview — {state.broker}</div>
          <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 4 }}>
            {state.parsed.length} supplier tabs / {totalRows.toLocaleString()} total items parsed
          </div>
          <div style={{ fontSize: 12, color: "#c8791a", fontWeight: 600, marginTop: 4 }}>
            This will replace ALL existing {state.broker} availability.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onConfirm} style={BTN}>Import All</button>
          <button onClick={onCancel} style={BTN_SEC}>Cancel</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {state.parsed.map(tab => (
          <div key={tab.tabName} style={{
            background: tab.matched ? "#f8fcf6" : "#fff8f0",
            borderRadius: 10, border: `1.5px solid ${tab.matched ? "#b8d8a0" : "#e8d0a0"}`,
            padding: "12px 14px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1e2d1a" }}>{tab.supplierKey}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 12, padding: "2px 8px",
                background: tab.matched ? "#e0f0d8" : "#fde8d0",
                color: tab.matched ? "#4a7a35" : "#c87a1a",
              }}>
                {tab.matched ? "Auto-mapped" : "Needs mapping"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4 }}>
              Tab: "{tab.tabName}" — {tab.rowCount} items
            </div>
            {tab.rows.length > 0 && (
              <div style={{ fontSize: 11, color: "#aabba0", marginTop: 6 }}>
                Sample: {tab.rows.slice(0, 3).map(r => r.plantName).join(", ")}
              </div>
            )}
            <button onClick={() => onEditMapping(tab)}
              style={{ marginTop: 8, padding: "4px 12px", borderRadius: 8, border: "1.5px solid #c8d8c0",
                background: "#fff", color: "#7a8c74", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Edit Mapping
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── AVAILABILITY TABLE ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function AvailabilityTable({ rows, weekLabel }) {
  const [sortCol, setSortCol] = useState("plantName");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = (a[sortCol] || "").toLowerCase();
      const bv = (b[sortCol] || "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [rows, sortCol, sortDir]);

  const paged = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(sorted.length / PER_PAGE);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Reset page when rows change
  useEffect(() => setPage(0), [rows]);

  const thStyle = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 800,
    color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, cursor: "pointer",
    borderBottom: "2px solid #e0ead8", userSelect: "none", whiteSpace: "nowrap" };
  const tdStyle = { padding: "10px 12px", fontSize: 13, color: "#1e2d1a", borderBottom: "1px solid #f0f5ee" };

  // Collect week keys from visible rows for week columns
  const visibleWeekKeys = useMemo(() => {
    const keys = new Set();
    paged.forEach(r => Object.keys(r.availability || {}).forEach(k => keys.add(k)));
    const arr = Array.from(keys);
    arr.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numA - numB;
    });
    return arr.slice(0, 12); // max 12 week columns to keep table readable
  }, [paged]);

  return (
    <div>
      <div style={{ overflowX: "auto", background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              <th onClick={() => toggleSort("plantName")} style={thStyle}>
                Plant {sortCol === "plantName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => toggleSort("variety")} style={thStyle}>
                Variety {sortCol === "variety" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th onClick={() => toggleSort("supplierName")} style={thStyle}>
                Supplier {sortCol === "supplierName" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th style={thStyle}>Size</th>
              <th style={thStyle}>Form</th>
              {visibleWeekKeys.map(k => (
                <th key={k} style={{ ...thStyle, textAlign: "right", minWidth: 55 }}>{weekLabel(k)}</th>
              ))}
              <th style={thStyle}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={row.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{row.plantName}</td>
                <td style={tdStyle}>{row.variety || ""}</td>
                <td style={{ ...tdStyle, fontSize: 12, color: "#7a8c74" }}>{row.supplierName}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{row.size || ""}</td>
                <td style={{ ...tdStyle, fontSize: 12 }}>{row.form || ""}</td>
                {visibleWeekKeys.map(k => {
                  const val = (row.availability || {})[k];
                  return (
                    <td key={k} style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums",
                      color: val ? "#1e2d1a" : "#d0d8cc", fontWeight: val ? 600 : 400 }}>
                      {val ? val.toLocaleString() : "—"}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontSize: 12, color: "#7a8c74", maxWidth: 200 }}>
                  {row.availabilityText || row.comments || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
          <span style={{ fontSize: 13, color: "#7a8c74" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            style={{ ...BTN_SEC, padding: "6px 14px", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAPPING EDITOR ────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function MappingEditor({ tab, sheets, onSave, onCancel }) {
  const sheetData = sheets?.[tab.tabName] || [];
  const [cfg, setCfg] = useState({ ...tab.config });
  const upd = (k, v) => setCfg(prev => ({ ...prev, [k]: v }));

  // Preview: show first 8 rows of raw data
  const previewRows = sheetData.slice(0, 8);

  // Re-parse with current config
  const parsed = useMemo(() => parseSheet(sheetData, cfg), [sheetData, cfg]);

  function save() {
    onSave({
      ...tab,
      config: cfg,
      rows: parsed,
      rowCount: parsed.length,
      matched: true,
    });
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e2d1a" }}>Edit Mapping — {tab.supplierKey}</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Tab: "{tab.tabName}"</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={save} style={BTN}>Save & Apply ({parsed.length} items)</button>
          <button onClick={onCancel} style={BTN_SEC}>Cancel</button>
        </div>
      </div>

      {/* Raw data preview */}
      <SH>Raw Data Preview</SH>
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri === (cfg.headerRow ?? 0) ? "#e0f0d8" : ri < (cfg.dataStartRow ?? 1) ? "#f0f0f0" : "#fff" }}>
                <td style={{ padding: "3px 6px", color: "#aabba0", fontWeight: 700, borderRight: "1px solid #e0ead8" }}>{ri}</td>
                {(row || []).slice(0, 20).map((cell, ci) => (
                  <td key={ci} style={{ padding: "3px 6px", borderRight: "1px solid #f0f5ee", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
                    background: ci === cfg.plantCol ? "#e8f5e0" : ci === cfg.varietyCol ? "#e0f0f5" : undefined }}>
                    {cell != null ? String(cell).slice(0, 30) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#aabba0", marginBottom: 16 }}>
        Green row = header row. Green column = plant name. Blue column = variety.
      </div>

      {/* Config fields */}
      <SH>Column Mapping</SH>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div>
          <FL>Header Row (0-indexed)</FL>
          <input type="number" value={cfg.headerRow ?? 0} onChange={e => upd("headerRow", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Data Start Row</FL>
          <input type="number" value={cfg.dataStartRow ?? 1} onChange={e => upd("dataStartRow", parseInt(e.target.value) || 1)} style={IS(false)} />
        </div>
        <div>
          <FL>Plant Name Col</FL>
          <input type="number" value={cfg.plantCol ?? 0} onChange={e => upd("plantCol", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Variety Col</FL>
          <input type="number" value={cfg.varietyCol ?? ""} onChange={e => upd("varietyCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Common Name Col</FL>
          <input type="number" value={cfg.commonNameCol ?? ""} onChange={e => upd("commonNameCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Size Col</FL>
          <input type="number" value={cfg.sizeCol ?? ""} onChange={e => upd("sizeCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Form Col</FL>
          <input type="number" value={cfg.formCol ?? ""} onChange={e => upd("formCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
        <div>
          <FL>Product ID Col</FL>
          <input type="number" value={cfg.productIdCol ?? ""} onChange={e => upd("productIdCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <div>
          <FL>Availability Type</FL>
          <select value={cfg.weekType || "weekly"} onChange={e => upd("weekType", e.target.value)} style={IS(false)}>
            <option value="weekly">Weekly (wk14, 15-2026, etc.)</option>
            <option value="monthly">Monthly (MAR, APR, etc.)</option>
            <option value="buckets">Buckets (Ready, 1 Month, Future)</option>
            <option value="text">Text (lead times, descriptions)</option>
            <option value="simple_qty">Simple Quantity</option>
          </select>
        </div>
        <div>
          <FL>Week Start Col</FL>
          <input type="number" value={cfg.weekStartCol ?? 2} onChange={e => upd("weekStartCol", parseInt(e.target.value) || 0)} style={IS(false)} />
        </div>
        <div>
          <FL>Week End Col (blank = auto)</FL>
          <input type="number" value={cfg.weekEndCol ?? ""} onChange={e => upd("weekEndCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="Auto" />
        </div>
        <div>
          <FL>Comments Col</FL>
          <input type="number" value={cfg.commentsCol ?? ""} onChange={e => upd("commentsCol", e.target.value === "" ? null : parseInt(e.target.value))} style={IS(false)} placeholder="—" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1e2d1a" }}>
          <input type="checkbox" checked={cfg.twoColumnLayout || false}
            onChange={e => upd("twoColumnLayout", e.target.checked)} />
          Two-column layout (side-by-side plant lists)
        </label>
      </div>

      {/* Parsed preview */}
      <SH>Parsed Preview ({parsed.length} items)</SH>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Plant</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Variety</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Size</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Availability</th>
              <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #e0ead8", color: "#7a8c74", fontSize: 11 }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {parsed.slice(0, 10).map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafcf8" }}>
                <td style={{ padding: "6px 10px", fontWeight: 600 }}>{r.plantName}</td>
                <td style={{ padding: "6px 10px" }}>{r.variety || ""}</td>
                <td style={{ padding: "6px 10px" }}>{r.size || ""}</td>
                <td style={{ padding: "6px 10px", fontSize: 11 }}>
                  {Object.keys(r.availability || {}).length > 0
                    ? Object.entries(r.availability).slice(0, 5).map(([k, v]) => `${weekLabel(k)}: ${v}`).join(", ")
                    : r.availabilityText || "—"}
                </td>
                <td style={{ padding: "6px 10px", color: "#7a8c74" }}>{r.comments || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {parsed.length > 10 && <div style={{ padding: "8px 10px", fontSize: 12, color: "#aabba0" }}>...and {parsed.length - 10} more</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds (will warn about unused imports until wired into App.jsx, that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/HouseplantAvailability.jsx
git commit -m "feat(houseplants): add availability search page with upload, preview, and mapping editor"
```

---

### Task 6: Wire Into App Navigation

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add import at top of file**

After the existing imports (around line 24, after `import SoilCalculator`):

```javascript
import HouseplantAvailability from "./HouseplantAvailability";
```

- [ ] **Step 2: Add nav group**

In the `NAV_GROUPS` array, add a new group after "combos" (after line 70):

```javascript
  {
    id: "houseplants", label: "Houseplants", icon: "🌿", solo: true,
  },
```

- [ ] **Step 3: Add page route**

In the page rendering section (around line 188, after the `{page === "soil"` line):

```javascript
        {page === "houseplants" && <HouseplantAvailability />}
```

- [ ] **Step 4: Verify build and test**

Run: `npm run build`
Expected: Build succeeds. Start with `npm start`, navigate to Houseplants tab — should show empty state with upload button.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(houseplants): wire availability page into app navigation"
```

---

## Chunk 3: Integration Testing with Real Data

### Task 7: Test with Real Express Seed File

This is a manual testing task — no code to write, just verification.

- [ ] **Step 1: Start dev server**

Run: `npm start`

- [ ] **Step 2: Navigate to Houseplants page**

Log in as admin, click the "Houseplants" nav item.

- [ ] **Step 3: Upload the Express Seed file**

Upload `Foliage Availability_3_30_26.xlsm`. Verify:
- All 18 supplier tabs appear in the preview
- Most show "Auto-mapped" status
- Row counts look reasonable (~3,500 total items)
- Sample plant names look correct

- [ ] **Step 4: Test mapping editor**

Click "Edit Mapping" on a supplier like AgriStarts or Casa Flora. Verify:
- Raw data preview shows the actual Excel content
- Config fields are pre-filled
- Parsed preview shows correctly parsed plant rows
- Changing a config field updates the parsed preview

- [ ] **Step 5: Import and verify search**

Click "Import All". Then verify:
- Search bar filters results as you type
- Typing "Aglaonema" shows results from multiple suppliers
- Broker filter dropdown works
- Week filter shows available weeks
- Pagination works for large result sets
- Sorting by clicking column headers works

- [ ] **Step 6: Test re-upload (replacement)**

Upload the same file again. Verify:
- Warning says "this will replace ALL existing Express Seed availability"
- After import, total count is the same (not doubled)
- Old data was fully replaced

- [ ] **Step 7: Fix any parsing issues**

If any supplier tab parses incorrectly:
1. Open mapping editor for that tab
2. Adjust the config fields based on the raw data preview
3. Verify parsed preview looks correct
4. Update the default config in `src/hpDefaultConfigs.js` if needed

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix(houseplants): adjust parsing configs based on real data testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Database schema | `supabase-schema.sql` |
| 2 | Supabase hooks | `src/supabase.js` |
| 3 | Excel parsing engine | `src/hpParsers.js` |
| 4 | Default supplier configs | `src/hpDefaultConfigs.js` |
| 5 | Main UI page | `src/HouseplantAvailability.jsx` |
| 6 | App nav wiring | `src/App.jsx` |
| 7 | Integration test with real data | Manual testing + fixes |

**After Phase 1 is complete, Kim can:**
- Upload the weekly Express Seed Excel file
- Search "Monstera" and see every supplier that has it, with week-by-week availability
- Filter by specific weeks to find what's available when she needs it
- Re-upload when new availability comes in (old data replaced)

**Phase 2 will add:** Pricing management, order workflow with Amanda's approval, production calendar, supplier requests, cost tracking, and Foremost Co / EHR support.
