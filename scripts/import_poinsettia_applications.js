/* Layer the color-coded Heights applications onto variety_reference (per-week application per variety).
 * Feed it the JSON produced by scripts/extract_poinsettia_heights_colors.py:
 *   python3 scripts/extract_poinsettia_heights_colors.py > /tmp/heights.json   (needs numbers-parser + the .numbers file)
 *   node scripts/import_poinsettia_applications.js /tmp/heights.json [--apply]
 * Matches existing files by normalized variety name; updates `applications`, inserts any missing variety. */
const fs = require('fs'), path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));
const jsonPath = process.argv[2], apply = process.argv.includes('--apply');
if (!jsonPath) { console.error('usage: import_poinsettia_applications.js <heights.json> [--apply]'); process.exit(1); }
const env = {}; for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);
const norm = s => String(s || '').replace(/[”“]/g, '"').replace(/[’]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
const CANON = { '1500ppm ccc/altercel': '1500 CCC/Altercel', '1500ppm ccc and 1250ppm b9': '1500 CCC + 1250 B9', '2000ppm ccc/altercel': '2000 CCC/Altercel', '2000ppm ccc and 1250b9': '2000 CCC + 1250 B9', '0.1ppm piccolo drench': 'Piccolo drench 0.1ppm', 'fasination 2ppm': 'Fascination 2ppm' };
const canon = l => CANON[norm(l)] || l;
const sizeOf = v => { const m = norm(v).match(/(\d+(?:\.\d+)?)\s*"/); if (m) return m[1] + '"'; const b = norm(v).match(/(\d+)\s*bloom/); return b ? b[1] + ' bloom' : null; };
const DRENCH = { '5"': '4oz', '6.5"': '5oz', '7.5"': '8oz', '8.5"': '12oz', '10"': '25oz', '13"': '40oz' };
(async () => {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const { data: refs } = await sb.from('variety_reference').select('id,variety').eq('crop', 'Poinsettia');
  const byKey = {}; refs.forEach(r => byKey[norm(r.variety)] = r);
  let upd = 0, ins = 0;
  for (const [vname, x] of Object.entries(data.varieties)) {
    const apps = {}; for (const [wk, lbl] of Object.entries(x.applications)) apps[wk] = canon(lbl);
    const row = byKey[norm(vname)];
    if (row) { if (apply) { const { error } = await sb.from('variety_reference').update({ applications: apps }).eq('id', row.id); if (error) console.log('ERR', vname, error.message); } upd++; }
    else { const sz = sizeOf(vname); if (apply) { const { error } = await sb.from('variety_reference').insert({ crop: 'Poinsettia', year: 2025, variety: vname.replace(/[”“]/g, '"'), location: x.location, size: sz, heights: x.heights, applications: apps, drench_rate: DRENCH[sz] || null, photos: [] }); if (error) console.log('INS ERR', vname, error.message); } ins++; }
  }
  console.log(`${apply ? 'APPLIED' : 'DRY'} — updated ${upd}, inserted ${ins}. corrections: ${JSON.stringify(data.corrections)}`);
})();
