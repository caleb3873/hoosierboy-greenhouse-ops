// api/review-share.js — link previews for plan review sheets (/r/<sheet id> → /?rv=<id>).
// Same idea as preorder-share: crawlers (iMessage, WhatsApp, Gmail) read the static HTML,
// so they get Open Graph tags with the sheet title and hero photo; people go on to the app.
const SB = process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return r.ok ? r.json() : [];
}
module.exports = async (req, res) => {
  const id = String(req.query.id || "").replace(/[^0-9a-f-]/gi, "");
  const target = `/?rv=${id}`;
  let sheet = null, items = [];
  try {
    if (id && SB && KEY) {
      [sheet] = await get(`review_sheets?id=eq.${id}&select=id,title,subtitle,hero_url,reviewer_name,from_name,context`);
      if (sheet) items = await get(`review_items?sheet_id=eq.${id}&active=eq.true&select=image_url,proposed_qty&order=sort`);
    }
  } catch { /* plain card */ }
  const proposed = items.filter(i => (i.proposed_qty || 0) > 0).length;
  const title = sheet ? `${sheet.title} · plan review` : "Hoosier Boy plan review";
  const bits = [];
  if (sheet?.reviewer_name) bits.push(`For ${sheet.reviewer_name}${sheet.from_name ? ` from ${sheet.from_name}` : ""}`);
  if (sheet?.subtitle) bits.push(sheet.subtitle);
  if (proposed) bits.push(`${proposed} items proposed · tell us more, less or don't`);
  const desc = bits.join(" · ") || "Look over the proposal and tell us more, less or don't.";
  const image = sheet?.hero_url || items.find(i => i.image_url)?.image_url || "https://ops.hoosierboy.com/favicon-512.png";
  const url = `https://ops.hoosierboy.com${target}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hoosier Boy">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="font-family:system-ui;padding:24px;color:#1e2d1a">Opening the plan review… <a href="${esc(target)}">Continue</a></body></html>`);
};
