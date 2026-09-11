// 🗳 Plan review sheets — the propose → feedback → decide loop (Caleb 9/11/2026).
// Caleb proposes a program (items with photos + proposed quantities); the reviewer (Mario,
// sales) opens a public link (/?rv=<sheet id>, no login), marks each item More / Right /
// Less / Don't — or "Add" for items not yet in the plan — leaves notes, gives an overall
// read and submits. Caleb reads the answers here (🗳 Reviews) and pulls the trigger.
// Tables: review_sheets, review_items, review_responses (migration 20260911190000).
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { LOGO_WHITE } from "./PreOrder";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const SERIF = "'DM Serif Display',Georgia,serif";
const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", paper: "#f6f7f3", chip: "#eef2e6", border: "#d9dfd3", text: "#2b3a27" };
export const reviewUrl = id => `${window.location.origin}/r/${id}`;   // /r/<id> = link-preview wrapper → /?rv=<id>

const VERDICTS = [
  ["more", "More", "#2f6ea5"], ["right", "Just right", "#4f8a3a"], ["less", "Less", "#e89a3a"], ["drop", "Don't grow", "#d94f3d"],
];
const OVERALL = [["too_many", "Too many overall"], ["about_right", "About right"], ["room_for_more", "Room for more"]];
const fmtWhen = iso => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const n = v => (v == null ? "" : (+v).toLocaleString());
// Colour swatch fallback when an item has no photo — reads the colour out of the name.
const SWATCH = [["white", "#f4f2ea"], ["yellow", "#f2c94c"], ["golden", "#e6a92b"], ["orange", "#ef7f2c"], ["red", "#c9332b"], ["scarlet", "#d63a2f"], ["hot pink", "#e0409a"], ["pink", "#ef9ab8"], ["salmon", "#f2a07b"], ["peach", "#f5b98e"], ["coral", "#f07a6a"], ["lilac", "#b79bd6"], ["purple", "#6a3d9a"], ["lavender", "#b8a4d9"], ["mix", "linear-gradient(135deg,#f2c94c,#ef7f2c,#c9332b,#ef9ab8,#b79bd6)"]];
const swatchFor = (name, given) => given || (SWATCH.find(([k]) => name.toLowerCase().includes(k)) || [null, "#c8d5bf"])[1];

function Lightbox({ photo, onClose }) {
  useEffect(() => { if (!photo) return; const k = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [photo, onClose]);
  if (!photo) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,16,8,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
      <img src={photo.url} alt={photo.name || ""} onClick={e => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "calc(100vh - 100px)", objectFit: "contain", borderRadius: 8 }} />
      <div style={{ color: "#fff", fontFamily: SERIF, fontSize: 18, marginTop: 12 }}>{photo.name}</div>
    </div>
  );
}

function Photo({ item, big, onOpen }) {
  const bg = swatchFor(item.name, item.swatch);
  if (item.image_url) return <img src={item.image_url} alt={item.name} onClick={() => onOpen({ url: item.image_url, name: item.name })} style={{ width: "100%", aspectRatio: big ? "4/3" : "1", objectFit: "cover", display: "block", cursor: "zoom-in", background: C.chip }} />;
  return <div title="no photo yet" style={{ width: "100%", aspectRatio: big ? "4/3" : "1", background: bg, display: "flex", alignItems: "flex-end", padding: 8 }}><span style={{ fontSize: 10.5, color: "rgba(0,0,0,.45)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase" }}>no photo yet</span></div>;
}

