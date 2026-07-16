import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";

// "What we did last year" treatment plan → seed this year's tasks. Generic per crop (Mum first).
const uid = () => crypto.randomUUID();
const isoWeek = (iso) => {
  const d = new Date(iso + "T12:00:00");
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((dt - ys) / 86400000) + 1) / 7), year: dt.getUTCFullYear() };
};
const fmtDate = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const monthOf = iso => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long" });
const appColor = a => { const x = (a || "").toLowerCase(); return x.includes("piccolo") || x.includes("cleary") || x.includes("sprint") || x.includes("subdue") || /\bccc\b/.test(x) || /\bb9\b/.test(x) || x.includes("cycocel") || x.includes("bonzi") || x.includes("b-nine") || x.includes("fascinat") || x.includes("fasinat") ? "#8e5aa8" : x.includes("plant") ? "#7fb069" : x.includes("ppm") || x.includes("fert") ? "#e89a3a" : x.includes("net") ? "#4a90d9" : "#7a8c74"; };
const C = { dark: "#1e2d1a", light: "#7fb069", muted: "#7a8c74", border: "#e0ead8", card: "#fff", plum: "#8e5aa8" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };

const splitVars = s => String(s || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
// PGRs (Piccolo etc.) are size-triggered and applied PER VARIETY — each variety needs its own size photo,
// so we split those into one task per variety. Fertilizer and other broad applications go by LOCATION as a
// single task (the crew treats the whole bench/house at once, not variety-by-variety).
const isPGR = a => { const x = (a || "").toLowerCase(); return x.includes("piccolo") || x.includes("paclo") || x.includes("bonzi") || x.includes("sumagic") || x.includes("b-nine") || x.includes("b nine") || x.includes("bnine") || /\bb9\b/.test(x) || /\bccc\b/.test(x) || x.includes("dazide") || x.includes("cycocel") || x.includes("florel") || x.includes("pgr") || x.includes("a-rest") || x.includes("topflor"); };
const perVariety = rec => isPGR(rec.application) && splitVars(rec.crop_detail).length > 0;
// varieties this treatment becomes tasks for: per-variety list for PGRs, else a single "(all)" broad task
const varsOf = rec => perVariety(rec) ? splitVars(rec.crop_detail) : ["(all)"];
const isAll = v => !v || v === "(all)";
const mkTitle = (rec, variety) => { const base = ["🌼", rec.application, rec.rates].filter(Boolean).join(" "); const suffix = isAll(variety) ? (rec.location || rec.crop_detail || "") : variety; return (base + (suffix ? ` — ${suffix}` : "")).trim(); };
const mkDesc = (rec, variety) => [!isAll(variety) && `Variety: ${variety}`, isAll(variety) && rec.crop_detail && `Crop: ${rec.crop_detail}`, rec.location && `Location: ${rec.location}`, rec.application && `Treatment: ${rec.application}${rec.rates ? ` ${rec.rates}` : ""}`, rec.notes && `Note: ${rec.notes}`, `📷 Take a photo of ${isAll(variety) ? "the plant" : `${variety}'s`} size when treating.`].filter(Boolean).join("\n");

// Resize + JPEG-compress in the browser BEFORE upload so a 4–8 MB phone photo becomes ~200–400 KB
// (fast on a weak bench/booth connection). Falls back to the original file if anything fails.
function compressImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise(resolve => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const m = Math.max(width, height);
        if (m > maxDim) { const s = maxDim / m; width = Math.round(width * s); height = Math.round(height * s); }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob(b => resolve(b && b.size < file.size ? b : file), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    } catch { resolve(file); }
  });
}

const photoTile = (p, onDel) => (
  <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
    <img src={p.url} alt="" onClick={() => window.open(p.url, "_blank")} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer" }} />
    {onDel && <button onClick={() => onDel(p.id)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.55)", color: "#fff", border: "none", borderRadius: 11, width: 19, height: 19, fontSize: 12, cursor: "pointer" }}>×</button>}
  </div>
);

// One variety's response track: its at-treatment size photo + its own dated response photos + add control.
function VarietyResponse({ label, sizePhotos, respPhotos, onAdd, onDel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const groups = {};
  respPhotos.forEach(p => { (groups[p.date || "—"] = groups[p.date || "—"] || []).push(p); });
  const dates = Object.keys(groups).sort().reverse();
  async function pick(e) { const files = Array.from(e.target.files || []); e.target.value = ""; if (!files.length) return; setBusy(true); await onAdd(date, files); setBusy(false); }
  return (
    <div style={{ borderLeft: `3px solid ${C.plum}`, paddingLeft: 10, margin: "12px 0 4px" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.plum, ...wrap }}>{label}</div>
      {sizePhotos.length > 0 && (<>
        <div style={{ fontSize: 9.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, margin: "6px 0 3px" }}>At treatment</div>
        <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>{sizePhotos.map(p => photoTile(p, null))}</div>
      </>)}
      <div style={{ fontSize: 9.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, margin: "8px 0 3px" }}>Response{respPhotos.length ? ` · ${respPhotos.length}` : ""}</div>
      {dates.map(d => (
        <div key={d} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: C.dark, marginBottom: 3 }}>{d === "—" ? "Undated" : fmtDate(d)}</div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>{groups[d].map(p => photoTile(p, () => onDel(p.id)))}</div>
        </div>
      ))}
      {respPhotos.length === 0 && <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>No response photos for this variety yet.</div>}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)} style={{ padding: "7px 9px", borderRadius: 8, border: `1.5px solid #c8d8c0`, fontSize: 12.5, fontFamily: "inherit" }} />
        <label style={{ background: busy ? "#a9c795" : C.plum, color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Uploading…" : "📸 Add response"}
          <input type="file" accept="image/*" multiple disabled={busy} style={{ display: "none" }} onChange={pick} />
        </label>
      </div>
    </div>
  );
}

// A completed treatment on the Responses view — each variety tracked SEPARATELY.
function ResponseCard({ rec, varieties, doneAt, doneBy, onAdd, onDel }) {
  const title = (["🌼", rec.application, rec.rates].filter(Boolean).join(" ")).trim();
  const allPhotos = rec.photos || [];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, ...wrap }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "#2e5c1e", fontWeight: 800, marginTop: 3 }}>✓ Treated{doneAt ? ` ${fmtDate(String(doneAt).slice(0, 10))}` : ""}{doneBy ? ` · ${doneBy}` : ""}</div>
      {varieties.map(v => {
        const key = isAll(v) ? null : v;
        const size = allPhotos.filter(p => p.kind !== "response" && (p.variety || null) === key);
        const resp = allPhotos.filter(p => p.kind === "response" && (p.variety || null) === key);
        return <VarietyResponse key={v || "__all"} label={isAll(v) ? "All / general" : v} sizePhotos={size} respPhotos={resp} onAdd={(d, files) => onAdd(v, d, files)} onDel={onDel} />;
      })}
    </div>
  );
}

