import React, { useState, useCallback } from "react";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";
const CSE_KEY = process.env.REACT_APP_GOOGLE_CSE_KEY || "";
const CSE_CX  = process.env.REACT_APP_GOOGLE_CSE_CX  || "";

/**
 * Slide-out image search panel.
 * Searches Google Images via Custom Search API.
 * User clicks a result to select it as the plant photo.
 *
 * Props:
 *   defaultQuery — pre-filled search (plant name)
 *   onSelect(imageUrl) — called when user picks an image
 *   onClose — close the panel
 */
export default function ImageSearch({ defaultQuery, onSelect, onClose }) {
  const [query, setQuery]     = useState(defaultQuery || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q) => {
    const term = (q || query).trim();
    if (!term) return;
    if (!CSE_KEY || !CSE_CX) {
      setError("Google Search API not configured. Add REACT_APP_GOOGLE_CSE_KEY and REACT_APP_GOOGLE_CSE_CX to .env.local");
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(term + " plant flower")}&searchType=image&num=10&imgSize=medium&safe=active`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `Search failed (${res.status})`);
      }
      const data = await res.json();
      setResults((data.items || []).map(item => ({
        url: item.link,
        thumb: item.image?.thumbnailLink || item.link,
        title: item.title || "",
        source: item.displayLink || "",
        width: item.image?.width,
        height: item.image?.height,
      })));
    } catch (e) {
      setError(e.message || "Search failed");
      setResults([]);
    }
    setLoading(false);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") search();
  };

  // Auto-search on mount if we have a default query
  const [didAutoSearch, setDidAutoSearch] = useState(false);
  if (defaultQuery && !didAutoSearch && CSE_KEY && CSE_CX) {
    setDidAutoSearch(true);
    setTimeout(() => search(defaultQuery), 100);
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 998,
      }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 440, maxWidth: "94vw",
        background: "#fff", zIndex: 999, boxShadow: "-4px 0 32px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", fontFamily: FONT,
      }}>
        {/* Header */}
        <div style={{
          background: DARK, padding: "16px 20px", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#c8e6b8" }}>Find Plant Image</div>
            <div style={{ fontSize: 11, color: "#7a9a6a", marginTop: 2 }}>Search and select a photo</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#7a9a6a", fontSize: 22, cursor: "pointer", lineHeight: 1,
          }}>x</button>
        </div>

        {/* Search bar */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e0ead8", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for a plant..."
              autoFocus
              style={{
                flex: 1, padding: "10px 14px", border: "1.5px solid #d0d8c8",
                borderRadius: 10, fontSize: 14, fontFamily: FONT, outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button onClick={() => search()} disabled={loading || !query.trim()} style={{
              background: loading ? "#c8d8c0" : ACCENT, color: "#fff", border: "none",
              borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13,
              cursor: loading ? "wait" : "pointer", fontFamily: FONT, flexShrink: 0,
            }}>
              {loading ? "..." : "Search"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {error && (
            <div style={{
              background: "#fde8e8", border: "1px solid #f0c0c0", borderRadius: 10,
              padding: "12px 14px", fontSize: 13, color: "#c03030", marginBottom: 14,
            }}>{error}</div>
          )}

          {loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#7a8c74" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>Searching...</div>
              <div style={{ fontSize: 12 }}>Finding plant images</div>
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#7a8c74" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>No results</div>
              <div style={{ fontSize: 12 }}>Try a different search term</div>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            }}>
              {results.map((img, i) => (
                <div
                  key={i}
                  onClick={() => { onSelect(img.url); onClose(); }}
                  style={{
                    borderRadius: 10, overflow: "hidden", cursor: "pointer",
                    border: "2px solid #e0ead8", background: "#f8faf6",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = ACCENT;
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = "#e0ead8";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ height: 140, overflow: "hidden", background: "#f0f5ee" }}>
                    <img
                      src={img.thumb}
                      alt={img.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => { e.target.style.display = "none"; }}
                    />
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: DARK,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{img.title}</div>
                    <div style={{ fontSize: 10, color: "#aabba0" }}>{img.source}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searched && !loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#aabba0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>Search for plant images</div>
              <div style={{ fontSize: 12 }}>Results from Google Images</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
