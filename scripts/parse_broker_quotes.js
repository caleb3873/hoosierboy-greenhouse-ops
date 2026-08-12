/* Parse Ball / EHR / Express broker quote spreadsheets into one normalized
 * price table with a comparable LANDED COST (plant + royalty + freight, no tag).
 * EHR net price = breeder volume-tier price * (1 - negotiated discount) + freight.
 * Usage: node scripts/parse_broker_quotes.js [--json out.json]
 */
const XLSX = require('../node_modules/xlsx');
const fs = require('fs');
const path = require('path');
// Persistent manual variety aliases (scripts/broker_aliases.json) — reapplied every run.
const ALIASES = (() => { try { const a = JSON.parse(fs.readFileSync(path.join(__dirname, 'broker_aliases.json'), 'utf8')); delete a._comment; const o = {}; for (const k in a) o[k.toLowerCase()] = a[k]; return o; } catch { return {}; } })();

// Quote folders live in the repo's quotes/ dir when present, falling back to the
// Desktop (8/5/2026: macOS revoked Desktop access for the app's process tree —
// drag "Ball Quotes"/"EHR Quotes"/"Express Quotes" into <repo>/quotes/ and
// everything works again, for both Caleb's shell and the assistant's).
const QUOTE_ROOT_LOCAL = path.join(__dirname, "..", "quotes");
const dirFor = name => {
  const local = path.join(QUOTE_ROOT_LOCAL, name);
  try { if (fs.existsSync(local)) return local; } catch { /* fall through */ }
  return path.join("/Users/caleb/Desktop", name);
};
const QUOTE_DIRS = {
  Ball:    dirFor("Ball Quotes"),
  EHR:     dirFor("EHR Quotes"),
  Express: dirFor("Express Quotes"),
};
// Fail FAST if any folder is unreadable — the loader wipes the season before
// reloading, so a silently-skipped broker would erase that broker's rows.
{
  const bad = [];
  for (const [broker, dir] of Object.entries(QUOTE_DIRS)) {
    try { fs.readdirSync(dir); } catch (e) { bad.push(`  ${broker}: ${dir} (${e.code})`); }
  }
  if (bad.length) {
    console.error(`✗ Can't read these quote folders:\n${bad.join("\n")}\n\nFix: drag the folder(s) into ${QUOTE_ROOT_LOCAL}/ — or restore the app's Desktop permission in System Settings → Privacy & Security → Files & Folders / Full Disk Access.\nNothing was parsed or loaded; the database is untouched.`);
    process.exit(1);
  }
}

// EHR negotiated terms per genetics supplier (volume tier Schlegel hits + discount)
const EHR_TERMS = {
  Beekenkamp:      { volume: 1, discount: 0.10 },
  Danziger:        { volume: 1, discount: 0.10 }, // single-price; discount applied
  Darwin:          { volume: 1, discount: 0.08 }, // single-price
  Dummen:          { volume: 3, discount: 0.10 },
  'Plant Source':  { volume: 2, discount: 0.08 },
  'Quality Cuttings': { volume: 1, discount: 0.10 }, // single-price
  Syngenta:        { volume: 2, discount: 0.10 },
};

const num = v => { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isFinite(n) ? n : null; };
const S = v => String(v == null ? '' : v).trim();

