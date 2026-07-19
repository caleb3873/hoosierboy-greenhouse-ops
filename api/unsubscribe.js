// Public one-click unsubscribe. Link: /api/unsubscribe?e=<b64url email>&t=<md5(email+salt)>
const { svc, unsubToken } = require("./_campaigns");

module.exports = async (req, res) => {
  try {
    const e = String(req.query.e || ""), t = String(req.query.t || "");
    const email = Buffer.from(e, "base64url").toString("utf8").toLowerCase();
    if (!email.includes("@")) throw new Error("bad link");
    const db = svc();
    const { data: saltRow } = await db.from("b2b_settings").select("value").eq("key", "unsub_salt").single();
    if (unsubToken(email, (saltRow && saltRow.value) || "hb") !== t) throw new Error("bad token");
    await db.from("unsubscribes").upsert({ email, source: "link" }, { onConflict: "email" });
    await db.from("marketing_contacts").update({ unsubscribed: true }).eq("email", email);
    res.setHeader("Content-Type", "text/html");
    return res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;background:#faf8f5;margin:0;padding:60px 20px;text-align:center;">
<div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e8e2da;border-radius:12px;padding:36px 28px;">
<div style="font-size:13px;letter-spacing:3px;font-weight:bold;color:#16403A;">HOOSIER BOY</div>
<h2 style="font-family:Georgia,serif;color:#1a4731;font-weight:600;margin:18px 0 8px;">You're unsubscribed</h2>
<p style="font-size:14px;color:#6b7570;line-height:1.6;margin:0;">${email} won't receive marketing emails from us anymore.<br/>Order confirmations and delivery notices still arrive as usual.</p>
</div></body></html>`);
  } catch (err) {
    res.setHeader("Content-Type", "text/html");
    return res.status(400).send("<p style='font-family:sans-serif'>This unsubscribe link isn't valid. Reply to the email instead and we'll remove you by hand.</p>");
  }
};
