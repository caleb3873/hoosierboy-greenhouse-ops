// Extract name → phone from the staff spreadsheet so we can backfill floor_codes.phone
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";

const wb = XLSX.read(readFileSync("/Users/caleb/Desktop/SUMMER EXCEL 2.xlsx"), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

console.log("Sheet name:", wb.SheetNames[0]);
console.log("First 6 rows raw:");
rows.slice(0, 6).forEach((r, i) => console.log(`  ${i}:`, JSON.stringify(r)));

// Try to detect the column layout
const header = rows[0].map(c => String(c || "").trim().toLowerCase());
console.log("\nHeader columns:", header);

const phoneIdx = header.findIndex(c => c.includes("phone") || c.includes("number"));
const nameIdx = header.findIndex(c => c === "name" || c.includes("first") || c.includes("staff"));
console.log("name col idx:", nameIdx, "  phone col idx:", phoneIdx);

// Sheet has no header row — every row is data. Cols: name, phone, title, dept, group, language
const result = [];
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const name = String(r[0] || "").trim();
  const phoneRaw = String(r[1] || "").trim();
  if (!name || !phoneRaw) continue;
  const digits = phoneRaw.replace(/\D/g, "");
  if (digits.length < 10) continue;
  // Normalize to digits-only (10 digits expected for US)
  result.push({ name, phone: digits.slice(-10) });
}
console.log(`\nExtracted ${result.length} name+phone pairs.`);
result.slice(0, 5).forEach(r => console.log(`  ${r.name} → ${r.phone}`));
writeFileSync(new URL("./phones.json", import.meta.url), JSON.stringify(result, null, 2));
console.log("\nWrote scripts/phones.json");
