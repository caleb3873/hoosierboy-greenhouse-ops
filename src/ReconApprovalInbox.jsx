// ReconApprovalInbox — in-app approval surface for Loop B supplier reconciliations.
// Shows pending acknowledgement proposals (extracted by Claude, computed dry-run),
// lets you EDIT per-variety ordered quantities (or cancel a variety) and then Apply,
// or Decline. Reads/writes via service-role endpoints (api/recon-list, api/recon-apply)
// so floor-code (anon) clients never touch the locked table. Used on ManagerTasksView
// (mobile) and the Planner Receiving page (desktop) — one component, both places.
import { useState, useEffect, useCallback } from "react";

const C = { dark: "#1e2d1a", green: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", bg: "#f2f5ef", line: "#e0e8d8" };
const FONT = { fontFamily: "'DM Sans','Segoe UI',sans-serif" };
const isEditable = a => { const s = String(a || ""); return s === "updated" || s.startsWith("match") || s === "unchanged"; };

export default function ReconApprovalInbox({ compact = false, hideWhenEmpty = false }) {
  const [state, setState] = useState({ loading: true, error: null, proposals: [] });
  const [edits, setEdits] = useState({});   // { [proposalId]: { totals:{variety:val}, cancels:Set } }
  const [busy, setBusy] = useState({});      // { [proposalId]: "apply" | "decline" }
  const [done, setDone] = useState({});      // { [proposalId]: "applied" | "declined" + message }

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const r = await fetch("/api/recon-list");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't load proposals");
      setState({ loading: false, error: null, proposals: j.proposals || [] });
    } catch (e) { setState({ loading: false, error: e.message || String(e), proposals: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const editOf = id => edits[id] || { totals: {}, cancels: new Set() };
  const setTotal = (id, variety, val) => setEdits(p => { const e = editOf(id); return { ...p, [id]: { totals: { ...e.totals, [variety]: val }, cancels: e.cancels } }; });
  const toggleCancel = (id, variety) => setEdits(p => { const e = editOf(id); const c = new Set(e.cancels); c.has(variety) ? c.delete(variety) : c.add(variety); return { ...p, [id]: { totals: e.totals, cancels: c } }; });

  async function apply(prop) {
    const e = editOf(prop.id);
    const varietyTotals = {}; for (const [v, val] of Object.entries(e.totals)) if (val !== "" && val != null) varietyTotals[v] = val;
    const cancelVarieties = [...e.cancels];
    if (!window.confirm(`Apply order ${prop.order_number} to the Fall Program?`)) return;
    setBusy(b => ({ ...b, [prop.id]: "apply" }));
    try {
      const r = await fetch("/api/recon-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: prop.id, edits: { varietyTotals, cancelVarieties } }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Apply failed");
      setDone(d => ({ ...d, [prop.id]: `✅ Applied — ${j.patched} updated · ${j.cancelled} cancelled${j.inserted ? ` · ${j.inserted} new` : ""}. ${j.verify || ""}` }));
    } catch (e2) { window.alert("Couldn't apply: " + (e2.message || e2)); }
    finally { setBusy(b => ({ ...b, [prop.id]: null })); }
  }
  async function decline(prop) {
    if (!window.confirm(`Decline (ignore) the acknowledgement for order ${prop.order_number}?`)) return;
    setBusy(b => ({ ...b, [prop.id]: "decline" }));
    try {
      const r = await fetch("/api/recon-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: prop.id, action: "decline" }) });
      if (!r.ok) throw new Error((await r.json()).error || "Decline failed");
      setDone(d => ({ ...d, [prop.id]: "Declined." }));
    } catch (e2) { window.alert("Couldn't decline: " + (e2.message || e2)); }
    finally { setBusy(b => ({ ...b, [prop.id]: null })); }
  }

  const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: compact ? "12px 14px" : "16px 18px", marginBottom: 12 };
  const visible = state.proposals.filter(p => !done[p.id]);

  // When embedded as an alert (e.g. on the mobile hub), stay invisible unless there's something to show.
  if (hideWhenEmpty && !state.error && (state.loading || (!visible.length && !Object.keys(done).length))) return null;

  if (state.loading) return <div style={{ ...FONT, color: C.muted, padding: 14 }}>Loading acknowledgements…</div>;
  if (state.error) return <div style={{ ...FONT, color: C.red, padding: 14 }}>⚠ {state.error} <button onClick={load} style={{ marginLeft: 8, cursor: "pointer" }}>Retry</button></div>;

  return (
    <div style={{ ...FONT }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: compact ? 16 : 19, fontWeight: 800, color: C.dark, fontFamily: "'DM Serif Display',Georgia,serif" }}>📥 Acknowledgements to approve</div>
        <button onClick={load} style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: C.muted }}>↻ Refresh</button>
      </div>

      {Object.entries(done).map(([id, msg]) => <div key={id} style={{ ...card, borderColor: C.green, background: "#f8fbf5", color: C.dark }}>{msg}</div>)}

      {!visible.length && !Object.keys(done).length && (
        <div style={{ ...card, color: C.muted, textAlign: "center" }}>No supplier acknowledgements waiting. New PDFs appear here after the daily scan.</div>
      )}

      {visible.map(p => {
        const e = editOf(p.id);
        const c = (p.risk && p.risk.counts) || {};
        const flags = (p.risk && p.risk.flags) || [];
        const working = busy[p.id];
        return (
          <div key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontWeight: 800, color: C.dark, fontSize: 16 }}>Order {p.order_number}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{p.storage_path}</div>
            </div>
            <div style={{ fontSize: 13, color: C.muted, margin: "2px 0 6px" }}>{c.updated || 0} updated · {c.cancelled || 0} cancelled · {c.inserted || 0} new</div>
            {flags.map((f, i) => <div key={i} style={{ color: C.red, fontSize: 13, marginBottom: 4 }}>⚠ {f}</div>)}

            <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden", margin: "8px 0" }}>
              {(p.changes || []).map((ch, i) => {
                const cancelled = e.cancels.has(ch.variety);
                const editable = isEditable(ch.action);
                const val = e.totals[ch.variety] != null ? e.totals[ch.variety] : ch.pdfTotal;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderTop: i ? `1px solid ${C.line}` : "none", background: cancelled ? "#fff5f3" : "#fff", opacity: cancelled ? 0.65 : 1 }}>
                    <div style={{ flex: 1, fontSize: 14, color: C.dark, textDecoration: cancelled ? "line-through" : "none" }}>
                      {ch.variety} <span style={{ color: C.muted, fontSize: 12 }}>· {ch.action}</span>
                    </div>
                    {editable && !cancelled ? (
                      <>
                        <span style={{ color: C.muted, fontSize: 12 }}>{ch.dbBefore} →</span>
                        <input type="number" value={val} min="0" onChange={ev => setTotal(p.id, ch.variety, ev.target.value)}
                          style={{ width: 76, padding: "4px 6px", border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 14, textAlign: "right" }} />
                      </>
                    ) : <span style={{ fontSize: 13, color: C.muted }}>{ch.dbBefore} → {ch.pdfTotal}</span>}
                    {editable && (
                      <button onClick={() => toggleCancel(p.id, ch.variety)} title="Cancel this variety"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, color: cancelled ? C.green : C.red }}>{cancelled ? "↺" : "✕"}</button>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button onClick={() => apply(p)} disabled={!!working}
                style={{ flex: 1, background: C.dark, color: C.cream, border: "none", borderRadius: 8, padding: "11px", fontSize: 15, fontWeight: 800, cursor: working ? "default" : "pointer", opacity: working ? 0.6 : 1 }}>
                {working === "apply" ? "Applying…" : "✓ Approve & apply"}</button>
              <button onClick={() => decline(p)} disabled={!!working}
                style={{ background: "#fff", color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, padding: "11px 16px", fontSize: 15, fontWeight: 700, cursor: working ? "default" : "pointer", opacity: working ? 0.6 : 1 }}>
                {working === "decline" ? "…" : "Decline"}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
