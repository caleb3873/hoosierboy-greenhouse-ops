// MumTruckBuilder — the Sullivan fall-mum coordination tool (Caleb 8/13).
// Each store manager opens THEIR link (?mums=<store>) with no login and builds
// their trucks: pick the color mix per truck, set the order they want deliveries.
// ?mums=overview = the all-stores rollup (color totals per store + grand total).
// Customer-facing → Hoosier Boy branding, never the company name.
import { useState, useEffect, useMemo, useCallback } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", bg: "#f4f8ef",
  muted: "#7a8c74", text: "#2f3b2a", red: "#d94f3d", amber: "#e89a3a",
  amberBg: "#fbf1df", border: "#dfe8d6", card: "#ffffff", chip: "#eaf2e0" };
const FONT = "'DM Sans','Segoe UI',sans-serif";

export const MUM_COLORS = ["Red", "Orange", "Bronze", "Yellow", "Coral", "Pink", "Purple", "White", "Gold"];
const COLOR_DOT = { Red: "#c0392b", Orange: "#e67e22", Bronze: "#a5652a", Yellow: "#f1c40f",
  Coral: "#f88f6f", Pink: "#e91e63", Purple: "#8e44ad", White: "#f2f0e8", Gold: "#d4a017" };

// truck = 896 9" mums; partial trucks carry their own count
export const MUM_STORES = {
  "sullivan-keystone":     { label: "Sullivan Hardware — Keystone",     trucks: Array(18).fill(896) },
  "sullivan-cicero":       { label: "Sullivan Hardware — Cicero",       trucks: [896, 104] },
  "sullivan-49th-penn":    { label: "Sullivan Hardware — 49th & Penn",  trucks: [896, 896, 896, 896, 416] },
  "sullivan-allisonville": { label: "Sullivan Hardware — Allisonville", trucks: Array(10).fill(896) },
};

const sumColors = colors => MUM_COLORS.reduce((a, c) => a + (Math.max(0, Math.round(+colors?.[c] || 0))), 0);