// Per-variety size reference (heights + drench rate + last-year photos) — the grower's "how big / what we did" card.
const wkNum = k => +String(k).replace(/\D/g, "");
// one season × greenhouse of a variety: heights + treatments + photos + editable notes
function YearDetail({ rec, tint, onZoom, onSaveNote }) {
  const photos = rec.photos || [];
  const weeks = Object.entries(rec.heights || {}).map(([k, v]) => [wkNum(k), +v]).filter(([, v]) => !isNaN(v)).sort((a, b) => a[0] - b[0]);
  const max = Math.max(...weeks.map(w => w[1]), 1);
  const first = weeks[0], last = weeks[weeks.length - 1];
  const apps = Object.entries(rec.applications || {}).map(([k, v]) => [wkNum(k), v]).sort((a, b) => a[0] - b[0]);
  const [text, setText] = useState(rec.notes || "");
  const [busy, setBusy] = useState(false);
  const dirty = text !== (rec.notes || "");
  return (
    <div style={{ background: "#fafcf8", border: `1px solid ${C.border}`, borderLeft: `3px solid ${tint}`, borderRadius: 10, padding: "9px 11px", marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: tint }}>{rec.year}</span>
        {rec.location && <span style={{ fontSize: 11, color: C.muted }}>{rec.location}</span>}
        {rec.drench_rate && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: C.plum, borderRadius: 999, padding: "1px 8px" }}>drench {rec.drench_rate}</span>}
        {first && last && <span style={{ fontSize: 11, fontWeight: 800, color: C.dark, marginLeft: "auto" }}>{first[1]}″→{last[1]}″</span>}
      </div>
      {weeks.length > 0 && (
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 50, overflowX: "auto", marginTop: 8, paddingBottom: 2 }}>
          {weeks.map(([wk, v]) => {
            const app = (rec.applications || {})["WK" + wk];
            return <div key={wk} title={`WK${wk}: ${v}″${app ? " · " + app : ""}`} style={{ flex: "1 0 14px", minWidth: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: app ? appColorFor(app) : "transparent", marginBottom: 1 }} />
              <div style={{ width: "100%", height: Math.max(3, (v / max) * 36), background: tint, opacity: .8, borderRadius: "2px 2px 0 0" }} />
              <div style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{wk}</div>
            </div>;
          })}
        </div>
      )}
      {apps.length > 0 && (
        <div style={{ fontSize: 11, color: "#3a2e42", marginTop: 6, ...wrap }}>
          <span style={{ fontWeight: 800, color: C.muted }}>Treatments: </span>
          {apps.map(([wk, label], i) => <span key={wk}>{i ? " · " : ""}WK{wk} <span style={{ color: appColorFor(label) }} title={label}>●</span></span>)}
        </div>
      )}
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 8 }}>
          {photos.map((p, i) => <img key={i} src={p.url} alt="" onClick={() => onZoom(photos, i)} loading="lazy" style={{ height: 96, width: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, cursor: "zoom-in", flexShrink: 0 }} />)}
        </div>
      )}
      <div style={{ marginTop: 8 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Add notes for this variety / season…" rows={2}
          style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", color: C.dark }} />
        {dirty && <button onClick={async () => { setBusy(true); await onSaveNote(rec.id, text); setBusy(false); }} disabled={busy}
          style={{ marginTop: 4, background: C.dark, color: "#fff", border: "none", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "Save note"}</button>}
      </div>
    </div>
  );
}
// group a variety's seasons/houses under one drill-in card, with year badges
function VarietyGroup({ variety, rows, yearColor, onZoom, onSaveNote }) {
  const [open, setOpen] = useState(false);
  const years = [...new Set(rows.map(r => String(r.year)))].sort();
  const drench = (rows.find(r => r.drench_rate) || {}).drench_rate;
  const sorted = [...rows].sort((a, b) => String(b.year).localeCompare(String(a.year)) || String(a.location || "").localeCompare(String(b.location || "")));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 13px", marginBottom: 10 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", cursor: "pointer" }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: C.dark, ...wrap }}>{variety}</span>
        {drench && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: C.plum, borderRadius: 999, padding: "1px 8px" }}>drench {drench}</span>}
        <span style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {years.map(y => <span key={y} style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", background: yearColor(y), borderRadius: 999, padding: "2px 9px" }}>{y}</span>)}
          {years.length === 1 && <span style={{ fontSize: 10, color: C.muted, alignSelf: "center" }}>only</span>}
          <span style={{ color: C.muted, fontWeight: 800, fontSize: 14, marginLeft: 2 }}>{open ? "⌄" : "›"}</span>
        </span>
      </div>
      {open && sorted.map(r => <YearDetail key={r.id} rec={r} tint={yearColor(r.year)} onZoom={onZoom} onSaveNote={onSaveNote} />)}
    </div>
  );
}

