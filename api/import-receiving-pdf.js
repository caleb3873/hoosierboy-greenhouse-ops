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
- shipWeek: the ISO calendar week number the plants ship. Look for "Shipping Week Of" / "Requested Ship Wk" / explicit "Wk Year" fields. If only a ship date is given, compute the ISO week number from that date. Return as integer.
- shipDate: the literal ship date as YYYY-MM-DD if present
- supplier: the grower/supplier name (e.g. "RAKER-ROBERTA'S MUMS & ASTER", "DGI", "DS Cole")
- broker: the broker name (Ball, EHR, Express Seed, etc.) — usually visible in letterhead
- lines: an array of {variety, ordered, confirmed} for each plant line item
    - variety: the FULL variety name AS WRITTEN on the PDF, including any genus prefix (e.g. "CHRYSANTHEMUM JACQUELINE COPPER", "MARIGOLD FIREBALL", "CELOSIA KIMONO ORANGE", "FLOWER KALE NAGOYA WHITE"). Do NOT strip the genus prefix.
    - If the PDF uses Ball internal abbreviations like "MarAF" or "MarFR", expand them: MarAF → MARIGOLD, MarFR → MARIGOLD, FO → FORGET ME NOT.
    - UPPERCASE the whole string.
    - ordered: integer plants. Pay attention to UoM. A row "2 EA … 1K" means 2 × 1,000 = 2,000 plants. A row "960 / 160 PLUG" means 960 plugs (already in plug count). Use the Order column, not the line-item quantity if those differ.
    - confirmed: integer plants in the Confirm column (often equals ordered).

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

// Normalize variety to match DB rows. Mirrors the rules in src/BrokerReports.jsx
// so PDF shorthand (Ball/EHR) maps onto the canonical DB names. Update here
// AND in BrokerReports.jsx if you add new mappings.
function norm(v) {
  let s = String(v || "").toUpperCase().trim();
  s = s.replace(/[#®™]/g, "").replace(/[''']/g, "");
  // Ball internal genus codes — expand before any genus-prefix rule fires
  s = s.replace(/^MARAF\s+/, "MARIGOLD ").replace(/^MARFR\s+/, "MARIGOLD ");
  // Genus prefixes — strip the ones the DB doesn't store
  s = s.replace(/^MUMGDN\s+/, "").replace(/^MUM\s+(?:YODER\s+)?/, "");
  s = s.replace(/^ASTER\s+ROYALTY\s+/, "ASTER ").replace(/^ASTER\s+/, "ASTER ");
  s = s.replace(/^CHRYSANTHEMUM\s+/, "");
  s = s.replace(/^LYSIMACHIA\s+(?:NUM\.?\s+)?/, "LYSIMACHIA ");
  s = s.replace(/^PETCHOA\s+/, "").replace(/^CALIBRACHOA\s+/, "");
  s = s.replace(/^FO\s+/, "").replace(/^AGERATUM\s+/, "AGERATUM ").replace(/^VIOLA\s+/, "VIOLA ");
  s = s.replace(/\bSUPCALPRM\b/g, "SUPERCAL PREMIUM").replace(/\bSUPCAL\b/g, "SUPERCAL");
  // Ball merged-word color abbreviations
  s = s.replace(/\bYELSUNIPD\b/g, "YELLOW SUN IPD");
  s = s.replace(/\bSUNRAYPK\b/g, "SUNRAY PINK").replace(/\bPINKMIST\b/g, "PINK MIST");
  s = s.replace(/\bORNGSUNSET\b/g, "ORANGE SUNSET").replace(/\bROSESTAR\b/g, "ROSE STAR");
  s = s.replace(/\bPEARLWHITE\b/g, "PEARL WHITE");
  s = s.replace(/\bFRNCH\b/g, "FRENCH").replace(/\bVANLA\b/g, "VANILLA");
  s = s.replace(/\bYEL\b/g, "YELLOW").replace(/\bPK\b/g, "PINK").replace(/\bORNG\b/g, "ORANGE");
  s = s.replace(/\bWHT\b/g, "WHITE").replace(/\bBLU\b/g, "BLUE").replace(/\bPRP\b/g, "PURPLE");
  s = s.replace(/\bBLCH\b/g, "BLOTCH").replace(/\bGLDN\b/g, "GOLDEN");
  s = s.replace(/\bDP\b/g, "").replace(/\bCT\b/g, "").replace(/\bDT\b/g, "");
  // Ball renamed Inca → Inca II at some point; treat as same series for matching
  s = s.replace(/\bINCA\s+II\b/g, "INCA");
  // Word-order variants for known Zinnia mixes
  s = s.replace(/\bELEGANT\s+MIX\s+HOT\b/g, "ELEGANT HOT MIX");
  // Collapse "LYSIMACHIA GOLDILOCKS CREEPING JENNY" (DB) and "LYSIMACHIA GOLDILOCKS" (PDF) to the same key
  s = s.replace(/^LYSIMACHIA\s+GOLDILOCKS(\s+CREEPING\s+JENNY)?$/, "LYSIMACHIA GOLDILOCKS");
  s = s.replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  return s;
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
        // New variety from the PDF that isn't in the DB plan — insert it as
        // UNCLAIMED so it still shows up in receiving (supplier is shipping
        // these whether or not we've planned for them), with need=0 since
        // there's no bench layout yet. Manager can later attach it to a
        // category / bench / ppp and clear the UNCLAIMED status.
        const sibling = dbRows[0] || {};
        inserts.push({
          order_number: orderNumber,
          variety: v,
          broker: sibling.broker || extracted.broker || null,
          category: sibling.category || null,
          ship_week: sibling.ship_week || (extracted.shipWeek ? `WEEK ${extracted.shipWeek}` : null),
          plant_week: sibling.plant_week || null,
          ord_qty: total,
          qty: 0,            // no production plan yet
          ppp: 1,
          status: "UNCLAIMED",
          confirmation_pdf_path: path,
        });
        changes.push({ variety: v, action: "inserted (unclaimed)", dbBefore: 0, pdfTotal: total });
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
