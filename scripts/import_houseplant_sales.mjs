#!/usr/bin/env node
// Import houseplant sales history from xlsx files. Supports BOTH formats:
//
// Format A (aggregated monthly, like "Houseplants 2023.xlsx"):
//   Columns: DATE | Product Code | Product Description | Qty Sold | Sold $ Value
//   One row per (month, product). DATE = "Jan-23", "Feb-23", etc.
//
// Format B (transactional line items, like "september 2024.xlsx"):
//   Columns: ProductDesc | CustomerName | Type | DeliveryDate | DateModified |
//            OrderNo | InvoiceNo | ShipVia | Rep | UOM | Qnty | Pack | TotalQnty | Price
//   One row per order line. Aggregated by month + product before insert.
//
// Usage: node scripts/import_houseplant_sales.mjs <path-or-dir> [--dry]
//   - If <path-or-dir> is a folder, ALL xlsx files in it are processed.
//   - If --dry, parses + prints summary but doesn't insert.
//
// Reads SUPABASE creds from .env.local in the repo root.

import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = fs.readFileSync(envPath, "utf8").split("\n").reduce((a, l) => {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) a[m[1]] = m[2];
  return a;
}, {});
const url = env.REACT_APP_SUPABASE_URL;
const key = env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) { console.error("Missing supabase env"); process.exit(1); }
const sb = createClient(url, key);

const argPath = process.argv[2];
const dry = process.argv.includes("--dry");
if (!argPath) { console.error("Usage: import_houseplant_sales.mjs <path-or-dir> [--dry]"); process.exit(1); }
if (!fs.existsSync(argPath)) { console.error("Path not found:", argPath); process.exit(1); }

const stat = fs.statSync(argPath);
const files = stat.isDirectory()
  ? fs.readdirSync(argPath).filter(f => f.endsWith(".xlsx") && !f.startsWith("~$")).map(f => path.join(argPath, f))
  : [argPath];
console.log(`Processing ${files.length} file(s):\n  ${files.map(f => path.basename(f)).join("\n  ")}\n`);

const MONTH = { Jan:"01", Feb:"02", Mar:"03", Apr:"04", May:"05", Jun:"06", Jul:"07", Aug:"08", Sep:"09", Oct:"10", Nov:"11", Dec:"12" };

function parseDate(d) {
  if (!d) return null;
  // "Jan-23" → "2023-01-01"
  const m = String(d).trim().match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const mo = MONTH[m[1]];
    if (!mo) return null;
    const yr = m[2].length === 2 ? "20" + m[2] : m[2];
    return `${yr}-${mo}-01`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(d)) return d + "-01";
  return null;
}

// Derive a stable synthetic code from description + pot_size when source is missing one.
// Format: DERIV-{POTBLOB}{TRUNC} (e.g., DERIV-6MONSTERADELI) — deterministic, max 24 chars.
function deriveCode(desc, pot) {
  const s = (pot + " " + (desc || "")).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ("DERIV" + s).slice(0, 24);
}

