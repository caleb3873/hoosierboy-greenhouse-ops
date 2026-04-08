// api/shipping-email.js
// Sends a "your order is on the way" email via Resend when a driver leaves the greenhouse.

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = "shipping@hoosierboy.com";
const FROM_FALLBACK = "onboarding@resend.dev";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RESEND_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const { to, customerName, stopNumber, totalStops, driverName, etaMinutes } = req.body || {};
  if (!to) return res.status(400).json({ error: "to required" });

  const etaText = etaMinutes ? `about ${etaMinutes} minutes away` : "on the way";
  const stopText = stopNumber && totalStops ? ` You are stop <b>#${stopNumber} of ${totalStops}</b> today.` : "";
  const driverText = driverName ? ` Your driver is <b>${driverName}</b>.` : "";

  const subject = `Your order from Schlegel Greenhouse is on its way`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f2f5ef;">
      <div style="background:#1e2d1a;color:#c8e6b8;padding:18px 22px;border-radius:10px 10px 0 0;">
        <div style="font-size:13px;letter-spacing:1px;color:#7fb069;text-transform:uppercase;font-weight:700;">Schlegel Greenhouse</div>
        <div style="font-size:22px;font-weight:800;margin-top:4px;">Your order is on the way 🚚</div>
      </div>
      <div style="background:#fff;padding:22px;border-radius:0 0 10px 10px;font-size:15px;color:#1e2d1a;line-height:1.6;">
        <p>Hi${customerName ? " " + customerName : ""},</p>
        <p>Good news — your delivery from Schlegel Greenhouse just left our loading dock and is ${etaText}.${stopText}${driverText}</p>
        <p>Please have someone available at your delivery address to receive the plants. If you need to reach us, call the office at (317) 862-4631.</p>
        <p style="margin-top:24px;color:#7a8c74;font-size:13px;">— The Schlegel Greenhouse Shipping Team</p>
      </div>
    </div>`;

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
        subject,
        html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      // retry with fallback from address
      const resp2 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_FALLBACK, to: Array.isArray(to) ? to : [to], subject, html }),
      });
      const data2 = await resp2.json();
      if (!resp2.ok) return res.status(502).json({ error: "resend failed", detail: data2 });
      return res.status(200).json({ id: data2.id, from: FROM_FALLBACK });
    }
    return res.status(200).json({ id: data.id, from: FROM });
  } catch (e) {
    return res.status(500).json({ error: "fetch failed", message: e.message });
  }
};
