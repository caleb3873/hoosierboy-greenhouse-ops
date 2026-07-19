// Send a single "[TEST]" copy of a campaign draft to the logged-in staff member.
const { requireAuth } = require("./_auth");
const { fillMerge, htmlToText, sendOne, FROM } = require("./_campaigns");
const SAMPLE = { first_name: "Marsha", contact_name: "Marsha Schlegel", organization: "Marsha's Garden Center", sender_name: "Caleb" };

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const to = body.to || user.email;
    if (!to || !body.subject || !body.html) return res.status(400).json({ error: "subject + html required" });
    const html = fillMerge(body.html, SAMPLE).replace(/\{UNSUB\}/g, "<span style='text-decoration:underline;'>Unsubscribe</span> (live link in the real send)");
    const id = await sendOne({ to, subject: "[TEST] " + fillMerge(body.subject, SAMPLE), html, text: htmlToText(html) });
    return res.status(200).json({ ok: true, id, note: FROM === "onboarding@resend.dev" ? "Sandbox sender — set RESEND_FROM after domain verification." : undefined });
  } catch (e) { return res.status(500).json({ error: e.message || "Failed" }); }
};
