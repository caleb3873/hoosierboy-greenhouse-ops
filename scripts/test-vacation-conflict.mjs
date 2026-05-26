// Verify the vacation conflict panel logic — seed two overlapping requests
// and confirm overlapsFor returns the right matches.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8")
  .split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

function toCamel(o) { if (!o) return o; return Object.fromEntries(Object.entries(o).map(([k,v]) => [k.replace(/_([a-z])/g, (_,c) => c.toUpperCase()), v])); }
function overlapsWindow(req, ws, we) { return req.startDate <= we && req.endDate >= ws; }
function overlapsFor(rows, req) {
  return (rows || []).filter(r =>
    r.id !== req.id &&
    (r.status === "approved" || r.status === "pending") &&
    r.requesterName !== req.requesterName &&
    overlapsWindow(r, req.startDate, req.endDate)
  );
}

const pass = m => console.log(`  ✓ ${m}`);
const fail = m => { console.log(`  ✗ ${m}`); process.exitCode = 1; };

console.log("\n══════════ VACATION CONFLICT PANEL TEST ══════════\n");

const alex = { id: randomUUID(), requester_name: "TEST_Alex", start_date: "2026-05-29", end_date: "2026-05-29", status: "pending" };
const evie = { id: randomUUID(), requester_name: "TEST_Evie", start_date: "2026-05-29", end_date: "2026-05-29", status: "pending" };
const sam  = { id: randomUUID(), requester_name: "TEST_Sam",  start_date: "2026-05-27", end_date: "2026-05-30", status: "approved", approver: "TEST_Trish" };
const bob  = { id: randomUUID(), requester_name: "TEST_Bob",  start_date: "2026-06-15", end_date: "2026-06-15", status: "pending" };

console.log("SETUP — Alex (pending May 29), Evie (pending May 29), Sam (approved May 27-30), Bob (pending Jun 15)");
await sb.from("vacation_requests").upsert([alex, evie, sam, bob]);
const { data: rawRows } = await sb.from("vacation_requests").select("*").in("id", [alex.id, evie.id, sam.id, bob.id]);
const rows = (rawRows || []).map(toCamel);
pass(`seeded ${rows.length} rows`);

console.log("\nApprover viewing Alex's request — should see Evie (pending) and Sam (approved)");
const alexReq = rows.find(r => r.id === alex.id);
const alexOverlaps = overlapsFor(rows, alexReq);
const names = alexOverlaps.map(r => `${r.requesterName}/${r.status}`).sort();
if (names.length === 2 && names.includes("TEST_Evie/pending") && names.includes("TEST_Sam/approved")) {
  pass(`returned: ${names.join(", ")}`);
} else {
  fail(`expected [TEST_Evie/pending, TEST_Sam/approved], got: ${names.join(", ")}`);
}

console.log("\nApprover viewing Evie's request — should also see Alex + Sam");
const evieReq = rows.find(r => r.id === evie.id);
const evieOverlaps = overlapsFor(rows, evieReq);
const enames = evieOverlaps.map(r => `${r.requesterName}/${r.status}`).sort();
if (enames.length === 2 && enames.includes("TEST_Alex/pending") && enames.includes("TEST_Sam/approved")) {
  pass(`returned: ${enames.join(", ")}`);
} else {
  fail(`expected [TEST_Alex/pending, TEST_Sam/approved], got: ${enames.join(", ")}`);
}

console.log("\nApprover viewing Bob's request (Jun 15) — should see NO overlaps");
const bobReq = rows.find(r => r.id === bob.id);
const bobOverlaps = overlapsFor(rows, bobReq);
if (bobOverlaps.length === 0) pass("isolated request shows no false overlaps");
else fail(`unexpected overlaps: ${bobOverlaps.map(r => r.requesterName).join(", ")}`);

console.log("\nDeclined requests should NOT trigger overlap warnings");
{
  await sb.from("vacation_requests").update({ status: "declined" }).eq("id", evie.id);
  const { data: rRows } = await sb.from("vacation_requests").select("*").in("id", [alex.id, evie.id, sam.id]);
  const refreshed = (rRows || []).map(toCamel);
  const aReq = refreshed.find(r => r.id === alex.id);
  const aOverlaps = overlapsFor(refreshed, aReq);
  const ns = aOverlaps.map(r => `${r.requesterName}/${r.status}`);
  if (!ns.some(n => n.startsWith("TEST_Evie"))) pass("declined Evie no longer appears");
  else fail(`declined request showed in overlaps: ${ns.join(", ")}`);
}

console.log("\nCLEANUP");
await sb.from("vacation_requests").delete().in("id", [alex.id, evie.id, sam.id, bob.id]);
pass("test rows deleted");

console.log("\n══════════ DONE ══════════");
console.log(process.exitCode === 1 ? "\n⚠ Some checks failed.\n" : "\n✓ All checks passed.\n");
