import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

// Customer Profiles — the relationship hub per customer: identity + terms + price level,
// notes timeline, salesperson recommendations, reservations, season summaries, orders,
// hot-list opt-in, and communicate-from. (The summer portal renders the customer-facing
// mirror of this same data — nothing here is throwaway.)
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const fmtDT = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function CustomerProfiles() {
  const sb = getSupabase();
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  useEffect(() => { if (!sb) return; sb.from("shipping_customers").select("*").order("company_name").then(({ data }) => setCustomers(data || [])); }, [sb]);
  const list = customers.filter(c => !q || (c.company_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const sel = customers.find(c => c.id === selId);

  if (sel) return <Profile key={sel.id} customer={sel} onBack={() => setSelId(null)} onChanged={u => setCustomers(cs => cs.map(c => c.id === u.id ? u : c))} />;
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 900 }}>
      <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: "0 0 4px" }}>Customer Profiles</h2>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>The relationship hub — info, notes, recommendations, reservations, seasons, communication.</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…" autoFocus
        style={{ width: "100%", maxWidth: 420, boxSizing: "border-box", padding: "10px 13px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", marginBottom: 12 }} />
      {list.map(c => (
        <div key={c.id} onClick={() => setSelId(c.id)} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: C.dark }}>{c.company_name}</span>
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>{[c.customer_type, c.city].filter(Boolean).join(" · ")}</span>
          </div>
          {c.hotlist_opt_out && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted }}>🔕 no hot lists</span>}
          <span style={{ color: C.muted }}>›</span>
        </div>
      ))}
    </div>
  );
}

