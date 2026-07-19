// Resend delivery-event webhook (svix-signed). Rules learned the hard way (per spec):
// opened → opened_at ONLY if null; delivered must NOT downgrade 'opened';
// clicked → clicked_at if null AND backfills opened_at; bounced/complained → flag the contact.
// NOTE: click events only fire if click tracking is enabled on the Resend domain.
const crypto = require("crypto");
const { svc } = require("./_campaigns");

function verifySvix(secret, headers, payload) {
  try {
    const id = headers["svix-id"], ts = headers["svix-timestamp"], sigs = headers["svix-signature"];
    if (!id || !ts || !sigs) return false;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false; // 5-min tolerance
    const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
    const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
    return String(sigs).split(" ").some(s => {
      const v = s.split(",")[1];
      return v && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected));
    });
  } catch { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: "RESEND_WEBHOOK_SECRET not set" });
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (!verifySvix(secret, req.headers, raw)) return res.status(401).json({ error: "Bad signature" });

  try {
    const evt = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const type = evt.type || "";
    const pid = evt.data && (evt.data.email_id || evt.data.id);
    if (!pid) return res.status(200).json({ ok: true, note: "no message id" });
    const db = svc();
    const { data: msgs } = await db.from("messages").select("id,status,opened_at,clicked_at,to_email").eq("provider_message_id", pid).limit(1);
    const m = msgs && msgs[0];
    if (!m) return res.status(200).json({ ok: true, note: "unknown message" });

    const upd = {};
    if (type === "email.delivered") { if (m.status !== "opened") upd.status = "delivered"; }
    else if (type === "email.opened") { if (!m.opened_at) upd.opened_at = new Date().toISOString(); upd.status = "opened"; }
    else if (type === "email.clicked") {
      if (!m.clicked_at) upd.clicked_at = new Date().toISOString();
      if (!m.opened_at) upd.opened_at = new Date().toISOString();   // a click implies an open
      upd.status = "opened";
    }
    else if (type === "email.bounced") { upd.status = "bounced"; }
    else if (type === "email.failed") { upd.status = "failed"; }
    else if (type === "email.complained") { upd.status = "complained"; }

    if (Object.keys(upd).length) await db.from("messages").update(upd).eq("id", m.id);
    if (type === "email.bounced" || type === "email.failed") await db.from("marketing_contacts").update({ bounced: true }).eq("email", m.to_email);
    if (type === "email.complained") await db.from("marketing_contacts").update({ unsubscribed: true }).eq("email", m.to_email);
    return res.status(200).json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message || "Failed" }); }
};
