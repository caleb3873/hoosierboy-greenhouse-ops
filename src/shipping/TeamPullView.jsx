import { useMemo, useState } from "react";
import { useDeliveries, useShippingCustomers, getSupabase } from "../supabase";
import { useAuth } from "../Auth";
import { NotificationBanner } from "../PushNotifications";

const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const DARK = "#1e2d1a";
const GREEN = "#7fb069";
const CREAM = "#c8e6b8";
const RED = "#d94f3d";
const AMBER = "#e89a3a";
const MUTED = "#7a8c74";
const BORDER = "#e0ead8";

const TEAM_LABELS = {
  bluff1: "Bluff Team — Sam",
  bluff2: "Bluff Team — Ryan",
  sprague: "Sprague Team",
  houseplants: "Houseplants Team",
  loader: "Loader",
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtMoney(c) { if (!c && c !== 0) return "—"; return `$${Math.round(c / 100).toLocaleString()}`; }

export default function TeamPullView({ team: teamProp, onSwitchMode, canAddOrders = false }) {
  const { team: ctxTeam, displayName, signOut } = useAuth();
  const team = teamProp || ctxTeam || "bluff1";
  const { rows: deliveries, update, insert } = useDeliveries();
  const { rows: customers } = useShippingCustomers();

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showProblem, setShowProblem] = useState(false);
  const [showAddOrder, setShowAddOrder] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);

  // Add order form state
  const [aoSearch, setAoSearch] = useState("");
  const [aoCustomer, setAoCustomer] = useState(null);
  const [aoAmount, setAoAmount] = useState("");
  const [aoDate, setAoDate] = useState(todayISO());
  const [aoTime, setAoTime] = useState("");
  const [aoNotes, setAoNotes] = useState("");
  const [aoSaving, setAoSaving] = useState(false);

  const isBluff = team === "bluff1" || team === "bluff2" || team === "loader";
  const effectiveTeam = team === "loader" ? "bluff1" : team;

  // For bluff teams: shared pool where (needsBluff1 || needsBluff2)
  // For sprague/houseplants: their own needs field
  const needsField = isBluff ? null : `needs${effectiveTeam[0].toUpperCase() + effectiveTeam.slice(1)}`;

  // Today's deliveries for this team
  const todaysForTeam = useMemo(() => {
    const today = todayISO();
    return deliveries.filter(d => {
      if (d.deliveryDate !== today || d.lifecycle !== "confirmed") return false;
      if (isBluff) return d.needsBluff1 || d.needsBluff2;
      return d[needsField];
    });
  }, [deliveries, needsField, isBluff]);

  // "Fully pulled" = ALL portions done (for progress bar)
  function isFullyPulled(d) {
    if (isBluff) {
      const b1Done = !d.needsBluff1 || d.bluff1PulledAt;
      const b2Done = !d.needsBluff2 || d.bluff2PulledAt;
      return b1Done && b2Done;
    }
    return !!d[`${effectiveTeam}PulledAt`];
  }

  // "My portion done" = for Bluff teams, either team completing marks all Bluff done
  // So any bluff team member skips orders where bluff1PulledAt is set (since completion sets both)
  function isMyPortionDone(d) {
    if (isBluff) {
      const b1Done = !d.needsBluff1 || !!d.bluff1PulledAt;
      const b2Done = !d.needsBluff2 || !!d.bluff2PulledAt;
      return b1Done && b2Done;
    }
    return !!d[`${effectiveTeam}PulledAt`];
  }

  // Alias for backward compat in all-orders list
  function isPulled(d) { return isFullyPulled(d); }

  // For bluff: is this order claimed by another bluff team lead?
  function isClaimedByOther(d) {
    if (!isBluff) return false;
    return d.bluffClaimedBy && d.bluffClaimedBy !== displayName;
  }

  // For bluff: is this order claimed by ME?
  function isClaimedByMe(d) {
    if (!isBluff) return false;
    return d.bluffClaimedBy === displayName;
  }

  // Pending orders: my portion not yet done, sorted by priority
  const allPending = useMemo(() =>
    todaysForTeam
      .filter(d => !isMyPortionDone(d))
      .sort((a, b) =>
        (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999) ||
        (a.deliveryTime || "").localeCompare(b.deliveryTime || "") ||
        (a.createdAt || "").localeCompare(b.createdAt || "")
      ),
    [todaysForTeam, team] // eslint-disable-line
  );

  // Current order for this person:
  // - Bluff: first show my claimed order if any, otherwise first unclaimed
  // - Sprague/HP: just the first pending
  const myClaimed = isBluff ? allPending.find(d => isClaimedByMe(d)) : null;
  const nextUnclaimed = isBluff
    ? allPending.find(d => !d.bluffClaimedBy)
    : allPending[0];
  const current = myClaimed || (isBluff ? null : nextUnclaimed);
  const needsClaim = isBluff && !myClaimed && !!nextUnclaimed;

  // Stats — based on MY portion, not all portions
  const pulledCount = todaysForTeam.filter(d => isMyPortionDone(d)).length;
  const totalDollars = todaysForTeam.reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const pulledDollars = todaysForTeam.filter(d => isMyPortionDone(d)).reduce((s, d) => s + (d.orderValueCents || 0), 0);
  const remainingDollars = totalDollars - pulledDollars;
  const pct = todaysForTeam.length === 0 ? 0 : Math.round((pulledCount / todaysForTeam.length) * 100);

  // Claim an order (bluff only)
  async function claimOrder() {
    if (!nextUnclaimed) return;
    await update(nextUnclaimed.id, {
      bluffClaimedBy: displayName,
      bluffClaimedAt: new Date().toISOString(),
    });
  }

  // Customer search for add order
  const aoMatches = useMemo(() => {
    if (!aoSearch || aoSearch.length < 2) return [];
    const q = aoSearch.toLowerCase();
    return customers.filter(c => (c.companyName || "").toLowerCase().includes(q)).slice(0, 8);
  }, [aoSearch, customers]);

  // Save new order (proposed — needs Tyler approval)
  async function saveAddOrder() {
    if (!aoCustomer) return;
    setAoSaving(true);
    try {
      const cust = aoCustomer;
      const snapshot = {
        company_name: cust.companyName, address1: cust.address1 || "", city: cust.city || "",
        state: cust.state || "", zip: cust.zip || "", phone: cust.phone || "",
        email: cust.email || "", terms: cust.terms || "",
      };
      await insert({
        customerId: cust.id, customerSnapshot: snapshot, deliveryDate: aoDate,
        deliveryTime: aoTime || null, orderValueCents: Math.round((parseFloat(aoAmount) || 0) * 100),
        notes: aoNotes || null, needsHouseplants: team === "houseplants",
        needsBluff1: team !== "houseplants", needsSprague: false,
        lifecycle: "proposed", salesConfirmedAt: new Date().toISOString(), salesConfirmedBy: displayName,
      });
      setAoSearch(""); setAoCustomer(null); setAoAmount(""); setAoTime(""); setAoNotes(""); setShowAddOrder(false);
    } catch (err) { alert("Failed: " + err.message); }
    setAoSaving(false);
  }

  // All orders for this team (for "view all" mode)
  const allTeamOrders = useMemo(() => {
    const needsField2 = `needs${effectiveTeam[0].toUpperCase() + effectiveTeam.slice(1)}`;
    return deliveries
      .filter(d => d.lifecycle !== "cancelled" && (isBluff ? (d.needsBluff1 || d.needsBluff2) : d[needsField2]))
      .sort((a, b) => (b.deliveryDate || "").localeCompare(a.deliveryDate || "") || (a.priorityOrder ?? 9999) - (b.priorityOrder ?? 9999));
  }, [deliveries, effectiveTeam, isBluff]);

  // Submit pick sheet photos + mark pulled
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

    // Determine which pulled fields to set
    const patch = { pickSheetPhotos: [...existing, ...uploaded] };
    if (isBluff) {
      // Either Bluff team completing marks ALL of Bluff done
      const now = new Date().toISOString();
      if (current.needsBluff1) { patch.bluff1PulledAt = now; patch.bluff1PulledBy = displayName; }
      if (current.needsBluff2) { patch.bluff2PulledAt = now; patch.bluff2PulledBy = displayName; }
      patch.bluffClaimedBy = null;
      patch.bluffClaimedAt = null;
    } else {
      patch[`${effectiveTeam}PulledAt`] = new Date().toISOString();
      patch[`${effectiveTeam}PulledBy`] = displayName;
    }
    await update(current.id, patch);
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

  // Team pull icons using letters
  function pullIcons(d) {
    const b1Done = !d.needsBluff1 || d.bluff1PulledAt;
    const b2Done = !d.needsBluff2 || d.bluff2PulledAt;
    const bluffDone = b1Done && b2Done;
    const bluffNeeded = d.needsBluff1 || d.needsBluff2;
    return (
      <div style={{ display: "flex", gap: 6, fontSize: 13, fontWeight: 800 }}>
        {bluffNeeded && <span style={{ color: bluffDone ? GREEN : "#9cb894" }}>B{bluffDone ? "✓" : "○"}</span>}
        {d.needsSprague && <span style={{ color: d.spraguePulledAt ? GREEN : "#9cb894" }}>S{d.spraguePulledAt ? "✓" : "○"}</span>}
        {d.needsHouseplants && <span style={{ color: d.houseplantsPulledAt ? GREEN : "#9cb894" }}>H{d.houseplantsPulledAt ? "✓" : "○"}</span>}
      </div>
    );
  }

  const activeOrder = current || nextUnclaimed;

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
        <NotificationBanner />
        {/* Claim flow for Bluff teams */}
        {needsClaim && nextUnclaimed && (
          <div style={{ background: "#263821", border: `1px solid ${GREEN}44`, borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Next available</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 6, lineHeight: 1.15 }}>
              {nextUnclaimed.customerSnapshot?.company_name || "—"}
            </div>
            {(nextUnclaimed.customerSnapshot?.address1 || nextUnclaimed.customerSnapshot?.city) && (
              <div style={{ fontSize: 13, color: "#9cb894", marginBottom: 8 }}>
                {nextUnclaimed.customerSnapshot.address1 && <div>{nextUnclaimed.customerSnapshot.address1}</div>}
                <div>{[nextUnclaimed.customerSnapshot.city, nextUnclaimed.customerSnapshot.state].filter(Boolean).join(", ")} {nextUnclaimed.customerSnapshot.zip || ""}</div>
              </div>
            )}
            <div style={{ fontSize: 15, color: "#9cb894", marginBottom: 6 }}>
              {nextUnclaimed.deliveryTime || "—"} · {nextUnclaimed.cartCount || 0} carts · {fmtMoney(nextUnclaimed.orderValueCents)}
            </div>
            {pullIcons(nextUnclaimed)}
            {(nextUnclaimed.customerSnapshot?.terms || "").toUpperCase().includes("COD") && (
              <div style={{ background: RED, color: "#fff", padding: 12, borderRadius: 10, fontWeight: 800, marginTop: 10, fontSize: 15 }}>
                💰 COD — collect {fmtMoney(nextUnclaimed.orderValueCents)}
              </div>
            )}

            <button onClick={claimOrder}
              style={{ width: "100%", background: GREEN, color: DARK, border: "none", padding: "20px 0", borderRadius: 12, fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 16, minHeight: 56 }}>
              🖐 Claim this order
            </button>
          </div>
        )}

        {/* Active claimed/current order */}
        {current && (
          <div style={{ background: "#263821", border: `2px solid ${GREEN}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, textTransform: "uppercase", letterSpacing: 1 }}>
                {isBluff ? "Your claimed order" : "Next up"}
              </div>
              {isBluff && <div style={{ fontSize: 10, fontWeight: 800, color: CREAM, background: GREEN, padding: "3px 10px", borderRadius: 999 }}>CLAIMED</div>}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: CREAM, fontFamily: "'DM Serif Display',Georgia,serif", marginBottom: 6, lineHeight: 1.15 }}>
              {current.customerSnapshot?.company_name || "—"}
            </div>
            {(current.customerSnapshot?.address1 || current.customerSnapshot?.city) && (
              <div style={{ fontSize: 13, color: "#9cb894", marginBottom: 8 }}>
                {current.customerSnapshot.address1 && <div>{current.customerSnapshot.address1}</div>}
                <div>{[current.customerSnapshot.city, current.customerSnapshot.state].filter(Boolean).join(", ")} {current.customerSnapshot.zip || ""}</div>
              </div>
            )}
            <div style={{ fontSize: 15, color: "#9cb894", marginBottom: 6 }}>
              {current.deliveryTime || "—"} · {current.cartCount || 0} carts · {fmtMoney(current.orderValueCents)}
            </div>
            {pullIcons(current)}
            {(current.customerSnapshot?.terms || "").toUpperCase().includes("COD") && (
              <div style={{ background: RED, color: "#fff", padding: 12, borderRadius: 10, fontWeight: 800, marginTop: 10, fontSize: 15 }}>
                💰 COD — collect {fmtMoney(current.orderValueCents)}
              </div>
            )}
            {current.customerSnapshot?.shipping_notes && (
              <div style={{ background: "#1e2d1a", color: CREAM, padding: 12, borderRadius: 10, marginTop: 10, fontSize: 14 }}>
                📝 {current.customerSnapshot.shipping_notes}
              </div>
            )}
            {current.notes && (
              <div style={{ fontSize: 14, color: CREAM, marginTop: 10, whiteSpace: "pre-wrap" }}>{current.notes}</div>
            )}

            <button onClick={() => setShowPhotoModal(true)}
              style={{ width: "100%", background: GREEN, color: DARK, border: "none", padding: "20px 0", borderRadius: 12, fontSize: 18, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 16, minHeight: 56 }}>
              ✓ Mark done
            </button>
            <button onClick={async () => {
                if (!window.confirm("Mark order complete with lost/incomplete pick sheet? This will be flagged for review.")) return;
                const patch = {};
                const now = new Date().toISOString();
                if (isBluff) {
                  if (current.needsBluff1) { patch.bluff1PulledAt = now; patch.bluff1PulledBy = displayName; }
                  if (current.needsBluff2) { patch.bluff2PulledAt = now; patch.bluff2PulledBy = displayName; }
                  patch.bluffClaimedBy = null;
                  patch.bluffClaimedAt = null;
                } else {
                  patch[`${effectiveTeam}PulledAt`] = new Date().toISOString();
                  patch[`${effectiveTeam}PulledBy`] = displayName;
                }
                const alerts = Array.isArray(current.alerts) ? [...current.alerts] : [];
                alerts.push({
                  text: `Pick sheet lost/incomplete — completed without photos by ${displayName}`,
                  author: displayName,
                  created_at: new Date().toISOString(),
                  severity: "warning",
                  team,
                });
                patch.alerts = alerts;
                await update(current.id, patch);
              }}
              style={{ width: "100%", background: "transparent", color: AMBER, border: `1.5px solid ${AMBER}`, padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 8, minHeight: 48 }}>
              ⚠ Complete — lost/incomplete pick sheet
            </button>
            <button onClick={() => setShowProblem(true)}
              style={{ width: "100%", background: "transparent", color: "#ffb3a8", border: `1.5px solid ${RED}`, padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginTop: 8, minHeight: 48 }}>
              ⚠ Report problem
            </button>
          </div>
        )}

        {/* All caught up */}
        {!current && !needsClaim && (
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
            <div style={{ width: `${pct}%`, height: "100%", background: GREEN, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 13, color: CREAM }}>{pulledCount} of {todaysForTeam.length} pulled</div>
          <div style={{ fontSize: 13, color: "#9cb894" }}>{fmtMoney(pulledDollars)} of {fmtMoney(totalDollars)} pulled · {fmtMoney(remainingDollars)} remaining</div>
        </div>
      </div>

      {/* canAddOrders buttons (Rachel) */}
      {canAddOrders && (
        <div style={{ padding: "0 16px", display: "flex", gap: 8, marginTop: 0 }}>
          <button onClick={() => setShowAddOrder(true)}
            style={{ flex: 1, background: GREEN, color: DARK, border: "none", padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 48 }}>
            + Add Order
          </button>
          <button onClick={() => setShowAllOrders(true)}
            style={{ flex: 1, background: "#263821", color: CREAM, border: `1px solid ${GREEN}44`, padding: "14px 0", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 48 }}>
            📋 All Orders
          </button>
        </div>
      )}

      {/* Photo modal */}
      {showPhotoModal && <PhotoModal onSubmit={submitPhotos} onCancel={() => setShowPhotoModal(false)} />}

      {/* Problem modal */}
      {showProblem && <ProblemModal onSubmit={submitProblem} onCancel={() => setShowProblem(false)} />}

      {/* Add order bottom sheet */}
      {showAddOrder && (
        <div onClick={() => setShowAddOrder(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", ...FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxHeight: "85vh", background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>Add Order</div>
              <button onClick={() => setShowAddOrder(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>✕</button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Customer</div>
              {aoCustomer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#e8f5e0", borderRadius: 10, border: `1.5px solid ${GREEN}` }}>
                  <span style={{ flex: 1, fontWeight: 800, color: DARK }}>{aoCustomer.companyName}</span>
                  <button onClick={() => { setAoCustomer(null); setAoSearch(""); }} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: MUTED }}>✕</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input type="text" value={aoSearch} onChange={e => setAoSearch(e.target.value)} placeholder="Search customers..."
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
                  {aoMatches.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: `1.5px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 200, overflowY: "auto", marginTop: 4 }}>
                      {aoMatches.map(c => (
                        <button key={c.id} onClick={() => { setAoCustomer(c); setAoSearch(""); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", background: "none", border: "none", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", color: DARK }}>
                          {c.companyName}{c.city && <span style={{ color: MUTED }}> — {c.city}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Amount</div>
                <input type="number" value={aoAmount} onChange={e => setAoAmount(e.target.value)} placeholder="0.00"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Date</div>
                <input type="date" value={aoDate} onChange={e => setAoDate(e.target.value)}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
              <textarea value={aoNotes} onChange={e => setAoNotes(e.target.value)} placeholder="Notes..." rows={2}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <button onClick={saveAddOrder} disabled={!aoCustomer || aoSaving}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: aoCustomer ? GREEN : "#c8d8c0", color: aoCustomer ? "#fff" : MUTED, fontSize: 16, fontWeight: 800, cursor: aoCustomer ? "pointer" : "default", fontFamily: "inherit", minHeight: 52 }}>
              {aoSaving ? "Saving..." : "Submit for approval"}
            </button>
          </div>
        </div>
      )}

      {/* All orders sheet */}
      {showAllOrders && (
        <div onClick={() => setShowAllOrders(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", ...FONT }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxHeight: "90vh", background: "#fff", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'DM Serif Display',Georgia,serif", color: DARK }}>All {TEAM_LABELS[team] || team} Orders</div>
              <button onClick={() => setShowAllOrders(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: MUTED }}>✕</button>
            </div>
            {allTeamOrders.length === 0 && <div style={{ padding: 20, textAlign: "center", color: MUTED }}>No orders found.</div>}
            {allTeamOrders.map(d => {
              const c = d.customerSnapshot || {};
              const pulled = isPulled(d);
              return (
                <div key={d.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, opacity: pulled ? 0.5 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: DARK }}>{c.company_name || "—"}</div>
                      <div style={{ fontSize: 11, color: MUTED }}>
                        {d.deliveryDate} · {d.deliveryTime || "—"} · {fmtMoney(d.orderValueCents)}
                      </div>
                    </div>
                    <span style={{
                      padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                      background: pulled ? "#e8f5e0" : d.lifecycle === "proposed" ? "#fff7ec" : "#f2f5ef",
                      color: pulled ? GREEN : d.lifecycle === "proposed" ? AMBER : MUTED,
                    }}>
                      {pulled ? "Done" : d.lifecycle === "proposed" ? "Pending" : d.shippedAt ? "Shipped" : "Active"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PhotoModal({ onSubmit, onCancel }) {
  const [files, setFiles] = useState([]);
  function addFile(e) {
    if (e.target.files?.length) setFiles(prev => [...prev, ...Array.from(e.target.files)]);
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", ...FONT }}>
      <div style={{ width: "100%", background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 12, fontFamily: "'DM Serif Display',Georgia,serif" }}>Upload pick sheet pages</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: "relative", width: 70, height: 70, borderRadius: 8, overflow: "hidden", border: `1px solid #e0ead8` }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: "absolute", top: 2, right: 2, background: RED, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 12, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          ))}
          <label style={{ width: 70, height: 70, borderRadius: 8, border: `2px dashed #c8d8c0`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 28, color: MUTED }}>
            +
            <input type="file" accept="image/*" capture="environment" onChange={addFile} style={{ display: "none" }} />
          </label>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>At least 1 page required</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid #e0ead8`, background: "#fff", color: MUTED, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 52 }}>
            Cancel
          </button>
          <button onClick={() => onSubmit(files)} disabled={files.length === 0}
            style={{ flex: 2, padding: "14px 0", borderRadius: 12, border: "none", background: files.length > 0 ? GREEN : "#c8d8c0", color: files.length > 0 ? "#fff" : MUTED, fontSize: 15, fontWeight: 800, cursor: files.length > 0 ? "pointer" : "default", fontFamily: "inherit", minHeight: 52 }}>
            Submit & mark done
          </button>
        </div>
      </div>
    </div>
  );
}

function ProblemModal({ onSubmit, onCancel }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "flex-end", ...FONT }}>
      <div style={{ width: "100%", background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: DARK, marginBottom: 12, fontFamily: "'DM Serif Display',Georgia,serif" }}>Report a problem</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's the issue?"
          style={{ width: "100%", padding: 14, borderRadius: 10, border: `1.5px solid #e0ead8`, fontSize: 15, fontFamily: "inherit", minHeight: 80, boxSizing: "border-box", marginBottom: 12 }} />
        <label style={{ display: "block", marginBottom: 16, color: MUTED, fontSize: 13, cursor: "pointer" }}>
          📷 Attach photo (optional)
          <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: "block", marginTop: 6 }} />
        </label>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel}
            style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: `1.5px solid #e0ead8`, background: "#fff", color: MUTED, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 52 }}>
            Cancel
          </button>
          <button onClick={() => onSubmit(text, file)} disabled={!text.trim()}
            style={{ flex: 2, padding: "14px 0", borderRadius: 12, border: "none", background: text.trim() ? RED : "#c8d8c0", color: "#fff", fontSize: 15, fontWeight: 800, cursor: text.trim() ? "pointer" : "default", fontFamily: "inherit", minHeight: 52 }}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
