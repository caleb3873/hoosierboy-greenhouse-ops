// api/sentinel-cron.js — morning Data-Integrity Sentinel email.
// ---------------------------------------------------------------------------
// Triggered daily by a Vercel cron (see vercel.json "crons"). Runs the shared
// read-only checks and emails the report to the owner via Resend. Read-only:
// touches no data. Hitting it manually (GET) also works for testing.
//
//   /api/sentinel-cron            → run + email
//   /api/sentinel-cron?dry=1      → run + return JSON, DO NOT send email (test)
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const { runSentinel, renderHtml, COMPLETED_PLANS_DEFAULT } = require("./_sentinel-core");

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = "Plan Sentinel <ops@hoosierboy.com>";
const TO = process.env.SENTINEL_EMAIL_TO || "caleb@schlegelgreenhouse.com";
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  // Optional hardening: if CRON_SECRET is set, require Vercel's cron auth header.
  // (Left optional so it works out of the box; read-only + owner-only email = low risk.)
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Supabase env not configured" });

  const dry = req.query && (req.query.dry === "1" || req.query.dry === "true");
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const report = await runSentinel(sb, COMPLETED_PLANS_DEFAULT);
    const counts = { error: 0, warn: 0 };
    report.findings.forEach(f => { if (counts[f.severity] != null) counts[f.severity]++; });
    const subject = report.findings.length
      ? `🛰 Plan check: ${counts.error} must-fix · ${counts.warn} to look at`
      : `🛰 Plan check: all clear ✅`;
    const html = renderHtml(report);

    if (dry) return res.status(200).json({ ok: true, sent: false, subject, scope: report.scope, counts, findings: report.findings.length });
    if (!RESEND_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: TO, subject, html }),
    });
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok) return res.status(502).json({ error: "Resend failed", detail: out });
    return res.status(200).json({ ok: true, sent: true, to: TO, subject, counts, id: out.id });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
