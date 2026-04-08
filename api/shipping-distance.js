// api/shipping-distance.js
// Calls Google Distance Matrix API to compute miles + drive time between two addresses.
// Used by the shipping module to populate delivery route metrics.

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const GREENHOUSE = "4425 Bluff Road, Indianapolis, IN 46151";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!KEY) return res.status(500).json({ error: "GOOGLE_MAPS_API_KEY not configured" });

  const { origin, destination } = req.body || {};
  if (!destination) return res.status(400).json({ error: "destination required" });

  const o = origin || GREENHOUSE;
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", o);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("units", "imperial");
  url.searchParams.set("key", KEY);

  try {
    const r = await fetch(url.toString());
    const data = await r.json();
    if (data.status !== "OK") {
      return res.status(502).json({ error: "distance matrix failed", detail: data.status, message: data.error_message });
    }
    const row = data.rows?.[0]?.elements?.[0];
    if (!row || row.status !== "OK") {
      return res.status(404).json({ error: "route not found", detail: row?.status });
    }
    const meters  = row.distance.value;
    const seconds = row.duration.value;
    return res.status(200).json({
      miles: Math.round((meters / 1609.344) * 10) / 10,
      minutes: Math.round(seconds / 60),
      distanceText: row.distance.text,
      durationText: row.duration.text,
    });
  } catch (e) {
    return res.status(500).json({ error: "fetch failed", message: e.message });
  }
};
