// End-to-end test of the driver request flow against the live DB using the
// anon key — same path the React app uses. Verifies:
//   1. Manager-side upsert (DriverRequestModal)
//   2. Public read by id (DriverResponseView load)
//   3. Public update with comment + decision_seen=false (DriverResponseView submit)
//   4. Manager-side query of unseen responses (useDriverResponsePopup)
//   5. Manager-side dismiss = mark decision_seen=true (popup close)
//   6. Driver availability upsert + remove (DriverHub toggleAvailability)
//   7. Floor_codes phone lookup (DriverRequestModal driver list + DriverHub manager phones)
// Cleans up everything it creates.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; })
);

const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

// Same camel/snake helpers the app uses (simplified)
function toSnake(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k.replace(/([A-Z])/g, "_$1").toLowerCase(), v]));
}
function toCamel(obj) {
  if (!obj) return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
}

const pass = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, err) => { console.log(`  ✗ ${msg}`); if (err) console.log("    →", err.message || err); process.exitCode = 1; };

console.log("\n══════════ DRIVER FLOW INTEGRATION TEST ══════════\n");

// ─── Step 1: manager creates a request (mirrors DriverRequestModal.submit) ───
console.log("STEP 1 — Manager submits driver request");
const reqId = randomUUID();
const reqPayload = toSnake({
  id: reqId,
  deliveryDate: "2026-06-15",
  timeWindow: "am",
  startTime: "07:00",
  requestedBy: "TEST_Tyler",
  requestedDriver: "TEST_Dave",
  details: "8am pickup, 3 stops",
  status: "pending",
  createdAt: new Date().toISOString(),
});
{
  const { data, error } = await sb.from("driver_requests").upsert(reqPayload).select().single();
  if (error) fail("upsert driver_request", error);
  else {
    pass(`upsert returned row id=${data.id}`);
    if (data.requested_by === "TEST_Tyler") pass("requested_by saved");
    else fail("requested_by mismatch");
    if (data.delivery_date === "2026-06-15") pass("delivery_date saved");
    else fail("delivery_date mismatch");
    if (data.details === "8am pickup, 3 stops") pass("details saved");
    else fail("details mismatch");
    if (data.status === "pending") pass("status defaulted/saved to pending");
    else fail("status not pending");
    if (data.time_window === "am") pass("time_window=am persisted");
    else fail(`time_window=${data.time_window}`);
    if (data.start_time === "07:00") pass("start_time=07:00 persisted");
    else fail(`start_time=${data.start_time}`);
  }
}

// ─── Step 2: public link load (mirrors DriverResponseView useEffect) ───
console.log("\nSTEP 2 — Public link load (no auth, just request id)");
{
  const { data, error } = await sb.from("driver_requests").select("*").eq("id", reqId).single();
  if (error) fail("read by id", error);
  else {
    pass("public read by id works");
    if (data.driver_comment === null) pass("driver_comment is null initially");
    if (data.decision_seen === false) pass("decision_seen defaults to false");
    else fail(`decision_seen=${data.decision_seen} (expected false)`);
  }
}

// ─── Step 3: driver submits accept + comment ───
console.log("\nSTEP 3 — Driver accepts via public link + adds comment");
{
  const update = {
    status: "accepted",
    accepted_by: "TEST_Dave Schoettmer",
    accepted_at: new Date().toISOString(),
    driver_comment: "Can do it but need to be done by 3pm",
    decision_seen: false,
  };
  const { error } = await sb.from("driver_requests").update(update).eq("id", reqId);
  if (error) fail("driver update", error);
  else {
    pass("update with status+comment succeeded");
    const { data } = await sb.from("driver_requests").select("*").eq("id", reqId).single();
    if (data.status === "accepted") pass("status=accepted persisted");
    else fail(`status=${data.status}`);
    if (data.driver_comment === "Can do it but need to be done by 3pm") pass("driver_comment persisted");
    else fail(`driver_comment=${data.driver_comment}`);
    if (data.accepted_by === "TEST_Dave Schoettmer") pass("accepted_by persisted");
    else fail("accepted_by missing");
    if (data.accepted_at) pass("accepted_at timestamp set");
    if (data.decision_seen === false) pass("decision_seen=false (will pop on manager next open)");
    else fail(`decision_seen=${data.decision_seen}`);
  }
}

