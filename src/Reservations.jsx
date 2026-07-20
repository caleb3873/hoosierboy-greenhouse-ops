import { useState, useEffect, useCallback, useMemo } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

// Reservations hub — blanket orders for high-volume customers with AUTO-LAPSE.
// The system releases (take-by dates derive from ready + grace); staff only override:
// release early, extend, reassign to another customer, remove, or notify before lapse.
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const STATE_STYLE = {
  pending:   { bg: "#eef2fb", fg: "#4a6fb0", label: "Pending (not ready)" },
  active:    { bg: "#eef6e7", fg: "#2e5c1e", label: "Active" },
  at_risk:   { bg: "#fdf3e4", fg: "#b06c14", label: "At risk" },
  lapsed:    { bg: "#f3f3f1", fg: "#8a8a84", label: "Lapsed → open" },
  released:  { bg: "#f3f3f1", fg: "#8a8a84", label: "Released" },
  fulfilled: { bg: "#e7f6ef", fg: "#1e7a4f", label: "Fulfilled" },
};
const fmtD = d => d ? new Date(d + (String(d).length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export default function Reservations() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [orders, setOrders] = useState([]);
  const [lines, setLines] = useState([]);      // v_customer_reservations rows
  const [customers, setCustomers] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!sb) return;
    const [{ data: o }, { data: l }, { data: c }] = await Promise.all([
      sb.from("customer_orders").select("*").eq("type", "reservation").neq("status", "cancelled").order("created_at", { ascending: false }),
      sb.from("v_customer_reservations").select("*"),
      sb.from("shipping_customers").select("id,company_name,email,phone,customer_type").order("company_name"),
    ]);
    setOrders(o || []); setLines(l || []); setCustomers(c || []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const custName = id => (customers.find(c => c.id === id) || {}).company_name || "—";
  const linesFor = oid => lines.filter(l => l.order_id === oid);
  const atRisk = useMemo(() => lines.filter(l => l.state === "at_risk").sort((a, b) => String(a.take_by).localeCompare(String(b.take_by))), [lines]);

  async function act(fn, key) { setBusy(key); try { await fn(); await load(); } catch (e) { window.alert(e.message || e); } setBusy(""); }

  const releaseLine = l => act(async () => {
    if (!window.confirm(`Release ${l.remaining_qty} × ${l.display_name} back to open availability now?`)) return;
    await sb.from("customer_order_lines").update({ released_at: new Date().toISOString(), released_by: displayName || "admin" }).eq("id", l.line_id);
  }, l.line_id);
  const extendLine = l => act(async () => {
    const d = window.prompt("New take-by date (YYYY-MM-DD):", l.take_by || "");
    if (!d) return;
    await sb.from("customer_order_lines").update({ take_by_date: d, released_at: null }).eq("id", l.line_id);
  }, l.line_id);
  const removeLine = l => act(async () => {
    if (!window.confirm(`Remove ${l.display_name} from this reservation entirely?`)) return;
    await sb.from("customer_order_lines").delete().eq("id", l.line_id);
  }, l.line_id);
  const reassignLine = l => act(async () => {
    const name = window.prompt("Reassign to which customer? (start of company name)");
    if (!name) return;
    const match = customers.filter(c => (c.company_name || "").toLowerCase().startsWith(name.toLowerCase()));
    if (!match.length) { window.alert("No customer matches."); return; }
    const target = match[0];
    if (!window.confirm(`Reassign ${l.remaining_qty} × ${l.display_name} to ${target.company_name}?`)) return;
    // find or create the target's reservation order
    let { data: t } = await sb.from("customer_orders").select("id").eq("type", "reservation").eq("customer_id", target.id).in("status", ["placed", "confirmed"]).limit(1);
    let tid = t && t[0] && t[0].id;
    if (!tid) {
      const { data: made, error } = await sb.from("customer_orders").insert({ customer_id: target.id, type: "reservation", status: "placed", placed_at: new Date().toISOString(), created_by: displayName || "admin", notes: "Created by reassignment" }).select("id").single();
      if (error) throw error; tid = made.id;
      await sb.from("customer_order_events").insert({ order_id: tid, to_status: "placed", actor: displayName || "admin", note: "Reservation created via reassignment" });
    }
    await sb.from("customer_order_lines").update({ order_id: tid }).eq("id", l.line_id);
    await sb.from("customer_order_events").insert({ order_id: l.order_id, to_status: "line_reassigned", actor: displayName || "admin", note: `${l.display_name} → ${target.company_name}` });
  }, l.line_id);
  const notifyLine = l => act(async () => {
    const cust = customers.find(c => c.id === l.customer_id);
    if (!cust || !cust.email) { window.alert("This customer has no email on file — add one on their profile."); return; }
    const r = await fetch("/api/reservation-reminder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: cust.email, customerName: cust.company_name, lines: [{ name: l.display_name, remaining: l.remaining_qty, takeBy: l.take_by }] }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Send failed");
    await sb.from("customer_order_lines").update({ notified_at: new Date().toISOString() }).eq("id", l.line_id);
  }, "n" + l.line_id);

  const LineRow = ({ l, showCustomer }) => {
    const st = STATE_STYLE[l.state] || STATE_STYLE.active;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.dark, ...wrap }}>{l.display_name || l.sku}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
            {showCustomer ? `${l.company_name} · ` : ""}{l.taken_qty}/{l.reserved_qty} taken · {l.remaining_qty} remaining
            {l.ready_date ? ` · ready ${fmtD(l.ready_date)}` : ""} · take by <strong>{fmtD(l.take_by)}</strong>
            {l.notified_at ? " · 📨 notified" : ""}
          </div>
        </div>
        <span style={{ background: st.bg, color: st.fg, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px" }}>{st.label}</span>
        {["active", "at_risk", "pending"].includes(l.state) && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => notifyLine(l)} disabled={busy === "n" + l.line_id} title="Email the customer: order by the take-by date or it goes to open availability"
              style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{busy === "n" + l.line_id ? "…" : "📨 Notify"}</button>
            <button onClick={() => releaseLine(l)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Release</button>
            <button onClick={() => extendLine(l)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Extend</button>
            <button onClick={() => reassignLine(l)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Reassign</button>
            <button onClick={() => removeLine(l)} style={{ background: "none", color: C.red, border: "none", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
          </div>
        )}
        {l.state === "lapsed" && <span style={{ fontSize: 11, color: C.muted }}>auto-returned {fmtD(l.take_by)}</span>}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>Reservations</h2>
        <button onClick={() => setCreating(true)} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ New reservation</button>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
        Blanket orders for high-volume customers. Untaken quantity <strong>auto-lapses to open availability</strong> after each item's take-by date (ready + grace) — nothing to switch manually. Notify at-risk customers before it happens.
      </div>

      {atRisk.length > 0 && (
        <div style={{ background: "#fdf3e4", border: `1.5px solid ${C.amber}`, borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#b06c14", marginBottom: 2 }}>⚠️ {atRisk.length} line{atRisk.length !== 1 ? "s" : ""} at risk of lapsing — customers are auto-emailed once (business hours); 📨 Notify re-sends by hand</div>
          {atRisk.map(l => <LineRow key={l.line_id} l={l} showCustomer />)}
        </div>
      )}

      {orders.map(o => {
        const ls = linesFor(o.id);
        const open = openId === o.id;
        return (
          <div key={o.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
            <div onClick={() => setOpenId(open ? null : o.id)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.dark }}>{custName(o.customer_id)}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{ls.length} line{ls.length !== 1 ? "s" : ""} · {ls.reduce((s, l) => s + l.remaining_qty, 0)} units still reserved · placed {fmtD(o.placed_at || o.created_at)}</div>
              </div>
              {["at_risk", "lapsed"].map(s => { const n = ls.filter(l => l.state === s).length; return n ? <span key={s} style={{ background: STATE_STYLE[s].bg, color: STATE_STYLE[s].fg, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px" }}>{n} {STATE_STYLE[s].label.toLowerCase()}</span> : null; })}
              <span style={{ color: C.muted, fontWeight: 800 }}>{open ? "⌄" : "›"}</span>
            </div>
            {open && <div style={{ marginTop: 8 }}>{ls.map(l => <LineRow key={l.line_id} l={l} />)}
              <AddLine sb={sb} orderId={o.id} customerId={o.customer_id} onAdded={load} /></div>}
          </div>
        );
      })}
      {!orders.length && <div style={{ color: C.muted, fontSize: 13, padding: "26px 0", textAlign: "center" }}>No reservations yet — start one for a high-volume customer.</div>}

      {creating && <NewReservation sb={sb} customers={customers} displayName={displayName} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

// Item search against the sellable catalog (production_items + profiles), qty, insert line.
function AddLine({ sb, orderId, customerId, onAdded }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.from("product_profiles").select("id,production_item_id,display_name,price").ilike("display_name", `%${q}%`).limit(8);
      setHits(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);
  async function add(p) {
    const qty = parseInt(window.prompt(`Reserve how many of ${p.display_name}?`, "50") || "", 10);
    if (!qty || qty < 1) return;
    setBusy(true);
    // resolve the CUSTOMER's price (contract > level > breaks > list) and snapshot which rule fired
    let unit = p.price, src = "list";
    try {
      const { data: rp } = await sb.rpc("resolve_unit_price", { p_customer: customerId || null, p_profile: p.id, p_qty: qty });
      if (rp && rp[0]) { unit = rp[0].unit_price; src = rp[0].price_source; }
    } catch { /* fall back to list */ }
    await sb.from("customer_order_lines").insert({ order_id: orderId, production_item_id: p.production_item_id, qty, unit_price: unit, price_source: src });
    setQ(""); setHits([]); setBusy(false); onAdded();
  }
  return (
    <div style={{ marginTop: 8, position: "relative" }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="＋ Add item — search the catalog…" disabled={busy}
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13, fontFamily: "inherit" }} />
      {hits.length > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 20px rgba(0,0,0,.12)", zIndex: 20, maxHeight: 240, overflow: "auto" }}>
          {hits.map(p => (
            <div key={p.id} onClick={() => add(p)} style={{ padding: "8px 11px", fontSize: 12.5, cursor: "pointer", borderTop: `1px solid ${C.border}` }}>
              {p.display_name} {p.price != null && <span style={{ color: C.muted }}>· ${p.price}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewReservation({ sb, customers, displayName, onClose, onCreated }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const hits = q.length < 1 ? [] : customers.filter(c => (c.company_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  async function create(c) {
    setBusy(true);
    const { data, error } = await sb.from("customer_orders").insert({ customer_id: c.id, type: "reservation", status: "placed", placed_at: new Date().toISOString(), created_by: displayName || "admin" }).select("id").single();
    if (error) { window.alert(error.message); setBusy(false); return; }
    await sb.from("customer_order_events").insert({ order_id: data.id, to_status: "placed", actor: displayName || "admin", note: "Reservation opened" });
    setBusy(false); onCreated();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 440 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.dark, marginBottom: 10 }}>New reservation — for which customer?</div>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…" disabled={busy}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 14, fontFamily: "inherit" }} />
        <div style={{ maxHeight: 300, overflow: "auto", marginTop: 8 }}>
          {hits.map(c => (
            <div key={c.id} onClick={() => create(c)} style={{ padding: "9px 10px", borderTop: `1px solid ${C.border}`, cursor: "pointer", fontSize: 13.5 }}>
              <strong>{c.company_name}</strong> <span style={{ color: C.muted, fontSize: 12 }}>{c.customer_type || ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
