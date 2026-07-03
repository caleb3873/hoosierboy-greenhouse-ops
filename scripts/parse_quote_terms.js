/* Extract per-quote ORDER/VARIETY MINIMUMS from the broker quote sheets into broker_quote_terms.
 * Minimums vary by supplier, farm (origin) and form (URC vs Callused), so the flat 2,000 assumption
 * in the Origins view was wrong. This grabs the raw minimum statement + parses the key numbers.
 *
 *   node scripts/parse_quote_terms.js           # dry run (prints what it found)
 *   node scripts/parse_quote_terms.js --apply   # replace broker_quote_terms for the season
 */
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'node_modules', 'xlsx'));
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const apply = process.argv.includes('--apply');
const SEASON = '2026-2027';

const FOLDERS = {
  Ball: '/Users/caleb/Desktop/Ball Quotes',
  EHR: '/Users/caleb/Desktop/EHR Quotes',
  Express: '/Users/caleb/Desktop/Express Quotes',
};
const S = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const num = s => { const m = String(s || '').replace(/,/g, '').match(/\d{2,6}/); return m ? +m[0] : null; };

function supplierFromName(fn) {
  const f = fn.toLowerCase();
  if (/danziger/.test(f)) return 'Danziger';
  if (/dummen|dümmen|red fox|oglevee|barberet|fides|fid0|ogl0|dum0|bar1|confetti/.test(f)) return 'Dummen';
  if (/syngenta|fis0|fis1/.test(f)) return 'Syngenta';
  if (/beekenkamp|bee0/.test(f)) return 'Beekenkamp';
  if (/kientzler/.test(f)) return 'Kientzler';
  if (/selecta/.test(f)) return 'Selecta';
  if (/darwin|gre22/.test(f)) return 'Darwin';
  if (/\bpell\b/.test(f)) return 'Pell';
  if (/\bbob/.test(f)) return 'Bobs';
  if (/green fuse|vivero/.test(f)) return 'GreenFuse';
  if (/quality cuttings|hma05/.test(f)) return 'QualityCuttings';
  if (/plant source|psi01/.test(f)) return 'PlantSource';
  if (/plant investments/.test(f)) return 'PlantInvestments';
  if (/creek hill|cre02/.test(f)) return 'CreekHill';
  if (/emerald coast|eme01/.test(f)) return 'EmeraldCoast';
  if (/garden solutions|gar06/.test(f)) return 'GardenSolutions';
  if (/hishtil|hishtell|hishtil|agr02/.test(f)) return 'Hishtil';
  if (/walters|wal01/.test(f)) return 'Walters';
  if (/green circle|green cirle|raker/.test(f)) return 'GreenCircle';
  return fn.replace(/\.xlsx?$/i, '').slice(0, 20);
}
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
  if (/vivero/.test(f)) return 'Costa Rica';
  return null;
}

// harvest all row-joined text from every sheet; also capture the value cell that follows a
// "MINIMUM"/"Order Minimum" label cell (Express/EHR/Ball all use a label→value layout).
function harvest(wb) {
  const lines = [];
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' });
    for (const r of rows) {
      const cells = r.map(S);
      const joined = cells.filter(Boolean).join(' | ');
      if (joined) lines.push(joined);
    }
  }
  return lines;
}

