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

module.exports = { generateCountTasks, harvestCountTasks, bridgeOrdersToDeliveries, syncDeliveriesBack };
