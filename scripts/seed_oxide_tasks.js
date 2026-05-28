#!/usr/bin/env node
// Seed recurring growing task: "Turn on oxide before leaving for the day"
// Every Sunday + Thursday from next ISO week through week 52 of the current year.
//
// Usage: node scripts/seed_oxide_tasks.js
// Set DRY_RUN=1 to preview without inserting.

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Pull anon credentials from .env.local
const envPath = path.join(__dirname, "..", ".env.local");
const env = fs.readFileSync(envPath, "utf8");
const URL = env.match(/REACT_APP_SUPABASE_URL=(.+)/)[1].trim();
const KEY = env.match(/REACT_APP_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const supa = createClient(URL, KEY);

// ISO-week helpers (mirror ManagerTasksView.getWeekInfo + weekMonday)
function weekMonday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7)); // Mon of week 1
  const mon = new Date(s);
  mon.setDate(s.getDate() + (week - 1) * 7);
  return mon;
}
function getWeekInfo(date = new Date()) {
  const year = date.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.ceil((date - s) / (7 * 86400000));
  return { week, year };
}
function toISODate(d) {
  // Local-date YYYY-MM-DD (avoid UTC drift)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

const TITLE = "Turn on oxide before leaving for the day";
const CATEGORY = "growing";
const CREATED_BY = "Caleb";

(async () => {
  const today = getWeekInfo();
  const startWeek = today.week + 1;
  const endWeek = 52;
  const year = today.year;

  const rows = [];
  for (let w = startWeek; w <= endWeek; w++) {
    const mon = weekMonday(year, w);
    const thu = new Date(mon); thu.setDate(mon.getDate() + 3);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);

    for (const day of [thu, sun]) {
      rows.push({
        id: crypto.randomUUID(),
        title: TITLE,
        priority: 100 + (w * 10) + (day === sun ? 1 : 0),
        week_number: w,
        year,
        status: "pending",
        category: CATEGORY,
        bucket: "this_week",
        target_date: toISODate(day),
        carried_over: false,
        created_by: CREATED_BY,
        assigned_to: null,
        assigned_at: null,
        location: null,
        team: null,
        photos: [],
      });
    }
  }

  console.log(`Prepared ${rows.length} oxide tasks (weeks ${startWeek}–${endWeek} of ${year}).`);
  console.log("First:", rows[0].target_date, "Last:", rows[rows.length-1].target_date);

  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN=1 → not inserting.");
    return;
  }

  // Insert in chunks so we get useful errors if anything fails
  const CHUNK = 20;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supa.from("manager_tasks").insert(slice);
    if (error) {
      console.error(`Chunk ${i}-${i+slice.length-1} failed:`, error.message);
      process.exit(1);
    }
    console.log(`Inserted ${i + slice.length}/${rows.length}`);
  }
  console.log("Done.");
})();
