// api/notify-task.js
// Trigger push notifications for task/delivery events.
// POST { event, title, category, bucket, requester, customer, proposer }

const ORIGIN = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

// Quiet hours: no notifications before 7:00am or after 4:30pm Eastern
function isQuietHours() {
  const now = new Date();
  // Convert to Eastern Time
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/Indiana/Indianapolis" }));
  const hour = et.getHours();
  const min = et.getMinutes();
  const timeNum = hour * 60 + min; // minutes since midnight
  const startMin = 7 * 60;       // 7:00am = 420
  const endMin = 16 * 60 + 30;   // 4:30pm = 990
  return timeNum < startMin || timeNum >= endMin;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { event, title, category, bucket, requester, customer, proposer } = req.body || {};
  if (!event) return res.status(400).json({ error: "event required" });

  // Check quiet hours — skip sending, notifications will fire on next in-hours action
  if (isQuietHours()) {
    return res.status(200).json({ event, skipped: true, reason: "quiet_hours", message: "Notifications paused outside 7:00am–4:30pm ET" });
  }

  let pushPayload = null;

  switch (event) {
    case "task_created":
      pushPayload = {
        title: "New Task",
        body: `${title || "Untitled"}${category ? ` (${category})` : ""}`,
        url: "/",
        tag: "task_created",
        targets: "growers",
      };
      break;

    case "task_approved":
      pushPayload = {
        title: "Task Approved",
        body: `Your task was approved: ${title || "Untitled"}`,
        url: "/",
        tag: "task_approved",
        targets: requester ? [requester] : "growers",
      };
      break;

    case "delivery_proposed":
      pushPayload = {
        title: "New Delivery Proposed",
        body: `New delivery: ${customer || "Unknown"}`,
        url: "/",
        tag: "delivery_proposed",
        targets: "managers",
      };
      break;

    case "delivery_approved":
      pushPayload = {
        title: "Delivery Approved",
        body: `Delivery approved: ${customer || "Unknown"}`,
        url: "/",
        tag: "delivery_approved",
        targets: proposer ? [proposer] : "shipping",
      };
      break;

    default:
      return res.status(400).json({ error: `Unknown event: ${event}` });
  }

  // Call send-push endpoint internally
  try {
    const sendPushUrl = `${ORIGIN}/api/send-push`;
    const resp = await fetch(sendPushUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pushPayload),
    });
    const result = await resp.json();
    return res.status(200).json({ event, ...result });
  } catch (err) {
    return res.status(500).json({ error: "Failed to send push", message: err.message });
  }
};
