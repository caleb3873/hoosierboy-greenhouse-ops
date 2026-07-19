// Send a campaign NOW (staff-authenticated). Double-send-safe (status claim in _campaigns).
const { requireAuth } = require("./_auth");
const { dispatchCampaign } = require("./_campaigns");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    if (!body.campaignId) return res.status(400).json({ error: "campaignId required" });
    const result = await dispatchCampaign(body.campaignId);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) { return res.status(e.message && e.message.includes("already") ? 409 : 500).json({ error: e.message || "Failed" }); }
};
