// 🗳 Season picks — one page per season, one link per reviewer (Caleb 9/11/2026).
// Deciders (Mario, Caleb, Paul) set pots per variety in 100-pot steps (ten 4.5" flats; typed
// numbers round UP to the next 100). Voters (Tyler, Trish, Alex, Evie) only say like / dislike.
// Crops collapse to a heading with their total; the top bar keeps running totals. Answers are
// per reviewer (review_responses.reviewer). Tables: pick_seasons, pick_reviewers, review_sheets
// (season_id, crop), review_items, review_responses (migration 20260911230000).
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { LOGO_WHITE } from "./PreOrder";
import { C, FONT, SERIF, Photo, Lightbox, n, fmtWhen } from "./ReviewSheet";

const roundUp = (v, step) => { const x = Math.max(0, Math.round(+v || 0)); return x ? Math.ceil(x / step) * step : 0; };

function PickCard({ it, r, set, role, step, closed, onOpen }) {
  const m = it.meta || {};
  const qty = +(r.suggested_qty || 0) || 0;
  return (
    <div className={`pk-c${role === "decider" && qty > 0 ? " on" : ""}${r.reaction ? " " + r.reaction : ""}`}>
      <Photo item={it} big onOpen={onOpen} />
      <div className="b">
        <div className="n">{it.name}</div>
        <div className="chips">{m.breeder && <span>{m.breeder}</span>}{m.vigor && <span>{m.vigor}</span>}{(m.grown_2026 != null || m.sold_2026 != null) && <span>2026: {m.grown_2026 != null ? `grew ${n(m.grown_2026)}` : ""}{m.grown_2026 != null && m.sold_2026 != null ? ", " : ""}{m.sold_2026 != null ? `sold ${n(m.sold_2026)}` : ""}</span>}</div>
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

export default function PicksViewer({ token }) {
  const sb = getSupabase();
  const [state, setState] = useState(undefined);   // {reviewer, season, sheets, items}
  const [resp, setResp] = useState({});             // item_id → {suggested_qty, reaction, comment}
  const [openCrop, setOpenCrop] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(null);

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
      setState({ reviewer: rv, season: season || {}, sheets: sheets || [], items: items || [] });
      setOpenCrop((sheets || [])[0]?.id || null);
      try {
        const now = new Date().toISOString();
        await sb.from("pick_reviewers").update({ first_opened_at: rv.first_opened_at || now, last_opened_at: now, open_count: (rv.open_count || 0) + 1 }).eq("id", rv.id);
      } catch { /* best effort */ }
    })();
  }, [sb, token]);

  const set = (itemId, patch) => setResp(r => ({ ...r, [itemId]: { suggested_qty: "", reaction: null, comment: "", ...(r[itemId] || {}), ...patch } }));
  const perSheet = useMemo(() => {
    if (!state) return [];
    return state.sheets.map(s => {
      const its = state.items.filter(i => i.sheet_id === s.id);
      const secs = []; its.forEach(i => { const k = i.section || "All"; let sec = secs.find(x => x.key === k); if (!sec) { sec = { key: k, items: [] }; secs.push(sec); } sec.items.push(i); });
      const pots = its.reduce((a, i) => a + (+(resp[i.id]?.suggested_qty || 0) || 0), 0);
      const likes = its.filter(i => resp[i.id]?.reaction === "like").length;
      const dislikes = its.filter(i => resp[i.id]?.reaction === "dislike").length;
      const picked = its.filter(i => (+(resp[i.id]?.suggested_qty || 0) || 0) > 0).length;
      return { sheet: s, sections: secs, pots, likes, dislikes, picked, count: its.length };
    });
  }, [state, resp]);
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
        .pk-sec{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${C.muted};margin:16px 0 8px;padding-top:12px;border-top:1px solid ${C.border}}
        .pk-sec .st{float:right;font-weight:600;letter-spacing:0;text-transform:none;font-variant-numeric:tabular-nums}
        .pk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        @media (min-width:640px){.pk-grid{grid-template-columns:1fr 1fr 1fr}}
        .pk-c{background:#fff;border:1.5px solid ${C.border};border-radius:12px;overflow:hidden}
        .pk-c.on{border-color:${C.light};box-shadow:0 0 0 2px ${C.cream}}
        .pk-c.like{border-color:#4f8a3a} .pk-c.dislike{border-color:${C.red};opacity:.85}
        .pk-c .b{padding:8px 9px 10px}
        .pk-c .n{font-family:${SERIF};font-size:15.5px;line-height:1.15;color:${C.dark};min-height:2.3em}
        .pk-c .chips{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 7px} .pk-c .chips span{font-size:10.5px;color:${C.muted};background:${C.chip};border-radius:999px;padding:2px 7px}
        .pk-c .st{display:flex;align-items:center;gap:4px}
        .pk-c .st button{width:38px;height:40px;border-radius:9px;border:1.5px solid ${C.border};background:#fff;font-size:22px;font-weight:700;color:${C.dark};cursor:pointer;line-height:1;flex:0 0 auto}
        .pk-c .st button:disabled{opacity:.35}
        .pk-c .st input{flex:1;min-width:0;height:40px;text-align:center;font-size:17px;font-weight:800;border:1.5px solid ${C.border};border-radius:9px;font-family:inherit;color:${C.dark};background:#fff}
        .pk-c .st input::placeholder{color:#b9c2b3} .pk-c .st .u{font-size:11px;color:${C.muted}}
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

        {perSheet.map(s => { const isOpen = openCrop === s.sheet.id; return (
          <div className="pk-crop" key={s.sheet.id}>
            <button onClick={() => setOpenCrop(isOpen ? null : s.sheet.id)}>
              <span className="t">{s.sheet.crop || s.sheet.title}</span>
              <span className="s">{decider ? <><b>{n(s.pots)}</b> pots · {s.picked} of {s.count} picked</> : <><b>{s.likes}</b> liked · {s.dislikes} passed · {s.count} colours</>} {isOpen ? "▴" : "▾"}</span>
            </button>
            {isOpen && (
              <div className="body">
                {s.sections.map(sec => { const secPots = sec.items.reduce((a, i) => a + (+(resp[i.id]?.suggested_qty || 0) || 0), 0); return (
                  <div key={sec.key}>
                    <div className="pk-sec">{sec.key}{decider && secPots ? <span className="st">{n(secPots)} pots</span> : null}</div>
                    <div className="pk-grid">{sec.items.map(it => <PickCard key={it.id} it={it} r={resp[it.id] || {}} set={set} role={reviewer.role} step={step} closed={closed} onOpen={setPhoto} />)}</div>
                  </div>
                ); })}
              </div>
            )}
          </div>
        ); })}

        {!closed && (
          <div className="pk-sum">
            <h3>{decider ? "Send your numbers" : "Send your picks"}</h3>
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
