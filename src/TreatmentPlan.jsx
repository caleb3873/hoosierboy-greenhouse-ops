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
const appColor = a => { const x = (a || "").toLowerCase(); return x.includes("piccolo") || x.includes("cleary") || x.includes("sprint") || x.includes("subdue") ? "#8e5aa8" : x.includes("plant") ? "#7fb069" : x.includes("ppm") || x.includes("fert") ? "#e89a3a" : x.includes("net") ? "#4a90d9" : "#7a8c74"; };
const C = { dark: "#1e2d1a", light: "#7fb069", muted: "#7a8c74", border: "#e0ead8", card: "#fff", plum: "#8e5aa8" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };

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

export default function TreatmentPlan({ onBack }) {
  const sb = getSupabase();
  const [crop, setCrop] = useState("Mum");
  const [crops, setCrops] = useState(["Mum"]);
  const [recs, setRecs] = useState([]);
  const [busy, setBusy] = useState("");
  const [added, setAdded] = useState({}); // record id -> created task id (persisted via title match)
  const [sel, setSel] = useState(null);   // record whose detail window is open
  const [logOpen, setLogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const thisYear = new Date().getFullYear();

  const targetDefault = rec => `${thisYear}-${String(rec.rec_date).slice(5)}`; // same day, this year
  const taskTitle = rec => (["🌼", rec.application, rec.rates].filter(Boolean).join(" ") + (rec.crop_detail ? ` — ${rec.crop_detail}` : "")).trim();
  const taskDesc = rec => [rec.crop_detail && `Crop: ${rec.crop_detail}`, rec.location && `Location: ${rec.location}`, rec.rates && `Rate: ${rec.rates}`, rec.notes && `Note: ${rec.notes}`, "📷 Take a photo of the plant size when treating."].filter(Boolean).join("\n");
  const toTask = (rec, id, td) => { const wi = isoWeek(td); return { id, title: taskTitle(rec), description: taskDesc(rec), category: "growing", status: "pending", priority: 10, week_number: wi.week, year: wi.year, target_date: td, bucket: null, carried_over: false, created_by: `${crop} Plan`, location: rec.location || null, assignees: [], photos: [] }; };

  // Loop-back: when the crew completes a converted task with photos, copy those plant-size photos back
  // onto the treatment record (task-photos is private → physically copy into the public treatment-photos
  // bucket) so next year's plan shows how big the plants actually were. Idempotent via srcPath.
  async function pullTaskPhotos(list, tasks) {
    const byTitle = {}; tasks.forEach(t => { byTitle[t.title] = t; });
    for (const rec of list) {
      const t = byTitle[taskTitle(rec)];
      if (!t || t.status !== "completed" || !(t.photos || []).length) continue;
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
        if (url) toAdd.push({ id: uid(), url, capturedAt: Date.now(), fromTask: true, srcPath: ph });
      }
      if (toAdd.length) {
        const next = [...(rec.photos || []), ...toAdd];
        await sb.from("treatment_records").update({ photos: next }).eq("id", rec.id);
        setRecs(prev => prev.map(r => r.id === rec.id ? { ...r, photos: next } : r));
      }
    }
  }

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: cr } = await sb.from("treatment_records").select("crop");
    setCrops([...new Set((cr || []).map(r => r.crop))].sort());
    const { data } = await sb.from("treatment_records").select("*").eq("crop", crop).order("rec_date");
    const list = data || []; setRecs(list);
    // detect which are already scheduled (so ✓/undo persist across reloads) — match by title
    const { data: existing } = await sb.from("manager_tasks").select("id,title,status,photos").eq("created_by", `${crop} Plan`);
    const idx = {}; (existing || []).forEach(t => { idx[t.title] = t.id; });
    const map = {}; list.forEach(r => { const id = idx[taskTitle(r)]; if (id) map[r.id] = id; }); setAdded(map);
    pullTaskPhotos(list, existing || []); // copy back any completed-task photos (fire-and-forget)
  }, [sb, crop]); // pullTaskPhotos intentionally not a dep
  useEffect(() => { load(); }, [load]);

  const lastYear = recs.length ? Math.max(...recs.map(r => +String(r.rec_date).slice(0, 4) || 0)) : thisYear - 1;

  async function convert(rec, td) {
    if (!rec.rec_date || added[rec.id]) return added[rec.id];
    const id = uid();
    setBusy(rec.id);
    const { error } = await sb.from("manager_tasks").insert(toTask(rec, id, td || targetDefault(rec)));
    setBusy("");
    if (error) { window.alert("Couldn't create task: " + error.message); return; }
    setAdded(a => ({ ...a, [rec.id]: id }));
    return id;
  }
  async function undo(rec) {
    const id = added[rec.id]; if (!id) return;
    setBusy(rec.id);
    await sb.from("manager_tasks").delete().eq("id", id);
    setBusy("");
    setAdded(a => { const n = { ...a }; delete n[rec.id]; return n; });
  }
  async function copyAll() {
    const pending = recs.filter(r => r.rec_date && !added[r.id]);
    if (!pending.length) { window.alert("All treatments are already added to " + thisYear + "."); return; }
    if (!window.confirm(`Create ${pending.length} ${crop} tasks in ${thisYear} (same dates as last year — adjust each in Growing or here)? `)) return;
    setBusy("all");
    const map = { ...added }; const rows = pending.map(r => { const id = uid(); map[r.id] = id; return toTask(r, id, targetDefault(r)); });
    const { error } = await sb.from("manager_tasks").insert(rows);
    setBusy("");
    if (error) { window.alert("Copy failed: " + error.message); return; }
    setAdded(map);
    window.alert(`Created ${rows.length} tasks in ${thisYear}. They're in Growing — adjust dates/notes as needed.`);
  }

  // "around now last year" — records dated within the next ~12 days (and 3 back) by month/day
  const now = new Date();
  const soon = recs.filter(r => { if (!r.rec_date) return false; const d = new Date(`${thisYear}-${String(r.rec_date).slice(5)}T12:00:00`); const diff = (d - now) / 86400000; return diff >= -3 && diff <= 12; })
    .sort((a, b) => a.rec_date.slice(5).localeCompare(b.rec_date.slice(5)));
  const byMonth = {};
  recs.forEach(r => { if (!r.rec_date) return; (byMonth[monthOf(r.rec_date)] = byMonth[monthOf(r.rec_date)] || []).push(r); });

  const Row = ({ r }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 4px", borderTop: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 52, textAlign: "center", flexShrink: 0 }}>
        <div style={{ fontWeight: 800, color: C.dark, fontSize: 13 }}>{fmtDate(r.rec_date)}</div>
        <div style={{ fontSize: 9, color: C.muted }}>'{String(r.rec_date).slice(2, 4)}</div>
      </div>
      <div onClick={() => setSel(r)} style={{ flex: 1, minWidth: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {r.application && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: appColor(r.application), borderRadius: 7, padding: "2px 9px", ...wrap }}>{r.application}{r.rates ? ` · ${r.rates}` : ""}</span>}
            {(r.photos || []).length > 0 && <span style={{ fontSize: 10.5, color: C.plum, fontWeight: 700 }}>📷 {(r.photos || []).length}</span>}
          </div>
          {r.crop_detail && <div style={{ fontSize: 12.5, color: C.dark, marginTop: 3, ...wrap, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.crop_detail}</div>}
        </div>
      </div>
      <button onClick={() => setSel(r)} title="Open — edit, photos, notes, schedule"
        style={{ border: `1.5px solid ${C.plum}`, background: "#f5eefa", color: C.plum, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
        Open ›
      </button>
      <button onClick={() => (added[r.id] ? setSel(r) : convert(r))} disabled={busy === r.id}
        style={{ border: added[r.id] ? `1.5px solid ${C.light}` : "none", background: added[r.id] ? "#eef6e7" : C.light, color: added[r.id] ? "#2e5c1e" : "#fff", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
        {busy === r.id ? "…" : added[r.id] ? "✓ added" : `➕ ${thisYear}`}
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <div style={{ background: C.dark, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
        <div style={{ color: "#c8e6b8", fontWeight: 800, fontSize: 16 }}>🌼 Treatment Plan</div>
        <div style={{ color: "#7a9a6a", fontSize: 11 }}>last year → this year's tasks</div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 14px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {crops.map(c => <button key={c} onClick={() => setCrop(c)} style={{ border: `1.5px solid ${crop === c ? C.light : C.border}`, background: crop === c ? C.light : "#fff", color: crop === c ? "#fff" : C.dark, borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>)}
        </div>

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
      </div>

      {sel && <DetailModal sb={sb} rec={sel} crop={crop} thisYear={thisYear} defaultDate={targetDefault(sel)} taskId={added[sel.id]}
        onConvert={(td) => convert(sel, td)} onUndo={() => undo(sel)} onChanged={async () => { await load(); }} onSyncSel={r => setSel(r)} onClose={() => setSel(null)} />}
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
    ["📷", "A size photo per variety", "It's a by-variety plan — one treatment can cover several varieties. In the window there's a line for each variety with its own 📷; snap each one's size (Piccolo is size-triggered, so this is your reference). Use ＋ Add variety for more. Add as many photos as you like — they upload fast, and the crew's photos on the task come back here automatically."],
    ["📝", "Add notes", "Jot anything for next time — it saves right onto the record."],
    ["➕", `Create this year's task`, `Set the date (it defaults to the same day last year — change it to when the plants actually reach size) and create the task. It lands in Growing tasks, where the crew sees it on their phones and can upload their own photos as they do it.`],
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
function DetailModal({ sb, rec, crop, thisYear, defaultDate, taskId, onConvert, onUndo, onChanged, onSyncSel, onClose }) {
  const splitVars = s => String(s || "").split(/[,;]/).map(x => x.trim()).filter(Boolean);
  const init = () => ({ application: rec.application || "", rates: rec.rates || "", location: rec.location || "", notes: rec.notes || "" });
  const [meta, setMeta] = useState(init);
  const [lines, setLines] = useState(() => { const v = splitVars(rec.crop_detail); return v.length ? v : [""]; });
  const [date, setDate] = useState(defaultDate);
  const [uploading, setUploading] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(!!taskId);
  useEffect(() => { setMeta(init()); const v = splitVars(rec.crop_detail); setLines(v.length ? v : [""]); setAdded(!!taskId); }, [rec, taskId]);
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
    await sb.from("treatment_records").update(clean).eq("id", rec.id);
    onSyncSel({ ...rec, ...clean }); onChanged();
    // keep the created task's title/detail in sync if this treatment is already scheduled
    if (taskId) {
      const m = { ...rec, ...clean };
      const title = (["🌼", m.application, m.rates].filter(x => x && String(x).trim()).join(" ") + (m.crop_detail ? ` — ${m.crop_detail}` : "")).trim();
      const desc = [m.crop_detail && `Crop: ${m.crop_detail}`, m.location && `Location: ${m.location}`, m.rates && `Rate: ${m.rates}`, m.notes && `Note: ${m.notes}`, "📷 Take a photo of the plant size when treating."].filter(Boolean).join("\n");
      await sb.from("manager_tasks").update({ title, description: desc, location: m.location || null }).eq("id", taskId);
    }
  }
  async function doConvert() { setBusy(true); const id = await onConvert(date); setBusy(false); if (id) setAdded(true); }
  async function doUndo() { setBusy(true); await onUndo(); setBusy(false); setAdded(false); }

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

        <div style={lbl}>Application & rate</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={meta.application} onChange={e => setM("application", e.target.value)} onBlur={() => saveMeta()} placeholder="Application (Piccolo…)" style={{ ...inp, flex: 2 }} />
          <input value={meta.rates} onChange={e => setM("rates", e.target.value)} onBlur={() => saveMeta()} placeholder="Rate (3ppm…)" style={{ ...inp, flex: 1 }} />
        </div>
        <div style={lbl}>Varieties treated <span style={{ fontWeight: 400, textTransform: "none" }}>· a line each — add each variety's size photo(s)</span></div>
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
            <button onClick={addLine} style={{ background: "#fff", color: C.dark, border: `1.5px dashed ${C.light}`, borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>＋ Add variety</button>
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
          <div style={lbl}>Schedule this year's task</div>
          {!added ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", flex: "1 1 150px" }} />
              <button onClick={doConvert} disabled={busy} style={{ background: C.light, color: "#fff", border: "none", borderRadius: 9, padding: "11px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "…" : `➕ Create ${thisYear} task`}</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#2e5c1e", background: "#eef6e7", borderRadius: 8, padding: "8px 12px" }}>✓ Task created — in Growing tasks</span>
              <button onClick={doUndo} disabled={busy} style={{ background: "#fff", color: "#d94f3d", border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "…" : "Undo"}</button>
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>Since {crop} treatments are size-triggered, set the date to when the plants actually reach size — you can also tweak it later in Growing tasks.</div>
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
