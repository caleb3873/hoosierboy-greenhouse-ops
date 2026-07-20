import { useState, useEffect, useCallback, useMemo } from "react";
import { getSupabase } from "./supabase";

// Sales → Catalog: the live mirror of the B2B engine. Every sellable item with its derived
// availability — watch items appear as planning happens (reconcile absorbs the plan every
// 15 min). Also the publishing tool: DRAFT profiles track the plan; PUBLISHing freezes a
// profile and makes it customer-visible (merchandising ownership starts there).
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const STATUS = {
  available:   { bg: "#e7f6ef", fg: "#1e7a4f", label: "Available" },
  low:         { bg: "#fdf3e4", fg: "#b06c14", label: "Low" },
  coming_soon: { bg: "#eef2fb", fg: "#4a6fb0", label: "Coming soon" },
  more_coming: { bg: "#eef2fb", fg: "#4a6fb0", label: "More coming" },
  sold_out:    { bg: "#fdecea", fg: "#b03a2e", label: "Sold out" },
  hidden:      { bg: "#f3f3f1", fg: "#8a8a84", label: "Hidden (draft)" },
  ended:       { bg: "#f3f3f1", fg: "#8a8a84", label: "Ended" },
};
const fmtD = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : null;

async function fetchAll(q) { let out = [], from = 0; for (;;) { const { data, error } = await q.range(from, from + 999); if (error) throw error; out = out.concat(data || []); if (!data || data.length < 1000) break; from += 1000; } return out; }

