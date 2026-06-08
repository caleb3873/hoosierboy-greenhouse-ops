// api/ask.js
// Grounded "grower brain" Q&A. Claude (Opus 4.8 + adaptive thinking) answers
// culture / PGR / spray / watering / disease / planning questions using tool
// calls against the breeder culture database, our inputs (chemical) inventory,
// and the variety library — never from general knowledge. Server-side key.
//
// POST body: { messages: [{ role: "user"|"assistant", content: "..." }, ...] }
// Returns:   { answer: "..." }

const { createClient } = require("@supabase/supabase-js");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
const MODEL = "claude-opus-4-8";

const CULTURE_URL = process.env.REACT_APP_SUPABASE_CULTURE_URL;
const CULTURE_KEY = process.env.REACT_APP_SUPABASE_CULTURE_ANON_KEY;
const MAIN_URL = process.env.REACT_APP_SUPABASE_URL;
const MAIN_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

const cc = () => (CULTURE_URL && CULTURE_KEY ? createClient(CULTURE_URL, CULTURE_KEY) : null);
const mc = () => (MAIN_URL && MAIN_KEY ? createClient(MAIN_URL, MAIN_KEY) : null);

// Keep only the most useful culture_details fields so we don't blow the token budget.
const CULTURE_KEEP = ["Common Name", "Botanical Name", "Habit", "Exposure", "TEMPERATURE", "Temperature",
  "WATERING", "Watering", "MEDIA PH", "Media pH", "Bloom Months", "Finishing Pinch", "Pinch Notes",
  "PGR Suggestions", "PGR Suggestions (prop)", "Finishing Tips", "Propagation Tips", "Potential Pests",
  "Insecticide Warning", "Finishing Pesticide Warning", "Production Notes - Chemicals", "Culture Guide PDF"];
function trimCulture(cd) {
  const out = {};
  for (const k of Object.keys(cd || {})) {
    if (CULTURE_KEEP.includes(k) || /pgr|finishing|propagation|pinch|warning|pest/i.test(k)) out[k] = cd[k];
  }
  return out;
}

