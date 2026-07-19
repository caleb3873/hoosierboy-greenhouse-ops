// runDueCampaigns — Vercel cron (every 15 min). Vercel sends Authorization: Bearer CRON_SECRET.
const { svc, dispatchCampaign } = require("./_campaigns");

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const db = svc();
    const { data: due } = await db.from("campaigns").select("id,name").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());
    const results = [];
    for (const c of due || []) {
      try { results.push({ id: c.id, name: c.name, ...(await dispatchCampaign(c.id)) }); }
      catch (e) { results.push({ id: c.id, name: c.name, error: String(e.message || e) }); }
    }
    return res.status(200).json({ ok: true, due: (due || []).length, results });
  } catch (e) { return res.status(500).json({ error: e.message || "Failed" }); }
};
