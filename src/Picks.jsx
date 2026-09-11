// 🗳 Season picks — one page per season, one link per reviewer (Caleb 9/11/2026).
// Deciders (Mario, Caleb, Paul) set pots per variety in 100-pot steps (ten 4.5" flats; typed
// numbers round UP to the next 100). Voters (Tyler, Trish, Alex, Evie) only say like / dislike.
// Crops collapse to a heading with their total; the top bar keeps running totals. Answers are
// per reviewer (review_responses.reviewer). Tables: pick_seasons, pick_reviewers, review_sheets
// (season_id, crop), review_items, review_responses (migration 20260911230000).
// Phase 2 (9/11): "Mix" = bird's-eye of what's picked, per crop (our calibrachoa colour mix, our
// verbena colour mix…) by colour / vigor / breeder / new vs proven; tapping a bar jumps to those
// cards. Filter bar (vigor · breeder · colour, multi-select, AND across rows / OR within a row)
// cuts the page down to what the reviewer wants to look at. Cards carry a NEW badge
// (nothing grown or sold in 2026), a colour-family chip and last year's grown/sold (meta).
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { LOGO_WHITE } from "./PreOrder";
import { C, FONT, SERIF, Photo, Lightbox, n, fmtWhen, mixOf, MixBars, colorHex, dimValue, MIX_DIMS, COLOR_FAMILIES } from "./ReviewSheet";

// Breeder logos live in the public preorder-photos bucket (logos/, uploaded 9/11/2026).
const LOGO_BASE = `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/public/preorder-photos/logos/`;
const LOGOS = { "Ball FloraPlant": "ball-floraplant.svg", Selecta: "selecta.svg", Westhoff: "westhoff.svg", "Dümmen": "dummen.png", Beekenkamp: "beekenkamp.png", Danziger: "danziger.webp" };
const logoUrl = breeder => LOGOS[breeder] ? LOGO_BASE + LOGOS[breeder] : null;
const money = v => `$${(+v).toFixed(2)}`;
const FILTER_DIMS = [["vigor", "Vigor"], ["breeder", "Breeder"], ["color", "Colour"]];
const VIGOR_ORDER = ["compact", "medium", "vigorous"];
const EMPTY_FILTERS = { vigor: [], breeder: [], color: [] };
const MIX_CROP_DIMS = MIX_DIMS.filter(([k]) => k !== "crop");
const passes = (it, f) => FILTER_DIMS.every(([dim]) => !f[dim].length || f[dim].includes(dimValue(it, dim)));
const roundUp = (v, step) => { const x = Math.max(0, Math.round(+v || 0)); return x ? Math.ceil(x / step) * step : 0; };

