// Every-15-min cron (Vercel, Bearer CRON_SECRET). Two passes:
//  1. runDueCampaigns — dispatch scheduled campaigns whose time has come.
//  2. reservation reminders — at-risk reservation lines (approaching take-by,
//     never notified) auto-email the customer during business hours, one email
//     per customer bundling all their at-risk lines. Closes the last manual gap
//     in the auto-lapse design: reserve → warned → take it or it releases.
const { svc, dispatchCampaign, sendOne, buildReservationReminder } = require("./_campaigns");

function hourInIndy() {
  try { return +new Intl.DateTimeFormat("en-US", { timeZone: "America/Indiana/Indianapolis", hour: "numeric", hour12: false }).format(new Date()); }
  catch { return new Date().getUTCHours() - 4; }
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  const out = { campaigns: [], reminders: [] };
  try {
    const db = svc();

    // 1. due scheduled campaigns
    const { data: due } = await db.from("campaigns").select("id,name").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());
    for (const c of due || []) {
      try { out.campaigns.push({ id: c.id, name: c.name, ...(await dispatchCampaign(c.id)) }); }
      catch (e) { out.campaigns.push({ id: c.id, name: c.name, error: String(e.message || e) }); }
    }

    // 2. at-risk reservation reminders (business hours only; once per line)
    const h = hourInIndy();
    if (h >= 8 && h < 17) {
      const { data: atRisk } = await db.from("v_customer_reservations").select("*").eq("state", "at_risk").is("notified_at", null);
      const byCust = {};
      (atRisk || []).forEach(l => { (byCust[l.customer_id] = byCust[l.customer_id] || []).push(l); });
      for (const [custId, lines] of Object.entries(byCust)) {
        if (!custId || custId === "null") continue;
        const { data: cust } = await db.from("shipping_customers").select("company_name,email").eq("id", custId).single();
        if (!cust || !cust.email) { out.reminders.push({ customer: custId, skipped: "no email" }); continue; }
        try {
          const { subject, html } = buildReservationReminder(cust.company_name, lines.map(l => ({ name: l.display_name, remaining: l.remaining_qty, takeBy: l.take_by })));
          await sendOne({ to: cust.email, subject, html, text: null });
          const now = new Date().toISOString();
          for (const l of lines) await db.from("customer_order_lines").update({ notified_at: now }).eq("id", l.line_id);
          out.reminders.push({ customer: cust.company_name, lines: lines.length });
        } catch (e) { out.reminders.push({ customer: cust.company_name, error: String(e.message || e) }); }
      }
    }
    return res.status(200).json({ ok: true, ...out });
  } catch (e) { return res.status(500).json({ error: e.message || "Failed", ...out }); }
};
