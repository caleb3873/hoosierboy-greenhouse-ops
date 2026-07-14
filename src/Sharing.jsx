import { useState, useEffect } from "react";
import { getSupabase } from "./supabase";

// ── Shared galleries (slideshows + hot lists) behind a public link ──────────────
export const shareUrlFor = id => `${window.location.origin}/?g=${id}`;

export async function createGallery({ kind = "slideshow", title, recipient, subtitle, items, createdBy, department }) {
  const sb = getSupabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await sb.from("shared_galleries").insert({
    id, kind, title: title || null, recipient: recipient || null, subtitle: subtitle || null,
    items: (items || []).map((it, i) => ({ ...it, sort: i })), created_by: createdBy || null,
    department: department || null, active: true, created_at: now, updated_at: now,
  });
  if (error) throw error;
  return id;
}

export async function updateGallery(id, changes) {
  const sb = getSupabase();
  const { error } = await sb.from("shared_galleries").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

const C = { dark: "#1e2d1a", cream: "#c8e6b8", light: "#7fb069", muted: "#7a8c74", paper: "#faf7f0" };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return ""; } };
const weekLabel = w => {
  if (!w) return "";
  const m = String(w).match(/^(\d{4})-W(\d{1,2})$/);
  return m ? `Week ${+m[2]}, ${m[1]}` : w;
};

// Builder modal: pick order + captions + who it's for, then create a shareable link.
export function SlideshowBuilder({ photos, createdBy, kind = "slideshow", onClose }) {
  const [items, setItems] = useState(() => (photos || []).map(p => ({ id: p.id || crypto.randomUUID(), url: p.url || p.imgData, caption: p.comment || "" })));
  const [title, setTitle] = useState("");
  const [recipient, setRecipient] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [drag, setDrag] = useState(null);

  const move = (i, d) => setItems(a => { const n = [...a]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const setCap = (i, v) => setItems(a => a.map((x, j) => j === i ? { ...x, caption: v } : x));
  const removeItem = i => setItems(a => a.filter((_, j) => j !== i));
  const onDrop = i => setItems(a => { if (drag == null || drag === i) return a; const n = [...a]; const [m] = n.splice(drag, 1); n.splice(i, 0, m); return n; });

  async function create() {
    if (!items.length) return;
    setBusy(true);
    try {
      const id = await createGallery({ kind, title: title.trim(), recipient: recipient.trim(), subtitle: subtitle.trim(), items, createdBy });
      setLink(shareUrlFor(id));
    } catch (e) { window.alert("Couldn't create link: " + (e.message || e)); }
    setBusy(false);
  }
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("Copy this link:", link); } }
  async function share() { try { if (navigator.share) await navigator.share({ title: title || "Hoosier Boy Greenhouse", text: `${title || "Selections"} — Hoosier Boy Greenhouse`, url: link }); else copy(); } catch { /* cancelled */ } }

  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1.5px solid #c8d8c0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", marginBottom: 10 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 10002, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 560, maxHeight: "94vh", overflow: "auto", fontFamily: "'DM Sans',sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e2d1a" }}>🔗 Create shareable {kind === "personalized" ? "gallery" : "slideshow"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#7a8c74", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {link ? (
          <div style={{ textAlign: "center", padding: "10px 0 6px" }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#1e2d1a", margin: "6px 0 4px" }}>Your link is ready</div>
            <div style={{ fontSize: 12.5, color: "#7a8c74", marginBottom: 12 }}>Anyone with this link can view it — no login needed.</div>
            <div style={{ background: "#f2f5ef", border: "1px solid #e0ead8", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#2e5c1e", wordBreak: "break-all", marginBottom: 12 }}>{link}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={share} style={{ flex: 2, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>📤 Text / Email it</button>
              <button onClick={copy} style={{ flex: 1, background: "#fff", color: "#1e2d1a", border: "1.5px solid #1e2d1a", borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <a href={link} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "#2b6cb0", fontWeight: 700 }}>Preview ›</a>
          </div>
        ) : (<>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, marginBottom: 5 }}>Personalize</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title — e.g. Spring 2027 Suggestions" style={inp} />
          <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Prepared for — e.g. Sullivan Hardware, Keystone" style={inp} />
          <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Note (optional)" style={inp} />

          <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .4, margin: "6px 0 5px" }}>Photos · drag to reorder ({items.length})</div>
          {items.map((it, i) => (
            <div key={it.id} draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(i)} onDragEnd={() => setDrag(null)}
              style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 8, border: "1px solid #e0ead8", borderRadius: 10, marginBottom: 8, background: drag === i ? "#eef6e7" : "#fff", cursor: "grab" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, color: "#aabba0", fontSize: 11, alignItems: "center" }}>
                <button onClick={() => move(i, -1)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#7a8c74", padding: 0 }}>▲</button>
                <span style={{ fontWeight: 800 }}>{i + 1}</span>
                <button onClick={() => move(i, 1)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#7a8c74", padding: 0 }}>▼</button>
              </div>
              <img src={it.url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
              <textarea value={it.caption} onChange={e => setCap(i, e.target.value)} placeholder="Caption…" rows={2} style={{ flex: 1, padding: "7px 9px", border: "1.5px solid #c8d8c0", borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }} />
              <button onClick={() => removeItem(i)} title="Remove from this share" style={{ background: "none", border: "none", color: "#d94f3d", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
          ))}

          <button onClick={create} disabled={busy || !items.length} style={{ width: "100%", marginTop: 8, background: busy ? "#a9c795" : "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Creating…" : "🔗 Create link"}</button>
        </>)}
      </div>
    </div>
  );
}