// ---------- variety match-key normalization ----------
// Shared with scripts/apply_sourcing_to_plan.js — single source of truth in scripts/broker_key.js
// so the plan keys items exactly the way broker_prices.variety_key was generated here.
const { SPECIES, GENUS_SYN, WORD_SYN, tidy, makeKey } = require(path.join(__dirname, 'broker_key'));
// classify a raw form string into a comparable form class (compare like-with-like)
function classForm(raw) {
  const f = String(raw || '').toLowerCase();
  if (/cell tray|mega tray|\bplug\b|\d+\s*cell|\bstrip\b/.test(f)) return 'plug';   // Raker "51 STRIP" = strip plug tray
  // Ball "Lin 72" and EHR-AED "72 C.P." (cell plug) are the same cell liner — same class so they match
  if (/\blin\b|liner|\blin\s|^lin|\d+\s*c\.?\s*p\.?\b|\bc\.?\s*p\.?\b/.test(f)) return 'liner';
  if (/ln\s*\d|s?ln\d|ln$/.test(f)) return 'liner';          // Ball size codes: CustLN 72, CstLN128TX, CtSLN72TX
  if (/pl\s*\d|pl\d+v?$/.test(f)) return 'plug';             // CustPL 128, CustPL162V
  if (/^pot\b|\dgal\b|gal$/.test(f)) return 'pot';           // Pot 1Gal (prefinished pot programs)
  if (/bareroot|\bbrt\b|\bbr\b|bare ?root|eye\b/.test(f)) return 'bareroot';
  if (/pref/.test(f)) return 'prefinished';
  if (/autostix|astix|basewell|as\d/.test(f)) return 'urc_autostix';
  if (/callus|\bcal\b|\bcc\b/.test(f)) return 'callused';
  if (/rooted cutting|\brc\b/.test(f)) return 'rooted';
  if (/urc|unrooted|\bur\b|leaf/.test(f)) return 'urc';
  if (!f.trim()) return 'urc';        // most cutting programs default to URC when unlabeled
  return 'other';
}
const genusOf = (crop, botanical, variety) => tidy((botanical || crop || variety || '').split(/\s+/)[0] || '');
const titleCase = s => String(s).toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());

// Ball truncation dictionary — shared with the WebTrack importer (scripts/ball_words.js)
const { BALL_WORD, BALL_ABBREV, expandWord } = require(path.join(__dirname, "ball_words"));

// ---------- breeder from filename ----------
function breederFromName(fn) {
  const f = fn.toLowerCase();
  // bfp = Ball FloraPlant — same channel as Ball's own list; unifying the supplier
  // lets the recency rule retire the older of the two (Caleb 7/29)
  if (/^bfp\b|ball ?flora/.test(f) || /^ball\./.test(f)) return 'Ball';
  if (/danziger/.test(f)) return 'Danziger';
  if (/dummen|dümmen|red fox|oglevee|barberet|fides|fid0|ogl0|dum0|bar1/.test(f)) return 'Dummen';
  if (/syngenta|fis0|fis1/.test(f)) return 'Syngenta';
  if (/darwin|gre22/.test(f)) return 'Darwin';
  if (/beekenkamp|bee0/.test(f)) return 'Beekenkamp';
  if (/green circle/.test(f)) return 'Green Circle';
  if (/raker|roberta/.test(f)) return 'Raker';
  if (/foremost/.test(f)) return 'Foremost';
  if (/dickman/.test(f)) return 'Dickman';
  if (/pell/.test(f)) return 'Pell';
  if (/pacific|pp&l|ppl\b/.test(f)) return 'Pacific Plug & Liner';
  if (/walters/.test(f)) return 'Walters';
  if (/creek hill/.test(f)) return 'Creek Hill';
  if (/emerald/.test(f)) return 'Emerald Coast';
  if (/hishtel|hishtil/.test(f)) return 'Hishtil';
  if (/garden solution/.test(f)) return 'Garden Solutions';
  if (/plant source|psi0/.test(f)) return 'Plant Source';
  if (/quality cutting|hma0/.test(f)) return 'Quality Cuttings';
  if (/kientzler|innovaplant|innova plant/.test(f)) return 'Innovaplant/Kientzler';
  if (/pell/.test(f)) return 'Pell';
  if (/green ?fuse/.test(f)) return 'Green Fuse';        // before Vivero — "Green Fuse ... URC - Vivero"
  if (/vivero/.test(f)) return 'Vivero';
  if (/plant investment/.test(f)) return 'Plant Investments';
  if (/\bbob/.test(f)) return 'Bobs';                   // "L F Schlegel... BOBS PL 2027" — pansy/viola plugs
  return fn.replace(/\.xls[xb]?$/i, '').slice(0, 16);
}

