// ItemPhotos — the per-item photo gallery (2026-07-27 spec §9). Camera-first capture,
// every shot auto-stamped date · time · who; per-photo →B2B tag gates flow into the
// sales catalog pool. Reused by ItemDrill (combo page) and FamilyPage.
import { useState, useEffect, useRef } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#f3f8ee", creamBr: "#cfe3bd",
  muted: "#7a8c74", amber: "#c9812a", border: "#e4ecdd", chip: "#eaf2e0" };

function compressPhoto(file, maxDim = 1600, quality = 0.82) {
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

const stamp = ts => {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

export default function ItemPhotos({ plan, itemName }) {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState(null);   // photo row for the lightbox
  const camRef = useRef(), libRef = useRef();

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("item_photos").select("*")
        .eq("plan_id", plan.id).eq("item_name", itemName).order("taken_at", { ascending: false });
      setPhotos(data || []);
    })();
  }, [sb, plan.id, itemName]); // eslint-disable-line

  async function addFiles(files) {
    if (!files?.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const blob = await compressPhoto(f);
        const id = crypto.randomUUID();
        const path = `${plan.id}/${encodeURIComponent(itemName).slice(0, 60)}/${id}.jpg`;
        const { error } = await sb.storage.from("item-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
        if (error) { window.alert("Upload failed: " + error.message); continue; }
        const url = sb.storage.from("item-photos").getPublicUrl(path).data.publicUrl;
        const rowIns = { id, plan_id: plan.id, item_name: itemName, storage_path: path, url, taken_by: displayName || null, b2b: false };
        const { error: e2 } = await sb.from("item_photos").insert(rowIns);
        if (e2) { window.alert("Photo record failed: " + e2.message); continue; }
        setPhotos(p => [{ ...rowIns, taken_at: new Date().toISOString() }, ...(p || [])]);
      } catch (e) { window.alert("Photo failed: " + e.message); }
    }
    setBusy(false);
  }

  async function toggleB2B(p) {
    const b2b = !p.b2b;
    await sb.from("item_photos").update({ b2b }).eq("id", p.id);
    setPhotos(ps => ps.map(x => x.id === p.id ? { ...x, b2b } : x));
  }
  async function del(p) {
    if (!window.confirm("Remove this photo? The image is deleted from storage too.")) return;
    await sb.from("item_photos").delete().eq("id", p.id);
    try { await sb.storage.from("item-photos").remove([p.storage_path]); } catch { /* record is gone either way */ }
    setPhotos(ps => ps.filter(x => x.id !== p.id));
    if (light?.id === p.id) setLight(null);
  }

  const btn = (primary) => ({ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800,
    padding: "8px 13px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
    background: primary ? C.light : "#fff", color: primary ? "#fff" : C.dark,
    border: primary ? "0" : `1.5px solid ${C.creamBr}` });

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 12.5, color: C.dark }}>📸 Photos</b>
        <span style={{ fontSize: 10.5, color: C.muted }}>auto-stamped · tag the good ones B2B → sales catalog</span>
        <span style={{ flex: 1 }} />
        <label style={btn(true)}>📷 Camera
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
            onChange={e => { addFiles([...e.target.files]); e.target.value = ""; }} />
        </label>
        <label style={btn(false)}>🖼 Library
          <input ref={libRef} type="file" accept="image/*" multiple hidden
            onChange={e => { addFiles([...e.target.files]); e.target.value = ""; }} />
        </label>
      </div>

      {photos === null && <div style={{ color: C.muted, fontSize: 12, padding: "10px 2px" }}>Loading photos…</div>}
      {photos && !photos.length && <div style={{ color: C.muted, fontSize: 12, padding: "10px 2px" }}>No photos yet — shoot the finished product, the bench, the problems. Next season you'll wish you had.</div>}
      {busy && <div style={{ color: C.amber, fontSize: 11.5, padding: "6px 2px" }}>Uploading…</div>}

      {!!photos?.length && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(108px,1fr))", gap: 8, marginTop: 10 }}>
          {photos.map(p => (
            <div key={p.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1",
              border: `1px solid ${C.creamBr}`, background: C.cream, cursor: "pointer" }}>
              <img src={p.url} alt="" loading="lazy" onClick={() => setLight(p)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <button onClick={e => { e.stopPropagation(); toggleB2B(p); }}
                title={p.b2b ? "in the B2B catalog pool — click to remove" : "tag for the B2B catalog"}
                style={{ position: "absolute", top: 5, right: 5, fontSize: 9, fontWeight: 800, borderRadius: 5,
                  padding: "2px 6px", cursor: "pointer", fontFamily: "inherit",
                  background: p.b2b ? C.light : "rgba(255,255,255,.92)", color: p.b2b ? "#fff" : C.muted,
                  border: `1px solid ${p.b2b ? C.light : C.creamBr}` }}>{p.b2b ? "B2B ✓" : "→ B2B"}</button>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 6px 4px",
                background: "linear-gradient(transparent, rgba(20,30,16,.88))", color: "#fff",
                fontSize: 8.5, fontFamily: "ui-monospace,Menlo,monospace", lineHeight: 1.5, pointerEvents: "none" }}>
                📅 {stamp(p.taken_at)}<br />👤 {p.taken_by || "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {light && (
        <div onClick={e => { e.stopPropagation(); setLight(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(20,30,16,.75)", zIndex: 9400,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 13, maxWidth: 640, width: "100%", padding: 10 }}>
            <img src={light.url} alt="" style={{ width: "100%", borderRadius: 9, display: "block" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 11.5, color: C.muted,
              fontFamily: "ui-monospace,Menlo,monospace", flexWrap: "wrap" }}>
              <span>📅 {stamp(light.taken_at)} · 👤 {light.taken_by || "—"}{light.b2b ? " · in B2B catalog" : ""}</span>
              <span style={{ flex: 1 }} />
              <button onClick={() => del(light)} style={{ background: "none", border: `1.5px solid ${C.border}`,
                borderRadius: 7, padding: "4px 10px", color: "#c0492b", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>🗑 Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
