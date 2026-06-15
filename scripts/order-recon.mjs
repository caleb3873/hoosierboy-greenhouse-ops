// order-recon.mjs — Supplier Order Reconciliation (READ-ONLY auditor)
// ---------------------------------------------------------------------------
// Loop "B" at its safe rung. After you apply a supplier acknowledgement to the
// Fall Program, this answers "did it reconcile?" — per order_number it compares
// what you ORDERED (sum of ord_qty) against what the supplier CONFIRMED
// (sum of qty × ppp), and flags the gaps so you can chase the supplier.
//
// It WRITES NOTHING. This is the verification half of the supplier-adjustment
// workflow — the apply still happens in the app (api/import-receiving-pdf.js).
// Promoting B to *propose/apply* changes is a later rung that needs your OK.
//
// Run:  node scripts/order-recon.mjs
//       node scripts/order-recon.mjs 9429649    (one order)
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const num = v => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const INACTIVE = new Set(["CANCELLED", "NEVER USED", "NOT NEEDED", "UNCLAIMED"]);

async function fetchAll(table, columns) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

async function run() {
  const only = process.argv[2]; // optional single order_number
  console.log("📦 Supplier Order Reconciliation (read-only)\n");
  const rows = (await fetchAll("fall_program_items", "order_number,variety,status,qty,ord_qty,ppp,extras"))
    .filter(r => r.order_number && (!only || String(r.order_number) === String(only)));

  // Group by order_number; ordered = Σ ord_qty, confirmed = Σ qty×ppp (active rows only).
  const orders = new Map();
  for (const r of rows) {
    const o = orders.get(r.order_number) || { ordered: 0, confirmed: 0, extras: 0, lines: 0, cancelled: 0, shortages: new Map() };
    o.lines++;
    if (INACTIVE.has(r.status)) { if (r.status === "CANCELLED") o.cancelled++; orders.set(r.order_number, o); continue; }
    const ordered = num(r.ord_qty);
    const confirmed = num(r.qty) * (num(r.ppp) || 1);
    o.ordered += ordered; o.confirmed += confirmed; o.extras += num(r.extras);
    if (ordered > 0 && confirmed < ordered) { // collapse bench-level rows per variety
      const e = o.shortages.get(r.variety) || { ordered: 0, confirmed: 0 };
      e.ordered += ordered; e.confirmed += confirmed; o.shortages.set(r.variety, e);
    }
    orders.set(r.order_number, o);
  }

  const list = [...orders.entries()].map(([order, o]) => ({ order, ...o, delta: o.ordered - o.confirmed }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const mismatched = list.filter(o => o.delta !== 0);
  console.log(`${list.length} order(s) · ${mismatched.length} with an ordered≠confirmed gap\n`);

  for (const o of list) {
    const flag = o.delta > 0 ? "🔴 SHORT" : o.delta < 0 ? "🟡 OVER" : "✅";
    console.log(`${flag}  Order ${o.order}  —  ordered ${o.ordered} · confirmed ${o.confirmed}` +
      `${o.delta ? ` · delta ${o.delta > 0 ? "+" : ""}${o.delta}` : ""}` +
      `${o.cancelled ? ` · ${o.cancelled} cancelled` : ""}${o.extras ? ` · ${o.extras} extras` : ""}  (${o.lines} lines)`);
    const shorts = [...o.shortages.entries()].map(([variety, s]) => ({ variety, ...s, short: s.ordered - s.confirmed })).sort((a, b) => b.short - a.short);
    shorts.slice(0, 8).forEach(s => console.log(`        ↳ ${s.variety}: ordered ${s.ordered}, confirmed ${s.confirmed} (short ${s.short})`));
    if (shorts.length > 8) console.log(`        ↳ …and ${shorts.length - 8} more short varieties`);
  }
  console.log("\n🔴 SHORT = supplier confirmed less than you ordered (chase them). 🟡 OVER = confirmed more than ordered (surplus).");
}

run().catch(e => { console.error("Recon crashed:", e); process.exit(1); });
