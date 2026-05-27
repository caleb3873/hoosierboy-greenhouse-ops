// End-to-end: add equipment, create an inspect task linked to it, complete
// the task, verify last_checked derives correctly.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8")
  .split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

const pass = m => console.log(`  ✓ ${m}`);
const fail = (m, e) => { console.log(`  ✗ ${m}`); if (e) console.log("    →", e.message || e); process.exitCode = 1; };

console.log("\n══════════ FACILITY EQUIPMENT TEST ══════════\n");

const facilityId = "bluff_house_07";
const equipId = randomUUID();
const taskId  = randomUUID();

console.log("STEP 1 — Add a heater to House 07");
{
  const { error } = await sb.from("facility_equipment").upsert({
    id: equipId, facility_id: facilityId, name: "TEST Heater 1",
    kind: "heater", location_notes: "north end", created_by: "TEST_Tyler",
  });
  if (error) fail("equipment upsert", error);
  else pass(`equipment saved id=${equipId}`);
}

console.log("\nSTEP 2 — Read it back via anon");
{
  const { data, error } = await sb.from("facility_equipment").select("*").eq("id", equipId).single();
  if (error) fail("read", error);
  else {
    if (data.facility_id === facilityId) pass("facility_id persisted");
    if (data.kind === "heater") pass("kind=heater");
    if (data.name === "TEST Heater 1") pass("name persisted");
    if (data.location_notes === "north end") pass("location_notes persisted");
  }
}

console.log("\nSTEP 3 — Create an Inspect task linked to this equipment");
{
  const { error } = await sb.from("manager_tasks").upsert({
    id: taskId,
    title: "Inspect TEST Heater 1",
    category: "maintenance",
    facility: facilityId,
    equipment_id: equipId,
    status: "pending",
    priority: 100,
    week_number: 22,
    year: 2026,
    bucket: "today",
    created_by: "TEST_Tyler",
    assigned_to: "Nick",
    assigned_at: new Date().toISOString(),
    tools_materials: "voltmeter — shop bench drawer 2",
  });
  if (error) fail("task upsert", error);
  else {
    pass("task with equipment_id + tools_materials saved");
    const { data } = await sb.from("manager_tasks").select("equipment_id,tools_materials,facility,assigned_at").eq("id", taskId).single();
    if (data.equipment_id === equipId) pass("equipment_id persisted");
    if (data.tools_materials === "voltmeter — shop bench drawer 2") pass("tools_materials persisted");
    if (data.facility === facilityId) pass("facility persisted");
    if (data.assigned_at) pass("assigned_at timestamp set");
  }
}

console.log("\nSTEP 4 — Complete the task → derived last_checked should resolve");
{
  const completedAt = new Date().toISOString();
  const { error } = await sb.from("manager_tasks").update({
    status: "completed",
    completed_at: completedAt,
    completed_by: "Nick",
  }).eq("id", taskId);
  if (error) fail("complete", error);
  else {
    // Now the client-side derived lastChecked for equipId would resolve to completedAt
    // We simulate the same logic here:
    const { data: allTasks } = await sb.from("manager_tasks").select("equipment_id,completed_at,completed_by,status").eq("equipment_id", equipId);
    const done = (allTasks || []).filter(t => t.status === "completed");
    if (done.length === 1 && Math.abs(new Date(done[0].completed_at) - new Date(completedAt)) < 1000) {
      pass(`last_checked derives to ${done[0].completed_at} by ${done[0].completed_by}`);
    } else fail(`derivation off — got ${done.length} completed`);
  }
}

console.log("\nSTEP 5 — Anon read for facility_equipment (House Detail load path)");
{
  const fresh = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
  const { data, error } = await fresh.from("facility_equipment").select("*").eq("facility_id", facilityId);
  if (error) fail("fresh anon read", error);
  else if (data.find(e => e.id === equipId)) pass("anon read returns the equipment row");
}

console.log("\nCLEANUP");
{
  await sb.from("manager_tasks").delete().eq("id", taskId);
  await sb.from("facility_equipment").delete().eq("id", equipId);
  pass("test rows deleted");
}

console.log("\n══════════ DONE ══════════");
console.log(process.exitCode === 1 ? "\n⚠ Some checks failed.\n" : "\n✓ All checks passed.\n");
