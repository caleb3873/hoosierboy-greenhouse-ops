// 🎗 Fundraiser 2027 — standalone planning WORKSHEET (Caleb 8/19: "like a worksheet…
// doesn't have to tie in to the rest of the production plan build").
// Left: the 2027 slash-sheet catalog (photos cropped from Mario's PDF), grouped by
// made-up-on-the-fly categories. Type a qty per item, set price, and attach the
// 2026 sales rows each item replaces — the card shows last-year units beside the
// new number so production lands the right amounts. Right: searchable 2026 spring
// sales reference (sales_totals) with size chips; attached rows get a ✓.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff" };
const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', serif";
const YEAR = 2027;

export default function FundraiserPlanner() {
  const sb = getSupabase();
  const [items, setItems] = useState(null);
  const [sales, setSales] = useState([]);
  const [q, setQ] = useState("");
  const [sizeF, setSizeF] = useState("");
  const [attachFor, setAttachFor] = useState(null);   // item id currently attaching
  const [view, setView] = useState("cards");          // cards | table (one-row-per-item punch-in)
  const [pcts, setPcts] = useState({});               // per-row +% drafts (input aid, qty is what saves)
  const [bulkPct, setBulkPct] = useState("");
  const [err, setErr] = useState("");
  const timers = useRef({});

  useEffect(() => {
    if (!sb) return;
    (async () => {
      const { data } = await sb.from("fundraiser_items").select("*").eq("year", YEAR).order("sort", { ascending: true });
      setItems(data || []);
      // reference = the REAL fundraiser numbers (Fundraiser Info/FUNDRAISER INFO/
      // "spring fundraiser items sold 2026.xlsx" → fundraiser_sales), not storewide sales
      const { data: s } = await sb.from("fundraiser_sales").select("category,description,units").eq("year", 2026).order("units", { ascending: false });
      setSales((s || []).map(r => ({ description: r.description, size: r.category, units: r.units })));
    })();
  }, [sb]);

  // debounced field save — worksheet feel: type freely, it just keeps
  const save = (id, patch) => {
    setItems(xs => xs.map(x => x.id === id ? { ...x, ...patch } : x));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const { error } = await sb.from("fundraiser_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) setErr(error.message);
    }, 500);
  };
  const saveNow = async (id, patch) => {
    setItems(xs => xs.map(x => x.id === id ? { ...x, ...patch } : x));
    const { error } = await sb.from("fundraiser_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) setErr(error.message);
  };

  const addItem = async (category) => {
    const name = window.prompt("New item name:");
    if (!name) return;
    const { data, error } = await sb.from("fundraiser_items")
      .insert({ year: YEAR, name: name.toUpperCase(), category: category || "UNSORTED", sort: (items?.length || 0) + 1 })
      .select().single();
    if (error) { setErr(error.message); return; }
    setItems(xs => [...xs, data]);
  };
  const removeItem = async (it) => {
    if (!window.confirm(`Remove "${it.name}" from the 2027 worksheet?`)) return;
    await sb.from("fundraiser_items").delete().eq("id", it.id);
    setItems(xs => xs.filter(x => x.id !== it.id));
  };

  // one 2026 item can be split across SEVERAL 2027 items (Caleb 8/19) — each
  // attachment carries its own unit share; a fresh attach defaults to whatever
  // of the 2026 row is still unallocated.
  const allocated = useMemo(() => {
    const m = {};
    (items || []).forEach(it => (it.replaces || []).forEach(r => { const k = r.description + "|" + r.size; m[k] = (m[k] || 0) + (+r.units || 0); }));
    return m;
  }, [items]);

  // sharing rule (Caleb 8/19): a 2026 item matched to several 2027 items SPLITS
  // EVENLY — attach a 3rd and everyone re-levels to thirds; detach re-levels the rest.
  const same = (a, b) => a.description === b.description && a.size === b.size;
  const splitRow = (row, addId, dropId) => {
    const total = row.total_units ?? row.units ?? 0;
    let holders = items.filter(x => (x.replaces || []).some(r => same(r, row))).map(x => x.id);
    if (addId && !holders.includes(addId)) holders.push(addId);
    if (dropId) holders = holders.filter(id => id !== dropId);
    const n = holders.length;
    const base = n ? Math.floor(total / n) : 0, rem = n ? total - base * n : 0;
    setItems(xs => xs.map(x => {
      let rep = x.replaces || [];
      if (x.id === dropId) rep = rep.filter(r => !same(r, row));
      const hi = holders.indexOf(x.id);
      if (hi >= 0) {
        const share = base + (hi < rem ? 1 : 0);
        rep = rep.some(r => same(r, row))
          ? rep.map(r => same(r, row) ? { ...r, units: share, total_units: total } : r)
          : [...rep, { description: row.description, size: row.size, units: share, total_units: total }];
      }
      if (x.id === dropId || hi >= 0) {
        sb.from("fundraiser_items").update({ replaces: rep, updated_at: new Date().toISOString() }).eq("id", x.id)
          .then(({ error }) => error && setErr(error.message));
        return { ...x, replaces: rep };
      }
      return x;
    }));
  };
  const attach = (it, row) => { if (!(it.replaces || []).some(r => same(r, row))) splitRow(row, it.id, null); };
  const detach = (it, row) => splitRow(row, null, it.id);
  const setShare = (it, row, units) => save(it.id, { replaces: (it.replaces || []).map(r => (r.description === row.description && r.size === row.size) ? { ...r, units: units === "" ? 0 : +units } : r) });

  const cats = useMemo(() => {
    const order = [];
    (items || []).forEach(it => { const c = it.category || "UNSORTED"; if (!order.includes(c)) order.push(c); });
    return order;
  }, [items]);

  const sizes = useMemo(() => {
    const m = {};
    sales.forEach(r => { const s = r.size || "?"; m[s] = (m[s] || 0) + (r.units || 0); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [sales]);

  const filtered = useMemo(() => sales
    .filter(r => (!sizeF || r.size === sizeF) && (!q || r.description.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.units || 0) - (a.units || 0)), [sales, q, sizeF]);

  const lastYrOf = it => (it.replaces || []).reduce((s, r) => s + (r.units || 0), 0);

  // "sorted by size": pull a pot/basket size out of the item name (he renames names
  // to carry size), falling back to the sun/size tag, else the category
  const sizeOf = it => {
    const src = `${it.name || ""} ${it.sun || ""}`.toUpperCase();
    const m = src.match(/(\d{1,2}(?:\.\d)?)\s*(?:"|”|IN\b|INCH)/);
    const hb = /\bHB\b|BASKET/.test(src) && !/MARKET/.test(src);
    if (m) return `${m[1]}"${hb ? " HB" : ""}`;
    return it.category || "OTHER";
  };
  const sizeGroups = useMemo(() => {
    const g = {};
    (items || []).forEach(it => { const k = sizeOf(it); (g[k] = g[k] || []).push(it); });
    const num = k => { const m = k.match(/^(\d+(?:\.\d)?)/); return m ? +m[1] : 999; };
    return Object.entries(g).sort((a, b) => num(a[0]) - num(b[0]) || a[0].localeCompare(b[0]))
      .map(([k, xs]) => [k, xs.sort((a, b) => (a.name || "").localeCompare(b.name || ""))]);
  }, [items]);
  const applyPct = (it, val) => {
    setPcts(ps => ({ ...ps, [it.id]: val }));
    const ly = lastYrOf(it);
    if (val !== "" && ly > 0) save(it.id, { qty: Math.round(ly * (1 + (+val) / 100)) });
  };

  if (!items) return <div style={{ padding: 40, fontFamily: FONT, color: C.muted }}>Loading the worksheet…</div>;

  const totPlanned = items.reduce((s, x) => s + (+x.qty || 0), 0);
  const totLast = items.reduce((s, x) => s + lastYrOf(x), 0);
  const totRev = items.reduce((s, x) => s + (+x.qty || 0) * (+x.price || 0), 0);

  return (
    <div style={{ fontFamily: FONT, color: C.dark, padding: "18px 22px", maxWidth: 1500, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 30, margin: 0 }}>🎗 Fundraiser {YEAR}</h1>
        <span style={{ color: C.muted, fontSize: 13 }}>slash-sheet worksheet — type quantities, attach what each item replaces from 2026</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[["cards", "🖼 Cards"], ["table", "☰ Table"]].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ border: `1px solid ${view === v ? C.dark : C.border}`, background: view === v ? C.dark : "#fff", color: view === v ? "#fff" : C.muted, borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 600 }}>{lbl}</button>
          ))}
        </span>
      </div>
      <div style={{ display: "flex", gap: 22, margin: "10px 0 16px", fontSize: 14, flexWrap: "wrap" }}>
        <b>{totPlanned.toLocaleString()} planned</b>
        <span style={{ color: C.muted }}>vs {totLast.toLocaleString()} matched 2026 fundraiser units</span>
        <span style={{ color: totPlanned - totLast >= 0 ? C.light : C.red, fontWeight: 600 }}>{totPlanned - totLast >= 0 ? "+" : ""}{(totPlanned - totLast).toLocaleString()}</span>
        {totRev > 0 && <span style={{ color: C.muted }}>≈ ${totRev.toLocaleString(undefined, { maximumFractionDigits: 0 })} at entered prices</span>}
        {err && <span style={{ color: C.red }}>⚠ {err}</span>}
      </div>

      <div style={{ marginRight: 384 }}>
        {/* ── TABLE VIEW: one row per item, sorted by size — review LY, punch 2027 qty (manual or +% of LY) + spring price ── */}
        {view === "table" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12.5, color: C.muted }}>
              apply <input type="number" value={bulkPct} onChange={e => setBulkPct(e.target.value)} placeholder="%" style={{ width: 54, border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 6px", fontFamily: FONT, fontSize: 12.5 }} />
              % over last year to every matched row
              <button onClick={() => { if (bulkPct === "") return; items.forEach(it => { if (lastYrOf(it) > 0) applyPct(it, bulkPct); }); }}
                style={{ border: `1px solid ${C.light}`, background: C.chip, borderRadius: 7, padding: "3px 10px", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>apply to all</button>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 90px 64px 84px 84px 90px", gap: 8, padding: "8px 12px", fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: .4, borderBottom: `2px solid ${C.light}` }}>
                <span></span><span>ITEM</span><span style={{ textAlign: "right" }}>2026 SOLD</span><span style={{ textAlign: "right" }}>+%</span><span style={{ textAlign: "right" }}>2027 QTY</span><span style={{ textAlign: "right" }}>2027 $</span><span style={{ textAlign: "right" }}>REVENUE</span>
              </div>
              {sizeGroups.map(([size, xs]) => (
                <div key={size}>
                  <div style={{ padding: "6px 12px", background: C.chip, fontFamily: SERIF, fontSize: 14, borderBottom: `1px solid ${C.border}` }}>
                    {size} <span style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>· {xs.reduce((t, x) => t + lastYrOf(x), 0).toLocaleString()} LY → {xs.reduce((t, x) => t + (+x.qty || 0), 0).toLocaleString()} planned</span>
                  </div>
                  {xs.map(it => {
                    const ly = lastYrOf(it);
                    return (
                      <div key={it.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr 90px 64px 84px 84px 90px", gap: 8, padding: "5px 12px", alignItems: "center", borderBottom: `1px solid ${C.chip}` }}>
                        {it.photo_url ? <img src={it.photo_url} alt="" style={{ width: 40, height: 30, objectFit: "cover", borderRadius: 5 }} /> : <span />}
                        <input value={it.name || ""} onChange={e => save(it.id, { name: e.target.value.toUpperCase() })}
                          style={{ border: "none", background: "transparent", fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: C.dark, outline: "none", minWidth: 0 }} />
                        <span style={{ textAlign: "right", fontSize: 12.5, color: ly ? C.dark : C.muted, fontWeight: ly ? 700 : 400 }}>{ly ? ly.toLocaleString() : "—"}</span>
                        <input type="number" value={pcts[it.id] ?? ""} placeholder="%" disabled={!ly} onChange={e => applyPct(it, e.target.value)}
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 5px", fontSize: 11.5, fontFamily: FONT, textAlign: "right", background: ly ? "#fff" : C.chip }} />
                        <input type="number" value={it.qty ?? ""} placeholder="qty" onChange={e => { setPcts(ps => ({ ...ps, [it.id]: "" })); save(it.id, { qty: e.target.value === "" ? null : +e.target.value }); }}
                          style={{ width: "100%", border: `2px solid ${C.light}`, borderRadius: 7, padding: "3px 6px", fontSize: 13, fontWeight: 700, fontFamily: FONT, textAlign: "right" }} />
                        <input type="number" step="0.01" value={it.price ?? ""} placeholder="$" onChange={e => save(it.id, { price: e.target.value === "" ? null : +e.target.value })}
                          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 6px", fontSize: 12, fontFamily: FONT, textAlign: "right" }} />
                        <span style={{ textAlign: "right", fontSize: 12, color: C.muted }}>{(+it.qty || 0) && (+it.price || 0) ? `$${((+it.qty) * (+it.price)).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 2027 catalog by category ── */}
        <div style={{ minWidth: 0, display: view === "cards" ? undefined : "none" }}>
          {cats.map(cat => {
            const xs = items.filter(it => (it.category || "UNSORTED") === cat);
            const cp = xs.reduce((s, x) => s + (+x.qty || 0), 0), cl = xs.reduce((s, x) => s + lastYrOf(x), 0);
            return (
              <div key={cat} style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, borderBottom: `2px solid ${C.light}`, paddingBottom: 4, marginBottom: 10 }}>
                  <h2 style={{ fontFamily: SERIF, fontSize: 19, margin: 0 }}>{cat}</h2>
                  <span style={{ fontSize: 12.5, color: C.muted }}>{cp.toLocaleString()} planned · {cl.toLocaleString()} last yr</span>
                  <button onClick={() => addItem(cat)} style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: C.chip, borderRadius: 8, padding: "2px 10px", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>+ item</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                  {xs.map(it => (
                    <div key={it.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                      {it.photo_url
                        ? <img src={it.photo_url} alt={it.name} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                        : <div style={{ height: 130, background: C.chip, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12 }}>no photo</div>}
                      <div style={{ padding: "8px 10px 10px" }}>
                        <input value={it.name || ""} onChange={e => save(it.id, { name: e.target.value.toUpperCase() })}
                          style={{ width: "100%", border: "none", fontWeight: 700, fontSize: 13.5, fontFamily: FONT, color: C.dark, background: "transparent", outline: "none" }} />
                        <div style={{ display: "flex", gap: 6, margin: "4px 0" }}>
                          <input value={it.sun || ""} placeholder="sun/size tag" onChange={e => save(it.id, { sun: e.target.value })}
                            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", fontSize: 10.5, fontFamily: FONT, color: C.muted }} />
                          <input value={it.category || ""} list="fundraiser-cats" placeholder="category" onChange={e => save(it.id, { category: e.target.value.toUpperCase() })}
                            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 6px", fontSize: 10.5, fontFamily: FONT, color: C.dark }} />
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="number" value={it.qty ?? ""} placeholder="qty" onChange={e => save(it.id, { qty: e.target.value === "" ? null : +e.target.value })}
                            style={{ width: 74, border: `2px solid ${C.light}`, borderRadius: 8, padding: "4px 6px", fontSize: 15, fontWeight: 700, fontFamily: FONT }} />
                          <span style={{ fontSize: 11, color: C.muted }}>$</span>
                          <input type="number" step="0.01" value={it.price ?? ""} placeholder="price" onChange={e => save(it.id, { price: e.target.value === "" ? null : +e.target.value })}
                            style={{ width: 64, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 6px", fontSize: 12.5, fontFamily: FONT }} />
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: lastYrOf(it) ? C.dark : C.muted, fontWeight: lastYrOf(it) ? 700 : 400 }}>
                            {lastYrOf(it) ? `LY ${lastYrOf(it).toLocaleString()}` : "LY —"}
                          </span>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          {(it.replaces || []).map(r => (
                            <div key={r.description + r.size} style={{ display: "flex", gap: 4, fontSize: 10.5, color: C.muted, alignItems: "center" }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${r.description} (${r.size})${r.total_units ? ` — ${r.total_units} sold 2026` : ""}`}>↳ {r.description}</span>
                              <input type="number" value={r.units ?? ""} onChange={e => setShare(it, r, e.target.value)} title="this item's share of the 2026 units"
                                style={{ width: 46, border: `1px solid ${C.border}`, borderRadius: 5, padding: "1px 3px", fontSize: 10.5, fontFamily: FONT, fontWeight: 700, color: C.dark, textAlign: "right" }} />
                              <span onClick={() => detach(it, r)} style={{ cursor: "pointer", color: C.red }} title="detach">✕</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={() => setAttachFor(attachFor === it.id ? null : it.id)}
                              style={{ border: `1px dashed ${attachFor === it.id ? C.amber : C.border}`, background: attachFor === it.id ? "#fdf3e3" : "transparent", borderRadius: 7, padding: "2px 8px", cursor: "pointer", fontFamily: FONT, fontSize: 11, color: attachFor === it.id ? C.amber : C.muted }}>
                              {attachFor === it.id ? "⬅ click 2026 rows →" : "⚭ matches / replaces…"}
                            </button>
                            <button onClick={() => removeItem(it)} style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", color: C.muted, fontSize: 11 }} title="remove item">🗑</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <button onClick={() => addItem("")} style={{ border: `1px dashed ${C.border}`, background: "transparent", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontFamily: FONT, fontSize: 13, color: C.muted }}>+ Add item / new category</button>
          <datalist id="fundraiser-cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
        </div>

        {/* ── 2026 fundraiser reference — FIXED so it rides along while scrolling ── */}
        <div style={{ position: "fixed", top: 104, right: 22, bottom: 14, width: 360, zIndex: 40, display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, boxShadow: "0 6px 24px rgba(30,45,26,.10)" }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, marginBottom: 6 }}>2026 fundraiser sales</div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="search 2026 fundraiser items…"
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 9px", fontFamily: FONT, fontSize: 13, marginBottom: 6 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
            <span onClick={() => setSizeF("")} style={{ cursor: "pointer", fontSize: 10.5, padding: "2px 7px", borderRadius: 9, background: !sizeF ? C.dark : C.chip, color: !sizeF ? "#fff" : C.muted }}>all</span>
            {sizes.slice(0, 12).map(([s, u]) => (
              <span key={s} onClick={() => setSizeF(sizeF === s ? "" : s)} title={`${u.toLocaleString()} units`}
                style={{ cursor: "pointer", fontSize: 10.5, padding: "2px 7px", borderRadius: 9, background: sizeF === s ? C.dark : C.chip, color: sizeF === s ? "#fff" : C.muted }}>{s}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>
            {filtered.length} rows · {filtered.reduce((s, r) => s + (r.units || 0), 0).toLocaleString()} units
            {attachFor && <b style={{ color: C.amber }}> — click a row to attach</b>}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.slice(0, 400).map(r => {
              const got = allocated[r.description + "|" + r.size] || 0;
              const full = got >= (r.units || 0) && got > 0;
              const over = got > (r.units || 0);
              return (
                <div key={r.description + r.size}
                  onClick={() => { if (attachFor) { const it = items.find(x => x.id === attachFor); if (it) attach(it, r); } }}
                  style={{ display: "flex", gap: 6, padding: "4px 6px", borderRadius: 7, fontSize: 11.5, alignItems: "center",
                           cursor: attachFor ? "pointer" : "default", background: full ? "#f2f8ee" : got ? "#fdf6e9" : "transparent",
                           borderBottom: `1px solid ${C.chip}` }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: full ? C.muted : C.dark }} title={r.description}>
                    {full ? "✓ " : ""}{r.description}
                  </span>
                  {got > 0 && !full && <span style={{ fontSize: 9.5, color: C.amber, fontWeight: 700 }}>{got}/{r.units}</span>}
                  {over && <span style={{ fontSize: 9.5, color: C.red, fontWeight: 700 }} title="allocated more than 2026 sold">{got}/{r.units}!</span>}
                  <span style={{ color: C.muted, fontSize: 10 }}>{r.size}</span>
                  <b style={{ width: 40, textAlign: "right" }}>{(r.units || 0).toLocaleString()}</b>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
