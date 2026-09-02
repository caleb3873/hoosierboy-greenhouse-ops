"""Reusable production-timeline block for the Hoosier Boy plan pages.

lanes_from_rows(rows, move_out_wk) turns scheduled_crops-style rows (prop_method,
ship_wk, plant_wk, ready_wk, pots, plants) into lane specs; render(lanes, ...) emits
the CSS + HTML + JS. The JS renderer (window.HBTimeline.render) is data-driven, so the
same block can draw any crop or scenario by passing a different `lanes` object.
"""
import json
from collections import Counter

# ISO week -> "wk N" plus a Monday date. Season spans Nov 2026 → Apr 2027.
SEASON = {"first": (2026, 47), "last": (2027, 22)}
SELL_THROUGH_WK = 22   # spring season sells through Jun 1

METHOD_META = {
    "BAREROOT": dict(key="bareroot", name="Bare root", how="Dormant crowns, potted on arrival"),
    "URC":      dict(key="urc",      name="URC",       how="Unrooted cuttings, stuck in our prop house"),
    "PLUG":     dict(key="liner",    name="Liner",     how="Rooted plugs & liners, potted on arrival"),
}

def lanes_from_rows(rows, move_out_wk=12, prop_wks_note="5 wks"):
    lanes = []
    for m in ("BAREROOT", "URC", "PLUG"):
        rr = [r for r in rows if r["prop_method"] == m and r["pots"] > 0]
        if not rr:
            continue
        meta = METHOD_META[m]
        ship = min(r["ship_wk"] for r in rr)
        plant = min(r["plant_wk"] for r in rr)
        readies = Counter(r["ready_wk"] for r in rr if r["ready_wk"])
        r_lo = max(move_out_wk, min(readies)) if readies else move_out_wk
        r_hi = max(readies) if readies else move_out_wk + 3
        pots = sum(r["pots"] for r in rr); plants = sum(r["plants"] for r in rr)
        genera = len({r["item_name"].split(" ")[2] if r["item_name"].startswith("1 QT") else r["item_name"].split(" ")[3] for r in rr})
        items = sorted(rr, key=lambda r: r["item_name"])
        early = [r for r in rr if r["ready_wk"] and r["ready_wk"] < move_out_wk]
        stages = []
        if m == "URC":
            stages += [
                dict(kind="point", label="Receive & stick", wk=ship, yr=2026, loc="prop",
                     note="Cuttings arrive and are stuck the same week in 105-cell trays."),
                dict(kind="bar", label="Callus & root", wk=ship, yr=2026, to=plant, toyr=2027, loc="prop",
                     note="Under mist in the propagation house until rooted."),
                dict(kind="point", label="Transplant to quart", wk=plant, yr=2027, loc="main",
                     note="Rooted cuttings potted into quarts."),
            ]
        elif m == "BAREROOT":
            stages += [
                dict(kind="point", label="Receive & pot", wk=ship, yr=2027, loc="main",
                     note="Bare-root crowns potted straight into quarts on arrival."),
            ]
        else:
            stages += [
                dict(kind="point", label="Receive & pot", wk=ship, yr=2027, loc="main",
                     note="Plugs and liners go straight from the truck into the pot."),
            ]
        stages += [
            dict(kind="bar", label="Establish & grow on", wk=plant, yr=2027, to=move_out_wk, toyr=2027, loc="main",
                 note="Climate-controlled 3,000 sq. ft. range."),
            dict(kind="point", label="Move outside", wk=move_out_wk, yr=2027, loc="outdoor", milestone=True,
                 note="Covered, ventilated outdoor space. No temperature control, light supplemental heat only."),
            dict(kind="bar", label="Outdoor finish", wk=move_out_wk, yr=2027, to=r_hi, toyr=2027, loc="outdoor",
                 note="Finishes under cover outdoors."),
            dict(kind="bar", label=f"Ready wk {r_lo}" + (f"–{r_hi}" if r_hi!=r_lo else "") + " → Jun 1", wk=r_lo, yr=2027, to=SELL_THROUGH_WK + 1, toyr=2027, loc="ready",
                 note="Ready to sell / ship. " + ("Earliest crops are ready as they go out." if r_lo == move_out_wk else "")),
        ]
        lanes.append(dict(
            key=meta["key"], name=meta["name"], how=meta["how"],
            summary=f"{len(rr)} line{'s' if len(rr)!=1 else ''} · {pots:,} pots · {plants:,} plants",
            items=[dict(name=r["item_name"], pots=r["pots"], ready=r["ready_wk"]) for r in items],
            early=[dict(name=r["item_name"], ready=r["ready_wk"]) for r in early],
            stages=stages,
        ))
    return lanes


