// api/preorder-share.js — link previews for pre-order sheets. Texting /?po=<id> shows a
// generic "Hoosier Boy Greenhouse Ops" card because the app is a SPA; iMessage, WhatsApp,
// Gmail etc. only read the static HTML. So share links go through /p/<sheet id> and
// /pp/<program id> (vercel.json rewrites → here): crawlers get Open Graph tags with the
// program title, the offer line and the hero photo; people are sent straight on to the app.
const SB = process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function get(path) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return r.ok ? r.json() : [];
}
module.exports = async (req, res) => {
  const kind = req.query.kind === "pop" ? "pop" : "po";
  const id = String(req.query.id || "").replace(/[^0-9a-f-]/gi, "");
  const target = `/?${kind}=${id}`;
  let program = null, sheet = null;
  try {
    if (id && SB && KEY) {
      if (kind === "po") {
        [sheet] = await get(`preorder_sheets?id=eq.${id}&select=id,program_id,customer_name,rep_name`);
        if (sheet) [program] = await get(`preorder_programs?id=eq.${sheet.program_id}&select=id,title,subtitle,hero_url,availability,deadline`);
      } else {
        [program] = await get(`preorder_programs?id=eq.${id}&select=id,title,subtitle,hero_url,availability,deadline`);
      }
    }
  } catch { /* fall through to the plain card */ }
  let items = [];
  try { if (program) items = await get(`preorder_program_items?program_id=eq.${program.id}&active=eq.true&select=wholesale_price,retail_price,size_label&order=sort`); } catch { /* ok */ }
  const it = items[0];
  const title = program ? `${program.title} · Hoosier Boy pre-order` : "Hoosier Boy pre-order";
  const bits = [];
  if (program?.subtitle) bits.push(program.subtitle);
  if (it?.wholesale_price) bits.push(`$${(+it.wholesale_price).toFixed(2)} wholesale${it.retail_price ? ` · $${(+it.retail_price).toFixed(2)} suggested retail` : ""}`);
  if (it?.size_label) bits.push(it.size_label);
  if (program?.availability) bits.push(program.availability);
  if (sheet?.customer_name) bits.unshift(`Prepared for ${sheet.customer_name}`);
  const desc = bits.join(" · ") || "Tell us what you would like before we commit the crop.";
  const image = program?.hero_url || "https://ops.hoosierboy.com/favicon-512.png";
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
</head><body style="font-family:system-ui;padding:24px;color:#1e2d1a">Opening your Hoosier Boy pre-order sheet… <a href="${esc(target)}">Continue</a></body></html>`);
};
