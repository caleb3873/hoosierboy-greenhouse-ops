// order-recon.mjs — Supplier Order Reconciliation CLI (READ-ONLY)
// Thin wrapper over the shared logic in api/_sentinel-core.js.
//   node scripts/order-recon.mjs            (all orders)
//   node scripts/order-recon.mjs 9429649    (one order)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import core from "../api/_sentinel-core.js";
const { runOrderRecon, renderReconText } = core;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const only = process.argv[2];
console.log("📦 Supplier Order Reconciliation (read-only)\n");
const recon = await runOrderRecon(sb);
if (only) { recon.orders = recon.orders.filter(o => String(o.order) === String(only)); recon.mismatched = recon.orders.filter(o => o.delta !== 0).length; }
console.log(renderReconText(recon));
console.log("\n🔴 SHORT = supplier confirmed less than you ordered (chase them). 🟡 OVER = confirmed more than ordered (surplus).");
