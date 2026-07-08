/* Import a "records" CSV (DATE,CROP,LOCATION,APPLICATION,RATES,NOTES) into treatment_records.
 *   node scripts/import_treatment_records.js "<csv path>" <Crop> <Year> [--apply]
 * e.g. node scripts/import_treatment_records.js "/Users/caleb/Desktop/cartoon/Mums '25 - records.csv" Mum 2025 --apply
 * Ditto marks (") in APPLICATION carry the previous row's application down. Dry-run unless --apply. */
const fs = require('fs');
const path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));

const [csvPath, crop, yearArg] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
const year = +yearArg;
if (!csvPath || !crop || !year) { console.error('usage: import_treatment_records.js "<csv>" <Crop> <Year> [--apply]'); process.exit(1); }

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

(async () => {
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8')).slice(1); // drop header
  const S = v => { const x = String(v == null ? '' : v).trim(); return x || null; };
  let lastApp = null;
  const recs = rows.map(r => {
    let app = S(r[3]);
    if (app === '"' || app === '""' || app === '“”') app = lastApp; else if (app) lastApp = app;
    return { crop, year, rec_date: isoDate(r[0]), crop_detail: S(r[1]), location: S(r[2]), application: app, rates: S(r[4]), notes: S(r[5]), source: 'import' };
  }).filter(r => r.rec_date || r.crop_detail || r.application);
  console.log(`parsed ${recs.length} ${crop} ${year} records`);
  recs.slice(0, 6).forEach(r => console.log(`  ${r.rec_date}  ${(r.application || '—').slice(0, 22).padEnd(24)} ${(r.crop_detail || '').slice(0, 40)}`));
  if (!apply) { console.log('\n(dry run — pass --apply to write)'); return; }
  await sb.from('treatment_records').delete().eq('crop', crop).eq('year', year).eq('source', 'import');
  const { error } = await sb.from('treatment_records').insert(recs);
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  console.log(`\nAPPLIED — ${recs.length} rows written.`);
})();
