// api/hr-message.js
// HR-message email blast — fires when staff submit a private message to Trish.
// Emails go to trish@, tyler@, and mario@ at schlegelgreenhouse.com.
// Also marks the hr_messages row with email_sent_at (or email_error) for audit.
// POST { id, fromName, message }

const RESEND_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM = "Schlegel Greenhouse <onboarding@resend.dev>";
const RECIPIENTS = [
  "trish@schlegelgreenhouse.com",
  "tyler@schlegelgreenhouse.com",
  "mario@schlegelgreenhouse.com",
];

async function markRow(id, patch) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/hr_messages?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(patch),
    });
  } catch {}
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id, fromName, message } = req.body || {};
  if (!fromName || !message) return res.status(400).json({ error: "Missing fromName or message" });
  if (!RESEND_KEY) {
    if (id) await markRow(id, { email_error: "RESEND_API_KEY not configured" });
    return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  }

  const subject = `HR message from ${fromName}`;
  const text = `${fromName} sent an HR message via the floor app:\n\n${message}\n\n— Hoosier Boy Greenhouse Ops`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e2d1a">
    <p><strong>${escapeHtml(fromName)}</strong> sent an HR message via the floor app:</p>
    <blockquote style="border-left:3px solid #8e44ad;margin:0;padding:10px 14px;background:#f8f0fa;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
    <p style="color:#7a8c74;font-size:12px;margin-top:24px">— Hoosier Boy Greenhouse Ops</p>
  </div>`;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: RECIPIENTS, subject, text, html }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data?.message || `Resend status ${resp.status}`;
      if (id) await markRow(id, { email_error: msg });
      return res.status(500).json({ error: msg });
    }
    if (id) await markRow(id, { email_sent_at: new Date().toISOString(), email_error: null });
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (e) {
    if (id) await markRow(id, { email_error: e.message });
    return res.status(500).json({ error: e.message });
  }
};

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
