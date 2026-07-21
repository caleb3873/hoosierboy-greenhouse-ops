// api/_b2btasks.js — B2B → task-system flows, run by the cron each tick.
// All functions take a supabase client so the cron passes the service client and
// tests can pass an anon client. Each is idempotent.
const isoWeek = (d) => {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((dt - ys) / 86400000) + 1) / 7), year: dt.getUTCFullYear() };
};

// 1. Items overdue for a cycle count → a BLIND count task on a grower's phone.
//    The task deliberately omits the expected quantity (that's the whole point).
async function generateCountTasks(db) {
  const { data: dueRaw } = await db.from("v_counts_due").select("*").limit(20);
  const due = (dueRaw || []).filter(d => (d.days_between_counts || 0) >= 1); // interval 0 would be forever-due
  if (!due.length) return { created: 0 };
  let created = 0;
  for (const d of due) {
    const { data: existing } = await db.from("manager_tasks").select("id")
      .eq("production_item_id", d.production_item_id).eq("source_kind", "count")
      .in("status", ["pending", "claimed"]).limit(1);
    if (existing && existing.length) continue;
    const { data: locs } = await db.from("v_item_locations").select("bench_code,qty").eq("production_item_id", d.production_item_id).order("bench_code");
    const benches = (locs || []).map(l => l.bench_code).join(", ");
    const today = new Date(); const wi = isoWeek(today);
    const { error } = await db.from("manager_tasks").insert({
      title: `🔢 Count: ${d.display_name || d.sku}`,
      description: `Cycle count — count EVERY sellable unit of ${d.display_name || d.sku}${benches ? ` on benches ${benches}` : ""}.\n\nWhen you mark this done, type ONLY the total number you counted into the notes (e.g. "182").\n\nDon't look anything up first — your fresh count is the whole point.`,
      category: "growing", status: "pending", priority: 8,
      week_number: wi.week, year: wi.year, target_date: today.toISOString().slice(0, 10),
      bucket: null, carried_over: false, created_by: "Inventory Counts",
      assignees: [], photos: [], source_kind: "count", production_item_id: d.production_item_id,
    });
    if (!error) created++;
  }
  return { created };
}

// 2. Harvest completed count tasks → blind count events (expected computed server-side
//    by the inventory_events trigger; the counter never saw it).
async function harvestCountTasks(db) {
  const { data: doneTasks } = await db.from("manager_tasks")
    .select("id, notes, completed_by, production_item_id")
    .eq("source_kind", "count").eq("status", "completed").not("production_item_id", "is", null);
  let harvested = 0, unparsed = 0;
  for (const t of doneTasks || []) {
    const tag = `task:${t.id}`;
    const { data: already } = await db.from("inventory_events").select("id").eq("note", tag).limit(1);
    if (already && already.length) continue;
    const m = String(t.notes || "").match(/\d{1,6}/);
    if (!m) { unparsed++; continue; }   // no number in notes — staff can log the count by hand
    const { error } = await db.from("inventory_events").insert({
      kind: "count", production_item_id: t.production_item_id,
      counted_qty: parseInt(m[0], 10), count_mode: "blind",
      actor: t.completed_by || "crew", note: tag,
    });
    if (!error) harvested++;
  }
  return { harvested, unparsed };
}

// 3. Confirmed B2B customer orders → proposed deliveries in Shipping Command
//    (lands in the existing approval inbox; shipping assigns teams/date as usual).
async function bridgeOrdersToDeliveries(db) {
  const { data: orders } = await db.from("customer_orders")
    .select("id, customer_id, requested_date, notes, created_by")
    .eq("type", "customer").eq("status", "confirmed").is("delivery_id", null).not("customer_id", "is", null);
  let bridged = 0;
  for (const o of orders || []) {
    const [{ data: cust }, { data: lines }] = await Promise.all([
      db.from("shipping_customers").select("*").eq("id", o.customer_id).single(),
      db.from("customer_order_lines").select("qty, unit_price, production_items:production_item_id(product_profiles(display_name))").eq("order_id", o.id),
    ]);
    if (!cust) continue;
    const value = (lines || []).reduce((s, l) => s + (l.qty * (+l.unit_price || 0)), 0);
    const summary = (lines || []).map(l => `${l.qty} × ${(l.production_items && l.production_items.product_profiles && l.production_items.product_profiles.display_name) || "item"}`).join(", ");
    const when = o.requested_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const { data: d, error } = await db.from("deliveries").insert({
      customer_id: cust.id,
      customer_snapshot: { company_name: cust.company_name, address1: cust.address1, city: cust.city, state: cust.state, zip: cust.zip, phone: cust.phone, email: cust.email, terms: cust.terms },
      delivery_date: when, lifecycle: "proposed", status: "scheduled",
      order_value_cents: Math.round(value * 100),
      notes: `B2B order ${o.id.slice(0, 8)} — ${summary}`.slice(0, 500),
      created_by: o.created_by || "B2B",
    }).select("id").single();
    if (error || !d) continue;
    await db.from("customer_orders").update({ delivery_id: d.id }).eq("id", o.id);
    await db.from("customer_order_events").insert({ order_id: o.id, to_status: "delivery_proposed", actor: "system", note: `Delivery ${d.id.slice(0, 8)} proposed for ${when}` });
    bridged++;
  }
  return { bridged };
}

