// api/broker-email.js — send a broker shortage-chase email (YOU trigger it; never auto).
// ---------------------------------------------------------------------------
//   GET  /api/broker-email?order=<n>           → preview the draft (no send)
//   POST {order}                               → send the order's draft to its broker
//   POST {to, subject, body}                   → send a custom message
//
// NOTE: until a domain is verified in Resend, this falls back to the sandbox sender,
// which only reliably reaches the account owner — so external broker delivery needs
// schlegelgreenhouse.com verified first (see resend_domain_unverified memory).
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const { runBrokerOutreach } = require("./_sentinel-core");

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = "Schlegel Greenhouse <ops@schlegelgreenhouse.com>";
const FROM_FALLBACK = "Schlegel Greenhouse <onboarding@resend.dev>";
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = body => `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2d1a;white-space:pre-wrap;">${esc(body)}</div>`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Supabase env not configured" });

  const q = req.query || {}, b = req.body || {};
  const order = q.order || b.order;
  let to = b.to, subject = b.subject, body = b.body, brokerName = null, alternate = null;

  // Resolve the draft from the order if not given a custom message.
  if (order && (!to || !subject || !body)) {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const oc = (await runBrokerOutreach(sb)).orders.find(x => String(x.order) === String(order));
    if (!oc) return res.status(404).json({ error: `no shortfall on order ${order}` });
    to = to || (oc.broker && oc.broker.email); subject = subject || oc.draftSubject; body = body || oc.draftBody;
    brokerName = oc.brokerName; alternate = oc.alternate;
    if (!to) return res.status(400).json({ error: `no broker email on file for ${oc.brokerName}`, draftSubject: oc.draftSubject, draftBody: oc.draftBody });
  }
  if (!to || !subject || !body) return res.status(400).json({ error: "need {order} or {to, subject, body}" });

  // GET = preview only (never sends — safe for link prefetchers).
  if (req.method === "GET") return res.status(200).json({ preview: true, to, subject, body, brokerName, alternate });
  if (!RESEND_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const send = from => fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html: toHtml(body) }),
  });
  let usedFrom = FROM, resp = await send(FROM), out = await resp.json().catch(() => ({}));
  if (!resp.ok) { usedFrom = FROM_FALLBACK; resp = await send(FROM_FALLBACK); out = await resp.json().catch(() => ({})); }
  if (!resp.ok) return res.status(502).json({ error: "Resend failed", detail: out });
  return res.status(200).json({ ok: true, sent: true, to, subject, from: usedFrom, id: out.id, note: usedFrom === FROM_FALLBACK ? "Sent via sandbox sender — external delivery needs a verified Resend domain." : undefined });
};
