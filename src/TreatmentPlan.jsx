import { useState, useEffect, useCallback } from "react";
import { getSupabase } from "./supabase";

// "What we did last year" treatment plan → seed this year's tasks. Generic per crop (Mum first).
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

export default function TreatmentPlan({ onBack }) {
  const sb = getSupabase();
  const [crop, setCrop] = useState("Mum");
  const [crops, setCrops] = useState(["Mum"]);
  const [recs, setRecs] = useState([]);
  const [busy, setBusy] = useState("");
  const [added, setAdded] = useState({}); // record id -> true (converted this session)
  const [open, setOpen] = useState({});   // record id -> expanded
  const [logOpen, setLogOpen] = useState(false);
  const thisYear = new Date().getFullYear();

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: cr } = await sb.from("treatment_records").select("crop");
    setCrops([...new Set((cr || []).map(r => r.crop))].sort());
    const { data } = await sb.from("treatment_records").select("*").eq("crop", crop).order("rec_date");
    setRecs(data || []);
  }, [sb, crop]);
  useEffect(() => { load(); }, [load]);

  const lastYear = recs.length ? Math.max(...recs.map(r => +String(r.rec_date).slice(0, 4) || 0)) : thisYear - 1;
  const targetDate = rec => `${thisYear}-${String(rec.rec_date).slice(5)}`;
  const taskTitle = rec => (["🌼", rec.application, rec.rates].filter(Boolean).join(" ") + (rec.crop_detail ? ` — ${rec.crop_detail}` : "")).trim();
  const taskDesc = rec => [rec.crop_detail && `Crop: ${rec.crop_detail}`, rec.location && `Location: ${rec.location}`, rec.rates && `Rate: ${rec.rates}`, rec.notes && `Note: ${rec.notes}`].filter(Boolean).join("\n");
  const toTask = rec => { const td = targetDate(rec); const wi = isoWeek(td); return { id: crypto.randomUUID(), title: taskTitle(rec), description: taskDesc(rec), category: "growing", status: "pending", priority: 10, week_number: wi.week, year: wi.year, target_date: td, bucket: null, carried_over: false, created_by: `${crop} Plan`, location: rec.location || null, assignees: [], photos: [] }; };

  async function convert(rec) {
    if (!rec.rec_date) return;
    setBusy(rec.id);
    const { error } = await sb.from("manager_tasks").insert(toTask(rec));
    setBusy("");
    if (error) { window.alert("Couldn't add: " + error.message); return; }
    setAdded(a => ({ ...a, [rec.id]: true }));
  }
  async function copyAll() {
    const rows = recs.filter(r => r.rec_date).map(toTask);
    if (!window.confirm(`Copy all ${rows.length} ${crop} treatments to ${thisYear} as editable tasks (same dates)? Find them under Growing — tweak or delete after.`)) return;
    setBusy("all");
    const { error } = await sb.from("manager_tasks").insert(rows);
    setBusy("");
    if (error) { window.alert("Copy failed: " + error.message); return; }
    const map = {}; recs.forEach(r => { if (r.rec_date) map[r.id] = true; }); setAdded(map);
    window.alert(`Added ${rows.length} tasks to ${thisYear}. They're in Growing tasks — editable.`);
  }

  // "around now last year" — records dated within the next ~10 days (and 3 back) by month/day
  const now = new Date();
  const soon = recs.filter(r => { if (!r.rec_date) return false; const d = new Date(`${thisYear}-${String(r.rec_date).slice(5)}T12:00:00`); const diff = (d - now) / 86400000; return diff >= -3 && diff <= 12; })
    .sort((a, b) => a.rec_date.slice(5).localeCompare(b.rec_date.slice(5)));

  // group full timeline by month
  const byMonth = {};
  recs.forEach(r => { if (!r.rec_date) return; (byMonth[monthOf(r.rec_date)] = byMonth[monthOf(r.rec_date)] || []).push(r); });

  const C = { dark: "#1e2d1a", light: "#7fb069", muted: "#7a8c74", border: "#e0ead8", card: "#fff" };
  const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
  const Row = ({ r, compact }) => {
    const isOpen = !!open[r.id];
    const toggle = () => setOpen(o => ({ ...o, [r.id]: !o[r.id] }));
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 4px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ minWidth: 52, textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, color: C.dark, fontSize: 13 }}>{fmtDate(r.rec_date)}</div>
          <div style={{ fontSize: 9, color: C.muted }}>{compact ? `→ ${thisYear}` : `'${String(r.rec_date).slice(2, 4)}`}</div>
        </div>
        <div onClick={toggle} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {r.application && <span style={{ fontSize: 11.5, fontWeight: 800, color: "#fff", background: appColor(r.application), borderRadius: 7, padding: "2px 9px", ...wrap }}>{r.application}{r.rates ? ` · ${r.rates}` : ""}</span>}
            {r.location && <span style={{ fontSize: 11, color: C.muted, ...wrap }}>📍 {r.location}</span>}
            <span style={{ marginLeft: "auto", color: C.muted, fontSize: 11, flexShrink: 0 }}>{isOpen ? "▲ less" : "▼ more"}</span>
          </div>
          {r.crop_detail && (
            <div style={{ fontSize: 12.5, color: C.dark, marginTop: 3, ...wrap, ...(isOpen ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{r.crop_detail}</div>
          )}
          {isOpen && r.notes && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, fontStyle: "italic", ...wrap }}>📝 {r.notes}</div>}
          {isOpen && (r.rates || r.location) && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{[r.location && `📍 ${r.location}`, r.rates && `Rate: ${r.rates}`].filter(Boolean).join("  ·  ")}</div>}
          {!isOpen && r.notes && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, ...wrap, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>📝 {r.notes}</div>}
        </div>
        <button onClick={() => convert(r)} disabled={busy === r.id || added[r.id]}
          style={{ border: "none", background: added[r.id] ? "#eef3e9" : C.light, color: added[r.id] ? C.muted : "#fff", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 800, cursor: added[r.id] ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
          {added[r.id] ? "✓ added" : busy === r.id ? "…" : `➕ ${thisYear}`}
        </button>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <div style={{ background: C.dark, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
        <div style={{ color: "#c8e6b8", fontWeight: 800, fontSize: 16 }}>🌼 Treatment Plan</div>
        <div style={{ color: "#7a9a6a", fontSize: 11 }}>what we did last year → this year's tasks</div>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 14px" }}>
        {/* crop tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {crops.map(c => <button key={c} onClick={() => setCrop(c)} style={{ border: `1.5px solid ${crop === c ? C.light : C.border}`, background: crop === c ? C.light : "#fff", color: crop === c ? "#fff" : C.dark, borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>)}
        </div>

        <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
          Your <strong>{crop} {lastYear}</strong> records ({recs.length}). Tap <strong>➕ {thisYear}</strong> on any treatment to drop it onto this year's <strong>Growing</strong> tasks (same date, fully editable). Or copy the whole plan and tweak.
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={copyAll} disabled={busy === "all" || !recs.length} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{busy === "all" ? "Copying…" : `📋 Copy whole plan → ${thisYear}`}</button>
          <button onClick={() => setLogOpen(true)} style={{ background: "#fff", color: C.dark, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 15px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>＋ Log a treatment</button>
        </div>

        {/* around now last year */}
        {soon.length > 0 && (
          <div style={{ background: C.card, border: `2px solid ${C.light}`, borderRadius: 12, padding: "10px 14px 12px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>📅 Around now, last year</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>What you were doing on {crop} this time in {lastYear} — tap to schedule for {thisYear}.</div>
            {soon.map(r => <Row key={r.id} r={r} compact />)}
          </div>
        )}

        {/* full timeline */}
        <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .6, margin: "6px 0 4px" }}>Full {lastYear} plan</div>
        {Object.entries(byMonth).map(([m, rows]) => (
          <div key={m} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 14px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.dark, padding: "2px 0 4px" }}>{m}</div>
            {rows.map(r => <Row key={r.id} r={r} />)}
          </div>
        ))}
        {recs.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: "20px 0", textAlign: "center" }}>No {crop} records yet.</div>}
      </div>

      {logOpen && <LogModal crop={crop} year={thisYear} sb={sb} onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); load(); }} />}
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
    await sb.from("treatment_records").insert({ crop, year, ...d, source: "logged" });
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
