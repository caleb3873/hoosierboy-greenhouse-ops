// api/extract-catalog.js
const Anthropic = require("@anthropic-ai/sdk").default;
const { requireAuth } = require("./_auth");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── PROMPT BUILDER ───────────────────────────────────────────────────────────
function buildPrompt(breederName, detectedStructure, isFirstBatch) {
  const structureContext = detectedStructure
    ? `\n\nPreviously detected structure from earlier pages:\n${JSON.stringify(detectedStructure)}\nUse this structure to consistently extract data from these pages.`
    : "";

  return `You are extracting production-relevant variety data from a breeder catalog PDF (${breederName || "unknown breeder"}).
${structureContext}

Rules:
- Extract ONLY production/growing data. Ignore marketing copy, award logos, and decorative content.
- One entry per series (e.g. "Cabaret Calibrachoa" = one entry). Do NOT create separate entries for individual colors within a series.
- cropName = the genus or crop type (e.g. "Calibrachoa", "Petunia", "Impatiens")
- variety = the series name only (e.g. "Cabaret", "Wave", "Infinity")
- All temperatures in °F. Ranges are fine (e.g. "71-76").
- tempGroup: "cool" for petunias, calibrachoa, pansies, snapdragons, osteospermum; "warm" for begonias, vinca, impatiens, celosia, coleus. Use your horticultural knowledge.
- Do NOT extract or fabricate growerGrade or customerGrade — these are user-assigned ratings only.
- Use null for any field not mentioned or clearly inferrable from the page.
- If a page contains no variety/cultural data (e.g. table of contents, cover page, index, ads), return an empty items array.
${isFirstBatch ? "- Since this is the first batch, also analyze the document structure (table format, section layout) and return it in detectedStructure." : ""}

Return ONLY valid JSON matching this exact schema (no markdown, no backticks, no explanation):
{
  "items": [
    {
      "cropName": "",
      "variety": "",
      "type": "Annual",
      "propTraySize": "",
      "propCellCount": "",
      "propWeeks": "",
      "finishWeeks": "",
      "finishTempDay": "",
      "finishTempNight": "",
      "tempGroup": "",
      "lightRequirement": "",
      "spacing": "",
      "fertilizerType": "",
      "fertilizerRate": "",
      "pgrType": "",
      "pgrRate": "",
      "pgrTiming": "",
      "pinchingNotes": "",
      "chemSensitivities": "",
      "generalNotes": "",
      "sourcePageNumber": 0
    }
  ],
  "detectedStructure": ${isFirstBatch ? '{ "format": "...", "sections": [...] }' : "null"},
  "confidence": "high|medium|low",
  "pageNotes": ""
}`;
}

// ── REQUEST VALIDATION ───────────────────────────────────────────────────────
function validateRequest(body) {
  if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
    return "Request must include a non-empty pages array";
  }
  if (body.pages.length > 5) {
    return "Maximum 5 pages per batch";
  }
  for (const page of body.pages) {
    if (!page.image || typeof page.image !== "string") {
      return `Page ${page.pageNumber}: missing or invalid image`;
    }
    const approxBytes = page.image.length * 0.75;
    if (approxBytes > 5 * 1024 * 1024) {
      return `Page ${page.pageNumber}: image exceeds 5MB limit`;
    }
  }
  return null;
}

// ── HANDLER ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-App-Token");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check — require valid Supabase session
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  const validationError = validateRequest(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { pages, context = {} } = req.body;
  const { breederName = "", detectedStructure = null } = context;
  const isFirstBatch = !detectedStructure;

  try {
    const content = [];

    for (const page of pages) {
      const mediaTypeMatch = page.image.match(/^data:(image\/\w+);base64,/);
      const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/jpeg";
      const imageData = page.image.replace(/^data:image\/\w+;base64,/, "");

      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageData },
      });
      content.push({
        type: "text",
        text: `[Page ${page.pageNumber}]`,
      });
    }

    content.push({
      type: "text",
      text: buildPrompt(breederName, detectedStructure, isFirstBatch),
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content }],
    });

    const text = response.content?.find((b) => b.type === "text")?.text || "";

    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      return res.status(500).json({
        error: "Failed to parse extraction response",
        raw: text.slice(0, 500),
      });
    }

    if (parsed.items) {
      parsed.items = parsed.items.map((item) => ({
        ...item,
        breeder: breederName || item.breeder || "",
      }));
    }

    return res.status(200).json(parsed);
  } catch (err) {
    if (err.status === 429) {
      return res.status(429).json({ error: "Rate limit exceeded. Please wait and try again." });
    }
    console.error("Extract catalog error:", err);
    return res.status(500).json({ error: err.message || "Extraction failed" });
  }
};