CSS = """
.tl{--prop:#e9e3f4;--prop-ink:#4b3a7a;--main:#e3efe4;--main-ink:#1f4a2c;--out:#f2e8d8;--out-ink:#6b4a1c;--ready:#f6dcc9;--ready-ink:#8a3d12;
  margin:0 0 40px;border-top:1px solid var(--rule);padding-top:18px}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .tl{--prop:#2b2540;--prop-ink:#c9b8f0;--main:#1d3326;--main-ink:#b9dcc7;--out:#3a2f1f;--out-ink:#e5c99a;--ready:#4a2a18;--ready-ink:#f0b48c}}
:root[data-theme="dark"] .tl{--prop:#2b2540;--prop-ink:#c9b8f0;--main:#1d3326;--main-ink:#b9dcc7;--out:#3a2f1f;--out-ink:#e5c99a;--ready:#4a2a18;--ready-ink:#f0b48c}
.tl-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:6px}
.tl-head h2{margin:0}
.tl-head .lede{margin:0;flex:1 1 320px}
.tl-ctl{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--stone)}
.tl-ctl button{font:inherit;font-size:12px;padding:5px 10px;border:1px solid var(--rule);background:transparent;color:var(--ink);border-radius:4px;cursor:pointer}
.tl-ctl button[aria-pressed="true"]{background:var(--pine);border-color:var(--pine);color:var(--paper)}
.tl-ctl button:focus-visible{outline:2px solid var(--terra);outline-offset:2px}
.tl-scroll{overflow-x:auto;padding-bottom:6px}
.tl-grid{display:grid;grid-template-columns:150px 1fr;min-width:880px;position:relative}
.tl-cal{grid-column:2;position:relative;height:68px;border-bottom:1px solid var(--rule)}
.tl-cal .mo{position:absolute;top:24px;height:22px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--stone);border-left:1px solid var(--rule);padding-left:6px;white-space:nowrap}
.tl-cal .wk{position:absolute;top:48px;font-size:10px;color:var(--stone);font-variant-numeric:tabular-nums;transform:translateX(-50%);white-space:nowrap}
.tl-cal .wk.today{color:var(--ink)}
.tl-lane{display:contents}
.tl-name{grid-column:1;padding:16px 12px 12px 0;border-bottom:1px solid var(--border);cursor:pointer;position:sticky;left:0;z-index:3;background:var(--paper)}
.tl-name b{display:block;font-family:'Playfair Display',Georgia,serif;font-weight:500;font-size:19px;color:var(--pine)}
.tl-name small{display:block;font-size:11.5px;color:var(--stone);line-height:1.35;margin-top:3px}
.tl-name .cnt{display:block;font-size:11px;color:var(--stone);margin-top:6px;font-variant-numeric:tabular-nums}
.tl-track{grid-column:2;position:relative;border-bottom:1px solid var(--border);min-height:132px}
.tl-bar{position:absolute;top:56px;height:34px;border-radius:5px;display:flex;align-items:center;padding:0 10px;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;box-sizing:border-box}
.tl-bar.prop{background:var(--prop);color:var(--prop-ink);background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(0,0,0,.05) 6px 8px)}
.tl-bar.main{background:var(--main);color:var(--main-ink)}
.tl-bar.outdoor{background:var(--out);color:var(--out-ink);background-image:repeating-linear-gradient(90deg,transparent 0 10px,rgba(0,0,0,.05) 10px 12px)}
.tl-bar.ready{background:var(--ready);color:var(--ready-ink);border:1.5px dashed var(--ready-ink);top:96px;height:22px;font-size:11px}
.tl-bar.narrow{overflow:visible}.tl-bar.narrow .lab{position:absolute;left:100%;margin-left:6px;color:var(--ink);white-space:nowrap}
.tl-bar .dur{font-weight:400;opacity:.8;margin-left:6px;font-variant-numeric:tabular-nums}
.tl-bar:focus-visible{outline:2px solid var(--terra);outline-offset:2px}
.tl-pt{position:absolute;top:8px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;color:var(--ink);white-space:nowrap;cursor:default}
.tl-pt i{width:9px;height:9px;border-radius:50%;background:var(--pine);border:2px solid var(--paper);box-shadow:0 0 0 1px var(--pine)}
.tl-pt b{font-weight:600}
.tl-pt small{color:var(--stone);font-variant-numeric:tabular-nums}
.tl-pt.edge-l{transform:none;align-items:flex-start}.tl-pt.edge-l i{margin-left:-4px}
.tl-pt.milestone{transform:none;align-items:flex-start;padding-left:8px}.tl-pt.milestone i{margin-left:-12px}
.tl-pt.milestone i{background:var(--terra);box-shadow:0 0 0 1px var(--terra)}
.tl-move{position:absolute;top:0;bottom:0;width:0;border-left:2px solid var(--terra);z-index:2;pointer-events:none}
.tl-move span{position:absolute;top:0;left:8px;background:var(--terra);color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:3px;white-space:nowrap}
.tl-grid.focus .tl-lane:not(.on) .tl-track,.tl-grid.focus .tl-lane:not(.on) .tl-name{opacity:.28}
.tl-legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--stone)}
.tl-legend span{display:inline-flex;align-items:center;gap:6px}
.tl-legend i{width:16px;height:12px;border-radius:3px;display:inline-block}
.tl-legend i.prop{background:var(--prop);background-image:repeating-linear-gradient(135deg,transparent 0 4px,rgba(0,0,0,.08) 4px 6px)}
.tl-legend i.main{background:var(--main)}
.tl-legend i.outdoor{background:var(--out);background-image:repeating-linear-gradient(90deg,transparent 0 6px,rgba(0,0,0,.08) 6px 8px)}
.tl-legend i.ready{background:var(--ready);border:1.5px dashed var(--ready-ink);box-sizing:border-box}
.tl-legend i.move{width:0;height:14px;border-left:2px solid var(--terra);border-radius:0}
.tl-detail{grid-column:2;font-size:12px;color:var(--stone);padding:8px 0 14px;border-bottom:1px solid var(--border);display:none;line-height:1.5}
.tl-grid.detailed .tl-detail{display:block}
.tl-grid.detailed .tl-name{border-bottom:0}.tl-grid.detailed .tl-track{border-bottom:0}
.tl-detail b{color:var(--ink);font-weight:600}
.tl-tip{position:fixed;z-index:20;max-width:280px;background:var(--paper);color:var(--ink);border:1px solid var(--rule);border-radius:6px;padding:10px 12px;font-size:12.5px;line-height:1.45;box-shadow:0 6px 24px rgba(0,0,0,.14);pointer-events:none;display:none}
.tl-tip b{display:block;font-size:13px;margin-bottom:2px}
.tl-tip .k{color:var(--stone)}
.tl-read{font-size:13px;color:var(--stone);margin:10px 0 0;max-width:70ch}
@media (max-width:640px){.tl-grid{grid-template-columns:118px 1fr;min-width:820px}.tl-name b{font-size:16px}.tl-bar{font-size:11.5px;padding:0 7px}}
@media (prefers-reduced-motion: no-preference){.tl-track,.tl-name{transition:opacity .2s}}
"""

