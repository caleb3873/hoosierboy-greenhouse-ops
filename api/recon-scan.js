// api/recon-scan.js — Loop B (promoted): scan order-confirmations bucket, propose reconciliations.
// ---------------------------------------------------------------------------
// For each NEW acknowledgement PDF (uploaded recently, not already proposed), it
// calls the existing tested extractor (api/import-receiving-pdf) in DRY-RUN to
// compute the proposed ord_qty changes, summarizes the risk, and saves a
// `recon_proposals` row with a one-time approve token. It WRITES NOTHING to the
// plan — the morning email surfaces these with an approve link, and only the
// human-clicked confirm page (api/recon-apply) applies them.
//
// INERT until ANTHROPIC_API_KEY is configured in Vercel (then it costs ~cents per
// new PDF). Bucket files are `<orderNumber>.pdf` at the root.
//
//   /api/recon-scan         → scan recent PDFs, return proposals (called by the morning cron)
//   /api/recon-scan?all=1   → scan every PDF in the bucket (manual; ignores recency)
// ---------------------------------------------------------------------------
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "order-confirmations";
const RECENT_DAYS = 4; // only auto-propose PDFs uploaded within this window (avoids re-processing history)

const deriveOrderNumber = name => { const m = String(name).match(/\d{6,}/g); return m ? m.sort((a, b) => b.length - a.length)[0] : null; };

function summarizeRisk(changes) {
  const c = { updated: 0, cancelled: 0, inserted: 0, unchanged: 0 };
  for (const ch of changes || []) {
    const a = String(ch.action || "");
    if (a.startsWith("cancel")) c.cancelled++;
    else if (a.startsWith("insert")) c.inserted++;
    else if (a === "unchanged") c.unchanged++;
    else c.updated++;
  }
  const total = (changes || []).length || 1;
  const flags = [];
  if (!changes || !changes.length) flags.push("no changes computed — check the PDF");
  if (c.cancelled / total > 0.5) flags.push(`${c.cancelled} of ${total} varieties would be CANCELLED — confirm the PDF is for this order`);
  return { counts: c, flags };
}

// Extract one PDF in dry-run and save a 'proposed' row → { proposal } or { skip }.
async function proposeOne(sb, base, orderNumber, storagePath) {
  try {
    const resp = await fetch(`${base}/api/import-receiving-pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber, storagePath, dryRun: true }),
    });
    const dry = await resp.json().catch(() => ({}));
    if (!resp.ok) return { skip: { storagePath, orderNumber, reason: dry.error || `extract ${resp.status}` } };
    const risk = summarizeRisk(dry.changes);
    const token = crypto.randomUUID();
    const { data: ins, error: insErr } = await sb.from("recon_proposals").insert({
      order_number: orderNumber, storage_path: storagePath, status: "proposed",
      extracted: dry.extracted || null, changes: dry.changes || [], risk, approve_token: token,
    }).select("id").single();
    if (insErr) return { skip: { storagePath, orderNumber, reason: "save: " + insErr.message } };
    return { proposal: { id: ins.id, orderNumber, storagePath, changes: dry.changes || [], risk, token } };
  } catch (e) { return { skip: { storagePath, orderNumber, reason: String(e.message || e) } }; }
}

// Returns { disabled? , proposals:[{id,orderNumber,storagePath,changes,risk,token}], skipped:[], scanned }
// opts.order → target a single order (bypasses recency; reuses an existing pending proposal). For testing/manual.
async function runReconScan({ base, all = false, order = null }) {
  if (!process.env.ANTHROPIC_API_KEY) return { disabled: true, reason: "ANTHROPIC_API_KEY not configured", proposals: [], skipped: [], scanned: 0 };
  if (!SERVICE_KEY || !SUPABASE_URL) return { disabled: true, reason: "Supabase service creds not configured", proposals: [], skipped: [], scanned: 0 };
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  if (order) { // targeted single-order mode
    const storagePath = `${order}.pdf`;
    const { data: ex } = await sb.from("recon_proposals").select("*").eq("storage_path", storagePath).in("status", ["proposed", "applied"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (ex && ex.status === "applied") return { proposals: [], skipped: [{ storagePath, reason: "already applied " + ex.applied_at }], scanned: 1, reused: true };
    if (ex) return { proposals: [{ id: ex.id, orderNumber: ex.order_number, storagePath, changes: ex.changes, risk: ex.risk, token: ex.approve_token }], skipped: [], scanned: 1, reused: true };
    const r = await proposeOne(sb, base, String(order), storagePath);
    return { proposals: r.proposal ? [r.proposal] : [], skipped: r.skip ? [r.skip] : [], scanned: 1 };
  }

  const { data: files, error } = await sb.storage.from(BUCKET).list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error) return { error: "list bucket: " + error.message, proposals: [], skipped: [], scanned: 0 };
  const cutoff = Date.now() - RECENT_DAYS * 86400000;
  const pdfs = (files || []).filter(f => /\.pdf$/i.test(f.name) && (all || !f.created_at || new Date(f.created_at).getTime() >= cutoff));

  const { data: existing } = await sb.from("recon_proposals").select("storage_path,status");
  const seen = new Set((existing || []).filter(r => r.status !== "error").map(r => r.storage_path));

  const proposals = [], skipped = [];
  for (const f of pdfs) {
    if (seen.has(f.name)) continue;
    const orderNumber = deriveOrderNumber(f.name);
    if (!orderNumber) { skipped.push({ storagePath: f.name, reason: "no order number in filename" }); continue; }
    const r = await proposeOne(sb, base, orderNumber, f.name);
    if (r.proposal) proposals.push(r.proposal); else skipped.push(r.skip);
  }
  return { proposals, skipped, scanned: pdfs.length };
}

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) { if ((req.headers.authorization || "") !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "unauthorized" }); }
  try {
    const q = req.query || {};
    const r = await runReconScan({ base: `https://${req.headers.host}`, all: q.all === "1", order: q.order || null });
    return res.status(200).json(r);
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
module.exports.runReconScan = runReconScan;
