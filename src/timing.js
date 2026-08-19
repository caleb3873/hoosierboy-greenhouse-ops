/* ONE TIMING BRAIN (Caleb 8/19: "family page and item page differences need to be
 * resolved") — week-shift math and the components-follow-their-basket rule live HERE,
 * used by BOTH FamilyPage and ItemDrill so the two pages can never disagree.
 *
 * The rule this module enforces: combo COMPONENTS arrive relative to their basket's
 * PLANT week (staggered arrivals). Whenever a parent's plant week moves by Δ, every
 * child's ship + plant move by the same Δ — the stagger is preserved, components are
 * never silently left behind on the old schedule.
 */
import { wrapWk, weeksInYear } from "./shared";

// exact ISO-week delta across year boundaries (53-week years included)
export function wkDelta(fromWk, fromYr, toWk, toYr) {
  if (fromWk == null || toWk == null) return 0;
  let d = toWk - fromWk;
  for (let y = (fromYr ?? toYr); y < (toYr ?? fromYr); y++) d += weeksInYear(y);
  for (let y = (toYr ?? fromYr); y < (fromYr ?? toYr); y++) d -= weeksInYear(y);
  return d;
}

// deltaByParent: { parentRowId: Δweeks } — shifts each parent's children by its Δ.
// Returns how many child rows moved. Safe to call with empty/zero deltas.
export async function shiftKidsWithParents(sb, deltaByParent) {
  const pids = Object.keys(deltaByParent || {}).filter(id => deltaByParent[id]);
  if (!pids.length) return 0;
  let moved = 0;
  for (let i = 0; i < pids.length; i += 100) {
    const { data: kids } = await sb.from("scheduled_crops")
      .select("id,combo_parent_id,ship_week,ship_year,plant_week,plant_year")
      .in("combo_parent_id", pids.slice(i, i + 100));
    for (const k of (kids || [])) {
      const d = deltaByParent[k.combo_parent_id];
      if (!d) continue;
      const upd = {};
      if (k.ship_week != null) { const w = wrapWk(k.ship_week + d, k.ship_year ?? 2027); upd.ship_week = w.wk; upd.ship_year = w.yr; }
      if (k.plant_week != null) { const w = wrapWk(k.plant_week + d, k.plant_year ?? 2027); upd.plant_week = w.wk; upd.plant_year = w.yr; }
      if (Object.keys(upd).length) {
        const { error } = await sb.from("scheduled_crops").update(upd).eq("id", k.id);
        if (!error) moved++;
      }
    }
  }
  return moved;
}

// convenience: rows are parent rows about to move their PLANT week to (wk, yr) —
// build the per-parent delta map from their current values.
export function plantDeltas(rows, wk, yr) {
  const m = {};
  (rows || []).forEach(r => {
    if (r.plant_week == null) return;
    const d = wkDelta(r.plant_week, r.plant_year ?? yr, wk, yr);
    if (d) m[r.id] = d;
  });
  return m;
}