function parseTerms(lines, fn) {
  // pull the minimum-related lines into one statement, strip HTML tags (EHR AED files are MHTML)
  const minLines = lines.filter(l => /minimum|below min|per variety|per bag|per order|per case/i.test(l))
    .map(l => l.replace(/<[^>]+>/g, ' ').replace(/=3D|&amp;|\s+/g, m => (m === '&amp;' ? '&' : ' ')).trim())
    .filter(l => l.length > 3);
  const statement = [...new Set(minLines)].join('  •  ').slice(0, 900) || null;
  const clean = ' ' + (statement || '').toLowerCase().replace(/,/g, '').replace(/[|•]/g, ' ').replace(/\s+/g, ' ') + ' ';

  // an "order minimum" number in a text segment (>=500 so the 100-per-variety never counts as one)
  const orderMin = seg => {
    seg = seg.replace(/\d{3,6}\s*-\s*\d{3,6}/g, ' '); // drop below-min fee tiers e.g. "1500 - 2900"
    for (const rx of [
      /order minimum:?\s*(?:1 box\s*\/?\s*)?(\d{3,6})/,
      /hard minimum is\s*(\d{3,6})/,
      /(\d{3,6})\s*(?:urc|urcs|cuttings)?\s*minimum per order/,
      /(\d{3,6})\s*(?:urc|urcs|cuttings)\s*per order/,
      /(\d{3,6})\s*minimum/,
      /(\d{3,6})\s*cuttings/,
    ]) { const m = seg.match(rx); if (m && +m[1] >= 500) return +m[1]; }
    return null;
  };
  // per-variety minimum (usually 100) — parse first so we can exclude it from order-min scanning
  let pv = null;
  for (const rx of [/(\d{2,4})\s*(?:cuttings )?per variety/, /variety minimum:?\s*(\d{2,4})/]) { const m = clean.match(rx); if (m) { pv = +m[1]; break; } }

  // split URC-context from callused-context so each form's order min is read separately
  const ci = clean.indexOf('callused');
  let urc = orderMin(ci >= 0 ? clean.slice(0, ci) : clean);
  let cc = ci >= 0 ? orderMin(clean.slice(ci)) : null;
  // single-form Callused quote (filename says CC, not URC): the min belongs in the callused column
  if (/\bcc\b|callused/i.test(fn || '') && !/\burc\b/i.test(fn || '') && cc == null && urc != null) { cc = urc; urc = null; }

  const below = (minLines.find(l => /below min|handling fee|\$\d/i.test(l)) || '').slice(0, 300) || null;
  const unit = /tray/.test(clean) && !/cuttings/.test(clean) ? 'trays'
    : (urc == null && /\$\d|\busd\b/.test(clean)) ? 'usd'
    : (urc == null && /\bbox\b/.test(clean)) ? 'box' : 'cuttings';
  return { urc, cc, pv, below, statement, unit };
}

(async () => {
  const out = [];
  for (const [broker, dir] of Object.entries(FOLDERS)) {
    let files; try { files = fs.readdirSync(dir); } catch { console.log(`(skip ${dir} — not found)`); continue; }
    for (const fn of files.filter(f => /\.xlsx?$/i.test(f) && !f.startsWith('~'))) {
      // skip clearly old-season (2025-2026) quotes
      if (/2025[-_]2026|09-28-2025|10-1\d-2025|11-0\d-2025|10-20-2024/.test(fn)) continue;
      let wb; try { wb = XLSX.readFile(path.join(dir, fn)); } catch { continue; }
      const t = parseTerms(harvest(wb), fn);
      if (!t.statement) continue;
      out.push({
        season: SEASON, broker, supplier: supplierFromName(fn), origin: originFromName(fn),
        urc_order_min: t.urc, cc_order_min: t.cc, per_variety_min: t.pv,
        min_unit: t.unit, below_min_fee: t.below, min_statement: t.statement, source_file: fn,
      });
    }
  }
  // dedupe repeated quote files (e.g. "... (1).xlsx") by broker+supplier+origin, merging non-null
  const merged = {};
  for (const r of out) {
    const k = r.broker + '|' + r.supplier + '|' + (r.origin || '');
    if (!merged[k]) { merged[k] = r; continue; }
    const m = merged[k];
    for (const f of ['urc_order_min', 'cc_order_min', 'per_variety_min', 'below_min_fee']) if (m[f] == null && r[f] != null) m[f] = r[f];
    if ((r.min_statement || '').length > (m.min_statement || '').length) m.min_statement = r.min_statement;
  }
  const rows = Object.values(merged);

  console.log(`\nextracted terms from ${out.length} quotes → ${rows.length} supplier/farm rows:\n`);
  rows.sort((a, b) => (a.supplier || '').localeCompare(b.supplier || '')).forEach(r =>
    console.log(`  ${(r.broker + '/' + r.supplier).padEnd(24)} ${(r.origin || '—').padEnd(13)} URC:${String(r.urc_order_min ?? '?').padStart(5)} CC:${String(r.cc_order_min ?? '—').padStart(5)} /var:${String(r.per_variety_min ?? '—').padStart(4)} [${r.min_unit}]`));

  if (apply) {
    await sb.from('broker_quote_terms').delete().eq('season', SEASON);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('broker_quote_terms').insert(rows.slice(i, i + 200));
      if (error) { console.error('insert failed', error.message); process.exit(1); }
    }
    console.log(`\nAPPLIED — ${rows.length} rows written to broker_quote_terms.`);
  } else {
    console.log('\n(dry run — pass --apply to write)');
  }
})();
