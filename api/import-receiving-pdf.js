// api/import-receiving-pdf.js
// Read an order-confirmation PDF (from the order-confirmations bucket) with
// Claude Vision, then reconcile fall_program_items for that order_number:
//   - varieties on PDF: update ord_qty so per-variety sum matches the PDF
//   - varieties in DB but NOT on PDF: status='CANCELLED'
//   - varieties on PDF but NOT in DB: insert a new single-bench row (so the
//     row exists; manager can split benches later if needed)
//
// POST body:
//   { orderNumber: "4704650", storagePath?: "4704650.pdf" }
//   - storagePath optional; defaults to "<orderNumber>.pdf" inside the
//     order-confirmations bucket.
//
// Response:
//   { ok, orderNumber, shipWeek, lines: [{ variety, dbBefore, pdfTotal, action }] }
//
// Authentication: any manager-tier session can trigger this; the heavy
// lifting uses the service role key on the server.

const Anthropic = require("@anthropic-ai/sdk").default;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

const EXTRACT_PROMPT = `You are reading a wholesale plant order acknowledgment PDF (typically from Ball Seed, EHR, or similar broker).

Extract:
- orderNumber: the broker's order number (look for "Order No", "ORDER NO", "Order #")
- shipWeek: the calendar week number the plants ship. If the PDF shows a date like "05/25/26" or "Ship Date 05/25/26", convert to ISO 8601 week number (e.g. May 25, 2026 → 22). Return as integer.
- shipDate: the literal ship date as YYYY-MM-DD if present
- supplier: the grower/supplier name (e.g. "RAKER-ROBERTA'S MUMS & ASTER", "DGI", "DS Cole")
- broker: the broker name (Ball, EHR, Express Seed, etc.) — usually visible in letterhead
- lines: an array of {variety, ordered, confirmed} for each line item
    - variety: the cultivar name as written, UPPERCASE, with any genus prefix stripped if it would duplicate (e.g. "CHRYSANTHEMUM 'JACQUELINE COPPER'" → "JACQUELINE COPPER", "PETUNIA Easy Wave Burgundy Velour" → "EASY WAVE BURGUNDY VELOUR")
    - ordered: integer plants in the "Order" column
    - confirmed: integer plants in the "Confirm" column (often equals ordered)

Skip lines that are not actual plant orders (descriptions, totals, discount footers).

Return ONLY a JSON object with this exact schema (no markdown, no backticks):
{
  "orderNumber": "",
  "shipWeek": null,
  "shipDate": null,
  "supplier": "",
  "broker": "",
  "lines": [{ "variety": "", "ordered": 0, "confirmed": 0 }]
}`;

async function sb(method, path, body) {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(`Supabase ${path} ${r.status}: ${text}`);
  return json;
}