function extractPot(desc) {
  if (!desc) return null;
  const s = String(desc);
  const hb = s.match(/^HB \d+(\.\d+)?"\s*/i);
  if (hb) return hb[0].trim();
  const m = s.match(/^\d+(\.\d+)?"\s*/);
  if (m) return m[0].trim();
  return null;
}

// Parse a transactional date like "9/25/2024" or "9/25/24" → "YYYY-MM-01"
function parseDeliveryDate(d) {
  if (!d) return null;
  const m = String(d).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const mo = String(parseInt(m[1])).padStart(2, "0");
  const yr = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${yr}-${mo}-01`;
}

function parseFileFormatA(rows, fname) {
  // Find header row: must contain "qty" + "description" (the 2023/Jan-Aug-2024 style)
  // Header may or may not include "date" — date is always col 0 in this format
  let header = null, headerIdx = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i] || [];
    const hasQty  = r.some(c => /qty/i.test(String(c || "")));
    const hasDesc = r.some(c => /description/i.test(String(c || "")));
    if (hasQty && hasDesc) { header = r; headerIdx = i; break; }
  }
  if (!header) return null;
  const colIdx = {
    code: header.findIndex(c => /product code/i.test(String(c || ""))),
    desc: header.findIndex(c => /description/i.test(String(c || ""))),
    qty:  header.findIndex(c => /qty/i.test(String(c || ""))),
    val:  header.findIndex(c => /value/i.test(String(c || ""))),
  };
  const dateIdx = header.findIndex(c => /date/i.test(String(c || "")));
  // If header has no DATE column, date lives at col 0 (the header is shifted/missing)
  const dateCol = dateIdx >= 0 ? dateIdx : 0;
  // Shift other cols by +1 if the header is missing the DATE column
  if (dateIdx < 0) {
    colIdx.code = colIdx.code >= 0 ? colIdx.code + 1 : -1;
    colIdx.desc = colIdx.desc >= 0 ? colIdx.desc + 1 : -1;
    colIdx.qty  = colIdx.qty  >= 0 ? colIdx.qty  + 1 : -1;
    colIdx.val  = colIdx.val  >= 0 ? colIdx.val  + 1 : -1;
  }
  console.log(`  [Format A] ${fname} cols:`, { date: dateCol, ...colIdx });
  const recs = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every(c => !c)) continue;
    const dateRaw = r[dateCol];
    if (!dateRaw || /^date$/i.test(String(dateRaw))) continue;
    const period = parseDate(dateRaw);
    if (!period) continue;
    const code = r[colIdx.code] ? String(r[colIdx.code]).trim() : null;
    const desc = r[colIdx.desc] ? String(r[colIdx.desc]).trim() : null;
    if (!code && !desc) continue;
    const qty = r[colIdx.qty];
    const val = r[colIdx.val];
    const qtyNum = qty == null ? 0 : parseFloat(String(qty).replace(/[,\$]/g, ""));
    const valNum = val == null ? 0 : parseFloat(String(val).replace(/[,\$]/g, ""));
    if (!isFinite(qtyNum)) continue;
    recs.push({
      period,
      product_code: code,
      description: desc,
      pot_size: extractPot(desc),
      qty_sold: Math.round(qtyNum),
      sold_value: isFinite(valNum) ? valNum : 0,
    });
  }
  return recs;
}

function parseFileFormatB(rows, fname) {
  // Header has ProductDesc + TotalQnty + DeliveryDate + Price
  let header = null, headerIdx = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const r = rows[i] || [];
    const headers = r.map(c => String(c || "").toLowerCase());
    if (headers.includes("productdesc") && headers.some(c => c.includes("totalqnty"))) {
      header = r; headerIdx = i; break;
    }
  }
  if (!header) return null;
  const findCol = (rx) => header.findIndex(c => rx.test(String(c || "")));
  const colIdx = {
    desc:  findCol(/^productdesc$/i),
    deliv: findCol(/deliverydate/i),
    qty:   findCol(/totalqnty/i),
    price: findCol(/^price$/i),
  };
  console.log(`  [Format B] ${fname} cols:`, colIdx);
  // Aggregate by (period, ProductDesc) since each line is one order
  const agg = {};
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every(c => !c)) continue;
    const desc = r[colIdx.desc] ? String(r[colIdx.desc]).trim() : null;
    if (!desc) continue;
    const period = parseDeliveryDate(r[colIdx.deliv]);
    if (!period) continue;
    const qty = parseFloat(String(r[colIdx.qty] || "0").replace(/[,\$]/g, ""));
    const val = parseFloat(String(r[colIdx.price] || "0").replace(/[,\$]/g, ""));
    if (!isFinite(qty)) continue;
    const key = `${period}__${desc}`;
    if (!agg[key]) {
      const pot = extractPot(desc);
      agg[key] = { period, description: desc, pot_size: pot, product_code: deriveCode(desc, pot), qty_sold: 0, sold_value: 0 };
    }
    agg[key].qty_sold += Math.round(qty);
    agg[key].sold_value += isFinite(val) ? val : 0;
  }
  return Object.values(agg);
}

const records = [];
for (const file of files) {
  const fname = path.basename(file);
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });
  // Try Format B first (more specific header), fall back to A
  let recs = parseFileFormatB(rows, fname);
  if (!recs) recs = parseFileFormatA(rows, fname);
  if (!recs) { console.warn(`  ⚠ ${fname}: no recognized format, skipping`); continue; }
  console.log(`  → ${fname}: ${recs.length} rows`);
  records.push(...recs);
}
console.log(`\nTotal parsed: ${records.length} rows across ${files.length} file(s)`);

if (records.length === 0) process.exit(0);

// Show sample
console.log("Sample 3:", records.slice(0, 3));

if (dry) {
  console.log("DRY RUN — not inserting");
  process.exit(0);
}

// Check for existing rows for this year (avoid double-import)
const years = Array.from(new Set(records.map(r => r.period.slice(0, 4))));
for (const yr of years) {
  const start = yr + "-01-01", end = yr + "-12-31";
  const { count } = await sb.from("houseplant_sales_history")
    .select("*", { count: "exact", head: true })
    .gte("period", start).lte("period", end);
  if (count && count > 0) {
    console.error(`⚠ Found ${count} existing rows for year ${yr}. Delete them first or this will double-count. Aborting.`);
    process.exit(1);
  }
}

// Insert in chunks of 500
const chunkSize = 500;
let inserted = 0;
for (let i = 0; i < records.length; i += chunkSize) {
  const chunk = records.slice(i, i + chunkSize);
  const { error, data } = await sb.from("houseplant_sales_history").insert(chunk).select("id", { count: "exact" });
  if (error) {
    console.error("Insert error at chunk", i, error);
    process.exit(1);
  }
  inserted += chunk.length;
  process.stdout.write(`\rinserted ${inserted}/${records.length}`);
}
console.log(`\n✓ Inserted ${inserted} rows`);