function Profile({ customer, onBack, onChanged }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [c, setC] = useState(customer);
  const [notes, setNotes] = useState([]);
  const [recs, setRecs] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [orders, setOrders] = useState([]);
  const [levels, setLevels] = useState([]);
  const [picks, setPicks] = useState([]);
  const [delivYears, setDelivYears] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");

  const load = useCallback(async () => {
    const [n, r, rv, ss, o, lv, gf] = await Promise.all([
      sb.from("customer_notes").select("*").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(50),
      sb.from("customer_recommendations").select("*, product_profiles(display_name)").eq("customer_id", customer.id).eq("active", true).order("created_at", { ascending: false }),
      sb.from("v_customer_reservations").select("*").eq("customer_id", customer.id),
      sb.from("v_customer_season_summary").select("*").eq("customer_id", customer.id),
      sb.from("customer_orders").select("*").eq("customer_id", customer.id).neq("type", "reservation").order("created_at", { ascending: false }).limit(25),
      sb.from("price_levels").select("*").order("sort"),
      customer.company_name ? sb.from("gallery_favorites").select("item_id,name,created_at,gallery_id").ilike("name", `%${customer.company_name.split(" ")[0]}%`).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    ]);
    // delivery history: the pre-B2B sales record, aggregated by year
    const { data: dels } = await sb.from("deliveries").select("delivery_date, order_value_cents, status").eq("customer_id", customer.id).limit(1000);
    const byYear = {};
    (dels || []).forEach(d => { const y = String(d.delivery_date || "").slice(0, 4); if (!y) return; const b = (byYear[y] = byYear[y] || { n: 0, cents: 0 }); b.n++; b.cents += d.order_value_cents || 0; });
    setDelivYears(Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).map(([y, v]) => ({ year: y, ...v })));
    setNotes(n.data || []); setRecs(r.data || []); setReservations(rv.data || []);
    setSeasons(ss.data || []); setOrders(o.data || []); setLevels(lv.data || []); setPicks(gf.data || []);
  }, [sb, customer.id, customer.company_name]);
  useEffect(() => { load(); }, [load]);

  async function save(fields) {
    const next = { ...c, ...fields }; setC(next); onChanged(next);
    await sb.from("shipping_customers").update(fields).eq("id", c.id);
  }
  async function addNote() {
    if (!noteDraft.trim()) return;
    await sb.from("customer_notes").insert({ customer_id: c.id, note: noteDraft.trim(), author: displayName || "admin" });
    setNoteDraft(""); load();
  }
  async function addRec() {
    const title = window.prompt("Recommendation (e.g. '4.5\" Whopper Begonias — moved fast for similar stores'):");
    if (!title) return;
    await sb.from("customer_recommendations").insert({ customer_id: c.id, title, author: displayName || "admin" });
    load();
  }
  const editField = (label, key) => async () => { const v = window.prompt(label, c[key] || ""); if (v !== null) save({ [key]: v }); };

  const Panel = ({ title, children, action }) => (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 15px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .5, flex: 1 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
  const btn = { background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 980 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 6 }}>← All customers</button>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>{c.company_name}</h2>
        <span style={{ fontSize: 13, color: C.muted }}>{[c.customer_type, [c.city, c.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        {c.phone && <a href={`tel:${c.phone}`} style={{ ...btn, textDecoration: "none" }}>📞 Call</a>}
        {c.phone && <a href={`sms:${c.phone}`} style={{ ...btn, textDecoration: "none" }}>💬 Text</a>}
        {c.email && <a href={`mailto:${c.email}`} style={{ ...btn, textDecoration: "none" }}>✉️ Email</a>}
        <button onClick={() => save({ hotlist_opt_out: !c.hotlist_opt_out })} style={{ ...btn, color: c.hotlist_opt_out ? C.red : "#2e5c1e" }}>
          {c.hotlist_opt_out ? "🔕 Hot lists OFF — tap to opt in" : "🔔 Hot lists ON — tap to opt out"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
        <div>
          <Panel title="Info & terms">
            {[["Email", "email"], ["Phone", "phone"], ["Terms", "terms"], ["Address", "address1"]].map(([label, key]) => (
              <div key={key} onClick={editField(label, key)} style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 13, cursor: "pointer" }} title="Tap to edit">
                <span style={{ color: C.muted, width: 70, flexShrink: 0 }}>{label}</span>
                <span style={{ color: C.dark, ...wrap }}>{c[key] || <em style={{ color: "#bbb" }}>add…</em>}</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, padding: "5px 0", fontSize: 13, alignItems: "center" }}>
              <span style={{ color: C.muted, width: 70 }}>Level</span>
              <select value={c.price_level_id || ""} onChange={e => save({ price_level_id: e.target.value || null })}
                style={{ padding: "5px 8px", border: `1.5px solid ${C.border}`, borderRadius: 7, fontSize: 12.5, fontFamily: "inherit" }}>
                <option value="">List price</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}{l.default_pct_off ? ` (−${l.default_pct_off}%)` : ""}</option>)}
              </select>
            </div>
          </Panel>

          <Panel title={`Notes (${notes.length})`}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addNote()} placeholder="Add a note…"
                style={{ flex: 1, padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
              <button onClick={addNote} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
            </div>
            {notes.map(n => (
              <div key={n.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, color: C.dark, ...wrap }}>{n.note}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{n.author || "—"} · {fmtDT(n.created_at)}</div>
              </div>
            ))}
          </Panel>

          <Panel title="Our recommendations" action={<button onClick={addRec} style={btn}>＋ Add</button>}>
            {recs.map(r => (
              <div key={r.id} style={{ padding: "7px 0", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, ...wrap }}>{r.title}{r.product_profiles ? ` — ${r.product_profiles.display_name}` : ""}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{r.author || "—"} · {fmtDT(r.created_at)}</div>
              </div>
            ))}
            {!recs.length && <div style={{ fontSize: 12.5, color: C.muted }}>What should this customer be buying? Add the first recommendation — customers will see these on the portal.</div>}
          </Panel>
        </div>

        <div>
          <Panel title={`Reservations (${reservations.length})`}>
            {reservations.map(l => (
              <div key={l.line_id} style={{ padding: "7px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
                <strong>{l.display_name}</strong> — {l.taken_qty}/{l.reserved_qty} taken, {l.remaining_qty} left · take by {fmtDT(l.take_by)}
                <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: l.state === "at_risk" ? C.amber : l.state === "lapsed" ? C.muted : "#2e5c1e" }}>{l.state.replace("_", " ").toUpperCase()}</span>
              </div>
            ))}
            {!reservations.length && <div style={{ fontSize: 12.5, color: C.muted }}>No reservation lines — start one in the Reservations hub for high-volume commitments.</div>}
          </Panel>

          <Panel title="Delivery history">
            {delivYears.map(d => (
              <div key={d.year} style={{ display: "flex", gap: 10, padding: "5px 0", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: C.dark, flex: 1 }}>{d.year}</span>
                <span>{d.n} deliver{d.n !== 1 ? "ies" : "y"}</span>
                <span style={{ fontWeight: 800 }}>${(d.cents / 100).toLocaleString()}</span>
              </div>
            ))}
            {!delivYears.length && <div style={{ fontSize: 12.5, color: C.muted }}>No delivery history on file.</div>}
          </Panel>

          <Panel title="Season summaries">
            {seasons.map(s => (
              <div key={s.plan_id} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 13 }}>
                <span style={{ fontWeight: 800, color: C.dark, flex: 1 }}>{s.season}</span>
                <span>{s.orders} orders</span><span>{s.units} units</span><span style={{ fontWeight: 800 }}>${Number(s.dollars).toLocaleString()}</span>
              </div>
            ))}
            {!seasons.length && <div style={{ fontSize: 12.5, color: C.muted }}>Fills automatically as B2B orders flow through the new system.</div>}
          </Panel>

          <Panel title={`Past orders (${orders.length})`}>
            {orders.map(o => (
              <div key={o.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
                <span style={{ color: C.muted }}>{fmtDT(o.placed_at || o.created_at)}</span>
                <span style={{ flex: 1, textTransform: "capitalize" }}>{o.type}</span>
                <span style={{ fontWeight: 800, textTransform: "capitalize", color: o.status === "cancelled" ? C.red : "#2e5c1e" }}>{o.status}</span>
              </div>
            ))}
            {!orders.length && <div style={{ fontSize: 12.5, color: C.muted }}>No B2B orders yet.</div>}
          </Panel>

          {picks.length > 0 && (
            <Panel title="Recent gallery picks (best-effort name match)">
              {picks.map((p, i) => <div key={i} style={{ fontSize: 12.5, padding: "4px 0", color: C.dark }}>♥ {fmtDT(p.created_at)} — {p.name}</div>)}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
