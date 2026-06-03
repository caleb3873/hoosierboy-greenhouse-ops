#!/usr/bin/env node
// Import houseplant sales history from an xlsx file like "Houseplants 2023.xlsx".
// Expected columns: DATE | Product Code | Product Description | Qty Sold | Sold $ Value
// DATE format: "Jan-23", "Feb-23", etc.
//
// Usage: node scripts/import_houseplant_sales.mjs <path-to-xlsx> [--dry]
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

const filePath = process.argv[2];
const dry = process.argv.includes("--dry");
if (!filePath) { console.error("Usage: import_houseplant_sales.mjs <xlsx> [--dry]"); process.exit(1); }
if (!fs.existsSync(filePath)) { console.error("File not found:", filePath); process.exit(1); }

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

function extractPot(desc) {
  if (!desc) return null;
  const s = String(desc);
  const hb = s.match(/^HB \d+(\.\d+)?"\s*/i);
  if (hb) return hb[0].trim();
  const m = s.match(/^\d+(\.\d+)?"\s*/);
  if (m) return m[0].trim();
  return null;
}

const wb = xlsx.readFile(filePath);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null });

// Find header row + column indices
let header = null, headerIdx = -1;
for (let i = 0; i < Math.min(20, rows.length); i++) {
  const r = rows[i] || [];
  const hasDate = r.some(c => /date/i.test(String(c || "")));
  const hasQty  = r.some(c => /qty/i.test(String(c || "")));
  if (hasDate && hasQty) { header = r; headerIdx = i; break; }
}
if (!header) { console.error("No header row found"); process.exit(1); }
const colIdx = {
  date: header.findIndex(c => /date/i.test(String(c || ""))),
  code: header.findIndex(c => /product code/i.test(String(c || ""))),
  desc: header.findIndex(c => /description/i.test(String(c || ""))),
  qty:  header.findIndex(c => /qty/i.test(String(c || ""))),
  val:  header.findIndex(c => /value/i.test(String(c || ""))),
};
console.log("Header:", header);
console.log("Column indices:", colIdx);

const records = [];
const skipped = { noDate: 0, noQty: 0, dupRow: 0 };
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i] || [];
  if (r.every(c => !c)) continue;
  const dateRaw = r[colIdx.date];
  if (!dateRaw || /^date$/i.test(String(dateRaw))) { skipped.noDate++; continue; }
  const period = parseDate(dateRaw);
  if (!period) { skipped.noDate++; continue; }
  const code = r[colIdx.code] ? String(r[colIdx.code]).trim() : null;
  const desc = r[colIdx.desc] ? String(r[colIdx.desc]).trim() : null;
  const qty = r[colIdx.qty];
  const val = r[colIdx.val];
  if (!code && !desc) continue;
  const qtyNum = qty == null ? 0 : parseFloat(String(qty).replace(/[,\$]/g, ""));
  const valNum = val == null ? 0 : parseFloat(String(val).replace(/[,\$]/g, ""));
  if (!isFinite(qtyNum)) { skipped.noQty++; continue; }
  records.push({
    period,
    product_code: code,
    description: desc,
    pot_size: extractPot(desc),
    qty_sold: Math.round(qtyNum),
    sold_value: isFinite(valNum) ? valNum : 0,
  });
}
console.log(`Parsed ${records.length} rows (skipped ${JSON.stringify(skipped)})`);

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
