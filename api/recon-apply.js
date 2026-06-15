// api/recon-apply.js — approve + apply a proposed reconciliation (Loop B write step).
// ---------------------------------------------------------------------------
// Applies the proposal's stored row-level PLAN (computed during the dry-run),
// optionally with the user's per-variety EDITS — no re-extraction, no Claude.
//
//   GET  ?id=&token=                 → confirm page (email path; preview only, no write)
//   POST {id, token}                 → apply original plan (email confirm-page form)
//   POST {id, edits:{varietyTotals,cancelVarieties,dropInserts}}  → in-app apply w/ edits
//
// In-app posts carry no token (floor-code clients have no server session) — same
// open posture as api/import-receiving-pdf. A WRONG token is still rejected.
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const { runOrderRecon } = require("./_sentinel-core");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title, inner) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:24px;background:#f2f5ef;border-radius:12px;color:#1e2d1a;">
  <div style="font-size:20px;font-weight:800;margin-bottom:12px;">${title}</div>${inner || ""}</div>`;
const splitEven = (total, n) => { const each = Math.floor(total / n); const rem = total - each * (n - 1); return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : rem)); };

function confirmPage(p) {
  const c = (p.risk && p.risk.counts) || {};
  const flags = ((p.risk && p.risk.flags) || []).map(f => `<div style="color:#d94f3d;margin:4px 0;">⚠ ${esc(f)}</div>`).join("");
  const rows = (p.changes || []).slice(0, 80).map(ch => `<li>${esc(ch.variety)} — <b>${esc(ch.action)}</b> (${esc(ch.dbBefore)} → ${esc(ch.pdfTotal)})</li>`).join("");
  return page(`Apply order ${esc(p.order_number)}?`, `
    <p style="color:#3a4a34;">${c.updated || 0} updated · ${c.cancelled || 0} cancelled · ${c.inserted || 0} new</p>${flags}
    <ul style="font-size:14px;color:#3a4a34;max-height:300px;overflow:auto;">${rows}</ul>
    <form method="POST" action="/api/recon-apply">
      <input type="hidden" name="id" value="${esc(p.id)}"><input type="hidden" name="token" value="${esc(p.approve_token)}">
      <button type="submit" style="background:#1e2d1a;color:#c8e6b8;border:none;border-radius:8px;padding:12px 22px;font-size:15px;font-weight:800;cursor:pointer;">✓ Apply these changes</button>
    </form>
    <p style="color:#7a8c74;font-size:12px;margin-top:14px;">Tip: open the Receiving inbox in the app to edit quantities before applying.</p>`);
}

// Apply the stored plan (row-level ops with ids) with optional per-variety edits.
async function applyFromPlan(sb, p, edits) {
  const plan = p.plan || {};
  const updates = plan.updates || [], cancellations = plan.cancellations || [], inserts = plan.inserts || [], deletes = plan.deletes || [];
  const varietyTotals = (edits && edits.varietyTotals) || {};
  const cancelVarieties = new Set((edits && edits.cancelVarieties) || []);
  const dropInserts = !!(edits && edits.dropInserts);
  const T = "fall_program_items";

  const byVar = new Map();
  for (const u of updates) { const k = u.variety || u.id; if (!byVar.has(k)) byVar.set(k, []); byVar.get(k).push(u); }

  // Current production qty per affected row — so we can cap production at the
  // newly-confirmed supply (never pot/tag more than you'll receive). Reduce-only.
  const ids = updates.map(u => u.id);
  const cur = ids.length ? ((await sb.from(T).select("id,qty").in("id", ids)).data || []) : [];
  const qtyById = new Map(cur.map(r => [r.id, Number(r.qty) || 0]));

  let patched = 0, cancelled = 0, inserted = 0, deleted = 0, cappedQty = 0;
  for (const [variety, rows] of byVar) {
    if (cancelVarieties.has(variety)) {
      for (const r of rows) { await sb.from(T).update({ status: "CANCELLED", qty: 0 }).eq("id", r.id); cancelled++; }
      continue;
    }
    const total = varietyTotals[variety] != null ? Math.max(0, parseInt(varietyTotals[variety]) || 0) : rows.reduce((s, r) => s + (r.ord_qty || 0), 0);
    const splits = splitEven(total, rows.length);
    for (let i = 0; i < rows.length; i++) {
      const patch = { ord_qty: splits[i] };
      if (rows[i].clearStatus) patch.status = null;
      if ((qtyById.get(rows[i].id) || 0) > splits[i]) { patch.qty = splits[i]; cappedQty++; } // production can't exceed confirmed supply
      await sb.from(T).update(patch).eq("id", rows[i].id); patched++;
    }
  }
  for (const id of cancellations) { await sb.from(T).update({ status: "CANCELLED" }).eq("id", id); cancelled++; }
  for (const id of deletes) { await sb.from(T).delete().eq("id", id); deleted++; }
  if (!dropInserts && inserts.length) { await sb.from(T).insert(inserts); inserted += inserts.length; }
  return { patched, cancelled, inserted, deleted, cappedQty };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send(page("Not configured", "<p>Supabase service credentials missing.</p>"));
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const b = req.body || {}, q = req.query || {};
  const id = b.id || q.id, token = b.token || q.token, edits = b.edits || null;
  const isApi = req.headers["content-type"]?.includes("application/json"); // in-app JSON call
  if (!id) return isApi ? res.status(400).json({ error: "id required" }) : res.status(400).send(page("Missing details", ""));

  const { data: p } = await sb.from("recon_proposals").select("*").eq("id", id).single();
  if (!p) return isApi ? res.status(404).json({ error: "not found" }) : res.status(404).send(page("Not found", ""));
  if (token && token !== p.approve_token) return isApi ? res.status(401).json({ error: "bad token" }) : res.status(401).send(page("Invalid link", ""));
  // Email/preview path (GET) requires the token; in-app uses the UI, not GET.
  if (req.method === "GET") { if (token !== p.approve_token) return res.status(401).send(page("Invalid link", "")); return res.status(200).send(confirmPage(p)); }
  if (b.action === "decline") { await sb.from("recon_proposals").update({ status: "declined" }).eq("id", id); return res.status(200).json({ ok: true, declined: true }); }
  if (p.status === "applied") return isApi ? res.status(200).json({ ok: true, already: true }) : res.status(200).send(page("Already applied", `<p>Order ${esc(p.order_number)} was applied.</p>`));

  try {
    const result = await applyFromPlan(sb, p, edits);
    let verify = "";
    try {
      const recon = await runOrderRecon(sb);
      const o = recon.orders.find(x => String(x.order) === String(p.order_number));
      verify = o ? (o.delta === 0 ? "Order now reconciles (ordered = confirmed)." : `Order shows a gap of ${o.delta} (supplier short).`) : "";
    } catch (_) {}
    await sb.from("recon_proposals").update({ status: "applied", applied_at: new Date().toISOString(), applied_result: { ...result, edits: edits || null, verify } }).eq("id", id);
    if (isApi) return res.status(200).json({ ok: true, ...result, verify });
    return res.status(200).send(page(`✅ Applied order ${esc(p.order_number)}`, `<p>${result.patched} updated · ${result.cancelled} cancelled · ${result.inserted} new${result.cappedQty ? ` · ${result.cappedQty} production capped to supply` : ""}.</p><p style="color:#3a4a34;">${esc(verify)}</p>`));
  } catch (e) {
    return isApi ? res.status(500).json({ error: String(e.message || e) }) : res.status(500).send(page("Error", `<p>${esc(e.message || e)}</p>`));
  }
};
