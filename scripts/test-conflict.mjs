// Verify the conflict-detection logic against the live DB: insert a request,
// then simulate the modal computing conflicts for various date/window combos.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8")
  .split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

function toCamel(o) { if (!o) return o; return Object.fromEntries(Object.entries(o).map(([k,v]) => [k.replace(/_([a-z])/g, (_,c) => c.toUpperCase()), v])); }
function windowsOverlap(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  if (a === "all_day" || b === "all_day") return true;
  return false;
}
function findDriverConflict(requests, { driverName, date, timeWindow, excludeId }) {
  if (!driverName || driverName === "any" || !date) return null;
  return (requests || []).find(r =>
    r.id !== excludeId &&
    (r.status === "pending" || r.status === "accepted") &&
    r.requestedDriver === driverName &&
    r.deliveryDate === date &&
    windowsOverlap(r.timeWindow, timeWindow)
  ) || null;
}
const pass = m => console.log(`  ✓ ${m}`);
const fail = m => { console.log(`  ✗ ${m}`); process.exitCode = 1; };

console.log("\n══════════ CONFLICT DETECTION TEST ══════════\n");

const driver = "TEST_Dave_Conflict";
const date = "2026-07-04";
const seedId = randomUUID();

console.log("SETUP — insert a pending request for Dave on 2026-07-04 AM");
await sb.from("driver_requests").upsert({
  id: seedId, delivery_date: date, time_window: "am", start_time: "07:00",
  requested_by: "TEST_Tyler", requested_driver: driver, status: "pending",
});
const { data: rows } = await sb.from("driver_requests").select("*").eq("requested_driver", driver);
const requests = (rows || []).map(toCamel);
pass(`seeded — ${requests.length} request(s) exist for ${driver}`);

console.log("\nCASE 1: same driver, same date, same window (AM) → should conflict");
{
  const c = findDriverConflict(requests, { driverName: driver, date, timeWindow: "am", excludeId: randomUUID() });
  if (c) pass(`detected: ${c.timeWindow} request by ${c.requestedBy}`);
  else fail("no conflict found — SHOULD block");
}

console.log("\nCASE 2: same driver, same date, ALL DAY → should conflict (overlaps AM)");
{
  const c = findDriverConflict(requests, { driverName: driver, date, timeWindow: "all_day", excludeId: randomUUID() });
  if (c) pass("detected all_day overlap with AM");
  else fail("no conflict found — all_day should overlap AM");
}

console.log("\nCASE 3: same driver, same date, PM → should NOT conflict (AM ≠ PM)");
{
  const c = findDriverConflict(requests, { driverName: driver, date, timeWindow: "pm", excludeId: randomUUID() });
  if (!c) pass("no conflict — AM and PM are independent");
  else fail(`unexpected conflict: ${c.timeWindow}`);
}

console.log("\nCASE 4: same driver, DIFFERENT date → should NOT conflict");
{
  const c = findDriverConflict(requests, { driverName: driver, date: "2026-07-05", timeWindow: "am", excludeId: randomUUID() });
  if (!c) pass("no conflict on different date");
  else fail("unexpected cross-date conflict");
}

console.log("\nCASE 5: DIFFERENT driver, same slot → should NOT conflict");
{
  const c = findDriverConflict(requests, { driverName: "Some Other Driver", date, timeWindow: "am", excludeId: randomUUID() });
  if (!c) pass("no conflict for a different driver");
  else fail("unexpected conflict for different driver");
}

console.log("\nCASE 6: excludeId matches → should ignore self (editing own request)");
{
  const c = findDriverConflict(requests, { driverName: driver, date, timeWindow: "am", excludeId: seedId });
  if (!c) pass("self-exclusion works (no false positive editing existing)");
  else fail("self-conflict: blocked editing own request");
}

console.log("\nCASE 7: existing request is declined → should NOT conflict");
{
  await sb.from("driver_requests").update({ status: "declined" }).eq("id", seedId);
  const { data: rows2 } = await sb.from("driver_requests").select("*").eq("requested_driver", driver);
  const c = findDriverConflict((rows2 || []).map(toCamel), { driverName: driver, date, timeWindow: "am", excludeId: randomUUID() });
  if (!c) pass("declined requests don't block re-asking");
  else fail("declined request still blocked — should allow re-request");
}

console.log("\nCASE 8: existing request is accepted → still conflicts");
{
  await sb.from("driver_requests").update({ status: "accepted", accepted_by: driver }).eq("id", seedId);
  const { data: rows2 } = await sb.from("driver_requests").select("*").eq("requested_driver", driver);
  const c = findDriverConflict((rows2 || []).map(toCamel), { driverName: driver, date, timeWindow: "am", excludeId: randomUUID() });
  if (c && c.status === "accepted") pass("accepted requests still block (driver already booked)");
  else fail("accepted request didn't block — should still conflict");
}

console.log("\nCLEANUP");
await sb.from("driver_requests").delete().eq("id", seedId);
pass("seed deleted");

console.log("\n══════════ DONE ══════════");
console.log(process.exitCode === 1 ? "\n⚠ Some checks failed.\n" : "\n✓ All checks passed.\n");