export default function CatalogViewer() {
  const sb = getSupabase();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [rows, setRows] = useState([]);        // merged item+profile+availability
  const [groups, setGroups] = useState({});    // item_id -> [{label, ready}]
  const [locs, setLocs] = useState({});        // item_id -> [bench codes]
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [stat, setStat] = useState("");
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(150);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data: pl } = await sb.from("production_plans").select("id,name");
      const withItems = [];
      for (const p of pl || []) {
        const { count } = await sb.from("production_items").select("id", { count: "exact", head: true }).eq("plan_id", p.id);
        if (count) withItems.push({ ...p, items: count });
      }
      setPlans(withItems);
      if (withItems.length && !planId) setPlanId(withItems[0].id);
    })();
  }, [sb]); // eslint-disable-next-line

  const load = useCallback(async () => {
    if (!sb || !planId) return;
    setLoading(true);
    const [items, avail, grps] = await Promise.all([
      fetchAll(sb.from("production_items").select("id,sku,kind,variety_id, product_profiles(id,display_name,category,size_category,tier,price,price_unit,pack_size,image_url,status)").eq("plan_id", planId).order("sku")),
      fetchAll(sb.from("v_item_availability").select("production_item_id,planned,released,event_delta,committed,shipped,reserved,sellable_now,next_ready_date,availability_status").eq("plan_id", planId)),
      fetchAll(sb.from("production_item_groups").select("production_item_id,label,ship_week,ship_year,ready_week_override")),
    ]);
    const aById = Object.fromEntries(avail.map(a => [a.production_item_id, a]));
    const gById = {};
    grps.forEach(g => { (gById[g.production_item_id] = gById[g.production_item_id] || []).push(g); });
    setGroups(gById);
    setRows(items.map(it => ({ ...it, p: it.product_profiles || {}, a: aById[it.id] || {} })));
    setLoading(false);
  }, [sb, planId]);
  useEffect(() => { load(); }, [load]);

  async function loadLocs(itemId) {
    if (locs[itemId]) return;
    const { data } = await sb.from("v_item_locations").select("bench_code,qty,ship_week").eq("production_item_id", itemId).order("bench_code");
    setLocs(l => ({ ...l, [itemId]: data || [] }));
  }
  async function togglePublish(row) {
    const to = row.p.status === "published" ? "draft" : "published";
    if (to === "published") {
      if (row.p.price == null) { window.alert("No price yet — a published profile needs a price. Set it in the plan (drafts track the plan) or on the profile."); return; }
      if (!window.confirm(`Publish "${row.p.display_name}"?\n\nPublished = visible to customer surfaces, and the profile FREEZES (plan changes stop updating name/pack/price — merchandising owns it from here).`)) return;
    }
    await sb.from("product_profiles").update({ status: to }).eq("id", row.p.id);
    load();
  }
  async function setTier(row, tier) {
    await sb.from("product_profiles").update({ tier: tier || null }).eq("id", row.p.id);
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, p: { ...r.p, tier: tier || null } } : r));
  }

  const cats = useMemo(() => [...new Set(rows.map(r => r.p.category).filter(Boolean))].sort(), [rows]);
  const filtered = rows.filter(r =>
    (!q || (r.p.display_name || "").toLowerCase().includes(q.toLowerCase()) || (r.sku || "").toLowerCase().includes(q.toLowerCase())) &&
    (!cat || r.p.category === cat) &&
    (!stat || r.a.availability_status === stat));
  const t = {
    items: rows.length,
    planned: rows.reduce((s, r) => s + (r.a.planned || 0), 0),
    published: rows.filter(r => r.p.status === "published").length,
    priced: rows.filter(r => r.p.price != null).length,
    tiered: rows.filter(r => r.p.tier).length,
  };

  const tile = (label, val, sub) => (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 16px", minWidth: 108 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.dark }}>{val}</div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted }}>{sub}</div>}
    </div>
  );
  const sel = { padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 12.5, fontFamily: "inherit", background: "#fff" };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 1150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>📦 Catalog</h2>
        <select value={planId || ""} onChange={e => setPlanId(e.target.value)} style={{ ...sel, fontWeight: 800 }}>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.items})</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: C.muted }}>live mirror of the plan — new items appear within ~15 min of planning changes</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
        {tile("Items", t.items)}
        {tile("Planned units", t.planned.toLocaleString())}
        {tile("Published", `${t.published}`, `${t.items - t.published} draft`)}
        {tile("Priced", `${t.priced}/${t.items}`)}
        {tile("Tiered", `${t.tiered}/${t.items}`)}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(150); }} placeholder="Search name or SKU…" style={{ ...sel, width: 240 }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={sel}>
          <option value="">All categories</option>
          {cats.map(c2 => <option key={c2} value={c2}>{c2}</option>)}
        </select>
        <select value={stat} onChange={e => setStat(e.target.value)} style={sel}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ alignSelf: "center", fontSize: 12, color: C.muted }}>{filtered.length} shown</span>
        <button onClick={async () => {
          const targets = filtered.filter(r => r.p.status !== "published" && r.p.price != null);
          const skipped = filtered.filter(r => r.p.status !== "published" && r.p.price == null).length;
          if (!targets.length) { window.alert("Nothing publishable in this filter (drafts need a price)."); return; }
          if (!window.confirm(`Publish ${targets.length} filtered draft(s)?${skipped ? ` (${skipped} skipped — no price.)` : ""}\n\nPublished profiles FREEZE (plan changes stop updating them) and become customer-visible.`)) return;
          for (let i = 0; i < targets.length; i += 100) {
            await sb.from("product_profiles").update({ status: "published" }).in("id", targets.slice(i, i + 100).map(r => r.p.id));
          }
          load();
        }} style={{ ...sel, fontWeight: 800, cursor: "pointer", color: "#1e7a4f", borderColor: "#1e7a4f" }}>⚡ Publish all filtered</button>
      </div>

      {loading ? <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Loading catalog…</div> : (
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {filtered.slice(0, limit).map(r => {
            const st = STATUS[r.a.availability_status] || STATUS.hidden;
            const open = openId === r.id;
            const gs = groups[r.id] || [];
            return (
              <div key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <div onClick={() => { setOpenId(open ? null : r.id); if (!open) loadLocs(r.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: C.muted, width: 66, flexShrink: 0 }}>{r.sku}</span>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: C.dark, ...wrap }}>{r.p.display_name || "(unnamed)"}</span>
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                      {[r.p.category, r.p.size_category, r.p.tier].filter(Boolean).join(" · ")}{r.kind === "combo" ? " · combo" : ""}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: C.dark, width: 92, textAlign: "right" }}>{r.p.price != null ? `$${r.p.price}` : <em style={{ color: "#c9b8a8" }}>no price</em>}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, width: 120, textAlign: "right" }}>
                    {r.a.sellable_now ?? 0}<span style={{ color: C.muted, fontWeight: 400 }}> / {r.a.planned ?? 0} planned</span>
                  </span>
                  <span style={{ background: st.bg, color: st.fg, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "3px 10px", width: 92, textAlign: "center" }}>{st.label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: r.p.status === "published" ? "#1e7a4f" : "#8a8a84", width: 70, textAlign: "center" }}>{r.p.status === "published" ? "PUBLISHED" : "draft"}</span>
                </div>
                {open && (
                  <div style={{ padding: "4px 14px 14px 90px", fontSize: 12.5, color: C.dark }}>
                    <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 8 }}>
                      <span>Planned <strong>{r.a.planned ?? 0}</strong></span>
                      <span>Released <strong>{r.a.released ?? 0}</strong></span>
                      <span>Events <strong>{r.a.event_delta ?? 0}</strong></span>
                      <span>Committed <strong>{r.a.committed ?? 0}</strong></span>
                      <span>Reserved <strong>{r.a.reserved ?? 0}</strong></span>
                      <span>Shipped <strong>{r.a.shipped ?? 0}</strong></span>
                      <span style={{ fontWeight: 800 }}>Sellable now {r.a.sellable_now ?? 0}</span>
                      {r.a.next_ready_date && <span>Next round {fmtD(r.a.next_ready_date)}</span>}
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4 }}>Rounds: </span>
                      {gs.sort((a, b) => (a.ship_week || 0) - (b.ship_week || 0)).map((g, i) => <span key={i} style={{ marginRight: 12 }}>{g.label} · wk {g.ready_week_override || g.ship_week}{g.ready_week_override ? " (adjusted)" : ""}</span>)}
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4 }}>Benches: </span>
                      {(locs[r.id] || []).map((l, i) => <span key={i} style={{ marginRight: 10, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5 }}>{l.bench_code}({l.qty})</span>)}
                      {!(locs[r.id] || []).length && <em style={{ color: C.muted }}>none linked</em>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <select value={r.p.tier || ""} onChange={e => setTier(r, e.target.value)} style={sel} title="Merchandising tier (drives tier posture)">
                        <option value="">tier: unset</option><option value="value">value</option><option value="standard">standard</option><option value="premium">premium</option>
                      </select>
                      <button onClick={() => togglePublish(r)} style={{ background: r.p.status === "published" ? "#fff" : C.dark, color: r.p.status === "published" ? C.red : "#fff", border: r.p.status === "published" ? `1.5px solid ${C.red}` : "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                        {r.p.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                      {r.p.status !== "published" && <span style={{ fontSize: 11, color: C.muted }}>draft: name/pack/price track the plan · publishing freezes the profile for merchandising</span>}
                      {!r.p.image_url && <span style={{ fontSize: 11, color: C.amber, fontWeight: 700 }}>📷 no image</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length > limit && (
            <div onClick={() => setLimit(l => l + 300)} style={{ padding: "10px 14px", textAlign: "center", fontSize: 12.5, fontWeight: 800, color: "#2b6cb0", cursor: "pointer", borderTop: `1px solid ${C.border}` }}>
              Show more ({filtered.length - limit} remaining)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
