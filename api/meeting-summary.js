// api/meeting-summary.js
// Turn a raw meeting transcript (e.g. a Teams transcript) or rough notes into
// clean, retained meeting notes. Claude (Sonnet 4.5), no tools. Server-side key.
//
// POST body: { transcript: string, agenda?: string, title?: string }
// Returns:   { summary: string }  (markdown)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-5";

const SYSTEM = `You turn a raw meeting transcript or rough notes into clean, well-organized meeting notes that capture everything useful. Use ONLY what is in the transcript/notes — never invent facts, numbers, names, or commitments. If something wasn't covered, leave it out (or list it under open questions if it was an agenda item that went unanswered).

Output GitHub-flavored markdown with these sections (omit a section only if there is genuinely nothing for it):

## Summary
3–6 sentences capturing what the meeting was about and the upshot.

## Key facts & numbers
Bullet the concrete details worth keeping — specs, quantities, capacities, requirements, names of products/equipment, timelines.

## Costs & pricing
Any dollar figures, rates, capex, per-unit costs, or pricing mentioned (with what they refer to).

## Decisions
What was decided or agreed.

## Action items
Checklist format: \`- [ ] task — owner — due\`. Infer the owner only if a person is clearly assigned; otherwise leave owner blank.

## Open questions / follow-ups
What's still unanswered or needs follow-up. If an agenda was provided, note which agenda questions were NOT answered.

## Next steps
What happens next, what the other party will send, scheduled follow-ups.

Be concise and skimmable. Preserve exact figures and product names verbatim.`;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { transcript, agenda, title } = req.body || {};
  if (!transcript || !String(transcript).trim()) return res.status(400).json({ error: "transcript (or notes) required" });

  const prompt = [
    title ? `Meeting: ${title}` : null,
    agenda && agenda.trim() ? `Agenda / prepared questions for this meeting:\n${agenda}\n` : null,
    `Transcript / raw notes:\n${transcript}`,
  ].filter(Boolean).join("\n\n");

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) return res.status(502).json({ error: "Claude API error: " + (data && data.error && data.error.message ? data.error.message : `HTTP ${resp.status}`) });
    const summary = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    return res.status(200).json({ summary: summary || "(no summary)" });
  } catch (e) {
    return res.status(500).json({ error: "request failed", message: e.message });
  }
};
