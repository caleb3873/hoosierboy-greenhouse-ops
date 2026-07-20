import { useState, useEffect, useCallback, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

// Sales → Orders: internal order entry + the state machine.
// draft → placed → confirmed (bridge proposes the delivery) → picking → shipped (auto via
// ship-sync) → invoiced → closed. Speculation orders = grow-ahead, no customer, no reservation
// of availability until converted. Pricing resolves per customer+qty (contract > level >
// breaks > list) and snapshots which rule fired. Soft oversell guard at line entry.
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const CHIP = {
  draft: ["#eef2fb", "#4a6fb0"], placed: ["#fdf3e4", "#b06c14"], confirmed: ["#e7f6ef", "#1e7a4f"],
  picking: ["#fdf3e4", "#b06c14"], shipped: ["#e7f6ef", "#1e7a4f"], invoiced: ["#e7f6ef", "#1e7a4f"],
  closed: ["#f3f3f1", "#8a8a84"], cancelled: ["#fdecea", "#b03a2e"],
};
const NEXT = { draft: ["placed"], placed: ["confirmed"], confirmed: ["picking"], picking: ["shipped"], shipped: ["invoiced"], invoiced: ["closed"] };
const fmtDT = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export default function Orders() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState("open"); // open | all | draft…
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: o }, { data: c }] = await Promise.all([
      sb.from("customer_orders").select("*, customer_order_lines(id, qty, unit_price)").neq("type", "reservation").order("created_at", { ascending: false }).limit(200),
      sb.from("shipping_customers").select("id,company_name,customer_type,email").order("company_name"),
    ]);
    setOrders(o || []); setCustomers(c || []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const custName = id => (customers.find(c => c.id === id) || {}).company_name || (id ? "—" : "Speculation (no customer)");
  const total = o => (o.customer_order_lines || []).reduce((s, l) => s + l.qty * (+l.unit_price || 0), 0);
  const list = orders.filter(o => filter === "all" ? true : filter === "open" ? !["closed", "cancelled"].includes(o.status) : o.status === filter);
  const open = orders.find(o => o.id === openId);

  if (open) return <OrderDetail sb={sb} order={open} customers={customers} displayName={displayName} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>🧾 Orders</h2>
        <button onClick={() => setCreating(true)} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ New order</button>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 12.5, fontFamily: "inherit" }}>
          <option value="open">Open orders</option><option value="all">All</option>
          {Object.keys(CHIP).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
        Phone/email orders entered here flow the whole chain: confirm → delivery proposed in Shipping Command → shipped syncs back automatically. Prices resolve per customer.
      </div>
      {list.map(o => {
        const chip = CHIP[o.status] || CHIP.draft;
        return (
          <div key={o.id} onClick={() => setOpenId(o.id)} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 15px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: C.dark, ...wrap }}>{custName(o.customer_id)}{o.type === "speculation" ? " 🌱" : ""}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
              {(o.customer_order_lines || []).length} line{(o.customer_order_lines || []).length !== 1 ? "s" : ""} · ${total(o).toFixed(2)} · {fmtDT(o.placed_at || o.created_at)}{o.delivery_id ? " · 🚚 delivery linked" : ""}
            </div>
          </div>
          <span style={{ background: chip[0], color: chip[1], fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 11px", textTransform: "capitalize" }}>{o.status}</span>
        </div>
        );
      })}
      {!list.length && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>No orders here yet — ＋ New order to enter one.</div>}
      {creating && <NewOrder sb={sb} customers={customers} displayName={displayName} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load(); setOpenId(id); }} />}
    </div>
  );
}

