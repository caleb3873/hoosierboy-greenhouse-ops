import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

// Sales → Hot Lists: ORDERABLE catalog hot lists (draft → pushed). Distinct from the
// photo/media hot list in the mobile hub — these reference published catalog items and
// are what customers will order from (portal renders them in summer; orders carry
// hot_list_id provenance). The health guard blocks pushing near-sellout items.
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#e0ead8", red: "#d94f3d", amber: "#e89a3a" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const fmtDT = iso => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

export default function CatalogHotLists() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [lists, setLists] = useState([]);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("hot_lists").select("*, hot_list_items(id)").order("created_at", { ascending: false });
    setLists(data || []);
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  async function makeNew() {
    const title = window.prompt("New hot list — title:", `Hot List — week of ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    if (!title || !title.trim()) return;
    const { data } = await sb.from("hot_lists").insert({ title: title.trim(), list_date: new Date().toISOString().slice(0, 10), created_by: displayName || "admin" }).select("id").single();
    await load(); if (data) setOpenId(data.id);
  }
  const open = lists.find(l => l.id === openId);
  if (open) return <ListEditor sb={sb} list={open} onBack={() => { setOpenId(null); load(); }} />;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0 }}>🔥 Hot Lists (catalog)</h2>
        <button onClick={makeNew} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ New</button>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
        Curated orderable lists of published catalog items — the push channel customers will order from. (The photo hot list in the mobile hub is separate: that's media, this is catalog.)
      </div>
      {lists.map(l => (
        <div key={l.id} onClick={() => setOpenId(l.id)} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 15px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: C.dark, ...wrap }}>{l.title}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{(l.hot_list_items || []).length} items · {fmtDT(l.list_date || l.created_at)}{l.created_by ? ` · ${l.created_by}` : ""}</div>
          </div>
          <span style={{ background: l.state === "pushed" ? "#e7f6ef" : "#eef2fb", color: l.state === "pushed" ? "#1e7a4f" : "#4a6fb0", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 11px", textTransform: "capitalize" }}>{l.state}</span>
        </div>
      ))}
      {!lists.length && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>No catalog hot lists yet.</div>}
    </div>
  );
}

function ListEditor({ sb, list, onBack }) {
  const [l, setL] = useState(list);
  const [items, setItems] = useState([]);   // v_hot_list_health rows (item + live availability)
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: ll }, { data: h }] = await Promise.all([
      sb.from("hot_lists").select("*").eq("id", list.id).single(),
      sb.from("v_hot_list_health").select("*").eq("hot_list_id", list.id),
    ]);
    if (ll) setL(ll);
    const { data: hli } = await sb.from("hot_list_items").select("id, product_profile_id, sort, blurb").eq("hot_list_id", list.id).order("sort");
    const hBy = Object.fromEntries((h || []).map(x => [x.product_profile_id, x]));
    setItems((hli || []).map(it => ({ ...it, health: hBy[it.product_profile_id] || {} })));
  }, [sb, list.id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.from("product_profiles").select("id, display_name, price, status, production_item_id").eq("status", "published").ilike("display_name", `%${q}%`).limit(8);
      setHits(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, sb]);

  async function add(p) {
    await sb.from("hot_list_items").insert({ hot_list_id: l.id, product_profile_id: p.id, sort: items.length });
    setQ(""); setHits([]); load();
  }
  async function remove(it) { await sb.from("hot_list_items").delete().eq("id", it.id); load(); }
  async function blurb(it) {
    const b = window.prompt("Blurb for this item (customers see it):", it.blurb || "");
    if (b !== null) { await sb.from("hot_list_items").update({ blurb: b || null }).eq("id", it.id); load(); }
  }
  async function move(i, d) {
    const arr = [...items]; const j = i + d; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    for (let k = 0; k < arr.length; k++) await sb.from("hot_list_items").update({ sort: k }).eq("id", arr[k].id);
    load();
  }
  async function push() {
    const unhealthy = items.filter(it => !["available"].includes(it.health.availability_status));
    if (unhealthy.length && !window.confirm(`⚠️ ${unhealthy.length} item(s) aren't cleanly available (${unhealthy.map(u => `${u.health.display_name || "?"}: ${u.health.availability_status || "?"}`).slice(0, 3).join("; ")}${unhealthy.length > 3 ? "…" : ""}).\n\nPush anyway?`)) return;
    if (!items.length) { window.alert("Add items first."); return; }
    setBusy(true);
    await sb.from("hot_lists").update({ state: "pushed", pushed_at: new Date().toISOString() }).eq("id", l.id);
    setBusy(false); load();
    window.alert("Pushed. (Customer delivery of pushed lists — portal/email — is the summer build; the list is live in the data for it.)");
  }
  async function unpush() { await sb.from("hot_lists").update({ state: "draft", pushed_at: null }).eq("id", l.id); load(); }

  const stColor = s => ({ available: "#1e7a4f", low: "#b06c14", coming_soon: "#4a6fb0", more_coming: "#4a6fb0", sold_out: "#b03a2e" }[s] || "#8a8a84");
  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "18px 22px", maxWidth: 860 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>← Hot lists</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 12px" }}>
        <h2 style={{ fontFamily: "'DM Serif Display',serif", color: C.dark, margin: 0, ...wrap }}>{l.title}</h2>
        {l.state === "pushed"
          ? <button onClick={unpush} style={{ background: "#fff", color: C.amber, border: `1.5px solid ${C.amber}`, borderRadius: 9, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Unpush (back to draft)</button>
          : <button onClick={push} disabled={busy} style={{ background: C.red, color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🔥 Push it</button>}
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="＋ Add a PUBLISHED item — search…"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13.5, fontFamily: "inherit" }} />
        {hits.length > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, boxShadow: "0 8px 20px rgba(0,0,0,.12)", zIndex: 20, maxHeight: 240, overflow: "auto" }}>
            {hits.map(p => <div key={p.id} onClick={() => add(p)} style={{ padding: "8px 11px", fontSize: 12.5, cursor: "pointer", borderTop: `1px solid ${C.border}` }}>{p.display_name} {p.price != null && <span style={{ color: C.muted }}>· ${p.price}</span>}</div>)}
          </div>
        )}
        {q.length >= 2 && !hits.length && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>No published matches — items must be PUBLISHED (📦 Catalog) before they can go on a hot list.</div>}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 14px" }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button onClick={() => move(i, -1)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: C.muted, padding: 0 }}>▲</button>
              <button onClick={() => move(i, 1)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: C.muted, padding: 0 }}>▼</button>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.dark, ...wrap }}>{it.health.display_name || "?"}</div>
              {it.blurb && <div style={{ fontSize: 12, color: C.muted, ...wrap }}>{it.blurb}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: stColor(it.health.availability_status) }}>
              {(it.health.availability_status || "—").replace("_", " ")}{it.health.sellable_now != null ? ` · ${it.health.sellable_now}` : ""}
            </span>
            <button onClick={() => blurb(it)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✎ Blurb</button>
            <button onClick={() => remove(it)} style={{ background: "none", border: "none", color: C.red, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>×</button>
          </div>
        ))}
        {!items.length && <div style={{ fontSize: 12.5, color: C.muted, padding: "12px 0" }}>Empty — add published items above.</div>}
      </div>
    </div>
  );
}
