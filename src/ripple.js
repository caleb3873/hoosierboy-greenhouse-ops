// ripple.js — Phase 4: when weeks move, the work moves with them.
// rippleTasks(): re-dates the auto-generated floor tasks (receive/stick, transplant/plant)
// for the affected items, and flags anything already IN FLIGHT — a completed task, or an
// old stick date that's already behind us — instead of silently shifting reality.
export function isoWeekMonday(year, week) {
  const s = new Date(Date.UTC(+year, 0, 1 + (week - 1) * 7)); const dow = s.getUTCDay();
  if (dow <= 4) s.setUTCDate(s.getUTCDate() - dow + 1); else s.setUTCDate(s.getUTCDate() + 8 - dow);
  return s.toISOString().slice(0, 10);
}
export const isoWeekOf = dateStr => {
  const t = new Date(dateStr + "T00:00:00"); const dn = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dn + 3); const f = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - f) / 864e5 - 3 + (f.getDay() + 6) % 7) / 7);
};

// items: [itemName]; chain: {ship, shipYear, plant, plantYear}; oldShip: {wk, yr} pre-change
export async function rippleTasks(sb, planId, items, chain, oldShip, changedBy) {
  let moved = 0; const flags = [];
  const today = new Date().toISOString().slice(0, 10);
  // in-flight: the OLD stick week is already behind us — the crop may physically exist
  const inFlight = oldShip?.wk != null && isoWeekMonday(oldShip.yr || new Date().getFullYear(), oldShip.wk) <= today;
  for (const item of items) {
    if (inFlight) flags.push(`${item}: was already in motion (old stick wk${oldShip.wk} has passed) — verify on the floor before trusting the new chain`);
    const { data: tasks } = await sb.from("manager_tasks").select("id,title,status,target_date")
      .eq("plan_id", planId).ilike("created_by", "auto:%").ilike("title", `%${item}%`);
    for (const t of tasks || []) {
      const kind = /^Receive/i.test(t.title) ? "ship" : /^(Transplant|Plant|Pot up)\b/i.test(t.title) ? "plant" : null;
      if (!kind) continue;
      const wk = kind === "ship" ? chain.ship : chain.plant;
      const yr = kind === "ship" ? (chain.shipYear ?? chain.plantYear) : chain.plantYear;
      if (wk == null || yr == null) continue;
      const date = isoWeekMonday(yr, wk);
      if (t.target_date === date) continue;
      if (t.status === "completed") {
        flags.push(`${item}: "${t.title}" is already DONE (${t.target_date}) — chain moved to wk${wk}; reconcile by hand`);
        continue;
      }
      await sb.from("manager_tasks").update({
        target_date: date, week_number: isoWeekOf(date), year: +String(date).slice(0, 4),
        title: t.title.replace(/\(wk \d+\)/, `(wk ${wk})`),
      }).eq("id", t.id);
      moved++;
    }
  }
  // every flag is auditable, not just a toast
  for (const f of flags) {
    try {
      await sb.from("item_change_log").insert({
        plan_id: planId, item_name: f.split(":")[0], change_type: "ripple_flag",
        detail: { note: f }, changed_by: changedBy || null, source: "ripple",
      });
    } catch { /* audit must not block */ }
  }
  return { moved, flags };
}
