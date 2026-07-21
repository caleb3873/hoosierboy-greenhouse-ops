// PhotoLibrary — one door into every marketing photo the company has taken.
//
// Indexes (via /api/photo-index): trade show, trade-show sessions, hot lists +
// shared galleries, treatment/response photos, and the combo library. Operational
// imagery — pick sheets, signed invoices, receiving, inventory, resumes, task
// photos — is deliberately excluded; those are records, not marketing assets.
//
// Select photos → build a shareable slideshow/gallery link (reuses SlideshowBuilder,
// the same thing Hot List and Trade Show already use), download them, or share.
// Renders on the planner and on mobile from the same component.
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { SlideshowBuilder } from "./Sharing";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";

const SOURCES = [
  { id: "all", label: "All photos", icon: "🖼" },
  { id: "tradeshow", label: "Trade Show", icon: "📸" },
  { id: "tradeshow_session", label: "Trade Show Sessions", icon: "🎪" },
  { id: "gallery", label: "Hot Lists & Galleries", icon: "🔥" },
  { id: "treatment", label: "Crop / Treatment", icon: "🌼" },
  { id: "combo", label: "Combo Library", icon: "🪴" },
];

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

export default function PhotoLibrary({ onBack, embedded }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [rows, setRows] = useState(null);
  const [source, setSource] = useState("all");
  const [folder, setFolder] = useState(null);   // source_id within a source
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [lightbox, setLightbox] = useState(null);
  const [building, setBuilding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    if (!sb) return;
    let out = [], from = 0;
    for (;;) {
      const { data, error } = await sb.from("photo_library").select("*")
        .eq("hidden", false).order("taken_at", { ascending: false, nullsFirst: false })
        .range(from, from + 999);
      if (error) { setRows([]); setMsg(error.message.includes("photo_library") ? "The photo_library table isn't there yet — run the migration." : error.message); return; }
      out = out.concat(data || []);
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    setRows(out);
  }
  useEffect(() => { load(); }, [sb]); // eslint-disable-line

  async function sync() {
    setSyncing(true); setMsg(null);
    try {
      const r = await fetch("/api/photo-index", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || j.error || "sync failed");
      setMsg(`Indexed ${j.indexed} photos · ${Object.entries(j.bySource || {}).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
      await load();
    } catch (e) { setMsg("Sync failed: " + e.message); }
    setSyncing(false);
  }

  const bySource = useMemo(() => {
    const m = {};
    (rows || []).forEach(r => { m[r.source] = (m[r.source] || 0) + 1; });
    return m;
  }, [rows]);

  // Sub-folders inside the chosen source (event, gallery, crop…)
  const folders = useMemo(() => {
    if (source === "all" || !rows) return [];
    const m = new Map();
    rows.filter(r => r.source === source).forEach(r => {
      const k = r.sourceId || r.source_id || "_";
      const label = r.sourceLabel || r.source_label || "Untitled";
      if (!m.has(k)) m.set(k, { id: k, label, n: 0, at: r.takenAt || r.taken_at });
      m.get(k).n++;
    });
    return [...m.values()].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  }, [rows, source]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (rows || []).filter(r => {
      if (source !== "all" && r.source !== source) return false;
      if (folder && String(r.sourceId ?? r.source_id) !== String(folder)) return false;
      if (ql) {
        const hay = `${r.caption || ""} ${r.variety || ""} ${r.vendor || ""} ${r.sourceLabel || r.source_label || ""} ${(r.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [rows, source, folder, q]);

  const selected = useMemo(() => (rows || []).filter(r => sel.has(r.id)), [rows, sel]);
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function downloadSelected() {
    if (!selected.length) return;
    if (selected.length === 1) { window.open(selected[0].url, "_blank", "noopener"); return; }
    setMsg("Zipping…");
    try {
      if (!window.JSZip) await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload = res; s.onerror = rej; document.head.appendChild(s);
      });
      const zip = new window.JSZip();
      for (const [i, p] of selected.entries()) {
        const blob = await fetch(p.url).then(r => r.blob());
        const base = (p.variety || p.caption || p.sourceLabel || p.source_label || "photo").replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
        zip.file(`${String(i + 1).padStart(3, "0")}_${base}.jpg`, blob);
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `hoosierboy-photos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click(); URL.revokeObjectURL(a.href);
      setMsg(null);
    } catch (e) { setMsg("Download failed: " + e.message); }
  }

  const btn = (bg, color, extra = {}) => ({
    padding: "8px 14px", borderRadius: 9, border: "none", background: bg, color,
    fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: FONT, ...extra,
  });

  return (
    <div style={{ fontFamily: FONT, minHeight: embedded ? "auto" : "100vh", background: "#f2f5ef", paddingBottom: 90 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      {onBack && (
        <button onClick={onBack} style={{ background: DARK, color: CREAM, border: "none", padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%", textAlign: "left", fontFamily: FONT }}>← Back</button>
      )}

      <div style={{ padding: embedded ? 0 : "16px 16px 0", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 style={{ fontFamily: "'DM Serif Display',Georgia,serif", color: DARK, fontSize: 25, margin: "0 0 2px" }}>🖼 Photo Library</h2>
            <div style={{ fontSize: 12.5, color: MUTED }}>
              Every marketing photo in one place — {(rows || []).length.toLocaleString()} indexed. Select some to build a share link, download, or send.
            </div>
          </div>
          <button onClick={sync} disabled={syncing} style={btn(syncing ? "#c8d8c0" : DARK, CREAM)}>
            {syncing ? "Indexing…" : "↻ Refresh"}
          </button>
        </div>

        {msg && (
          <div style={{ background: "#fff", border: `1.5px solid ${GREEN}`, borderRadius: 10, padding: "9px 13px", fontSize: 12.5, color: DARK, marginBottom: 10 }}>
            {msg}
          </div>
        )}

        {/* source folders */}
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          {SOURCES.filter(s => s.id === "all" || bySource[s.id]).map(s => (
            <button key={s.id} onClick={() => { setSource(s.id); setFolder(null); }}
              style={{
                padding: "8px 13px", borderRadius: 999, cursor: "pointer", fontFamily: FONT,
                border: `1.5px solid ${source === s.id ? GREEN : "#dce6d4"}`,
                background: source === s.id ? GREEN : "#fff",
                color: source === s.id ? "#fff" : MUTED, fontSize: 12.5, fontWeight: 800,
              }}>
              {s.icon} {s.label} <span style={{ opacity: 0.75 }}>{s.id === "all" ? (rows || []).length : bySource[s.id] || 0}</span>
            </button>
          ))}
        </div>

        {/* sub-folders */}
        {folders.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => setFolder(null)} style={{ padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontSize: 11.5, fontWeight: 700, border: `1px solid ${!folder ? DARK : "#dce6d4"}`, background: !folder ? DARK : "#fff", color: !folder ? CREAM : MUTED }}>All</button>
            {folders.map(f => (
              <button key={f.id} onClick={() => setFolder(f.id)}
                style={{ padding: "5px 11px", borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${folder === f.id ? DARK : "#dce6d4"}`, background: folder === f.id ? DARK : "#fff", color: folder === f.id ? CREAM : MUTED }}>
                📁 {f.label} <span style={{ opacity: 0.7 }}>{f.n}</span>
              </button>
            ))}
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Search variety, vendor, caption, event…"
          style={{ width: "100%", maxWidth: 380, padding: "9px 13px", borderRadius: 999, border: "1.5px solid #dce6d4", fontSize: 13, fontFamily: FONT, boxSizing: "border-box", outline: "none", marginBottom: 12 }} />

        {rows === null && <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Loading…</div>}
        {rows !== null && rows.length === 0 && (
          <div style={{ background: "#fff", border: "1.5px solid #e0e8d8", borderRadius: 12, padding: 40, textAlign: "center", color: MUTED }}>
            Nothing indexed yet. Hit <b>↻ Refresh</b> to scan trade show, hot lists, galleries, treatments and the combo library.
          </div>
        )}

        {/* grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 9 }}>
          {shown.map(p => {
            const on = sel.has(p.id);
            const thumb = p.thumbUrl || p.thumb_url || p.url;
            return (
              <div key={p.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", border: `2px solid ${on ? GREEN : "transparent"}`, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
                <img src={thumb} alt={p.variety || p.caption || ""} loading="lazy"
                  onClick={() => setLightbox(p)}
                  style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block", cursor: "zoom-in", background: "#e8eee4" }} />
                <button onClick={() => toggle(p.id)}
                  title={on ? "Deselect" : "Select"}
                  style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
                    border: `2px solid ${on ? GREEN : "#fff"}`, background: on ? GREEN : "rgba(0,0,0,.35)", color: "#fff",
                    fontSize: 13, fontWeight: 900, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  {on ? "✓" : "+"}
                </button>
                <div style={{ padding: "5px 7px 7px" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.variety || p.caption || p.sourceLabel || p.source_label || "—"}
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.vendor ? `${p.vendor} · ` : ""}{fmtDate(p.takenAt || p.taken_at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {shown.length === 0 && rows?.length > 0 && (
          <div style={{ padding: 30, textAlign: "center", color: MUTED }}>No photos match that filter.</div>
        )}
      </div>

      {/* selection action bar */}
      {sel.size > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: DARK, padding: "11px 14px", zIndex: 500,
          display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", boxShadow: "0 -3px 14px rgba(0,0,0,.25)" }}>
          <span style={{ color: CREAM, fontWeight: 800, fontSize: 13.5 }}>{sel.size} selected</span>
          <button onClick={() => setSel(new Set())} style={btn("transparent", CREAM, { border: `1px solid ${GREEN}66` })}>Clear</button>
          <span style={{ flex: 1 }} />
          <button onClick={downloadSelected} style={btn(CREAM, DARK)}>⬇ Download</button>
          <button onClick={() => setBuilding(true)} style={btn(GREEN, DARK)}>🔗 Share / Slideshow</button>
        </div>
      )}

      {building && (
        <SlideshowBuilder
          photos={selected.map(p => ({ id: p.id, url: p.url, view: p.url, thumb: p.thumbUrl || p.thumb_url || null, comment: p.caption || p.variety || "" }))}
          createdBy={displayName || "Staff"}
          onClose={() => setBuilding(false)}
        />
      )}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 10001, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <img src={lightbox.url} alt="" style={{ maxWidth: "100%", maxHeight: "82vh", objectFit: "contain", borderRadius: 8 }} />
          <div onClick={e => e.stopPropagation()} style={{ color: "#fff", marginTop: 12, textAlign: "center", maxWidth: 620 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{lightbox.variety || lightbox.caption || "—"}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
              {[lightbox.vendor, lightbox.sourceLabel || lightbox.source_label, fmtDate(lightbox.takenAt || lightbox.taken_at), lightbox.uploadedBy || lightbox.uploaded_by].filter(Boolean).join(" · ")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
              <button onClick={() => toggle(lightbox.id)} style={btn(sel.has(lightbox.id) ? GREEN : CREAM, DARK)}>
                {sel.has(lightbox.id) ? "✓ Selected" : "+ Select"}
              </button>
              <a href={lightbox.url} target="_blank" rel="noreferrer" style={{ ...btn(CREAM, DARK), textDecoration: "none" }}>Open original</a>
              <button onClick={() => setLightbox(null)} style={btn("transparent", "#fff", { border: "1px solid #ffffff55" })}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
