// Grower-facing library of culture guides and reference PDFs. Lists rows
// from reference_docs, grouped by crop_type. Tapping a card pulls a fresh
// signed URL from the private 'reference-docs' bucket and opens it in a
// new tab so the PDF renders in the device's native PDF viewer.
import React, { useMemo, useState } from "react";
import { useReferenceDocs, getSupabase } from "./supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };

export default function ReferenceDocs({ onBack }) {
  const { rows: docs, loading } = useReferenceDocs();
  const [openingPath, setOpeningPath] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  const grouped = useMemo(() => {
    const m = new Map();
    (docs || []).forEach(d => {
      const key = d.cropType || "Other";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(d);
    });
    // Sort groups so most-used crops show first; everything else is alpha.
    const order = ["Kale", "Cabbage", "Pansy", "Mum", "Aster"];
    return [...m.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [docs]);

  async function openDoc(doc) {
    setOpeningPath(doc.filePath);
    setErrMsg("");
    try {
      const sb = getSupabase();
      const { data, error } = await sb.storage.from("reference-docs").createSignedUrl(doc.filePath, 3600);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      else throw new Error("No URL returned");
    } catch (e) {
      setErrMsg(`Couldn't open PDF: ${e?.message || e}`);
    } finally {
      setOpeningPath(null);
    }
  }

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

      <div style={{ padding: "10px 14px 0", fontSize: 12, color: "#7a8c74", lineHeight: 1.4 }}>
        Tap any guide to open the PDF. Sorted by crop and breeder so finding one is fast.
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
        {!loading && grouped.length === 0 && (
          <div style={{ textAlign: "center", color: "#7a8c74", padding: 30, fontSize: 13 }}>
            No culture guides uploaded yet.
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
              <button key={d.id} onClick={() => openDoc(d)} disabled={openingPath === d.filePath}
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
                      📄 PDF{d.breeder ? ` · ${d.breeder}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: "#4a90d9" }}>{openingPath === d.filePath ? "…" : "↗"}</span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
