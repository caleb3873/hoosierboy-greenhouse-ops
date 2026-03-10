import { useState, useRef } from "react";
import { useCropRuns } from "./supabase";
import { getCurrentWeek } from "./shared";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = "gh_receiving_v1"; // { [weekKey]: { receiverName, packingSlipPhoto, lines: { [lineKey]: { status, actualQty, note, claimPhoto, claimNote, receivedBy, receivedAt } }, plannerNotes } }

function load(key, def) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

const CURRENT_WEEK = getCurrentWeek();
const CURRENT_YEAR = new Date().getFullYear();

function weekKey(week, year) { return `${year}-W${String(week).padStart(2,"0")}`; }
function weekLabel(week, year) {
  // Get Monday of that week
  const jan4 = new Date(year, 0, 4);
  const s = new Date(jan4);
  s.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const mon = new Date(s);
  mon.setDate(mon.getDate() + (week - 1) * 7);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(fri)}`;
}

function subtractWeeks(week, year, n) {
  let w = +week - n, y = +year;
  while (w <= 0) { w += 52; y--; }
  return { week: w, year: y };
}
function computeArrivalWeek(run) {
  if (!run.targetWeek || !run.targetYear) return null;
  const finish = run.movesOutside
    ? (+run.weeksIndoor || 0) + (+run.weeksOutdoor || 0)
    : (+run.weeksIndoor || 0);
  const transplant = subtractWeeks(run.targetWeek, run.targetYear, finish);
  const prop = +run.weeksProp || 0;
  return prop > 0 ? subtractWeeks(transplant.week, transplant.year, prop) : transplant;
}

function getLineKey(broker, cultivar, variety, week) {
  return `${broker}||${cultivar||""}||${variety||""}||${week||""}`;
}

// Build expected lines for a given week
function getExpectedLines(runs, week, year) {
  const lines = [];
  runs.forEach(run => {
    if (!run.broker) return;
    const arrival = computeArrivalWeek(run);
    if (!arrival || arrival.week !== week || arrival.year !== year) return;
    const makeBase = (qty, cultivar, variety, itemNum) => {
      const buffered = Math.ceil(qty * (1 + (+run.bufferPct || 0) / 100));
      return { broker: run.broker, runId: run.id, cultivar: cultivar || run.cropName, variety: variety || run.variety, ballItemNumber: itemNum || run.ballItemNumber, expectedQty: buffered, materialType: run.materialType, groupNumber: run.groupNumber };
    };
    if (run.components?.length) {
      run.components.forEach(v => {
        const qty = (+v.cases || 0) * (+run.packSize || 10);
        if (qty > 0) lines.push(makeBase(qty, v.cropName || run.cropName, v.variety, v.ballItemNumber));
      });
    } else {
      const qty = (+run.cases || 0) * (+run.packSize || 10);
      if (qty > 0) lines.push(makeBase(qty));
    }
  });
  // Group by broker
  const byBroker = {};
  lines.forEach(l => { if (!byBroker[l.broker]) byBroker[l.broker] = []; byBroker[l.broker].push(l); });
  return { lines, byBroker };
}

// Get all weeks that have expected arrivals (within 4 past, 4 future of current)
function getRelevantWeeks(runs) {
  const weekSet = new Set();
  runs.forEach(run => {
    const arrival = computeArrivalWeek(run);
    if (!arrival) return;
    const diff = (arrival.year - CURRENT_YEAR) * 52 + arrival.week - CURRENT_WEEK;
    if (diff >= -6 && diff <= 4) weekSet.add(weekKey(arrival.week, arrival.year));
  });
  // Always include current week
  weekSet.add(weekKey(CURRENT_WEEK, CURRENT_YEAR));
  return [...weekSet].sort().map(k => {
    const [y, w] = k.split("-W").map(Number);
    return { week: w, year: y, key: k };
  });
}

const MT_COLORS = {
  urc:   { color: "#8e44ad", bg: "#f5f0ff" },
  seed:  { color: "#c8791a", bg: "#fff4e8" },
  liner: { color: "#2e7d9e", bg: "#e8f4f8" },
  plug:  { color: "#2e7a2e", bg: "#e8f8e8" },
  bulb:  { color: "#b05a20", bg: "#fdf0e0" },
};

// ── CLAIM MODAL ───────────────────────────────────────────────────────────────
function ClaimModal({ line, current, onSave, onClose }) {
  const [note,  setNote]  = useState(current?.claimNote  || "");
  const [photo, setPhoto] = useState(current?.claimPhoto || null);
  const [focus, setFocus] = useState(false);
  const fileRef = useRef();

  function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, padding: "24px 20px 40px", boxShadow: "0 -8px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#c03030" }}>📸 Flag a Problem</div>
            <div style={{ fontSize: 13, color: "#7a8c74", marginTop: 2 }}>{line.cultivar} {line.variety && `· ${line.variety}`}</div>
          </div>
          <button onClick={onClose} style={{ background: "#f0f0f0", border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#4a5a40" }}>Cancel</button>
        </div>

        {/* Photo area */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePhoto} />
        {photo ? (
          <div style={{ position: "relative", marginBottom: 16 }}>
            <img src={photo} alt="claim" style={{ width: "100%", borderRadius: 14, maxHeight: 220, objectFit: "cover" }} />
            <button onClick={() => setPhoto(null)}
              style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 20, width: 32, height: 32, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current.click()}
            style={{ width: "100%", padding: "28px", borderRadius: 14, border: "2px dashed #f0c0c0", background: "#fff8f8", color: "#c03030", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 32 }}>📷</span>
            Take Photo
          </button>
        )}

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>What's wrong?</div>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
            placeholder="Describe the problem — wrong variety, damaged, mislabeled, count off..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${focus ? "#c03030" : "#e8d8d8"}`, fontSize: 14, color: "#1e2d1a", outline: "none", resize: "none", minHeight: 80, boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>

        <button onClick={() => { onSave({ claimNote: note, claimPhoto: photo, hasClaim: true }); onClose(); }}
          style={{ width: "100%", background: "#c03030", color: "#fff", border: "none", borderRadius: 14, padding: "16px", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          Submit Claim
        </button>
      </div>
    </div>
  );
}

