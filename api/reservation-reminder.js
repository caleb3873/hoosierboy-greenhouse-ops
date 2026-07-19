// api/reservation-reminder.js
// "Take it or it goes to open availability" — emails a customer their at-risk reservation
// lines with take-by dates. Sent from the Reservations hub; stamps notified_at client-side.
// Uses RESEND_FROM once the domain is verified; falls back to the Resend sandbox sender
// (delivers only to the account owner) until then.
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!RESEND_KEY) return res.status(500).json({ error: "Email is not configured (RESEND_API_KEY missing)" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { to, customerName, lines } = body;
    if (!to || !Array.isArray(lines) || !lines.length) return res.status(400).json({ error: "to + lines required" });

    const fmt = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }); } catch { return d; } };
    const rows = lines.map(l =>
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #e8e2da;font-size:15px;color:#22302a;">${l.name}</td>` +
      `<td style="padding:10px 14px;border-bottom:1px solid #e8e2da;font-size:15px;color:#22302a;text-align:right;">${l.remaining} reserved</td>` +
      `<td style="padding:10px 14px;border-bottom:1px solid #e8e2da;font-size:15px;color:#c2703e;font-weight:bold;text-align:right;">order by ${fmt(l.takeBy)}</td></tr>`
    ).join("");

    const html =
      `<div style="background:#faf8f5;padding:24px 12px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">` +
      `<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e8e2da;border-radius:10px;" cellpadding="0" cellspacing="0">` +
      `<tr><td style="background:#16403A;padding:18px 24px;border-radius:10px 10px 0 0;color:#f2ede4;font-size:14px;letter-spacing:3px;font-weight:bold;">HOOSIER BOY</td></tr>` +
      `<tr><td style="padding:24px;">` +
      `<p style="font-size:16px;color:#22302a;margin:0 0 12px;">Hi${customerName ? " " + customerName : ""},</p>` +
      `<p style="font-size:15px;color:#22302a;line-height:1.6;margin:0 0 16px;">A friendly heads-up on your spring reservation — the material below is ready and your reserved quantity is holding. <strong>Please place your order by the date shown</strong>; after that, the remaining quantity returns to open availability for other buyers.</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e2da;border-radius:8px;">${rows}</table>` +
      `<p style="font-size:15px;color:#22302a;line-height:1.6;margin:16px 0 0;">Ready to schedule delivery or have questions? Just reply to this email or call your sales rep — we'll take care of it.</p>` +
      `</td></tr>` +
      `<tr><td style="padding:16px 24px;border-top:1px solid #e8e2da;font-size:12px;color:#6b7570;">Hoosier Boy Plants by Schlegel Greenhouse · Indianapolis</td></tr>` +
      `</table></div>`;

    const subject = `Reservation reminder — ${lines.length === 1 ? lines[0].name : lines.length + " items"} ready for pickup scheduling`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    const out = await r.json();
    if (!r.ok) return res.status(502).json({ error: out.message || "Resend error" });
    return res.status(200).json({ ok: true, id: out.id, note: FROM === "onboarding@resend.dev" ? "Sandbox sender — external delivery requires a verified Resend domain (RESEND_FROM)." : undefined });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Failed" });
  }
};
