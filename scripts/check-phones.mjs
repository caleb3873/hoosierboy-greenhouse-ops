import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url),"utf8").split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0,i), l.slice(i+1)]; }));
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const { data, error } = await sb.from("floor_codes").select("worker_name,phone,title,active").order("worker_name");
if (error) console.log("ERROR:", error.message);
else {
  console.log(`Total rows visible to anon: ${data.length}`);
  console.log(`With phone: ${data.filter(r => r.phone).length}`);
  console.log(`Drivers: ${data.filter(r => (r.title||"").toUpperCase()==="SEASONAL DRIVER").length}`);
  console.log("\nFirst 12:");
  data.slice(0,12).forEach(r => console.log(" ", r.worker_name, "|", r.title, "|", r.phone));
}
