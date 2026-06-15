// api/recon-list.js — pending reconciliation proposals for the in-app approval inbox.
// Service-role read so the floor-code (anon) clients never touch the locked table or
// see approve_token. Returns only what the inbox needs to render + edit.
//   GET /api/recon-list            → pending (status='proposed')
//   GET /api/recon-list?status=all → include applied/declined (history)
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: "service creds not configured" });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const all = req.query && (req.query.status === "all");
  let q = sb.from("recon_proposals")
    .select("id, order_number, storage_path, status, extracted, changes, plan, risk, created_at, applied_at")
    .order("created_at", { ascending: false }).limit(100);
  if (!all) q = q.eq("status", "proposed");
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ proposals: data || [] });
};
