import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";
import { createGallery, updateGallery, shareUrlFor, thumbSrc } from "./Sharing";
import { compressImage } from "./ManagerTasksView";

const C = { dark: "#1e2d1a", cream: "#c8e6b8", light: "#7fb069", muted: "#7a8c74", border: "#e0ead8", red: "#c0392b" };
const uid = () => crypto.randomUUID();
const wrap = { overflowWrap: "anywhere", wordBreak: "break-word" };
function currentWeek() {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((dt - ys) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
const weekLabel = w => { const m = String(w || "").match(/^(\d{4})-W(\d{1,2})$/); return m ? `Week ${+m[2]}, ${m[1]}` : (w || "Undated"); };
const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); } catch { return ""; } };

// ── Main: Hot Lists + Personalized galleries ────────────────────────────────────
export default function HotList({ onBack }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [tab, setTab] = useState("hotlist"); // hotlist | personalized | slideshow
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [engage, setEngage] = useState({ visits: [], favs: [] }); // customer opens + ♥ picks across all links

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("shared_galleries").select("*").in("kind", ["hotlist", "personalized", "slideshow"]).order("updated_at", { ascending: false });
    setRows(data || []); setLoading(false);
    const ids = (data || []).map(r => r.id);
    if (ids.length) {
      const [{ data: vs }, { data: fs }] = await Promise.all([
        sb.from("gallery_visits").select("gallery_id,visitor,name,created_at").in("gallery_id", ids),
        sb.from("gallery_favorites").select("gallery_id,item_id,visitor,name,created_at").in("gallery_id", ids),
      ]);
      setEngage({ visits: vs || [], favs: fs || [] });
    }
  }, [sb]);
  useEffect(() => { load(); }, [load]);

  const statsFor = gid => {
    const vs = engage.visits.filter(v => v.gallery_id === gid);
    const fs = engage.favs.filter(f => f.gallery_id === gid);
    const last = vs.map(v => v.created_at).sort().pop();
    return { opens: vs.length, viewers: new Set(vs.map(v => v.visitor)).size, last, picks: fs.length };
  };

  const list = rows.filter(r => r.kind === tab);
  const open = rows.find(r => r.id === openId);

  async function makeNew() {
    const isPers = tab === "personalized";
    const title = window.prompt(isPers ? "New personalized list — title (e.g. Fall picks for…)" : "New hot list — title (e.g. Weekly Hot List)", isPers ? "" : `Hot List`);
    if (title == null || !title.trim()) return;
    let recipient = null;
    if (isPers) { recipient = window.prompt("Who is this for? (customer name)", "") || null; }
    const id = await createGallery({ kind: tab, title: title.trim(), recipient, items: [], createdBy: displayName });
    await load(); setOpenId(id);
  }

  if (open) return <HotListEditor gallery={open} displayName={displayName} onBack={() => { setOpenId(null); load(); }} onChanged={load} />;

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <div style={{ background: C.dark, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        {onBack && <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
        <div style={{ color: C.cream, fontWeight: 800, fontSize: 16 }}>🔥 Hot List</div>
        <div style={{ color: "#7a9a6a", fontSize: 11 }}>share products with customers</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 14px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[["hotlist", "🔥 Hot Lists"], ["personalized", "👤 Personalized"], ["slideshow", "📸 Slideshows"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, background: tab === id ? C.dark : "#fff", color: tab === id ? C.cream : C.muted, border: `1.5px solid ${tab === id ? C.dark : C.border}`, borderRadius: 10, padding: "10px 8px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
          ))}
        </div>

        <div style={{ background: "#eef6e7", border: `1px solid ${C.light}`, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, color: "#2e3d28", marginBottom: 14 }}>
          {tab === "hotlist"
            ? <>A <strong>weekly hot list</strong> you share with your top customers — add this week's items and the same link updates, keeping prior weeks on record.</>
            : tab === "personalized"
            ? <>One-off <strong>personalized</strong> lists for an individual customer — same idea, just addressed to one person.</>
            : <>Slideshow links created from <strong>Trade Show</strong> photos. See who's opened each one and which items they ♥'d.</>}
        </div>

        {tab !== "slideshow" && <button onClick={makeNew} style={{ background: C.dark, color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>＋ New {tab === "hotlist" ? "hot list" : "personalized list"}</button>}

        {loading ? <div style={{ color: C.muted, textAlign: "center", padding: 30 }}>Loading…</div>
          : !list.length ? <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "30px 0" }}>{tab === "slideshow" ? "No slideshow links yet — create one from Trade Show photos." : "None yet — tap ＋ New to start."}</div>
          : list.map(g => {
            const st = statsFor(g.id);
            return (
              <div key={g.id} onClick={() => setOpenId(g.id)} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14.5, color: C.dark, ...wrap }}>{g.title || "Untitled"}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    {g.recipient ? `For ${g.recipient} · ` : ""}{(g.items || []).length} item{(g.items || []).length !== 1 ? "s" : ""} · updated {fmtDate(g.updated_at)}{g.created_by ? ` · ${g.created_by}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, marginTop: 3, fontWeight: 700, color: st.opens ? "#2e5c1e" : "#aab5a2" }}>
                    {st.opens ? <>👁 {st.viewers} viewer{st.viewers !== 1 ? "s" : ""} · {st.opens} open{st.opens !== 1 ? "s" : ""}{st.last ? ` · last ${fmtDate(st.last)}` : ""}{st.picks ? <span style={{ color: C.red }}> · ♥ {st.picks} pick{st.picks !== 1 ? "s" : ""}</span> : ""}</> : "Not opened yet"}
                  </div>
                </div>
                <div style={{ background: "#f0f8eb", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 800, color: "#2e5c1e" }}>Open →</div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Editor: add items (photo + comment), grouped by week; share link ────────────
function HotListEditor({ gallery, displayName, onBack, onChanged }) {
  const sb = getSupabase();
  const [g, setG] = useState(gallery);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visits, setVisits] = useState([]);
  const [favs, setFavs] = useState([]);
  useEffect(() => { setG(gallery); }, [gallery]);
  useEffect(() => {
    if (!sb) return; let ok = true;
    (async () => {
      const [{ data: vs }, { data: fs }] = await Promise.all([
        sb.from("gallery_visits").select("visitor,name,created_at").eq("gallery_id", gallery.id),
        sb.from("gallery_favorites").select("item_id,visitor,name,created_at").eq("gallery_id", gallery.id),
      ]);
      if (ok) { setVisits(vs || []); setFavs(fs || []); }
    })();
    return () => { ok = false; };
  }, [sb, gallery.id]);
  const favsByItem = {}; favs.forEach(f => { (favsByItem[f.item_id] = favsByItem[f.item_id] || []).push(f); });
  const pickerLabel = f => f.name || "A customer";
  const lastOpen = visits.map(v => v.created_at).sort().pop();
  const viewers = new Set(visits.map(v => v.visitor)).size;
  const link = shareUrlFor(g.id);
  const isHot = g.kind === "hotlist";

  async function persist(items) {
    setG(x => ({ ...x, items }));
    await updateGallery(g.id, { items });
    onChanged && onChanged();
  }
  async function addItems(files, caption, wk) {
    const list = Array.from(files || []).filter(f => f.type && f.type.startsWith("image/"));
    if (!list.length) return;
    const added = [];
    for (const f of list) {
      const id = uid();
      let url = null, thumb = null;
      try {
        const blob = await compressImage(f);
        const path = `hotlist/${g.id}/${id}.jpg`;
        const { error } = await sb.storage.from("tradeshow-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (!error) url = sb.storage.from("tradeshow-photos").getPublicUrl(path).data.publicUrl;
        // tiny thumb rendition so the shared viewer's strip + placeholders paint instantly
        const tBlob = await compressImage(f, 240, 0.68);
        const tPath = `hotlist/${g.id}/${id}__thumb.jpg`;
        const { error: tErr } = await sb.storage.from("tradeshow-photos").upload(tPath, tBlob, { contentType: "image/jpeg", upsert: true });
        if (!tErr) thumb = sb.storage.from("tradeshow-photos").getPublicUrl(tPath).data.publicUrl;
      } catch { /* skip */ }
      added.push({ id, url, view: url, thumb, caption: list.length === 1 ? (caption || "") : "", week: isHot ? wk : null, sort: (g.items || []).length + added.length, addedBy: displayName || null });
    }
    await persist([...(g.items || []), ...added]);
  }
  const setCaption = (id, v) => persist((g.items || []).map(it => it.id === id ? { ...it, caption: v } : it));
  const removeItem = id => { if (window.confirm("Remove this item?")) persist((g.items || []).filter(it => it.id !== id)); };
  async function copy() { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { window.prompt("Copy link:", link); } }
  async function share() { try { if (navigator.share) await navigator.share({ title: g.title || "Hoosier Boy Greenhouse", text: `${g.title || "Hot List"} — Hoosier Boy Greenhouse`, url: link }); else copy(); } catch { /* cancelled */ } }
  async function rename() { const n = window.prompt("Title", g.title || ""); if (n && n.trim()) { setG(x => ({ ...x, title: n.trim() })); await updateGallery(g.id, { title: n.trim() }); onChanged && onChanged(); } }

  const items = [...(g.items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const groups = [];
  if (isHot) { const bw = {}; items.forEach(it => { const w = it.week || "—"; (bw[w] = bw[w] || []).push(it); }); Object.keys(bw).sort().reverse().forEach((w, i) => groups.push({ week: w, latest: i === 0, items: bw[w] })); }
  else groups.push({ items });

  const tile = it => (
    <div key={it.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, position: "relative" }}>
      {it.url && <img src={thumbSrc(it)} alt="" loading="lazy" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />}
      {(favsByItem[it.id] || []).length > 0 && (
        <div title={(favsByItem[it.id] || []).map(pickerLabel).join(", ")} style={{ position: "absolute", top: 8, right: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 800, color: C.red, boxShadow: "0 1px 5px rgba(0,0,0,.15)" }}>
          ♥ {(favsByItem[it.id] || []).length}<span style={{ color: C.muted, fontWeight: 700 }}> {(favsByItem[it.id] || []).slice(0, 2).map(pickerLabel).join(", ")}{(favsByItem[it.id] || []).length > 2 ? "…" : ""}</span>
        </div>
      )}
      <div style={{ padding: 8 }}>
        <textarea value={it.caption || ""} onChange={e => setCaption(it.id, e.target.value)} placeholder="Comment about this product…" rows={2}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: "1.5px solid #c8d8c0", borderRadius: 8, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
          <span style={{ fontSize: 10.5, color: "#aabba0" }}>{it.addedBy ? `— ${it.addedBy}` : ""}</span>
          <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: "#e0b0a0", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <div style={{ background: C.dark, padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <div style={{ color: C.cream, fontWeight: 800, fontSize: 15, flex: 1, ...wrap }}>{g.title || "Hot List"}</div>
        <button onClick={rename} title="Rename" style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 15, cursor: "pointer" }}>✎</button>
      </div>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "14px 14px 40px" }}>
        {g.recipient && <div style={{ fontSize: 13, color: C.light, fontWeight: 800, marginBottom: 10 }}>For {g.recipient}</div>}

        {/* Share */}
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: 6 }}>Shareable link</div>
          <div style={{ fontSize: 12, color: "#2e5c1e", wordBreak: "break-all", marginBottom: 8 }}>{link}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={share} style={{ flex: 2, background: C.light, color: "#fff", border: "none", borderRadius: 9, padding: 11, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>📤 Text / Email</button>
            <button onClick={copy} style={{ flex: 1, background: "#fff", color: C.dark, border: `1.5px solid ${C.dark}`, borderRadius: 9, padding: 11, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{copied ? "Copied!" : "Copy"}</button>
            <a href={link} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", padding: "0 8px", fontSize: 12.5, color: "#2b6cb0", fontWeight: 700 }}>Preview ›</a>
          </div>
        </div>

        {/* Engagement — who's opened it + what they ♥'d */}
        <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .4, marginBottom: 6 }}>Customer activity</div>
          {!visits.length && !favs.length
            ? <div style={{ fontSize: 12.5, color: "#aab5a2" }}>Not opened yet — you'll see opens and ♥ picks here once it's viewed.</div>
            : <>
              <div style={{ fontSize: 13, color: "#2e5c1e", fontWeight: 700 }}>👁 {viewers} viewer{viewers !== 1 ? "s" : ""} · {visits.length} open{visits.length !== 1 ? "s" : ""}{lastOpen ? ` · last ${new Date(lastOpen).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</div>
              {favs.length > 0 && (() => {
                const byPicker = {}; favs.forEach(f => { const k = pickerLabel(f); (byPicker[k] = byPicker[k] || []).push(f); });
                return (
                  <div style={{ marginTop: 6 }}>
                    {Object.entries(byPicker).map(([who, fs2]) => (
                      <div key={who} style={{ fontSize: 12.5, color: C.dark, marginTop: 2 }}>
                        <span style={{ color: C.red, fontWeight: 800 }}>♥ {fs2.length}</span> — <strong>{who}</strong>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>♥ counts also show on each item below.</div>
                  </div>
                );
              })()}
            </>}
        </div>

        <AddItem adding={adding} setAdding={setAdding} isHot={isHot} onAdd={addItems} />

        {groups.map((grp, gi) => (
          <div key={gi}>
            {isHot && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 8px" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: grp.latest ? C.red : C.muted, textTransform: "uppercase", letterSpacing: .5 }}>{grp.latest ? "This week" : (grp.week === "—" ? "Earlier" : weekLabel(grp.week))}</span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>}
            {grp.items.map(tile)}
          </div>
        ))}
        {!items.length && <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No items yet — add your first above.</div>}
      </div>
    </div>
  );
}

function AddItem({ adding, setAdding, isHot, onAdd }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState(0);
  const oneRef = useRef(null), manyRef = useRef(null);
  function pick(f) { if (!f || !f.type.startsWith("image/")) return; setFile(f); const r = new FileReader(); r.onload = e => setPreview(e.target.result); r.readAsDataURL(f); }
  async function saveOne() { if (!file) return; setBusy(true); await onAdd([file], caption, currentWeek()); setBusy(false); setFile(null); setPreview(null); setCaption(""); }
  async function saveMany(files) { const list = Array.from(files || []); if (!list.length) return; setBatch(list.length); await onAdd(list, "", currentWeek()); setBatch(0); }

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${C.light}`, borderRadius: 12, padding: 12, marginBottom: 6 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2e5c1e", marginBottom: 8 }}>＋ Add {isHot ? "this week's" : "an"} item</div>
      {preview
        ? <img src={preview} onClick={() => oneRef.current?.click()} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 10, background: "#f0f5ee", marginBottom: 8, cursor: "pointer" }} />
        : <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <label style={{ flex: 1, textAlign: "center", background: "#f4faf0", border: "2px dashed #7fb069", borderRadius: 10, padding: "16px 8px", color: "#2e5c1e", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
              📷 Photo + comment
              <input ref={oneRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
            </label>
            <label style={{ flex: 1, textAlign: "center", background: "#eaf1fb", border: "2px dashed #4a90d9", borderRadius: 10, padding: "16px 8px", color: "#2b6cb0", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
              {batch > 0 ? `Uploading ${batch}…` : "🖼 Upload several"}
              <input ref={manyRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { saveMany(e.target.files); e.target.value = ""; }} />
            </label>
          </div>}
      {preview && (<>
        <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Comment about the product — pricing, availability, why it's hot…" rows={3}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveOne} disabled={busy} style={{ flex: 1, background: busy ? "#a9c795" : C.light, color: "#fff", border: "none", borderRadius: 9, padding: 12, fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "✓ Add to list"}</button>
          <button onClick={() => { setFile(null); setPreview(null); setCaption(""); }} style={{ background: "#fff", border: "1.5px solid #c8d8c0", borderRadius: 9, padding: "12px 16px", fontWeight: 700, color: C.muted, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </>)}
    </div>
  );
}
