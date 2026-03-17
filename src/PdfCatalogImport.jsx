import { useState, useRef, useEffect, useCallback } from "react";
import { BREEDERS } from "./Libraries";

// ── STYLES ───────────────────────────────────────────────────────────────────
const font = "'DM Sans','Segoe UI',sans-serif";
const green = "#7fb069";
const darkGreen = "#1e2d1a";
const muted = "#7a8c74";
const border = "#c8d8c0";
const cardBg = "#fff";

function inputStyle(focus) {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: `1.5px solid ${focus ? green : border}`,
    background: "#fff", fontSize: 14, color: darkGreen,
    outline: "none", boxSizing: "border-box", fontFamily: font,
  };
}

// ── PDF.JS LOADER ────────────────────────────────────────────────────────────
function usePdfJs() {
  const [ready, setReady] = useState(!!window.pdfjsLib);

  useEffect(() => {
    if (window.pdfjsLib) { setReady(true); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setReady(true);
    };
    document.head.appendChild(script);
  }, []);

  return ready;
}

// ── RENDER PDF PAGE TO BASE64 PNG ────────────────────────────────────────────
async function renderPageToBase64(pdfDoc, pageNum, scale = 1.0) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  // Use JPEG at 0.85 quality to keep payloads under Vercel's 4.5MB body limit
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ── MERGE LOGIC ──────────────────────────────────────────────────────────────
// Protected fields — never overwritten by import
const PROTECTED_FIELDS = ["growerGrade", "customerGrade", "id"];

// Fields to compare for merge
const MERGE_FIELDS = [
  "cropName", "variety", "type",
  "propTraySize", "propCellCount", "propWeeks",
  "finishWeeks", "finishTempDay", "finishTempNight", "tempGroup",
  "lightRequirement", "spacing",
  "fertilizerType", "fertilizerRate",
  "pgrType", "pgrRate", "pgrTiming",
  "pinchingNotes", "chemSensitivities", "generalNotes",
];

function classifyMerge(item, existingLibrary) {
  const match = existingLibrary.find(
    v => v.cropName?.toLowerCase() === item.cropName?.toLowerCase() &&
         v.variety?.toLowerCase() === item.variety?.toLowerCase() &&
         v.breeder?.toLowerCase() === item.breeder?.toLowerCase()
  );

  if (!match) return { status: "new", match: null, conflicts: [] };

  // Check for conflicts and enrichments
  const conflicts = [];
  let hasEnrichment = false;

  for (const field of MERGE_FIELDS) {
    const existing = (match[field] || "").toString().trim();
    const incoming = (item[field] || "").toString().trim();

    if (!incoming) continue; // Nothing to merge
    if (!existing && incoming) { hasEnrichment = true; continue; } // Fill empty field
    if (existing && incoming && existing.toLowerCase() !== incoming.toLowerCase()) {
      conflicts.push({ field, existing, incoming });
    }
  }

  if (conflicts.length > 0) return { status: "conflict", match, conflicts };
  if (hasEnrichment) return { status: "enriched", match, conflicts: [] };
  return { status: "skipped", match, conflicts: [] };
}