JS = r"""
window.HBTimeline = (function(){
  // ISO-week helpers ---------------------------------------------------------
  function isoMonday(y, w){ const s=new Date(Date.UTC(y,0,4)); const d=s.getUTCDay()||7; s.setUTCDate(s.getUTCDate()-d+1+(w-1)*7); return s; }
  const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt=d=>MON[d.getUTCMonth()]+' '+d.getUTCDate();
  const fmtY=d=>fmt(d)+', '+d.getUTCFullYear();
  function render(el, spec){
    const first=isoMonday(spec.season.first[0],spec.season.first[1]);
    const last=isoMonday(spec.season.last[0],spec.season.last[1]);
    const nWeeks=Math.round((last-first)/6048e5)+1; // inclusive of the last week
    const idx=(y,w)=>Math.round((isoMonday(y,w)-first)/6048e5);
    const pct=i=>(i/nWeeks*100);
    const wkOf=(y,w)=>({y,w,mon:isoMonday(y,w)});
    el.innerHTML='';
    const grid=document.createElement('div'); grid.className='tl-grid'; el.appendChild(grid);
    // calendar
    const cal=document.createElement('div'); cal.className='tl-cal'; grid.appendChild(cal);
    let lastMo=-1;
    for(let i=0;i<nWeeks;i++){
      const d=new Date(first.getTime()+i*6048e5);
      if(d.getUTCMonth()!==lastMo){ lastMo=d.getUTCMonth(); const m=document.createElement('div'); m.className='mo'; m.style.left=pct(i)+'%'; m.textContent=MON[lastMo]+(lastMo===0?' '+d.getUTCFullYear():''); cal.appendChild(m); }
      if(i%2===0){ const w=document.createElement('div'); w.className='wk'; w.style.left=pct(i+.5)+'%'; w.textContent='wk '+isoWeek(d); cal.appendChild(w); }
    }
    // move-outside line(s): one per distinct milestone week across lanes
    const moves=new Map();
    spec.lanes.forEach(l=>l.stages.filter(s=>s.milestone).forEach(s=>moves.set(s.yr+'-'+s.wk,s)));
    // lanes
    spec.lanes.forEach(lane=>{
      const wrap=document.createElement('div'); wrap.className='tl-lane'; wrap.dataset.key=lane.key; grid.appendChild(wrap);
      const name=document.createElement('div'); name.className='tl-name'; name.tabIndex=0; name.setAttribute('role','button'); name.title='Click to highlight this method';
      name.innerHTML='<b>'+esc(lane.name)+'</b><small>'+esc(lane.how)+'</small><span class="cnt">'+esc(lane.summary)+'</span>'; wrap.appendChild(name);
      const track=document.createElement('div'); track.className='tl-track'; wrap.appendChild(track);
      lane.stages.forEach(s=>{
        const a=idx(s.yr,s.wk);
        if(s.kind==='bar'){
          const b=idx(s.toyr,s.to); const weeks=b-a;
          const bar=document.createElement('div'); bar.className='tl-bar '+s.loc; bar.tabIndex=0;
          bar.style.left=pct(a)+'%'; bar.style.width='calc('+pct(Math.max(weeks,1))+'% - 3px)';
          const inner=esc(s.label)+(s.loc==='ready'?'':'<span class="dur">'+weeks+' wk'+(weeks===1?'':'s')+'</span>'); bar.innerHTML='<span class="lab">'+inner+'</span>'; if(weeks<=3&&s.loc!=='ready') bar.classList.add('narrow');
          bar.dataset.tip=JSON.stringify({t:s.label,rows:[['From','wk '+s.wk+' · '+fmtY(isoMonday(s.yr,s.wk))],['To','wk '+s.to+' · '+fmtY(isoMonday(s.toyr,s.to))],['Duration',weeks+' week'+(weeks===1?'':'s')],['Where',LOC[s.loc]]],note:s.note});
          track.appendChild(bar);
        } else {
          const p=document.createElement('div'); p.className='tl-pt'+(s.milestone?' milestone':'')+(pct(a)<9?' edge-l':''); p.tabIndex=0;
          p.style.left=pct(a)+'%';
          p.innerHTML='<i></i><b>'+esc(s.label)+'</b><small>wk '+s.wk+' · '+fmt(isoMonday(s.yr,s.wk))+'</small>';
          p.dataset.tip=JSON.stringify({t:s.label,rows:[['Week','wk '+s.wk+' · '+fmtY(isoMonday(s.yr,s.wk))],['Where',LOC[s.loc]]],note:s.note});
          track.appendChild(p);
        }
      });
      // detail row
      const det=document.createElement('div'); det.className='tl-detail';
      const early=lane.early&&lane.early.length?'<div><b>Ready before move-out in the plan:</b> '+lane.early.map(e=>esc(pretty(e.name))+' (wk '+e.ready+')').join(', ')+' — these finish inside.</div>':'';
      det.innerHTML='<div><b>Lines:</b> '+lane.items.map(i=>esc(pretty(i.name))+' '+i.pots.toLocaleString()).join(' · ')+'</div>'+early;
      wrap.appendChild(det);
      name.addEventListener('click',()=>toggleFocus(grid,wrap));
      name.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleFocus(grid,wrap);} });
    });
    // move-outside line: labeled in the calendar, echoed down every lane track
    moves.forEach(s=>{
      const x=pct(idx(s.yr,s.wk))+'%';
      const c=document.createElement('div'); c.className='tl-move'; c.style.left=x; c.innerHTML='<span>Move outside · wk '+s.wk+'</span>'; cal.appendChild(c);
      grid.querySelectorAll('.tl-track').forEach(t=>{ const l=document.createElement('div'); l.className='tl-move'; l.style.left=x; t.appendChild(l); });
    });
    // legend
    const leg=document.createElement('div'); leg.className='tl-legend';
    leg.innerHTML='<span><i class="prop"></i>Propagation house</span><span><i class="main"></i>Main range (climate controlled)</span><span><i class="outdoor"></i>Outdoor, covered</span><span><i class="ready"></i>Target ready / selling</span><span><i class="move"></i>Move outside</span>';
    el.appendChild(leg);
    // tooltip
    let tip=document.querySelector('.tl-tip'); if(!tip){ tip=document.createElement('div'); tip.className='tl-tip'; document.body.appendChild(tip); }
    const show=(t,x,y)=>{ const d=JSON.parse(t.dataset.tip); tip.innerHTML='<b>'+esc(d.t)+'</b>'+d.rows.map(r=>'<div><span class="k">'+esc(r[0])+'</span> · '+esc(r[1])+'</div>').join('')+(d.note?'<div style="margin-top:4px">'+esc(d.note)+'</div>':''); tip.style.display='block';
      const w=tip.offsetWidth,h=tip.offsetHeight; let L=x+14,T=y+14; if(L+w>window.innerWidth-8)L=x-w-14; if(T+h>window.innerHeight-8)T=y-h-14; tip.style.left=L+'px'; tip.style.top=T+'px'; };
    el.querySelectorAll('[data-tip]').forEach(t=>{
      t.addEventListener('mousemove',e=>show(t,e.clientX,e.clientY));
      t.addEventListener('mouseleave',()=>tip.style.display='none');
      t.addEventListener('focus',()=>{ const r=t.getBoundingClientRect(); show(t,r.left,r.bottom); });
      t.addEventListener('blur',()=>tip.style.display='none');
    });
    return grid;
  }
  function isoWeek(d){ const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())); const day=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()+4-day); const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil(((t-y0)/864e5+1)/7); }
  function toggleFocus(grid,lane){ const on=lane.classList.contains('on'); grid.querySelectorAll('.tl-lane').forEach(l=>l.classList.remove('on')); if(on){ grid.classList.remove('focus'); } else { lane.classList.add('on'); grid.classList.add('focus'); } }
  const LOC={prop:'Propagation house (mist)',main:'Main range, climate controlled',outdoor:'Outdoor, covered & ventilated',ready:'Sales yard / shipping'};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const pretty=n=>n.replace(/^1 QT /,'').replace(/^HB 9" /,'9" ').replace(/\(A\)/,'(English)').replace(/\(S\)/,'(Spanish)').toLowerCase().replace(/(^|\s|\()([a-z])/g,(m,a,b)=>a+b.toUpperCase());
  return {render};
})();
"""

