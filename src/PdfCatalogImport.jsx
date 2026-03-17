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

  // Steps 3 and 4 will be added in the next task
  return null;
}
