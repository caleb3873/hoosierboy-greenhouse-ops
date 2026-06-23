/* Parse Ball / EHR / Express broker quote spreadsheets into one normalized
 * price table with a comparable LANDED COST (plant + royalty + freight, no tag).
 * EHR net price = breeder volume-tier price * (1 - negotiated discount) + freight.
 * Usage: node scripts/parse_broker_quotes.js [--json out.json]
 */
const XLSX = require('../node_modules/xlsx');
const fs = require('fs');

const QUOTE_DIRS = {
  Ball:    "/Users/caleb/Desktop/Ball Quotes",
  EHR:     "/Users/caleb/Desktop/EHR Quotes",
  Express: "/Users/caleb/Desktop/Express Quotes",
};

// EHR negotiated terms per genetics supplier (volume tier Schlegel hits + discount)
const EHR_TERMS = {
  Beekenkamp:      { volume: 1, discount: 0.10 },
  Danziger:        { volume: 1, discount: 0.10 }, // single-price; discount applied
  Darwin:          { volume: 1, discount: 0.08 }, // single-price
  Dummen:          { volume: 3, discount: 0.10 },
  PlantSource:     { volume: 2, discount: 0.08 },
  QualityCuttings: { volume: 1, discount: 0.10 }, // single-price
  Syngenta:        { volume: 2, discount: 0.10 },
};

const num = v => { const n = parseFloat(String(v).replace(/[$,]/g, '')); return isFinite(n) ? n : null; };
const S = v => String(v == null ? '' : v).trim();