export default function MumTruckBuilder({ slug }) {
  const sb = getSupabase();
  const overview = slug === "overview";
  const store = MUM_STORES[slug];
  const [rows, setRows] = useState(null);
  const [who, setWho] = useState(() => { try { return localStorage.getItem("hb_mum_who") || ""; } catch { return ""; } });
  const [draft, setDraft] = useState({});     // truck id -> colors being edited
  const [savedFlash, setSavedFlash] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    let q = sb.from("mum_trucks").select("*").order("store").order("seq");
    if (!overview) q = q.eq("store", slug);
    const { data } = await q;
    // first visit seeds the store's trucks (unique store+seq keeps double-seeds out)
    if (!overview && store && (data || []).length < store.trucks.length) {
      const have = new Set((data || []).map(r => r.seq));
      const missing = store.trucks.map((cap, i) => ({ store: slug, seq: i + 1, capacity: cap, colors: {} }))
        .filter(t => !have.has(t.seq));
      if (missing.length) {
        await sb.from("mum_trucks").upsert(missing, { onConflict: "store,seq", ignoreDuplicates: true });
        const { data: again } = await sb.from("mum_trucks").select("*").eq("store", slug).order("seq");
        setRows(again || []);
        return;
      }
    }
    setRows(data || []);
  }, [sb, slug, overview, store]);
  useEffect(() => { load(); }, [load]);

  const colorsOf = t => draft[t.id] ?? (t.colors || {});
  const setColor = (t, color, v) => {
    const n = String(v).replace(/[^\d]/g, "");
    setDraft(d => ({ ...d, [t.id]: { ...colorsOf(t), [color]: n === "" ? "" : +n } }));
  };

  async function saveTruck(t) {
    const colors = {};
    MUM_COLORS.forEach(c => { const n = Math.max(0, Math.round(+colorsOf(t)[c] || 0)); if (n) colors[c] = n; });
    setBusy(true);
    const { error } = await sb.from("mum_trucks").update({
      colors, submitted_by: who || null, updated_at: new Date().toISOString(),
    }).eq("id", t.id);
    setBusy(false);
    if (error) { window.alert("Didn't save — try again. (" + error.message + ")"); return; }
    try { localStorage.setItem("hb_mum_who", who); } catch { /* ignore */ }
    setDraft(d => { const n = { ...d }; delete n[t.id]; return n; });
    setSavedFlash(f => ({ ...f, [t.id]: true }));
    setTimeout(() => setSavedFlash(f => ({ ...f, [t.id]: false })), 2000);
    load();
  }

  async function move(t, dir) {
    const list = rows;
    const i = list.findIndex(x => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    setBusy(true);
    // swap through a parking seq to dodge the (store,seq) unique constraint
    await sb.from("mum_trucks").update({ seq: -1 }).eq("id", t.id);
    await sb.from("mum_trucks").update({ seq: t.seq }).eq("id", other.id);
    await sb.from("mum_trucks").update({ seq: other.seq }).eq("id", t.id);
    setBusy(false);
    load();
  }

  const totals = useMemo(() => {
    const byColor = {}; let placed = 0, cap = 0;
    (rows || []).forEach(t => {
      cap += t.capacity;
      MUM_COLORS.forEach(c => { const n = Math.max(0, Math.round(+((t.colors || {})[c]) || 0)); byColor[c] = (byColor[c] || 0) + n; placed += n; });
    });
    return { byColor, placed, cap };
  }, [rows]);

  const shell = kids => (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ background: C.dark, color: C.cream, padding: "14px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 22 }}>🍂 Hoosier Boy — Fall Mum Trucks</div>
          <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
            {overview ? "All stores — live totals" : store ? store.label : "Unknown store"}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "14px 12px 60px" }}>{kids}</div>
    </div>
  );

  if (!overview && !store) return shell(<div style={{ padding: 30, textAlign: "center", color: C.muted }}>This link isn't right — check with your Hoosier Boy rep.</div>);
  if (!rows) return shell(<div style={{ padding: 30, textAlign: "center", color: C.muted }}>Loading…</div>);

  if (overview) {
    const stores = Object.keys(MUM_STORES);
    return shell(
      <>
        {stores.map(sk => {
          const st = MUM_STORES[sk];
          const mine = rows.filter(r => r.store === sk);
          const byColor = {}; let placed = 0;
          mine.forEach(t => MUM_COLORS.forEach(c => { const n = Math.max(0, +((t.colors || {})[c]) || 0); byColor[c] = (byColor[c] || 0) + n; placed += n; }));
          const cap = st.trucks.reduce((a, b) => a + b, 0);
          return (
            <div key={sk} style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <b>{st.label}</b>
                <span style={{ fontSize: 11.5, color: C.muted }}>{st.trucks.length} trucks · {cap.toLocaleString()} mums</span>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: placed >= cap ? "#2e7d32" : C.amber }}>{placed.toLocaleString()} / {cap.toLocaleString()} chosen</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {MUM_COLORS.map(c => (
                  <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.chip, borderRadius: 12, padding: "2px 9px", fontSize: 11.5, fontWeight: 700 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: COLOR_DOT[c], border: "1px solid rgba(0,0,0,.15)" }} />
                    {c} {(byColor[c] || 0).toLocaleString()}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 11.5, color: C.muted, textAlign: "center", marginTop: 12 }}>
          Grand total chosen: <b>{totals.placed.toLocaleString()}</b> of {Object.values(MUM_STORES).reduce((a, s) => a + s.trucks.reduce((x, y) => x + y, 0), 0).toLocaleString()} mums
        </div>
      </>
    );
  }

  return shell(
    <>
      <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          Build your trucks below — <b>Truck 1 arrives first</b>, then 2, and so on (use ▲▼ to change the order).
          Fill in how many of each color you want on each truck; the counter shows what's left to assign. Hit <b>Save truck</b> as you go — you can come back and change anything later.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted }}>Your name</span>
          <input value={who} onChange={e => setWho(e.target.value)} placeholder="so we know who built this"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: FONT }} />
        </div>
      </div>

      <div style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 12.5 }}>Your totals</b>
        {MUM_COLORS.map(c => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.chip, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: COLOR_DOT[c], border: "1px solid rgba(0,0,0,.15)" }} />
            {(totals.byColor[c] || 0).toLocaleString()}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: totals.placed >= totals.cap ? "#2e7d32" : C.amber }}>
          {totals.placed.toLocaleString()} / {totals.cap.toLocaleString()}
        </span>
      </div>

      {rows.map((t, i) => {
        const colors = colorsOf(t);
        const used = sumColors(colors);
        const left = t.capacity - used;
        const dirty = draft[t.id] != null;
        return (
          <div key={t.id} style={{ background: C.card, border: `1.5px solid ${left < 0 ? C.red : dirty ? C.amber : C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 15 }}>🚚 Truck {t.seq}</b>
              <span style={{ fontSize: 12, color: C.muted }}>{t.capacity.toLocaleString()} mums{t.capacity < 896 ? " (partial)" : ""}</span>
              <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 800,
                color: left === 0 ? "#2e7d32" : left < 0 ? C.red : C.amber }}>
                {left === 0 ? "✓ full" : left < 0 ? `${(-left).toLocaleString()} over!` : `${left.toLocaleString()} left`}
              </span>
              <span style={{ display: "inline-flex", gap: 2 }}>
                <button disabled={busy || i === 0} onClick={() => move(t, -1)} title="deliver earlier"
                  style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 12 }}>▲</button>
                <button disabled={busy || i === rows.length - 1} onClick={() => move(t, +1)} title="deliver later"
                  style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: 6, padding: "2px 7px", cursor: "pointer", fontSize: 12 }}>▼</button>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
              {MUM_COLORS.map(c => (
                <label key={c} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: COLOR_DOT[c], border: "1px solid rgba(0,0,0,.2)" }} />{c}
                  </span>
                  <input inputMode="numeric" value={colors[c] ?? ""} onChange={e => setColor(t, c, e.target.value)} placeholder="0"
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 15, fontFamily: FONT, textAlign: "right" }} />
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              {t.submitted_by && !dirty && <span style={{ fontSize: 10.5, color: C.muted }}>last saved by {t.submitted_by}</span>}
              {savedFlash[t.id] && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#2e7d32" }}>✓ saved</span>}
              <span style={{ flex: 1 }} />
              <button disabled={busy || left < 0} onClick={() => saveTruck(t)}
                style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: left < 0 ? "#c9d4c2" : C.dark, color: C.cream, fontWeight: 800, fontSize: 13, cursor: left < 0 ? "default" : "pointer", fontFamily: FONT }}>
                {left < 0 ? "over capacity" : "Save truck"}
              </button>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 14 }}>
        Questions? Call your Hoosier Boy rep — changes save instantly, nothing to submit.
      </div>
    </>
  );
}
