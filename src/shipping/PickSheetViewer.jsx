import { useMemo, useState, useEffect } from "react";
import { useDeliveries, useShippingCustomers, getSupabase } from "../supabase";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";
const AMBER = "#e89a3a";
const RED = "#d94f3d";

function toISODate(d) { return new Date(d).toISOString().slice(0, 10); }
function todayISO() { return toISODate(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${Math.round(c / 100).toLocaleString()}`; }

export default function PickSheetViewer() {
  const { rows: deliveries } = useDeliveries();
  const { rows: customers } = useShippingCustomers();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Deliveries with pick sheets for the selected date
  const dayDeliveries = useMemo(() => {
    return deliveries
      .filter(d => d.deliveryDate === selectedDate && d.lifecycle !== "cancelled")
      .sort((a, b) => (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999))
      .map(d => {
        const photos = Array.isArray(d.pickSheetPhotos) ? d.pickSheetPhotos : [];
        const hasWarning = Array.isArray(d.alerts) && d.alerts.some(a => a.text && a.text.includes("Pick sheet lost"));
        return { ...d, photos, hasWarning };
      });
  }, [deliveries, selectedDate]);

  const withPhotos = dayDeliveries.filter(d => d.photos.length > 0);
  const withoutPhotos = dayDeliveries.filter(d => d.photos.length === 0 && !d.hasWarning);
  const lostTickets = dayDeliveries.filter(d => d.hasWarning);

  // Quick date nav
  const dates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(today, -i)));
  }, []);

  // Reset lightbox state
  function openLightbox(url) {
    setLightboxUrl(url);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(e) {
    e.preventDefault();
    setZoom(z => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.2 : 0.2))));
  }

  function handleMouseDown(e) {
    if (zoom <= 1) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function handleMouseMove(e) {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() { setDragging(false); }

  return (
    <div style={FONT}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, letterSpacing: 1.2, textTransform: "uppercase" }}>Shipping</div>
          <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Pick Sheets</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>
            {withPhotos.length} with photos · {withoutPhotos.length} pending · {lostTickets.length} lost/incomplete
          </div>
        </div>
      </div>

      {/* Date pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", scrollbarWidth: "none" }}>
        {dates.map(iso => {
          const d = new Date(iso + "T12:00:00");
          const isActive = iso === selectedDate;
          const isToday = iso === todayISO();
          return (
            <button key={iso} onClick={() => { setSelectedDate(iso); setSelectedDelivery(null); }}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                background: isActive ? DARK : isToday ? "#e8f5e0" : "#f2f5ef",
                color: isActive ? CREAM : isToday ? DARK : MUTED,
                border: `1.5px solid ${isActive ? DARK : isToday ? GREEN : BORDER}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </button>
          );
        })}
        <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedDelivery(null); }}
          style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: "inherit" }} />
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Delivery list — left column */}
        <div style={{ width: 320, flexShrink: 0 }}>
          {dayDeliveries.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 13 }}>No deliveries for this date.</div>
          )}
          {dayDeliveries.map(d => {
            const cust = d.customerSnapshot || {};
            const isSelected = selectedDelivery?.id === d.id;
            const photoCount = d.photos.length;
            return (
              <div key={d.id} onClick={() => setSelectedDelivery(d)}
                style={{
                  padding: "12px 14px", marginBottom: 6, borderRadius: 10, cursor: "pointer",
                  background: isSelected ? "#e8f5e0" : "#fff",
                  border: isSelected ? `2px solid ${GREEN}` : `1.5px solid ${BORDER}`,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {cust.company_name || "—"}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                      {d.deliveryTime || "—"} · {fmtMoney(d.orderValueCents)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {photoCount > 0 && (
                      <span style={{ background: GREEN, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>
                        📷 {photoCount}
                      </span>
                    )}
                    {d.hasWarning && (
                      <span style={{ background: AMBER, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>
                        LOST
                      </span>
                    )}
                    {photoCount === 0 && !d.hasWarning && (
                      <span style={{ background: "#f0f0f0", color: MUTED, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>
                        Pending
                      </span>
                    )}
                  </div>
                </div>
                {/* Team pull status */}
                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: MUTED }}>
                  {(d.needsBluff1 || d.needsBluff2) && <span>B{(!d.needsBluff1 || d.bluff1PulledAt) && (!d.needsBluff2 || d.bluff2PulledAt) ? "✓" : "○"} </span>}
                  {d.needsSprague && <span>S{d.spraguePulledAt ? "✓" : "○"} </span>}
                  {d.needsHouseplants && <span>H{d.houseplantsPulledAt ? "✓" : "○"} </span>}
                  {d.shippedAt && <span style={{ color: GREEN }}>SHIPPED</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Photo viewer — right column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedDelivery && (
            <div style={{ padding: 60, textAlign: "center", color: MUTED, fontSize: 14, background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}` }}>
              Select a delivery to view pick sheet photos
            </div>
          )}
          {selectedDelivery && (
            <div style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${BORDER}`, overflow: "hidden" }}>
              <div style={{ background: DARK, color: CREAM, padding: "14px 18px" }}>
                <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif" }}>
                  {selectedDelivery.customerSnapshot?.company_name || "—"}
                </div>
                <div style={{ fontSize: 12, color: "#9cb894", marginTop: 2 }}>
                  {selectedDelivery.deliveryDate} · {selectedDelivery.deliveryTime || "—"} · {fmtMoney(selectedDelivery.orderValueCents)}
                  {(selectedDelivery.orderNumbers || []).length > 0 && ` · Orders: ${selectedDelivery.orderNumbers.join(", ")}`}
                </div>
              </div>

              {selectedDelivery.hasWarning && (
                <div style={{ padding: "10px 18px", background: "#fff7ec", borderBottom: `1px solid ${AMBER}`, color: AMBER, fontWeight: 800, fontSize: 13 }}>
                  ⚠ Pick sheet was reported as lost or incomplete
                </div>
              )}

              <div style={{ padding: 18 }}>
                {selectedDelivery.photos.length === 0 && !selectedDelivery.hasWarning && (
                  <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 13 }}>No pick sheet photos uploaded yet.</div>
                )}

                {/* Group photos by team */}
                {(() => {
                  const byTeam = {};
                  for (const p of selectedDelivery.photos) {
                    const t = p.team || "unknown";
                    if (!byTeam[t]) byTeam[t] = [];
                    byTeam[t].push(p);
                  }
                  const teamLabels = { bluff1: "Bluff — Sam", bluff2: "Bluff — Ryan", sprague: "Sprague", houseplants: "Houseplants", loader: "Loader", unknown: "Unknown" };
                  return Object.entries(byTeam).map(([team, photos]) => (
                    <div key={team} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                        {teamLabels[team] || team} — {photos.length} page{photos.length !== 1 ? "s" : ""}
                        {photos[0]?.uploaded_by && <span style={{ fontWeight: 500, textTransform: "none" }}> · by {photos[0].uploaded_by}</span>}
                        {photos[0]?.uploaded_at && <span style={{ fontWeight: 500, textTransform: "none" }}> · {new Date(photos[0].uploaded_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {photos.map((p, i) => (
                          <PickSheetThumb key={i} photo={p} onClick={(url) => openLightbox(url)} />
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox — full-screen zoom viewer */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
            overflow: "hidden",
          }}>
          <img
            src={lightboxUrl}
            alt="Pick sheet"
            onClick={e => { e.stopPropagation(); setZoom(z => z < 2 ? 2 : z < 3 ? 3 : 1); setPan({ x: 0, y: 0 }); }}
            draggable={false}
            style={{
              maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              transition: dragging ? "none" : "transform 0.2s",
              userSelect: "none",
            }}
          />
          {/* Controls */}
          <div onClick={e => e.stopPropagation()}
            style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, background: "rgba(0,0,0,0.7)", borderRadius: 12, padding: "10px 16px" }}>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.5))}
              style={{ background: "none", border: "1px solid #666", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>−</button>
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", minWidth: 50, justifyContent: "center" }}>{Math.round(zoom * 100)}%</div>
            <button onClick={() => setZoom(z => Math.min(5, z + 0.5))}
              style={{ background: "none", border: "1px solid #666", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>+</button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              style={{ background: "none", border: "1px solid #666", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
            <button onClick={() => setLightboxUrl(null)}
              style={{ background: RED, border: "none", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PickSheetThumb({ photo, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !photo.storage_path) return;
    sb.storage.from("pick-sheet-photos").createSignedUrl(photo.storage_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [photo.storage_path]);

  if (!url) return <div style={{ width: 140, height: 180, background: "#f0f0f0", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: MUTED, fontSize: 12 }}>Loading...</div>;

  return (
    <div onClick={() => onClick(url)}
      style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: `1.5px solid ${BORDER}`, position: "relative" }}>
      <img src={url} alt="Pick sheet page" style={{ width: 140, height: 180, objectFit: "cover", display: "block" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 6px", textAlign: "center" }}>
        Click to zoom
      </div>
    </div>
  );
}