function NewOrder({ sb, customers, displayName, onClose, onCreated }) {
  const [type, setType] = useState("customer");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const hits = q.length < 1 ? [] : customers.filter(c => (c.company_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  async function create(cust) {
    setBusy(true);
    const { data, error } = await sb.from("customer_orders").insert({
      customer_id: cust ? cust.id : null, type, status: "draft", created_by: displayName || "admin",
    }).select("id").single();
    if (error) { window.alert(error.message); setBusy(false); return; }
    await sb.from("customer_order_events").insert({ order_id: data.id, to_status: "draft", actor: displayName || "admin", note: type === "speculation" ? "Speculation order opened" : "Order opened" });
    onCreated(data.id);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.dark, marginBottom: 10 }}>New order</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[["customer", "Customer order"], ["speculation", "🌱 Speculation (grow-ahead, no customer yet)"]].map(([id, l]) => (
            <button key={id} onClick={() => setType(id)} style={{ flex: 1, background: type === id ? C.light : "#fff", color: type === id ? "#fff" : C.muted, border: `1.5px solid ${type === id ? C.light : C.border}`, borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
          ))}
        </div>
        {type === "customer" ? (<>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Which customer?" disabled={busy}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, fontFamily: "inherit" }} />
          <div style={{ maxHeight: 260, overflow: "auto", marginTop: 8 }}>
            {hits.map(c => (
              <div key={c.id} onClick={() => create(c)} style={{ padding: "9px 10px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13.5 }}>
                <strong>{c.company_name}</strong> <span style={{ color: C.muted, fontSize: 12 }}>{c.customer_type || ""}</span>
              </div>
            ))}
          </div>
        </>) : (
          <button onClick={() => create(null)} disabled={busy} style={{ width: "100%", background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Open speculation order</button>
        )}
      </div>
    </div>
  );
}

function OrderDetail({ sb, order, customers, displayName, onBack }) {
  const [o, setO] = useState(order);
  const [lines, setLines] = useState([]);
  const [events, setEvents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [busy, setBusy] = useState("");
  const cust = customers.find(c => c.id === o.customer_id);

  const load = useCallback(async () => {
    const [{ data: oo }, { data: ls }, { data: ev }, { data: gs }] = await Promise.all([
      sb.from("customer_orders").select("*").eq("id", order.id).single(),
      sb.from("customer_order_lines").select("*, production_items:production_item_id(sku, product_profiles(display_name))").eq("order_id", order.id).order("created_at"),
      sb.from("customer_order_events").select("*").eq("order_id", order.id).order("created_at", { ascending: false }).limit(15),
      sb.from("grades").select("code,label").order("sort"),
    ]);
    if (oo) setO(oo); setLines(ls || []); setEvents(ev || []); setGrades(gs || []);
  }, [sb, order.id]);
  useEffect(() => { load(); }, [load]);

  const total = lines.reduce((s, l) => s + l.qty * (+l.unit_price || 0), 0);
  const lineName = l => (l.production_items && l.production_items.product_profiles && l.production_items.product_profiles.display_name) || (l.production_items && l.production_items.sku) || "item";

  async function transition(to) {
    if (to === "placed" && !lines.length) { window.alert("Add at least one line first."); return; }
    if (to === "placed" && o.type === "speculation" && !o.customer_id) {
      // converting a spec order requires a customer
      const name = window.prompt("Attach which customer? (start of company name)");
      const m = name && customers.filter(c => (c.company_name || "").toLowerCase().startsWith(name.toLowerCase()));
      if (!m || !m.length) { window.alert("Speculation orders need a customer before placing."); return; }
      await sb.from("customer_orders").update({ customer_id: m[0].id, type: "customer" }).eq("id", o.id);
    }
    setBusy(to);
    const upd = { status: to, updated_at: new Date().toISOString() };
    if (to === "placed") upd.placed_at = new Date().toISOString();
    await sb.from("customer_orders").update(upd).eq("id", o.id);
    await sb.from("customer_order_events").insert({ order_id: o.id, from_status: o.status, to_status: to, actor: displayName || "admin" });
    if (to === "confirmed") window.alert("Confirmed — a proposed delivery will appear in Shipping Command within ~15 minutes (approval inbox).");
    setBusy(""); load();
  }
  async function cancel() {
    if (!window.confirm("Cancel this order? Its quantities return to availability.")) return;
    await sb.from("customer_orders").update({ status: "cancelled" }).eq("id", o.id);
    await sb.from("customer_order_events").insert({ order_id: o.id, from_status: o.status, to_status: "cancelled", actor: displayName || "admin" });
    onBack();
  }
  async function removeLine(l) {
    if (!window.confirm(`Remove ${lineName(l)}?`)) return;
    await sb.from("customer_order_lines").delete().eq("id", l.id); load();
  }
  const editable = ["draft", "placed"].includes(o.status);
  const chip = CHIP[o.status] || CHIP.draft;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 900 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← Orders</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 2px" }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>{cust ? cust.company_name : "Speculation order 🌱"}</h2>
        <span style={{ background: chip[0], color: chip[1], fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: "4px 12px", textTransform: "capitalize" }}>{o.status}</span>
        <span style={{ fontWeight: 800, color: C.dark }}>${total.toFixed(2)}</span>
        {o.delivery_id && <span style={{ fontSize: 12, color: "#2e5c1e", fontWeight: 700 }}>🚚 delivery linked</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px" }}>
        {(NEXT[o.status] || []).map(to => (
          <button key={to} onClick={() => transition(to)} disabled={!!busy} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{busy === to ? "…" : `→ ${to}`}</button>
        ))}
        {!["shipped", "invoiced", "closed", "cancelled"].includes(o.status) && (
          <button onClick={cancel} style={{ background: "#fff", color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel order</button>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
        {lines.map(l => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 13.5, color: C.dark, ...wrap }}>
              <strong>{l.qty} ×</strong> {lineName(l)}{l.grade ? <span style={{ color: C.muted }}> · {l.grade}</span> : ""}
            </div>
            <span style={{ fontSize: 12.5 }}>${(+l.unit_price || 0).toFixed(2)} <span style={{ color: C.muted, fontSize: 10.5 }}>({l.price_source || "?"})</span></span>
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>${(l.qty * (+l.unit_price || 0)).toFixed(2)}</span>
            {l.picked_state !== "pending" && <span style={{ fontSize: 10.5, fontWeight: 800, color: l.picked_state === "short" ? C.amber : "#1e7a4f" }}>{l.picked_state.toUpperCase()}{l.qty_pulled != null ? ` ${l.qty_pulled}` : ""}</span>}
            {editable && <button onClick={() => removeLine(l)} style={{ background: "none", border: "none", color: C.red, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>×</button>}
          </div>
        ))}
        {!lines.length && <div style={{ fontSize: 12.5, color: C.muted, padding: "8px 0" }}>No lines yet — search the catalog below.</div>}
        {editable && <OrderAddLine sb={sb} order={o} grades={grades} onAdded={load} />}
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>History</div>
      {events.map(e => (
        <div key={e.id} style={{ fontSize: 12, color: C.muted, padding: "3px 0" }}>
          {fmtDT(e.created_at)} — <strong style={{ color: C.dark, textTransform: "capitalize" }}>{e.to_status}</strong>{e.actor ? ` · ${e.actor}` : ""}{e.note ? ` · ${e.note}` : ""}
        </div>
      ))}
    </div>
  );
}

// Availability-aware, price-resolved line entry with a soft oversell guard.
function OrderAddLine({ sb, order, grades, onAdded }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.from("product_profiles")
        .select("id, production_item_id, display_name, price, status")
        .ilike("display_name", `%${q}%`).limit(8);
      const ids = (data || []).map(p => p.production_item_id);
      const { data: av } = ids.length ? await sb.from("v_item_availability").select("production_item_id, sellable_now, availability_status, next_ready_date").in("production_item_id", ids) : { data: [] };
      const aBy = Object.fromEntries((av || []).map(a => [a.production_item_id, a]));
      setHits((data || []).map(p => ({ ...p, a: aBy[p.production_item_id] || {} })));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  async function add(p) {
    const qty = parseInt(window.prompt(`How many of ${p.display_name}?`, "10") || "", 10);
    if (!qty || qty < 1) return;
    // soft oversell guard (staff can override with a reason-aware confirm)
    const sell = p.a.sellable_now ?? null;
    if (sell != null && qty > sell && !window.confirm(`⚠️ Only ${sell} sellable right now (status: ${p.a.availability_status || "?"}). Add ${qty} anyway?`)) return;
    let grade = null;
    if (grades.length && window.confirm("Is this a graded batch? (OK = pick a grade, Cancel = standard)")) {
      const g = window.prompt(`Grade? (${grades.map(g2 => g2.code).join(" / ")})`, "value");
      if (g && grades.some(g2 => g2.code === g)) grade = g;
    }
    setBusy(true);
    let unit = p.price, src = "list";
    try {
      const { data: rp } = await sb.rpc("resolve_unit_price", { p_customer: order.customer_id || null, p_profile: p.id, p_qty: qty });
      if (rp && rp[0]) { unit = rp[0].unit_price; src = rp[0].price_source; }
    } catch { /* list fallback */ }
    // grade price override if one exists
    if (grade) {
      const { data: gp } = await sb.from("product_grade_prices").select("unit_price").eq("product_profile_id", p.id).eq("grade", grade).limit(1);
      if (gp && gp[0]) { unit = gp[0].unit_price; src = "grade_price"; }
    }
    await sb.from("customer_order_lines").insert({ order_id: order.id, production_item_id: p.production_item_id, qty, unit_price: unit, price_source: src, grade });
    setQ(""); setHits([]); setBusy(false); onAdded();
  }
  const stChip = a => {
    const map = { available: "#1e7a4f", low: "#b06c14", coming_soon: "#4a6fb0", more_coming: "#4a6fb0", sold_out: "#b03a2e", hidden: "#8a8a84" };
    return <span style={{ color: map[a.availability_status] || "#8a8a84", fontWeight: 800, fontSize: 10.5 }}>{(a.availability_status || "—").replace("_", " ")}{a.sellable_now != null ? ` · ${a.sellable_now}` : ""}</span>;
  };
  return (
    <div style={{ marginTop: 8, position: "relative" }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="＋ Add line — search the catalog…" disabled={busy}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "inherit" }} />
      {hits.length > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 20px rgba(0,0,0,.12)", zIndex: 20, maxHeight: 260, overflow: "auto" }}>
          {hits.map(p => (
            <div key={p.id} onClick={() => add(p)} style={{ padding: "8px 11px", fontSize: 12.5, cursor: "pointer", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ flex: 1, ...wrap }}>{p.display_name}</span>
              {p.price != null && <span style={{ color: C.muted }}>${p.price}</span>}
              {stChip(p.a)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
