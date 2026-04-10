// api/shipping-distance.js
// Calls Google Routes API to compute miles + drive time from the greenhouse to a destination.

const KEY = process.env.GOOGLE_MAPS_API_KEY;
const GREENHOUSE = "4425 Bluff Road, Indianapolis, IN 46217";

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

  // Try Routes API first (computeRoutes)
  try {
    const routesUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";
    const routesResp = await fetch(routesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: o },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });

    const routesData = await routesResp.json();

    if (routesData.routes && routesData.routes.length > 0) {
      const route = routesData.routes[0];
      const meters = route.distanceMeters || 0;
      // duration comes as "123s" string
      const durationStr = route.duration || "0s";
      const seconds = parseInt(durationStr.replace("s", ""), 10) || 0;
      const miles = Math.round((meters / 1609.344) * 10) / 10;
      const minutes = Math.round(seconds / 60);
      return res.status(200).json({
        miles,
        minutes,
        distanceText: `${miles} mi`,
        durationText: `${minutes} min`,
      });
    }

    // If Routes API returned an error, include it
    if (routesData.error) {
      return res.status(502).json({
        error: "Routes API failed",
        detail: routesData.error.status,
        message: routesData.error.message,
      });
    }

    return res.status(404).json({ error: "No route found" });
  } catch (e) {
    return res.status(500).json({ error: "fetch failed", message: e.message });
  }
};
