// Email-safe HTML kit — the ONLY way campaign HTML gets built.
// Rules: inline styles only, table layout, max-width 600 single column, system fonts,
// hosted image URLs only. No style blocks, no flexbox/grid, plain hex colors only.
// Pure JS (no JSX) so node test scripts can import it directly.

const PINE = "#16403A", FOREST = "#1a4731", TERRA = "#c2703e", PAPER = "#faf8f5", BORDER = "#e8e2da", INK = "#22302a", STONE = "#6b7570";
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
export const LOGO_URL = "https://ops.hoosierboy.com/favicon-512.png";

export const p = (text) =>
  `<p style="font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};margin:0 0 16px;">${text}</p>`;

export const heading = (text) =>
  `<h2 style="font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;color:${FOREST};margin:0 0 14px;font-weight:600;">${text}</h2>`;

export const button = (label, url) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr>` +
  `<td style="background:${TERRA};border-radius:8px;"><a href="${url}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a></td></tr></table>`;

export const image = (url, alt = "") =>
  `<img src="${url}" alt="${alt}" width="552" style="width:100%;max-width:552px;height:auto;border-radius:8px;display:block;margin:0 0 16px;" />`;

export const divider = () =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;padding:8px 0;">&nbsp;</td></tr></table>`;

export const card = (inner) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};border:1px solid ${BORDER};border-radius:8px;margin:0 0 16px;"><tr><td style="padding:16px 18px;">${inner}</td></tr></table>`;

// Branded shell: real hosted logo, pine header, footer. {UNSUB} is replaced at send time.
export function shell(bodyHtml) {
  return (
    `<div style="background:${PAPER};padding:24px 12px;margin:0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:10px;">` +
    `<tr><td style="background:${PINE};padding:16px 24px;border-radius:10px 10px 0 0;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding-right:10px;"><img src="${LOGO_URL}" alt="Hoosier Boy" width="34" height="34" style="border-radius:7px;display:block;" /></td>` +
    `<td style="font-family:${FONT};font-size:13px;letter-spacing:3px;font-weight:bold;color:#f2ede4;">HOOSIER BOY</td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:26px 24px;">${bodyHtml}</td></tr>` +
    `<tr><td style="padding:16px 24px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:12px;color:${STONE};line-height:1.6;">` +
    `Hoosier Boy Plants by Schlegel Greenhouse &middot; Indianapolis, Indiana<br/>{UNSUB}` +
    `</td></tr></table></div>`
  );
}

// ── Merge fields ────────────────────────────────────────────────────────────────
export const MERGE_FIELDS = ["first_name", "contact_name", "organization", "sender_name"];
export const SAMPLE_MERGE = { first_name: "Marsha", contact_name: "Marsha Schlegel", organization: "Marsha's Garden Center", sender_name: "Caleb" };

export function fillMerge(str, data) {
  return String(str || "").replace(/\{(\w+)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(data, k) && data[k] != null && data[k] !== "" ? String(data[k]) : m === "{first_name}" || m === "{contact_name}" ? "there" : "");
}
export function mergeFieldsIn(str) {
  const found = new Set();
  String(str || "").replace(/\{(\w+)\}/g, (m, k) => { if (MERGE_FIELDS.includes(k)) found.add(k); return m; });
  return [...found];
}

// Easy-builder → HTML: blank line = new paragraph.
export function easyBody({ headline, message, imageUrl }) {
  const paras = String(message || "").split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).map(t => p(t.replace(/\n/g, "<br/>"))).join("");
  return shell((headline ? heading(headline) : "") + (imageUrl ? image(imageUrl) : "") + paras);
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h\d|tr|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// ── CSV parser (Mailchimp export) ───────────────────────────────────────────────
export function parseCsv(text) {
  const rows = []; let f = [], cur = "", q = false;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { f.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; f.push(cur); if (f.some(x => x.trim())) rows.push(f); f = []; cur = ""; }
    else cur += c;
  }
  if (cur || f.length) { f.push(cur); if (f.some(x => x.trim())) rows.push(f); }
  return rows;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// → { contacts: [{email,name}], skippedInvalid, emailCol }
export function parseMailchimpCsv(text, cap = 20000) {
  const rows = parseCsv(text);
  if (!rows.length) return { contacts: [], skippedInvalid: 0, emailCol: null };
  const hdr = rows[0].map(h => h.trim().toLowerCase());
  let emailCol = hdr.findIndex(h => h === "email address" || h === "email");
  if (emailCol < 0) emailCol = hdr.findIndex(h => h.includes("email"));
  const firstCol = hdr.findIndex(h => h === "first name");
  const lastCol = hdr.findIndex(h => h === "last name");
  const nameCol = hdr.findIndex(h => h === "name" || h === "full name");
  const dataRows = emailCol >= 0 ? rows.slice(1) : rows; // headerless list of emails
  const col = emailCol >= 0 ? emailCol : 0;
  const seen = new Set(); const contacts = []; let skippedInvalid = 0;
  for (const r of dataRows.slice(0, cap)) {
    const email = (r[col] || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { skippedInvalid++; continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    let name = "";
    if (nameCol >= 0) name = (r[nameCol] || "").trim();
    else if (firstCol >= 0) name = [(r[firstCol] || "").trim(), lastCol >= 0 ? (r[lastCol] || "").trim() : ""].filter(Boolean).join(" ");
    contacts.push({ email, name: name || null });
  }
  return { contacts, skippedInvalid, emailCol: emailCol >= 0 ? hdr[emailCol] : "(first column)" };
}

// ── Template registry (pre-written, selectable in the composer) ─────────────────
export const TEMPLATES = [
  {
    id: "spring_availability",
    name: "Spring availability announcement",
    subject: "Spring availability is live — {first_name}, here's what's ready",
    body: shell(
      heading("Spring is rolling in") +
      p("Hi {first_name},") +
      p("Fresh availability just posted — the first rounds are coming off the benches and looking strong. As always, the best material goes first, so if something below catches your eye for {organization}, say the word and we'll hold it.") +
      p("Reply to this email or call your sales rep to build an order — we'll take care of the rest.") +
      p("— {sender_name}, Hoosier Boy Plants")
    ),
  },
  {
    id: "hot_list_intro",
    name: "Hot list — this week's picks",
    subject: "This week's hot list — picked for you",
    body: shell(
      heading("This week's picks") +
      p("Hi {first_name},") +
      p("Here's what's moving this week — the varieties our growers are proudest of right now and the ones other stores are reordering.") +
      p("Want any of it on your next truck? Reply here and we'll add it.") +
      p("— {sender_name}, Hoosier Boy Plants")
    ),
  },
  {
    id: "reservation_season",
    name: "Reserve your spring program",
    subject: "{organization}: lock in your spring program early",
    body: shell(
      heading("First pick goes to early birds") +
      p("Hi {first_name},") +
      p("We're opening spring reservations for our volume partners. A blanket reservation locks your quantities on proven movers before open availability — you draw material as the season rolls, and anything you don't take simply releases back, no penalty.") +
      p("Reply and we'll build your reservation together.") +
      p("— {sender_name}, Hoosier Boy Plants")
    ),
  },
];
