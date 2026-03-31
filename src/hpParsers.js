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
  const upper = s.toUpperCase();
  const categoryWords = ["FOLIAGE", "TROPICALS", "CARNIVOROUS", "FERNS", "SUCCULENTS",
    "CACTI", "AVAILABILITY", "CONT'D", "Cont'd"];
  return categoryWords.some(w => upper.includes(w)) && !s.includes("'") && s.split(" ").length <= 4;
}

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
