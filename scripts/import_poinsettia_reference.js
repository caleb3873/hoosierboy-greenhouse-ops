/* Build the per-variety Poinsettia 2025 reference: heights + drench rate + photos, keyed by variety.
 *   node scripts/import_poinsettia_reference.js [--apply]
 * Reads the cleaned CSVs + the location/variety photo folders under ~/Desktop/poinsettias 2025. */
const fs = require('fs'), path = require('path');
const { createClient } = require(path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js'));
const apply = process.argv.includes('--apply');
const CROP = 'Poinsettia', YEAR = 2025;
const ROOT = '/Users/caleb/Desktop/poinsettias 2025';
const CSV = path.join(ROOT, '2025 Poinsettias Growers Notes', '2025 Poinsettias Growers Notes');

const env = {};
for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const sb = createClient(env.REACT_APP_SUPABASE_URL, env.REACT_APP_SUPABASE_ANON_KEY);

function parseCSV(t) { const rows = []; let f = [], cur = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { f.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; f.push(cur); if (f.some(x => x.trim())) rows.push(f); f = []; cur = ''; } else cur += c; } if (cur || f.length) { f.push(cur); if (f.some(x => x.trim())) rows.push(f); } return rows; }
const norm = s => String(s || '').replace(/[”“]/g, '"').replace(/’/g, "'").trim();
const sizeOf = s => { const m = norm(s).match(/(\d+(?:\.\d+)?)\s*"/); if (m) return `${m[1]}"`; const b = norm(s).match(/(\d+)\s*bloom/i); if (b) return `${b[1]} bloom`; return null; };
// key = size + sorted color/variety words (ignores leading counts + word order)
const keyOf = s => { const t = norm(s).toLowerCase(); const size = sizeOf(t) || ''; const words = (t.replace(/[0-9.]+"?/g, ' ').match(/[a-z]+/g) || []).filter(w => w !== 'bloom'); return size + '|' + [...new Set(words)].sort().join(' '); };
const slug = s => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// ── drench guidelines: size -> rate ──
const drench = {};
parseCSV(fs.readFileSync(path.join(CSV, 'Drench Guidelines-Table 1.csv'), 'utf8')).forEach(r => { const s = sizeOf(r[0]); if (s && r[1] && r[1].trim()) drench[s] = r[1].trim(); });

// ── heights: per variety ──
const hrows = parseCSV(fs.readFileSync(path.join(CSV, 'Heights-Table 1.csv'), 'utf8'));
const header = hrows.find(r => r.some(c => /WK\d+/.test(c))) || [];
const wkCols = header.map((c, i) => { const m = /WK\s*(\d+)/.exec(c); return m ? { i, wk: `WK${m[1]}` } : null; }).filter(Boolean);
const noteCol = header.length; // trailing free note lands past the week cols
const heights = {}; let loc = null;
for (const r of hrows) {
  const c0 = norm(r[0]); if (!c0 || /WK\d+/.test(r.join(''))) continue;
  if (/(house|bluff|main|side|pad|range)/i.test(c0) && !sizeOf(c0)) { loc = c0.replace(/:$/, ''); continue; } // section = location
  const h = {}; wkCols.forEach(({ i, wk }) => { const v = parseFloat(r[i]); if (!isNaN(v)) h[wk] = v; });
  if (!Object.keys(h).length) continue;
  const endNote = r.slice(wkCols[wkCols.length - 1].i + 1).map(norm).filter(Boolean).join(' ');
  heights[keyOf(c0)] = { variety: c0, location: loc, heights: h, notes: [norm(r[1]), endNote].filter(Boolean).join(' — ') || null };
}

// ── photos: walk location/variety folders ──
const photoGroups = {}; // key -> { variety, location, files: [abs] }
for (const locDir of fs.readdirSync(ROOT)) {
  const lp = path.join(ROOT, locDir);
  if (!fs.statSync(lp).isDirectory() || /growers notes/i.test(locDir)) continue;
  for (const varDir of fs.readdirSync(lp)) {
    const vp = path.join(lp, varDir); if (!fs.statSync(vp).isDirectory()) continue;
    const files = fs.readdirSync(vp).filter(f => /\.(jpe?g|png)$/i.test(f)).map(f => path.join(vp, f));
    if (!files.length) continue;
    const k = keyOf(varDir);
    photoGroups[k] = photoGroups[k] || { variety: varDir, location: locDir, files: [] };
    photoGroups[k].files.push(...files);
  }
}

(async () => {
  const keys = [...new Set([...Object.keys(heights), ...Object.keys(photoGroups)])];
  console.log(`heights: ${Object.keys(heights).length} varieties · photo folders: ${Object.keys(photoGroups).length} · union: ${keys.length}`);
  const matched = keys.filter(k => heights[k] && photoGroups[k]).length;
  console.log(`matched (heights+photos): ${matched}`);
  if (!apply) {
    console.log('\n-- sample rows --');
    keys.slice(0, 12).forEach(k => { const h = heights[k], p = photoGroups[k]; console.log(`  ${(h?.variety || p?.variety || k).padEnd(34).slice(0, 34)} | wks:${h ? Object.keys(h.heights).length : 0} | photos:${p ? p.files.length : 0} | drench:${drench[sizeOf(h?.variety || p?.variety) || ''] || '-'}`); });
    console.log('\n(dry run — pass --apply to upload photos + write)');
    return;
  }
  await sb.from('variety_reference').delete().eq('crop', CROP).eq('year', YEAR);
  let n = 0, up = 0;
  const rows = [];
  for (const k of keys) {
    const h = heights[k], p = photoGroups[k];
    const variety = (h?.variety || p?.variety || '').trim();
    const size = sizeOf(variety);
    const urls = [];
    if (p) for (const f of p.files) {
      try { const buf = fs.readFileSync(f); const key2 = `poinsettia-ref/${slug(variety)}/${path.basename(f).replace(/[^a-zA-Z0-9._-]/g, '_')}`; const { error } = await sb.storage.from('treatment-photos').upload(key2, buf, { contentType: 'image/jpeg', upsert: true }); if (!error) { urls.push({ url: sb.storage.from('treatment-photos').getPublicUrl(key2).data.publicUrl }); up++; } } catch (e) { /* skip */ }
    }
    rows.push({ crop: CROP, year: YEAR, variety, location: h?.location || p?.location || null, size, heights: h?.heights || {}, notes: h?.notes || null, drench_rate: drench[size] || null, photos: urls, sort: n++ });
    process.stdout.write('.');
  }
  const { error } = await sb.from('variety_reference').insert(rows);
  if (error) { console.error('\ninsert failed:', error.message); process.exit(1); }
  console.log(`\nAPPLIED — ${rows.length} varieties, ${up} photos uploaded.`);
})();
