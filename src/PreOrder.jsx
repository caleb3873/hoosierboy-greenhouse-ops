// Pre-order sheets — a customer-facing page for one product program (first: the Antoinette
// pansies) that Mario sends to a customer BEFORE we commit the crop. The customer opens a
// personal link (/?po=<sheet id>, no login), sees the program the Hoosier Boy way (photo,
// size, price, story), types the quantities they want, and sends them. On our side the
// module lists every sheet: sent → opened → quantities, with program totals.
//
// Generic on purpose (Caleb 9/10/2026): a program is any set of items — new introductions,
// a whole category, or the full line. Tables: preorder_programs, preorder_program_items,
// preorder_sheets (one per customer link), preorder_entries (qty per item), preorder_visits.
// Customer-facing copy is Hoosier Boy, never Schlegel.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", border: "#dfe7d8",
  red: "#d94f3d", amber: "#e89a3a", text: "#2f3b2a", chip: "#eef3e8", paper: "#f7f6f1" };
const FONT = "'DM Sans', sans-serif";
const SERIF = "'DM Serif Display', Georgia, serif";
const money = n => n == null || n === "" ? "—" : `$${(+n).toFixed(2)}`;
// Real Hoosier Boy logos on every customer-facing page (Caleb 9/10): white reversed on the
// dark bar, two-color for light backgrounds. Served from the app's own public/ folder.
export const LOGO_WHITE = "/hoosier-boy-logo-white.png";
export const LOGO_COLOR = "/hoosier-boy-logo-color.jpg";
export const preorderUrl = id => `${window.location.origin}/?po=${id}`;
const colorsOf = it => Array.isArray(it?.colors) ? it.colors.filter(c => c && c.name) : [];
const ek = (itemId, color) => `${itemId}|${color || ""}`;

