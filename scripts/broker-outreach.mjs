// broker-outreach.mjs — draft chase emails for supplier shortfalls (READ-ONLY).
// Thin wrapper over api/_sentinel-core.js. Per order with a supplier shortfall:
// the broker + contact, the short varieties, a suggested alternate broker, and a
// ready-to-send draft. Sends nothing — use /api/broker-email?order=<n> to send.
//   node scripts/broker-outreach.mjs            (summary of all)
//   node scripts/broker-outreach.mjs 9429649    (full draft for one order)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import core from "../api/_sentinel-core.js";
const { runBrokerOutreach, renderBrokerOutreachText } = core;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const only = process.argv[2];
console.log("📨 Broker shortage outreach (read-only drafts)\n");
const b = await runBrokerOutreach(sb);
if (only) {
  const o = b.orders.find(x => String(x.order) === String(only));
  if (!o) { console.log(`No shortfall on order ${only}.`); process.exit(0); }
  console.log(`To:      ${o.broker ? `${o.broker.rep} <${o.broker.email}>` : "(no contact on file for " + o.brokerName + ")"}`);
  if (o.alternate) console.log(`Backfill: ${o.alternate.name} — ${o.alternate.rep} <${o.alternate.email}> (grade ${o.alternate.grade})`);
  console.log(`Subject: ${o.draftSubject}\n`);
  console.log(o.draftBody);
} else {
  console.log(renderBrokerOutreachText(b));
}
