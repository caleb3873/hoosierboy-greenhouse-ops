// Transcribe photos of presentation slides (trade-show sessions) into readable markdown notes.
const Anthropic = require("@anthropic-ai/sdk").default;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const OK_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function toBlock(u) {
  try {
    if (typeof u !== "string") return null;
    if (u.startsWith("data:")) {
      const m = u.match(/^data:(image\/\w+);base64,(.*)$/);
      if (!m) return null;
      const mt = OK_TYPES.includes(m[1]) ? m[1] : "image/jpeg";
      if (m[2].length * 0.75 > 4.8 * 1024 * 1024) return null;
      return { type: "image", source: { type: "base64", media_type: mt, data: m[2] } };
    }
    const r = await fetch(u);
    if (!r.ok) return null;
    let ct = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!OK_TYPES.includes(ct)) ct = "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4.8 * 1024 * 1024) return null;
    return { type: "image", source: { type: "base64", media_type: ct, data: buf.toString("base64") } };
  } catch { return null; }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "AI is not configured (missing ANTHROPIC_API_KEY)" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const images = Array.isArray(body.images) ? body.images.slice(0, 60) : [];
    const title = (body.title || "").toString().slice(0, 200);
    if (!images.length) return res.status(400).json({ error: "No images provided" });

    const BATCH = 8;
    const parts = [];
    let n = 1, used = 0;
    for (let i = 0; i < images.length; i += BATCH) {
      const blocks = (await Promise.all(images.slice(i, i + BATCH).map(toBlock))).filter(Boolean);
      if (!blocks.length) continue;
      const prompt = `These are photos of presentation slides from a horticulture trade-show session${title ? ` titled "${title}"` : ""}, in order. Transcribe the TEXT of each slide faithfully and completely — the slide title, every bullet, all numbers/rates/weeks/prices, and any table data. Use markdown: a "## Slide ${n}"-style heading per slide (numbering the slides in order starting at ${n}), with bullets for bullet points. Do NOT summarize, interpret, or add anything not on the slide. If an image is a plant/booth photo with no meaningful text, output just its heading and "_(photo — no text)_".`;
      const resp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...blocks] }],
      });
      const text = (resp.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
      if (text) parts.push(text);
      n += blocks.length; used += blocks.length;
    }
    if (!used) return res.status(400).json({ error: "Couldn't read any of the images" });
    return res.status(200).json({ transcript: parts.join("\n\n"), slides: used });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Transcription failed" });
  }
};
