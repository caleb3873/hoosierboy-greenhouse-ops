/* Load parsed broker quotes into the broker_prices table.
 * Run the parser first:  node scripts/parse_broker_quotes.js --json /tmp/broker_prices.json
 * Then:                   node scripts/load_broker_prices.js [/tmp/broker_prices.json]
 * Reads Supabase creds from .env.local. Replaces all rows for the season.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('../node_modules/@supabase/supabase-js');

// --- creds from .env.local ---
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.REACT_APP_SUPABASE_URL, key = env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('missing supabase creds'); process.exit(1); }
const sb = createClient(url, key);

const SEASON = '2026-2027';
const jsonPath = process.argv[2] || '/tmp/broker_prices.json';

(async () => {
  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log('loading', rows.length, 'rows from', jsonPath);

  // wipe existing season rows
  const { error: delErr } = await sb.from('broker_prices').delete().eq('season', SEASON);
  if (delErr) { console.error('delete failed:', delErr.message); process.exit(1); }

  const recs = rows.map(r => ({
    broker: r.broker, supplier: r.supplier, form_class: r.formClass, form_raw: r.form || null,
    crop: r.crop || null, variety: r.variety || null, variety_key: r.key || null, match_key: r.mkey || null,
    list_price: r.listPrice ?? null, landed: r.landed ?? null, royalty: r.royalty ?? null, freight: r.freight ?? null,
    exclusivity: r.exclusivity || null, season: SEASON, source_file: r.sourceFile || null, origin: r.origin || null, item_min: r.itemMin || null,
  }));

  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < recs.length; i += BATCH) {
    const chunk = recs.slice(i, i + BATCH);
    const { error } = await sb.from('broker_prices').insert(chunk);
    if (error) { console.error('insert failed at', i, ':', error.message); process.exit(1); }
    done += chunk.length;
    process.stdout.write(`\r  inserted ${done}/${recs.length}`);
  }
  console.log('\ndone.');

  const { count } = await sb.from('broker_prices').select('*', { count: 'exact', head: true }).eq('season', SEASON);
  console.log('broker_prices now holds', count, 'rows for', SEASON);
})();
