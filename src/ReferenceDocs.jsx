// Grower-facing library of culture guides and reference docs. Each row in
// reference_docs points at either a PDF in the 'reference-docs' bucket
// (file_path) OR an external URL (link_url). Both render in this view.
//
// Layout:
//   Top tab row — All · Spring · Summer · Fall · Winter · Houseplants
//   Search bar  — matches title / description / breeder / crop
//   Body        — docs grouped by crop_type inside the active season

import React, { useMemo, useState } from "react";
import { useReferenceDocs, getSupabase } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

const SEASON_ORDER = ["Spring", "Summer", "Fall", "Winter", "Houseplants"];

export default function ReferenceDocs({ onBack }) {
  const { rows: docs, loading } = useReferenceDocs();
  const [season, setSeason] = useState("All");
  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  // Which crop groups are expanded. Default = all collapsed so a grower can
  // scroll the crop headers fast and only open what they need.
  const [expanded, setExpanded] = useState(new Set());
  function toggle(crop) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(crop)) next.delete(crop);
      else next.add(crop);
      return next;
    });
  }

  // Seasons present in the data → drives which tabs render
  const seasonsPresent = useMemo(() => {
    const set = new Set();
    (docs || []).forEach(d => d.season && set.add(d.season));
    const ordered = SEASON_ORDER.filter(s => set.has(s));
    // Any unknown seasons surface at the end so admins notice
    [...set].forEach(s => { if (!ordered.includes(s)) ordered.push(s); });
    return ["All", ...ordered];
  }, [docs]);

  // Counts per season for the chip badges
  const seasonCounts = useMemo(() => {
    const m = new Map();
    (docs || []).forEach(d => {
      if (d.season) m.set(d.season, (m.get(d.season) || 0) + 1);
    });
    m.set("All", (docs || []).length);
    return m;
  }, [docs]);

  // Filter by season + search; group by crop_type within the season
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (docs || []).filter(d => {
      if (season !== "All" && d.season !== season) return false;
      if (q) {
        const hay = `${d.title || ""} ${d.description || ""} ${d.breeder || ""} ${d.cropType || ""} ${d.season || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const m = new Map();
    filtered.forEach(d => {
      const k = d.cropType || "Other";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    // Alphabetical within each crop — sort_order ignored so the list always
    // looks predictable.
    m.forEach(arr => arr.sort((a, b) => (a.title || "").localeCompare(b.title || "")));
    // Crop groups also alphabetical.
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [docs, season, search]);

  async function openDoc(doc) {
    setOpeningId(doc.id);
    setErrMsg("");

    // External URLs are easy — they're already a URL on click, no await needed
    if (doc.linkUrl) {
      window.open(doc.linkUrl, "_blank", "noopener,noreferrer");
      setOpeningId(null);
      return;
    }

    if (!doc.filePath) {
      setErrMsg("Doc has no PDF file or URL.");
      setOpeningId(null);
      return;
    }

    // PDFs need a signed URL fetched async. If we call window.open() AFTER the
    // await, mobile browsers block it as non-user-initiated. Workaround: open
    // a blank tab synchronously on the click, then redirect once the signed
    // URL resolves. If the blank tab is blocked (PWA / strict iOS), fall back
    // to navigating the current window — better to leave the app than to do
    // nothing.
    const newWindow = window.open("about:blank", "_blank");
    try {
      const sb = getSupabase();
      const { data, error } = await sb.storage.from("reference-docs").createSignedUrl(doc.filePath, 3600);
      if (error) throw error;
      const url = data?.signedUrl;
      if (!url) throw new Error("Empty URL");
      if (newWindow && !newWindow.closed) {
        newWindow.location.href = url;
      } else {
        // Popup got blocked. Fall back to current-tab navigation.
        window.location.assign(url);
      }
    } catch (e) {
      if (newWindow && !newWindow.closed) newWindow.close();
      setErrMsg(`Couldn't open: ${e?.message || e}`);
    } finally {
      setOpeningId(null);
    }
  }

  const totalShown = grouped.reduce((s, [, items]) => s + items.length, 0);

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: "#f2f5ef", paddingBottom: 60 }}>
      <div style={{ background: "#1e2d1a", color: "#c8e6b8", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={onBack}
          style={{ background: "transparent", border: "1px solid #4a6a3a", borderRadius: 8, color: "#c8e6b8", padding: "6px 10px", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          ← Back
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>📚 Culture Guides</div>
        <div style={{ width: 70 }} />
      </div>

      {/* Season tabs */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", padding: "8px 10px", display: "flex", gap: 6, overflowX: "auto" }}>
        {seasonsPresent.map(s => {
          const active = season === s;
          const count = seasonCounts.get(s) || 0;
          return (
            <button key={s} onClick={() => setSeason(s)}
              style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 999,
                background: active ? "#1e2d1a" : "#f2f5ef",
                color: active ? "#c8e6b8" : "#7a8c74",
                border: `1.5px solid ${active ? "#1e2d1a" : "#c8d8c0"}`,
                fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              <span>{s}</span>
              {count > 0 && (
                <span style={{ background: active ? "#c8e6b8" : "#c8d8c0", color: "#1e2d1a", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e0ead8", padding: "8px 12px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search title, crop, breeder…"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #c8d8c0", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      {errMsg && (
        <div style={{ margin: "10px 14px", background: "#fdecea", border: "1.5px solid #d94f3d", color: "#7a2418", borderRadius: 10, padding: "10px 12px", fontSize: 12, fontWeight: 700 }}>
          ⚠ {errMsg}
        </div>
      )}

      <div style={{ padding: 12 }}>
        {loading && (
          <div style={{ textAlign: "center", color: "#7a8c74", padding: 30, fontSize: 13 }}>Loading…</div>
        )}
        {!loading && totalShown === 0 && (
          <div style={{ textAlign: "center", color: "#7a8c74", padding: 30, fontSize: 13 }}>
            {search ? "No docs match that search." : "No docs in this season yet."}
          </div>
        )}
        {grouped.map(([crop, items]) => {
          // Search auto-expands groups so results aren't hidden behind closed
          // headers. Otherwise the user's open/closed choice wins.
          const open = search.trim() ? true : expanded.has(crop);
          return (
            <div key={crop} style={{ marginBottom: 10 }}>
              <button onClick={() => toggle(crop)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 10,
                  padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  marginBottom: open ? 6 : 0,
                }}>
                <span style={{ fontSize: 12, color: "#4a7a35", fontWeight: 900, width: 14 }}>{open ? "▼" : "▶"}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a", textTransform: "uppercase", letterSpacing: 0.8, flex: 1 }}>{crop}</span>
                <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{items.length}</span>
              </button>
              {open && items.map(d => (
                <button key={d.id} onClick={() => openDoc(d)} disabled={openingId === d.id}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12,
                    padding: "12px 14px", marginBottom: 6, marginLeft: 0, cursor: "pointer", fontFamily: "inherit",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a", lineHeight: 1.25 }}>{d.title}</div>
                      {d.description && (
                        <div style={{ fontSize: 12, color: "#7a8c74", marginTop: 4, lineHeight: 1.4 }}>{d.description}</div>
                      )}
                      <div style={{ fontSize: 10, color: "#4a7a35", fontWeight: 800, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>
                        {d.linkUrl ? "🔗 LINK" : "📄 PDF"}
                        {d.breeder ? ` · ${d.breeder}` : ""}
                        {d.season ? ` · ${d.season}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: "#4a90d9" }}>{openingId === d.id ? "…" : "↗"}</span>
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
