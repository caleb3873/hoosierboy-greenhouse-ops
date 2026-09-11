// api/picks-share.js — link previews for season "picks" pages (/k/<reviewer token> → /?picks=<token>).
// Same idea as preorder-share / review-share: crawlers get Open Graph tags, people go on to the app.
const SB = process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return r.ok ? r.json() : [];
}
module.exports = async (req, res) => {
  const token = String(req.query.id || "").replace(/[^0-9a-f-]/gi, "");
  const target = `/?picks=${token}`;
  let reviewer = null, season = null, image = "https://ops.hoosierboy.com/favicon-512.png";
  try {
    if (token && SB && KEY) {
      [reviewer] = await get(`pick_reviewers?token=eq.${token}&select=name,role,season_id`);
      if (reviewer) {
        [season] = await get(`pick_seasons?id=eq.${reviewer.season_id}&select=title,season`);
        const [sheet] = await get(`review_sheets?season_id=eq.${reviewer.season_id}&select=id&order=sort&limit=1`);
        if (sheet) { const [it] = await get(`review_items?sheet_id=eq.${sheet.id}&image_url=not.is.null&select=image_url&order=sort&limit=1`); if (it?.image_url) image = it.image_url; }
      }
    }
  } catch { /* plain card */ }
  const title = season ? `${season.title} · Hoosier Boy` : "Hoosier Boy picks";
  const desc = reviewer
    ? (reviewer.role === "decider" ? `For ${reviewer.name}: set how many of each you can sell, in flats of ten.` : `For ${reviewer.name}: thumbs up what your customers ask for, thumbs down what never moves.`)
    : "Pick the colours for the season.";
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
</head><body style="font-family:system-ui;padding:24px;color:#1e2d1a">Opening your picks… <a href="${esc(target)}">Continue</a></body></html>`);
};
