// api/send-receiving-claim.js
// Email a receiving claim to the broker's rep via Resend. Pulls rep_email
// from broker_profiles, attaches the claim photo (fetched from the receiving
// photos bucket via signed URL), and stamps the receiving_lines row with
// claim_sent_at + claim_sent_to so the UI knows it went out.
//
// POST body:
//   {
//     lineId,            // receiving_lines.id
//     broker,            // e.g. "Ball" — used to look up rep_email
//     orderNumber,       // e.g. "9592051"
//     variety,           // e.g. "SUPERCAL PREMIUM BORDEAUX"
//     expectedQty,       // 300
//     actualQty,         // 264
//     reason,            // "Short" | "Damaged" | "Wrong Variety" | "Quality" | "Other"
//     notes,             // free text
//     photoPath,         // path inside receiving-photos bucket, optional
//     reportedBy,        // e.g. "Mario Mirelez"
//     reportedByEmail,   // optional CC
//   }

const RESEND_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM = "Schlegel Greenhouse <onboarding@resend.dev>";
// Internal CC so Tyler/Mario always have a record of outgoing claims
const INTERNAL_CC = ["tyler@schlegelgreenhouse.com", "mario@schlegelgreenhouse.com"];

async function lookupBroker(name) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  // Match brokers loosely — `Ball` should match `BALL SEED`, etc.
  const url = `${SUPABASE_URL}/rest/v1/broker_profiles?select=name,rep_email,rep_name&name=ilike.*${encodeURIComponent(name)}*&limit=1`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] || null;
}

async function signedPhotoUrl(path) {
  if (!path || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  // 1-hour signed URL — long enough for Resend to fetch the attachment
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/receiving-photos/${encodeURI(path)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  // signedURL is relative; prefix with the public URL
  return data?.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
}

async function fetchAttachment(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  const filename = (url.split("/").pop() || "claim.jpg").split("?")[0];
  return { filename, content: Buffer.from(buf).toString("base64") };
}

async function patchLine(id, patch) {
  if (!id || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/receiving_lines?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
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

  const { lineId, broker, orderNumber, variety, expectedQty, actualQty, reason, notes, photoPath, reportedBy, reportedByEmail } = req.body || {};
  if (!broker || !orderNumber || !variety) {
    return res.status(400).json({ error: "Missing broker, orderNumber, or variety" });
  }
  if (!RESEND_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });

  const profile = await lookupBroker(broker);
  if (!profile?.rep_email) {
    return res.status(400).json({ error: `No rep_email on file for ${broker}. Add one in broker_profiles to send claims.` });
  }

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const diff = (expectedQty || 0) - (actualQty || 0);

  const subject = `Claim — Order #${orderNumber} — ${variety} (${reason || "Issue"})`;
  const lines = [
    `Hi ${(profile.rep_name || "team").split(" ")[0]},`,
    "",
    `We're filing a claim on our order from ${broker}. Details below.`,
    "",
    `Claim date:     ${today}`,
    `Order number:   ${orderNumber}`,
    `Variety:        ${variety}`,
    `Reason:         ${reason || "Issue"}`,
    `Expected qty:   ${expectedQty}`,
    `Actual qty:     ${actualQty}`,
    diff > 0 ? `Short by:       ${diff}` : diff < 0 ? `Over by:        ${Math.abs(diff)}` : null,
    notes ? "" : null,
    notes ? `Notes from the floor:\n${notes}` : null,
    "",
    "Photo from receiving is attached.",
    "",
    `— ${reportedBy || "Receiving"}`,
    "Schlegel Greenhouse · Indianapolis",
  ].filter(l => l !== null);
  const text = lines.join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1e2d1a">
    <p>Hi ${escapeHtml((profile.rep_name || "team").split(" ")[0])},</p>
    <p>We're filing a claim on our order from <strong>${escapeHtml(broker)}</strong>. Details below.</p>
    <table style="border-collapse:collapse">
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Claim date</td><td style="padding:4px 0"><strong>${escapeHtml(today)}</strong></td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Order number</td><td style="padding:4px 0"><strong>${escapeHtml(orderNumber)}</strong></td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Variety</td><td style="padding:4px 0"><strong>${escapeHtml(variety)}</strong></td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Reason</td><td style="padding:4px 0"><strong>${escapeHtml(reason || "Issue")}</strong></td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Expected</td><td style="padding:4px 0">${expectedQty}</td></tr>
      <tr><td style="padding:4px 10px 4px 0;color:#7a8c74">Actual</td><td style="padding:4px 0">${actualQty}</td></tr>
      ${diff > 0 ? `<tr><td style="padding:4px 10px 4px 0;color:#d94f3d"><strong>Short by</strong></td><td style="padding:4px 0;color:#d94f3d"><strong>${diff}</strong></td></tr>` : ""}
      ${diff < 0 ? `<tr><td style="padding:4px 10px 4px 0;color:#a86a10"><strong>Over by</strong></td><td style="padding:4px 0;color:#a86a10"><strong>${Math.abs(diff)}</strong></td></tr>` : ""}
    </table>
    ${notes ? `<p style="margin-top:14px">Notes from the floor:</p>
       <blockquote style="border-left:3px solid #a86a10;margin:0;padding:10px 14px;background:#fff8ea;white-space:pre-wrap">${escapeHtml(notes)}</blockquote>` : ""}
    <p>Photo from receiving is attached.</p>
    <p style="color:#7a8c74;font-size:12px;margin-top:24px">— ${escapeHtml(reportedBy || "Receiving")}<br/>Schlegel Greenhouse · Indianapolis</p>
  </div>`;

  let attachments = [];
  if (photoPath) {
    const signed = await signedPhotoUrl(photoPath);
    if (signed) {
      const att = await fetchAttachment(signed);
      if (att) attachments.push(att);
    }
  }

  const cc = [...INTERNAL_CC];
  if (reportedByEmail && !cc.includes(reportedByEmail)) cc.push(reportedByEmail);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [profile.rep_email],
        cc,
        subject, text, html,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(500).json({ error: data?.message || `Resend status ${resp.status}` });
    }
    await patchLine(lineId, {
      claim_sent_at: new Date().toISOString(),
      claim_sent_to: profile.rep_email,
    });
    return res.status(200).json({ ok: true, id: data?.id, sentTo: profile.rep_email });
  } catch (e) {
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
