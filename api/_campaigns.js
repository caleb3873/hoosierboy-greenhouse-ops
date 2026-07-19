// api/_campaigns.js — shared campaign send pipeline (CommonJS; mirrors src/emailKit.js helpers
// for merge + text derivation because api functions can't import the ESM src module).
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";
const BASE_URL = process.env.PUBLIC_BASE_URL || "https://ops.hoosierboy.com";

function svc() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server DB not configured (SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function fillMerge(str, data) {
  return String(str || "").replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(data, k) && data[k] != null && data[k] !== "" ? String(data[k])
      : (m === "{first_name}" || m === "{contact_name}") ? "there" : "");
}
function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function unsubToken(email, salt) { return crypto.createHash("md5").update(email.toLowerCase() + salt).digest("hex"); }
function unsubLink(email, salt) {
  const e = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${BASE_URL}/api/unsubscribe?e=${e}&t=${unsubToken(email, salt)}`;
}
function withUnsub(html, email, salt) {
  const link = `<a href="${unsubLink(email, salt)}" style="color:#6b7570;text-decoration:underline;">Unsubscribe</a>`;
  if (html.includes("{UNSUB}")) return html.replace(/\{UNSUB\}/g, link);
  return html + `<div style="font-family:Arial,sans-serif;font-size:12px;color:#6b7570;text-align:center;padding:14px 0;">Hoosier Boy Plants by Schlegel Greenhouse · Indianapolis · ${link}</div>`;
}

async function sendOne({ to, subject, html, text }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text, reply_to: "caleb@schlegelgreenhouse.com" }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.message || `Resend ${r.status}`);
  return out.id || null;
}

const mergeDataFor = (rec, senderName) => {
  const contactName = rec.contact_name || "";
  return {
    first_name: contactName.split(/\s+/)[0] || "",
    contact_name: contactName,
    organization: rec.organization || "",
    sender_name: senderName || "Hoosier Boy Plants",
  };
};

// Dispatch a campaign: guard double-send, suppress opt-outs, personalize, ~5 parallel, log everything.
async function dispatchCampaign(campaignId) {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY missing");
  const db = svc();

  // double-send guard: only one caller can move it into 'sending'
  const { data: claimed, error: claimErr } = await db.from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId).in("status", ["draft", "scheduled"]).select("*");
  if (claimErr) throw claimErr;
  if (!claimed || !claimed.length) throw new Error("Campaign is already sending, sent, or canceled");
  const camp = claimed[0];

  const [{ data: recips }, { data: unsubs }, { data: mcUnsub }, { data: saltRow }] = await Promise.all([
    db.from("campaign_recipients").select("*").eq("campaign_id", campaignId).eq("status", "pending"),
    db.from("unsubscribes").select("email"),
    db.from("marketing_contacts").select("email").eq("unsubscribed", true),
    db.from("b2b_settings").select("value").eq("key", "unsub_salt").single(),
  ]);
  const salt = (saltRow && saltRow.value) || "hb";
  const suppressed = new Set([...(unsubs || []).map(u => u.email.toLowerCase()), ...(mcUnsub || []).map(u => u.email.toLowerCase())]);
  const senderName = (camp.created_by || "").split(/\s+/)[0] || null;

  let sent = 0, failed = 0, skipped = 0;
  const queue = [...(recips || [])];
  async function worker() {
    for (;;) {
      const rec = queue.shift();
      if (!rec) return;
      const email = rec.email.toLowerCase();
      if (suppressed.has(email)) {
        skipped++;
        await db.from("campaign_recipients").update({ status: "skipped", error: "unsubscribed" }).eq("id", rec.id);
        continue;
      }
      try {
        const data = mergeDataFor(rec, senderName);
        const subject = fillMerge(camp.subject, data);
        const html = withUnsub(fillMerge(camp.body, data), email, salt);
        const text = htmlToText(html);
        const providerId = await sendOne({ to: rec.email, subject, html, text });
        const { data: msg } = await db.from("messages").insert({
          direction: "outbound", status: "sent", from_email: FROM, to_email: email,
          subject, body_html: html, body_text: text, provider_message_id: providerId, campaign_id: campaignId,
        }).select("id").single();
        await db.from("campaign_recipients").update({ status: "sent", message_id: msg ? msg.id : null }).eq("id", rec.id);
        sent++;
      } catch (e) {
        failed++;
        await db.from("campaign_recipients").update({ status: "failed", error: String(e.message || e).slice(0, 300) }).eq("id", rec.id);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));   // bounded concurrency

  await db.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId);
  return { sent, failed, skipped, total: (recips || []).length, sandbox: FROM === "onboarding@resend.dev" };
}

module.exports = { svc, dispatchCampaign, fillMerge, htmlToText, unsubToken, sendOne, FROM };