// ── LINE ITEM CARD (OPERATOR) ─────────────────────────────────────────────────
function LineCheckCard({ line, lineData, onUpdate, receiverName }) {
  const [showQtyInput, setShowQtyInput] = useState(false);
  const [actualQty,    setActualQty]    = useState(lineData?.actualQty ?? "");
  const [showClaim,    setShowClaim]    = useState(false);
  const key = getLineKey(line.broker, line.cultivar, line.variety, line.arrivalWeek);
  const mt = MT_COLORS[line.materialType] || { color: "#7a8c74", bg: "#f0f5ee" };

  const status = lineData?.status || "pending";

  function markReceived() {
    onUpdate(key, { status: "received", actualQty: line.expectedQty, receivedBy: receiverName, receivedAt: new Date().toISOString() });
    setShowQtyInput(false);
  }
  function markShort() {
    setShowQtyInput(true);
  }
  function submitQty() {
    const qty = Number(actualQty);
    if (!qty) return;
    onUpdate(key, { status: qty >= line.expectedQty ? "received" : "short", actualQty: qty, receivedBy: receiverName, receivedAt: new Date().toISOString() });
    setShowQtyInput(false);
  }

  const bgColor = status === "received" ? "#f0fcf0" : status === "short" ? "#fff8f0" : status === "problem" ? "#fff0f0" : "#fff";
  const borderColor = status === "received" ? "#90d890" : status === "short" ? "#f0c080" : status === "problem" ? "#f0a0a0" : "#e8ede4";

  return (
    <div style={{ background: bgColor, border: `2px solid ${borderColor}`, borderRadius: 16, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>{line.cultivar}</div>
          {line.variety && <div style={{ fontSize: 13, color: "#5a7050", marginTop: 1 }}>{line.variety}</div>}
          {line.groupNumber && <span style={{ background: "#e0ead8", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700, color: "#7a8c74", marginTop: 3, display: "inline-block" }}>G{line.groupNumber}</span>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1a2a1a" }}>{(lineData?.actualQty ?? line.expectedQty).toLocaleString()}</div>
          {lineData?.actualQty && lineData.actualQty !== line.expectedQty && (
            <div style={{ fontSize: 11, color: "#9aaa90", textDecoration: "line-through" }}>{line.expectedQty.toLocaleString()} exp.</div>
          )}
          {!lineData?.actualQty && <div style={{ fontSize: 10, color: "#9aaa90" }}>expected</div>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ background: mt.bg, color: mt.color, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{line.materialType?.toUpperCase()}</span>
        <span style={{ background: "#f0f5ee", color: "#5a7050", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>{line.broker}</span>
        {line.ballItemNumber && <span style={{ background: "#f8f8f8", color: "#9aaa90", borderRadius: 8, padding: "2px 8px", fontSize: 11, fontFamily: "monospace" }}>{line.ballItemNumber}</span>}
      </div>

      {/* Claim badge */}
      {lineData?.hasClaim && (
        <div style={{ background: "#fef0f0", border: "1px solid #f0c0c0", borderRadius: 8, padding: "6px 10px", marginBottom: 10, fontSize: 12, color: "#c03030", fontWeight: 700 }}>
          📸 Claim filed{lineData.claimNote ? ` — ${lineData.claimNote}` : ""}
        </div>
      )}

      {/* Status area */}
      {status === "pending" && !showQtyInput && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <button onClick={markReceived}
            style={{ padding: "14px 8px", borderRadius: 12, border: "2px solid #7fb069", background: "#f0fcf0", color: "#2e7d32", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Got It
          </button>
          <button onClick={markShort}
            style={{ padding: "14px 8px", borderRadius: 12, border: "2px solid #f0c080", background: "#fff8f0", color: "#c8791a", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Short
          </button>
          <button onClick={() => setShowClaim(true)}
            style={{ padding: "14px 8px", borderRadius: 12, border: "2px solid #f0a0a0", background: "#fff0f0", color: "#c03030", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            Problem
          </button>
        </div>
      )}

      {status === "pending" && showQtyInput && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#c8791a", marginBottom: 8 }}>How many actually arrived?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" value={actualQty} onChange={e => setActualQty(e.target.value)}
              placeholder={`Expected: ${line.expectedQty}`}
              style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "2px solid #f0c080", fontSize: 16, fontWeight: 700, color: "#1a2a1a", outline: "none", fontFamily: "inherit" }} />
            <button onClick={submitQty}
              style={{ padding: "12px 20px", borderRadius: 10, background: "#c8791a", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              Save
            </button>
            <button onClick={() => setShowQtyInput(false)}
              style={{ padding: "12px 14px", borderRadius: 10, background: "#f0f0f0", border: "none", color: "#7a8c74", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {status !== "pending" && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {status === "received" && <span style={{ fontSize: 14, fontWeight: 800, color: "#2e7d32" }}>✓ Received</span>}
            {status === "short"    && <span style={{ fontSize: 14, fontWeight: 800, color: "#c8791a" }}>⚠ Short — {lineData.actualQty?.toLocaleString()} received</span>}
            {status === "problem"  && <span style={{ fontSize: 14, fontWeight: 800, color: "#c03030" }}>✕ Problem flagged</span>}
            {lineData?.receivedBy  && <span style={{ fontSize: 11, color: "#9aaa90" }}>by {lineData.receivedBy}</span>}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setShowClaim(true)}
              style={{ padding: "5px 11px", borderRadius: 8, border: "1.5px solid #f0c0c0", background: "#fff8f8", color: "#c03030", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              📸 {lineData?.hasClaim ? "Edit Claim" : "File Claim"}
            </button>
            <button onClick={() => onUpdate(key, { status: "pending", actualQty: null, receivedBy: null, receivedAt: null })}
              style={{ padding: "5px 11px", borderRadius: 8, border: "1.5px solid #dde8d5", background: "#f8faf6", color: "#7a8c74", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Undo
            </button>
          </div>
        </div>
      )}

      {showClaim && (
        <ClaimModal
          line={line}
          current={lineData}
          onSave={data => { onUpdate(key, { ...data, status: "problem" }); }}
          onClose={() => setShowClaim(false)}
        />
      )}
    </div>
  );
}

// ── OPERATOR RECEIVING VIEW ───────────────────────────────────────────────────
export function OperatorReceiving() {
  const { rows: runs } = useCropRuns();
  const [allData,       setAllData]       = useState(() => load(STORAGE_KEY, {}));
  const [selectedWeek,  setSelectedWeek]  = useState(() => weekKey(CURRENT_WEEK, CURRENT_YEAR));
  const [receiverName,  setReceiverName]  = useState(() => localStorage.getItem("gh_receiver_name") || "");
  const [nameConfirmed, setNameConfirmed] = useState(() => !!localStorage.getItem("gh_receiver_name"));
  const [nameInput,     setNameInput]     = useState("");
  const [focusName,     setFocusName]     = useState(false);
  const packingRef = useRef();

  const relevantWeeks = getRelevantWeeks(runs);
  const [selYear, selWeek] = selectedWeek.split("-W").map(Number);
  const { lines, byBroker } = getExpectedLines(runs, selWeek, selYear);
  const weekData = allData[selectedWeek] || {};
  const lineData = weekData.lines || {};

  function persistData(weekK, updates) {
    const current = allData[weekK] || {};
    const updated = { ...allData, [weekK]: { ...current, ...updates } };
    setAllData(updated);
    save(STORAGE_KEY, updated);
  }
  function updateLine(key, data) {
    const current = lineData;
    persistData(selectedWeek, { lines: { ...current, [key]: { ...(current[key] || {}), ...data } } });
  }

  function handlePackingSlip(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => persistData(selectedWeek, { packingSlipPhoto: ev.target.result, packingSlipName: file.name });
    reader.readAsDataURL(file);
  }

  function confirmName() {
    if (!nameInput.trim()) return;
    setReceiverName(nameInput.trim());
    localStorage.setItem("gh_receiver_name", nameInput.trim());
    setNameConfirmed(true);
  }

  const totalLines    = lines.length;
  const receivedCount = Object.values(lineData).filter(d => d.status === "received" || d.status === "short").length;
  const shortCount    = Object.values(lineData).filter(d => d.status === "short").length;
  const problemCount  = Object.values(lineData).filter(d => d.status === "problem" || d.hasClaim).length;
  const isCurrentWeek = selectedWeek === weekKey(CURRENT_WEEK, CURRENT_YEAR);

  // Name entry screen
  if (!nameConfirmed) {
    return (
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ fontSize: 40 }}>📦</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#1a2a1a", textAlign: "center" }}>Who's receiving today?</div>
        <div style={{ fontSize: 14, color: "#7a8c74", textAlign: "center" }}>Enter your name so we know who checked things in.</div>
        <input value={nameInput} onChange={e => setNameInput(e.target.value)}
          onFocus={() => setFocusName(true)} onBlur={() => setFocusName(false)}
          onKeyDown={e => e.key === "Enter" && confirmName()}
          placeholder="Your name..."
          style={{ width: "100%", maxWidth: 320, padding: "16px 18px", borderRadius: 14, border: `2px solid ${focusName ? "#7fb069" : "#c8d8c0"}`, fontSize: 18, fontWeight: 700, color: "#1a2a1a", outline: "none", textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" }} />
        <button onClick={confirmName} disabled={!nameInput.trim()}
          style={{ width: "100%", maxWidth: 320, padding: "16px", borderRadius: 14, background: nameInput.trim() ? "#7fb069" : "#c8d8c0", color: "#fff", border: "none", fontSize: 18, fontWeight: 800, cursor: nameInput.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
          Start Receiving
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Receiver + week selector */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#5a7050" }}>
          👤 <strong>{receiverName}</strong>
          <button onClick={() => { setNameConfirmed(false); setNameInput(""); localStorage.removeItem("gh_receiver_name"); }}
            style={{ background: "none", border: "none", color: "#9aaa90", fontSize: 11, cursor: "pointer", marginLeft: 6, fontFamily: "inherit" }}>
            (change)
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#9aaa90" }}>{isCurrentWeek ? "This Week" : ""}</div>
      </div>

      {/* Week tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 18 }}>
        {relevantWeeks.map(w => {
          const isActive = w.key === selectedWeek;
          const wData = allData[w.key]?.lines || {};
          const wLines = getExpectedLines(runs, w.week, w.year).lines;
          const wReceived = Object.values(wData).filter(d => d.status === "received" || d.status === "short").length;
          const wIsNow = w.key === weekKey(CURRENT_WEEK, CURRENT_YEAR);
          const diff = (w.year - CURRENT_YEAR) * 52 + w.week - CURRENT_WEEK;
          return (
            <button key={w.key} onClick={() => setSelectedWeek(w.key)}
              style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 12, border: `2px solid ${isActive ? "#7fb069" : "#dde8d5"}`, background: isActive ? "#1e2d1a" : "#fff", color: isActive ? "#c8e6b8" : "#5a7050", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
              <div>{wIsNow ? "This Week" : diff === -1 ? "Last Wk" : diff === 1 ? "Next Wk" : `Wk ${w.week}`}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: isActive ? "#7fb069" : "#9aaa90", marginTop: 2 }}>{wLines.length > 0 ? `${wReceived}/${wLines.length}` : "—"}</div>
            </button>
          );
        })}
      </div>

      {/* Week header */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #e0ead8", padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1a2a1a" }}>Week {selWeek} Arrivals</div>
            <div style={{ fontSize: 12, color: "#7a8c74" }}>{weekLabel(selWeek, selYear)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: receivedCount === totalLines && totalLines > 0 ? "#2e7d32" : "#1a2a1a" }}>{receivedCount}/{totalLines}</div>
            <div style={{ fontSize: 10, color: "#9aaa90" }}>checked in</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {shortCount   > 0 && <span style={{ background: "#fff4e8", color: "#c8791a", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>⚠ {shortCount} short</span>}
          {problemCount > 0 && <span style={{ background: "#fef0f0", color: "#c03030", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>🚨 {problemCount} claim{problemCount !== 1 ? "s" : ""}</span>}
          {receivedCount === totalLines && totalLines > 0 && <span style={{ background: "#e8f8e8", color: "#2e7d32", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>✓ All checked in</span>}
        </div>
      </div>

      {/* Packing slip */}
      <input ref={packingRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePackingSlip} />
      {weekData.packingSlipPhoto ? (
        <div style={{ marginBottom: 14, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6, marginBottom: 6 }}>Packing Slip</div>
          <img src={weekData.packingSlipPhoto} alt="packing slip"
            style={{ width: "100%", borderRadius: 14, maxHeight: 180, objectFit: "cover", border: "2px solid #e0ead8" }} />
          <button onClick={() => packingRef.current.click()}
            style={{ position: "absolute", top: 28, right: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 10, padding: "5px 10px", color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
            Replace
          </button>
        </div>
      ) : (
        <button onClick={() => packingRef.current.click()}
          style={{ width: "100%", padding: "14px", borderRadius: 14, border: "2px dashed #c8d8c0", background: "#fafcf8", color: "#7a8c74", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📄</span> Photograph Packing Slip
        </button>
      )}

      {/* Line items by broker */}
      {lines.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, border: "1.5px dashed #c8d8c0", padding: "50px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a2a1a", marginBottom: 6 }}>Nothing expected this week</div>
          <div style={{ fontSize: 13, color: "#7a8c74" }}>Check another week or make sure crop run sourcing is filled in.</div>
        </div>
      ) : Object.entries(byBroker).map(([broker, bLines]) => (
        <div key={broker} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#5a7050", textTransform: "uppercase", letterSpacing: .8, marginBottom: 8, paddingLeft: 2 }}>
            📋 {broker} · {bLines.length} item{bLines.length !== 1 ? "s" : ""}
          </div>
          {bLines.map((line, i) => (
            <LineCheckCard
              key={i}
              line={line}
              lineData={lineData[getLineKey(line.broker, line.cultivar, line.variety, line.arrivalWeek)]}
              onUpdate={updateLine}
              receiverName={receiverName}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── PLANNER RECEIVING SUMMARY ─────────────────────────────────────────────────
export function PlannerReceiving() {
  const { rows: runs } = useCropRuns();
  const [allData,      setAllData]      = useState(() => load(STORAGE_KEY, {}));
  const [selectedWeek, setSelectedWeek] = useState(() => weekKey(CURRENT_WEEK, CURRENT_YEAR));
  const [focus,        setFocus]        = useState(false);

  const relevantWeeks = getRelevantWeeks(runs);
  const [selYear, selWeek] = selectedWeek.split("-W").map(Number);
  const { lines, byBroker } = getExpectedLines(runs, selWeek, selYear);
  const weekData = allData[selectedWeek] || {};
  const lineData = weekData.lines || {};

  function savePlannerNote(note) {
    const updated = { ...allData, [selectedWeek]: { ...(allData[selectedWeek] || {}), plannerNotes: note } };
    setAllData(updated);
    save(STORAGE_KEY, updated);
  }

  const receivedCount = Object.values(lineData).filter(d => d.status === "received" || d.status === "short").length;
  const shortCount    = Object.values(lineData).filter(d => d.status === "short").length;
  const problemCount  = Object.values(lineData).filter(d => d.hasClaim).length;
  const isCurrentWeek = selectedWeek === weekKey(CURRENT_WEEK, CURRENT_YEAR);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .8, marginBottom: 10 }}>Select Week</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {relevantWeeks.map(w => {
            const isActive = w.key === selectedWeek;
            const wData = allData[w.key]?.lines || {};
            const wLines = getExpectedLines(runs, w.week, w.year).lines;
            const wReceived = Object.values(wData).filter(d => d.status === "received" || d.status === "short").length;
            const wShorts   = Object.values(wData).filter(d => d.status === "short").length;
            const wProblems = Object.values(wData).filter(d => d.hasClaim).length;
            const wIsNow = w.key === weekKey(CURRENT_WEEK, CURRENT_YEAR);
            const diff = (w.year - CURRENT_YEAR) * 52 + w.week - CURRENT_WEEK;
            return (
              <button key={w.key} onClick={() => setSelectedWeek(w.key)}
                style={{ padding: "8px 14px", borderRadius: 12, border: `1.5px solid ${isActive ? "#7fb069" : wProblems > 0 ? "#f0c0c0" : wShorts > 0 ? "#f0d8a0" : "#dde8d5"}`, background: isActive ? "#1e2d1a" : "#fff", color: isActive ? "#c8e6b8" : "#5a7050", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                {wIsNow ? "This Week" : diff < 0 ? `Wk ${w.week} (past)` : `Wk ${w.week}`}
                {wLines.length > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: isActive ? "#7fb069" : "#9aaa90" }}>{wReceived}/{wLines.length}</span>}
                {wProblems > 0 && <span style={{ marginLeft: 4, fontSize: 10, color: "#c03030", fontWeight: 900 }}>🚨</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px,1fr))", gap: 10, marginBottom: 18 }}>
        {[
          { label: "Expected",  value: lines.length,    color: "#1e2d1a" },
          { label: "Checked In",value: receivedCount,   color: "#2e7d32" },
          { label: "Short",     value: shortCount,      color: shortCount   > 0 ? "#c8791a" : "#7a8c74" },
          { label: "Claims",    value: problemCount,    color: problemCount > 0 ? "#c03030" : "#7a8c74" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #e0ead8", padding: "12px 14px" }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Planner notes */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", padding: "14px 16px", marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>📝 Planner Notes — How are you handling discrepancies?</div>
        <textarea
          value={weekData.plannerNotes || ""}
          onChange={e => savePlannerNote(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder="e.g. Ball short 200 Impatiens — ordered backup from Dummen. 3 Petunia trays damaged — claim filed, credit expected by Wk 14..."
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${focus ? "#7fb069" : "#dde8d5"}`, fontSize: 13, color: "#1e2d1a", outline: "none", resize: "none", minHeight: 90, boxSizing: "border-box", fontFamily: "inherit" }}
        />
      </div>

      {/* Packing slip preview */}
      {weekData.packingSlipPhoto && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9aaa90", textTransform: "uppercase", letterSpacing: .6, marginBottom: 8 }}>Packing Slip</div>
          <img src={weekData.packingSlipPhoto} alt="packing slip" style={{ width: "100%", borderRadius: 14, maxHeight: 200, objectFit: "cover", border: "1.5px solid #e0ead8" }} />
        </div>
      )}

      {/* Line breakdown */}
      {lines.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1.5px dashed #c8d8c0", padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#7a8c74" }}>No arrivals expected this week.</div>
        </div>
      ) : Object.entries(byBroker).map(([broker, bLines]) => (
        <div key={broker} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e0ead8", overflow: "hidden", marginBottom: 12 }}>
          <div style={{ padding: "10px 16px", background: "#f8faf6", borderBottom: "1px solid #e8ede4", fontWeight: 800, fontSize: 13, color: "#1e2d1a" }}>
            📋 {broker}
          </div>
          {bLines.map((line, i) => {
            const key  = getLineKey(line.broker, line.cultivar, line.variety, line.arrivalWeek);
            const ld   = lineData[key] || {};
            const stat = ld.status || "pending";
            const statusColor = stat === "received" ? "#2e7d32" : stat === "short" ? "#c8791a" : stat === "problem" ? "#c03030" : "#9aaa90";
            const statusBg    = stat === "received" ? "#e8f8e8" : stat === "short" ? "#fff4e8" : stat === "problem" ? "#fef0f0" : "#f0f5ee";
            const statusLabel = stat === "received" ? "✓ Received" : stat === "short" ? "⚠ Short" : stat === "problem" ? "🚨 Problem" : "Pending";
            return (
              <div key={i} style={{ padding: "11px 16px", borderTop: i > 0 ? "1px solid #f0f5ee" : "none", display: "flex", alignItems: "center", gap: 12, background: ld.hasClaim ? "#fff8f8" : "transparent" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e2d1a" }}>{line.cultivar}{line.variety ? ` · ${line.variety}` : ""}</div>
                  {ld.receivedBy && <div style={{ fontSize: 11, color: "#9aaa90", marginTop: 1 }}>by {ld.receivedBy}</div>}
                  {ld.claimNote  && <div style={{ fontSize: 11, color: "#c03030", marginTop: 2 }}>📸 {ld.claimNote}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#1e2d1a" }}>{(ld.actualQty ?? line.expectedQty).toLocaleString()}</div>
                  {ld.actualQty && ld.actualQty !== line.expectedQty && <div style={{ fontSize: 10, color: "#9aaa90", textDecoration: "line-through" }}>{line.expectedQty.toLocaleString()}</div>}
                </div>
                <span style={{ background: statusBg, color: statusColor, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 800 }}>{statusLabel}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
