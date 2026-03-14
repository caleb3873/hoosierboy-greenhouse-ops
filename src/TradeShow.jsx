import { useState, useEffect, useRef } from "react";

// ── STORAGE KEY ────────────────────────────────────────────────────────────────
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
      const latestA = Math.max(...(a.photos || []).map(p => p.capturedAt || 0), a.createdAt || 0);
      const latestB = Math.max(...(b.photos || []).map(p => p.capturedAt || 0), b.createdAt || 0);
      return latestB - latestA;
    });
}
const uid = () => crypto.randomUUID();

// ── MAIN EXPORT ────────────────────────────────────────────────────────────────
export default function TradeShow() {
  const [sessions, setSessions] = useState(loadSessions);
  const [view, setView]         = useState("list"); // list | session | capture | quickshot
  const [activeId, setActiveId] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  function persist(next) { setSessions(next); saveSessions(next); }

  function createSession({ name, date, time, location, type }) {
    const s = {
      id: uid(),
      name: name.trim(),
      date, time, location: location.trim(),
      type, // "event" | "quickshot"
      createdAt: Date.now(),
      photos: [],
    };
    const next = [s, ...sessions];
    persist(next);
    setActiveId(s.id);
    setShowNewModal(false);
    setView(type === "quickshot" ? "capture" : "session");
  }

  function deleteSession(id) {
    if (!window.confirm("Delete this session and all its photos?")) return;
    persist(sessions.filter(s => s.id !== id));
    if (activeId === id) { setActiveId(null); setView("list"); }
  }

  function updateSession(id, changes) {
    const next = sessions.map(s => s.id === id ? { ...s, ...changes } : s);
    persist(next);
  }

  function addPhoto(sessionId, photo) {
    const next = sessions.map(s =>
      s.id === sessionId ? { ...s, photos: [...s.photos, photo] } : s
    );
    persist(next);
  }

  function updatePhoto(sessionId, photoId, changes) {
    const next = sessions.map(s =>
      s.id === sessionId
        ? { ...s, photos: s.photos.map(p => p.id === photoId ? { ...p, ...changes } : p) }
        : s
    );
    persist(next);
  }

  function deletePhoto(sessionId, photoId) {
    const next = sessions.map(s =>
      s.id === sessionId ? { ...s, photos: s.photos.filter(p => p.id !== photoId) } : s
    );
    persist(next);
  }

  const activeSession = sessions.find(s => s.id === activeId);

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
                            <img key={p.id} src={p.imgData} alt=""
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

// ── CAPTURE VIEW ──────────────────────────────────────────────────────────────
function CaptureView({ session, onAdd, onCancel }) {
  const [imgData,  setImgData ] = useState(null);
  const [comment,  setComment ] = useState("");
  const [source,   setSource  ] = useState("camera"); // camera | upload
  const fileRef   = useRef(null);
  const cameraRef = useRef(null);

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setImgData(e.target.result);
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!imgData) return;
    onAdd({
      id: uid(),
      imgData,
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
            <button onClick={() => setImgData(null)}
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
          <button onClick={submit} disabled={!imgData}
            style={{ flex: 1, background: imgData ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", borderRadius: 10, padding: 14, fontWeight: 700, fontSize: 14, cursor: imgData ? "pointer" : "default", fontFamily: "inherit" }}>
            ✓ Save Photo
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
        data: photo.imgData,
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
                  <img src={photo.imgData} alt={`Photo ${idx + 1}`}
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
            <img src={lightbox.imgData} alt="Full size"
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
