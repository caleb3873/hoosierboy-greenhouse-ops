// 📊 Inventory Valuation — the bankability report (banker's ask, 8/6/2026:
// "track inventory weekly; value material on hand"). One page that answers
// "what is everything in the greenhouse worth, right now and every Monday?"
//
// Live numbers come from /api/inventory-snapshot (same math the Monday cron
// runs, so the page and the history never disagree). Houseplants are the one
// manually-counted section — counts are entered here.
import { useEffect, useMemo, useState } from "react";
import { getSupabase, useTable } from "./supabase";
import { useAuth } from "./Auth";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74",
  border: "#dfe7d8", red: "#d94f3d", amber: "#e89a3a", text: "#2f3b2a", chip: "#eef3e8" };
const FONT = "'DM Sans', sans-serif";
const money0 = n => n == null ? "—" : "$" + Math.round(+n).toLocaleString();

export default function InventoryValuation() {
  const sb = getSupabase();
  const { displayName } = useAuth();
  const { rows: snaps, refresh: refreshSnaps } = useTable("inventory_snapshots", { orderBy: "taken_at", ascending: false });
  const { rows: counts, insert: insertCount, remove: removeCount } = useTable("inventory_counts", { orderBy: "counted_on", ascending: false });
  const [live, setLive] = useState(undefined);   // undefined=loading, null=api unreachable
  const [saving, setSaving] = useState(false);
  const [pctDraft, setPctDraft] = useState("");
  const [form, setForm] = useState({ counted_on: new Date().toISOString().slice(0, 10), label: "", units: "", est_value: "", cost_value: "" });

  const loadLive = async () => {
    try {
      const r = await fetch("/api/inventory-snapshot");
      if (!r.ok) throw new Error();
      setLive(await r.json());
    } catch { setLive(null); }
  };
  useEffect(() => { loadLive(); }, []);   // eslint-disable-line

  async function snapshotNow() {
    setSaving(true);
    try {
      const r = await fetch("/api/inventory-snapshot?save=1");
      const j = await r.json();
      if (j.error) window.alert("Snapshot failed: " + j.error);
      else { setLive(j); refreshSnaps(); }
    } catch (e) { window.alert("Snapshot failed: " + (e.message || e)); }
    setSaving(false);
  }

  async function savePct() {
    const v = Math.max(1, Math.min(100, Math.round(+pctDraft || 0)));
    if (!v) return;
    await sb.from("cost_settings").upsert({ key: "inventory_valuation_pct", value: String(v) }, { onConflict: "key" });
    setPctDraft("");
    loadLive();
  }

  async function addCount() {
    if (!form.counted_on || !(+form.units > 0 || +form.est_value > 0)) { window.alert("Give the count a date and at least units or value."); return; }
    await insertCount({ area: "houseplants", countedOn: form.counted_on, label: form.label || null,
      units: +form.units || null, estValue: +form.est_value || null, costValue: +form.cost_value || null,
      createdBy: displayName || null });
    setForm(f => ({ ...f, label: "", units: "", est_value: "", cost_value: "" }));
    loadLive();
  }

  const latestCountDate = useMemo(() => (counts || []).map(c => c.countedOn).sort().pop() || null, [counts]);
  const pct = live?.totals?.pct ?? 66;

  const th = { textAlign: "left", padding: "8px 11px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" };
  const td = { padding: "8px 11px", fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, fontVariantNumeric: "tabular-nums" };
  const num = { ...td, textAlign: "right" };
  const card = { background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 };

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1000 }}>
      <style>{`@media print { .no-print { display:none !important; } body { background:#fff; } }`}</style>

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 560 }}>
          What everything on the benches is worth — computed from the plans, the Fall Program, physical houseplant counts, and pots on hand.
          A snapshot lands automatically <b>every Monday</b>; the history below is the record the bank asked for.
        </div>
        <span style={{ flex: 1 }} />
        <button className="no-print" onClick={() => window.print()}
          style={{ padding: "8px 14px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: "#fff", color: C.dark, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>🖨 Print for the bank</button>
        <button onClick={snapshotNow} disabled={saving}
          style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: C.dark, color: C.cream, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>
          {saving ? "Saving…" : "📸 Snapshot now"}
        </button>
      </div>

      {/* hero totals */}
      {live === undefined && <div style={{ padding: 24, color: C.muted }}>Computing current inventory…</div>}
      {live === null && (
        <div style={{ ...card, padding: 16, color: C.amber, fontSize: 13 }}>
          ⚠ The valuation API isn't reachable from this environment (it runs on ops.hoosierboy.com). History and counts below still work.
        </div>
      )}
      {live?.totals && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 14 }}>
          {[[live.totals.units.toLocaleString(), "units on hand"],
            [money0(live.totals.cost), "cost basis"],
            [money0(live.totals.revenue), "projected revenue"],
            [money0(live.totals.valAtPct), `valuation @ ${pct}% of revenue`],
            [money0(live.totals.costPlusPct), `cost + ${pct}% (banker formula)`]]
            .map(([v, k], i) => (
              <div key={i} style={{ background: i >= 3 ? "#eef6e8" : C.chip, border: `1.5px solid ${i >= 3 ? C.light : C.border}`, borderRadius: 11, padding: "11px 14px" }}>
                <div style={{ fontFamily: "ui-monospace,Menlo,monospace", fontSize: 19, fontWeight: 700, color: C.dark }}>{v}</div>
                <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted, marginTop: 2 }}>{k}</div>
              </div>
            ))}
        </div>
      )}

      {/* section breakdown */}
      {live?.sections && (
        <div style={card}>
          <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted }}>
            What's in the number <span style={{ fontWeight: 500, textTransform: "none" }}>· {new Date(live.taken_at).toLocaleString()}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Section</th><th style={{ ...th, textAlign: "right" }}>Units</th><th style={{ ...th, textAlign: "right" }}>Cost basis</th><th style={{ ...th, textAlign: "right" }}>Projected revenue</th><th style={{ ...th, textAlign: "right" }}>@ {pct}%</th></tr></thead>
              <tbody>
                {live.sections.map(s => (
                  <tr key={s.key}>
                    <td style={td}>
                      <b>{s.label}</b>
                      <div style={{ fontSize: 10.5, color: C.muted }}>{s.notes}</div>
                      {s.gaps && <div style={{ fontSize: 10.5, color: C.amber, fontWeight: 700 }}>⚠ {s.gaps}</div>}
                    </td>
                    <td style={num}>{(s.units || 0).toLocaleString()}</td>
                    <td style={num}>{money0(s.cost)}</td>
                    <td style={num}>{s.revenue != null ? money0(s.revenue) : "—"}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{s.valAtPct != null ? money0(s.valAtPct) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="no-print" style={{ padding: "8px 14px", fontSize: 11.5, color: C.muted, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            Valuation knob:
            <input value={pctDraft} onChange={e => setPctDraft(e.target.value)} placeholder={String(pct)} inputMode="numeric"
              style={{ width: 46, padding: "3px 6px", borderRadius: 6, border: `1.5px solid ${C.border}`, textAlign: "center", fontFamily: "ui-monospace,Menlo,monospace", fontWeight: 700 }} />
            <button onClick={savePct} style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${C.light}`, background: "#fff", color: C.dark, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>set %</button>
            <span>— your CPA picks the column that feeds the balance sheet (cost, {pct}%, or lower of the two).</span>
          </div>
        </div>
      )}

      {/* houseplant counts */}
      <div style={card}>
        <div style={{ padding: "10px 14px 4px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted }}>
          🌿 Houseplant counts <span style={{ fontWeight: 500, textTransform: "none" }}>— the manual section; count by area, all rows on one date form one count set{latestCountDate ? ` (latest: ${latestCountDate})` : ""}</span>
        </div>
        <div className="no-print" style={{ display: "flex", gap: 7, flexWrap: "wrap", padding: "6px 14px 12px", alignItems: "center" }}>
          <input type="date" value={form.counted_on} onChange={e => setForm(f => ({ ...f, counted_on: e.target.value }))}
            style={{ padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12.5 }} />
          <input placeholder="area / bench (e.g. HP house 3)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            style={{ padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: FONT, fontSize: 12.5, minWidth: 170 }} />
          <input placeholder="units" inputMode="numeric" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
            style={{ width: 76, padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, textAlign: "right" }} />
          <input placeholder="est. retail $" inputMode="numeric" value={form.est_value} onChange={e => setForm(f => ({ ...f, est_value: e.target.value }))}
            style={{ width: 100, padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, textAlign: "right" }} />
          <input placeholder="cost $ (opt)" inputMode="numeric" value={form.cost_value} onChange={e => setForm(f => ({ ...f, cost_value: e.target.value }))}
            style={{ width: 96, padding: "7px 9px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12.5, textAlign: "right" }} />
          <button onClick={addCount}
            style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: C.dark, color: C.cream, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: FONT }}>＋ Add</button>
        </div>
        {(counts || []).length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Area</th><th style={{ ...th, textAlign: "right" }}>Units</th><th style={{ ...th, textAlign: "right" }}>Est. retail</th><th style={{ ...th, textAlign: "right" }}>Cost</th><th style={th}></th></tr></thead>
              <tbody>
                {(counts || []).slice(0, 30).map(c => (
                  <tr key={c.id} style={{ background: c.countedOn === latestCountDate ? "#f5faf0" : undefined }}>
                    <td style={{ ...td, fontFamily: "ui-monospace,Menlo,monospace" }}>{c.countedOn}</td>
                    <td style={td}>{c.label || "—"}</td>
                    <td style={num}>{c.units != null ? (+c.units).toLocaleString() : "—"}</td>
                    <td style={num}>{money0(c.estValue)}</td>
                    <td style={num}>{money0(c.costValue)}</td>
                    <td style={{ ...td, textAlign: "right" }} className="no-print">
                      <button onClick={() => { if (window.confirm("Remove this count row?")) { removeCount(c.id); loadLive(); } }}
                        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* snapshot history — THE weekly record */}
      <div style={card}>
        <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: C.muted }}>
          📚 Weekly history <span style={{ fontWeight: 500, textTransform: "none" }}>— one row lands every Monday automatically; this is what the bank asked for</span>
        </div>
        {!(snaps || []).length && <div style={{ padding: "4px 14px 14px", color: C.muted, fontSize: 12.5 }}>No snapshots yet — the first Monday (or 📸 Snapshot now) starts the record.</div>}
        {(snaps || []).length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={th}>Taken</th><th style={{ ...th, textAlign: "right" }}>Units</th><th style={{ ...th, textAlign: "right" }}>Cost basis</th><th style={{ ...th, textAlign: "right" }}>Projected revenue</th><th style={{ ...th, textAlign: "right" }}>@ %</th><th style={{ ...th, textAlign: "right" }}>Cost + %</th><th style={th}>Source</th></tr></thead>
              <tbody>
                {(snaps || []).slice(0, 60).map(s => (
                  <tr key={s.id}>
                    <td style={{ ...td, fontFamily: "ui-monospace,Menlo,monospace" }}>{new Date(s.takenAt).toLocaleDateString()} {new Date(s.takenAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td style={num}>{(s.totals?.units || 0).toLocaleString()}</td>
                    <td style={num}>{money0(s.totals?.cost)}</td>
                    <td style={num}>{money0(s.totals?.revenue)}</td>
                    <td style={num}>{money0(s.totals?.valAtPct)}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{money0(s.totals?.costPlusPct)}</td>
                    <td style={{ ...td, color: C.muted, fontSize: 11 }}>{s.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, padding: "0 2px 24px" }}>
        Method: active production plans use their cost engine's per-row direct costs and sale prices; the Fall Program uses tracked liner + container
        costs plus a soil/inputs allowance and Pricing-tab category prices (unpriced categories are flagged, not guessed); houseplants are physical
        counts; hard goods are at cost. Valuation % is a knob — the report always shows cost, revenue, and the % column so the accountant chooses.
      </div>
    </div>
  );
}
