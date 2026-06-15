// api/recon-apply.js — approve + apply a proposed reconciliation (Loop B write step).
// ---------------------------------------------------------------------------
// GET  ?id=&token=  → shows a confirmation page (NO write — safe for email
//                     link-prefetchers/scanners that auto-follow links).
// POST id,token     → applies via the tested api/import-receiving-pdf, marks the
//                     proposal applied, and re-runs order reconciliation to verify.
// Token is a one-time secret stored on the proposal row; the email link carries it.
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const { runOrderRecon } = require("./_sentinel-core");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

const page = (title, inner) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:24px;background:#f2f5ef;border-radius:12px;color:#1e2d1a;">
  <div style="font-size:20px;font-weight:800;margin-bottom:12px;">${title}</div>${inner || ""}</div>`;
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function confirmPage(p) {
  const c = (p.risk && p.risk.counts) || {};
  const flags = ((p.risk && p.risk.flags) || []).map(f => `<div style="color:#d94f3d;margin:4px 0;">⚠ ${esc(f)}</div>`).join("");
  const rows = (p.changes || []).slice(0, 60).map(ch => `<li>${esc(ch.variety)} — <b>${esc(ch.action)}</b> (${esc(ch.dbBefore)} → ${esc(ch.pdfTotal)})</li>`).join("");
  return page(`Apply order ${esc(p.order_number)}?`, `
    <p style="color:#3a4a34;">${c.updated || 0} updated · ${c.cancelled || 0} cancelled · ${c.inserted || 0} new</p>
    ${flags}
    <ul style="font-size:14px;color:#3a4a34;max-height:300px;overflow:auto;">${rows}</ul>
    <form method="POST" action="/api/recon-apply">
      <input type="hidden" name="id" value="${esc(p.id)}"><input type="hidden" name="token" value="${esc(p.approve_token)}">
      <button type="submit" style="background:#1e2d1a;color:#c8e6b8;border:none;border-radius:8px;padding:12px 22px;font-size:15px;font-weight:800;cursor:pointer;">✓ Apply these changes</button>
    </form>
    <p style="color:#7a8c74;font-size:12px;margin-top:14px;">This writes to the Fall Program. Reversible by re-running an earlier acknowledgement.</p>`);
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).send(page("Not configured", "<p>Supabase service credentials missing.</p>"));
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const q = req.query || {}, b = req.body || {};
  const id = q.id || b.id, token = q.token || b.token;
  if (!id || !token) return res.status(400).send(page("Missing approval details", "<p>Link is incomplete.</p>"));

  const { data: p } = await sb.from("recon_proposals").select("*").eq("id", id).single();
  if (!p || p.approve_token !== token) return res.status(401).send(page("Invalid or expired link", "<p>This approval link isn't valid.</p>"));
  if (p.status === "applied") return res.status(200).send(page(`Already applied`, `<p>Order ${esc(p.order_number)} was applied on ${esc(p.applied_at)}.</p>`));

  if (req.method !== "POST") return res.status(200).send(confirmPage(p)); // GET = preview only, no write

  // POST → apply via the tested extractor, then verify.
  try {
    const resp = await fetch(`https://${req.headers.host}/api/import-receiving-pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: p.order_number, storagePath: p.storage_path }),
    });
    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(502).send(page("Apply failed", `<p>${esc(result.error || resp.status)}</p>`));

    let verify = "";
    try {
      const recon = await runOrderRecon(createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY));
      const o = recon.orders.find(x => String(x.order) === String(p.order_number));
      verify = o ? (o.delta === 0 ? "✅ Order now reconciles (ordered = confirmed)." : `Order still shows a gap of ${o.delta} (supplier short — expected if they confirmed less).`) : "";
    } catch (_) {}
    await sb.from("recon_proposals").update({ status: "applied", applied_at: new Date().toISOString(), applied_result: result }).eq("id", id);
    return res.status(200).send(page(`✅ Applied order ${esc(p.order_number)}`, `<p>${(result.changes || []).length} variety changes written.</p><p style="color:#3a4a34;">${esc(verify)}</p>`));
  } catch (e) {
    return res.status(500).send(page("Error", `<p>${esc(e.message || e)}</p>`));
  }
};
