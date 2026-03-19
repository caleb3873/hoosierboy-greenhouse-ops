import React, { useState, useMemo } from "react";
import { calcUnitBreakdown } from "./CostEngine";

const FONT = "'DM Sans','Segoe UI',sans-serif";
const DARK = "#1e2d1a";
const ACCENT = "#7fb069";

export default function ComboLibrary({ lots, containers, soilMixes, tags, onFork, onEdit }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name"); // "name" | "recent" | "produced"

  // Only show templates (completed lots promoted to library)
  const templates = useMemo(() => {
    return lots.filter(l => l.isTemplate || l.status === "completed");
  }, [lots]);

  // For each template, compute production history from all lots that reference it
  const enriched = useMemo(() => {
    return templates.map(t => {
      // Find all lots forked from this template
      const productions = lots.filter(l => l.templateId === t.id && l.id !== t.id);
      const totalProduced = (t.productionQty || 0) + productions.reduce((s, p) => s + (p.productionQty || 0), 0);
      const seasons = [...new Set([t.season, ...productions.map(p => p.season)].filter(Boolean))];

      // Cost from most recent
      const latestCombo = t.combos?.[0];
      const container = latestCombo ? containers.find(c => c.id === latestCombo.containerId) : null;
      const soil = latestCombo ? soilMixes.find(s => s.id === latestCombo.soilId) : null;
      const tag = latestCombo ? tags.find(tg => tg.id === latestCombo.tagId) : null;
      const costBreakdown = latestCombo ? calcUnitBreakdown(latestCombo.plants || [], container, soil, tag) : null;

      // All plant names for search
      const plantNames = (t.combos || []).flatMap(c => (c.plants || []).map(p => p.name)).filter(Boolean);
      const brokers = [...new Set((t.combos || []).flatMap(c => (c.plants || []).map(p => p.broker)).filter(Boolean))];

      return { ...t, totalProduced, seasons, costBreakdown, plantNames, brokers, productionCount: productions.length + 1 };
    });
  }, [templates, lots, containers, soilMixes, tags]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter(t =>
      (t.name || "").toLowerCase().includes(q) ||
      (t.season || "").toLowerCase().includes(q) ||
      t.plantNames.some(n => n.toLowerCase().includes(q)) ||
      t.brokers.some(b => b.toLowerCase().includes(q))
    );
  }, [enriched, search]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "name") arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sortBy === "recent") arr.sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0));
    if (sortBy === "produced") arr.sort((a, b) => b.totalProduced - a.totalProduced);
    return arr;
  }, [filtered, sortBy]);

  const allPlants = (combos) => (combos || []).flatMap(c => c.plants || []);
  const photoUrl = (lot) => {
    if (lot.finishedPhotos?.length) return lot.finishedPhotos[0].imgData;
    const p = allPlants(lot.combos).find(pl => pl.imageUrl);
    return p?.imageUrl || null;
  };

  return (
    <div>
      {/* Search + sort */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search templates -- name, plant, broker, season..."
          style={{ flex: 1, minWidth: 240, padding: "10px 14px", border: "1.5px solid #d0d8c8", borderRadius: 10, fontSize: 14, fontFamily: FONT, outline: "none" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[["name", "A-Z"], ["recent", "Recent"], ["produced", "Most Produced"]].map(([id, label]) => (
            <button key={id} onClick={() => setSortBy(id)} style={{
              padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${sortBy === id ? ACCENT : "#d0d8c8"}`,
              background: sortBy === id ? "#f0f8eb" : "#fff", color: sortBy === id ? "#2e5c1e" : "#7a8c74",
              fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT,
            }}>{label}</button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fafcf8", borderRadius: 20, border: "2px dashed #c8d8c0" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>Library</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4a5a40", marginBottom: 6 }}>
            {search ? "No templates match your search" : "No templates yet"}
          </div>
          <div style={{ fontSize: 13, color: "#7a8c74", lineHeight: 1.5 }}>
            {search ? "Try a different search term" : "Complete a combo lot to add it to your library"}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {sorted.map(t => {
            const photo = photoUrl(t);
            const plants = allPlants(t.combos);
            return (
              <div key={t.id} style={{
                background: "#fff", borderRadius: 16, border: "2px solid #e0ead8",
                overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
              }}>
                {/* Photo strip */}
                {photo && (
                  <div style={{ height: 120, overflow: "hidden", background: "#f0f5ee" }}>
                    <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => e.target.style.display = "none"} />
                  </div>
                )}
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: DARK, marginBottom: 4 }}>{t.name || "Untitled"}</div>
                  <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 10 }}>
                    {t.seasons.join(", ") || "No season"}
                    {t.version > 1 ? ` - v${t.version}` : ""}
                  </div>

                  {/* Stats */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <div style={{ background: "#f0f8eb", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#2e5c1e" }}>{t.totalProduced.toLocaleString()}</div>
                      <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>total produced</div>
                    </div>
                    <div style={{ background: "#e8f4f8", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#2e7d9e" }}>{t.productionCount}</div>
                      <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>{t.productionCount === 1 ? "run" : "runs"}</div>
                    </div>
                    {t.costBreakdown && (
                      <div style={{ background: "#f5f0ff", borderRadius: 8, padding: "6px 12px", textAlign: "center" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#6a3db0" }}>${t.costBreakdown.totalPerUnit.toFixed(2)}</div>
                        <div style={{ fontSize: 9, color: "#7a8c74", textTransform: "uppercase" }}>per unit</div>
                      </div>
                    )}
                  </div>

                  {/* Plant summary */}
                  {plants.length > 0 && (
                    <div style={{ fontSize: 12, color: "#7a8c74", marginBottom: 12 }}>
                      {plants.length} plant{plants.length !== 1 ? "s" : ""}: {plants.map(p => p.name).filter(Boolean).join(", ") || "unnamed"}
                    </div>
                  )}

                  {/* Brokers */}
                  {t.brokers.length > 0 && (
                    <div style={{ fontSize: 11, color: "#2e7d9e", marginBottom: 12 }}>
                      Brokers: {t.brokers.join(", ")}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => onFork(t)} style={{
                      flex: 1, background: ACCENT, color: "#fff", border: "none", borderRadius: 8,
                      padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                    }}>Use as Template</button>
                    <button onClick={() => onEdit(t)} style={{
                      background: "transparent", color: DARK, border: "1px solid #d0d8c8", borderRadius: 8,
                      padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: FONT,
                    }}>Update</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
