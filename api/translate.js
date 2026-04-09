// api/translate.js
// Translate short task strings to Spanish (or another language) via Claude.
// Accepts { texts: string[], target: "es"|"en" } and returns { translations: string[] }.

const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-haiku-4-5-20251001";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { texts, target } = req.body || {};
  if (!Array.isArray(texts) || texts.length === 0) return res.status(400).json({ error: "texts (array) required" });
  if (!target) return res.status(400).json({ error: "target required" });

  // Language mapping
  const langName = { es: "Spanish", en: "English" }[target] || target;

  // Build a simple numbered prompt — Claude returns a JSON array
  const joined = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate the following short greenhouse-operations task strings into ${langName}. Preserve plant names (e.g. Calibrachoa, Petunia) as-is. Keep translations concise and informal but professional. Return ONLY a JSON array of the translated strings in the same order, nothing else.\n\n${joined}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: "claude failed", detail: data });
    const text = data.content?.[0]?.text || "";
    // Extract JSON array from the response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ error: "no array in response", raw: text });
    const translations = JSON.parse(match[0]);
    if (!Array.isArray(translations)) return res.status(502).json({ error: "not an array" });
    return res.status(200).json({ translations });
  } catch (e) {
    return res.status(500).json({ error: "fetch failed", message: e.message });
  }
};