function PickCard({ it, r, set, role, step, closed, onOpen }) {
  const m = it.meta || {};
  const qty = +(r.suggested_qty || 0) || 0;
  return (
    <div className={`pk-c${role === "decider" && qty > 0 ? " on" : ""}${r.reaction ? " " + r.reaction : ""}`}>
      <div className="ph"><Photo item={it} big onOpen={onOpen} />{m.is_new && <span className="new">New</span>}</div>
      <div className="b">
        <div className="n">{it.name}</div>
        <div className="chips">
          {logoUrl(m.breeder) ? <span className="lg" title={m.breeder}><img src={logoUrl(m.breeder)} alt={m.breeder} /></span> : m.breeder ? <span>{m.breeder}</span> : null}
          {m.cutting_cost != null && <span className="pr" title={`${m.cutting_form === "urc" ? "unrooted cutting" : m.cutting_form} · ${m.cutting_supplier || ""} via ${m.cutting_broker || ""}`}>{money(m.cutting_cost)} {m.cutting_form === "urc" ? "cutting" : m.cutting_form}</span>}
          {m.color && <span className="col"><i style={{ background: colorHex(m.color) }} />{m.color}</span>}
          {m.vigor && <span>{m.vigor}</span>}
          {(m.grown_2026 != null || m.sold_2026 != null) ? <span className="ly">2026: {m.grown_2026 != null ? `grew ${n(m.grown_2026)}` : ""}{m.grown_2026 != null && m.sold_2026 != null ? " · " : ""}{m.sold_2026 != null ? `sold ${n(m.sold_2026)}` : ""}</span> : null}
        </div>
        {role === "decider" ? (
          <div className="st">
            <button aria-label="less" disabled={closed || qty <= 0} onClick={() => set(it.id, { suggested_qty: Math.max(0, qty - step) })}>−</button>
            <input inputMode="numeric" value={r.suggested_qty ?? ""} placeholder="0" disabled={closed}
              onChange={e => set(it.id, { suggested_qty: e.target.value.replace(/[^\d]/g, "") })}
              onBlur={e => set(it.id, { suggested_qty: roundUp(e.target.value, step) || "" })} />
            <button aria-label="more" disabled={closed} onClick={() => set(it.id, { suggested_qty: qty + step })}>+</button>
            <span className="u">pots</span>
          </div>
        ) : (
          <div className="vote">
            <button className={r.reaction === "like" ? "on like" : ""} disabled={closed} onClick={() => set(it.id, { reaction: r.reaction === "like" ? null : "like" })}>👍 Like it</button>
            <button className={r.reaction === "dislike" ? "on dislike" : ""} disabled={closed} onClick={() => set(it.id, { reaction: r.reaction === "dislike" ? null : "dislike" })}>👎 Not for us</button>
          </div>
        )}
        <input className="cm" value={r.comment || ""} onChange={e => set(it.id, { comment: e.target.value })} placeholder="Note (optional)" disabled={closed} />
      </div>
    </div>
  );
}

// Section = one vigor group of one breeder. The breeder gets its logo, big, so the eye catches
// the change from one breeder to the next while scrolling.
function SectionHead({ sec, pots }) {
  const m = (sec.items[0] || {}).meta || {};
  const [vigorLabel, breederLabel] = sec.key.includes(" · ") ? sec.key.split(" · ") : [sec.key, m.breeder];
  const breeder = m.breeder || breederLabel;
  const logo = logoUrl(breeder);
  return (
    <div className="pk-sec">
      <div className="who">{logo ? <img src={logo} alt={breeder} /> : <b>{breeder}</b>}{logo && <b className="nm">{breeder}</b>}</div>
      <div className="vg">{vigorLabel}<span className="ct">{sec.items.length} colours{pots ? ` · ${n(pots)} pots` : ""}</span></div>
    </div>
  );
}