// ── MERGE & COMMIT COMPONENT ─────────────────────────────────────────────────
function MergeCommit({ items, existingLibrary, breeder, cultureGuideUrl, onCommit, onBack, onDone }) {
  const [mergeResults, setMergeResults] = useState([]);
  const [conflictResolutions, setConflictResolutions] = useState({}); // { itemId: { field: "keep"|"use" } }
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Classify all items on mount
  useEffect(() => {
    const results = items.map(item => ({
      item,
      ...classifyMerge(item, existingLibrary),
    }));
    setMergeResults(results);

    // Default conflict resolutions to "use" (prefer PDF data)
    const defaults = {};
    results.forEach(r => {
      if (r.status === "conflict") {
        defaults[r.item.id] = {};
        r.conflicts.forEach(c => { defaults[r.item.id][c.field] = "use"; });
      }
    });
    setConflictResolutions(defaults);
  }, [items, existingLibrary]);

  const counts = {
    new: mergeResults.filter(r => r.status === "new").length,
    enriched: mergeResults.filter(r => r.status === "enriched").length,
    conflict: mergeResults.filter(r => r.status === "conflict").length,
    skipped: mergeResults.filter(r => r.status === "skipped").length,
  };

  const handleCommit = async () => {
    setCommitting(true);

    const toSave = [];

    for (const result of mergeResults) {
      if (result.status === "skipped") continue;

      if (result.status === "new") {
        toSave.push({
          ...result.item,
          id: crypto.randomUUID(),
          breeder,
          cultureGuideUrl: cultureGuideUrl || "",
        });
      } else if (result.status === "enriched") {
        // Merge: fill empty fields only
        const merged = { ...result.match };
        for (const field of MERGE_FIELDS) {
          const existing = (merged[field] || "").toString().trim();
          const incoming = (result.item[field] || "").toString().trim();
          if (!existing && incoming) merged[field] = incoming;
        }
        if (!merged.cultureGuideUrl && cultureGuideUrl) merged.cultureGuideUrl = cultureGuideUrl;
        toSave.push(merged);
      } else if (result.status === "conflict") {
        const merged = { ...result.match };
        const resolutions = conflictResolutions[result.item.id] || {};

        // Fill empty fields
        for (const field of MERGE_FIELDS) {
          const existing = (merged[field] || "").toString().trim();
          const incoming = (result.item[field] || "").toString().trim();
          if (!existing && incoming) merged[field] = incoming;
        }

        // Apply conflict resolutions
        for (const c of result.conflicts) {
          if (resolutions[c.field] === "use") {
            merged[c.field] = c.incoming;
          }
          // "keep" = do nothing, existing value stays
        }

        if (!merged.cultureGuideUrl && cultureGuideUrl) merged.cultureGuideUrl = cultureGuideUrl;
        toSave.push(merged);
      }
    }

    await onCommit(toSave);
    setCommitted(true);
    setCommitting(false);
  };

  const statusBadge = (status) => {
    const styles = {
      new: { bg: "#e8f3eb", color: "#2e7a2e", label: "NEW" },
      enriched: { bg: "#e8f0fc", color: "#1a4a7a", label: "ENRICHED" },
      conflict: { bg: "#fff8e8", color: "#a06010", label: "CONFLICT" },
      skipped: { bg: "#f0f0ea", color: muted, label: "SKIPPED" },
    };
    const s = styles[status];
    return <span style={{ background: s.bg, color: s.color, padding: "2px 10px", borderRadius: 12, fontWeight: 700, fontSize: 11 }}>{s.label}</span>;
  };

  if (committed) {
    return (
      <div style={{ fontFamily: font, maxWidth: 500, margin: "0 auto", textAlign: "center", padding: "60px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: darkGreen, marginBottom: 8 }}>Import Complete</div>
        <div style={{ fontSize: 14, color: muted, lineHeight: 1.8 }}>
          {counts.new > 0 && <div><span style={{ fontWeight: 700, color: "#2e7a2e" }}>{counts.new}</span> new varieties added</div>}
          {counts.enriched > 0 && <div><span style={{ fontWeight: 700, color: "#1a4a7a" }}>{counts.enriched}</span> existing varieties enriched</div>}
          {counts.conflict > 0 && <div><span style={{ fontWeight: 700, color: "#a06010" }}>{counts.conflict}</span> conflicts resolved</div>}
          {counts.skipped > 0 && <div><span style={{ fontWeight: 700, color: muted }}>{counts.skipped}</span> unchanged (skipped)</div>}
        </div>
        <button onClick={onDone} style={{ marginTop: 24, background: green, color: "#fff", border: "none", borderRadius: 10, padding: "12px 32px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: font }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: darkGreen, marginBottom: 4 }}>
        Merge & Save
      </div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        Review how extracted varieties will be merged into your library.
      </div>

      {/* Summary badges */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {[
          { label: "New", count: counts.new, bg: "#e8f3eb", color: "#2e7a2e" },
          { label: "Enriched", count: counts.enriched, bg: "#e8f0fc", color: "#1a4a7a" },
          { label: "Conflicts", count: counts.conflict, bg: "#fff8e8", color: "#a06010" },
          { label: "Skipped", count: counts.skipped, bg: "#f0f0ea", color: muted },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "14px 20px", textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Conflicts requiring resolution */}
      {counts.conflict > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#a06010", marginBottom: 12 }}>
            Resolve Conflicts
          </div>
          {mergeResults.filter(r => r.status === "conflict").map(result => (
            <div key={result.item.id} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #f0d090", padding: "16px 20px", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: darkGreen, marginBottom: 10 }}>
                {result.item.cropName} — {result.item.variety}
              </div>
              {result.conflicts.map(c => {
                const resolution = conflictResolutions[result.item.id]?.[c.field] || "use";
                return (
                  <div key={c.field} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, fontSize: 13 }}>
                    <div style={{ width: 120, fontWeight: 600, color: muted, fontSize: 11, textTransform: "uppercase" }}>{c.field}</div>
                    <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: resolution === "keep" ? "#f0f8eb" : "#fafafa", border: `1px solid ${resolution === "keep" ? green : "#e8e8e4"}` }}>
                      <input type="radio" name={`${result.item.id}-${c.field}`} checked={resolution === "keep"}
                        onChange={() => setConflictResolutions(prev => ({ ...prev, [result.item.id]: { ...prev[result.item.id], [c.field]: "keep" } }))}
                        style={{ accentColor: green }} />
                      <span style={{ color: darkGreen }}>Keep: <strong>{c.existing}</strong></span>
                    </label>
                    <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 10px", borderRadius: 8, background: resolution === "use" ? "#fff8e8" : "#fafafa", border: `1px solid ${resolution === "use" ? "#f0d090" : "#e8e8e4"}` }}>
                      <input type="radio" name={`${result.item.id}-${c.field}`} checked={resolution === "use"}
                        onChange={() => setConflictResolutions(prev => ({ ...prev, [result.item.id]: { ...prev[result.item.id], [c.field]: "use" } }))}
                        style={{ accentColor: "#e67e22" }} />
                      <span style={{ color: "#a06010" }}>Use PDF: <strong>{c.incoming}</strong></span>
                    </label>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Item list with status badges */}
      <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20, border: `1px solid ${border}`, borderRadius: 12 }}>
        {mergeResults.map(r => (
          <div key={r.item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f0f5ee" }}>
            {statusBadge(r.status)}
            <span style={{ fontWeight: 600, color: darkGreen }}>{r.item.cropName}</span>
            <span style={{ color: muted }}>— {r.item.variety}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${border}`, background: cardBg, color: muted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: font }}>
          ← Back to Review
        </button>
        <button onClick={handleCommit} disabled={committing || (counts.new + counts.enriched + counts.conflict) === 0}
          style={{
            flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
            background: committing ? "#c8d8c0" : green,
            color: "#fff", fontWeight: 800, fontSize: 14,
            cursor: committing ? "default" : "pointer", fontFamily: font,
          }}>
          {committing ? "Saving..." : `Save ${counts.new + counts.enriched + counts.conflict} Varieties ✓`}
        </button>
      </div>
    </div>
  );
}

// ── REVIEW TABLE ─────────────────────────────────────────────────────────────
function ReviewTable({ items, setItems, pageConfidences, onReExtract, onNext, onBack, cancelled }) {
  const [search, setSearch] = useState("");
  const [cropFilter, setCropFilter] = useState("all");
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [selected, setSelected] = useState(new Set());

  const crops = [...new Set(items.map(i => i.cropName).filter(Boolean))].sort();

  const filtered = items.filter(item => {
    const matchCrop = cropFilter === "all" || item.cropName === cropFilter;
    const matchSearch = !search ||
      item.cropName?.toLowerCase().includes(search.toLowerCase()) ||
      item.variety?.toLowerCase().includes(search.toLowerCase());
    return matchCrop && matchSearch;
  });

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    setEditingCell(null);
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected row(s)?`)) return;
    setItems(prev => prev.filter(i => !selected.has(i.id)));
    setSelected(new Set());
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  };

  const confColor = (pageNum) => {
    const c = pageConfidences[pageNum];
    if (c === "high") return "#4caf50";
    if (c === "low") return "#f44336";
    return "#ff9800";
  };

  const COLUMNS = [
    { key: "cropName", label: "Crop", width: 120 },
    { key: "variety", label: "Series", width: 120 },
    { key: "finishWeeks", label: "Finish Wks", width: 80 },
    { key: "finishTempDay", label: "Day °F", width: 70 },
    { key: "finishTempNight", label: "Night °F", width: 70 },
    { key: "tempGroup", label: "Temp", width: 60 },
    { key: "lightRequirement", label: "Light", width: 80 },
    { key: "pgrType", label: "PGR", width: 100 },
  ];

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: darkGreen, marginBottom: 4 }}>
        Review Extracted Varieties
      </div>
      <div style={{ fontSize: 13, color: muted, marginBottom: 20 }}>
        {items.length} varieties extracted from {Object.keys(pageConfidences).length} pages.
        {cancelled && <span style={{ color: "#ff9800", fontWeight: 700 }}> (Partial — extraction was cancelled)</span>}
        {" "}Click any cell to edit. Delete junk rows before proceeding.
      </div>

      {/* Search & filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search varieties..."
          style={{ ...inputStyle(false), flex: 2, minWidth: 180 }} />
        <select value={cropFilter} onChange={e => setCropFilter(e.target.value)}
          style={{ ...inputStyle(false), flex: 1, minWidth: 140 }}>
          <option value="all">All Crops ({items.length})</option>
          {crops.map(c => <option key={c} value={c}>{c} ({items.filter(i => i.cropName === c).length})</option>)}
        </select>
        {selected.size > 0 && (
          <button onClick={deleteSelected}
            style={{ background: "#fff0f0", border: "1px solid #f0c0c0", borderRadius: 8, padding: "8px 16px", color: "#c03030", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f2f5ef", position: "sticky", top: 0 }}>
              <th style={{ padding: "8px 6px", textAlign: "center", borderBottom: "1.5px solid #e0ead8", width: 32 }}>
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleSelectAll} style={{ accentColor: green, cursor: "pointer" }} />
              </th>
              {COLUMNS.map(col => (
                <th key={col.key} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8", whiteSpace: "nowrap", width: col.width }}>{col.label}</th>
              ))}
              <th style={{ padding: "8px 10px", textAlign: "center", fontWeight: 700, color: "#4a5a40", borderBottom: "1.5px solid #e0ead8", width: 50 }}>Pg</th>
              <th style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1.5px solid #e0ead8", width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map(item => {
              const isLowConf = pageConfidences[item.sourcePageNumber] === "low";
              return (
                <tr key={item.id}
                  style={{ borderBottom: "1px solid #f0f5ee", background: isLowConf ? "#fff8e8" : "" }}
                  onMouseEnter={e => { if (!isLowConf) e.currentTarget.style.background = "#fafcf8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isLowConf ? "#fff8e8" : ""; }}
                >
                  <td style={{ padding: "6px", textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(item.id)}
                      onChange={() => setSelected(prev => {
                        const next = new Set(prev);
                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                        return next;
                      })}
                      style={{ accentColor: green, cursor: "pointer" }} />
                  </td>
                  {COLUMNS.map(col => {
                    const isEditing = editingCell?.id === item.id && editingCell?.field === col.key;
                    return (
                      <td key={col.key}
                        onClick={() => setEditingCell({ id: item.id, field: col.key })}
                        style={{ padding: "6px 10px", cursor: "pointer", color: darkGreen, maxWidth: col.width, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            defaultValue={item[col.key] || ""}
                            onBlur={e => updateItem(item.id, col.key, e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingCell(null); }}
                            style={{ width: "100%", padding: "2px 6px", borderRadius: 4, border: `1.5px solid ${green}`, fontSize: 13, fontFamily: font, boxSizing: "border-box" }}
                          />
                        ) : (
                          <span style={{ color: item[col.key] ? darkGreen : "#c8d8c0" }}>
                            {item[col.key] || "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 10px", textAlign: "center", fontSize: 11 }}>
                    <span style={{ color: confColor(item.sourcePageNumber), fontWeight: 700 }}>
                      {item.sourcePageNumber || "?"}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "center" }}>
                    {isLowConf && (
                      <button onClick={() => onReExtract(item.sourcePageNumber)}
                        title="Re-extract this page"
                        style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#ff9800", padding: 0 }}>
                        🔄
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div style={{ textAlign: "center", padding: 16, fontSize: 13, color: muted }}>
            Showing 200 of {filtered.length} — use search to narrow results
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${border}`, background: cardBg, color: muted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: font }}>
          ← Start Over
        </button>
        <button onClick={onNext} disabled={items.length === 0}
          style={{
            flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
            background: items.length > 0 ? green : "#c8d8c0",
            color: "#fff", fontWeight: 800, fontSize: 14,
            cursor: items.length > 0 ? "pointer" : "default", fontFamily: font,
          }}>
          Merge & Save ({items.length} varieties) →
        </button>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function PdfCatalogImport({ existingLibrary = [], onSave, onCancel }) {
  const [step, setStep] = useState(1); // 1=upload, 2=extracting, 3=review, 4=merge
  const [breeder, setBreeder] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [fileName, setFileName] = useState("");

  // Extraction state
  const [extractedItems, setExtractedItems] = useState([]);
  const [processedPages, setProcessedPages] = useState(0);
  const [currentBatch, setCurrentBatch] = useState("");
  const [detectedStructure, setDetectedStructure] = useState(null);
  const [pageConfidences, setPageConfidences] = useState({}); // { pageNum: "high"|"medium"|"low" }
  const [batchErrors, setBatchErrors] = useState([]); // [{ startPage, endPage, error }]
  const [extracting, setExtracting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);
  const itemCountRef = useRef(0); // Track count via ref to avoid stale closures

  const pdfReady = usePdfJs();
  const fileRef = useRef(null);

  // ── LOAD PDF ─────────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    if (!file || file.type !== "application/pdf") return;
    setFileName(file.name);

    const arrayBuffer = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setPdfDoc(doc);
    setTotalPages(doc.numPages);
  };

  // ── EXTRACT ALL PAGES ────────────────────────────────────────────────────
  const startExtraction = useCallback(async () => {
    if (!pdfDoc || !breeder) return;

    setStep(2);
    setExtracting(true);
    setCancelled(false);
    cancelRef.current = false;
    setExtractedItems([]);
    setProcessedPages(0);
    setPageConfidences({});
    setBatchErrors([]);
    setDetectedStructure(null);

    let structure = null;
    const BATCH_SIZE = 5;

    for (let start = 1; start <= totalPages; start += BATCH_SIZE) {
      if (cancelRef.current) break;

      const end = Math.min(start + BATCH_SIZE - 1, totalPages);
      setCurrentBatch(`Processing pages ${start}–${end} of ${totalPages}...`);

      try {
        // Render pages to images
        const pages = [];
        for (let p = start; p <= end; p++) {
          const image = await renderPageToBase64(pdfDoc, p);
          pages.push({ pageNumber: p, image });
        }

        // Call API
        const res = await fetch("/api/extract-catalog", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-App-Token": "greenhouse-ops",
          },
          body: JSON.stringify({
            pages,
            context: { breederName: breeder, detectedStructure: structure },
          }),
        });

        if (res.status === 429) {
          // Rate limited — exponential backoff with max 3 retries
          const retryKey = `retry_${start}`;
          const retryCount = (window[retryKey] || 0) + 1;
          window[retryKey] = retryCount;
          if (retryCount <= 3) {
            const delay = 10000 * Math.pow(2, retryCount - 1); // 10s, 20s, 40s
            setBatchErrors(prev => [...prev, { startPage: start, endPage: end, error: `Rate limited — retry ${retryCount}/3 in ${delay/1000}s...` }]);
            await new Promise(r => setTimeout(r, delay));
            start -= BATCH_SIZE; // Retry this batch (for loop adds BATCH_SIZE back)
            continue;
          }
          setBatchErrors(prev => [...prev, { startPage: start, endPage: end, error: "Rate limited — max retries exceeded" }]);
          setProcessedPages(prev => prev + (end - start + 1));
          continue;
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setBatchErrors(prev => [...prev, { startPage: start, endPage: end, error: errData.error || `HTTP ${res.status}` }]);
          setProcessedPages(prev => prev + (end - start + 1));
          continue;
        }

        const data = await res.json();

        // Save detected structure from first batch
        if (!structure && data.detectedStructure) {
          structure = data.detectedStructure;
          setDetectedStructure(structure);
        }

        // Accumulate items with IDs
        if (data.items?.length) {
          const newItems = data.items.map(item => ({
            ...item,
            id: crypto.randomUUID(),
            breeder: breeder,
          }));
          setExtractedItems(prev => {
            const updated = [...prev, ...newItems];
            itemCountRef.current = updated.length;
            return updated;
          });
        }

        // Track confidence per page
        const conf = data.confidence || "medium";
        for (let p = start; p <= end; p++) {
          setPageConfidences(prev => ({ ...prev, [p]: conf }));
        }

        setProcessedPages(prev => prev + (end - start + 1));
      } catch (err) {
        setBatchErrors(prev => [...prev, { startPage: start, endPage: end, error: err.message }]);
        setProcessedPages(prev => prev + (end - start + 1));
      }
    }

    setExtracting(false);
    if (!cancelRef.current) {
      setStep(3);
    } else {
      setCancelled(true);
      if (itemCountRef.current > 0) setStep(3); // Show partial results via ref (avoids stale closure)
    }
  }, [pdfDoc, breeder, totalPages]);

  // ── RE-EXTRACT SINGLE PAGE ───────────────────────────────────────────────
  const reExtractPage = async (pageNum) => {
    if (!pdfDoc) return;

    try {
      const image = await renderPageToBase64(pdfDoc, pageNum);
      const res = await fetch("/api/extract-catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Token": "greenhouse-ops",
        },
        body: JSON.stringify({
          pages: [{ pageNumber: pageNum, image }],
          context: { breederName: breeder, detectedStructure },
        }),
      });

      if (!res.ok) return;
      const data = await res.json();

      if (data.items?.length) {
        const newItems = data.items.map(item => ({
          ...item,
          id: crypto.randomUUID(),
          breeder: breeder,
        }));

        // Replace items from this page, keep others
        setExtractedItems(prev => [
          ...prev.filter(i => i.sourcePageNumber !== pageNum),
          ...newItems,
        ]);

        setPageConfidences(prev => ({ ...prev, [pageNum]: data.confidence || "medium" }));
      }
    } catch (err) {
      console.error("Re-extract failed:", err);
    }
  };

  // ── CANCEL ───────────────────────────────────────────────────────────────
  const handleCancel = () => {
    cancelRef.current = true;
    setCancelled(true);
  };

  // ── STEP 1: UPLOAD ──────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div style={{ fontFamily: font, maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: darkGreen, marginBottom: 6 }}>
          Import from Catalog PDF
        </div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>
          Upload a breeder culture guide or catalog PDF. AI will extract variety data page by page.
        </div>

        {/* Breeder selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Breeder Source *
          </div>
          <select
            value={breeder}
            onChange={e => setBreeder(e.target.value)}
            style={inputStyle(false)}
          >
            <option value="">— Select breeder —</option>
            {BREEDERS.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        {/* Breeder links */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {BREEDERS.filter(b => b.url).map(b => (
            <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: b.color, textDecoration: "none", border: `1px solid ${b.color}55`, borderRadius: 20, padding: "3px 10px", fontWeight: 600, background: b.color + "11" }}>
              {b.name} ↗
            </a>
          ))}
        </div>

        {/* File drop zone */}
        <div
          onClick={() => breeder && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (breeder) e.currentTarget.style.borderColor = green; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = border; }}
          onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = border; if (breeder) handleFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${breeder ? border : "#e8e8e4"}`,
            borderRadius: 14, padding: "48px 24px", textAlign: "center",
            cursor: breeder ? "pointer" : "default",
            background: breeder ? "#fafcf8" : "#f8f8f6",
            opacity: breeder ? 1 : 0.6,
            transition: "all 150ms ease-in-out",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: breeder ? "#4a5a40" : "#aabba0", marginBottom: 4 }}>
            {pdfDoc ? fileName : breeder ? "Drop PDF catalog here" : "Select a breeder first"}
          </div>
          {pdfDoc ? (
            <div style={{ fontSize: 13, color: green, fontWeight: 700 }}>
              {totalPages} pages ready to process
            </div>
          ) : (
            <div style={{ fontSize: 13, color: muted }}>or click to browse</div>
          )}
          {!pdfReady && <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>Loading PDF engine...</div>}
        </div>
        <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files[0])} />

        {/* Page count validation */}
        {totalPages > 200 && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#c03030", background: "#fdf0ee", borderRadius: 8, padding: "10px 14px" }}>
            This PDF has {totalPages} pages — maximum is 200. Try splitting the catalog into sections.
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: `1.5px solid ${border}`, background: cardBg, color: muted, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: font }}>
            Cancel
          </button>
          <button
            onClick={startExtraction}
            disabled={!pdfDoc || !breeder || totalPages > 200}
            style={{
              flex: 2, padding: "12px 0", borderRadius: 10, border: "none",
              background: pdfDoc && breeder && totalPages <= 200 ? green : "#c8d8c0",
              color: "#fff", fontWeight: 800, fontSize: 14,
              cursor: pdfDoc && breeder && totalPages <= 200 ? "pointer" : "default",
              fontFamily: font,
            }}
          >
            Extract Varieties →
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 2: EXTRACTING ──────────────────────────────────────────────────
  if (step === 2) {
    const pct = totalPages > 0 ? Math.round((processedPages / totalPages) * 100) : 0;

    return (
      <div style={{ fontFamily: font, maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: darkGreen, marginBottom: 6 }}>
          Extracting Varieties
        </div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 24 }}>
          {currentBatch}
        </div>

        {/* Progress bar */}
        <div style={{ background: "#e8ede4", borderRadius: 20, height: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{
            background: `linear-gradient(90deg, ${green}, #4a9a3a)`,
            height: "100%", borderRadius: 20,
            width: `${pct}%`,
            transition: "width 300ms ease-out",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: muted, marginBottom: 20 }}>
          <span>{processedPages} / {totalPages} pages</span>
          <span>{extractedItems.length} varieties found</span>
        </div>

        {/* Page confidence dots */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 20 }}>
          {Array.from({ length: totalPages }, (_, i) => {
            const pageNum = i + 1;
            const conf = pageConfidences[pageNum];
            const color = !conf ? "#e0e0d8" : conf === "high" ? "#4caf50" : conf === "medium" ? "#ff9800" : "#f44336";
            return (
              <div key={pageNum} title={`Page ${pageNum}: ${conf || "pending"}`}
                style={{ width: 10, height: 10, borderRadius: "50%", background: color, transition: "background 200ms" }} />
            );
          })}
        </div>

        {/* Batch errors */}
        {batchErrors.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {batchErrors.map((err, i) => (
              <div key={i} style={{ fontSize: 12, color: "#c03030", background: "#fdf0ee", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                Pages {err.startPage}–{err.endPage}: {err.error}
              </div>
            ))}
          </div>
        )}

        {/* Cancel button */}
        <button onClick={handleCancel} disabled={!extracting}
          style={{
            width: "100%", padding: "12px 0", borderRadius: 10,
            border: `1.5px solid ${border}`, background: cardBg,
            color: muted, fontWeight: 700, fontSize: 14,
            cursor: extracting ? "pointer" : "default", fontFamily: font,
          }}>
          {extracting ? "Cancel (keep partial results)" : "Finishing..."}
        </button>
      </div>
    );
  }

  // ── STEP 3: REVIEW TABLE ────────────────────────────────────────────────
  if (step === 3) {
    return <ReviewTable
      items={extractedItems}
      setItems={setExtractedItems}
      pageConfidences={pageConfidences}
      onReExtract={reExtractPage}
      onNext={() => setStep(4)}
      onBack={() => { setStep(1); setExtractedItems([]); setPdfDoc(null); }}
      cancelled={cancelled}
    />;
  }

  // ── STEP 4: MERGE & COMMIT ──────────────────────────────────────────────
  if (step === 4) {
    const breederObj = BREEDERS.find(b => b.name === breeder);
    const cultureGuideUrl = breederObj?.url || "";

    return <MergeCommit
      items={extractedItems}
      existingLibrary={existingLibrary}
      breeder={breeder}
      cultureGuideUrl={cultureGuideUrl}
      onCommit={onSave}
      onBack={() => setStep(3)}
      onDone={onCancel}
    />;
  }

  return null;
}