// 4. Reverse bridge: shipping outcomes flow back to the order so availability stays true.
//    delivered/shipped delivery → order 'shipped' (frees committed → shipped-actuals math);
//    cancelled delivery → order back to 'confirmed' with an event (staff decides next move;
//    delivery_id is kept so it doesn't auto-recreate a new delivery).
async function syncDeliveriesBack(db) {
  const { data: linked } = await db.from("customer_orders")
    .select("id, status, delivery_id")
    .in("status", ["confirmed", "picking"]).not("delivery_id", "is", null);
  let shipped = 0, cancelled = 0;
  for (const o of linked || []) {
    const { data: d } = await db.from("deliveries").select("delivered_at, shipped_at, lifecycle").eq("id", o.delivery_id).single();
    if (!d) continue;
    if (d.delivered_at || d.shipped_at) {
      await db.from("customer_orders").update({ status: "shipped", updated_at: new Date().toISOString() }).eq("id", o.id);
      await db.from("customer_order_events").insert({ order_id: o.id, from_status: o.status, to_status: "shipped", actor: "system", note: "Delivery shipped/delivered in Shipping Command" });
      shipped++;
    } else if (d.lifecycle === "cancelled") {
      await db.from("customer_order_events").insert({ order_id: o.id, from_status: o.status, to_status: o.status, actor: "system", note: "Linked delivery was cancelled in Shipping Command — review the order" });
      cancelled++;
    }
  }
  return { shipped, cancelled };
}


