import { useMemo, useState } from "react";
import { useDeliveries, getSupabase } from "../supabase";
import { useAuth } from "../Auth";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";

const TEAM_LABELS = {
  bluff1: "Bluff Team 1",
  bluff2: "Bluff Team 2",
  sprague: "Sprague Team",
  houseplants: "Houseplants Team",
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${Math.round(c / 100).toLocaleString()}`; }

export default function TeamPullView({ team: teamProp, onSwitchMode }) {
  const { team: ctxTeam, displayName } = useAuth();
  const team = teamProp || ctxTeam || "bluff1";
  const { rows: deliveries, update } = useDeliveries();

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showProblem, setShowProblem] = useState(false);

  const needsField = `needs${team[0].toUpperCase() + team.slice(1)}`;
  const pulledAtField = `${team}PulledAt`;
  const pulledByField = `${team}PulledBy`;

  const todaysForTeam = useMemo(() => {
    const today = todayISO();
    return deliveries.filter(d =>
      d.deliveryDate === today &&
      d.lifecycle === "confirmed" &&
      d[needsField]
    );
  }, [deliveries, needsField]);

  const pending = useMemo(() =>
    todaysForTeam
      .filter(d => !d[pulledAtField])
      .sort((a, b) =>
        (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999) ||
        (a.deliveryTime || "").localeCompare(b.deliveryTime || "") ||
        (a.createdAt || "").localeCompare(b.createdAt || "")
      ),
    [todaysForTeam, pulledAtField]
  );

  const current = pending[0] || null;
  const pulledCount = todaysForTeam.length - pending.length;
  const totalDollars = todaysForTeam.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const pulledDollars = todaysForTeam.filter(d => d[pulledAtField]).reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const remainingDollars = totalDollars - pulledDollars;
  const pct = todaysForTeam.length === 0 ? 0 : Math.round((pulledCount / todaysForTeam.length) * 100);

  async function submitPhotos(files) {
    if (!current || files.length === 0) return;
    const sb = getSupabase();
    const uploaded = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ts = Date.now();
      const path = `${current.id}/${team}/${ts}-${i}.jpg`;
      const { error } = await sb.storage.from("pick-sheet-photos").upload(path, f, { contentType: f.type || "image/jpeg" });
      if (error) { alert("Upload failed: " + error.message); return; }
      uploaded.push({
        team, page_index: i, storage_path: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: displayName || "team",
      });
    }
    const existing = Array.isArray(current.pickSheetPhotos) ? current.pickSheetPhotos : [];
    await update(current.id, {
      pickSheetPhotos: [...existing, ...uploaded],
      [pulledAtField]: new Date().toISOString(),
      [pulledByField]: displayName || "team",
    });
    setShowPhotoModal(false);
  }

  async function submitProblem(text, file) {
    if (!current || !text.trim()) return;
    const sb = getSupabase();
    const alerts = Array.isArray(current.alerts) ? [...current.alerts] : [];
    alerts.push({
      text: text.trim(),
      author: displayName || "team",
      created_at: new Date().toISOString(),
      severity: "problem",
      team,
    });
    const patch = { alerts };
    if (file) {
      try {
        const ts = Date.now();
        const path = `${current.id}/${team}/problem-${ts}.jpg`;
        await sb.storage.from("pick-sheet-photos").upload(path, file, { contentType: file.type || "image/jpeg" });
      } catch {}
    }
    await update(current.id, patch);
    setShowProblem(false);
  }

  return (
    <div style={{ ...FONT, minHeight: "100vh", background: DARK, color: "#fff", paddingBottom: 60 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet" />

      <div style={{ padding: "16px", borderBottom: `1px solid ${GREEN}33`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: GREEN, textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>{TEAM_LABELS[team] || team}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif" }}>Hi {displayName}</div>
        </div>
        <button onClick={onSwitchMode} style={{ background: "transparent", border: `1px solid ${GREEN}66`, color: CREAM, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>🚪 Sign out</button>
      </div>

      <div style={{ padding: 16 }}>
        {current ? (
          <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Next up</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 4 }}>
              {current.customerSnapshot?.company_name || "—"}
            </div>
            <div style={{ fontSize: 14, color: "#9cb894", marginBottom: 12 }}>
              {current.deliveryTime || "—"} · {current.cartCount || 0} carts · {fmtMoney(current.orderValueCents)}
            </div>
            {(current.customerSnapshot?.terms || "").toUpperCase().includes("COD") && (
              <div style={{ background: RED, color: "#fff", padding: 10, borderRadius: 8, fontWeight: 800, marginBottom: 8 }}>
                💰 COD — collect {fmtMoney(current.orderValueCents)}
              </div>
            )}
            {current.customerSnapshot?.shipping_notes && (
              <div style={{ background: "#1e2d1a", color: CREAM, padding: 10, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                📝 {current.customerSnapshot.shipping_notes}
              </div>
            )}
            {current.notes && (
              <div style={{ fontSize: 13, color: CREAM, marginBottom: 12, whiteSpace: "pre-wrap" }}>{current.notes}</div>
            )}

            <button onClick={() => setShowPhotoModal(true)}
              style={{ width: "100%", background: GREEN, color: DARK, border: "none", padding: "18px 0", borderRadius: 12, fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
              ✓ Mark {TEAM_LABELS[team].replace(" Team", "")} done
            </button>
            <button onClick={() => setShowProblem(true)}
              style={{ width: "100%", background: "transparent", color: "#ffb3a8", border: `1.5px solid ${RED}`, padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
              ⚠ Report problem
            </button>
          </div>
        ) : (
          <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 14, padding: 40, textAlign: "center", color: CREAM }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>☀️</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>All caught up</div>
            <div style={{ fontSize: 13, color: "#9cb894" }}>Waiting for Tyler to release the next batch.</div>
          </div>
        )}

        {/* Progress */}
        <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 12, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Today's progress</div>
          <div style={{ height: 10, background: "#1e2d1a", borderRadius: 5, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: GREEN }} />
          </div>
          <div style={{ fontSize: 13, color: CREAM }}>{pulledCount} of {todaysForTeam.length} pulled</div>
          <div style={{ fontSize: 13, color: "#9cb894" }}>{fmtMoney(pulledDollars)} of {fmtMoney(totalDollars)} pulled</div>
          <div style={{ fontSize: 13, color: "#9cb894" }}>{fmtMoney(remainingDollars)} remaining</div>
        </div>
      </div>

      {showPhotoModal && current && (
        <PickSheetModal onCancel={() => setShowPhotoModal(false)} onSubmit={submitPhotos} />
      )}
      {showProblem && current && (
        <ProblemModal onCancel={() => setShowProblem(false)} onSubmit={submitProblem} />
      )}
    </div>
  );
}

function PickSheetModal({ onCancel, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  function addFile(e) {
    const f = e.target.files?.[0];
    if (f) setFiles(prev => [...prev, f]);
    e.target.value = "";
  }

  async function handleSubmit() {
    setUploading(true);
    try { await onSubmit(files); } finally { setUploading(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div style={{ background: DARK, borderRadius: 14, width: "100%", maxWidth: 420, border: `1px solid ${GREEN}44`, padding: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: CREAM, marginBottom: 12 }}>Upload pick sheet pages</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
              <button onClick={() => setFiles(ps => ps.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: 2, right: 2, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.7)", color: "#fff", border: "none", cursor: "pointer" }}>×</button>
            </div>
          ))}
          <label style={{ width: 80, height: 80, borderRadius: 8, border: `2px dashed ${GREEN}66`, background: "#263821", display: "flex", alignItems: "center", justifyContent: "center", color: CREAM, fontSize: 30, cursor: "pointer" }}>
            +
            <input type="file" accept="image/*" capture="environment" onChange={addFile} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: "#9cb894", marginBottom: 12 }}>At least 1 page required.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} disabled={uploading}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "transparent", border: `1.5px solid #4a6a3a`, color: CREAM, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={files.length === 0 || uploading}
            style={{ flex: 2, padding: "14px 0", borderRadius: 10, background: files.length === 0 || uploading ? "#4a6a3a" : GREEN, color: DARK, border: "none", fontWeight: 800, cursor: files.length === 0 ? "default" : "pointer", fontFamily: "inherit" }}>
            {uploading ? "Uploading…" : "Submit & mark done"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProblemModal({ onCancel, onSubmit }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, ...FONT }}>
      <div style={{ background: DARK, borderRadius: 14, width: "100%", maxWidth: 420, border: `1px solid ${RED}`, padding: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: CREAM, marginBottom: 12 }}>Report problem</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What happened?"
          style={{ width: "100%", minHeight: 100, padding: 12, borderRadius: 10, border: `1.5px solid #4a6a3a`, background: "#263821", color: CREAM, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 10, resize: "vertical" }} />
        <label style={{ display: "inline-block", padding: "10px 14px", borderRadius: 10, background: "#263821", color: CREAM, border: `1px dashed ${GREEN}66`, cursor: "pointer", fontWeight: 700, fontSize: 12, marginBottom: 12 }}>
          📷 {file ? "Photo attached" : "Attach photo (optional)"}
          <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "14px 0", borderRadius: 10, background: "transparent", border: `1.5px solid #4a6a3a`, color: CREAM, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={() => onSubmit(text, file)} disabled={!text.trim()}
            style={{ flex: 2, padding: "14px 0", borderRadius: 10, background: text.trim() ? RED : "#4a6a3a", color: "#fff", border: "none", fontWeight: 800, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
