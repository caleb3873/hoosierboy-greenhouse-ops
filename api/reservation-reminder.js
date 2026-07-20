// api/reservation-reminder.js — manual "Notify" from the Reservations hub.
// (The cron auto-sends the same email for at-risk lines; this button is for
// ad-hoc nudges and re-sends.) Shared template lives in _campaigns.js.
const { sendOne, buildReservationReminder, FROM } = require("./_campaigns");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { to, customerName, lines } = body;
    if (!to || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: "to + lines required" });
    const { subject, html } = buildReservationReminder(customerName, lines);
    const id = await sendOne({ to, subject, html, text: null });
    return res.status(200).json({ ok: true, id, note: FROM === "onboarding@resend.dev" ? "Sandbox sender — external delivery requires RESEND_FROM." : undefined });
  } catch (e) { return res.status(500).json({ error: e.message || "Failed" }); }
};
