// Verify the Company Announcement + Message Trish split paths persist to DB.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8")
  .split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m, e) => { console.log(`  ✗ ${m}`); if (e) console.log("    →", e.message || e); process.exitCode = 1; };

console.log("\n══════════ MESSAGES SPLIT TEST ══════════\n");

console.log("STEP A — Announcement upsert (Company Announcement card path)");
const annId = randomUUID();
{
  const { data, error } = await sb.from("announcements").upsert({
    id: annId,
    message: "TEST — staff meeting moved to Friday",
    priority: "normal",
    active: true,
    posted_by: "TEST_Tyler",
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) fail("announcement upsert", error);
  else {
    pass(`saved id=${data.id}`);
    if (data.message === "TEST — staff meeting moved to Friday") pass("message persisted");
    if (data.active === true) pass("active=true persisted");
    if (data.posted_by === "TEST_Tyler") pass("posted_by persisted");
  }
}

console.log("\nSTEP B — Anon read (worker / driver / labor view all use anon)");
{
  const { data, error } = await sb.from("announcements").select("*")
    .eq("id", annId).single();
  if (error) fail("anon announcement read", error);
  else pass(`anon read succeeded, posted_by=${data.posted_by}`);
}

console.log("\nSTEP C — HR message insert (Message Trish path)");
const hrId = randomUUID();
{
  // Mirrors HrComposeModal.upsert payload — { fromName, message } → { from_name, message }
  const { data, error } = await sb.from("hr_messages").upsert({
    id: hrId,
    from_name: "TEST_Worker",
    message: "Hi Trish, just testing the message flow.",
    sent_at: new Date().toISOString(),
    archived: false,
  }).select().single();
  if (error) fail("hr_messages upsert", error);
  else {
    pass(`hr_messages saved id=${data.id}`);
    if (data.from_name === "TEST_Worker") pass("from_name persisted");
    if (data.message === "Hi Trish, just testing the message flow.") pass("message persisted");
  }
}

console.log("\nSTEP D — HR inbox: mark as read (isTrish path)");
{
  const { error } = await sb.from("hr_messages").update({ read_at: new Date().toISOString() }).eq("id", hrId);
  if (error) fail("mark read", error);
  else {
    const { data } = await sb.from("hr_messages").select("read_at").eq("id", hrId).single();
    if (data.read_at) pass("read_at timestamp persisted");
  }
}

console.log("\nSTEP E — HR inbox: archive");
{
  const { error } = await sb.from("hr_messages").update({ archived: true }).eq("id", hrId);
  if (error) fail("archive", error);
  else {
    const { data } = await sb.from("hr_messages").select("archived").eq("id", hrId).single();
    if (data.archived === true) pass("archived=true persisted");
  }
}

console.log("\nSTEP F — Vacation request insert (any labor/manager via Vacation modal)");
const vacId = randomUUID();
{
  const { data, error } = await sb.from("vacation_requests").upsert({
    id: vacId,
    requester_name: "TEST_Worker",
    start_date: "2026-07-04",
    end_date: "2026-07-08",
    is_sick: false,
    status: "pending",
    reason: "family vacation",
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) fail("vacation upsert", error);
  else {
    pass(`vacation saved id=${data.id}`);
    if (data.start_date === "2026-07-04" && data.end_date === "2026-07-08") pass("date range persisted");
    if (data.status === "pending") pass("status=pending");
  }
}

console.log("\nSTEP G — Vacation approve");
{
  const { error } = await sb.from("vacation_requests").update({
    status: "approved",
    approver: "TEST_Trish",
  }).eq("id", vacId);
  if (error) fail("approve", error);
  else {
    const { data } = await sb.from("vacation_requests").select("status,approver").eq("id", vacId).single();
    if (data.status === "approved") pass("status=approved persisted");
    if (data.approver === "TEST_Trish") pass("approver persisted");
  }
}

console.log("\nCLEANUP");
const cleanup = await Promise.all([
  sb.from("announcements").delete().eq("id", annId),
  sb.from("hr_messages").delete().eq("id", hrId),
  sb.from("vacation_requests").delete().eq("id", vacId),
]);
cleanup.forEach((c, i) => {
  if (c.error) fail(`cleanup #${i}`, c.error);
  else pass(`cleanup #${i} OK`);
});

console.log("\n══════════ DONE ══════════");
if (process.exitCode === 1) console.log("\n⚠ Some checks failed.\n");
else console.log("\n✓ All checks passed.\n");
