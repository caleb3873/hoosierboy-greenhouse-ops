/* Shared variety match-key normalization for broker quotes.
 *
 * SINGLE SOURCE OF TRUTH — required by both scripts/parse_broker_quotes.js (which writes
 * broker_prices.variety_key) and scripts/apply_sourcing_to_plan.js (which keys plan items the
 * same way to attach pricing). Previously this code was hand-copied into both files with a
 * "must stay byte-identical" warning; keeping it here removes the drift hazard.
 *
 * makeKey(crop, botanical, varietyName) → a normalized key so the same genetics named
 * differently by Ball / EHR / Express collapse to one token (e.g. Ball "Thyme cit Lemon" and
 * EHR "THYMUS CITRIODORUS LEMON" both → "thyme lemon").
 */

// Latin species epithets + the abbreviations Ball uses for them — dropped between genus & cultivar.
const SPECIES = /^(millefolium|reptans|spurium|didyma|dubium|hybrida|hybrid|aurantiaca|cordata|interspecific|x|sp|spp|species|officinalis|off|vulgaris|vul|angustifolia|angust|ang|dracunculus|drac|citriodorus|citriodora|citrata|citri|cit|intermedia|inter|piperita|pip|spicata|suaveolens|serpyllum|serp|praecox|amygdaloides|amy|lindheimeri|lind|nobilis|stoechas|st|douglasii|doug|montana|mastichina|pulegioides|herba|barona|elegans|arvensis|fruticosa|abrotanum|arborescens|canariensis|canary|pseudolanuginosus|pseudolanugin|hederacea|bonariensis|diffusa|odoratum|rebaudiana|chamaecyparissus|viridis|incisa|clinopodioides|europaea|ovata|nemorosa|nem)$/;
// Genus synonyms — canonicalize botanical & common to one token (Ball uses common, EHR often botanical)
const GENUS_SYN = { mentha: 'mint', thymus: 'thyme', salvia: 'sage', laurus: 'bay', ocimum: 'basil', rosmarinus: 'rosemary', satureja: 'savory', origanum: 'oregano', lippia: 'lemonverbena', aloysia: 'lemonverbena', helichrysum: 'curry', helichr: 'curry', chamaemelum: 'chamomile', coriandrum: 'coriander', majorana: 'marjoram', pelargonium: 'geranium', lavendula: 'lavandula', ipom: 'ipomoea',
  // Ball abbreviates the crop and then repeats it inside the variety name
  // ("Calibrachoa Calib Cabaret Blue Deep") — canonicalize so the repeat is dropped.
  calib: 'calibrachoa', pet: 'petunia', dian: 'dianthus', beg: 'begonia' };
// Series/word abbreviations & typos brokers use → expand so the abbreviated listing matches the
// full one. cas=Cascadias, com=Compact, bic=Bicolor, bestie=Besties (plural).
const WORD_SYN = { cas: 'cascadias', com: 'compact', bic: 'bicolor', bestie: 'besties', swt: 'sweet', hrt: 'heart' };
function tidy(s) {
  s = ' ' + String(s).toLowerCase() + ' ';
  // transliterate accents so "Café" == "Cafe" (one broker uses é, another writes "Cafe'")
  s = s.replace(/[áàâäãå]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i').replace(/[óòôöõ]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c');
  s = s.replace(/\bw\//g, ' ').replace(/\bwith\b/g, ' ');   // "Pink W/Eye" == "Pink With Eye" == "Pink Eye"
  s = s.replace(/[`'´‘’"*]/g, ' ').replace(/[™®℠]/g, ' ').replace(/#/g, ' ');
  s = s.replace(/\bpp\s?\d+(,\d+)*\b/g, ' ').replace(/\bppaf\b/g, ' ').replace(/\bcpbr\s?\d+\b/g, ' ')
       .replace(/\beu\s?\d*\b/g, ' ').replace(/\bp\.?p\.?a\.?f\.?\b/g, ' ');
  s = s.replace(/\b(usppp?|us\spp)\d+\b/g, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');                       // parenthetical codes
  s = s.replace(/\b20\d\d\b/g, ' ');                       // stray years
  s = s.replace(/\b\d{2,4}\s*c\b/g, ' ');                    // tray-cell suffixes: "Juncus Blue Arrows-128c"
  s = s.replace(/-?(urc|cc|rc|tc|liner|plug|pellet|callused|unrooted|rooted)\b/g, ' ');
  s = s.replace(/\bn\/?g\b/g, ' ').replace(/\bnew guinea\b/g, ' ');
  s = s.replace(/\bmain street\b/g, 'mainstreet');          // Dümmen Coleus series: EHR "Main Street" == Express "Mainstreet"
  s = s.replace(/\bimproved\b/g, ' ').replace(/\bimp\b/g, ' ');
  // catalog filler words, never part of the cultivar ("Caramia Series", "Other Cultivars Caradonna")
  s = s.replace(/\bother cultivars?\b/g, ' ').replace(/\bseries\b/g, ' ').replace(/\bcultivars?\b/g, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
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
  // and dedupe repeats — breeders restate the series inside the variety name
  // ("SALLYFUN" series + "SALLYFUN Blue Lagoon" variety must not double a token)
  w = [...new Set(w.map(x => WORD_SYN[x] || x).filter(x => x))].sort();
  return (genus + (w.length ? ' ' + w.join(' ') : '')).trim();
}

module.exports = { SPECIES, GENUS_SYN, WORD_SYN, tidy, makeKey };