// PUBLIC, no-login page a customer opens from the shared link.
export function SharedGalleryViewer({ id }) {
  const [g, setG] = useState(null);
  const [err, setErr] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setErr("unavailable"); return; }
    sb.from("shared_galleries").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) setErr("notfound"); else setG(data);
    });
  }, [id]);

  const S = { fontFamily: "'DM Sans','Segoe UI',sans-serif", background: C.paper, minHeight: "100vh", color: C.dark };
  if (err) return (
    <div style={{ ...S, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 }}>
      <div><div style={{ fontSize: 44 }}>🌿</div><div style={{ marginTop: 10, color: C.muted }}>This link isn't available anymore.</div></div>
    </div>
  );
  if (!g) return <div style={{ ...S, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>Loading…</div>;

  const items = [...(g.items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const isHot = g.kind === "hotlist";
  // hot list → group by week (newest first); slideshow/personalized → single list
  const groups = [];
  if (isHot) {
    const byWeek = {};
    items.forEach(it => { const w = it.week || "—"; (byWeek[w] = byWeek[w] || []).push(it); });
    Object.keys(byWeek).sort().reverse().forEach((w, i) => groups.push({ week: w, latest: i === 0, items: byWeek[w] }));
  } else groups.push({ items });

  const Card = it => (
    <div key={it.id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #ece7da", boxShadow: "0 2px 14px rgba(30,45,26,.06)", marginBottom: 18 }}>
      <img src={it.url} alt={it.caption || ""} onClick={() => setLightbox(it.url)}
        style={{ width: "100%", height: "auto", display: "block", cursor: "zoom-in" }} />
      {it.caption && <div style={{ padding: "14px 18px", fontSize: 16, lineHeight: 1.5, color: "#2e3d28", ...wrap }}>{it.caption}</div>}
    </div>
  );

  return (
    <div style={S}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
      {/* Brand bar */}
      <div style={{ background: C.dark, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <img src="/favicon-512.png" alt="" style={{ width: 40, height: 40, borderRadius: 9 }} />
        <div style={{ color: C.cream, fontWeight: 800, fontSize: 15, letterSpacing: .3 }}>Hoosier Boy Greenhouse</div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "26px 16px 60px" }}>
        {/* Title block */}
        <div style={{ marginBottom: 22 }}>
          {isHot && <div style={{ display: "inline-block", background: "#fdecef", color: "#c0392b", fontWeight: 800, fontSize: 12, padding: "4px 12px", borderRadius: 999, marginBottom: 10 }}>🔥 HOT LIST</div>}
          <div style={{ fontFamily: "'DM Serif Display',Georgia,serif", fontSize: 34, lineHeight: 1.12, color: C.dark, ...wrap }}>{g.title || (isHot ? "Hot List" : "Selections")}</div>
          {g.recipient && <div style={{ fontSize: 15, color: C.light, fontWeight: 800, marginTop: 8 }}>Prepared for {g.recipient}</div>}
          {g.subtitle && <div style={{ fontSize: 14, color: C.muted, marginTop: 6, lineHeight: 1.5, ...wrap }}>{g.subtitle}</div>}
          <div style={{ fontSize: 12.5, color: "#a9b3a0", marginTop: 8 }}>{items.length} item{items.length !== 1 ? "s" : ""} · {fmtDate(g.updated_at || g.created_at)}</div>
        </div>

        {groups.map((grp, gi) => (
          <div key={gi}>
            {isHot && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: grp.latest ? "#c0392b" : C.muted, textTransform: "uppercase", letterSpacing: .6 }}>
                  {grp.latest ? "This week" : (grp.week === "—" ? "Earlier" : weekLabel(grp.week))}
                </div>
                <div style={{ flex: 1, height: 1, background: "#e6e0d3" }} />
              </div>
            )}
            {grp.items.map(Card)}
          </div>
        ))}

        <div style={{ textAlign: "center", color: "#a9b3a0", fontSize: 12, marginTop: 34, lineHeight: 1.6 }}>
          Hoosier Boy Greenhouse · Indianapolis<br />Questions? Reach out to your sales rep.
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