function Card({ it, r, set, closed, onOpen }) {
    const isProposed = (it.proposed_qty || 0) > 0;
    const m = it.meta || {};
    return (
      <div className="rv-c">
        <Photo item={it} big onOpen={onOpen} />
        <div className="b">
          <div className="n">{it.name}</div>
          {it.description && <div className="d">{it.description}</div>}
          <div className="q">
            {isProposed ? <><b>{n(it.proposed_qty)}</b> {it.unit || "pots"} proposed{it.size_label ? ` · ${it.size_label}` : ""}</> : <span>Not in the plan{it.size_label ? ` · ${it.size_label}` : ""}</span>}
            {m.sold_2026 != null && <span className="h"> · sold {n(m.sold_2026)} in 2026</span>}
          </div>
          {isProposed ? (
            <div className="v">
              {VERDICTS.map(([k, label, col]) => (
                <button key={k} onClick={() => set(it.id, { verdict: r.verdict === k ? null : k })} disabled={closed}
                  style={{ borderColor: r.verdict === k ? col : C.border, background: r.verdict === k ? col : "#fff", color: r.verdict === k ? "#fff" : C.text }}>{label}</button>
              ))}
            </div>
          ) : (
            <div className="v one">
              <button onClick={() => set(it.id, { verdict: r.verdict === "add" ? null : "add" })} disabled={closed}
                style={{ borderColor: r.verdict === "add" ? "#2f6ea5" : C.border, background: r.verdict === "add" ? "#2f6ea5" : "#fff", color: r.verdict === "add" ? "#fff" : C.text }}>{r.verdict === "add" ? "✓ Add this one" : "+ Add this one"}</button>
            </div>
          )}
          {(r.verdict === "more" || r.verdict === "less" || r.verdict === "add") && (
            <label className="sq">How many {it.unit || "pots"}? <input inputMode="numeric" value={r.suggested_qty ?? ""} onChange={e => set(it.id, { suggested_qty: e.target.value.replace(/[^\d]/g, "") })} placeholder={isProposed ? String(it.proposed_qty) : "e.g. 128"} /></label>
          )}
          <input className="cm" value={r.comment || ""} onChange={e => set(it.id, { comment: e.target.value })} placeholder="Note (optional)" disabled={closed} />
        </div>
      </div>
    );
}


