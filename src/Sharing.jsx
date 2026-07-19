import { useState, useEffect, useRef } from "react";
import { getSupabase } from "./supabase";
import { compressImage } from "./ManagerTasksView";

// ⚠️ Do NOT use the /render/image transform endpoint on this project — it distorts (forces width,
// keeps height; `height` param 404s). We pre-generate real renditions instead: `view` (~1200px) and
// `thumb` (~240px) stored next to the original. Fall back to the original URL when absent.
export const viewSrc = it => it.view || it.url;
export const thumbSrc = it => it.thumb || it.view || it.url;

const storagePath = url => { const m = String(url || "").match(/\/object\/public\/([^/]+)\/(.+)$/); return m ? { bucket: m[1], path: m[2] } : null; };

// Generate any missing view/thumb renditions for a gallery, client-side (canvas), and save them onto
// the items. Fire-and-forget after link creation — the viewer falls back to originals until done.
export async function ensureRenditions(galleryId) {
  const sb = getSupabase(); if (!sb) return;
  const { data: g } = await sb.from("shared_galleries").select("items").eq("id", galleryId).single();
  const items = (g && g.items) || [];
  let changed = false;
  for (const it of items) {
    if (it.view && it.thumb) continue;
    const sp = storagePath(it.url); if (!sp) continue;
    try {
      const blob = await (await fetch(it.url)).blob();
      const base = sp.path.replace(/\.[a-zA-Z0-9]+$/, "");
      const view = await compressImage(new File([blob], "p.jpg", { type: blob.type || "image/jpeg" }), 1200, 0.78);
      const thumb = await compressImage(new File([blob], "p.jpg", { type: blob.type || "image/jpeg" }), 240, 0.68);
      const up = async (suffix, data) => {
        const p = `${base}__${suffix}.jpg`;
        const pub = sb.storage.from(sp.bucket).getPublicUrl(p).data.publicUrl;
        // bucket RLS allows INSERT but not UPDATE — reuse an existing rendition (shared photos)
        try { if ((await fetch(pub, { method: "HEAD" })).ok) return pub; } catch { /* fall through */ }
        const { error } = await sb.storage.from(sp.bucket).upload(p, data, { contentType: "image/jpeg" });
        return error ? null : pub;
      };
      const v = await up("view", view), t = await up("thumb", thumb);
      if (v) { it.view = v; changed = true; }
      if (t) { it.thumb = t; changed = true; }
    } catch { /* keep original as fallback */ }
  }
  if (changed) await sb.from("shared_galleries").update({ items, updated_at: new Date().toISOString() }).eq("id", galleryId);
}

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
// hoosierboy.com brand tokens (retail site) — the public viewer wears THIS language, not the ops palette
const HB = { pine: "#16403A", forest: "#1a4731", terra: "#c2703e", paper: "#faf8f5", border: "#e8e2da", stone: "#6b7570", ink: "#22302a" };
const SERIF = "'Playfair Display',Georgia,serif";
const SANS = "'Geist','Inter','Segoe UI',system-ui,sans-serif";
const EYEBROW = { fontFamily: SANS, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 600, fontSize: 11.5 };
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch { return ""; } };
const weekLabel = w => {
  if (!w) return "";
  const m = String(w).match(/^(\d{4})-W(\d{1,2})$/);
  return m ? `Week ${+m[2]}, ${m[1]}` : w;
};