def render(lanes, title="Crop timeline by starting material", lede="Three ways in, one finish. Where each crop is, week by week, from arrival to ready."):
    spec = dict(season=dict(first=list(SEASON["first"]), last=list(SEASON["last"])), lanes=lanes)
    return f'''
<section class="tl" id="timeline">
  <div class="tl-head"><h2>{title}</h2><p class="lede">{lede}</p>
    <div class="tl-ctl" role="group" aria-label="Timeline detail"><button type="button" data-mode="overview" aria-pressed="true">Overview</button><button type="button" data-mode="detailed" aria-pressed="false">Detailed</button></div></div>
  <div class="tl-scroll"><div id="tl-root"></div></div>
  <p class="tl-read">Read left to right. URC starts five weeks earlier because it roots in our prop house first; bare root and liners skip that step and go straight to the pot. All three converge at the move-outside line and finish under cover. Hover or tab onto any stage for exact dates; click a method name to highlight it.</p>
</section>
<script>{JS}</script>
<script>
(function(){{
  const spec={json.dumps(spec)};
  const root=document.getElementById('tl-root');
  const grid=window.HBTimeline.render(root, spec);
  document.querySelectorAll('.tl-ctl button').forEach(b=>b.addEventListener('click',()=>{{
    document.querySelectorAll('.tl-ctl button').forEach(x=>x.setAttribute('aria-pressed', x===b?'true':'false'));
    grid.classList.toggle('detailed', b.dataset.mode==='detailed');
  }}));
}})();
</script>'''
