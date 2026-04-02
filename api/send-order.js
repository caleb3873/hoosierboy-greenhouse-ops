// api/send-order.js
// Sends order emails with Excel attachment via Resend

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = "onboarding@resend.dev";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { to, cc, subject, body, attachment, filename } = req.body || {};

  if (!to || !subject || !attachment || !filename) {
    return res.status(400).json({ error: "Missing required fields: to, subject, attachment, filename" });
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
        subject,
        html: body || "<p>Please see attached order.</p>",
        attachments: [
          {
            filename,
            content: attachment, // base64 encoded
          },
        ],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return res.status(500).json({ error: data.message || "Email send failed" });
    }

    return res.status(200).json({ sent: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
