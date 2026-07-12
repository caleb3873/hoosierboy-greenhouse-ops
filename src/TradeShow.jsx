import { useState, useEffect, useRef } from "react";
import { useTable, getSupabase } from "./supabase";
import { useAuth } from "./Auth";

// Resize + JPEG-compress a phone photo in the browser BEFORE upload (fast on a weak
// booth connection). Falls back to the original file if anything fails.
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

// ── STORAGE KEY ────────────────────────────────────────────────────────────────
// Supabase (tradeshow_sessions + tradeshow-photos bucket) is the source of truth; localStorage is a
// read-through MIRROR so the home-widget helpers below stay fast and offline-friendly.
const STORAGE_KEY    = "gh_tradeshow_sessions_v1";
const VIEWED_KEY     = "gh_tradeshow_viewed_v1";

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveSessions(sessions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch {}
}
export function getViewedTimes() {
  try { return JSON.parse(localStorage.getItem(VIEWED_KEY) || "{}"); } catch { return {}; }
}
function markSessionViewed(sessionId) {
  try {
    const v = getViewedTimes();
    v[sessionId] = Date.now();
    localStorage.setItem(VIEWED_KEY, JSON.stringify(v));
  } catch {}
}
export function getUnviewedPhotoCount() {
  const sessions = loadSessions();
  const viewed   = getViewedTimes();
  let count = 0;
  sessions.forEach(s => {
    const lastViewed = viewed[s.id] || 0;
    count += (s.photos || []).filter(p => p.capturedAt > lastViewed).length;
  });
  return count;
}
export function getRecentPhotos(limit) {
  const n = limit || 8;
  const sessions = loadSessions();
  const all = sessions.flatMap(s =>
    (s.photos || []).map(p => ({ ...p, sessionName: s.name, sessionId: s.id, sessionDate: s.date, sessionType: s.type }))
  );
  return all.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, n);
}
// Returns sessions with photos, sorted by most recent photo, for the home widget
export function getSessionsWithPhotos() {
  const sessions = loadSessions();
  return sessions
    .filter(s => (s.photos || []).length > 0)
    .sort((a, b) => {
      const latestA = Math.max(...(a.photos || []).map(p => p.capturedAt || 0), Number(a.createdAt) || 0);
      const latestB = Math.max(...(b.photos || []).map(p => p.capturedAt || 0), Number(b.createdAt) || 0);
      return latestB - latestA;
    });
}
const uid = () => crypto.randomUUID();

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export default function TradeShow() {
  const { rows: sessions, update, remove, upsert, loading } = useTable("tradeshow_sessions", { orderBy: "created_at", ascending: false });
  const [view, setView]         = useState("list"); // list | session | capture | quickshot
  const [mainTab, setMainTab]   = useState(() => { try { return sessionStorage.getItem("ts_maintab_v1") || "sessions"; } catch { return "sessions"; } }); // sessions | gallery — remembered across refresh
  useEffect(() => { try { sessionStorage.setItem("ts_maintab_v1", mainTab); } catch {} }, [mainTab]);
  const [activeId, setActiveId] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const localAtMount = useRef(loadSessions()); // capture device-trial sessions before the mirror runs
  const migrated     = useRef(false);

  // Mirror the live rows into localStorage (only after the DB has loaded, so we never clobber the
  // device-trial sessions before they're migrated) — keeps the home-widget helpers fast + offline.
  useEffect(() => { if (!loading) saveSessions(sessions || []); }, [sessions, loading]);

  // One-time migration: push any device-only trial sessions into Supabase (idempotent by id).
  useEffect(() => {
    if (loading || migrated.current) return;
    migrated.current = true;
    const dbIds = new Set((sessions || []).map(s => s.id));
    (localAtMount.current || []).filter(s => s && s.id && !dbIds.has(s.id))
      .forEach(s => upsert({ id: s.id, name: s.name, date: s.date, time: s.time, location: s.location, type: s.type, photos: s.photos || [] }));
  }, [loading, sessions, upsert]);

  async function createSession({ name, date, time, location, type }) {
    const id = uid();
    await upsert({ id, name: name.trim(), date, time, location: (location || "").trim(), type, photos: [] });
    setActiveId(id);
    setShowNewModal(false);
    setView(type === "quickshot" ? "capture" : "session");
  }

  function deleteSession(id) {
    if (!window.confirm("Delete this session and all its photos?")) return;
    remove(id);
    if (activeId === id) { setActiveId(null); setView("list"); }
  }

  function updateSession(id, changes) { update(id, changes); }

  function addPhoto(sessionId, photo) {
    const s = (sessions || []).find(x => x.id === sessionId); if (!s) return;
    update(sessionId, { photos: [...(s.photos || []), photo] });
  }

  function updatePhoto(sessionId, photoId, changes) {
    const s = (sessions || []).find(x => x.id === sessionId); if (!s) return;
    update(sessionId, { photos: (s.photos || []).map(p => p.id === photoId ? { ...p, ...changes } : p) });
  }

  function deletePhoto(sessionId, photoId) {
    const s = (sessions || []).find(x => x.id === sessionId); if (!s) return;
    update(sessionId, { photos: (s.photos || []).filter(p => p.id !== photoId) });
  }

  const activeSession = (sessions || []).find(s => s.id === activeId);

  // Mark viewed when session opens
  useEffect(() => {
    if (activeId && view === "session") markSessionViewed(activeId);
  }, [activeId, view]);

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", background: "#f2f5ef", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />

      {/* NAV */}
      <div style={{ background: "#1e2d1a", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view !== "list" && (
            <button onClick={() => { setView("list"); setActiveId(null); }}
              style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 0, marginRight: 4 }}>←</button>
          )}
          <div style={{ fontSize: 11, color: "#7a9a6a", letterSpacing: 1.2, textTransform: "uppercase" }}>
            {view === "list" ? "Trade Show / Trial Day" : view === "capture" ? "📸 Capture" : activeSession?.name || "Session"}
          </div>
        </div>
        {view === "session" && activeSession && (
          <button onClick={() => setView("capture")}
            style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            📸 Add Photo
          </button>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── NEW SESSION MODAL ── */}
        {showNewModal && (
          <NewSessionModal
            onCreate={createSession}
            onClose={() => setShowNewModal(false)}
          />
        )}

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            {/* Tabs: my own sessions vs the shared show gallery (photos from the capture app) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[["sessions", "🎪 My Sessions"], ["gallery", "🌸 Show Gallery"]].map(([id, label]) => (
                <button key={id} onClick={() => setMainTab(id)}
                  style={{ flex: 1, background: mainTab === id ? "#1e2d1a" : "#fff", color: mainTab === id ? "#c8e6b8" : "#7a8c74", border: `1.5px solid ${mainTab === id ? "#1e2d1a" : "#e0ead8"}`, borderRadius: 10, padding: "11px 12px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              ))}
            </div>

            {mainTab === "gallery" && <ShowGallery />}

            {mainTab === "sessions" && (<>
            {/* Action buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <button onClick={() => setShowNewModal(true)}
                style={{ background: "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 12, padding: "18px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎪</div>
                <div>Start Event Session</div>
                <div style={{ fontSize: 11, color: "#7a9a6a", marginTop: 3, fontWeight: 400 }}>Trade show, trial day, broker visit</div>
              </button>
              <button onClick={() => {
                createSession({
                  name: "Inspiration Photo",
                  date: new Date().toISOString().split("T")[0],
                  time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                  location: "",
                  type: "quickshot",
                });
              }}
                style={{ background: "#fff", color: "#1e2d1a", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "18px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
                <div>Quick Shot</div>
                <div style={{ fontSize: 11, color: "#aabba0", marginTop: 3, fontWeight: 400 }}>Single inspiration photo, no event needed</div>
              </button>
            </div>

            {/* Session list */}
            {sessions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#aabba0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No sessions yet</div>
                <div style={{ fontSize: 13 }}>Start a new trade show or trial day above</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sessions.map(s => {
                  const selected = s.photos.filter(p => p.selected).length;
                  return (
                    <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", overflow: "hidden", cursor: "pointer" }}
                      onClick={() => { setActiveId(s.id); setView("session"); }}>
                      {/* Photo strip preview */}
                      {s.photos.length > 0 && (
                        <div style={{ display: "flex", gap: 2, height: 72, overflow: "hidden" }}>
                          {s.photos.slice(0, 5).map((p, pi) => (
                            <img key={p.id} src={p.url || p.imgData} alt=""
                              style={{ flex: 1, minWidth: 0, objectFit: "cover", display: "block" }} />
                          ))}
                          {s.photos.length === 0 && <div style={{ flex: 1, background: "#f0f5ee" }} />}
                        </div>
                      )}
                      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontSize: s.type === "quickshot" ? 22 : 28, flexShrink: 0 }}>
                          {s.type === "quickshot" ? "⚡" : "🎪"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: "#1e2d1a" }}>{s.name}</span>
                            {s.type === "quickshot" && <span style={{ fontSize: 9, fontWeight: 800, background: "#f0f5ee", color: "#7a8c74", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: .5 }}>Quick Shot</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#7a8c74", marginTop: 3 }}>
                            {new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {s.time && <span> · {s.time}</span>}
                            {s.location && <span> · 📍 {s.location}</span>}
                            <span> · {s.photos.length} photo{s.photos.length !== 1 ? "s" : ""}</span>
                            {selected > 0 && <span style={{ color: "#7fb069", fontWeight: 700 }}> · {selected} selected</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={e => { e.stopPropagation(); deleteSession(s.id); }}
                            style={{ background: "none", border: "1px solid #f0d0c0", borderRadius: 7, padding: "5px 12px", fontSize: 12, color: "#c87060", cursor: "pointer", fontFamily: "inherit" }}>
                            Delete
                          </button>
                          <div style={{ background: "#f0f8eb", borderRadius: 7, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#2e5c1e" }}>Open →</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>)}
          </>
        )}

        {/* ── CAPTURE VIEW ── */}
        {view === "capture" && activeSession && (
          <CaptureView
            session={activeSession}
            onAdd={(photo) => { addPhoto(activeSession.id, photo); setView("session"); }}
            onCancel={() => setView("session")}
          />
        )}

        {/* ── SESSION VIEW ── */}
        {view === "session" && activeSession && (
          <SessionView
            session={activeSession}
            onUpdatePhoto={(photoId, changes) => updatePhoto(activeSession.id, photoId, changes)}
            onDeletePhoto={(photoId) => deletePhoto(activeSession.id, photoId)}
            onAddMore={() => setView("capture")}
          />
        )}
      </div>
    </div>
  );
}

// ── SHOW GALLERY ──────────────────────────────────────────────────────────────
// Read-only booth photos shared from the capture app (separate project), via the
// cross-project culture client. Photos crew members snap on their phones at the show
// flow into the same tables and appear here automatically. The upload PIN never
// touches this UI — the public views can't expose it, so don't hardcode it here.
const INTEREST = {
  must_have:  { label: "🔥 Must have", bg: "#d94f3d", fg: "#fff" },
  interested: { label: "Interested",   bg: "#7fb069", fg: "#fff" },
  maybe:      { label: "Maybe",        bg: "#e89a3a", fg: "#fff" },
  pass:       { label: "Pass",         bg: "#c8d0c2", fg: "#5a6a54" },
};
const interestOf = v => INTEREST[v] || (v ? { label: String(v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), bg: "#7a8c74", fg: "#fff" } : null);
const fmtShowDate = iso => iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

function ShowGallery() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const [events, setEvents]   = useState([]);
  const [eventId, setEventId] = useState(null);
  const [photos, setPhotos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [mustOnly, setMustOnly] = useState(false);
  const [vendor, setVendor]   = useState("all");
  const [lightbox, setLightbox] = useState(null);
  const [newShowOpen, setNewShowOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const activeEvent = events.find(e => e.id === eventId) || null;

  const loadEvents = async (selectId) => {
    const { data } = await sb.from("trade_show_events").select("*").order("is_active", { ascending: false }).order("created_at", { ascending: false });
    const list = data || [];
    setEvents(list);
    setEventId(prev => selectId || prev || (list.find(e => e.is_active) || list[0] || {}).id || null);
    if (!list.length) setLoading(false);
    return list;
  };
  const loadPhotos = async (id) => {
    if (!id) { setPhotos([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await sb.from("trade_show_photos").select("*").eq("event_id", id).order("created_at", { ascending: false });
    setPhotos(data || []);
    setLoading(false);
  };
  useEffect(() => { loadEvents(); }, []); // eslint intentionally: run once
  useEffect(() => { if (eventId) { setVendor("all"); loadPhotos(eventId); } else { setLoading(false); } }, [eventId]);

  async function createShow({ name, starts, ends }) {
    const id = crypto.randomUUID();
    await sb.from("trade_show_events").insert({ id, name, starts_on: starts || null, ends_on: ends || null, is_active: true, created_by: displayName || null });
    setNewShowOpen(false);
    await loadEvents(id);
  }
  async function addPhoto({ file, vendor_name, variety_name, interest_level, notes, uploader_name }) {
    const id = crypto.randomUUID();
    let image_url = null, storage_path = null;
    if (file) {
      const blob = await compressPhoto(file);
      const path = `showphotos/${eventId}/${id}.jpg`;
      const { error } = await sb.storage.from("tradeshow-photos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
      if (error) { window.alert("Photo upload failed: " + error.message); return false; }
      image_url = sb.storage.from("tradeshow-photos").getPublicUrl(path).data.publicUrl;
      storage_path = path;
    }
    const { error } = await sb.from("trade_show_photos").insert({ id, event_id: eventId, uploader_name: uploader_name || displayName || null, vendor_name: vendor_name || null, variety_name: variety_name || null, interest_level: interest_level || null, notes: notes || null, image_url, storage_path });
    if (error) { window.alert("Couldn't save: " + error.message); return false; }
    await loadPhotos(eventId); // modal decides whether to close (Save & close vs Save & add another)
    return true;
  }
  async function deletePhoto(p) {
    if (!window.confirm("Delete this photo?")) return;
    await sb.from("trade_show_photos").delete().eq("id", p.id);
    if (p.storage_path) sb.storage.from("tradeshow-photos").remove([p.storage_path]);
    setLightbox(null);
    await loadPhotos(eventId);
  }
  async function toggleActive() {
    if (!activeEvent) return;
    await sb.from("trade_show_events").update({ is_active: !activeEvent.is_active }).eq("id", activeEvent.id);
    await loadEvents(activeEvent.id);
  }
  async function deleteShow() {
    if (!activeEvent) return;
    if (!window.confirm(`Delete "${activeEvent.name}" and all ${photos.length} of its photos? This can't be undone.`)) return;
    await sb.from("trade_show_events").delete().eq("id", activeEvent.id);
    setEventId(null);
    const list = await loadEvents();
    if (!list.length) setPhotos([]);
  }

  const vendors = [...new Set(photos.map(p => p.vendor_name).filter(Boolean))].sort();
  const shown = photos.filter(p => (!mustOnly || p.interest_level === "must_have") && (vendor === "all" || p.vendor_name === vendor));

  const card = { background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, overflow: "hidden", cursor: "pointer" };
  const pill = (on) => ({ background: on ? "#1e2d1a" : "#fff", color: on ? "#c8e6b8" : "#5a6a54", border: `1.5px solid ${on ? "#1e2d1a" : "#e0ead8"}`, borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div>
      {/* Event selector + new show */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        {events.map(e => (
          <button key={e.id} onClick={() => setEventId(e.id)}
            style={{ ...pill(e.id === eventId), display: "flex", alignItems: "center", gap: 6 }}>
            {e.name}{!e.is_active && <span style={{ fontSize: 9, opacity: .7 }}>(past)</span>}
          </button>
        ))}
        <button onClick={() => setNewShowOpen(true)}
          style={{ background: "#fff", color: "#2e5c1e", border: "1.5px dashed #7fb069", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ New show</button>
      </div>

      {!events.length && !loading && (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#aabba0" }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>🌸</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No shows yet</div>
          <div style={{ fontSize: 13 }}>Tap <strong style={{ color: "#2e5c1e" }}>＋ New show</strong> to start capturing booth photos.</div>
        </div>
      )}

      {/* Event header + add photo */}
      {activeEvent && (
        <div style={{ background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1e2d1a" }}>{activeEvent.name}</div>
            <div style={{ fontSize: 11.5, color: "#7a8c74", marginTop: 2 }}>
              <span onClick={toggleActive} title="Toggle live / past" style={{ cursor: "pointer", fontWeight: 800, color: activeEvent.is_active ? "#2e5c1e" : "#7a8c74" }}>{activeEvent.is_active ? "● Live" : "○ Past"}</span>
              {activeEvent.starts_on && <span> · {fmtShowDate(activeEvent.starts_on)}{activeEvent.ends_on && activeEvent.ends_on !== activeEvent.starts_on ? `–${fmtShowDate(activeEvent.ends_on)}` : ""}</span>}
              <span> · {photos.length} photo{photos.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button onClick={() => setAddOpen(true)}
            style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>📷 Add photo</button>
          <button onClick={() => loadPhotos(eventId)} title="Refresh"
            style={{ background: "#f2f5ef", color: "#5a6a54", border: "1.5px solid #e0ead8", borderRadius: 9, padding: "10px 13px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>↻</button>
          <button onClick={deleteShow} title="Delete show"
            style={{ background: "none", color: "#c87060", border: "1px solid #f0d0c0", borderRadius: 9, padding: "10px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
        </div>
      )}

      {/* Filters */}
      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <button onClick={() => setMustOnly(m => !m)} style={pill(mustOnly)}>🔥 Must-haves only</button>
          {vendors.length > 1 && (
            <select value={vendor} onChange={e => setVendor(e.target.value)}
              style={{ background: "#fff", color: "#1e2d1a", border: "1.5px solid #e0ead8", borderRadius: 999, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}>
              <option value="all">All booths ({vendors.length})</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <span style={{ fontSize: 12, color: "#7a8c74", fontWeight: 700 }}>{shown.length} shown</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#aabba0", fontSize: 14 }}>Loading photos…</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#aabba0", fontSize: 13.5 }}>
          {photos.length === 0 ? "No photos yet — take some at the booth." : "No photos match these filters."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {shown.map(p => {
            const it = interestOf(p.interest_level);
            return (
              <div key={p.id} style={card} onClick={() => setLightbox(p)}>
                <div style={{ position: "relative", background: "#f0f5ee" }}>
                  <img src={p.image_url} alt={p.variety_name || "booth photo"} loading="lazy"
                    style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
                  {it && <span style={{ position: "absolute", top: 6, left: 6, background: it.bg, color: it.fg, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999 }}>{it.label}</span>}
                </div>
                <div style={{ padding: "9px 11px" }}>
                  {p.vendor_name && <div style={{ fontSize: 11, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .3 }}>{p.vendor_name}</div>}
                  {p.variety_name && <div style={{ fontSize: 13.5, fontWeight: 800, color: "#1e2d1a", marginTop: 1, lineHeight: 1.25 }}>{p.variety_name}</div>}
                  {p.notes && <div style={{ fontSize: 11.5, color: "#5a6a54", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.notes}</div>}
                  {p.uploader_name && <div style={{ fontSize: 10.5, color: "#aabba0", marginTop: 5 }}>— {p.uploader_name}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 10000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, overflow: "auto" }}>
          <img src={lightbox.image_url} alt={lightbox.variety_name || ""} style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 10 }} onClick={e => e.stopPropagation()} />
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", marginTop: 14, maxWidth: 480, width: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {interestOf(lightbox.interest_level) && <span style={{ background: interestOf(lightbox.interest_level).bg, color: interestOf(lightbox.interest_level).fg, fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 999 }}>{interestOf(lightbox.interest_level).label}</span>}
              {lightbox.vendor_name && <span style={{ fontSize: 12, fontWeight: 800, color: "#7a8c74", textTransform: "uppercase" }}>{lightbox.vendor_name}</span>}
            </div>
            {lightbox.variety_name && <div style={{ fontSize: 17, fontWeight: 800, color: "#1e2d1a", marginTop: 6 }}>{lightbox.variety_name}</div>}
            {lightbox.notes && <div style={{ fontSize: 13.5, color: "#3a4a34", marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{lightbox.notes}</div>}
            {lightbox.uploader_name && <div style={{ fontSize: 12, color: "#aabba0", marginTop: 8 }}>Added by {lightbox.uploader_name}</div>}
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => deletePhoto(lightbox)} style={{ background: "none", border: "1.5px solid #e08070", color: "#ffb3a8", borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🗑 Delete</button>
            <button onClick={() => setLightbox(null)} style={{ background: "#fff", border: "none", borderRadius: 999, padding: "9px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </div>
      )}

      {newShowOpen && <NewShowModal onCreate={createShow} onClose={() => setNewShowOpen(false)} />}
      {addOpen && activeEvent && <AddBoothPhotoModal event={activeEvent} defaultUploader={displayName} onAdd={addPhoto} onClose={() => setAddOpen(false)} />}
    </div>
  );
}

// ── NEW SHOW MODAL ────────────────────────────────────────────────────────────
function NewShowModal({ onCreate, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [starts, setStarts] = useState(today);
  const [ends, setEnds] = useState(today);
  const [busy, setBusy] = useState(false);
  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1.5px solid #c8d8c0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", marginBottom: 12 };
  async function save() { if (!name.trim()) { window.alert("Name the show."); return; } setBusy(true); await onCreate({ name: name.trim(), starts, ends }); setBusy(false); }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 10001, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 18, width: "100%", maxWidth: 440 }}>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a", marginBottom: 14 }}>New show</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 5 }}>Show name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Cultivate '26" autoFocus style={inp} />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 5 }}>Starts</div>
            <input type="date" value={starts} onChange={e => setStarts(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 5 }}>Ends</div>
            <input type="date" value={ends} onChange={e => setEnds(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={save} disabled={busy} style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{busy ? "Creating…" : "Create show"}</button>
          <button onClick={onClose} style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "13px 18px", fontWeight: 700, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── ADD BOOTH PHOTO MODAL ─────────────────────────────────────────────────────
function AddBoothPhotoModal({ event, defaultUploader, onAdd, onClose }) {
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [vendor, setVendor] = useState("");
  const [variety, setVariety] = useState("");
  const [interest, setInterest] = useState("interested");
  const [notes, setNotes] = useState("");
  const [uploader, setUploader] = useState(defaultUploader || "");
  const [busy, setBusy] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const fileRef = useRef(null);
  const dropRef = useRef(null);
  function pick(f) { if (!f || !f.type.startsWith("image/")) return; setFile(f); const r = new FileReader(); r.onload = e => setPreview(e.target.result); r.readAsDataURL(f); }
  // keepOpen = "Save & add another": keeps the caption (vendor/variety/interest/notes), clears just the
  // photo, and puts you back on the camera tile so you can shoot the next pic of the same variety fast.
  async function save(keepOpen) {
    if (!file) { if (!keepOpen) { onClose(); return; } window.alert("Add a photo first."); return; } // Save & close w/ nothing pending → just close
    setBusy(true);
    const ok = await onAdd({ file, vendor_name: vendor.trim(), variety_name: variety.trim(), interest_level: interest, notes: notes.trim(), uploader_name: uploader.trim() });
    setBusy(false);
    if (ok === false) return;
    if (keepOpen) {
      setSavedCount(c => c + 1);
      setFile(null); setPreview(null);
      dropRef.current?.scrollIntoView({ block: "start" });
    } else onClose();
  }
  const inp = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1.5px solid #c8d8c0", borderRadius: 10, fontSize: 15, fontFamily: "inherit", marginBottom: 12 };
  const lbl = { fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", marginBottom: 5 };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 10001, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480, maxHeight: "94vh", overflow: "auto" }}>
        <div ref={dropRef} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "#1e2d1a" }}>Add photo · {event.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, color: "#7a8c74", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {savedCount > 0 && (
          <div style={{ background: "#eef6e7", border: "1px solid #7fb069", color: "#2e5c1e", borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
            ✓ {savedCount} photo{savedCount !== 1 ? "s" : ""} saved to {event.name}. Caption kept — snap the next one, or edit the fields for a different variety.
          </div>
        )}

        {preview
          ? <img src={preview} alt="" onClick={() => fileRef.current?.click()} style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 12, border: "1.5px solid #e0ead8", background: "#f0f5ee", marginBottom: 12, cursor: "pointer" }} />
          : <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, height: 180, border: "2px dashed #7fb069", borderRadius: 12, background: "#f4faf0", color: "#2e5c1e", fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
              <div style={{ fontSize: 40 }}>📷</div>{savedCount > 0 ? "Tap for the next photo" : "Tap to take / choose a photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />
            </label>}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => pick(e.target.files[0])} />

        <div style={lbl}>Vendor / breeder</div>
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g. Dümmen Orange" style={inp} />
        <div style={lbl}>Variety</div>
        <input value={variety} onChange={e => setVariety(e.target.value)} placeholder="e.g. Petunia Itsy Magenta" style={inp} />

        <div style={lbl}>Interest</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
          {["must_have", "interested", "maybe", "pass"].map(k => {
            const it = INTEREST[k], on = interest === k;
            return <button key={k} onClick={() => setInterest(k)} style={{ background: on ? it.bg : "#fff", color: on ? it.fg : "#5a6a54", border: `1.5px solid ${on ? it.bg : "#e0ead8"}`, borderRadius: 999, padding: "8px 13px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{it.label}</button>;
          })}
        </div>

        <div style={lbl}>Notes <span style={{ fontWeight: 400, textTransform: "none" }}>· pricing, rep, availability…</span></div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Rep: Maria — $0.52/URC at 500+. Ships wk 2." style={{ ...inp, resize: "vertical", lineHeight: 1.45 }} />
        <div style={lbl}>Your name</div>
        <input value={uploader} onChange={e => setUploader(e.target.value)} placeholder="Who took this" style={inp} />

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save(true)} disabled={busy} style={{ flex: 2, background: busy ? "#a9c795" : "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>{busy ? "Saving…" : "＋ Save & new"}</button>
          <button onClick={() => save(false)} disabled={busy} style={{ flex: 1, background: "#fff", color: "#1e2d1a", border: "1.5px solid #1e2d1a", borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", fontFamily: "inherit" }}>Save & close</button>
        </div>
      </div>
    </div>
  );
}

// ── CAPTURE VIEW ──────────────────────────────────────────────────────────────
function CaptureView({ session, onAdd, onCancel }) {
  const [imgData,  setImgData ] = useState(null);
  const [file,     setFile    ] = useState(null);
  const [comment,  setComment ] = useState("");
  const [source,   setSource  ] = useState("camera"); // camera | upload
  const [uploading, setUploading] = useState(false);
  const fileRef   = useRef(null);
  const cameraRef = useRef(null);

  function handleFile(f) {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setImgData(e.target.result);
    reader.readAsDataURL(f);
  }

  async function submit() {
    if (!imgData) return;
    const id = uid();
    let url = null;
    if (file) {
      setUploading(true);
      try {
        const ext = ((file.name || "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `${session.id}/${id}.${ext}`;
        const sb = getSupabase();
        const { error } = await sb.storage.from("tradeshow-photos").upload(path, file, { upsert: true, contentType: file.type });
        if (!error) url = sb.storage.from("tradeshow-photos").getPublicUrl(path).data.publicUrl;
      } catch { /* offline → fall back to base64 imgData below */ }
      setUploading(false);
    }
    onAdd({
      id,
      url,                            // Supabase public URL (null if upload failed / no file)
      imgData: url ? null : imgData,  // keep base64 only as an offline fallback
      comment: comment.trim(),
      capturedAt: Date.now(),
      selected: false,
    });
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px" }}>
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 20, color: "#1e2d1a", marginBottom: 6 }}>Add Photo</div>
        <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 20 }}>{session.name}</div>

        {/* Source toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["camera","📷 Camera"],["upload","📁 Upload"]].map(([id, label]) => (
            <button key={id} onClick={() => setSource(id)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: `2px solid ${source === id ? "#7fb069" : "#e0ead8"}`, background: source === id ? "#f0f8eb" : "#fff", color: source === id ? "#2e5c1e" : "#7a8c74", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Image capture area */}
        {!imgData ? (
          <div
            onClick={() => {
              if (source === "camera") cameraRef.current?.click();
              else fileRef.current?.click();
            }}
            style={{ border: "2px dashed #c8d8c0", borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: "#fafcf8", marginBottom: 20 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{source === "camera" ? "📷" : "📁"}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1e2d1a", marginBottom: 6 }}>
              {source === "camera" ? "Open Camera" : "Choose Photo"}
            </div>
            <div style={{ fontSize: 12, color: "#aabba0" }}>
              {source === "camera" ? "Tap to take a photo" : "Select from your device"}
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ marginBottom: 20, position: "relative" }}>
            <img src={imgData} alt="Preview" style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, border: "1.5px solid #e0ead8", background: "#f0f5ee" }} />
            <button onClick={() => { setImgData(null); setFile(null); }}
              style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: 20, width: 28, height: 28, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ×
            </button>
          </div>
        )}

        {/* Comment */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Comment</div>
          <textarea
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="What stood out? Color, habit, performance notes..."
            rows={3}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", outline: "none", lineHeight: 1.5 }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={submit} disabled={!imgData || uploading}
            style={{ flex: 1, background: (imgData && !uploading) ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, fontSize: 14, cursor: (imgData && !uploading) ? "pointer" : "default", fontFamily: "inherit" }}>
            {uploading ? "Uploading…" : "✓ Save Photo"}
          </button>
          <button onClick={onCancel}
            style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "14px 20px", fontWeight: 600, fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SESSION VIEW ──────────────────────────────────────────────────────────────
function SessionView({ session, onUpdatePhoto, onDeletePhoto, onAddMore }) {
  const [editingComment, setEditingComment] = useState(null);
  const [draftComment,   setDraftComment  ] = useState("");
  const [generating,     setGenerating    ] = useState(false);
  const [lightbox,       setLightbox      ] = useState(null);

  const selected = session.photos.filter(p => p.selected);
  const allSelected = session.photos.length > 0 && session.photos.every(p => p.selected);

  function toggleAll() {
    const newVal = !allSelected;
    session.photos.forEach(p => onUpdatePhoto(p.id, { selected: newVal }));
  }

  async function generatePPTX() {
    if (selected.length === 0) return;
    setGenerating(true);

    // Load pptxgenjs from CDN
    await new Promise((res, rej) => {
      if (window.PptxGenJS) { res(); return; }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });

    const pres = new window.PptxGenJS();
    pres.layout  = "LAYOUT_16x9";
    pres.author  = "Hoosier Boy Greenhouse";
    pres.title   = session.name;
    pres.subject = `Trade Show / Trial Day — ${session.date}`;

    // ── TITLE SLIDE ──
    const titleSlide = pres.addSlide();
    titleSlide.background = { color: "1e2d1a" };
    titleSlide.addShape(pres.shapes.RECTANGLE, {
      x: 0, y: 4.2, w: 10, h: 1.425,
      fill: { color: "2e4a22" }, line: { color: "2e4a22" }
    });
    titleSlide.addText(session.name, {
      x: 0.7, y: 1.4, w: 8.6, h: 1.6,
      fontSize: 44, fontFace: "Georgia", color: "c8e6b8",
      bold: true, align: "center", valign: "middle", margin: 0,
    });
    titleSlide.addText(
      new Date(session.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      { x: 0.7, y: 3.1, w: 8.6, h: 0.5, fontSize: 16, fontFace: "Calibri", color: "7a9a6a", align: "center", margin: 0 }
    );
    titleSlide.addText(`${selected.length} variet${selected.length !== 1 ? "ies" : "y"} selected`, {
      x: 0.7, y: 4.4, w: 8.6, h: 0.6,
      fontSize: 13, fontFace: "Calibri", color: "c8e6b8", align: "center", margin: 0
    });
    titleSlide.addText("Hoosier Boy Greenhouse  ·  Indianapolis", {
      x: 0.7, y: 5.1, w: 8.6, h: 0.35,
      fontSize: 10, fontFace: "Calibri", color: "4a6a3a", align: "center", margin: 0
    });

    // ── PHOTO SLIDES ──
    selected.forEach((photo, idx) => {
      const slide = pres.addSlide();
      slide.background = { color: "f2f5ef" };

      // Left accent bar
      slide.addShape(pres.shapes.RECTANGLE, {
        x: 0, y: 0, w: 0.12, h: 5.625,
        fill: { color: "7fb069" }, line: { color: "7fb069" }
      });

      // Photo — full left side
      const hasComment = photo.comment && photo.comment.trim().length > 0;
      const imgW = hasComment ? 5.8 : 9.0;
      const imgX = 0.28;

      slide.addImage({
        ...(photo.url ? { path: photo.url } : { data: photo.imgData }),
        x: imgX, y: 0.28, w: imgW, h: 5.065,
        sizing: { type: "contain", w: imgW, h: 5.065 }
      });

      if (hasComment) {
        // Dark right panel
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 6.3, y: 0, w: 3.7, h: 5.625,
          fill: { color: "1e2d1a" }, line: { color: "1e2d1a" }
        });

        // Slide number badge
        slide.addShape(pres.shapes.RECTANGLE, {
          x: 6.42, y: 0.28, w: 0.56, h: 0.36,
          fill: { color: "7fb069" }, line: { color: "7fb069" }
        });
        slide.addText(`${String(idx + 1).padStart(2, "0")}`, {
          x: 6.42, y: 0.28, w: 0.56, h: 0.36,
          fontSize: 12, fontFace: "Calibri", color: "ffffff",
          bold: true, align: "center", valign: "middle", margin: 0
        });

        // "NOTES" label
        slide.addText("NOTES", {
          x: 6.42, y: 0.82, w: 3.36, h: 0.28,
          fontSize: 9, fontFace: "Calibri", color: "7a9a6a",
          bold: true, charSpacing: 3, align: "left", margin: 0
        });

        // Comment text
        slide.addText(photo.comment, {
          x: 6.42, y: 1.18, w: 3.36, h: 3.6,
          fontSize: 14, fontFace: "Calibri", color: "e8f4e0",
          align: "left", valign: "top", margin: 0, lineSpacingMultiple: 1.4
        });

        // Date footer
        slide.addText(
          new Date(photo.capturedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          { x: 6.42, y: 5.1, w: 3.36, h: 0.32, fontSize: 9, fontFace: "Calibri", color: "4a6a3a", align: "left", margin: 0 }
        );
      } else {
        // No comment — just slide number bottom right
        slide.addText(`${String(idx + 1).padStart(2, "0")} / ${String(selected.length).padStart(2, "0")}`, {
          x: 8.5, y: 5.2, w: 1.3, h: 0.28,
          fontSize: 9, fontFace: "Calibri", color: "aabba0",
          align: "right", margin: 0
        });
      }
    });

    // Write file
    const safeName = session.name.replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "TradeShow";
    await pres.writeFile({ fileName: `${safeName}_${session.date}.pptx` });
    setGenerating(false);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 22, color: "#1e2d1a" }}>{session.name}</div>
            <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 3 }}>
              {new Date(session.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              {" · "}{session.photos.length} photo{session.photos.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {session.photos.length > 0 && (
              <button onClick={toggleAll}
                style={{ background: "#f0f5ee", border: "1.5px solid #c8d8c0", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>
                {allSelected ? "☑ Deselect All" : "☐ Select All"}
              </button>
            )}
            <button onClick={onAddMore}
              style={{ background: "#f0f8eb", border: "1.5px solid #c8e0b8", borderRadius: 9, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#2e5c1e", cursor: "pointer", fontFamily: "inherit" }}>
              + Add Photo
            </button>
            {selected.length > 0 && (
              <button onClick={generatePPTX} disabled={generating}
                style={{ background: generating ? "#c8d8c0" : "#1e2d1a", color: "#c8e6b8", border: "none", borderRadius: 9, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: generating ? "default" : "pointer", fontFamily: "inherit" }}>
                {generating ? "⏳ Generating..." : `📊 Export ${selected.length} to PPTX`}
              </button>
            )}
          </div>
        </div>

        {/* Selection summary */}
        {session.photos.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ height: 6, flex: 1, background: "#e0ead8", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(selected.length / session.photos.length) * 100}%`, background: "#7fb069", borderRadius: 3, transition: "width .3s" }} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2e5c1e", minWidth: 80, textAlign: "right" }}>
              {selected.length} / {session.photos.length} selected
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {session.photos.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#7a8c74", marginBottom: 6 }}>No photos yet</div>
          <div style={{ fontSize: 13, color: "#aabba0", marginBottom: 20 }}>Tap "Add Photo" to start capturing</div>
          <button onClick={onAddMore}
            style={{ background: "#7fb069", color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            📸 Add First Photo
          </button>
        </div>
      )}

      {/* Photo grid */}
      {session.photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
          {session.photos.map((photo, idx) => {
            const isEditing = editingComment === photo.id;
            return (
              <div key={photo.id}
                style={{ background: "#fff", borderRadius: 12, border: `2px solid ${photo.selected ? "#7fb069" : "#e0ead8"}`, overflow: "hidden", transition: "border-color .15s", boxShadow: photo.selected ? "0 2px 12px rgba(127,176,105,0.2)" : "none" }}>

                {/* Image */}
                <div style={{ position: "relative", cursor: "pointer" }} onClick={() => setLightbox(photo)}>
                  <img src={photo.url || photo.imgData} alt={`Photo ${idx + 1}`}
                    style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                  {/* Select checkbox overlay */}
                  <div
                    onClick={e => { e.stopPropagation(); onUpdatePhoto(photo.id, { selected: !photo.selected }); }}
                    style={{ position: "absolute", top: 8, left: 8, width: 28, height: 28, borderRadius: 8, background: photo.selected ? "#7fb069" : "rgba(255,255,255,0.9)", border: `2px solid ${photo.selected ? "#7fb069" : "#c8d8c0"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
                    {photo.selected ? "✓" : ""}
                  </div>
                  {/* Number badge */}
                  <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700 }}>
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                </div>

                {/* Comment area */}
                <div style={{ padding: "12px 14px" }}>
                  {isEditing ? (
                    <div>
                      <textarea autoFocus
                        value={draftComment}
                        onChange={e => setDraftComment(e.target.value)}
                        rows={3}
                        style={{ width: "100%", padding: "8px 10px", border: "1.5px solid #7fb069", borderRadius: 7, fontSize: 12, fontFamily: "inherit", resize: "none", boxSizing: "border-box", outline: "none" }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={() => { onUpdatePhoto(photo.id, { comment: draftComment.trim() }); setEditingComment(null); }}
                          style={{ flex: 1, background: "#7fb069", color: "#fff", border: "none", borderRadius: 7, padding: "6px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Save
                        </button>
                        <button onClick={() => setEditingComment(null)}
                          style={{ background: "none", border: "1px solid #e0ead8", borderRadius: 7, padding: "6px 10px", fontSize: 12, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => { setEditingComment(photo.id); setDraftComment(photo.comment || ""); }}
                      style={{ cursor: "pointer", minHeight: 36 }}>
                      {photo.comment ? (
                        <div style={{ fontSize: 12, color: "#1e2d1a", lineHeight: 1.5 }}>{photo.comment}</div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#c8d8c0", fontStyle: "italic" }}>+ Add comment</div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid #f0f5ee" }}>
                    <div style={{ fontSize: 10, color: "#aabba0" }}>
                      {new Date(photo.capturedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <button onClick={() => { if (window.confirm("Remove this photo?")) onDeletePhoto(photo.id); }}
                      style={{ background: "none", border: "none", color: "#e0b0a0", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", position: "relative" }}>
            <img src={lightbox.url || lightbox.imgData} alt="Full size"
              style={{ maxWidth: "80vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8 }} />
            {lightbox.comment && (
              <div style={{ background: "rgba(0,0,0,0.75)", color: "#e8f4e0", padding: "10px 16px", borderRadius: "0 0 8px 8px", fontSize: 14, lineHeight: 1.5 }}>
                {lightbox.comment}
              </div>
            )}
            <button onClick={() => setLightbox(null)}
              style={{ position: "absolute", top: -12, right: -12, background: "#fff", border: "none", borderRadius: 20, width: 28, height: 28, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NEW SESSION MODAL ─────────────────────────────────────────────────────────
function NewSessionModal({ onCreate, onClose }) {
  const now  = new Date();
  const [name,     setName    ] = useState("");
  const [date,     setDate    ] = useState(now.toISOString().split("T")[0]);
  const [time,     setTime    ] = useState(now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }));
  const [location, setLocation] = useState("");

  function submit() {
    if (!name.trim()) return;
    onCreate({ name, date, time, location, type: "event" });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 440, boxShadow: "0 8px 40px rgba(0,0,0,0.2)", fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#1e2d1a", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#c8e6b8" }}>🎪 New Event Session</div>
            <div style={{ fontSize: 12, color: "#7a9a6a", marginTop: 3 }}>Trade show, trial day, broker visit</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a9a6a", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          {/* Event name */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Event Name *</div>
            <input
              autoFocus
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="e.g. Ball Horticultural Trade Show, Syngenta Trial Day..."
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          {/* Date + Time row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Date</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Time</div>
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>

          {/* Location */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#7a8c74", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Location</div>
            <input
              value={location} onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Chicago, IL · McCormick Place"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #c8d8c0", borderRadius: 9, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={submit} disabled={!name.trim()}
              style={{ flex: 1, background: name.trim() ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: 13, fontWeight: 700, fontSize: 14, cursor: name.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
              Start Session →
            </button>
            <button onClick={onClose}
              style={{ background: "none", border: "1.5px solid #c8d8c0", borderRadius: 10, padding: "13px 18px", fontWeight: 600, fontSize: 13, color: "#7a8c74", cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