const TOOLS = [
  {
    name: "search_culture_guides",
    description: "Search the breeder culture database (~3,200 Ball/Selecta/Danziger/Darwin/Dümmen guides) for varieties. Use for any PGR, spray, watering, temperature, pinching, pest, or general culture question. Returns matching guides with their key culture fields. Pass a crop and/or breeder and/or free-text search.",
    input_schema: {
      type: "object",
      properties: {
        crop: { type: "string", description: "Crop name, e.g. Echinacea, Petunia, Angelonia" },
        breeder: { type: "string", description: "One of: Ball, Selecta One, Danziger, Darwin Perennials, Dümmen Orange" },
        search: { type: "string", description: "Free-text across crop/series/variety, e.g. a series name" },
      },
    },
  },
  {
    name: "get_culture_guide",
    description: "Fetch the FULL culture detail for one guide by its id (from search_culture_guides results) when you need every field.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "search_inputs",
    description: "Search OUR chemical/PGR/fertilizer inventory (the inputs we actually stock and use), by product name, active ingredient, or category. Use to tell the grower whether a product a guide recommends is something we have/use (e.g. 'do we use Florel?'), and to surface its rate, REI, supplier, and crop sensitivities.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "product name, active ingredient, or category (insecticide/fungicide/pgr/fertilizer)" } }, required: ["query"] },
  },
  {
    name: "search_varieties",
    description: "Search OUR curated variety library (the varieties we grow/consider), by crop, variety, or breeder. Returns type, default pot, and any recorded chemical sensitivities/notes.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
];

async function runTool(name, input) {
  try {
    if (name === "search_culture_guides") {
      const c = cc();
      if (!c) return "Culture database not configured.";
      let q = c.from("culture_guides_public")
        .select("id,breeder_name,crop_name,series_name,series_variety,category,culture_details,propagation_weeks,requires_heat")
        .limit(8);
      if (input.crop) q = q.ilike("crop_name", `%${input.crop}%`);
      if (input.breeder) q = q.eq("breeder_name", input.breeder);
      if (input.search) q = q.or(`crop_name.ilike.%${input.search}%,series_name.ilike.%${input.search}%,series_variety.ilike.%${input.search}%`);
      const { data, error } = await q;
      if (error) return `Search error: ${error.message}`;
      if (!data || !data.length) return "No matching culture guides found.";
      return JSON.stringify(data.map(r => ({
        id: r.id, breeder: r.breeder_name, crop: r.crop_name,
        variety: [r.series_name, r.series_variety].filter(Boolean).join(" "),
        category: r.category, propagation_weeks: r.propagation_weeks, requires_heat: r.requires_heat,
        culture: trimCulture(r.culture_details),
      })));
    }
    if (name === "get_culture_guide") {
      const c = cc();
      if (!c) return "Culture database not configured.";
      const { data, error } = await c.from("culture_guides_public").select("*").eq("id", input.id).single();
      if (error) return `Error: ${error.message}`;
      return JSON.stringify(data);
    }
    if (name === "search_inputs") {
      const m = mc();
      if (!m) return "Inputs database not configured.";
      const term = String(input.query || "").trim();
      const { data, error } = await m.from("inputs")
        .select("name,category,active_ingredient,app_rate,app_rate_unit,rei,supplier,cost_per_unit,crop_sensitivities,cross_benefits,tank_mix_notes,notes")
        .or(`name.ilike.%${term}%,active_ingredient.ilike.%${term}%,category.ilike.%${term}%`).limit(15);
      if (error) return `Error: ${error.message}`;
      if (!data || !data.length) return `No inputs found matching "${term}" — we may not stock/use that product.`;
      return JSON.stringify(data);
    }
    if (name === "search_varieties") {
      const m = mc();
      if (!m) return "Variety library not configured.";
      const term = String(input.query || "").trim();
      const { data, error } = await m.from("variety_library")
        .select("crop_name,variety,breeder,type,temp_group,finish_weeks,chem_sensitivities,general_notes,culture_guide_url")
        .or(`crop_name.ilike.%${term}%,variety.ilike.%${term}%,breeder.ilike.%${term}%`).limit(20);
      if (error) return `Error: ${error.message}`;
      if (!data || !data.length) return `No varieties in our library matching "${term}".`;
      return JSON.stringify(data);
    }
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool failed: ${e.message}`;
  }
}

const SYSTEM = `You are the Schlegel Greenhouse growing assistant — a decision-making aid for growers and planners.

Answer questions about plant culture, PGRs, spraying, watering, temperature, pinching, disease/pests, and planning, grounded ONLY in what your tools return: the breeder culture database, our inputs (chemical) inventory, and our variety library.

Rules:
- ALWAYS look it up with the tools before answering a culture/PGR/spray/watering/disease question. Do not answer those from general knowledge. If the tools return nothing relevant, say plainly that it's not in the guides — do not guess.
- Cite your source: name the breeder · crop · series the info came from.
- For PGR/spray rates, quote the guide's wording (product + rate). NEVER invent, round, or extrapolate a rate beyond what the guide says.
- For spray/PGR questions, also call search_inputs to tell the grower whether a recommended product is one we actually stock/use — and flag products the guide suggests that we don't carry or haven't used ("the guide suggests X — that's not in our inputs list"). Surface REI and crop sensitivities when present.
- Be concise and practical — you're talking to growers on the floor. Short, direct answers; bullet points where helpful.
- Anything with real-world chemical/safety consequences: stay strictly within the guide text, and call out REI and sensitivity warnings.`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const body = req.body || {};
  const incoming = Array.isArray(body.messages) ? body.messages : null;
  if (!incoming || !incoming.length) return res.status(400).json({ error: "messages (array) required" });

  // Sanitize history to plain user/assistant text turns.
  let convo = incoming
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }))
    .slice(-12);
  if (!convo.length || convo[0].role !== "user") return res.status(400).json({ error: "conversation must start with a user message" });

  const system = [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }];

  try {
    for (let i = 0; i < 6; i++) {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4000,
          thinking: { type: "adaptive" },
          system,
          tools: TOOLS,
          messages: convo,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return res.status(502).json({ error: "claude failed", detail: data });

      if (data.stop_reason === "tool_use") {
        convo.push({ role: "assistant", content: data.content }); // preserve thinking + tool_use blocks
        const results = [];
        for (const block of data.content || []) {
          if (block.type === "tool_use") {
            const out = await runTool(block.name, block.input || {});
            results.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
        }
        convo.push({ role: "user", content: results });
        continue;
      }

      const answer = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
      return res.status(200).json({ answer: answer || "(no answer)" });
    }
    return res.status(200).json({ answer: "I wasn't able to finish looking that up — try narrowing the question." });
  } catch (e) {
    return res.status(500).json({ error: "request failed", message: e.message });
  }
};