// Full-screen photo viewer with swipe / arrows for the size reference.
function RefLightbox({ photos, index, onClose, onIndex }) {
  const tx = { start: 0 };
  const go = d => onIndex((index + d + photos.length) % photos.length);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 10000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 14, right: 18, color: "#fff", fontSize: 30, cursor: "pointer", lineHeight: 1 }}>×</div>
      <div style={{ position: "absolute", top: 18, left: 18, color: "#cfe3c0", fontSize: 13, fontWeight: 800 }}>{index + 1} / {photos.length}</div>
      <img src={photos[index].url} alt="" onClick={e => e.stopPropagation()}
        onTouchStart={e => { tx.start = e.touches[0].clientX; }}
        onTouchEnd={e => { const dx = e.changedTouches[0].clientX - tx.start; if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1); }}
        style={{ maxWidth: "94vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 8 }} />
      {photos.length > 1 && <>
        <div onClick={e => { e.stopPropagation(); go(-1); }} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#fff", fontSize: 40, cursor: "pointer", padding: 10, userSelect: "none" }}>‹</div>
        <div onClick={e => { e.stopPropagation(); go(1); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#fff", fontSize: 40, cursor: "pointer", padding: 10, userSelect: "none" }}>›</div>
      </>}
    </div>
  );
}

// ── Growth curve: pick a variety, overlay seasons, mark the growth-regulator application ──
const YEAR_PALETTE = ["#2e7d32", "#e89a3a", "#4a90d9", "#8e5aa8", "#d94f3d", "#0f9d8f"];
// application → color, matching the grower's color-coded Heights sheet legend
const APP_COLOR = {
  "1500 CCC/Altercel": "#d4b100", "1500 CCC + 1250 B9": "#00b3c6",
  "2000 CCC/Altercel": "#ff9900", "2000 CCC + 1250 B9": "#e06666",
  "Piccolo drench 0.1ppm": "#6aa84f", "Fascination 2ppm": "#9aa0a6",
};
const appColorFor = lbl => APP_COLOR[lbl] || "#8e5aa8";
const shortLoc = l => String(l || "").replace(/\s*House/i, "").replace(/:\s*/, " ").replace(/\s*side/i, "").trim() || "—";
const LINE_DASH = ["", "7 4", "2 3", "9 4 2 4"];
function GrowthChart({ refs }) {
  const varieties = [...new Set(refs.map(r => r.variety).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [variety, setVariety] = useState("");
  const [off, setOff] = useState({});   // seriesKey -> true when hidden
  useEffect(() => { if (varieties.length && !varieties.includes(variety)) setVariety(varieties[0]); }, [varieties, variety]);
  useEffect(() => { setOff({}); }, [variety]);   // show all lines when variety changes

  const allYears = [...new Set(refs.map(r => String(r.year)))].sort();
  const colorForYear = y => YEAR_PALETTE[allYears.indexOf(String(y)) % YEAR_PALETTE.length];

  const forVar = refs.filter(r => r.variety === variety);
  const multiLoc = new Set(forVar.map(r => r.location || "")).size > 1;
  // one series per (season × greenhouse); color = year, dash distinguishes houses within a year
  const dashIx = {};
  const all = forVar.map(r => {
    const year = String(r.year), location = r.location || "";
    dashIx[year] = dashIx[year] || {}; if (!(location in dashIx[year])) dashIx[year][location] = Object.keys(dashIx[year]).length;
    return { key: year + "·" + location, year, location, apps: r.applications || {},
      points: Object.entries(r.heights || {}).map(([k, v]) => [+String(k).replace(/\D/g, ""), +v]).filter(([w, h]) => w && !isNaN(h)).sort((a, b) => a[0] - b[0]) };
  }).filter(s => s.points.length).sort((a, b) => b.year.localeCompare(a.year) || a.location.localeCompare(b.location)); // most recent season first
  all.forEach(s => { s.color = colorForYear(s.year); s.dash = LINE_DASH[dashIx[s.year][s.location] % LINE_DASH.length]; s.label = s.year + (multiLoc ? " · " + shortLoc(s.location) : ""); });
  const series = all.filter(s => !off[s.key]);

  const allW = series.flatMap(s => s.points.map(p => p[0]));
  const allH = series.flatMap(s => s.points.map(p => p[1]));
  const wkMin = allW.length ? Math.min(...allW) : 32, wkMax = allW.length ? Math.max(...allW) : 46;
  const yMax = Math.max(10, Math.ceil((allH.length ? Math.max(...allH) : 10) / 5) * 5);
  const W = 700, padL = 54, padR = 16, padT = 14, plotH = 200;
  const plotW = W - padL - padR, axisY = padT + plotH;
  const laneRows = series.filter(s => Object.keys(s.apps).length);
  const laneH = 17, bandTop = axisY + 30;
  const H = bandTop + Math.max(laneRows.length, 1) * laneH + 4;
  const xFor = w => padL + (wkMax === wkMin ? plotW / 2 : ((w - wkMin) / (wkMax - wkMin)) * plotW);
  const yFor = h => padT + plotH - (h / yMax) * plotH;
  const yTicks = []; for (let t = 0; t <= yMax; t += 5) yTicks.push(t);
  const weeks = []; for (let w = wkMin; w <= wkMax; w++) weeks.push(w);
  const appTypes = [...new Set(series.flatMap(s => Object.values(s.apps)))];
  const laneLabel = s => "'" + s.year.slice(2) + (multiLoc ? " " + shortLoc(s.location).slice(0, 4) : "");

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <select value={variety} onChange={e => setVariety(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14.5, fontWeight: 800, color: C.dark, background: "#fff", fontFamily: "inherit" }}>
          {varieties.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Show:</span>
          {all.map(s => {
            const on = !off[s.key];
            return <button key={s.key} onClick={() => setOff(o => ({ ...o, [s.key]: on }))}
              style={{ display: "flex", alignItems: "center", gap: 6, border: `1.5px solid ${on ? s.color : C.border}`, background: on ? s.color : "#fff", color: on ? "#fff" : C.muted, borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={on ? "#fff" : s.color} strokeWidth="2.4" strokeDasharray={s.dash} /></svg>{s.label}</button>;
          })}
        </div>
      </div>

      {series.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, padding: "24px 0", textAlign: "center" }}>No height data for the selected lines.</div>
      ) : (
        <div style={{ overflowX: "auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 4px" }}>
          <svg width={W} height={H} style={{ display: "block" }}>
            {/* faint week gridlines spanning the plot + treatment band so treatments line up under the curves */}
            {weeks.map(w => <line key={"g" + w} x1={xFor(w)} y1={padT} x2={xFor(w)} y2={bandTop + laneRows.length * laneH} stroke="#f3f6ef" strokeWidth={1} />)}
            {yTicks.map(t => (
              <g key={t}>
                <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke={t === 0 ? C.muted : "#eef2ea"} strokeWidth={1} />
                <text x={padL - 6} y={yFor(t) + 3.5} textAnchor="end" fontSize="10" fill={C.muted}>{t}″</text>
              </g>
            ))}
            {weeks.map(w => <text key={w} x={xFor(w)} y={axisY + 13} textAnchor="middle" fontSize="9" fill={C.muted}>{w}</text>)}
            <text x={padL - 6} y={axisY + 13} textAnchor="end" fontSize="8.5" fill={C.muted}>wk</text>
            {/* clean height curves */}
            {series.map(s => (
              <g key={s.key}>
                <polyline fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round"
                  points={s.points.map(([w, h]) => `${xFor(w)},${yFor(h)}`).join(" ")} />
                {s.points.map(([w, h], i) => <circle key={i} cx={xFor(w)} cy={yFor(h)} r={2} fill={s.color} />)}
              </g>
            ))}
            {/* treatments — one lane per season, newest on top; each dot's fill = the chemical */}
            {laneRows.length > 0 && <text x={padL - 6} y={axisY + 26} textAnchor="end" fontSize="8.5" fontWeight="800" fill={C.muted}>Rx</text>}
            {laneRows.map((s, li) => {
              const y = bandTop + li * laneH + laneH / 2;
              return (
                <g key={s.key}>
                  <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={s.color} strokeWidth={1} opacity={0.25} />
                  <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="9.5" fontWeight="800" fill={s.color}>{laneLabel(s)}</text>
                  {Object.entries(s.apps).map(([wk, label]) => {
                    const w = +String(wk).replace(/\D/g, "");
                    return <circle key={wk} cx={xFor(w)} cy={y} r={4.2} fill={appColorFor(label)} stroke={s.color} strokeWidth={1.5}><title>{`${s.label} · WK${w} · ${label}`}</title></circle>;
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* legend: lines (season × house) + application-dot colors */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        {all.filter(s => !off[s.key]).map(s => (
          <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: C.dark }}>
            <svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="2.4" strokeDasharray={s.dash} /></svg>{s.label}</span>
        ))}
      </div>
      {appTypes.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4 }}>Treatment ●</span>
          {appTypes.map(lbl => (
            <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#3a2e42" }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: appColorFor(lbl), border: "1.5px solid #888" }} />{lbl}
            </span>
          ))}
        </div>
      )}
      {/* application timeline grouped by line (season · house) */}
      {series.some(s => Object.keys(s.apps).length) && (
        <div style={{ marginTop: 10, background: "#faf7fc", border: `1px solid #ece2f2`, borderRadius: 10, padding: "9px 12px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.plum, textTransform: "uppercase", letterSpacing: .4, marginBottom: 4 }}>Applications, week by week</div>
          {series.filter(s => Object.keys(s.apps).length).map(s => (
            <div key={s.key} style={{ marginTop: 4 }}>
              <span style={{ fontWeight: 800, color: s.color, fontSize: 12 }}>{s.label}:</span>{" "}
              {Object.entries(s.apps).sort((a, b) => +a[0].replace(/\D/g, "") - +b[0].replace(/\D/g, "")).map(([wk, label], i) => (
                <span key={wk} style={{ fontSize: 12, color: "#3a2e42" }}>{i ? " · " : " "}WK{wk.replace(/\D/g, "")} <span style={{ color: appColorFor(label) }}>●</span></span>
              ))}
            </div>
          ))}
        </div>
      )}
      {forVar[0] && (forVar[0].drench_rate || forVar[0].notes) && (
        <div style={{ fontSize: 12, color: "#4a5a44", marginTop: 8, lineHeight: 1.45, ...wrap }}>
          {forVar[0].drench_rate && <span style={{ fontWeight: 800 }}>Drench {forVar[0].drench_rate}. </span>}
          {forVar[0].notes && <>📝 {forVar[0].notes}</>}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.4 }}>
        Top: weekly-height lines, one per season × greenhouse (newest first). Below the week axis, the <strong>Rx band</strong> gives each season its own row of <strong>treatment dots</strong> — lined up under the weeks, colored by chemical. Tap a chip to show/hide a line.
      </div>
    </div>
  );
}

export default function TreatmentPlan({ onBack, onGoToGrowing, responsesOnly = false }) {
  const sb = getSupabase();
  const [crop, setCrop] = useState("Mum");
  const [crops, setCrops] = useState(["Mum"]);
  const [recs, setRecs] = useState([]);
  const [busy, setBusy] = useState("");
  // record id -> [{ id, variety, status, completedAt, completedBy }] — one Growing task PER VARIETY (PGRs)
  // or a single "(all)" task (fertilizer / broad applications, by location).
  const [tasks, setTasks] = useState({});
  const [sel, setSel] = useState(null);   // record whose detail window is open
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState(responsesOnly ? "responses" : "plan"); // plan | responses | reference
  const [refs, setRefs] = useState([]);          // variety_reference rows for this crop
  const [refZoom, setRefZoom] = useState(null);  // { photos, i }
  const thisYear = new Date().getFullYear();

  const targetDefault = rec => `${thisYear}-${String(rec.rec_date).slice(5)}`; // same day, this year
  const toTask = (rec, id, td, variety) => { const wi = isoWeek(td); return { id, title: mkTitle(rec, variety), description: mkDesc(rec, variety), category: "growing", status: "pending", priority: 10, week_number: wi.week, year: wi.year, target_date: td, bucket: null, carried_over: false, created_by: `${crop} Plan`, location: rec.location || null, assignees: [], photos: [], source_record_id: rec.id, source_variety: isAll(variety) ? null : variety, source_kind: "treatment" }; };
  // old (pre-per-variety) title, for linking tasks created before this change
  const oldTitle = rec => (["🌼", rec.application, rec.rates].filter(Boolean).join(" ") + (rec.crop_detail ? ` — ${rec.crop_detail}` : "")).trim();
  const listOf = id => tasks[id] || [];
  const doneN = id => listOf(id).filter(t => t.status === "completed").length;

  // Loop-back: when the crew completes a converted task with photos, copy those plant-size photos back
  // onto the treatment record (task-photos is private → physically copy into the public treatment-photos
  // bucket) so next year's plan shows how big the plants actually were. Idempotent via srcPath.
  async function pullTaskPhotos(list, tasksArr, recIdOf) {
    const recById = {}; list.forEach(r => { recById[r.id] = { ...r, photos: r.photos || [] }; });
    for (const t of tasksArr) {
      const rid = recIdOf(t);
      if (rid == null || t.status !== "completed" || !(t.photos || []).length) continue;
      const rec = recById[rid]; if (!rec) continue;
      const isResp = t.source_kind === "response"; // response-check task → dated Response photos
      const respDate = isResp ? String(t.completed_at || "").slice(0, 10) : null;
      const have = new Set((rec.photos || []).map(p => p.srcPath).filter(Boolean));
      const toAdd = [];
      for (const ph of t.photos) {
        if (typeof ph !== "string" || have.has(ph)) continue;
        let url = null;
        if (ph.startsWith("http") || ph.startsWith("data:")) url = ph;
        else {
          try {
            const { data: blob } = await sb.storage.from("task-photos").download(ph);
            if (blob) {
              const path = `${rec.id}/fromtask-${uid()}.jpg`;
              const { error } = await sb.storage.from("treatment-photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
              if (!error) url = sb.storage.from("treatment-photos").getPublicUrl(path).data.publicUrl;
            }
          } catch { /* skip this photo */ }
        }
        // response-check photos → kind:"response" + date; treatment photos → size photo tagged by variety
        if (url) toAdd.push({ id: uid(), url, capturedAt: Date.now(), fromTask: true, srcPath: ph, variety: t.source_variety || null, ...(isResp ? { kind: "response", date: respDate || undefined } : {}) });
      }
      if (toAdd.length) {
        const next = [...(rec.photos || []), ...toAdd];
        await sb.from("treatment_records").update({ photos: next }).eq("id", rec.id);
        recById[rid] = { ...rec, photos: next }; // accumulate across a record's per-variety tasks
        setRecs(prev => prev.map(r => r.id === rid ? { ...r, photos: next } : r));
      }
    }
  }

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: cr } = await sb.from("treatment_records").select("crop");
    setCrops([...new Set((cr || []).map(r => r.crop))].sort());
    const { data } = await sb.from("treatment_records").select("*").eq("crop", crop).order("rec_date");
    const list = data || []; setRecs(list);
    // link each record to its scheduled tasks — for ✓/undo state + completion status + loop-back
    const { data: existing } = await sb.from("manager_tasks").select("id,title,status,completed_at,completed_by,photos,target_date,source_record_id,source_variety,source_kind").eq("created_by", `${crop} Plan`);
    const byOldTitle = {}; list.forEach(r => { byOldTitle[oldTitle(r)] = r.id; }); // legacy fallback
    const recIdOf = t => t.source_record_id != null ? t.source_record_id : (byOldTitle[t.title] ?? null);
    const byRec = {};
    // scheduling map = TREATMENT tasks only; response-check tasks (source_kind='response') just feed loop-back
    (existing || []).forEach(t => { if (t.source_kind === "response") return; const rid = recIdOf(t); if (rid == null) return; (byRec[rid] = byRec[rid] || []).push({ id: t.id, variety: t.source_variety, status: t.status, completedAt: t.completed_at, completedBy: t.completed_by, targetDate: t.target_date }); });
    setTasks(byRec);
    pullTaskPhotos(list, existing || [], recIdOf); // copy back any completed-task photos (fire-and-forget)
  }, [sb, crop]); // pullTaskPhotos intentionally not a dep
  useEffect(() => { load(); }, [load]);
  useEffect(() => { let ok = true; (async () => { const { data } = await sb.from("variety_reference").select("*").eq("crop", crop).order("sort"); if (ok) setRefs(data || []); })(); return () => { ok = false; }; }, [sb, crop]);

  const lastYear = recs.length ? Math.max(...recs.map(r => +String(r.rec_date).slice(0, 4) || 0)) : thisYear - 1;

  async function convert(rec, td) {
    if (!rec.rec_date || listOf(rec.id).length) return false;
    const rows = varsOf(rec).map(v => toTask(rec, uid(), td || targetDefault(rec), v));
    setBusy(rec.id);
    const { error } = await sb.from("manager_tasks").insert(rows);
    setBusy("");
    if (error) { window.alert("Couldn't create task: " + error.message); return false; }
    setTasks(t => ({ ...t, [rec.id]: rows.map(r => ({ id: r.id, variety: r.source_variety, status: "pending", targetDate: r.target_date })) }));
    return true;
  }
  async function undo(rec) {
    const list = listOf(rec.id); if (!list.length) return;
    setBusy(rec.id);
    await sb.from("manager_tasks").delete().in("id", list.map(t => t.id));
    setBusy("");
    setTasks(t => { const n = { ...t }; delete n[rec.id]; return n; });
  }
  const setRecPhotos = (id, ph) => { setRecs(prev => prev.map(r => r.id === id ? { ...r, photos: ph } : r)); setSel(prev => prev && prev.id === id ? { ...prev, photos: ph } : prev); };

  // Response photos: dated shots of how the plants responded AFTER the treatment. Compressed
  // client-side (fast) → public treatment-photos bucket → stored on the record tagged kind:"response".
  async function addResponsePhotos(rec, variety, date, files) {
    const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith("image/"));
    if (!list.length) return;
    const vkey = isAll(variety) ? null : variety; // tag to the specific variety
    let photos = rec.photos || [];
    for (const f of list) {
      const id = uid();
      const blob = await compressImage(f); // <-- compression happens here
      const path = `${rec.id}/response-${id}.jpg`;
      const { error } = await sb.storage.from("treatment-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
      if (error) { window.alert("Upload failed: " + error.message); continue; }
      const url = sb.storage.from("treatment-photos").getPublicUrl(path).data.publicUrl;
      photos = [...photos, { id, url, kind: "response", date, variety: vkey, capturedAt: Date.now() }];
    }
    const { error } = await sb.from("treatment_records").update({ photos }).eq("id", rec.id);
    if (error) { window.alert("Couldn't save: " + error.message); return; }
    setRecPhotos(rec.id, photos);
  }
  async function delResponsePhoto(rec, pid) {
    const photos = (rec.photos || []).filter(p => p.id !== pid);
    await sb.from("treatment_records").update({ photos }).eq("id", rec.id);
    setRecPhotos(rec.id, photos);
  }
  // Keep a scheduled treatment's per-variety tasks in sync with its variety lines when they change AFTER
  // scheduling: add a task for a new variety, delete a removed one, and (single add+remove) treat it as a
  // rename — moving the task's variety + retagging its photos so the loop-back still lands on the right line.
  async function reconcile(rec) {
    const existing = listOf(rec.id);
    if (!existing.length) return; // not scheduled → nothing to reconcile
    const want = varsOf(rec).map(v => isAll(v) ? null : v); // desired variety keys (null = broad/location task)
    const wantSet = new Set(want), haveSet = new Set(existing.map(t => t.variety));
    const toAddKeys = want.filter(k => !haveSet.has(k));
    const toRemove = existing.filter(t => !wantSet.has(t.variety));
    const td = existing[0].targetDate || targetDefault(rec);
    const retag = (map) => { const ph = (rec.photos || []).map(map); if (JSON.stringify(ph) !== JSON.stringify(rec.photos || [])) { sb.from("treatment_records").update({ photos: ph }).eq("id", rec.id).then(() => setRecPhotos(rec.id, ph)); } };

    if (toAddKeys.length === 1 && toRemove.length === 1) {          // RENAME
      const from = toRemove[0], toKey = toAddKeys[0];
      await sb.from("manager_tasks").update({ source_variety: toKey, title: mkTitle(rec, toKey ?? "(all)"), description: mkDesc(rec, toKey ?? "(all)"), location: rec.location || null }).eq("id", from.id);
      retag(p => p.variety === from.variety ? { ...p, variety: toKey } : p);
      setTasks(t => ({ ...t, [rec.id]: existing.map(x => x.id === from.id ? { ...x, variety: toKey } : x) }));
    } else {                                                        // ADD / REMOVE
      if (toRemove.length) {
        await sb.from("manager_tasks").delete().in("id", toRemove.map(t => t.id));
        const rm = new Set(toRemove.map(t => t.variety).filter(Boolean));
        if (rm.size) retag(p => rm.has(p.variety) ? { ...p, variety: null } : p); // keep orphaned photos → General
      }
      let addedRows = [];
      if (toAddKeys.length) { addedRows = toAddKeys.map(k => toTask(rec, uid(), td, k ?? "(all)")); await sb.from("manager_tasks").insert(addedRows); }
      setTasks(t => {
        const survivors = existing.filter(x => wantSet.has(x.variety));
        const news = addedRows.map(r => ({ id: r.id, variety: r.source_variety, status: "pending", targetDate: r.target_date }));
        return { ...t, [rec.id]: [...survivors, ...news] };
      });
    }
    // re-sync title/desc/location on every kept task (covers application/rate/location edits)
    const survivors = existing.filter(x => wantSet.has(x.variety) || (toAddKeys.length === 1 && toRemove.length === 1));
    for (const vt of survivors) { const v = wantSet.has(vt.variety) ? vt.variety : (toAddKeys[0] ?? null); await sb.from("manager_tasks").update({ title: mkTitle(rec, v ?? "(all)"), description: mkDesc(rec, v ?? "(all)"), location: rec.location || null }).eq("id", vt.id); }
  }
  async function copyAll() {
    const pending = recs.filter(r => r.rec_date && !listOf(r.id).length);
    if (!pending.length) { window.alert("All treatments are already added to " + thisYear + "."); return; }
    const rows = [], local = {};
    pending.forEach(r => { const td = targetDefault(r); const made = varsOf(r).map(v => { const id = uid(); rows.push(toTask(r, id, td, v)); return { id, variety: isAll(v) ? null : v, status: "pending", targetDate: td }; }); local[r.id] = made; });
    if (!window.confirm(`Create ${rows.length} ${crop} tasks in ${thisYear} (same dates as last year — Piccolo split per variety, fertilizer by location; adjust each in Growing or here)? `)) return;
    setBusy("all");
    const { error } = await sb.from("manager_tasks").insert(rows);
    setBusy("");
    if (error) { window.alert("Copy failed: " + error.message); return; }
    setTasks(t => ({ ...t, ...local }));
    window.alert(`Created ${rows.length} tasks in ${thisYear}. They're in Growing — adjust dates/notes as needed.`);
  }

  // "around now last year" — records dated within the next ~12 days (and 3 back) by month/day
  const now = new Date();
  const soon = recs.filter(r => { if (!r.rec_date) return false; const d = new Date(`${thisYear}-${String(r.rec_date).slice(5)}T12:00:00`); const diff = (d - now) / 86400000; return diff >= -3 && diff <= 12; })
    .sort((a, b) => a.rec_date.slice(5).localeCompare(b.rec_date.slice(5)));
  const byMonth = {};
  recs.forEach(r => { if (!r.rec_date) return; (byMonth[monthOf(r.rec_date)] = byMonth[monthOf(r.rec_date)] || []).push(r); });
  // completed treatments (≥1 completed task) → the Responses view, newest completion first
  const lastDoneOf = id => listOf(id).filter(t => t.status === "completed").map(t => t.completedAt).filter(Boolean).sort().pop() || "";
  const completedRecs = recs.filter(r => doneN(r.id) > 0).sort((a, b) => lastDoneOf(b.id).localeCompare(lastDoneOf(a.id)));

  const Row = ({ r }) => {
    const list = listOf(r.id);
    const total = list.length, dN = doneN(r.id);
    const scheduled = total > 0, allDone = scheduled && dN === total;
    const lastDone = list.filter(t => t.completedAt).map(t => t.completedAt).sort().pop();
    const pv = perVariety(r);
    return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 4px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 52, textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, color: C.dark, fontSize: 13 }}>{fmtDate(r.rec_date)}</div>
        <div style={{ fontSize: 9, color: C.muted }}>'{String(r.rec_date).slice(2, 4)}</div>
      </div>
      <div onClick={() => setSel(r)} style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {r.application && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: appColor(r.application), borderRadius: 7, padding: "2px 9px", ...wrap }}>{r.application}{r.rates ? ` · ${r.rates}` : ""}</span>}
            {pv && <span style={{ fontSize: 9.5, fontWeight: 800, color: C.plum, background: "#f5eefa", border: `1px solid ${C.plum}`, borderRadius: 7, padding: "1px 6px" }}>{splitVars(r.crop_detail).length} varieties</span>}
            {allDone && <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#3a7d2c", borderRadius: 7, padding: "2px 8px" }}>✓ DONE{lastDone ? ` ${fmtDate(String(lastDone).slice(0, 10))}` : ""}</span>}
            {scheduled && !allDone && dN > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: "#2e5c1e", background: "#eef6e7", borderRadius: 7, padding: "2px 8px" }}>{dN}/{total} done</span>}
            {(r.photos || []).length > 0 && <span style={{ fontSize: 10.5, color: C.plum, fontWeight: 700 }}>📷 {(r.photos || []).length}</span>}
          </div>
          {r.crop_detail && <div style={{ fontSize: 12.5, color: C.dark, marginTop: 3, ...wrap, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.crop_detail}</div>}
        </div>
      </div>
      <button onClick={() => setSel(r)} title="Open — edit, photos, notes, schedule"
        style={{ border: `1.5px solid ${C.plum}`, background: "#f5eefa", color: C.plum, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
        Open ›
      </button>
      <button onClick={() => (scheduled ? setSel(r) : convert(r))} disabled={busy === r.id}
        style={{ border: allDone ? "none" : scheduled ? `1.5px solid ${C.light}` : "none", background: allDone ? "#3a7d2c" : scheduled ? "#eef6e7" : C.light, color: allDone ? "#fff" : scheduled ? "#2e5c1e" : "#fff", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
        {busy === r.id ? "…" : allDone ? "✓ done" : scheduled ? (total > 1 ? `✓ ${dN}/${total}` : "✓ added") : `➕ ${thisYear}`}
      </button>
    </div>
  ); };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <div style={{ background: C.dark, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
        <div style={{ color: "#c8e6b8", fontWeight: 800, fontSize: 16 }}>🌼 {responsesOnly ? "Treatment Responses" : "Treatment Plan"}</div>
        <div style={{ color: "#7a9a6a", fontSize: 11 }}>{responsesOnly ? "add response photos" : "last year → this year's tasks"}</div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {crops.map(c => <button key={c} onClick={() => setCrop(c)} style={{ border: `1.5px solid ${crop === c ? C.light : C.border}`, background: crop === c ? C.light : "#fff", color: crop === c ? "#fff" : C.dark, borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>)}
        </div>

        {(!responsesOnly || refs.length > 0) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[...(responsesOnly ? [] : [["plan", "🌼 Plan"]]), ["responses", "📸 Responses"], ...(refs.length ? [["reference", "📏 Sizes"], ["growth", "📈 Growth"]] : [])].map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} style={{ flex: 1, background: view === id ? C.dark : "#fff", color: view === id ? "#c8e6b8" : C.muted, border: `1.5px solid ${view === id ? C.dark : C.border}`, borderRadius: 10, padding: "9px 8px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{label}{id === "responses" && completedRecs.length > 0 ? ` (${completedRecs.length})` : ""}{id === "reference" ? ` (${refs.length})` : ""}</button>
            ))}
          </div>
        )}

        {view === "plan" && !responsesOnly && (<>
        <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
          Your <strong>{crop} {lastYear}</strong> records ({recs.length}). Tap a treatment or its <strong style={{ color: C.plum }}>Open ›</strong> button to open the window — edit varieties, add a <strong>plant-size photo</strong> + notes, set the date, and create this year's <strong>Growing</strong> task. <strong>➕ {thisYear}</strong> quick-adds at the same date.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={copyAll} disabled={busy === "all" || !recs.length} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy === "all" ? "Creating…" : `📋 Copy whole plan → ${thisYear}`}</button>
          <button onClick={() => setLogOpen(true)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ Log a treatment</button>
          <button onClick={() => setHelpOpen(true)} style={{ background: "#fff", color: C.plum, border: `1.5px solid ${C.plum}`, borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>❓ How it works</button>
        </div>

        {soon.length > 0 && (
          <div style={{ background: C.card, border: `2px solid ${C.light}`, borderRadius: 12, padding: "10px 14px 12px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>📅 Around now, last year</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>What you did on {crop} this time in {lastYear} — tap to schedule for {thisYear}.</div>
            {soon.map(r => <Row key={r.id} r={r} />)}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .6, margin: "6px 0 4px" }}>Full {lastYear} plan</div>
        {Object.entries(byMonth).map(([m, rows]) => (
          <div key={m} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 14px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, padding: "2px 0 4px" }}>{m}</div>
            {rows.map(r => <Row key={r.id} r={r} />)}
          </div>
        ))}
        {recs.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>No {crop} records yet.</div>}
        </>)}

        {view === "responses" && (<>
          <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
            Treatments you've <strong>completed</strong> show up here. Add <strong>dated response photos</strong> over the next days/weeks to record how the {crop.toLowerCase()}s responded — it builds the picture for next year.
          </div>
          {completedRecs.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 13, padding: "30px 0", textAlign: "center" }}>No completed {crop} treatments yet.<div style={{ fontSize: 11.5, marginTop: 4 }}>Mark a treatment task done in Growing and it appears here.</div></div>
          ) : completedRecs.map(r => {
            const done = listOf(r.id).filter(t => t.status === "completed");
            const last = done.map(t => t.completedAt).filter(Boolean).sort().pop();
            const by = (done.find(t => t.completedAt === last) || {}).completedBy;
            // the varieties actually treated (from this record's treatment tasks) — track each separately
            const vars = [...new Set(listOf(r.id).map(t => t.variety))];
            return <ResponseCard key={r.id} rec={r} varieties={vars.length ? vars : [null]} doneAt={last} doneBy={by} onAdd={(variety, d, files) => addResponsePhotos(r, variety, d, files)} onDel={(pid) => delResponsePhoto(r, pid)} />;
          })}
        </>)}

        {view === "reference" && (() => {
          const refYears = [...new Set(refs.map(r => String(r.year)))].sort();
          const yearColor = y => YEAR_PALETTE[refYears.indexOf(String(y)) % YEAR_PALETTE.length];
          const saveRefNote = async (id, notes) => { await sb.from("variety_reference").update({ notes }).eq("id", id); setRefs(rs => rs.map(r => r.id === id ? { ...r, notes } : r)); };
          const byVar = {}; refs.forEach(r => { (byVar[r.variety] = byVar[r.variety] || []).push(r); });
          const groups = Object.keys(byVar).sort((a, b) => a.localeCompare(b));
          return (<>
            <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
              How the <strong>{crop.toLowerCase()}s</strong> sized up, variety by variety. Each row shows which <strong>seasons</strong> you grew it (the year badges). <strong>Tap a variety to drill in</strong> — see each season &amp; greenhouse, the weekly heights, treatments, photos, and <strong>add your own notes</strong>. Tap a photo to enlarge.
            </div>
            {groups.map(v => (
              <VarietyGroup key={v} variety={v} rows={byVar[v]} yearColor={yearColor} onZoom={(photos, i) => setRefZoom({ photos, i })} onSaveNote={saveRefNote} />
            ))}
          </>);
        })()}

        {view === "growth" && (<>
          <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
            Pick a variety to see its <strong>height growth over the season</strong>, with the <strong>growth-regulator (CCC / Piccolo) application marked</strong>. Turn seasons on/off to compare years and spot the pattern.
          </div>
          <GrowthChart refs={refs} />
        </>)}
      </div>

      {sel && <DetailModal sb={sb} rec={sel} thisYear={thisYear} defaultDate={targetDefault(sel)} varTasks={listOf(sel.id)}
        onConvert={(td) => convert(sel, td)} onUndo={() => undo(sel)} onReconcile={(r) => reconcile(r)} onChanged={async () => { await load(); }} onSyncSel={r => setSel(r)} onClose={() => setSel(null)}
        onGoToGrowing={onGoToGrowing} />}
      {refZoom && <RefLightbox photos={refZoom.photos} index={refZoom.i} onClose={() => setRefZoom(null)} onIndex={i => setRefZoom({ ...refZoom, i })} />}
      {logOpen && <LogModal crop={crop} year={thisYear} sb={sb} onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); load(); }} />}
      {helpOpen && <HelpModal crop={crop} year={thisYear} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// How-it-works guide.
function HelpModal({ crop, year, onClose }) {
  const steps = [
    ["🌼", "It's last year's plan", `Every ${crop} treatment you did last season — Piccolo drenches, fertilizer step-downs, planting, netting — in order. Use it to do the same things again this year.`],
    ["👆", "Tap a treatment to open it", "See the full details, the varieties/sizes, location and rate. Nothing's cut off in the window."],
    ["📷", "A size photo per variety", "Piccolo (and other PGRs) are size-triggered and applied variety-by-variety. In the window there's a line for each variety with its own 📷; snap each one's size — that's your reference for next year. Use ＋ Add variety for more. Fertilizer and other broad sprays are one task by location, not per variety."],
    ["📝", "Add notes", "Jot anything for next time — it saves right onto the record."],
    ["➕", `Create this year's task(s)`, `Set the date (it defaults to the same day last year — change it to when the plants actually reach size) and create. A Piccolo treatment becomes one task per variety; fertilizer becomes a single task. They land in Growing tasks, where the crew sees them on their phones and uploads a size photo per variety as they do it.`],
    ["↩️", "Undo anytime", "A created treatment shows ✓ added. Open it and hit Undo to remove the task."],
    ["🔄", "It builds next year's plan by itself", "When the crew finishes the task in Growing and adds a photo of the plants, that plant-size photo automatically comes back onto this treatment record — so next year you'll see exactly how big they were when you treated, and the whole plan keeps improving."],
    ["📅", "Around now, last year", `At the top, the treatments from this point in the season last year — one tap to schedule.`],
    ["📋", "Copy the whole plan", `Create every task for ${year} at once, then adjust dates as the plants tell you.`],
    ["＋", "Log a treatment", "Record what you actually do this year — it becomes next year's plan, so it keeps improving."],
  ];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 20, width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "auto", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: C.dark }}>How the Treatment Plan works</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: C.muted, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>Do what you did last year, on the right dates — and keep the record.</div>
        {steps.map(([icon, title, body], i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 22, width: 30, textAlign: "center", flexShrink: 0 }}>{icon}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: C.dark }}>{title}</div>
              <div style={{ fontSize: 12.5, color: "#4a5a44", marginTop: 2, lineHeight: 1.45 }}>{body}</div>
            </div>
          </div>
        ))}
        <button onClick={onClose} style={{ width: "100%", marginTop: 14, background: C.dark, color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Got it</button>
      </div>
    </div>
  );
}

// Detail window — read the treatment, add plant-size photos + notes, set the date, create/undo the task.
function DetailModal({ sb, rec, thisYear, defaultDate, varTasks = [], onConvert, onUndo, onReconcile, onChanged, onSyncSel, onClose, onGoToGrowing }) {
  const init = () => ({ application: rec.application || "", rates: rec.rates || "", location: rec.location || "", notes: rec.notes || "" });
  const [meta, setMeta] = useState(init);
  const [lines, setLines] = useState(() => { const v = splitVars(rec.crop_detail); return v.length ? v : [""]; });
  const [date, setDate] = useState(defaultDate);
  const [uploading, setUploading] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  useEffect(() => { setMeta(init()); const v = splitVars(rec.crop_detail); setLines(v.length ? v : [""]); setFlash(""); }, [rec]);
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(""), 6000); return () => clearTimeout(id); }, [flash]);
  const scheduled = varTasks.length > 0;
  const total = varTasks.length, dN = varTasks.filter(t => t.status === "completed").length;
  const allDone = scheduled && dN === total;
  const lastDone = varTasks.filter(t => t.completedAt).map(t => t.completedAt).sort().pop();
  const lastBy = (varTasks.find(t => t.completedAt === lastDone) || {}).completedBy;
  const taskFor = key => varTasks.find(t => t.variety === key); // per-variety task lookup
  const pv = perVariety({ ...rec, ...meta, crop_detail: lines.map(s => s.trim()).filter(Boolean).join(", ") });
  const setM = (k, v) => setMeta(x => ({ ...x, [k]: v }));
  const setLine = (i, v) => setLines(a => a.map((x, j) => j === i ? v : x));
  const addLine = () => setLines(a => [...a, ""]);
  const cropDetail = lines.map(s => s.trim()).filter(Boolean).join(", ");
  const photos = rec.photos || [];
  const titlePreview = (["🌼", meta.application, meta.rates].filter(x => x && x.trim()).join(" ") + (cropDetail ? ` — ${cropDetail}` : "")).trim();

  async function addPhoto(file, variety) {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(variety || "__general__");
    try {
      const id = crypto.randomUUID();
      const blob = await compressImage(file); // shrink before upload → fast
      const path = `${rec.id}/${id}.jpg`;
      const { error } = await sb.storage.from("treatment-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
      if (!error) {
        const url = sb.storage.from("treatment-photos").getPublicUrl(path).data.publicUrl;
        const next = [...photos, { id, url, capturedAt: Date.now(), variety: variety || null }];
        await sb.from("treatment_records").update({ photos: next }).eq("id", rec.id);
        onSyncSel({ ...rec, photos: next }); onChanged();
      } else window.alert("Upload failed: " + error.message);
    } catch (e) { window.alert("Upload error"); }
    setUploading("");
  }
  async function delPhoto(pid) {
    const next = photos.filter(p => p.id !== pid);
    await sb.from("treatment_records").update({ photos: next }).eq("id", rec.id);
    onSyncSel({ ...rec, photos: next }); onChanged();
  }
  const removeLine = i => { const next = lines.filter((_, j) => j !== i); const nn = next.length ? next : [""]; setLines(nn); saveMeta(nn); };
  async function saveMeta(linesOverride) {
    const cd = (linesOverride || lines).map(s => s.trim()).filter(Boolean).join(", ");
    const clean = { application: meta.application.trim() || null, rates: meta.rates.trim() || null, crop_detail: cd || null, location: meta.location.trim() || null, notes: meta.notes.trim() || null };
    // If already scheduled, warn before an edit that would REMOVE or RENAME a Growing task (the risky ones).
    let addedVars = [];
    if (varTasks.length) {
      const want = varsOf(clean).map(v => isAll(v) ? null : v);
      const toRemove = varTasks.filter(t => !want.includes(t.variety));
      const toAdd = want.filter(k => !varTasks.some(t => t.variety === k));
      addedVars = toAdd.filter(Boolean); // newly-named varieties → will get their own Growing task
      if (toRemove.length) {
        const nm = k => (k == null || k === "(all)") ? "broad/location task" : `“${k}”`;
        const rename = toAdd.length === 1 && toRemove.length === 1;
        const doneN = toRemove.filter(t => t.status === "completed").length;
        const msg = rename
          ? `Rename ${nm(toRemove[0].variety)} → ${nm(toAdd[0])} on the scheduled Growing task?\n\nThe task and its size photo(s) move to the new name.${toRemove[0].status === "completed" ? "\n\n⚠️ That task is already marked DONE — it stays done under the new name." : ""}`
          : `This treatment is already scheduled in Growing.\n\nSaving will REMOVE ${toRemove.length} task${toRemove.length > 1 ? "s" : ""} (${toRemove.map(t => nm(t.variety)).join(", ")})${toAdd.length ? ` and add ${toAdd.length} (${toAdd.map(nm).join(", ")})` : ""}.\n\nPhotos on removed varieties move to “General / crew photos” (not deleted).${doneN ? `\n\n⚠️ ${doneN} of them ${doneN > 1 ? "are" : "is"} already marked DONE.` : ""}\n\nContinue?`;
        if (!window.confirm(msg)) { setMeta(init()); const v = splitVars(rec.crop_detail); setLines(v.length ? v : [""]); return; } // cancel → revert the edit
      }
    }
    await sb.from("treatment_records").update(clean).eq("id", rec.id);
    onSyncSel({ ...rec, ...clean });
    // if already scheduled, reconcile the per-variety tasks to the current lines (add/remove/rename + retag)
    if (varTasks.length) await onReconcile({ ...rec, ...clean });
    onChanged();
    if (addedVars.length) setFlash(`✓ Added ${addedVars.length > 1 ? `${addedVars.length} Growing tasks` : "a Growing task"} for ${addedVars.join(", ")} — set its date in Growing if it hits size on a different day.`);
  }
  async function doConvert() { setBusy(true); await onConvert(date); setBusy(false); }
  async function doUndo() { setBusy(true); await onUndo(); setBusy(false); }

  const lbl = { fontSize: 10.5, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, margin: "12px 0 4px" };
  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: `1.5px solid #c8d8c0`, borderRadius: 9, fontSize: 14, fontFamily: "inherit" };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.dark, ...wrap }}>{titlePreview || "Treatment"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, color: C.muted, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Last done {fmtDate(rec.rec_date)} '{String(rec.rec_date).slice(2, 4)}</div>
        {flash && <div style={{ marginTop: 8, background: "#eef6e7", border: `1px solid ${C.light}`, color: "#2e5c1e", borderRadius: 9, padding: "8px 11px", fontSize: 12.5, fontWeight: 700 }}>{flash}</div>}

        <div style={lbl}>Application & rate</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={meta.application} onChange={e => setM("application", e.target.value)} onBlur={() => saveMeta()} placeholder="Application (Piccolo…)" style={{ ...inp, flex: 2 }} />
          <input value={meta.rates} onChange={e => setM("rates", e.target.value)} onBlur={() => saveMeta()} placeholder="Rate (3ppm…)" style={{ ...inp, flex: 1 }} />
        </div>
        <div style={lbl}>Varieties treated <span style={{ fontWeight: 400, textTransform: "none" }}>· {pv ? "PGR — one task per variety, each gets its own size photo" : "broad application — one task by location"}</span></div>
        {(() => {
          const tile = p => (
            <div key={p.id} style={{ position: "relative", flexShrink: 0 }}>
              <img src={p.url} alt="" onClick={() => window.open(p.url, "_blank")} style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer" }} />
              {p.fromTask && <span style={{ position: "absolute", bottom: 2, left: 2, background: "rgba(30,45,26,.8)", color: "#c8e6b8", fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4 }}>CREW</span>}
              <button onClick={() => delPhoto(p.id)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,.55)", color: "#fff", border: "none", borderRadius: 11, width: 19, height: 19, fontSize: 12, cursor: "pointer" }}>×</button>
            </div>
          );
          return (<>
            {lines.map((v, i) => {
              const key = v.trim();
              const list = key ? photos.filter(p => p.variety === key) : [];
              return (
                <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={v} onChange={e => setLine(i, e.target.value)} onBlur={() => saveMeta()} placeholder={'Variety (e.g. 9" Nicki)'} style={{ ...inp, flex: 1 }} />
                    {pv && key && taskFor(key) && <span title={taskFor(key).status === "completed" ? "Crew completed this variety" : "Task scheduled — awaiting crew photo"} style={{ fontSize: 10, fontWeight: 800, color: taskFor(key).status === "completed" ? "#fff" : "#2e5c1e", background: taskFor(key).status === "completed" ? "#3a7d2c" : "#eef6e7", borderRadius: 7, padding: "3px 7px", flexShrink: 0 }}>{taskFor(key).status === "completed" ? "✓" : "•"}</span>}
                    <label title={key ? "Add a size photo" : "Name the variety first"} style={{ background: key ? "#f5eefa" : "#f0f0f0", border: `1.5px solid ${key ? C.plum : C.border}`, color: key ? C.plum : C.muted, borderRadius: 8, padding: "9px 12px", fontSize: 15, cursor: key ? "pointer" : "default", flexShrink: 0 }}>
                      {uploading === key && key ? "…" : "📷"}
                      <input type="file" accept="image/*" capture="environment" disabled={!key} style={{ display: "none" }} onChange={e => addPhoto(e.target.files[0], key)} />
                    </label>
                    {lines.length > 1 && <button onClick={() => removeLine(i)} title="Remove variety" style={{ background: "none", border: "none", color: "#d94f3d", fontSize: 20, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>×</button>}
                  </div>
                  {list.length > 0 && <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 7 }}>{list.map(tile)}</div>}
                </div>
              );
            })}
            <button onClick={addLine} style={{ background: "#fff", color: C.dark, border: `1.5px dashed ${C.light}`, borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>＋ Add variety{scheduled && pv ? " (creates its task)" : ""}</button>
            {photos.some(p => !p.variety) && (
              <div style={{ marginTop: 10 }}>
                <div style={lbl}>General / crew photos</div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                  {photos.filter(p => !p.variety).map(tile)}
                  <label style={{ width: 70, height: 70, border: `2px dashed #c8d8c0`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted, fontSize: 10, fontWeight: 700, background: "#fafcf8", flexShrink: 0 }}>
                    {uploading === "__general__" ? "…" : <><div style={{ fontSize: 18 }}>📷</div>Add</>}
                    <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => addPhoto(e.target.files[0], null)} />
                  </label>
                </div>
              </div>
            )}
          </>);
        })()}
        <input value={meta.location} onChange={e => setM("location", e.target.value)} onBlur={() => saveMeta()} placeholder="Location (West, North…)" style={{ ...inp, marginTop: 10 }} />

        <div style={lbl}>Notes</div>
        <textarea value={meta.notes} onChange={e => setM("notes", e.target.value)} onBlur={() => saveMeta()} rows={2} placeholder="Size at treatment, what to watch, tweaks for this year…" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />

        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 14, paddingTop: 12 }}>
          <div style={lbl}>Schedule this year's {pv ? "tasks" : "task"}</div>
          {!scheduled ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", flex: "1 1 150px" }} />
              <button onClick={doConvert} disabled={busy} style={{ background: C.light, color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "…" : `➕ Create ${varsOf({ ...rec, ...meta, crop_detail: cropDetail }).length} ${thisYear} task${pv ? "s" : ""}`}</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {allDone
                ? <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", background: "#3a7d2c", borderRadius: 8, padding: "8px 12px" }}>✓ Completed{lastDone ? ` ${fmtDate(String(lastDone).slice(0, 10))}` : ""}{lastBy ? ` · ${lastBy}` : ""}</span>
                : dN > 0
                  ? <span style={{ fontSize: 13, fontWeight: 800, color: "#2e5c1e", background: "#eef6e7", borderRadius: 8, padding: "8px 12px" }}>{dN} of {total} varieties done</span>
                  : <span style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e", background: "#eef6e7", borderRadius: 8, padding: "8px 12px" }}>✓ {total > 1 ? `${total} tasks` : "Task"} created</span>}
              {onGoToGrowing && <button onClick={onGoToGrowing} style={{ background: "#eaf1fb", color: "#2b6cb0", border: "1.5px solid #4a90d9", borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🌿 View in Growing ›</button>}
              <button onClick={doUndo} disabled={busy} style={{ background: "#fff", color: "#d94f3d", border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "…" : total > 1 ? "Undo all" : "Undo"}</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{pv ? `Piccolo is size-triggered — each variety is its own task so the crew photographs each one's size. ` : ""}Set the date to when the plants actually reach size — you can also tweak it later in Growing tasks.</div>
        </div>
      </div>
    </div>
  );
}

// Quick "log what we did" — records this year's treatment so it becomes next year's reference.
function LogModal({ crop, year, sb, onClose, onSaved }) {
  const [d, setD] = useState({ rec_date: new Date().toISOString().slice(0, 10), crop_detail: "", location: "", application: "", rates: "", notes: "" });
  const set = (k, v) => setD(x => ({ ...x, [k]: v }));
  const inp = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 14, fontFamily: "inherit", marginBottom: 10 };
  async function save() {
    if (!d.application && !d.crop_detail) { window.alert("Add at least a treatment or crop."); return; }
    await sb.from("treatment_records").insert({ crop, year, ...d, source: "logged", photos: [] });
    onSaved();
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 460 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", marginBottom: 12 }}>Log a {crop} treatment</div>
        <input type="date" value={d.rec_date} onChange={e => set("rec_date", e.target.value)} style={inp} />
        <input value={d.application} onChange={e => set("application", e.target.value)} placeholder="Application (Piccolo, Planted, Dropped to 150ppm…)" style={inp} />
        <input value={d.rates} onChange={e => set("rates", e.target.value)} placeholder="Rate (3ppm, 15oz/pot@1:50…)" style={inp} />
        <input value={d.crop_detail} onChange={e => set("crop_detail", e.target.value)} placeholder={`Which ${crop.toLowerCase()}s (varieties / sizes)`} style={inp} />
        <input value={d.location} onChange={e => set("location", e.target.value)} placeholder="Location (West, North, SE…)" style={inp} />
        <input value={d.notes} onChange={e => set("notes", e.target.value)} placeholder="Notes" style={inp} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Save record</button>
          <button onClick={onClose} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "13px 18px", fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
