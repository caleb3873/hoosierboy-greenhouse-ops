/* Import the 2025 Poinsettia grower "Applications" log into treatment_records (crop='Poinsettia').
 * Layout: Date | Initials | Varieties/sizes | Location | Product | Rate | Method(drench/spray/leached/watered)
 *   node scripts/import_poinsettia_records.js "<Applications csv>" [--apply]
 * Dry-run unless --apply. Deletes+reinserts source='import' for Poinsettia 2025. */
const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));

const csvPath = process.argv[2];
const apply = process.argv.includes('--apply');
const CROP = 'Poinsettia', YEAR = 2025;
if (!csvPath) { console.error('usage: import_poinsettia_records.js "<csv>" [--apply]'); process.exit(1); }

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

function parseCSV(t) {
  const rows = []; let f = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { f.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; f.push(cur); if (f.some(x => x.trim())) rows.push(f); f = []; cur = ''; }
    else cur += c;
  }
  if (cur || f.length) { f.push(cur); if (f.some(x => x.trim())) rows.push(f); }
  return rows;
}
const isoDate = s => { const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let [, mo, d, y] = m; y = +y < 100 ? 2000 + +y : +y; return `${y}-${String(+mo).padStart(2, '0')}-${String(+d).padStart(2, '0')}`; };
const S = v => { const x = String(v == null ? '' : v).trim(); return x || null; };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

(async () => {
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8')).filter(r => /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test((r[0] || '').trim()));
  const recs = rows.map(r => {
    const product = S(r[4]); const method = S(r[6]); const initials = S(r[1]);
    const application = product ? (method ? `${product} (${method})` : product) : (method ? cap(method) : null);
    return { crop: CROP, year: YEAR, rec_date: isoDate(r[0]), crop_detail: S(r[2]), location: S(r[3]), application, rates: S(r[5]), notes: initials ? `by ${initials}` : null, source: 'import' };
  }).filter(r => r.rec_date && (r.application || r.crop_detail));
  console.log(`parsed ${recs.length} Poinsettia ${YEAR} records (${recs[0]?.rec_date} → ${recs[recs.length - 1]?.rec_date})`);
  recs.slice(0, 10).forEach(r => console.log(`  ${r.rec_date}  ${(r.application || '—').slice(0, 26).padEnd(28)} ${(r.rates || '').padEnd(8)} ${(r.crop_detail || '').slice(0, 34)}`));
  if (!apply) { console.log('\n(dry run — pass --apply to write)'); return; }
  await sb.from('treatment_records').delete().eq('crop', CROP).eq('year', YEAR).eq('source', 'import');
  const { error } = await sb.from('treatment_records').insert(recs);
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`\nAPPLIED — ${recs.length} Poinsettia rows written.`);
})();
