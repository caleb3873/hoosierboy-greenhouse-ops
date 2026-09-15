// 📥 Broker Check — drop a broker's own order report on the page and see where our
// ledger disagrees with it, BY ORDER NUMBER. This is the loop that would have caught
// the 26 confirmed orders (Ball 9/8 batch + EHR) that never made it into
// purchase_orders on 9/15/2026. Detect-and-display only: nothing here writes to the
// ledger. Missing orders get entered through the normal parse-and-match path;
// "dropped" ones are flagged as probably superseded, never auto-changed.
//
// Reads three shapes, sniffed from the header row:
//  • Ball  View/Change Orders → Download Results  (OrdersListDownload.xlsx, ORDER level)
//  • Ball  order_download_*.csv                  (LINE level, has royalty + freight)
//  • EHR   "Product Recap by Customers and Plants" OpenOrders .xlsb (LINE level, 2-row header)
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { getSupabase } from "./supabase";
import useIsMobile from "./useIsMobile";

const C = { dark: "#1e2d1a", light: "#7fb069", cream: "#c8e6b8", muted: "#7a8c74", red: "#d94f3d", amber: "#e89a3a", border: "#dfe7d8", chip: "#eef3e8", card: "#fff", text: "#1e2d1a" };
const FONT = "'DM Sans', sans-serif";
const n = v => (v == null || v === "" ? "—" : Number(v).toLocaleString("en-US"));
const money = v => (v == null || v === "" ? "—" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const LIVE = s => !["cancelled", "superseded", "draft"].includes(String(s || "").toLowerCase());

async function pageAll(sb, table, cols, mod) {
  let out = [], from = 0;
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

// Excel serial → YYYY-MM-DD, and ISO week/year for a date string.
const serialToDate = s => (s == null || s === "" || isNaN(+s) ? null : new Date((+s - 25569) * 86400000).toISOString().slice(0, 10));
function isoWeek(dateStr) {
  if (!dateStr) return [null, null];
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d)) return [null, null];
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return [t.getUTCFullYear(), 1 + Math.round(((t - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)];
}

// ── parsers: each returns { broker, kind, orders: { [orderNo]: { orderNo, po, supplier, week, year, qty, confirmed, amount, lines: [] } } }
function parseBallOrderList(rows) {
  const orders = {};
  rows.forEach(r => {
    const no = String(r["Order Number"] || "").replace(/^0+/, ""); if (!no) return;
    const wk = +r["Ship Week"] || null; const date = String(r["Requested Ship Date"] || "");
    const [yr] = isoWeek(date);
    orders[no] = { orderNo: no, po: r["Purchase Order Number"] || "", supplier: r["Supplier"] || "", week: wk, year: yr || (date.slice(0, 4) ? +date.slice(0, 4) : null), qty: +r["Quantity"] || 0, confirmed: null, amount: +r["Amount"] || 0, status: r["Status"] || "", lines: [] };
  });
  return { broker: "Ball", kind: "Ball order list (order level)", orders };
}
function parseBallCsv(rows) {
  const orders = {};
  rows.forEach(r => {
    const no = String(r["Order Number"] || "").replace(/^0+/, ""); if (!no) return;
    const sw = String(r["Ship Week"] || ""); const sd = String(r["Ship Date"] || "");
    const o = orders[no] || (orders[no] = { orderNo: no, po: r["PO Number"] || "", supplier: r["Supplier"] || "", week: sw.length === 6 ? +sw.slice(4) : null, year: sw.length === 6 ? +sw.slice(0, 4) : (sd.length === 8 ? +sd.slice(0, 4) : null), qty: 0, confirmed: null, amount: 0, status: "", lines: [] });
    const q = +String(r["Quantity"] || "0").trim() || 0;
    o.qty += q; o.amount += +String(r["Total Extended Value"] || "0").trim() || 0;
    o.lines.push({ name: r["Variety"] || "", qty: q, confirmed: null, material: String(r["Ball Material Number"] || "").replace(/^0+/, "") });
  });
  return { broker: "Ball", kind: "Ball order download (line level)", orders };
}
function parseEhrRecap(aoa) {
  // two-row header: row 2 = group words, row 3 = field words; data from row 4. Index by position.
  const orders = {};
  aoa.slice(4).forEach(r => {
    const no = String(r[14] || "").trim(); const item = String(r[5] || "").trim();
    if (!no || !item || /^FREIGHT$/i.test(item)) return;
    const vendor = String(r[16] || ""); if (/HARNOIS/i.test(vendor)) return;   // hardware, not plants
    const date = serialToDate(r[11]); const [yr, wk] = isoWeek(date);
    const o = orders[no] || (orders[no] = { orderNo: no, po: String(r[15] || ""), supplier: vendor, week: wk ?? (+r[12] || null), year: yr, qty: 0, confirmed: 0, amount: 0, status: "", lines: [] });
    const q = +r[0] || 0, c = +r[1] || 0;
    o.qty += q; o.confirmed += c; o.amount += q * (+r[3] || 0);
    o.lines.push({ name: item, qty: q, confirmed: c, form: String(r[7] || "") });
  });
  return { broker: "EHR", kind: "EHR open-orders recap (line level)", orders };
}
function sniffAndParse(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const first = (aoa[0] || []).map(String);
  if (first.includes("Order Number") && first.includes("Requested Ship Date")) return parseBallOrderList(XLSX.utils.sheet_to_json(ws, { defval: "" }));
  if (first.includes("Order Number") && first.includes("Ball Material Number")) return parseBallCsv(XLSX.utils.sheet_to_json(ws, { defval: "" }));
  if (String(aoa[0]?.[0] || "").startsWith("Product Recap") || (aoa[3] || []).map(String).includes("Order#")) return parseEhrRecap(aoa);
  throw new Error("Not a Ball order list, a Ball order download, or an EHR open-orders recap — headers didn't match any of the three.");
}

export default function BrokerCheck({ plan }) {
  const sb = getSupabase();
  const mobile = useIsMobile();
  const fileRef = useRef(null);
  const [ledger, setLedger] = useState(null);      // { [orderNo]: {...po, lines:[...]} }
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);      // parsed broker file
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});

  useEffect(() => {
    if (!sb || !plan?.id) return;
    let dead = false; setLedger(null); setError(null);
    (async () => {
      try {
        const pos = await pageAll(sb, "purchase_orders", "id,order_number,broker,supplier,status,ship_week,ship_year,total_qty,total_cost", q => q.eq("plan_id", plan.id));
        const ids = pos.map(p => p.id); let lines = [];
        for (let i = 0; i < ids.length; i += 200) lines = lines.concat(await pageAll(sb, "purchase_order_lines", "purchase_order_id,variety_name,qty_ordered,qty_confirmed,variety_id", q => q.in("purchase_order_id", ids.slice(i, i + 200))));
        if (dead) return;
        const byId = {}; pos.forEach(p => { byId[p.id] = { ...p, lines: [] }; });
        lines.forEach(l => byId[l.purchase_order_id] && byId[l.purchase_order_id].lines.push(l));
        const byNo = {}; Object.values(byId).forEach(p => { byNo[String(p.order_number)] = p; });
        setLedger(byNo);
      } catch (e) { if (!dead) setError(e.message || String(e)); }
    })();
    return () => { dead = true; };
  }, [sb, plan?.id]);

  async function handleFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setError(null); setReport(null); setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      setReport(sniffAndParse(wb));
    } catch (err) { setError(err.message || String(err)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  // ── the diff ──
  const diff = useMemo(() => {
    if (!report || !ledger) return null;
    const missing = [], changed = [], matched = [], dropped = [];
    Object.values(report.orders).forEach(o => {
      const l = ledger[o.orderNo];
      if (!l) { missing.push(o); return; }
      const lq = +l.total_qty || 0;
      const lineDiff = [];
      if (o.lines.length && l.lines.length) {
        const key = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const ours = {}; l.lines.forEach(x => { const k = key(x.variety_name); ours[k] = (ours[k] || 0) + (+x.qty_ordered || 0); });
        const theirs = {}; o.lines.forEach(x => { const k = key(x.name); theirs[k] = (theirs[k] || 0) + (+x.qty || 0); });
        const names = {}; o.lines.forEach(x => { names[key(x.name)] = x.name; }); l.lines.forEach(x => { names[key(x.variety_name)] = names[key(x.variety_name)] || x.variety_name; });
        new Set([...Object.keys(ours), ...Object.keys(theirs)]).forEach(k => { if ((ours[k] || 0) !== (theirs[k] || 0)) lineDiff.push({ name: names[k], ours: ours[k] || 0, theirs: theirs[k] || 0 }); });
      }
      if (lq !== o.qty || lineDiff.length || !LIVE(l.status)) changed.push({ ...o, ledger: l, lineDiff });
      else matched.push({ ...o, ledger: l });
    });
    // Ledger orders for this broker that the broker's own report no longer lists.
    Object.values(ledger).forEach(l => {
      if (String(l.broker) !== report.broker || !LIVE(l.status)) return;
      if (!report.orders[String(l.order_number)]) dropped.push(l);
    });
    const sum = arr => arr.reduce((a, o) => a + (o.qty || 0), 0);
    return { missing, changed, matched, dropped, missingQty: sum(missing), missingAmt: missing.reduce((a, o) => a + (o.amount || 0), 0) };
  }, [report, ledger]);

  const copy = txt => { try { navigator.clipboard.writeText(txt); } catch { /* clipboard blocked — text is on screen anyway */ } };

  // The one write this page makes, and it only adds: a report listing an order we already
  // hold is evidence for it ("confirmation or order report — need at least one"). Stamps
  // report_seen_at / report_source on every ledger order the report contains.
  const [stamped, setStamped] = useState(null);
  const stampable = useMemo(() => diff ? [...diff.matched, ...diff.changed].map(o => o.orderNo).filter(no => ledger[no]) : [], [diff, ledger]);
  async function stampSeen() {
    if (!sb || !stampable.length) return;
    setBusy(true); setError(null);
    try {
      const { error: err } = await sb.from("purchase_orders")
        .update({ report_seen_at: new Date().toISOString(), report_source: `${report.broker} ${fileName}` })
        .eq("plan_id", plan.id).in("order_number", stampable);
      if (err) throw err;
      setStamped(stampable.length);
    } catch (e) { setError(e.message || String(e)); }
    finally { setBusy(false); }
  }
  const th = (t, right) => <th style={{ textAlign: right ? "right" : "left", padding: "6px 8px", fontSize: 11.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{t}</th>;
  const td = (v, right, extra) => <td style={{ padding: "6px 8px", textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums", ...extra }}>{v}</td>;
  const section = (title, color, count, hint) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "18px 0 6px" }}>
      <h3 style={{ margin: 0, fontSize: 16, color }}>{title} <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{count}</span></h3>
      <span style={{ fontSize: 12.5, color: C.muted }}>{hint}</span>
    </div>
  );

  if (error && !ledger) return <div style={{ padding: 24, fontFamily: FONT, color: C.red }}>Couldn't load the ledger: {error}</div>;
  if (!ledger) return <div style={{ padding: 24, fontFamily: FONT, color: C.muted }}>Loading the order ledger…</div>;

  return (
    <div style={{ fontFamily: FONT, color: C.text, padding: mobile ? 10 : 16, maxWidth: 1240 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Broker Check</h2>
        <span style={{ color: C.muted, fontSize: 13 }}>drop a broker's own order report here and see where our ledger disagrees, order by order. Nothing on this page changes the ledger.</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: C.chip, marginBottom: 10 }}>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ font: "inherit", fontSize: 13.5, fontWeight: 800, padding: "8px 14px", borderRadius: 999, border: "none", background: C.dark, color: "#fff", cursor: "pointer" }}>{busy ? "Reading…" : "Choose a report"}</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsb,.csv" onChange={handleFile} style={{ display: "none" }} />
        <span style={{ fontSize: 12.5, color: C.muted }}>Ball: <b>View/Change Orders → Download Results</b> (order list) or an <b>order_download…csv</b> (lines). EHR: the <b>OpenOrders…xlsb</b> recap from Crockett.</span>
        {fileName && <span style={{ fontSize: 12.5 }}>· <b>{fileName}</b>{report ? ` — ${report.kind}, ${Object.keys(report.orders).length} orders` : ""}</span>}
      </div>
      {error && <div style={{ margin: "6px 0 12px", padding: "10px 14px", borderRadius: 10, background: "#fbe4e0", border: `1px solid ${C.red}`, fontSize: 13.5 }}>{error}</div>}

      {!report && !error && (
        <div style={{ color: C.muted, fontSize: 13.5, padding: "8px 2px" }}>
          Ledger loaded: <b>{Object.keys(ledger).length}</b> orders for this plan ({Object.values(ledger).filter(l => LIVE(l.status)).length} live). Choose a report to compare.
        </div>
      )}

      {diff && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "10px 14px", borderRadius: 10, background: C.chip, fontSize: 13.5 }}>
            <span style={{ color: diff.missing.length ? C.red : C.muted }}><b>{diff.missing.length}</b> missing from ledger{diff.missing.length ? ` · ${n(diff.missingQty)} plants · ${money(diff.missingAmt)}` : ""}</span>
            <span style={{ color: diff.changed.length ? C.amber : C.muted }}><b>{diff.changed.length}</b> differ</span>
            <span style={{ color: diff.dropped.length ? C.amber : C.muted }}><b>{diff.dropped.length}</b> in ledger, not on report</span>
            <span style={{ color: C.muted }}><b>{diff.matched.length}</b> match</span>
            {stampable.length > 0 && (stamped == null
              ? <button onClick={stampSeen} disabled={busy} title="records that this broker report vouches for these orders (report_seen_at) — the only thing this page writes" style={{ font: "inherit", fontSize: 12.5, fontWeight: 800, padding: "5px 12px", borderRadius: 999, border: "none", background: C.dark, color: "#fff", cursor: "pointer", marginLeft: "auto" }}>{busy ? "Stamping…" : `Mark ${stampable.length} as seen on this report`}</button>
              : <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: C.light }}>✓ {stamped} orders stamped as seen on {report.broker}'s report</span>)}
          </div>

          {diff.missing.length > 0 && <>
            {section("Missing from our ledger", C.red, diff.missing.length, "the broker has these; we have no record. Enter them from their confirmations.")}
            <button onClick={() => copy(diff.missing.map(o => o.orderNo).join(" "))} style={{ font: "inherit", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1.5px solid ${C.border}`, background: C.card, cursor: "pointer", marginBottom: 6 }}>Copy order numbers</button>
            <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
              <thead><tr>{th("Order")}{th("PO")}{th("Supplier")}{th("Week")}{th("Plants", true)}{th("Confirmed", true)}{th("Amount", true)}{th("Lines", true)}</tr></thead>
              <tbody>{diff.missing.map(o => <tr key={o.orderNo} style={{ borderTop: `1px solid ${C.border}` }}>{td(<b>{o.orderNo}</b>)}{td(o.po)}{td(o.supplier)}{td(o.week ? `wk${o.week}${o.year ? "/" + String(o.year).slice(2) : ""}` : "—")}{td(n(o.qty), true)}{td(o.confirmed == null ? "—" : n(o.confirmed), true)}{td(money(o.amount), true)}{td(o.lines.length || "—", true)}</tr>)}</tbody>
            </table></div>
          </>}

          {diff.changed.length > 0 && <>
            {section("Differ from our ledger", C.amber, diff.changed.length, "same order number, different quantity, lines, or status. Click a row for the line detail.")}
            <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
              <thead><tr>{th("Order")}{th("Supplier")}{th("Week")}{th("Broker qty", true)}{th("Ledger qty", true)}{th("Ledger status")}{th("Line diffs", true)}</tr></thead>
              <tbody>{diff.changed.map(o => { const isOpen = !!open[o.orderNo]; return [
                <tr key={o.orderNo} onClick={() => setOpen(s => ({ ...s, [o.orderNo]: !s[o.orderNo] }))} style={{ borderTop: `1px solid ${C.border}`, cursor: o.lineDiff.length ? "pointer" : "default", background: isOpen ? C.chip : "transparent" }}>
                  {td(<b>{o.orderNo}</b>)}{td(o.supplier)}{td(o.week ? `wk${o.week}` : "—")}{td(n(o.qty), true)}{td(n(o.ledger.total_qty), true, { color: (+o.ledger.total_qty || 0) !== o.qty ? C.amber : C.text, fontWeight: (+o.ledger.total_qty || 0) !== o.qty ? 800 : 400 })}{td(o.ledger.status, false, { color: LIVE(o.ledger.status) ? C.text : C.red })}{td(o.lineDiff.length || "—", true)}
                </tr>,
                isOpen && o.lineDiff.length > 0 && <tr key={o.orderNo + "-d"}><td colSpan={7} style={{ padding: "4px 8px 12px 28px", background: C.chip }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12.5 }}><thead><tr><th style={{ textAlign: "left", padding: "3px 10px 3px 0" }}>Line</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Broker</th><th style={{ textAlign: "right", padding: "3px 10px" }}>Ledger</th></tr></thead>
                    <tbody>{o.lineDiff.map((d, i) => <tr key={i}><td style={{ padding: "3px 10px 3px 0" }}>{d.name}</td><td style={{ textAlign: "right", padding: "3px 10px" }}>{n(d.theirs)}</td><td style={{ textAlign: "right", padding: "3px 10px", color: C.amber, fontWeight: 700 }}>{n(d.ours)}</td></tr>)}</tbody></table>
                </td></tr>,
              ]; })}</tbody>
            </table></div>
          </>}

          {diff.dropped.length > 0 && <>
            {section("In our ledger, not on this report", C.amber, diff.dropped.length, `live ${report.broker} orders the broker no longer lists — probably superseded or consolidated. Confirm before marking; this page won't change them.`)}
            <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
              <thead><tr>{th("Order")}{th("Supplier")}{th("Week")}{th("Ledger qty", true)}{th("Ledger $", true)}{th("Status")}</tr></thead>
              <tbody>{diff.dropped.map(l => <tr key={l.order_number} style={{ borderTop: `1px solid ${C.border}` }}>{td(<b>{l.order_number}</b>)}{td(l.supplier)}{td(l.ship_week ? `wk${l.ship_week}/${String(l.ship_year || "").slice(2)}` : "—")}{td(n(l.total_qty), true)}{td(money(l.total_cost), true)}{td(l.status)}</tr>)}</tbody>
            </table></div>
          </>}

          {!diff.missing.length && !diff.changed.length && !diff.dropped.length && (
            <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 10, background: "#e7f3df", color: C.dark, fontSize: 14, fontWeight: 700 }}>Ledger matches this report — {diff.matched.length} orders, nothing missing, nothing different.</div>
          )}
        </>
      )}
    </div>
  );
}
