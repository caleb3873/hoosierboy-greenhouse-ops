// api/photo-index.js — rebuild the marketing photo index.
//
// POST → scans the marketing photo sources and upserts photo_library rows.
// Idempotent: keyed on (source, external_id), so it can run on a cron or from
// the library's Refresh button as often as you like.
//
// MARKETING SOURCES ONLY. Operational and compliance imagery — pick sheets,
// signed customer invoices, receiving claims, inventory counts, hiring resumes,
// task photos — is deliberately not indexed. Several of those live in private
// buckets and none of them belong in a browsable marketing library.
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

async function pageAll(db, table, cols) {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const clean = s => (s == null || s === "" ? null : String(s));
// Skip base64 data-URLs: they're the offline fallback, not a durable asset.
const usableUrl = u => typeof u === "string" && /^https?:\/\//i.test(u);

async function buildRows(db) {
  const rows = [];

  // 1. Trade show — the richest metadata we have (vendor, variety, interest, notes)
  const events = await pageAll(db, "trade_show_events", "id,name,starts_on");
  const eventName = Object.fromEntries(events.map(e => [e.id, e.name]));
  for (const p of await pageAll(db, "trade_show_photos",
      "id,event_id,uploader_name,vendor_name,variety_name,notes,interest_level,storage_path,image_url,created_at")) {
    if (!usableUrl(p.image_url)) continue;
    rows.push({
      source: "tradeshow", external_id: String(p.id),
      source_id: p.event_id ? String(p.event_id) : null,
      source_label: eventName[p.event_id] || "Trade show",
      url: p.image_url, thumb_url: null,
      bucket: "tradeshow-photos", storage_path: clean(p.storage_path),
      caption: clean(p.notes), variety: clean(p.variety_name), vendor: clean(p.vendor_name),
      tags: [p.interest_level ? `interest:${p.interest_level}` : null].filter(Boolean),
      taken_at: p.created_at || null, uploaded_by: clean(p.uploader_name),
    });
  }

  // 2. Trade show sessions (the older per-session photo arrays)
  for (const s of await pageAll(db, "tradeshow_sessions", "id,name,photos,created_at")) {
    for (const ph of (Array.isArray(s.photos) ? s.photos : [])) {
      if (!usableUrl(ph?.url)) continue;
      rows.push({
        source: "tradeshow_session", external_id: String(ph.id || `${s.id}:${ph.url}`),
        source_id: String(s.id), source_label: s.name || "Trade show session",
        url: ph.url, thumb_url: null,
        bucket: "tradeshow-photos", storage_path: null,
        caption: clean(ph.comment), variety: null, vendor: null, tags: [],
        taken_at: ph.capturedAt ? new Date(ph.capturedAt).toISOString() : (s.created_at || null),
        uploaded_by: clean(ph.uploadedBy),
      });
    }
  }

  // 3. Hot lists + shared galleries — already curated for customers
  for (const g of await pageAll(db, "shared_galleries", "id,kind,title,recipient,department,items,created_by,created_at")) {
    for (const it of (Array.isArray(g.items) ? g.items : [])) {
      const u = it?.url || it?.view;
      if (!usableUrl(u)) continue;
      rows.push({
        source: "gallery", external_id: String(it.id || `${g.id}:${u}`),
        source_id: String(g.id),
        source_label: g.title || (g.kind === "hotlist" ? "Hot list" : "Shared gallery"),
        url: u, thumb_url: clean(it.thumb),
        bucket: "tradeshow-photos", storage_path: null,
        caption: clean(it.caption), variety: null, vendor: null,
        tags: [g.kind ? `kind:${g.kind}` : null, g.department ? `dept:${g.department}` : null].filter(Boolean),
        taken_at: g.created_at || null, uploaded_by: clean(it.addedBy || g.created_by),
      });
    }
  }

  // 4. Treatment / response photos — variety-tagged crop imagery
  for (const t of await pageAll(db, "treatment_records", "id,crop,application,rec_date,photos")) {
    for (const ph of (Array.isArray(t.photos) ? t.photos : [])) {
      if (!usableUrl(ph?.url)) continue;
      rows.push({
        source: "treatment", external_id: String(ph.id || `${t.id}:${ph.url}`),
        source_id: String(t.id),
        source_label: t.crop ? `${t.crop}` : "Treatment",
        url: ph.url, thumb_url: null,
        bucket: "treatment-photos", storage_path: clean(ph.srcPath),
        caption: clean(t.application), variety: clean(ph.variety), vendor: null,
        tags: [ph.kind ? `kind:${ph.kind}` : null].filter(Boolean),
        taken_at: ph.capturedAt ? new Date(ph.capturedAt).toISOString() : (t.rec_date || null),
        uploaded_by: null,
      });
    }
  }

  // 5. Combo library
  for (const c of await pageAll(db, "combo_templates", "id,name,size,photos,updated_at")) {
    for (const [i, u] of (Array.isArray(c.photos) ? c.photos : []).entries()) {
      if (!usableUrl(u)) continue;
      rows.push({
        source: "combo", external_id: `${c.id}:${i}`,
        source_id: String(c.id), source_label: c.name || "Combo",
        url: u, thumb_url: null, bucket: "combo-photos", storage_path: null,
        caption: clean(c.size), variety: clean(c.name), vendor: null, tags: ["combo"],
        taken_at: c.updated_at || null, uploaded_by: null,
      });
    }
  }

  return rows;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Supabase env not configured" });

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  try {
    const rows = await buildRows(db);
    const bySource = rows.reduce((a, r) => { a[r.source] = (a[r.source] || 0) + 1; return a; }, {});
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map(r => ({ ...r, indexed_at: new Date().toISOString() }));
      const { error } = await db.from("photo_library")
        .upsert(chunk, { onConflict: "source,external_id", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      written += chunk.length;
    }
    return res.status(200).json({ ok: true, indexed: written, bySource });
  } catch (e) {
    return res.status(500).json({ error: "Index failed", message: e.message });
  }
};