// Builder modal: pick order + captions + who it's for, then create a shareable link.
export function SlideshowBuilder({ photos, createdBy, kind = "slideshow", onClose }) {
  const [items, setItems] = useState(() => (photos || []).map(p => ({ id: p.id || crypto.randomUUID(), url: p.url || p.imgData, view: p.view || null, thumb: p.thumb || null, caption: p.comment || "" })));
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
      ensureRenditions(id); // fire-and-forget: generate fast mobile renditions for any photos missing them
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
              <img src={thumbSrc(it)} alt="" loading="lazy" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
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
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const carRef = useRef(null);
  const stripRef = useRef(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setErr("unavailable"); return; }
    sb.from("shared_galleries").select("*").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) setErr("notfound"); else setG(data);
    });
  }, [id]);

  const isHot = g && g.kind === "hotlist";
  // hot list → newest week first; otherwise the saved order
  const items = g ? [...(g.items || [])].sort((a, b) => (isHot ? String(b.week || "").localeCompare(String(a.week || "")) : 0) || (a.sort ?? 0) - (b.sort ?? 0)) : [];
  const active = items[idx] || items[0];
  const goTo = i => { const el = carRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };
  const onScroll = () => { const el = carRef.current; if (!el) return; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== idx) setIdx(i); };

  useEffect(() => { const h = e => { if (e.key === "ArrowLeft") goTo(Math.max(0, idx - 1)); else if (e.key === "ArrowRight") goTo(Math.min(items.length - 1, idx + 1)); else if (e.key === "Escape") setZoom(false); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); });
  useEffect(() => { const el = stripRef.current && stripRef.current.children[idx]; if (el) el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [idx]);

  const S = { fontFamily: SANS, background: HB.paper, minHeight: "100vh", color: HB.ink };
  if (err) return (
    <div style={S}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 30, color: HB.forest }}>Hoosier Boy</div>
          <div style={{ marginTop: 12, color: HB.stone, fontSize: 15 }}>This link isn't available anymore.</div>
          <a href="https://hoosierboy.com" style={{ display: "inline-block", marginTop: 20, background: HB.terra, color: "#fff", padding: "10px 22px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>Visit hoosierboy.com</a>
        </div>
      </div>
    </div>
  );
  if (!g) return <div style={{ ...S, display: "flex", alignItems: "center", justifyContent: "center", color: HB.stone }}>Loading…</div>;

  const eyebrowText = isHot ? "The Hot List" : "New & Noteworthy";
  const weekNow = isHot && items[0] && items[0].week ? weekLabel(items[0].week) : null;

  return (
    <div style={S}>
      <link rel="preconnect" href={(storagePath(active && active.url) && new URL(active.url).origin) || "https://gganxbvtbqheyxvedjko.supabase.co"} crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Geist:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* Brand bar — deep pine, blurred, like the retail site header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(22,64,58,.95)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", padding: "13px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <img src="/favicon-512.png" alt="" style={{ width: 26, height: 26, borderRadius: 6 }} />
        <div style={{ color: "#f2ede4", ...EYEBROW, fontSize: 12.5, letterSpacing: "0.22em" }}>Hoosier Boy</div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 14px calc(60px + env(safe-area-inset-bottom))" }}>
        {/* Cover — editorial title block */}
        <div style={{ textAlign: "center", padding: "42px 8px 30px" }}>
          <div style={{ ...EYEBROW, color: HB.terra }}>{eyebrowText}{weekNow ? ` · ${weekNow}` : ""}</div>
          <h1 style={{ fontFamily: SERIF, fontWeight: 500, fontSize: "clamp(30px, 7vw, 44px)", lineHeight: 1.15, color: HB.forest, margin: "14px 0 0", ...wrap }}>{g.title || (isHot ? "This Week's Picks" : "A Look at What's Coming")}</h1>
          {g.recipient && <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, color: HB.terra, marginTop: 14 }}>Prepared for {g.recipient}</div>}
          {g.subtitle && <div style={{ fontSize: 15, color: HB.stone, marginTop: 12, lineHeight: 1.65, maxWidth: 480, marginLeft: "auto", marginRight: "auto", ...wrap }}>{g.subtitle}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginTop: 22 }}>
            <div style={{ width: 44, height: 1, background: HB.border }} />
            <div style={{ ...EYEBROW, fontSize: 10.5, color: "#a8a094" }}>{items.length} selection{items.length !== 1 ? "s" : ""} · {fmtDate(g.updated_at || g.created_at)}</div>
            <div style={{ width: 44, height: 1, background: HB.border }} />
          </div>
        </div>

        {active && (<>
          {/* Native swipe carousel — portrait-friendly stage on deep pine */}
          <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: HB.pine, boxShadow: "0 18px 44px -18px rgba(22,64,58,.45)" }}>
            <div ref={carRef} onScroll={onScroll} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
              {items.map((it, i) => (
                <div key={it.id} style={{ flex: "0 0 100%", scrollSnapAlign: "center", height: "68vh", maxHeight: 640, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
                  {/* ambient blurred placeholder — paints instantly from the tiny thumb while the view loads */}
                  {it.thumb && <div aria-hidden style={{ position: "absolute", inset: -24, backgroundImage: `url(${it.thumb})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(28px) brightness(.62) saturate(1.1)", opacity: .55 }} />}
                  <img src={viewSrc(it)} alt={it.caption || ""} loading={i <= 1 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" onClick={() => setZoom(true)}
                    style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", cursor: "zoom-in" }} />
                  {isHot && it.week && <div style={{ position: "absolute", top: 12, left: 12, background: HB.terra, color: "#fff", ...EYEBROW, fontSize: 10, padding: "5px 12px", borderRadius: 999 }}>{weekLabel(it.week)}</div>}
                </div>
              ))}
            </div>
            {items.length > 1 && <>
              {idx > 0 && <div onClick={() => goTo(idx - 1)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(250,248,245,.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: HB.forest, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,.25)", userSelect: "none" }}>‹</div>}
              {idx < items.length - 1 && <div onClick={() => goTo(idx + 1)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(250,248,245,.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: HB.forest, cursor: "pointer", boxShadow: "0 2px 10px rgba(0,0,0,.25)", userSelect: "none" }}>›</div>}
            </>}
          </div>

          {/* Caption plate — numbered like a catalog */}
          <div style={{ display: "flex", gap: 14, alignItems: "baseline", padding: "16px 6px 0", minHeight: 30 }}>
            <div style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: HB.terra, flexShrink: 0 }}>No. {idx + 1} <span style={{ color: "#c9c2b6" }}>of {items.length}</span></div>
            {active.caption && <div style={{ fontSize: 15.5, lineHeight: 1.55, color: HB.ink, ...wrap }}>{active.caption}</div>}
          </div>

          {/* Thumbnail strip */}
          {items.length > 1 && (
            <div ref={stripRef} style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 16, paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
              {items.map((it, i) => (
                <button key={it.id} onClick={() => goTo(i)} style={{ flex: "0 0 auto", padding: 0, border: `2px solid ${i === idx ? HB.terra : "transparent"}`, borderRadius: 10, background: "none", cursor: "pointer", lineHeight: 0 }}>
                  <img src={thumbSrc(it)} alt="" loading="lazy" decoding="async"
                    style={{ width: 58, height: 58, objectFit: "cover", borderRadius: 8, opacity: i === idx ? 1 : .55, display: "block", transition: "opacity .2s" }} />
                </button>
              ))}
            </div>
          )}
        </>)}

        {/* Sign-off */}
        <div style={{ textAlign: "center", marginTop: 52 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginBottom: 24 }}>
            <div style={{ width: 60, height: 1, background: HB.border }} />
            <div style={{ color: HB.terra, fontSize: 14 }}>❦</div>
            <div style={{ width: 60, height: 1, background: HB.border }} />
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 24, color: HB.forest }}>Hoosier Boy</div>
          <div style={{ ...EYEBROW, fontSize: 10, color: "#a8a094", marginTop: 6 }}>By Schlegel Greenhouse · Indianapolis</div>
          <div style={{ fontSize: 14, color: HB.stone, marginTop: 18, lineHeight: 1.6 }}>Questions or ready to order?<br />Reach out to your sales rep — we'd love to grow with you.</div>
          <a href="https://hoosierboy.com" target="_blank" rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: 20, background: HB.terra, color: "#fff", padding: "11px 26px", borderRadius: 8, textDecoration: "none", fontWeight: 600, fontSize: 14, boxShadow: "0 6px 18px -6px rgba(194,112,62,.5)" }}>Explore hoosierboy.com</a>
        </div>
      </div>

      {zoom && active && (
        <div onClick={() => setZoom(false)} style={{ position: "fixed", inset: 0, background: "rgba(16,30,26,.96)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 14, cursor: "zoom-out" }}>
          <img src={active.url} alt="" style={{ maxWidth: "100%", maxHeight: "92vh", objectFit: "contain", borderRadius: 6 }} onClick={e => e.stopPropagation()} />
          <a href={active.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            style={{ position: "absolute", bottom: 18, right: 18, background: "rgba(250,248,245,.94)", color: HB.forest, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, padding: "8px 15px", borderRadius: 999, textDecoration: "none" }}>⬇ Full quality</a>
        </div>
      )}
    </div>
  );
}