// ---------- variety match-key normalization ----------
// Latin species epithets + the abbreviations Ball uses for them — dropped between genus & cultivar
// so e.g. Ball "Thyme cit Lemon" and EHR "THYMUS CITRIODORUS LEMON" both reduce to "thyme lemon".
const SPECIES = /^(millefolium|reptans|spurium|didyma|dubium|hybrida|hybrid|aurantiaca|cordata|interspecific|x|sp|spp|species|officinalis|off|vulgaris|vul|angustifolia|angust|ang|dracunculus|drac|citriodorus|citriodora|citrata|citri|cit|intermedia|inter|piperita|pip|spicata|suaveolens|serpyllum|serp|praecox|amygdaloides|amy|lindheimeri|lind|nobilis|stoechas|st|douglasii|doug|montana|mastichina|pulegioides|herba|barona|elegans|arvensis|fruticosa|abrotanum|arborescens|canariensis|canary|pseudolanuginosus|pseudolanugin|hederacea|bonariensis|diffusa|odoratum|rebaudiana|chamaecyparissus|viridis|incisa|clinopodioides|europaea|ovata)$/;
// Genus synonyms — canonicalize botanical & common to one token (Ball uses common, EHR often botanical)
const GENUS_SYN = { mentha: 'mint', thymus: 'thyme', salvia: 'sage', laurus: 'bay', ocimum: 'basil', rosmarinus: 'rosemary', satureja: 'savory', origanum: 'oregano', lippia: 'lemonverbena', aloysia: 'lemonverbena', helichrysum: 'curry', helichr: 'curry', chamaemelum: 'chamomile', coriandrum: 'coriander', majorana: 'marjoram', pelargonium: 'geranium' };
// Series/word abbreviations brokers use (EHR "Cas." for Danziger's Cascadias petunia series) →
// expand so the abbreviated listing matches the full one (and collapses EHR's internal duplicate).
const WORD_SYN = { cas: 'cascadias' };
function tidy(s) {
  s = ' ' + String(s).toLowerCase() + ' ';
  s = s.replace(/[`'´‘’"*]/g, ' ').replace(/[™®℠]/g, ' ').replace(/#/g, ' ');
  s = s.replace(/\bpp\s?\d+\b/g, ' ').replace(/\bppaf\b/g, ' ').replace(/\bcpbr\s?\d+\b/g, ' ')
       .replace(/\beu\s?\d*\b/g, ' ').replace(/\bp\.?p\.?a\.?f\.?\b/g, ' ');
  s = s.replace(/\b(usppp?|us\spp)\d+\b/g, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');                       // parenthetical codes
  s = s.replace(/\b20\d\d\b/g, ' ');                       // stray years
  s = s.replace(/-?(urc|cc|rc|tc|liner|plug|pellet|callused|unrooted|rooted)\b/g, ' ');
  s = s.replace(/\bn\/?g\b/g, ' ').replace(/\bnew guinea\b/g, ' ');
  s = s.replace(/\bimproved\b/g, ' ').replace(/\bimp\b/g, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
// classify a raw form string into a comparable form class (compare like-with-like)
function classForm(raw) {
  const f = String(raw || '').toLowerCase();
  if (/cell tray|mega tray|\bplug\b|\d+\s*cell/.test(f)) return 'plug';
  // Ball "Lin 72" and EHR-AED "72 C.P." (cell plug) are the same cell liner — same class so they match
  if (/\blin\b|liner|\blin\s|^lin|\d+\s*c\.?\s*p\.?\b|\bc\.?\s*p\.?\b/.test(f)) return 'liner';
  if (/bareroot|\bbrt\b|\bbr\b|bare ?root|eye\b/.test(f)) return 'bareroot';
  if (/pref/.test(f)) return 'prefinished';
  if (/autostix|astix|basewell|as\d/.test(f)) return 'urc_autostix';
  if (/callus|\bcal\b|\bcc\b/.test(f)) return 'callused';
  if (/rooted cutting|\brc\b/.test(f)) return 'rooted';
  if (/urc|unrooted|\bur\b|leaf/.test(f)) return 'urc';
  if (!f.trim()) return 'urc';        // most cutting programs default to URC when unlabeled
  return 'other';
}
function makeKey(crop, botanical, varietyName) {
  // Ball prefixes herbs with a 2-letter line code ("HE Basil Coldasil", "OR Bay Laurel") — strip it
  varietyName = String(varietyName || '').replace(/^\s*(HE|OR)\s+/, '');
  // strip a leading generic category word from the crop so it isn't used as the genus
  // ("HERB BASIL" -> "BASIL", "HERB" -> "") — Ball tags Hishtil herbs this way
  const cropClean = String(crop || '').trim().replace(/^(herbs?|perennials?|annuals?|grass(es)?|vegetables?|veg|tropicals?|foliage|edibles?)\b\s*/i, '');
  const canon = g => GENUS_SYN[g] || g;
  let genus = canon(tidy((botanical || cropClean || '').split(/\s+/)[0] || ''));
  let w = tidy(varietyName).split(' ').filter(Boolean);
  if (!genus && w.length) genus = canon(w.shift());
  // drop a leading repeated/synonym genus and any species epithets, leaving genus + cultivar
  while (w.length && (canon(w[0]) === genus || w[0] === genus || SPECIES.test(w[0]))) w.shift();
  // expand series abbreviations, then sort cultivar words ("blue dark" == "dark blue")
  w = w.map(x => WORD_SYN[x] || x).filter(x => x).sort();
  return (genus + (w.length ? ' ' + w.join(' ') : '')).trim();
}
const genusOf = (crop, botanical, variety) => tidy((botanical || crop || variety || '').split(/\s+/)[0] || '');

// ---------- breeder from filename ----------
function breederFromName(fn) {
  const f = fn.toLowerCase();
  if (/danziger/.test(f)) return 'Danziger';
  if (/dummen|dümmen|red fox|oglevee|barberet|fides|fid0|ogl0|dum0|bar1/.test(f)) return 'Dummen';
  if (/syngenta|fis0|fis1/.test(f)) return 'Syngenta';
  if (/darwin|gre22/.test(f)) return 'Darwin';
  if (/beekenkamp|bee0/.test(f)) return 'Beekenkamp';
  if (/green circle/.test(f)) return 'GreenCircle';
  if (/raker|roberta/.test(f)) return 'Raker';
  if (/pell/.test(f)) return 'Pell';
  if (/walters/.test(f)) return 'Walters';
  if (/creek hill/.test(f)) return 'CreekHill';
  if (/emerald/.test(f)) return 'EmeraldCoast';
  if (/hishtel|hishtil/.test(f)) return 'Hishtil';
  if (/garden solution/.test(f)) return 'GardenSolutions';
  if (/plant source|psi0/.test(f)) return 'PlantSource';
  if (/quality cutting|hma0/.test(f)) return 'QualityCuttings';
  if (/kientzler/.test(f)) return 'Kientzler';
  if (/pell/.test(f)) return 'Pell';
  return fn.replace(/\.xlsx?$/i, '').slice(0, 16);
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
    const cAed  = find(/^v1 eod$/, /^v1$/);   // EHR AED quotes: V1 EOD = early-order unit price
    const cExcl = find(/exclusiv/);
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
      const vkey = makeKey(cropV, botanical, variety);
      const cleanVariety = variety.replace(/^\s*(HE|OR)\s+/, '').replace(/#/g, '').replace(/\s+/g, ' ').trim();
      out.push({
        broker, supplier: breeder, breeder, sheet: sn, form: rawForm, formClass,
        crop: cropV || botanical || variety.split(' ')[0],
        botanical, variety: cleanVariety,
        listPrice: +(+listPrice).toFixed(5),
        landed: +(+landed).toFixed(5),
        royalty: roy, freight: frt,
        exclusivity: cExcl >= 0 ? S(r[cExcl]) : '',
        key: vkey,
        // supplier -> form -> variety: the match grain for cross-broker comparison
        mkey: breeder + '|' + formClass + '|' + vkey,
        genus: genusOf(cropV, botanical, variety),
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
  return fn.replace(/\s*\(\d+\)(?=\.xlsx?$)/i, '').replace(/\.xlsx?$/i, '').toLowerCase().trim();
}
let all = [];
const counts = {}, dropped = [];
for (const [broker, dir] of Object.entries(QUOTE_DIRS)) {
  const files = fs.readdirSync(dir).filter(x => /\.xlsx?$/i.test(x) && !x.startsWith('~'))
    .map(fn => ({ fn, mtime: fs.statSync(dir + '/' + fn).mtimeMs }));
  const byKey = {};
  for (const f of files) { const k = dedupKey(f.fn); if (!byKey[k] || f.mtime > byKey[k].mtime) { if (byKey[k]) dropped.push(byKey[k].fn); byKey[k] = f; } else dropped.push(f.fn); }
  for (const { fn } of Object.values(byKey)) {
    try { const rows = parseFile(broker, dir + '/' + fn); counts[broker] = (counts[broker] || 0) + rows.length; all = all.concat(rows); }
    catch (e) { console.error('ERR', fn, e.message); }
  }
}
if (dropped.length) console.log('deduped (older/duplicate copies skipped):', dropped.length);
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
