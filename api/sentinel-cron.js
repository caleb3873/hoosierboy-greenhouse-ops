// api/sentinel-cron.js — morning Ops Sentinel email.
// ---------------------------------------------------------------------------
// Triggered daily by a Vercel cron (see vercel.json "crons"). Runs all three
// read-only loops and emails one combined report to the owner via Resend:
//   A  plan readiness        (runSentinel)
//   B  order reconciliation  (runOrderRecon)
//   C  culture-guide links   (runCultureLink — skipped if culture creds absent)
// Read-only: touches no data. Hitting it manually (GET) also works for testing.
//
//   /api/sentinel-cron            → run + email
//   /api/sentinel-cron?dry=1      → run + return JSON, DO NOT send email (test)
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const { runSentinel, runOrderRecon, runCultureLink, runPlantAvailability, renderEmailHtml, COMPLETED_PLANS_DEFAULT } = require("./_sentinel-core");
const { runReconScan } = require("./recon-scan");

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = "Ops Sentinel <ops@schlegelgreenhouse.com>"; // schlegelgreenhouse.com = verified Resend domain
const FROM_FALLBACK = "Ops Sentinel <onboarding@resend.dev>"; // safety net only
const TO = process.env.SENTINEL_EMAIL_TO || "caleb@schlegelgreenhouse.com";
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const CULTURE_URL = process.env.REACT_APP_SUPABASE_CULTURE_URL;
const CULTURE_KEY = process.env.REACT_APP_SUPABASE_CULTURE_ANON_KEY;

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) { // optional hardening (Vercel cron passes this header when CRON_SECRET is set)
    if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Supabase env not configured" });

  const dry = req.query && (req.query.dry === "1" || req.query.dry === "true");
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // A — always. B/C — degrade gracefully so one failing loop can't kill the email.
    const sentinel = await runSentinel(sb, COMPLETED_PLANS_DEFAULT);
    let recon = null, link = null, proposals = [], avail = null;
    try { recon = await runOrderRecon(sb); } catch (e) { console.error("recon failed:", e.message); }
    try { avail = await runPlantAvailability(sb); } catch (e) { console.error("availability failed:", e.message); }
    if (CULTURE_URL && CULTURE_KEY) {
      try { link = await runCultureLink(sb, createClient(CULTURE_URL, CULTURE_KEY)); } catch (e) { console.error("culture-link failed:", e.message); }
    }
    const base = `https://${req.headers.host}`;
    try { // Loop B (promoted): scan for new acknowledgement PDFs → propose (never writes here)
      const scan = await runReconScan({ base });
      proposals = (scan.proposals || []).map(p => ({ ...p, approveUrl: `${base}/api/recon-apply?id=${p.id}&token=${p.token}` }));
    } catch (e) { console.error("recon-scan failed:", e.message); }

    const counts = { error: 0, warn: 0 };
    sentinel.findings.forEach(f => { if (counts[f.severity] != null) counts[f.severity]++; });
    const bits = [`${counts.error} must-fix`, `${counts.warn} look`];
    if (avail) bits.push(`${avail.short.length} plant shortfalls`);
    if (recon) bits.push(`${recon.mismatched} order gaps`);
    if (proposals.length) bits.push(`${proposals.length} to approve`);
    if (link) bits.push(`${link.tiers.HIGH.length} links ready`);
    const subject = `🛰 Daily ops check: ${bits.join(" · ")}`;
    const html = renderEmailHtml({ sentinel, recon, link, proposals, avail });

    const summary = { scope: sentinel.scope, plan: counts, plantShortfalls: avail ? avail.short.length : null, orderGaps: recon ? recon.mismatched : null, toApprove: proposals.length, linksReady: link ? link.tiers.HIGH.length : null };
    if (dry) return res.status(200).json({ ok: true, sent: false, subject, ...summary });
    if (!RESEND_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

    const send = from => fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: TO, subject, html }),
    });
    let usedFrom = FROM;
    let resp = await send(FROM);
    let out = await resp.json().catch(() => ({}));
    if (!resp.ok) { usedFrom = FROM_FALLBACK; resp = await send(FROM_FALLBACK); out = await resp.json().catch(() => ({})); }
    if (!resp.ok) return res.status(502).json({ error: "Resend failed", detail: out });
    return res.status(200).json({ ok: true, sent: true, to: TO, from: usedFrom, subject, ...summary, id: out.id });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