// Every photo on a customer sheet expands, downloads and shares (Caleb 9/10).
function Lightbox({ photo, onClose }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  if (!photo) return null;
  const fname = (photo.name || "hoosier-boy-photo").replace(/[^\w\-]+/g, "-").toLowerCase() + (/(\.png)(\?|$)/i.test(photo.url) ? ".png" : ".jpg");
  const asFile = async () => { const r = await fetch(photo.url, { mode: "cors" }); const b = await r.blob(); return new File([b], fname, { type: b.type || "image/jpeg" }); };
  const download = async () => {
    setBusy(true);
    try { const f = await asFile(); const u = URL.createObjectURL(f); const a = document.createElement("a"); a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
    catch { window.open(photo.url, "_blank", "noopener"); }
    setBusy(false);
  };
  const share = async () => {
    setBusy(true);
    try {
      if (navigator.share) {
        let files = null; try { const f = await asFile(); if (navigator.canShare && navigator.canShare({ files: [f] })) files = [f]; } catch { /* fall back to the link */ }
        await navigator.share({ title: photo.name || "Hoosier Boy", text: photo.name ? `${photo.name} — Hoosier Boy` : "Hoosier Boy", ...(files ? { files } : { url: photo.url }) });
      } else { await navigator.clipboard.writeText(photo.url); window.alert("Photo link copied"); }
    } catch { /* cancelled */ }
    setBusy(false);
  };
  const b = { background: "rgba(255,255,255,.14)", color: "#fff", border: "1px solid rgba(255,255,255,.35)", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,16,8,.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <img src={photo.url} alt={photo.name || ""} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: 8, boxShadow: "0 20px 60px rgba(0,0,0,.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {photo.name && <span style={{ color: "#fff", fontFamily: SERIF, fontSize: 17, alignSelf: "center", marginRight: 6 }}>{photo.name}</span>}
        <button style={b} disabled={busy} onClick={download}>⤓ Download</button>
        <button style={b} disabled={busy} onClick={share}>{navigator.share ? "Share…" : "Copy link"}</button>
        <a href={photo.url} target="_blank" rel="noreferrer" style={{ ...b, textDecoration: "none" }}>Open full size</a>
        <button style={b} onClick={onClose}>✕ Close</button>
      </div>
    </div>
  );
}

function visitorId() {
  try {
    let v = localStorage.getItem("hb_visitor");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("hb_visitor", v); }
    return v;
  } catch { return null; }
}
function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDeadline(d) {
  if (!d) return null;
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC PAGE  /?po=<sheet id>  — what the customer sees. No login.
// ─────────────────────────────────────────────────────────────────────────────
export function PreOrderSheetViewer({ id }) {
  const sb = getSupabase();
  const [sheet, setSheet] = useState(undefined);   // undefined=loading, null=not found
  const [program, setProgram] = useState(null);
  const [items, setItems] = useState([]);
  const [qty, setQty] = useState({});                // item_id → qty
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);            // ISO of last submit in this session
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(null);         // lightbox {url,name}

  useEffect(() => {
    (async () => {
      const { data: s } = await sb.from("preorder_sheets").select("*").eq("id", id).maybeSingle();
      if (!s || s.active === false) { setSheet(null); return; }
      const [{ data: p }, { data: its }, { data: ents }] = await Promise.all([
        sb.from("preorder_programs").select("*").eq("id", s.program_id).maybeSingle(),
        sb.from("preorder_program_items").select("*").eq("program_id", s.program_id).eq("active", true).order("sort").order("name"),
        sb.from("preorder_entries").select("item_id,color,qty").eq("sheet_id", id),
      ]);
      setSheet(s); setProgram(p || null); setItems(its || []);
      const q = {}; (ents || []).forEach(e => { q[ek(e.item_id, e.color)] = e.qty; }); setQty(q);
      setName(s.submitted_name || s.contact_name || "");
      setNote(s.submitted_note || "");
      if (p?.title) document.title = `${p.title} · Hoosier Boy`;
      // one visit per device per 30 minutes; first/last open + count live on the sheet
      try {
        const k = `hb_po_seen_${id}`; const last = +(localStorage.getItem(k) || 0);
        if (Date.now() - last > 30 * 60 * 1000) {
          localStorage.setItem(k, String(Date.now()));
          await sb.from("preorder_visits").insert({ sheet_id: id, visitor: visitorId(), user_agent: navigator.userAgent.slice(0, 200) });
          const now = new Date().toISOString();
          await sb.from("preorder_sheets").update({ first_opened_at: s.first_opened_at || now, last_opened_at: now, open_count: (s.open_count || 0) + 1 }).eq("id", id);
        }
      } catch { /* tracking is best-effort */ }
    })();
  }, [id]); // eslint-disable-line

  const closed = program && (program.status === "closed" || (program.deadline && new Date(program.deadline + "T23:59:59") < new Date()));
  // one line per item × color (a plain item is a single line with color "")
  const lines = items.flatMap(it => {
    const cs = colorsOf(it);
    return (cs.length ? cs.map(c => c.name) : [""]).map(color => ({ it, color, q: Math.max(0, Math.round(+qty[ek(it.id, color)] || 0)) }));
  });
  const totalQty = lines.reduce((a, l) => a + l.q, 0);
  const totalAmt = lines.reduce((a, l) => a + l.q * (+l.it.wholesale_price || 0), 0);
  const itemQty = it => lines.filter(l => l.it.id === it.id).reduce((a, l) => a + l.q, 0);

  const setQ = (it, v, color = "") => {
    const step = Math.max(1, +it.qty_step || 1);
    let n = Math.max(0, Math.round(+v || 0));
    if (n > 0 && it.min_qty && n < it.min_qty) n = it.min_qty;
    if (step > 1 && n % step) n = Math.ceil(n / step) * step;
    setQty(q => ({ ...q, [ek(it.id, color)]: n }));
  };
  const submit = async () => {
    if (closed) return;
    if (!name.trim()) { setErr("Add your name so we know who to call back."); return; }
    setSaving(true); setErr(null);
    try {
      const rows = lines.map(l => ({ sheet_id: id, item_id: l.it.id, color: l.color || "", qty: l.q, updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error } = await sb.from("preorder_entries").upsert(rows, { onConflict: "sheet_id,item_id,color" });
        if (error) throw error;
      }
      const now = new Date().toISOString();
      const { error: e2 } = await sb.from("preorder_sheets").update({ submitted_at: now, submitted_name: name.trim(), submitted_note: note.trim() || null, updated_at: now }).eq("id", id);
      if (e2) throw e2;
      setSent(now);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { setErr(e.message || "Something went wrong — try again or call us."); }
    setSaving(false);
  };

  if (sheet === undefined) return <div style={{ fontFamily: FONT, padding: 40, color: C.muted }}>Loading…</div>;
  if (sheet === null || !program) return (
    <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>🌼</div>
      This link isn't active. Reach out to Hoosier Boy for a fresh one.
    </div>
  );

  const deadline = fmtDeadline(program.deadline);
  const already = !!sheet.submitted_at && !sent;
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap');
        .po-wrap{max-width:760px;margin:0 auto;padding:0 16px 60px}
        .po-card{background:#fff;border:1px solid ${C.border};border-radius:14px;overflow:hidden;margin-bottom:14px}
        .po-card img.po-photo{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:${C.chip};cursor:zoom-in}
        img.po-zoom{cursor:zoom-in}
        .po-color{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed ${C.border}}
        .po-color img{width:64px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;background:${C.chip}}
        .po-color .nm{flex:1;font-weight:700;color:${C.dark};font-size:15px}
        .po-qty{display:flex;align-items:center;gap:8px}
        .po-qty button{width:44px;height:44px;border-radius:10px;border:1.5px solid ${C.border};background:#fff;font-size:22px;font-weight:700;color:${C.dark};cursor:pointer}
        .po-qty input{width:84px;height:44px;text-align:center;font-size:18px;font-weight:800;border:1.5px solid ${C.border};border-radius:10px;font-family:inherit;color:${C.dark}}
        .po-qty input:focus{outline:2px solid ${C.light};border-color:${C.light}}
        .po-cta{position:sticky;bottom:0;background:rgba(247,246,241,.96);backdrop-filter:blur(6px);border-top:1px solid ${C.border};padding:12px 16px;margin:0 -16px}
        .po-btn{width:100%;padding:16px;border-radius:12px;border:none;background:${C.dark};color:#fff;font-size:17px;font-weight:800;cursor:pointer;font-family:inherit}
        .po-btn:disabled{opacity:.55;cursor:default}
        input.po-text,textarea.po-text{width:100%;box-sizing:border-box;padding:12px;border:1.5px solid ${C.border};border-radius:10px;font-size:16px;font-family:inherit}
        @media print{.po-cta,.po-qty button{display:none}.po-card{break-inside:avoid;box-shadow:none}body{background:#fff}}
      `}</style>
      <div style={{ background: C.dark, color: C.cream, padding: "12px 16px" }}>
        <div className="po-wrap" style={{ padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 54, width: "auto", objectFit: "contain", display: "block" }} />
          <span style={{ fontSize: 12, opacity: .85, textAlign: "right" }}>Pre-order sheet<br /><span style={{ fontFamily: SERIF, fontSize: 15, opacity: 1 }}>Hoosier Boy</span></span>
        </div>
      </div>
      <div className="po-wrap">
        {program.hero_url && (
          <img src={program.hero_url} alt={program.title} className="po-zoom" onClick={() => setPhoto({ url: program.hero_url, name: program.title })} style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 14, margin: "16px 0 4px", display: "block" }} />
        )}
        <h1 style={{ fontFamily: SERIF, fontSize: 34, color: C.dark, margin: "18px 0 4px", lineHeight: 1.1, textWrap: "balance" }}>{program.title}</h1>
        {program.subtitle && <div style={{ fontSize: 16, color: C.muted, marginBottom: 12 }}>{program.subtitle}</div>}

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", margin: "12px 0 18px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.dark }}>For {sheet.customer_name}</div>
          {sheet.message && <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>{sheet.message}</div>}
          <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>
            {sheet.rep_name ? `From ${sheet.rep_name} at Hoosier Boy` : "From Hoosier Boy"}
            {program.availability ? ` · ${program.availability}` : ""}
            {deadline ? ` · Pre-orders close ${deadline}` : ""}
          </div>
        </div>

        {(sent || already) && (
          <div style={{ background: "#eef6e8", border: `1px solid ${C.light}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 15 }}>
            {sent ? <><b>Got it, thank you.</b> We have your numbers as of {fmtWhen(sent)}. You can change them any time before the deadline, just send again.</>
                  : <><b>Your pre-order is in</b> as of {fmtWhen(sheet.submitted_at)}. Change the numbers below and send again to update it.</>}
          </div>
        )}
        {closed && (
          <div style={{ background: "#fff7ec", border: `1px solid ${C.amber}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 15 }}>
            Pre-orders for this program are closed. Call us if you still want in and we will see what is left.
          </div>
        )}

        {program.story && (
          <div style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "62ch", whiteSpace: "pre-line", marginBottom: 20 }}>{program.story}</div>
        )}

        {items.map(it => { const q = itemQty(it); const cs = colorsOf(it); return (
          <div className="po-card" key={it.id}>
            {it.image_url && <img className="po-photo" src={it.image_url} alt={it.name} onClick={() => setPhoto({ url: it.image_url, name: it.name })} />}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <div style={{ fontFamily: SERIF, fontSize: 22, color: C.dark }}>{it.name}</div>
                <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.dark }}>{money(it.wholesale_price)}</div>
                  {it.retail_price != null && <div style={{ fontSize: 12, color: C.muted }}>suggested retail {money(it.retail_price)}</div>}
                </div>
              </div>
              {(it.size_label || it.pack) && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{[it.size_label, it.pack].filter(Boolean).join(" · ")}</div>}
              {it.description && <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>{it.description}</div>}
              {cs.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>How many of each color?{it.min_qty ? ` (min ${it.min_qty} per color)` : ""}{it.qty_step > 1 ? ` · in ${it.qty_step}s` : ""}</div>
                  {cs.map(c => { const cq = Math.max(0, Math.round(+qty[ek(it.id, c.name)] || 0)); return (
                    <div className="po-color" key={c.name}>
                      {c.image_url ? <img src={c.image_url} alt={c.name} className="po-zoom" onClick={() => setPhoto({ url: c.image_url, name: `${it.name} · ${c.name}` })} /> : <div style={{ width: 64, height: 48, borderRadius: 8, background: C.chip }} />}
                      <div className="nm">{c.name}{cq > 0 && <div style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>{cq} × {money(it.wholesale_price)} = {money(cq * (+it.wholesale_price || 0))}</div>}</div>
                      <div className="po-qty">
                        <button type="button" disabled={closed} onClick={() => setQ(it, cq - (it.qty_step || 1), c.name)} aria-label="less">−</button>
                        <input inputMode="numeric" value={cq || ""} placeholder="0" disabled={closed}
                          onChange={e => setQty(s => ({ ...s, [ek(it.id, c.name)]: e.target.value.replace(/[^\d]/g, "") }))}
                          onBlur={e => setQ(it, e.target.value, c.name)} />
                        <button type="button" disabled={closed} onClick={() => setQ(it, (cq || 0) + (it.qty_step || 1), c.name)} aria-label="more">+</button>
                      </div>
                    </div>
                  ); })}
                  {q > 0 && <div style={{ textAlign: "right", fontSize: 13, color: C.muted, marginTop: 6 }}>{q} {it.name} = <b style={{ color: C.dark }}>{money(q * (+it.wholesale_price || 0))}</b></div>}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, color: C.muted }}>
                      How many?{it.min_qty ? ` (min ${it.min_qty})` : ""}{it.qty_step > 1 ? ` · in ${it.qty_step}s` : ""}
                    </div>
                    <div className="po-qty">
                      <button type="button" disabled={closed} onClick={() => setQ(it, q - (it.qty_step || 1))} aria-label="less">−</button>
                      <input inputMode="numeric" value={q || ""} placeholder="0" disabled={closed}
                        onChange={e => setQty(s => ({ ...s, [ek(it.id, "")]: e.target.value.replace(/[^\d]/g, "") }))}
                        onBlur={e => setQ(it, e.target.value)} />
                      <button type="button" disabled={closed} onClick={() => setQ(it, (q || 0) + (it.qty_step || 1))} aria-label="more">+</button>
                    </div>
                  </div>
                  {q > 0 && <div style={{ textAlign: "right", fontSize: 13, color: C.muted, marginTop: 6 }}>{q} × {money(it.wholesale_price)} = <b style={{ color: C.dark }}>{money(q * (+it.wholesale_price || 0))}</b></div>}
                </>
              )}
            </div>
          </div>
        ); })}

        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 16px", marginTop: 6 }}>
          <div style={{ fontFamily: SERIF, fontSize: 20, color: C.dark, marginBottom: 10 }}>Your pre-order</div>
          {lines.filter(l => l.q > 0).length === 0
            ? <div style={{ color: C.muted, fontSize: 14 }}>Nothing yet — put a number on anything above.</div>
            : lines.filter(l => l.q > 0).map(l => (
              <div key={ek(l.it.id, l.color)} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "5px 0", borderBottom: `1px dashed ${C.border}` }}>
                <span>{l.q} × {l.it.name}{l.color ? ` · ${l.color}` : ""}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(l.q * (+l.it.wholesale_price || 0))}</span>
              </div>
            ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: C.dark, marginTop: 10 }}>
            <span>{totalQty} total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(totalAmt)}</span>
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <input className="po-text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} disabled={closed} />
            <textarea className="po-text" rows={2} placeholder="Anything we should know? (colors, timing, delivery)" value={note} onChange={e => setNote(e.target.value)} disabled={closed} />
          </div>
          {err && <div style={{ color: C.red, fontSize: 14, marginTop: 8 }}>{err}</div>}
          {program.terms && <div style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>{program.terms}</div>}
        </div>

        <div style={{ textAlign: "center", padding: "26px 0 6px" }}>
          <img src={LOGO_COLOR} alt="Hoosier Boy" style={{ height: 58, width: "auto", maxWidth: "80%", objectFit: "contain" }} />
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>705 Sprague St, Indianapolis · your rep confirms every pre-order before it ships</div>
        </div>
        <div className="po-cta">
          <button className="po-btn" disabled={saving || closed} onClick={submit}>
            {saving ? "Sending…" : (sheet.submitted_at || sent) ? "Update my pre-order" : "Send my pre-order"}
          </button>
          <div style={{ textAlign: "center", fontSize: 12, color: C.muted, marginTop: 8 }}>
            A pre-order holds your spot, it is not an invoice. We confirm before anything ships.
          </div>
        </div>
      </div>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUR SIDE — programs, sheets (send), tracking. Works on the phone (Mario) and desktop.
// ─────────────────────────────────────────────────────────────────────────────
const btn = (extra = {}) => ({ padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", ...extra });
const primary = (extra = {}) => btn({ background: C.dark, color: "#fff", border: `1.5px solid ${C.dark}`, ...extra });
const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 15, fontFamily: "inherit" };
const label = { fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted, margin: "10px 0 4px" };

export default function PreOrders({ onBack, embedded }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [items, setItems] = useState([]);           // all program items
  const [sheets, setSheets] = useState([]);
  const [entries, setEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [progId, setProgId] = useState(null);       // selected program
  const [view, setView] = useState("sheets");        // sheets | send | program
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = async () => {
    const [{ data: p }, { data: it }, { data: s }, { data: e }, { data: c }] = await Promise.all([
      sb.from("preorder_programs").select("*").order("created_at", { ascending: false }),
      sb.from("preorder_program_items").select("*").order("sort").order("name"),
      sb.from("preorder_sheets").select("*").order("created_at", { ascending: false }).limit(2000),
      sb.from("preorder_entries").select("sheet_id,item_id,color,qty,updated_at").limit(5000),
      sb.from("shipping_customers").select("id,company_name,care_of,email,phone,city,state,customer_type").order("company_name").limit(2000),
    ]);
    setPrograms(p || []); setItems(it || []); setSheets(s || []); setEntries(e || []); setCustomers(c || []);
    if (!progId && p?.length) setProgId(p[0].id);
  };
  useEffect(() => { load(); }, [tick]); // eslint-disable-line
  useEffect(() => {   // live: someone opening/submitting shows up without a reload
    const wake = () => { if (!document.hidden) setTick(t => t + 1); };
    window.addEventListener("focus", wake); document.addEventListener("visibilitychange", wake);
    const iv = setInterval(() => { if (!document.hidden) setTick(t => t + 1); }, 60000);
    return () => { window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); clearInterval(iv); };
  }, []);
  const flash = m => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const program = programs.find(p => p.id === progId) || null;
  const progItems = useMemo(() => items.filter(i => i.program_id === progId), [items, progId]);
  const progSheets = useMemo(() => sheets.filter(s => s.program_id === progId), [sheets, progId]);
  // entries keyed sheet|item|color; an item's total sums its colors
  const qtyOf = useMemo(() => { const m = {}; entries.forEach(e => { m[`${e.sheet_id}|${e.item_id}|${e.color || ""}`] = e.qty; }); return m; }, [entries]);
  const cellsOf = (s, it) => { const cs = colorsOf(it); return (cs.length ? cs.map(c => c.name) : [""]).map(color => ({ color, q: qtyOf[`${s.id}|${it.id}|${color}`] || 0 })); };
  const itemQtyOn = (s, it) => cellsOf(s, it).reduce((a, c) => a + c.q, 0);
  const sheetTotal = s => progItems.reduce((a, it) => a + itemQtyOn(s, it), 0);
  const sheetAmt = s => progItems.reduce((a, it) => a + itemQtyOn(s, it) * (+it.wholesale_price || 0), 0);
  const itemTotal = it => progSheets.reduce((a, s) => a + itemQtyOn(s, it), 0);
  const colorTotal = (it, color) => progSheets.reduce((a, s) => a + (qtyOf[`${s.id}|${it.id}|${color}`] || 0), 0);
  const stats = {
    sent: progSheets.filter(s => s.sent_at).length,
    opened: progSheets.filter(s => s.first_opened_at).length,
    submitted: progSheets.filter(s => s.submitted_at).length,
    qty: progSheets.reduce((a, s) => a + sheetTotal(s), 0),
    amt: progSheets.reduce((a, s) => a + sheetAmt(s), 0),
  };

  // ── send: pick customers, make sheets ────────────────────────────────────
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState({});          // customer_id → true
  const [msg, setMsg] = useState("");
  const custHits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return customers.filter(c => !s || (c.company_name || "").toLowerCase().includes(s) || (c.city || "").toLowerCase().includes(s)).slice(0, 40);
  }, [customers, q]);
  const alreadySent = useMemo(() => new Set(progSheets.map(s => s.customer_id).filter(Boolean)), [progSheets]);
  const makeSheets = async () => {
    const ids = Object.keys(picked).filter(k => picked[k]);
    if (!program || !ids.length) return;
    setBusy(true);
    const rows = ids.map(cid => { const c = customers.find(x => x.id === cid) || {}; return {
      program_id: program.id, customer_id: cid, customer_name: c.company_name || "Customer", contact_name: c.care_of || null,
      contact_email: c.email || null, contact_phone: c.phone || null, rep_name: displayName || null, message: msg.trim() || null,
      created_by: displayName || null }; });
    const { error } = await sb.from("preorder_sheets").insert(rows);
    setBusy(false);
    if (error) { window.alert(error.message); return; }
    setPicked({}); setMsg(""); setTick(t => t + 1); setView("sheets"); flash(`${rows.length} sheet${rows.length > 1 ? "s" : ""} ready — share the links`);
  };
  const shareSheet = async (s, via) => {
    const url = preorderUrl(s.id);
    const title = `${program?.title || "Pre-order"} — Hoosier Boy`;
    const text = `${s.customer_name}: here is your Hoosier Boy pre-order sheet for ${program?.title || "our new item"}.`;
    try {
      if (via === "share" && navigator.share) await navigator.share({ title, text, url });
      else if (via === "text" && s.contact_phone) window.location.href = `sms:${s.contact_phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text + " " + url)}`;
      else if (via === "email" && s.contact_email) window.location.href = `mailto:${s.contact_email}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + "\n\n" + url)}`;
      else { await navigator.clipboard.writeText(url); flash("Link copied"); via = "copy"; }
      if (!s.sent_at) { await sb.from("preorder_sheets").update({ sent_at: new Date().toISOString(), sent_via: via }).eq("id", s.id); setTick(t => t + 1); }
    } catch { /* user cancelled the share sheet */ }
  };
  const removeSheet = async s => {
    if (!window.confirm(`Remove the sheet for ${s.customer_name}? Their link stops working.`)) return;
    await sb.from("preorder_sheets").delete().eq("id", s.id); setTick(t => t + 1);
  };

  // ── program editor ───────────────────────────────────────────────────────
  const [pe, setPe] = useState(null);   // program edit draft
  const [ie, setIe] = useState(null);   // item edit draft
  const fileRef = useRef(null);
  const [uploadFor, setUploadFor] = useState(null);   // { kind: 'hero'|'item', id }
  const saveProgram = async () => {
    if (!pe?.title?.trim()) return;
    setBusy(true);
    const row = { title: pe.title.trim(), subtitle: pe.subtitle || null, story: pe.story || null, hero_url: pe.hero_url || null,
      deadline: pe.deadline || null, availability: pe.availability || null, terms: pe.terms || null, status: pe.status || "draft", updated_at: new Date().toISOString() };
    if (pe.id) await sb.from("preorder_programs").update(row).eq("id", pe.id);
    else { const { data } = await sb.from("preorder_programs").insert({ ...row, created_by: displayName || null }).select("id").single(); if (data) setProgId(data.id); }
    setBusy(false); setPe(null); setTick(t => t + 1);
  };
  const saveItem = async () => {
    if (!ie?.name?.trim() || !program) return;
    setBusy(true);
    const row = { program_id: program.id, name: ie.name.trim(), description: ie.description || null, size_label: ie.size_label || null, pack: ie.pack || null,
      wholesale_price: ie.wholesale_price === "" || ie.wholesale_price == null ? null : +ie.wholesale_price,
      retail_price: ie.retail_price === "" || ie.retail_price == null ? null : +ie.retail_price,
      image_url: ie.image_url || null, min_qty: +ie.min_qty || 0, qty_step: Math.max(1, +ie.qty_step || 1), sort: +ie.sort || 0, active: ie.active !== false,
      colors: (ie.colors || []).filter(c => c && c.name && c.name.trim()).map(c => ({ name: c.name.trim(), image_url: c.image_url || null })) };
    if (ie.id) await sb.from("preorder_program_items").update(row).eq("id", ie.id);
    else await sb.from("preorder_program_items").insert(row);
    setBusy(false); setIe(null); setTick(t => t + 1);
  };
  const removeItem = async it => {
    if (!window.confirm(`Remove ${it.name} from this program?`)) return;
    await sb.from("preorder_program_items").delete().eq("id", it.id); setTick(t => t + 1);
  };
  const onFile = async e => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !uploadFor) return;
    setBusy(true);
    const path = `${program?.id || "program"}/${Date.now()}_${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await sb.storage.from("preorder-photos").upload(path, f, { upsert: true, contentType: f.type });
    if (error) { window.alert(error.message); setBusy(false); return; }
    const url = sb.storage.from("preorder-photos").getPublicUrl(path).data.publicUrl;
    if (uploadFor.kind === "hero") setPe(p => ({ ...p, hero_url: url }));
    else if (uploadFor.kind === "color") setIe(i => ({ ...i, colors: (i.colors || []).map((c, k) => k === uploadFor.idx ? { ...c, image_url: url } : c) }));
    else setIe(i => ({ ...i, image_url: url }));
    setBusy(false); setUploadFor(null);
  };
  const exportCsv = () => {
    const cols = progItems.flatMap(i => (colorsOf(i).length ? colorsOf(i).map(c => ({ i, color: c.name, label: `${i.name} · ${c.name}` })) : [{ i, color: "", label: i.name }]));
    const head = ["Customer", "Contact", "Email", "Phone", "Sent", "Opened", "Opens", "Submitted", "By", ...cols.map(c => c.label), "Total qty", "Total $", "Note"];
    const rows = progSheets.map(s => [s.customer_name, s.contact_name || "", s.contact_email || "", s.contact_phone || "", s.sent_at || "", s.first_opened_at || "", s.open_count || 0,
      s.submitted_at || "", s.submitted_name || "", ...cols.map(c => qtyOf[`${s.id}|${c.i.id}|${c.color}`] || 0), sheetTotal(s), sheetAmt(s).toFixed(2), s.submitted_note || ""]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${(program?.title || "preorders").replace(/\W+/g, "_")}_preorders.csv`; a.click();
  };

  const wrap = { fontFamily: FONT, color: C.text, padding: embedded ? 0 : "12px 14px", maxWidth: 900 };
  return (
    <div style={wrap}>
      {onBack && (
        <button onClick={onBack} style={{ background: C.dark, color: C.cream, border: "none", padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: "inherit", borderRadius: 10, marginBottom: 12 }}>← Back</button>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: SERIF, fontSize: 24, color: C.dark }}>🧾 Pre-orders</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["sheets", "send", "program"].map(v => (
            <button key={v} onClick={() => setView(v)} style={btn({ background: view === v ? C.dark : "#fff", color: view === v ? "#fff" : C.dark })}>
              {v === "sheets" ? "Customers" : v === "send" ? "＋ Send" : "Program"}
            </button>
          ))}
        </div>
      </div>
      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: C.dark, color: "#fff", padding: "10px 16px", borderRadius: 10, fontSize: 14, zIndex: 50 }}>{toast}</div>}

      {/* program picker */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
        <select value={progId || ""} onChange={e => setProgId(e.target.value)} style={{ ...field, width: "auto", minWidth: 220, flex: 1 }}>
          {programs.length === 0 && <option value="">No programs yet</option>}
          {programs.map(p => <option key={p.id} value={p.id}>{p.title}{p.status !== "open" ? ` (${p.status})` : ""}</option>)}
        </select>
        <button style={btn()} onClick={() => { setPe({ title: "", status: "draft" }); setView("program"); }}>＋ New program</button>
      </div>

      {view === "sheets" && program && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 12 }}>
            {[["Sent", stats.sent, `of ${progSheets.length}`], ["Opened", stats.opened, ""], ["Pre-ordered", stats.submitted, ""], ["Units", stats.qty.toLocaleString(), ""], ["Value", `$${Math.round(stats.amt).toLocaleString()}`, "wholesale"]].map(([l, v, sub]) => (
              <div key={l} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>{l}{sub ? ` · ${sub}` : ""}</div>
              </div>
            ))}
          </div>
          {progItems.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              <div style={label}>By item</div>
              {progItems.map(it => (
                <div key={it.id} style={{ padding: "4px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{it.name}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{itemTotal(it).toLocaleString()}</b>
                  </div>
                  {colorsOf(it).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                      {colorsOf(it).map(c => <span key={c.name} style={{ fontSize: 11.5, background: C.chip, borderRadius: 6, padding: "1px 7px", color: C.text }}>{c.name} <b>{colorTotal(it, c.name)}</b></span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={label}>Customers · newest first</div>
            {progSheets.length > 0 && <button style={btn({ padding: "6px 10px", fontSize: 12 })} onClick={exportCsv}>Export CSV</button>}
          </div>
          {progSheets.length === 0 && <div style={{ color: C.muted, fontSize: 14, padding: "20px 0" }}>No sheets yet. Tap <b>＋ Send</b>, pick the customers, and share their links.</div>}
          {progSheets.map(s => {
            const tot = sheetTotal(s);
            const state = s.submitted_at ? "ordered" : s.first_opened_at ? "opened" : s.sent_at ? "sent" : "ready";
            const color = { ordered: C.light, opened: C.amber, sent: C.muted, ready: C.border }[state];
            return (
              <div key={s.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `5px solid ${color}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.dark }}>{s.customer_name}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {state === "ready" ? "link not sent yet" : state === "sent" ? `sent ${fmtWhen(s.sent_at)} · not opened` : state === "opened" ? `opened ${fmtWhen(s.first_opened_at)} · ${s.open_count || 1}× · no numbers yet` : `pre-ordered ${fmtWhen(s.submitted_at)}${s.submitted_name ? ` by ${s.submitted_name}` : ""} · opened ${s.open_count || 1}×`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: tot ? C.dark : C.muted, fontVariantNumeric: "tabular-nums" }}>{tot || "—"}</div>
                    {tot > 0 && <div style={{ fontSize: 12, color: C.muted }}>${Math.round(sheetAmt(s)).toLocaleString()}</div>}
                  </div>
                </div>
                {tot > 0 && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                    {progItems.flatMap(it => cellsOf(s, it).filter(c => c.q).map(c => (
                      <span key={`${it.id}|${c.color}`} style={{ fontSize: 12, background: C.chip, borderRadius: 6, padding: "2px 8px" }}><b>{c.q}</b> {it.name}{c.color ? ` · ${c.color}` : ""}</span>
                    )))}
                  </div>
                )}
                {s.submitted_note && <div style={{ fontSize: 13, marginTop: 6, fontStyle: "italic" }}>“{s.submitted_note}”</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <button style={btn({ padding: "7px 10px", fontSize: 12 })} onClick={() => shareSheet(s, "copy")}>Copy link</button>
                  {navigator.share && <button style={btn({ padding: "7px 10px", fontSize: 12 })} onClick={() => shareSheet(s, "share")}>Share…</button>}
                  {s.contact_phone && <button style={btn({ padding: "7px 10px", fontSize: 12 })} onClick={() => shareSheet(s, "text")}>Text</button>}
                  {s.contact_email && <button style={btn({ padding: "7px 10px", fontSize: 12 })} onClick={() => shareSheet(s, "email")}>Email</button>}
                  <a href={preorderUrl(s.id)} target="_blank" rel="noreferrer" style={btn({ padding: "7px 10px", fontSize: 12, textDecoration: "none" })}>Open</a>
                  <button style={btn({ padding: "7px 10px", fontSize: 12, color: C.red, marginLeft: "auto" })} onClick={() => removeSheet(s)}>Remove</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {view === "send" && program && (
        <div>
          {program.status !== "open" && <div style={{ background: "#fff7ec", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>This program is <b>{program.status}</b>. Customers can open the page but cannot pre-order until it is set to open (Program tab).</div>}
          <div style={label}>Message on the page (optional)</div>
          <textarea style={field} rows={2} value={msg} onChange={e => setMsg(e.target.value)} placeholder="A line from you — shows under the customer's name" />
          <div style={label}>Pick customers</div>
          <input style={field} placeholder="Search by name or city…" value={q} onChange={e => setQ(e.target.value)} />
          <div style={{ maxHeight: 360, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 8, background: "#fff" }}>
            {custHits.map(c => (
              <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 14, opacity: alreadySent.has(c.id) ? .55 : 1 }}>
                <input type="checkbox" checked={!!picked[c.id]} onChange={e => setPicked(p => ({ ...p, [c.id]: e.target.checked }))} style={{ width: 20, height: 20 }} />
                <span style={{ flex: 1 }}>
                  <b>{c.company_name}</b>{c.city ? <span style={{ color: C.muted }}> · {c.city}</span> : null}
                  {alreadySent.has(c.id) && <span style={{ color: C.amber, fontSize: 11, marginLeft: 6 }}>already has a sheet</span>}
                  <div style={{ fontSize: 11, color: C.muted }}>{[c.care_of, c.email, c.phone].filter(Boolean).join(" · ") || "no contact on file"}</div>
                </span>
              </label>
            ))}
            {custHits.length === 0 && <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>No customers match.</div>}
          </div>
          <button style={primary({ width: "100%", marginTop: 12, padding: 14, fontSize: 15 })} disabled={busy || !Object.values(picked).some(Boolean)} onClick={makeSheets}>
            Make {Object.values(picked).filter(Boolean).length || ""} sheet{Object.values(picked).filter(Boolean).length === 1 ? "" : "s"}
          </button>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Each customer gets their own link. Share it by text, email, or copy from the Customers tab.</div>
        </div>
      )}

      {view === "program" && (
        <div>
          {!pe && program && (
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 20, color: C.dark }}>{program.title}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{program.status}{program.deadline ? ` · closes ${fmtDeadline(program.deadline)}` : ""}{program.availability ? ` · ${program.availability}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={btn()} onClick={() => setPe({ ...program })}>Edit</button>
                  {program.status !== "open"
                    ? <button style={primary()} onClick={async () => { await sb.from("preorder_programs").update({ status: "open" }).eq("id", program.id); setTick(t => t + 1); }}>Open for pre-orders</button>
                    : <button style={btn({ color: C.amber })} onClick={async () => { await sb.from("preorder_programs").update({ status: "closed" }).eq("id", program.id); setTick(t => t + 1); }}>Close</button>}
                </div>
              </div>
              {program.hero_url && <img src={program.hero_url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10, marginTop: 10 }} />}
              {program.story && <div style={{ fontSize: 14, whiteSpace: "pre-line", marginTop: 10, lineHeight: 1.5 }}>{program.story}</div>}
            </div>
          )}
          {pe && (
            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={label}>Title</div><input style={field} value={pe.title || ""} onChange={e => setPe({ ...pe, title: e.target.value })} placeholder="Antoinette Pansies — 2027" />
              <div style={label}>Subtitle</div><input style={field} value={pe.subtitle || ""} onChange={e => setPe({ ...pe, subtitle: e.target.value })} placeholder="Double, ruffled, and only from Hoosier Boy this spring" />
              <div style={label}>Story (customer-facing)</div><textarea style={field} rows={6} value={pe.story || ""} onChange={e => setPe({ ...pe, story: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={label}>Pre-orders close</div><input type="date" style={field} value={pe.deadline || ""} onChange={e => setPe({ ...pe, deadline: e.target.value })} /></div>
                <div><div style={label}>Availability</div><input style={field} value={pe.availability || ""} onChange={e => setPe({ ...pe, availability: e.target.value })} placeholder="Ready late February" /></div>
              </div>
              <div style={label}>Terms (footer)</div><input style={field} value={pe.terms || ""} onChange={e => setPe({ ...pe, terms: e.target.value })} placeholder="Wholesale pricing. Pre-orders confirmed by your rep before shipping." />
              <div style={label}>Hero photo</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {pe.hero_url && <img src={pe.hero_url} alt="" style={{ width: 90, height: 68, objectFit: "cover", borderRadius: 8 }} />}
                <button style={btn()} disabled={busy} onClick={() => { setUploadFor({ kind: "hero" }); fileRef.current?.click(); }}>{pe.hero_url ? "Replace" : "Upload"} photo</button>
                <input style={{ ...field, flex: 1 }} value={pe.hero_url || ""} onChange={e => setPe({ ...pe, hero_url: e.target.value })} placeholder="or paste an image URL" />
              </div>
              <div style={label}>Status</div>
              <select style={field} value={pe.status || "draft"} onChange={e => setPe({ ...pe, status: e.target.value })}>
                <option value="draft">draft — customers can look, not order</option><option value="open">open — taking pre-orders</option><option value="closed">closed</option>
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={primary()} disabled={busy} onClick={saveProgram}>Save program</button>
                <button style={btn()} onClick={() => setPe(null)}>Cancel</button>
              </div>
            </div>
          )}

          {program && !pe && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={label}>Items on the sheet</div>
                <button style={btn({ padding: "6px 10px", fontSize: 12 })} onClick={() => setIe({ name: "", qty_step: 1, min_qty: 0, sort: (progItems.length + 1) * 10, active: true })}>＋ Add item</button>
              </div>
              {progItems.map(it => (
                <div key={it.id} style={{ display: "flex", gap: 10, alignItems: "center", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 6, opacity: it.active === false ? .5 : 1 }}>
                  <div style={{ width: 56, height: 42, borderRadius: 6, background: C.chip, overflow: "hidden", flexShrink: 0 }}>{it.image_url && <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: C.dark }}>{it.name}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{[it.size_label, it.pack].filter(Boolean).join(" · ")} · {money(it.wholesale_price)}{it.retail_price != null ? ` / retail ${money(it.retail_price)}` : ""}{colorsOf(it).length ? ` · ${colorsOf(it).length} colors` : ""}</div>
                  </div>
                  <button style={btn({ padding: "6px 10px", fontSize: 12 })} onClick={() => setIe({ ...it })}>Edit</button>
                  <button style={btn({ padding: "6px 10px", fontSize: 12, color: C.red })} onClick={() => removeItem(it)}>✕</button>
                </div>
              ))}
              {progItems.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No items yet.</div>}
            </>
          )}
          {ie && (
            <div style={{ background: "#fff", border: `1px solid ${C.light}`, borderRadius: 12, padding: "12px 14px", marginTop: 10 }}>
              <div style={label}>Item name</div><input style={field} value={ie.name || ""} onChange={e => setIe({ ...ie, name: e.target.value })} placeholder='Antoinette Pansy · 6" pot' />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={label}>Size / package</div><input style={field} value={ie.size_label || ""} onChange={e => setIe({ ...ie, size_label: e.target.value })} placeholder='6" pot · 1 plant' /></div>
                <div><div style={label}>Sells by</div><input style={field} value={ie.pack || ""} onChange={e => setIe({ ...ie, pack: e.target.value })} placeholder="each · 8 per tray" /></div>
                <div><div style={label}>Wholesale $</div><input type="number" step="0.01" style={field} value={ie.wholesale_price ?? ""} onChange={e => setIe({ ...ie, wholesale_price: e.target.value })} /></div>
                <div><div style={label}>Suggested retail $</div><input type="number" step="0.01" style={field} value={ie.retail_price ?? ""} onChange={e => setIe({ ...ie, retail_price: e.target.value })} /></div>
                <div><div style={label}>Minimum</div><input type="number" style={field} value={ie.min_qty ?? 0} onChange={e => setIe({ ...ie, min_qty: e.target.value })} /></div>
                <div><div style={label}>Order in steps of</div><input type="number" style={field} value={ie.qty_step ?? 1} onChange={e => setIe({ ...ie, qty_step: e.target.value })} /></div>
              </div>
              <div style={label}>Description</div><textarea style={field} rows={3} value={ie.description || ""} onChange={e => setIe({ ...ie, description: e.target.value })} />
              <div style={label}>Photo</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ie.image_url && <img src={ie.image_url} alt="" style={{ width: 90, height: 68, objectFit: "cover", borderRadius: 8 }} />}
                <button style={btn()} disabled={busy} onClick={() => { setUploadFor({ kind: "item" }); fileRef.current?.click(); }}>{ie.image_url ? "Replace" : "Upload"} photo</button>
                <input style={{ ...field, flex: 1 }} value={ie.image_url || ""} onChange={e => setIe({ ...ie, image_url: e.target.value })} placeholder="or paste an image URL" />
              </div>
              <div style={label}>Colors (optional — customers order by color)</div>
              {(ie.colors || []).map((c, k) => (
                <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  {c.image_url ? <img src={c.image_url} alt="" style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6 }} /> : <div style={{ width: 48, height: 36, borderRadius: 6, background: C.chip }} />}
                  <input style={{ ...field, flex: 1 }} placeholder="Color name" value={c.name || ""} onChange={e => setIe({ ...ie, colors: ie.colors.map((x, j) => j === k ? { ...x, name: e.target.value } : x) })} />
                  <button style={btn({ padding: "8px 10px", fontSize: 12 })} disabled={busy} onClick={() => { setUploadFor({ kind: "color", idx: k }); fileRef.current?.click(); }}>{c.image_url ? "Replace" : "Photo"}</button>
                  <button style={btn({ padding: "8px 10px", fontSize: 12, color: C.red })} onClick={() => setIe({ ...ie, colors: ie.colors.filter((_, j) => j !== k) })}>✕</button>
                </div>
              ))}
              <button style={btn({ padding: "6px 10px", fontSize: 12 })} onClick={() => setIe({ ...ie, colors: [...(ie.colors || []), { name: "", image_url: null }] })}>＋ Add color</button>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 10 }}><input type="checkbox" checked={ie.active !== false} onChange={e => setIe({ ...ie, active: e.target.checked })} /> shown on the sheet</label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button style={primary()} disabled={busy} onClick={saveItem}>Save item</button>
                <button style={btn()} onClick={() => setIe(null)}>Cancel</button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        </div>
      )}
      {!program && programs.length === 0 && view !== "program" && (
        <div style={{ color: C.muted, fontSize: 14, padding: "20px 0" }}>Start with <b>＋ New program</b>: a title, the story, the items with prices, then send sheets.</div>
      )}
    </div>
  );
}