export default function PicksViewer({ token }) {
  const sb = getSupabase();
  const [state, setState] = useState(undefined);   // {reviewer, season, sheets, items}
  const [resp, setResp] = useState({});             // item_id → {suggested_qty, reaction, comment}
  const [crop, setCrop] = useState(() => new URLSearchParams(window.location.search).get("crop"));   // sheet id = one crop's own page
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [showMix, setShowMix] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);   // {vigor:[…], breeder:[…], color:[…]}

  useEffect(() => {
    (async () => {
      if (!sb || !token) { setState(null); return; }
      const { data: rv } = await sb.from("pick_reviewers").select("*").eq("token", token).maybeSingle();
      if (!rv) { setState(null); return; }
      const [{ data: season }, { data: sheets }] = await Promise.all([
        sb.from("pick_seasons").select("*").eq("id", rv.season_id).maybeSingle(),
        sb.from("review_sheets").select("id,crop,title,sort").eq("season_id", rv.season_id).order("sort").order("title"),
      ]);
      const ids = (sheets || []).map(s => s.id);
      const [{ data: items }, { data: rs }] = ids.length ? await Promise.all([
        sb.from("review_items").select("*").in("sheet_id", ids).eq("active", true).order("sort").order("name"),
        sb.from("review_responses").select("item_id,suggested_qty,reaction,comment").in("sheet_id", ids).eq("reviewer", rv.name),
      ]) : [{ data: [] }, { data: [] }];
      const m = {}; (rs || []).forEach(r => { m[r.item_id] = { suggested_qty: r.suggested_qty || "", reaction: r.reaction, comment: r.comment || "" }; });
      setResp(m); setNote(rv.note || "");
      const cropOf = Object.fromEntries((sheets || []).map(s => [s.id, s.crop || s.title]));
      setState({ reviewer: rv, season: season || {}, sheets: sheets || [], items: (items || []).map(i => ({ ...i, crop: cropOf[i.sheet_id] })) });

      try {
        const now = new Date().toISOString();
        await sb.from("pick_reviewers").update({ first_opened_at: rv.first_opened_at || now, last_opened_at: now, open_count: (rv.open_count || 0) + 1 }).eq("id", rv.id);
      } catch { /* best effort */ }
    })();
  }, [sb, token]);

  const filtering = Object.values(filters).some(a => a.length);
  // Each crop is its own page: /?picks=<token>&crop=<sheet id>. Back button and browser back both work.
  const goCrop = id => { const u = new URL(window.location.href); if (id) u.searchParams.set("crop", id); else u.searchParams.delete("crop"); window.history.pushState({}, "", u); setCrop(id); setShowMix(false); window.scrollTo({ top: 0 }); };
  useEffect(() => { const h = () => setCrop(new URLSearchParams(window.location.search).get("crop")); window.addEventListener("popstate", h); return () => window.removeEventListener("popstate", h); }, []);
  const set = (itemId, patch) => setResp(r => ({ ...r, [itemId]: { suggested_qty: "", reaction: null, comment: "", ...(r[itemId] || {}), ...patch } }));
  const perSheet = useMemo(() => {
    if (!state) return [];
    return state.sheets.map(s => {
      const its = state.items.filter(i => i.sheet_id === s.id);
      const shown = filtering ? its.filter(i => passes(i, filters)) : its;
      const secs = []; shown.forEach(i => { const k = i.section || "All"; let sec = secs.find(x => x.key === k); if (!sec) { sec = { key: k, items: [] }; secs.push(sec); } sec.items.push(i); });
      const pots = its.reduce((a, i) => a + (+(resp[i.id]?.suggested_qty || 0) || 0), 0);
      const likes = its.filter(i => resp[i.id]?.reaction === "like").length;
      const dislikes = its.filter(i => resp[i.id]?.reaction === "dislike").length;
      const picked = its.filter(i => (+(resp[i.id]?.suggested_qty || 0) || 0) > 0).length;
      const valueOf = i => state.reviewer.role === "decider" ? (+(resp[i.id]?.suggested_qty || 0) || 0) : (resp[i.id]?.reaction === "like" ? 1 : 0);
      return { sheet: s, sections: secs, pots, likes, dislikes, picked, count: its.length, shown: shown.length, mix: mixOf(its, valueOf, MIX_CROP_DIMS) };
    });
  }, [state, resp, filters, filtering]);
  const options = useMemo(() => {
    if (!state) return {};
    const pool = crop ? state.items.filter(i => i.sheet_id === crop) : state.items;
    const o = {}; FILTER_DIMS.forEach(([dim]) => { o[dim] = [...new Set(pool.map(i => dimValue(i, dim)))].filter(v => v && v !== "—"); });
    o.vigor.sort((a, b) => VIGOR_ORDER.indexOf(a) - VIGOR_ORDER.indexOf(b));
    o.breeder.sort();
    const ci = c => { const i = COLOR_FAMILIES.findIndex(([k]) => k === c); return i < 0 ? 99 : i; }; o.color.sort((a, b) => ci(a) - ci(b));
    return o;
  }, [state, crop]);
  const toggle = (dim, v) => setFilters(f => ({ ...f, [dim]: f[dim].includes(v) ? f[dim].filter(x => x !== v) : [...f[dim], v] }));
  const isActive = (dim, v) => (filters[dim] || []).includes(v);
  const pick = (dim, v) => { if (dim === "newness") return; setFilters(f => ({ ...f, [dim]: [v] })); setShowMix(false); window.scrollTo({ top: 0 }); };
  // Cover photo for a crop tile: the variety with the most pots (or a like), else the first with a photo.
  const coverOf = s => { const its = state.items.filter(i => i.sheet_id === s.id && i.image_url); const top = its.slice().sort((a, b) => (+(resp[b.id]?.suggested_qty || 0) || (resp[b.id]?.reaction === "like" ? 1 : 0)) - (+(resp[a.id]?.suggested_qty || 0) || (resp[a.id]?.reaction === "like" ? 1 : 0)))[0]; return top || its[0]; };
  const shownTotal = perSheet.reduce((a, s) => a + s.shown, 0);
  const totalPots = perSheet.reduce((a, s) => a + s.pots, 0);
  const totalLikes = perSheet.reduce((a, s) => a + s.likes, 0);
  const totalDislikes = perSheet.reduce((a, s) => a + s.dislikes, 0);

  const submit = async () => {
    if (!state) return;
    setSaving(true); setErr(null);
    try {
      const now = new Date().toISOString();
      const bySheet = Object.fromEntries(state.items.map(i => [i.id, i.sheet_id]));
      const step = state.season.step || 100;
      const rows = Object.entries(resp).filter(([id, r]) => bySheet[id] && (r.suggested_qty || r.reaction || (r.comment || "").trim())).map(([item_id, r]) => {
        const qty = state.reviewer.role === "decider" ? roundUp(r.suggested_qty, step) : null;
        return { sheet_id: bySheet[item_id], item_id, reviewer: state.reviewer.name, verdict: qty ? "add" : (r.reaction ? "skip" : "skip"), suggested_qty: qty || null, reaction: state.reviewer.role === "voter" ? (r.reaction || null) : null, comment: (r.comment || "").trim() || null, updated_at: now };
      });
      if (rows.length) { const { error } = await sb.from("review_responses").upsert(rows, { onConflict: "sheet_id,item_id,reviewer" }); if (error) throw error; }
      const { error: e2 } = await sb.from("pick_reviewers").update({ submitted_at: now, note: note.trim() || null }).eq("id", state.reviewer.id);
      if (e2) throw e2;
      setSent(now);
    } catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
  };

  if (state === undefined) return <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: C.muted }}>Loading…</div>;
  if (state === null) return <div style={{ fontFamily: FONT, padding: 40, textAlign: "center", color: C.muted }}>This link is not active.</div>;
  const { reviewer, season } = state;
  const decider = reviewer.role === "decider";
  const closed = season.status === "closed";
  const step = season.step || 100;
  const savedAt = sent || reviewer.submitted_at;
  const cur = crop ? perSheet.find(s => s.sheet.id === crop) : null;

  return (
    <div style={{ fontFamily: FONT, background: C.paper, minHeight: "100vh", color: C.text, WebkitTextSizeAdjust: "100%" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&family=DM+Serif+Display&display=swap');
        *{box-sizing:border-box}
        .pk-wrap{max-width:720px;margin:0 auto;padding:0 14px 60px}
        .pk-bar{background:${C.dark};padding:10px 16px}
        .pk-bar>div{max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
        .pk-tot{position:sticky;top:0;z-index:20;background:${C.paper};border-bottom:1px solid ${C.border};padding:8px 0 6px;display:flex;gap:6px;flex-wrap:wrap;align-items:baseline}
        .pk-tot span{background:#fff;border:1px solid ${C.border};border-radius:999px;padding:4px 10px;font-size:12.5px;color:${C.muted};white-space:nowrap}
        .pk-tot span b{color:${C.dark};font-size:14px;font-variant-numeric:tabular-nums}
        .pk-tot .grand{background:${C.dark};border-color:${C.dark};color:${C.cream}} .pk-tot .grand b{color:#fff}
        .pk-h1{font-family:${SERIF};font-size:32px;line-height:1.05;color:${C.dark};margin:16px 0 4px;text-wrap:balance}
        .pk-for{font-size:13.5px;color:${C.muted};margin-bottom:6px} .pk-for b{color:${C.dark}}
        .pk-story{font-size:15.5px;line-height:1.55;white-space:pre-line;margin:12px 0 4px;padding:12px 14px;background:#fff;border-left:3px solid ${C.light};border-radius:8px}
        .pk-saved{font-size:13.5px;color:${C.muted};margin-top:10px;padding:8px 12px;background:${C.chip};border-radius:8px}
        .pk-crop{margin-top:16px;background:#fff;border:1px solid ${C.border};border-radius:14px;overflow:hidden}
        .pk-crop>button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;background:#fff;border:none;cursor:pointer;font-family:inherit;text-align:left}
        .pk-crop>button .t{font-family:${SERIF};font-size:24px;color:${C.dark}}
        .pk-crop>button .s{font-size:13px;color:${C.muted};font-variant-numeric:tabular-nums}
        .pk-crop>button .s b{color:${C.dark}}
        .pk-crop .body{padding:0 12px 14px}
        .pk-sec{margin:18px 0 10px;padding:10px 12px;border-radius:10px 10px 0 0;background:${C.chip};border-top:3px solid ${C.dark};display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .pk-sec .who{display:flex;align-items:center;gap:10px;min-height:34px}
        .pk-sec .who img{height:30px;width:auto;max-width:150px;object-fit:contain;display:block}
        .pk-sec .who b{font-family:${SERIF};font-size:20px;color:${C.dark};font-weight:400}
        .pk-sec .who .nm{font-size:15px}
        .pk-sec .vg{font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};text-align:right}
        .pk-sec .vg .ct{display:block;font-weight:600;letter-spacing:0;text-transform:none;font-variant-numeric:tabular-nums}
        .pk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
        @media (min-width:640px){.pk-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        .pk-c{background:#fff;border:1.5px solid ${C.border};border-radius:12px;overflow:hidden;min-width:0}
        .pk-c .ph{position:relative}
        .pk-c .new{position:absolute;top:6px;left:6px;background:${C.amber};color:#fff;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 7px;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
        .pk-c .chips .col{display:inline-flex;align-items:center;gap:4px;text-transform:capitalize} .pk-c .chips .col i{width:9px;height:9px;border-radius:999px;border:1px solid rgba(0,0,0,.15);flex:0 0 auto}
        .pk-c .chips .ly{background:#fff7ec;color:#7a5a2a}
        .pk-c .chips .lg{background:#fff;border:1px solid ${C.border};padding:2px 6px;display:inline-flex;align-items:center;height:20px}
        .pk-c .chips .lg img{height:13px;width:auto;max-width:70px;object-fit:contain;display:block}
        .pk-c .chips .pr{background:${C.dark};color:#fff;font-weight:800;font-variant-numeric:tabular-nums}
        .pk-mixbtn{margin-left:auto;background:${C.dark};color:#fff;border:none;border-radius:999px;padding:5px 12px;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit}
        .pk-mixbtn.on{background:${C.light};color:${C.dark}}
        .pk-tot .shown{background:${C.cream};border-color:${C.light};color:${C.dark};cursor:pointer}
        .pk-fb{margin-top:10px;display:grid;gap:5px}
        .pk-fr{display:flex;align-items:center;gap:5px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:2px}
        .pk-fr::-webkit-scrollbar{display:none}
        .pk-fr .lb{flex:0 0 58px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}}
        .pk-fr button{flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:999px;border:1.5px solid ${C.border};background:#fff;font-family:inherit;font-size:12.5px;font-weight:700;color:${C.text};cursor:pointer;white-space:nowrap;text-transform:capitalize}
        .pk-fr button.on{background:${C.dark};border-color:${C.dark};color:#fff}
        .pk-fr button i{width:10px;height:10px;border-radius:999px;border:1px solid rgba(0,0,0,.15)}
        .pk-fr button.clear{border-style:dashed;color:${C.muted};text-transform:none}
        .pk-mix .crop{margin-top:14px;padding-top:12px;border-top:1px solid ${C.border}}
        .pk-mix .crop:first-of-type{margin-top:0;padding-top:0;border-top:none}
        .pk-mix .crop h4{font-family:${SERIF};font-size:19px;color:${C.dark};margin:0 0 8px;font-weight:400}
        .pk-mix .crop h4 span{font-family:${FONT};font-size:12px;color:${C.muted}}
        .pk-mix{background:#fff;border:1px solid ${C.border};border-radius:14px;padding:14px 14px 10px;margin-top:14px}
        .pk-mix h3{font-family:${SERIF};font-size:22px;color:${C.dark};margin:0 0 2px;font-weight:400}
        .pk-mix .hint{font-size:12.5px;color:${C.muted};margin-bottom:10px}
        .pk-none{color:${C.muted};font-size:14px;padding:16px 4px}
        .pk-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}
        @media (min-width:640px){.pk-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
        .pk-tile{position:relative;display:block;padding:0;border:1.5px solid ${C.border};border-radius:14px;background:#fff;overflow:hidden;text-align:left;cursor:pointer;font-family:inherit;color:${C.text}}
        .pk-tile.done{border-color:${C.light};box-shadow:0 0 0 2px ${C.cream}}
        .pk-tile img,.pk-tile .ph{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:${C.chip}}
        .pk-tile .tb{padding:10px 11px 12px}
        .pk-tile .tn{font-family:${SERIF};font-size:22px;line-height:1.1;color:${C.dark}}
        .pk-tile .ts{font-size:12px;color:${C.muted};margin-top:3px;font-variant-numeric:tabular-nums}
        .pk-tile .go{position:absolute;right:10px;bottom:10px;font-size:26px;line-height:1;color:${C.light}}
        .pk-back{background:#fff;border:1.5px solid ${C.border};border-radius:999px;padding:5px 12px;font-weight:800;font-size:12.5px;color:${C.dark};cursor:pointer;font-family:inherit}
        .pk-back.big{display:block;width:100%;margin-top:18px;padding:14px;border-radius:12px;font-size:15px}
        .pk-sum .hint{font-size:12.5px;color:${C.muted};margin-bottom:4px}
        .pk-c.on{border-color:${C.light};box-shadow:0 0 0 2px ${C.cream}}
        .pk-c.like{border-color:#4f8a3a} .pk-c.dislike{border-color:${C.red};opacity:.85}
        .pk-c .b{padding:8px 9px 10px}
        .pk-c .n{font-family:${SERIF};font-size:15.5px;line-height:1.15;color:${C.dark};min-height:2.3em}
        .pk-c .chips{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 7px} .pk-c .chips span{font-size:10.5px;color:${C.muted};background:${C.chip};border-radius:999px;padding:2px 7px}
        .pk-c .st{display:flex;align-items:center;gap:4px;width:100%}
        .pk-c .st button{width:36px;height:40px;padding:0;border-radius:9px;border:1.5px solid ${C.border};background:#fff;font-size:22px;font-weight:700;color:${C.dark};cursor:pointer;line-height:1;flex:0 0 36px}
        .pk-c .st button:disabled{opacity:.35}
        .pk-c .st input{flex:1 1 0;width:0;min-width:0;height:40px;padding:0 2px;text-align:center;font-size:17px;font-weight:800;border:1.5px solid ${C.border};border-radius:9px;font-family:inherit;color:${C.dark};background:#fff;-webkit-appearance:none;appearance:none}
        .pk-c .st input::placeholder{color:#b9c2b3} .pk-c .st .u{font-size:11px;color:${C.muted};flex:0 0 auto}
        @media (max-width:639px){.pk-c .st .u{display:none} .pk-c .st button{flex:0 0 32px;width:32px;font-size:20px} .pk-c .b{padding:8px 7px 10px}}
        .pk-c .vote{display:grid;grid-template-columns:1fr 1fr;gap:5px}
        .pk-c .vote button{padding:9px 4px;border-radius:9px;border:1.5px solid ${C.border};background:#fff;font-weight:800;font-size:12.5px;cursor:pointer;font-family:inherit;color:${C.text};line-height:1.1}
        .pk-c .vote button.on.like{background:#4f8a3a;border-color:#4f8a3a;color:#fff} .pk-c .vote button.on.dislike{background:${C.red};border-color:${C.red};color:#fff}
        .pk-c .cm{width:100%;margin-top:6px;padding:7px 9px;border:1.5px solid ${C.border};border-radius:8px;font-size:13px;font-family:inherit;background:#fff}
        .pk-sum{background:#fff;border:1px solid ${C.border};border-radius:16px;padding:16px;margin-top:22px}
        .pk-sum h3{font-family:${SERIF};font-size:24px;color:${C.dark};margin:0 0 8px;font-weight:400}
        .pk-in{width:100%;padding:12px 14px;border:1.5px solid ${C.border};border-radius:12px;font-size:16px;font-family:inherit;background:#fff;margin-top:8px}
        .pk-cta{width:100%;margin-top:12px;padding:18px;border-radius:14px;border:none;background:${C.dark};color:#fff;font-size:17px;font-weight:800;letter-spacing:.04em;cursor:pointer;font-family:inherit}
        .pk-cta:disabled{opacity:.5}
        .pk-foot{text-align:center;padding:28px 0 8px;color:${C.muted};font-size:13px;line-height:1.6}
      `}</style>
      <div className="pk-bar"><div>
        <img src={LOGO_WHITE} alt="Hoosier Boy" style={{ height: 42, width: "auto", display: "block" }} />
        <span style={{ color: C.cream, fontSize: 12.5, letterSpacing: ".08em", textTransform: "uppercase" }}>{season.season || "Season"} picks</span>
      </div></div>
      <div className="pk-wrap">
        {!cur ? (<>
          <div className="pk-tot">
            {decider ? <>
              <span className="grand"><b>{n(totalPots)}</b> pots picked</span>
              {perSheet.map(s => <span key={s.sheet.id}>{s.sheet.crop || s.sheet.title} <b>{n(s.pots)}</b></span>)}
            </> : <>
              <span className="grand"><b>{totalLikes}</b> liked · <b>{totalDislikes}</b> passed</span>
              {perSheet.map(s => <span key={s.sheet.id}>{s.sheet.crop || s.sheet.title} <b>{s.likes}</b>👍 <b>{s.dislikes}</b>👎</span>)}
            </>}
          </div>
          <h1 className="pk-h1">{season.title}</h1>
          <div className="pk-for">For <b>{reviewer.name}</b> · {decider ? `you set the numbers, in flats of ten (${step} pots)` : "tell us what your customers want"}</div>
          {season.story && <div className="pk-story">{season.story}</div>}
          {savedAt && <div className="pk-saved">Saved {fmtWhen(savedAt)}. Change anything and send again to update.</div>}
          {closed && <div className="pk-saved" style={{ background: "#fff7ec" }}>This season's picks are closed. The decisions have been made.</div>}
          <div className="pk-tiles">
            {perSheet.map(s => { const cv = coverOf(s.sheet); const done = decider ? s.pots > 0 : (s.likes + s.dislikes) > 0; return (
              <button className={`pk-tile${done ? " done" : ""}`} key={s.sheet.id} onClick={() => goCrop(s.sheet.id)}>
                {cv ? <img src={cv.image_url} alt={s.sheet.crop || s.sheet.title} /> : <div className="ph" />}
                <div className="tb">
                  <div className="tn">{s.sheet.crop || s.sheet.title}</div>
                  <div className="ts">{s.count} colours{decider ? (s.pots ? ` · ${n(s.pots)} pots picked` : " · nothing picked yet") : (s.likes + s.dislikes ? ` · ${s.likes} liked · ${s.dislikes} passed` : " · nothing marked yet")}</div>
                </div>
                <span className="go">›</span>
              </button>
            ); })}
            {!perSheet.length && <div className="pk-none">No crops on this season yet.</div>}
          </div>
        </>) : (<>
          <div className="pk-tot">
            <button className="pk-back" onClick={() => goCrop(null)}>‹ All crops</button>
            {decider ? <span className="grand"><b>{n(cur.pots)}</b> {cur.sheet.crop || cur.sheet.title} pots</span> : <span className="grand"><b>{cur.likes}</b> liked · <b>{cur.dislikes}</b> passed</span>}
            {filtering && <span className="shown" onClick={() => setFilters(EMPTY_FILTERS)} title="Clear filters"><b>{cur.shown}</b> shown ✕</span>}
            <button className={`pk-mixbtn${showMix ? " on" : ""}`} onClick={() => setShowMix(v => !v)}>{showMix ? "Close mix" : "Mix"}</button>
          </div>
          {showMix && (
            <div className="pk-mix">
              <h3>Our {(cur.sheet.crop || cur.sheet.title).toLowerCase()} mix</h3>
              <div className="hint">{decider ? `${n(cur.pots)} pots across ${cur.picked} colours` : `${cur.likes} liked`} · tap a bar to see just those varieties, picked or not.</div>
              {(decider ? cur.pots : cur.likes) ? <MixBars mix={cur.mix} total={decider ? cur.pots : cur.likes} unit={decider ? "pots" : "likes"} dims={MIX_CROP_DIMS} isActive={isActive} onPick={pick} />
                : <div style={{ color: C.muted, fontSize: 14 }}>Nothing picked yet — pick a few and come back.</div>}
            </div>
          )}
          <div className="pk-fb">
            {FILTER_DIMS.map(([dim, label]) => (
              <div className="pk-fr" key={dim}>
                <span className="lb">{label}</span>
                {(options[dim] || []).map(v => <button key={v} className={isActive(dim, v) ? "on" : ""} onClick={() => toggle(dim, v)}>{dim === "color" && <i style={{ background: colorHex(v) }} />}{v}</button>)}
              </div>
            ))}
            {filtering && <div className="pk-fr"><span className="lb" /><button className="clear" onClick={() => setFilters(EMPTY_FILTERS)}>Show all {cur.count}</button></div>}
          </div>
          <h1 className="pk-h1">{cur.sheet.crop || cur.sheet.title}</h1>
          <div className="pk-for">{cur.count} colours · {decider ? `${cur.picked} picked` : `${cur.likes} liked · ${cur.dislikes} passed`}{closed ? " · closed" : ""}</div>
          {filtering && !cur.shown && <div className="pk-none">Nothing matches those filters.</div>}
          {cur.sections.map(sec => { const secPots = sec.items.reduce((a, i) => a + (+(resp[i.id]?.suggested_qty || 0) || 0), 0); return (
            <div key={sec.key}>
              <SectionHead sec={sec} pots={decider ? secPots : 0} />
              <div className="pk-grid">{sec.items.map(it => <PickCard key={it.id} it={it} r={resp[it.id] || {}} set={set} role={reviewer.role} step={step} closed={closed} onOpen={setPhoto} />)}</div>
            </div>
          ); })}
          <button className="pk-back big" onClick={() => goCrop(null)}>‹ Back to all crops</button>
        </>)}

        {!closed && (
          <div className="pk-sum">
            <h3>{decider ? "Send your numbers" : "Send your picks"}</h3>
            <div className="hint">Sends everything from every crop, not just this page.</div>
            <textarea className="pk-in" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={decider ? "Anything else — customers asking for something, colours that never move…" : "Anything your customers keep asking for that is not here?"} />
            <button className="pk-cta" onClick={submit} disabled={saving || (decider ? !totalPots : !(totalLikes + totalDislikes)) && !note.trim()}>{saving ? "Sending…" : decider ? `Send ${n(totalPots)} pots` : `Send ${totalLikes + totalDislikes} picks`}</button>
            {err && <div style={{ color: C.red, marginTop: 8, fontSize: 14 }}>{err}</div>}
          </div>
        )}
        <div className="pk-foot">Hoosier Boy Greenhouse · Indianapolis, IN</div>
      </div>
      <Lightbox photo={photo} onClose={() => setPhoto(null)} />
    </div>
  );
}
