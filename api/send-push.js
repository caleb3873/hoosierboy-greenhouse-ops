// api/send-push.js
// Send web push notifications to subscribed users.
// POST { title, body, url, tag, targets }
// targets: "all" | "managers" | "growers" | "shipping" | ["worker_name", ...]

const webpush = require("web-push");
const { createClient } = require("@supabase/supabase-js");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:caleb@schlegelgreenhouse.com";
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "VAPID keys not configured" });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const { title, body, url, tag, targets } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body required" });

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Build query for subscriptions
  let query = sb.from("push_subscriptions").select("*");
  if (targets && targets !== "all") {
    if (Array.isArray(targets)) {
      // Target specific worker names
      query = query.in("worker_name", targets);
    } else if (targets === "managers") {
      query = query.eq("role", "manager");
    } else if (targets === "growers") {
      query = query.eq("role", "grower");
    } else if (targets === "shipping") {
      query = query.eq("role", "shipping");
    }
  }

  const { data: subs, error: fetchErr } = await query;
  if (fetchErr) return res.status(500).json({ error: "Failed to fetch subscriptions", detail: fetchErr.message });
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0, failed: 0, message: "No subscriptions found" });

  const payload = JSON.stringify({ title, body, url: url || "/", tag: tag || "default" });

  let sent = 0;
  let failed = 0;
  const staleEndpoints = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        // Remove expired/invalid subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up stale subscriptions
  if (staleEndpoints.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return res.status(200).json({ sent, failed, cleaned: staleEndpoints.length });
};