// ── PUBLIC VIEWER ─────────────────────────────────────────────────────────────
export function ReviewSheetViewer({ id }) {
  const sb = getSupabase();
  const [sheet, setSheet] = useState(undefined);
  const [items, setItems] = useState([]);
  const [resp, setResp] = useState({});          // item_id → {verdict, suggested_qty, comment}
  const [overall, setOverall] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    (async () => {
      if (!sb || !id) { setSheet(null); return; }
      const { data: s } = await sb.from("review_sheets").select("*").eq("id", id).maybeSingle();
      if (!s) { setSheet(null); return; }
      const [{ data: it }, { data: rs }] = await Promise.all([
        sb.from("review_items").select("*").eq("sheet_id", id).eq("active", true).order("sort").order("name"),
        sb.from("review_responses").select("item_id,verdict,suggested_qty,comment").eq("sheet_id", id),
      ]);
      setSheet(s); setItems(it || []);
      const m = {}; (rs || []).forEach(r => { m[r.item_id] = { verdict: r.verdict, suggested_qty: r.suggested_qty, comment: r.comment || "" }; });
      setResp(m); setOverall(s.overall_verdict || ""); setNote(s.overall_note || ""); setName(s.submitted_name || s.reviewer_name || "");
      try {
        const now = new Date().toISOString();
        await sb.from("review_sheets").update({ first_opened_at: s.first_opened_at || now, last_opened_at: now, open_count: (s.open_count || 0) + 1 }).eq("id", id);
      } catch { /* counting opens is best-effort */ }
    })();
  }, [sb, id]);

  const set = (itemId, patch) => setResp(r => ({ ...r, [itemId]: { verdict: null, suggested_qty: null, comment: "", ...(r[itemId] || {}), ...patch } }));
  const proposed = useMemo(() => items.filter(i => (i.proposed_qty || 0) > 0), [items]);
  const available = useMemo(() => items.filter(i => !(i.proposed_qty > 0)), [items]);
  const answered = Object.values(resp).filter(r => r.verdict).length;

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      const now = new Date().toISOString();
      const rows = Object.entries(resp).filter(([, r]) => r.verdict || r.comment).map(([item_id, r]) => ({ sheet_id: id, item_id, verdict: r.verdict || "skip", suggested_qty: r.suggested_qty ? Math.round(+r.suggested_qty) : null, comment: r.comment?.trim() || null, updated_at: now }));
      if (rows.length) { const { error } = await sb.from("review_responses").upsert(rows, { onConflict: "sheet_id,item_id" }); if (error) throw error; }
      const { error: e2 } = await sb.from("review_sheets").update({ submitted_at: now, submitted_name: name.trim() || null, overall_verdict: overall || null, overall_note: note.trim() || null, updated_at: now }).eq("id", id);
      if (e2) throw e2;
      setSent(now);
    } catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
  };

  if (sheet === undefined) return <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: C.muted }}>Loading…</div>;
  if (sheet === null) return <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: C.muted }}>This review link is not active.</div>;
  const ctx = sheet.context || {};
  const closed = sheet.status === "closed";
  const savedAt = sent || sheet.submitted_at;

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.text, WebkitTextSizeAdjust: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box}
        .rv-wrap{max-width:680px;margin:0 auto;padding:0 16px 48px}
        .rv-bar{background:${C.dark};padding:12px 18px}
        .rv-bar>div{max-width:680px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
        .rv-hero{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;display:block;margin:18px 0 0;cursor:zoom-in;background:${C.chip}}
        .rv-h1{font-family:${SERIF};font-size:34px;line-height:1.05;color:${C.dark};margin:18px 0 4px;text-wrap:balance}
        .rv-sub{font-size:17px;color:${C.text};margin:0 0 10px}
        .rv-for{font-size:13.5px;color:${C.muted}} .rv-for b{color:${C.dark}}
        .rv-story{font-size:16px;line-height:1.6;white-space:pre-line;margin:18px 0 6px;padding:12px 14px;background:#fff;border-left:3px solid ${C.light};border-radius:8px}
        .rv-ctx{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:14px 0 4px}
        .rv-ctx div{background:#fff;border:1px solid ${C.border};border-radius:10px;padding:8px 10px}
        .rv-ctx b{display:block;font-size:20px;color:${C.dark};font-variant-numeric:tabular-nums}
        .rv-ctx span{font-size:11.5px;color:${C.muted};text-transform:uppercase;letter-spacing:.05em}
        .rv-saved{font-size:13.5px;color:${C.muted};margin-top:10px;padding:8px 12px;background:${C.chip};border-radius:8px}
        .rv-sec{font-family:${SERIF};font-size:25px;color:${C.dark};margin:28px 0 2px}
        .rv-secsub{font-size:14px;color:${C.muted};margin:0 0 12px}
        .rv-grid{display:grid;grid-template-columns:1fr;gap:14px}
        @media (min-width:600px){.rv-grid{grid-template-columns:1fr 1fr}}
        .rv-c{background:#fff;border:1px solid ${C.border};border-radius:16px;overflow:hidden}
        .rv-c .b{padding:12px 14px 14px}
        .rv-c .n{font-family:${SERIF};font-size:20px;color:${C.dark}}
        .rv-c .d{font-size:14px;color:${C.muted};margin-top:2px;line-height:1.4}
        .rv-c .q{font-size:14px;margin:8px 0 10px;color:${C.text}} .rv-c .q b{font-size:18px;font-weight:800;color:${C.dark}} .rv-c .q .h{color:${C.muted}}
        .rv-c .v{display:grid;grid-template-columns:1fr 1fr;gap:6px} .rv-c .v.one{grid-template-columns:1fr}
        .rv-c .v button{padding:11px 6px;border-radius:10px;border:1.5px solid;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;line-height:1.1}
        .rv-c .v button:disabled{opacity:.6;cursor:default}
        .rv-c .sq{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13.5px;color:${C.muted}}
        .rv-c .sq input{width:96px;height:40px;text-align:center;font-size:18px;font-weight:800;border:1.5px solid ${C.border};border-radius:10px;font-family:inherit;color:${C.dark}}
        .rv-c .cm{width:100%;margin-top:8px;padding:10px 12px;border:1.5px solid ${C.border};border-radius:10px;font-size:15px;font-family:inherit;background:#fff}
        .rv-sum{background:#fff;border:1px solid ${C.border};border-radius:16px;padding:16px;margin-top:28px}
        .rv-sum h3{font-family:${SERIF};font-size:24px;color:${C.dark};margin:0 0 10px;font-weight:400}
        .rv-ov{display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:10px}
        .rv-ov button{padding:13px;border-radius:10px;border:1.5px solid ${C.border};background:#fff;font-weight:800;font-size:15px;cursor:pointer;font-family:inherit;color:${C.text};text-align:left}
        .rv-ov button.on{background:${C.dark};border-color:${C.dark};color:#fff}
        .rv-in{width:100%;padding:13px 14px;border:1.5px solid ${C.border};border-radius:12px;font-size:16px;font-family:inherit;background:#fff;margin-top:8px}
        .rv-cta{width:100%;margin-top:14px;padding:18px;border-radius:14px;border:none;background:${C.dark};color:#fff;font-size:17px;font-weight:800;letter-spacing:.04em;cursor:pointer;font-family:inherit}
        .rv-cta:disabled{opacity:.5}
        .rv-foot{text-align:center;padding:32px 0 8px;color:${C.muted};font-size:13px;line-height:1.6}
        .rv-foot img{height:56px;width:auto;display:block;margin:0 auto 8px}
        @media print{.rv-cta,.rv-c .v,.rv-c .cm{display:none}.rv-c{break-inside:avoid}body{background:#fff}}
      `}</style>
      <div className="rv-bar"><div>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 46, width: "auto", display: "block" }} />
        <span style={{ color: C.cream, fontSize: 12.5, letterSpacing: ".08em", textTransform: "uppercase" }}>Plan review</span>
      </div></div>
      <div className="rv-wrap">
        {sheet.hero_url && <img className="rv-hero" src={sheet.hero_url} alt={sheet.title} onClick={() => setPhoto({ url: sheet.hero_url, name: sheet.title })} />}
        <h1 className="rv-h1">{sheet.title}</h1>
        {sheet.subtitle && <p className="rv-sub">{sheet.subtitle}</p>}
        {(sheet.reviewer_name || sheet.from_name) && <div className="rv-for">For <b>{sheet.reviewer_name || "you"}</b>{sheet.from_name ? <> · from <b>{sheet.from_name}</b></> : null}</div>}
        {(ctx.pots || ctx.trays || ctx.cost || ctx.weeks) && (
          <div className="rv-ctx">
            {ctx.pots != null && <div><b>{n(ctx.pots)}</b><span>pots proposed</span></div>}
            {ctx.trays != null && <div><b>{n(ctx.trays)}</b><span>trays</span></div>}
            {ctx.cost != null && <div><b>${n(Math.round(ctx.cost))}</b><span>plug cost</span></div>}
            {ctx.weeks && <div><b style={{ fontSize: 16 }}>{ctx.weeks}</b><span>timing</span></div>}
          </div>
        )}
        {sheet.story && <div className="rv-story">{sheet.story}</div>}
        {savedAt && <div className="rv-saved">Feedback saved {fmtWhen(savedAt)}{sheet.submitted_name ? ` by ${sheet.submitted_name}` : ""}. Change anything and send again to update.</div>}
        {closed && <div className="rv-saved" style={{ background: "#fff7ec" }}>This review is closed. The decision has been made.</div>}

        {proposed.length > 0 && <>
          <div className="rv-sec">Proposed</div>
          <div className="rv-secsub">Tap one: more, just right, less, or don't grow it. Add a note if it helps.</div>
          <div className="rv-grid">{proposed.map(it => <Card key={it.id} it={it} r={resp[it.id] || {}} set={set} closed={closed} onOpen={setPhoto} />)}</div>
        </>}
        {available.length > 0 && <>
          <div className="rv-sec">Also available, not in the plan</div>
          <div className="rv-secsub">Tap "Add" on anything you would rather see instead of, or on top of, the proposal.</div>
          <div className="rv-grid">{available.map(it => <Card key={it.id} it={it} r={resp[it.id] || {}} set={set} closed={closed} onOpen={setPhoto} />)}</div>
        </>}

        {!closed && (
          <div className="rv-sum">
            <h3>Overall</h3>
            <div className="rv-ov">
              {OVERALL.map(([k, label]) => <button key={k} className={overall === k ? "on" : ""} onClick={() => setOverall(overall === k ? "" : k)}>{label}</button>)}
            </div>
            <textarea className="rv-in" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Anything else — customers asking for something, colours that never move, pot size thoughts…" />
            <input className="rv-in" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
            <button className="rv-cta" onClick={submit} disabled={saving || (!answered && !overall && !note.trim())}>{saving ? "Sending…" : `Send feedback${answered ? ` (${answered} items)` : ""}`}</button>
            {err && <div style={{ color: C.red, marginTop: 8, fontSize: 14 }}>{err}</div>}
          </div>
        )}
        <div className="rv-foot"><img src="/hoosier-boy-mark-color.jpg" alt="" />Hoosier Boy Greenhouse · Indianapolis, IN</div>
      </div>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </div>
  );
}

// ── PLANNER SIDE: list of sheets + responses ────────────────────────────────
export default function ReviewSheets({ embedded }) {
  const sb = getSupabase();
  const [sheets, setSheets] = useState([]);
  const [items, setItems] = useState([]);
  const [resps, setResps] = useState([]);
  const [open, setOpen] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = async () => {
    if (!sb) return;
    const [{ data: s }, { data: it }, { data: r }] = await Promise.all([
      sb.from("review_sheets").select("*").order("created_at", { ascending: false }),
      sb.from("review_items").select("*").order("sort").order("name"),
      sb.from("review_responses").select("*"),
    ]);
    setSheets(s || []); setItems(it || []); setResps(r || []);
  };
  useEffect(() => { load(); }, [sb]); // eslint-disable-line
  const copy = async s => { try { await navigator.clipboard.writeText(reviewUrl(s.id)); setCopied(s.id); setTimeout(() => setCopied(null), 1500); } catch { window.prompt("Copy this link", reviewUrl(s.id)); } };
  const share = async s => { const url = reviewUrl(s.id); if (navigator.share) { try { await navigator.share({ title: s.title, text: `${s.title} — plan review`, url }); return; } catch { /* cancelled */ } } copy(s); };
  const setStatus = async (s, status) => { await sb.from("review_sheets").update({ status, updated_at: new Date().toISOString() }).eq("id", s.id); load(); };
  const vLabel = { more: "More", right: "Right", less: "Less", drop: "Don't", add: "Add", skip: "–" };
  const vCol = { more: "#2f6ea5", right: "#4f8a3a", less: "#e89a3a", drop: "#d94f3d", add: "#2f6ea5", skip: C.muted };
  return (
    <div style={{ fontFamily: FONT, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ fontFamily: SERIF, color: C.dark, margin: 0, fontSize: 26 }}>🗳 Plan reviews</h2>
        <span style={{ color: C.muted, fontSize: 13 }}>Propose → sales feedback → decide. Sheets are built from the plan; the link needs no login.</span>
      </div>
      {sheets.length === 0 && <div style={{ color: C.muted, padding: 20 }}>No review sheets yet.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {sheets.map(s => {
          const its = items.filter(i => i.sheet_id === s.id);
          const rs = resps.filter(r => r.sheet_id === s.id);
          const byItem = Object.fromEntries(rs.map(r => [r.item_id, r]));
          const counts = rs.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
          const isOpen = open === s.id;
          return (
            <div key={s.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 19, color: C.dark }}>{s.title}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>
                    for {s.reviewer_name || "—"} · {its.length} items · {s.status}
                    {s.open_count ? ` · opened ${s.open_count}×` : " · not opened yet"}
                    {s.submitted_at ? ` · feedback ${fmtWhen(s.submitted_at)}` : ""}
                  </div>
                </div>
                {s.submitted_at && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(counts).map(([k, v]) => <span key={k} style={{ fontSize: 12, fontWeight: 800, color: "#fff", background: vCol[k] || C.muted, borderRadius: 999, padding: "2px 9px" }}>{vLabel[k]} {v}</span>)}
                    {s.overall_verdict && <span style={{ fontSize: 12, fontWeight: 800, color: C.dark, background: C.chip, borderRadius: 999, padding: "2px 9px" }}>{OVERALL.find(([k]) => k === s.overall_verdict)?.[1]}</span>}
                  </div>
                )}
                <button onClick={() => share(s)} style={btn(C.dark, "#fff")}>{copied === s.id ? "Link copied" : "Share link"}</button>
                <a href={`/?rv=${s.id}`} target="_blank" rel="noreferrer" style={{ ...btn("#fff", C.dark), textDecoration: "none" }}>Open</a>
                <button onClick={() => setOpen(isOpen ? null : s.id)} style={btn("#fff", C.dark)}>{isOpen ? "Hide" : "Responses"}</button>
                {s.status !== "closed" ? <button onClick={() => setStatus(s, "closed")} style={btn("#fff", C.muted)}>Close</button> : <button onClick={() => setStatus(s, "open")} style={btn("#fff", C.muted)}>Reopen</button>}
              </div>
              {isOpen && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  {s.overall_note && <div style={{ fontSize: 14, padding: "8px 10px", background: C.chip, borderRadius: 8, marginBottom: 8, whiteSpace: "pre-line" }}><b>Overall note:</b> {s.overall_note}</div>}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
                      <thead><tr style={{ color: C.muted, textAlign: "left" }}><th style={th}>Item</th><th style={th}>Proposed</th><th style={th}>Verdict</th><th style={th}>Suggested</th><th style={th}>Note</th></tr></thead>
                      <tbody>{its.map(i => { const r = byItem[i.id]; return (
                        <tr key={i.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={td}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, background: swatchFor(i.name, i.swatch), marginRight: 6, verticalAlign: -1 }} />{i.name}</td>
                          <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{i.proposed_qty ? n(i.proposed_qty) : <span style={{ color: C.muted }}>not in plan</span>}</td>
                          <td style={td}>{r?.verdict ? <span style={{ fontWeight: 800, color: vCol[r.verdict] }}>{vLabel[r.verdict]}</span> : <span style={{ color: C.muted }}>–</span>}</td>
                          <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r?.suggested_qty ? n(r.suggested_qty) : ""}</td>
                          <td style={{ ...td, color: C.text }}>{r?.comment || ""}</td>
                        </tr>); })}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
const btn = (bg, fg) => ({ padding: "7px 12px", borderRadius: 9, border: `1.5px solid ${bg === "#fff" ? "#d9dfd3" : bg}`, background: bg, color: fg, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" });
const th = { padding: "6px 8px", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" };
const td = { padding: "7px 8px", verticalAlign: "top" };