// 4. Self-healing production tasks: pot-fill + planting per (zone, plant week).
//    Born from the wk31 shortfall: a one-off generation excluded two mis-flagged
//    rows, the pot-fill task said 150 where the plan needed 300, and nothing
//    could correct it. This pass recomputes from the plan every tick:
//      – totals are FLAG-PROOF: every row with qty_pots > 0 fills pots, no
//        matter how it is flagged (components carry qty_pots = 0 by convention)
//      – PENDING system tasks are rewritten in place when the plan moves
//      – deleted tasks come back on the next tick while their week is upcoming
//      – completed tasks are never touched
async function syncProductionTasks(db) {
  const { data: plans } = await db.from("production_plans").select("id,name");
  const out = { updated: 0, created: 0, plans: 0 };
  const mondayOf = (wk, yr) => {
    const jan4 = new Date(Date.UTC(yr, 0, 4));
    const mon = new Date(jan4);
    mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (wk - 1) * 7);
    return mon;
  };
  const iso = d => d.toISOString().slice(0, 10);
  const now = new Date();

  for (const plan of plans || []) {
    const { data: opted } = await db.from("production_items").select("id").eq("plan_id", plan.id).limit(1);
    if (!opted || !opted.length) continue;   // only opted-in plans, same rule as reconcile
    const { data: sc } = await db.from("scheduled_crops")
      .select("id,item_name,variety_id,qty_pots,ppp,qty_plants_ordered,plant_week,plant_year,bench_id,container_id,soil_mix_id,is_combo_component,combo_parent_id")
      .eq("plan_id", plan.id).not("plant_week", "is", null);
    if (!sc || !sc.length) continue;
    out.plans++;

    const benchIds = [...new Set(sc.map(r => r.bench_id).filter(Boolean))];
    const { data: benches } = benchIds.length ? await db.from("benches").select("id,code,zone_label").in("id", benchIds) : { data: [] };
    const bmap = Object.fromEntries((benches || []).map(b => [b.id, b]));
    const { data: conts } = await db.from("containers").select("id,name,sku,fill_volume_cu_ft");
    const varIds = [...new Set(sc.map(r => r.variety_id).filter(Boolean))];
    const { data: vlist } = varIds.length ? await db.from("variety_library").select("id,variety").in("id", varIds) : { data: [] };
    const vmap = Object.fromEntries((vlist || []).map(v => [v.id, v.variety]));
    const cmap = Object.fromEntries((conts || []).map(c => [c.id, c]));
    const parentById = Object.fromEntries(sc.filter(r => !r.is_combo_component).map(r => [r.id, r]));

    // group by (zone, plant week) — only weeks planting within the next 6 weeks
    const groups = {};
    for (const r of sc) {
      const anchor = r.is_combo_component ? parentById[r.combo_parent_id] : r;
      if (!anchor || anchor.plant_week == null) continue;
      const yr = anchor.plant_year || now.getFullYear();
      const mon = mondayOf(anchor.plant_week, yr);
      if (mon < new Date(now.getTime() - 3 * 86400000) || mon > new Date(now.getTime() + 42 * 86400000)) continue;
      const zone = bmap[anchor.bench_id]?.zone_label || "(no zone)";
      const key = `${zone}__${anchor.plant_week}__${yr}`;
      const g = groups[key] || (groups[key] = { zone, wk: anchor.plant_week, yr, mon, pots: {}, items: {}, benches: new Set(), fillCuFt: 0, flaggedPots: 0, plantRows: [], kids: {} });
      if (r.is_combo_component) {
        // a component carrying its own qty_pots is contradictory — count NOTHING
        // silently: surface it on the task so a human settles it (the Aida/Moni
        // lesson cuts both ways: excluding hid 150 pots, including doubled them)
        if (+r.qty_pots > 0) g.flaggedPots += +r.qty_pots;
        const it = g.items[anchor.item_name || anchor.id];
        if (it) it.liners += +r.qty_plants_ordered || 0;
        (g.kids[r.combo_parent_id] = g.kids[r.combo_parent_id] || []).push({ variety: vmap[r.variety_id] || "?", plants: +r.qty_plants_ordered || 0 });
        continue;
      }
      if (!(+r.qty_pots > 0)) continue;
      const c = cmap[r.container_id];
      // short pot names — "6.5 Azalea Pot - NEW Schlegel Logo Print" is noise to
      // the fill crew; they need the size (sku kept for grabbing the right pallet)
      const short = c ? (String(c.name || "").match(/\d+(\.\d+)?/) ? `${parseFloat(String(c.name).match(/\d+(\.\d+)?/)[0])}" Pot` : c.name) : "(no container)";
      const cKey = c && c.sku ? `${short} — ${c.sku}` : short;
      g.pots[cKey] = (g.pots[cKey] || 0) + +r.qty_pots;
      g.fillCuFt += (+r.qty_pots) * (c && +c.fill_volume_cu_ft ? +c.fill_volume_cu_ft : 0.35);
      const iKey = r.item_name || r.id;
      const it = g.items[iKey] || (g.items[iKey] = { name: r.item_name || "(unnamed)", pots: 0, liners: 0, ppp: +r.ppp || 1, benches: new Set() });
      it.pots += +r.qty_pots;
      it.liners += (+r.qty_pots) * (+r.ppp || 1);
      if (bmap[r.bench_id]?.code) { it.benches.add(bmap[r.bench_id].code); g.benches.add(bmap[r.bench_id].code); }
      g.plantRows.push({ rowId: r.id, bench: bmap[r.bench_id]?.code || "—", name: r.item_name || "(unnamed)",
        pots: +r.qty_pots, ppp: +r.ppp || 1, variety: vmap[r.variety_id] || null });
    }

    const { data: existing } = await db.from("manager_tasks")
      .select("id,title,status,description").eq("plan_id", plan.id)
      .or("title.like.Pot fill —%,title.like.PLANT%");

    for (const g of Object.values(groups)) {
      const totalPots = Object.values(g.pots).reduce((a, b) => a + b, 0);
      if (!totalPots) continue;
      const benchList = [...g.benches].sort().join(", ");
      const friday = new Date(g.mon); friday.setUTCDate(friday.getUTCDate() - 3);

      // ── pot fill ──
      const fillTitle = `Pot fill — ${g.zone} (wk${g.wk})`;
      const fillDesc = [
        `**FILL ${totalPots.toLocaleString()} POTS** — ${g.zone}, for wk${g.wk} planting (${iso(g.mon)}).`,
        "",
        ...Object.entries(g.pots).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  • ${v.toLocaleString()} × ${k}`),
        "",
        `**Soil:** ~${Math.max(1, Math.ceil(g.fillCuFt / 8))} bag(s). **Stage on:** ${benchList}.`,
        `Fill by ${iso(friday)} — not more than a week ahead.`,
        ...(g.flaggedPots > 0 ? ["", `⚠ ${g.flaggedPots.toLocaleString()} pots sit on rows flagged as combo components and are NOT in the count above — check with Caleb whether they are real pots or combo structure before filling.`] : []),
      ].join("\n");

      // ── planting ──
      // Bench by bench, item by item, recipe per pot — "exactly what items are
      // being planted, on what benches, and how many of what variety per pot" (Caleb)
      const fmtPer = n => (Math.round(n * 10) / 10).toLocaleString();
      const plantLines = [];
      let totalLiners = 0;
      const rowsSorted = [...g.plantRows].sort((a, b) => a.bench.localeCompare(b.bench) || a.name.localeCompare(b.name));
      let lastBench = null;
      for (const pr of rowsSorted) {
        const kids = g.kids[pr.rowId] || [];
        const recipe = [];
        if (pr.variety) recipe.push(`${pr.ppp} × ${pr.variety}`);
        for (const k of kids) if (k.plants > 0 && pr.pots > 0) recipe.push(`${fmtPer(k.plants / pr.pots)} × ${k.variety}`);
        const liners = pr.pots * pr.ppp + kids.reduce((a, k) => a + k.plants, 0);
        totalLiners += liners;
        if (pr.bench !== lastBench) { plantLines.push(""); plantLines.push(`📍 ${pr.bench}`); lastBench = pr.bench; }
        plantLines.push(`  ${pr.pots.toLocaleString()} × ${pr.name}`);
        plantLines.push(`      each pot: ${recipe.join(" + ") || "1 plant"}   (${liners.toLocaleString()} liners)`);
      }
      const plantTitle = `PLANT — ${g.zone} (wk${g.wk})`;
      const plantDesc = [
        `**PLANT ${totalPots.toLocaleString()} POTS / ${totalLiners.toLocaleString()} LINERS** — ${g.zone}, week of ${iso(g.mon)}.`,
        ...plantLines,
        "",
        "Water-in immediately after planting.",
      ].join("\n");

      const upserts = [
        { title: fillTitle, match: t => t.title === fillTitle, desc: fillDesc, due: iso(friday) },
        { title: plantTitle, match: t => new RegExp(`^PLANT.*— ${g.zone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(wk${g.wk}\\)`).test(t.title), desc: plantDesc, due: iso(g.mon) },
      ];
      for (const u of upserts) {
        const hit = (existing || []).find(u.match);
        if (hit) {
          if (hit.status === "pending" && hit.description !== u.desc) {
            await db.from("manager_tasks").update({ description: u.desc, bench_numbers: [...g.benches].sort(), target_date: u.due }).eq("id", hit.id);
            out.updated++;
          }
        } else {
          const due = new Date(u.due + "T12:00:00Z");
          const jan4 = new Date(Date.UTC(due.getUTCFullYear(), 0, 4));
          const wkNum = Math.ceil((((due - jan4) / 86400000) + ((jan4.getUTCDay() + 6) % 7) + 1) / 7);
          await db.from("manager_tasks").insert({
            id: require("crypto").randomUUID(), title: u.title, description: u.desc,
            plan_id: plan.id, category: "production", location: g.zone,
            bench_numbers: [...g.benches].sort(), status: "pending",
            target_date: u.due, week_number: wkNum, year: due.getUTCFullYear(),
            created_by: "system", priority: 50,
          });
          out.created++;
        }
      }
    }
  }
  return out;
}

module.exports = { generateCountTasks, harvestCountTasks, bridgeOrdersToDeliveries, syncDeliveriesBack, syncProductionTasks };