// ---------- farm / origin from filename ----------
// Suppliers grow at multiple farms; the country is in the quote filename and drives transit
// distance → cutting viability (Mexico/Central America fresher than East Africa).
function originFromName(fn) {
  const f = String(fn || '').toLowerCase();
  if (/el salvador|salvador/.test(f)) return 'El Salvador';
  if (/guatemala|guate/.test(f)) return 'Guatemala';
  if (/\bmexico\b/.test(f)) return 'Mexico';
  if (/costa rica/.test(f)) return 'Costa Rica';
  if (/\bcolombia\b/.test(f)) return 'Colombia';
  if (/ethiopia/.test(f)) return 'Ethiopia';
  if (/uganda/.test(f)) return 'Uganda';
  if (/\bkenya\b/.test(f)) return 'Kenya';
  if (/tanzania/.test(f)) return 'Tanzania';
  if (/portugal/.test(f)) return 'Portugal';
  if (/\bspain\b/.test(f)) return 'Spain';
  if (/israel/.test(f)) return 'Israel';
  if (/vivero/.test(f)) return 'Costa Rica';            // Green Fuse — Vivero, Costa Rica
  return null;
}

// ---------- header detection ----------
const VAR_TOK = /desc|variety|botanical|product name/i;
const PRICE_TOK = /price|each|unit|total|fee|volume\s*\d|level\s*\d|\d{2,}\s*-\s*\d{2,}|royalty/i;
// score each candidate row by header-token richness; pick the best (avoids title banners)
const HDR_TOKENS = [VAR_TOK, PRICE_TOK, /^crop$|crop code|crop \/ group|product group/i, /^form$|^size$|product form|^type$/i,
  /botanical|genus species/i, /royalty|license/i, /freight/i, /series|item #|material no|product id|^code$/i,
  /volume\s*\d|level\s*\d/i, /tags?/i, /exclusiv|licensor/i];
function findHeader(rows) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 24); i++) {
    const c = (rows[i] || []).map(S).filter(Boolean);
    if (c.length < 3) continue;
    if (!c.some(x => VAR_TOK.test(x)) || !c.some(x => PRICE_TOK.test(x))) continue;
    const score = HDR_TOKENS.reduce((n, re) => n + (c.some(x => re.test(x.toLowerCase())) ? 1 : 0), 0) + c.length * 0.1;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
const EXCLUDE_SHEET = /program sheet|add|drop|sub|intro|component|sample|statement|minimum|summary|tag minimum/i;

// detect tier price columns (Volume N / Level N / qty-range). returns array of {idx, level}
function tierCols(hdr) {
  const out = [];
  hdr.forEach((h, i) => {
    const t = S(h);
    let m = t.match(/volume\s*(\d)/i) || t.match(/level\s*(\d)/i);
    if (m) out.push({ idx: i, level: +m[1] });
    else if (/^\d{2,3}\s*-\s*\d+/.test(t.replace(/,/g, ''))) out.push({ idx: i, level: out.filter(x => x.qtyRange).length + 1, qtyRange: true });
    else if (/^\d{6,}\s*\+?$/.test(t.replace(/[,\s]/g, '')) && out.length) out.push({ idx: i, level: out.length + 1, qtyRange: true });
  });
  return out;
}

// Read any quote file into [{name, rows-of-cells}]. Handles real .xlsx/.xls via XLSX, and the
// EHR "AED Quote .xls" files which are actually MHTML (Excel Single File Web Page) — decode the
// quoted-printable MIME parts and pull each <table> out as a sheet.
function readMhtml(raw) {
  const deQP = s => s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  const bm = raw.match(/boundary="?(-{2,}=_NextPart_[^"\r\n]+)"?/i);
  const parts = bm ? raw.split('--' + bm[1]) : [raw];
  const sheets = [];
  for (const p of parts) {
    const i = p.indexOf('\r\n\r\n'); const html = deQP(i >= 0 ? p.slice(i + 4) : p);
    if (!/<table/i.test(html)) continue;
    const rows = []; const trRe = /<tr[\s\S]*?<\/tr>/gi; let m;
    while ((m = trRe.exec(html))) {
      const cells = [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c =>
        c[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim());
      if (cells.some(x => x)) rows.push(cells);
    }
    if (rows.length) sheets.push({ name: 'sheet' + sheets.length, rows });
  }
  return sheets;
}
function readSheets(file) {
  const buf = fs.readFileSync(file);
  if (/MIME-Version|=_NextPart_/.test(buf.toString('latin1', 0, 400))) return readMhtml(buf.toString('latin1'));
  const wb = XLSX.readFile(file);
  return wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false, defval: '' }) }));
}