async function fetchPdfBase64(path) {
  // Server-side signed URL to fetch the binary
  const sign = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/order-confirmations/${encodeURI(path)}`, {
    method: "POST",
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!sign.ok) throw new Error(`Sign URL failed: ${sign.status} ${await sign.text()}`);
  const { signedURL } = await sign.json();
  const r = await fetch(`${SUPABASE_URL}/storage/v1${signedURL}`);
  if (!r.ok) throw new Error(`PDF fetch failed: ${r.status}`);
  const buf = await r.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}

async function extractFromPdf(b64) {
  // Claude Sonnet 4 can read PDFs natively via document content block.
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      },
    ],
  });
  const text = resp.content.find(c => c.type === "text")?.text || "";
  // Try to find a JSON block in the response
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("No JSON in Claude response: " + text.slice(0, 200));
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

// Normalize a variety string to match DB rows: uppercase, trim, drop extra spaces
function norm(v) {
  return String(v || "").toUpperCase().replace(/\s+/g, " ").trim();
}

// Distribute total across N rows, putting the remainder on the last row
function splitEven(total, n) {
  const each = Math.floor(total / n);
  const remainder = total - each * (n - 1);
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? each : remainder));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: "Supabase service credentials not configured" });

  const { orderNumber, storagePath, dryRun } = req.body || {};
  if (!orderNumber) return res.status(400).json({ error: "orderNumber required" });
  const path = storagePath || `${orderNumber}.pdf`;

  try {
    // 1. Pull the PDF as base64 and run extraction
    const b64 = await fetchPdfBase64(path);
    const extracted = await extractFromPdf(b64);
    if (!extracted?.lines?.length) {
      return res.status(400).json({ error: "Claude returned no line items from PDF", extracted });
    }

    // 2. Group PDF lines by variety (in case PDF has multiple rows per variety)
    const pdfByVariety = new Map();
    for (const ln of extracted.lines) {
      const v = norm(ln.variety);
      if (!v) continue;
      const ordered = Math.max(parseInt(ln.ordered) || 0, parseInt(ln.confirmed) || 0);
      pdfByVariety.set(v, (pdfByVariety.get(v) || 0) + ordered);
    }

    // 3. Load DB rows for this order
    const dbRows = await sb("GET", `/rest/v1/fall_program_items?order_number=eq.${encodeURIComponent(orderNumber)}&select=*`);
    const dbByVariety = new Map();
    for (const r of dbRows) {
      const v = norm(r.variety);
      if (!dbByVariety.has(v)) dbByVariety.set(v, []);
      dbByVariety.get(v).push(r);
    }

    // 4. Compute changes
    const changes = [];
    const updates = [];   // { id, ord_qty }
    const cancellations = []; // ids to mark CANCELLED
    const inserts = [];   // new rows for varieties not yet in DB

    for (const [v, total] of pdfByVariety) {
      const rows = dbByVariety.get(v);
      if (rows && rows.length) {
        const dbBefore = rows.reduce((s, r) => s + (parseInt(r.ord_qty) || 0), 0);
        const splits = splitEven(total, rows.length);
        rows.forEach((r, idx) => updates.push({ id: r.id, ord_qty: splits[idx] }));
        changes.push({ variety: v, action: dbBefore === total ? "unchanged" : "updated", dbBefore, pdfTotal: total });
      } else {
        // New variety not in DB — insert a minimal placeholder row using
        // hints from existing same-order rows
        const sibling = dbRows[0] || {};
        inserts.push({
          order_number: orderNumber,
          variety: v,
          broker: sibling.broker || extracted.broker || null,
          category: sibling.category || null,
          ship_week: sibling.ship_week || (extracted.shipWeek ? `WEEK ${extracted.shipWeek}` : null),
          plant_week: sibling.plant_week || null,
          ord_qty: total,
          qty: total,        // assume need = arriving until manager edits
          ppp: 1,
          status: null,
          confirmation_pdf_path: path,
        });
        changes.push({ variety: v, action: "inserted", dbBefore: 0, pdfTotal: total });
      }
    }
    for (const [v, rows] of dbByVariety) {
      if (!pdfByVariety.has(v)) {
        rows.forEach(r => cancellations.push(r.id));
        const dbBefore = rows.reduce((s, r) => s + (parseInt(r.ord_qty) || 0), 0);
        changes.push({ variety: v, action: "cancelled", dbBefore, pdfTotal: 0 });
      }
    }

    if (dryRun) {
      return res.status(200).json({ ok: true, orderNumber, dryRun: true, extracted, changes });
    }

    // 5. Apply changes
    for (const u of updates) {
      await sb("PATCH", `/rest/v1/fall_program_items?id=eq.${u.id}`, { ord_qty: u.ord_qty });
    }
    for (const id of cancellations) {
      await sb("PATCH", `/rest/v1/fall_program_items?id=eq.${id}`, { status: "CANCELLED" });
    }
    if (inserts.length) {
      await sb("POST", `/rest/v1/fall_program_items`, inserts);
    }

    return res.status(200).json({
      ok: true,
      orderNumber,
      shipWeek: extracted.shipWeek,
      shipDate: extracted.shipDate,
      supplier: extracted.supplier,
      broker: extracted.broker,
      summary: {
        updated: updates.length,
        cancelled: cancellations.length,
        inserted: inserts.length,
      },
      changes,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
