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
// Sort crop_types within a season — most-grown crops at top, others alpha.
const CROP_ORDER = ["Mum", "Aster", "Pansy", "Kale", "Cabbage", "Sunbeckia", "Helianthus", "Echinacea", "Heliopsis"];

export default function ReferenceDocs({ onBack }) {
  const { rows: docs, loading } = useReferenceDocs();
  const [season, setSeason] = useState("All");
  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState(null);
  const [errMsg, setErrMsg] = useState("");

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
    // Stable within each crop by sort_order then title
    m.forEach(arr => arr.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (a.title || "").localeCompare(b.title || "")));
    return [...m.entries()].sort((a, b) => {
      const ia = CROP_ORDER.indexOf(a[0]); const ib = CROP_ORDER.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [docs, season, search]);

  async function openDoc(doc) {
    setOpeningId(doc.id);
    setErrMsg("");
    try {
      if (doc.linkUrl) {
        window.open(doc.linkUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (doc.filePath) {
        const sb = getSupabase();
        const { data, error } = await sb.storage.from("reference-docs").createSignedUrl(doc.filePath, 3600);
        if (error) throw error;
        if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        else throw new Error("No URL returned");
      } else {
        throw new Error("Doc has no PDF file or URL");
      }
    } catch (e) {
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
        {grouped.map(([crop, items]) => (
          <div key={crop} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#1e2d1a", textTransform: "uppercase", letterSpacing: 1, margin: "6px 4px 8px", display: "flex", alignItems: "center", gap: 10 }}>
              <span>{crop}</span>
              <div style={{ flex: 1, height: 2, background: "#7fb069", borderRadius: 1 }} />
              <span style={{ background: "#7fb069", color: "#1e2d1a", borderRadius: 999, padding: "2px 10px", fontSize: 11 }}>{items.length}</span>
            </div>
            {items.map(d => (
              <button key={d.id} onClick={() => openDoc(d)} disabled={openingId === d.id}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: "#fff", border: "1.5px solid #e0ead8", borderRadius: 12,
                  padding: "12px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit",
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
        ))}
      </div>
    </div>
  );
}