function parseFile(broker, file) {
  const sourceFile = file.split('/').pop();
  const breeder = breederFromName(sourceFile);
  const sheets = readSheets(file);
  const out = [];
  const cands = broker === 'Ball' ? sheets.filter(s => s.name === 'Price List - Detail')
              : broker === 'Express' ? sheets.filter(s => s.name === 'IN')
              : sheets.filter(s => !EXCLUDE_SHEET.test(s.name));
  for (const { name: sn, rows } of cands) {
    const hr = findHeader(rows); if (hr < 0) continue;
    const hdr = rows[hr].map(S);
    const find = (...res) => { for (const re of res) for (let i = 0; i < hdr.length; i++) if (re.test(hdr[i].toLowerCase())) return i; return -1; };
    const cVar  = find(/variety name/, /^variety$/, /description/, /product name/);
    const cBot  = find(/botanical|genus species/);
    const cCrop = find(/^crop$/, /crop code/, /product group/, /crop \/ group/);
    const cForm = find(/^form$/, /^size$/, /product form/, /^type$/);
    const cBase = find(/each price/, /item price/, /no tag unit price includes frt/, /^price$/);
    const cRoy  = find(/royalty/, /license fee\s*$/);
    const cFrt  = find(/freight dtd usa/, /freight price/, /^freight$/);
    const cTotal= find(/^total price/, /no tag unit price includes frt/);
    const cAed  = find(/^v\d+ eod$/, /^v\d+$/);   // EHR AED quotes: V{n} EOD = early-order unit price at Schlegel's tier (Raker files come in at V7)
    const cExcl = find(/exclusiv/);
    const cMin  = find(/item min/, /min per var/, /^min qty$/); // Express "Item Min" per-variety minimum
    const tiers = tierCols(hdr);
    if (cVar < 0) continue;
    const term = broker === 'EHR' ? (EHR_TERMS[breeder] || { volume: 1, discount: 0 }) : null;

    for (let i = hr + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const variety = S(r[cVar]);
      if (!variety || /^(crop|variety|description|total|subtotal|grand|product)/i.test(variety)) continue;
      const botanical = cBot >= 0 ? S(r[cBot]) : '';
      const cropV = cCrop >= 0 && !/^\d+$/.test(S(r[cCrop])) ? S(r[cCrop]) : '';
      const roy = cRoy >= 0 ? num(r[cRoy]) : null;
      const frt = cFrt >= 0 ? num(r[cFrt]) : null;
      let landed = null, listPrice = null;

      if (cAed >= 0) {
        // EHR AED perennial quotes: landed = V1 EOD price + per-unit royalty (no freight column)
        const p = num(r[cAed]); if (p == null || p <= 0) continue;
        listPrice = p; landed = p + (roy || 0);
      } else if (tiers.length) {
        // tier-priced (mostly EHR). pick Schlegel's volume level.
        const want = term ? term.volume : 1;
        let pick = tiers.find(t => t.level === want) || tiers[0];
        let p = num(r[pick.idx]);
        if (p == null) { for (const t of tiers) { p = num(r[t.idx]); if (p != null) break; } }
        if (p == null) continue;
        listPrice = p;
        const disc = term ? term.discount : 0;
        landed = p * (1 - disc) + (frt || 0);
      } else {
        const base = cBase >= 0 ? num(r[cBase]) : null;
        if (cTotal >= 0 && num(r[cTotal]) != null) {           // Express total / Ball no-tag-incl-frt
          listPrice = num(r[cTotal]); landed = listPrice;
        } else if (base != null) {
          listPrice = base;
          landed = base + (broker === 'EHR' ? (frt || 0) : 0);  // EHR single-price + freight
        } else continue;
        if (broker === 'EHR' && term) landed = (listPrice + (broker === 'EHR' && cTotal < 0 ? 0 : 0)) * (1 - term.discount) + (cTotal < 0 ? 0 : 0) || landed;
      }
      // EHR single-price discount (non-tier path): apply discount to plant portion
      if (broker === 'EHR' && !tiers.length && cAed < 0 && term) {
        const plant = (cBase >= 0 ? num(r[cBase]) : listPrice) || 0;
        landed = plant * (1 - term.discount) + (frt || 0);
      }
      if (landed == null || landed <= 0) continue;

      const rawForm = cForm >= 0 ? S(r[cForm]) : '';
      const formClass = classForm(rawForm);
      let cleanVariety = variety.replace(/^\s*(HE|OR)\s+/, '').replace(/[#®™℠*]/g, '')
        .replace(/\s*-\s*(urc|cc|rc|tc)\b\.?/gi, '')   // drop Express form suffix "-CC"/"-URC" from the display
        .replace(/\s+/g, ' ').trim();
      // Persistent manual aliases for one-off naming differences a broker can't normalize away —
      // e.g. EHR appends color to named dahlias ("Karma Amanda Violet White Bicolor") while Express
      // has just "Karma Amanda". Maintained in scripts/broker_aliases.json; reapplied every run.
      if (broker === 'Ball') {
        // drop the CamelCase crop-abbrev lead token ("GerIS", "PetVeg") when it echoes
        // the crop column, then expand Ball truncations token-wise
        let btoks = cleanVariety.split(/\s+/);
        const t0 = btoks[0] || '';
        const t0l = t0.toLowerCase().replace(/[^a-z]/g, '');
        const cropLetters = (cropV || botanical || '').toLowerCase().replace(/[^a-z]/g, '');
        const camel = /^[A-Z][a-z]+[A-Z]/.test(t0);
        const cropEcho = camel || BALL_ABBREV.has(t0l)
          // ALL-CAPS truncations too ("JAMESBRIT" under crop JAMESBRITTENIA): a ≥5-char
          // strict prefix of the crop word is a crop echo, not a series name
          || (t0l.length >= 5 && cropLetters.startsWith(t0l) && t0l !== cropLetters);
        if (btoks.length > 1 && t0l.length >= 4 && cropLetters.startsWith(t0l.slice(0, 3)) && cropEcho) btoks = btoks.slice(1);
        cleanVariety = btoks.join(' ');
      }
      // truncation expansions apply to EVERY broker — EHR's AED files carry the same
      // shorthand ("Gldn Sphere") the Ball systems emit (Caleb 7/29, Solanna case)
      cleanVariety = cleanVariety.split(/\s+/)
        .map(w => /^(.{4,})ipd$/i.test(w) ? w.replace(/ipd$/i, '') : w)   // glued "Tangerineipd"
        .map(w => /^(.{3,})2per$/i.test(w) ? w.replace(/2per$/i, '') : w) // glued "Appleblossom2per"
        .map(expandWord).join(' ');
      // Express Raker lines carry a cell-size suffix ("Chenille-51c") — not part of the name
      cleanVariety = cleanVariety.replace(/\s*-\s*\d+c\b/gi, '').replace(/\s+/g, ' ').trim();
      cleanVariety = ALIASES[cleanVariety.toLowerCase()] || cleanVariety;
      // Dickman quotes freight as TBD — Caleb 7/29: carry 4¢/plant as the freight estimate
      if (breeder === 'Dickman' && landed != null) { landed = landed + 0.04; }
      const vkey = makeKey(cropV, botanical, cleanVariety);
      // Consistent display name "Genus Series Cultivar" — canonical genus prefixed, the variety's
      // own word order kept so the series leads (e.g. "Calibrachoa Lia Spark Pink"); drop a leading
      // genus the broker already included so it isn't doubled.
      const gtok = vkey.split(' ')[0] || '';
      const fw = tidy(cleanVariety).split(' ')[0] || '';
      const cult = (fw && (GENUS_SYN[fw] || fw) === gtok) ? cleanVariety.split(/\s+/).slice(1).join(' ') : cleanVariety;
      const display = titleCase((gtok + ' ' + cult).replace(/\s+/g, ' ').trim());
      const cellsM = String(rawForm || '').match(/(\d{2,3})/);
      const cells = cellsM && +cellsM[1] >= 18 && +cellsM[1] <= 512 ? +cellsM[1] : null;
      out.push({
        broker, supplier: breeder, breeder, sheet: sn, form: rawForm, formClass, cells,
        crop: cropV || botanical || variety.split(' ')[0],
        botanical, variety: display, rawVariety: cleanVariety,
        listPrice: +(+listPrice).toFixed(5),
        landed: +(+landed).toFixed(5),
        royalty: roy, freight: frt,
        exclusivity: cExcl >= 0 ? S(r[cExcl]) : '',
        itemMin: cMin >= 0 ? (parseInt(String(r[cMin]).replace(/[^\d]/g, ''), 10) || null) : null,
        key: vkey,
        // supplier -> form -> variety: the match grain for cross-broker comparison
        mkey: breeder + '|' + formClass + '|' + vkey,
        genus: genusOf(cropV, botanical, variety),
        origin: originFromName(sourceFile),
        sourceFile,
      });
    }
  }
  return out;
}

// ---------- run ----------
// Dedup re-downloaded copies: same quote (PQ number, else base name minus a " (1)" suffix) →
// keep only the NEWEST file by mtime, so an updated re-download supersedes the old one.
function dedupKey(fn) {
  const pq = fn.match(/PQ\d{4,}/i);
  if (pq) return pq[0].toUpperCase();
  return fn.replace(/\s*\(\d+\)(?=\.xls[xb]?$)/i, '').replace(/\.xls[xb]?$/i, '').toLowerCase().trim();
}
let all = [];
const counts = {}, dropped = [];
for (const [broker, dir] of Object.entries(QUOTE_DIRS)) {
  const files = fs.readdirSync(dir).filter(x => /\.xls[xb]?$/i.test(x) && !x.startsWith('~'))
    .map(fn => ({ fn, mtime: fs.statSync(dir + '/' + fn).mtimeMs }));
  const byKey = {};
  for (const f of files) { const k = dedupKey(f.fn); if (!byKey[k] || f.mtime > byKey[k].mtime) { if (byKey[k]) dropped.push(byKey[k].fn); byKey[k] = f; } else dropped.push(f.fn); }
  for (const { fn } of Object.values(byKey)) {
    try { const rows = parseFile(broker, dir + '/' + fn); counts[broker] = (counts[broker] || 0) + rows.length; all = all.concat(rows); }
    catch (e) { console.error('ERR', fn, e.message); }
  }
}
if (dropped.length) console.log('deduped (older/duplicate copies skipped):', dropped.length);

// HARD RULE (Caleb 2026-07-29): duplicative quotes WITHIN a broker resolve to the most
// recently uploaded file — newest file mtime wins per (broker, supplier|form|variety).
// The cascade is automatic: broker_prices keeps only the winners, and every surface
// (door search, family pins, reconciliation, sourcing compare) reads broker_prices.
const mtCache = {};
const mtimeOf = (broker, file) => {
  const k = broker + '|' + file;
  if (!(k in mtCache)) { try { mtCache[k] = fs.statSync(path.join(QUOTE_DIRS[broker], file)).mtimeMs; } catch { mtCache[k] = 0; } }
  return mtCache[k];
};
const newestFile = {};   // broker|mkey -> winning sourceFile
for (const r of all) {
  const dk = r.broker + '|' + r.mkey;
  if (!(dk in newestFile) || mtimeOf(r.broker, r.sourceFile) > mtimeOf(r.broker, newestFile[dk])) newestFile[dk] = r.sourceFile;
}
const preRecency = all.length;
all = all.filter(r => r.sourceFile === newestFile[r.broker + '|' + r.mkey]);
if (preRecency !== all.length) console.log(`recency rule: ${preRecency - all.length} rows superseded by newer uploads (${preRecency} -> ${all.length})`);

// FREIGHT BORROWING (Caleb 2026-07-29): freight rates are standard industry-wide — when
// one broker shows a supplier's per-plant freight and another quotes the SAME supplier
// without it, borrow the rate into landed. Only per-plant magnitudes (<$0.50) count as
// donors: Ball price lists carry per-100 freight already folded into landed, and rows
// that HAVE a freight value (even huge) are left alone. Dickman keeps its explicit 4¢.
{
  const frtBy = {};
  for (const r of all) if (r.freight != null && r.freight > 0 && r.freight < 0.5) (frtBy[r.breeder] = frtBy[r.breeder] || []).push(r.freight);
  const frtMed = {};
  for (const k in frtBy) { const v = frtBy[k].sort((a, b) => a - b); frtMed[k] = +v[Math.floor(v.length / 2)].toFixed(4); }
  let borrowed = 0; const hit = {};
  for (const r of all) {
    if (r.freight == null && r.breeder !== 'Dickman' && frtMed[r.breeder] != null && (r.broker === 'EHR' || r.broker === 'Ball')) {
      r.freight = frtMed[r.breeder];
      r.landed = +(r.landed + frtMed[r.breeder]).toFixed(5);
      hit[`${r.breeder} (${r.broker})`] = (hit[`${r.breeder} (${r.broker})`] || 0) + 1;
      borrowed++;
    }
  }
  if (borrowed) console.log(`freight borrowed onto ${borrowed} rows:`, Object.entries(hit).map(([k, n]) => `${k} ×${n} @$${frtMed[k.split(' (')[0]]}`).join(' · '));
}
console.log('parsed rows by broker:', counts, '| total', all.length);

// per-breeder broker coverage
console.log('\nrows by breeder x broker:');
const bb = {};
for (const r of all) { (bb[r.breeder] = bb[r.breeder] || {})[r.broker] = (bb[r.breeder]?.[r.broker] || 0) + 1; }
Object.entries(bb).sort().forEach(([br, m]) =>
  console.log('  ' + br.padEnd(16), ['Ball', 'EHR', 'Express'].map(b => b[0] + ':' + String(m[b] || 0).padEnd(5)).join(' ')));

// cross-broker matches within a breeder
const byK = {};
for (const r of all) { const k = r.breeder + '||' + r.key; (byK[k] = byK[k] || []).push(r); }
const multi = Object.entries(byK).filter(([k, v]) => new Set(v.map(x => x.broker)).size >= 2);
console.log('\nbreeder+variety matched across >=2 brokers:', multi.length);

if (process.argv.includes('--json')) {
  const outPath = process.argv[process.argv.indexOf('--json') + 1] || '/tmp/broker_prices.json';
  fs.writeFileSync(outPath, JSON.stringify(all));
  console.log('wrote', all.length, 'rows ->', outPath);
}

// show sample matches with savings
console.log('\n--- sample matched varieties (landed cost; * = cheapest) ---');
multi.slice(0, 26).forEach(([k, v]) => {
  const by = {};
  v.forEach(x => { if (by[x.broker] == null || x.landed < by[x.broker]) by[x.broker] = x.landed; });
  const lo = Math.min(...Object.values(by));
  const [br, key] = k.split('||');
  const cells = ['Ball', 'EHR', 'Express'].map(b => {
    if (by[b] == null) return (b[0] + ': -    ').padEnd(11);
    return ((by[b] === lo ? '*' : ' ') + b[0] + ':' + by[b].toFixed(4)).padEnd(11);
  });
  console.log('  ' + br.padEnd(11), key.padEnd(28), cells.join(' '));
});