// ─── Step 4: manager hub queries for unseen responses ───
console.log("\nSTEP 4 — Manager next-open: query unseen responses");
{
  const { data, error } = await sb.from("driver_requests").select("*")
    .eq("requested_by", "TEST_Tyler").eq("decision_seen", false).in("status", ["accepted", "declined"]);
  if (error) fail("popup query", error);
  else {
    const found = (data || []).find(r => r.id === reqId);
    if (found) {
      pass(`popup query returned 1 unseen response`);
      const cam = toCamel(found);
      if (cam.driverComment === "Can do it but need to be done by 3pm") pass("camelCase driverComment available on client");
      else fail(`driverComment after toCamel: ${cam.driverComment}`);
      if (cam.acceptedBy === "TEST_Dave Schoettmer") pass("camelCase acceptedBy available on client");
    } else fail("manager popup query returned 0 rows");
  }
}

// ─── Step 5: manager dismisses popup → decision_seen=true ───
console.log("\nSTEP 5 — Manager dismisses popup");
{
  const { error } = await sb.from("driver_requests").update({ decision_seen: true }).eq("id", reqId);
  if (error) fail("dismiss update", error);
  else {
    const { data } = await sb.from("driver_requests").select("decision_seen").eq("id", reqId).single();
    if (data.decision_seen === true) pass("decision_seen=true persisted, popup won't refire");
    else fail(`decision_seen=${data.decision_seen}`);
  }
}

// ─── Step 6: driver availability toggle ───
console.log("\nSTEP 6 — Driver marks availability");
const availId = randomUUID();
{
  const payload = toSnake({ id: availId, driverName: "TEST_Dave", availableDate: "2026-06-15" });
  const { error } = await sb.from("driver_availability").upsert(payload);
  if (error) fail("avail upsert", error);
  else {
    pass("availability upsert OK");
    const { data } = await sb.from("driver_availability").select("*").eq("id", availId).single();
    if (data?.driver_name === "TEST_Dave" && data?.available_date === "2026-06-15") pass("availability row persisted");
    else fail("availability mismatch", data);
  }
  const { error: delErr } = await sb.from("driver_availability").delete().eq("id", availId);
  if (delErr) fail("avail delete (toggle off)", delErr);
  else pass("delete OK (toggling off works)");
}

// ─── Step 7: floor_codes phone lookup ───
console.log("\nSTEP 7 — Phone lookup from floor_codes (anon read)");
{
  const { data, error } = await sb.from("floor_codes").select("worker_name,phone,title")
    .eq("active", true).limit(5);
  if (error) fail("anon read floor_codes", error);
  else {
    pass(`anon read returned ${data.length} active codes`);
    const withPhone = data.filter(r => r.phone);
    if (withPhone.length > 0) {
      pass(`${withPhone.length}/${data.length} have phone numbers populated`);
      console.log(`    sample: ${withPhone[0].worker_name} (${withPhone[0].title}) → ${withPhone[0].phone}`);
    } else {
      fail("NO floor_codes rows have a phone column populated — Call/Text buttons will not render");
    }
    const drivers = data.filter(r => (r.title || "").toUpperCase() === "SEASONAL DRIVER");
    console.log(`    drivers in first 5 rows: ${drivers.length} (expected: at least some)`);
  }
}

// ─── Step 8: bonus — what if a different anon also reads request? ───
console.log("\nSTEP 8 — Verify driver public-link read works with no session");
{
  const fresh = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
  const { data, error } = await fresh.from("driver_requests").select("*").eq("id", reqId).single();
  if (error) fail("fresh anon read", error);
  else if (data?.id === reqId) pass("fresh anon (mirrors driver opening link cold) can read the request");
}

// ─── Cleanup ───
console.log("\nCLEANUP");
{
  const { error } = await sb.from("driver_requests").delete().eq("id", reqId);
  if (error) fail("cleanup driver_request", error);
  else pass("test request deleted");
}

console.log("\n══════════ DONE ══════════");
if (process.exitCode === 1) console.log("\n⚠ Some checks failed — review output above.\n");
else console.log("\n✓ All checks passed.\n");
