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
export const LOGO_MARK = "/hoosier-boy-mark-color.jpg";   // square mascot, no words
export const preorderUrl = id => `${window.location.origin}/p/${id}`;   // /p/<id> = link-preview wrapper → /?po=<id>
// general link for a whole program — anyone who opens it types their business name and
// gets their own sheet on submit (Caleb 9/10: "copy the link and text it")
export const programUrl = id => `${window.location.origin}/pp/${id}`;   // /pp/<id> = link-preview wrapper → /?pop=<id>
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
export function PreOrderSheetViewer({ id, programId }) {
  const sb = getSupabase();
  const [openSheetId, setOpenSheetId] = useState(null);   // sheet created from a general link on first submit
  const [business, setBusiness] = useState("");
  const [sheet, setSheet] = useState(undefined);   // undefined=loading, null=not found
  const [program, setProgram] = useState(null);
  const [items, setItems] = useState([]);
  const [qty, setQty] = useState({});                // ek(item,color) → qty
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);            // ISO of last submit in this session
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(null);         // lightbox {url,name}

  useEffect(() => {
    (async () => {
      let s = null;
      if (id) {
        const { data } = await sb.from("preorder_sheets").select("*").eq("id", id).maybeSingle(); s = data;
        if (!s || s.active === false) { setSheet(null); return; }
      } else if (programId) {
        // general link: a stand-in sheet until they submit (then a real one is created)
        let remembered = null; try { remembered = localStorage.getItem(`hb_po_open_${programId}`); } catch { /* private mode */ }
        if (remembered) { const { data } = await sb.from("preorder_sheets").select("*").eq("id", remembered).maybeSingle(); if (data && data.active !== false) { s = data; setOpenSheetId(data.id); } }
        if (!s) s = { id: null, program_id: programId, customer_name: "", rep_name: null, message: null, open: true };
      } else { setSheet(null); return; }
      const [{ data: p }, { data: its }, { data: ents }] = await Promise.all([
        sb.from("preorder_programs").select("*").eq("id", s.program_id).maybeSingle(),
        sb.from("preorder_program_items").select("*").eq("program_id", s.program_id).eq("active", true).order("sort").order("name"),
        s.id ? sb.from("preorder_entries").select("item_id,color,qty").eq("sheet_id", s.id) : Promise.resolve({ data: [] }),
      ]);
      setSheet(s); setProgram(p || null); setItems(its || []); if (s.customer_name) setBusiness(s.customer_name);
      const q = {}; (ents || []).forEach(e => { q[ek(e.item_id, e.color)] = e.qty; }); setQty(q);
      setName(s.submitted_name || s.contact_name || "");
      setNote(s.submitted_note || "");
      if (p?.title) document.title = `${p.title} · Hoosier Boy`;
      try {   // one visit per device per 30 minutes; first/last open + count live on the sheet
        if (!s.id) return;
        const k = `hb_po_seen_${s.id}`; const last = +(localStorage.getItem(k) || 0);
        if (Date.now() - last > 30 * 60 * 1000) {
          localStorage.setItem(k, String(Date.now()));
          await sb.from("preorder_visits").insert({ sheet_id: s.id, visitor: visitorId(), user_agent: navigator.userAgent.slice(0, 200) });
          const now = new Date().toISOString();
          await sb.from("preorder_sheets").update({ first_opened_at: s.first_opened_at || now, last_opened_at: now, open_count: (s.open_count || 0) + 1 }).eq("id", s.id);
        }
      } catch { /* tracking is best-effort */ }
    })();
  }, [id, programId]); // eslint-disable-line

  const closed = program && (program.status === "closed" || (program.deadline && new Date(program.deadline + "T23:59:59") < new Date()));
  // one line per item × color (a plain item is a single line with color "")
  const lines = items.flatMap(it => {
    const cs = colorsOf(it);
    return (cs.length ? cs : [{ name: "", image_url: it.image_url }]).map(c => ({ it, color: c.name, img: c.image_url || it.image_url, q: Math.max(0, Math.round(+qty[ek(it.id, c.name)] || 0)) }));
  });
  const totalQty = lines.reduce((a, l) => a + l.q, 0);
  const totalAmt = lines.reduce((a, l) => a + l.q * (+l.it.wholesale_price || 0), 0);
  const stepOf = it => Math.max(1, +it.qty_step || 1);
  const setQ = (it, v, color = "") => {
    const step = stepOf(it);
    let n = Math.max(0, Math.round(+v || 0));
    if (n > 0 && it.min_qty && n < it.min_qty) n = it.min_qty;
    if (step > 1 && n % step) n = Math.ceil(n / step) * step;
    setQty(q => ({ ...q, [ek(it.id, color)]: n }));
  };
  const bump = (it, color, dir) => {
    const cur = Math.max(0, Math.round(+qty[ek(it.id, color)] || 0));
    const step = stepOf(it);
    let n = cur + dir * step;
    if (dir < 0 && it.min_qty && n < it.min_qty) n = 0;          // below the minimum means none
    if (dir > 0 && cur === 0 && it.min_qty) n = Math.max(n, it.min_qty);
    setQ(it, n, color);
  };
  const submit = async () => {
    if (closed) return;
    if (totalQty === 0) { setErr("Add a quantity to at least one color."); return; }
    if (!name.trim()) { setErr("Add your name so we know who to call back."); return; }
    if (!sheet.id && !business.trim()) { setErr("Add your business name."); return; }
    setSaving(true); setErr(null);
    try {
      let sid = sheet.id;
      if (!sid) {   // general link: make this customer's sheet now
        const { data, error: e0 } = await sb.from("preorder_sheets").insert({ program_id: sheet.program_id, customer_name: business.trim(), contact_name: name.trim(), sent_via: "open-link", sent_at: new Date().toISOString(), first_opened_at: new Date().toISOString(), last_opened_at: new Date().toISOString(), open_count: 1, created_by: "open link" }).select("*").single();
        if (e0) throw e0;
        sid = data.id; setOpenSheetId(sid); setSheet(data);
        try { localStorage.setItem(`hb_po_open_${sheet.program_id}`, sid); } catch { /* private mode */ }
      }
      const rows = lines.map(l => ({ sheet_id: sid, item_id: l.it.id, color: l.color || "", qty: l.q, updated_at: new Date().toISOString() }));
      const { error } = await sb.from("preorder_entries").upsert(rows, { onConflict: "sheet_id,item_id,color" });
      if (error) throw error;
      const now = new Date().toISOString();
      const { error: e2 } = await sb.from("preorder_sheets").update({ submitted_at: now, submitted_name: name.trim(), submitted_note: note.trim() || null, customer_name: sheet.id ? undefined : business.trim(), updated_at: now }).eq("id", sid);
      if (e2) throw e2;
      setSent(now);
      document.getElementById("po-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const deadline = program.deadline ? new Date(program.deadline + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  const lead = items[0];   // the offer line reads off the first item (single-item programs are the norm)
  const savedAt = sent || sheet.submitted_at;
  const single = items.length === 1;
  const picked = lines.filter(l => l.q > 0);
  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.text, WebkitTextSizeAdjust: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box}
        .po-wrap{max-width:640px;margin:0 auto;padding:0 18px 40px}
        .po-bar{background:${C.dark};padding:12px 18px}
        .po-bar>div{max-width:640px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
        .po-hero{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:16px;display:block;margin:18px 0 0;cursor:zoom-in;background:${C.chip}}
        .po-h1{font-family:${SERIF};font-size:36px;line-height:1.05;color:${C.dark};margin:18px 0 4px;text-wrap:balance}
        .po-sub{font-size:18px;color:${C.text};margin:0 0 14px}
        .po-offer{font-size:17px;color:${C.dark};line-height:1.55}
        .po-offer b{font-size:22px;font-weight:800}
        .po-offer small{display:block;font-size:14.5px;color:${C.muted};margin-top:2px}
        .po-for{font-size:13.5px;color:${C.muted};margin-top:12px}
        .po-for b{color:${C.dark};font-weight:700}
        .po-note{font-size:15px;line-height:1.5;margin-top:8px;padding:10px 12px;background:#fff;border-left:3px solid ${C.light};border-radius:6px}
        .po-saved{font-size:13.5px;color:${C.muted};margin-top:10px;padding:8px 12px;background:${C.chip};border-radius:8px}
        .po-jump{display:inline-block;margin-top:16px;font-weight:800;color:${C.dark};text-decoration:none;font-size:15px}
        .po-story{font-size:16.5px;line-height:1.6;max-width:60ch;white-space:pre-line;margin:26px 0 8px}
        .po-story b{font-family:${SERIF};font-weight:400;font-size:22px;color:${C.dark}}
        .po-sec{font-family:${SERIF};font-size:26px;color:${C.dark};margin:30px 0 2px}
        .po-secsub{font-size:14px;color:${C.muted};margin:0 0 14px}
        .po-grid{display:grid;grid-template-columns:1fr;gap:16px}
        @media (min-width:560px){.po-grid{grid-template-columns:1fr 1fr}}
        .po-c{background:#fff;border:1px solid ${C.border};border-radius:16px;overflow:hidden}
        .po-c img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:zoom-in;background:${C.chip}}
        .po-c .b{padding:12px 14px 14px}
        .po-c .n{font-family:${SERIF};font-size:21px;color:${C.dark};margin-bottom:10px}
        .po-q{display:flex;align-items:center;justify-content:space-between;gap:8px}
        .po-q button{width:56px;height:52px;border-radius:12px;border:1.5px solid ${C.border};background:#fff;font-size:26px;font-weight:700;color:${C.dark};cursor:pointer;line-height:1}
        .po-q button:active{background:${C.chip}}
        .po-q button:disabled{opacity:.4}
        .po-q input{flex:1;min-width:0;height:52px;text-align:center;font-size:26px;font-weight:800;border:1.5px solid ${C.border};border-radius:12px;font-family:inherit;color:${C.dark};background:#fff}
        .po-q input:focus{outline:2px solid ${C.light};border-color:${C.light}}
        .po-q input::placeholder{color:#b9c2b3;font-weight:600}
        .po-line{font-size:13px;color:${C.muted};margin-top:6px;text-align:right;min-height:16px}
        details.po-det{margin-top:26px;border-top:1px solid ${C.border};border-bottom:1px solid ${C.border};padding:4px 0}
        details.po-det summary{cursor:pointer;font-family:${SERIF};font-size:20px;color:${C.dark};padding:12px 0;list-style:none;display:flex;justify-content:space-between;align-items:center}
        details.po-det summary::-webkit-details-marker{display:none}
        details.po-det summary::after{content:"+";font-size:24px;color:${C.muted}}
        details.po-det[open] summary::after{content:"–"}
        .po-det .r{display:flex;gap:12px;padding:7px 0 9px;font-size:15px;line-height:1.45}
        .po-det .r span:first-child{flex:0 0 92px;color:${C.muted}}
        .po-sum{background:#fff;border:1px solid ${C.border};border-radius:16px;padding:16px 16px 18px;margin-top:26px}
        .po-sum h3{font-family:${SERIF};font-size:24px;color:${C.dark};margin:0 0 6px;font-weight:400}
        .po-sum .big{font-size:30px;font-weight:800;color:${C.dark};line-height:1.1}
        .po-sum .big small{font-size:16px;font-weight:500;color:${C.muted};margin-left:8px}
        .po-sum .it{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid ${C.border};font-size:16px}
        .po-sum .it img{width:44px;height:34px;object-fit:cover;border-radius:6px}
        .po-sum .it b{margin-left:auto;font-variant-numeric:tabular-nums}
        .po-in{width:100%;padding:13px 14px;border:1.5px solid ${C.border};border-radius:12px;font-size:16px;font-family:inherit;background:#fff}
        .po-cta{width:100%;margin-top:14px;padding:18px;border-radius:14px;border:none;background:${C.dark};color:#fff;font-size:17px;font-weight:800;letter-spacing:.04em;cursor:pointer;font-family:inherit}
        .po-cta:disabled{opacity:.5}
        .po-foot{text-align:center;padding:36px 0 10px;color:${C.muted};font-size:13.5px;line-height:1.6}
        .po-foot img{height:64px;width:auto;display:block;margin:0 auto 8px}
        @media print{.po-cta,.po-q button{display:none}.po-c{break-inside:avoid}body{background:#fff}}
      `}</style>

      <div className="po-bar"><div>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 50, width: "auto", display: "block" }} />
        <span style={{ color: C.cream, fontSize: 12.5, letterSpacing: ".08em", textTransform: "uppercase" }}>Pre-order</span>
      </div></div>

      <div className="po-wrap">
        {program.hero_url && <img className="po-hero" src={program.hero_url} alt={program.title} onClick={() => setPhoto({ url: program.hero_url, name: program.title })} />}
        <h1 className="po-h1">{program.title}</h1>
        {program.subtitle && <p className="po-sub">{program.subtitle}</p>}
        {lead && (
          <div className="po-offer">
            <b>{money(lead.wholesale_price)}</b> wholesale{lead.retail_price != null ? <> · {money(lead.retail_price)} suggested retail</> : null}
            {lead.size_label && <small>{lead.size_label}</small>}
            {(program.availability || deadline) && <small>{[program.availability, deadline ? `Pre-order by ${deadline}` : null].filter(Boolean).join(" · ")}</small>}
          </div>
        )}
        {sheet.customer_name && <div className="po-for">Prepared for <b>{sheet.customer_name}</b>{sheet.rep_name ? <> · Rep: <b>{sheet.rep_name}</b></> : null}</div>}
        {sheet.message && <div className="po-note">{sheet.message}</div>}
        {savedAt && <div className="po-saved">Pre-order saved {fmtWhen(savedAt)}. Change quantities and submit again to update.</div>}
        {closed && <div className="po-saved" style={{ background: "#fff7ec", color: C.text }}>Pre-orders for this program are closed. Call your rep if you still want in.</div>}
        {!closed && <a className="po-jump" href="#po-colors">Choose your colors ↓</a>}

        {program.story && (() => { const [first, ...rest] = program.story.split("\n"); return (
          <div className="po-story"><b>{first}</b>{"\n"}{rest.join("\n").replace(/^\n+/, "")}</div>
        ); })()}

        <div id="po-colors" />
        {items.map(it => { const cs = colorsOf(it); const min = it.min_qty ? `Minimum ${it.min_qty} per ${cs.length ? "color" : "item"}` : null; return (
          <div key={it.id}>
            <div className="po-sec">{cs.length ? (single ? "Choose your colors" : it.name) : it.name}</div>
            <div className="po-secsub">{[!single && cs.length ? `${money(it.wholesale_price)} wholesale · ${it.size_label || ""}` : null, min].filter(Boolean).join(" · ")}</div>
            <div className="po-grid">
              {(cs.length ? cs : [{ name: "", image_url: it.image_url }]).map(c => { const q = Math.max(0, Math.round(+qty[ek(it.id, c.name)] || 0)); const label = c.name || it.name; return (
                <div className="po-c" key={c.name || "item"}>
                  {(c.image_url || it.image_url) && <img src={c.image_url || it.image_url} alt={label} onClick={() => setPhoto({ url: c.image_url || it.image_url, name: single && c.name ? c.name : `${it.name}${c.name ? " · " + c.name : ""}` })} />}
                  <div className="b">
                    <div className="n">{label}</div>
                    <div className="po-q">
                      <button type="button" disabled={closed || q === 0} onClick={() => bump(it, c.name, -1)} aria-label={`fewer ${label}`}>−</button>
                      <input inputMode="numeric" value={q || ""} placeholder="0" disabled={closed} aria-label={`${label} quantity`}
                        onChange={e => setQty(s => ({ ...s, [ek(it.id, c.name)]: e.target.value.replace(/[^\d]/g, "") }))}
                        onBlur={e => setQ(it, e.target.value, c.name)} />
                      <button type="button" disabled={closed} onClick={() => bump(it, c.name, 1)} aria-label={`more ${label}`}>+</button>
                    </div>
                    <div className="po-line">{q > 0 ? `${q} × ${money(it.wholesale_price)} = ${money(q * (+it.wholesale_price || 0))}` : ""}</div>
                  </div>
                </div>
              ); })}
            </div>
          </div>
        ); })}

        {Array.isArray(program.details) && program.details.length > 0 && (
          <details className="po-det">
            <summary>Order details</summary>
            {program.details.map((d, i) => <div className="r" key={i}><span>{d.label}</span><span>{d.value}</span></div>)}
          </details>
        )}

        <div className="po-sum" id="po-summary">
          <h3>Your pre-order</h3>
          {picked.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 15 }}>Nothing selected yet.</div>
          ) : (
            <>
              <div className="big">{totalQty} plants<small>{money(totalAmt)} wholesale</small></div>
              <div style={{ marginTop: 10 }}>
                {picked.map(l => (
                  <div className="it" key={ek(l.it.id, l.color)}>
                    {l.img && <img src={l.img} alt="" />}
                    <span>{single && l.color ? l.color : `${l.it.name}${l.color ? " — " + l.color : ""}`}</span>
                    <b>{l.q}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {!sheet.id && <input className="po-in" placeholder="Your business" value={business} onChange={e => setBusiness(e.target.value)} disabled={closed} autoComplete="organization" />}
            <input className="po-in" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} disabled={closed} autoComplete="name" />
            <textarea className="po-in" rows={2} placeholder="Notes for your rep (optional)" value={note} onChange={e => setNote(e.target.value)} disabled={closed} />
          </div>
          {err && <div style={{ color: C.red, fontSize: 14.5, marginTop: 10 }}>{err}</div>}
          <button className="po-cta" disabled={saving || closed} onClick={submit}>{saving ? "SENDING…" : savedAt ? "UPDATE PRE-ORDER" : "SUBMIT PRE-ORDER"}</button>
          <div style={{ textAlign: "center", fontSize: 13.5, color: C.muted, marginTop: 10 }}>Your Hoosier Boy rep will confirm your pre-order.</div>
        </div>

        <div className="po-foot">
          <img src={LOGO_MARK} alt="" />
          <div style={{ fontFamily: SERIF, fontSize: 18, color: C.dark }}>Hoosier Boy</div>
          <div>Indianapolis, Indiana</div>
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
  const [quick, setQuick] = useState({ name: "", phone: "" });
  const quickSheet = async (via) => {
    if (!program || !quick.name.trim()) return;
    setBusy(true);
    const match = customers.find(c => (c.company_name || "").trim().toLowerCase() === quick.name.trim().toLowerCase());
    const { data, error } = await sb.from("preorder_sheets").insert({ program_id: program.id, customer_id: match?.id || null, customer_name: quick.name.trim(),
      contact_name: match?.care_of || null, contact_email: match?.email || null, contact_phone: quick.phone.trim() || match?.phone || null,
      rep_name: displayName || null, message: msg.trim() || null, created_by: displayName || null }).select("*").single();
    setBusy(false);
    if (error) { window.alert(error.message); return; }
    setQuick({ name: "", phone: "" }); setTick(t => t + 1); setView("sheets");
    await shareSheet(data, via);
  };
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
    const details = (pe._detailsText != null ? pe._detailsText.split("\n") : (pe.details || []).map(d => `${d.label}: ${d.value}`))
      .map(l => l.trim()).filter(Boolean).map(l => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : { label: "", value: l }; });
    const row = { title: pe.title.trim(), subtitle: pe.subtitle || null, story: pe.story || null, hero_url: pe.hero_url || null, proposition: pe.proposition || null, details,
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
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
            <div style={label}>New pre-order sheet — type the customer, then copy, text, or share the link</div>
            <input style={field} placeholder="Customer name (as you want it tracked)" value={quick.name} onChange={e => setQuick({ ...quick, name: e.target.value })} />
            <input style={{ ...field, marginTop: 8 }} placeholder="Cell number for texting (optional)" inputMode="tel" value={quick.phone} onChange={e => setQuick({ ...quick, phone: e.target.value })} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button style={primary({ flex: 1 })} disabled={busy || !quick.name.trim()} onClick={() => quickSheet("copy")}>Make sheet + copy link</button>
              <button style={btn({ flex: 1 })} disabled={busy || !quick.name.trim()} onClick={() => quickSheet(quick.phone.trim() ? "text" : "share")}>{quick.phone.trim() ? "Make sheet + text it" : "Make sheet + share…"}</button>
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>If the name matches a customer on file, their contact info is attached automatically.</div>
          </div>
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
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.dark }}>General link</div>
              <div style={{ fontSize: 12, color: C.muted }}>Text it to anyone. They type their business name and get their own sheet when they submit.</div>
            </div>
            <button style={btn({ padding: "8px 12px", fontSize: 12 })} onClick={async () => { await navigator.clipboard.writeText(programUrl(program.id)); flash("General link copied"); }}>Copy link</button>
            {navigator.share && <button style={btn({ padding: "8px 12px", fontSize: 12 })} onClick={async () => { try { await navigator.share({ title: `${program.title} — Hoosier Boy`, text: `Here is the Hoosier Boy pre-order page for ${program.title}.`, url: programUrl(program.id) }); } catch { /* cancelled */ } }}>Share…</button>}
            <a href={`sms:?&body=${encodeURIComponent(`Here is the Hoosier Boy pre-order page for ${program.title}: ${programUrl(program.id)}`)}`} style={btn({ padding: "8px 12px", fontSize: 12, textDecoration: "none" })}>Text</a>
          </div>
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
              <div style={label}>Proposition (one or two lines under the title)</div><textarea style={field} rows={2} value={pe.proposition || ""} onChange={e => setPe({ ...pe, proposition: e.target.value })} placeholder="Three finished packages from $6.50 wholesale, about 50% margin at suggested retail, individually tagged." />
              <div style={label}>Story (customer-facing)</div><textarea style={field} rows={6} value={pe.story || ""} onChange={e => setPe({ ...pe, story: e.target.value })} />
              <div style={label}>Pre-order details (one per line, "Label: value")</div>
              <textarea style={field} rows={6} value={pe._detailsText ?? (Array.isArray(pe.details) ? pe.details.map(d => `${d.label}: ${d.value}`).join("\n") : "")}
                onChange={e => setPe({ ...pe, _detailsText: e.target.value })} placeholder={"Ready: Late February 2027\nMinimum: 8 per color\nDelivery: On your regular route"} />
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
