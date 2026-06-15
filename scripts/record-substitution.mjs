// record-substitution.mjs — record "SUBSTITUTE replaces ORIGINAL" on an order.
// Sets substituted_from=ORIGINAL on the substitute's rows (so production/tags follow
// the substitute and plant-availability nets the coverage), and cancels + zeroes the
// shorted original (don't pot/tag it). Read-only preview by default.
//
//   node scripts/record-substitution.mjs <order> "<SUBSTITUTE>" "<ORIGINAL>"          (preview)
//   node scripts/record-substitution.mjs <order> "<SUBSTITUTE>" "<ORIGINAL>" --apply  (write)
//   e.g. node scripts/record-substitution.mjs 9429649 "Paradiso Bronze" "Paradiso Pink" --apply
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const [order, substitute, original] = process.argv.slice(2).filter(a => a !== "--apply");
const APPLY = process.argv.includes("--apply");
if (!order || !substitute || !original) {
  console.log('Usage: node scripts/record-substitution.mjs <order> "<SUBSTITUTE>" "<ORIGINAL>" [--apply]');
  process.exit(1);
}

const { data: rows, error } = await sb.from("fall_program_items")
  .select("id,variety,qty,ord_qty,status,substituted_from").eq("order_number", order);
if (error) { console.error("read failed:", error.message); process.exit(1); }
const subRows = rows.filter(r => (r.variety || "").toUpperCase().includes(substitute.toUpperCase()));
const origRows = rows.filter(r => (r.variety || "").toUpperCase().includes(original.toUpperCase()));

console.log(`🔁 Substitution on order ${order}: "${substitute}" replaces "${original}"`);
console.log(`   ⚠ Like-for-like: Fall/Winter subs must be the same crop type (a mum for a mum). Spring has more flexibility.\n`);
console.log(`Substitute rows (${subRows.length}) → set substituted_from="${original.toUpperCase()}":`);
subRows.forEach(r => console.log(`   ${r.variety} (qty ${r.qty}, ord ${r.ord_qty})`));
console.log(`\nOriginal rows (${origRows.length}) → CANCELLED, qty 0 (don't pot/tag):`);
origRows.forEach(r => console.log(`   ${r.variety} (qty ${r.qty}, ord ${r.ord_qty}, status ${r.status || "—"})`));

if (!subRows.length || !origRows.length) { console.log("\n⚠ Couldn't find both varieties on this order — check the names."); process.exit(1); }
if (!APPLY) { console.log("\n(preview — re-run with --apply to write)"); process.exit(0); }

let done = 0;
for (const r of subRows) { const { error: e } = await sb.from("fall_program_items").update({ substituted_from: original.toUpperCase() }).eq("id", r.id); if (!e) done++; else console.log("✖", r.id, e.message); }
for (const r of origRows) { const { error: e } = await sb.from("fall_program_items").update({ status: "CANCELLED", qty: 0 }).eq("id", r.id); if (!e) done++; else console.log("✖", r.id, e.message); }
console.log(`\n✅ Recorded: ${subRows.length} substitute row(s) linked, ${origRows.length} original row(s) cancelled. (${done} writes)`);
